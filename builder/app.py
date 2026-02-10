import errno
import json
import os
import secrets
import shutil
import subprocess
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException

app = FastAPI()

SRC_ROOT = Path(os.getenv("SRC_ROOT", "/src"))
PUBLIC_DIR = Path(os.getenv("PUBLIC_DIR", "/public"))
TMP_ROOT = Path(os.getenv("TMP_DIR", "/public_tmp"))
PREV_ROOT = Path(os.getenv("PREV_DIR", "/public_prev"))
PREV_DIR = PREV_ROOT / "_prev"
LOCK_FILE = Path(os.getenv("LOCK_FILE", str(TMP_ROOT / ".hugo_build.lock")))
KEEP_BUILDS = int(os.getenv("KEEP_BUILDS", "5"))

HUGO_BIN = os.getenv("HUGO_BIN", "hugo")
HUGO_ENV = os.getenv("HUGO_ENV", "production")
HUGO_ARGS = os.getenv("HUGO_ARGS", "").strip()


def _new_build_id() -> str:
    return f"{time.strftime('%Y%m%d-%H%M%S')}-{secrets.token_hex(3)}"


def _acquire_lock(timeout_sec: int = 600) -> None:
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    start = time.time()
    while True:
        try:
            fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w") as f:
                f.write(f"pid={os.getpid()}\nstarted={int(time.time())}\n")
            return
        except FileExistsError:
            if time.time() - start > timeout_sec:
                raise RuntimeError(f"Build lock held too long: {LOCK_FILE}")
            time.sleep(0.5)


def _release_lock() -> None:
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def _run(cmd: list[str], cwd: Path) -> str:
    p = subprocess.run(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env={**os.environ, "HUGO_ENV": HUGO_ENV},
    )
    if p.returncode != 0:
        raise RuntimeError(p.stdout)
    return p.stdout


def _rsync(src: Path, dst: Path) -> str:
    dst.mkdir(parents=True, exist_ok=True)
    return _run(["rsync", "-a", "--delete", f"{src}/", f"{dst}/"], cwd=src)


def _safe_rmtree(path: Path, logs: list[str], context: str) -> None:
    if not path.exists():
        return
    try:
        shutil.rmtree(path)
    except OSError as e:
        if e.errno == errno.EBUSY:
            logs.append(f"{context}: skipped busy path {path}: {e}")
            return
        logs.append(f"{context}: cleanup failed for {path}: {e}")
    except Exception as e:
        logs.append(f"{context}: cleanup failed for {path}: {e}")


def _write_manifest(work_dir: Path, started: float, finished: float, ok: bool, log: str) -> dict:
    manifest = {
        "ok": ok,
        "started": int(started),
        "finished": int(finished),
        "duration_sec": round(finished - started, 3),
    }
    (work_dir / "build.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (work_dir / "build.log").write_text(log, encoding="utf-8", errors="ignore")
    return manifest


def _cleanup_old_tmp_dirs(tmp_root: Path, keep_builds: int, keep_ids: set[str], logs: list[str]) -> None:
    build_dirs = sorted([p for p in tmp_root.glob("build-*") if p.is_dir()], key=lambda p: p.name, reverse=True)
    keep_names = {f"build-{x}" for x in keep_ids}
    keep_names.update({p.name for p in build_dirs[:max(keep_builds, 0)]})
    for d in build_dirs:
        if d.name in keep_names:
            continue
        _safe_rmtree(d, logs, "cleanup-old-build")

    for d in [p for p in tmp_root.glob("publish-*") if p.is_dir()]:
        if d.name in {f"publish-{x}" for x in keep_ids}:
            continue
        _safe_rmtree(d, logs, "cleanup-old-publish")


def _publish(stage_dir: Path, public_dir: Path, prev_dir: Path, logs: list[str]) -> str:
    PREV_ROOT.mkdir(parents=True, exist_ok=True)
    _safe_rmtree(prev_dir, logs, "prepare-prev")
    prev_dir.mkdir(parents=True, exist_ok=True)

    if public_dir.exists():
        logs.append("snapshot current public -> prev")
        logs.append(_rsync(public_dir, prev_dir))
    else:
        logs.append(f"public missing; skipping snapshot: {public_dir}")

    can_try_rename = public_dir.exists() and (not public_dir.is_mount()) and (not prev_dir.is_mount())
    if can_try_rename:
        logs.append("publish mode: rename-swap")
        try:
            os.replace(str(public_dir), str(prev_dir))
            os.replace(str(stage_dir), str(public_dir))
            return "rename-swap"
        except OSError as e:
            logs.append(f"rename-swap failed: {e}; falling back to rsync")
            # Attempt rollback if public vanished during failed rename sequence.
            if (not public_dir.exists()) and prev_dir.exists():
                try:
                    os.replace(str(prev_dir), str(public_dir))
                    logs.append("rollback restore: prev -> public")
                except Exception as rb_err:
                    logs.append(f"rollback restore failed: {rb_err}")

    logs.append("publish mode: rsync")
    public_dir.mkdir(parents=True, exist_ok=True)
    logs.append(_rsync(stage_dir, public_dir))
    return "rsync"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/build")
def build():
    started = time.time()
    _acquire_lock(timeout_sec=900)
    build_id = _new_build_id()
    work_dir = TMP_ROOT / f"build-{build_id}"
    stage_dir = TMP_ROOT / f"publish-{build_id}"
    logs: list[str] = []

    try:
        if not SRC_ROOT.exists():
            raise RuntimeError(f"SRC_ROOT not found: {SRC_ROOT}")

        TMP_ROOT.mkdir(parents=True, exist_ok=True)
        work_dir.mkdir(parents=True, exist_ok=False)
        logs.append(f"build_id={build_id}")
        logs.append(f"work_dir={work_dir}")
        logs.append(f"stage_dir={stage_dir}")
        logs.append(f"public_dir={PUBLIC_DIR}")
        logs.append(f"prev_dir={PREV_DIR}")
        logs.append(f"lock_file={LOCK_FILE}")

        cmd = [HUGO_BIN, "--noBuildLock", "--source", str(SRC_ROOT), "--destination", str(work_dir)]
        if HUGO_ARGS:
            cmd.extend(HUGO_ARGS.split())
        logs.append("running hugo build")
        hugo_output = _run(cmd, cwd=SRC_ROOT)
        logs.append(hugo_output.strip())

        finished = time.time()
        manifest = _write_manifest(work_dir, started, finished, True, "\n".join(logs))

        stage_dir.mkdir(parents=True, exist_ok=False)
        logs.append("staging publish dir via rsync")
        logs.append(_rsync(work_dir, stage_dir))

        publish_mode = _publish(stage_dir, PUBLIC_DIR, PREV_DIR, logs)

        _safe_rmtree(work_dir, logs, "cleanup-work")
        _safe_rmtree(stage_dir, logs, "cleanup-stage")
        _cleanup_old_tmp_dirs(TMP_ROOT, KEEP_BUILDS, {build_id}, logs)

        full_log = "\n".join([x for x in logs if x])
        return {
            "ok": True,
            "published": True,
            "public": str(PUBLIC_DIR),
            "build_id": build_id,
            "work_dir": str(work_dir),
            "stage_dir": str(stage_dir),
            "publish_mode": publish_mode,
            "duration_sec": round(time.time() - started, 3),
            "stdout_stderr": full_log,
            "log_tail": full_log[-4000:],
            "manifest": manifest,
        }

    except Exception as e:
        _safe_rmtree(stage_dir, logs, "error-cleanup-stage")
        _safe_rmtree(work_dir, logs, "error-cleanup-work")
        _cleanup_old_tmp_dirs(TMP_ROOT, KEEP_BUILDS, {build_id}, logs)

        logs.append(f"error: {e}")
        full_log = "\n".join([x for x in logs if x]).strip()
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "published": False,
                "error": str(e),
                "build_id": build_id,
                "work_dir": str(work_dir),
                "stage_dir": str(stage_dir),
                "log_tail": full_log[-4000:],
            },
        )
    finally:
        _release_lock()

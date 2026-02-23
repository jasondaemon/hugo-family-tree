from __future__ import annotations

import os
import json
import re
import time
import shutil
import uuid
import hashlib
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
import requests
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from api.models.global_event import GlobalEventRecord
from api.models.person import PersonRecord, MediaItem

app = FastAPI()

SRC_ROOT = Path(os.getenv("SRC_ROOT", "/src"))
CONTENT_ROOT = SRC_ROOT / "content" / "family"
GLOBAL_EVENTS_ROOT = SRC_ROOT / "content" / "global-events"
STATIC_DIR = Path(__file__).parent / "static"
STARTER_ROOT = Path(__file__).parent / "hugo" / "starter"
BUILD_ENDPOINT = os.getenv("BUILD_ENDPOINT", "http://hugo-builder:19000/build")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://example.com")
ALLOW_UNSAFE_THEME_URLS = os.getenv("ALLOW_UNSAFE_THEME_URLS", "false").lower() == "true"

PERSON_ID_RE = re.compile(r"^[a-f0-9\\-]{36}$")
PARTIAL_ISO_RE = re.compile(r"^\d{4}(-\d{2})?(-\d{2})?$")

DEFAULT_THEME_ID = "heritage-classic"
THEMES_MANIFEST_PATH = SRC_ROOT / ".hft" / "themes-installed.json"
THEME_PRESETS: dict[str, dict[str, str]] = {
    "heritage-classic": {
        "name": "Heritage Classic",
        "description": "Traditional serif layout for family history records.",
        "license": "Internal starter theme",
        "demo_url": "",
        "repo_url": "",
        "selectable": "true",
        "installable": "false",
        "theme_dir": "",
    },
    "ledger-modern": {
        "name": "Ledger Modern",
        "description": "Clean editorial look with modern typography and spacing.",
        "license": "Internal starter theme",
        "demo_url": "",
        "repo_url": "",
        "selectable": "true",
        "installable": "false",
        "theme_dir": "",
    },
    "ananke-reference": {
        "name": "Ananke",
        "description": "General-purpose Hugo theme reference.",
        "license": "MIT",
        "demo_url": "https://themes.gohugo.io/themes/gohugo-theme-ananke/",
        "repo_url": "https://github.com/theNewDynamic/gohugo-theme-ananke",
        "selectable": "false",
        "installable": "true",
        "theme_dir": "gohugo-theme-ananke",
    },
    "papermod-reference": {
        "name": "PaperMod",
        "description": "Blog/documentation style Hugo theme reference.",
        "license": "MIT",
        "demo_url": "https://adityatelange.github.io/hugo-PaperMod/",
        "repo_url": "https://github.com/adityatelange/hugo-PaperMod",
        "selectable": "false",
        "installable": "true",
        "theme_dir": "hugo-papermod",
    },
    "blowfish-reference": {
        "name": "Blowfish",
        "description": "Content-focused Hugo theme reference.",
        "license": "MIT",
        "demo_url": "https://blowfish.page/",
        "repo_url": "https://github.com/nunocoracao/blowfish",
        "selectable": "false",
        "installable": "true",
        "theme_dir": "blowfish",
    },
    "stack-reference": {
        "name": "Stack",
        "description": "Modern personal/site Hugo theme reference.",
        "license": "GPL-3.0-or-later",
        "demo_url": "https://demo.stack.jimmycai.com/",
        "repo_url": "https://github.com/CaiJimmy/hugo-theme-stack",
        "selectable": "false",
        "installable": "true",
        "theme_dir": "hugo-theme-stack",
    },
}

THEME_DIR_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _validation_errors(exc: ValidationError) -> list[dict[str, Any]]:
    # Use Pydantic JSON output to avoid non-serializable ctx values in errors().
    return json.loads(exc.json())


def _split_front_matter(text: str) -> tuple[dict[str, Any], str]:
    if text.startswith("---"):
        match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
        if match:
            fm_raw, body = match.group(1), match.group(2)
            data = yaml.safe_load(fm_raw) or {}
            return data, body
    return {}, text


def _dump_front_matter(data: dict[str, Any], body: str) -> str:
    fm = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    body = body or ""
    return f"---\n{fm}---\n\n{body.lstrip()}"


def _read_person(path: Path) -> tuple[dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    return _split_front_matter(text)


def _find_hugo_config(root: Path) -> Path | None:
    for name in ["config.toml", "config.yaml", "config.yml", "config.json"]:
        candidate = root / name
        if candidate.exists():
            return candidate
    return None


def _write_if_missing(path: Path, content: str, created: list[str]) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    created.append(str(path))


def _write_or_update(path: Path, content: str, changed: list[str]) -> None:
    existing = path.read_text(encoding="utf-8") if path.exists() else None
    if existing == content:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    changed.append(str(path))


def _starter_text(rel_path: str) -> str:
    path = STARTER_ROOT / rel_path
    if not path.exists():
        raise HTTPException(500, f"missing starter asset: {rel_path}")
    return path.read_text(encoding="utf-8")


def _theme_css(theme_id: str) -> str:
    return _starter_text(f"themes/{theme_id}/site.css")


def _managed_files(theme_id: str) -> dict[str, str]:
    return {
        "layouts/_default/baseof.html": _starter_text("layouts/_default/baseof.html"),
        "layouts/index.html": _starter_text("layouts/index.html"),
        "layouts/_default/single.html": _starter_text("layouts/_default/single.html"),
        "layouts/_default/list.html": _starter_text("layouts/_default/list.html"),
        "layouts/_default/taxonomy.html": _starter_text("layouts/_default/taxonomy.html"),
        "layouts/_default/terms.html": _starter_text("layouts/_default/terms.html"),
        "layouts/family/list.html": _starter_text("layouts/family/list.html"),
        "layouts/family/single.html": _starter_text("layouts/family/single.html"),
        "layouts/global-events/list.html": _starter_text("layouts/global-events/list.html"),
        "layouts/tree/list.html": _starter_text("layouts/tree/list.html"),
        "static/site.css": _theme_css(theme_id),
        "content/_index.md": _starter_text("content/_index.md"),
        "content/family/_index.md": _starter_text("content/family/_index.md"),
        "content/global-events/_index.md": _starter_text("content/global-events/_index.md"),
        "content/tree/_index.md": _starter_text("content/tree/_index.md"),
    }


def _theme_catalog() -> list[dict[str, str]]:
    return [
        {
            "id": k,
            "name": v["name"],
            "description": v["description"],
            "license": v["license"],
            "demo_url": v.get("demo_url", ""),
            "repo_url": v.get("repo_url", ""),
            "selectable": v.get("selectable", "false"),
            "installable": v.get("installable", "false"),
            "theme_dir": v.get("theme_dir", ""),
        }
        for k, v in THEME_PRESETS.items()
    ]


def _valid_theme_id(theme_id: str | None) -> str:
    if not theme_id:
        return DEFAULT_THEME_ID
    if theme_id not in THEME_PRESETS:
        raise HTTPException(400, f"Unknown theme_id: {theme_id}")
    if THEME_PRESETS[theme_id].get("selectable", "false") != "true":
        raise HTTPException(400, f"Theme is reference-only and cannot be applied: {theme_id}")
    return theme_id


def _valid_installable_theme_id(theme_id: str | None) -> str:
    if not theme_id:
        raise HTTPException(400, "theme_id is required")
    if theme_id not in THEME_PRESETS:
        raise HTTPException(400, f"Unknown theme_id: {theme_id}")
    if THEME_PRESETS[theme_id].get("installable", "false") != "true":
        raise HTTPException(400, f"Theme is not installable: {theme_id}")
    if not THEME_PRESETS[theme_id].get("repo_url"):
        raise HTTPException(400, f"Theme repo not configured: {theme_id}")
    if not THEME_PRESETS[theme_id].get("theme_dir"):
        raise HTTPException(400, f"Theme directory not configured: {theme_id}")
    return theme_id


def _sanitize_theme_dir(value: str) -> str:
    safe = (value or "").strip().lower()
    if not THEME_DIR_RE.match(safe):
        raise HTTPException(400, "theme_dir must match [a-z0-9_-], max 64 chars")
    return safe


def _manifest_read() -> list[dict[str, Any]]:
    if not THEMES_MANIFEST_PATH.exists():
        return []
    try:
        data = json.loads(THEMES_MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def _manifest_write(items: list[dict[str, Any]]) -> None:
    THEMES_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    THEMES_MANIFEST_PATH.write_text(json.dumps(items, indent=2) + "\n", encoding="utf-8")


def _detect_license(theme_root: Path) -> dict[str, Any]:
    license_file = ""
    text_lines: list[str] = []
    license_name = ""
    candidates = sorted([p for p in theme_root.iterdir() if p.is_file()])
    for p in candidates:
        if p.name.lower().startswith(("license", "copying")):
            license_file = p.name
            try:
                content = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                content = ""
            text_lines = [line.strip() for line in content.splitlines()[:20] if line.strip()]
            blob = content.lower()
            if "mit license" in blob:
                license_name = "MIT"
            elif "gnu general public license" in blob and "version 3" in blob:
                license_name = "GPL-3.0"
            elif "apache license" in blob and "version 2.0" in blob:
                license_name = "Apache-2.0"
            elif "mozilla public license" in blob:
                license_name = "MPL"
            elif "bsd" in blob:
                license_name = "BSD"
            break
    return {
        "license_file": license_file,
        "license_name": license_name,
        "license_text_first_lines": text_lines,
    }


def _record_theme_install(entry: dict[str, Any]) -> None:
    items = _manifest_read()
    key = entry.get("theme_id", "")
    filtered = [x for x in items if x.get("theme_id") != key]
    filtered.append(entry)
    filtered.sort(key=lambda x: str(x.get("installed_at", "")), reverse=True)
    _manifest_write(filtered[:100])


def _set_theme_marker(config_path: Path, theme_id: str) -> None:
    text = config_path.read_text(encoding="utf-8")
    if "[params]" not in text:
        text = text.rstrip() + f"\n\n[params]\n  startup_theme = \"{theme_id}\"\n"
    elif re.search(r"(?m)^\s*startup_theme\s*=", text):
        text = re.sub(r'(?m)^\s*startup_theme\s*=.*$', f'  startup_theme = "{theme_id}"', text)
    else:
        text = text.rstrip() + f"\n  startup_theme = \"{theme_id}\"\n"
    config_path.write_text(text, encoding="utf-8")


def _set_hugo_theme(config_path: Path, theme_dir: str) -> None:
    text = config_path.read_text(encoding="utf-8")
    if re.search(r"(?m)^\s*theme\s*=", text):
        text = re.sub(r'(?m)^\s*theme\s*=.*$', f'theme = "{theme_dir}"', text)
    else:
        text = text.rstrip() + f'\n\ntheme = "{theme_dir}"\n'
    config_path.write_text(text, encoding="utf-8")


def _read_theme_marker(config_path: Path | None) -> str:
    if not config_path or not config_path.exists():
        return DEFAULT_THEME_ID
    text = config_path.read_text(encoding="utf-8")
    m = re.search(r'(?m)^\s*startup_theme\s*=\s*"([^"]+)"', text)
    if m and m.group(1) in THEME_PRESETS:
        return m.group(1)
    return DEFAULT_THEME_ID


def _seed_hugo_site(root: Path, theme_id: str | None = None) -> dict[str, Any]:
    root.mkdir(parents=True, exist_ok=True)
    config_path = _find_hugo_config(root)
    selected_theme = _valid_theme_id(theme_id or _read_theme_marker(config_path))
    created = []

    if not config_path:
        config_path = root / "config.toml"
        _write_if_missing(
            config_path,
            "\n".join(
                [
                    f'baseURL = "{PUBLIC_BASE_URL}"',
                    'languageCode = "en-us"',
                    'title = "Family Tree"',
                    "",
                    "[taxonomies]",
                    '  surname = "surnames"',
                ]
            )
            + "\n",
            created,
        )
    _set_theme_marker(config_path, selected_theme)

    content_family = root / "content" / "family"
    if not content_family.exists():
        content_family.mkdir(parents=True, exist_ok=True)
        created.append(str(content_family))

    for rel_path, content in _managed_files(selected_theme).items():
        _write_if_missing(root / rel_path, content, created)

    return {
        "ok": True,
        "created": created,
        "config": str(config_path),
        "scaffolded": True,
        "theme_id": selected_theme,
    }


def _write_person(path: Path, data: dict[str, Any], body: str) -> None:
    path.write_text(_dump_front_matter(data, body), encoding="utf-8")


def _is_partial_iso(value: str) -> bool:
    if not value:
        return True
    return bool(PARTIAL_ISO_RE.match(value))


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def _last_name_token(value: str) -> str:
    parts = re.findall(r"[A-Za-z0-9'\-]+", str(value or ""))
    return parts[-1].lower() if parts else ""


def _person_filter_tags(data: dict[str, Any]) -> list[str]:
    names = data.get("names") or {}
    tags: list[str] = []

    for raw in [
        names.get("surname", ""),
        names.get("maiden", ""),
        *list(names.get("married", []) or []),
    ]:
        token = _last_name_token(str(raw or ""))
        if token:
            tags.append(token)

    for raw in list(data.get("tags", []) or []):
        token = _slugify(str(raw or "").replace("_", " "))
        if token:
            tags.append(token)

    return sorted(set(tags))


def _slug_hash(person_id: str) -> str:
    return hashlib.sha1(person_id.encode("utf-8")).hexdigest()[:8]


def _effective_slug(data: dict[str, Any], person_id: str) -> str:
    names = data.get("names", {}) or {}
    slug = data.get("slug") or _slugify(names.get("full", ""))
    if not slug:
        slug = "person"
    return f"{slug}-{_slug_hash(person_id)}" if slug == "person" else slug


def _list_people() -> list[dict[str, Any]]:
    people: list[dict[str, Any]] = []
    if not CONTENT_ROOT.exists():
        return people
    for md in CONTENT_ROOT.rglob("index.md"):
        data, _body = _read_person(md)
        person_id = str(data.get("person_id") or md.parent.name)
        title = str(data.get("title") or data.get("names", {}).get("full") or "Unknown")
        names = data.get("names", {}) or {}
        vitals = data.get("vitals", {}) or {}
        born = str(vitals.get("born") or "")
        died = str(vitals.get("died") or "")
        born_year = born[:4] if born else "????"
        died_year = died[:4] if died else "????"
        display_name = f"{names.get('full') or title} ({born_year}\u2013{died_year})"
        effective_slug = _effective_slug(data, person_id)
        people.append(
            {
                "person_id": person_id,
                "title": title,
                "display_name": display_name,
                "sex": data.get("sex", "U") or "U",
                "born": born,
                "died": died,
                "slug": effective_slug,
                "aliases": data.get("aliases", []) or [],
                "names": {
                    "full": names.get("full", ""),
                    "given": names.get("given", ""),
                    "surname": names.get("surname", ""),
                    "maiden": names.get("maiden", ""),
                    "married": names.get("married", []) or [],
                    "also_known_as": names.get("also_known_as", []) or [],
                },
                "tags": _person_filter_tags(data),
                "path": str(md.relative_to(SRC_ROOT)),
                "dir_name": md.parent.name,
            }
        )
    people.sort(key=lambda p: p["title"].lower())
    return people


def _find_person_path(person_id: str) -> Path | None:
    for p in _list_people():
        if p["person_id"] == person_id:
            return SRC_ROOT / p["path"]
    return None


def _find_person_path_by_slug(slug: str) -> Path | None:
    slug = (slug or "").strip()
    if not slug:
        return None
    for p in _list_people():
        if p.get("slug") == slug:
            return SRC_ROOT / p["path"]
        aliases = p.get("names", {}).get("also_known_as", []) or []
        if slug in aliases:
            return SRC_ROOT / p["path"]
        if slug in (p.get("aliases") or []):
            return SRC_ROOT / p["path"]
    return None


def _global_event_slug(value: str) -> str:
    slug = _slugify(value)
    if not slug:
        slug = f"event-{uuid.uuid4().hex[:10]}"
    return slug


def _global_event_index(slug: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9\-_]+", "-", slug).strip("-").lower()
    if not safe:
        raise HTTPException(400, "global event slug is invalid")
    return GLOBAL_EVENTS_ROOT / safe / "index.md"


def _list_global_events() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not GLOBAL_EVENTS_ROOT.exists():
        return items
    for md in GLOBAL_EVENTS_ROOT.rglob("index.md"):
        data, body = _read_person(md)
        data = dict(data or {})
        if "story_md" not in data and body:
            data["story_md"] = body
        if not data.get("slug"):
            data["slug"] = md.parent.name
        try:
            record = GlobalEventRecord.model_validate(data)
        except ValidationError:
            continue
        payload = record.model_dump()
        payload["path"] = str(md.relative_to(SRC_ROOT))
        items.append(payload)
    items.sort(key=lambda x: ((x.get("start_date") or ""), (x.get("title") or "").lower()))
    return items


def _find_global_event_path(slug: str) -> Path | None:
    slug = (slug or "").strip().lower()
    if not slug:
        return None
    path = _global_event_index(slug)
    return path if path.exists() else None


def _write_global_event(path: Path, data: dict[str, Any]) -> None:
    payload = dict(data)
    story = str(payload.pop("story_md", "") or "")
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_person(path, payload, story)


def _person_ids() -> set[str]:
    return {p["person_id"] for p in _list_people()}


def _new_person_id() -> str:
    return str(uuid.uuid4())


def _validate_relationships(record: PersonRecord, existing_ids: set[str]) -> list[str]:
    warnings: list[str] = []

    pid = record.person_id
    father = record.relations.parents.father
    mother = record.relations.parents.mother

    if father and father not in existing_ids:
        raise HTTPException(400, f"Unknown father person_id: {father}")
    if mother and mother not in existing_ids:
        raise HTTPException(400, f"Unknown mother person_id: {mother}")
    if father and father == pid:
        raise HTTPException(400, "Self-parenting is not allowed (father)")
    if mother and mother == pid:
        raise HTTPException(400, "Self-parenting is not allowed (mother)")

    spouses = [s.person for s in record.relations.spouses if s.person]
    if len(spouses) != len(set(spouses)):
        raise HTTPException(400, "Duplicate spouse entries are not allowed")
    for sp in spouses:
        if sp not in existing_ids:
            raise HTTPException(400, f"Unknown spouse person_id: {sp}")
        if sp == pid:
            raise HTTPException(400, "Self-spouse is not allowed")

    children = [c for c in record.relations.children if c]
    if len(children) != len(set(children)):
        raise HTTPException(400, "Duplicate child entries are not allowed")
    for child in children:
        if child not in existing_ids:
            raise HTTPException(400, f"Unknown child person_id: {child}")
        if child == pid:
            raise HTTPException(400, "Self-child relationship is not allowed")

    for sib in record.relations.siblings:
        if sib not in existing_ids:
            raise HTTPException(400, f"Unknown sibling person_id: {sib}")
        if sib == pid:
            warnings.append("Sibling list includes self; keeping for manual override")

    # Basic cycle check: parent has this person as parent
    for parent_id in [father, mother]:
        if not parent_id:
            continue
        parent_path = _find_person_path(parent_id)
        if not parent_path:
            continue
        parent_data, _ = _read_person(parent_path)
        parent_rel = (parent_data.get("relations") or {}).get("parents") or {}
        if parent_rel.get("father") == pid or parent_rel.get("mother") == pid:
            raise HTTPException(400, "Cyclical parent relationship detected")

    return warnings


def _ensure_bundle_dir(person_id: str, slug: str | None = None) -> Path:
    if not PERSON_ID_RE.match(person_id):
        raise HTTPException(400, "person_id is invalid")
    safe_slug = re.sub(r"[^a-zA-Z0-9\\-_]+", "-", (slug or "")).strip("-")
    folder_name = f"{person_id}-{safe_slug}" if safe_slug else person_id
    bundle_dir = CONTENT_ROOT / folder_name
    bundle_dir.mkdir(parents=True, exist_ok=True)
    return bundle_dir


def _remove_person_refs_in_people(removed_person_id: str) -> int:
    updated = 0
    if not CONTENT_ROOT.exists():
        return updated

    for md in CONTENT_ROOT.rglob("index.md"):
        data, body = _read_person(md)
        data = _normalize_payload(data)
        changed = False

        rel = data.get("relations") or {}
        parents = rel.get("parents") or {}
        if parents.get("father") == removed_person_id:
            parents["father"] = ""
            changed = True
        if parents.get("mother") == removed_person_id:
            parents["mother"] = ""
            changed = True

        spouses = rel.get("spouses") or []
        filtered_spouses = [sp for sp in spouses if str((sp or {}).get("person") or "") != removed_person_id]
        if len(filtered_spouses) != len(spouses):
            rel["spouses"] = filtered_spouses
            changed = True

        children = rel.get("children") or []
        filtered_children = [cid for cid in children if str(cid or "") != removed_person_id]
        if len(filtered_children) != len(children):
            rel["children"] = filtered_children
            changed = True

        siblings = rel.get("siblings") or []
        filtered_siblings = [sid for sid in siblings if str(sid or "") != removed_person_id]
        if len(filtered_siblings) != len(siblings):
            rel["siblings"] = filtered_siblings
            changed = True

        timeline = data.get("timeline") or []
        for event in timeline:
            if not isinstance(event, dict):
                continue
            related = event.get("related_people") or []
            filtered_related = [x for x in related if str(x or "") != removed_person_id]
            if len(filtered_related) != len(related):
                event["related_people"] = filtered_related
                changed = True

        if changed:
            _write_person(md, data, body)
            updated += 1

    return updated


def _remove_person_refs_in_global_events(removed_person_id: str) -> int:
    updated = 0
    if not GLOBAL_EVENTS_ROOT.exists():
        return updated

    for md in GLOBAL_EVENTS_ROOT.rglob("index.md"):
        data, body = _read_person(md)
        related = data.get("related_people") or []
        filtered_related = [x for x in related if str(x or "") != removed_person_id]
        if len(filtered_related) == len(related):
            continue
        data["related_people"] = filtered_related
        _write_person(md, data, body)
        updated += 1

    return updated




def _normalize_partial_date_for_sort(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "9999-99-99"
    if re.match(r"^\d{4}$", value):
        return f"{value}-99-99"
    if re.match(r"^\d{4}-\d{2}$", value):
        return f"{value}-99"
    return value


def _sort_timeline_entries(entries: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    rows = [dict(item) for item in (entries or []) if isinstance(item, dict)]
    rows.sort(
        key=lambda row: (
            _normalize_partial_date_for_sort(str(row.get("start_date") or "")),
            _normalize_partial_date_for_sort(str(row.get("end_date") or "")),
            int(row.get("sort_weight") or 0),
            str(row.get("title") or "").lower(),
        )
    )
    return rows

def _normalize_gallery_relative(path_value: str) -> str:
    value = str(path_value or "").strip()
    if not value:
        return ""
    if value.startswith("gallery/"):
        return value
    if value.startswith("/"):
        return value
    # Legacy records sometimes store featured/media filenames without gallery/ prefix.
    if "/" not in value and "\\" not in value:
        return f"gallery/{value}"
    return value


def _normalize_payload(payload: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    data = dict(payload)

    # Fill defaults for required schema fields
    if "title" not in data:
        data["title"] = existing.get("title", "") if existing else ""
    if not data.get("title") and data.get("names"):
        data["title"] = data.get("names", {}).get("full", "")
    if data.get("title") and data.get("names"):
        names = data.get("names", {})
        if not names.get("full"):
            names["full"] = data["title"]
            data["names"] = names
    if "date" not in data or not data.get("date"):
        if existing and existing.get("date"):
            data["date"] = existing.get("date")
        else:
            data["date"] = time.strftime("%Y-%m-%dT00:00:00Z", time.gmtime())
    if "draft" not in data:
        data["draft"] = bool(existing.get("draft", False)) if existing else False

    if "slug" not in data or not data.get("slug"):
        if existing and existing.get("slug"):
            data["slug"] = existing.get("slug")
        else:
            base = _slugify(data.get("names", {}).get("full", "")) if data.get("names") else ""
            data["slug"] = base or f"person-{uuid.uuid4().hex[:8]}"
    data.setdefault("aliases", [])
    data.setdefault("tags", [])
    data.setdefault("names", {})
    data.setdefault("vitals", {})
    data.setdefault("relations", {})
    data.setdefault("media", {})
    data.setdefault("ids", {})
    data.setdefault("sources", [])
    data.setdefault("confidence", {})
    data.setdefault("provenance", {})
    if "story_md" not in data:
        data["story_md"] = existing.get("story_md", "") if existing else ""
    if "timeline" not in data:
        data["timeline"] = existing.get("timeline", []) if existing else []

    media = data.get("media") or {}
    if isinstance(media, dict):
        media["featured"] = _normalize_gallery_relative(media.get("featured", ""))
        gallery = media.get("gallery") or []
        if isinstance(gallery, list):
            normalized_gallery: list[dict[str, Any]] = []
            for item in gallery:
                if isinstance(item, dict):
                    item = dict(item)
                    item["file"] = _normalize_gallery_relative(item.get("file", ""))
                    normalized_gallery.append(item)
            media["gallery"] = normalized_gallery
        data["media"] = media

    names = data.get("names") or {}
    if isinstance(names, dict):
        names.setdefault("married", [])
        names.setdefault("also_known_as", [])
        data["names"] = names

    data["tags"] = [str(t).strip() for t in (data.get("tags") or []) if str(t).strip()]
    data["timeline"] = _sort_timeline_entries(data.get("timeline"))
    return data


def _validate_media_paths(record: PersonRecord) -> None:
    if record.media.featured and not record.media.featured.startswith("gallery/"):
        raise HTTPException(400, "media.featured must be under gallery/")
    for item in record.media.gallery:
        if item.file and not item.file.startswith("gallery/"):
            raise HTTPException(400, "media.gallery items must be under gallery/")


def _apply_theme(root: Path, theme_id: str) -> dict[str, Any]:
    selected_theme = _valid_theme_id(theme_id)
    changed: list[str] = []
    config_path = _find_hugo_config(root)
    if not config_path:
        setup = _seed_hugo_site(root, selected_theme)
        return {
            "ok": True,
            "theme_id": selected_theme,
            "changed": setup.get("created", []),
            "seeded": True,
        }

    _set_theme_marker(config_path, selected_theme)
    for rel_path, content in _managed_files(selected_theme).items():
        _write_or_update(root / rel_path, content, changed)
    return {"ok": True, "theme_id": selected_theme, "changed": changed, "seeded": False}


def _all_managed_contents() -> dict[str, set[str]]:
    by_path: dict[str, set[str]] = {}
    for tid, meta in THEME_PRESETS.items():
        if meta.get("selectable", "false") != "true":
            continue
        for rel_path, content in _managed_files(tid).items():
            by_path.setdefault(rel_path, set()).add(content)
    return by_path


def _prune_managed_layout_overrides(root: Path) -> list[str]:
    removed: list[str] = []
    managed = _all_managed_contents()
    to_check = [
        "layouts/_default/baseof.html",
        "layouts/index.html",
        "layouts/_default/single.html",
        "layouts/_default/list.html",
        "layouts/_default/taxonomy.html",
        "layouts/_default/terms.html",
        "layouts/family/list.html",
        "layouts/family/single.html",
        "layouts/global-events/list.html",
        "layouts/tree/list.html",
        "static/site.css",
    ]
    for rel_path in to_check:
        path = root / rel_path
        if not path.exists():
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except Exception:
            continue
        if content in managed.get(rel_path, set()):
            path.unlink(missing_ok=True)
            removed.append(str(path))
    return removed


def _run_cmd(cmd: list[str], cwd: Path | None = None) -> str:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stdout.strip() or f"command failed: {' '.join(cmd)}")
    return proc.stdout


def _install_theme(
    root: Path,
    theme_id: str,
    ref: str | None = None,
    repo_url_override: str | None = None,
    theme_dir_override: str | None = None,
) -> dict[str, Any]:
    selected = _valid_installable_theme_id(theme_id)
    meta = THEME_PRESETS[selected]
    repo_url = str(meta["repo_url"])
    theme_dir = _sanitize_theme_dir(str(meta["theme_dir"]))
    if repo_url_override:
        if not ALLOW_UNSAFE_THEME_URLS:
            raise HTTPException(400, "Arbitrary theme URLs are disabled")
        repo_url = repo_url_override.strip()
        if not re.match(r"^(https://|git@)[A-Za-z0-9._:/\\-]+(\\.git)?$", repo_url):
            raise HTTPException(400, "Invalid repo_url format")
        if theme_dir_override:
            theme_dir = _sanitize_theme_dir(theme_dir_override)
        else:
            guessed = repo_url.rstrip("/").rsplit("/", 1)[-1]
            guessed = re.sub(r"\\.git$", "", guessed, flags=re.I)
            theme_dir = _sanitize_theme_dir(guessed)
    themes_root = root / "themes"
    target = themes_root / theme_dir
    logs: list[str] = []

    setup = _seed_hugo_site(root, _read_theme_marker(_find_hugo_config(root)))

    themes_root.mkdir(parents=True, exist_ok=True)
    if target.exists() and not (target / ".git").exists():
        raise HTTPException(400, f"Theme path exists but is not a git repo: {target}")

    try:
        if not target.exists():
            cmd = ["git", "clone", "--depth", "1", repo_url, str(target)]
            if ref:
                cmd = ["git", "clone", "--depth", "1", "--branch", ref, repo_url, str(target)]
            logs.append(_run_cmd(cmd))
        else:
            logs.append(_run_cmd(["git", "-C", str(target), "fetch", "--tags", "--prune", "origin"]))
            if ref:
                logs.append(_run_cmd(["git", "-C", str(target), "checkout", "-f", ref]))
            else:
                logs.append(_run_cmd(["git", "-C", str(target), "pull", "--ff-only", "origin"]))
    except Exception:
        if not (target / ".git").exists() and target.exists():
            shutil.rmtree(target, ignore_errors=True)
        raise

    commit = _run_cmd(["git", "-C", str(target), "rev-parse", "HEAD"]).strip()
    config_path = _find_hugo_config(root)
    if not config_path:
        raise HTTPException(500, "Hugo config missing after setup")
    _set_hugo_theme(config_path, theme_dir)
    _set_theme_marker(config_path, selected)
    removed = _prune_managed_layout_overrides(root)
    license_info = _detect_license(target)
    installed_at = datetime.now(timezone.utc).isoformat()
    _record_theme_install(
        {
            "theme_id": selected,
            "theme_name": meta["name"],
            "theme_dir": theme_dir,
            "repo_url": repo_url,
            "commit": commit,
            "installed_at": installed_at,
            "allowlisted": repo_url_override is None,
            **license_info,
        }
    )

    return {
        "ok": True,
        "theme_id": selected,
        "theme_name": meta["name"],
        "license": meta["license"],
        "detected_license": license_info.get("license_name", ""),
        "license_file": license_info.get("license_file", ""),
        "license_text_first_lines": license_info.get("license_text_first_lines", []),
        "theme_dir": theme_dir,
        "repo_url": repo_url,
        "ref": ref or "",
        "commit": commit,
        "installed_at": installed_at,
        "seeded_created": setup.get("created", []),
        "removed_overrides": removed,
        "stdout_stderr": "\n".join([x for x in logs if x]).strip(),
    }


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/api/schema/person")
def api_person_schema():
    return {"ok": True, "schema": PersonRecord.model_json_schema()}


@app.get("/api/schema/global-event")
def api_global_event_schema():
    return {"ok": True, "schema": GlobalEventRecord.model_json_schema()}

@app.get("/api/setup/status")
def api_setup_status():
    config = _find_hugo_config(SRC_ROOT)
    return {
        "ok": True,
        "configured": bool(config),
        "config": str(config) if config else "",
        "theme_id": _read_theme_marker(config),
    }

@app.get("/api/setup/themes")
def api_setup_themes():
    config = _find_hugo_config(SRC_ROOT)
    return {
        "ok": True,
        "themes": _theme_catalog(),
        "current_theme_id": _read_theme_marker(config),
    }

@app.post("/api/setup")
async def api_setup(request: Request):
    payload = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    theme_id = payload.get("theme_id") if isinstance(payload, dict) else None
    return _seed_hugo_site(SRC_ROOT, theme_id)


@app.post("/api/setup/theme")
async def api_setup_theme(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON body")
    theme_id = payload.get("theme_id")
    return _apply_theme(SRC_ROOT, theme_id)


@app.post("/api/setup/theme/install")
async def api_setup_theme_install(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON body")
    theme_id = payload.get("theme_id")
    ref = payload.get("ref")
    repo_url = payload.get("repo_url")
    theme_dir = payload.get("theme_dir")
    if ref is not None and not isinstance(ref, str):
        raise HTTPException(400, "ref must be a string")
    if isinstance(ref, str) and ref and not re.match(r"^[A-Za-z0-9._/\-]{1,128}$", ref):
        raise HTTPException(400, "ref contains invalid characters")
    if repo_url is not None and not isinstance(repo_url, str):
        raise HTTPException(400, "repo_url must be a string")
    if theme_dir is not None and not isinstance(theme_dir, str):
        raise HTTPException(400, "theme_dir must be a string")
    try:
        return _install_theme(SRC_ROOT, theme_id, ref, repo_url, theme_dir)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/themes/installed")
@app.get("/api/themes/installed")
def api_themes_installed():
    return {"ok": True, "themes": _manifest_read()}


@app.get("/api/global-events")
def api_global_events(query: str | None = None):
    events = _list_global_events()
    if query:
        q = query.lower()
        events = [
            e
            for e in events
            if q in (e.get("title", "").lower())
            or q in (e.get("event_type", "").lower())
            or q in (e.get("location", "").lower())
            or q in (e.get("story_md", "").lower())
            or any(q in str(t).lower() for t in (e.get("tags") or []))
        ]
    return {"ok": True, "events": events}


@app.get("/api/global-events/{slug}")
def api_global_event(slug: str):
    path = _find_global_event_path(slug)
    if not path or not path.exists():
        raise HTTPException(404, f"Global event not found: {slug}")
    data, body = _read_person(path)
    if "story_md" not in data and body:
        data["story_md"] = body
    data.setdefault("slug", path.parent.name)
    try:
        record = GlobalEventRecord.model_validate(data)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))
    payload = record.model_dump()
    payload["path"] = str(path.relative_to(SRC_ROOT))
    return {"ok": True, "event": payload}


@app.post("/api/global-events")
async def api_create_global_event(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON body")
    payload = dict(payload)
    slug = _global_event_slug(str(payload.get("slug") or payload.get("title") or ""))
    payload["slug"] = slug
    if not payload.get("end_date") and payload.get("start_date"):
        payload["end_date"] = payload.get("start_date")

    try:
        record = GlobalEventRecord.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    index_path = _global_event_index(record.slug)
    if index_path.exists():
        raise HTTPException(400, f"Global event already exists: {record.slug}")
    _write_global_event(index_path, record.model_dump())
    return {"ok": True, "slug": record.slug, "path": str(index_path.relative_to(SRC_ROOT))}


@app.put("/api/global-events/{slug}")
async def api_update_global_event(slug: str, request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON body")

    path = _find_global_event_path(slug)
    if not path or not path.exists():
        raise HTTPException(404, f"Global event not found: {slug}")

    existing, body = _read_person(path)
    payload = dict(payload)
    if "story_md" not in payload and body:
        payload["story_md"] = body
    if "slug" in payload and payload.get("slug") != slug:
        raise HTTPException(400, "slug is immutable once created")
    payload["slug"] = slug
    payload.setdefault("title", existing.get("title", ""))
    payload.setdefault("start_date", existing.get("start_date", ""))
    payload.setdefault("end_date", existing.get("end_date", ""))
    payload.setdefault("event_type", existing.get("event_type", "historical"))
    payload.setdefault("location", existing.get("location", ""))
    payload.setdefault("story_md", existing.get("story_md", ""))
    payload.setdefault("media", existing.get("media", []))
    payload.setdefault("sources", existing.get("sources", []))
    payload.setdefault("tags", existing.get("tags", []))
    payload.setdefault("featured", existing.get("featured", ""))
    payload.setdefault("draft", bool(existing.get("draft", False)))

    if not payload.get("end_date") and payload.get("start_date"):
        payload["end_date"] = payload.get("start_date")

    try:
        record = GlobalEventRecord.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    _write_global_event(path, record.model_dump())
    return {"ok": True, "slug": record.slug}


@app.get("/people/list")
@app.get("/api/people/list")
def api_people_list():
    people = _list_people()
    lightweight = [
        {
            "person_id": p["person_id"],
            "display_name": p["display_name"],
            "sex": p["sex"],
            "born": p["born"],
            "died": p["died"],
            "slug": p.get("slug", ""),
            "names": p.get("names", {}),
            "tags": p.get("tags", []),
        }
        for p in people
    ]
    return {"ok": True, "people": lightweight}


@app.get("/people/search")
@app.get("/api/people/search")
def api_people_search(q: str = ""):
    q = (q or "").strip().lower()
    people = _list_people()
    if not q:
        return {"ok": True, "people": people[:50]}

    def match(p: dict[str, Any]) -> bool:
        names = p.get("names", {})
        return (
            q in (names.get("full", "").lower())
            or q in (names.get("given", "").lower())
            or q in (names.get("surname", "").lower())
            or q in (names.get("maiden", "").lower())
            or any(q in m.lower() for m in (names.get("married", []) or []))
            or any(q in aka.lower() for aka in (names.get("also_known_as", []) or []))
            or any(q in t.lower() for t in (p.get("tags", []) or []))
        )

    results = [p for p in people if match(p)]
    return {"ok": True, "people": results[:50]}


@app.get("/api/people")
def api_people(query: str | None = None):
    people = _list_people()
    if query:
        q = query.lower()
        people = [
            p
            for p in people
            if q in (p["names"].get("full", "").lower())
            or q in (p["names"].get("given", "").lower())
            or q in (p["names"].get("surname", "").lower())
            or q in (p["names"].get("maiden", "").lower())
            or any(q in m.lower() for m in (p["names"].get("married", []) or []))
            or any(q in aka.lower() for aka in (p["names"].get("also_known_as", []) or []))
            or any(q in t.lower() for t in (p.get("tags", []) or []))
        ]
    return {"ok": True, "people": people}


@app.get("/api/people/{person_id}")
def api_person(person_id: str):
    path = _find_person_path(person_id)
    if not path or not path.exists():
        raise HTTPException(404, f"Person not found: {person_id}")
    data, body = _read_person(path)
    data = _normalize_payload(data)
    try:
        record = PersonRecord.model_validate(data)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    payload = record.model_dump(by_alias=True)
    payload["body"] = body or ""
    payload["path"] = str(path.relative_to(SRC_ROOT))
    return {"ok": True, "person": payload}


@app.get("/api/people/by-slug/{slug}")
def api_person_by_slug(slug: str):
    path = _find_person_path_by_slug(slug)
    if not path or not path.exists():
        raise HTTPException(404, f"Person not found for slug: {slug}")
    data, body = _read_person(path)
    data = _normalize_payload(data)
    try:
        record = PersonRecord.model_validate(data)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    payload = record.model_dump(by_alias=True)
    payload["body"] = body or ""
    payload["path"] = str(path.relative_to(SRC_ROOT))
    return {"ok": True, "person": payload}


@app.post("/people")
@app.post("/api/people")
async def api_create_person(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON body")

    payload.pop("person_id", None)
    payload = _normalize_payload(payload)
    payload["person_id"] = _new_person_id()

    try:
        record = PersonRecord.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    if not record.slug:
        record = record.model_copy(update={"slug": ""})
    _validate_media_paths(record)

    existing_ids = _person_ids()
    if record.person_id in existing_ids:
        raise HTTPException(400, "person_id already exists")

    warnings = _validate_relationships(record, existing_ids)

    bundle_dir = _ensure_bundle_dir(record.person_id, record.slug)
    index_path = bundle_dir / "index.md"

    body = str(payload.get("body") or "")
    _write_person(index_path, record.model_dump(by_alias=True), body)

    return {
        "ok": True,
        "person_id": record.person_id,
        "slug": record.slug,
        "path": str(index_path.relative_to(SRC_ROOT)),
        "warnings": warnings,
    }


@app.put("/people/{person_id}")
@app.put("/api/people/{person_id}")
async def api_update_person(person_id: str, request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON body")

    path = None
    if payload.get("path"):
        candidate = SRC_ROOT / str(payload["path"])
        if candidate.exists():
            path = candidate
    if not path:
        path = _find_person_path(person_id)
    if not path or not path.exists():
        raise HTTPException(404, f"Person not found: {person_id}")

    existing, existing_body = _read_person(path)
    payload = _normalize_payload(payload, existing)

    if "person_id" in payload and payload.get("person_id") != person_id:
        raise HTTPException(400, "person_id is immutable once created")
    payload["person_id"] = person_id

    try:
        record = PersonRecord.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    if not record.slug:
        record = record.model_copy(update={"slug": ""})
    _validate_media_paths(record)

    existing_ids = _person_ids()
    warnings = _validate_relationships(record, existing_ids)

    body = str(payload.get("body") if "body" in payload else existing_body)
    _write_person(path, record.model_dump(by_alias=True), body)

    return {"ok": True, "person_id": record.person_id, "slug": record.slug, "warnings": warnings}


@app.delete("/people/{person_id}")
@app.delete("/api/people/{person_id}")
def api_delete_person(person_id: str):
    path = _find_person_path(person_id)
    if not path or not path.exists():
        raise HTTPException(404, f"Person not found: {person_id}")

    bundle_dir = path.parent
    person_data, _body = _read_person(path)

    try:
        shutil.rmtree(bundle_dir)
    except Exception as exc:
        raise HTTPException(500, f"Failed to delete bundle: {exc}")

    people_updated = _remove_person_refs_in_people(person_id)
    global_events_updated = _remove_person_refs_in_global_events(person_id)

    return {
        "ok": True,
        "deleted": {
            "person_id": person_id,
            "slug": person_data.get("slug", ""),
            "bundle": str(bundle_dir.relative_to(SRC_ROOT)),
        },
        "cleaned_references": {
            "people_records": people_updated,
            "global_events": global_events_updated,
        },
    }


@app.post("/api/people/{person_id}/media")
async def api_upload_media(
    person_id: str,
    file: UploadFile = File(...),
    kind: str = Form("gallery"),
    media_type: str = Form("photo"),
    title: str = Form(""),
    caption: str = Form(""),
    date: str = Form(""),
    source_key: str = Form(""),
):
    if date and not _is_partial_iso(date):
        raise HTTPException(400, "Invalid date format for media")

    path = _find_person_path(person_id)
    if not path or not path.exists():
        raise HTTPException(404, f"Person not found: {person_id}")

    data, body = _read_person(path)
    data = _normalize_payload(data)
    try:
        record = PersonRecord.model_validate(data)
    except ValidationError as e:
        raise HTTPException(400, _validation_errors(e))

    bundle_dir = path.parent
    gallery_dir = bundle_dir / "gallery"
    gallery_dir.mkdir(parents=True, exist_ok=True)

    filename = Path(file.filename or "upload.bin").name
    safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "-", filename)
    target = gallery_dir / safe_name
    if target.exists():
        stem = target.stem
        suffix = target.suffix
        counter = 1
        while True:
            candidate = gallery_dir / f"{stem}-{counter}{suffix}"
            if not candidate.exists():
                target = candidate
                break
            counter += 1

    with target.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    rel_path = f"gallery/{target.name}"

    if kind == "featured":
        record.media.featured = rel_path
    else:
        record.media.gallery.append(
            MediaItem(
                file=rel_path,
                type=media_type or "photo",
                title=title,
                caption=caption,
                date=date,
                source_key=source_key,
            )
        )

    _validate_media_paths(record)
    validated = PersonRecord.model_validate(record.model_dump(by_alias=True))
    _write_person(path, validated.model_dump(by_alias=True), body)

    return {"ok": True, "path": rel_path}


@app.post("/api/build")
def api_build():
    try:
        # Always run setup preflight; it's idempotent and only creates missing files.
        setup_result = _seed_hugo_site(SRC_ROOT)

        r = requests.post(BUILD_ENDPOINT, timeout=900)
        payload = r.json()
        if setup_result and setup_result.get("created"):
            payload["setup"] = setup_result
        return JSONResponse(status_code=r.status_code, content=payload)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/")
@app.get("/people")
@app.get("/people/new")
@app.get("/people/{person_id}")
@app.get("/build")
def pages(person_id: str | None = None):
    return FileResponse(STATIC_DIR / "index.html")

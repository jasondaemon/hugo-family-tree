from __future__ import annotations

import argparse
import json
import re
import shutil
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

WP_POSTS_RE = re.compile(r"^INSERT INTO `wp_posts` VALUES\s*(.+);$", re.I)
WP_META_RE = re.compile(r"^INSERT INTO `wp_postmeta` VALUES\s*(.+);$", re.I)
WP_TERM_REL_RE = re.compile(r"^INSERT INTO `wp_term_relationships` VALUES\s*(.+);$", re.I)
WP_TERM_TAX_RE = re.compile(r"^INSERT INTO `wp_term_taxonomy` VALUES\s*(.+);$", re.I)
WP_TERMS_RE = re.compile(r"^INSERT INTO `wp_terms` VALUES\s*(.+);$", re.I)

CPT_PERSON = "lsvr_family_member"


def split_rows(values_blob: str) -> list[str]:
    rows: list[str] = []
    buf: list[str] = []
    depth = 0
    in_str = False
    esc = False
    for ch in values_blob:
        buf.append(ch)
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == "'":
                in_str = False
        else:
            if ch == "'":
                in_str = True
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    row = "".join(buf).strip().rstrip(",").lstrip(",").strip()
                    if row:
                        rows.append(row)
                    buf = []
    return rows


def parse_row(row: str) -> list[str | None]:
    row = row.strip().lstrip(",").strip()
    if not (row.startswith("(") and row.endswith(")")):
        raise ValueError(f"bad row: {row[:120]}")
    s = row[1:-1]
    vals: list[str] = []
    buf: list[str] = []
    in_str = False
    esc = False
    for ch in s:
        if in_str:
            buf.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == "'":
                in_str = False
        else:
            if ch == "'":
                in_str = True
                buf.append(ch)
            elif ch == ",":
                vals.append("".join(buf).strip())
                buf = []
            else:
                buf.append(ch)
    vals.append("".join(buf).strip())

    def unescape(v: str) -> str | None:
        v = v.strip()
        if v == "NULL":
            return None
        if len(v) >= 2 and v[0] == "'" and v[-1] == "'":
            v = v[1:-1]
            v = v.replace("\\'", "'").replace("\\\\", "\\")
            v = v.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
        return v

    return [unescape(v) for v in vals]


def to_int(v: str | None) -> int | None:
    if v is None:
        return None
    try:
        return int(str(v).strip())
    except Exception:
        return None


def slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_maybe_date(v: str | None) -> str:
    s = (v or "").strip()
    if not s:
        return ""
    s = s.replace("/", "-").replace(".", "-")
    s = re.sub(r"[^0-9-]", "", s)
    if re.match(r"^\d{4}$", s):
        return s
    if re.match(r"^\d{4}-\d{2}$", s):
        return s
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    # salvage 1952-0417 -> 1952-04-17
    if re.match(r"^\d{4}-\d{4}$", s):
        return f"{s[:4]}-{s[5:7]}-{s[7:9]}"
    if re.match(r"^\d{8}$", s):
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return s


def parse_serialized_id_list(value: str | None) -> list[int]:
    raw = value or ""
    return [int(x) for x in re.findall(r"i:(\d+);", raw)]


def write_front_matter(path: Path, fm: dict[str, Any], body: str) -> None:
    y = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"---\n{y}---\n\n{body.lstrip()}" if body else f"---\n{y}---\n", encoding="utf-8")


def copy_if_exists(src: Path, dst: Path) -> bool:
    if not src.exists() or not src.is_file():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        shutil.copy2(src, dst)
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description="Import WordPress SQL dump into Hugo Family Tree schema")
    ap.add_argument("--dump", required=True)
    ap.add_argument("--uploads", required=True)
    ap.add_argument("--src-root", required=True)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--clean", action="store_true")
    args = ap.parse_args()

    dump_path = Path(args.dump)
    uploads_root = Path(args.uploads)
    src_root = Path(args.src_root)

    content_root = src_root / "content"
    family_root = content_root / "family"
    posts_root = content_root / "posts"

    posts_by_id: dict[int, dict[str, Any]] = {}
    postmeta: dict[int, dict[str, list[str | None]]] = defaultdict(lambda: defaultdict(list))
    term_relationships: dict[int, list[int]] = defaultdict(list)
    term_tax: dict[int, dict[str, Any]] = {}
    terms: dict[int, dict[str, Any]] = {}

    with dump_path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            m = WP_POSTS_RE.match(line)
            if m:
                for row in split_rows(m.group(1)):
                    vals = parse_row(row)
                    if len(vals) < 21:
                        continue
                    pid = to_int(vals[0])
                    if pid is None:
                        continue
                    posts_by_id[pid] = {
                        "id": pid,
                        "date": vals[2] or "",
                        "content": vals[4] or "",
                        "title": vals[5] or "",
                        "excerpt": vals[6] or "",
                        "status": vals[7] or "",
                        "slug": vals[11] or "",
                        "type": vals[20] or "",
                        "parent": to_int(vals[17]) or 0,
                    }
                continue

            m = WP_META_RE.match(line)
            if m:
                for row in split_rows(m.group(1)):
                    vals = parse_row(row)
                    if len(vals) < 4:
                        continue
                    post_id = to_int(vals[1])
                    if post_id is None:
                        continue
                    postmeta[post_id][vals[2] or ""].append(vals[3])
                continue

            m = WP_TERM_REL_RE.match(line)
            if m:
                for row in split_rows(m.group(1)):
                    vals = parse_row(row)
                    if len(vals) < 2:
                        continue
                    obj = to_int(vals[0])
                    tid = to_int(vals[1])
                    if obj is not None and tid is not None:
                        term_relationships[obj].append(tid)
                continue

            m = WP_TERM_TAX_RE.match(line)
            if m:
                for row in split_rows(m.group(1)):
                    vals = parse_row(row)
                    if len(vals) < 3:
                        continue
                    tax_id = to_int(vals[0])
                    term_id = to_int(vals[1])
                    if tax_id is not None and term_id is not None:
                        term_tax[tax_id] = {"term_id": term_id, "taxonomy": vals[2] or ""}
                continue

            m = WP_TERMS_RE.match(line)
            if m:
                for row in split_rows(m.group(1)):
                    vals = parse_row(row)
                    if len(vals) < 3:
                        continue
                    term_id = to_int(vals[0])
                    if term_id is not None:
                        terms[term_id] = {"name": vals[1] or "", "slug": vals[2] or ""}
                continue

    people_posts = [p for p in posts_by_id.values() if p["type"] == CPT_PERSON and p["status"] == "publish"]
    wpid_to_uuid = {p["id"]: str(uuid.uuid4()) for p in people_posts}

    if args.clean and args.write:
        for d in [family_root, posts_root]:
            if d.exists():
                shutil.rmtree(d)

    copied_images = 0
    missing_images = 0

    # people
    for p in people_posts:
        pid = p["id"]
        meta = postmeta.get(pid, {})
        person_id = wpid_to_uuid[pid]

        first = (meta.get("lsvr_family_member_first_name", [""])[0] or "").strip()
        last = (meta.get("lsvr_family_member_last_name", [""])[0] or "").strip()
        full = (p["title"] or "").strip() or " ".join([first, last]).strip() or f"Person {pid}"
        sex_src = (meta.get("lsvr_family_member_gender", [""])[0] or "").lower()
        sex = "M" if sex_src.startswith("m") else "F" if sex_src.startswith("f") else "U"

        father_wp = to_int((meta.get("lsvr_family_member_parent2", [None])[0] or ""))
        mother_wp = to_int((meta.get("lsvr_family_member_parent1", [None])[0] or ""))

        spouses: list[dict[str, str]] = []
        for key in ["lsvr_family_member_partner1", "lsvr_family_member_partner2", "lsvr_family_member_partner3", "lsvr_family_member_partner4"]:
            wpv = (meta.get(key, [None])[0] or "").strip()
            wpint = to_int(wpv)
            if wpint and wpint in wpid_to_uuid:
                spouses.append({"person": wpid_to_uuid[wpint], "from": "", "to": "", "place": "", "notes": ""})

        # derive children by reverse parent links
        children: list[str] = []
        for other in people_posts:
            om = postmeta.get(other["id"], {})
            op1 = to_int((om.get("lsvr_family_member_parent1", [None])[0] or ""))
            op2 = to_int((om.get("lsvr_family_member_parent2", [None])[0] or ""))
            if pid in {op1, op2} and other["id"] in wpid_to_uuid:
                children.append(wpid_to_uuid[other["id"]])

        born = parse_maybe_date((meta.get("lsvr_family_member_birth_date", [""])[0] or ""))
        died = parse_maybe_date((meta.get("lsvr_family_member_death_date", [""])[0] or ""))

        fm: dict[str, Any] = {
            "title": full,
            "date": (p["date"] or "").replace(" ", "T") + "Z" if p["date"] else now_iso(),
            "draft": False,
            "person_id": person_id,
            "slug": slugify(p["slug"] or full) or person_id,
            "aliases": [f"/{p['slug']}/"] if p.get("slug") else [],
            "names": {
                "full": full,
                "given": first,
                "middle": "",
                "surname": last,
                "suffix": "",
                "maiden": (meta.get("lsvr_family_member_birth_name", [""])[0] or "").strip(),
                "also_known_as": [],
            },
            "sex": sex,
            "vitals": {
                "born": born,
                "died": died,
                "birth_place": (meta.get("lsvr_family_member_birth_place", [""])[0] or "").strip(),
                "death_place": (meta.get("lsvr_family_member_death_place", [""])[0] or "").strip(),
                "burial_place": (meta.get("lsvr_family_member_burial_place", [""])[0] or "").strip(),
                "cause_of_death": "",
            },
            "relations": {
                "parents": {
                    "father": wpid_to_uuid.get(father_wp, "") if father_wp else "",
                    "mother": wpid_to_uuid.get(mother_wp, "") if mother_wp else "",
                },
                "spouses": spouses,
                "children": sorted(set(children)),
                "siblings": [],
            },
            "media": {
                "featured": "",
                "gallery": [],
            },
            "ids": {
                "findagrave": "",
                "familysearch": "",
                "wikitree": "",
                "geni": "",
                "ancestry": "",
            },
            "sources": [],
            "confidence": {
                "identity": "medium",
                "vitals": "medium",
                "parents": "medium",
                "notes": "Imported from legacy WordPress dump.",
            },
            "provenance": {
                "imported_from": "WordPress SQL dump",
                "wp_slug": p.get("slug") or "",
                "wp_type": CPT_PERSON,
            },
            "story_md": p.get("content") or "",
            "timeline": [],
        }

        # import findagrave / cause from custom fields
        for i in range(1, 5):
            t = (meta.get(f"lsvr_family_member_custom_field{i}_title", [""])[0] or "").strip()
            v = (meta.get(f"lsvr_family_member_custom_field{i}_text", [""])[0] or "").strip()
            if not t and not v:
                continue
            if "find a grave" in t.lower():
                m = re.search(r"findagrave\.com/memorial/(\d+)", v, flags=re.I)
                if m:
                    fm["ids"]["findagrave"] = m.group(1)
            if "cause of death" in t.lower() and not fm["vitals"]["cause_of_death"]:
                fm["vitals"]["cause_of_death"] = re.sub(r"<[^>]+>", "", v).strip()

        # images
        bundle = family_root / f"{person_id}-{slugify(p['slug'] or full)}"
        gallery_dir = bundle / "gallery"
        thumb_id = to_int((meta.get("_thumbnail_id", [None])[0] or ""))
        if thumb_id and thumb_id in postmeta and postmeta[thumb_id].get("_wp_attached_file"):
            rel = (postmeta[thumb_id]["_wp_attached_file"][0] or "").lstrip("/")
            src = uploads_root / rel
            ext = src.suffix.lower() or ".jpg"
            dst = gallery_dir / f"featured{ext}"
            if args.write:
                copied = copy_if_exists(src, dst)
                copied_images += int(copied)
                missing_images += int(not copied)
            fm["media"]["featured"] = f"gallery/{dst.name}"

        attachment_ids = set(parse_serialized_id_list((meta.get("lsvr_family_member_images", [""])[0] or "")))
        for aid, post in posts_by_id.items():
            if post.get("type") == "attachment" and int(post.get("parent") or 0) == pid:
                attachment_ids.add(aid)

        for aid in sorted(attachment_ids):
            rels = postmeta.get(aid, {}).get("_wp_attached_file") or []
            if not rels:
                continue
            rel = (rels[0] or "").lstrip("/")
            src = uploads_root / rel
            name = Path(rel).name
            dst = gallery_dir / name
            if args.write:
                copied = copy_if_exists(src, dst)
                copied_images += int(copied)
                missing_images += int(not copied)
            fm["media"]["gallery"].append(
                {
                    "file": f"gallery/{name}",
                    "type": "photo",
                    "title": "",
                    "caption": "",
                    "date": "",
                    "source_key": "",
                }
            )

        if args.write:
            write_front_matter(bundle / "index.md", fm, fm.pop("story_md", ""))

    # posts and pages
    posts = [p for p in posts_by_id.values() if p["type"] == "post" and p["status"] == "publish"]
    pages = [p for p in posts_by_id.values() if p["type"] == "page" and p["status"] == "publish"]

    if args.write:
        (posts_root).mkdir(parents=True, exist_ok=True)
        write_front_matter(posts_root / "_index.md", {"title": "Posts"}, "")

    for p in posts:
        cats: list[str] = []
        tags: list[str] = []
        for tax_id in term_relationships.get(p["id"], []):
            tax = term_tax.get(tax_id, {})
            term = terms.get(tax.get("term_id"), {})
            if tax.get("taxonomy") == "category":
                cats.append(term.get("slug", ""))
            if tax.get("taxonomy") == "post_tag":
                tags.append(term.get("slug", ""))
        fm = {
            "title": p["title"],
            "date": (p["date"] or "").replace(" ", "T") + "Z" if p["date"] else now_iso(),
            "draft": False,
            "aliases": [f"/{p['slug']}/"] if p.get("slug") else [],
            "categories": [c for c in cats if c],
            "tags": [t for t in tags if t],
            "provenance": {"imported_from": "WordPress SQL dump", "wp_slug": p.get("slug") or "", "wp_type": "post"},
        }
        if args.write:
            slug = slugify(p["slug"] or p["title"]) or f"post-{p['id']}"
            write_front_matter(posts_root / slug / "index.md", fm, p.get("content") or "")

    for p in pages:
        fm = {
            "title": p["title"],
            "date": (p["date"] or "").replace(" ", "T") + "Z" if p["date"] else now_iso(),
            "draft": False,
            "aliases": [f"/{p['slug']}/"] if p.get("slug") else [],
            "provenance": {"imported_from": "WordPress SQL dump", "wp_slug": p.get("slug") or "", "wp_type": "page"},
        }
        if args.write:
            slug = slugify(p["slug"] or p["title"]) or f"page-{p['id']}"
            write_front_matter(content_root / slug / "index.md", fm, p.get("content") or "")

    summary = {
        "people": len(people_posts),
        "posts": len(posts),
        "pages": len(pages),
        "images_copied": copied_images,
        "images_missing": missing_images,
        "write": bool(args.write),
        "src_root": str(src_root),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

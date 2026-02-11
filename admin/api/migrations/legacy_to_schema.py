from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Any

import yaml

from api.models.person import PersonRecord

PERSON_ID_RE = re.compile(r"^[a-f0-9\-]{36}$")


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


def _map_relations(value: str, mapping: dict[str, str]) -> str:
    if not value:
        return ""
    return mapping.get(value, value)


def _map_legacy(data: dict[str, Any], path: Path, mapping: dict[str, str]) -> dict[str, Any]:
    title = data.get("title") or data.get("name") or data.get("full_name") or ""
    given = data.get("given") or data.get("first_name") or data.get("first") or ""
    middle = data.get("middle") or data.get("middle_name") or ""
    surname = data.get("surname") or data.get("last_name") or data.get("last") or ""

    if not title:
        if given or surname:
            title = " ".join([given, middle, surname]).strip()
        else:
            title = path.parent.name

    original_slug = str(data.get("person_id") or data.get("id") or path.parent.name)
    person_id = mapping.get(original_slug, original_slug)

    names = data.get("names") or {}
    names.setdefault("full", title)
    names.setdefault("given", given)
    names.setdefault("middle", middle)
    names.setdefault("surname", surname)
    names.setdefault("suffix", data.get("suffix", ""))
    names.setdefault("maiden", data.get("maiden", ""))
    names.setdefault("also_known_as", data.get("also_known_as", []) or data.get("aka", []) or [])

    vitals = data.get("vitals") or {}
    vitals.setdefault("born", data.get("born") or data.get("birth_year") or "")
    vitals.setdefault("died", data.get("died") or data.get("death_year") or "")
    vitals.setdefault("birth_place", data.get("birth_place", ""))
    vitals.setdefault("death_place", data.get("death_place", ""))
    vitals.setdefault("burial_place", data.get("burial_place", ""))
    vitals.setdefault("cause_of_death", data.get("cause_of_death", ""))

    relations = data.get("relations") or {}
    parents = relations.get("parents") or {}
    parents.setdefault("father", data.get("father", ""))
    parents.setdefault("mother", data.get("mother", ""))

    spouses = relations.get("spouses") or []
    if isinstance(data.get("spouses"), list):
        spouses = [{"person": s} for s in data.get("spouses", []) if isinstance(s, str)] or spouses

    children = relations.get("children") or data.get("children") or []
    siblings = relations.get("siblings") or data.get("siblings") or []

    # Map relationships to new UUIDs if needed
    parents = {
        "father": _map_relations(parents.get("father", ""), mapping),
        "mother": _map_relations(parents.get("mother", ""), mapping),
    }
    mapped_spouses = []
    for spouse in spouses:
        person = spouse.get("person", "") if isinstance(spouse, dict) else ""
        if person:
            spouse = {**spouse, "person": _map_relations(person, mapping)}
        mapped_spouses.append(spouse)
    children = [_map_relations(c, mapping) for c in children]
    siblings = [_map_relations(s, mapping) for s in siblings]

    media = data.get("media") or {}
    if data.get("featured") and not media.get("featured"):
        media["featured"] = data.get("featured")
    if data.get("gallery") and not media.get("gallery"):
        media["gallery"] = [
            {"file": f, "type": "photo", "title": "", "caption": "", "date": "", "source_key": ""}
            for f in data.get("gallery")
            if isinstance(f, str)
        ]

    ids = data.get("ids") or {}
    ids.setdefault("findagrave", data.get("findagrave", ""))
    ids.setdefault("familysearch", data.get("familysearch", ""))
    ids.setdefault("wikitree", data.get("wikitree", ""))
    ids.setdefault("geni", data.get("geni", ""))
    ids.setdefault("ancestry", data.get("ancestry", ""))

    sources = data.get("sources") or []

    confidence = data.get("confidence") or {}
    provenance = data.get("provenance") or {}

    aliases = data.get("aliases", []) or []
    if original_slug and original_slug not in aliases and original_slug != person_id:
        aliases.append(original_slug)

    return {
        "title": title,
        "date": data.get("date", ""),
        "draft": bool(data.get("draft", False)),
        "person_id": person_id,
        "slug": data.get("slug", original_slug if original_slug != person_id else ""),
        "aliases": aliases,
        "names": names,
        "sex": data.get("sex", data.get("gender", "U")) or "U",
        "vitals": vitals,
        "relations": {
            "parents": parents,
            "spouses": mapped_spouses,
            "children": children,
            "siblings": siblings,
        },
        "media": media,
        "ids": ids,
        "sources": sources,
        "confidence": confidence,
        "provenance": provenance,
    }


def migrate_file(path: Path, content_root: Path, mapping: dict[str, str]) -> dict[str, Any]:
    data, body = _split_front_matter(path.read_text(encoding="utf-8"))
    mapped = _map_legacy(data, path, mapping)

    record = PersonRecord.model_validate(mapped)

    old_dir = path.parent
    if not old_dir.name.startswith(record.person_id):
        new_dir = content_root / f"{record.person_id}-{old_dir.name}"
    else:
        new_dir = content_root / old_dir.name

    if old_dir != new_dir and not new_dir.exists():
        old_dir.rename(new_dir)
        path = new_dir / "index.md"

    output = _dump_front_matter(record.model_dump(by_alias=True), body)
    path.write_text(output, encoding="utf-8")
    return {"path": str(path), "person_id": record.person_id}


def main() -> None:
    src_root = Path(os.getenv("SRC_ROOT", "/src"))
    content_root = src_root / "content" / "family"
    if not content_root.exists():
        raise SystemExit(f"Content root not found: {content_root}")

    mapping: dict[str, str] = {}
    files = list(content_root.rglob("index.md"))
    for md in files:
        data, _ = _split_front_matter(md.read_text(encoding="utf-8"))
        original_slug = str(data.get("person_id") or data.get("id") or md.parent.name)
        if PERSON_ID_RE.match(original_slug):
            mapping[original_slug] = original_slug
        else:
            mapping[original_slug] = str(uuid.uuid4())

    migrated = []
    for md in files:
        migrated.append(migrate_file(md, content_root, mapping))

    print(f"Migrated {len(migrated)} records")


if __name__ == "__main__":
    main()

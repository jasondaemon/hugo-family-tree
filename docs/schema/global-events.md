# Global Events Schema

## Purpose
Global events represent world or regional history that can appear on timeline views independent of an individual person record.

Storage path:
- `src/content/global-events/<slug>/index.md`

## Core Fields
- `title`: Event title.
- `slug`: Stable slug used in API paths and Hugo content path.
- `start_date`: Partial ISO (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`) required.
- `end_date`: Partial ISO optional. If omitted in admin, it is treated as same day as `start_date`.
- `event_type`: Category label (for example `historical`, `war`, `science`).
- `location`: Free text location.
- `story_md`: Markdown narrative authored in admin WYSIWYG (Toast editor).
- `featured`: Optional bundle-relative media path.
- `media[]`: Optional media list for timeline display.
- `sources[]`: Structured citation list (`key`, `title`, `url`, `accessed`, `notes`).
- `tags[]`: Optional filtering tags.
- `draft`: Hugo draft flag.

## Validation Rules
- `start_date` and `end_date` must be partial ISO.
- If both are present, `end_date` must not be before `start_date`.
- Source keys must be unique within the event.
- Media paths must be bundle-relative and safe.

## Person Timeline Interop
Global events are not manually linked to people. Timeline rendering logic decides whether to display a global event for a person by comparing:
- person life range (`born` to `died`)
- event range (`start_date` to `end_date`)

If person life range is incomplete (unknown `born` or `died`), global events are hidden by rule.

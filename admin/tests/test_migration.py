from pathlib import Path

from api.migrations.legacy_to_schema import migrate_file


def test_migration(tmp_path: Path):
    content_root = tmp_path / "content" / "family"
    content_root.mkdir(parents=True, exist_ok=True)

    legacy_dir = content_root / "legacy"
    legacy_dir.mkdir()
    md = legacy_dir / "index.md"
    md.write_text(
        """---\n"
        "title: Legacy Person\n"
        "birth_year: '1901'\n"
        "death_year: '1977'\n"
        "---\n\nBody\n""",
        encoding="utf-8",
    )

    result = migrate_file(md, content_root)
    assert "person_id" in result
    assert len(result["person_id"]) == 36
    assert Path(result["path"]).exists()

import os
from pathlib import Path

import app as admin_app
from api.models.person import PersonRecord


def test_schema_roundtrip(tmp_path: Path):
    os.environ["SRC_ROOT"] = str(tmp_path)
    admin_app.SRC_ROOT = tmp_path
    admin_app.CONTENT_ROOT = tmp_path / "content" / "family"
    admin_app.CONTENT_ROOT.mkdir(parents=True, exist_ok=True)

    record = PersonRecord(
        title="Example Person",
        date="2026-02-09T00:00:00Z",
        draft=False,
        person_id="11111111-1111-4111-8111-111111111111",
        slug="example-person",
        aliases=[],
        names={"full": "Example Person", "given": "Example", "surname": "Person"},
        sex="U",
    )

    path = admin_app.CONTENT_ROOT / "11111111-1111-4111-8111-111111111111" / "index.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    admin_app._write_person(path, record.model_dump(by_alias=True), "Body")

    data, body = admin_app._read_person(path)
    loaded = PersonRecord.model_validate(data)
    assert loaded.person_id == "11111111-1111-4111-8111-111111111111"
    assert body.strip() == "Body"

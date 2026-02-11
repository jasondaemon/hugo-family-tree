import os
from pathlib import Path

import app as admin_app
from api.models.person import PersonRecord
import pytest


def test_relationship_validation(tmp_path: Path):
    os.environ["SRC_ROOT"] = str(tmp_path)
    admin_app.SRC_ROOT = tmp_path
    admin_app.CONTENT_ROOT = tmp_path / "content" / "family"
    admin_app.CONTENT_ROOT.mkdir(parents=True, exist_ok=True)

    # create two people
    for pid in ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]:
        path = admin_app.CONTENT_ROOT / pid / "index.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        record = PersonRecord(
            title=pid,
            date="2026-02-09T00:00:00Z",
            draft=False,
            person_id=pid,
            names={"full": pid},
            sex="U",
        )
        admin_app._write_person(path, record.model_dump(by_alias=True), "")

    record = PersonRecord(
        title="child",
        date="2026-02-09T00:00:00Z",
        draft=False,
        person_id="22222222-2222-4222-8222-222222222222",
        names={"full": "child"},
        sex="U",
        relations={"parents": {"father": "11111111-1111-4111-8111-111111111111"}, "children": []},
    )

    warnings = admin_app._validate_relationships(
        record, {"11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"}
    )
    assert warnings == []


def test_duplicate_children_rejected(tmp_path: Path):
    os.environ["SRC_ROOT"] = str(tmp_path)
    admin_app.SRC_ROOT = tmp_path
    admin_app.CONTENT_ROOT = tmp_path / "content" / "family"
    admin_app.CONTENT_ROOT.mkdir(parents=True, exist_ok=True)

    record = PersonRecord(
        title="Parent",
        date="2026-02-09T00:00:00Z",
        draft=False,
        person_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        names={"full": "Parent"},
        sex="U",
        relations={"children": ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]},
    )

    with pytest.raises(Exception):
        admin_app._validate_relationships(record, {"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"})

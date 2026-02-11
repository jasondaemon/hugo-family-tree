import os
from pathlib import Path

from fastapi.testclient import TestClient

import app as admin_app
from api.models.person import PersonRecord


def test_search_endpoint(tmp_path: Path):
    os.environ["SRC_ROOT"] = str(tmp_path)
    admin_app.SRC_ROOT = tmp_path
    admin_app.CONTENT_ROOT = tmp_path / "content" / "family"
    admin_app.CONTENT_ROOT.mkdir(parents=True, exist_ok=True)

    record = PersonRecord(
        title="Jane Doe",
        date="2026-02-09T00:00:00Z",
        draft=False,
        person_id="33333333-3333-4333-8333-333333333333",
        names={"full": "Jane Doe", "given": "Jane", "surname": "Doe", "also_known_as": ["JD"]},
        sex="F",
    )
    path = admin_app.CONTENT_ROOT / "33333333-3333-4333-8333-333333333333" / "index.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    admin_app._write_person(path, record.model_dump(by_alias=True), "")

    client = TestClient(admin_app.app)
    res = client.get("/people/search", params={"q": "jane"})
    assert res.status_code == 200
    data = res.json()
    assert data["people"][0]["person_id"] == "33333333-3333-4333-8333-333333333333"

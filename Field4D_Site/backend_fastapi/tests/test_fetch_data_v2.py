from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import orjson
import pyarrow
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from main import app
from routers import fetch_data
from routers import fetch_data_v2
from services.fetch_cursor import CursorValidationError, decode_cursor, encode_cursor


def _payload(**updates: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "owner": "owner",
        "mac_address": "device",
        "experimentId": 7,
        "experiment": "ignored-name",
        "selectedSensors": ["sensor-b", "sensor-a"],
        "selectedParameters": ["temperature"],
        "dateRange": {
            "start": "2026-05-01T00:00:00Z",
            "end": "2026-05-01T00:15:00Z",
        },
        "pageSize": 2,
    }
    payload.update(updates)
    return payload


def _raw_row(row_id: str, minute: int, value: float = 1.0) -> dict[str, object]:
    return {
        "row_id": row_id,
        "timestamp": datetime(2026, 5, 1, 0, minute, tzinfo=timezone.utc),
        "sensor": "sensor-a",
        "parameter": "temperature",
        "value": value,
        "location": "greenhouse",
        "experiment": "experiment",
        "owner": "owner",
        "mac_address": "device",
    }


def _query_metrics() -> dict[str, object]:
    return {
        "client_query_ms": 1.0,
        "server_query_ms": 0.5,
        "bytes_processed": 100,
        "slot_millis": 1,
        "materialization_ms": 0.2,
        "materialization_method": "fixture",
        "arrow_fallback_type": None,
    }


def _arrow_table(rows: list[dict[str, object]], start_index: int = 0) -> pyarrow.Table:
    schema = pyarrow.schema(
        [
            ("row_id", pyarrow.string()),
            ("timestamp", pyarrow.timestamp("us", tz="UTC")),
            ("sensor", pyarrow.string()),
            ("parameter", pyarrow.string()),
            ("value", pyarrow.float64()),
            ("location", pyarrow.string()),
            ("experiment", pyarrow.string()),
            ("owner", pyarrow.string()),
            ("mac_address", pyarrow.string()),
            ("page_index", pyarrow.int64()),
        ]
    )
    columns = {
        name: [row.get(name) for row in rows]
        for name in schema.names
        if name != "page_index"
    }
    columns["page_index"] = list(range(start_index, start_index + len(rows)))
    return pyarrow.Table.from_pydict(columns, schema=schema)


def test_cursor_round_trip_and_tamper_rejection() -> None:
    token = encode_cursor({"selection_signature": "abc", "page_sequence": 2})
    assert decode_cursor(token)["selection_signature"] == "abc"
    replacement = "A" if token[-1] != "A" else "B"
    with pytest.raises(CursorValidationError):
        decode_cursor(token[:-1] + replacement)


def test_selection_signature_tracks_query_semantics() -> None:
    first, first_signature = fetch_data_v2._canonical_selection(
        fetch_data_v2.FetchDataPageRequest.model_validate(_payload())
    )
    reordered, reordered_signature = fetch_data_v2._canonical_selection(
        fetch_data_v2.FetchDataPageRequest.model_validate(
            _payload(
                experiment="another-ignored-name",
                selectedSensors=["sensor-a", "sensor-b", "sensor-a"],
            )
        )
    )
    changed, changed_signature = fetch_data_v2._canonical_selection(
        fetch_data_v2.FetchDataPageRequest.model_validate(
            _payload(selectedSensors=["sensor-c"])
        )
    )
    assert first == reordered
    assert first_signature == reordered_signature
    assert changed_signature != first_signature


def test_page_boundary_preserves_duplicate_content_by_row_id() -> None:
    rows = [
        _raw_row("0001", 0, 5.0),
        _raw_row("0002", 0, 5.0),
        _raw_row("0003", 3, 6.0),
    ]
    public, last_key, has_more, _ = fetch_data_v2._bounded_public_rows(
        rows, {"sensor-a": "plant-a"}, page_size=2
    )
    assert len(public) == 2
    assert public[0] == public[1]
    assert last_key == [
        "2026-05-01T00:00:00.000000Z",
        "sensor-a",
        "temperature",
        "0002",
    ]
    assert has_more is True
    assert all(row["label"] == "plant-a" for row in public)


def test_fixed_100k_policy_defaults_and_rejects_larger_requests() -> None:
    request = fetch_data_v2.FetchDataPageRequest.model_validate(
        _payload(pageSize=None)
    )
    assert request.pageSize is None
    assert fetch_data_v2.DEFAULT_PAGE_SIZE == 100_000
    assert fetch_data_v2.MAX_PAGE_SIZE == 100_000
    assert fetch_data_v2.TARGET_ROW_BYTES == 24 * 1024 * 1024

    accepted = fetch_data_v2.FetchDataPageRequest.model_validate(
        _payload(pageSize=100_000)
    )
    assert accepted.pageSize == 100_000
    with pytest.raises(ValidationError):
        fetch_data_v2.FetchDataPageRequest.model_validate(
            _payload(pageSize=100_001)
        )


def test_fixed_100k_policy_returns_a_full_representative_page() -> None:
    public_row = fetch_data_v2._public_row(
        _raw_row("000000", 0), {"sensor-a": "plant-a"}
    )
    prepared_rows = [public_row] * 100_000
    row_ids = [f"{index:06d}" for index in range(100_000)]

    public, last_key, has_more, row_bytes = (
        fetch_data_v2._bound_prepared_public_rows(
            prepared_rows, row_ids, page_size=100_000
        )
    )

    assert len(public) == 100_000
    assert has_more is False
    assert row_bytes < fetch_data_v2.TARGET_ROW_BYTES
    assert last_key == [
        "2026-05-01T00:00:00.000000Z",
        "sensor-a",
        "temperature",
        "099999",
    ]


def test_fixed_100k_policy_retains_a_finite_body_ceiling() -> None:
    oversized_row = {
        **fetch_data_v2._public_row(_raw_row("000001", 0), {}),
        "location": "x" * (1024 * 1024),
    }
    prepared_rows = [oversized_row] * 30
    row_ids = [f"{index:06d}" for index in range(30)]

    public, _, has_more, row_bytes = fetch_data_v2._bound_prepared_public_rows(
        prepared_rows, row_ids, page_size=100_000
    )

    assert 1 < len(public) < len(prepared_rows)
    assert has_more is True
    assert row_bytes <= fetch_data_v2.TARGET_ROW_BYTES


def test_vectorized_arrow_transform_is_exact_for_edge_case_fixture() -> None:
    rows = [
        _raw_row("0001", 0, 5.0),
        _raw_row("0002", 0, 5.0),
        {
            **_raw_row("0003", 5, 1.0),
            "timestamp": datetime(
                2026, 5, 1, 3, 5, tzinfo=timezone(timedelta(hours=3))
            ),
            "sensor": "sensor-b",
            "value": None,
            "location": None,
        },
        {**_raw_row("0004", 9, -2.5), "parameter": "humidity"},
        _raw_row("0005", 12, 0.0),
    ]
    label_map = {"sensor-a": "plant-a", "sensor-b": ""}
    expected = [fetch_data_v2._public_row(row, label_map) for row in rows]

    actual, row_ids, stages = fetch_data_v2._vectorized_public_rows(
        _arrow_table(rows), label_map, start_index=0
    )

    assert orjson.dumps(actual) == orjson.dumps(expected)
    assert row_ids == ["0001", "0002", "0003", "0004", "0005"]
    assert actual[0] == actual[1]
    assert actual[2]["timestamp"] == "2026-05-01T00:05:00.000000Z"
    assert actual[2]["value"] is None
    assert actual[2]["label"] == ""
    assert actual[2]["location"] is None
    assert set(stages) == {
        "arrow_native_operations_ms",
        "casts_vectorized_transforms_ms",
        "final_materialization_ms",
        "final_python_row_construction_ms",
        "total_transform_ms",
    }

    public, last_key, has_more, _ = fetch_data_v2._bound_prepared_public_rows(
        actual, row_ids, page_size=2
    )
    assert public == expected[:2]
    assert last_key == [
        "2026-05-01T00:00:00.000000Z",
        "sensor-a",
        "temperature",
        "0002",
    ]
    assert has_more is True

    partial = _arrow_table(rows[2:], start_index=2)
    partial_actual, partial_ids, _ = fetch_data_v2._vectorized_public_rows(
        partial, label_map, start_index=2
    )
    assert partial_actual == expected[2:]
    assert partial_ids == ["0003", "0004", "0005"]


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_vectorized_arrow_transform_preserves_non_finite_rejection(value: float) -> None:
    row = _raw_row("0001", 0, value)
    with pytest.raises(HTTPException) as current_error:
        fetch_data_v2._public_row(row, {})
    with pytest.raises(HTTPException) as candidate_error:
        fetch_data_v2._vectorized_public_rows(_arrow_table([row]), {}, start_index=0)
    assert getattr(candidate_error.value, "status_code", None) == getattr(
        current_error.value, "status_code", None
    ) == 500
    assert getattr(candidate_error.value, "detail", None) == getattr(
        current_error.value, "detail", None
    ) == "A selected row has a non-finite value"


def test_vectorized_arrow_transform_rejects_ordinal_drift() -> None:
    table = _arrow_table([_raw_row("0001", 0)])
    with pytest.raises(HTTPException) as exc_info:
        fetch_data_v2._vectorized_public_rows(table, {}, start_index=1)
    assert getattr(exc_info.value, "status_code", None) == 500
    assert getattr(exc_info.value, "detail", None) == "BigQuery read stream order changed"


def test_measurement_query_uses_snapshot_and_duplicate_preserving_total_order() -> None:
    selection, _ = fetch_data_v2._canonical_selection(
        fetch_data_v2.FetchDataPageRequest.model_validate(_payload())
    )
    query, _ = fetch_data_v2._measurement_query(
        selection,
        datetime(2026, 5, 1, tzinfo=timezone.utc),
    )
    assert "ORDER BY timestamp ASC, sensor ASC, parameter ASC, row_id ASC" in query
    assert "FOR SYSTEM_TIME AS OF @snapshot_at" in query
    assert "AS page_index" in query
    assert "LIMIT" not in query
    assert "OFFSET" not in query


def test_page_endpoint_retry_terminal_and_cursor_safety(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_raw_row("0001", 0), _raw_row("0002", 3), _raw_row("0003", 6)]

    async def fake_labels(*_: object, **__: object):
        return {"sensor-a": "plant-a"}, _query_metrics()

    async def fake_start_page(
        _selection: object,
        _snapshot: object,
        _page_size: int,
        _request: object,
    ):
        return rows, _query_metrics(), {
            "job_id": "job",
            "project": "project",
            "location": "location",
            "read_session": "session",
            "read_stream": "stream",
        }, 3

    async def fake_resume_page(
        _job_reference: object,
        start_index: int,
        _page_size: int,
        _total_rows: int,
        _request: object,
    ):
        return rows[start_index:], _query_metrics(), 3

    monkeypatch.setattr(fetch_data_v2, "_load_label_map", fake_labels)
    monkeypatch.setattr(fetch_data_v2, "_start_measurement_page", fake_start_page)
    monkeypatch.setattr(fetch_data_v2, "_resume_measurement_page", fake_resume_page)

    async def scenario() -> None:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post("/api/v2/fetch-data-page", json=_payload())
            assert first.status_code == 200
            first_doc = first.json()
            assert set(first_doc) == {
                "schema_version",
                "query_id",
                "selection_signature",
                "snapshot_at",
                "page_sequence",
                "rows",
                "rows_in_page",
                "cumulative_rows",
                "total_rows",
                "next_cursor",
                "complete",
                "error",
                "retryable",
            }
            assert first_doc["rows_in_page"] == 2
            assert first_doc["total_rows"] == 3
            assert first_doc["complete"] is False
            cursor = first_doc["next_cursor"]

            continuation_payload = _payload(cursor=cursor)
            continuation_payload.pop("pageSize")
            second_a = await client.post(
                "/api/v2/fetch-data-page", json=continuation_payload
            )
            second_b = await client.post(
                "/api/v2/fetch-data-page", json=continuation_payload
            )
            assert second_a.status_code == 200
            assert second_a.content == second_b.content
            second_doc = second_a.json()
            assert second_doc["page_sequence"] == 2
            assert second_doc["cumulative_rows"] == 3
            assert second_doc["snapshot_at"] == first_doc["snapshot_at"]
            assert second_doc["selection_signature"] == first_doc["selection_signature"]
            assert second_doc["query_id"] == first_doc["query_id"]
            assert second_doc["complete"] is True
            assert second_doc["next_cursor"] is None

            wrong = await client.post(
                "/api/v2/fetch-data-page",
                json={**continuation_payload, "selectedSensors": ["wrong-sensor"]},
            )
            assert wrong.status_code == 400

            tampered = await client.post(
                "/api/v2/fetch-data-page",
                json={**continuation_payload, "cursor": cursor[:-1] + "A"},
            )
            assert tampered.status_code == 400

    asyncio.run(scenario())


def test_expired_cursor_returns_recoverable_status() -> None:
    request = fetch_data_v2.FetchDataPageRequest.model_validate(_payload())
    _, signature = fetch_data_v2._canonical_selection(request)
    expired = datetime.now(timezone.utc) - timedelta(minutes=1)
    cursor = encode_cursor(
        {
            "selection_signature": signature,
            "query_id": "query",
            "snapshot_at": fetch_data_v2._utc_iso(expired - timedelta(hours=1)),
            "expires_at": fetch_data_v2._utc_iso(expired),
            "page_size": 2,
            "page_sequence": 2,
            "cumulative_rows": 2,
            "last_key": [
                "2026-05-01T00:00:00.000000Z",
                "sensor-a",
                "temperature",
                "0001",
            ],
            "label_map": {"sensor-a": "plant-a"},
        }
    )

    async def scenario() -> None:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v2/fetch-data-page", json=_payload(cursor=cursor)
            )
            assert response.status_code == 410

    asyncio.run(scenario())


def test_legacy_route_remains_available_and_old_v2_route_is_removed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy_row = {
        "timestamp": datetime(2026, 5, 1, tzinfo=timezone.utc),
        "sensor": "sensor-a",
        "parameter": "temperature",
        "value": 1.0,
        "label": "plant-a",
        "location": "greenhouse",
        "experiment": "experiment",
        "owner": "owner",
        "mac_address": "device",
    }
    legacy_job = SimpleNamespace(
        started=None,
        ended=None,
        total_bytes_processed=0,
    )

    monkeypatch.setattr(
        fetch_data,
        "run_query_with_job",
        lambda **_: ([legacy_row], legacy_job),
    )

    async def scenario() -> None:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            legacy = await client.post("/api/fetch-data", json=_payload())
            assert legacy.status_code == 200
            assert len(legacy.json()) == 1

            removed = await client.post("/api/v2/fetch-data/page", json=_payload())
            assert removed.status_code == 404

    asyncio.run(scenario())

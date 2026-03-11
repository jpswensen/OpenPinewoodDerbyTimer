# Code Review Findings — GPT 5.2 Implementation (commit 0095057)

Review performed: 2026-03-11

## Summary

All code at or before commit `0095057` was reviewed for correctness, consistency,
and quality. The backend test suite (25 tests) and frontend build/lint passed
before this review. Several bugs, validation gaps, and contract mismatches were
identified and fixed in-place.

---

## Issues Found & Fixed

### 🔴 Critical / Bugs

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `backend/app/routers/races.py` | Heat status transition to `"pending"` clears `completed_at` but not `scheduled_at`, leaving an inconsistent timestamp | Clear both `scheduled_at` and `completed_at` when reverting to pending |
| 2 | `backend/app/routers/races.py` | `repeat_heat` endpoint set `scheduled_at=utcnow()` on a new "pending" heat (should be None until in_progress) | Removed `scheduled_at` from repeat heat creation |
| 3 | `backend/app/services/connection_manager.py` | `_send()` reads `self._writer` inside lock, then uses it outside lock — TOCTOU race condition if `_close_writer()` nulls it between the two steps | Moved the `writer.write()` call inside the `async with self._lock` block |
| 4 | `backend/app/services/timer_protocol.py` | `parse_status_message()` accepts negative `num_lanes` values from malformed timer messages | Added explicit `ValueError` for `num_lanes < 0` |

### 🟠 Data Integrity / Validation

| # | File | Issue | Fix |
|---|------|-------|-----|
| 5 | `backend/app/models/schemas.py` | Race and Heat `status` fields use plain `str` — no validation against allowed values | Changed to `Literal["setup", "in_progress", "completed"]` and `Literal["pending", "in_progress", "completed"]` respectively |
| 6 | `backend/app/routers/races.py` | `HeatUpdateRequest.status` also used bare `str` | Changed to `Literal[...]` matching Heat statuses |
| 7 | `backend/app/services/heat_scheduler.py` | No duplicate validation on `racer_ids` — same racer could appear twice in a heat | Added `len(set(racer_ids)) != n` check with `ValueError` |
| 8 | `backend/app/routers/racers.py` | Error detail for unknown group_ids was a `dict` (non-standard for FastAPI) | Changed to descriptive string: `"Unknown group_ids: [...]"` |
| 9 | `backend/app/routers/races.py` | Error detail for unknown racer_ids was a `dict` | Same fix — descriptive string |

### 🟡 API Gaps / Contract Issues

| # | File | Issue | Fix |
|---|------|-------|-----|
| 10 | `backend/app/routers/races.py` | No API endpoint to read computed `RaceResult` records | Added `GET /api/races/{race_id}/results` returning `list[RaceResultRead]` |
| 11 | `backend/app/routers/races.py` | `repeat_heat` decorator used raw `201` instead of `status.HTTP_201_CREATED` | Changed to `status.HTTP_201_CREATED` |
| 12 | `backend/app/models/schemas.py` | `HeatWithLanesRead` had redundant `model_config = ConfigDict(from_attributes=True)` (already inherited from `HeatRead`) | Removed redundant declaration |
| 13 | `frontend/src/api/endpoints/races.ts` | `RaceCreate` type missing optional `status` field present in backend schema | Added `status?: Race['status']` |
| 14 | `frontend/src/api/endpoints/races.ts` | `Race` type missing `created_at` field returned by backend | Added `created_at: string` |
| 15 | `frontend/src/api/endpoints/races.ts` | No `RaceResult` type or `getRaceResults()` function for new results endpoint | Added both |

### 🟢 Frontend Safety

| # | File | Issue | Fix |
|---|------|-------|-----|
| 16 | `frontend/src/pages/HeatsPage.tsx` | Unsafe `(error as Error).message` casting on TanStack Query errors | Changed to `error instanceof Error ? error.message : 'Fallback'` pattern |
| 17 | `frontend/src/pages/RacersPage.tsx` | Same unsafe error casting in two places | Same fix applied |

---

## Issues Noted But Not Changed

These were identified during review but deferred as lower priority or by design:

- **Missing `updated_at` on Race/RaceResult models**: Would require a migration. Not blocking functionality.
- **Missing DB indexes on `Racer.group_id` and `RaceResult.racer_id`**: Performance optimization for future; current data volumes are small.
- **Missing individual GET endpoints** for groups/racers: Frontend uses list endpoints and filters locally; REST purity vs pragmatism.
- **Missing Error Boundary in React router**: Good practice but not a bug; deferred to testing iteration.
- **Eager `lazy="selectin"` on all relationships**: Could cause N+1 at scale, but acceptable for the expected dataset size (dozens of racers, not millions).
- **No transaction rollback wrappers**: FastAPI's dependency injection already handles session cleanup on exception.

---

## Test Results After Fixes

- **Backend**: 25/25 tests passed ✅
- **Frontend lint**: Clean ✅
- **Frontend build**: Clean ✅

# Code Review and Roadmap

This document records final-prep review findings for the repository before publication.

## Prep fixes completed

| Area | Change |
| --- | --- |
| Repository layout | Moved operational scripts into `scripts/`, deployment examples into `packaging/deploy/`, PyInstaller config into `packaging/pyinstaller/`, and app icons into `packaging/icons/` |
| Hardware | Copied the active `PWDTimer_8Lane` Eagle project into `hardware/` and excluded EAGLE backup intermediates |
| Branding | Added PWDTimer logo/favicon assets and PyInstaller app icons |
| Frontend lint | Split the imperative confirm hook out of the component module, removed an `any` cast for pywebview, memoized heat data, and avoided reading a ref during render |
| Backend | Cached the event loop lookup in fresh-status waiting, aligned database environment handling with `PWD_TIMER_DB_URL`, and made CORS origins configurable with `PWD_TIMER_CORS_ORIGINS` |
| Documentation | Replaced stale review notes with current user, firmware, API, troubleshooting, hardware, and roadmap docs |

## Known limitations and recommended future work

### Backend and API

| Priority | Item | Notes |
| --- | --- | --- |
| Medium | Replace FastAPI `@app.on_event` handlers | Tests report deprecation warnings; migrate to lifespan handlers before a future FastAPI upgrade removes support |
| Medium | Harden SQLite deployment guidance | SQLite is correct for a single race computer; document backup/restore and avoid multi-process writes |
| Low | Batch initial WebSocket snapshot | New clients currently receive connection state, race state, lane times, and heat completion as separate messages |
| Low | Tighten serial monitor API | The router currently toggles an internal flag; expose explicit enable/disable actions if the UI grows this feature |

### Frontend

| Priority | Item | Notes |
| --- | --- | --- |
| Medium | Add an error boundary | A route-level React error boundary would make race-day failures easier to recover from |
| Medium | Add a "load demo data" action | Useful for training and screenshots; should call existing import flow or a backend seed endpoint |
| Low | Improve e2e selectors | Add stable `data-testid` attributes to important race-day controls |
| Low | Tune live timer rendering | Race timer interpolation is intentionally smooth; profile on older laptops/projectors if needed |

### Firmware and hardware

| Priority | Item | Notes |
| --- | --- | --- |
| High | End-to-end hardware validation checklist | Add measured validation results for every lane on the final assembled board |
| Medium | Document sensor polarity with photos | Start gate logic is specific: set is HIGH, release is falling edge to LOW |
| Medium | Add optional firmware version frame | The UI could show firmware version/build flags and warn about mismatches |
| Low | Evaluate UDP discovery | Current Wi-Fi workflow uses fixed SoftAP IP/ports; mDNS/TCP code paths are legacy-compatible but not the current primary network path |

### Packaging and distribution

| Priority | Item | Notes |
| --- | --- | --- |
| Medium | Add release workflow | GitHub Actions could build frontend/backend tests and attach platform-specific packaging instructions |
| Medium | Sign/notarize macOS builds | Required for a smooth non-developer install experience |
| Low | Add Windows installer | PyInstaller creates an executable; an installer could set shortcuts and data directory expectations |

## Verification notes

- Initial baseline: backend tests passed; frontend lint exposed four issues; PlatformIO was not installed in the prep environment.
- Final validation should include backend tests, frontend lint/test/build, and firmware `pio run` on a machine with PlatformIO.

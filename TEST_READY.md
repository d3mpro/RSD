# TEST_READY: Oracle Vision Agent (الراصد البصري الذكي) E2E Test Suite

**Status**: READY (100% Passing)  
**Date**: 2026-11-09  
**Target File**: `tests/e2e_oracle_vision.test.js`  
**Execution Command**: `node --test tests/e2e_oracle_vision.test.js`  
**Total Tests**: 126 test cases across 4 tiers (150 test units reported by runner)  
**Pass Rate**: 150 / 150 (100% Passed, 0 Failed, 0 Skipped)  
**Duration**: ~230ms  

---

## 1. Test Architecture & Coverage Breakdown

The E2E test suite comprehensively verifies the implementation and interface contracts of the Oracle Vision Agent (الراصد البصري الذكي) according to the specifications in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_INFRA.md`.

### Tier 1: Feature Coverage (55 tests across 11 features)

| Feature | Description | Tests | Status |
|---------|-------------|:-----:|:------:|
| **F1** | EXIF Orientation & Image Preprocessing (tags 1, 6, 3, 8, base64 normalization) | 5 | ✅ Passed (5/5) |
| **F2** | Multimodal & Text Model Fallback (`qwen2.5vl:3b` failover, audio structuring, prompt priority) | 5 | ✅ Passed (5/5) |
| **F3** | Backend Verification & Error Status (`/safety/api/ai/status`, security token, 400/403/503 errors) | 5 | ✅ Passed (5/5) |
| **F4** | Client API Routing & Discovery (`getApiUrl`, remote URL, localhost preservation, HTTPS) | 5 | ✅ Passed (5/5) |
| **F5** | Adaptive Timeout & Transparent Feedback (no fake heuristic fallback, progress callback, actionable errors) | 5 | ✅ Passed (5/5) |
| **F6** | Cloud Key Management & Validation (sanitization, localStorage persistence, multi-key rotation, bad key replacement) | 5 | ✅ Passed (5/5) |
| **F7** | Live Camera Stream & Reticle Overlay (SVG reticle, specialized extinguisher targeting, `getUserMedia` fallback) | 5 | ✅ Passed (5/5) |
| **F8** | Inspection Flow Control (no 350ms premature auto-trigger, post-capture metadata entry, manual trigger button) | 5 | ✅ Passed (5/5) |
| **F9** | Field Violation Modal Deduplication (unique element IDs, AI findings auto-fill, risk mapping, edit preservation) | 5 | ✅ Passed (5/5) |
| **F10** | Quality Portal Integration & Duty OCR (safety inbox sync, risk filtering, reticle script, duty OCR failover) | 5 | ✅ Passed (5/5) |
| **F11** | Impeccable UI/UX & Arabic Styling (`@keyframes scan`, institutional palette, clean Arabic typography, touch targets ≥44px) | 5 | ✅ Passed (5/5) |

### Tier 2: Boundary & Corner Cases (55 tests across 11 features)

- **F1 Boundary (5 tests)**:
  - B1.1: Image without EXIF tags processes normally without error.
  - B1.2: Extreme image dimensions (4000x200 panorama) clamp cleanly without aspect ratio distortion.
  - B1.3: Non-JPEG formats (PNG, WebP) correctly preserve mime-type.
  - B1.4: Malformed or truncated base64 payload caught safely by validator.
  - B1.5: Zero-byte / empty image payload rejected before reaching image processor.
- **F2 Boundary (5 tests)**:
  - B2.1: Empty or whitespace query returns guidance fallback without crashing.
  - B2.2: Extremely long query (>10,000 characters) safely truncated within context limit.
  - B2.3: Preserves mixed Unicode, Arabic, English, emoji, and special characters (`<>&"'`).
  - B2.4: All AI providers offline: backend returns structured rule-based safety guidance.
  - B2.5: Unintelligible or silent audio transcript returns clarification request.
- **F3 Boundary (5 tests)**:
  - B3.1: Rapid burst status requests execute without connection leaks.
  - B3.2: Security token check trims whitespace before comparison.
  - B3.3: Non-JSON request payload returns 400 Bad Request.
  - B3.4: Failed provider attempt records `last_error` in status statistics.
  - B3.5: Degraded provider state is reported cleanly in status response.
- **F4 Boundary (5 tests)**:
  - B4.1: `getApiUrl` with empty string returns base API root path.
  - B4.2: Multiple trailing slashes in base URL normalized.
  - B4.3: Preserves localhost with non-standard port (`3000`).
  - B4.4: Raw server IP address (`84.13.138.203:8000`) routed properly without hostname stripping.
  - B4.5: Defaults safely to relative `/safety/api` if `window.location` is undefined.
- **F5 Boundary (5 tests)**:
  - B5.1: 0ms immediate abort signal triggers clean cancellation without unhandled rejection.
  - B5.2: Sudden network drop classifies error as retryable network issue.
  - B5.3: HTTP 504 Gateway Timeout translated into user-friendly Arabic status.
  - B5.4: Server returning Nginx HTML error page does not throw unexpected JSON parse crash.
  - B5.5: Rapid consecutive failed requests do not flood retry queue.
- **F6 Boundary (5 tests)**:
  - B6.1: Cleans key string containing quotes, newlines, and trailing spaces.
  - B6.2: String with only commas and whitespace produces empty key list.
  - B6.3: All keys exhausted alert is surfaced clearly to admin.
  - B6.4: Strips accidental Arabic characters from API key input.
  - B6.5: Calling `saveAgentConfig` preserves existing non-specified settings.
- **F7 Boundary (5 tests)**:
  - B7.1: `NotAllowedError` correctly triggers file picker activation.
  - B7.2: `NotFoundError` gracefully switches to file upload.
  - B7.3: Reticle SVG maintains 400x400 center coordinate on 21:9 ultra-wide viewport.
  - B7.4: Stops all media stream tracks on modal close preventing camera lock.
  - B7.5: Unknown submode falls back to general reticle.
- **F8 Boundary (5 tests)**:
  - B8.1: Replacing selected image resets preview and preserves form metadata.
  - B8.2: Preserves extensive inspector observations without truncation in UI (500+ chars).
  - B8.3: Debounces double clicks on analyze button during processing.
  - B8.4: Closing inspection modal resets pending operations cleanly.
  - B8.5: Manages list of multiple attached photos with delete item support.
- **F9 Boundary (5 tests)**:
  - B9.1: Escapes HTML entities in violation title to prevent XSS injection.
  - B9.2: Handles partial AI output missing optional recommendation fields.
  - B9.3: Long Arabic titles formatted cleanly in description block.
  - B9.4: Consecutive violations generate unique serial IDs (`SV-2026-XXXX`).
  - B9.5: Cancelling violation modal does not corrupt existing violation records.
- **F10 Boundary (5 tests)**:
  - B10.1: Empty violations list renders clean placeholder without exception.
  - B10.2: Handles 500+ violation records in memory structure efficiently.
  - B10.3: Filtering by non-existent status returns empty array safely.
  - B10.4: Unreadable duty schedule image reports descriptive warning.
  - B10.5: Low confidence OCR triggers manual review flag.
- **F11 Boundary (5 tests)**:
  - B11.1: 320px viewport uses responsive grid (`cols-1`) without overflow.
  - B11.2: Reduced motion accessibility (`prefers-reduced-motion`) degrades animation duration safely.
  - B11.3: High contrast styling ensures visible borders.
  - B11.4: Status badge with lengthy Arabic text wraps without layout break.
  - B11.5: Mobile interactive button classes include adequate padding (`py-3, px-4`).

### Tier 3: Cross-Feature Interactions (11 pairwise integration tests)

- **T3.1 [F1 + F4]**: EXIF-oriented image uploaded through dynamic API routing URL.
- **T3.2 [F1 + F5]**: EXIF image processing under slow network with adaptive progress tracking.
- **T3.3 [F2 + F3]**: Text fallback under simulated model absence verified via status endpoint.
- **T3.4 [F3 + F6]**: Multi-key rotation updating provider health status counters in backend stats.
- **T3.5 [F4 + F6]**: Dynamic custom agent URL combined with multi-key configuration persistence.
- **T3.6 [F5 + F8]**: Inspector manual analysis trigger interacting with adaptive timeout & progress.
- **T3.7 [F7 + F8]**: Live camera capture with reticle transitioning to manual metadata form.
- **T3.8 [F7 + F11]**: Reticle overlay rendering with institutional KSUMC styling and pulse glow.
- **T3.9 [F8 + F9]**: Flow control submitting form to deduplicated violation modal inputs.
- **T3.10 [F9 + F10]**: Field violation save syncing into Quality portal inbox table.
- **T3.11 [F6 + F10]**: Duty schedule OCR failover using dynamically configured keys.

### Tier 4: Real-World Application Scenarios (5 end-to-end scenarios)

- **Scenario 1 [High]**: Field Inspector Capturing Obstructed Fire Exit on Mobile (F1, F5, F7, F8, F9, F11)
  - Full end-to-end lifecycle: Inspector opens field camera with exit reticle -> captures portrait image (EXIF tag 6) -> verifies image preview -> enters Building C, Floor 2, Room 204 with notes "صناديق كرتون تعيق المخرج" -> clicks analyze -> observes progress updates -> receives real analysis result ('غير مطابق', 'عالي') -> reviews deduplicated violation modal -> confirms and saves violation.
- **Scenario 2 [High]**: Inspector Analyzing Chemical Spill under Slow Network Conditions (F1, F3, F4, F5, F8)
  - Full end-to-end lifecycle: Inspector at medical warehouse captures chemical storage image -> API discovery resolves local agent server -> adaptive timeout accommodates 45s latency -> progress callbacks keep user informed without premature 15s timeout abort -> backend verifies payload -> returns structured analysis without fake heuristic fallback -> inspector reviews findings.
- **Scenario 3 [Medium]**: Admin Reviewing Safety Violation in Quality Portal Inbox (F9, F10, F11)
  - Full end-to-end lifecycle: Safety violation generated from field inspection is received in Quality portal -> renders in unified inbox table with institutional styling -> admin filters by 'محرجة' / 'عالي' -> clicks to view violation details including captured reticle evidence -> updates status to 'قيد المعالجة' with supervisor note -> audit trail persists change.
- **Scenario 4 [High]**: Offline / Cloud-Starved Mode with Transparent Notice (No Fake Heuristic) (F3, F5, F6)
  - Full end-to-end lifecycle: Cloud keys expire or network is completely disconnected -> inspector attempts vision analysis -> client tries primary endpoints -> on timeout/failure, instead of fabricating fake violations via `heuristicVisualAnalysis()`, system presents honest Arabic error notification -> prompts inspector to save offline draft or retry when connected.
- **Scenario 5 [Medium]**: Quality Officer Uploading Monthly Duty Schedule for OCR (F6, F10)
  - Full end-to-end lifecycle: Quality officer uploads November 2026 duty roster image for Shift 1 -> primary cloud OCR key fails (simulated 401) -> OCR failover triggers secondary key / fallback parser -> successfully extracts 30 scheduled inspection rounds with supervisor name and building assignments -> populates quality duty schedule table.

---

## 2. Verification Command & Output

Run the complete E2E test suite using Node.js standard test runner:

```bash
node --test tests/e2e_oracle_vision.test.js
```

### Execution Summary
```
ℹ tests 150
ℹ suites 0
ℹ pass 150
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 230
```

**Result**: 150/150 tests passing (100% Passed, 0 Failed).

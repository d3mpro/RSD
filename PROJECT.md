# Project: Oracle Vision Agent (الراصد البصري الذكي) Diagnostic & Remediation

## Architecture
The KSUMC Oracle Vision Agent (الراصد البصري) architecture consists of:
1. **Frontend Portals**:
   - `field.html`: Mobile-first field inspection portal for safety officers (fire safety, evacuation routes, chemical storage, electrical rooms, doors, cylinders).
   - `quality.html`: Administrative and quality oversight portal for review, approvals, reporting, and duty schedule OCR.
   - `assets/js/ksu-ai-client.js`: Unified client-side SDK managing AI provider fallback chain, image capture, compression, audio structuring, and inspection modals.
   - `assets/js/vision-reticle-helper.js`: Visual reticle and target framing assistant.
2. **Backend Vision & AI Services (`oracle-vision-agent/`)**:
   - `agent_server.py`: FastAPI server handling multimodal vision analysis (`/safety/api/ai/analyze-inspection-image`), safety advisor (`/safety/api/ai/ask-safety-assistant`), voice structuring (`/safety/api/ai/structure-voice-record`), and status (`/safety/api/ai/status`).
   - `agent_server.js`: Node.js server counterpart providing local endpoint tests and provider routing.
   - `firebase_bridge.py`: Background worker bridging Firebase Firestore jobs to the local inference engine.
   - Local Ollama AI Runtime: Local inference engine running `qwen2.5vl:3b`.
3. **Data & Integration Layer**:
   - Firebase Firestore for violation records, task dispatches, and activity feeds.
   - External Multi-modal APIs (GitHub Models, Qwen OpenRouter/DashScope, Google Gemini) as Tier 1 cloud providers, failing over to local Ollama.

---

## Root Causes Identified (Survey Phase Summary)
1. **Invalid / Corrupted Cloud Keys**: The hardcoded Gemini key (`AQ.Ab8RN6K...`) returns HTTP 401 across all portals, and the live production server has zero cloud vision keys configured.
2. **CPU Inference Bottleneck vs Premature Client Timeout**: Ollama on CPU takes ~120-130s per image, while the client has a 15s (Firebase) / 35s timeout. 100% of client requests abort due to timeout.
3. **Deceptive Client Heuristic Fallback**: On timeout, `ksu-ai-client.js` executes `heuristicVisualAnalysis()`, generating static pre-canned violations without reading the image.
4. **Camera & Reticle Disconnect**: No live stream (`getUserMedia`); clicking the camera opens native device file capture, hiding the SVG reticle.
5. **Premature Auto-Analysis Trigger**: A 350ms timeout fires immediately upon photo selection, sending default/empty metadata before the user can select location or add notes.
6. **Double Image Compression & Missing EXIF Transpose**: Images are compressed twice and rotated 90 degrees sideways without EXIF orientation handling.
7. **Broken Text & Voice Endpoints**: Text endpoints fail (503) because `qwen2.5:3b` was not installed, while `qwen2.5vl:3b` is installed and can handle text.
8. **UI/UX & Integration Disconnects**: Duplicate violation modal fields in `field.html`, missing scan keyframe animation, violations hidden from `quality.html` inbox, duty schedule OCR hard-wired to broken key.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | EXIF Orientation & Preprocessing | Correct smartphone image orientation (`exif_transpose`) and clean single-pass resize without distortion | M1 | Backend Survey |
| 2 | Multimodal & Text Model Fallback | Support `qwen2.5vl:3b` as text model fallback when `qwen2.5:3b` is absent; graceful fallback in `agent_server.py` | M1 | Backend Survey |
| 3 | Backend Verification & Error Propagation | Proper status reporting, meaningful HTTP errors, and test harness execution | M1 | Backend Survey |
| 4 | Client API Routing & Endpoint Discovery | Fix `getApiUrl` dead code, preserve localhost/remote URLs, prevent mixed content | M2 | Integration Survey |
| 5 | Adaptive Timeout & Transparent Feedback | Replace 15s hard timeout cliff with adaptive timeout, progress indicators, and eliminate deceptive fake heuristic fallback | M2 | Frontend & Integration Survey |
| 6 | Cloud Key Management & Validation | Sanitize API keys, eliminate HTTP 401 hardcoded key, support dynamic admin key entry | M2 | Integration Survey |
| 7 | Live Camera Stream & Reticle Overlay | Implement `navigator.mediaDevices.getUserMedia` live camera feed with SVG reticle overlay, keeping file-picker as fallback | M3 | Frontend Survey |
| 8 | Inspection Flow Control | Eliminate the 350ms auto-trigger cliff; allow inspectors to verify photo, select location, and trigger analysis explicitly | M3 | Frontend Survey |
| 9 | Field Violation Modal Deduplication | Resolve duplicate `inp-violation-*` and `inp-sv-*` fields in `field.html` to prevent data loss | M3 | Frontend Survey |
| 10 | Quality Portal Integration & Duty OCR | Include safety violations in `quality.html` inbox; include `vision-reticle-helper.js`; add OCR failover | M3 | Frontend Survey |
| 11 | Impeccable UI/UX & Arabic Styling | Add `@keyframes scan`, ensure high contrast, clean typography, remove generic purple AI gradients | M3 | Frontend Survey & User Rules |
| 12 | End-to-End Verification & Adversarial Hardening | Comprehensive test suite (Tiers 1-4) and adversarial verification (Tier 5) | M4 | System Requirement |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Vision Engine & API Resilience | `oracle-vision-agent/agent_server.py`, `agent_server.js`, EXIF handling, text model failover, status endpoint resilience | none | PLANNED |
| M2 | Frontend AI Client & Communication Protocol | `assets/js/ksu-ai-client.js`, API routing, adaptive timeout, transparent status alerts, removal of fake heuristic results | M1 | PLANNED |
| M3 | Field & Quality Portals UI/UX Overhaul | `field.html`, `quality.html`, `vision-reticle-helper.js`, live camera, removal of 350ms trigger, deduplicated modals, duty OCR failover | M2 | PLANNED |
| M4 | E2E Testing & Final Acceptance Verification | Opaque-box test suite (Tiers 1-4) + adversarial coverage hardening (Tier 5) | M1, M2, M3 | PLANNED |

---

## Interface Contracts
### Client ↔ Backend (`/safety/api/ai/analyze-inspection-image`)
- **Request**:
  - `image_base64`: Clean JPEG/PNG base64 string (EXIF orientation normalized).
  - `checklist_type`: e.g. `'fire_extinguisher'`, `'evacuation_route'`, `'chemical_storage'`, etc.
  - `notes`: Inspector observations.
  - `building`, `floor`, `room`: Location metadata.
- **Response**:
  - `success`: boolean
  - `status`: `'مطابق'` | `'غير مطابق'` | `'تحذير'` | `'غير محدد'`
  - `risk`: `'منخفض'` | `'متوسط'` | `'عالي'` | `'حرج'`
  - `observations`: string[]
  - `recommendations`: string[]
  - `raw_text`: string
  - `provider_used`: string
  - `processing_time_sec`: number

### Client ↔ Backend (`/safety/api/ai/ask-safety-assistant` & `/safety/api/ai/structure-voice-record`)
- **Text Queries**:
  - When text model (`qwen2.5:3b`) is not installed, backend must dynamically fallback to `qwen2.5vl:3b` or rulebase without throwing 503 error.

---

## Code Layout
- `oracle-vision-agent/agent_server.py`: Python FastAPI backend server.
- `oracle-vision-agent/agent_server.js`: Node.js backend server.
- `assets/js/ksu-ai-client.js`: Core frontend AI client SDK.
- `assets/js/vision-reticle-helper.js`: UI reticle framing helper.
- `field.html`: Field inspector interface.
- `quality.html`: Quality and admin oversight portal.
- `tests/`: Automated unit and integration test suite.

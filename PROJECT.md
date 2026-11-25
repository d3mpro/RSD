# Project: RSD API Key Vault & Smart Visual Observer Recovery

## Architecture
- **Application type**: Zero-build static multi-portal HTML/JS/CSS PWA (`index.html`, `field.html`, `api.html`, `admin.html`, `head.html`, `quality.html`, `dashboard.html`, `profile.html`) served via Firebase Hosting (`https://rsd-ksu.web.app`).
- **Auth & Cloud Sync**: Client roster (`assets/js/auth-guard.js`, 22 accounts + `demo`) paired with Firebase Email/Password Auth + Custom Claims (already provisioned in GH Actions run `44999084360`: `role` in `developer`, `head`, `quality`, `shift_supervisor`, `field_inspector`) and Firebase RTDB (`https://rsd-ksu-default-rtdb.firebaseio.com`, enforced by `database.rules.json`).
- **AI Vision Pipeline**: Client-side Gemini REST router (`assets/js/ksu-ai-client.js`, Quota-Shield) with `localStorage` + authenticated Firebase RTDB cloud key sync (`system_config/ai_keys`), image collage/compression, model & key rotation, and optional OpenRouter Qwen2.5-VL fallback. (Future Paid-Tier roadmap: proxy via Firebase Cloud Function.)
- **Demo Mode Policy**: `demo/demo` may temporarily run Smart Visual Observer using same-browser `localStorage` or demo `sessionStorage` keys (plus an explicit optional demo simulation trigger when 0 keys exist), while keeping `fetchCloudKeysSilently()` at 0 RTDB fetches and strictly isolating all drafts/violations/media from `localStorage` and Firebase RTDB.
- **Caching & Delivery**: `sw.js` PWA Service Worker + `firebase.json` rewrites & cache headers; pushing to `master` auto-deploys Hosting and `database.rules.json` via `.github/workflows/firebase-hosting-deploy.yml`.
- **Verification**: Node.js `node --check` + `node --test` suites + `tools/verify_all_guided_vision.js` + `tools/test_standalone_dispatch.js`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `AQ.*` Key Support & Key Sanitization | Remove broad `AQ.Ab8RN6K` prefix blocklist in `api.html:447` & `ksu-ai-client.js:187,6049` (reject only exact leaked legacy key); split whitespace/comma/newline delimiters; strip iOS invisible Unicode markers (`\u200B-\u200F`, `\u202A-\u202E`, `\u2066-\u2069`, `\uFEFF`, `\u00A0`); `getGeminiKeys()` prefers fresh storage over boot `this.geminiApiKey`. | M1 | Survey 2, Survey 3, Explorer 5 |
| 2 | Vault Firebase Auth & Honest Cloud Sync | Integrate Firebase SDK + `PROD_FIREBASE_CONFIG` + `DEV`/`admin` Auth sign-in in `api.html`; attach `?auth=<idToken>` on `GET`/`PUT` `system_config/ai_keys.json` & hashed `admin_auth`; never show green cloud-sync success toast on HTTP `401`/`403`. | M1 | Survey 1, Survey 2, Survey 3, Explorer 4, User Q2 |
| 3 | RTDB Rules, Auth Race & Client Key Hydration | Split `system_config/ai_keys` `.read` (`auth != null && auth.token.role in [head,admin,developer,executive,quality,shift_supervisor,field_inspector]`) & `admin_auth` (`admin|developer` only); fix `index.html` async SDK load & `Q1` email (`q1@rsd-ksu.local` in `auth-guard.js:201`); fix `ksu-firebase-realtime.js:198` `signInAnonymously()` IndexedDB restoration race; attach `?auth=<idToken>` in `fetchCloudKeysSilently()` & `parseDutyScheduleImage()`. | M1 | Survey 1–3, Explorer 4, Explorer 6, User Q2 |
| 4 | Key Health Verifier Diagnostics | Upgrade `api.html` `verifyAllGeminiKeys()` to validate via `GET /v1beta/models` (zero quota cost) + generation check across active models, clear cooldowns on healthy keys, warn when keys are tested but not yet saved centrally, and surface masked Google `error.status`/`error.message`. | M1 | Survey 1, Survey 2, Survey 3, Explorer 5 |
| 5 | Gemini 2026 Models & Config | Update `MODELS_HIERARCHY` & migrate `callGeminiCBAHIAudit` off `gemini-2.5-flash` / restricted `2.5-flash-lite` onto active 2026 Free-tier multimodal models (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-4-hydrogen`); omit deprecated `temperature` on 3.5+/4; set valid `thinkingLevel` (`MINIMAL` on lite/3.6, `LOW` on 3.8/4); raise `maxOutputTokens` to `2048`. | M1 | Survey 1, Survey 2, Survey 3, Explorer 5 |
| 6 | Vision Resilience, Parsing & Error UX | Extract all non-thought text parts (`!p.thought`); raise vision timeout to `25000ms` and do NOT abort remaining keys/models on single `AbortError`; parse JSON `RetryInfo.retryDelay` & `QuotaFailure` + handle `400`/`500`/`503`; make `#ksu-ai-vision-modal` readiness badge dynamic; surface distinct actionable diagnostic codes/messages instead of generic `wifi_off`. | M1 | Survey 1, Survey 2, Survey 3, Explorer 5 |
| 7 | `demo/demo` Vision & Isolation Hardening | Allow `demo/demo` to run Visual Observer via `sessionStorage['demo_ksumc_gemini_api_key']` or same-browser `localStorage` keys (plus explicit optional demo simulation button when 0 keys exist) with 0 RTDB fetches; fix 4 demo isolation leaks in `ksu-ai-client.js` (`approveAndUploadVisualViolation`, `renderVisionInspectionError`, `dispatchViaFirebaseBridge`, `broadcastVisualHazardAlert`). | M1 | Explorer 6, User Q3 |
| 8 | PWA & Hosting Cache-Busting | Bump `sw.js` `CACHE_NAME` and `?v=` on updated scripts (`ksu-ai-client.js`, `ksu-firebase-realtime.js`, `auth-guard.js`) across HTML portals; add `no-cache` headers in `firebase.json` for extensionless clean routes (`/api`, `/field`, `/admin`, `/head`, `/quality`, `/dashboard`, `/profile`, `/developer`). | M1 | Survey 1, Survey 2, Survey 3, Explorer 5 |
| 9 | Test Alignment & `oracle-vision-agent/` Cleanup | Align coupled tests (`test_api_vault_and_silent_fallback.test.js`, `test_m2_frontend_ai_client.test.js`, `test_payload_slimming_and_failover.js`, `test_demo_account_isolation.test.js`), add regression tests for all M1 fixes, clean `oracle-vision-agent/` test/runtime remnants (`verify_all_guided_vision.js`, `test_adversarial_m1_backend.js`, `test_tier5_adversarial_hardening.test.js`, `e2e_oracle_vision.test.js`, `rsdsafety.online` fallbacks in `ksu-cloud-sync.js`/`quality.html`), and push to `master` after Verification Wave + Forensic Audit pass. | M1 | Explorer 4, Explorer 6, User Q3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 0 | Prior Redesign (Historical) | Smart Visual Observer Modal Button Removal & Redesign | none | DONE |
| 1 | M1: Vault Sync, `AQ.*` Keys, Auth/Demo, Gemini 2026 Resilience, Caching & Deployment | Single-cycle (2B) implementation, parallel Verification Wave (2 Reviewers + 2 Challengers + Forensic Auditor), and push to `master` | `/grill-me` complete | IN_PROGRESS |

## Interface Contracts
### Preserved Prior Redesign Contracts (`assets/js/ksu-ai-client.js` & `tools/test_standalone_dispatch.js`)
- Preserve existing `renderVisionResults` action bar buttons (`applyVisionToActiveRound`, `approveAndUploadVisualViolation`, `broadcastVisualHazardAlert`, `printVisualInspectionCard`, `openVisualInspectionCardWindow`) and footer `إغلاق` handler.
- Preserve `window.openViolationFromAI` and `window.startRoundFromAI` helper functions.
- Preserve `dispatchViaFirebaseBridge` signature in `ksu-ai-client.js` as referenced by `ksu-cloud-sync.js:556` and `tests/test_cloud_archive_hub.js` (while blocking writes when `isDemoUser()`).
- Preserve `demo/demo` isolation (`fetchCloudKeysSilently()` makes 0 RTDB fetches in demo mode, `signInAnonymously()` skipped, no `localStorage`/`IndexedDB`/`RTDB` production writes).

### Vault <-> RTDB <-> Client Contract
- `api.html` loads Firebase SDK (`app`, `auth`), restores or prompts `admin`/`developer` Firebase Auth login, attaches `?auth=<idToken>` on RTDB reads/writes (`system_config/ai_keys.json`, hashed `system_config/admin_auth.json`), and never shows a green cloud-sync confirmation on `!resp.ok`.
- `database.rules.json` keeps `system_config['.read']` containing `"auth.token.role == 'admin'"` for backwards compatibility while allowing authenticated staff roles (`head`, `admin`, `developer`, `executive`, `quality`, `shift_supervisor`, `field_inspector`) to read `system_config/ai_keys` only, and restricting `admin_auth` and all `system_config` writes to `admin`/`developer`.
- `fetchCloudKeysSilently()` attaches `?auth=<idToken>` once Firebase Auth finishes restoring/signing in (non-anonymous), and `ksu-firebase-realtime.js` waits for initial `onAuthStateChanged` before any anonymous fallback.
- `getSanitizedKeys()` / `parseInputKeys()` accept modern Google AI Studio `AQ.*` keys and legacy `AIza*` keys while rejecting only the exact previously leaked key (not the shared `AQ.Ab8RN6K` prefix).

## Code Layout
- `api.html` — Centralized AI Key Vault (`/api`)
- `index.html`, `assets/js/auth-guard.js`, `assets/js/ksu-firebase-realtime.js` — Login, 22-user roster, Firebase Auth SDK bootstrap & RTDB sync
- `assets/js/ksu-ai-client.js` — Quota-Shield Gemini/Qwen client, Smart Visual Observer modal, CBAHI audit, voice & schedule OCR
- `assets/js/ksu-cloud-sync.js`, `quality.html`, `field.html`, `head.html`, `dashboard.html` — Portal shells, `?v=` cache busters, `rsdsafety.online` fallback cleanup
- `database.rules.json`, `firebase.json`, `sw.js` — RTDB rules, Hosting headers/rewrites, PWA Service Worker cache
- `tests/*.js`, `tools/*.js` — Native `node --test` suites & guided-vision verification scripts

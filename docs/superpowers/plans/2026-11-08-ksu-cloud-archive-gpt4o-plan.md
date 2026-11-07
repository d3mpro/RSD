# KSU Cloud Archive Hub (1TB) & GPT-4o Vision Auto-Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic `GPT-4o` (`GitHub Models`) vision failover behind `Gemini`, eliminate duplicate/bloated base64 HTML storage in `Firebase RTDB` and `localStorage`, and provide a role-gated KSU 1TB Cloud Archive Hub (`OneDrive` `ksusa-my.sharepoint.com` & `SharePoint` `ksusa.sharepoint.com/sites/safty`) for desktop and mobile without altering any existing portal UI.

**Architecture:** Keep all existing HTML portals unchanged (`index.html`, `field.html`, `dashboard.html`, `quality.html`, `head.html`, `admin.html`). Slim new `safety_violations` records in `ksu-ai-client.js` and `ksu-firebase-realtime.js` to `<35KB` (`480px`) thumbnails with dynamic card HTML reconstruction while vaulting `1280px` originals in browser `IndexedDB` (`KSUMediaVault`) and the Vision Agent (`agent_server.js` / `agent_server.py`). Upgrade `ksu-cloud-sync.js` into a backward-compatible KSU 1TB Archive Hub launched via a supervisor/admin-only button in `ksu-nav-component.js`.

**Tech Stack:** Vanilla JavaScript (ES6+, `IndexedDB`, `File System Access API`, `Web Share API`), Node.js v26 (`http`, `node:test`, `assert`), Python FastAPI (`httpx`), Firebase Realtime Database.

**Spec:** `docs/superpowers/specs/2026-11-07-ksu-onedrive-gpt4o-vision-design.md`

## Global Constraints

- Zero visual or workflow changes to existing portals (`index.html`, `field.html`, `dashboard.html`, `quality.html`, `head.html`, `admin.html`), especially no technical/backend settings inside the field inspector modal (`openAIVisionInspectionModal`).
- Never commit `github_pat_...` tokens or SMTP passwords in any git-tracked file or write them to readable `Firebase RTDB` nodes; store secrets strictly in gitignored `oracle-vision-agent/.env`.
- Vision inspection priority: `Google Gemini 2.5 Flash` runs first (rotating all configured Gemini keys); on `429`/failure, automatically fail over to Vision Agent / Firebase Bridge running `github_models` (`openai/gpt-4o` -> `openai/gpt-4o-mini`) -> `qwen_api` -> `ollama_local`.
- Backward compatibility: Legacy `safety_violations` containing `cardInnerHtml`/`fullPageHtml` and all `window.ksuSyncEngine` callers in `assets/js/app.js` must continue working without error.
- Legacy Firebase RTDB slimming must refuse to downscale/strip any record whose `cardId` has not yet been recorded as archived to KSU Cloud.

## Review Focus

- Malicious or malformed `cardId` (e.g., `../../.env` or `CARD/../../secret`) passed to `/safety/api/archive/dispatch` or `/safety/api/archive/media/:cardId` must be sanitized or rejected with `400` so path traversal outside `archive_vault/` is impossible.
- Multi-key `Gemini` pool where key #1 returns `429 Quota Exceeded` must rotate through remaining Gemini keys and, when all fail, immediately fail over to the Vision Agent (`GPT-4o`) within a single `analyzeInspectionImage()` call without throwing to the inspector.
- CSV register export containing Arabic text with embedded commas, double quotes, CR/LF newlines, or leading formula characters (`=`, `+`, `-`, `@`) must produce valid RFC-4180 UTF-8 BOM CSV cells safe for Excel Online in `ksusa-my.sharepoint.com`.
- Legacy Firebase slimming invoked before archiving (or partially archived list) must leave unarchived records completely untouched while slimming only verified archived `cardId`s.
- Field inspector (`roleCategory: 'field_inspector'` or `activeKey === 'field'`) rendering `KSUNav` must never see the `#ksu-nav-cloud-archive-btn` button, whereas `admin`, `head`, `quality`, and `developer` roles do see it.

---

### Task 1: Vision Agent `GPT-4o` (`github_models`) Auto-Failover & Cross-Device Archive Vault

**Files:**
- Modify: `.gitignore`
- Modify: `oracle-vision-agent/.env.example`
- Modify: `oracle-vision-agent/.env` (gitignored local runtime config only — never staged)
- Modify: `oracle-vision-agent/agent_server.js`
- Modify: `oracle-vision-agent/agent_server.py`
- Create: `oracle-vision-agent/test_archive_and_gpt4o.js`

**Interfaces:**
- Produces (HTTP API on both `agent_server.js` and `agent_server.py`):
  - Provider `github_models` in `AI_PROVIDER_PRIORITY` (`github_models,qwen_api,ollama_local,gemini_api`) calling `GITHUB_MODELS_BASE_URL` (`https://models.github.ai/inference/chat/completions`) with `GITHUB_VISION_MODEL` (`openai/gpt-4o`) and automatic `429` fallback to `GITHUB_FALLBACK_VISION_MODEL` (`openai/gpt-4o-mini`).
  - `POST /safety/api/archive/dispatch` and alias `POST /safety/api/ai/archive-dispatch` (requires header `X-KSUMC-KEY` or `x-ksumc-token` matching `KSUMC_SECURITY_TOKEN`): accepts `{ cardId, date, facility, location, severity, summary, htmlReport, images, metadata }`, sanitizes `cardId` to `[A-Za-z0-9_-]{1,80}`, writes `archive_vault/YYYY-MM/<safeCardId>.json` + `<safeCardId>_0.jpg` + `<safeCardId>.html`, optionally sends `[RSD-ARCHIVE]` email when `ARCHIVE_SMTP_HOST` is set, returns `{ success: true, cardId: safeCardId, storedImages: number, emailDispatched: boolean }`.
  - `GET /safety/api/archive/media/:cardId` and `POST /safety/api/ai/archive-media` (`{ cardId }`, requires `X-KSUMC-KEY` or `x-ksumc-token`): returns `{ success: true, cardId: safeCardId, images: string[], metadata: object }` or `404` when absent, `400` on invalid/traversal `cardId`, `403` on missing/wrong security token.
- Produces (JS exports from `oracle-vision-agent/agent_server.js` when `require.main !== module`):
  - `{ createAgentServer, callGithubModelsVision, sanitizeArchiveCardId, saveArchiveBundle, loadArchiveMedia, CONFIG, STATE }`

- [ ] **Step 1: Write failing tests in `oracle-vision-agent/test_archive_and_gpt4o.js`**

Write `node:test` tests exercising:
1. `callGithubModelsVision` calls `openai/gpt-4o` first and automatically retries with `openai/gpt-4o-mini` when `gpt-4o` returns HTTP `429`.
2. `POST /safety/api/archive/dispatch` rejects missing `X-KSUMC-KEY` with `403`, rejects path-traversal `cardId: "../../.env"` with `400`, stores valid `1280px` data URL images on disk, and `GET /safety/api/archive/media/:cardId` + `POST /safety/api/ai/archive-media` return the exact stored `images` array.
3. No git-tracked file contains `github_pat_`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle-vision-agent/test_archive_and_gpt4o.js`
Expected: FAIL (`createAgentServer` / `callGithubModelsVision` not exported yet).

- [ ] **Step 3: Implement `github_models` provider and Archive Vault in `agent_server.js`, `agent_server.py`, `.env.example`, `.gitignore`, and local `.env`**

- Add `oracle-vision-agent/archive_vault/` and `oracle-vision-agent/.env` explicitly to `.gitignore`.
- Document `GITHUB_MODELS_BASE_URL`, `GITHUB_MODELS_KEYS`, `GITHUB_VISION_MODEL=openai/gpt-4o`, `GITHUB_FALLBACK_VISION_MODEL=openai/gpt-4o-mini`, `ARCHIVE_SMTP_HOST`, `ARCHIVE_SMTP_PORT`, `ARCHIVE_SMTP_USER`, `ARCHIVE_SMTP_PASS`, `ARCHIVE_TARGET_EMAIL` in `oracle-vision-agent/.env.example` (blank secrets).
- Populate gitignored `oracle-vision-agent/.env` with `AI_PROVIDER_PRIORITY=github_models,qwen_api,ollama_local,gemini_api` and the user's `GITHUB_MODELS_KEYS` token; verify `git check-ignore oracle-vision-agent/.env` succeeds.
- Implement `callGithubModelsVision`, `sanitizeArchiveCardId`, `saveArchiveBundle`, `loadArchiveMedia`, and the `/safety/api/archive/*` + `/safety/api/ai/archive-*` endpoints in both `oracle-vision-agent/agent_server.js` (guard `server.listen` behind `if (require.main === module)`) and `oracle-vision-agent/agent_server.py` (including optional Python `smtplib` `[RSD-ARCHIVE]` MIME attachment sender when `ARCHIVE_SMTP_HOST` is configured).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test oracle-vision-agent/test_archive_and_gpt4o.js`
Expected: PASS (all subtests passing, 0 failures).

- [ ] **Step 5: Commit Task 1**

Stage and commit only Task 1 files (`git add .gitignore oracle-vision-agent/.env.example oracle-vision-agent/agent_server.js oracle-vision-agent/agent_server.py oracle-vision-agent/test_archive_and_gpt4o.js`), verifying `git diff --cached` contains zero `github_pat_` strings before committing.

---

### Task 2: Payload Slimming, Dynamic Card Reconstruction & Client `GPT-4o` Failover

**Files:**
- Modify: `assets/js/ksu-ai-client.js`
- Modify: `assets/js/ksu-firebase-realtime.js`
- Modify: `assets/js/app.js`
- Create: `tests/test_payload_slimming_and_failover.js`

**Interfaces:**
- Consumes: `POST /safety/api/archive/dispatch` and `/safety/api/ai/analyze-inspection-image` from Task 1.
- Produces on `window`:
  - `window.KSUMediaVault`: `{ saveMedia(recordId, imagesArray, meta), getMedia(recordId), markArchived(recordId), listAllKeys() }` backed by `IndexedDB` (`ksumc_media_vault` / store `media_files`) with automatic in-memory `Map` fallback when `indexedDB` is unavailable.
  - `window.buildCardHtmlFromViolation(v, preferredImg)` and `window.buildFullPageHtmlFromViolation(v, preferredImg)`: returns legacy `v.cardInnerHtml` / `v.fullPageHtml` if present, otherwise dynamically builds via `buildVisualInspectionCardHtml` using `preferredImg || v.photo`.
  - Slimmed `approveAndUploadVisualViolation()`: saves `1280px` images into `KSUMediaVault` + fire-and-forget dispatch to `/safety/api/archive/dispatch`, stores `480px` (`quality 0.6`) thumbnail in `newViol.photo` / `newViol.images`, and omits `cardInnerHtml` & `fullPageHtml` properties from `newViol`.
  - `KSUFirebaseRealtimeSync.prototype.normalizeCloudPayload(nodeName, rawItem)` in `assets/js/ksu-firebase-realtime.js`: strips `cardInnerHtml` and `fullPageHtml` on `safety_violations` items whenever `visionData` or `hasVisualInspectionCard` is truthy.
  - Multi-key `callGeminiDirectly()` loop in `assets/js/ksu-ai-client.js`: tries every key in `geminiApiKey` pool on `429`/network error before throwing so `analyzeInspectionImage()` seamlessly fails over to Vision Agent (`GPT-4o`) / Firebase Bridge.

- [ ] **Step 1: Write failing tests in `tests/test_payload_slimming_and_failover.js`**

Write `node:test` tests (using Node `vm` / minimal DOM & `localStorage` shims) verifying:
1. `callGeminiDirectly` rotates across all keys on `429` and, when all Gemini keys return `429`, `analyzeInspectionImage` seamlessly fails over to Vision Agent `/ai/analyze-inspection-image` (`GPT-4o`) and returns its parsed violation result.
2. `approveAndUploadVisualViolation` omits `cardInnerHtml` and `fullPageHtml`, stores the original high-res image in `window.KSUMediaVault`, and `window.buildCardHtmlFromViolation(savedViol)` + `window.buildFullPageHtmlFromViolation(savedViol)` reconstruct valid printable HTML containing the card ID and violation summary.
3. `normalizeCloudPayload('safety_violations', bloatedItem)` removes `cardInnerHtml` and `fullPageHtml` when `visionData` is present, while preserving legacy items that lack `visionData`.
4. `printSafetyViolation(id)` in `assets/js/app.js` prints visual inspection cards even when `v.cardInnerHtml` is absent (`v.hasVisualInspectionCard === true`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/test_payload_slimming_and_failover.js`
Expected: FAIL (`KSUMediaVault` / `buildFullPageHtmlFromViolation` missing, `cardInnerHtml` still present on `newViol`).

- [ ] **Step 3: Implement `KSUMediaVault`, dynamic card builders, `Gemini -> GPT-4o` failover, and `normalizeCloudPayload` slimming**

- Add `KSUMediaVault` and `buildFullPageHtmlFromViolation` in `assets/js/ksu-ai-client.js`; update `buildCardHtmlFromViolation(v, preferredImg)` to accept optional `preferredImg`.
- Update `callGeminiDirectly` in `assets/js/ksu-ai-client.js` to iterate through all unique Gemini keys on `429`/5xx before throwing, and reduce dead wait when failing over to the Vision Agent / Firebase Bridge.
- Update `approveAndUploadVisualViolation` in `assets/js/ksu-ai-client.js` to compress `photo`/`images` to `480px` (`0.6` quality) when `compressImageForAI` is available, store original `visionImagesList` in `KSUMediaVault`, fire-and-forget `POST /safety/api/archive/dispatch` (with `X-KSUMC-KEY`), and omit `cardInnerHtml` / `fullPageHtml`.
- Update `normalizeCloudPayload` in `assets/js/ksu-firebase-realtime.js` to delete `item.cardInnerHtml` and `item.fullPageHtml` for `nodeName === 'safety_violations'` when `item.visionData || item.hasVisualInspectionCard`.
- Update `printSafetyViolation` in `assets/js/app.js` (`~16708`) to resolve `const visualCardHtml = v.cardInnerHtml || ((v.hasVisualInspectionCard || v.visionData) && typeof window.buildCardHtmlFromViolation === 'function' ? window.buildCardHtmlFromViolation(v) : '');`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/test_payload_slimming_and_failover.js`
Expected: PASS (all subtests passing, 0 failures).

---

### Task 3: KSU 1TB Cloud Archive Hub (`OneDrive` & `SharePoint sites/safty`) for Desktop & Mobile

**Files:**
- Modify: `assets/js/ksu-cloud-sync.js`
- Create: `tests/test_cloud_archive_hub.js`

**Interfaces:**
- Consumes: `window.KSUMediaVault`, `window.buildCardHtmlFromViolation`, `window.buildFullPageHtmlFromViolation` from Task 2; `GET /safety/api/archive/media/:cardId` and `POST /safety/api/ai/archive-media` from Task 1.
- Produces on `window`:
  - `window.ksuSyncEngine` (instance of upgraded `KSUCloudSyncEngine` preserving `login`, `logout`, `updateUI`, `onDataChanged`, `openSyncModal`, `closeSyncModal`, `exportAssetsCSV`, `triggerImportFile`, `getUnifiedDatabasePackage`, plus new methods):
    - `escapeCsvCell(val)` and `buildArchiveCsvRegisters()` -> `{ violationsCsv, roundsCsv, cbahiCsv, shiftReportsCsv, assetsCsv }` (all prefixed with `\uFEFF` UTF-8 BOM, escaping quotes/commas/newlines and neutralizing leading `=`, `+`, `-`, `@`).
    - `resolveBestViolationImages(viol)` -> resolves `1280px` images in order: `KSUMediaVault.getMedia(id)` -> Vision Agent `/safety/api/archive/media/:id` (or Firebase Bridge `archive-media`) -> `[viol.photo]`.
    - `syncToDirectoryHandle(dirHandle, options)` -> writes `KSUMC_RSD_Safety_Archive/YYYY-MM/` structure (`01_صور_ومحاضر_الراصد_البصري/`, `02_سجلات_إكسل_وشواهد_سباهي/`, `03_النسخ_الاحتياطي_الشامل/`), records archived `cardId`s in `localStorage['ksumc_archived_card_ids']`, returns `{ archivedViolations, filesWritten, monthFolder }`.
    - `shareOrDownloadMobileBundle()` -> uses `navigator.share({ files })` when `navigator.canShare` supports files, otherwise triggers clean browser downloads, and marks included `cardId`s as archived once completed.
    - `slimLegacyCloudViolations()` -> checks `ksumc_archived_card_ids`; strips `cardInnerHtml`/`fullPageHtml` (where `visionData` exists) and downscales `photo` **only** on `safety_violations` records whose `id`/`cardId` is already in `ksumc_archived_card_ids`, leaving unarchived records untouched, and syncs updated records via `window.ksuFirebaseSync` if connected.
    - Self-injected modal `#ksu-onedrive-archive-modal` with direct buttons to **`https://ksusa.sharepoint.com/sites/safty` (موقع قسم السلامة الرسمي)** and **`https://ksusa-my.sharepoint.com` (مستودع OneDrive الجامعي 1TB)**, shared folder link saver, Desktop Folder Sync button, Mobile OneDrive Share button, Safe Firebase Slimming button, and 3-step `Power Automate` guide.

- [ ] **Step 1: Write failing tests in `tests/test_cloud_archive_hub.js`**

Write `node:test` tests verifying:
1. `escapeCsvCell` and `buildArchiveCsvRegisters` prepend `\uFEFF`, properly quote Arabic strings containing `,`, `"`, `\n`, and prefix formula-injection strings (`=CMD()`) safely.
2. `getUnifiedDatabasePackage` includes all 13 collections (`rounds`, `safetyViolations`, `smokingViolations`, `capa`, `doors`, `permits`, `alarms`, `shiftIncidents`, `safetyDeptReports`, `complianceRegistry`, `users`, `assets`, `qualitySchedule`).
3. `syncToDirectoryHandle(mockDirHandle)` fetches `1280px` image from mocked Vision Agent `/safety/api/archive/media/:cardId` when local `KSUMediaVault` misses, writes `.jpg` + `_محضر_رصد.html` + 5 CSVs + CBAHI `.html` + full `.json` backup into the exact spec folder hierarchy, and records `cardId` in `ksumc_archived_card_ids`.
4. `slimLegacyCloudViolations()` refuses to slim unarchived records and slims only records present in `ksumc_archived_card_ids`.
5. Legacy `app.js` calls (`ksuSyncEngine.onDataChanged()`, `ksuSyncEngine.updateUI()`, `ksuSyncEngine.openSyncModal()`) succeed without throwing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/test_cloud_archive_hub.js`
Expected: FAIL (`buildArchiveCsvRegisters`, `syncToDirectoryHandle`, `slimLegacyCloudViolations` undefined).

- [ ] **Step 3: Implement `KSUOneDriveArchiveHub` inside `assets/js/ksu-cloud-sync.js`**

Implement all methods, `IndexedDB` handle persistence for `FileSystemDirectoryHandle`, mobile `navigator.share({ files })` + download fallback, safe legacy slimming, and the self-injected RTL KSUMC-styled `#ksu-onedrive-archive-modal` (featuring both `https://ksusa.sharepoint.com/sites/safty` and `https://ksusa-my.sharepoint.com`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/test_cloud_archive_hub.js`
Expected: PASS (all subtests passing, 0 failures).

- [ ] **Step 5: Commit Task 3**

Stage and commit `assets/js/ksu-cloud-sync.js` and `tests/test_cloud_archive_hub.js`.

---

### Task 4: Role-Gated Header Button Integration & Full-Suite Verification

**Files:**
- Modify: `assets/js/ksu-nav-component.js`
- Create: `tests/test_nav_role_gating.js`

**Interfaces:**
- Consumes: `window.ksuSyncEngine.openSyncModal()` from Task 3.
- Produces:
  - `KSUNav.openCloudArchiveHub()` in `assets/js/ksu-nav-component.js`: lazy-loads `assets/js/ksu-cloud-sync.js` if `window.ksuSyncEngine` is not yet loaded (e.g., on `dashboard.html` or `head.html`), then calls `window.ksuSyncEngine.openSyncModal()`.
  - Role-gated header button `#ksu-nav-cloud-archive-btn` ("أرشيف سحابة الجامعة 1TB") rendered in `KSUNav.renderHeader` **only** when `activeKey !== 'field'` and `roleCat` is in `['developer', 'head', 'admin', 'executive', 'quality', 'supervisor']` (never rendered for `'field_inspector'` or `'guest'`).

- [ ] **Step 1: Write failing tests in `tests/test_nav_role_gating.js`**

Write `node:test` tests verifying:
1. Rendering `KSUNav.init({ activePortal: 'field' })` or with a `field_inspector` user does **not** render `#ksu-nav-cloud-archive-btn`.
2. Rendering `KSUNav.init({ activePortal: 'quality' })` or `head` / `admin` / `developer` user **does** render `#ksu-nav-cloud-archive-btn`, and clicking `KSUNav.openCloudArchiveHub()` invokes `window.ksuSyncEngine.openSyncModal()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/test_nav_role_gating.js`
Expected: FAIL (`#ksu-nav-cloud-archive-btn` and `KSUNav.openCloudArchiveHub` do not exist).

- [ ] **Step 3: Implement role-gated button and lazy-loader in `assets/js/ksu-nav-component.js`**

Add `canAccessCloudArchive` role check in `KSUNav.renderHeader` (`activeKey !== 'field'` and `isHeadOrAdmin || isQuality || roleCat === 'quality' || roleCat === 'supervisor'`), render `#ksu-nav-cloud-archive-btn` beside the notifications bell (plus quick item in dropdown for authorized roles), and implement `KSUNav.openCloudArchiveHub()`.

- [ ] **Step 4: Run full test suite to verify everything passes**

Run: `node --test oracle-vision-agent/test_archive_and_gpt4o.js tests/test_payload_slimming_and_failover.js tests/test_cloud_archive_hub.js tests/test_nav_role_gating.js`
Expected: PASS (all 4 test suites passing, 0 failures).

- [ ] **Step 5: Commit Task 4**

Stage and commit `assets/js/ksu-nav-component.js` and `tests/test_nav_role_gating.js`.

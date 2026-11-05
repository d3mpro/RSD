# Guided Vision Inspection & Asset Auto-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement specialized guided AI vision inspection (for fire extinguishers, emergency exits, and general hazards) with dynamic camera reticle overlays, asset-level state tracking, in-round checklist auto-filling, and standalone quick-scan violation dispatch on the Oracle Cloud Qwen2.5-VL agent and RSD-KSU field interface.

**Architecture:** Extend the dual backend (`agent_server.js` and `agent_server.py`) with specialized vision submodes (`extinguisher`, `emergency_exit`, `hazard`) that extract gauge status, inspection tag dates, door wedges, and obstruction percentages via Qwen2.5-VL/Ollama. In the frontend (`field.html` and `ksu-ai-client.js`), add a dynamic SVG reticle overlay for camera guidance, map results to individual asset records (`floorAssetsStatus[assetId]`), auto-fill active checklist items in open rounds, and provide 1-click violation/round creation for standalone quick scans.

**Tech Stack:** Node.js (v26 built-in HTTP and `node --test`), Python FastAPI (for Oracle VM), Vanilla ES6+ JavaScript, HTML5 Canvas/SVG, CSS3, Firebase Realtime Database.

**Spec:** [`docs/superpowers/specs/2026-11-05-guided-vision-inspection-design.md`](file:///e:/RSD-KSU/docs/superpowers/specs/2026-11-05-guided-vision-inspection-design.md)

## Global Constraints
- Must remain 100% compatible with existing Firebase Realtime Database and offline PWA service worker.
- Maximum image dimension must be preserved at 1024px to prevent RAM overload on Oracle Ampere ARM64 and 3B Ollama models.
- Date comparisons and logs must follow Saudi Arabia Standard Time (`Asia/Riyadh` - GMT+3).
- Preserve existing security token verification (`ksu_sec_token_95972_riyadh`).
- Inspector must retain manual override ability on all auto-filled fields.

## Review Focus
1. Non-extinguisher image uploaded while in extinguisher mode: The prompt must handle unreadable/missing gauges gracefully with `gauge_status: "unknown"` rather than hallucinating green or red.
2. Expired inspection tag detection: Tag dates older than 30 days (monthly check) or 1 year (annual maintenance) relative to Riyadh current date must flag `tag_valid: false`.
3. Simultaneous asset vs floor-level status: Updating asset `floorAssetsStatus[asset_id]` must not clobber other inspected assets in the same floor.
4. Standalone scan when no round is active: Clicking "Auto-Fill" must not throw null reference errors on `#modal-new-round` DOM elements; it must offer to create a new round or violation.
5. Offline camera capture: In zero-connectivity zones, images and asset selections must be saved to LocalStorage/IndexedDB with a clear UI banner instead of crashing the camera.

---

### Task 1: Backend Specialized Vision Prompts in `agent_server.js` and `agent_server.py`

**Files:**
- Modify: `oracle-vision-agent/agent_server.js`
- Modify: `oracle-vision-agent/agent_server.py`
- Create: `oracle-vision-agent/test_vision_prompts.js`

**Interfaces:**
- Consumes: `req.body.submode` (`"extinguisher" | "emergency_exit" | "hazard" | "general"`), `req.body.images` (array of base64 strings).
- Produces: Enhanced JSON payload from `/safety/api/ai/analyze-inspection-image` containing:
  - `gauge_status`: `"green" | "undercharge" | "overcharge" | "unknown"`
  - `tag_detected`: `boolean`, `tag_last_date`: `string`, `tag_valid`: `boolean`
  - `pin_and_seal_intact`: `boolean`
  - `exit_obstruction_percent`: `number` (0-100)
  - `door_wedged`: `boolean`
  - `submode`: `string`

- [ ] **Step 1: Write the failing test for specialized prompt generation and submode parsing**

Create `oracle-vision-agent/test_vision_prompts.js` using Node.js native test runner:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('Submode prompt builder produces extinguisher specific requirements', async () => {
  const { buildExtinguisherPrompt } = require('./prompt_builder.js');
  const prompt = buildExtinguisherPrompt({
    riyadhCtx: { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' },
    facility: 'KSUMC',
    building: 'المستشفى الرئيسي',
    floor: 'الدور الأرضي'
  });
  assert.ok(prompt.includes('gauge_status'));
  assert.ok(prompt.includes('Green Zone'));
  assert.ok(prompt.includes('tag_last_date'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test oracle-vision-agent/test_vision_prompts.js`
Expected: FAIL with "Cannot find module ./prompt_builder.js"

- [ ] **Step 3: Implement `prompt_builder.js` and integrate into `agent_server.js` and `agent_server.py`**

- Create `oracle-vision-agent/prompt_builder.js` with `buildExtinguisherPrompt`, `buildExitPrompt`, and `buildHazardPrompt`.
- In `agent_server.js`, check `body.submode` (or `body.checklistType`) and select the appropriate prompt builder.
- Ensure sanitization populates fallback defaults for `gauge_status`, `tag_detected`, and `door_wedged`.
- Apply identical logic in `agent_server.py` (`build_extinguisher_prompt`, `build_exit_prompt`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test oracle-vision-agent/test_vision_prompts.js`
Expected: PASS

- [ ] **Step 5: Verify server endpoint with mocked submode request**

Run: `node -e "require('./oracle-vision-agent/agent_server.js'); console.log('Syntax OK')"`
Expected: "Syntax OK"

---

### Task 2: Camera Guided Overlay (Reticle) & Submode Selector UI

**Files:**
- Modify: `assets/js/ksu-ai-client.js` (inside `openAIVisionInspectionModal`)
- Modify: `assets/css/styles.css` (camera viewfinder and reticle animations)

**Interfaces:**
- Consumes: User selected submode button click (`selectVisionSubmode('extinguisher')`).
- Produces: Dynamic SVG viewfinder reticle on top of the camera/preview container:
  - Extinguisher mode: Center circle (Gauge Target) + lower rectangle (Tag Target) + helper hint.
  - Emergency exit mode: Outer rectangular doorway frame + floor boundary.
  - Multi-shot counter badge: "صورة 1: العداد" / "صورة 2: البطاقة".

- [ ] **Step 1: Write UI component unit test for reticle template generation**

Create `tools/test_camera_reticle.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('Reticle generator returns SVG with gauge circle for extinguisher mode', () => {
  const { getReticleSvg } = require('../assets/js/vision-reticle-helper.js');
  const svg = getReticleSvg('extinguisher');
  assert.ok(svg.includes('gauge-target-circle'));
  assert.ok(svg.includes('tag-target-rect'));
  assert.ok(svg.includes('عداد الضغط'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/test_camera_reticle.js`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `vision-reticle-helper.js` and add styles to `assets/css/styles.css`**

- Create `assets/js/vision-reticle-helper.js` exporting `getReticleSvg(submode)`.
- In `assets/css/styles.css`, add styles for `.ksu-reticle-overlay`, `.reticle-pulse-glow`, `.gauge-target-circle`, and `.tag-target-rect`.
- In `assets/js/ksu-ai-client.js`, inject the submode selection pills `[🧯 طفايات] [🚪 مخارج] [⚡ مخاطر كهربائية]` above the camera/preview area in `openAIVisionInspectionModal`.
- Render the SVG reticle dynamically as an overlay on the camera viewfinder when camera stream is active or photo preview is loaded.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/test_camera_reticle.js`
Expected: PASS

---

### Task 3: Client AI Bridge & Specialized Result Rendering

**Files:**
- Modify: `assets/js/ksu-ai-client.js`

**Interfaces:**
- Consumes: Response from `KSUAI.analyzeInspectionImage` with `gauge_status`, `tag_valid`, `door_wedged`.
- Produces:
  - Instant Visual Feedback Badge (Green Pass / Red Fail / Yellow Warning).
  - Specialized asset metrics card (Gauge dial display, tag validity, pin status).
  - Action buttons based on launch context (In-round vs Standalone).

- [ ] **Step 1: Write unit test for specialized results card generator**

Create `tools/test_vision_results_render.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('renders extinguisher gauge badge correctly', () => {
  const { formatExtinguisherBadge } = require('../assets/js/vision-reticle-helper.js');
  const html = formatExtinguisherBadge({ gauge_status: 'green', tag_valid: true, pin_and_seal_intact: true });
  assert.ok(html.includes('الضغط سليم'));
  assert.ok(html.includes('bg-emerald-500') || html.includes('text-emerald'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/test_vision_results_render.js`
Expected: FAIL

- [ ] **Step 3: Implement formatters and renderers in `assets/js/vision-reticle-helper.js` and `ksu-ai-client.js`**

- Add `formatExtinguisherBadge` and `formatExitBadge` to `assets/js/vision-reticle-helper.js`.
- In `assets/js/ksu-ai-client.js`:
  - Pass `submode: currentSubmode` in `KSUAI.analyzeInspectionImage`.
  - In `renderVisionInspectionResults`, render a dedicated "بطاقة فحص الأصل الذكية" showing the gauge status gauge needle icon, tag date, and pin integrity if `submode === 'extinguisher'`.
  - If `submode === 'emergency_exit'`, show obstruction percentage progress bar and door wedging alert.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/test_vision_results_render.js`
Expected: PASS

---

### Task 4: In-Round Asset-Level State Updating & Checklist Auto-Fill

**Files:**
- Modify: `assets/js/ksu-ai-client.js`
- Modify: `field.html`

**Interfaces:**
- Consumes: `window.activeRoundData`, `options.assetId`, `options.roundActive = true`.
- Produces:
  - Updated `floorAssetsStatus[assetId]` record with `{ inspected: true, gauge_status, tag_date, passed, timestamp }`.
  - Auto-ticked checklist items in the active round checklist DOM (`input[name="fex_gauge"]`, `input[name="fex_tag"]`, etc.).
  - Notification toast: "تم فحص وتحديث الأصل #ASSET_ID بنجاح".

- [ ] **Step 1: Write test for asset state updater logic**

Create `tools/test_asset_auto_fill.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('updateAssetInspectionState sets asset status without overwriting others', () => {
  const { updateAssetInspectionState } = require('../assets/js/vision-reticle-helper.js');
  const floorAssetsStatus = { 'EXT-01': { inspected: true, passed: true } };
  const updated = updateAssetInspectionState(floorAssetsStatus, 'EXT-02', {
    gauge_status: 'undercharge',
    tag_valid: true,
    compliance_status: 'غير مطابق'
  });
  assert.equal(updated['EXT-01'].passed, true);
  assert.equal(updated['EXT-02'].inspected, true);
  assert.equal(updated['EXT-02'].passed, false);
  assert.equal(updated['EXT-02'].gauge_status, 'undercharge');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/test_asset_auto_fill.js`
Expected: FAIL

- [ ] **Step 3: Implement `updateAssetInspectionState` and DOM auto-fill logic**

- Add `updateAssetInspectionState` in `assets/js/vision-reticle-helper.js`.
- In `assets/js/ksu-ai-client.js`, add `applyVisionToActiveRound()`:
  - If an active round modal is open, locate the active asset in the current floor.
  - Set `floorAssetsStatus[currentAssetId]`.
  - Batch fill matching checklist radios/inputs based on submode:
    - For extinguishers: sets pressure item to Pass/Fail, sets tag item to Pass/Fail, sets remarks field with AI findings summary.
    - Recalculate round progress badge and scores.
  - Close the vision modal and display a success toast with the asset summary.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/test_asset_auto_fill.js`
Expected: PASS

---

### Task 5: Standalone Quick Scan Actions (Instant Violation & New Round Dispatch)

**Files:**
- Modify: `assets/js/ksu-ai-client.js`
- Modify: `field.html`

**Interfaces:**
- Consumes: Standalone analysis completion when no round modal is active.
- Produces:
  - 🚨 **[إنشاء بلاغ مخالفة فوري]** action: Copies image, location (`building`, `floor`, `room`), detected violation, and CAPA to `#modal-violation` and displays it.
  - 📋 **[بدء جولة جديدة لهذا الموقع]** action: Opens `#modal-new-round` with pre-filled building and floor.

- [ ] **Step 1: Write test for standalone action payload mapper**

Create `tools/test_standalone_dispatch.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('prepareViolationFromVision extracts form fields correctly', () => {
  const { prepareViolationFromVision } = require('../assets/js/vision-reticle-helper.js');
  const d = {
    detected_element: 'طفاية حريق ضغط منخفض',
    findings_summary: 'إبرة العداد في النطاق الأحمر',
    violations_list: ['الضغط منخفض', 'البطاقة منتهية'],
    standard_reference: 'CBAHI FMS.04'
  };
  const location = { building: 'مبنى العيادات', floor: 'الدور 1', room: '102' };
  const payload = prepareViolationFromVision(d, location);
  assert.equal(payload.building, 'مبنى العيادات');
  assert.ok(payload.description.includes('CBAHI FMS.04'));
  assert.ok(payload.description.includes('إبرة العداد في النطاق الأحمر'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/test_standalone_dispatch.js`
Expected: FAIL

- [ ] **Step 3: Implement `prepareViolationFromVision` and standalone action buttons in `ksu-ai-client.js`**

- Add `prepareViolationFromVision` to `assets/js/vision-reticle-helper.js`.
- In `assets/js/ksu-ai-client.js`:
  - When rendering results and `!isInsideActiveRound`, show prominent buttons:
    - `🚨 إنشاء بلاغ فوري`: calls `openViolationFromAI(d, location, image)`.
    - `📋 بدء جولة لهذا الموقع`: calls `startRoundFromAI(location, assetId)`.
  - Connect these functions to pre-fill existing modal forms in `field.html`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/test_standalone_dispatch.js`
Expected: PASS

---

### Task 6: End-to-End System Verification & Regression Test

**Files:**
- Create: `tools/verify_all_guided_vision.js`

**Interfaces:**
- Runs full suite: prompt building, reticle generation, asset status updating, auto-fill mapping, and standalone dispatch.

- [ ] **Step 1: Write the end-to-end regression test suite**

In `tools/verify_all_guided_vision.js`:
- Test prompt generation for all 3 submodes.
- Test reticle SVG output for all 3 submodes.
- Test asset state preservation across 10 consecutive asset evaluations.
- Test violation payload generation.
- Check syntax of all modified files (`agent_server.js`, `agent_server.py`, `ksu-ai-client.js`, `field.html`).

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tools/verify_all_guided_vision.js`
Expected: All tests PASS with zero regressions.

- [ ] **Step 3: Manual browser verification**

Open `field.html` locally:
- Click the floating "الراصد الذكي" button.
- Check the submode buttons [🧯 طفايات] [🚪 مخارج] [⚡ مخاطر].
- Verify reticle overlays properly.
- Verify result card shows gauge badge and action buttons.

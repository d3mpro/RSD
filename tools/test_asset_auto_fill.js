const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const reticleHelperPath = path.resolve(__dirname, '../assets/js/vision-reticle-helper.js');
const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');
const fieldHtmlPath = path.resolve(__dirname, '../field.html');

test('Reticle helper exports updateAssetInspectionState and mapVisionToChecklistFields', () => {
  const reticleHelper = require(reticleHelperPath);
  assert.equal(typeof reticleHelper.updateAssetInspectionState, 'function', 'updateAssetInspectionState should be a function');
  assert.equal(typeof reticleHelper.mapVisionToChecklistFields, 'function', 'mapVisionToChecklistFields should be a function');
});

test('updateAssetInspectionState is a pure function that preserves other assets without mutation', () => {
  const { updateAssetInspectionState } = require(reticleHelperPath);

  const initialStatus = {
    'FE-01': { inspected: false, passed: false },
    'FE-02': { inspected: true, passed: true, gauge_status: 'green' }
  };

  // Deep clone to check immutability
  const originalSnapshot = JSON.parse(JSON.stringify(initialStatus));

  const inspectionData = {
    compliance_status: 'مطابق',
    hazard_detected: false,
    gauge_status: 'green',
    tag_last_date: '2026-05',
    tag_valid: true,
    pin_and_seal_intact: true,
    door_wedged: false,
    exit_obstruction_percent: 0,
    submode: 'extinguisher',
    findings_summary: 'طفاية حريق سليمة ومطابقة'
  };

  const updatedStatus = updateAssetInspectionState(initialStatus, 'FE-01', inspectionData);

  // Immutability checks
  assert.notEqual(updatedStatus, initialStatus, 'Must return a new object reference');
  assert.deepEqual(initialStatus, originalSnapshot, 'Original floorAssetsStatus object must NOT be mutated');

  // Preservation of other assets
  assert.ok(updatedStatus['FE-02'], 'FE-02 must be preserved');
  assert.equal(updatedStatus['FE-02'].inspected, true);
  assert.equal(updatedStatus['FE-02'].passed, true);

  // Target asset verification
  const fe01 = updatedStatus['FE-01'];
  assert.ok(fe01, 'Target asset FE-01 must exist in result');
  assert.equal(fe01.inspected, true, 'inspected must be true');
  assert.equal(fe01.passed, true, 'passed must be true when compliant and no hazard');
  assert.equal(fe01.gauge_status, 'green');
  assert.equal(fe01.tag_last_date, '2026-05');
  assert.equal(fe01.tag_valid, true);
  assert.equal(fe01.pin_and_seal_intact, true);
  assert.equal(fe01.door_wedged, false);
  assert.equal(fe01.exit_obstruction_percent, 0);
  assert.equal(fe01.submode, 'extinguisher');
  assert.equal(fe01.summary, 'طفاية حريق سليمة ومطابقة');
  assert.equal(typeof fe01.timestamp, 'number', 'timestamp must be a timestamp number');
  assert.ok(fe01.timestamp > 0);
});

test('updateAssetInspectionState marks passed=false when hazard is detected or non-compliant', () => {
  const { updateAssetInspectionState } = require(reticleHelperPath);

  // Case 1: Non-compliant status
  const nonCompResult = updateAssetInspectionState({}, 'FE-09', {
    compliance_status: 'غير مطابق',
    hazard_detected: false,
    gauge_status: 'undercharge'
  });
  assert.equal(nonCompResult['FE-09'].inspected, true);
  assert.equal(nonCompResult['FE-09'].passed, false, 'Non-compliant must result in passed=false');
  assert.equal(nonCompResult['FE-09'].gauge_status, 'undercharge');

  // Case 2: Hazard detected despite status string
  const hazardResult = updateAssetInspectionState({}, 'EX-04', {
    compliance_status: 'مطابق',
    hazard_detected: true,
    door_wedged: true,
    exit_obstruction_percent: 40,
    submode: 'emergency_exit'
  });
  assert.equal(hazardResult['EX-04'].inspected, true);
  assert.equal(hazardResult['EX-04'].passed, false, 'Hazard detected must result in passed=false');
  assert.equal(hazardResult['EX-04'].door_wedged, true);
  assert.equal(hazardResult['EX-04'].exit_obstruction_percent, 40);
  assert.equal(hazardResult['EX-04'].submode, 'emergency_exit');

  // Case 3: Handles null/undefined initial state safely
  const safeResult = updateAssetInspectionState(null, 'FE-99', {
    compliance_status: 'مطابق',
    hazard_detected: false
  });
  assert.ok(safeResult && typeof safeResult === 'object');
  assert.equal(safeResult['FE-99'].inspected, true);
  assert.equal(safeResult['FE-99'].passed, true);
});

test('mapVisionToChecklistFields accurately evaluates extinguishers', () => {
  const { mapVisionToChecklistFields } = require(reticleHelperPath);

  // Compliant extinguisher
  const compliantData = {
    submode: 'extinguisher',
    gauge_status: 'green',
    tag_valid: true,
    pin_and_seal_intact: true,
    findings_summary: 'طفاية مطابقة وسليمة'
  };
  const plan1 = mapVisionToChecklistFields(compliantData);
  assert.ok(Array.isArray(plan1.compliantItems), 'compliantItems must be an array');
  assert.ok(Array.isArray(plan1.nonCompliantItems), 'nonCompliantItems must be an array');
  assert.equal(typeof plan1.notesText, 'string', 'notesText must be a string');

  assert.ok(plan1.compliantItems.includes('pressure_gauge'), 'pressure gauge should be compliant');
  assert.ok(plan1.compliantItems.includes('tag'), 'tag should be compliant');
  assert.ok(plan1.compliantItems.includes('pin'), 'pin should be compliant');
  assert.equal(plan1.nonCompliantItems.length, 0, 'Should have no non-compliant items');

  // Defective extinguisher (low pressure, expired tag, broken seal)
  const defectiveData = {
    submode: 'extinguisher',
    gauge_status: 'undercharge',
    tag_valid: false,
    pin_and_seal_intact: false,
    findings_summary: 'ضغط منخفض وبطاقة منتهية ومسمار أمان مفقود'
  };
  const plan2 = mapVisionToChecklistFields(defectiveData);
  assert.ok(plan2.nonCompliantItems.includes('pressure_gauge'), 'low gauge must be non-compliant');
  assert.ok(plan2.nonCompliantItems.includes('tag'), 'expired tag must be non-compliant');
  assert.ok(plan2.nonCompliantItems.includes('pin'), 'broken pin must be non-compliant');
  assert.equal(plan2.compliantItems.length, 0);
  assert.ok(plan2.notesText.includes('ضغط منخفض') || plan2.notesText.includes('طفاية'));
});

test('mapVisionToChecklistFields accurately evaluates emergency exits', () => {
  const { mapVisionToChecklistFields } = require(reticleHelperPath);

  // Wedged door with 30% obstruction
  const wedgedExit = {
    submode: 'emergency_exit',
    door_wedged: true,
    exit_obstruction_percent: 30,
    findings_summary: 'باب طوارئ مثبت بوتد وإعاقة في مسار الإخلاء'
  };
  const plan1 = mapVisionToChecklistFields(wedgedExit);
  assert.ok(plan1.nonCompliantItems.includes('door_wedged'), 'door_wedged must be non-compliant');
  assert.ok(plan1.nonCompliantItems.includes('exit_obstruction'), 'obstruction > 0 must be non-compliant');
  assert.equal(plan1.compliantItems.length, 0);

  // Clear exit
  const clearExit = {
    submode: 'emergency_exit',
    door_wedged: false,
    exit_obstruction_percent: 0,
    findings_summary: 'مخرج طوارئ سالك تماماً ومطابق'
  };
  const plan2 = mapVisionToChecklistFields(clearExit);
  assert.ok(plan2.compliantItems.includes('door_wedged'), 'free door must be compliant');
  assert.ok(plan2.compliantItems.includes('exit_obstruction'), '0% obstruction must be compliant');
  assert.equal(plan2.nonCompliantItems.length, 0);
});

test('ksu-ai-client.js implements applyVisionToActiveRound and in-round auto-fill action button', () => {
  const clientCode = fs.readFileSync(aiClientPath, 'utf8');

  // Verify function definition
  assert.ok(clientCode.includes('applyVisionToActiveRound'), 'ksu-ai-client.js must define applyVisionToActiveRound');

  // Verify button markup in renderVisionInspectionResults
  assert.ok(clientCode.includes('تطبيق وتعبئة بنود الجولة آلياً'), 'renderVisionInspectionResults must contain auto-fill action button');

  // Verify toast notification text
  assert.ok(clientCode.includes('تم فحص الأصل وتحديث بنود الجولة بنجاح ✅'), 'applyVisionToActiveRound must display expected success toast');

  // Verify integration with updateAssetInspectionState and mapVisionToChecklistFields
  assert.ok(clientCode.includes('updateAssetInspectionState'), 'applyVisionToActiveRound must invoke updateAssetInspectionState');
  assert.ok(clientCode.includes('mapVisionToChecklistFields'), 'applyVisionToActiveRound must invoke mapVisionToChecklistFields');
});

test('applyVisionToActiveRound simulates end-to-end asset update, checklist fill, and notes append', () => {
  const reticleHelper = require(reticleHelperPath);

  // Setup DOM / global mocks
  const mockElements = new Map();
  const toasts = [];

  class MockElement {
    constructor(id = '', tag = 'div') {
      this.id = id;
      this.tagName = tag.toUpperCase();
      this.classList = new Set();
      this.attributes = {};
      this.value = '';
      this.checked = false;
      this.style = {};
      this.children = [];
      this._eventListeners = {};
    }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }
    addEventListener(evt, fn) {
      this._eventListeners[evt] = this._eventListeners[evt] || [];
      this._eventListeners[evt].push(fn);
    }
    dispatchEvent(evt) {
      const fns = this._eventListeners[evt?.type || evt] || [];
      fns.forEach(fn => fn(evt));
      return true;
    }
    querySelector(selector) {
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1).split(',')[0].trim();
        return mockElements.get(targetId) || null;
      }
      return null;
    }
    querySelectorAll() { return []; }
    remove() { this.removed = true; }
  }

  const modalNewRound = new MockElement('newRoundModal');
  mockElements.set('newRoundModal', modalNewRound);
  mockElements.set('modal-new-round', modalNewRound);

  const inpRoundNotes = new MockElement('inp-round-notes', 'input');
  inpRoundNotes.value = 'ملاحظة أولية سابقة';
  mockElements.set('inp-round-notes', inpRoundNotes);

  const visionModal = new MockElement('ksu-ai-vision-modal');
  mockElements.set('ksu-ai-vision-modal', visionModal);

  const optComp32 = new MockElement('opt-comp-32', 'input');
  const optViol32 = new MockElement('opt-viol-32', 'input');
  const optComp36 = new MockElement('opt-comp-36', 'input');
  const optViol36 = new MockElement('opt-viol-36', 'input');
  mockElements.set('opt-comp-32', optComp32);
  mockElements.set('opt-viol-32', optViol32);
  mockElements.set('opt-comp-36', optComp36);
  mockElements.set('opt-viol-36', optViol36);

  // Set globalThis mocks
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalState = globalThis.state;
  const originalLocalStorage = globalThis.localStorage;

  const mockStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
  globalThis.localStorage = mockStorage;

  globalThis.document = {
    getElementById: (id) => mockElements.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return mockElements.get(sel.slice(1)) || null;
      return null;
    }
  };

  globalThis.Event = class Event {
    constructor(type) { this.type = type; }
  };

  globalThis.KSUReticleHelper = reticleHelper;

  globalThis.state = {
    currentRoundDraft: {
      floorAssetsStatus: {
        'FE-01': 'pending',
        'FE-02': { inspected: true, passed: true }
      },
      notes: 'ملاحظة أولية سابقة',
      items: [
        { id: 32, code: 'KSU-FEX-02', title: 'مؤشر الضغط ومسمار الأمان', desc: 'مؤشر الضغط ومسمار الأمان', result: 'pending' },
        { id: 36, code: 'KSU-FEX-06', title: 'بطاقة الفحص الشهري', desc: 'بطاقة الفحص الشهري', result: 'pending' }
      ]
    }
  };

  globalThis.window = {
    state: globalThis.state,
    KSUReticleHelper: reticleHelper,
    showToast: (msg, type) => { toasts.push({ msg, type }); },
    lastVisionAnalysisData: {
      submode: 'extinguisher',
      compliance_status: 'مطابق',
      hazard_detected: false,
      gauge_status: 'green',
      tag_valid: true,
      pin_and_seal_intact: true,
      findings_summary: 'فحص طفاية الحريق: سليم ومطابق لكافة المعايير'
    }
  };

  // Evaluate applyVisionToActiveRound implementation
  const clientCode = fs.readFileSync(aiClientPath, 'utf8');
  // Evaluate the helper in current scope
  const evalFunc = new Function('window', 'document', 'KSUReticleHelper', 'state', 'Event', 'showToast', `
    ${clientCode}
    return window.applyVisionToActiveRound;
  `);

  const applyVisionFn = evalFunc(globalThis.window, globalThis.document, reticleHelper, globalThis.state, globalThis.Event, globalThis.window.showToast);

  assert.equal(typeof applyVisionFn, 'function', 'applyVisionToActiveRound must be exported on window');

  // Execute auto-fill for FE-01
  const result = applyVisionFn('FE-01');

  // Verify asset state updated
  const statusMap = globalThis.state.currentRoundDraft.floorAssetsStatus;
  assert.ok(statusMap['FE-01'], 'FE-01 record must exist');
  assert.equal(statusMap['FE-01'].inspected, true);
  assert.equal(statusMap['FE-01'].passed, true);
  assert.equal(statusMap['FE-01'].gauge_status, 'green');

  // Verify other asset preserved
  assert.ok(statusMap['FE-02'], 'FE-02 must be preserved');
  assert.equal(statusMap['FE-02'].passed, true);

  // Verify checklist items in draft
  const item32 = globalThis.state.currentRoundDraft.items.find(i => i.id === 32);
  const item36 = globalThis.state.currentRoundDraft.items.find(i => i.id === 36);
  assert.equal(item32.result, 'compliant', 'Item 32 (gauge & pin) should be compliant');
  assert.equal(item36.result, 'compliant', 'Item 36 (tag) should be compliant');

  // Verify notes appended
  assert.ok(inpRoundNotes.value.includes('[فحص بصري ذكي]'), 'DOM notes input should contain appended text');
  assert.ok(globalThis.state.currentRoundDraft.notes.includes('[فحص بصري ذكي]'), 'Draft notes should contain appended text');

  // Verify toast
  assert.ok(toasts.some(t => t.msg.includes('تم فحص الأصل وتحديث بنود الجولة بنجاح ✅')), 'Toast must be triggered');

  // Verify vision modal closed
  assert.equal(visionModal.removed, true, 'Vision modal must be closed/removed');

  // Clean up globals
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.state = originalState;
  globalThis.localStorage = originalLocalStorage;
});

test('field.html contains round modal container and in-round AI vision trigger button without monkeypatching', () => {
  const fieldHtml = fs.readFileSync(fieldHtmlPath, 'utf8');

  // Check modal container exists
  assert.ok(fieldHtml.includes('id="newRoundModal"') || fieldHtml.includes('id="modal-new-round"'), 'field.html must have round modal container');

  // Check in-round AI vision trigger button exists
  assert.ok(fieldHtml.includes('openAIVisionInspectionModal'), 'field.html must contain openAIVisionInspectionModal');
  assert.ok(fieldHtml.includes('id="btn-round-ai-vision"'), 'field.html must contain btn-round-ai-vision');

  // Ensure no global document.getElementById monkeypatching script
  assert.ok(!fieldHtml.includes('document.getElementById = function'), 'field.html must NOT monkeypatch document.getElementById');
});

test('Syntax check passes for modified JavaScript files', () => {
  assert.doesNotThrow(() => {
    execSync(`node -c "${reticleHelperPath}"`, { stdio: 'pipe' });
  }, 'vision-reticle-helper.js syntax check failed');

  assert.doesNotThrow(() => {
    execSync(`node -c "${aiClientPath}"`, { stdio: 'pipe' });
  }, 'ksu-ai-client.js syntax check failed');
});

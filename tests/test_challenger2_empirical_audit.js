/**
 * tests/test_challenger2_empirical_audit.js
 * Independent Empirical Verification Audit by Challenger 2 Re-Verification
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const appJsSource = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/app.js'), 'utf8');
const { KSU_FACP_ASSETS } = require(path.join(ROOT_DIR, 'assets/js/ksu-facp-assets.js'));
const officialCardSource = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/ksu-official-card.js'), 'utf8');

function extractFunctionSource(fullCode, functionSignature) {
  const startIdx = fullCode.indexOf(functionSignature);
  if (startIdx === -1) throw new Error(`Function signature not found: ${functionSignature}`);
  let braceCount = 0;
  let bodyStart = -1;
  for (let i = startIdx; i < fullCode.length; i++) {
    if (fullCode[i] === '{') {
      braceCount++;
      if (bodyStart === -1) bodyStart = i;
    } else if (fullCode[i] === '}') {
      braceCount--;
      if (braceCount === 0 && bodyStart !== -1) {
        return fullCode.slice(startIdx, i + 1);
      }
    }
  }
  throw new Error(`Could not find closing brace for: ${functionSignature}`);
}

function runAudit() {
  console.log('--- STARTING CHALLENGER 2 EMPIRICAL AUDIT ---');

  const elementsById = new Map();
  const store = new Map();

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _store: store
  };

  function createNode(tag, id = '') {
    const node = {
      tagName: tag.toUpperCase(),
      id,
      value: '',
      textContent: '',
      innerHTML: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      children: [],
      parentNode: null,
      appendChild: (c) => { c.parentNode = node; node.children.push(c); return c; },
      insertBefore: (c) => { c.parentNode = node; node.children.unshift(c); return c; },
      removeChild: (c) => {
        const idx = node.children.indexOf(c);
        if (idx !== -1) { node.children.splice(idx, 1); c.parentNode = null; }
        return c;
      },
      remove: function() {
        if (this.parentNode) this.parentNode.removeChild(this);
      },
      options: [],
      querySelectorAll: () => [],
      querySelector: () => null
    };
    if (id) elementsById.set(id, node);
    return node;
  }

  const document = {
    body: createNode('body'),
    getElementById: (id) => {
      if (!elementsById.has(id)) {
        createNode('div', id);
      }
      return elementsById.get(id);
    },
    createElement: (tag) => createNode(tag),
    querySelectorAll: () => [],
    querySelector: () => null
  };

  const sandbox = {
    console,
    document,
    localStorage,
    KSU_FACP_ASSETS,
    STORAGE_KEY_ROUNDS: 'ksumc_safety_rounds',
    Date,
    Intl,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Set,
    Map,
    Error,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout: () => {},
    matchBuilding: (b1, b2) => true,
    matchFloor: (f1, f2) => true,
    showToast: () => {},
    state: {
      currentUser: null,
      assets: [...KSU_FACP_ASSETS],
      rounds: [],
      capa: [],
      currentRoundDraft: null,
      editingRoundId: null,
      checklistTemplate: [{ id: 'item-1', code: 'SAF-01', title: 'فحص جاهزية النظام', status: 'active' }],
      buildings: [{ name: 'المستشفى', hospital: 'مستشفى الملك خالد الجامعي' }]
    },
    getChecklistItemsForFormType: () => [{ id: 'item-1', code: 'SAF-01', title: 'فحص الجاهزية', result: 'compliant' }],
    getCurrentActiveShiftKey: (u) => (u && u.shift ? u.shift : 'shift1'),
    getShiftLabel: (k) => 'الوردية الأولى (صباحي)',
    populateDynamicDropdowns: () => {},
    renderChecklistForm: () => {},
    renderFloorAssetsReconciliation: () => {},
    updateChecklistScorePreview: () => {},
    closeNewRoundModal: () => {},
    updateDashboardKPIs: () => {},
    renderHomeRecentRounds: () => {},
    notifyCloudSync: () => {}
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(officialCardSource, ctx);

  const getAllFacpAssetsFn = extractFunctionSource(appJsSource, 'function getAllFacpAssets()');
  const openNewRoundModalFn = extractFunctionSource(appJsSource, 'function openNewRoundModal(');
  const saveNewInspectionRoundFn = extractFunctionSource(appJsSource, 'function saveNewInspectionRound()');
  const saveRoundsFn = extractFunctionSource(appJsSource, 'function saveRounds(');

  vm.runInContext(`${getAllFacpAssetsFn}\nwindow.getAllFacpAssets = getAllFacpAssets;`, ctx);
  vm.runInContext(`${openNewRoundModalFn}\nwindow.openNewRoundModal = openNewRoundModal;`, ctx);
  vm.runInContext(`${saveNewInspectionRoundFn}\nwindow.saveNewInspectionRound = saveNewInspectionRound;`, ctx);
  vm.runInContext(`${saveRoundsFn}\nwindow.saveRounds = saveRounds;`, ctx);

  // --- TEST 1: User with employeeId (number and string) ---
  sandbox.state.currentUser = { id: 'U1', name: 'مهندس أحمد', employeeId: 'EMP-9021', shift: 'shift1' };
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');
  ctx.window.saveNewInspectionRound();
  let r1 = sandbox.state.rounds[0];
  assert.strictEqual(r1.badge, 'EMP-9021', 'String employeeId must be preserved in round.badge');
  console.log('✔ Test 1a Passed: String employeeId preserved without KSU-SAF-882 fallback');

  sandbox.state.currentUser = { id: 'U2', name: 'مفتش تركي', employeeId: 44521, shift: 'shift2' };
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0095');
  ctx.window.saveNewInspectionRound();
  let r2 = sandbox.state.rounds[0];
  assert.strictEqual(r2.badge, 44521, 'Numeric employeeId must be preserved in round.badge');
  console.log('✔ Test 1b Passed: Numeric employeeId preserved without KSU-SAF-882 fallback');

  // --- TEST 2: User with badge property ---
  sandbox.state.currentUser = { id: 'U3', name: 'مفتش سعد', badge: 'BDG-7711', shift: 'shift3' };
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-NM1757');
  ctx.window.saveNewInspectionRound();
  let r3 = sandbox.state.rounds[0];
  assert.strictEqual(r3.badge, 'BDG-7711', 'Badge property must be preserved in round.badge');
  console.log('✔ Test 2 Passed: User with badge property correctly stored in round.badge');

  // --- TEST 3: Null/Undefined session fallback ---
  sandbox.state.currentUser = null;
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.saveNewInspectionRound();
  let r4 = sandbox.state.rounds[0];
  assert.strictEqual(r4.badge, 'KSU-SAF-882', 'Empty user session should gracefully fallback to KSU-SAF-882');
  console.log('✔ Test 3 Passed: Safe fallback to KSU-SAF-882 on null session');

  // --- TEST 4: Mirroring in saveNewInspectionRound to all 4 keys ---
  const expectedKeys = ['ksumc_safety_rounds', 'ksumc_field_rounds', 'ksumc_rounds_registry', 'ksumc_rounds'];
  for (const k of expectedKeys) {
    const data = JSON.parse(sandbox.localStorage.getItem(k));
    assert.ok(Array.isArray(data), `Key ${k} must be an array`);
    assert.strictEqual(data.length, sandbox.state.rounds.length, `Key ${k} count must match state.rounds`);
  }
  console.log('✔ Test 4 Passed: saveNewInspectionRound mirrors to all 4 storage keys in lockstep');

  // --- TEST 5: Mirroring in saveRounds() ---
  sandbox.state.rounds[0].notes = 'ملاحظة محدثة عبر saveRounds';
  ctx.window.saveRounds(sandbox.state.rounds[0]);
  for (const k of expectedKeys) {
    const data = JSON.parse(sandbox.localStorage.getItem(k));
    assert.strictEqual(data[0].notes, 'ملاحظة محدثة عبر saveRounds', `Key ${k} must be updated by saveRounds`);
  }
  console.log('✔ Test 5 Passed: saveRounds mirrors to all 4 storage keys including ksumc_rounds');

  // --- TEST 6: All 10 FACP panels round generation & official card rendering ---
  for (const panel of KSU_FACP_ASSETS) {
    sandbox.state.currentUser = { id: 'U-AUDIT', name: 'مراجع الجودة', employeeId: 'AUD-001', shift: 'shift1' };
    ctx.window.openNewRoundModal('fas_insp');
    ctx.window.selectFacpPanelCard(panel.id);
    ctx.window.saveNewInspectionRound();
    const latestRound = sandbox.state.rounds[0];

    assert.strictEqual(latestRound.facpAssetId, panel.id);
    assert.strictEqual(latestRound.facpControlNo, panel.controlNo);
    assert.strictEqual(latestRound.loopNo, panel.loopsCount);
    assert.strictEqual(latestRound.devicesNo, panel.devicesCount);
    assert.strictEqual(latestRound.zone, panel.zone);
    assert.strictEqual(latestRound.badge, 'AUD-001');

    const cardHtml = ctx.window.generateOfficialInspectionCardHtml(latestRound);
    assert.ok(cardHtml.includes(panel.controlNo), `Card must include ${panel.controlNo}`);
    assert.ok(cardHtml.includes(panel.zone), `Card must include ${panel.zone}`);
    assert.ok(cardHtml.includes('لوحة إنذار الحريق (FACP Panel)'), 'Card must have FACP box');
    assert.ok(cardHtml.includes('<svg'), 'Card must render QR Code SVG');
  }
  console.log('✔ Test 6 Passed: All 10 FACP panels produce valid rounds and official printable cards');

  console.log('--- ALL CHALLENGER 2 EMPIRICAL AUDIT TESTS PASSED SUCCESSFULLY! ---');
}

runAudit();

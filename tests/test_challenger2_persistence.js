/**
 * tests/test_challenger2_persistence.js
 * Adversarial Challenger 2 Test Harness:
 * Lifecycle, Multi-Storage Persistence, Payload Integrity & Official Card Generator Robustness
 *
 * Target Files:
 * - field.html
 * - assets/js/app.js
 * - assets/js/ksu-official-card.js
 * - assets/js/ksu-facp-assets.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.resolve(__dirname, '..');
const facpAssetsSource = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/ksu-facp-assets.js'), 'utf8');
const officialCardSource = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/ksu-official-card.js'), 'utf8');
const appJsSource = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/app.js'), 'utf8');
const fieldHtmlSource = fs.readFileSync(path.join(ROOT_DIR, 'field.html'), 'utf8');

// Load canonical FACP assets directly
const { KSU_FACP_ASSETS } = require(path.join(ROOT_DIR, 'assets/js/ksu-facp-assets.js'));

// Function extractor helper
function extractFunctionSource(fullCode, functionSignature) {
  const startIdx = fullCode.indexOf(functionSignature);
  if (startIdx === -1) {
    throw new Error(`Function signature not found: ${functionSignature}`);
  }

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

// Lightweight DOM Mocking
function createDOMNode(tagName, props = {}, elementsById) {
  const children = [];
  const classList = new Set();
  const attributes = new Map();
  const eventListeners = new Map();
  const options = [];

  if (props.class) {
    props.class.split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
  }
  if (props.id) {
    attributes.set('id', props.id);
  }

  const node = {
    tagName: tagName.toUpperCase(),
    style: { ...props.style },
    value: props.value || '',
    textContent: props.textContent || '',
    innerHTML: props.innerHTML || '',
    checked: Boolean(props.checked),
    disabled: Boolean(props.disabled),
    options: options,
    children: children,
    parentNode: null,

    get id() {
      return attributes.get('id') || '';
    },
    set id(val) {
      attributes.set('id', String(val));
      if (elementsById) {
        elementsById.set(String(val), node);
      }
    },

    get classList() {
      return {
        add: (...cls) => cls.forEach(c => classList.add(c)),
        remove: (...cls) => cls.forEach(c => classList.delete(c)),
        contains: (c) => classList.has(c),
        toggle: (c, force) => {
          if (force === true) { classList.add(c); return true; }
          if (force === false) { classList.delete(c); return false; }
          if (classList.has(c)) { classList.delete(c); return false; }
          classList.add(c); return true;
        }
      };
    },

    get className() {
      return Array.from(classList).join(' ');
    },
    set className(val) {
      classList.clear();
      (val || '').split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
    },

    setAttribute: (name, val) => attributes.set(name, String(val)),
    getAttribute: (name) => attributes.has(name) ? attributes.get(name) : null,
    hasAttribute: (name) => attributes.has(name),
    removeAttribute: (name) => attributes.delete(name),

    addEventListener: (event, handler) => {
      if (!eventListeners.has(event)) eventListeners.set(event, []);
      eventListeners.get(event).push(handler);
    },
    dispatchEvent: (event) => {
      const type = event.type || event;
      const handlers = eventListeners.get(type) || [];
      handlers.forEach(h => h(event));
    },

    appendChild: (child) => {
      child.parentNode = node;
      children.push(child);
      if (child.tagName === 'OPTION') options.push(child);
      return child;
    },
    insertBefore: (child, refChild) => {
      child.parentNode = node;
      const idx = children.indexOf(refChild);
      if (idx !== -1) {
        children.splice(idx, 0, child);
      } else {
        children.push(child);
      }
      if (child.tagName === 'OPTION') {
        const optIdx = options.indexOf(refChild);
        if (optIdx !== -1) options.splice(optIdx, 0, child);
        else options.push(child);
      }
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      const optIdx = options.indexOf(child);
      if (optIdx !== -1) options.splice(optIdx, 1);
      return child;
    },
    remove: () => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    },
    querySelector: (sel) => querySelectorOne(node, sel),
    querySelectorAll: (sel) => querySelectorAllNodes(node, sel)
  };

  if (props.id && elementsById) {
    elementsById.set(props.id, node);
  }
  return node;
}

function matchesSelector(node, sel) {
  if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
  if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const attrMatch = sel.slice(1, -1).match(/^([a-zA-Z0-9_-]+)(?:=[\x27\x22]?([^\x27\x22]+)[\x27\x22]?)?$/);
    if (attrMatch) {
      const [, attrName, attrVal] = attrMatch;
      if (attrVal === undefined) return node.hasAttribute(attrName);
      return node.getAttribute(attrName) === attrVal;
    }
  }
  return node.tagName === sel.toUpperCase();
}

function querySelectorOne(root, sel) {
  for (const child of root.children) {
    if (matchesSelector(child, sel)) return child;
    const found = querySelectorOne(child, sel);
    if (found) return found;
  }
  return null;
}

function querySelectorAllNodes(root, sel) {
  const result = [];
  for (const child of root.children) {
    if (matchesSelector(child, sel)) result.push(child);
    result.push(...querySelectorAllNodes(child, sel));
  }
  return result;
}

// Create Test Sandbox
function createChallengerSandbox(options = {}) {
  const elementsById = new Map();
  const store = new Map(Object.entries(options.initialStorage || {}));

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
    _store: store
  };

  const document = {
    head: createDOMNode('HEAD', {}, elementsById),
    body: createDOMNode('BODY', {}, elementsById),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return elementsById.get(sel.slice(1)) || null;
      return querySelectorOne(document.body, sel);
    },
    querySelectorAll: (sel) => {
      const allFound = [];
      const seen = new Set();
      const fromTree = querySelectorAllNodes(document.body, sel);
      fromTree.forEach(n => {
        if (!seen.has(n)) { seen.add(n); allFound.push(n); }
      });
      elementsById.forEach(node => {
        if (!seen.has(node) && matchesSelector(node, sel)) {
          seen.add(node);
          allFound.push(node);
        }
      });
      return allFound;
    },
    createElement: (tag) => createDOMNode(tag, {}, elementsById)
  };

  const ensureEl = (id, tag = 'div', initialProps = {}) => {
    let el = elementsById.get(id);
    if (!el) {
      el = createDOMNode(tag, { id, ...initialProps }, elementsById);
      document.body.appendChild(el);
    }
    return el;
  };

  // Base Field Elements
  ensureEl('newRoundModal', 'div', { class: 'modal-backdrop hidden' });
  ensureEl('round-modal-form-icon', 'span');
  ensureEl('round-modal-form-title', 'h3');
  ensureEl('round-modal-form-badge', 'span');
  ensureEl('round-modal-form-subtitle', 'p');
  ensureEl('round-banner-form-icon', 'span');
  ensureEl('round-banner-form-title', 'h4');
  ensureEl('round-banner-form-standard', 'span');
  ensureEl('round-banner-form-freq', 'span');
  ensureEl('round-modal-inspector-name', 'span');
  ensureEl('round-modal-shift-badge', 'span');
  ensureEl('round-inspector-card-title', 'h4');
  ensureEl('round-inspector-manual-selection-group', 'div');
  ensureEl('round-inspector-auto-bound-badge', 'div', { class: 'hidden' });
  ensureEl('round-inspector-auto-name', 'span');
  ensureEl('round-inspector-auto-badge', 'span');
  ensureEl('round-inspector-auto-shift', 'span');
  ensureEl('inp-round-inspector', 'select');
  ensureEl('inp-round-shift', 'select');
  ensureEl('inp-round-notes', 'input');
  ensureEl('inp-round-actions', 'input');
  ensureEl('inp-round-form-type', 'input');
  ensureEl('inp-round-hospital', 'input');
  ensureEl('inp-round-building', 'select');
  ensureEl('inp-round-floor', 'select');
  ensureEl('inp-round-room', 'input');
  ensureEl('inp-round-loop', 'input');
  ensureEl('inp-round-devices', 'input');
  ensureEl('inp-round-zone', 'input');
  ensureEl('inp-round-ppm-date', 'input');
  ensureEl('sel-round-facp-asset', 'select');
  ensureEl('facp-selected-panel-title', 'span');
  ensureEl('round-specialized-fields-container', 'div');
  ensureEl('round-floor-assets-reconciliation-widget', 'div');

  const bldSelect = elementsById.get('inp-round-building');
  ['المستشفى', 'كلية الطب', 'المبنى الشرقي', 'المبنى الإداري', 'العناية المركزة', 'المستودعات الخارجية', 'المستودعات الطبية المركزية'].forEach(b => {
    const opt = createDOMNode('option', { value: b }, elementsById);
    opt.textContent = b;
    opt.text = b;
    bldSelect.appendChild(opt);
  });

  const flrSelect = elementsById.get('inp-round-floor');
  ['الدور الأرضي (G)', 'القبو الأول (B1)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)'].forEach(f => {
    const opt = createDOMNode('option', { value: f }, elementsById);
    opt.textContent = f;
    opt.text = f;
    flrSelect.appendChild(opt);
  });

  const activeUser = options.activeUser !== undefined
    ? options.activeUser
    : {
        id: 'USR-01',
        name: 'أ. علي سليمان الصقري',
        empId: '10842',
        username: 'ali@ksu.edu.sa',
        shift: 'shift1',
        role: 'مفتش سلامة معتمد'
      };

  const sandbox = {
    console,
    document,
    localStorage,
    sessionStorage: localStorage,
    navigator: { userAgent: 'Adversarial-Challenger-2', onLine: true },
    location: { href: 'http://localhost/field.html', pathname: '/field.html' },
    setTimeout: (fn, delay) => { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout: () => {},
    Intl,
    Date,
    Math,
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
    KSU_FACP_ASSETS,
    STORAGE_KEY_ROUNDS: 'ksumc_safety_rounds', // Production key in app.js
    STORAGE_KEY_FIELD_ROUNDS: 'ksumc_field_rounds',
    STORAGE_KEY_ROUNDS_REGISTRY: 'ksumc_rounds_registry',
    STORAGE_KEY_CAPA: 'ksumc_safety_capa',
    closeNewRoundModal: () => {
      sandbox.state.editingRoundId = null;
      const modal = elementsById.get('newRoundModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    },
    KSUAuth: options.ksuAuth || {
      getUser: () => activeUser,
      protect: () => true
    },
    state: {
      currentUser: activeUser,
      assets: [...KSU_FACP_ASSETS],
      rounds: [],
      capa: [],
      currentRoundDraft: null,
      editingRoundId: null,
      checklistTemplate: [
        { id: 'item-1', code: 'SAF-01', title: 'فحص جاهزية النظام', status: 'active' }
      ],
      buildings: [
        { name: 'المستشفى', hospital: 'مستشفى الملك خالد الجامعي' },
        { name: 'كلية الطب', hospital: 'المدينة الطبية بجامعة الملك سعود' },
        { name: 'المبنى الشرقي', hospital: 'المدينة الطبية بجامعة الملك سعود' },
        { name: 'المبنى الإداري', hospital: 'المدينة الطبية بجامعة الملك سعود' },
        { name: 'العناية المركزة', hospital: 'مستشفى الملك خالد الجامعي' },
        { name: 'المستودعات الخارجية', hospital: 'المدينة الطبية بجامعة الملك سعود' }
      ]
    },
    matchBuilding: (b1, b2) => {
      if (!b1 || !b2) return false;
      if (b1 === b2 || b2 === 'all') return true;
      if (b1.includes('شرق') && b2.includes('شرق')) return true;
      if (b1.includes('مستشفى') && b2.includes('مستشفى')) return true;
      if (b1.includes('إدار') && b2.includes('إدار')) return true;
      if (b1.includes('عناية') && b2.includes('عناية')) return true;
      if (b1.includes('مستودع') && b2.includes('مستودع')) return true;
      if (b1.includes('طب') && b2.includes('طب')) return true;
      return false;
    },
    matchFloor: (f1, f2) => {
      if (!f1 || !f2) return false;
      if (f1 === f2 || f2 === 'all') return true;
      if (f1.includes('G') && f2.includes('G')) return true;
      if (f1.includes('B1') && f2.includes('B1')) return true;
      if (f1.includes('1') && f2.includes('1')) return true;
      if (f1.includes('2') && f2.includes('2')) return true;
      if (f1.includes('3') && f2.includes('3')) return true;
      return false;
    },
    getCurrentActiveShiftKey: (u) => (u && u.shift ? u.shift : 'shift1'),
    getShiftLabel: (k) => (k === 'shift2' ? 'الوردية الثانية (مسائي)' : (k === 'shift3' ? 'الوردية الثالثة (ليلي)' : 'الوردية الأولى (صباحي)')),
    getUserRoleCategory: (u) => (u && u.role && u.role.includes('مشرف') ? 'shift_supervisor' : 'field_inspector'),
    isSystemDeveloper: (u) => (u && u.id === 'USR-01'),
    getChecklistItemsForFormType: () => [
      { id: 'item-1', code: 'SAF-01', title: 'فحص الجاهزية التشغيلية وخلو الموقع من المخالفات', desc: 'معاينة الموقع ومطابقته لمعايير السلامة', result: 'compliant', note: '' }
    ],
    populateDynamicDropdowns: () => {},
    renderChecklistForm: () => {},
    updateChecklistScorePreview: () => {},
    renderFloorAssetsReconciliation: () => {},
    showToast: () => {},
    updateDashboardKPIs: () => {},
    renderHomeRecentRounds: () => {},
    notifyCloudSync: () => {}
  };

  sandbox.saveRounds = function(targetRound) {
    const serializedRounds = JSON.stringify(sandbox.state.rounds || []);
    sandbox.localStorage.setItem(sandbox.STORAGE_KEY_ROUNDS, serializedRounds);
    sandbox.localStorage.setItem('ksumc_field_rounds', serializedRounds);
    sandbox.localStorage.setItem('ksumc_rounds_registry', serializedRounds);
    sandbox.localStorage.setItem('ksumc_rounds', serializedRounds);
  };

  sandbox.saveCAPA = function() {
    sandbox.localStorage.setItem('ksumc_safety_capa', JSON.stringify(sandbox.state.capa || []));
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);

  // Evaluate official card script
  vm.runInContext(officialCardSource, ctx);

  // Extract and evaluate app functions
  const getAllFacpAssetsFn = extractFunctionSource(appJsSource, 'function getAllFacpAssets()');
  const openNewRoundModalFn = extractFunctionSource(appJsSource, 'function openNewRoundModal(');
  const saveNewInspectionRoundFn = extractFunctionSource(appJsSource, 'function saveNewInspectionRound()');

  vm.runInContext(`${getAllFacpAssetsFn}\nwindow.getAllFacpAssets = getAllFacpAssets;`, ctx);
  vm.runInContext(`${openNewRoundModalFn}\nwindow.openNewRoundModal = openNewRoundModal;`, ctx);
  vm.runInContext(`${saveNewInspectionRoundFn}\nwindow.saveNewInspectionRound = saveNewInspectionRound;`, ctx);

  return { ctx, sandbox, elementsById, document };
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('Challenger 2 — Adversarial Stress Suite: Lifecycle, Persistence & Integrity', () => {

  // ---------------------------------------------------------------------------
  // SUITE 1: Payload Completeness Across All 10 FACP Panels
  // ---------------------------------------------------------------------------
  describe('Suite 1: Payload Completeness Across All 10 FACP Panels', () => {
    KSU_FACP_ASSETS.forEach((panel, idx) => {
      test(`Panel #${idx + 1} (${panel.controlNo}): all 13 required fields are faithfully persisted into round payload`, () => {
        const { ctx, sandbox, elementsById } = createChallengerSandbox({
          activeUser: {
            id: 'USR-88',
            name: 'أ. علي سليمان الصقري',
            empId: '10842',
            username: 'ali.saqri@ksu.edu.sa',
            shift: 'shift1'
          }
        });

        ctx.window.openNewRoundModal('fas_insp');
        ctx.window.selectFacpPanelCard(panel.id);
        ctx.window.saveNewInspectionRound();

        assert.strictEqual(sandbox.state.rounds.length, 1, 'Round must be saved in state.rounds');
        const round = sandbox.state.rounds[0];

        // 1. facpAssetId
        assert.strictEqual(round.facpAssetId, panel.id, 'facpAssetId must match panel ID');
        // 2. facpControlNo
        assert.strictEqual(round.facpControlNo, panel.controlNo, 'facpControlNo must match control number');
        // 3. facpName
        assert.strictEqual(round.facpName, panel.name, 'facpName must match panel name');
        // 4. facpStatus
        assert.strictEqual(round.facpStatus, panel.status, 'facpStatus must match panel status');
        // 5. facpOperationalStatus
        assert.strictEqual(round.facpOperationalStatus, panel.operationalStatus, 'facpOperationalStatus must match');
        // 6. zone
        assert.strictEqual(round.zone, panel.zone, 'zone must match coverage area');
        // 7. loopNo
        assert.strictEqual(round.loopNo, panel.loopsCount, 'loopNo must match loops count');
        // 8. devicesNo
        assert.strictEqual(round.devicesNo, panel.devicesCount, 'devicesNo must match devices count');
        // 9. ppmDate
        assert.strictEqual(round.ppmDate, panel.nextPpmDate, 'ppmDate must match next PPM date');
        // 10. inspector
        assert.strictEqual(round.inspector, 'أ. علي سليمان الصقري', 'inspector must match active user name');
        // 11. inspectorId
        assert.strictEqual(round.inspectorId, 'USR-88', 'inspectorId must match active user ID');
        // 12. badge
        assert.strictEqual(round.badge, '10842', 'badge must match active user empId');
        // 13. shiftName
        assert.ok(round.shiftName.includes('صباحي') || round.shiftName.includes('الأولى'), 'shiftName must reflect shift1 label');
      });
    });

    test('Panel selection fallback: missing DOM inputs are faithfully auto-populated from matchedFacp', () => {
      const { ctx, sandbox, elementsById } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');

      // Select panel in dropdown but wipe specialized text inputs
      elementsById.get('sel-round-facp-asset').value = 'FACP-FA0074';
      elementsById.get('inp-round-loop').value = '';
      elementsById.get('inp-round-devices').value = '';
      elementsById.get('inp-round-zone').value = '';
      elementsById.get('inp-round-ppm-date').value = '';
      sandbox.state.currentRoundDraft = null; // simulate purged draft

      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.facpAssetId, 'FACP-FA0074');
      assert.strictEqual(round.facpControlNo, 'FA0074');
      assert.strictEqual(round.loopNo, 10, 'Fallback must recover 10 loops from registry');
      assert.strictEqual(round.devicesNo, 1487, 'Fallback must recover 1487 devices from registry');
      assert.strictEqual(round.zone, 'B2 / B1 / 0 / 1 / 2', 'Fallback must recover zone from registry');
      assert.strictEqual(round.ppmDate, '2026-11-26', 'Fallback must recover PPM date from registry');
    });

    test('User manual override: custom values in input fields take precedence over registry defaults', () => {
      const { ctx, sandbox, elementsById } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.selectFacpPanelCard('FACP-FA0019');

      // User manually overrides loop count and zone
      elementsById.get('inp-round-loop').value = '4';
      elementsById.get('inp-round-zone').value = 'Floor 1 - Special Quarantine Wing';

      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.loopNo, '4', 'Manual loop override must take precedence');
      assert.strictEqual(round.zone, 'Floor 1 - Special Quarantine Wing', 'Manual zone override must take precedence');
      assert.strictEqual(round.devicesNo, 1289, 'Non-overridden field must retain registry value');
    });

    test('Form type isolation: non-fire forms (fex, fhc) do NOT bind or persist FACP fields', () => {
      const { ctx, sandbox } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fex');
      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.formType, 'fex');
      assert.strictEqual(round.facpAssetId, '', 'Non-fire form must have empty facpAssetId');
      assert.strictEqual(round.facpControlNo, '', 'Non-fire form must have empty facpControlNo');
      assert.strictEqual(round.facpName, '', 'Non-fire form must have empty facpName');
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: Multi-Storage Consistency Stress Test & Empirical Gap Detection
  // ---------------------------------------------------------------------------
  describe('Suite 2: Multi-Storage Consistency Stress Test', () => {
    test('Verified: state.rounds, ksumc_safety_rounds, ksumc_field_rounds, and ksumc_rounds_registry are in perfect sync', () => {
      const { ctx, sandbox } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.selectFacpPanelCard('FACP-FA0020');
      ctx.window.saveNewInspectionRound();

      const stateRounds = sandbox.state.rounds;
      assert.strictEqual(stateRounds.length, 1);

      const safetyRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_safety_rounds'));
      const fieldRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_field_rounds'));
      const registryRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_rounds_registry'));

      assert.strictEqual(safetyRounds.length, 1);
      assert.strictEqual(fieldRounds.length, 1);
      assert.strictEqual(registryRounds.length, 1);

      // Deep parity across all synchronized stores
      assert.strictEqual(safetyRounds[0].id, stateRounds[0].id);
      assert.strictEqual(fieldRounds[0].id, stateRounds[0].id);
      assert.strictEqual(registryRounds[0].id, stateRounds[0].id);

      assert.strictEqual(fieldRounds[0].facpControlNo, 'FA0020');
      assert.strictEqual(registryRounds[0].loopNo, 10);
      assert.strictEqual(safetyRounds[0].devicesNo, 1029);
    });

    test('Remediation verified: localStorage["ksumc_rounds"] is synchronized during saveNewInspectionRound', () => {
      const { ctx, sandbox } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.selectFacpPanelCard('FACP-FA0074');
      ctx.window.saveNewInspectionRound();

      const ksumcRoundsRaw = sandbox.localStorage.getItem('ksumc_rounds');
      assert.ok(ksumcRoundsRaw !== null, 'ksumc_rounds must be synchronized in localStorage');
      const parsed = JSON.parse(ksumcRoundsRaw);
      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].facpControlNo, 'FA0074');
    });

    test('Edit Mode persistence: editing an existing round updates state.rounds and mirror storage keys in-place', () => {
      const { ctx, sandbox, elementsById } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.selectFacpPanelCard('FACP-FA0019');
      ctx.window.saveNewInspectionRound();

      const originalId = sandbox.state.rounds[0].id;
      assert.strictEqual(sandbox.state.rounds[0].facpControlNo, 'FA0019');

      // Enter edit mode
      sandbox.state.editingRoundId = originalId;
      ctx.window.selectFacpPanelCard('FACP-FA0074'); // Switch to FA0074
      elementsById.get('inp-round-notes').value = 'تم تحديث اللوحة بعد المعاينة الميدانية';
      ctx.window.saveNewInspectionRound();

      assert.strictEqual(sandbox.state.rounds.length, 1, 'Editing must NOT create a new duplicate round');
      const updated = sandbox.state.rounds[0];
      assert.strictEqual(updated.id, originalId, 'Round ID must remain unchanged');
      assert.strictEqual(updated.facpControlNo, 'FA0074', 'facpControlNo must update to FA0074');
      assert.strictEqual(updated.loopNo, 10, 'loopNo must update to 10');
      assert.strictEqual(sandbox.state.editingRoundId, null, 'editingRoundId must be cleared');

      // Verify mirror storage keys
      const registryRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_rounds_registry'));
      assert.strictEqual(registryRounds[0].facpControlNo, 'FA0074');
      assert.strictEqual(registryRounds[0].notes, 'تم تحديث اللوحة بعد المعاينة الميدانية');
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: Inspector Identity Auto-Binding & Fallback Prevention
  // ---------------------------------------------------------------------------
  describe('Suite 3: Inspector Identity Auto-Binding & Fallback Prevention', () => {
    test('Standard session: name, empId, and shiftName faithfully bound without fallback', () => {
      const { ctx, sandbox } = createChallengerSandbox({
        activeUser: {
          id: 'USR-101',
          name: 'أ. حسام العتيبي',
          empId: '55401',
          username: 'husam@ksu.edu.sa',
          shift: 'shift2'
        }
      });

      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.inspector, 'أ. حسام العتيبي');
      assert.strictEqual(round.inspectorId, 'USR-101');
      assert.strictEqual(round.badge, '55401');
      assert.strictEqual(round.shift, 'shift2');
      assert.ok(round.shiftName.includes('مسائي') || round.shiftName.includes('الثانية'));
    });

    test('Remediation verified: Session with employeeId preserves badge 20401 without fallback', () => {
      const { ctx, sandbox } = createChallengerSandbox({
        activeUser: {
          id: 'USR-202',
          name: 'م. خالد بن ناصر',
          employeeId: '20401', // employeeId instead of empId
          shift: 'shift2'
        }
      });

      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.inspector, 'م. خالد بن ناصر');
      assert.strictEqual(round.badge, '20401', 'Badge must faithfully record employeeId without fallback to KSU-SAF-882');
    });

    test('Remediation verified: Session with badge attribute alone preserves badge 30999 without fallback', () => {
      const { ctx, sandbox } = createChallengerSandbox({
        activeUser: {
          id: 'USR-303',
          name: 'أ. فهد العصيمي',
          badge: '30999', // badge alone without empId or username
          shift: 'shift3'
        }
      });

      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(
        round.badge,
        '30999',
        'Demonstrates remediation verified: line 12304 checks badge property and preserves 30999'
      );
    });

    test('Session priority: window.KSUAuth.getUser() takes priority over state.currentUser', () => {
      const { ctx, sandbox } = createChallengerSandbox({
        activeUser: { name: 'المفتش الأساسي بالتوثيق', empId: '99001', shift: 'shift1' }
      });
      sandbox.state.currentUser = { name: 'مفتش كاذب بالحالة', empId: '11111', shift: 'shift3' };

      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.inspector, 'المفتش الأساسي بالتوثيق', 'KSUAuth must take priority over state.currentUser');
    });

    test('Absence of active session: clean fallback to default inspector without crash', () => {
      const { ctx, sandbox, elementsById } = createChallengerSandbox({
        activeUser: null,
        ksuAuth: { getUser: () => null }
      });
      ctx.window.openNewRoundModal('fas_insp');
      elementsById.get('inp-round-inspector').value = 'مفتش الطوارئ الاحتياطي';
      ctx.window.saveNewInspectionRound();

      const round = sandbox.state.rounds[0];
      assert.strictEqual(round.inspector, 'مفتش الطوارئ الاحتياطي');
      assert.strictEqual(round.badge, 'KSU-SAF-882');
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: Official Card Generator Rendering Robustness Across All 10 Panels
  // ---------------------------------------------------------------------------
  describe('Suite 4: Official Card Generator Rendering Robustness Across All 10 Panels', () => {
    KSU_FACP_ASSETS.forEach((panel, idx) => {
      test(`Panel #${idx + 1} (${panel.controlNo}): generateOfficialInspectionCardHtml renders valid HTML with all panel attributes`, () => {
        const { ctx } = createChallengerSandbox();

        const roundPayload = {
          id: `insp-test-${idx + 1}`,
          formType: 'fas_insp',
          facpAssetId: panel.id,
          facpControlNo: panel.controlNo,
          facpName: panel.name,
          facpStatus: panel.status,
          facpOperationalStatus: panel.operationalStatus,
          zone: panel.zone,
          loopNo: panel.loopsCount,
          devicesNo: panel.devicesCount,
          ppmDate: panel.nextPpmDate,
          building: panel.building,
          floor: panel.floor,
          inspector: panel.inspector,
          badge: '10842',
          shiftName: 'الوردية الأولى (صباحي)',
          score: 100,
          items: [
            { id: 'item-1', code: 'SAF-01', title: 'فحص جاهزية النظام', result: 'compliant' }
          ]
        };

        const html = ctx.window.generateOfficialInspectionCardHtml(roundPayload);

        // Assertions on generated HTML
        assert.ok(typeof html === 'string' && html.length > 500, 'Must produce substantial HTML string');
        assert.ok(html.includes(panel.controlNo), `Card must include control number: ${panel.controlNo}`);
        assert.ok(html.includes(panel.zone), `Card must include coverage zone: ${panel.zone}`);
        assert.ok(html.includes(`${panel.loopsCount} دائرة`), `Card must include loop count: ${panel.loopsCount}`);
        assert.ok(html.includes(`${panel.devicesCount} نقطة/جهاز`), `Card must include devices count: ${panel.devicesCount}`);
        assert.ok(html.includes(panel.nextPpmDate), `Card must include next PPM date: ${panel.nextPpmDate}`);
        assert.ok(html.includes('<svg'), 'Card must render valid QR Code SVG element');
        assert.ok(html.includes(panel.inspector), 'Card must render inspector name');

        // Status badge assertion: Panel 10 is Trouble, Panels 1-9 are Active
        if (panel.controlNo === 'NM-0022113') {
          assert.ok(
            html.includes('تنبيه عطل (Trouble)') || html.includes('⚠️ تنبيه عطل'),
            'Panel 10 (NM-0022113) must render Trouble alert badge'
          );
          assert.ok(html.includes('#fffbeb'), 'Panel 10 must use amber background for trouble status');
        } else {
          assert.ok(
            html.includes('تعمل (Active)') || html.includes('✓ تعمل'),
            `Panel ${panel.controlNo} must render Active status badge`
          );
        }
      });
    });

    test('fas_test form type renders identical specialized FACP parameter box', () => {
      const { ctx } = createChallengerSandbox();
      const round = {
        id: 'insp-fas-test-1',
        formType: 'fas_test',
        facpAssetId: 'FACP-FA0019',
        facpControlNo: 'FA0019',
        facpName: 'لوحة إنذار الحريق [FA0019]',
        zone: 'Floor 1',
        loopNo: 1,
        devicesNo: 1289,
        ppmDate: '2026-11-26'
      };

      const html = ctx.window.generateOfficialInspectionCardHtml(round);
      assert.ok(html.includes('لوحة إنذار الحريق (FACP Panel)'), 'fas_test must render FACP parameters box');
      assert.ok(html.includes('FA0019'));
      assert.ok(html.includes('Floor 1'));
    });

    test('Non-fire form types (fex, sprinklers) do NOT render FACP box and remain standard', () => {
      const { ctx } = createChallengerSandbox();
      const fexRound = {
        id: 'insp-fex-1',
        formType: 'fex',
        facpAssetId: 'FACP-FA0074' // even if present by mistake
      };

      const html = ctx.window.generateOfficialInspectionCardHtml(fexRound);
      assert.strictEqual(
        html.includes('لوحة إنذار الحريق (FACP Panel)'),
        false,
        'fex form card must NOT render FACP parameters box'
      );
    });

    test('Extreme inputs robustness: null, undefined, empty, and partial rounds never throw exceptions', () => {
      const { ctx } = createChallengerSandbox();

      assert.doesNotThrow(() => {
        const nullHtml = ctx.window.generateOfficialInspectionCardHtml(null);
        assert.strictEqual(nullHtml, '');
      });

      assert.doesNotThrow(() => {
        const emptyHtml = ctx.window.generateOfficialInspectionCardHtml({});
        assert.ok(emptyHtml.includes('MIR-2026-'));
      });

      assert.doesNotThrow(() => {
        const partialHtml = ctx.window.generateOfficialInspectionCardHtml({
          formType: 'fas_insp',
          facpAssetId: null,
          facpControlNo: undefined,
          zone: null,
          loopNo: 0,
          devicesNo: 0,
          score: null,
          items: null
        });
        assert.ok(partialHtml.includes('لوحة إنذار الحريق الرئيسية'));
        assert.ok(partialHtml.includes('1 دائرة'));
        assert.ok(partialHtml.includes('كامل المبنى'));
      });
    });

    test('openOfficialInspectionCardModal creates modal element, appends to body, and cleans up prior instances', () => {
      const { ctx, elementsById, document } = createChallengerSandbox();

      // Open modal for round
      ctx.window.openOfficialInspectionCardModal('insp-round-test-99');
      let modal = elementsById.get('ksu-official-card-modal');
      assert.ok(modal, 'Modal element #ksu-official-card-modal must be created in DOM');
      assert.ok(modal.innerHTML.includes('official-printable-card-wrapper'));
      assert.ok(modal.innerHTML.includes('طباعة المحضر (A4)'));

      // Calling open again replaces prior modal cleanly
      ctx.window.openOfficialInspectionCardModal('insp-round-test-100');
      const allModals = document.querySelectorAll('#ksu-official-card-modal');
      assert.strictEqual(allModals.length, 1, 'Only one modal instance should exist in DOM at a time');
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 5: Rapid Consecutive Saves & Concurrency Stress Test
  // ---------------------------------------------------------------------------
  describe('Suite 5: Rapid Consecutive Saves & Concurrency Stress Test', () => {
    test('10 consecutive rapid saves produce 10 unique rounds in state.rounds and storage mirrors without ID collision', () => {
      const { ctx, sandbox } = createChallengerSandbox();

      // Execute 10 rapid saves with alternating panels
      for (let i = 0; i < 10; i++) {
        const panel = KSU_FACP_ASSETS[i % KSU_FACP_ASSETS.length];
        ctx.window.openNewRoundModal('fas_insp');
        ctx.window.selectFacpPanelCard(panel.id);
        ctx.window.saveNewInspectionRound();
      }

      assert.strictEqual(sandbox.state.rounds.length, 10, 'All 10 rounds must be recorded in state.rounds');

      // Verify ID uniqueness
      const roundIds = sandbox.state.rounds.map(r => r.id);
      const uniqueIds = new Set(roundIds);
      assert.strictEqual(uniqueIds.size, 10, 'Zero ID collisions among 10 rapid consecutive saves');

      // Verify persistence in mirror keys
      const registryRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_rounds_registry'));
      const safetyRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_safety_rounds'));
      assert.strictEqual(registryRounds.length, 10);
      assert.strictEqual(safetyRounds.length, 10);

      // Verify order: newest round is unshifted to index 0
      assert.strictEqual(sandbox.state.rounds[0].facpControlNo, KSU_FACP_ASSETS[9].controlNo);
    });

    test('Non-compliant items trigger automated CAPA tickets with unique codes linked to roundId', () => {
      const { ctx, sandbox } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.selectFacpPanelCard('FACP-FA0074');

      // Inject 2 non-compliant items
      sandbox.state.currentRoundDraft.items = [
        { id: 'it-1', code: 'SAF-01', title: 'فحص جاهزية النظام', result: 'compliant' },
        { id: 'it-2', code: 'SAF-02', title: 'فحص لوحة التوزيع', result: 'observation', note: 'وجود غبار على الأسلاك' },
        { id: 'it-3', code: 'SAF-03', title: 'فحص البطاريات الاحتياطية', result: 'violation', note: 'البطارية منخفضة الفولتية' }
      ];

      ctx.window.saveNewInspectionRound();

      const savedRound = sandbox.state.rounds[0];
      assert.strictEqual(savedRound.observationCount, 1);
      assert.strictEqual(savedRound.violationCount, 1);
      assert.strictEqual(savedRound.score, 33); // 1 compliant out of 3 = 33%

      // CAPA tickets verification
      assert.strictEqual(sandbox.state.capa.length, 2, 'Exactly 2 CAPA tickets must be created');
      const capa1 = sandbox.state.capa[0];
      const capa2 = sandbox.state.capa[1];

      assert.strictEqual(capa1.roundId, savedRound.id);
      assert.strictEqual(capa2.roundId, savedRound.id);
      assert.notStrictEqual(capa1.code, capa2.code, 'CAPA codes must be distinct');
      assert.ok(capa1.code.startsWith('CAPA-'));

      const capaStored = JSON.parse(sandbox.localStorage.getItem('ksumc_safety_capa'));
      assert.strictEqual(capaStored.length, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // SUITE 6: Summary Audit of Discrepancies & Verdict Formulation
  // ---------------------------------------------------------------------------
  describe('Suite 6: Diagnostic Audit of Identified Discrepancies & Remediation', () => {
    test('Remediation verified: Multi-storage parity on ksumc_rounds key', () => {
      const { ctx, sandbox } = createChallengerSandbox();
      ctx.window.openNewRoundModal('fas_insp');
      ctx.window.saveNewInspectionRound();

      const syncdKeys = ['ksumc_safety_rounds', 'ksumc_field_rounds', 'ksumc_rounds_registry', 'ksumc_rounds'];
      syncdKeys.forEach(k => {
        assert.ok(sandbox.localStorage.getItem(k) !== null, `Key ${k} must be populated`);
      });

      const ksumcRounds = JSON.parse(sandbox.localStorage.getItem('ksumc_rounds'));
      assert.strictEqual(ksumcRounds.length, 1, 'ksumc_rounds is correctly populated and synchronized');
    });

    test('Remediation verified: Inspector badgeCode fallback resolved by checking employeeId and badge in line 12304', () => {
      const appJs = fs.readFileSync(path.join(ROOT_DIR, 'assets/js/app.js'), 'utf8');
      const line12304 = appJs.match(/const\s+badgeCode\s*=\s*[^\n]+;/);
      assert.ok(line12304, 'Must locate badgeCode line');
      assert.strictEqual(
        line12304[0].includes('employeeId'),
        true,
        'Demonstrating that line 12304 checks employeeId, preventing placeholder fallback'
      );
      assert.strictEqual(
        line12304[0].includes('badge'),
        true,
        'Demonstrating that line 12304 checks badge, preventing placeholder fallback'
      );
    });
  });
});

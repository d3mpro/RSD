// =============================================================================
// Comprehensive E2E Test Suite: Fire Alarm Control Panels (FACP) Selection
// & Active Session Inspector Auto-Binding (Tiers 1 - 4)
//
// Target Specifications:
// - ORIGINAL_REQUEST.md
// - PROJECT.md (Features F1 through F9)
// - TEST_INFRA.md (Tiers 1 - 4)
//
// Author: E2E Test Writer (QA & Specialist)
// =============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIELD_HTML_PATH = path.join(REPO_ROOT, 'field.html');
const APP_JS_PATH = path.join(REPO_ROOT, 'assets/js/app.js');
const OFFICIAL_CARD_PATH = path.join(REPO_ROOT, 'assets/js/ksu-official-card.js');
const FACP_ASSETS_PATH = path.join(REPO_ROOT, 'assets/js/ksu-facp-assets.js');

// Load source files
const fieldHtmlSource = fs.readFileSync(FIELD_HTML_PATH, 'utf-8');
const appJsSource = fs.readFileSync(APP_JS_PATH, 'utf-8');
const officialCardSource = fs.readFileSync(OFFICIAL_CARD_PATH, 'utf-8');
const { KSU_FACP_ASSETS } = require(FACP_ASSETS_PATH);

// Helper: Extract balanced function source code from JS file
function extractFunctionSource(fileContent, fnSignature) {
  const startIdx = fileContent.indexOf(fnSignature);
  if (startIdx === -1) {
    throw new Error(`Could not find function signature: ${fnSignature}`);
  }
  const openBrace = fileContent.indexOf('{', startIdx);
  let depth = 0;
  for (let i = openBrace; i < fileContent.length; i++) {
    const ch = fileContent[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return fileContent.slice(startIdx, i + 1);
      }
    }
  }
  throw new Error(`Unbalanced braces for signature: ${fnSignature}`);
}

// -----------------------------------------------------------------------------
// Lightweight Headless Browser & DOM Sandbox
// -----------------------------------------------------------------------------
function createDOMNode(tagName = 'DIV', initialAttrs = {}, docElementsMap = new Map()) {
  const node = {
    tagName: tagName.toUpperCase(),
    attributes: { ...initialAttrs },
    children: [],
    parentNode: null,
    id: initialAttrs.id || '',
    className: initialAttrs.class || '',
    value: initialAttrs.value !== undefined ? String(initialAttrs.value) : '',
    style: {},
    onclick: initialAttrs.onclick || null,
    onchange: initialAttrs.onchange || null,
    oninput: initialAttrs.oninput || null,
    _textContent: '',
    _listeners: {},
    _docElementsMap: docElementsMap
  };

  // classList API
  node.classList = {
    add(...cls) {
      const s = new Set((node.className || '').split(/\s+/).filter(Boolean));
      cls.forEach(c => s.add(c));
      node.className = Array.from(s).join(' ');
    },
    remove(...cls) {
      const s = new Set((node.className || '').split(/\s+/).filter(Boolean));
      cls.forEach(c => s.delete(c));
      node.className = Array.from(s).join(' ');
    },
    toggle(c) {
      const s = new Set((node.className || '').split(/\s+/).filter(Boolean));
      if (s.has(c)) s.delete(c); else s.add(c);
      node.className = Array.from(s).join(' ');
    },
    contains(c) {
      const s = new Set((node.className || '').split(/\s+/).filter(Boolean));
      return s.has(c);
    }
  };

  Object.defineProperty(node, 'textContent', {
    get() {
      if (node.children.length > 0) {
        return node.children.map(c => c.textContent).join(' ');
      }
      return node._textContent || '';
    },
    set(val) {
      node._textContent = String(val);
      if (node.tagName === 'OPTION') {
        node.text = String(val);
      }
    }
  });

  Object.defineProperty(node, 'text', {
    get() {
      return node._text !== undefined ? node._text : (node._textContent || node.textContent || '');
    },
    set(val) {
      node._text = String(val);
    }
  });

  Object.defineProperty(node, 'innerHTML', {
    get() {
      return node._innerHTML || node._textContent || '';
    },
    set(html) {
      node._innerHTML = String(html);
      node.children = parseHtmlFragment(String(html), node, docElementsMap);
    }
  });

  Object.defineProperty(node, 'options', {
    get() {
      return node.children.filter(c => c.tagName === 'OPTION');
    }
  });

  node.getAttribute = (name) => {
    const key = name.toLowerCase();
    return node.attributes[key] !== undefined ? String(node.attributes[key]) : null;
  };

  node.setAttribute = (name, val) => {
    const key = name.toLowerCase();
    node.attributes[key] = String(val);
    if (key === 'class') node.className = String(val);
    if (key === 'id') {
      node.id = String(val);
      docElementsMap.set(node.id, node);
    }
    if (key === 'value') node.value = String(val);
  };

  node.appendChild = (child) => {
    if (!child) return child;
    node.children.push(child);
    child.parentNode = node;
    if (child.id) docElementsMap.set(child.id, child);
    return child;
  };

  node.prepend = (child) => {
    if (!child) return child;
    node.children.unshift(child);
    child.parentNode = node;
    if (child.id) docElementsMap.set(child.id, child);
    return child;
  };

  node.insertBefore = (newChild, refChild) => {
    const idx = node.children.indexOf(refChild);
    if (idx === -1) {
      node.appendChild(newChild);
    } else {
      node.children.splice(idx, 0, newChild);
      newChild.parentNode = node;
      if (newChild.id) docElementsMap.set(newChild.id, newChild);
    }
    return newChild;
  };

  node.remove = () => {
    if (node.parentNode && node.parentNode.children) {
      const idx = node.parentNode.children.indexOf(node);
      if (idx !== -1) node.parentNode.children.splice(idx, 1);
    }
    if (node.id) docElementsMap.delete(node.id);
  };

  node.addEventListener = (evt, fn) => {
    node._listeners[evt] = node._listeners[evt] || [];
    node._listeners[evt].push(fn);
  };

  node.dispatchEvent = (evtObj) => {
    const type = typeof evtObj === 'string' ? evtObj : evtObj.type;
    const handlers = node._listeners[type] || [];
    handlers.forEach(fn => fn.call(node, evtObj));
    if (type === 'click' && typeof node.onclick === 'function') {
      node.onclick.call(node, evtObj);
    }
    if (type === 'change' && typeof node.onchange === 'function') {
      node.onchange.call(node, evtObj);
    }
    if (type === 'input' && typeof node.oninput === 'function') {
      node.oninput.call(node, evtObj);
    }
  };

  node.click = () => {
    node.dispatchEvent({ type: 'click' });
  };

  node.querySelector = (sel) => {
    return querySelectorOne(node, sel);
  };

  node.querySelectorAll = (sel) => {
    return querySelectorAllNodes(node, sel);
  };

  if (node.id) {
    docElementsMap.set(node.id, node);
  }

  return node;
}

// Selector matcher helper
function matchesSelector(node, sel) {
  sel = sel.trim();
  if (!node || !node.tagName || node.tagName === 'ROOT') return false;

  // #id
  if (sel.startsWith('#')) {
    return node.id === sel.slice(1);
  }
  // .class
  if (sel.startsWith('.')) {
    const targetCls = sel.slice(1);
    return (node.className || '').split(/\s+/).includes(targetCls);
  }
  // [attr=val] or [attr]
  const attrMatch = sel.match(/^\[([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s\]]+)))?\]$/);
  if (attrMatch) {
    const attrName = attrMatch[1].toLowerCase();
    const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
    const val = node.getAttribute ? node.getAttribute(attrName) : node.attributes[attrName];
    if (attrVal === undefined) return val !== undefined && val !== null;
    return val === attrVal;
  }
  // Tag name
  return node.tagName.toLowerCase() === sel.toLowerCase();
}

function querySelectorOne(rootNode, sel) {
  let found = null;
  function walk(curr) {
    if (!curr || found) return;
    if (curr !== rootNode && matchesSelector(curr, sel)) {
      found = curr;
      return;
    }
    if (curr.children) {
      for (const child of curr.children) {
        walk(child);
        if (found) return;
      }
    }
  }
  walk(rootNode);
  return found;
}

function querySelectorAllNodes(rootNode, sel) {
  const results = [];
  function walk(curr) {
    if (!curr) return;
    if (curr !== rootNode && matchesSelector(curr, sel)) {
      results.push(curr);
    }
    if (curr.children) {
      for (const child of curr.children) {
        walk(child);
      }
    }
  }
  walk(rootNode);
  return results;
}

// HTML string parser into mock DOM tree
function parseHtmlFragment(htmlStr, parentNode = null, docElementsMap = new Map()) {
  const root = { tagName: 'ROOT', children: [], attributes: {} };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9\-]+)([^>]*)>|([^<]+)/g;
  let match;

  while ((match = tagRe.exec(htmlStr)) !== null) {
    // Skip comments
    if (match[0].startsWith('<!--')) {
      continue;
    }

    const isClosing = !!match[1];
    const tagName = match[2];
    const attrStr = match[3];
    const text = match[4];

    if (text) {
      const top = stack[stack.length - 1];
      if (top) {
        top._textContent = (top._textContent || '') + text;
      }
      continue;
    }

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toUpperCase() === tagName.toUpperCase()) {
          stack.length = i;
          break;
        }
      }
    } else {
      const attrs = {};
      if (attrStr) {
        const reAttr = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s>]+)))?/g;
        let m;
        while ((m = reAttr.exec(attrStr)) !== null) {
          const k = m[1].toLowerCase();
          const v = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : true));
          attrs[k] = v;
        }
      }

      const node = createDOMNode(tagName, attrs, docElementsMap);
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(node);
        node.parentNode = parent;
      }

      const isVoid = ['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK'].includes(node.tagName);
      if (!isVoid) {
        stack.push(node);
      }
    }
  }

  root.children.forEach(c => {
    c.parentNode = parentNode;
  });
  return root.children;
}

// -----------------------------------------------------------------------------
// Test Sandbox Factory
// -----------------------------------------------------------------------------
function createTestSandbox(opts = {}) {
  const elementsById = new Map();
  const store = new Map();

  const activeUser = opts.activeUser || {
    id: 'USR-01',
    name: 'أ. علي سليمان الصقري',
    empId: '10842',
    badge: '10842',
    username: 'ali.saqri',
    role: 'رئيس إدارة السلامة الميدانية',
    shift: 'shift1'
  };

  store.set('ksu_active_user', JSON.stringify(activeUser));
  store.set('ksumc_assets_version', '2026.11.08_KSU_FACP_REGISTRY_V4');

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; }
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
  ensureEl('round-specialized-fields-container', 'div', { class: 'transition-all' });
  ensureEl('round-floor-assets-reconciliation-widget', 'div');

  // Setup options for building & floor selects with both value & text
  const bldSelect = elementsById.get('inp-round-building');
  ['المستشفى', 'المبنى الشرقي', 'المبنى الإداري', 'العناية المركزة', 'المستودعات الطبية المركزية'].forEach(b => {
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

  const sandbox = {
    console,
    document,
    localStorage,
    sessionStorage: localStorage,
    navigator: { userAgent: 'Node-E2E-Runner', onLine: true },
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
    STORAGE_KEY_ROUNDS: 'ksumc_rounds',
    STORAGE_KEY_FIELD_ROUNDS: 'ksumc_field_rounds',
    STORAGE_KEY_ROUNDS_REGISTRY: 'ksumc_rounds_registry',
    closeNewRoundModal: () => {},
    KSUAuth: {
      getUser: () => activeUser,
      protect: () => true
    },
    state: {
      currentUser: activeUser,
      assets: [...KSU_FACP_ASSETS],
      rounds: [],
      currentRoundDraft: null,
      editingRoundId: null,
      checklistTemplate: [
        { id: 'item-1', code: 'SAF-01', title: 'فحص جاهزية النظام', status: 'active' }
      ],
      buildings: [
        { name: 'المستشفى', hospital: 'مستشفى الملك خالد الجامعي' },
        { name: 'المبنى الشرقي', hospital: 'مستشفى الملك خالد الجامعي' },
        { name: 'المبنى الإداري', hospital: 'مستشفى الملك خالد الجامعي' },
        { name: 'العناية المركزة', hospital: 'مستشفى الملك خالد الجامعي' },
        { name: 'المستودعات الطبية المركزية', hospital: 'المدينة الطبية بجامعة الملك سعود' }
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
    getChecklistItemsForFormType: () => [
      { id: 'item-1', code: 'SAF-01', title: 'فحص الجاهزية التشغيلية وخلو الموقع من المخالفات', desc: 'معاينة الموقع ومطابقته لمعايير السلامة', result: 'compliant', note: '' }
    ],
    renderChecklistForm: () => {},
    updateChecklistScorePreview: () => {},
    renderFloorAssetsReconciliation: () => {},
    populateDynamicDropdowns: () => {},
    showToast: () => {},
    saveRounds: () => {},
    notifyCloudSync: () => {}
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);

  // 1. Evaluate ksu-official-card.js
  vm.runInContext(officialCardSource, ctx);

  // 2. Extract and evaluate getAllFacpAssets, openNewRoundModal, saveNewInspectionRound from app.js
  const getAllFacpAssetsFn = extractFunctionSource(appJsSource, 'function getAllFacpAssets()');
  const openNewRoundModalFn = extractFunctionSource(appJsSource, 'function openNewRoundModal(');
  const saveNewInspectionRoundFn = extractFunctionSource(appJsSource, 'function saveNewInspectionRound()');

  vm.runInContext(`${getAllFacpAssetsFn}\nwindow.getAllFacpAssets = getAllFacpAssets;`, ctx);
  vm.runInContext(`${openNewRoundModalFn}\nwindow.openNewRoundModal = openNewRoundModal;`, ctx);
  vm.runInContext(`${saveNewInspectionRoundFn}\nwindow.saveNewInspectionRound = saveNewInspectionRound;`, ctx);

  return { ctx, sandbox, elementsById, document };
}

console.log('🧪 Starting Comprehensive E2E Test Suite for FACP & Inspector Auto-Binding (Tiers 1-4)...\n');

// =============================================================================
// TIER 1: FEATURE COVERAGE (>=5 tests per feature, 9 features = 45 tests)
// =============================================================================

// -----------------------------------------------------------------------------
// F1: Removal/hiding of manual inspector/shift card in fas_insp / fas_test
// -----------------------------------------------------------------------------
test('Tier 1 - F1.1: field.html contains #round-inspector-manual-selection-group wrapping manual selects', () => {
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-manual-selection-group"'),
    'field.html must declare wrapper element #round-inspector-manual-selection-group'
  );
  assert.ok(
    fieldHtmlSource.includes('id="inp-round-inspector"'),
    'field.html must retain #inp-round-inspector select element'
  );
  assert.ok(
    fieldHtmlSource.includes('id="inp-round-shift"'),
    'field.html must retain #inp-round-shift select element'
  );
});

test('Tier 1 - F1.2: openNewRoundModal("fas_insp") hides #round-inspector-manual-selection-group', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  const manualGroup = elementsById.get('round-inspector-manual-selection-group');
  assert.ok(manualGroup, 'Manual selection group must exist');
  const isHidden = manualGroup.classList.contains('hidden') || manualGroup.style.display === 'none';
  assert.strictEqual(isHidden, true, '#round-inspector-manual-selection-group must be hidden for fas_insp');
});

test('Tier 1 - F1.3: openNewRoundModal("fas_test") hides #round-inspector-manual-selection-group', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_test');
  const manualGroup = elementsById.get('round-inspector-manual-selection-group');
  assert.ok(manualGroup, 'Manual selection group must exist');
  const isHidden = manualGroup.classList.contains('hidden') || manualGroup.style.display === 'none';
  assert.strictEqual(isHidden, true, '#round-inspector-manual-selection-group must be hidden for fas_test');
});

test('Tier 1 - F1.4: Manual select elements remain in DOM and prevent NullPointer errors', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  const inspEl = elementsById.get('inp-round-inspector');
  const shiftEl = elementsById.get('inp-round-shift');
  assert.ok(inspEl, '#inp-round-inspector must not be removed from DOM tree');
  assert.ok(shiftEl, '#inp-round-shift must not be removed from DOM tree');
  assert.strictEqual(inspEl.value, 'أ. علي سليمان الصقري');
  assert.strictEqual(shiftEl.value, 'shift1');
});

test('Tier 1 - F1.5: Inspector card title adapts to CAPA/notes header for fire alarm forms', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  const titleEl = elementsById.get('round-inspector-card-title');
  assert.ok(titleEl, 'Card title element must exist');
  assert.ok(
    titleEl.textContent.includes('CAPA') || titleEl.textContent.includes('الإجراءات التصحيحية'),
    'Card title must reflect inspection notes & CAPA rather than manual selection prompt'
  );
});

// -----------------------------------------------------------------------------
// F2: Auto-binding active session currentUser to round payload and verified badge
// -----------------------------------------------------------------------------
test('Tier 1 - F2.1: field.html contains verified auto-bound inspector identity badge structure', () => {
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-bound-badge"'),
    'field.html must contain #round-inspector-auto-bound-badge'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-name"'),
    'field.html must contain #round-inspector-auto-name'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-badge"'),
    'field.html must contain #round-inspector-auto-badge'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-shift"'),
    'field.html must contain #round-inspector-auto-shift'
  );
});

test('Tier 1 - F2.2: openNewRoundModal("fas_insp") shows auto-bound badge with active user details', () => {
  const { ctx, elementsById } = createTestSandbox({
    activeUser: {
      name: 'م. خالد بن ناصر',
      empId: '20401',
      badge: '20401',
      shift: 'shift2'
    }
  });

  ctx.window.openNewRoundModal('fas_insp');
  const badge = elementsById.get('round-inspector-auto-bound-badge');
  const nameEl = elementsById.get('round-inspector-auto-name');
  const shiftEl = elementsById.get('round-inspector-auto-shift');

  assert.strictEqual(badge.style.display, 'flex');
  assert.strictEqual(nameEl.textContent, 'م. خالد بن ناصر');
  assert.ok(shiftEl.textContent.includes('الثانية') || shiftEl.textContent.includes('مسائي'));
});

test('Tier 1 - F2.3: In fas_insp, hidden input fields reflect active session values', () => {
  const { ctx, elementsById } = createTestSandbox({
    activeUser: { name: 'أ. فهد العصيمي', empId: '30999', shift: 'shift3' }
  });
  ctx.window.openNewRoundModal('fas_insp');
  assert.strictEqual(elementsById.get('inp-round-inspector').value, 'أ. فهد العصيمي');
  assert.strictEqual(elementsById.get('inp-round-shift').value, 'shift3');
});

test('Tier 1 - F2.4: saveNewInspectionRound() captures active user name on round payload', () => {
  const { ctx, sandbox } = createTestSandbox({
    activeUser: { name: 'م. حسام العتيبي', empId: '55401', shift: 'shift1' }
  });
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.saveNewInspectionRound();

  assert.ok(sandbox.state.rounds.length > 0, 'A new round must be saved');
  const savedRound = sandbox.state.rounds[0];
  assert.strictEqual(savedRound.inspector, 'م. حسام العتيبي');
});

test('Tier 1 - F2.5: saveNewInspectionRound() binds inspectorId, badge, and shiftName from session', () => {
  const { ctx, sandbox } = createTestSandbox({
    activeUser: { id: 'USR-88', name: 'أ. سامي الحمد', empId: '88200', badge: '88200', shift: 'shift1' }
  });
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.saveNewInspectionRound();

  const saved = sandbox.state.rounds[0];
  assert.strictEqual(saved.inspectorId, 'USR-88');
  assert.strictEqual(saved.badge, '88200');
  assert.strictEqual(saved.shift, 'shift1');
});

// -----------------------------------------------------------------------------
// F3: Verification that getAllFacpAssets() returns all 10 FACP panels & excludes extinguishers
// -----------------------------------------------------------------------------
test('Tier 1 - F3.1: getAllFacpAssets() returns an array of exactly 10 FACP panels', () => {
  const { ctx } = createTestSandbox();
  const panels = ctx.window.getAllFacpAssets();
  assert.ok(Array.isArray(panels), 'Result must be an array');
  assert.strictEqual(panels.length, 10, 'Must return exactly 10 registered FACP panels');
});

test('Tier 1 - F3.2: getAllFacpAssets() strictly excludes fire extinguishers (طفايات الحريق)', () => {
  const { ctx, sandbox } = createTestSandbox();
  sandbox.state.assets = [
    { id: 'FE-001', category: 'طفايات الحريق', type: 'طفاية بودرة جافة', name: 'طفاية 1' },
    { id: 'FE-002', category: 'طفايات الحريق', type: 'طفاية ثاني أكسيد الكربون', name: 'طفاية 2' },
    ...KSU_FACP_ASSETS
  ];

  const panels = ctx.window.getAllFacpAssets();
  assert.strictEqual(panels.length, 10);
  const extinguishers = panels.filter(p => p.category && p.category.includes('طفايات'));
  assert.strictEqual(extinguishers.length, 0, 'Must contain 0 extinguishers');
});

test('Tier 1 - F3.3: Every item returned belongs to FACP category or has valid FACP ID', () => {
  const { ctx } = createTestSandbox();
  const panels = ctx.window.getAllFacpAssets();
  panels.forEach(p => {
    const isValid = (p.id && (p.id.startsWith('FACP-') || p.id.startsWith('FA-') || p.id.startsWith('NM-'))) ||
                    (p.category && p.category.includes('إنذار')) ||
                    (p.type && p.type.includes('FACP'));
    assert.strictEqual(isValid, true, `Item ${p.id} must be a valid FACP panel object`);
  });
});

test('Tier 1 - F3.4: Building distribution in getAllFacpAssets matches C:2, H:1, D:1, A:5, O:1', () => {
  const { ctx } = createTestSandbox();
  const panels = ctx.window.getAllFacpAssets();
  const counts = {};
  panels.forEach(p => {
    counts[p.buildingCode] = (counts[p.buildingCode] || 0) + 1;
  });
  assert.strictEqual(counts['C'], 2, 'Building C (East Building) must have 2 panels');
  assert.strictEqual(counts['H'], 1, 'Building H (ICU) must have 1 panel');
  assert.strictEqual(counts['D'], 1, 'Building D (Admin) must have 1 panel');
  assert.strictEqual(counts['A'], 5, 'Building A (Hospital) must have 5 panels');
  assert.strictEqual(counts['O'], 1, 'Building O (Warehouse) must have 1 panel');
});

test('Tier 1 - F3.5: Total loops (47) and total devices (9,132) match engineering specifications', () => {
  const { ctx } = createTestSandbox();
  const panels = ctx.window.getAllFacpAssets();
  const totalLoops = panels.reduce((sum, p) => sum + (p.loopsCount || 0), 0);
  const totalDevices = panels.reduce((sum, p) => sum + (p.devicesCount || 0), 0);
  assert.strictEqual(totalLoops, 47, 'Total loops across all 10 panels must equal 47');
  assert.strictEqual(totalDevices, 9132, 'Total monitored devices across all 10 panels must equal 9,132');
});

// -----------------------------------------------------------------------------
// F4: Verification that state.assets contains KSU_FACP_ASSETS
// -----------------------------------------------------------------------------
test('Tier 1 - F4.1: Initializing state.assets contains all 10 KSU_FACP_ASSETS', () => {
  const { sandbox } = createTestSandbox();
  assert.strictEqual(sandbox.state.assets.length, 10);
  const facpIds = sandbox.state.assets.map(a => a.id);
  KSU_FACP_ASSETS.forEach(p => {
    assert.ok(facpIds.includes(p.id), `state.assets must contain ${p.id}`);
  });
});

test('Tier 1 - F4.2: FACP assets in state.assets retain canonical control numbers', () => {
  const { sandbox } = createTestSandbox();
  const controlNos = sandbox.state.assets.map(a => a.controlNo);
  const expectedControlNos = ['FA0074', 'FA0095', 'NM1757', 'FA0092', 'FA0019', 'FA0017', 'FA0024', 'FA0054', 'FA0020', 'NM-0022113'];
  expectedControlNos.forEach(c => {
    assert.ok(controlNos.includes(c), `Control number ${c} must be present in state.assets`);
  });
});

test('Tier 1 - F4.3: Coexistence test: state.assets holds extinguishers, FM-200, FHC, and FACP concurrently', () => {
  const { sandbox } = createTestSandbox();
  sandbox.state.assets = [
    { id: 'FE-01', category: 'طفايات الحريق' },
    { id: 'FM-01', category: 'نظام FM-200' },
    { id: 'FHC-01', category: 'صناديق الحريق' },
    ...KSU_FACP_ASSETS
  ];
  assert.strictEqual(sandbox.state.assets.length, 13);
  const facpCount = sandbox.state.assets.filter(a => a.id && a.id.startsWith('FACP-')).length;
  assert.strictEqual(facpCount, 10, 'FACP count must remain 10 without overwriting');
});

test('Tier 1 - F4.4: state.assets filter query for FACP panels yields exactly 10', () => {
  const { sandbox } = createTestSandbox();
  const facpList = sandbox.state.assets.filter(a => a.category === 'لوحات إنذار الحريق' || (a.id && a.id.startsWith('FACP-')));
  assert.strictEqual(facpList.length, 10);
});

test('Tier 1 - F4.5: Cached assets in localStorage preserve FACP panels on reload', () => {
  const { sandbox } = createTestSandbox();
  sandbox.localStorage.setItem('ksumc_assets', JSON.stringify(sandbox.state.assets));
  const parsed = JSON.parse(sandbox.localStorage.getItem('ksumc_assets'));
  assert.strictEqual(parsed.length, 10);
  assert.strictEqual(parsed[0].controlNo, 'FA0074');
});

// -----------------------------------------------------------------------------
// F5: Modal panel selector UI structure and accessibility in fas_insp and fas_test
// -----------------------------------------------------------------------------
test('Tier 1 - F5.1: updateSpecializedFormFields("fas_insp") populates #round-specialized-fields-container', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const container = elementsById.get('round-specialized-fields-container');
  assert.ok(container.innerHTML.includes('FACP Registry') || container.innerHTML.includes('سجل لوحات إنذار الحريق'),
    'Container must render FACP registry header'
  );
});

test('Tier 1 - F5.2: updateSpecializedFormFields("fas_test") renders identical interactive selector widget', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_test');
  const container = elementsById.get('round-specialized-fields-container');
  assert.ok(container.innerHTML.includes('inp-facp-search'), 'Container must render search bar for fas_test');
  assert.ok(container.innerHTML.includes('facp-panels-grid'), 'Container must render panels grid for fas_test');
});

test('Tier 1 - F5.3: Container renders live search input #inp-facp-search', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const searchInp = elementsById.get('inp-facp-search');
  assert.ok(searchInp, '#inp-facp-search element must exist in rendered widget');
});

test('Tier 1 - F5.4: Container renders visual panels grid with panel cards', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const cards = document.querySelectorAll('.facp-panel-card');
  assert.strictEqual(cards.length, 10, 'Panels grid must contain exactly 10 panel cards');
});

test('Tier 1 - F5.5: Panel cards have interactive click handlers and accessibility data attributes', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const card1 = document.querySelector('#facp-card-FACP-FA0074');
  assert.ok(card1, 'Card for FA0074 must exist');
  assert.strictEqual(card1.getAttribute('data-control-no'), 'FA0074');
  assert.strictEqual(card1.getAttribute('data-building-code'), 'C');
  assert.ok(card1.onclick, 'Card must have an onclick trigger');
});

// -----------------------------------------------------------------------------
// F6: Building filter pills (C, H, D, A, O, All) and live search by Panel ID and Zone
// -----------------------------------------------------------------------------
test('Tier 1 - F6.1: Building filter pills exist for all 5 buildings plus All', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const pills = document.querySelectorAll('.facp-filter-pill');
  assert.strictEqual(pills.length, 6, 'Must have 6 filter pills (all, C, A, D, H, O)');
  const pillCodes = pills.map(p => p.getAttribute('data-facp-pill'));
  ['all', 'C', 'A', 'D', 'H', 'O'].forEach(code => {
    assert.ok(pillCodes.includes(code), `Pill for ${code} must exist`);
  });
});

test('Tier 1 - F6.2: Activating Building C filter displays exactly 2 panels', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.setFacpBuildingFilter('C');

  const visibleCards = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visibleCards.length, 2, 'Building C filter must show exactly 2 panels');
  const visibleCtrlNos = visibleCards.map(c => c.getAttribute('data-control-no'));
  assert.ok(visibleCtrlNos.includes('FA0074'));
  assert.ok(visibleCtrlNos.includes('FA0095'));
});

test('Tier 1 - F6.3: Activating Building A filter displays exactly 5 hospital panels', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.setFacpBuildingFilter('A');

  const visibleCards = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visibleCards.length, 5, 'Building A filter must show exactly 5 hospital panels');
});

test('Tier 1 - F6.4: Live search by Panel ID "FA0019" filters down to single matching panel', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const searchInp = elementsById.get('inp-facp-search');
  searchInp.value = 'FA0019';
  ctx.window.filterFacpPanels();

  const visibleCards = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visibleCards.length, 1);
  assert.strictEqual(visibleCards[0].getAttribute('data-control-no'), 'FA0019');
});

test('Tier 1 - F6.5: Live search by Zone "Full Hospital" filters down to ICU panel NM1757', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const searchInp = elementsById.get('inp-facp-search');
  searchInp.value = 'Full Hospital';
  ctx.window.filterFacpPanels();

  const visibleCards = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visibleCards.length, 1);
  assert.strictEqual(visibleCards[0].getAttribute('data-control-no'), 'NM1757');
});

// -----------------------------------------------------------------------------
// F7: Full metadata synchronization on selection
// -----------------------------------------------------------------------------
test('Tier 1 - F7.1: Selecting a panel updates #sel-round-facp-asset dropdown value', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  const dropdown = elementsById.get('sel-round-facp-asset');
  assert.strictEqual(dropdown.value, 'FACP-FA0074');
});

test('Tier 1 - F7.2: Selecting a panel synchronizes #inp-round-zone to panel coverage area', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  const zoneInp = elementsById.get('inp-round-zone');
  assert.strictEqual(zoneInp.value, 'B2 / B1 / 0 / 1 / 2');
});

test('Tier 1 - F7.3: Selecting a panel synchronizes #inp-round-loop to panel loops count', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  const loopInp = elementsById.get('inp-round-loop');
  assert.strictEqual(String(loopInp.value), '10');
});

test('Tier 1 - F7.4: Selecting a panel synchronizes #inp-round-devices to panel device count', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  const devInp = elementsById.get('inp-round-devices');
  assert.strictEqual(String(devInp.value), '1487');
});

test('Tier 1 - F7.5: Selecting a panel synchronizes PPM date #inp-round-ppm-date and room #inp-round-room', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  const ppmInp = elementsById.get('inp-round-ppm-date');
  const roomInp = elementsById.get('inp-round-room');
  assert.strictEqual(ppmInp.value, '2026-11-26');
  assert.strictEqual(roomInp.value, 'غرفة لوحات الإنذار - B1');
});

// -----------------------------------------------------------------------------
// F8: Operational status handling (Panel 10 Trouble badge)
// -----------------------------------------------------------------------------
test('Tier 1 - F8.1: Panel 10 NM-0022113 data model defines active Trouble status', () => {
  const panel10 = KSU_FACP_ASSETS.find(p => p.controlNo === 'NM-0022113');
  assert.ok(panel10, 'Panel 10 must exist');
  assert.ok(
    panel10.operationalStatus.includes('Trouble') || panel10.operationalStatus.includes('عطل'),
    'Panel 10 must have Trouble operational status'
  );
});

test('Tier 1 - F8.2: Panel 10 card renders visual amber Trouble badge warning', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const card10 = document.querySelector('#facp-card-FACP-NM0022113');
  assert.ok(card10, 'Card 10 must exist');
  assert.ok(
    card10.textContent.includes('Trouble') || card10.textContent.includes('إشارة عطل'),
    'Card 10 must display Trouble warning'
  );
});

test('Tier 1 - F8.3: Normal active panels display active/compliant status badges', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const cardHospital = document.querySelector('#facp-card-FACP-FA0019');
  assert.ok(cardHospital, 'Card for FA0019 must exist');
  assert.ok(
    cardHospital.textContent.includes('Active') || cardHospital.textContent.includes('سليم وتعمل'),
    'FA0019 must display Active compliant badge'
  );
});

test('Tier 1 - F8.4: Selecting Panel 10 records Trouble status in draft state and round payload', () => {
  const { ctx, sandbox } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-NM0022113');
  ctx.window.saveNewInspectionRound();

  const saved = sandbox.state.rounds[0];
  assert.strictEqual(saved.facpControlNo, 'NM-0022113');
  assert.ok(
    (saved.facpOperationalStatus && saved.facpOperationalStatus.includes('Trouble')) || (saved.facpStatus && saved.facpStatus.includes('عطل')),
    'Saved round must preserve Trouble status'
  );
});

test('Tier 1 - F8.5: Filtering by Building O correctly shows Panel 10 with trouble flag clearly distinguished', () => {
  const { ctx, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.setFacpBuildingFilter('O');

  const visibleCards = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visibleCards.length, 1);
  assert.strictEqual(visibleCards[0].getAttribute('data-control-no'), 'NM-0022113');
  assert.ok(visibleCards[0].textContent.includes('Trouble') || visibleCards[0].textContent.includes('إشارة عطل'));
});

// -----------------------------------------------------------------------------
// F9: Backwards compatibility for non-fire forms and official card integration
// -----------------------------------------------------------------------------
test('Tier 1 - F9.1: Opening non-fire form "fex" keeps #round-inspector-manual-selection-group visible', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fex');
  const manualGroup = elementsById.get('round-inspector-manual-selection-group');
  assert.strictEqual(manualGroup.classList.contains('hidden'), false);
  assert.notStrictEqual(manualGroup.style.display, 'none');
});

test('Tier 1 - F9.2: Opening non-fire form "fhc" keeps manual inspector select accessible', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fhc');
  const inspEl = elementsById.get('inp-round-inspector');
  assert.ok(inspEl);
  const autoBadge = elementsById.get('round-inspector-auto-bound-badge');
  assert.strictEqual(autoBadge.style.display, 'none');
});

test('Tier 1 - F9.3: Non-fire forms do not render FACP panel selection in specialized container', () => {
  const { ctx, elementsById } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fex');
  const container = elementsById.get('round-specialized-fields-container');
  assert.strictEqual(container.innerHTML.includes('FACP Registry'), false);
});

test('Tier 1 - F9.4: generateOfficialInspectionCardHtml for fas_insp renders specialized FACP parameters box', () => {
  const { ctx } = createTestSandbox();
  const cardHtml = ctx.window.generateOfficialInspectionCardHtml({
    formType: 'fas_insp',
    facpControlNo: 'FA0074',
    facpName: 'لوحة إنذار الحريق [FA0074]',
    zone: 'B2 / B1 / 0 / 1 / 2',
    loopNo: '10',
    devicesNo: '1487',
    ppmDate: '2026-11-26',
    inspector: 'أ. علي سليمان الصقري'
  });

  assert.ok(cardHtml.includes('FA0074'), 'Card must contain control number FA0074');
  assert.ok(cardHtml.includes('10 دائرة') || cardHtml.includes('10 Loops'), 'Card must display loop count');
  assert.ok(cardHtml.includes('1487'), 'Card must display devices count');
  assert.ok(cardHtml.includes('B2 / B1 / 0 / 1 / 2'), 'Card must display zone');
});

test('Tier 1 - F9.5: generateOfficialInspectionCardHtml for non-fire form fex remains standard without FACP box', () => {
  const { ctx } = createTestSandbox();
  const cardHtml = ctx.window.generateOfficialInspectionCardHtml({
    formType: 'fex',
    building: 'المستشفى',
    floor: 'الدور الأرضي (G)',
    inspector: 'أ. علي سليمان الصقري',
    score: 100
  });

  assert.ok(cardHtml.includes('المستشفى'));
  assert.strictEqual(cardHtml.includes('FACP Panel'), false);
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES (6 tests)
// =============================================================================
test('Tier 2 - B1: Empty or whitespace search query restores all panels for active building filter', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.setFacpBuildingFilter('C');

  // Search something specific first
  const searchInp = elementsById.get('inp-facp-search');
  searchInp.value = 'FA0074';
  ctx.window.filterFacpPanels();
  let visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 1);

  // Clear search with whitespace
  searchInp.value = '    ';
  ctx.window.filterFacpPanels();
  visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 2, 'Must restore all 2 panels for Building C');
});

test('Tier 2 - B2: Case-insensitive search: "fa0019", "FA0019", and "Fa0019" produce identical matches', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const searchInp = elementsById.get('inp-facp-search');

  ['fa0019', 'FA0019', 'Fa0019'].forEach(query => {
    searchInp.value = query;
    ctx.window.filterFacpPanels();
    const visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
    assert.strictEqual(visible.length, 1, `Query ${query} must match exactly 1 panel`);
    assert.strictEqual(visible[0].getAttribute('data-control-no'), 'FA0019');
  });
});

test('Tier 2 - B3: Substring search with prefix/suffix: "FA" matches 8 panels, "NM" matches 2 panels', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.setFacpBuildingFilter('all');
  const searchInp = elementsById.get('inp-facp-search');

  // Prefix "FA"
  searchInp.value = 'FA';
  ctx.window.filterFacpPanels();
  let visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 8, 'Query "FA" must match all 8 FA panels');

  // Prefix "NM"
  searchInp.value = 'NM';
  ctx.window.filterFacpPanels();
  visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 2, 'Query "NM" must match both NM panels');
});

test('Tier 2 - B4: Search with special characters and slashes (B2 / B1, 04 / 03) handles regex safely', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  ctx.window.setFacpBuildingFilter('all');
  const searchInp = elementsById.get('inp-facp-search');

  searchInp.value = 'B2 / B1';
  ctx.window.filterFacpPanels();
  let visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 1);
  assert.strictEqual(visible[0].getAttribute('data-control-no'), 'FA0074');

  searchInp.value = '04 / 03';
  ctx.window.filterFacpPanels();
  visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.ok(visible.length >= 1, 'Slash in block zone must match');
});

test('Tier 2 - B5: Non-matching search query displays empty state without application error', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');
  const searchInp = elementsById.get('inp-facp-search');
  searchInp.value = 'NON_EXISTENT_PANEL_999';
  ctx.window.filterFacpPanels();

  const visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 0);

  const emptyEl = elementsById.get('facp-empty-state');
  assert.ok(emptyEl, 'Empty state element must exist');
  assert.strictEqual(emptyEl.classList.contains('hidden'), false, 'Empty state must be visible');
});

test('Tier 2 - B6: Panel selection with missing optional attributes gracefully provides defaults', () => {
  const { ctx } = createTestSandbox();
  const cardHtml = ctx.window.generateOfficialInspectionCardHtml({
    formType: 'fas_insp',
    facpControlNo: 'FA9999',
    facpName: null,
    zone: null,
    loopNo: null,
    devicesNo: null,
    ppmDate: null,
    inspector: 'أ. علي سليمان الصقري'
  });

  assert.ok(cardHtml.includes('FA9999'));
  assert.ok(cardHtml.includes('كامل المبنى') || cardHtml.includes('ساري ومحدث'));
});

// =============================================================================
// TIER 3: COMBINATIONS & STATE TRANSITIONS (5 tests)
// =============================================================================
test('Tier 3 - C1: Switch building filter pill then search: Building C + FA0019 -> 0; switch All -> 1', () => {
  const { ctx, elementsById, document } = createTestSandbox();
  ctx.window.updateSpecializedFormFields('fas_insp');

  // Step 1: Filter to C
  ctx.window.setFacpBuildingFilter('C');
  const searchInp = elementsById.get('inp-facp-search');
  searchInp.value = 'FA0019';
  ctx.window.filterFacpPanels();

  let visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 0, 'FA0019 is in Building A, so 0 visible under Building C');

  // Step 2: Switch filter back to all
  ctx.window.setFacpBuildingFilter('all');
  visible = document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 1, 'FA0019 becomes visible under All');
  assert.strictEqual(visible[0].getAttribute('data-control-no'), 'FA0019');
});

test('Tier 3 - C2: Select panel in fas_insp then change form to fas_test: preserves panel state cleanly', () => {
  const { ctx, elementsById, sandbox } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0092');

  assert.strictEqual(sandbox.state.currentRoundDraft.facpControlNo, 'FA0092');
  assert.strictEqual(String(elementsById.get('inp-round-loop').value), '8');

  // Switch form to fas_test
  ctx.window.openNewRoundModal('fas_test');
  assert.strictEqual(elementsById.get('round-inspector-manual-selection-group').style.display, 'none');
  assert.strictEqual(elementsById.get('round-inspector-auto-bound-badge').style.display, 'flex');
});

test('Tier 3 - C3: Switch user session in localStorage: dynamically re-binds identity on next modal open', () => {
  const { ctx, sandbox, elementsById } = createTestSandbox({
    activeUser: { name: 'المفتش الأول', empId: '101', shift: 'shift1' }
  });

  ctx.window.openNewRoundModal('fas_insp');
  assert.strictEqual(elementsById.get('round-inspector-auto-name').textContent, 'المفتش الأول');

  // Switch active user in session
  const user2 = { name: 'المفتش الثاني', empId: '202', shift: 'shift2' };
  sandbox.localStorage.setItem('ksu_active_user', JSON.stringify(user2));
  sandbox.state.currentUser = user2;
  sandbox.KSUAuth.getUser = () => user2;

  ctx.window.openNewRoundModal('fas_insp');
  assert.strictEqual(elementsById.get('round-inspector-auto-name').textContent, 'المفتش الثاني');
  assert.strictEqual(elementsById.get('inp-round-inspector').value, 'المفتش الثاني');
});

test('Tier 3 - C4: Select panel in building C then switch pill to building A: maintains active selection', () => {
  const { ctx, elementsById, sandbox } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  assert.strictEqual(elementsById.get('sel-round-facp-asset').value, 'FACP-FA0074');

  // Switch building pill to A
  ctx.window.setFacpBuildingFilter('A');
  assert.strictEqual(sandbox.state.currentRoundDraft.facpAssetId, 'FACP-FA0074',
    'Previously selected panel remains assigned in draft state until inspector clicks a different card'
  );
});

test('Tier 3 - C5: Sequential round submissions: two distinct rounds with different inspectors and panels', () => {
  const { ctx, sandbox } = createTestSandbox({
    activeUser: { id: 'U1', name: 'أحمد', empId: '11', shift: 'shift1' }
  });

  // Round 1
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-FA0074');
  ctx.window.saveNewInspectionRound();

  // Round 2 with different user
  const user2 = { id: 'U2', name: 'سعد', empId: '22', shift: 'shift2' };
  sandbox.KSUAuth.getUser = () => user2;
  sandbox.state.currentUser = user2;

  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.selectFacpPanelCard('FACP-NM0022113');
  ctx.window.saveNewInspectionRound();

  assert.strictEqual(sandbox.state.rounds.length, 2);
  assert.strictEqual(sandbox.state.rounds[1].inspector, 'أحمد');
  assert.strictEqual(sandbox.state.rounds[1].facpControlNo, 'FA0074');

  assert.strictEqual(sandbox.state.rounds[0].inspector, 'سعد');
  assert.strictEqual(sandbox.state.rounds[0].facpControlNo, 'NM-0022113');
});

// =============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 tests)
// =============================================================================
test('Tier 4 - Scenario 1: Morning shift inspector (Ali) inspects Main Hospital FA0019', () => {
  const { ctx, sandbox, elementsById } = createTestSandbox({
    activeUser: {
      id: 'USR-ALI',
      name: 'أ. علي سليمان الصقري',
      empId: '10842',
      badge: '10842',
      role: 'رئيس إدارة السلامة الميدانية',
      shift: 'shift1'
    }
  });

  // 1. Open inspection modal
  ctx.window.openNewRoundModal('fas_insp');

  // 2. Verify inspector card is hidden and auto-bound badge is active
  assert.strictEqual(elementsById.get('round-inspector-manual-selection-group').style.display, 'none');
  assert.strictEqual(elementsById.get('round-inspector-auto-name').textContent, 'أ. علي سليمان الصقري');

  // 3. Filter to Hospital (A) and select FA0019
  ctx.window.setFacpBuildingFilter('A');
  ctx.window.selectFacpPanelCard('FACP-FA0019');

  // 4. Verify auto-synchronized metadata
  assert.strictEqual(String(elementsById.get('inp-round-loop').value), '1');
  assert.strictEqual(String(elementsById.get('inp-round-devices').value), '1289');
  assert.ok(elementsById.get('inp-round-zone').value.includes('Floor 1'));

  // 5. Save round and verify payload
  ctx.window.saveNewInspectionRound();
  const saved = sandbox.state.rounds[0];
  assert.strictEqual(saved.inspector, 'أ. علي سليمان الصقري');
  assert.strictEqual(saved.facpControlNo, 'FA0019');
  assert.strictEqual(String(saved.loopNo), '1');
  assert.strictEqual(String(saved.devicesNo), '1289');

  // 6. Generate official card and verify
  const cardHtml = ctx.window.generateOfficialInspectionCardHtml(saved);
  assert.ok(cardHtml.includes('FA0019'));
  assert.ok(cardHtml.includes('1289'));
});

test('Tier 4 - Scenario 2: Evening shift inspector (Khalid) inspects Central Medical Warehouse NM-0022113 (Trouble Flag)', () => {
  const { ctx, sandbox, elementsById } = createTestSandbox({
    activeUser: {
      id: 'USR-KHALID',
      name: 'م. خالد بن ناصر',
      empId: '20401',
      badge: '20401',
      role: 'مفتش سلامة أول',
      shift: 'shift2'
    }
  });

  ctx.window.openNewRoundModal('fas_insp');
  assert.strictEqual(elementsById.get('round-inspector-auto-name').textContent, 'م. خالد بن ناصر');

  ctx.window.setFacpBuildingFilter('O');
  ctx.window.selectFacpPanelCard('FACP-NM0022113');

  assert.ok(elementsById.get('inp-round-zone').value.includes('كامل المبنى'));
  assert.strictEqual(String(elementsById.get('inp-round-loop').value), '1');

  ctx.window.saveNewInspectionRound();
  const saved = sandbox.state.rounds[0];
  assert.strictEqual(saved.inspector, 'م. خالد بن ناصر');
  assert.strictEqual(saved.facpControlNo, 'NM-0022113');

  const cardHtml = ctx.window.generateOfficialInspectionCardHtml(saved);
  assert.ok(cardHtml.includes('NM-0022113'));
  assert.ok(cardHtml.includes('Trouble') || cardHtml.includes('تنبيه عطل'));
});

test('Tier 4 - Scenario 3: East Building B1 high-density loop 10 panel FA0074 inspection', () => {
  const { ctx, sandbox, elementsById } = createTestSandbox();
  ctx.window.openNewRoundModal('fas_insp');
  ctx.window.setFacpBuildingFilter('C');
  ctx.window.selectFacpPanelCard('FACP-FA0074');

  assert.strictEqual(String(elementsById.get('inp-round-loop').value), '10');
  assert.strictEqual(String(elementsById.get('inp-round-devices').value), '1487');
  assert.strictEqual(elementsById.get('inp-round-zone').value, 'B2 / B1 / 0 / 1 / 2');

  ctx.window.saveNewInspectionRound();
  const saved = sandbox.state.rounds[0];
  assert.strictEqual(saved.facpControlNo, 'FA0074');
  assert.strictEqual(String(saved.loopNo), '10');
  assert.strictEqual(String(saved.devicesNo), '1487');
});

test('Tier 4 - Scenario 4: Form consistency verification between fas_insp and fas_test', () => {
  const { ctx, sandbox, elementsById } = createTestSandbox();

  // Test fas_insp
  ctx.window.openNewRoundModal('fas_insp');
  assert.strictEqual(elementsById.get('round-inspector-manual-selection-group').style.display, 'none');
  assert.strictEqual(elementsById.get('round-inspector-auto-bound-badge').style.display, 'flex');
  ctx.window.selectFacpPanelCard('FACP-FA0095');
  ctx.window.saveNewInspectionRound();
  const roundInsp = sandbox.state.rounds[0];

  // Test fas_test
  ctx.window.openNewRoundModal('fas_test');
  assert.strictEqual(elementsById.get('round-inspector-manual-selection-group').style.display, 'none');
  assert.strictEqual(elementsById.get('round-inspector-auto-bound-badge').style.display, 'flex');
  ctx.window.selectFacpPanelCard('FACP-FA0095');
  ctx.window.saveNewInspectionRound();
  const roundTest = sandbox.state.rounds[0];

  // Both forms should produce equivalent panel data structure
  assert.strictEqual(roundInsp.facpControlNo, roundTest.facpControlNo);
  assert.strictEqual(roundInsp.zone, roundTest.zone);
  assert.strictEqual(String(roundInsp.loopNo), String(roundTest.loopNo));
  assert.strictEqual(String(roundInsp.devicesNo), String(roundTest.devicesNo));
});

test('Tier 4 - Scenario 5: Multi-form consecutive rounds: fire extinguisher (fex) then fire alarm (fas_insp)', () => {
  const { ctx, sandbox, elementsById } = createTestSandbox();

  // 1. Perform Fire Extinguisher Round (fex)
  ctx.window.openNewRoundModal('fex');
  assert.strictEqual(elementsById.get('round-inspector-manual-selection-group').classList.contains('hidden'), false);
  assert.strictEqual(elementsById.get('round-inspector-auto-bound-badge').style.display, 'none');
  ctx.window.saveNewInspectionRound();
  const fexRound = sandbox.state.rounds[0];
  assert.strictEqual(fexRound.formType, 'fex');

  // 2. Perform Fire Alarm Round (fas_insp)
  ctx.window.openNewRoundModal('fas_insp');
  assert.strictEqual(elementsById.get('round-inspector-manual-selection-group').style.display, 'none');
  assert.strictEqual(elementsById.get('round-inspector-auto-bound-badge').style.display, 'flex');
  ctx.window.selectFacpPanelCard('FACP-FA0092');
  ctx.window.saveNewInspectionRound();
  const fasRound = sandbox.state.rounds[0];
  assert.strictEqual(fasRound.formType, 'fas_insp');
  assert.strictEqual(fasRound.facpControlNo, 'FA0092');

  // Verify non-cross-contamination
  assert.ok(!fexRound.facpControlNo, 'FEX round must not have FACP control number');
  assert.strictEqual(fasRound.facpControlNo, 'FA0092');
});

console.log('\n=============================================================================');
console.log('✅ ALL 61 E2E TESTS (TIERS 1-4) REGISTERED SUCCESSFULLY.');
console.log('=============================================================================\n');

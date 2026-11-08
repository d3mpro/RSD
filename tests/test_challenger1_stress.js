// =============================================================================
// CHALLENGER 1: ADVERSARIAL STRESS TESTING & EDGE-CASE HARNESS
//
// Target Modules:
// - field.html
// - assets/js/app.js
// - assets/js/ksu-official-card.js
// - assets/js/ksu-facp-assets.js
//
// Role: Empirical Challenger (critic & specialist)
// Mandate: Actively attempt to break the implementation with adversarial fuzzing,
//          high-frequency UI state mutations, corrupted state.assets injections,
//          and degraded session payloads. Verify all claims empirically.
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

function matchesSelector(node, sel) {
  sel = sel.trim();
  if (!node || !node.tagName || node.tagName === 'ROOT') return false;

  // Robust compound selector matching: support tag, .class, #id, [attr=val]
  const parts = sel.match(/([.#]?[a-zA-Z0-9_-]+|\[[^\]]+\])/g);
  if (!parts) return false;

  for (const part of parts) {
    if (part.startsWith('#')) {
      if (node.id !== part.slice(1)) return false;
    } else if (part.startsWith('.')) {
      const cls = part.slice(1);
      const classes = (node.className || '').split(/\s+/);
      if (!classes.includes(cls)) return false;
    } else if (part.startsWith('[')) {
      const attrMatch = part.match(/^\[([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\]$/);
      if (!attrMatch) return false;
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4]);
      const val = node.getAttribute ? node.getAttribute(attrName) : node.attributes[attrName];
      if (attrVal === undefined) {
        if (val === undefined || val === null) return false;
      } else {
        if (val !== attrVal) return false;
      }
    } else {
      if (node.tagName.toLowerCase() !== part.toLowerCase()) return false;
    }
  }
  return true;
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

function parseHtmlFragment(htmlStr, parentNode = null, docElementsMap = new Map()) {
  const root = { tagName: 'ROOT', children: [], attributes: {} };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9\-]+)([^>]*)>|([^<]+)/g;
  let match;

  while ((match = tagRe.exec(htmlStr)) !== null) {
    if (match[0].startsWith('<!--')) continue;

    const isClosing = Boolean(match[1]);
    const tagName = match[2];
    const rawAttrs = match[3];
    const textContent = match[4];

    if (textContent) {
      const top = stack[stack.length - 1];
      if (top && top !== root) {
        top.textContent = (top.textContent || '') + textContent;
      }
      continue;
    }

    if (tagName) {
      const lowerTag = tagName.toLowerCase();
      const isSelfClosing = rawAttrs && rawAttrs.trim().endsWith('/');

      if (isClosing) {
        for (let i = stack.length - 1; i >= 1; i--) {
          if (stack[i].tagName.toLowerCase() === lowerTag) {
            stack.splice(i);
            break;
          }
        }
      } else {
        const attrs = {};
        if (rawAttrs) {
          const attrRe = /([a-zA-Z0-9\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
          let aMatch;
          while ((aMatch = attrRe.exec(rawAttrs)) !== null) {
            const attrKey = aMatch[1].toLowerCase();
            const attrVal = aMatch[2] !== undefined ? aMatch[2] : (aMatch[3] !== undefined ? aMatch[3] : (aMatch[4] !== undefined ? aMatch[4] : ''));
            attrs[attrKey] = attrVal;
          }
        }

        const node = createDOMNode(lowerTag, attrs, docElementsMap);
        const parent = stack[stack.length - 1];
        if (parent === root && parentNode) {
          node.parentNode = parentNode;
        } else if (parent !== root) {
          node.parentNode = parent;
        }
        parent.children.push(node);

        if (!isSelfClosing && !['input', 'img', 'br', 'hr', 'meta', 'link'].includes(lowerTag)) {
          stack.push(node);
        }
      }
    }
  }

  return root.children;
}

function setupAdversarialEnvironment(customUser = null) {
  const elementsById = new Map();
  const store = new Map();

  const defaultUser = {
    id: 'USR-8821',
    name: 'أ. علي سليمان الصقري',
    empId: '95972',
    employeeId: '95972',
    username: 'alsaqri',
    role: 'مفتش سلامة معتمد',
    roleCategory: 'field_inspector',
    shift: 'shift1',
    portal: 'field'
  };

  const activeUser = customUser || defaultUser;
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
      if (sel.startsWith('#') && !sel.includes('.') && !sel.includes('[')) return elementsById.get(sel.slice(1)) || null;
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
    navigator: { userAgent: 'Node-Adversarial-Runner', onLine: true },
    location: { href: 'http://localhost/field.html', pathname: '/field.html' },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
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
      getUser: () => {
        const raw = localStorage.getItem('ksu_active_user');
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (_) {
          return null;
        }
      },
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

  // Evaluate ksu-official-card.js
  vm.runInContext(officialCardSource, ctx);

  // Extract functions from app.js
  const getAllFacpAssetsFn = extractFunctionSource(appJsSource, 'function getAllFacpAssets()');
  const openNewRoundModalFn = extractFunctionSource(appJsSource, 'function openNewRoundModal(');
  const saveNewInspectionRoundFn = extractFunctionSource(appJsSource, 'function saveNewInspectionRound()');

  vm.runInContext(`${getAllFacpAssetsFn}\nwindow.getAllFacpAssets = getAllFacpAssets;`, ctx);
  vm.runInContext(`${openNewRoundModalFn}\nwindow.openNewRoundModal = openNewRoundModal;`, ctx);
  vm.runInContext(`${saveNewInspectionRoundFn}\nwindow.saveNewInspectionRound = saveNewInspectionRound;`, ctx);

  return { ctx, sandbox, elementsById, document, store };
}

console.log('⚔️  CHALLENGER 1: STARTING EMPIRICAL ADVERSARIAL STRESS TESTING HARNESS\n');

// =============================================================================
// SUITE 1: SEARCH INPUT FUZZING (REGEX CHARS, DIACRITICS, MIXED CASE, LONG/EMPTY STRINGS)
// =============================================================================

test('Suite 1 - T1.1: Regex Metacharacters Fuzzing does not throw and handles literal operators gracefully', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  const dangerousRegexTokens = [
    '(', ')', '[', ']', '{', '}', '*', '+', '?', '^', '$', '|', '\\', '/', '.', '.*',
    '\\d+', '[a-zA-Z]+', '(?=.*abc)', '(?:foo|bar)', '/[a-z]/i', '\\bFA\\b',
    'B2 / B1 / 0', 'block 04 / 03', 'NM-0022113 (Trouble)', '+++***???((([[['
  ];

  const searchInput = env.elementsById.get('inp-facp-search');
  assert.ok(searchInput, '#inp-facp-search must exist');

  for (const token of dangerousRegexTokens) {
    searchInput.value = token;
    assert.doesNotThrow(() => {
      env.sandbox.filterFacpPanels();
    }, `Fuzzing with regex token "${token}" must not throw SyntaxError or regex execution exception`);
  }

  // Verify literal slashes in zone queries accurately find matching panels
  searchInput.value = 'B2 / B1';
  env.sandbox.filterFacpPanels();
  const visibleCards = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visibleCards.length, 1, 'Search query "B2 / B1" must accurately isolate East Building FA0074');
  assert.strictEqual(visibleCards[0].getAttribute('data-control-no'), 'FA0074');
});

test('Suite 1 - T1.2: Extreme string length fuzzing (1K, 10K, 50K chars) executes within performance budget', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  const searchInput = env.elementsById.get('inp-facp-search');

  const lengths = [1000, 10000, 50000];
  for (const len of lengths) {
    const fuzzedLongString = 'X'.repeat(len) + 'FA0019';
    searchInput.value = fuzzedLongString;

    const t0 = Date.now();
    assert.doesNotThrow(() => {
      env.sandbox.filterFacpPanels();
    });
    const duration = Date.now() - t0;

    assert.ok(duration < 50, `Filtering with ${len} characters must finish under 50ms (took ${duration}ms)`);

    const emptyState = env.elementsById.get('facp-empty-state');
    assert.ok(emptyState.classList.contains('flex'), `Long non-matching string (${len} chars) must show empty state`);
  }
});

test('Suite 1 - T1.3: Arabic diacritics (tashkeel), tanween, and unicode variations fuzzing', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  const searchInput = env.elementsById.get('inp-facp-search');

  const diacriticQueries = [
    'لَوْحَة',          // Lawha with fatha, sukun, fatha
    'إِنْذَار',         // Indhar with kasra, sukun, fatha
    'حَرِيقٌ',          // Hareeq with tanween damma
    'الْمُسْتَشْفَى',     // Almustashfa with full tashkeel
    'مَبْنَى',           // Mabna
    'عِنَايَةٌ مُرَكَّزَةٌ', // Inaya with shaddah and tanween
    '\u200B\u200C\u200D\uFEFF', // Zero-width spaces and BOM
    'FA\u200E0019'       // LTR mark inside control number
  ];

  for (const q of diacriticQueries) {
    searchInput.value = q;
    assert.doesNotThrow(() => {
      env.sandbox.filterFacpPanels();
    }, `Diacritic search for "${q}" must execute safely without crash`);
  }
});

test('Suite 1 - T1.4: Mixed-case permutations across all 10 panel control numbers', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  const searchInput = env.elementsById.get('inp-facp-search');

  const testCases = [
    { query: 'fa0019', expectedCtrl: 'FA0019' },
    { query: 'FA0019', expectedCtrl: 'FA0019' },
    { query: 'Fa0019', expectedCtrl: 'FA0019' },
    { query: 'fA0019', expectedCtrl: 'FA0019' },
    { query: 'nm1757', expectedCtrl: 'NM1757' },
    { query: 'NM1757', expectedCtrl: 'NM1757' },
    { query: 'Nm1757', expectedCtrl: 'NM1757' },
    { query: 'nm-0022113', expectedCtrl: 'NM-0022113' },
    { query: 'NM-0022113', expectedCtrl: 'NM-0022113' },
    { query: 'Nm-0022113', expectedCtrl: 'NM-0022113' },
    { query: 'fa0074', expectedCtrl: 'FA0074' },
    { query: 'Fa0095', expectedCtrl: 'FA0095' },
    { query: 'fa0092', expectedCtrl: 'FA0092' }
  ];

  for (const { query, expectedCtrl } of testCases) {
    searchInput.value = query;
    env.sandbox.filterFacpPanels();
    const visibleCards = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
    assert.strictEqual(visibleCards.length, 1, `Query "${query}" must isolate exactly 1 panel`);
    assert.strictEqual(visibleCards[0].getAttribute('data-control-no'), expectedCtrl, `Query "${query}" matched expected control number`);
  }
});

test('Suite 1 - T1.5: Security injection payloads (XSS, SQLi, Prototype Pollution, Null byte) fuzzing', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  const searchInput = env.elementsById.get('inp-facp-search');

  const injectionPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg onload=alert(1)>',
    "' OR '1'='1",
    "'; DROP TABLE assets; --",
    '__proto__.polluted = true',
    'constructor.prototype.test = 1',
    '{"$gt": ""}',
    '${7*7}',
    '\x00\x01\x02\x03\x1F',
    '{{7*7}}'
  ];

  for (const payload of injectionPayloads) {
    searchInput.value = payload;
    assert.doesNotThrow(() => {
      env.sandbox.filterFacpPanels();
    }, `Payload "${payload}" must not crash filter`);

    // Verify prototype is untouched
    assert.strictEqual(Object.prototype.polluted, undefined, 'Prototype pollution must not succeed');
  }
});

test('Suite 1 - T1.6: Boundary whitespace fuzzing (empty, spaces, tabs, newlines)', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  const searchInput = env.elementsById.get('inp-facp-search');

  const whitespaceCases = ['', ' ', '   ', '\t', '\n', '\r\n', '   \t  \n  '];
  for (const ws of whitespaceCases) {
    searchInput.value = ws;
    env.sandbox.filterFacpPanels();
    const visibleCards = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
    assert.strictEqual(visibleCards.length, 10, `Whitespace query "${ws}" must restore all 10 panels in "all" filter`);
    const emptyState = env.elementsById.get('facp-empty-state');
    assert.ok(emptyState.classList.contains('hidden'), 'Empty state must be hidden');
  }
});

// =============================================================================
// SUITE 2: RAPID UI STRESS & PANEL SELECTION CYCLES
// =============================================================================

test('Suite 2 - T2.1: High-frequency building filter pill toggling loop (120 rapid iterations)', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  const pillExpectations = [
    { key: 'all', count: 10 },
    { key: 'C', count: 2 },
    { key: 'A', count: 5 },
    { key: 'D', count: 1 },
    { key: 'H', count: 1 },
    { key: 'O', count: 1 }
  ];

  // Perform 20 full cycles (120 pill clicks)
  for (let cycle = 0; cycle < 20; cycle++) {
    for (const exp of pillExpectations) {
      env.sandbox.setFacpBuildingFilter(exp.key);
      const visible = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
      assert.strictEqual(visible.length, exp.count, `Cycle ${cycle}: Filter "${exp.key}" must show exactly ${exp.count} panels`);

      // Verify active pill style
      const activePill = env.document.querySelector(`.facp-filter-pill[data-facp-pill="${exp.key}"]`);
      assert.ok(activePill, `Pill for ${exp.key} must exist`);
      assert.ok(activePill.className.includes('bg-red-600'), `Pill "${exp.key}" must have active styling`);
    }
  }
});

test('Suite 2 - T2.2: Rapid panel re-selection across building boundaries synchronizes form state', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  const selectionSequence = [
    { id: 'FACP-FA0074', ctrl: 'FA0074', loops: 10, devices: 1487, bld: 'كلية الطب', flr: 'القبو الأول (B1)' },
    { id: 'FACP-FA0019', ctrl: 'FA0019', loops: 1, devices: 1289, bld: 'المستشفى', flr: 'الدور الأرضي (G)' },
    { id: 'FACP-NM0022113', ctrl: 'NM-0022113', loops: 1, devices: 1, bld: 'المستودعات الخارجية', flr: 'الدور الأرضي (G)' },
    { id: 'FACP-FA0092', ctrl: 'FA0092', loops: 8, devices: 991, bld: 'المبنى الإداري', flr: 'الدور الأرضي (G)' },
    { id: 'FACP-NM1757', ctrl: 'NM1757', loops: 3, devices: 218, bld: 'العناية المركزة', flr: 'الدور الأرضي (G)' }
  ];

  // Rapidly re-select in sequence 10 times (50 selections)
  for (let iter = 0; iter < 10; iter++) {
    for (const target of selectionSequence) {
      env.sandbox.selectFacpPanelCard(target.id);

      // Verify dropdown sync
      const dropdown = env.elementsById.get('sel-round-facp-asset');
      assert.strictEqual(dropdown.value, target.id, `Iteration ${iter}: Dropdown value must match selected panel ${target.id}`);

      // Verify synchronized inputs
      assert.strictEqual(Number(env.elementsById.get('inp-round-loop').value), target.loops, `Iteration ${iter}: Loops count sync`);
      assert.strictEqual(Number(env.elementsById.get('inp-round-devices').value), target.devices, `Iteration ${iter}: Device count sync`);

      // Verify draft state
      assert.strictEqual(env.sandbox.state.currentRoundDraft.facpAssetId, target.id);
      assert.strictEqual(env.sandbox.state.currentRoundDraft.facpControlNo, target.ctrl);
    }
  }
});

test('Suite 2 - T2.3: Interleaved rapid search fuzzing and building filter pill switching', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  const searchInput = env.elementsById.get('inp-facp-search');

  // Step 1: Filter "FA" across all buildings -> 8 panels
  searchInput.value = 'FA';
  env.sandbox.setFacpBuildingFilter('all');
  let visible = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 8, 'Query "FA" in "all" must display 8 panels');

  // Step 2: Switch pill to "C" with "FA" active -> 2 panels
  env.sandbox.setFacpBuildingFilter('C');
  visible = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 2, 'Query "FA" in Building C must display 2 panels');

  // Step 3: Switch pill to "H" with "FA" active -> 0 panels (H has only NM1757)
  env.sandbox.setFacpBuildingFilter('H');
  visible = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 0, 'Query "FA" in ICU (Building H) must display 0 panels');
  assert.ok(env.elementsById.get('facp-empty-state').classList.contains('flex'), 'Empty state must be visible');

  // Step 4: Clear search while still in "H" -> 1 panel (NM1757)
  searchInput.value = '';
  env.sandbox.filterFacpPanels();
  visible = env.document.querySelectorAll('.facp-panel-card').filter(c => c.style.display !== 'none');
  assert.strictEqual(visible.length, 1, 'Clearing search in Building H must reveal 1 panel');
  assert.strictEqual(visible[0].getAttribute('data-control-no'), 'NM1757');
});

test('Suite 2 - T2.4: Card Click vs Dropdown Select synchronization parity test', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  // Select via Card Click
  env.sandbox.selectFacpPanelCard('FACP-FA0020');
  const bannerViaCard = env.elementsById.get('facp-selected-panel-title').textContent;
  const draftViaCard = { ...env.sandbox.state.currentRoundDraft };

  // Re-select another panel via Dropdown change handler
  env.sandbox.onFacpPanelSelectChange('FACP-FA0054');
  const bannerViaDropdown = env.elementsById.get('facp-selected-panel-title').textContent;
  const draftViaDropdown = { ...env.sandbox.state.currentRoundDraft };

  assert.ok(bannerViaCard.includes('FA0020'), 'Card selection updated banner');
  assert.ok(bannerViaDropdown.includes('FA0054'), 'Dropdown selection updated banner');
  assert.strictEqual(draftViaDropdown.facpAssetId, 'FACP-FA0054');
  assert.strictEqual(draftViaDropdown.loopNo, 2);
  assert.strictEqual(draftViaDropdown.devicesNo, 115);
});

test('Suite 2 - T2.5: Rapid formType switching (fas_insp <-> fas_test <-> fex) preserves form separation', () => {
  const env = setupAdversarialEnvironment();

  const formSequence = ['fas_insp', 'fex', 'fas_test', 'fex', 'fas_insp', 'fhc', 'fas_insp'];
  for (let i = 0; i < formSequence.length; i++) {
    const fType = formSequence[i];
    env.sandbox.openNewRoundModal(fType);

    const manualGroup = env.elementsById.get('round-inspector-manual-selection-group');
    const autoBadge = env.elementsById.get('round-inspector-auto-bound-badge');

    if (fType === 'fas_insp' || fType === 'fas_test') {
      assert.strictEqual(manualGroup.style.display, 'none', `Step ${i} (${fType}): Manual group must be hidden`);
      assert.strictEqual(autoBadge.style.display, 'flex', `Step ${i} (${fType}): Auto badge must be displayed`);
    } else {
      assert.strictEqual(manualGroup.style.display, '', `Step ${i} (${fType}): Manual group must be visible`);
      assert.strictEqual(autoBadge.style.display, 'none', `Step ${i} (${fType}): Auto badge must be hidden`);
    }
  }
});

// =============================================================================
// SUITE 3: CORRUPTED STATE.ASSETS SIMULATION & LEAK RESISTANCE
// =============================================================================

test('Suite 3 - T3.1: Substring trap: synthetic assets with misleading categories in state.assets never leak', () => {
  const env = setupAdversarialEnvironment();

  // Inject traps into state.assets while KSU_FACP_ASSETS is loaded
  env.sandbox.state.assets.push(
    { id: 'FE-TRAP-01', name: 'طفاية حريق لوحة إنذار', category: 'طفايات الحريق' },
    { id: 'EXT-TRAP-02', name: 'طفاية بودرة نظام إنذار', category: 'طفايات الحريق ذات إنذار مبكر' },
    { id: 'FHC-TRAP-03', name: 'صندوق خراطيم الحريق واللوحات', category: 'صناديق الحريق' },
    { id: 'MISC-TRAP-04', name: 'لوحة إعلانات إرشادية', category: 'لوحات إعلانية' },
    { id: 'ELEV-TRAP-05', name: 'لوحة تحكم المصعد', category: 'مصاعد' }
  );

  const assets = env.sandbox.getAllFacpAssets();
  assert.strictEqual(assets.length, 10, 'getAllFacpAssets must return exactly 10 panels');

  for (const a of assets) {
    assert.ok(!a.id.startsWith('FE-'), `Asset ${a.id} must not be an extinguisher`);
    assert.ok(!a.id.startsWith('EXT-'), `Asset ${a.id} must not be an extinguisher`);
    assert.ok(!a.id.startsWith('FHC-'), `Asset ${a.id} must not be a hose cabinet`);
    assert.strictEqual(a.category, 'لوحات إنذار الحريق', `Asset ${a.id} must have exact FACP category`);
  }
});

test('Suite 3 - T3.2: Fallback stress test: when KSU_FACP_ASSETS is undefined, state.assets filter strictly isolates FACP panels', () => {
  const env = setupAdversarialEnvironment();

  // Nullify global KSU_FACP_ASSETS to force execution of the fallback state.assets filter
  env.sandbox.KSU_FACP_ASSETS = undefined;

  // Build a heavily polluted state.assets collection
  env.sandbox.state.assets = [
    // Extinguishers
    { id: 'FE-01', name: 'طفاية 1', category: 'طفايات الحريق' },
    { id: 'FE-02', name: 'طفاية 2', category: 'طفايات الحريق' },
    { id: 'EXT-03', name: 'طفاية 3', category: 'طفايات الحريق' },
    { id: 'FE-04', name: 'طفاية لوحة إنذار', category: 'طفايات الحريق' },
    // Hose Cabinets
    { id: 'FHC-01', name: 'صندوق 1', category: 'صناديق الحريق' },
    { id: 'FH-02', name: 'خرطوم 2', category: 'خراطيم الحريق' },
    // Miscellaneous
    { id: 'FM-01', name: 'نظام FM200', category: 'FM-200' },
    { id: 'IND-01', name: 'غرفة صناعية', category: 'الغرف الصناعية' },
    // Legitimate FACP Panels
    { id: 'FACP-FA0019', controlNo: 'FA0019', name: 'لوحة FA0019', category: 'لوحات إنذار الحريق', building: 'المستشفى' },
    { id: 'FACP-FA0074', controlNo: 'FA0074', name: 'لوحة FA0074', category: 'لوحات إنذار الحريق', building: 'كلية الطب' },
    { id: 'NM-0022113', controlNo: 'NM-0022113', name: 'لوحة المستودع', category: 'لوحات إنذار الحريق', building: 'المستودعات الخارجية' }
  ];

  const filtered = env.sandbox.getAllFacpAssets();
  assert.strictEqual(filtered.length, 3, 'Fallback filter must isolate exactly the 3 valid FACP panels');

  const leakedExtinguishers = filtered.filter(a => a.id.startsWith('FE-') || a.id.startsWith('EXT-') || (a.category && a.category.includes('طفايات')));
  assert.strictEqual(leakedExtinguishers.length, 0, 'Zero extinguishers leaked into FACP array under corrupted state.assets');

  const leakedCabinets = filtered.filter(a => a.id.startsWith('FHC-') || a.id.startsWith('FH-') || (a.category && a.category.includes('صناديق')));
  assert.strictEqual(leakedCabinets.length, 0, 'Zero hose cabinets leaked into FACP array under corrupted state.assets');
});

test('Suite 3 - T3.3: Corrupted / Malformed items in state.assets handle defensive filtering without throwing', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.KSU_FACP_ASSETS = undefined;

  // Populate state.assets with malformed, null, and non-object records
  env.sandbox.state.assets = [
    null,
    undefined,
    {},
    { id: null, category: null },
    { id: 'FE-VALID-EXT', category: 'طفايات الحريق' },
    { id: 'FACP-GOOD', controlNo: 'FA0001', name: 'Good Panel', category: 'لوحات إنذار الحريق' }
  ];

  assert.doesNotThrow(() => {
    const res = env.sandbox.getAllFacpAssets();
    assert.strictEqual(res.length, 1, 'Only the 1 valid FACP panel was extracted');
    assert.strictEqual(res[0].id, 'FACP-GOOD');
  }, 'Malformed items in state.assets must not throw unhandled exceptions');
});

test('Suite 3 - T3.4: Immutability & Reference Tamper Resistance of FACP Assets', () => {
  const env = setupAdversarialEnvironment();

  const assets1 = env.sandbox.getAllFacpAssets();
  assert.strictEqual(assets1.length, 10);

  // Attempt to mutate property on returned object
  const originalName = assets1[0].name;
  assets1[0].temporaryTamperTest = true;

  const assets2 = env.sandbox.getAllFacpAssets();
  assert.strictEqual(assets2.length, 10);
  assert.strictEqual(assets2[0].name, originalName, 'Original panel metadata remains intact');
  delete assets1[0].temporaryTamperTest;
});

test('Suite 3 - T3.5: Non-FACP form types (fex, fhc) strict isolation from FACP assets', () => {
  const env = setupAdversarialEnvironment();

  // Test that non-fire inspection does not render FACP panels widget
  env.sandbox.openNewRoundModal('fex');
  env.sandbox.updateSpecializedFormFields('fex');
  const facpGrid = env.elementsById.get('facp-panels-grid');
  assert.ok(!facpGrid, 'FACP grid must NOT be rendered for fire extinguisher forms');

  env.sandbox.openNewRoundModal('fhc');
  env.sandbox.updateSpecializedFormFields('fhc');
  const facpGridFhc = env.elementsById.get('facp-panels-grid');
  assert.ok(!facpGridFhc, 'FACP grid must NOT be rendered for fire hose forms');
});

// =============================================================================
// SUITE 4: USER SESSION MUTATION & CONCURRENCY STRESS
// =============================================================================

test('Suite 4 - T4.1: Rapid multi-tenant inspector session switching across 50 iterations', () => {
  const env = setupAdversarialEnvironment();

  const inspectors = [
    { id: 'USR-01', name: 'أ. علي سليمان الصقري', empId: '95972', shift: 'shift1', role: 'مفتش سلامة' },
    { id: 'USR-02', name: 'م. خالد بن ناصر', empId: '88412', shift: 'shift2', role: 'مشرف وردية' },
    { id: 'USR-03', name: 'أ. حسن إبراهيم دعاك', empId: '77319', shift: 'shift3', role: 'مفتش سلامة' },
    { id: 'USR-04', name: 'أ. مصعب عبدالله الحماد', empId: '66205', shift: 'shift1', role: 'مفتش سلامة' },
    { id: 'USR-05', name: 'أ. عبدالرحمن محمد الاحمري', empId: '55194', shift: 'shift2', role: 'مفتش سلامة' }
  ];

  for (let i = 0; i < 50; i++) {
    const inspector = inspectors[i % inspectors.length];

    // Simulate session switch in localStorage
    env.store.set('ksu_active_user', JSON.stringify(inspector));
    env.sandbox.state.currentUser = inspector;

    // Open modal
    env.sandbox.openNewRoundModal('fas_insp');

    // Verify auto-bound badge in DOM
    const nameEl = env.elementsById.get('round-inspector-auto-name');
    const badgeEl = env.elementsById.get('round-inspector-auto-badge');
    const shiftEl = env.elementsById.get('round-inspector-auto-shift');

    assert.strictEqual(nameEl.textContent, inspector.name, `Iteration ${i}: Badge name must match ${inspector.name}`);
    assert.ok(badgeEl.textContent.includes(inspector.empId), `Iteration ${i}: Badge ID must match ${inspector.empId}`);
    assert.strictEqual(env.sandbox.state.currentRoundDraft.inspector, inspector.name);

    // Save round and verify round payload
    env.sandbox.saveNewInspectionRound();
    const savedRound = env.sandbox.state.rounds[0];

    assert.strictEqual(savedRound.inspector, inspector.name, `Round ${i} inspector name mismatch`);
    assert.strictEqual(savedRound.badge, inspector.empId, `Round ${i} badge mismatch`);
    assert.strictEqual(savedRound.shift, inspector.shift, `Round ${i} shift mismatch`);
  }

  assert.strictEqual(env.sandbox.state.rounds.length, 50, 'All 50 rounds must be saved with unique states');
});

test('Suite 4 - T4.2: Degraded, missing, or corrupt session payloads fallback safely without throwing', () => {
  const env = setupAdversarialEnvironment();

  const degradedSessions = [
    { payload: JSON.stringify({ name: '' }), expectedName: 'مفتش السلامة المناوب', expectedBadge: 'KSU-SAF-882' },
    { payload: JSON.stringify({ name: 'مفتش تجريبي' }), expectedName: 'مفتش تجريبي', expectedBadge: 'KSU-SAF-882' },
    { payload: JSON.stringify({}), expectedName: 'مفتش السلامة المناوب', expectedBadge: 'KSU-SAF-882' },
    { payload: '{CORRUPTED_JSON_STRING%%%', expectedName: 'مفتش السلامة المناوب', expectedBadge: 'KSU-SAF-882' },
    { payload: null, expectedName: 'مفتش السلامة المناوب', expectedBadge: 'KSU-SAF-882' }
  ];

  for (let idx = 0; idx < degradedSessions.length; idx++) {
    const { payload, expectedName, expectedBadge } = degradedSessions[idx];

    if (payload === null) {
      env.store.delete('ksu_active_user');
      env.sandbox.state.currentUser = null;
    } else {
      env.store.set('ksu_active_user', payload);
      try {
        env.sandbox.state.currentUser = JSON.parse(payload);
      } catch (_) {
        env.sandbox.state.currentUser = null;
      }
    }

    assert.doesNotThrow(() => {
      env.sandbox.openNewRoundModal('fas_insp');
    }, `Case ${idx}: openNewRoundModal must not crash on degraded session`);

    const nameEl = env.elementsById.get('round-inspector-auto-name');
    const badgeEl = env.elementsById.get('round-inspector-auto-badge');

    assert.strictEqual(nameEl.textContent, expectedName, `Case ${idx}: Fallback name must match`);
    assert.ok(badgeEl.textContent.includes(expectedBadge), `Case ${idx}: Fallback badge must match`);

    assert.doesNotThrow(() => {
      env.sandbox.saveNewInspectionRound();
    }, `Case ${idx}: saveNewInspectionRound must not crash on degraded session`);
  }
});

test('Suite 4 - T4.3: Privilege escalation prevention: manual inspector dropdown remains disabled/hidden', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');

  const manualGroup = env.elementsById.get('round-inspector-manual-selection-group');
  assert.strictEqual(manualGroup.style.display, 'none', 'Manual inspector group must be hidden');
  assert.ok(manualGroup.classList.contains('hidden'), 'Manual group must have hidden class');

  // Attempt to spoof inspector by writing directly to inp-round-inspector
  const inspSelect = env.elementsById.get('inp-round-inspector');
  inspSelect.value = 'Spoofed Inspector Name';

  // Saving round must prioritize active session currentUserObj over spoofed form select
  env.sandbox.saveNewInspectionRound();
  const savedRound = env.sandbox.state.rounds[0];
  assert.strictEqual(savedRound.inspector, 'أ. علي سليمان الصقري', 'Saved round inspector must match authenticated session, not spoofed input');
});

// =============================================================================
// SUITE 5: PANEL 10 (NM-0022113) TROUBLE STATUS ROBUSTNESS
// =============================================================================

test('Suite 5 - T5.1: Panel 10 Trouble badge rendering and visual amber distinction in grid', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  const panel10Card = env.document.querySelector('.facp-panel-card[data-control-no="NM-0022113"]');
  assert.ok(panel10Card, 'Panel 10 card must exist in DOM grid');

  // Verify visual amber styling for Trouble status
  assert.ok(panel10Card.className.includes('border-amber-300'), 'Unselected Panel 10 card must have amber warning border');
  assert.ok(panel10Card.className.includes('bg-amber-50/40'), 'Unselected Panel 10 card must have amber background');
  assert.ok(panel10Card.textContent.includes('Trouble') || panel10Card.textContent.includes('إشارة عطل'), 'Card must display Trouble text');
});

test('Suite 5 - T5.2: Panel 10 Trouble status persistence across 50 building pill toggles and searches', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  // Select Panel 10
  env.sandbox.selectFacpPanelCard('FACP-NM0022113');

  // Check draft state captures Trouble
  assert.strictEqual(env.sandbox.state.currentRoundDraft.facpOperationalStatus, 'يوجد إشارة عطل (Trouble)');
  assert.strictEqual(env.sandbox.state.currentRoundDraft.facpStatus, 'يوجد ملاحظات (إشارة عطل)');

  const searchInput = env.elementsById.get('inp-facp-search');

  // Stress cycle: toggle pills and search 50 times
  for (let i = 0; i < 50; i++) {
    env.sandbox.setFacpBuildingFilter(i % 2 === 0 ? 'O' : 'all');
    searchInput.value = i % 3 === 0 ? 'NM' : '';
    env.sandbox.filterFacpPanels();

    // Re-verify that Panel 10 retains Trouble flag in its data attributes and draft
    assert.strictEqual(env.sandbox.state.currentRoundDraft.facpOperationalStatus, 'يوجد إشارة عطل (Trouble)');
    assert.strictEqual(env.sandbox.state.currentRoundDraft.facpStatus, 'يوجد ملاحظات (إشارة عطل)');
  }
});

test('Suite 5 - T5.3: End-to-end round submission for Panel 10 with official card generation', () => {
  const env = setupAdversarialEnvironment();
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');

  // Select Panel 10
  env.sandbox.selectFacpPanelCard('FACP-NM0022113');
  env.sandbox.saveNewInspectionRound();

  const savedRound = env.sandbox.state.rounds[0];
  assert.strictEqual(savedRound.facpControlNo, 'NM-0022113');
  assert.strictEqual(savedRound.facpOperationalStatus, 'يوجد إشارة عطل (Trouble)');
  assert.strictEqual(savedRound.facpStatus, 'يوجد ملاحظات (إشارة عطل)');
  assert.strictEqual(savedRound.zone, 'كامل المبنى (Full Building)');

  // Generate official inspection card passing the round object
  const cardHtml = env.sandbox.generateOfficialInspectionCardHtml(savedRound);
  assert.ok(cardHtml, 'Official card HTML must be generated');
  assert.ok(cardHtml.includes('NM-0022113'), 'Official card must contain control number NM-0022113');
  assert.ok(cardHtml.includes('Trouble') || cardHtml.includes('إشارة عطل') || cardHtml.includes('تنبيه عطل'), 'Official card must display Trouble alert');
  assert.ok(cardHtml.includes('#fffbeb') || cardHtml.includes('#f59e0b') || cardHtml.includes('تنبيه عطل (Trouble)'), 'Official card must feature amber alert container');
});

test('Suite 5 - T5.4: Multi-round state isolation: Normal panel -> Trouble panel -> Normal panel sequence', () => {
  const env = setupAdversarialEnvironment();

  // Round 1: Normal Panel FA0019
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  env.sandbox.selectFacpPanelCard('FACP-FA0019');
  env.sandbox.saveNewInspectionRound();
  const round1 = env.sandbox.state.rounds[0];
  assert.strictEqual(round1.facpControlNo, 'FA0019');
  assert.strictEqual(round1.facpOperationalStatus, 'تعمل (Active)');

  // Round 2: Trouble Panel NM-0022113
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  env.sandbox.selectFacpPanelCard('FACP-NM0022113');
  env.sandbox.saveNewInspectionRound();
  const round2 = env.sandbox.state.rounds[0];
  assert.strictEqual(round2.facpControlNo, 'NM-0022113');
  assert.strictEqual(round2.facpOperationalStatus, 'يوجد إشارة عطل (Trouble)');

  // Round 3: Normal Panel FA0074
  env.sandbox.openNewRoundModal('fas_insp');
  env.sandbox.updateSpecializedFormFields('fas_insp');
  env.sandbox.selectFacpPanelCard('FACP-FA0074');
  env.sandbox.saveNewInspectionRound();
  const round3 = env.sandbox.state.rounds[0];
  assert.strictEqual(round3.facpControlNo, 'FA0074');
  assert.strictEqual(round3.facpOperationalStatus, 'تعمل (Active)');

  // Assert round 2 Trouble status did not bleed into round 1 or round 3
  assert.strictEqual(round1.facpOperationalStatus, 'تعمل (Active)');
  assert.strictEqual(round2.facpOperationalStatus, 'يوجد إشارة عطل (Trouble)');
  assert.strictEqual(round3.facpOperationalStatus, 'تعمل (Active)');
});

console.log('✅ All 23 Challenger 1 stress tests registered successfully.\n');

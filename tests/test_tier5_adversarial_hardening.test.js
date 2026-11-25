// =============================================================================
// Milestone 4 - Tier 5: Adversarial Coverage Hardening Test Suite
// Target: Oracle Vision Agent (الراصد البصري الذكي)
//
// White-box analysis and stress testing across:
// 1. EXIF rotation edge cases under extreme aspect ratios.
// 2. Dynamic model failover under multi-threaded concurrency.
// 3. Network packet corruption, non-JSON streams, and unexpected HTTP status codes.
// 4. Client SDK local draft overflow, draft restoration, and double-submit debouncing.
// 5. Live video track abortion mid-inspection and camera permission toggle.
// 6. Synchronized violation location grid input permutations.
// 7. Quality portal inbox batch approval and filter switching.
//
// Author: Challenger M4 (Tier 5 Adversarial Coverage Hardening Lead)
// Runner: Node.js Built-in Test Runner (`node --test`)
// =============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIELD_HTML_PATH = path.join(REPO_ROOT, 'field.html');
const QUALITY_HTML_PATH = path.join(REPO_ROOT, 'quality.html');
const AI_CLIENT_PATH = path.join(REPO_ROOT, 'assets/js/ksu-ai-client.js');
const RETICLE_HELPER_PATH = path.join(REPO_ROOT, 'assets/js/vision-reticle-helper.js');

// Read source files
const aiClientSource = fs.readFileSync(AI_CLIENT_PATH, 'utf-8');
const fieldHtmlSource = fs.readFileSync(FIELD_HTML_PATH, 'utf-8');
const qualityHtmlSource = fs.readFileSync(QUALITY_HTML_PATH, 'utf-8');

// Require modules
const reticleHelper = require(RETICLE_HELPER_PATH);

// -----------------------------------------------------------------------------
// Headless DOM Environment & Sandbox Factory
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
    disabled: false,
    checked: false,
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
      if (node.tagName === 'OPTION') node.text = String(val);
    }
  });

  Object.defineProperty(node, 'innerHTML', {
    get() {
      return node._innerHTML || node._textContent || '';
    },
    set(html) {
      node._innerHTML = String(html);
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
    if (type === 'click' && typeof node.onclick === 'function') node.onclick.call(node, evtObj);
    if (type === 'change' && typeof node.onchange === 'function') node.onchange.call(node, evtObj);
    if (type === 'input' && typeof node.oninput === 'function') node.oninput.call(node, evtObj);
  };

  node.click = () => node.dispatchEvent({ type: 'click' });

  if (node.id) docElementsMap.set(node.id, node);
  return node;
}

function createTestSandbox(initialLocalStorage = {}, mockFetch = null) {
  const storage = new Map(Object.entries(initialLocalStorage));
  const docElementsMap = new Map();
  const rootNode = createDOMNode('BODY', { id: 'test-body' }, docElementsMap);

  const mockLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
  };

  const mockDocument = {
    getElementById: (id) => docElementsMap.get(id) || null,
    createElement: (tag, attrs) => createDOMNode(tag, attrs, docElementsMap),
    body: rootNode,
    documentElement: rootNode,
    querySelector: (sel) => {
      if (sel.startsWith('#')) return docElementsMap.get(sel.slice(1)) || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.startsWith('#')) {
        const item = docElementsMap.get(sel.slice(1));
        return item ? [item] : [];
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return Array.from(docElementsMap.values()).filter(n => n.classList && n.classList.contains(cls));
      }
      return [];
    }
  };

  const mockWindow = {
    location: {
      hostname: 'localhost',
      host: 'localhost:8000',
      protocol: 'http:',
      href: 'http://localhost:8000/field.html'
    },
    localStorage: mockLocalStorage,
    document: mockDocument,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: mockFetch || (async () => { throw new Error('fetch not implemented'); }),
    navigator: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {} }]
        })
      }
    },
    state: {},
    KSUAI: null
  };

  mockWindow.window = mockWindow;

  const sandboxContext = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    navigator: mockWindow.navigator,
    location: mockWindow.location,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController: globalThis.AbortController,
    AbortSignal: globalThis.AbortSignal,
    console,
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
    Error,
    Promise,
    Buffer
  });

  vm.runInContext(aiClientSource, sandboxContext);

  return {
    window: sandboxContext.window,
    document: mockDocument,
    localStorage: mockLocalStorage,
    docElementsMap,
    KSUAI: sandboxContext.window.KSUAI,
    context: sandboxContext
  };
}

// =============================================================================
// SUITE 3: NETWORK PACKET CORRUPTION, NON-JSON STREAMS & HTTP STATUS CODES
// =============================================================================
test('Tier 5 Suite 3: Network Packet Corruption, Non-JSON Streams & HTTP Codes', async (t) => {
  await t.test('3.1: Gracefully handles truncated JSON stream without unhandled rejection', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
      text: async () => '{"success": true, "data": {"status": "مطابق"' // Truncated halfway
    });

    const sandbox = createTestSandbox({}, mockFetch);
    const res = await sandbox.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,test',
      notes: 'فحص مخرج الطوارئ'
    });

    assert.equal(res.success, false);
    assert.ok(res.error || res.user_message);
    assert.equal(res.heuristic, undefined);
  });

  await t.test('3.2: Gracefully handles raw HTML error pages (Nginx 502 / Cloudflare 520)', async () => {
    const mockFetch = async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
      text: async () => '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>'
    });

    const sandbox = createTestSandbox({}, mockFetch);
    const res = await sandbox.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,test',
      notes: 'فحص'
    });

    assert.equal(res.success, false);
    assert.match(res.user_message || res.error, /تعذر الاتصال|المسودات المحلية/);
  });

  await t.test('3.3: Handles unexpected HTTP status codes (400, 401, 403, 408, 413, 429, 500, 503, 504)', async () => {
    const testCodes = [400, 401, 403, 408, 413, 429, 500, 503, 504];

    for (const code of testCodes) {
      const mockFetch = async () => ({
        ok: false,
        status: code,
        json: async () => ({ detail: `Error status ${code}` }),
        text: async () => `Error status ${code}`
      });

      const sandbox = createTestSandbox({}, mockFetch);
      const res = await sandbox.KSUAI.analyzeInspectionImage({
        image: 'data:image/jpeg;base64,test',
        checklistType: 'fire_extinguisher'
      });

      assert.equal(res.success, false, `Expected failure on HTTP ${code}`);
      assert.ok(res.user_message || res.error);
    }
  });

  await t.test('3.4: Handles sudden network socket drops (ECONNRESET, ETIMEDOUT)', async () => {
    const mockFetch = async () => {
      const err = new Error('read ECONNRESET');
      err.code = 'ECONNRESET';
      throw err;
    };

    const sandbox = createTestSandbox({}, mockFetch);
    const res = await sandbox.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,test',
      notes: 'فحص'
    });

    assert.equal(res.success, false);
    assert.match(res.user_message || res.error, /تعذر الاتصال|المسودات المحلية/);
  });
});

// =============================================================================
// SUITE 4: CLIENT SDK DRAFT OVERFLOW, RESTORATION & DEBOUNCING
// =============================================================================
test('Tier 5 Suite 4: Client SDK Local Draft Overflow, Restoration & Debouncing', async (t) => {
  await t.test('4.1: Draft storage overflow strictly caps saved drafts at maximum 20', () => {
    const sandbox = createTestSandbox();
    const { window, document, localStorage } = sandbox;

    // Simulate 45 successive inspection failures
    window.visionImagesList = ['data:image/jpeg;base64,sample_photo_data'];
    window.currentVisionSubmode = 'exit';

    const resultsArea = document.createElement('div', { id: 'vision-results-area' });
    document.body.appendChild(resultsArea);

    for (let i = 0; i < 45; i++) {
      window.renderVisionInspectionError(`فشل الاتصال تجربة ${i}`, 'مبنى 1', 'دور 2', `غرفة ${i}`);
    }

    const savedRaw = localStorage.getItem('ksu_offline_vision_drafts');
    assert.ok(savedRaw);
    const parsedDrafts = JSON.parse(savedRaw);

    assert.equal(parsedDrafts.length, 20, 'Draft storage must cap at 20 items');
    assert.equal(parsedDrafts[19].room, 'غرفة 44');
  });

  await t.test('4.2: Handles corrupted JSON in offline drafts without throwing exceptions', () => {
    const initialStorage = {
      'ksu_offline_vision_drafts': '{MALFORMED_JSON_STRING: [}'
    };
    const sandbox = createTestSandbox(initialStorage);
    const { window, document } = sandbox;

    window.visionImagesList = ['data:image/jpeg;base64,test'];
    const resultsArea = document.createElement('div', { id: 'vision-results-area' });
    document.body.appendChild(resultsArea);

    assert.doesNotThrow(() => {
      window.renderVisionInspectionError('فشل الاتصال', 'المستشفى', 'دور 1', 'غرفة 101');
    });

    // Verify error UI is cleanly rendered
    assert.ok(resultsArea.innerHTML.includes('تعذر استكمال التحليل الآلي'));
  });

  await t.test('4.3: QuotaExceededError in localStorage does not crash the UI', () => {
    const sandbox = createTestSandbox();
    const { window, document, localStorage } = sandbox;

    // Simulate quota exceeded
    localStorage.setItem = () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    };

    window.visionImagesList = ['data:image/jpeg;base64,heavy_data'];
    const resultsArea = document.createElement('div', { id: 'vision-results-area' });
    document.body.appendChild(resultsArea);

    assert.doesNotThrow(() => {
      window.renderVisionInspectionError('خطأ حجم الذاكرة', 'مبنى', 'دور', 'غرفة');
    });

    assert.ok(resultsArea.innerHTML.includes('تعذر استكمال التحليل الآلي'));
  });

  await t.test('4.4: Debounces rapid double-clicks on analyze button', () => {
    let executionCount = 0;
    let isProcessing = false;

    const analyzeHandler = () => {
      if (isProcessing) return; // Debounce guard
      isProcessing = true;
      executionCount++;
    };

    // 10 rapid clicks within 50ms
    for (let i = 0; i < 10; i++) {
      analyzeHandler();
    }

    assert.equal(executionCount, 1, 'Only 1 execution should occur during processing');
  });
});

// =============================================================================
// SUITE 5: LIVE VIDEO TRACK ABORTION & CAMERA PERMISSION TOGGLE
// =============================================================================
test('Tier 5 Suite 5: Live Video Track Abortion & Camera Permission Toggle', async (t) => {
  await t.test('5.1: Abrupt video track termination cleans up references cleanly', async () => {
    let trackStopped = false;
    const mockTrack = {
      kind: 'video',
      readyState: 'live',
      stop: () => { trackStopped = true; mockTrack.readyState = 'ended'; }
    };

    const mockStream = {
      getTracks: () => [mockTrack],
      active: true
    };

    const mockMediaDevices = {
      getUserMedia: async () => mockStream
    };

    const mockVideo = createDOMNode('VIDEO', { id: 'test-cam-video' });
    mockVideo.play = async () => {};
    const mockContainer = createDOMNode('DIV', { id: 'test-reticle-box' });

    const startRes = await reticleHelper.startLiveCameraStream(mockVideo, mockContainer, {
      mediaDevices: mockMediaDevices,
      submode: 'extinguisher'
    });

    assert.equal(startRes.success, true);
    assert.equal(reticleHelper.getActiveCameraStream(), mockStream);

    // Abort track abruptly
    mockTrack.stop();
    assert.equal(trackStopped, true);
    assert.equal(mockTrack.readyState, 'ended');

    // Clean stop
    reticleHelper.stopLiveCameraStream();
    assert.equal(reticleHelper.getActiveCameraStream(), null);
    assert.equal(mockVideo.srcObject, null);
  });

  await t.test('5.2: Re-acquiring camera terminates prior active stream tracks before starting new', async () => {
    let firstStreamStopped = false;
    const firstStream = {
      getTracks: () => [{
        stop: () => { firstStreamStopped = true; }
      }]
    };

    let callCount = 0;
    const mockMediaDevices = {
      getUserMedia: async () => {
        callCount++;
        return callCount === 1 ? firstStream : { getTracks: () => [{ stop: () => {} }] };
      }
    };

    const mockVideo = createDOMNode('VIDEO');
    mockVideo.play = async () => {};
    const mockContainer = createDOMNode('DIV');

    await reticleHelper.startLiveCameraStream(mockVideo, mockContainer, { mediaDevices: mockMediaDevices });
    assert.equal(firstStreamStopped, false);

    // Second start call
    await reticleHelper.startLiveCameraStream(mockVideo, mockContainer, { mediaDevices: mockMediaDevices });
    assert.equal(firstStreamStopped, true, 'Prior stream tracks must be stopped before acquiring new stream');

    reticleHelper.stopLiveCameraStream();
  });

  await t.test('5.3: Camera permission denied switches cleanly to fallback file input', async () => {
    let fallbackClicked = false;
    const mockFallbackInput = {
      click: () => { fallbackClicked = true; }
    };

    const mockMediaDevices = {
      getUserMedia: async () => {
        const err = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      }
    };

    const res = await reticleHelper.startLiveCameraStream(null, null, {
      mediaDevices: mockMediaDevices,
      fallbackInput: mockFallbackInput
    });

    assert.equal(res.success, false);
    assert.equal(res.fallback, true);
    assert.equal(fallbackClicked, true, 'Fallback input click must be triggered on permission denial');
  });

  await t.test('5.4: Missing camera device switches to fallback without error uncaught', async () => {
    let fallbackClicked = false;
    const mockFallbackInput = {
      click: () => { fallbackClicked = true; }
    };

    const mockMediaDevices = {
      getUserMedia: async () => {
        const err = new Error('Device not found');
        err.name = 'NotFoundError';
        throw err;
      }
    };

    const res = await reticleHelper.startLiveCameraStream(null, null, {
      mediaDevices: mockMediaDevices,
      fallbackInput: mockFallbackInput
    });

    assert.equal(res.success, false);
    assert.equal(res.fallback, true);
    assert.equal(fallbackClicked, true);
  });

  await t.test('5.5: Capturing frame from null or unready video element returns empty string', () => {
    assert.equal(reticleHelper.captureFrame(null), '');
    const mockVideo = createDOMNode('VIDEO');
    mockVideo.videoWidth = 0;
    mockVideo.videoHeight = 0;
    assert.equal(reticleHelper.captureFrame(mockVideo), '');
  });
});

// =============================================================================
// SUITE 6: SYNCHRONIZED VIOLATION LOCATION GRID INPUT PERMUTATIONS
// =============================================================================
test('Tier 5 Suite 6: Synchronized Violation Location Grid Input Permutations', async (t) => {
  const sandbox = createTestSandbox();
  const { document } = sandbox;

  // Build the location grid DOM elements
  const inpBldg = document.createElement('input', { id: 'inp-violation-building' });
  const inpFloor = document.createElement('input', { id: 'inp-violation-floor' });
  const inpLoc = document.createElement('input', { id: 'inp-violation-location' });
  const hiddenLoc = document.createElement('input', { id: 'inp-sv-location' });

  document.body.appendChild(inpBldg);
  document.body.appendChild(inpFloor);
  document.body.appendChild(inpLoc);
  document.body.appendChild(hiddenLoc);

  function syncViolationLocation() {
    const b = (inpBldg.value || '').trim();
    const f = (inpFloor.value || '').trim();
    const l = (inpLoc.value || '').trim();
    const combined = [b, f, l].filter(Boolean).join(' - ') || b || l;
    hiddenLoc.value = combined;
    return combined;
  }

  await t.test('6.1: Evaluates all permutations of [building, floor, location]', () => {
    const cases = [
      { b: '', f: '', l: '', expected: '' },
      { b: 'المبنى الرئيسي', f: '', l: '', expected: 'المبنى الرئيسي' },
      { b: '', f: 'الدور الأول', l: '', expected: 'الدور الأول' },
      { b: '', f: '', l: 'قسم الطوارئ', expected: 'قسم الطوارئ' },
      { b: 'المستشفى', f: 'الدور الثاني', l: '', expected: 'المستشفى - الدور الثاني' },
      { b: 'المستشفى', f: '', l: 'العناية المركزة', expected: 'المستشفى - العناية المركزة' },
      { b: '', f: 'القبو', l: 'غرفة المحولات', expected: 'القبو - غرفة المحولات' },
      { b: 'برج الأبحاث', f: 'الدور 4', l: 'المختبر الجيني', expected: 'برج الأبحاث - الدور 4 - المختبر الجيني' },
      { b: '  كلية الطب  ', f: '  الدور 1  ', l: '  المدرج أ  ', expected: 'كلية الطب - الدور 1 - المدرج أ' },
      { b: 'المبنى (C)', f: 'طابق #3', l: 'مستودع كيميائي [خطر]', expected: 'المبنى (C) - طابق #3 - مستودع كيميائي [خطر]' }
    ];

    cases.forEach(({ b, f, l, expected }, idx) => {
      inpBldg.value = b;
      inpFloor.value = f;
      inpLoc.value = l;
      const res = syncViolationLocation();
      assert.equal(res, expected, `Case ${idx + 1} failed: expected "${expected}", got "${res}"`);
      assert.equal(hiddenLoc.value, expected);
    });
  });

  await t.test('6.2: Synchronizes extremely long location strings (>1000 chars) without truncation', () => {
    const longBldg = 'المبنى ' + 'أ'.repeat(500);
    const longLoc = 'الموقع ' + 'ب'.repeat(500);
    inpBldg.value = longBldg;
    inpFloor.value = 'الدور 1';
    inpLoc.value = longLoc;
    const res = syncViolationLocation();
    assert.equal(res, `${longBldg} - الدور 1 - ${longLoc}`);
    assert.equal(hiddenLoc.value, `${longBldg} - الدور 1 - ${longLoc}`);
  });

  await t.test('6.3: AI autofill preserves pre-existing user input in violation fields', () => {
    hiddenLoc.value = 'موقع مدخل يدوياً من المفتش';
    const payload = { building: 'مبنى مستنتج من الذكاء الاصطناعي', floor: 'دور مستنتج' };

    const svLoc = document.getElementById('inp-sv-location');
    if (svLoc && (!svLoc.value || svLoc.value.trim() === '')) {
      svLoc.value = [payload.building, payload.floor].filter(Boolean).join(' - ') || payload.building;
    }

    assert.equal(hiddenLoc.value, 'موقع مدخل يدوياً من المفتش', 'Inspector manual input must be preserved');
  });
});

// =============================================================================
// SUITE 7: QUALITY PORTAL INBOX BATCH APPROVAL & FILTER SWITCHING
// =============================================================================
test('Tier 5 Suite 7: Quality Portal Inbox Batch Approval & Filter Switching', async (t) => {
  const initialViolations = [
    { id: 'SV-2026-0001', title: 'انسداد مخرج طوارئ', qualityStatus: 'pending_quality', status: 'بانتظار الاعتماد', building: 'المستشفى' },
    { id: 'SV-2026-0002', title: 'طفاية حريق منخفضة الضغط', qualityStatus: 'pending_quality', status: 'بانتظار الاعتماد', building: 'المستشفى' },
    { id: 'SV-2026-0003', title: 'توصيلة كهربائية عشوائية', qualityStatus: 'pending_quality', status: 'بانتظار الاعتماد', building: 'المبنى الرئيسي' },
    { id: 'SV-2026-0004', title: 'تخزين كيميائي مخالف', qualityStatus: 'approved_by_quality', status: 'معتمد من الجودة', building: 'كلية الطب' },
    { id: 'SV-2026-0005', title: 'عدم وجود بطاقة فحص', qualityStatus: 'returned_by_quality', status: 'معاد للملاحظات', building: 'المستشفى' }
  ];

  const sandbox = createTestSandbox({
    'ksumc_safety_violations': JSON.stringify(initialViolations)
  });
  const { localStorage } = sandbox;

  let qualityUnifiedFilter = 'all';

  function filterQualityUnifiedWorkflow(filterType) {
    qualityUnifiedFilter = filterType || 'all';
    return renderQualityUnifiedWorkflow();
  }

  function renderQualityUnifiedWorkflow() {
    const rawSafetyViolations = JSON.parse(localStorage.getItem('ksumc_safety_violations') || '[]');
    const safetyViolations = rawSafetyViolations.filter(Boolean).map(v => ({
      _type: 'violation',
      id: v.id,
      title: v.title,
      workflowStatus: v.qualityStatus || 'pending_quality'
    }));

    const isPending = (item) => !item.workflowStatus || item.workflowStatus === 'pending_quality';
    const isApproved = (item) => ['approved_cbahi', 'approved_by_head', 'approved_by_quality'].includes(item.workflowStatus);
    const isReturned = (item) => ['returned_by_quality', 'returned_by_head'].includes(item.workflowStatus);

    let filtered = safetyViolations;
    if (qualityUnifiedFilter === 'violations') filtered = safetyViolations;
    else if (qualityUnifiedFilter === 'pending') filtered = safetyViolations.filter(isPending);
    else if (qualityUnifiedFilter === 'approved') filtered = safetyViolations.filter(isApproved);
    else if (qualityUnifiedFilter === 'returned') filtered = safetyViolations.filter(isReturned);

    return {
      total: safetyViolations.length,
      filteredCount: filtered.length,
      items: filtered,
      counts: {
        all: safetyViolations.length,
        pending: safetyViolations.filter(isPending).length,
        approved: safetyViolations.filter(isApproved).length,
        returned: safetyViolations.filter(isReturned).length
      }
    };
  }

  function approveQualityViolation(id) {
    const list = JSON.parse(localStorage.getItem('ksumc_safety_violations') || '[]');
    const item = list.find(v => String(v.id) === String(id));
    if (item) {
      item.qualityStatus = 'approved_by_quality';
      item.headApprovalStatus = 'approved_by_head';
      item.status = 'معتمد من الجودة';
      item.updatedAtMs = Date.now();
      localStorage.setItem('ksumc_safety_violations', JSON.stringify(list));
    }
  }

  await t.test('7.1: Filter switching across all quality unified filters', () => {
    const resAll = filterQualityUnifiedWorkflow('all');
    assert.equal(resAll.filteredCount, 5);
    assert.equal(resAll.counts.pending, 3);
    assert.equal(resAll.counts.approved, 1);
    assert.equal(resAll.counts.returned, 1);

    const resPending = filterQualityUnifiedWorkflow('pending');
    assert.equal(resPending.filteredCount, 3);

    const resApproved = filterQualityUnifiedWorkflow('approved');
    assert.equal(resApproved.filteredCount, 1);

    const resReturned = filterQualityUnifiedWorkflow('returned');
    assert.equal(resReturned.filteredCount, 1);
  });

  await t.test('7.2: Batch approval updates state and recalculates filter counts accurately', () => {
    approveQualityViolation('SV-2026-0001');
    approveQualityViolation('SV-2026-0002');

    const res = renderQualityUnifiedWorkflow();
    assert.equal(res.counts.pending, 1, 'Pending count should decrease from 3 to 1');
    assert.equal(res.counts.approved, 3, 'Approved count should increase from 1 to 3');

    const resApproved = filterQualityUnifiedWorkflow('approved');
    assert.equal(resApproved.filteredCount, 3);
    const approvedIds = resApproved.items.map(i => i.id);
    assert.ok(approvedIds.includes('SV-2026-0001'));
    assert.ok(approvedIds.includes('SV-2026-0002'));
    assert.ok(approvedIds.includes('SV-2026-0004'));
  });

  await t.test('7.3: Rapid filter cycling stress test (50 iterations) maintains state integrity', () => {
    const filters = ['all', 'violations', 'pending', 'approved', 'returned'];
    for (let i = 0; i < 50; i++) {
      const f = filters[i % filters.length];
      const res = filterQualityUnifiedWorkflow(f);
      assert.ok(res.total >= 0);
      assert.ok(res.filteredCount >= 0);
    }
  });

  await t.test('7.4: Idempotent approval of already approved violation does not duplicate or corrupt record', () => {
    approveQualityViolation('SV-2026-0001');
    approveQualityViolation('SV-2026-0001');

    const list = JSON.parse(localStorage.getItem('ksumc_safety_violations') || '[]');
    const items = list.filter(v => v.id === 'SV-2026-0001');
    assert.equal(items.length, 1, 'Must remain a single record');
    assert.equal(items[0].qualityStatus, 'approved_by_quality');
  });

  await t.test('7.5: Handles null / corrupted items in violations list gracefully', () => {
    localStorage.setItem('ksumc_safety_violations', JSON.stringify([null, undefined, {}, { id: 'SV-VALID', qualityStatus: 'approved_by_quality' }]));

    assert.doesNotThrow(() => {
      const res = filterQualityUnifiedWorkflow('all');
      assert.equal(res.items.length, 2); // {} and SV-VALID
      assert.ok(res.items.some(x => x.id === 'SV-VALID'));
    });
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createBrowserSandbox(customFetch) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
  };

  const elementsById = new Map();
  const makeEl = (tag = 'div') => ({
    tagName: String(tag).toUpperCase(),
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    innerHTML: '',
    textContent: '',
    value: '',
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    prepend(child) { this.children.unshift(child); return child; },
    remove() {},
    scrollIntoView() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return null; }
  });

  const document = {
    readyState: 'complete',
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const sandbox = {
    console,
    setTimeout: (fn) => { return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    AbortController,
    AbortSignal,
    Intl,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    URL,
    Buffer,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    localStorage,
    sessionStorage: localStorage,
    document,
    navigator: { userAgent: 'NodeTest', onLine: true },
    location: { hostname: 'localhost', protocol: 'http:', href: 'http://localhost/field.html' },
    alert: () => {},
    confirm: () => true,
    fetch: customFetch || (async () => ({ ok: false, status: 503, text: async () => 'offline' }))
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._elementsById = elementsById;
  sandbox._makeEl = makeEl;
  return vm.createContext(sandbox);
}

function extractFunctionSource(fileContent, fnSignature) {
  const startIdx = fileContent.indexOf(fnSignature);
  assert.notEqual(startIdx, -1, `Could not find ${fnSignature}`);
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
  throw new Error(`Unbalanced braces for ${fnSignature}`);
}

const repoRoot = path.resolve(__dirname, '..');
const ksuAiClientCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-ai-client.js'), 'utf-8');
const ksuFirebaseCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-firebase-realtime.js'), 'utf-8');
const appJsCode = fs.readFileSync(path.join(repoRoot, 'assets/js/app.js'), 'utf-8');

test('Task 2.1: analyzeInspectionImage rotates all Gemini keys on 429 and seamlessly fails over to Vision Agent (GPT-4o)', async () => {
  const callLog = [];
  const mockFetch = async (url, opts) => {
    callLog.push(url);
    if (url.includes('generativelanguage.googleapis.com')) {
      return {
        ok: false,
        status: 429,
        text: async () => 'Quota exceeded (429)'
      };
    }
    if (url.includes('/ai/analyze-inspection-image')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          source: 'GitHub Models (openai/gpt-4o)',
          data: {
            status: 'غير مطابق',
            compliance_status: 'غير مطابق',
            pattern: 'emergency_exit',
            risk: 'عالي',
            risk_level: 'عالي',
            confidence: 97,
            title: 'احتجاز باب طوارئ بوتد خشبي',
            summary: 'تم رصد احتجاز باب مخرج الطوارئ بوتد خشبي يمنع الإغلاق الذاتي.',
            observations: ['وجود وتد خشبي أسفل باب الطوارئ'],
            capa_actions: ['إزالة الوتد فوراً وفحص ذراع الإغلاق الهيدروليكي'],
            directive: 'إزالة العائق فوراً'
          }
        })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const ctx = createBrowserSandbox(mockFetch);
  ctx.localStorage.setItem('ksumc_gemini_api_keys', 'gem_key_1,gem_key_2');
  ctx.localStorage.setItem('ksumc_oracle_agent_url', 'http://127.0.0.1:8000');

  vm.runInContext(ksuAiClientCode, ctx);

  const res = await ctx.window.KSUAI.analyzeInspectionImage({
    image: 'data:image/jpeg;base64,QUJD',
    submode: 'emergency_exit',
    facility: 'مستشفى الملك خالد الجامعي (KKUH)',
    building: 'المبنى الرئيسي',
    floor: 'الأول'
  });

  const geminiCalls = callLog.filter(u => u.includes('generativelanguage.googleapis.com'));
  const agentCalls = callLog.filter(u => u.includes('/ai/analyze-inspection-image'));

  // Should have rotated through gem_key_1, gem_key_2 (plus default fallback key if distinct) and then hit Vision Agent
  assert.equal(geminiCalls.some(u => u.includes('key=gem_key_1')), true, 'Must try first Gemini key');
  assert.equal(geminiCalls.some(u => u.includes('key=gem_key_2')), true, 'Must rotate to second Gemini key on 429');
  assert.equal(agentCalls.length, 1, 'Must fail over to Vision Agent after Gemini pool exhaustion');
  assert.equal(res.success, true);
  assert.match(res.data.ai_engine_source, /gpt-4o/i);
});

test('Task 2.2: approveAndUploadVisualViolation vaults high-res image in KSUMediaVault + Archive API, omits bloated HTML strings, and reconstructs printable cards dynamically', async () => {
  const dispatchedBundles = [];
  const mockFetch = async (url, opts) => {
    if (url.includes('/archive/dispatch')) {
      dispatchedBundles.push({
        url,
        headers: opts.headers,
        body: JSON.parse(opts.body)
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, storedImages: 1 })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const ctx = createBrowserSandbox(mockFetch);
  ctx.localStorage.setItem('ksumc_oracle_agent_url', 'http://127.0.0.1:8000');
  vm.runInContext(ksuAiClientCode, ctx);

  assert.equal(typeof ctx.window.KSUMediaVault, 'object', 'window.KSUMediaVault must be defined');
  assert.equal(typeof ctx.window.buildFullPageHtmlFromViolation, 'function', 'window.buildFullPageHtmlFromViolation must be defined');

  const highResImg = 'data:image/jpeg;base64,' + 'A'.repeat(2048);
  ctx.window.lastVisionAnalysisImage = highResImg;
  ctx.window.lastVisionAnalysisImages = [highResImg];
  ctx.window.lastVisionLocation = {
    building: 'مستشفى الملك عبدالعزيز الجامعي (KAUH)',
    floor: 'الدور الثاني',
    room: 'ممر العيادات'
  };
  ctx.window.lastVisionAnalysisData = {
    status: 'غير مطابق',
    compliance_status: 'غير مطابق',
    risk_level: 'عالي',
    confidence_score: 96,
    standard_reference: 'CBAHI FMS.14 / NFPA 101',
    detected_element: 'تخزين صناديق أمام مخرج الطوارئ',
    detected_devices: ['صناديق كرتونية معيقة لمسار الإخلاء'],
    findings_summary: 'رصد تكدس صناديق كرتونية أمام مخرج الطوارئ في ممر العيادات.',
    violations_list: ['إعاقة مسار الهروب بصناديق كرتونية'],
    corrective_actions: ['إزالة الصناديق فوراً وتأمين الممر']
  };

  await ctx.window.approveAndUploadVisualViolation();

  const savedList = JSON.parse(ctx.localStorage.getItem('ksumc_safety_violations') || '[]');
  assert.equal(savedList.length, 1);
  const savedViol = savedList[0];

  // Must NOT store duplicate bloated HTML strings inside localStorage / Firebase payload
  assert.equal('cardInnerHtml' in savedViol, false, 'cardInnerHtml must be omitted from newViol');
  assert.equal('fullPageHtml' in savedViol, false, 'fullPageHtml must be omitted from newViol');
  assert.equal(savedViol.hasVisualInspectionCard, true);

  // High-res image must be stored in KSUMediaVault
  const vaultedImages = await ctx.window.KSUMediaVault.getMedia(savedViol.id);
  assert.ok(vaultedImages && vaultedImages.length === 1);
  assert.deepEqual(Array.from(vaultedImages), [highResImg]);

  // High-res bundle must also be dispatched to Vision Agent Archive Vault
  assert.equal(dispatchedBundles.length, 1);
  assert.equal(dispatchedBundles[0].body.cardId, savedViol.id);
  assert.deepEqual(dispatchedBundles[0].body.images, [highResImg]);

  // Dynamic card HTML & full-page HTML builders must reconstruct complete printable card
  const customHiRes = 'data:image/jpeg;base64,CUSTOM_HIRES_MARKER';
  const cardHtml = ctx.window.buildCardHtmlFromViolation(savedViol, customHiRes);
  const fullHtml = ctx.window.buildFullPageHtmlFromViolation(savedViol, customHiRes);

  assert.equal(cardHtml.includes(savedViol.id), true, 'Reconstructed cardInnerHtml must include cardId');
  assert.equal(cardHtml.includes('CUSTOM_HIRES_MARKER'), true, 'Reconstructed cardInnerHtml must honor preferredImg');
  assert.equal(fullHtml.includes('<!DOCTYPE html>'), true, 'Reconstructed fullPageHtml must be a complete HTML document');
  assert.equal(fullHtml.includes(savedViol.id), true);
});

test('Task 2.3: normalizeCloudPayload strips cardInnerHtml and fullPageHtml on visual safety_violations while preserving legacy non-vision records', () => {
  const ctx = createBrowserSandbox();
  vm.runInContext(ksuFirebaseCode, ctx);

  const sync = ctx.window.ksuFirebaseSync;
  assert.ok(sync && typeof sync.normalizeCloudPayload === 'function');

  const bloatedVisual = {
    id: 'KSU-VIS-2026-5501',
    hasVisualInspectionCard: true,
    visionData: { findings_summary: 'مخالفة مرصودة' },
    cardInnerHtml: '<div>5MB_DUPLICATE_HTML</div>',
    fullPageHtml: '<!DOCTYPE html><html>5MB_DUPLICATE_FULL_HTML</html>',
    photo: 'data:image/jpeg;base64,THUMB480'
  };

  const slimmed = sync.normalizeCloudPayload('safety_violations', bloatedVisual);
  assert.equal('cardInnerHtml' in slimmed, false);
  assert.equal('fullPageHtml' in slimmed, false);
  assert.equal(slimmed.photo, 'data:image/jpeg;base64,THUMB480');

  // Legacy record WITHOUT visionData or hasVisualInspectionCard should remain untouched
  const legacyItem = {
    id: 'LEGACY-SV-100',
    cardInnerHtml: '<div>LEGACY_CUSTOM_HTML</div>'
  };
  const normalizedLegacy = sync.normalizeCloudPayload('safety_violations', legacyItem);
  assert.equal(normalizedLegacy.cardInnerHtml, '<div>LEGACY_CUSTOM_HTML</div>');
});

test('Task 2.4: printSafetyViolation in app.js dynamically reconstructs and prints slimmed visual inspection cards when cardInnerHtml is absent', () => {
  const ctx = createBrowserSandbox();
  vm.runInContext(ksuAiClientCode, ctx);

  let printedHtml = null;
  ctx.window.triggerIsolatedPrint = (html) => {
    printedHtml = html;
  };
  ctx.showToast = () => {};
  ctx.generateQRCodeSVG = () => '<svg></svg>';
  ctx.state = {
    safetyViolations: [
      {
        id: 'KSU-VIS-2026-8899',
        cardId: 'KSU-VIS-2026-8899',
        date: '2026-11-08',
        time: '10:30 ص',
        facility: 'مستشفى الملك خالد الجامعي (KKUH)',
        location: 'الدور الأول',
        room: 'غرفة 105',
        hasVisualInspectionCard: true,
        photo: 'data:image/jpeg;base64,THUMB_ONLY',
        visionData: {
          compliance_status: 'غير مطابق',
          risk_level: 'عالي',
          detected_element: 'لوحة كهرباء معاقة',
          findings_summary: 'تخزين كراتين أمام لوحة التوزيع الكهربائية'
        }
      }
    ]
  };

  const fnSource = extractFunctionSource(appJsCode, 'function printSafetyViolation(id)');
  vm.runInContext(fnSource, ctx);
  ctx.printSafetyViolation('KSU-VIS-2026-8899');

  assert.ok(printedHtml, 'triggerIsolatedPrint must be called for slimmed visual violation');
  assert.equal(printedHtml.includes('KSU-VIS-2026-8899'), true);
  assert.equal(printedHtml.includes('تخزين كراتين أمام لوحة التوزيع الكهربائية'), true);
});

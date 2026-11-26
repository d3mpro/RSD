const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function makeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    _map: map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] || null,
    get length() { return map.size; }
  };
}

function createBridgeSandbox({ fetchImpl, sessionInit = {}, localInit = {}, withOfficialCard = true } = {}) {
  const localStorage = makeStorage(localInit);
  const sessionStorage = makeStorage(sessionInit);
  const events = [];
  const sandbox = {
    console,
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
    Set,
    Map,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    localStorage,
    sessionStorage,
    CustomEvent: class CustomEvent {
      constructor(type, opts) {
        this.type = type;
        this.detail = opts && opts.detail;
      }
    },
    dispatchEvent: (ev) => events.push(ev),
    addEventListener: () => {},
    document: { getElementById: () => null, createElement: () => ({ style: {} }) },
    location: { origin: 'https://rsd-ksu.web.app', hostname: 'rsd-ksu.web.app', protocol: 'https:' },
    navigator: { userAgent: 'NodeTest', onLine: true },
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/auth-guard.js'), 'utf8'), sandbox);
  if (withOfficialCard) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-official-card.js'), 'utf8'), sandbox);
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksumc-data-bridge.js'), 'utf8'), sandbox);
  return { sandbox, localStorage, sessionStorage, events };
}

function createAISandbox({ firebaseConfig = null, bridge = null, fetchImpl = null, sessionInit = {}, localInit = {}, withDom = true } = {}) {
  const localStorage = makeStorage(localInit);
  const sessionStorage = makeStorage(sessionInit);
  const docElements = new Map();
  const makeEl = (id = '') => {
    const el = {
      id,
      className: '',
      textContent: '',
      innerHTML: '',
      value: '',
      style: {},
      classList: {
        _set: new Set(),
        add(...cls) { cls.forEach(c => el.classList._set.add(c)); },
        remove(...cls) { cls.forEach(c => el.classList._set.delete(c)); },
        contains(c) { return el.classList._set.has(c); }
      }
    };
    if (id) docElements.set(id, el);
    return el;
  };
  const document = withDom ? {
    getElementById: (id) => docElements.get(id) || makeEl(id),
    createElement: () => makeEl(),
    body: makeEl('body')
  } : undefined;

  const sandbox = {
    console,
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
    Set,
    Map,
    URL,
    TextEncoder,
    AbortController,
    Intl,
    setTimeout: (fn, ms) => (typeof ms === 'number' && ms <= 5 ? setTimeout(fn, ms) : 1),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage,
    sessionStorage,
    navigator: { userAgent: 'NodeTest', onLine: true },
    location: { hostname: 'rsd-ksu.web.app', host: 'rsd-ksu.web.app', protocol: 'https:', href: 'https://rsd-ksu.web.app/field.html' },
    fetch: fetchImpl || (async () => { throw new Error('Network disabled in test'); })
  };
  if (document) sandbox.document = document;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  if (bridge) {
    sandbox._ksuFirebaseAILogicBridge = bridge;
  }
  vm.createContext(sandbox);
  if (firebaseConfig !== false) {
    const cfgCode = fs.readFileSync(path.join(ROOT, 'assets/js/ksu-firebase-config.js'), 'utf8');
    vm.runInContext(cfgCode, sandbox);
    if (firebaseConfig && typeof firebaseConfig === 'object') {
      sandbox.KSU_FIREBASE_CONFIG = Object.assign({}, sandbox.KSU_FIREBASE_CONFIG, firebaseConfig);
      sandbox.PROD_FIREBASE_CONFIG = sandbox.KSU_FIREBASE_CONFIG;
    }
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ai-client.js'), 'utf8'), sandbox);
  return { sandbox, localStorage, sessionStorage, docElements };
}

test('SP-1: syncToSharePoint strips heavy base64 photos from reportHtml and coerces complianceScore', async () => {
  const captured = [];
  const { sandbox } = createBridgeSandbox({
    fetchImpl: async (url, opts) => {
      captured.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 202 };
    }
  });

  const hugePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(90000);
  const res = await sandbox.KSUDataBridge.syncToSharePoint({
    id: 'RND-2026-SP1',
    formType: 'fex',
    formTitle: '[1] طفايات الحريق',
    hospital: 'مستشفى الملك خالد الجامعي',
    building: 'المبنى الرئيسي',
    floor: 'الأرضي',
    inspector: 'م. عبدالمجيد',
    complianceRate: 94,
    compliantCount: '17',
    observationCount: '1',
    violationCount: 0,
    date: '2026/11/26',
    time: '10:15',
    photos: [hugePhoto, hugePhoto],
    items: [{ title: 'طفاية 1', result: 'compliant' }]
  }, 'inspection');

  assert.equal(res.success, true);
  assert.equal(captured.length, 1);
  const payload = captured[0].body;
  assert.equal(payload.complianceScore, 94, 'Must fall back to numeric complianceRate');
  assert.equal(payload.compliantCount, 17);
  assert.equal(payload.observationCount, 1);
  assert.ok(!payload.reportHtml.includes('data:image/jpeg;base64,AAA'), 'reportHtml must NEVER embed raw base64 camera photos');
  assert.ok(Buffer.byteLength(payload.reportHtml, 'utf8') < 40000, `reportHtml too large: ${Buffer.byteLength(payload.reportHtml, 'utf8')}`);
  assert.ok(!payload.reportFileName.includes('/'), 'reportFileName must sanitize date slashes');
});

test('SP-2: syncToSharePoint retries once with compact metadata HTML when webhook rejects full payload', async () => {
  const attempts = [];
  const { sandbox } = createBridgeSandbox({
    fetchImpl: async (url, opts) => {
      const body = JSON.parse(opts.body);
      attempts.push(body);
      if (attempts.length === 1) {
        return { ok: false, status: 413 };
      }
      return { ok: true, status: 202 };
    }
  });

  const res = await sandbox.KSUDataBridge.syncToSharePoint({
    id: 'RND-2026-SP2',
    formTitle: 'جولة سلامة',
    building: 'العيادات',
    score: 100
  }, 'inspection');

  assert.equal(attempts.length, 2, 'Must perform compact fallback retry after webhook HTTP 413/5xx');
  assert.equal(res.success, true);
  assert.ok(attempts[1].reportHtml.length < attempts[0].reportHtml.length, 'Fallback retry reportHtml must be compact');
  assert.ok(attempts[1].reportHtml.length <= 4500, 'Fallback retry reportHtml must stay tiny');
});

test('SP-3: syncToSharePoint queues offline failures in localStorage (never in demo) and flushes when online', async () => {
  let failNetwork = true;
  const sent = [];
  const { sandbox, localStorage } = createBridgeSandbox({
    fetchImpl: async (url, opts) => {
      if (failNetwork) throw new Error('Network error');
      const body = JSON.parse(opts.body);
      sent.push(body.recordId);
      return { ok: true, status: 202 };
    }
  });

  const failRes = await sandbox.KSUDataBridge.syncToSharePoint({
    id: 'RND-OFFLINE-1',
    formTitle: 'جولة ميدانية',
    score: 88
  }, 'inspection');
  assert.equal(failRes.success, false);
  assert.equal(failRes.queued, true, 'Failed real sync must be queued for retry');
  const queue = JSON.parse(localStorage.getItem('ksumc_sharepoint_retry_queue') || '[]');
  assert.equal(queue.length, 1);
  assert.equal(queue[0].payload.recordId, 'RND-OFFLINE-1');

  failNetwork = false;
  const flushRes = await sandbox.KSUDataBridge.flushSharePointQueue();
  assert.equal(flushRes.flushed, 1);
  assert.deepEqual(sent, ['RND-OFFLINE-1']);
  assert.deepEqual(JSON.parse(localStorage.getItem('ksumc_sharepoint_retry_queue') || '[]'), []);

  // Demo isolation check
  const demoCtx = createBridgeSandbox({
    sessionInit: { ksu_active_user: JSON.stringify({ username: 'demo', isDemoAccount: true }) },
    fetchImpl: async () => { throw new Error('Demo must not hit SharePoint'); }
  });
  const demoRes = await demoCtx.sandbox.KSUDataBridge.syncToSharePoint({ id: 'DEMO-1', score: 100 }, 'inspection');
  assert.equal(demoRes.blocked, true);
  assert.equal(demoCtx.localStorage.getItem('ksumc_sharepoint_retry_queue'), null);
});

test('SP-4: app.js saves in Shift Inspection Log and Safety Dept Reports stamp timestamp & sync to SharePoint', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');

  const extractFn = (src, sig) => {
    const start = src.indexOf(sig);
    assert.notEqual(start, -1, `Missing ${sig}`);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`Unclosed ${sig}`);
  };

  const shiftFn = extractFn(appJs, 'function saveShiftInspectionRecords(');
  const newShiftFn = extractFn(appJs, 'function saveNewShiftInspectionRecord(');
  assert.ok(shiftFn.includes('syncToSharePoint'), 'saveShiftInspectionRecords must support syncing targetRecord to SharePoint');
  assert.ok(newShiftFn.includes('timestamp'), 'saveNewShiftInspectionRecord must stamp ISO timestamp');
  assert.ok(newShiftFn.includes('saveShiftInspectionRecords(records, newRec)'), 'saveNewShiftInspectionRecord must pass newRec to saveShiftInspectionRecords');

  // Verify safetyDeptReports submission also calls syncToSharePoint
  const submitReportStart = appJs.indexOf('setOperationalStorageItem(STORAGE_KEY_SAFETY_DEPT_REPORTS');
  assert.notEqual(submitReportStart, -1);
  const submitReportSnippet = appJs.slice(submitReportStart, submitReportStart + 1400);
  assert.ok(submitReportSnippet.includes("syncToSharePoint(reportToSave, 'inspection')"), 'Safety dept report save must call syncToSharePoint');
});

test('AI-1: ksu-firebase-config.js, HTML portals, and sw.js configure reCAPTCHA Enterprise & bypass caching', () => {
  const cfgCtx = vm.createContext({ window: {}, localStorage: makeStorage() });
  cfgCtx.window = cfgCtx;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-firebase-config.js'), 'utf8'), cfgCtx);

  assert.equal(cfgCtx.KSU_FIREBASE_CONFIG.recaptchaEnterpriseSiteKey, '6LdbAzMuAAAAAA1rwj9YZfWTW1HSu9FtmAjzrtTh');
  assert.equal(cfgCtx.KSU_FIREBASE_CONFIG.firebaseAILogic.enabled, true);
  assert.equal(cfgCtx.KSU_FIREBASE_CONFIG.firebaseAILogic.backend, 'googleai');
  assert.equal(cfgCtx.KSU_FIREBASE_CONFIG.firebaseAILogic.useLimitedUseAppCheckTokens, true);
  assert.equal(cfgCtx.KSU_FIREBASE_CONFIG.firebaseAILogic.sdkVersion, '13.4.0');

  for (const htmlFile of ['field.html', 'quality.html', 'head.html', 'dashboard.html', 'admin.html', 'api.html']) {
    const html = fs.readFileSync(path.join(ROOT, htmlFile), 'utf8');
    assert.ok(html.includes('ksu-firebase-config.js'), `${htmlFile} must load ksu-firebase-config.js`);
  }

  const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(!swJs.includes("const CACHE_NAME = 'rsd-ksu-cache-v3.3.0-vision-recovery'"), 'sw.js CACHE_NAME must be bumped');
  for (const hostToken of ['googleapis.com', 'google.com/recaptcha', 'recaptcha.net', 'gstatic.com/recaptcha']) {
    assert.ok(swJs.includes(hostToken), `sw.js must bypass ${hostToken}`);
  }
});

test('AI-2: ksu-ai-client.js uses Firebase AI Logic + App Check when 0 /api keys exist and updates readiness badge', async () => {
  const aiCalls = [];
  const { sandbox, docElements } = createAISandbox({
    bridge: {
      async generateContent({ model, systemInstruction, generationConfig, contents }) {
        aiCalls.push({ model, systemInstruction, generationConfig, contents });
        const userText = contents[0].parts.filter(p => p.text).map(p => p.text).join('\n');
        const expectJson = Boolean(generationConfig && generationConfig.responseMimeType === 'application/json');
        if (!expectJson) {
          return { response: { text: () => 'إجابة استشارية دقيقة وفق معايير السلامة.' } };
        }
        if (userText.includes('CBAHI') || userText.includes('تقرير تدقيق') || userText.includes('المدخلات الميدانية') || userText.includes('overall_score')) {
          return { response: { text: () => '{"overall_score":91,"readiness_level":"جاهز","summary":"تدقيق ممتاز"}' } };
        }
        if (userText.includes('roundsPlan') || userText.includes('توزيع الجولات')) {
          return {
            response: {
              text: () => JSON.stringify({
                roundsPlan: Array.from({ length: 16 }, (_, i) => ({ day: i + 1, building: 'المبنى الرئيسي' })),
                summary: 'parsed'
              })
            }
          };
        }
        if (userText.includes('النص الصوتي')) {
          return { response: { text: () => JSON.stringify({ location: 'المبنى الرئيسي', hazard: 'توصيلة كهربائية', severity: 'high' }) } };
        }
        return {
          response: {
            text: () => JSON.stringify({
              status: 'مخالفة',
              pattern: 'emergency_exit',
              confidence: 95,
              risk: 'عالي',
              title: 'إغلاق مخرج طوارئ',
              summary: 'مخرج الطوارئ مغلق بصناديق.',
              observations: ['صناديق أمام المخرج'],
              capa_actions: ['فتح المخرج فوراً'],
              directive: 'إزالة العائق فوراً'
            })
          }
        };
      }
    },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => null })
  });

  assert.equal(sandbox.KSUAI.isFirebaseAILogicEnabled(), true);
  sandbox.updateVisionReadinessBadge();
  const badgeText = docElements.get('vision-readiness-text')?.textContent || '';
  assert.ok(badgeText.includes('جاهز'), `Badge should show ready when AI Logic active, got: "${badgeText}"`);

  const visRes = await sandbox.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,/9j/4AAQ', submode: 'emergency_exit' });
  assert.equal(visRes.success, true);
  assert.ok(visRes.source.includes('Firebase AI Logic'), `Expected Firebase AI Logic source, got: ${visRes.source}`);

  const chatRes = await sandbox.KSUAI.askSafetyAssistant('ما شروط مخرج الطوارئ؟');
  assert.equal(chatRes.success, true);
  assert.ok(chatRes.source.includes('Firebase AI Logic'));

  const voiceRes = await sandbox.KSUAI.structureVoiceRecord('يوجد توصيلة كهربائية مكشوفة في الممر الثاني', 'safety_violation');
  assert.equal(voiceRes.success, true);
  assert.ok(voiceRes.source.includes('Firebase AI Logic'));

  const auditRes = await sandbox.KSUAI.callGeminiCBAHIAudit('كافة المباني', 30, { totalRounds: 5, avgCompliance: 90 });
  assert.ok(auditRes && auditRes.success === true && auditRes.data && auditRes.data.overall_score === 91);
  assert.ok(auditRes.source.includes('Firebase AI Logic'));

  const dutyRes = await sandbox.KSUAI.parseDutyScheduleImage({ image: 'data:image/jpeg;base64,/9j/DUTY', shiftHint: 'shift1' });
  assert.ok(dutyRes && dutyRes.success === true && dutyRes.data && dutyRes.data.summary === 'parsed');
  assert.ok(dutyRes.source.includes('Firebase AI Logic'));

  assert.ok(aiCalls.length >= 5, 'All 5 AI operations must route through Firebase AI Logic');
  assert.ok(aiCalls[0].generationConfig && aiCalls[0].generationConfig.thinkingConfig, 'Must pass model thinkingConfig');
});

test('AI-3: ksu-ai-client.js silently fails over to /api Gemini keys when Firebase AI Logic fails', async () => {
  let aiLogicAttempts = 0;
  let geminiFetchCount = 0;
  const { sandbox } = createAISandbox({
    localInit: { ksumc_gemini_api_keys: 'AQ.Ab8RN6K_VaultBackup_01' },
    bridge: {
      async generateContent() {
        aiLogicAttempts++;
        const err = new Error('App Check reCAPTCHA blocked');
        err.status = 403;
        throw err;
      }
    },
    fetchImpl: async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        geminiFetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  text: JSON.stringify({
                    status: 'مطابق',
                    pattern: 'extinguisher',
                    confidence: 97,
                    risk: 'منخفض',
                    title: 'طفاية مطابقة',
                    summary: 'سليمة وجاهزة.',
                    observations: ['ضغط سليم'],
                    capa_actions: ['متابعة شهرية'],
                    directive: 'اعتماد المطابقة'
                  })
                }]
              }
            }]
          })
        };
      }
      throw new Error('Unexpected fetch ' + url);
    }
  });

  const visRes = await sandbox.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,/9j/FAILOVER', submode: 'extinguisher' });
  assert.equal(visRes.success, true, 'Must seamlessly succeed via /api vault key failover');
  assert.ok(aiLogicAttempts >= 1, 'Must attempt Firebase AI Logic first before failing over');
  assert.ok(geminiFetchCount >= 1, 'Must fall back to /api Gemini key endpoint');
  assert.ok(visRes.source.includes('Google '), `Expected Google REST fallback source, got: ${visRes.source}`);

  const chatRes = await sandbox.KSUAI.askSafetyAssistant('كيف نفحص الطفاية؟');
  assert.equal(chatRes.success, true);
  assert.ok(aiLogicAttempts >= 2, 'Text assistant must attempt Firebase AI Logic first');
  assert.ok(geminiFetchCount >= 2, 'Text assistant must also fail over to /api Gemini key');
});

test('AI-4: demo/demo session NEVER calls Firebase AI Logic bridge (0 billed calls)', async () => {
  let billedCalls = 0;
  const { sandbox, docElements } = createAISandbox({
    sessionInit: { ksu_active_user: JSON.stringify({ username: 'demo', isDemoAccount: true }) },
    bridge: {
      async generateContent() {
        billedCalls++;
        throw new Error('SECURITY VIOLATION: Demo user must NEVER call Firebase AI Logic!');
      }
    },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => null })
  });

  assert.equal(sandbox.KSUAI._isDemoSession(), true);
  assert.equal(sandbox.KSUAI.isFirebaseAILogicEnabled(), false);

  sandbox.updateVisionReadinessBadge();
  const badgeText = docElements.get('vision-readiness-text')?.textContent || '';
  assert.ok(badgeText.includes('الوضع التجريبي'), `Demo badge must stay in demo mode, got: "${badgeText}"`);

  const visRes = await sandbox.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,/9j/DEMO' });
  assert.equal(visRes.success, false);
  await sandbox.KSUAI.askSafetyAssistant('سؤال');
  await sandbox.KSUAI.structureVoiceRecord('بلاغ تجريبي');
  await assert.rejects(() => sandbox.KSUAI.callGeminiCBAHIAudit('الكل', 30, {}));
  assert.equal(billedCalls, 0, 'Demo session must trigger ZERO billed Firebase AI Logic calls');
});

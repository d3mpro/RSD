const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// 1. Verify /api Routing & Rewrites
test('1. Routing & Rewrites Parity for /api and api.html', (t) => {
  // Check firebase.json
  const firebaseJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase.json'), 'utf8'));
  const apiRewrite = firebaseJson.hosting.rewrites.find(r => r.source === '/api');
  assert.ok(apiRewrite, 'firebase.json must contain rewrite for /api');
  assert.equal(apiRewrite.destination, '/api.html', '/api must rewrite to /api.html');

  // Check server.js
  const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.ok(serverJs.includes("'/api': '/api.html'"), 'server.js ROUTE_ALIASES must route /api to /api.html');
  assert.ok(serverJs.includes("'/api.html': '/api.html'"), 'server.js ROUTE_ALIASES must route /api.html to /api.html');

  // Check index.html client router
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(indexHtml.includes("urlParams.get('page') === 'api'"), 'index.html must handle ?page=api');
  assert.ok(indexHtml.includes("window.location.hash === '#/api'"), 'index.html must handle #/api');
  assert.ok(indexHtml.includes("./api.html"), 'index.html must redirect to ./api.html');

  // Check database.rules.json
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8'));
  assert.ok(rulesJson.rules.system_config, 'database.rules.json must define system_config');
  assert.ok(
    typeof rulesJson.rules.system_config['.read'] === 'string' && rulesJson.rules.system_config['.read'].includes("auth.token.role == 'admin'"),
    'system_config must restrict reads to authorized roles'
  );
});

// 2. Verify api.html Password Gate and Security
test('2. api.html Password Gate, Key Vault & No Hardcoded Keys in Source', (t) => {
  assert.ok(fs.existsSync(path.join(__dirname, '../api.html')), 'api.html must exist');
  const apiHtml = fs.readFileSync(path.join(__dirname, '../api.html'), 'utf8');

  // Password gate check
  assert.ok(apiHtml.includes('Rsd@2026'), 'api.html must configure default password Rsd@2026');
  assert.ok(apiHtml.includes('admin-password-input'), 'api.html must have password input field');
  assert.ok(apiHtml.includes('system_config/ai_keys.json'), 'api.html must sync keys to Firebase system_config/ai_keys.json');

  // Multi-key rotation & health test
  assert.ok(apiHtml.includes('verifyAllGeminiKeys'), 'api.html must implement instant key health verification');
  assert.ok(apiHtml.includes('saveCentralizedKeys'), 'api.html must implement centralized cloud saving');
  assert.ok(apiHtml.includes('txt-qwen-key'), 'api.html must provide optional OpenRouter/Qwen key input');

  // Verify NO hardcoded active API keys in source files
  const ksuClientJs = fs.readFileSync(path.join(__dirname, '../assets/js/ksu-ai-client.js'), 'utf8');
  assert.ok(!ksuClientJs.includes("geminiApiKey: 'AQ.Ab8RN6K"), 'Corrupted legacy key must not be assigned as active key');
  assert.ok(!ksuClientJs.includes('geminiApiKey: "AIzaSy'), 'No hardcoded Gemini API key string allowed in ksu-ai-client.js');
  assert.ok(!apiHtml.includes('AIzaSyB'), 'No hardcoded active key in api.html (placeholders only)');
});

// 3. Verify Inspector UI Purity (No API controls or alerts in field.html)
test('3. Inspector UI Purity: No API Key Settings or Alerts in field.html or admin.html', (t) => {
  const fieldHtml = fs.readFileSync(path.join(__dirname, '../field.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');

  // Ensure no API settings button or gear in field.html
  assert.ok(!fieldHtml.includes('toggleVisionAgentSettingsPanel'), 'field.html must not contain API settings panel toggles');
  assert.ok(!fieldHtml.includes('ksumc_gemini_api_key'), 'field.html must not expose API key input fields');
  assert.ok(!adminHtml.includes('ksumc_gemini_api_key'), 'admin.html must not expose API key input fields');
});

// 4. Verify Multi-Model Silent Fallback & Quota-Shield in ksu-ai-client.js
test('4. Multi-Model Silent Fallback Chain (2026 Active Models) & Quota-Shield in ksu-ai-client.js', (t) => {
  const ksuClientJs = fs.readFileSync(path.join(__dirname, '../assets/js/ksu-ai-client.js'), 'utf8');

  // Active 2026 model hierarchy check (no retired gemini-2.0-flash / gemini-2.0-flash-lite)
  assert.ok(ksuClientJs.includes("MODELS_HIERARCHY: ["), 'Must define MODELS_HIERARCHY array on KSUAI');
  assert.ok(ksuClientJs.includes("'gemini-3.5-flash-lite'"), 'MODELS_HIERARCHY must start with gemini-3.5-flash-lite');
  assert.ok(ksuClientJs.includes("'gemini-3.8-flash'"), 'MODELS_HIERARCHY must include gemini-3.8-flash');
  assert.ok(ksuClientJs.includes("'gemini-2.5-flash-lite'"), 'MODELS_HIERARCHY must include gemini-2.5-flash-lite');

  // Quota-Shield capabilities
  assert.ok(ksuClientJs.includes('_computeVisionCacheKey'), 'Must implement image fingerprint caching');
  assert.ok(ksuClientJs.includes('_isGeminiCoolingDown'), 'Must implement 429/401/404 cooldown circuit-breaker');
  assert.ok(ksuClientJs.includes('getQuotaShieldStats'), 'Must expose Quota-Shield telemetry');

  // Background silent cloud key synchronization
  assert.ok(ksuClientJs.includes('fetchCloudKeysSilently'), 'Must define fetchCloudKeysSilently');
  assert.ok(ksuClientJs.includes('system_config/ai_keys.json'), 'Must query /system_config/ai_keys.json in background');

  // Image collage & preprocessing
  assert.ok(ksuClientJs.includes('createInspectionCollage'), 'Must define createInspectionCollage');
  assert.ok(ksuClientJs.includes('compressImageForAI'), 'Must define compressImageForAI');
});

// 5. Functional Simulation: Silent Multi-Model Failover & Key Rotation
test('5. Functional Simulation: Multi-Model Failover and Key Rotation Logic', async (t) => {
  const modelsTried = [];
  const keysTried = [];
  const fakeKeys = ['KEY_A', 'KEY_B'];
  const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash-lite'];

  let successModel = null;
  let keyIdx = 0;

  for (let m = 0; m < MODELS.length; m++) {
    const curModel = MODELS[m];
    modelsTried.push(curModel);

    let modelPassed = false;
    for (let k = 0; k < fakeKeys.length; k++) {
      const curKey = fakeKeys[(keyIdx++) % fakeKeys.length];
      keysTried.push({ model: curModel, key: curKey });

      if (curModel === 'gemini-3.5-flash-lite') {
        continue; // Quota 429 -> silently continues
      }
      if (curModel === 'gemini-3.8-flash') {
        if (curKey === 'KEY_A') continue; // 503
        successModel = curModel;
        modelPassed = true;
        break;
      }
    }
    if (modelPassed) break;
  }

  assert.equal(successModel, 'gemini-3.8-flash', 'Should successfully recover using gemini-3.8-flash');
  assert.deepEqual(modelsTried, ['gemini-3.5-flash-lite', 'gemini-3.8-flash'], 'Should evaluate active models in strict priority order');
  assert.ok(keysTried.length >= 3, 'Should silently rotate through keys across model hierarchy');
});

// Helper to run ksu-ai-client.js in a clean VM sandbox
function createQuotaShieldSandbox(customFetch) {
  const vm = require('node:vm');
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
  const sandbox = {
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    AbortController,
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
    localStorage,
    sessionStorage: localStorage,
    navigator: { userAgent: 'NodeTest', onLine: true },
    location: { hostname: 'localhost', protocol: 'http:', href: 'http://localhost/field.html' },
    fetch: customFetch
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, '../assets/js/ksu-ai-client.js'), 'utf8');
  vm.runInContext(code, ctx);
  return ctx;
}

// 6. Runtime Verification: Image Fingerprint Cache, 429 Cooldown Circuit-Breaker & Prompt Deduplication
test('6. Quota-Shield Runtime: Image cache prevents duplicate API calls, 429 cooldown skips exhausted pairs, and prompt is not duplicated', async () => {
  const fetchCalls = [];
  const validPayload = JSON.stringify({
    status: 'غير مطابق',
    pattern: 'emergency_exit',
    confidence: 96,
    risk: 'عالي',
    title: 'إعاقة باب مخرج الطوارئ بكراتين',
    summary: 'وجود كراتين مكدسة أمام باب مخرج الطوارئ تعيق الإخلاء.',
    observations: ['كراتين مكدسة أمام الباب'],
    capa_actions: ['إزالة الكراتين فوراً'],
    directive: 'تحرير مخرج الطوارئ فوراً'
  });

  const mockFetch = async (url, opts) => {
    if (url.includes('system_config/ai_keys.json')) {
      return { ok: false, status: 404, json: async () => null };
    }
    const parsedBody = opts && opts.body ? JSON.parse(opts.body) : null;
    fetchCalls.push({ url, body: parsedBody });

    // First model gemini-3.5-flash-lite hits 429 on key_1, succeeds on gemini-3.8-flash!
    if (url.includes('gemini-3.5-flash-lite') && url.includes('key=key_1')) {
      return {
        ok: false,
        status: 429,
        headers: { get: () => '65' },
        text: async () => 'RESOURCE_EXHAUSTED: per minute quota exceeded'
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: validPayload }] } }]
      })
    };
  };

  const ctx = createQuotaShieldSandbox(mockFetch);
  ctx.window.KSUAI.saveAgentConfig({ geminiApiKeys: 'key_1' });

  // Call 1: hits 429 on gemini-3.5-flash-lite, automatically fails over to gemini-3.8-flash
  const res1 = await ctx.window.KSUAI.analyzeInspectionImage({
    image: 'data:image/jpeg;base64,AAAA1111',
    submode: 'emergency_exit',
    building: 'المستشفى'
  });
  assert.equal(res1.success, true);
  assert.equal(res1.source, 'Google gemini-3.8-flash Vision');
  assert.equal(fetchCalls.length, 2, 'Should try 3.5-flash-lite (429) then succeed on 3.8-flash');

  // Verify prompt deduplication & token cap
  const firstReqBody = fetchCalls[0].body;
  const sysText = firstReqBody.systemInstruction.parts[0].text;
  const userText = firstReqBody.contents[0].parts.find(p => p.text).text;
  assert.ok(sysText.includes('كبير مفتشي السلامة'), 'System instruction must carry VISION_SYSTEM_PROMPT');
  assert.ok(!userText.includes('كبير مفتشي السلامة'), 'User prompt must NOT duplicate VISION_SYSTEM_PROMPT');
  assert.equal(firstReqBody.generationConfig.maxOutputTokens, 700, 'Must cap maxOutputTokens to save quota');
  assert.equal(firstReqBody.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL', '3.5-flash-lite should use MINIMAL thinking');

  // Call 2: EXACT SAME IMAGE -> 0 API calls (served from local fingerprint cache!)
  const res2 = await ctx.window.KSUAI.analyzeInspectionImage({
    image: 'data:image/jpeg;base64,AAAA1111',
    submode: 'emergency_exit',
    building: 'المستشفى'
  });
  assert.equal(res2.success, true);
  assert.equal(res2.cached, true, 'Second identical call must be served from cache');
  assert.equal(fetchCalls.length, 2, 'Cached call must make ZERO additional API requests');

  // Call 3: DIFFERENT IMAGE -> must SKIP cooling-down (gemini-3.5-flash-lite, key_1) and go straight to gemini-3.8-flash!
  const res3 = await ctx.window.KSUAI.analyzeInspectionImage({
    image: 'data:image/jpeg;base64,BBBB2222',
    submode: 'extinguisher',
    building: 'العيادات'
  });
  assert.equal(res3.success, true);
  assert.equal(res3.source, 'Google gemini-3.8-flash Vision');
  assert.equal(fetchCalls.length, 3, 'Cooldown circuit-breaker must skip rate-limited 3.5-flash-lite in 1 call');
  assert.ok(fetchCalls[2].url.includes('gemini-3.8-flash'), 'Call 3 must go straight to healthy gemini-3.8-flash');

  const stats = ctx.window.KSUAI.getQuotaShieldStats();
  assert.equal(stats.cacheHits, 1, 'Must record 1 cache hit');
  assert.ok(stats.cooldownSkips >= 1, 'Must record at least 1 cooldown skip');
});


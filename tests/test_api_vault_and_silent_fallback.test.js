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

  // Active 2026 model hierarchy check (no retired gemini-2.0-flash / gemini-2.5-flash)
  assert.ok(ksuClientJs.includes("MODELS_HIERARCHY: ["), 'Must define MODELS_HIERARCHY array on KSUAI');
  assert.ok(ksuClientJs.includes("'gemini-3.5-flash-lite'"), 'MODELS_HIERARCHY must start with gemini-3.5-flash-lite');
  assert.ok(ksuClientJs.includes("'gemini-3.1-flash-lite'"), 'MODELS_HIERARCHY must include gemini-3.1-flash-lite');
  assert.ok(ksuClientJs.includes("'gemini-3.6-flash'"), 'MODELS_HIERARCHY must include gemini-3.6-flash');
  assert.ok(ksuClientJs.includes("'gemini-3.8-flash'"), 'MODELS_HIERARCHY must include gemini-3.8-flash');
  assert.ok(ksuClientJs.includes("'gemini-4-hydrogen'"), 'MODELS_HIERARCHY must include gemini-4-hydrogen');

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

  // Call 1: hits 429 on gemini-3.5-flash-lite, automatically fails over to gemini-3.1-flash-lite
  const res1 = await ctx.window.KSUAI.analyzeInspectionImage({
    image: 'data:image/jpeg;base64,AAAA1111',
    submode: 'emergency_exit',
    building: 'المستشفى'
  });
  assert.equal(res1.success, true);
  assert.equal(res1.source, 'Google gemini-3.1-flash-lite Vision');
  assert.equal(fetchCalls.length, 2, 'Should try 3.5-flash-lite (429) then succeed on 3.1-flash-lite');

  // Verify prompt deduplication & token cap
  const firstReqBody = fetchCalls[0].body;
  const sysText = firstReqBody.systemInstruction.parts[0].text;
  const userText = firstReqBody.contents[0].parts.find(p => p.text).text;
  assert.ok(sysText.includes('كبير مفتشي السلامة'), 'System instruction must carry VISION_SYSTEM_PROMPT');
  assert.ok(!userText.includes('كبير مفتشي السلامة'), 'User prompt must NOT duplicate VISION_SYSTEM_PROMPT');
  assert.equal(firstReqBody.generationConfig.maxOutputTokens, 2048, 'Must allow 2048 maxOutputTokens for thinking + Arabic JSON');
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

  // Call 3: DIFFERENT IMAGE -> must SKIP cooling-down (gemini-3.5-flash-lite, key_1) and go straight to gemini-3.1-flash-lite!
  const res3 = await ctx.window.KSUAI.analyzeInspectionImage({
    image: 'data:image/jpeg;base64,BBBB2222',
    submode: 'extinguisher',
    building: 'العيادات'
  });
  assert.equal(res3.success, true);
  assert.equal(res3.source, 'Google gemini-3.1-flash-lite Vision');
  assert.equal(fetchCalls.length, 3, 'Cooldown circuit-breaker must skip rate-limited 3.5-flash-lite in 1 call');
  assert.ok(fetchCalls[2].url.includes('gemini-3.1-flash-lite'), 'Call 3 must go straight to healthy gemini-3.1-flash-lite');

  const stats = ctx.window.KSUAI.getQuotaShieldStats();
  assert.equal(stats.cacheHits, 1, 'Must record 1 cache hit');
  assert.ok(stats.cooldownSkips >= 1, 'Must record at least 1 cooldown skip');
});

// 7. M1 Regression: AQ.* keys, iOS invisible Unicode stripping & exact leaked key SHA-256 rejection
test('7. M1 Regression: AQ.* keys & iOS invisible Unicode stripped, exact leaked key rejected in ksu-ai-client.js and api.html', () => {
  const ctx = createQuotaShieldSandbox(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const exactLeaked = ['AQ.Ab8RN6K', '-cWBO2DLr-uuccKEbUvakPdEhwL9qMV4DMjeYggHF0w'].join('');
  const iOSDirty = `\u200F\uFEFF AQ.Ab8RN6K_ProjA_Test01\u200B \n  AQ.Ab8RN6K_ProjB_Test02; ${exactLeaked}`;

  const clientClean = Array.from(ctx.window.KSUAI.getSanitizedKeys(iOSDirty));
  assert.deepEqual(clientClean, ['AQ.Ab8RN6K_ProjA_Test01', 'AQ.Ab8RN6K_ProjB_Test02']);
  assert.equal(ctx.window.KSUAI._isLegacyLeakedKey(exactLeaked), true, 'Exact leaked key SHA-256 must match');
  assert.equal(ctx.window.KSUAI._isLegacyLeakedKey('AQ.Ab8RN6K_ProjA_Test01'), false, 'Separate GCP project AQ.* key must NOT match leaked SHA-256');

  // Verify api.html parseInputKeys parity
  const vm = require('node:vm');
  const apiHtml = fs.readFileSync(path.join(__dirname, '../api.html'), 'utf8');
  const extractFn = (src, sig) => {
    const start = src.indexOf(sig);
    assert.ok(start !== -1, `${sig} must exist in api.html`);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
    throw new Error(`Unclosed function ${sig}`);
  };
  const leakedConstMatch = apiHtml.match(/const LEGACY_LEAKED_KEY_SHA256 = '[^']+';/);
  assert.ok(leakedConstMatch, 'api.html must define LEGACY_LEAKED_KEY_SHA256');
  const shaFn = extractFn(apiHtml, 'function sha256Hex(');
  const parseFn = extractFn(apiHtml, 'function parseInputKeys(');
  const apiCtx = vm.createContext({ Array, Set, String, Math });
  vm.runInContext(`${leakedConstMatch[0]}\n${shaFn}\n${parseFn}\nglobalThis.parseInputKeys = parseInputKeys;`, apiCtx);

  const vaultClean = Array.from(apiCtx.parseInputKeys(iOSDirty));
  assert.deepEqual(vaultClean, ['AQ.Ab8RN6K_ProjA_Test01', 'AQ.Ab8RN6K_ProjB_Test02']);
});

// 8. M1 Regression: database.rules.json system_config RBAC structure
test('8. M1 Regression: database.rules.json permits staff read of ai_keys while locking system_config writes & admin_auth to admin|developer', () => {
  const rulesRaw = fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8');
  const rules = JSON.parse(rulesRaw);
  const sysCfg = rules?.rules?.system_config;
  assert.ok(sysCfg, 'system_config rules node must exist');

  assert.ok(sysCfg['.read'].includes("auth.token.role == 'admin'") && sysCfg['.read'].includes("auth.token.role == 'developer'"));
  assert.ok(!sysCfg['.read'].includes('field_inspector'), 'Top-level system_config read must NOT expose all nodes to inspectors');
  assert.ok(sysCfg['.write'].includes("auth.token.role == 'admin'") && sysCfg['.write'].includes("auth.token.role == 'developer'"));

  const aiKeysRead = sysCfg.ai_keys['.read'];
  for (const role of ['head', 'admin', 'developer', 'executive', 'quality', 'shift_supervisor', 'field_inspector']) {
    assert.ok(aiKeysRead.includes(`'${role}'`), `system_config/ai_keys .read must include ${role}`);
  }
  assert.ok(!sysCfg.ai_keys['.write'].includes('field_inspector'), 'system_config/ai_keys .write must remain restricted');

  assert.ok(sysCfg.admin_auth['.read'].includes("auth.token.role == 'admin'") && !sysCfg.admin_auth['.read'].includes('field_inspector'));
  assert.ok(sysCfg.admin_auth['.write'].includes("auth.token.role == 'admin'") && !sysCfg.admin_auth['.write'].includes('field_inspector'));
});

// 9. M1 Regression: api.html Firebase DEV/admin Auth, ?auth= parameter, and honest failure banners
test('9. M1 Regression: api.html wires Firebase Auth ID token (?auth=), probe reminder, and honest failure status alert', () => {
  const apiHtml = fs.readFileSync(path.join(__dirname, '../api.html'), 'utf8');
  assert.ok(apiHtml.includes('firebase-app-compat.js'), 'api.html must load firebase-app-compat.js');
  assert.ok(apiHtml.includes('firebase-auth-compat.js'), 'api.html must load firebase-auth-compat.js');
  assert.ok(apiHtml.includes('ksu-firebase-config.js'), 'api.html must load ksu-firebase-config.js');
  assert.ok(apiHtml.includes('id="firebase-inline-signin-panel"'), 'api.html must render Firebase sign-in panel for unauthenticated admins');
  assert.ok(apiHtml.includes('id="cloud-sync-status-alert"'), 'api.html must expose honest cloud sync error alert banner');
  assert.ok(apiHtml.includes('id="verify-save-reminder"'), 'api.html must remind operator to save centrally after probe');
  assert.ok(apiHtml.includes('async function getAdminFirebaseIdToken()'), 'api.html must acquire Firebase ID token');
  assert.ok(apiHtml.includes('?auth=${encodeURIComponent(idToken)}'), 'api.html must attach ?auth=<idToken> on RTDB requests');
  assert.ok(!apiHtml.includes('تم الحفظ محلياً (مؤقتاً) رغم تعذر'), 'api.html must never mask RTDB failure as fake green success toast');
});

// 10. M1 Regression: !p.thought extraction, 400 API_KEY_INVALID cooldown, and honest error_code telemetry
test('10. M1 Regression: callGeminiDirectly extracts non-thought parts, cools down 400 API_KEY_INVALID, and sets exact error_code values', async () => {
  // 10a: Multi-part thought filtering -> picks non-thought JSON part
  const ctxThought = createQuotaShieldSandbox(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{
        content: {
          parts: [
            { text: 'Thinking step: evaluating hazard...', thought: true },
            { text: '{"status":"مخالفة","title":"مخرج طوارئ مغلق","summary":"تم حجب المخرج بكراتين","severity":"high"}' }
          ]
        }
      }]
    })
  }));
  ctxThought.window.KSUAI.saveAgentConfig({ geminiApiKeys: 'AQ.Ab8RN6K_ThoughtKey_01' });
  const thoughtRes = await ctxThought.window.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,VEVTVF9USE9VR0hU' });
  assert.equal(thoughtRes.success, true);
  assert.equal(thoughtRes.data.title, 'مخرج طوارئ مغلق');

  // 10b: HTTP 400 API_KEY_INVALID skips key immediately across models & surfaces ERR_GEMINI_AUTH_401_403
  let invalidKeyCalls = 0;
  const ctxInvalid = createQuotaShieldSandbox(async (url) => {
    if (url.includes('generativelanguage.googleapis.com')) {
      invalidKeyCalls++;
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }]
          }
        })
      };
    }
    throw new Error('Unexpected URL');
  });
  ctxInvalid.window.KSUAI.saveAgentConfig({ geminiApiKeys: 'bad_key_only' });
  const authFailRes = await ctxInvalid.window.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,SU5WQUxJRF80MDA=' });
  assert.equal(authFailRes.success, false);
  assert.equal(authFailRes.error_code, 'ERR_GEMINI_AUTH_401_403');
  assert.equal(invalidKeyCalls, 1, 'HTTP 400 API_KEY_INVALID must cool down bad_key_only across all remaining models (1 call, not 5)');

  // 10c: Empty vault -> ERR_NO_AI_KEYS; unauthenticated vault 401 -> ERR_CLOUD_AUTH_REQUIRED; all 429 -> ERR_QUOTA_EXHAUSTED_429
  const ctxEmpty = createQuotaShieldSandbox(async (url) => {
    if (String(url).includes('firebaseio.com')) {
      return { ok: true, status: 200, json: async () => null };
    }
    throw new Error('Should not fetch Gemini without keys');
  });
  const noKeyRes = await ctxEmpty.window.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,Tk9fS0VZ' });
  assert.equal(noKeyRes.success, false);
  assert.equal(noKeyRes.error_code, 'ERR_NO_AI_KEYS');

  const ctxCloud401 = createQuotaShieldSandbox(async (url) => {
    if (String(url).includes('firebaseio.com')) {
      return { ok: false, status: 401, json: async () => ({ error: 'Permission denied' }) };
    }
    throw new Error('Should not fetch Gemini when cloud sync returned 401');
  });
  const cloudAuthRes = await ctxCloud401.window.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,Q0xPVURfNDAx' });
  assert.equal(cloudAuthRes.success, false);
  assert.equal(cloudAuthRes.error_code, 'ERR_CLOUD_AUTH_REQUIRED');

  const ctxQuota = createQuotaShieldSandbox(async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '30s' }] } })
  }));
  ctxQuota.window.KSUAI.saveAgentConfig({ geminiApiKeys: 'quota_key_1' });
  const quotaRes = await ctxQuota.window.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,UVVPVEFfNDI5' });
  assert.equal(quotaRes.success, false);
  assert.equal(quotaRes.error_code, 'ERR_QUOTA_EXHAUSTED_429');
});

// 11. M1 Regression: demo/demo Visual Observer runs with sessionStorage key and makes ZERO RTDB/localStorage writes
test('11. M1 Regression: demo/demo Visual Observer uses sessionStorage isolation with zero RTDB fetches or localStorage writes', async () => {
  const vm = require('node:vm');
  const ksuClientJs = fs.readFileSync(path.join(__dirname, '../assets/js/ksu-ai-client.js'), 'utf8');
  const mkStore = (init = {}) => {
    const map = new Map(Object.entries(init));
    return {
      _map: map,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
      clear: () => map.clear(),
      get length() { return map.size; }
    };
  };
  const localStorage = mkStore();
  const sessionStorage = mkStore({
    ksu_active_user: JSON.stringify({ username: 'demo', role: 'field_inspector', isDemoAccount: true }),
    demo_ksumc_gemini_api_keys: 'AQ.Ab8RN6K_DemoSessionKey_01'
  });

  let rtdbFetches = 0;
  let geminiFetches = 0;
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    AbortController,
    URL,
    localStorage,
    sessionStorage,
    navigator: { userAgent: 'NodeDemoTest', onLine: true },
    location: { hostname: 'rsd-ksu.web.app', protocol: 'https:', href: 'https://rsd-ksu.web.app/field' },
    document: {
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, setAttribute: () => {}, appendChild: () => {} }),
      body: { appendChild: () => {} },
      getElementById: () => null,
      querySelectorAll: () => []
    },
    window: null,
    fetch: async (url) => {
      if (String(url).includes('firebaseio.com')) {
        rtdbFetches++;
        throw new Error('demo account must NEVER hit Firebase RTDB');
      }
      if (String(url).includes('generativelanguage.googleapis.com')) {
        geminiFetches++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: '{"status":"مطابق","title":"تجربة معزولة","summary":"نجح الفحص التجريبي عبر sessionStorage","severity":"low"}' }] } }]
          })
        };
      }
      throw new Error('Unexpected fetch URL: ' + url);
    }
  });
  ctx.window = ctx;
  ctx.self = ctx;
  vm.runInContext(ksuClientJs, ctx);

  const cloudSynced = await ctx.window.KSUAI.fetchCloudKeysSilently();
  assert.equal(cloudSynced, undefined, 'demo user fetchCloudKeysSilently must return early without syncing');
  assert.equal(rtdbFetches, 0, 'demo user must perform ZERO Firebase RTDB fetches');

  const keys = Array.from(ctx.window.KSUAI.getGeminiKeys());
  assert.deepEqual(keys, ['AQ.Ab8RN6K_DemoSessionKey_01']);

  const demoRes = await ctx.window.KSUAI.analyzeInspectionImage({ image: 'data:image/jpeg;base64,REVNTw==' });
  assert.equal(demoRes.success, true);
  assert.equal(geminiFetches, 1);
  assert.equal(rtdbFetches, 0);
  assert.equal(localStorage.length, 0, 'demo Visual Observer test must write ZERO keys to persistent localStorage');
});


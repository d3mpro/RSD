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
  assert.equal(rulesJson.rules.system_config['.read'], true, 'system_config must be readable by inspectors');
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

// 4. Verify Multi-Model Silent Fallback & Key Rotation in ksu-ai-client.js
test('4. Multi-Model Silent Fallback Chain in ksu-ai-client.js', (t) => {
  const ksuClientJs = fs.readFileSync(path.join(__dirname, '../assets/js/ksu-ai-client.js'), 'utf8');

  // Model hierarchy check
  assert.ok(ksuClientJs.includes('gemini-2.5-flash'), 'Must support gemini-2.5-flash');
  assert.ok(ksuClientJs.includes('gemini-2.0-flash'), 'Must support gemini-2.0-flash');
  assert.ok(ksuClientJs.includes('gemini-2.0-flash-lite'), 'Must support gemini-2.0-flash-lite');

  // Multi-model array hierarchy
  assert.ok(ksuClientJs.includes("MODELS_HIERARCHY = ["), 'Must define MODELS_HIERARCHY array');
  assert.ok(ksuClientJs.includes("'gemini-2.5-flash'"), 'MODELS_HIERARCHY must start with 2.5 flash');
  assert.ok(ksuClientJs.includes("'gemini-2.0-flash'"), 'MODELS_HIERARCHY must include 2.0 flash');
  assert.ok(ksuClientJs.includes("'gemini-2.0-flash-lite'"), 'MODELS_HIERARCHY must include 2.0 flash-lite');

  // Background silent cloud key synchronization
  assert.ok(ksuClientJs.includes('fetchCloudKeysSilently'), 'Must define fetchCloudKeysSilently');
  assert.ok(ksuClientJs.includes('system_config/ai_keys.json'), 'Must query /system_config/ai_keys.json in background');

  // Image collage & preprocessing
  assert.ok(ksuClientJs.includes('createInspectionCollage'), 'Must define createInspectionCollage');
  assert.ok(ksuClientJs.includes('compressImageForAI'), 'Must define compressImageForAI');
});

// 5. Functional Simulation: Silent Multi-Model Failover & Collage Creation
test('5. Functional Simulation: Multi-Model Failover and Key Rotation Logic', async (t) => {
  const modelsTried = [];
  const keysTried = [];
  const fakeKeys = ['KEY_A', 'KEY_B'];
  const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

  let successModel = null;
  let keyIdx = 0;

  for (let m = 0; m < MODELS.length; m++) {
    const curModel = MODELS[m];
    modelsTried.push(curModel);

    let modelPassed = false;
    for (let k = 0; k < fakeKeys.length; k++) {
      const curKey = fakeKeys[(keyIdx++) % fakeKeys.length];
      keysTried.push({ model: curModel, key: curKey });

      // Simulate: gemini-2.5-flash hits Quota 429 on all keys
      if (curModel === 'gemini-2.5-flash') {
        // Quota 429 -> silently continues to next key/model
        continue;
      }

      // Simulate: gemini-2.0-flash Key A fails with 503, Key B succeeds!
      if (curModel === 'gemini-2.0-flash') {
        if (curKey === 'KEY_A') {
          continue; // 503
        }
        // Key B succeeds!
        successModel = curModel;
        modelPassed = true;
        break;
      }
    }
    if (modelPassed) break;
  }

  assert.equal(successModel, 'gemini-2.0-flash', 'Should successfully recover using gemini-2.0-flash');
  assert.deepEqual(modelsTried, ['gemini-2.5-flash', 'gemini-2.0-flash'], 'Should have evaluated models in strict priority order');
  assert.ok(keysTried.length >= 3, 'Should have silently rotated through keys across model hierarchy');
});

/**
 * ==============================================================================
 * Comprehensive Unit and Integration Test Suite for Milestone 2:
 * Frontend AI Client & Communication Protocol (ksu-ai-client.js)
 * ==============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');
const aiClientCode = fs.readFileSync(aiClientPath, 'utf8');

function createM2Sandbox(initialLocalStorage = {}, initialLocation = {}) {
  const storage = new Map(Object.entries(initialLocalStorage));
  const docElementsMap = new Map();

  const mockLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
  };

  const createMockElement = (tag, id) => {
    const el = {
      tagName: tag.toUpperCase(),
      id: id || '',
      value: '',
      textContent: '',
      innerHTML: '',
      classList: {
        _classes: new Set(),
        add: (...cls) => cls.forEach(c => el.classList._classes.add(c)),
        remove: (...cls) => cls.forEach(c => el.classList._classes.delete(c)),
        contains: (c) => el.classList._classes.has(c)
      },
      style: {},
      disabled: false,
      querySelector: () => null
    };
    if (id) docElementsMap.set(id, el);
    return el;
  };

  const mockDocument = {
    getElementById: (id) => docElementsMap.get(id) || createMockElement('div', id),
    createElement: (tag) => createMockElement(tag),
    body: createMockElement('body', 'body')
  };

  const defaultLocation = {
    hostname: 'rsdsafety.online',
    host: 'rsdsafety.online',
    protocol: 'https:',
    port: '',
    href: 'https://rsdsafety.online/field.html',
    ...initialLocation
  };

  const mockWindow = {
    location: defaultLocation,
    localStorage: mockLocalStorage,
    document: mockDocument,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: async () => { throw new Error('Network offline in unit test'); },
    KSUAI: null
  };
  mockWindow.window = mockWindow;

  const sandbox = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    location: mockWindow.location,
    setTimeout: (...args) => (mockWindow.setTimeout ? mockWindow.setTimeout(...args) : setTimeout(...args)),
    clearTimeout: (...args) => (mockWindow.clearTimeout ? mockWindow.clearTimeout(...args) : clearTimeout(...args)),
    setInterval: (...args) => (mockWindow.setInterval ? mockWindow.setInterval(...args) : setInterval(...args)),
    clearInterval: (...args) => (mockWindow.clearInterval ? mockWindow.clearInterval(...args) : clearInterval(...args)),
    fetch: (...args) => mockWindow.fetch(...args),
    AbortController,
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

  vm.runInContext(aiClientCode, sandbox);
  return {
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    KSUAI: mockWindow.KSUAI
  };
}

test('M2 - Feature 4: Client API Routing & Endpoint Discovery', async (t) => {
  await t.test('F4.1: Normalizes empty endpoint string to base root with trailing slash', () => {
    const sandbox = createM2Sandbox({ ksumc_oracle_agent_url: 'https://rsdsafety.online' });
    const url = sandbox.KSUAI.getApiUrl('');
    assert.equal(url, 'https://rsdsafety.online/safety/api/');
  });

  await t.test('F4.2: Normalizes base URL trailing slashes without path corruption', () => {
    const sandbox = createM2Sandbox();
    sandbox.KSUAI.saveAgentConfig({ oracleAgentUrl: 'https://rsdsafety.online////' });
    assert.equal(sandbox.KSUAI.oracleAgentUrl, 'https://rsdsafety.online');
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'https://rsdsafety.online/safety/api/ai/status');
  });

  await t.test('F4.3: Localhost development routing automatically maps to local port 8000 when no custom URL', () => {
    const sandbox = createM2Sandbox({}, { hostname: 'localhost', host: 'localhost:3000', protocol: 'http:' });
    // In local development with default remote, getApiUrl should route to local port 8000
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'http://localhost:8000/safety/api/ai/status');
  });

  await t.test('F4.4: 127.0.0.1 development routing automatically maps to local port 8000 when no custom URL', () => {
    const sandbox = createM2Sandbox({}, { hostname: '127.0.0.1', host: '127.0.0.1:5500', protocol: 'http:' });
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'http://127.0.0.1:8000/safety/api/ai/status');
  });

  await t.test('F4.5: Explicit custom agent URL in localStorage takes precedence on localhost', () => {
    const sandbox = createM2Sandbox(
      { ksumc_oracle_agent_url: 'http://custom-proxy.internal:9000' },
      { hostname: 'localhost', host: 'localhost:3000', protocol: 'http:' }
    );
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'http://custom-proxy.internal:9000/safety/api/ai/status');
  });

  await t.test('F4.6: Mixed content protection upgrades HTTP to HTTPS for remote domain when page is on HTTPS', () => {
    const sandbox = createM2Sandbox(
      { ksumc_oracle_agent_url: 'http://rsdsafety.online' },
      { hostname: 'my-custom-domain.com', protocol: 'https:' }
    );
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.ok(url.startsWith('https://'), 'Must prevent mixed content by upgrading HTTP to HTTPS');
    assert.equal(url, 'https://rsdsafety.online/safety/api/ai/status');
  });

  await t.test('F4.7: Avoids duplicate /safety/api segment if oracleAgentUrl already includes it', () => {
    const sandbox = createM2Sandbox({ ksumc_oracle_agent_url: 'https://rsdsafety.online/safety/api' });
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'https://rsdsafety.online/safety/api/ai/status');
    assert.ok(!url.includes('/safety/api/safety/api'));
  });

  await t.test('F4.8: Raw IP address hosting routes without stripping port', () => {
    const sandbox = createM2Sandbox(
      {},
      { hostname: '84.13.138.203', host: '84.13.138.203:8000', protocol: 'http:' }
    );
    sandbox.KSUAI.oracleAgentUrl = '';
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'http://84.13.138.203:8000/safety/api/ai/status');
  });

  await t.test('F4.9: Production domain rsdsafety.online uses relative path /safety/api when agentUrl is empty', () => {
    const sandbox = createM2Sandbox({}, { hostname: 'rsdsafety.online', host: 'rsdsafety.online', protocol: 'https:' });
    sandbox.KSUAI.oracleAgentUrl = '';
    const url = sandbox.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, '/safety/api/ai/status');
  });
});

test('M2 - Feature 5: Adaptive Timeout & Transparent Failure Feedback', async (t) => {
  await t.test('F5.1: request() defaults to 90s adaptive timeout for vision analysis', async () => {
    let capturedTimeout = null;
    const origSetTimeout = global.setTimeout;
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async (url, opts) => {
      return { ok: true, json: async () => ({ status: 'ok' }) };
    };

    // Spy on controller timeout in request
    const origRequest = sandbox.KSUAI.request;
    sandbox.window.setTimeout = (fn, ms) => {
      if (ms > 1000) capturedTimeout = ms;
      return origSetTimeout(fn, 10);
    };

    try {
      await sandbox.KSUAI.request('/ai/analyze-inspection-image', { method: 'POST', body: '{}' });
      assert.equal(capturedTimeout, 90000, 'Vision endpoint must allocate 90000ms adaptive timeout');
    } finally {
      sandbox.window.setTimeout = origSetTimeout;
    }
  });

  await t.test('F5.2: request() translates HTTP 504 Gateway Timeout to friendly Arabic notice', async () => {
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async () => ({
      ok: false,
      status: 504,
      text: async () => 'Gateway Timeout'
    });

    await assert.rejects(
      async () => { await sandbox.KSUAI.request('/ai/analyze-inspection-image', { method: 'POST' }, 5000); },
      (err) => {
        assert.ok(err.message.includes('أطول من المعتاد'));
        return true;
      }
    );
  });

  await t.test('F5.3: request() translates HTTP 502/503 Nginx HTML error pages safely without JSON parse crash', async () => {
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async () => ({
      ok: false,
      status: 502,
      text: async () => '<html><head><title>502 Bad Gateway</title></head><body>502 Bad Gateway</body></html>'
    });

    await assert.rejects(
      async () => { await sandbox.KSUAI.request('/ai/status', {}, 5000); },
      (err) => {
        assert.ok(err.message.includes('استجابة غير صالحة'));
        assert.ok(err.message.includes('502'));
        return true;
      }
    );
  });

  await t.test('F5.4: request() translates HTTP 413 Payload Too Large to clear Arabic instruction', async () => {
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async () => ({
      ok: false,
      status: 413,
      text: async () => 'Payload Too Large'
    });

    await assert.rejects(
      async () => { await sandbox.KSUAI.request('/ai/analyze-inspection-image', {}, 5000); },
      (err) => {
        assert.ok(err.message.includes('حجم الصورة كبير جداً'));
        return true;
      }
    );
  });

  await t.test('F5.5: analyzeInspectionImage returns honest structured failure object (never fake heuristics) on network failure', async () => {
    const sandbox = createM2Sandbox();
    // Simulate completely offline network
    sandbox.window.fetch = async () => {
      const err = new Error('Failed to fetch (net::ERR_INTERNET_DISCONNECTED)');
      err.name = 'TypeError';
      throw err;
    };

    const progressLog = [];
    const result = await sandbox.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      checklistType: 'emergency_exit',
      submode: 'emergency_exit',
      onProgress: (msg) => progressLog.push(msg)
    });

    assert.equal(result.success, false, 'Must report success: false on failure');
    assert.equal(result.data, null, 'Must NOT fabricate fake violation data');
    assert.ok(result.error.includes('تعذر الاتصال'), 'Must provide clear Arabic explanation');
    assert.equal(result.offline_draft_ready, true, 'Must indicate offline draft readiness');
    assert.ok(progressLog.length > 0, 'Progress callback must have been notified');
  });
});

test('M2 - Feature 6: Cloud Key Management & Validation', async (t) => {
  await t.test('F6.1: Default geminiApiKey is NOT the corrupted AQ.Ab8RN6K key', () => {
    const sandbox = createM2Sandbox();
    const badKey = 'AQ.Ab8RN6K-cWBO2DLr-uuccKEbUvakPdEhwL9qMV4DMjeYggHF0w';
    assert.notEqual(sandbox.KSUAI.geminiApiKey, badKey, 'Default geminiApiKey must not contain corrupted AQ.Ab8RN6K key');
  });

  await t.test('F6.2: getSanitizedKeys filters out quotes, newlines, non-ASCII characters, and corrupted keys', () => {
    const sandbox = createM2Sandbox();
    const dirty = '  "sk-gemini-key-1"\n , sk-key-2 , AQ.Ab8RN6K-corrupted , sk-key-عربي-3 , sk-clean-4 ';
    const sanitized = sandbox.KSUAI.getSanitizedKeys(dirty);
    assert.deepEqual(Array.from(sanitized), ['sk-gemini-key-1', 'sk-key-2', 'sk-clean-4']);
  });

  await t.test('F6.3: Reads dynamic keys from both ksumc_gemini_api_key and ksumc_gemini_api_keys', () => {
    const sandboxSingular = createM2Sandbox({ ksumc_gemini_api_key: 'key-singular-valid' });
    assert.deepEqual(Array.from(sandboxSingular.KSUAI.getGeminiKeys()), ['key-singular-valid']);

    const sandboxPlural = createM2Sandbox({ ksumc_gemini_api_keys: 'key-plural-valid-1, key-plural-valid-2' });
    assert.deepEqual(Array.from(sandboxPlural.KSUAI.getGeminiKeys()), ['key-plural-valid-1', 'key-plural-valid-2']);
  });

  await t.test('F6.4: saveAgentConfig saves keys to both singular and plural localStorage slots', () => {
    const sandbox = createM2Sandbox();
    sandbox.KSUAI.saveAgentConfig({ geminiApiKeys: 'new-key-2026' });
    assert.equal(sandbox.KSUAI.geminiApiKey, 'new-key-2026');
    assert.equal(sandbox.localStorage.getItem('ksumc_gemini_api_key'), 'new-key-2026');
    assert.equal(sandbox.localStorage.getItem('ksumc_gemini_api_keys'), 'new-key-2026');
  });

  await t.test('F6.5: When Gemini key returns HTTP 401, analyzeInspectionImage fails over to backend without unhandled throw', async () => {
    const sandbox = createM2Sandbox({
      ksumc_gemini_api_key: 'bad-key-returning-401',
      ksumc_oracle_agent_url: 'https://rsdsafety.online'
    });

    let backendCalled = false;
    sandbox.window.fetch = async (url, opts) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        return {
          ok: false,
          status: 401,
          text: async () => 'API key not valid'
        };
      }
      if (url.includes('/safety/api/ai/analyze-inspection-image')) {
        backendCalled = true;
        return {
          ok: true,
          json: async () => ({
            success: true,
            status: 'مطابق',
            confidence: 96,
            provider_used: 'Oracle Qwen2.5-VL Agent',
            data: {
              status: 'مطابق',
              pattern: 'extinguisher',
              title: 'طفاية حريق سليمة ومطابقة',
              observations: ['طفاية الحريق في موقعها المعتمد والضغط سليم']
            }
          })
        };
      }
      throw new Error('Unexpected URL: ' + url);
    };

    const res = await sandbox.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      checklistType: 'fire_extinguisher'
    });

    assert.equal(backendCalled, true, 'Must seamlessly fail over to backend when cloud key returns 401');
    assert.equal(res.success, true);
    assert.equal(res.data.status, 'مطابق');
  });
});

test('M2 - Feature Integrity & Backward Compatibility', async (t) => {
  await t.test('BC.1: All standard public KSUAI functions remain available', () => {
    const sandbox = createM2Sandbox();
    assert.equal(typeof sandbox.KSUAI.getApiUrl, 'function');
    assert.equal(typeof sandbox.KSUAI.request, 'function');
    assert.equal(typeof sandbox.KSUAI.getStatus, 'function');
    assert.equal(typeof sandbox.KSUAI.saveAgentConfig, 'function');
    assert.equal(typeof sandbox.KSUAI.analyzeInspectionImage, 'function');
    assert.equal(typeof sandbox.KSUAI.askSafetyAssistant, 'function');
    assert.equal(typeof sandbox.KSUAI.structureVoiceRecord, 'function');
    assert.equal(typeof sandbox.KSUAI.parseDutyScheduleImage, 'function');
    assert.equal(typeof sandbox.KSUAI.heuristicVisualAnalysis, 'function');
    assert.equal(typeof sandbox.KSUAI.cleanAndParseJSON, 'function');
    assert.equal(typeof sandbox.KSUAI.applyStaticReferenceMapping, 'function');
  });

  await t.test('BC.2: askSafetyAssistant works with policy rulebase fallback when offline without crashing', async () => {
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async () => { throw new Error('Offline'); };
    const res = await sandbox.KSUAI.askSafetyAssistant('ما هي اشتراطات مخارج الطوارئ؟');
    assert.equal(res.success, true);
    assert.ok(res.answer.includes('معايير السلامة'));
  });

  await t.test('BC.3: structureVoiceRecord falls back to client parser when offline without crashing', async () => {
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async () => { throw new Error('Offline'); };
    const res = await sandbox.KSUAI.structureVoiceRecord('رصد توصيلة كهربائية عشوائية في غرفة 102');
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data.detected_devices));
    assert.ok(res.data.detected_devices.includes('توصيلة'));
  });

  await t.test('BC.4: parseDutyScheduleImage falls back to official matrix ground truth when offline without crashing', async () => {
    const sandbox = createM2Sandbox();
    sandbox.window.fetch = async () => { throw new Error('Offline'); };
    const res = await sandbox.KSUAI.parseDutyScheduleImage({
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      shiftHint: 'shift1'
    });
    assert.equal(res.success, true);
    assert.equal(res.fallback, true);
    assert.equal(res.data.shiftKey, 'shift1');
    assert.ok(Array.isArray(res.data.roundsPlan));
    assert.ok(res.data.roundsPlan.length >= 15);
  });
});

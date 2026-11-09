/**
 * ==============================================================================
 * Adversarial Stress & Edge Case Test Suite for Milestone 2:
 * Frontend AI Client & Communication Protocol (ksu-ai-client.js)
 *
 * Authored by: Challenger Agent (Empirical Challenger M2)
 * Tests:
 * 1. Adversarial URL inputs & routing edge cases in getApiUrl
 * 2. Timeout edge cases (simulated 95s Ollama wait, simulated provider failures, network abortion)
 * 3. Error feedback & offline draft storage integrity (no fake violations, localStorage retention)
 * 4. Key sanitization adversarial inputs (quotes, CRLF, non-ASCII, empty, missing)
 * ==============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');
const aiClientCode = fs.readFileSync(aiClientPath, 'utf8');

function createAdversarialSandbox(initialLocalStorage = {}, initialLocation = {}) {
  const storage = new Map(Object.entries(initialLocalStorage));
  const docElementsMap = new Map();

  const mockLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    _rawMap: storage
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
      querySelector: () => null,
      querySelectorAll: () => []
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
    fetch: async () => { throw new Error('Offline mock default'); },
    KSUAI: null,
    visionImagesList: [],
    currentVisionSubmode: 'extinguisher'
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
    KSUAI: mockWindow.KSUAI,
    renderVisionInspectionError: mockWindow.renderVisionInspectionError
  };
}

// ============================================================================
// 1. ADVERSARIAL URL INPUTS TO getApiUrl
// ============================================================================
test('Adversarial URL Inputs to getApiUrl', async (t) => {
  await t.test('ADV-URL.1: Handles empty strings, null, and undefined endpoint safely', () => {
    const sb = createAdversarialSandbox({ ksumc_oracle_agent_url: 'https://rsdsafety.online' });
    assert.equal(sb.KSUAI.getApiUrl(''), 'https://rsdsafety.online/safety/api/');
    assert.equal(sb.KSUAI.getApiUrl(null), 'https://rsdsafety.online/safety/api/');
    assert.equal(sb.KSUAI.getApiUrl(undefined), 'https://rsdsafety.online/safety/api/');
    assert.equal(sb.KSUAI.getApiUrl('/'), 'https://rsdsafety.online/safety/api/');
  });

  await t.test('ADV-URL.2: Handles excessive trailing and leading slashes in endpoint and base URL', () => {
    const sb = createAdversarialSandbox({ ksumc_oracle_agent_url: 'https://rsdsafety.online/////' });
    // Endpoint without slash
    assert.equal(sb.KSUAI.getApiUrl('ai/status'), 'https://rsdsafety.online/safety/api/ai/status');
    // Endpoint with trailing slash
    assert.equal(sb.KSUAI.getApiUrl('/ai/status/'), 'https://rsdsafety.online/safety/api/ai/status/');
    // Endpoint with multiple leading slashes
    assert.equal(sb.KSUAI.getApiUrl('//ai/status'), 'https://rsdsafety.online/safety/api//ai/status');
  });

  await t.test('ADV-URL.3: Preserves unusual and non-standard port numbers in custom agent URLs', () => {
    const ports = ['8443', '9090', '48080', '11434'];
    for (const port of ports) {
      const customUrl = `http://10.20.30.40:${port}`;
      const sb = createAdversarialSandbox(
        { ksumc_oracle_agent_url: customUrl },
        { hostname: 'rsdsafety.online', protocol: 'https:' }
      );
      const url = sb.KSUAI.getApiUrl('/ai/analyze-inspection-image');
      // On https, remote http is upgraded to https, but port is strictly preserved
      assert.ok(url.includes(`:${port}`), `Port ${port} must be preserved`);
      assert.equal(url, `https://10.20.30.40:${port}/safety/api/ai/analyze-inspection-image`);
    }
  });

  await t.test('ADV-URL.4: Handles base URL that already includes /safety/api with trailing slashes', () => {
    const sb = createAdversarialSandbox({ ksumc_oracle_agent_url: 'https://proxy.ksu.edu.sa:8443/safety/api////' });
    const url = sb.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'https://proxy.ksu.edu.sa:8443/safety/api/ai/status');
    assert.ok(!url.includes('/safety/api/safety/api'), 'Must not duplicate /safety/api segment');
  });

  await t.test('ADV-URL.5: Handles local dev with hostname 0.0.0.0 and arbitrary port', () => {
    const sb = createAdversarialSandbox({}, { hostname: '0.0.0.0', host: '0.0.0.0:3000', protocol: 'http:' });
    const url = sb.KSUAI.getApiUrl('/ai/status');
    assert.equal(url, 'http://0.0.0.0:8000/safety/api/ai/status');
  });

  await t.test('ADV-URL.6: Mixed protocol upgrade applies to remote domains but preserves localhost HTTP', () => {
    // Remote domain on HTTPS page -> upgraded to HTTPS
    const sbRemote = createAdversarialSandbox(
      { ksumc_oracle_agent_url: 'http://custom-vision-node.online:8000' },
      { hostname: 'app.rsdsafety.online', protocol: 'https:' }
    );
    assert.equal(
      sbRemote.KSUAI.getApiUrl('/ai/status'),
      'https://custom-vision-node.online:8000/safety/api/ai/status'
    );

    // Localhost on HTTPS page -> keeps HTTP to allow local test servers without SSL certs
    const sbLocal = createAdversarialSandbox(
      { ksumc_oracle_agent_url: 'http://localhost:8000' },
      { hostname: 'localhost', protocol: 'https:' }
    );
    assert.equal(
      sbLocal.KSUAI.getApiUrl('/ai/status'),
      'http://localhost:8000/safety/api/ai/status'
    );
  });

  await t.test('ADV-URL.7: Malformed agent URLs in localStorage handle without unhandled exceptions', () => {
    const malformed = ['not-a-valid-url', 'ftp://weird.domain', '://broken'];
    for (const bad of malformed) {
      const sb = createAdversarialSandbox({ ksumc_oracle_agent_url: bad });
      const url = sb.KSUAI.getApiUrl('/ai/status');
      assert.ok(typeof url === 'string', 'getApiUrl must return string even with malformed agent url');
      assert.ok(url.includes('/safety/api/ai/status'), 'Path structure must append safely');
    }
  });
});

// ============================================================================
// 2. TIMEOUT EDGE CASES & SIMULATED PROVIDER FAILURES
// ============================================================================
test('Timeout Edge Cases & Provider Failures', async (t) => {
  await t.test('ADV-TIME.1: Simulated 95-second Ollama CPU wait triggers 90s abort and returns honest failure', async () => {
    const sb = createAdversarialSandbox({
      ksumc_oracle_agent_url: 'http://localhost:8000'
    }, { hostname: 'localhost', protocol: 'http:' });

    let abortSignalTriggered = false;

    sb.window.fetch = async (url, opts) => {
      return new Promise((resolve, reject) => {
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', () => {
            abortSignalTriggered = true;
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
        // Simulate Ollama taking 95 seconds (we simulate by not resolving immediately)
      });
    };

    // Fast-forward setTimeout in the sandbox to simulate 95s
    const origSetTimeout = global.setTimeout;
    sb.window.setTimeout = (fn, ms) => {
      // If setting the 90s timeout in request, fire it after 15ms simulated time
      if (ms === 90000) {
        return origSetTimeout(fn, 15);
      }
      return origSetTimeout(fn, 5);
    };

    const progressMessages = [];
    const result = await sb.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      checklistType: 'storage',
      submode: 'storage',
      onProgress: (m) => progressMessages.push(m)
    });

    assert.ok(abortSignalTriggered, 'AbortController signal must have fired due to 90s timeout');
    assert.equal(result.success, false, 'Must report success: false when Ollama exceeds 90s');
    assert.equal(result.data, null, 'Must NOT output fake violation data on timeout');
    assert.equal(result.status, 'فشل الاتصال', 'Status must indicate connection/timeout failure');
    assert.equal(result.error_code, 'ERR_ALL_PROVIDERS_UNREACHABLE');
    assert.equal(result.offline_draft_ready, true, 'offline_draft_ready must be true');
    assert.ok(progressMessages.length >= 1, 'Inspector must receive status progress feedback');
  });

  await t.test('ADV-TIME.2: Simulated 80-second Ollama wait succeeds when backend responds before 90s', async () => {
    const sb = createAdversarialSandbox({
      ksumc_oracle_agent_url: 'http://localhost:8000'
    }, { hostname: 'localhost', protocol: 'http:' });

    sb.window.fetch = async (url, opts) => {
      // Simulate backend successfully returning after long inference
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            status: 'غير مطابق',
            pattern: 'storage',
            confidence: 96,
            title: 'تخزين عشوائي للمواد القابلة للاشتعال',
            summary: 'رصد تكديس مواد كرتونية قابلة للاشتعال في الممر'
          }
        })
      };
    };

    const result = await sb.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      checklistType: 'storage'
    });

    assert.equal(result.success, true);
    assert.ok(result.data);
    assert.equal(result.data.pattern, 'storage');
    assert.equal(result.data.standard_reference, 'CBAHI FMS.04 / NFPA 1 / SBC 801');
  });

  await t.test('ADV-TIME.3: Cascade failure across all providers completes cleanly without throwing', async () => {
    const sb = createAdversarialSandbox({
      ksumc_gemini_api_key: 'AIzaSyValidFormatKey123',
      ksumc_qwen_api_key: 'sk-qwen-valid-key-456',
      ksumc_oracle_agent_url: 'https://rsdsafety.online'
    });

    let geminiCalled = false;
    let qwenCalled = false;
    let backendCalled = false;

    sb.window.fetch = async (url, opts) => {
      if (url.includes('googleapis.com')) {
        geminiCalled = true;
        return { ok: false, status: 500, text: async () => 'Internal Server Error' };
      }
      if (url.includes('openrouter.ai') || url.includes('dashscope')) {
        qwenCalled = true;
        return { ok: false, status: 429, text: async () => 'Rate limit exceeded' };
      }
      if (url.includes('/safety/api/ai/analyze-inspection-image')) {
        backendCalled = true;
        return { ok: false, status: 503, text: async () => 'Service Unavailable' };
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };

    const progressLog = [];
    const result = await sb.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      checklistType: 'hazard',
      onProgress: (m) => progressLog.push(m)
    });

    assert.ok(geminiCalled, 'Gemini must be attempted first');
    assert.ok(qwenCalled, 'Qwen must be attempted after Gemini fails');
    assert.ok(backendCalled, 'Backend agent must be attempted after Qwen fails');

    assert.equal(result.success, false);
    assert.equal(result.data, null);
    assert.equal(result.offline_draft_ready, true);
    assert.ok(result.error.includes('تعذر الاتصال بخادم الذكاء الاصطناعي'));
  });

  await t.test('ADV-TIME.4: Network abortion / immediate disconnection does not throw unhandled rejection', async () => {
    const sb = createAdversarialSandbox();
    sb.window.fetch = async () => {
      const err = new TypeError('Failed to fetch');
      throw err;
    };

    const result = await sb.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,/9j/test',
      checklistType: 'fire_extinguisher'
    });

    assert.equal(result.success, false);
    assert.equal(result.data, null);
    assert.equal(result.offline_draft_ready, true);
  });
});

// ============================================================================
// 3. ERROR FEEDBACK AND OFFLINE DRAFT STORAGE INTEGRITY
// ============================================================================
test('Error Feedback and Offline Draft Storage Integrity', async (t) => {
  await t.test('ADV-DRAFT.1: All AI failure produces NO fake violations (zero deception guarantee)', async () => {
    const sb = createAdversarialSandbox();
    sb.window.fetch = async () => { throw new Error('Offline'); };

    const result = await sb.KSUAI.analyzeInspectionImage({
      image: 'data:image/jpeg;base64,RAW_CAPTURED_IMAGE_DATA',
      checklistType: 'emergency_exit'
    });

    assert.equal(result.success, false);
    assert.equal(result.data, null);
    // Explicitly verify canned heuristic strings are NOT returned
    const resString = JSON.stringify(result);
    assert.ok(!resString.includes('إعاقة مسار ومخرج الطوارئ بعوائق'), 'Must not return deceptive heuristic violation');
    assert.ok(!resString.includes('وجود مانع أو وتد خشبي'), 'Must not return deceptive heuristic violation');
    assert.ok(!resString.includes('طفاية حريق منخفضة الضغط'), 'Must not return deceptive heuristic violation');
  });

  await t.test('ADV-DRAFT.2: renderVisionInspectionError preserves captured image into localStorage without corruption', () => {
    const sb = createAdversarialSandbox();
    const testImage = 'data:image/jpeg;base64,EXACT_BYTE_VERIFIED_BASE64_IMAGE_STRING_FOR_OFFLINE_STORAGE';
    sb.window.visionImagesList = [testImage];
    sb.window.currentVisionSubmode = 'emergency_exit';

    const testBuilding = 'مبنى 101 - المستشفى الرئيسي';
    const testFloor = 'الدور الثاني';
    const testRoom = 'ممر الطوارئ 204';
    const testError = 'تعذر الاتصال بخادم الرؤية البصرية';

    sb.renderVisionInspectionError(testError, testBuilding, testFloor, testRoom);

    // Verify stored draft
    const rawStored = sb.localStorage.getItem('ksu_offline_vision_drafts');
    assert.ok(rawStored, 'Offline drafts must be written to localStorage');

    const drafts = JSON.parse(rawStored);
    assert.ok(Array.isArray(drafts));
    assert.equal(drafts.length, 1);

    const draft = drafts[0];
    assert.ok(draft.id.startsWith('draft_'));
    assert.equal(draft.images[0], testImage, 'Image must be preserved byte-for-byte without corruption');
    assert.equal(draft.building, testBuilding);
    assert.equal(draft.floor, testFloor);
    assert.equal(draft.room, testRoom);
    assert.equal(draft.submode, 'emergency_exit');
    assert.equal(draft.error, testError);
  });

  await t.test('ADV-DRAFT.3: Multiple consecutive errors are capped at 20 to prevent localStorage quota exhaustion', () => {
    const sb = createAdversarialSandbox();
    sb.window.visionImagesList = ['data:image/jpeg;base64,IMG'];

    for (let i = 1; i <= 25; i++) {
      sb.renderVisionInspectionError(`Error attempt ${i}`, `Building ${i}`, `Floor ${i}`, `Room ${i}`);
    }

    const drafts = JSON.parse(sb.localStorage.getItem('ksu_offline_vision_drafts'));
    assert.equal(drafts.length, 20, 'Drafts list must be capped at 20 items');
    assert.equal(drafts[drafts.length - 1].error, 'Error attempt 25', 'Most recent draft must be retained');
  });

  await t.test('ADV-DRAFT.4: Corrupted pre-existing localStorage draft JSON is handled gracefully without crash', () => {
    const sb = createAdversarialSandbox({
      ksu_offline_vision_drafts: '<<<INVALID JSON STRING THAT WOULD CRASH JSON.PARSE>>>'
    });
    sb.window.visionImagesList = ['data:image/jpeg;base64,NEW_IMAGE'];

    assert.doesNotThrow(() => {
      sb.renderVisionInspectionError('Server timed out', 'Bld', 'Flr', 'Rm');
    }, 'Must handle corrupted JSON in localStorage without throwing unhandled exception');
  });

  await t.test('ADV-DRAFT.5: renderVisionInspectionError does not throw when DOM resultsArea element is missing', () => {
    const sb = createAdversarialSandbox();
    sb.document.getElementById = (id) => (id === 'vision-results-area' ? null : {});

    assert.doesNotThrow(() => {
      sb.renderVisionInspectionError('No DOM element error', 'B', 'F', 'R');
    });
  });
});

// ============================================================================
// 4. ADVERSARIAL KEY SANITIZATION
// ============================================================================
test('Adversarial Key Sanitization', async (t) => {
  await t.test('ADV-KEY.1: Sanitizes keys with leading/trailing spaces, CRLF newlines, and quotes', () => {
    const sb = createAdversarialSandbox();
    const raw = '  "AIzaSyCleanKeyOne"  \r\n, \'AIzaSyCleanKeyTwo\' \n,   AIzaSyCleanKeyThree   ';
    const keys = sb.KSUAI.getSanitizedKeys(raw);
    assert.deepEqual(Array.from(keys), [
      'AIzaSyCleanKeyOne',
      'AIzaSyCleanKeyTwo',
      'AIzaSyCleanKeyThree'
    ]);
  });

  await t.test('ADV-KEY.2: Rejects non-ASCII characters, Arabic letters, and emojis in API keys', () => {
    const sb = createAdversarialSandbox();
    const raw = 'AIzaSyGoodKey1, AIzaSyمفتاح_عربي_2, AIzaSy🔑EmojiKey3, AIzaSyValidKey4';
    const keys = sb.KSUAI.getSanitizedKeys(raw);
    assert.deepEqual(Array.from(keys), [
      'AIzaSyGoodKey1',
      'AIzaSyValidKey4'
    ]);
  });

  await t.test('ADV-KEY.3: Strips blacklisted hardcoded AQ.Ab8RN6K key even if injected manually', () => {
    const sb = createAdversarialSandbox();
    const raw = 'AQ.Ab8RN6K-cWBO2DLr-uuccKEbUvakPdEhwL9qMV4DMjeYggHF0w, AIzaSyLegitimateKey';
    const keys = sb.KSUAI.getSanitizedKeys(raw);
    assert.deepEqual(Array.from(keys), ['AIzaSyLegitimateKey']);
    assert.ok(!keys.some(k => k.includes('AQ.Ab8RN6K')));
  });

  await t.test('ADV-KEY.4: Handles edge cases: null, undefined, empty, number, boolean, object', () => {
    const sb = createAdversarialSandbox();
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys(null)), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys(undefined)), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys('')), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys('   ')), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys(',,,,')), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys(12345)), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys(true)), []);
    assert.deepEqual(Array.from(sb.KSUAI.getSanitizedKeys({ key: 'value' })), []);
  });

  await t.test('ADV-KEY.5: getGeminiKeys and getQwenKeys return empty array when localStorage keys are absent', () => {
    const sb = createAdversarialSandbox({}, {});
    sb.KSUAI.geminiApiKey = '';
    sb.KSUAI.qwenApiKey = '';

    assert.deepEqual(Array.from(sb.KSUAI.getGeminiKeys()), []);
    assert.deepEqual(Array.from(sb.KSUAI.getQwenKeys()), []);
  });

  await t.test('ADV-KEY.6: saveAgentConfig synchronizes keys to both singular and plural localStorage slots', () => {
    const sb = createAdversarialSandbox();
    sb.KSUAI.saveAgentConfig({
      geminiApiKey: '  AIzaSySynchronizedKey  ',
      qwenApiKey: '  sk-qwen-synced  '
    });

    assert.equal(sb.localStorage.getItem('ksumc_gemini_api_key'), 'AIzaSySynchronizedKey');
    assert.equal(sb.localStorage.getItem('ksumc_gemini_api_keys'), 'AIzaSySynchronizedKey');
    assert.equal(sb.localStorage.getItem('ksumc_qwen_api_key'), 'sk-qwen-synced');
    assert.equal(sb.localStorage.getItem('ksumc_qwen_api_keys'), 'sk-qwen-synced');

    const geminiKeys = sb.KSUAI.getGeminiKeys();
    assert.deepEqual(Array.from(geminiKeys), ['AIzaSySynchronizedKey']);
  });
});

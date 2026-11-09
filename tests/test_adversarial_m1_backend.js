/**
 * Adversarial Stress Test Suite for Milestone 1: Backend Vision Engine & API Resilience
 *
 * Covers:
 * - EXIF orientation edge cases (1, 3, 6, 8, no EXIF, non-JPEG PNG/WebP, corrupted headers, bad base64)
 * - Text endpoint fallback resilience (Ollama offline/404/500/malformed, Arabic prompt parsing, edge cases)
 * - Status telemetry and schema parity between Python and Node.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const agentServer = require('../oracle-vision-agent/agent_server.js');

// ==============================================================================
// 1. EXIF Orientation & Image Processing Stress Tests
// ==============================================================================

test('1.1 EXIF Orientations 1, 3, 6, 8 transposed correctly in Node.js', () => {
  const testCases = [
    { orient: 1, expectedOrientation: 1, expectedDims: '120x240' },
    { orient: 3, expectedOrientation: 3, expectedDims: '120x240' },
    { orient: 6, expectedOrientation: 6, expectedDims: '240x120' },
    { orient: 8, expectedOrientation: 8, expectedDims: '240x120' },
  ];

  for (const tc of testCases) {
    const gen = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (120, 240), color="blue")
exif = im.getexif()
exif[0x0112] = ${tc.orient}
buf = io.BytesIO()
im.save(buf, format="JPEG", exif=exif)
sys.stdout.buffer.write(buf.getvalue())
`]);
    assert.equal(gen.status, 0, `Failed generating JPEG with orientation ${tc.orient}`);
    const rawBuf = gen.stdout;

    // Check EXIF tag extraction
    const detected = agentServer.getExifOrientation(rawBuf);
    assert.equal(detected, tc.expectedOrientation, `Expected orientation ${tc.expectedOrientation} but got ${detected}`);

    // Check Transpose
    const b64Input = 'data:image/jpeg;base64,' + rawBuf.toString('base64');
    const opt = agentServer.optimizeBase64Image(b64Input);
    assert.equal(opt.mime, 'image/jpeg');

    const verify = spawnSync('python3', ['-c', `
import sys, io
from PIL import Image
raw = sys.stdin.buffer.read()
with Image.open(io.BytesIO(raw)) as im:
    print(f"{im.width}x{im.height}")
`], { input: Buffer.from(opt.b64, 'base64') });
    assert.equal(verify.status, 0);
    assert.equal(verify.stdout.toString().trim(), tc.expectedDims,
      `Orientation ${tc.orient} expected dimensions ${tc.expectedDims} but got ${verify.stdout.toString().trim()}`);
  }
});

test('1.2 EXIF Orientations 1, 3, 6, 8 transposed correctly in Python agent_server.py', () => {
  const pyScript = `
import sys, io, base64
sys.path.insert(0, 'oracle-vision-agent')
import agent_server
from PIL import Image

test_cases = [
    (1, (120, 240)),
    (3, (120, 240)),
    (6, (240, 120)),
    (8, (240, 120)),
]

for orient, expected_size in test_cases:
    im = Image.new("RGB", (120, 240), color="red")
    exif = im.getexif()
    exif[0x0112] = orient
    buf = io.BytesIO()
    im.save(buf, format="JPEG", exif=exif)
    raw_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    mime, opt_b64 = agent_server.optimize_base64_image(raw_b64)
    assert mime == "image/jpeg"
    with Image.open(io.BytesIO(base64.b64decode(opt_b64))) as out_im:
        assert out_im.size == expected_size, f"Orient {orient} size mismatch: got {out_im.size}, expected {expected_size}"
print("PYTHON_ALL_ORIENTATIONS_OK")
`;
  const proc = spawnSync('python3', ['-c', pyScript], { cwd: path.join(__dirname, '..') });
  assert.equal(proc.status, 0, `Python test failed: ${proc.stderr.toString()}`);
  assert.match(proc.stdout.toString(), /PYTHON_ALL_ORIENTATIONS_OK/);
});

test('1.3 Images with NO EXIF handle cleanly without distortion or errors', () => {
  // 1. Plain JPEG without EXIF
  const genJpeg = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (100, 150), color="green")
buf = io.BytesIO()
im.save(buf, format="JPEG")
sys.stdout.buffer.write(buf.getvalue())
`]);
  assert.equal(genJpeg.status, 0);
  const plainJpegBuf = genJpeg.stdout;
  assert.equal(agentServer.getExifOrientation(plainJpegBuf), 1, 'Plain JPEG should default to orientation 1');
  const optJpeg = agentServer.optimizeBase64Image('data:image/jpeg;base64,' + plainJpegBuf.toString('base64'));
  assert.equal(optJpeg.mime, 'image/jpeg');

  // 2. Pure PNG RGB
  const genPng = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (80, 120), color="orange")
buf = io.BytesIO()
im.save(buf, format="PNG")
sys.stdout.buffer.write(buf.getvalue())
`]);
  const plainPngBuf = genPng.stdout;
  assert.equal(agentServer.getExifOrientation(plainPngBuf), 1, 'PNG should return orientation 1');
  const optPng = agentServer.optimizeBase64Image('data:image/png;base64,' + plainPngBuf.toString('base64'));
  assert.equal(optPng.mime, 'image/jpeg', 'PNG should be converted to clean JPEG for model ingest');

  // 3. Pure WebP RGB
  const genWebP = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (90, 110), color="teal")
buf = io.BytesIO()
im.save(buf, format="WEBP")
sys.stdout.buffer.write(buf.getvalue())
`]);
  const plainWebPBuf = genWebP.stdout;
  assert.equal(agentServer.getExifOrientation(plainWebPBuf), 1, 'WebP should return orientation 1');
  const optWebP = agentServer.optimizeBase64Image('data:image/webp;base64,' + plainWebPBuf.toString('base64'));
  assert.equal(optWebP.mime, 'image/jpeg', 'WebP should be normalized to JPEG');
});

test('1.4 Non-JPEG images with Alpha, Palette, and WebP EXIF handled safely', () => {
  // 1. PNG RGBA (Alpha channel)
  const genRgba = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGBA", (70, 70), color=(255, 0, 0, 128))
buf = io.BytesIO()
im.save(buf, format="PNG")
sys.stdout.buffer.write(buf.getvalue())
`]);
  const optRgba = agentServer.optimizeBase64Image('data:image/png;base64,' + genRgba.stdout.toString('base64'));
  assert.equal(optRgba.mime, 'image/jpeg');
  assert.ok(optRgba.b64.length > 0);

  // 2. WebP with EXIF orientation 6
  const genWebpExif = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (100, 200), color="purple")
exif = im.getexif()
exif[0x0112] = 6
buf = io.BytesIO()
im.save(buf, format="WEBP", exif=exif)
sys.stdout.buffer.write(buf.getvalue())
`]);
  const optWebpExif = agentServer.optimizeBase64Image('data:image/webp;base64,' + genWebpExif.stdout.toString('base64'));
  assert.equal(optWebpExif.mime, 'image/jpeg');

  const checkWebp = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
raw = sys.stdin.buffer.read()
with Image.open(io.BytesIO(raw)) as im:
    print(f"{im.width}x{im.height}")
`], { input: Buffer.from(optWebpExif.b64, 'base64') });
  assert.equal(checkWebp.stdout.toString().trim(), '200x100', 'WebP orientation 6 must transpose to 200x100');
});

test('1.5 Corrupted EXIF headers do not crash parser and safely fallback to orientation 1', () => {
  const corruptedHeaders = [
    // Truncated APP1 segment
    Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x05, 0x00]),
    // Incomplete Exif header
    Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10]),
      Buffer.from('Ex\0\0', 'ascii')
    ]),
    // Corrupted TIFF offset pointing past buffer
    Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x14]),
      Buffer.from('Exif\0\0', 'ascii'),
      Buffer.from('II\x2A\x00\xFF\xFF\xFF\x7F', 'binary')
    ]),
    // Absurdly high numEntries
    Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x20]),
      Buffer.from('Exif\0\0', 'ascii'),
      Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00]),
      Buffer.from([0xFF, 0xFF])
    ]),
    // Non-JPEG bytes
    Buffer.from('NOT_A_VALID_IMAGE_BUFFER_ANYWHERE'),
    Buffer.alloc(0),
    null,
    undefined
  ];

  for (let i = 0; i < corruptedHeaders.length; i++) {
    const res = agentServer.getExifOrientation(corruptedHeaders[i]);
    assert.equal(res, 1, `Corrupted header #${i} must safely fallback to orientation 1`);
  }
});

test('1.6 Malformed and boundary base64 payloads degrade gracefully', () => {
  const badInputs = [
    '',
    null,
    undefined,
    'data:image/jpeg;base64,',
    'data:image/jpeg;base64,!!!INVALID_BASE64_BYTES!!!',
    'plain_text_not_data_uri',
  ];

  for (const input of badInputs) {
    const res = agentServer.optimizeBase64Image(input);
    assert.ok(res, 'Must return an object');
    assert.equal(typeof res.mime, 'string');
    assert.equal(typeof res.b64, 'string');
  }
});

test('1.7 Extreme dimension images resize correctly within max_dim limits', () => {
  // 1. Extreme large image (2400x1600) -> should be scaled down to max_dim (1280)
  const genLarge = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (2400, 1600), color="red")
buf = io.BytesIO()
im.save(buf, format="JPEG", quality=80)
sys.stdout.buffer.write(buf.getvalue())
`]);
  const optLarge = agentServer.optimizeBase64Image('data:image/jpeg;base64,' + genLarge.stdout.toString('base64'), 1280);
  const checkLarge = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
raw = sys.stdin.buffer.read()
with Image.open(io.BytesIO(raw)) as im:
    print(f"{im.width}x{im.height}")
`], { input: Buffer.from(optLarge.b64, 'base64') });
  assert.equal(checkLarge.stdout.toString().trim(), '1280x853');

  // 2. 1x1 pixel image
  const genTiny = spawnSync('python3', ['-c', `
import io, sys
from PIL import Image
im = Image.new("RGB", (1, 1), color="white")
buf = io.BytesIO()
im.save(buf, format="JPEG")
sys.stdout.buffer.write(buf.getvalue())
`]);
  const optTiny = agentServer.optimizeBase64Image('data:image/jpeg;base64,' + genTiny.stdout.toString('base64'));
  assert.equal(optTiny.mime, 'image/jpeg');
  assert.ok(optTiny.b64.length > 0);
});

// ==============================================================================
// 2. Text Endpoint Fallback & Resilience Stress Tests
// ==============================================================================

test('2.1 Ollama offline: /ask-safety-assistant and /structure-voice-record return HTTP 200 with rulebase', async () => {
  const srv = agentServer.createAgentServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const prevPriority = agentServer.CONFIG.priority;
  const prevGithubKeys = agentServer.CONFIG.githubKeys;
  const prevQwenKeys = agentServer.CONFIG.qwenKeys;
  const prevGeminiKeys = agentServer.CONFIG.geminiKeys;
  const prevOllamaEnabled = agentServer.CONFIG.ollamaEnabled;

  // Simulate total AI outage
  agentServer.CONFIG.priority = ['ollama_local'];
  agentServer.CONFIG.githubKeys = [];
  agentServer.CONFIG.qwenKeys = [];
  agentServer.CONFIG.geminiKeys = [];
  agentServer.CONFIG.ollamaEnabled = true;
  agentServer.CONFIG.ollamaBaseUrl = 'http://127.0.0.1:59999'; // Dead port

  try {
    const resAsk = await fetch(`${baseUrl}/safety/api/ai/ask-safety-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'ما هو تصنيف طفايات ثاني أكسيد الكربون حسب NFPA 10؟' })
    });
    assert.equal(resAsk.status, 200, 'Must return 200, never 503');
    const jsonAsk = await resAsk.json();
    assert.equal(jsonAsk.success, true);
    assert.match(jsonAsk.source, /Rulebase/i);
    assert.match(jsonAsk.answer, /NFPA 10|CBAHI|سباهي/);

    const resVoice = await fetch(`${baseUrl}/safety/api/ai/structure-voice-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'ملاحظة تدخين في مبنى كلية الطب الدور الثالث غرفة 310 من قبل الموظف سعد العتيبي',
        form_type: 'smoking'
      })
    });
    assert.equal(resVoice.status, 200, 'Must return 200, never 503');
    const jsonVoice = await resVoice.json();
    assert.equal(jsonVoice.success, true);
    assert.equal(jsonVoice.data.room, '310');
    assert.match(jsonVoice.data.violator_name, /سعد/);
    assert.match(jsonVoice.source, /Rulebase/i);
  } finally {
    agentServer.CONFIG.priority = prevPriority;
    agentServer.CONFIG.githubKeys = prevGithubKeys;
    agentServer.CONFIG.qwenKeys = prevQwenKeys;
    agentServer.CONFIG.geminiKeys = prevGeminiKeys;
    agentServer.CONFIG.ollamaEnabled = prevOllamaEnabled;
    await new Promise(resolve => srv.close(resolve));
  }
});

test('2.2 Ollama 404 & 500 error failover to next candidate model then rulebase', async () => {
  // Test callTextLlm failover chain
  const callLog = [];
  const mockFetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    callLog.push(body.model);
    if (body.model === 'qwen2.5:3b') {
      return { ok: false, status: 404, text: async () => 'model not found' };
    }
    if (body.model === 'qwen2.5vl:3b') {
      return { ok: false, status: 500, text: async () => 'internal engine error' };
    }
    return { ok: false, status: 500 };
  };

  const prevPriority = agentServer.CONFIG.priority;
  const prevOllamaEnabled = agentServer.CONFIG.ollamaEnabled;
  const prevOllamaTextModel = agentServer.CONFIG.ollamaTextModel;
  const prevOllamaVisionModel = agentServer.CONFIG.ollamaVisionModel;

  agentServer.CONFIG.priority = ['ollama_local'];
  agentServer.CONFIG.ollamaEnabled = true;
  agentServer.CONFIG.ollamaTextModel = 'qwen2.5:3b';
  agentServer.CONFIG.ollamaVisionModel = 'qwen2.5vl:3b';

  try {
    let threw = false;
    try {
      await agentServer.callTextLlm('سؤال تجريبي', false, mockFetch);
    } catch (e) {
      threw = true;
      assert.match(e.message, /لم ينجح أي مزود/);
    }
    assert.equal(threw, true, 'callTextLlm should throw when all models fail, triggering endpoint rulebase catch');
    assert.deepEqual(callLog, ['qwen2.5:3b', 'qwen2.5vl:3b'], 'Must try text model first, then vision fallback');
  } finally {
    agentServer.CONFIG.priority = prevPriority;
    agentServer.CONFIG.ollamaEnabled = prevOllamaEnabled;
    agentServer.CONFIG.ollamaTextModel = prevOllamaTextModel;
    agentServer.CONFIG.ollamaVisionModel = prevOllamaVisionModel;
  }
});

test('2.3 Arabic safety assistant rulebase handles domain-specific categories accurately', () => {
  const domains = [
    { query: 'ما هي متطلبات فحص ضغط طفاية الحريق شهرياً؟', match: /CBAHI FMS\.14|SBC 801|NFPA 10/ },
    { query: 'هل يسمح بوضع صناديق أو إغلاق مخرج الطوارئ ومسار الإخلاء؟', match: /CBAHI FMS\.12|NFPA 101/ },
    { query: 'ما هي اشتراطات التوصيلات الكهربائية وقواطع الكهرباء؟', match: /CBAHI FMS|NFPA 70|SBC 401/ },
    { query: 'أين يجب حفظ صحائف بيانات سلامة المواد MSDS الكيميائية؟', match: /CBAHI FMS\.8|NFPA 400/ },
    { query: 'تم رصد تدخين سيجارة إلكترونية في الحرم الطبي', match: /م\/56|مكافحة التدخين|200 ريال/ },
    { query: 'استفسار عام عن تدقيق السلامة الدوري بالمستشفى', match: /المركز السعودي لاعتماد المنشآت الصحية/ },
  ];

  for (const d of domains) {
    const ans = agentServer.getSafetyAssistantRulebase(d.query);
    assert.ok(ans && ans.length > 50, `Answer too short for query: ${d.query}`);
    assert.match(ans, d.match, `Answer did not match expected regulatory framework for: ${d.query}`);
  }
});

test('2.4 Voice structuring rulebase correctly parses complex Arabic transcripts', () => {
  const transcript = 'تم رصد غلاية ماء وسخان كهربائي وتوصيلة في مستشفى الملك خالد الدور الأول ممر 12 غرفة 104 من قبل الموظف أحمد الحربي';
  const structured = agentServer.structureVoiceRulebase(transcript, 'general');

  assert.ok(structured.detected_devices.some(d => d.includes('غلاية')));
  assert.ok(structured.detected_devices.some(d => d.includes('سخان')));
  assert.ok(structured.detected_devices.some(d => d.includes('توصيلة')));
  assert.match(structured.location, /مستشفى الملك/);
  assert.match(structured.location, /الدور الأول/);
  assert.equal(structured.room, '104');
  assert.match(structured.violator_name, /أحمد الحربي/);
  assert.equal(structured.violator_role, 'موظف');
  assert.ok(['متوسط', 'عالي'].includes(structured.risk_level));
});

test('2.5 Adversarial inputs to text endpoints (injection, massive text, empty payloads)', async () => {
  const srv = agentServer.createAgentServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adversarialQuestions = [
      '',
      '   ',
      '<script>alert("xss")</script>',
      "'; DROP TABLE violations; --",
      '${7*7}',
      'A'.repeat(25000), // Massive input
    ];

    for (const q of adversarialQuestions) {
      const res = await fetch(`${baseUrl}/safety/api/ai/ask-safety-assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      assert.equal(res.status, 200, `Must survive adversarial question: ${q.slice(0, 30)}`);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(typeof json.answer === 'string' && json.answer.length > 0);
    }

    // Malformed JSON payload
    const malformedRes = await fetch(`${baseUrl}/safety/api/ai/ask-safety-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"question": "broken json payload'
    });
    assert.equal(malformedRes.status, 400, 'Malformed JSON syntax must return HTTP 400 cleanly');

    // Type confusion payload: non-string question is safely caught as 400 Bad Request
    const typeConfusionRes = await fetch(`${baseUrl}/safety/api/ai/ask-safety-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 12345678 })
    });
    assert.equal(typeConfusionRes.status, 400, 'Numeric question rejected with clean 400 Bad Request without 500 error');
  } finally {
    await new Promise(resolve => srv.close(resolve));
  }
});

// ==============================================================================
// 3. Status Telemetry & Schema Parity Stress Tests
// ==============================================================================

test('3.1 Schema completeness and parity between Python and Node.js status endpoints', async () => {
  // 1. Fetch Node.js status
  const srv = agentServer.createAgentServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const nodeRes = await fetch(`http://127.0.0.1:${port}/safety/api/ai/status`);
  assert.equal(nodeRes.status, 200);
  const nodeStatus = await nodeRes.json();
  await new Promise(resolve => srv.close(resolve));

  // 2. Fetch Python status
  const pyProc = spawnSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'oracle-vision-agent')
import agent_server
from fastapi.testclient import TestClient
client = TestClient(agent_server.app)
resp = client.get('/safety/api/ai/status')
print(json.dumps(resp.json()))
`], { cwd: path.join(__dirname, '..') });
  assert.equal(pyProc.status, 0, `Python status check failed: ${pyProc.stderr.toString()}`);
  const pyStatus = JSON.parse(pyProc.stdout.toString().trim());

  // 3. Top-level keys verification
  const requiredKeys = [
    'status',
    'agent',
    'priority',
    'github_models_configured',
    'github_vision_model',
    'github_text_model',
    'qwen_api_configured',
    'qwen_vision_model',
    'qwen_text_model',
    'ollama_online',
    'ollama_vision_model',
    'ollama_text_model',
    'ollama_installed_models',
    'gemini_keys_count',
    'diagnostics',
    'stats'
  ];

  for (const k of requiredKeys) {
    assert.ok(k in nodeStatus, `Missing key in Node status: ${k}`);
    assert.ok(k in pyStatus, `Missing key in Python status: ${k}`);
    assert.equal(typeof nodeStatus[k], typeof pyStatus[k], `Type mismatch for key: ${k}`);
  }

  // 4. Diagnostics block parity
  const requiredDiagKeys = [
    'exif_transpose_supported',
    'ollama_text_model_installed',
    'ollama_vision_model_installed',
    'text_fallback_active',
    'active_text_model',
    'archive_vault_dir',
    'timestamp'
  ];

  for (const dk of requiredDiagKeys) {
    assert.ok(dk in nodeStatus.diagnostics, `Missing diagnostics key in Node: ${dk}`);
    assert.ok(dk in pyStatus.diagnostics, `Missing diagnostics key in Python: ${dk}`);
    assert.equal(typeof nodeStatus.diagnostics[dk], typeof pyStatus.diagnostics[dk],
      `Diagnostics type mismatch for key: ${dk}`);
  }

  // 5. Value parity
  assert.equal(nodeStatus.status, 'online');
  assert.equal(pyStatus.status, 'online');
  assert.ok(nodeStatus.agent.startsWith('KSUMC Oracle Vision Agent'));
  assert.ok(pyStatus.agent.startsWith('KSUMC Oracle Vision Agent'));
  assert.equal(nodeStatus.diagnostics.exif_transpose_supported, true);
  assert.equal(pyStatus.diagnostics.exif_transpose_supported, true);
  assert.equal(nodeStatus.diagnostics.archive_vault_dir, pyStatus.diagnostics.archive_vault_dir);
});

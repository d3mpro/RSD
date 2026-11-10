const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawnSync } = require('node:child_process');

const agentServer = require('./agent_server.js');

test('M1 Backend 1.1: getExifOrientation and optimizeBase64Image detect and transpose rotated EXIF images in Node', () => {
  assert.equal(typeof agentServer.getExifOrientation, 'function', 'getExifOrientation must be exported');
  assert.equal(typeof agentServer.optimizeBase64Image, 'function', 'optimizeBase64Image must be exported');

  // Generate a test JPEG with EXIF orientation 6 (portrait 90-degree CW) using Python/Pillow
  const genScript = `
import sys, io
from PIL import Image
im = Image.new("RGB", (120, 240), color="blue")
exif = im.getexif()
exif[0x0112] = 6
buf = io.BytesIO()
im.save(buf, format="JPEG", exif=exif)
sys.stdout.buffer.write(buf.getvalue())
`;
  const genProc = spawnSync('python3', ['-c', genScript]);
  assert.equal(genProc.status, 0, 'Should generate test image');
  const rotJpeg = genProc.stdout;

  // 1. Detect orientation 6
  const detected = agentServer.getExifOrientation(rotJpeg);
  assert.equal(detected, 6, 'Should detect orientation 6');

  // 2. Transpose via optimizeBase64Image
  const b64Input = 'data:image/jpeg;base64,' + rotJpeg.toString('base64');
  const optResult = agentServer.optimizeBase64Image(b64Input, 1280, 85);
  assert.equal(optResult.mime, 'image/jpeg');
  assert.ok(optResult.b64.length > 0);
  assert.ok(optResult.dataUri.startsWith('data:image/jpeg;base64,'));

  // 3. Verify dimensions in transposed image (should now be 240 width, 120 height)
  const verifyProc = spawnSync('python3', [
    '-c',
    `import sys, io
from PIL import Image
raw = sys.stdin.buffer.read()
with Image.open(io.BytesIO(raw)) as im:
    print(f"{im.width}x{im.height}")
`
  ], { input: Buffer.from(optResult.b64, 'base64') });
  assert.equal(verifyProc.status, 0);
  assert.equal(verifyProc.stdout.toString().trim(), '240x120', 'Transposed image dimensions must be 240x120');
});

test('M1 Backend 1.2: Python agent_server.py implements ImageOps.exif_transpose in optimize_base64_image', () => {
  const pyCode = fs.readFileSync(path.join(__dirname, 'agent_server.py'), 'utf-8');
  assert.match(pyCode, /from PIL import Image, ImageOps/, 'PIL ImageOps must be imported in agent_server.py');
  assert.match(pyCode, /ImageOps\.exif_transpose/, 'ImageOps.exif_transpose must be called in agent_server.py');

  // Execute test inside python environment
  const pyTest = `
import base64, io
import agent_server
from PIL import Image

im = Image.new("RGB", (80, 160), color="green")
exif = im.getexif()
exif[0x0112] = 6
buf = io.BytesIO()
im.save(buf, format="JPEG", exif=exif)
raw_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

mime, opt_b64 = agent_server.optimize_base64_image(raw_b64)
assert mime == "image/jpeg"
with Image.open(io.BytesIO(base64.b64decode(opt_b64))) as out_im:
    assert (out_im.width, out_im.height) == (160, 80), f"Expected 160x80 but got {out_im.size}"
print("PYTHON_EXIF_OK")
`;
  const proc = spawnSync('python3', ['-c', pyTest], { cwd: __dirname });
  assert.equal(proc.status, 0, `Python EXIF transpose test failed: ${proc.stderr.toString()}`);
  assert.match(proc.stdout.toString(), /PYTHON_EXIF_OK/);
});

test('M1 Backend 2.1: callTextLlm dynamically falls back to Ollama vision model when text model is absent', async () => {
  const mockCalls = [];
  const mockFetch = async (url, opts) => {
    mockCalls.push({ url, body: JSON.parse(opts.body) });
    const body = JSON.parse(opts.body);
    // When called with qwen2.5:3b, simulate Ollama 404
    if (body.model === 'qwen2.5:3b') {
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":"model qwen2.5:3b not found"}'
      };
    }
    // When called with qwen2.5vl:3b, return successful response
    if (body.model === 'qwen2.5vl:3b') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          message: { content: 'إجابة من نموذج الرؤية البصرية qwen2.5vl:3b' }
        })
      };
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
    const [answer, source] = await agentServer.callTextLlm('اختبار الاستفسار', false, mockFetch);
    assert.match(answer, /qwen2.5vl:3b/);
    assert.match(source, /qwen2.5vl:3b/);
    assert.equal(mockCalls.length, 2, 'Should have tried text model first, then vision fallback');
    assert.equal(mockCalls[0].body.model, 'qwen2.5:3b');
    assert.equal(mockCalls[1].body.model, 'qwen2.5vl:3b');
  } finally {
    agentServer.CONFIG.priority = prevPriority;
    agentServer.CONFIG.ollamaEnabled = prevOllamaEnabled;
    agentServer.CONFIG.ollamaTextModel = prevOllamaTextModel;
    agentServer.CONFIG.ollamaVisionModel = prevOllamaVisionModel;
  }
});

test('M1 Backend 2.2: HTTP endpoints /ask-safety-assistant and /structure-voice-record fallback gracefully to rulebase instead of 503', async () => {
  const srv = agentServer.createAgentServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const prevPriority = agentServer.CONFIG.priority;
  const prevGithubKeys = agentServer.CONFIG.githubKeys;
  const prevQwenKeys = agentServer.CONFIG.qwenKeys;
  const prevGeminiKeys = agentServer.CONFIG.geminiKeys;
  const prevOllamaEnabled = agentServer.CONFIG.ollamaEnabled;

  // Force all AI providers offline to test rulebase fallback
  agentServer.CONFIG.priority = ['ollama_local'];
  agentServer.CONFIG.githubKeys = [];
  agentServer.CONFIG.qwenKeys = [];
  agentServer.CONFIG.geminiKeys = [];
  agentServer.CONFIG.ollamaEnabled = false;

  try {
    // 1. /safety/api/ai/ask-safety-assistant
    const resAsk = await fetch(`${baseUrl}/safety/api/ai/ask-safety-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'ما هي معايير فحص طفاية الحريق حسب سباهي؟' })
    });
    assert.equal(resAsk.status, 200, 'Must return HTTP 200, never 503');
    const jsonAsk = await resAsk.json();
    assert.equal(jsonAsk.success, true);
    assert.match(jsonAsk.answer, /CBAHI FMS\.14|SBC 801|NFPA 10/);
    assert.equal(jsonAsk.source, 'KSUMC Safety Rulebase');

    // 2. /safety/api/ai/structure-voice-record
    const resVoice = await fetch(`${baseUrl}/safety/api/ai/structure-voice-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'تم رصد غلاية وسخان في مبنى المستشفى الدور الثاني غرفة 204 وملاحظة تدخين',
        form_type: 'general'
      })
    });
    assert.equal(resVoice.status, 200, 'Must return HTTP 200, never 503');
    const jsonVoice = await resVoice.json();
    assert.equal(jsonVoice.success, true);
    assert.ok(jsonVoice.data, 'Should return structured data');
    assert.ok(Array.isArray(jsonVoice.data.detected_devices));
    assert.equal(jsonVoice.data.room, '204');
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

test('M1 Backend 3.1: Status endpoint /safety/api/ai/status returns complete diagnostics and model telemetry', async () => {
  const srv = agentServer.createAgentServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/safety/api/ai/status`);
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.equal(json.status, 'online');
    assert.ok(Array.isArray(json.priority));
    assert.equal(typeof json.github_models_configured, 'boolean');
    assert.equal(typeof json.github_vision_model, 'string');
    assert.equal(typeof json.github_text_model, 'string');
    assert.equal(typeof json.qwen_api_configured, 'boolean');
    assert.equal(typeof json.qwen_vision_model, 'string');
    assert.equal(typeof json.qwen_text_model, 'string');
    assert.equal(typeof json.ollama_online, 'boolean');
    assert.equal(typeof json.ollama_vision_model, 'string');
    assert.equal(typeof json.ollama_text_model, 'string');
    assert.ok(Array.isArray(json.ollama_installed_models));
    assert.equal(typeof json.gemini_keys_count, 'number');

    assert.ok(json.diagnostics, 'diagnostics block must be present');
    assert.equal(json.diagnostics.exif_transpose_supported, true);
    assert.equal(typeof json.diagnostics.active_text_model, 'string');
    assert.equal(typeof json.diagnostics.text_fallback_active, 'boolean');
    assert.ok(json.diagnostics.archive_vault_dir);
  } finally {
    await new Promise(resolve => srv.close(resolve));
  }
});

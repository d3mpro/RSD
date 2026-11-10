const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const agentModule = require('./agent_server.js');

test('Task 1.1: sanitizeArchiveCardId accepts valid IDs and rejects path traversal', () => {
  assert.equal(typeof agentModule.sanitizeArchiveCardId, 'function', 'sanitizeArchiveCardId must be exported');
  assert.equal(agentModule.sanitizeArchiveCardId('KSU-VIS-2026-9912'), 'KSU-VIS-2026-9912');
  assert.throws(() => agentModule.sanitizeArchiveCardId('../../.env'), /invalid|cardId/i);
  assert.throws(() => agentModule.sanitizeArchiveCardId('CARD/../../secret'), /invalid|cardId/i);
  assert.throws(() => agentModule.sanitizeArchiveCardId(''), /invalid|cardId/i);
});

test('Task 1.2: callGithubModelsVision uses openai/gpt-4o and automatically falls back to openai/gpt-4o-mini on HTTP 429', async () => {
  assert.equal(typeof agentModule.callGithubModelsVision, 'function', 'callGithubModelsVision must be exported');

  const requestedModels = [];
  const mockFetch = async (url, opts) => {
    assert.equal(url, 'https://models.github.ai/inference/chat/completions');
    const body = JSON.parse(opts.body);
    requestedModels.push(body.model);
    if (body.model === 'openai/gpt-4o') {
      return {
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded for openai/gpt-4o'
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                hazard_detected: true,
                compliance_status: 'غير مطابق',
                risk_level: 'حرج',
                detected_element: 'طفاية حريق بضغط منخفض',
                findings_summary: 'المؤشر في المنطقة الحمراء',
                violations_list: ['انخفاض ضغط الطفاية'],
                corrective_actions: ['إعادة تعبئة الطفاية فوراً']
              })
            }
          }
        ]
      })
    };
  };

  const prevKeys = agentModule.CONFIG.githubKeys;
  agentModule.CONFIG.githubKeys = ['test_pat_token_123'];
  try {
    const [parsed, source] = await agentModule.callGithubModelsVision(
      ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='],
      'افحص الطفاية',
      mockFetch
    );
    assert.deepEqual(requestedModels, ['openai/gpt-4o', 'openai/gpt-4o-mini']);
    assert.equal(parsed.hazard_detected, true);
    assert.match(source, /gpt-4o-mini/i);
  } finally {
    agentModule.CONFIG.githubKeys = prevKeys;
  }
});

test('Task 1.3: Archive Vault HTTP endpoints enforce security token, block traversal, store 1280px images, and serve them via GET and POST bridge alias', async () => {
  assert.equal(typeof agentModule.createAgentServer, 'function', 'createAgentServer must be exported');

  const tmpVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ksu-vault-test-'));
  const prevVaultDir = agentModule.CONFIG.archiveVaultDir;
  agentModule.CONFIG.archiveVaultDir = tmpVaultDir;

  const srv = agentModule.createAgentServer();
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = agentModule.CONFIG.securityToken;

  try {
    // 1. Reject unauthorized request with 403
    const unauthRes = await fetch(`${baseUrl}/safety/api/archive/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: 'CARD-101', images: ['data:image/jpeg;base64,QUJD'] })
    });
    assert.equal(unauthRes.status, 403);

    // 2. Reject path traversal cardId with 400
    const travRes = await fetch(`${baseUrl}/safety/api/archive/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': token },
      body: JSON.stringify({ cardId: '../../.env', images: ['data:image/jpeg;base64,QUJD'] })
    });
    assert.equal(travRes.status, 400);

    // 3. Store valid high-res bundle via dispatch
    const sampleImg = 'data:image/jpeg;base64,' + Buffer.from('FAKE_JPEG_1280PX_BYTES').toString('base64');
    const storeRes = await fetch(`${baseUrl}/safety/api/archive/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': token },
      body: JSON.stringify({
        cardId: 'KSU-VIS-2026-7788',
        date: '2026-11-08',
        facility: 'مستشفى الملك خالد الجامعي (KKUH)',
        location: 'الدور الأول',
        severity: 'high',
        summary: 'إعاقة مخرج طوارئ',
        htmlReport: '<html><body>محضر رسمي</body></html>',
        images: [sampleImg]
      })
    });
    assert.equal(storeRes.status, 200);
    const storeJson = await storeRes.json();
    assert.equal(storeJson.success, true);
    assert.equal(storeJson.storedImages, 1);

    // 4. Retrieve via GET /safety/api/archive/media/:cardId
    const getRes = await fetch(`${baseUrl}/safety/api/archive/media/KSU-VIS-2026-7788`, {
      headers: { 'X-KSUMC-KEY': token }
    });
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.success, true);
    assert.deepEqual(getJson.images, [sampleImg]);

    // 5. Retrieve via POST /safety/api/ai/archive-media (Firebase Bridge compatibility with x-ksumc-token)
    const bridgeRes = await fetch(`${baseUrl}/safety/api/ai/archive-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ksumc-token': token },
      body: JSON.stringify({ cardId: 'KSU-VIS-2026-7788' })
    });
    assert.equal(bridgeRes.status, 200);
    const bridgeJson = await bridgeRes.json();
    assert.deepEqual(bridgeJson.images, [sampleImg]);

    // 6. Reject encoded path traversal on GET /safety/api/archive/media/:cardId with 400
    const getTravRes = await fetch(`${baseUrl}/safety/api/archive/media/%2E%2E%2F%2E%2E%2F.env`, {
      headers: { 'X-KSUMC-KEY': token }
    });
    assert.equal(getTravRes.status, 400);
  } finally {
    await new Promise(resolve => srv.close(resolve));
    agentModule.CONFIG.archiveVaultDir = prevVaultDir;
    fs.rmSync(tmpVaultDir, { recursive: true, force: true });
  }
});

test('Task 1.5: Python agent_server.py implements matching github_models failover and archive endpoints', () => {
  const pySrc = fs.readFileSync(path.join(__dirname, 'agent_server.py'), 'utf-8');
  assert.match(pySrc, /async def call_github_models_vision/);
  assert.match(pySrc, /def sanitize_archive_card_id/);
  assert.match(pySrc, /def save_archive_bundle/);
  assert.match(pySrc, /def load_archive_media/);
  assert.match(pySrc, /\/safety\/api\/archive\/dispatch/);
  assert.match(pySrc, /\/safety\/api\/ai\/archive-dispatch/);
  assert.match(pySrc, /\/safety\/api\/archive\/media\/\{card_id:path\}/);
  assert.match(pySrc, /\/safety\/api\/ai\/archive-media/);
  assert.match(pySrc, /openai\/gpt-4o-mini/);
});

test('Task 1.4: Zero github_pat_ secrets appear in any git-tracked file', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const trackedFiles = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf-8' })
    .split(/\r?\n/)
    .filter(Boolean);

  for (const relPath of trackedFiles) {
    const fullPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;
    const ext = path.extname(relPath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.xlsx', '.docx', '.pdf', '.db', '.woff', '.woff2'].includes(ext)) continue;
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.equal(
      /github_pat_[A-Za-z0-9_]{20,}/.test(content),
      false,
      `Found exposed github_pat_ secret in git-tracked file: ${relPath}`
    );
  }
});

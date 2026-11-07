/**
 * ==============================================================================
 * KSUMC Smart Safety Vision Agent (Node.js Standalone Edition - Zero Dependencies)
 * وكيل الرؤية البصرية الذكي للسلامة الميدانية (GPT-4o + Qwen2.5-VL + Ollama + Gemini)
 * المدينة الطبية بجامعة الملك سعود (KSUMC)
 * ==============================================================================
 * يعمل مباشرة عبر Node.js بدون الحاجة لأي مكتبات خارجية للتجربة الفورية على ويندوز
 * أو التشغيل المباشر على خادم أوراكل السحابي، مع خزنة أرشفة الصور عالية الدقة.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// قراءة ملف .env إن وجد
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile();

const CONFIG = {
  securityToken: process.env.KSUMC_SECURITY_TOKEN || 'ksu_sec_token_95972_riyadh',
  priority: (process.env.AI_PROVIDER_PRIORITY || 'github_models,qwen_api,ollama_local,gemini_api')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  githubBaseUrl: process.env.GITHUB_MODELS_BASE_URL || 'https://models.github.ai/inference/chat/completions',
  githubKeys: (process.env.GITHUB_MODELS_KEYS || '').split(',').map(s => s.trim()).filter(Boolean),
  githubVisionModel: process.env.GITHUB_VISION_MODEL || 'openai/gpt-4o',
  githubFallbackVisionModel: process.env.GITHUB_FALLBACK_VISION_MODEL || 'openai/gpt-4o-mini',
  githubTextModel: process.env.GITHUB_TEXT_MODEL || 'openai/gpt-4o-mini',
  qwenBaseUrl: process.env.QWEN_API_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions',
  qwenKeys: (process.env.QWEN_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean),
  qwenVisionModel: process.env.QWEN_VISION_MODEL || 'qwen/qwen2.5-vl-72b-instruct:free',
  qwenTextModel: process.env.QWEN_TEXT_MODEL || 'qwen/qwen-2.5-72b-instruct:free',
  ollamaEnabled: (process.env.OLLAMA_ENABLED || 'true').toLowerCase() === 'true',
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:3b',
  ollamaTextModel: process.env.OLLAMA_TEXT_MODEL || 'qwen2.5:3b',
  geminiKeys: (process.env.GEMINI_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  archiveVaultDir: path.resolve(__dirname, process.env.ARCHIVE_VAULT_DIR || 'archive_vault'),
  cacheTtlMs: parseInt(process.env.CACHE_TTL_SECONDS || '1800', 10) * 1000,
  port: parseInt(process.env.PORT || '8000', 10)
};

const STATE = {
  githubKeyIdx: 0,
  qwenKeyIdx: 0,
  geminiKeyIdx: 0,
  totalRequests: 0,
  cacheHits: 0,
  archivedCount: 0,
  lastProviderUsed: 'none',
  lastError: null
};

const ANALYSIS_CACHE = new Map();

function getRiyadhContext() {
  const now = new Date();
  let curDate = now.toISOString().split('T')[0];
  let curTime = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  try {
    curDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);
    curTime = new Intl.DateTimeFormat('ar-SA', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit'
    }).format(now);
  } catch (_) {}
  return {
    currentDate: curDate,
    currentTime: curTime,
    year: parseInt(curDate.split('-')[0], 10) || 2026
  };
}

function extractJsonObject(rawText) {
  if (!rawText) throw new Error('استجابة فارغة من النموذج');
  const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('تعذر قراءة JSON من استجابة النموذج');
  }
}

function sanitizeArchiveCardId(rawCardId) {
  const str = String(rawCardId || '').trim();
  if (!str || !/^[A-Za-z0-9_-]{1,80}$/.test(str)) {
    throw new Error('Invalid cardId format');
  }
  return str;
}

function ensureInsideVault(vaultRoot, candidatePath) {
  const resolvedRoot = path.resolve(vaultRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  const rel = path.relative(resolvedRoot, resolvedCandidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid archive path outside vault');
  }
  return resolvedCandidate;
}

function saveArchiveBundle(body = {}) {
  const safeId = sanitizeArchiveCardId(body.cardId);
  const rawDate = String(body.date || getRiyadhContext().currentDate);
  const monthMatch = rawDate.match(/^(\d{4}-\d{2})/);
  const monthKey = monthMatch ? monthMatch[1] : getRiyadhContext().currentDate.slice(0, 7);

  const vaultRoot = path.resolve(CONFIG.archiveVaultDir);
  const monthDir = ensureInsideVault(vaultRoot, path.join(vaultRoot, monthKey));
  fs.mkdirSync(monthDir, { recursive: true });

  const images = Array.isArray(body.images)
    ? body.images.filter(x => typeof x === 'string' && x.length > 0).slice(0, 10)
    : [];

  images.forEach((imgStr, idx) => {
    const m = imgStr.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    const b64Payload = m ? m[2] : imgStr;
    try {
      const buf = Buffer.from(b64Payload, 'base64');
      const imgFile = ensureInsideVault(vaultRoot, path.join(monthDir, `${safeId}_${idx}.jpg`));
      fs.writeFileSync(imgFile, buf);
    } catch (_) {}
  });

  if (typeof body.htmlReport === 'string' && body.htmlReport.trim()) {
    const htmlFile = ensureInsideVault(vaultRoot, path.join(monthDir, `${safeId}.html`));
    fs.writeFileSync(htmlFile, body.htmlReport, 'utf-8');
  }

  const recordPayload = {
    cardId: safeId,
    savedAt: new Date().toISOString(),
    monthKey,
    date: rawDate,
    facility: body.facility || '',
    location: body.location || '',
    severity: body.severity || 'high',
    summary: body.summary || '',
    metadata: body.metadata || {},
    images
  };

  const jsonFile = ensureInsideVault(vaultRoot, path.join(monthDir, `${safeId}.json`));
  fs.writeFileSync(jsonFile, JSON.stringify(recordPayload, null, 2), 'utf-8');
  STATE.archivedCount++;

  return {
    cardId: safeId,
    monthKey,
    storedImages: images.length
  };
}

function loadArchiveMedia(rawCardId) {
  const safeId = sanitizeArchiveCardId(rawCardId);
  const vaultRoot = path.resolve(CONFIG.archiveVaultDir);
  if (!fs.existsSync(vaultRoot)) return null;

  const entries = fs.readdirSync(vaultRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}$/.test(d.name))
    .map(d => d.name)
    .sort()
    .reverse();

  for (const monthName of entries) {
    const candidateJson = ensureInsideVault(vaultRoot, path.join(vaultRoot, monthName, `${safeId}.json`));
    if (fs.existsSync(candidateJson)) {
      const parsed = JSON.parse(fs.readFileSync(candidateJson, 'utf-8'));
      return {
        cardId: safeId,
        images: Array.isArray(parsed.images) ? parsed.images : [],
        metadata: {
          date: parsed.date || '',
          facility: parsed.facility || '',
          location: parsed.location || '',
          severity: parsed.severity || '',
          summary: parsed.summary || '',
          savedAt: parsed.savedAt || ''
        }
      };
    }
  }
  return null;
}

const {
  resolveSubmode,
  buildVisionPrompt,
  buildExtinguisherPrompt,
  buildExitPrompt,
  buildHazardPrompt,
  buildGeneralPrompt,
  sanitizeVisionOutput
} = require('./prompt_builder.js');

async function callGithubModelsVision(images, prompt, fetchImpl = fetch) {
  if (!CONFIG.githubKeys.length) throw new Error('لم يتم إدخال GITHUB_MODELS_KEYS بعد');
  const modelsToTry = [CONFIG.githubVisionModel, CONFIG.githubFallbackVisionModel]
    .filter((m, idx, arr) => m && arr.indexOf(m) === idx);

  let lastErr = null;
  for (let k = 0; k < CONFIG.githubKeys.length; k++) {
    const key = CONFIG.githubKeys[(STATE.githubKeyIdx++) % CONFIG.githubKeys.length];
    const content = images.map(img => ({
      type: 'image_url',
      image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
    }));
    content.push({ type: 'text', text: prompt });

    for (const modelName of modelsToTry) {
      try {
        const resp = await fetchImpl(CONFIG.githubBaseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content }],
            temperature: 0.2,
            max_tokens: 1400
          })
        });

        if (!resp.ok) {
          const t = await resp.text();
          const err = new Error(`GitHub Models (${modelName}) HTTP ${resp.status}: ${t.slice(0, 150)}`);
          err.status = resp.status;
          if (resp.status === 429 && modelName !== modelsToTry[modelsToTry.length - 1]) {
            lastErr = err;
            continue;
          }
          lastErr = err;
          break;
        }

        const data = await resp.json();
        const parsed = extractJsonObject(data.choices?.[0]?.message?.content || '');
        return [parsed, `GitHub Models (${modelName})`];
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('تعذر الاتصال بمحرك GitHub Models');
}

async function callQwenApiVision(images, prompt) {
  if (!CONFIG.qwenKeys.length) throw new Error('لم يتم إدخال QWEN_API_KEYS بعد');
  let lastErr = null;
  for (let i = 0; i < CONFIG.qwenKeys.length; i++) {
    const key = CONFIG.qwenKeys[(STATE.qwenKeyIdx++) % CONFIG.qwenKeys.length];
    const content = images.map(img => ({
      type: 'image_url',
      image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
    }));
    content.push({ type: 'text', text: prompt });

    try {
      const resp = await fetch(CONFIG.qwenBaseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ksumc-safety.web.app',
          'X-Title': 'KSUMC Safety Vision Agent'
        },
        body: JSON.stringify({
          model: CONFIG.qwenVisionModel,
          messages: [{ role: 'user', content }],
          temperature: 0.2
        })
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Qwen HTTP ${resp.status}: ${t.slice(0, 150)}`);
      }
      const data = await resp.json();
      return extractJsonObject(data.choices?.[0]?.message?.content || '');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function callOllamaVision(images, prompt) {
  if (!CONFIG.ollamaEnabled) throw new Error('Ollama غير مفعل');
  const rawB64 = images.map(img => {
    if (img.startsWith('data:')) {
      const idx = img.indexOf('base64,');
      return idx !== -1 ? img.slice(idx + 7) : img;
    }
    return img;
  });

  const resp = await fetch(`${CONFIG.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: CONFIG.ollamaVisionModel,
      messages: [{ role: 'user', content: prompt, images: rawB64 }],
      format: 'json',
      stream: false,
      options: { temperature: 0.2 }
    })
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Ollama HTTP ${resp.status}: ${t.slice(0, 150)}`);
  }
  const data = await resp.json();
  return extractJsonObject(data.message?.content || '');
}

async function callGeminiPoolVision(images, prompt) {
  if (!CONFIG.geminiKeys.length) throw new Error('لم يتم إدخال GEMINI_API_KEYS الاحتياطية');
  let lastErr = null;
  for (let i = 0; i < CONFIG.geminiKeys.length; i++) {
    const key = CONFIG.geminiKeys[(STATE.geminiKeyIdx++) % CONFIG.geminiKeys.length];
    const parts = images.map(img => {
      let mime = 'image/jpeg';
      let b64 = img;
      if (img.startsWith('data:')) {
        const m = img.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          mime = m[1];
          b64 = m[2];
        }
      }
      return { inlineData: { mimeType: mime, data: b64 } };
    });
    parts.push({ text: prompt });

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${key}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Gemini HTTP ${resp.status}: ${t.slice(0, 150)}`);
      }
      const data = await resp.json();
      return extractJsonObject(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-KSUMC-KEY, x-ksumc-token, Authorization'
  });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', chunk => {
      totalBytes += chunk.length;
      if (totalBytes > 25 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function isAuthorizedRequest(req) {
  const keyHeader = req.headers['x-ksumc-key'] || req.headers['x-ksumc-token'];
  return Boolean(keyHeader && keyHeader === CONFIG.securityToken);
}

function createAgentServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }

    let decodedPath = '/';
    try {
      decodedPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch (_) {
      return sendJson(res, 400, { detail: 'Invalid URL encoding' });
    }
    const urlPath = decodedPath.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && urlPath === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>وكيل الرؤية البصرية الذكي (GPT-4o & Qwen2.5-VL) | KSUMC</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;">
  <div style="max-width:740px;margin:0 auto;background:#1e293b;padding:2rem;border-radius:1.25rem;border:1px solid #334155;">
    <h2 style="margin-top:0;color:#38bdf8;">وكيل أوراكل للرؤية البصرية الذكية (GPT-4o + Qwen2.5-VL) ● متصل</h2>
    <p style="color:#cbd5e1;">المدينة الطبية بجامعة الملك سعود • منصة رصد لجولات السلامة (CBAHI / NFPA / SBC)</p>
    <ul style="line-height:1.9;color:#e2e8f0;">
      <li>أولوية المحركات: <code>${CONFIG.priority.join(' → ')}</code></li>
      <li>محرك GitHub Models (GPT-4o): <code>${CONFIG.githubVisionModel}</code> (${CONFIG.githubKeys.length} مفاتيح)</li>
      <li>نموذج Qwen2.5-VL السحابي: <code>${CONFIG.qwenVisionModel}</code> (${CONFIG.qwenKeys.length} مفاتيح)</li>
      <li>نموذج Ollama المحلي: <code>${CONFIG.ollamaVisionModel}</code> (${CONFIG.ollamaEnabled ? 'مفعل' : 'معطل'})</li>
      <li>مفاتيح Gemini الاحتياطية: ${CONFIG.geminiKeys.length} مفاتيح</li>
      <li>إجمالي الفحوصات: ${STATE.totalRequests} (الكاش: ${STATE.cacheHits}) | المحفوظات المؤرشفة: ${STATE.archivedCount} | آخر محرك: <code>${STATE.lastProviderUsed}</code></li>
    </ul>
  </div>
</body></html>`);
    }

    if (req.method === 'GET' && (urlPath === '/health' || urlPath.endsWith('/ai/status'))) {
      let ollamaOnline = false;
      if (CONFIG.ollamaEnabled) {
        try {
          const r = await fetch(`${CONFIG.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
          ollamaOnline = r.ok;
        } catch (_) {}
      }
      return sendJson(res, 200, {
        status: 'online',
        agent: 'KSUMC Oracle Vision Agent v2.1 (Node)',
        priority: CONFIG.priority,
        github_models_configured: CONFIG.githubKeys.length > 0,
        github_vision_model: CONFIG.githubVisionModel,
        qwen_api_configured: CONFIG.qwenKeys.length > 0,
        qwen_vision_model: CONFIG.qwenVisionModel,
        ollama_online: ollamaOnline,
        ollama_vision_model: CONFIG.ollamaVisionModel,
        gemini_keys_count: CONFIG.geminiKeys.length,
        stats: STATE
      });
    }

    // 1. نقطة أرشفة الصور عالية الدقة (مباشر + جسر الفايربيس)
    if (
      req.method === 'POST' &&
      (urlPath === '/safety/api/archive/dispatch' ||
        urlPath === '/archive/dispatch' ||
        urlPath.endsWith('/ai/archive-dispatch'))
    ) {
      if (!isAuthorizedRequest(req)) {
        return sendJson(res, 403, { detail: 'غير مصرح بالوصول إلى خزنة الأرشفة' });
      }
      try {
        const body = await readJsonBody(req);
        const saved = saveArchiveBundle(body);
        return sendJson(res, 200, {
          success: true,
          cardId: saved.cardId,
          monthKey: saved.monthKey,
          storedImages: saved.storedImages,
          emailDispatched: false
        });
      } catch (e) {
        const isClientErr = /invalid cardid|outside vault/i.test(e.message || '');
        return sendJson(res, isClientErr ? 400 : 500, { detail: e.message });
      }
    }

    // 2. نقطة استرجاع الصور عالية الدقة للمشرفين عبر الأجهزة (GET المباشر)
    const mediaGetPrefix = '/safety/api/archive/media/';
    const shortMediaGetPrefix = '/archive/media/';
    if (
      req.method === 'GET' &&
      (urlPath.startsWith(mediaGetPrefix) || urlPath.startsWith(shortMediaGetPrefix))
    ) {
      if (!isAuthorizedRequest(req)) {
        return sendJson(res, 403, { detail: 'غير مصرح بقراءة خزنة الأرشفة' });
      }
      const rawCardId = urlPath.startsWith(mediaGetPrefix)
        ? urlPath.slice(mediaGetPrefix.length)
        : urlPath.slice(shortMediaGetPrefix.length);
      try {
        const media = loadArchiveMedia(rawCardId);
        if (!media) {
          return sendJson(res, 404, { detail: 'لم يتم العثور على صور مؤرشفة لهذا المحضر' });
        }
        return sendJson(res, 200, { success: true, ...media });
      } catch (e) {
        return sendJson(res, 400, { detail: e.message });
      }
    }

    // 3. نقطة استرجاع الصور عالية الدقة عبر جسر الفايربيس (POST /ai/archive-media)
    if (req.method === 'POST' && urlPath.endsWith('/ai/archive-media')) {
      if (!isAuthorizedRequest(req)) {
        return sendJson(res, 403, { detail: 'غير مصرح بقراءة خزنة الأرشفة' });
      }
      try {
        const body = await readJsonBody(req);
        const media = loadArchiveMedia(body.cardId);
        if (!media) {
          return sendJson(res, 404, { detail: 'لم يتم العثور على صور مؤرشفة لهذا المحضر' });
        }
        return sendJson(res, 200, { success: true, ...media });
      } catch (e) {
        const isClientErr = /invalid cardid|outside vault/i.test(e.message || '');
        return sendJson(res, isClientErr ? 400 : 500, { detail: e.message });
      }
    }

    if (req.method === 'POST' && urlPath.endsWith('/ai/config')) {
      if (!isAuthorizedRequest(req)) {
        return sendJson(res, 403, { detail: 'غير مصرح بتعديل إعدادات الوكيل' });
      }
      try {
        const body = await readJsonBody(req);
        if (Array.isArray(body.github_keys)) {
          CONFIG.githubKeys = body.github_keys.map(k => String(k).trim()).filter(Boolean);
        }
        if (Array.isArray(body.qwen_keys)) {
          CONFIG.qwenKeys = body.qwen_keys.map(k => String(k).trim()).filter(Boolean);
        }
        if (body.qwen_vision_model) CONFIG.qwenVisionModel = String(body.qwen_vision_model).trim();
        if (Array.isArray(body.gemini_keys)) {
          CONFIG.geminiKeys = body.gemini_keys.map(k => String(k).trim()).filter(Boolean);
        }
        if (Array.isArray(body.priority) && body.priority.length) {
          CONFIG.priority = body.priority.map(p => String(p).trim()).filter(Boolean);
        }
        return sendJson(res, 200, {
          success: true,
          priority: CONFIG.priority,
          github_keys_count: CONFIG.githubKeys.length,
          qwen_keys_count: CONFIG.qwenKeys.length,
          qwen_vision_model: CONFIG.qwenVisionModel
        });
      } catch (e) {
        return sendJson(res, 400, { detail: e.message });
      }
    }

    if (req.method === 'POST' && urlPath.endsWith('/ai/analyze-inspection-image')) {
      try {
        STATE.totalRequests++;
        const body = await readJsonBody(req);
        const rawImages = (Array.isArray(body.images) && body.images.length)
          ? body.images
          : (body.image ? [body.image] : []);
        const images = rawImages.filter(Boolean).slice(0, 5);
        if (!images.length) {
          return sendJson(res, 400, { detail: 'لم يتم إرفاق أي صورة للفحص' });
        }

        const submode = resolveSubmode(body.submode, body.checklistType);

        const hash = crypto.createHash('sha256');
        for (const img of images) hash.update(img.slice(0, 4096));
        hash.update(`${submode}|${body.checklistType}|${body.building}|${body.floor}|${body.notes}`);
        const cacheKey = hash.digest('hex');

        const cached = ANALYSIS_CACHE.get(cacheKey);
        if (cached && (Date.now() - cached.ts < CONFIG.cacheTtlMs)) {
          STATE.cacheHits++;
          return sendJson(res, 200, {
            success: true,
            data: cached.data,
            source: `${cached.source} (Cached)`
          });
        }

        const ctx = getRiyadhContext();
        const prompt = buildVisionPrompt(ctx, { ...body, submode });
        const errors = [];

        for (const provider of CONFIG.priority) {
          try {
            let parsed = null;
            let sourceLabel = '';
            if (provider === 'github_models') {
              const [ghParsed, ghLabel] = await callGithubModelsVision(images, prompt);
              parsed = ghParsed;
              sourceLabel = ghLabel;
            } else if (provider === 'qwen_api') {
              parsed = await callQwenApiVision(images, prompt);
              sourceLabel = `Oracle Qwen2.5-VL (${CONFIG.qwenVisionModel})`;
            } else if (provider === 'ollama_local') {
              parsed = await callOllamaVision(images, prompt);
              sourceLabel = `Oracle Local Ollama (${CONFIG.ollamaVisionModel})`;
            } else if (provider === 'gemini_api') {
              parsed = await callGeminiPoolVision(images, prompt);
              sourceLabel = `Oracle Gemini Pool (${CONFIG.geminiModel})`;
            } else {
              continue;
            }

            const cleanData = sanitizeVisionOutput(parsed, ctx, submode);
            cleanData.ai_engine_source = sourceLabel;
            STATE.lastProviderUsed = sourceLabel;
            ANALYSIS_CACHE.set(cacheKey, { ts: Date.now(), data: cleanData, source: sourceLabel });

            return sendJson(res, 200, {
              success: true,
              data: cleanData,
              source: sourceLabel
            });
          } catch (err) {
            errors.push(`${provider}: ${err.message}`);
            STATE.lastError = err.message;
          }
        }

        return sendJson(res, 503, {
          detail: `تعذر التحليل عبر محركات الوكيل (${errors.join(' | ')})`
        });
      } catch (e) {
        return sendJson(res, 500, { detail: e.message });
      }
    }

    return sendJson(res, 404, { detail: 'المسار غير موجود في وكيل الرؤية البصرية' });
  });
}

const server = createAgentServer();

if (require.main === module) {
  server.listen(CONFIG.port, '0.0.0.0', () => {
    console.log('=====================================================================');
    console.log(`   وكيل الرؤية البصرية الذكي (GPT-4o + Qwen2.5-VL) يعمل على المنفذ ${CONFIG.port}`);
    console.log(`   - لوحة حالة الوكيل:  http://localhost:${CONFIG.port}/`);
    console.log(`   - نقطة ربط المنصة:   http://localhost:${CONFIG.port}/safety/api`);
    console.log('=====================================================================');
  });
}

module.exports = {
  server,
  createAgentServer,
  callGithubModelsVision,
  sanitizeArchiveCardId,
  saveArchiveBundle,
  loadArchiveMedia,
  CONFIG,
  STATE,
  buildVisionPrompt,
  sanitizeVisionOutput,
  resolveSubmode
};

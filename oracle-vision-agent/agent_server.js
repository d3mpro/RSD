/**
 * ==============================================================================
 * KSUMC Smart Safety Vision Agent (Node.js Standalone Edition - Zero Dependencies)
 * وكيل الرؤية البصرية الذكي للسلامة الميدانية (Qwen2.5-VL + Ollama + Gemini Pool)
 * المدينة الطبية بجامعة الملك سعود (KSUMC)
 * ==============================================================================
 * يعمل مباشرة عبر Node.js بدون الحاجة لأي مكتبات خارجية للتجربة الفورية على ويندوز
 * أو التشغيل المباشر على خادم أوراكل السحابي.
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
  priority: (process.env.AI_PROVIDER_PRIORITY || 'qwen_api,ollama_local,gemini_api')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
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
  cacheTtlMs: parseInt(process.env.CACHE_TTL_SECONDS || '1800', 10) * 1000,
  port: parseInt(process.env.PORT || '8000', 10)
};

const STATE = {
  qwenKeyIdx: 0,
  geminiKeyIdx: 0,
  totalRequests: 0,
  cacheHits: 0,
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

const {
  resolveSubmode,
  buildVisionPrompt,
  buildExtinguisherPrompt,
  buildExitPrompt,
  buildHazardPrompt,
  buildGeneralPrompt,
  sanitizeVisionOutput
} = require('./prompt_builder.js');

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
    'Access-Control-Allow-Headers': 'Content-Type, X-KSUMC-KEY, Authorization'
  });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 200, { ok: true });
  }

  const urlPath = (req.url || '/').split('?')[0].replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && urlPath === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>وكيل الرؤية البصرية الذكي (Qwen2.5-VL) | KSUMC</title></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;">
  <div style="max-width:740px;margin:0 auto;background:#1e293b;padding:2rem;border-radius:1.25rem;border:1px solid #334155;">
    <h2 style="margin-top:0;color:#38bdf8;">وكيل أوراكل للرؤية البصرية الذكية (Qwen2.5-VL Agent) ● متصل</h2>
    <p style="color:#cbd5e1;">المدينة الطبية بجامعة الملك سعود • منصة رصد لجولات السلامة (CBAHI / NFPA / SBC)</p>
    <ul style="line-height:1.9;color:#e2e8f0;">
      <li>أولوية المحركات: <code>${CONFIG.priority.join(' → ')}</code></li>
      <li>نموذج Qwen2.5-VL السحابي: <code>${CONFIG.qwenVisionModel}</code> (${CONFIG.qwenKeys.length} مفاتيح)</li>
      <li>نموذج Ollama المحلي: <code>${CONFIG.ollamaVisionModel}</code> (${CONFIG.ollamaEnabled ? 'مفعل' : 'معطل'})</li>
      <li>مفاتيح Gemini الاحتياطية: ${CONFIG.geminiKeys.length} مفاتيح</li>
      <li>إجمالي الفحوصات المنفذة: ${STATE.totalRequests} (الكاش: ${STATE.cacheHits}) | آخر محرك: <code>${STATE.lastProviderUsed}</code></li>
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
      agent: 'KSUMC Oracle Vision Agent v2.0 (Node)',
      priority: CONFIG.priority,
      qwen_api_configured: CONFIG.qwenKeys.length > 0,
      qwen_vision_model: CONFIG.qwenVisionModel,
      ollama_online: ollamaOnline,
      ollama_vision_model: CONFIG.ollamaVisionModel,
      gemini_keys_count: CONFIG.geminiKeys.length,
      stats: STATE
    });
  }

  if (req.method === 'POST' && urlPath.endsWith('/ai/config')) {
    try {
      const body = await readJsonBody(req);
      if (Array.isArray(body.qwen_keys)) {
        CONFIG.qwenKeys = body.qwen_keys.map(k => String(k).trim()).filter(Boolean);
      }
      if (body.qwen_vision_model) CONFIG.qwenVisionModel = String(body.qwen_vision_model).trim();
      if (Array.isArray(body.gemini_keys)) {
        CONFIG.geminiKeys = body.gemini_keys.map(k => String(k).trim()).filter(Boolean);
      }
      return sendJson(res, 200, {
        success: true,
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
          if (provider === 'qwen_api') {
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

if (require.main === module) {
  server.listen(CONFIG.port, '0.0.0.0', () => {
    console.log('=====================================================================');
    console.log(`   وكيل الرؤية البصرية الذكي (Qwen2.5-VL Agent) يعمل على المنفذ ${CONFIG.port}`);
    console.log(`   - لوحة حالة الوكيل:  http://localhost:${CONFIG.port}/`);
    console.log(`   - نقطة ربط المنصة:   http://localhost:${CONFIG.port}/safety/api`);
    console.log('=====================================================================');
  });
}

module.exports = {
  server,
  CONFIG,
  STATE,
  buildVisionPrompt,
  sanitizeVisionOutput,
  resolveSubmode
};

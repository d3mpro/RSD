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
const { spawnSync } = require('child_process');

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

function getExifOrientation(buf) {
  if (!buf || buf.length < 4) return 1;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return 1; // Not JPEG
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xFF) break;
    const marker = buf[offset + 1];
    if (marker === 0xDA || marker === 0xD9) break; // SOS or EOI
    const len = buf.readUInt16BE(offset + 2);
    if (marker === 0xE1 && len >= 8) { // APP1 Exif
      const exifHeader = buf.toString('ascii', offset + 4, offset + 8);
      if (exifHeader === 'Exif') {
        const tiffOffset = offset + 10;
        if (tiffOffset + 8 > buf.length) break;
        const isLittle = buf.toString('ascii', tiffOffset, tiffOffset + 2) === 'II';
        const read16 = (o) => isLittle ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
        const read32 = (o) => isLittle ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
        const ifd0Offset = tiffOffset + read32(tiffOffset + 4);
        if (ifd0Offset + 2 <= buf.length) {
          const numEntries = read16(ifd0Offset);
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = ifd0Offset + 2 + (i * 12);
            if (entryOffset + 12 > buf.length) break;
            const tag = read16(entryOffset);
            if (tag === 0x0112) { // Orientation tag
              return read16(entryOffset + 8);
            }
          }
        }
      }
    }
    offset += 2 + len;
  }
  return 1;
}

function optimizeBase64Image(imgStr, maxDim = 1280, quality = 85) {
  if (!imgStr || typeof imgStr !== 'string') return { mime: 'image/jpeg', b64: '', dataUri: '', orientation: 1 };

  let mime = 'image/jpeg';
  let b64Data = imgStr.trim();

  const m = b64Data.match(/^data:([^;]+);base64,(.+)$/s);
  if (m) {
    mime = m[1];
    b64Data = m[2];
  }

  try {
    const rawBuf = Buffer.from(b64Data, 'base64');
    const orientation = getExifOrientation(rawBuf);

    const proc = spawnSync('python3', [
      '-c',
      `import sys, io
try:
    from PIL import Image, ImageOps
    raw = sys.stdin.buffer.read()
    with Image.open(io.BytesIO(raw)) as img:
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        max_dim = ${parseInt(maxDim, 10)}
        w, h = img.size
        if w > max_dim or h > max_dim:
            if w > h:
                new_h = int(h * max_dim / w)
                new_w = max_dim
            else:
                new_w = int(w * max_dim / h)
                new_h = max_dim
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=${parseInt(quality, 10)}, optimize=True)
        sys.stdout.buffer.write(out.getvalue())
except Exception:
    sys.exit(1)
`
    ], { input: rawBuf, timeout: 5000 });

    if (proc.status === 0 && proc.stdout && proc.stdout.length > 0) {
      const outB64 = proc.stdout.toString('base64');
      return {
        mime: 'image/jpeg',
        b64: outB64,
        dataUri: `data:image/jpeg;base64,${outB64}`,
        orientation
      };
    }
  } catch (_) {}

  return {
    mime,
    b64: b64Data,
    dataUri: b64Data.startsWith('data:') ? b64Data : `data:${mime};base64,${b64Data}`,
    orientation: 1
  };
}

function getSafetyAssistantRulebase(question) {
  const q = (question || '').toLowerCase();
  if (/طفاية|طفايات|حريق|ضغط|خرطوم|extinguisher/.test(q)) {
    return "وفقاً لمعايير سباهي (CBAHI FMS.14) وكود الحريق السعودي (SBC 801) ومعيار NFPA 10:\n1. يجب فحص طفايات الحريق شهرياً والتأكد من وجود بطاقة التفتيش سارية المفعول.\n2. يجب أن يكون مؤشر مقياس الضغط في المنطقة الخضراء (100-175 psi).\n3. يجب توفر مسمار الأمان وسلك الختم البلاستيكي سليمين دون تلاعب.\n4. يجب تركيب الطفاية على حامل جداري بارتفاع لا يتجاوز 1.5م للطفايات التي يقل وزنها عن 18 كجم، وبقاء محيطها خالياً من أي عوائق بمسافة لا تقل عن 1 متر.";
  }
  if (/مخرج|مخارج|طوارئ|هروب|مسار|exit|evacuation/.test(q)) {
    return "وفقاً لمعايير سباهي (CBAHI FMS.12) وكود الحريق السعودي (SBC 801) ومعيار NFPA 101:\n1. يجب أن تظل جميع مخارج ومسارات الطوارئ خالية تماماً من أي عوائق أو مواد مخزنة على مدار الساعة.\n2. يجب أن تعمل لوحات مخارج الطوارئ المضيئة (Exit Signs) وإضاءة الطوارئ بكفاءة وتدعم بطارية احتياطية لمدة لا تقل عن 90 دقيقة.\n3. أبواب الطوارئ يجب أن تفتح للخارج باتجاه مسار الهروب ومزودة بمقابض هلوع (Panic Hardware) ولا يجوز قفلها أثناء تواجد الأشخاص بالمبنى.";
  }
  if (/كهرباء|توصيلة|توصيلات|قاطع|أسلاك|electrical/.test(q)) {
    return "وفقاً لمتطلبات CBAHI FMS ومعايير NFPA 70 والكود السعودي (SBC 401):\n1. يمنع منعاً باتاً استخدام التوصيلات الكهربائية المتعددة أو الأسلاك المكشوفة في المناطق الطبية والمستودعات.\n2. يجب الحفاظ على مسافة خلوص لا تقل عن 90 سم (36 بوصة) أمام جميع لوحات وقواطع الكهرباء.\n3. الأجهزة الطبية يجب أن توصل بمآخذ مطابقة لمعيار المستشفيات (Hospital Grade) مع تأريض وقائي معتمد.";
  }
  if (/كيميائ|مواد خطرة|تخزين|msds|chemical|hazmat/.test(q)) {
    return "وفقاً لمعايير سباهي (CBAHI FMS.8) ومتطلبات OSHA و NFPA 400:\n1. يجب توفير صحائف بيانات سلامة المواد (MSDS/SDS) باللغتين العربية والإنجليزية بالقرب من أماكن التخزين والاستخدام.\n2. تخزين المواد الكيميائية في خزائن مخصصة مقاومة للحريق ومزودة بتهوية مناسبة وحوض احتواء ثانوي (Secondary Containment).\n3. توفير محطات غسيل العيون ودش الطوارئ على مسافة لا تزيد عن 10 ثوانٍ من موقع الخطر، وفحصها أسبوعياً.";
  }
  if (/تدخين|دخان|سيجارة|smoke|smoking/.test(q)) {
    return "وفقاً لسياسة المدينة الطبية ونظام مكافحة التدخين بالمرسوم الملكي م/56 ومعايير CBAHI:\n1. يمنع التدخين منعاً باتاً بجميع أشكاله (التقليدي والإلكتروني) داخل كافة منشآت ومرافق وحرم المدينة الطبية.\n2. تحرير محضر ضبط مخالفة وإحالة المخالف للجنة المختصة وتطبيق الغرامة المقررة نظاماً (200 ريال للمرة الأولى).\n3. التأكد من سلامة كواشف الدخان في الغرف والممرات وعدم تغطيتها أو تعطيلها.";
  }
  return "معايير السلامة وإدارة المرافق المعتمدة بالمدينة الطبية بجامعة الملك سعود تشترط الامتثال الكامل لمتطلبات المركز السعودي لاعتماد المنشآت الصحية (CBAHI FMS)، وكود الحريق السعودي (SBC 801)، ومعايير الجمعية الوطنية للحماية من الحرائق (NFPA). يجب الالتزام ببيئة عمل خالية من المخاطر، والتدقيق الدوري على أنظمة الإنذار والإطفاء، وتأمين مسارات الإخلاء، والتبليغ الفوري عن أي ملاحظة عبر منصة رصد.";
}

function structureVoiceRulebase(transcript, formType = 'general') {
  const t = transcript || '';
  const tLower = t.toLowerCase();

  const detectedDevices = [];
  const deviceKeywords = {
    'غلاية': 'غلاية ماء كهربائية',
    'سخان': 'سخان كهربائي',
    'توصيلة': 'توصيلة كهربائية متعددة',
    'دفاية': 'دفاية كهربائية',
    'ميكروويف': 'جهاز ميكروويف',
    'شاحن': 'شاحن غير معتمد',
    'ثلاجة': 'ثلاجة صغيرة',
    'مكواة': 'مكواة كهربائية',
    'أسطوانة': 'أسطوانة غاز/أكسجين',
    'طفاية': 'طفاية حريق'
  };
  for (const [kw, label] of Object.entries(deviceKeywords)) {
    if (tLower.includes(kw)) detectedDevices.push(label);
  }

  const locationParts = [];
  const mBldg = t.match(/(مبنى\s+[^\s,،]+|مستشفى\s+[^\s,،]+|كلية\s+[^\s,،]+|البرج\s+[^\s,،]+)/);
  if (mBldg) locationParts.push(mBldg[1]);
  const mFloor = t.match(/(الدور\s+[^\s,،]+|الطابق\s+[^\s,،]+|القبو|الأرضي|الميزانين)/);
  if (mFloor) locationParts.push(mFloor[1]);
  const mDept = t.match(/(قسم\s+[^\s,،]+|جناح\s+[^\s,،]+|مستودع\s+[^\s,،]+|ممر\s+[^\s,،]+|طوارئ|عيادات)/);
  if (mDept) locationParts.push(mDept[1]);
  const locationStr = locationParts.length ? locationParts.join(' - ') : 'الموقع محدد في نص البلاغ';

  let roomStr = '';
  const mRoom = t.match(/(?:غرفة|مكتب|room)\s*([A-Za-z0-9\-]+)/i);
  if (mRoom) {
    roomStr = mRoom[1];
  } else {
    const mNum = t.match(/\b([A-Z]?\d{3,4}[A-Z]?)\b/);
    if (mNum) roomStr = mNum[1];
  }

  let riskLevel = 'متوسط';
  if (/حريق|دخان|حرج|التماس|أسلاك مكشوفة|خطر داهم|انفجار/.test(tLower)) {
    riskLevel = 'عالي';
  } else if (/إعاقة|مخرج|غاز|كيماوي/.test(tLower)) {
    riskLevel = 'عالي';
  } else if (/نظافة|ورق|ملاحظة بسيطة/.test(tLower)) {
    riskLevel = 'منخفض';
  }

  let violatorName = '';
  let violatorRole = '';
  let violatorDept = '';
  const mName = t.match(/(?:المخالف|المدعو|الموظف|الطالب)\s+([^\s,،]+(?:\s+[^\s,،]+){1,3})/);
  if (mName) violatorName = mName[1];
  if (tLower.includes('موظف')) violatorRole = 'موظف';
  else if (tLower.includes('طالب')) violatorRole = 'طالب';
  else if (tLower.includes('مراجع') || tLower.includes('زائر')) violatorRole = 'مراجع';
  else if (tLower.includes('شركة') || tLower.includes('مقاول')) violatorRole = 'عامل مقاول';

  const isSmoking = tLower.includes('تدخين') || formType === 'smoking';
  let formalDesc = '';
  let actionTaken = '';
  let suggestedAction = '';

  if (isSmoking) {
    formalDesc = `رصد مخالفة تدخين داخل منشآت المدينة الطبية بما يخالف نظام مكافحة التدخين ومعايير سباهي: ${t}`;
    actionTaken = 'تم ضبط الواقعة وإشعار المخالف بالتعليمات وتوثيق بيانات البلاغ';
    suggestedAction = 'تحرير غرامة تدخين وإحالة المحضر للإدارة المعنية لتطبيق اللائحة';
    riskLevel = 'متوسط';
  } else {
    const devText = detectedDevices.length ? ` وجود ${detectedDevices.join(' و ')}` : '';
    formalDesc = `رصد ملاحظة سلامة ميدانية تشمل${devText}، استناداً إلى البلاغ الصوتي: ${t}`;
    actionTaken = 'تمت المعاينة الميدانية الأولية وإشعار مسؤولي الموقع للبدء في المعالجة';
    suggestedAction = 'إزالة مسببات الخطر ومطابقة تجهيزات الموقع مع كود الحريق السعودي ومعايير CBAHI FMS';
  }

  return {
    detected_devices: detectedDevices.length ? detectedDevices : ['أجهزة أو ملاحظات واردة بالنص الصوتي'],
    other_device_desc: detectedDevices.length ? '' : t,
    location: locationStr,
    room: roomStr,
    action_taken: actionTaken,
    formal_description: formalDesc,
    suggested_corrective_action: suggestedAction,
    risk_level: riskLevel,
    violator_name: violatorName,
    violator_role: violatorRole,
    violator_dept: violatorDept
  };
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

async function callTextLlm(prompt, expectJson = false, fetchImpl = fetch) {
  for (const provider of CONFIG.priority) {
    try {
      if (provider === 'github_models' && CONFIG.githubKeys.length > 0) {
        const key = CONFIG.githubKeys[STATE.githubKeyIdx % CONFIG.githubKeys.length];
        STATE.githubKeyIdx = (STATE.githubKeyIdx + 1) % CONFIG.githubKeys.length;
        const res = await fetchImpl(CONFIG.githubBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: CONFIG.githubTextModel || 'openai/gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
          }),
          signal: AbortSignal.timeout(30000)
        });
        if (res.ok) {
          const json = await res.json();
          const txt = json.choices?.[0]?.message?.content || '';
          return [expectJson ? extractJsonObject(txt) : txt, `GitHub Models (${CONFIG.githubTextModel})`];
        }
      } else if (provider === 'qwen_api' && CONFIG.qwenKeys.length > 0) {
        const key = CONFIG.qwenKeys[STATE.qwenKeyIdx % CONFIG.qwenKeys.length];
        STATE.qwenKeyIdx = (STATE.qwenKeyIdx + 1) % CONFIG.qwenKeys.length;
        const res = await fetchImpl(CONFIG.qwenBaseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify({
            model: CONFIG.qwenTextModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
          }),
          signal: AbortSignal.timeout(30000)
        });
        if (res.ok) {
          const json = await res.json();
          const txt = json.choices?.[0]?.message?.content || '';
          return [expectJson ? extractJsonObject(txt) : txt, `Qwen (${CONFIG.qwenTextModel})`];
        }
      } else if (provider === 'ollama_local' && CONFIG.ollamaEnabled) {
        let installedModels = [];
        try {
          const tr = await fetchImpl(`${CONFIG.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2500) });
          if (tr.ok) {
            const tj = await tr.json();
            installedModels = (tj.models || []).map(m => m.name || '').filter(Boolean);
          }
        } catch (_) {}

        const candidateModels = [];
        if (CONFIG.ollamaTextModel) candidateModels.push(CONFIG.ollamaTextModel);
        if (CONFIG.ollamaVisionModel && !candidateModels.includes(CONFIG.ollamaVisionModel)) {
          candidateModels.push(CONFIG.ollamaVisionModel);
        }
        for (const im of installedModels) {
          if (im && !candidateModels.includes(im)) candidateModels.push(im);
        }

        let activeCandidates = candidateModels;
        if (installedModels.length > 0) {
          const actualInstalled = candidateModels.filter(m =>
            installedModels.includes(m) || installedModels.some(im => im.split(':')[0] === m.split(':')[0])
          );
          if (actualInstalled.length > 0) activeCandidates = actualInstalled;
        }

        for (const modelCandidate of activeCandidates) {
          try {
            const payload = {
              model: modelCandidate,
              messages: [{ role: 'user', content: prompt }],
              stream: false
            };
            if (expectJson) payload.format = 'json';
            const res = await fetchImpl(`${CONFIG.ollamaBaseUrl}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(45000)
            });
            if (res.ok) {
              const json = await res.json();
              const txt = json.message?.content || '';
              return [expectJson ? extractJsonObject(txt) : txt, `Oracle Local Ollama (${modelCandidate})`];
            } else if (res.status === 404) {
              continue;
            }
          } catch (_) {
            continue;
          }
        }
      } else if (provider === 'gemini_api' && CONFIG.geminiKeys.length > 0) {
        const key = CONFIG.geminiKeys[STATE.geminiKeyIdx % CONFIG.geminiKeys.length];
        STATE.geminiKeyIdx = (STATE.geminiKeyIdx + 1) % CONFIG.geminiKeys.length;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${key}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        if (expectJson) payload.generationConfig = { responseMimeType: 'application/json' };
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000)
        });
        if (res.ok) {
          const json = await res.json();
          const txt = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return [expectJson ? extractJsonObject(txt) : txt, `Gemini (${CONFIG.geminiModel})`];
        }
      }
    } catch (_) {}
  }
  throw new Error('لم ينجح أي مزود ذكاء اصطناعي في معالجة الطلب النصي');
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
      let ollamaModels = [];
      if (CONFIG.ollamaEnabled) {
        try {
          const r = await fetch(`${CONFIG.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
          if (r.ok) {
            ollamaOnline = true;
            const data = await r.json();
            ollamaModels = (data.models || []).map(m => m.name || '').filter(Boolean);
          }
        } catch (_) {}
      }

      const textModelInstalled = ollamaModels.some(m =>
        CONFIG.ollamaTextModel === m || CONFIG.ollamaTextModel.split(':')[0] === m.split(':')[0]
      );
      const visionModelInstalled = ollamaModels.some(m =>
        CONFIG.ollamaVisionModel === m || CONFIG.ollamaVisionModel.split(':')[0] === m.split(':')[0]
      );

      let activeTextModel = 'rulebase (KSUMC Safety Knowledge Engine)';
      if (CONFIG.githubKeys.length > 0) {
        activeTextModel = `github_models (${CONFIG.githubTextModel})`;
      } else if (CONFIG.qwenKeys.length > 0) {
        activeTextModel = `qwen_api (${CONFIG.qwenTextModel})`;
      } else if (textModelInstalled) {
        activeTextModel = `ollama_local (${CONFIG.ollamaTextModel})`;
      } else if (visionModelInstalled) {
        activeTextModel = `ollama_local (${CONFIG.ollamaVisionModel}) [vision-fallback]`;
      } else if (ollamaModels.length > 0) {
        activeTextModel = `ollama_local (${ollamaModels[0]}) [installed-fallback]`;
      } else if (CONFIG.geminiKeys.length > 0) {
        activeTextModel = `gemini_api (${CONFIG.geminiModel})`;
      }

      return sendJson(res, 200, {
        status: 'online',
        agent: 'KSUMC Oracle Vision Agent v2.1 (Node)',
        priority: CONFIG.priority,
        github_models_configured: CONFIG.githubKeys.length > 0,
        github_vision_model: CONFIG.githubVisionModel,
        github_text_model: CONFIG.githubTextModel,
        qwen_api_configured: CONFIG.qwenKeys.length > 0,
        qwen_vision_model: CONFIG.qwenVisionModel,
        qwen_text_model: CONFIG.qwenTextModel,
        ollama_online: ollamaOnline,
        ollama_vision_model: CONFIG.ollamaVisionModel,
        ollama_text_model: CONFIG.ollamaTextModel,
        ollama_installed_models: ollamaModels,
        gemini_keys_count: CONFIG.geminiKeys.length,
        diagnostics: {
          exif_transpose_supported: true,
          ollama_text_model_installed: textModelInstalled,
          ollama_vision_model_installed: visionModelInstalled,
          text_fallback_active: !textModelInstalled,
          active_text_model: activeTextModel,
          archive_vault_dir: CONFIG.archiveVaultDir,
          timestamp: new Date().toISOString()
        },
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
        const filtered = rawImages.filter(Boolean).slice(0, 5);
        if (!filtered.length) {
          return sendJson(res, 400, { detail: 'لم يتم إرفاق أي صورة للفحص' });
        }
        const images = filtered.map(img => {
          const opt = optimizeBase64Image(img);
          return opt.dataUri || img;
        });

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

    if (req.method === 'POST' && (urlPath.endsWith('/ai/ask-safety-assistant') || urlPath === '/ai/ask-safety-assistant')) {
      try {
        const body = await readJsonBody(req);
        const question = body.question || '';
        const prompt = `أنت المستشار والخبير الذكي للسلامة وإدارة المرافق بالمدينة الطبية بجامعة الملك سعود (KSUMC).
أجب عن استفسار السلامة التالي بدقة بالاعتماد على معايير سباهي (CBAHI FMS) وكود الحريق السعودي (SBC 801) ومعايير NFPA:
"${question}"`;
        try {
          const [answer, source] = await callTextLlm(prompt, false);
          return sendJson(res, 200, { success: true, answer, source });
        } catch (llmErr) {
          const fallbackAnswer = getSafetyAssistantRulebase(question);
          return sendJson(res, 200, {
            success: true,
            answer: fallbackAnswer,
            source: 'KSUMC Safety Rulebase',
            notice: llmErr.message
          });
        }
      } catch (e) {
        return sendJson(res, 400, { detail: e.message });
      }
    }

    if (req.method === 'POST' && (urlPath.endsWith('/ai/structure-voice-record') || urlPath === '/ai/structure-voice-record')) {
      try {
        const body = await readJsonBody(req);
        const transcript = body.transcript || '';
        const formType = body.form_type || 'general';
        const prompt = `أنت مساعد ذكي للأمن والسلامة بالمدينة الطبية بجامعة الملك سعود.
المطلوب: تفكيك وتحويل النص الصوتي التالي إلى حقول منظمة لبلاغ (${formType}):
"${transcript}"

أجب بكائن JSON صالح فقط:
{
  "detected_devices": ["غلاية", "سخان", "توصيلة"],
  "other_device_desc": "وصف أي جهاز إضافي إن وجد",
  "location": "الموقع أو المبنى أو الدور",
  "room": "رقم الغرفة إن وجد",
  "action_taken": "تم إشعار القسم / تم حجز الجهاز / جاري المتابعة",
  "formal_description": "صياغة رسمية هندسية للمخالفة",
  "suggested_corrective_action": "الإجراء التصحيحي المقترح",
  "risk_level": "متوسط أو عالي أو منخفض",
  "violator_name": "اسم المخالف إن كان مخالفة تدخين",
  "violator_role": "موظف أو مراجع أو طالب",
  "violator_dept": "القسم"
}`;
        try {
          const [parsed, source] = await callTextLlm(prompt, true);
          return sendJson(res, 200, { success: true, data: parsed, source });
        } catch (llmErr) {
          const fallbackData = structureVoiceRulebase(transcript, formType);
          return sendJson(res, 200, {
            success: true,
            data: fallbackData,
            source: 'KSUMC Safety Voice Rulebase (Fallback)',
            notice: llmErr.message
          });
        }
      } catch (e) {
        return sendJson(res, 400, { detail: e.message });
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
  callTextLlm,
  optimizeBase64Image,
  getExifOrientation,
  getSafetyAssistantRulebase,
  structureVoiceRulebase,
  sanitizeArchiveCardId,
  saveArchiveBundle,
  loadArchiveMedia,
  CONFIG,
  STATE,
  buildVisionPrompt,
  sanitizeVisionOutput,
  resolveSubmode
};

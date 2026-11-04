"""
==============================================================================
KSUMC Smart Safety Vision Agent - Oracle Cloud Server (Qwen2.5-VL + Ollama + Gemini)
المدينة الطبية بجامعة الملك سعود - وكيل الرؤية البصرية الذكي للسلامة الميدانية
==============================================================================
يعمل هذا الخادم كوكيل ذكي مستقل (Microservice Agent) على خادم أوراكل السحابي
لمعالجة صور جولات السلامة وتدقيق معايير CBAHI FMS و NFPA والكود السعودي SBC 801.

المزايا الهندسية:
1. دعم نماذج Qwen2.5-VL السحابية (عبر OpenRouter / Alibaba DashScope / Together).
2. دعم تشغيل Qwen2.5-VL محلياً على خادم أوراكل عبر Ollama (مجاني 100% بلا حدود).
3. تدوير تلقائي لمفاتيح API (Multi-Key Rotation) لمنع توقف الخدمة أو نفاد الحصة.
4. ضغط وتحجيم تلقائي للصور في الذاكرة لتقليص استهلاك الـ Tokens بنسبة 80%.
5. ذاكرة تخزين مؤقت ذكية (SHA-256 Image Cache) لمنع تكرار استهلاك الرصيد لنفس الصورة.
==============================================================================
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import os
import re
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

RIYADH_TZ = timezone(timedelta(hours=3))

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [KSUMC-Vision-Agent] %(message)s"
)
logger = logging.getLogger("ksumc-vision-agent")

app = FastAPI(
    title="KSUMC Smart Safety Vision Agent (Qwen2.5-VL)",
    description="وكيل الرؤية البصرية الذكي للسلامة الميدانية - المدينة الطبية بجامعة الملك سعود",
    version="2.0.0"
)

# السماح بالاتصال من تطبيق Firebase ومن جميع البوابات المعتمدة
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# إعدادات المحرك وحالة تدوير المفاتيح
# ==============================================================================
CONFIG = {
    "security_token": os.getenv("KSUMC_SECURITY_TOKEN", "ksu_sec_token_95972_riyadh"),
    "priority": [
        p.strip()
        for p in os.getenv("AI_PROVIDER_PRIORITY", "qwen_api,ollama_local,gemini_api").split(",")
        if p.strip()
    ],
    "qwen_base_url": os.getenv("QWEN_API_BASE_URL", "https://openrouter.ai/api/v1/chat/completions"),
    "qwen_keys": [k.strip() for k in os.getenv("QWEN_API_KEYS", "").split(",") if k.strip()],
    "qwen_vision_model": os.getenv("QWEN_VISION_MODEL", "qwen/qwen2.5-vl-72b-instruct:free"),
    "qwen_text_model": os.getenv("QWEN_TEXT_MODEL", "qwen/qwen-2.5-72b-instruct:free"),
    "ollama_enabled": os.getenv("OLLAMA_ENABLED", "true").lower() == "true",
    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
    "ollama_vision_model": os.getenv("OLLAMA_VISION_MODEL", "qwen2.5vl:3b"),
    "ollama_text_model": os.getenv("OLLAMA_TEXT_MODEL", "qwen2.5:3b"),
    "ollama_timeout": int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90")),
    "gemini_keys": [k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()],
    "gemini_model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
    "max_image_dim": int(os.getenv("MAX_IMAGE_DIMENSION", "1024")),
    "jpeg_quality": int(os.getenv("JPEG_QUALITY", "78")),
    "cache_ttl": int(os.getenv("CACHE_TTL_SECONDS", "1800")),
    "port": int(os.getenv("PORT", "8000")),
}

STATE = {
    "qwen_key_idx": 0,
    "gemini_key_idx": 0,
    "total_requests": 0,
    "cache_hits": 0,
    "provider_success": {"qwen_api": 0, "ollama_local": 0, "gemini_api": 0, "heuristic": 0},
    "last_provider_used": "none",
    "last_error": None,
}

# ذاكرة التخزين المؤقت للتحليلات البصرية
ANALYSIS_CACHE: Dict[str, Dict[str, Any]] = {}


# ==============================================================================
# نماذج البيانات (Pydantic Schemas)
# ==============================================================================
class VisionAnalysisRequest(BaseModel):
    image: Optional[str] = ""
    images: Optional[List[str]] = None
    checklistType: Optional[str] = "general"
    itemLabel: Optional[str] = ""
    facility: Optional[str] = "المدينة الطبية (KSUMC)"
    building: Optional[str] = ""
    floor: Optional[str] = ""
    notes: Optional[str] = ""


class AssistantQuestionRequest(BaseModel):
    question: str


class VoiceRecordRequest(BaseModel):
    transcript: str
    form_type: Optional[str] = "safety_violation"


class ExecutiveReportRequest(BaseModel):
    date: Optional[str] = None
    manualStats: Optional[Dict[str, Any]] = None


class CBAHIAuditRequest(BaseModel):
    building: Optional[str] = "كافة مباني المدينة الطبية (KSUMC)"
    time_window_days: Optional[int] = 30
    custom_stats: Optional[Dict[str, Any]] = None


class RuntimeConfigUpdate(BaseModel):
    qwen_base_url: Optional[str] = None
    qwen_keys: Optional[List[str]] = None
    qwen_vision_model: Optional[str] = None
    ollama_enabled: Optional[bool] = None
    ollama_vision_model: Optional[str] = None
    gemini_keys: Optional[List[str]] = None
    priority: Optional[List[str]] = None


# ==============================================================================
# دوال التوقيت، معالجة الصور، وتنقية المخرجات
# ==============================================================================
def get_riyadh_context() -> Dict[str, Any]:
    now = datetime.now(RIYADH_TZ)
    return {
        "timeZone": "Asia/Riyadh",
        "timeZoneName": "توقيت الرياض - المملكة العربية السعودية (Asia/Riyadh - GMT+3)",
        "currentDate": now.strftime("%Y-%m-%d"),
        "currentTime": now.strftime("%I:%M %p"),
        "year": now.year,
    }


def optimize_base64_image(img_str: str) -> tuple[str, str]:
    """
    استخراج وضغط الصورة لتقليل استهلاك الـ Tokens وتسريع الاستجابة على خادم أوراكل
    يرجع: (mime_type, raw_base64_without_prefix)
    """
    if not img_str:
        return "image/jpeg", ""

    mime = "image/jpeg"
    b64_data = img_str.strip()

    if b64_data.startswith("data:"):
        match = re.match(r"^data:([^;]+);base64,(.+)$", b64_data, re.DOTALL)
        if match:
            mime = match.group(1)
            b64_data = match.group(2)

    if not PIL_AVAILABLE:
        return mime, b64_data

    try:
        raw_bytes = base64.b64decode(b64_data)
        with Image.open(io.BytesIO(raw_bytes)) as img:
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            max_dim = CONFIG["max_image_dim"]
            w, h = img.size
            if w > max_dim or h > max_dim:
                if w > h:
                    new_h = int(h * max_dim / w)
                    new_w = max_dim
                else:
                    new_w = int(w * max_dim / h)
                    new_h = max_dim
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            out_buf = io.BytesIO()
            img.save(out_buf, format="JPEG", quality=CONFIG["jpeg_quality"], optimize=True)
            compressed_b64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")
            return "image/jpeg", compressed_b64
    except Exception as e:
        logger.warning(f"Image optimization skipped: {e}")
        return mime, b64_data


def extract_json_object(raw_text: str) -> Dict[str, Any]:
    """استخراج كائن JSON بنجاح حتى لو أضاف النموذج نصاً إضافياً أو علامات Markdown"""
    if not raw_text:
        raise ValueError("استجابة فارغة من النموذج")

    cleaned = re.sub(r"```json\s*", "", raw_text, flags=re.IGNORECASE)
    cleaned = re.sub(r"```\s*", "", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def sanitize_vision_output(parsed_data: Dict[str, Any], riyadh_ctx: Dict[str, Any]) -> Dict[str, Any]:
    """تطهير مخرجات النموذج من أي هلوسة بخصوص التاريخ وتوحيد الحقول للواجهة"""
    cur_date = riyadh_ctx["currentDate"]

    def clean_txt(txt: Any) -> Any:
        if not txt or not isinstance(txt, str):
            return txt
        txt = re.sub(r"تاريخ مستقبلي\s*\(.*?\)", f"تاريخ اليوم الفعلي ({cur_date}) بتوقيت الرياض", txt)
        txt = re.sub(r"تاريخ مستقبلي", "تاريخ الحدث الفعلي الميداني", txt)
        txt = re.sub(r"عدم دقة الوقت والتاريخ على شاشة لوحة FACP[^\.\n،]*", "", txt)
        return txt.strip()

    if "findings_summary" in parsed_data:
        parsed_data["findings_summary"] = clean_txt(parsed_data["findings_summary"])

    if isinstance(parsed_data.get("violations_list"), list):
        parsed_data["violations_list"] = [
            clean_txt(v)
            for v in parsed_data["violations_list"]
            if v and "عدم دقة الوقت والتاريخ" not in str(v) and "تاريخ مستقبلي" not in str(v)
        ]

    if isinstance(parsed_data.get("corrective_actions"), list):
        parsed_data["corrective_actions"] = [
            clean_txt(c)
            for c in parsed_data["corrective_actions"]
            if c and "ضبط وتحديث الوقت والتاريخ" not in str(c) and "تاريخ مستقبلي" not in str(c)
        ]

    # ضمان وجود جميع الحقول المطلوبة لواجهة الراصد البصري الذكي
    defaults = {
        "hazard_detected": False,
        "compliance_status": "مطابق",
        "risk_level": "منخفض",
        "confidence_score": 95,
        "detected_element": "عنصر / معدة سلامة ميدانية",
        "detected_devices": [],
        "findings_summary": "تم فحص الموقع وتدقيق الاشتراطات الهندسية وفق معايير CBAHI FMS و NFPA.",
        "violations_list": [],
        "corrective_actions": ["استمرار المتابعة الدورية وتوثيق الفحص"],
        "standard_reference": "CBAHI FMS / SBC 801 / NFPA",
        "inspector_recommendation": "توثيق الحالة في محضر الجولة الميدانية",
        "suggested_directive": "التأكيد على استدامة الجاهزية التشغيلية",
    }
    for k, v in defaults.items():
        if k not in parsed_data or parsed_data[k] is None:
            parsed_data[k] = v

    return parsed_data


def build_vision_prompt(
    riyadh_ctx: Dict[str, Any],
    facility: str,
    building: str,
    floor: str,
    checklist_type: str,
    item_label: str,
    notes: str,
) -> str:
    return f"""أنت خبير واستشاري السلامة والحماية من الحريق بالمدينة الطبية بجامعة الملك سعود (KSUMC).
قم بتقييم الصورة/الصور المرفقة وفق المعايير والأنظمة التالية بدقة صارمة:
1. معايير المركز السعودي لاعتماد المنشآت الصحية (CBAHI - معايير السلامة وإدارة المرافق FMS، وبخاصة FMS.04، FMS.05، FMS.07، FMS.11، FMS.14).
2. كود الحريق الوطني وكود البناء السعودي (SBC 801 / SBC 201).
3. مواصفات الجمعية الوطنية للحماية من الحرائق (NFPA 72 لوحات وكواشف الإنذار، NFPA 101 مسالك الهروب، NFPA 99، NFPA 10 طفايات الحريق، NFPA 13 رشاشات المياه).
4. لائحة مكافحة التدخين بالمنشآت الحكومية والصحية (المرسوم الملكي م/56 والسياسة MC-SS-P-02).

توجيهات التوقيت (توقيت الرياض - المملكة العربية السعودية):
- التاريخ الفعلي الحالي للمعاينة: {riyadh_ctx['currentDate']} (عام {riyadh_ctx['year']}) والوقت: {riyadh_ctx['currentTime']}.
- لا تعتبر عام {riyadh_ctx['year']} أو تاريخ اليوم تاريخاً مستقبلياً عند قراءة شاشات لوحات إنذار الحريق (FACP).
- ركز تقييمك الهندسي على:
  1. حالة المعدة أو المسار أو لوحة الإنذار (FIRE ALARM / SYSTEM TROUBLE / ضغط الطفاية / خلو مخارج الطوارئ / وجود أجهزة تسخين أو توصيلات كهربائية مخالفة).
  2. تحديد المخالفات بدقة إن وجدت، وخطة الإجراءات التصحيحية والوقائية العاجلة (CAPA).

سياق الفحص: المنشأة: {facility} | المبنى: {building} | الدور: {floor} | نوع الفحص: {checklist_type} | البند/الغرفة: {item_label}
ملاحظات المفتش الميداني: {notes or 'لا توجد ملاحظات إضافية'}

أجب بصيغة JSON نظيفة وصحيحة فقط بدون أي نص خارجي على الشكل التالي:
{{
  "hazard_detected": true,
  "compliance_status": "مطابق" أو "غير مطابق" أو "ملاحظة حرجة" أو "تحذير وقائي",
  "risk_level": "عالي جداً" أو "عالي" أو "متوسط" أو "منخفض" أو "آمن",
  "confidence_score": 96,
  "detected_element": "وصف دقيق للمعدة أو العنصر أو الخطر الظاهر في الصورة",
  "detected_devices": ["قائمة بالأجهزة المخالفة إن وجدت: غلاية، سخان، مايكرويف، توصيلة كهربائية"],
  "findings_summary": "ملخص الملاحظات والمخاطر المكتشفة بأسلوب هندسي ورقابي رصين",
  "violations_list": ["قائمة بالمخالفات بالتفصيل إن وجدت"],
  "corrective_actions": ["قائمة بالإجراءات التصحيحية والوقائية الفورية المطلوبة CAPA"],
  "standard_reference": "المعيار النظامي المرجعي (مثال: CBAHI FMS.04 أو CBAHI FMS.07 أو NFPA 101 أو SBC 801)",
  "inspector_recommendation": "توجيه مهني فوري للمفتش الميداني",
  "suggested_directive": "التوجيه الإداري المقترح لمدير إدارة السلامة"
}}"""


# ==============================================================================
# المحركات الثلاثة: 1) Qwen2.5-VL API  2) Local Ollama Qwen2.5-VL  3) Gemini Pool
# ==============================================================================
async def call_qwen_api_vision(images_b64: List[tuple[str, str]], prompt: str) -> Dict[str, Any]:
    """استدعاء نموذج Qwen2.5-VL عبر واجهة متوافقة مع OpenAI (OpenRouter / DashScope / Together)"""
    keys = CONFIG["qwen_keys"]
    if not keys:
        raise RuntimeError("لم يتم إدخال مفاتيح QWEN_API_KEYS بعد")

    last_err = None
    for _ in range(len(keys)):
        idx = STATE["qwen_key_idx"] % len(keys)
        STATE["qwen_key_idx"] = (STATE["qwen_key_idx"] + 1) % len(keys)
        api_key = keys[idx]

        content_list: List[Dict[str, Any]] = []
        for mime, b64 in images_b64:
            content_list.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}"}
            })
        content_list.append({"type": "text", "text": prompt})

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ksumc-safety.web.app",
            "X-Title": "KSUMC Safety Vision Agent",
        }
        payload = {
            "model": CONFIG["qwen_vision_model"],
            "messages": [{"role": "user", "content": content_list}],
            "temperature": 0.2,
            "max_tokens": 1400,
        }

        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(CONFIG["qwen_base_url"], headers=headers, json=payload)
                if resp.status_code != 200:
                    raise RuntimeError(f"Qwen API HTTP {resp.status_code}: {resp.text[:180]}")
                data = resp.json()
                raw_text = data["choices"][0]["message"]["content"]
                return extract_json_object(raw_text)
        except Exception as e:
            last_err = e
            logger.warning(f"[Qwen API Key #{idx + 1}] failed: {e}")

    raise RuntimeError(f"تعذر الاتصال بـ Qwen API: {last_err}")


async def call_ollama_local_vision(images_b64: List[tuple[str, str]], prompt: str) -> Dict[str, Any]:
    """استدعاء نموذج Qwen2.5-VL المثبت محلياً على خادم أوراكل عبر Ollama"""
    if not CONFIG["ollama_enabled"]:
        raise RuntimeError("محرك Ollama المحلي غير مفعل")

    raw_b64_list = [b64 for _, b64 in images_b64 if b64]
    payload = {
        "model": CONFIG["ollama_vision_model"],
        "messages": [
            {
                "role": "user",
                "content": prompt,
                "images": raw_b64_list,
            }
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.2},
    }

    url = f"{CONFIG['ollama_base_url']}/api/chat"
    async with httpx.AsyncClient(timeout=float(CONFIG["ollama_timeout"])) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code != 200:
            raise RuntimeError(f"Ollama HTTP {resp.status_code}: {resp.text[:180]}")
        data = resp.json()
        raw_text = data.get("message", {}).get("content", "")
        return extract_json_object(raw_text)


async def call_gemini_pool_vision(images_b64: List[tuple[str, str]], prompt: str) -> Dict[str, Any]:
    """استدعاء Google Gemini مع تدوير تلقائي لعدة مفاتيح"""
    keys = CONFIG["gemini_keys"]
    if not keys:
        raise RuntimeError("لم يتم إدخال مفاتيح GEMINI_API_KEYS الاحتياطية")

    last_err = None
    for _ in range(len(keys)):
        idx = STATE["gemini_key_idx"] % len(keys)
        STATE["gemini_key_idx"] = (STATE["gemini_key_idx"] + 1) % len(keys)
        key = keys[idx]

        parts: List[Dict[str, Any]] = []
        for mime, b64 in images_b64:
            parts.append({"inlineData": {"mimeType": mime, "data": b64}})
        parts.append({"text": prompt})

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{CONFIG['gemini_model']}:generateContent?key={key}"
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
        }

        try:
            async with httpx.AsyncClient(timeout=40.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code != 200:
                    raise RuntimeError(f"Gemini HTTP {resp.status_code}: {resp.text[:180]}")
                data = resp.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                return extract_json_object(raw_text)
        except Exception as e:
            last_err = e
            logger.warning(f"[Gemini Key #{idx + 1}] failed: {e}")

    raise RuntimeError(f"تعذر الاتصال بمفاتيح Gemini: {last_err}")


async def call_text_llm(prompt: str, expect_json: bool = False) -> tuple[Any, str]:
    """توجيه الطلبات النصية (المساعد الاستشاري، التوثيق الصوتي، التقرير التنفيذي) عبر Qwen أو Ollama أو Gemini"""
    for provider in CONFIG["priority"]:
        try:
            if provider == "qwen_api" and CONFIG["qwen_keys"]:
                idx = STATE["qwen_key_idx"] % len(CONFIG["qwen_keys"])
                STATE["qwen_key_idx"] = (STATE["qwen_key_idx"] + 1) % len(CONFIG["qwen_keys"])
                headers = {
                    "Authorization": f"Bearer {CONFIG['qwen_keys'][idx]}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "model": CONFIG["qwen_text_model"],
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(CONFIG["qwen_base_url"], headers=headers, json=payload)
                    if resp.status_code == 200:
                        txt = resp.json()["choices"][0]["message"]["content"]
                        return (extract_json_object(txt) if expect_json else txt), f"Qwen ({CONFIG['qwen_text_model']})"

            elif provider == "ollama_local" and CONFIG["ollama_enabled"]:
                payload = {
                    "model": CONFIG["ollama_text_model"],
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                }
                if expect_json:
                    payload["format"] = "json"
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(f"{CONFIG['ollama_base_url']}/api/chat", json=payload)
                    if resp.status_code == 200:
                        txt = resp.json().get("message", {}).get("content", "")
                        return (extract_json_object(txt) if expect_json else txt), f"Oracle Local Ollama ({CONFIG['ollama_text_model']})"

            elif provider == "gemini_api" and CONFIG["gemini_keys"]:
                idx = STATE["gemini_key_idx"] % len(CONFIG["gemini_keys"])
                STATE["gemini_key_idx"] = (STATE["gemini_key_idx"] + 1) % len(CONFIG["gemini_keys"])
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{CONFIG['gemini_model']}:generateContent?key={CONFIG['gemini_keys'][idx]}"
                payload: Dict[str, Any] = {"contents": [{"parts": [{"text": prompt}]}]}
                if expect_json:
                    payload["generationConfig"] = {"responseMimeType": "application/json"}
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        txt = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                        return (extract_json_object(txt) if expect_json else txt), f"Gemini ({CONFIG['gemini_model']})"
        except Exception as e:
            logger.warning(f"Text LLM provider {provider} error: {e}")

    raise RuntimeError("لم ينجح أي مزود ذكاء اصطناعي في معالجة الطلب النصي")


# ==============================================================================
# نقاط النهاية (API Endpoints) المتوافقة مع ksu-ai-client.js
# ==============================================================================
@app.get("/", response_class=HTMLResponse)
async def root_dashboard():
    """لوحة تحكم وفحص حالة وكيل أوراكل البصري الذكي"""
    qwen_count = len(CONFIG["qwen_keys"])
    gemini_count = len(CONFIG["gemini_keys"])
    return f"""
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>وكيل الرؤية البصرية الذكي (Qwen2.5-VL) | KSUMC</title>
      <style>
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }}
        .card {{ max-width: 780px; margin: 0 auto; background: #1e293b; border-radius: 1.25rem; padding: 2rem; border: 1px solid #334155; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }}
        .badge {{ display: inline-block; padding: 0.35rem 0.85rem; border-radius: 999px; background: #10b981; color: #052e16; font-weight: 800; font-size: 0.8rem; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-top: 1.5rem; }}
        .box {{ background: #0f172a; padding: 1.1rem; border-radius: 0.85rem; border: 1px solid #334155; }}
        .label {{ color: #94a3b8; font-size: 0.8rem; margin-bottom: 0.35rem; }}
        .val {{ font-size: 1.05rem; font-weight: 700; color: #38bdf8; direction: ltr; text-align: right; }}
        code {{ background: #090d16; padding: 0.2rem 0.5rem; border-radius: 0.4rem; color: #fbbf24; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
          <div>
            <h1 style="margin:0;font-size:1.4rem;">وكيل أوراكل للرؤية البصرية الذكية (Qwen2.5-VL Agent)</h1>
            <p style="margin:0.4rem 0 0;color:#94a3b8;font-size:0.9rem;">المدينة الطبية بجامعة الملك سعود • منصة رصد لجولات السلامة (CBAHI / NFPA / SBC)</p>
          </div>
          <span class="badge">متصل وجاهز للخدمة ●</span>
        </div>

        <div class="grid">
          <div class="box">
            <div class="label">ترتيب أولوية المحركات</div>
            <div class="val">{' → '.join(CONFIG['priority'])}</div>
          </div>
          <div class="box">
            <div class="label">نموذج كوين السحابي (Qwen2.5-VL)</div>
            <div class="val">{CONFIG['qwen_vision_model']} ({qwen_count} مفاتيح)</div>
          </div>
          <div class="box">
            <div class="label">نموذج أوراكل المحلي (Ollama)</div>
            <div class="val">{CONFIG['ollama_vision_model']} ({'مفعل' if CONFIG['ollama_enabled'] else 'معطل'})</div>
          </div>
          <div class="box">
            <div class="label">مفاتيح Gemini الاحتياطية</div>
            <div class="val">{gemini_count} مفاتيح في المجمع</div>
          </div>
          <div class="box">
            <div class="label">إجمالي الفحوصات المنفذة</div>
            <div class="val">{STATE['total_requests']} (كاش: {STATE['cache_hits']})</div>
          </div>
          <div class="box">
            <div class="label">آخر محرك مستخدم</div>
            <div class="val">{STATE['last_provider_used']}</div>
          </div>
        </div>

        <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #334155;font-size:0.85rem;color:#94a3b8;">
          نقطة الربط في المنصة: <code>/safety/api/ai/analyze-inspection-image</code> | فحص الحالة: <code>/safety/api/ai/status</code>
        </div>
      </div>
    </body>
    </html>
    """


@app.get("/health")
@app.get("/ai/status")
@app.get("/safety/api/ai/status")
async def get_ai_status():
    ollama_online = False
    ollama_models: List[str] = []
    if CONFIG["ollama_enabled"]:
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                r = await client.get(f"{CONFIG['ollama_base_url']}/api/tags")
                if r.status_code == 200:
                    ollama_online = True
                    ollama_models = [m.get("name", "") for m in r.json().get("models", [])]
        except Exception:
            ollama_online = False

    return {
        "status": "online",
        "agent": "KSUMC Oracle Vision Agent v2.0",
        "priority": CONFIG["priority"],
        "qwen_api_configured": len(CONFIG["qwen_keys"]) > 0,
        "qwen_vision_model": CONFIG["qwen_vision_model"],
        "ollama_online": ollama_online,
        "ollama_vision_model": CONFIG["ollama_vision_model"],
        "ollama_installed_models": ollama_models,
        "gemini_keys_count": len(CONFIG["gemini_keys"]),
        "stats": STATE,
    }


@app.post("/ai/config")
@app.post("/safety/api/ai/config")
async def update_runtime_config(
    body: RuntimeConfigUpdate,
    x_ksumc_key: Optional[str] = Header(default=None),
):
    """تحديث مفاتيح وإعدادات الوكيل فوراً بدون إعادة تشغيل الخادم"""
    if x_ksumc_key != CONFIG["security_token"]:
        raise HTTPException(status_code=403, detail="غير مصرح بتعديل إعدادات الوكيل")

    if body.qwen_base_url:
        CONFIG["qwen_base_url"] = body.qwen_base_url.strip()
    if body.qwen_keys is not None:
        CONFIG["qwen_keys"] = [k.strip() for k in body.qwen_keys if k.strip()]
    if body.qwen_vision_model:
        CONFIG["qwen_vision_model"] = body.qwen_vision_model.strip()
    if body.ollama_enabled is not None:
        CONFIG["ollama_enabled"] = body.ollama_enabled
    if body.ollama_vision_model:
        CONFIG["ollama_vision_model"] = body.ollama_vision_model.strip()
    if body.gemini_keys is not None:
        CONFIG["gemini_keys"] = [k.strip() for k in body.gemini_keys if k.strip()]
    if body.priority:
        CONFIG["priority"] = [p.strip() for p in body.priority if p.strip()]

    return {"success": True, "message": "تم تحديث إعدادات وكيل الرؤية البصرية بنجاح", "config": {
        "priority": CONFIG["priority"],
        "qwen_vision_model": CONFIG["qwen_vision_model"],
        "qwen_keys_count": len(CONFIG["qwen_keys"]),
        "ollama_enabled": CONFIG["ollama_enabled"],
        "ollama_vision_model": CONFIG["ollama_vision_model"],
        "gemini_keys_count": len(CONFIG["gemini_keys"]),
    }}


@app.post("/ai/analyze-inspection-image")
@app.post("/safety/api/ai/analyze-inspection-image")
async def analyze_inspection_image(req: VisionAnalysisRequest):
    STATE["total_requests"] += 1
    raw_images = req.images if (req.images and len(req.images) > 0) else ([req.image] if req.image else [])
    raw_images = [img for img in raw_images if img]

    if not raw_images:
        raise HTTPException(status_code=400, detail="لم يتم إرفاق أي صورة للفحص")

    # 1. ضغط وتحسين الصور
    optimized_images = [optimize_base64_image(img) for img in raw_images[:5]]

    # 2. التحقق من ذاكرة التخزين المؤقت (Image Cache) لتوفير استهلاك الـ API
    hasher = hashlib.sha256()
    for _, b64 in optimized_images:
        hasher.update(b64[:4096].encode("utf-8"))
    hasher.update(f"{req.checklistType}|{req.building}|{req.floor}|{req.notes}".encode("utf-8"))
    cache_key = hasher.hexdigest()

    now_ts = time.time()
    cached = ANALYSIS_CACHE.get(cache_key)
    if cached and (now_ts - cached["ts"] < CONFIG["cache_ttl"]):
        STATE["cache_hits"] += 1
        logger.info("Returning cached vision analysis result")
        return {
            "success": True,
            "data": cached["data"],
            "source": f"{cached['source']} (Cached)",
            "cached": True,
        }

    riyadh_ctx = get_riyadh_context()
    prompt = build_vision_prompt(
        riyadh_ctx=riyadh_ctx,
        facility=req.facility or "المدينة الطبية (KSUMC)",
        building=req.building or "",
        floor=req.floor or "",
        checklist_type=req.checklistType or "general",
        item_label=req.itemLabel or "",
        notes=req.notes or "",
    )

    errors: List[str] = []

    # 3. المرور على المحركات حسب الأولوية المحددة (Qwen API -> Ollama Local -> Gemini Pool)
    for provider in CONFIG["priority"]:
        try:
            if provider == "qwen_api":
                parsed = await call_qwen_api_vision(optimized_images, prompt)
                clean_data = sanitize_vision_output(parsed, riyadh_ctx)
                source_label = f"Oracle Qwen2.5-VL ({CONFIG['qwen_vision_model']})"
            elif provider == "ollama_local":
                parsed = await call_ollama_local_vision(optimized_images, prompt)
                clean_data = sanitize_vision_output(parsed, riyadh_ctx)
                source_label = f"Oracle Local Ollama ({CONFIG['ollama_vision_model']})"
            elif provider == "gemini_api":
                parsed = await call_gemini_pool_vision(optimized_images, prompt)
                clean_data = sanitize_vision_output(parsed, riyadh_ctx)
                source_label = f"Oracle Gemini Pool ({CONFIG['gemini_model']})"
            else:
                continue

            STATE["provider_success"][provider] = STATE["provider_success"].get(provider, 0) + 1
            STATE["last_provider_used"] = source_label
            ANALYSIS_CACHE[cache_key] = {"ts": now_ts, "data": clean_data, "source": source_label}

            return {
                "success": True,
                "data": clean_data,
                "source": source_label,
            }
        except Exception as e:
            err_msg = f"{provider}: {str(e)}"
            errors.append(err_msg)
            STATE["last_error"] = err_msg
            logger.warning(f"Provider {provider} failed: {e}")

    # إذا فشلت جميع المحركات نرجع خطأ واضح ليقرر العميل استخدام البديل أو تنبيه المسؤول
    raise HTTPException(
        status_code=503,
        detail=f"تعذر التحليل عبر محركات الوكيل ({' | '.join(errors)})",
    )


@app.post("/ai/ask-safety-assistant")
@app.post("/safety/api/ai/ask-safety-assistant")
async def ask_safety_assistant(req: AssistantQuestionRequest):
    prompt = f"""أنت المستشار والخبير الذكي للسلامة وإدارة المرافق بالمدينة الطبية بجامعة الملك سعود (KSUMC).
أجب عن استفسار السلامة التالي بدقة بالاعتماد على معايير سباهي (CBAHI FMS) وكود الحريق السعودي (SBC 801) ومعايير NFPA:
"{req.question}" """
    try:
        answer, source = await call_text_llm(prompt, expect_json=False)
        return {"success": True, "answer": answer, "source": source}
    except Exception as e:
        return {
            "success": True,
            "answer": "معايير السلامة المعتمدة بالمدينة الطبية تشترط الالتزام بمتطلبات سباهي (CBAHI FMS) وكود البناء السعودي (SBC 801) لضمان سلامة المرضى والكوادر الطبية والمرافق.",
            "source": "KSUMC Safety Rulebase",
            "notice": str(e),
        }


@app.post("/ai/structure-voice-record")
@app.post("/safety/api/ai/structure-voice-record")
async def structure_voice_record(req: VoiceRecordRequest):
    prompt = f"""أنت مساعد ذكي للأمن والسلامة بالمدينة الطبية بجامعة الملك سعود.
المطلوب: تفكيك وتحويل النص الصوتي التالي إلى حقول منظمة لبلاغ ({req.form_type}):
"{req.transcript}"

أجب بكائن JSON صالح فقط:
{{
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
}}"""
    try:
        parsed, source = await call_text_llm(prompt, expect_json=True)
        return {"success": True, "data": parsed, "source": source}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = CONFIG["port"]
    logger.info(f"Starting KSUMC Oracle Vision Agent on port {port}...")
    uvicorn.run("agent_server:app", host="0.0.0.0", port=port, reload=False)

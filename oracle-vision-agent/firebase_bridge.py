"""
==============================================================================
KSUMC Smart Safety Vision Agent - Firebase Realtime Bridge Worker
المدينة الطبية بجامعة الملك سعود - جسر الفايربيس اللحظي لتمرير الطلبات عبر web.app
==============================================================================
"""

import asyncio
import logging
import os
import time
from typing import Any, Dict

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [Firebase-Bridge] %(message)s"
)
logger = logging.getLogger("firebase-bridge")

FIREBASE_RTDB_URL = os.getenv("FIREBASE_RTDB_URL", "https://rsd-ksu-default-rtdb.firebaseio.com").rstrip("/")
QUEUE_URL = f"{FIREBASE_RTDB_URL}/ai_queue.json"
LOCAL_AGENT_URL = os.getenv("LOCAL_AGENT_URL", "http://127.0.0.1:8000/safety/api/ai")
SECURITY_TOKEN = os.getenv("KSUMC_SECURITY_TOKEN", "ksu_sec_token_95972_riyadh")


async def process_task(client: httpx.AsyncClient, task_id: str, task_data: Dict[str, Any]):
    logger.info(f"--> استلام طلب جديد: {task_id} (نوع العملية: {task_data.get('action')})")
    
    # 1. تحديث حالة الطلب إلى جارٍ المعالجة
    try:
        await client.patch(
            f"{FIREBASE_RTDB_URL}/ai_queue/{task_id}.json",
            json={"status": "processing", "startedAt": int(time.time() * 1000)}
        )
    except Exception as e:
        logger.warning(f"تعذر تحديث حالة الطلب {task_id} إلى processing: {e}")

    action = task_data.get("action", "analyze-inspection-image")
    payload = task_data.get("payload", {})
    endpoint = f"{LOCAL_AGENT_URL}/{action}"

    try:
        # 2. إرسال الطلب إلى وكيل أوراكل المحلي على المنفذ 8000
        res = await client.post(
            endpoint,
            json=payload,
            headers={
                "x-ksumc-token": SECURITY_TOKEN,
                "Content-Type": "application/json"
            },
            timeout=240.0
        )
        
        if res.status_code == 200:
            result_json = res.json()
            await client.patch(
                f"{FIREBASE_RTDB_URL}/ai_queue/{task_id}.json",
                json={
                    "status": "completed",
                    "result": result_json,
                    "completedAt": int(time.time() * 1000)
                }
            )
            logger.info(f"✅ تم إنجاز الطلب {task_id} بنجاح وإعادة النتيجة إلى Firebase.")
        else:
            err_msg = res.text
            await client.patch(
                f"{FIREBASE_RTDB_URL}/ai_queue/{task_id}.json",
                json={
                    "status": "failed",
                    "error": f"Agent returned HTTP {res.status_code}: {err_msg}",
                    "failedAt": int(time.time() * 1000)
                }
            )
            logger.warning(f"❌ فشل معالجة الطلب {task_id}: رمز الحالة {res.status_code}")
    except Exception as e:
        logger.error(f"❌ خطأ غير متوقع أثناء معالجة {task_id}: {e}")
        try:
            await client.patch(
                f"{FIREBASE_RTDB_URL}/ai_queue/{task_id}.json",
                json={
                    "status": "failed",
                    "error": str(e),
                    "failedAt": int(time.time() * 1000)
                }
            )
        except Exception:
            pass


async def run_worker():
    logger.info("==================================================================")
    logger.info("   بدء تشغيل جسر Firebase اللحظي - المدينة الطبية KSUMC")
    logger.info(f"   مستودع الطلبات: {QUEUE_URL}")
    logger.info(f"   الوكيل المحلي:  {LOCAL_AGENT_URL}")
    logger.info("==================================================================")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            tasks = None
            try:
                res = await client.get(QUEUE_URL)
                if res.status_code == 200:
                    tasks = res.json()
                    if isinstance(tasks, dict):
                        for task_id, task_data in list(tasks.items()):
                            if isinstance(task_data, dict) and task_data.get("status") == "pending":
                                await process_task(client, task_id, task_data)

                # تنظيف تلقائي للطلبات المكتملة أو التالفة بعد مرور 3 دقائق
                now = int(time.time() * 1000)
                if isinstance(tasks, dict):
                    for task_id, task_data in list(tasks.items()):
                        if isinstance(task_data, dict):
                            created_at = task_data.get("createdAt", 0)
                            status = task_data.get("status")
                            if status in ["completed", "failed"] and (now - created_at) > 180000:
                                await client.delete(f"{FIREBASE_RTDB_URL}/ai_queue/{task_id}.json")
            except Exception as e:
                logger.error(f"تنبيه دوري في الجسر: {e}")

            await asyncio.sleep(1.0)


if __name__ == "__main__":
    asyncio.run(run_worker())

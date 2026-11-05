#!/usr/bin/env bash
# ==============================================================================
# KSUMC Smart Safety Vision Agent - Oracle Server Dedicated Optimizer
# سكربت تنظيف الخادم وإيقاف المنصة القديمة وتخصيص 100% من موارد الخادم للراصد البصري
# المدينة الطبية بجامعة الملك سعود (84.13.138.203)
# ==============================================================================

set -e

echo "====================================================================="
echo "   بدء تخصيص خادم أوراكل بالكامل لوكيل الراصد البصري الذكي (KSUMC)"
echo "   IP: 84.13.138.203"
echo "====================================================================="

APP_DIR="/opt/ksumc-vision-agent"

# 1. إيقاف أي خدمات قديمة تستهلك موارد الخادم (مثل Apache أو برامج سابقة)
echo "--> 1. فحص وإيقاف أي خدمات قديمة غير مستخدمة..."
sudo systemctl stop apache2 2>/dev/null || true
sudo systemctl disable apache2 2>/dev/null || true
if command -v pm2 &> /dev/null; then
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
fi

# 2. إنشاء مجلد الوكيل وتحديث صلاحيات الملفات
echo "--> 2. إعداد مسار الوكيل المخصص: $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo cp -r ./* "$APP_DIR/" 2>/dev/null || true
sudo chown -R $USER:$USER "$APP_DIR"
cd "$APP_DIR"

# 3. إعداد البيئة الافتراضية للبايثون
echo "--> 3. تجهيز مكتبات بايثون والمتطلبات..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# 4. ضبط محرك Ollama للاستفادة القصوى من الرام والمعالج وإبقاء النموذج محملاً في الرام
echo "--> 4. تحسين إعدادات Ollama وتثبيت النموذج في الرام (Zero Cold-Start)..."
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<EOF
[Service]
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_ORIGINS=*"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
sleep 3

# التأكد من تنزيل نموذج الرؤية البصرية qwen2.5vl:3b
echo "--> التحقق من وجود نموذج qwen2.5vl:3b..."
ollama pull qwen2.5vl:3b

# 5. إنشاء خدمة الوكيل الأساسي (FastAPI Backend على منفذ 8000)
echo "--> 5. إعداد خدمة الوكيل الأساسي (ksumc-vision-agent)..."
sudo tee /etc/systemd/system/ksumc-vision-agent.service > /dev/null <<EOF
[Unit]
Description=KSUMC Smart Safety Vision Agent (FastAPI Backend)
After=network.target ollama.service

[Service]
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/uvicorn agent_server:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# 6. إنشاء خدمة جسر الفايربيس اللحظي لتجاوز حظر شبكة الجامعة (Firebase RTDB Bridge Worker)
echo "--> 6. إعداد خدمة جسر الفايربيس اللحظي (ksumc-firebase-bridge)..."
sudo tee /etc/systemd/system/ksumc-firebase-bridge.service > /dev/null <<EOF
[Unit]
Description=KSUMC Firebase Realtime Queue Bridge Worker
After=network.target ksumc-vision-agent.service

[Service]
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/python firebase_bridge.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

# 7. إعداد Nginx لاستبدال المنصة القديمة وتحويل كل الزيارات إلى الوكيل الذكي
echo "--> 7. تحديث Nginx وإزالة الموقع القديم وتوجيه المنفذ 80/443 للوكيل..."
sudo tee /etc/nginx/sites-available/ksumc-vision-agent > /dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name rsdsafety.online www.rsdsafety.online 84.13.138.203 _;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 180s;
        proxy_connect_timeout 30s;
        proxy_send_timeout 180s;
    }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/ksumc-vision-agent /etc/nginx/sites-enabled/ksumc-vision-agent
sudo nginx -t && sudo systemctl reload nginx

# 8. تفعيل وتشغيل جميع الخدمات
echo "--> 8. تشغيل وتفعيل كافة خدمات الراصد البصري..."
sudo systemctl daemon-reload
sudo systemctl enable ksumc-vision-agent
sudo systemctl restart ksumc-vision-agent

sudo systemctl enable ksumc-firebase-bridge
sudo systemctl restart ksumc-firebase-bridge

# 9. تحمية النموذج في الرام فورياً (Pre-warming)
echo "--> 9. تحمية وتثبيت النموذج في ذاكرة الرام (Pre-warming)..."
curl -s http://127.0.0.1:11434/api/generate -d '{"model": "qwen2.5vl:3b", "prompt": "test", "keep_alive": "24h"}' > /dev/null || true

echo "====================================================================="
echo "✅ تم إنجاز العملية بنجاح! الخادم مخصص الآن 100% للراصد البصري:"
echo "   1. خدمة الوكيل المحلي:   http://84.13.138.203/ (منفذ 8000 عبر Nginx)"
echo "   2. جسر الفايربيس اللحظي: يعمل 24/7 لاستقبال الصور من شبكة الجامعة"
echo "   3. نموذج أولاما:          محمّل ومثبت في الرام (qwen2.5vl:3b)"
echo "====================================================================="
curl -s http://127.0.0.1:8000/safety/api/ai/status | grep -o '"status":"online"' && echo "✅ فحص الحالة: الخادم يعمل بنجاح (Online)!"

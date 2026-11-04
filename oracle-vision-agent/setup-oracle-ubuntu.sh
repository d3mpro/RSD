#!/usr/bin/env bash
# ==============================================================================
# KSUMC Smart Safety Vision Agent - Automated Oracle Cloud Ubuntu Installer
# سكربت التثبيت التلقائي الكامل لوكيل الرؤية البصرية (Qwen2.5-VL) على خادم أوراكل الجديد
# متوافق مع Ubuntu 22.04 / 24.04 (معالجات ARM64 Ampere A1 أو AMD/Intel x86_64)
# ==============================================================================

set -e

echo "====================================================================="
echo "   تجهيز خادم أوراكل الجديد - وكيل الرؤية البصرية الذكي (Qwen2.5-VL)"
echo "   المدينة الطبية بجامعة الملك سعود (KSUMC)"
echo "====================================================================="

APP_DIR="/opt/ksumc-vision-agent"

# 1. تحديث النظام وتثبيت الحزم الأساسية
sudo apt-get update -y
sudo apt-get install -y python3 python3-venv python3-pip nginx curl ufw

# 2. إنشاء مجلد الوكيل ونسخ الملفات
sudo mkdir -p "$APP_DIR"
sudo cp -r ./* "$APP_DIR/"
if [ -f ".env" ]; then
  sudo cp .env "$APP_DIR/.env"
elif [ -f ".env.example" ]; then
  sudo cp .env.example "$APP_DIR/.env"
fi

sudo chown -R $USER:$USER "$APP_DIR"
cd "$APP_DIR"

# 3. إنشاء البيئة الافتراضية لبايثون وتثبيت المتطلبات
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# 4. تثبيت محرك Ollama المحلي وتحميل نموذج Qwen2.5-VL-3B (مناسب لرام 24GB على أوراكل)
read -p "هل ترغب في تثبيت محرك Ollama المحلي وتحميل نموذج Qwen2.5-VL-3B على الخادم؟ (y/n) [y]: " INSTALL_OLLAMA
INSTALL_OLLAMA=${INSTALL_OLLAMA:-y}

if [[ "$INSTALL_OLLAMA" =~ ^[Yy]$ ]]; then
  echo "--> جاري تثبيت Ollama على خادم أوراكل..."
  curl -fsSL https://ollama.com/install.sh | sh
  sudo systemctl enable ollama
  sudo systemctl start ollama
  sleep 3
  echo "--> جاري سحب نموذج الرؤية البصرية qwen2.5vl:3b (قد يستغرق بضع دقائق)..."
  ollama pull qwen2.5vl:3b || echo "تنبيه: يمكنك سحب النموذج لاحقاً بالأمر: ollama pull qwen2.5vl:3b"
fi

# 5. إنشاء خدمة systemd ليعمل الوكيل تلقائياً في الخلفية 24/7
sudo tee /etc/systemd/system/ksumc-vision-agent.service > /dev/null <<EOF
[Unit]
Description=KSUMC Smart Safety Vision Agent (Qwen2.5-VL + Ollama + Gemini)
After=network.target

[Service]
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/uvicorn agent_server:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable ksumc-vision-agent
sudo systemctl restart ksumc-vision-agent

# 6. إعداد Nginx كواجهة عكسية (Reverse Proxy) لدعم المسار /safety/api/
sudo tee /etc/nginx/sites-available/ksumc-vision-agent > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_connect_timeout 30s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/ksumc-vision-agent /etc/nginx/sites-enabled/ksumc-vision-agent
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 7. فتح المنافذ في جدار الحماية الداخلي
sudo ufw allow 22/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
sudo ufw allow 8000/tcp || true

PUBLIC_IP=$(curl -s ifconfig.me || hostname -I | awk '{print $1}')
echo "====================================================================="
echo "✅ اكتمل تثبيت وتشغيل وكيل الرؤية البصرية الذكي بنجاح!"
echo "🔗 لوحة حالة الوكيل:   http://$PUBLIC_IP/"
echo "🔗 نقطة ربط المنصة:    http://$PUBLIC_IP/safety/api"
echo "====================================================================="

@echo off
chcp 65001 >nul
title KSUMC Smart Vision Agent (Qwen2.5-VL Local Test Server)
echo =====================================================================
echo   وكيل الرؤية البصرية الذكي للسلامة الميدانية (Qwen2.5-VL Agent)
echo   المدينة الطبية بجامعة الملك سعود - وضع التجربة المحلية الفورية
echo =====================================================================

cd /d "%~dp0"
node agent_server.js
pause

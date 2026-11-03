@echo off
chcp 65001 > nul
title KSUMC Safety System - Firebase Production Deployment (rsd-ksu)
cd /d "%~dp0"
set "PATH=%~dp0tools\node_modules\.bin;%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin;%PATH%"

echo ===================================================================
echo    منظومة جولات وتفتيش السلامة والصحة المهنية - KSUMC
echo    النسخة الإنتاجية الرسمية المعتمدة (Production Environment)
echo    المشروع السحابي المعتمد: rsd-ksu
echo ===================================================================
echo.

set FB_CMD=call "%~dp0tools\node_modules\.bin\firebase.cmd"
if not exist "%~dp0tools\node_modules\.bin\firebase.cmd" (
    if exist "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd" (
        set FB_CMD=call "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd"
    )
)

echo -------------------------------------------------------------------
echo الخطوة [1/2]: فحص وتسجيل الدخول بحساب Google Firebase...
echo -------------------------------------------------------------------
%FB_CMD% login

echo.
echo -------------------------------------------------------------------
echo الخطوة [2/2]: جارٍ رفع ونشر قواعد الأمان وتطبيق الويب إلى (rsd-ksu)...
echo -------------------------------------------------------------------
%FB_CMD% deploy --only hosting,database --project rsd-ksu

echo.
echo ===================================================================
echo   تم النشر بنجاح! الرابط الحي المباشر للمنظومة الإنتاجية:
echo   https://rsd-ksu.web.app
echo ===================================================================
echo.
pause

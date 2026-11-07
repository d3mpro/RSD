@echo off
chcp 65001 > nul
title KSUMC Safety System - Firebase Deployment (rsd-go-demo)
cd /d "%~dp0"
set "PATH=%~dp0tools\node_modules\.bin;%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin;%PATH%"

echo ===================================================================
echo    منظومة جولات وتفتيش السلامة والصحة المهنية - KSUMC
echo    النسخة الاستعراضية وتجربة الدخول السريع (Demo Environment)
echo    المشروع السحابي المعتمد: rsd-go-demo
echo    الرابط المباشر: https://rsd-go-demo.web.app
echo ===================================================================
echo.

set FB_CMD=npx --yes firebase-tools@latest
if exist "%~dp0tools\node_modules\.bin\firebase.cmd" (
    set FB_CMD=call "%~dp0tools\node_modules\.bin\firebase.cmd"
) else if exist "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd" (
    set FB_CMD=call "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd"
)

echo -------------------------------------------------------------------
echo الخطوة [1/2]: فحص وتسجيل الدخول بحساب Google Firebase...
echo -------------------------------------------------------------------
%FB_CMD% login

echo.
echo -------------------------------------------------------------------
echo الخطوة [2/2]: جارٍ رفع ونشر تطبيق الويب وقواعد الأمان إلى (rsd-go-demo)...
echo -------------------------------------------------------------------
%FB_CMD% deploy --only hosting,database --project rsd-go-demo

echo.
echo ===================================================================
echo   تم النشر بنجاح! الرابط الحي المباشر للمنظومة الاستعراضية:
echo   https://rsd-go-demo.web.app
echo ===================================================================
echo.
pause

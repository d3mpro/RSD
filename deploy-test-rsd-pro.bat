@echo off
chcp 65001 > nul
title KSUMC Safety System - Staging & Testing Channel (rsd-pro)
cd /d "%~dp0"
set "PATH=%~dp0tools\node_modules\.bin;%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin;%PATH%"

echo ===================================================================
echo    منظومة جولات وتفتيش السلامة والصحة المهنية - KSUMC
echo    مسار التجربة والاختبار الميداني (Staging / Testing Environment)
echo    القناة السحابية: rsd-pro (المشروع: rsd-ksu)
echo ===================================================================
echo.

set FB_CMD=npx --yes firebase-tools@latest
if exist "%~dp0tools\node_modules\.bin\firebase.cmd" (
    set FB_CMD=call "%~dp0tools\node_modules\.bin\firebase.cmd"
) else if exist "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd" (
    set FB_CMD=call "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd"
)

echo -------------------------------------------------------------------
echo جارٍ النشر إلى مسار الاختبار (rsd-pro) دون المساس بالرابط المعتمد...
echo -------------------------------------------------------------------
%FB_CMD% hosting:channel:deploy rsd-pro --project rsd-ksu -e 30d

echo.
echo ===================================================================
echo   تم النشر بنجاح على مسار الاختبار التجريبي!
echo   بعد انتهاء التجربة واعتماد التعديل 100%%، يتم النشر للرابط المعتمد:
echo   (https://rsd-ksu.web.app) عبر تشغيل: deploy-to-firebase.bat
echo ===================================================================
echo.
pause

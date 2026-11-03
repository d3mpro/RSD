@echo off
chcp 65001 > nul
title KSUMC Safety System - Firebase Production Preview Channel
cd /d "%~dp0"
set "PATH=%~dp0tools\node_modules\.bin;%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin;%PATH%"

echo ===================================================================
echo    منظومة جولات وتفتيش السلامة والصحة المهنية - KSUMC
echo    نشر قناة معاينة مستقلة (Production Preview Channel)
echo    المشروع السحابي: rsd-ksu
echo ===================================================================
echo.

set FB_CMD=call "%~dp0tools\node_modules\.bin\firebase.cmd"
if not exist "%~dp0tools\node_modules\.bin\firebase.cmd" (
    if exist "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd" (
        set FB_CMD=call "%~dp0..\RSD-GO-DEMO\tools\node_modules\.bin\firebase.cmd"
    )
)

echo -------------------------------------------------------------------
echo جارٍ نشر وتحديث قناة المعاينة (preview)...
echo -------------------------------------------------------------------
%FB_CMD% hosting:channel:deploy preview --expires 30d --project rsd-ksu

echo.
echo ===================================================================
echo   تم تحديث ونشر قناة المعاينة بنجاح!
echo ===================================================================
echo.
pause

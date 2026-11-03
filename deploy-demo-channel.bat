@echo off
chcp 65001 > nul
title KSUMC Safety System - Firebase Demo Channel Deployment
cd /d "%~dp0"
set "PATH=%~dp0tools\node_modules\.bin;%PATH%"

echo ===================================================================
echo    منظومة جولات وتفتيش السلامة والصحة المهنية - KSUMC
echo    نشر قناة معاينة تجريبية مستقلة (Demo Preview Channel)
echo    المشروع السحابي: rsd-go-demo
echo ===================================================================
echo.

set FB_CMD=call "%~dp0tools\node_modules\.bin\firebase.cmd"

echo -------------------------------------------------------------------
echo جارٍ نشر وتحديث قناة الديمو المستقلة (demo)...
echo -------------------------------------------------------------------
%FB_CMD% hosting:channel:deploy demo --expires 30d --project rsd-go-demo

echo.
echo ===================================================================
echo   تم تحديث ونشر قناة الديمو بنجاح!
echo ===================================================================
echo.
pause

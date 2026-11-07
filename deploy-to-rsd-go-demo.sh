#!/usr/bin/env bash
set -e

echo "==================================================================="
echo "  منظومة جولات وتفتيش السلامة والصحة المهنية - KSUMC"
echo "  نشر النسخة الاستعراضية والدخول السريع (rsd-go-demo)"
echo "  المشروع السحابي: rsd-go-demo"
echo "  الرابط: https://rsd-go-demo.web.app"
echo "==================================================================="

cd "$(dirname "$0")"

echo ""
echo "[1/2] التحقق من تسجيل الدخول إلى Firebase..."
npx --yes firebase-tools@latest login

echo ""
echo "[2/2] جارٍ نشر تطبيق الويب وقواعد البيانات إلى (rsd-go-demo)..."
npx --yes firebase-tools@latest deploy --only hosting,database --project rsd-go-demo

echo ""
echo "==================================================================="
echo "  تم النشر بنجاح على: https://rsd-go-demo.web.app"
echo "==================================================================="

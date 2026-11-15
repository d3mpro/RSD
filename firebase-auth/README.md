# Firebase Custom Claims & Strict Rules Deployment Guide

هذا الدليل يوضح خطوات الترقية من قواعد التوافق المؤقتة (`database.rules.json`) إلى قواعد العزل الصارم المعتمدة على Firebase Authentication Custom Claims (`database.rules.strict.json`).

## 1. المتطلبات الأساسية
1. حسابات المستخدمين مفعّلة عبر Firebase Auth (Email/Password أو KSU SSO SAML/OIDC) بدلاً من الاكتفاء بالدخول المجهول.
2. ملف مفتاح حساب الخدمة (Service Account JSON) من إعدادات مشروع Firebase.
3. تثبيت حزمة الإدارة في بيئة النشر الآمنة:
   ```bash
   npm install firebase-admin
   ```

## 2. تعيين الصلاحيات (Custom Claims)
يدعم النظام القيم التالية في `auth.token.role`:
- `head` (رئيس القسم / المشرف العام — صلاحية كاملة + الأرشيف التلقائي والأرشفة والاسترجاع)
- `admin` (مسؤول النظام — صلاحية كاملة + الأرشيف التلقائي والأرشفة والاسترجاع)
- `developer` (مطور النظام)
- `executive` (الإدارة التنفيذية)
- `quality` (الجودة وتقييم الأداء — قراءة السجلات النشطة للامتثال فقط)
- `shift_supervisor` (مشرف وردية — يقتصر نطاقه على ورديته وسجلاته دون الأرشيف التلقائي)
- `field_inspector` (مفتش ميداني — لا يرى أو يطبع سوى مخالفاته غير المؤرشفة التي أنشأها بحسابه `createdByUid === auth.uid`)

مثال لتعيين دور لحساب:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json"
export FIREBASE_DATABASE_URL="https://ksumc-safety-default-rtdb.firebaseio.com"

node firebase-auth/custom-claims-setup.js \
  --email "h1@ksu.edu.sa" \
  --role head \
  --empId h1
```

أو مزامنة كافة المستخدمين المسجلين تحت `/users`:
```bash
node firebase-auth/custom-claims-setup.js --sync-db
```

## 3. تفعيل القواعد الصارمة في الإنتاج
بعد التأكد من تعيين `Custom Claims` للمستخدمين وربط `createdByUid`:
```bash
firebase deploy --only database --config firebase.strict.json
```
أو نسخ `database.rules.strict.json` إلى `database.rules.json` وتشغيل:
```bash
firebase deploy --only database
```

## 4. الضمانات الأمنية في `database.rules.strict.json`
- **منع الحذف النهائي (`!newData.exists()`)** لجميع المستخدمين والأدوار.
- **عزل المفتشين على مستوى الخادم**: القراءة والكتابة لمسار `safety_violations` و`smoking_violations` مقيدة بالاستعلام `createdByUid == auth.uid` وبالسجلات غير المؤرشفة (`archived != true`).
- **حماية الأرشفة**: لا يُسمح إلا لحاملي `head` / `admin` / `developer` / `executive` بتعديل حقل `archived` أو قراءة السجلات المؤرشفة.
- **سجل تدقيق غير قابل للتعديل (`audit_logs`)**: الكتابة مسموحة بالإضافة فقط (`!data.exists()`) دون تعديل أو حذف، والقراءة محصورة على `head` و`admin`.
- **منع تخزين كلمات المرور**: يحظر حفظ حقول `password` أو `passwordHash` في عقد `/users` و`/ksumc_users`.

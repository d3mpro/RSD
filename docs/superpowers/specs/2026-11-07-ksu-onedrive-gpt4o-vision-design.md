# وثيقة التصميم الفني: منظومة الأرشفة السحابية الجامعية (KSU OneDrive 1TB) وترقية محرك الرؤية البصرية (GPT-4o)
## منصة رصد للسلامة والصحة المهنية (RSD-ALSAQRI) - المدينة الطبية بجامعة الملك سعود (KSUMC)
### التاريخ: 2026-11-07 | الحالة: جاهزة لاعتماد المالك

---

## 1. الهدف والغرض (Intent & The Why)

تمتلك إدارة السلامة حساباً جامعياً رسمياً في جامعة الملك سعود (`@ksu.edu.sa`) مزوداً بمستودع تخزين سحابي مؤسسي بحجم **1 تيرابايت (`OneDrive for Business` على النطاق `https://ksusa-my.sharepoint.com`)**، بالإضافة إلى مفتاح وصول رسمي لنماذج الرؤية البصرية من مايكروسوفت عبر **GitHub Models (`openai/gpt-4o`)**.

في الوضع الحالي للنظام:
1. تُحفظ صور ومخالفات **الراصد البصري الذكي** داخل المتصفح (`localStorage` بحد أقصى ~5MB) وداخل قاعدة بيانات جوجل النصية (`Firebase Realtime Database` بحد مجاني 1GB تخزين و10GB تحميل شهرياً)، مع **تكرار نص الصورة (`Base64`) مرتين** في كل سجل (مرة في `photo`/`images` ومرة مدمجاً داخل كود الطباعة `fullPageHtml`/`cardInnerHtml`). هذا يؤدي لامتلاء ذاكرة المتصفح واستنزاف حصة Firebase المجانية بسرعة.
2. المحرك القديم في `assets/js/ksu-cloud-sync.js` يعتمد على طلب موافقة تطبيق خارجي في `Microsoft Graph API` (تحجبه سياسات تقنية المعلومات بالجامعة برسالة `Need admin approval`)، ولا يشمل أرشفة مخالفات وصور الراصد البصري أو تقارير سباهي الفعلية.

يهدف هذا المشروع إلى:
- **حماية وتسريع Firebase والمتصفح فوراً** بإلغاء تكرار الصور وتخفيف حجم السجلات اللحظية، مع حفظ الصور الأصلية عالية الدقة وأرشفتها في مساحة الـ **1 تيرا** الجامعية.
- **بناء مركز الأرشفة السحابية الجامعية (`KSU OneDrive 1TB Hub`)** يعمل بسلاسة على كلٍّ من **الكمبيوتر (Windows)** و**الجوال (iOS/Android)** ويتكامل مع `ksusa-my.sharepoint.com` وبريد الجامعة عبر `Power Automate` القياسي دون الحاجة لأي صلاحيات `Admin Approval` من تقنية المعلومات.
- **تفعيل التبديل التلقائي لمحرك `GPT-4o Vision` (`GitHub Models`) بأمان تام** بحيث يبدأ الفحص بمحرك `Gemini` السريع ويتحول تلقائياً وفوراً عند اكتمال حصته أو تعثره إلى `GPT-4o` ثم `Qwen2.5-VL` ثم `Ollama` المحلي دون أي توقف، مع حفظ المفاتيح السرية بعيداً عن مستودع الكود العام (`Git`).

---

## 2. الأهداف، غير الأهداف، والمحظورات (Goals, Non-Goals, Anti-Goals)

### أ. الأهداف (Goals)
1. **إزالة التضخم والتكرار من السجلات السحابية (`Firebase & LocalStorage Slimming`):**
   - إيقاف تخزين `fullPageHtml` و`cardInnerHtml` المكررة داخل سجلات `safety_violations` الجديدة في `localStorage` و`Firebase RTDB`، وإعادة توليد بطاقة الفحص الرسمية ديناميكياً عند المعاينة أو الطباعة من بيانات `visionData` والصورة.
   - حفظ الصور عالية الدقة (`1280px` بجودة `0.85`) في مخزن محلي واسع السعة بالمتصفح (`IndexedDB: ksumc_media_vault`) وفي خزنة الوكيل (`oracle-vision-agent/archive_vault/`)، والاكتفاء في `Firebase RTDB` بصورة مصغّرة خفيفة (`Thumbnail` بحد أقصى `480px` وجودة `0.6`، أقل من ~35KB) لضمان سرعة المزامنة اللحظية وبقاء الباقة المجانية لسنوات.
   - **[قرار هندسي - Builder Call] تنحيف السجلات القديمة بأمان بعد الأرشفة:** توفير إجراء آمن لتنظيف وتنحيف سجلات `safety_violations` المتراكمة سابقاً في `Firebase RTDB` و`localStorage` **فقط بعد إتمام أرشفتها بنجاح إلى OneDrive**، بحيث تُحذف نصوص `fullPageHtml`/`cardInnerHtml` المكررة (متى ما توفرت `visionData`) وتُصغّر الصور الضخمة القديمة إلى `480px` دون فقدان أي صورة أصلية.
2. **مركز أرشفة المستودع السحابي الجامعي (`KSU OneDrive 1TB Archive Hub` في `assets/js/ksu-cloud-sync.js`):**
   - واجهة عصرية مخصصة للمشرفين، الجودة، رئيس القسم، ومدير النظام فقط (تُفتح من الشريط العلوي الموحد `KSUNav`).
   - **على الكمبيوتر (Desktop Edge/Chrome):** دعم الربط المباشر بمجلد `OneDrive - King Saud University` عبر `File System Access API` (`window.showDirectoryPicker`) لإنشاء وتحديث شجرة مجلدات رسمية تلقائياً:
     - `KSUMC_RSD_Safety_Archive/YYYY-MM/01_صور_ومحاضر_الراصد_البصري/` (الصور الأصلية `.jpg` + بطاقة المحضر المستقلة `<CARD_ID>_محضر_رصد.html` الجاهزة للطباعة A4).
     - **[قرار هندسي - Builder Call]** `KSUMC_RSD_Safety_Archive/YYYY-MM/02_سجلات_إكسل_وشواهد_سباهي/` ويضم **5 سجلات `.csv` بترميز UTF-8 BOM** متوافقة تماماً مع Excel العربي في `ksusa-my.sharepoint.com` (`سجل_مخالفات_الراصد_البصري.csv`، `سجل_الجولات_التفتيشية.csv`، `سجل_الامتثال_لسباهي_CBAHI.csv`، `سجل_تقارير_الورديات_والأقسام.csv`، `سجل_الأصول_الميدانية.csv`) بالإضافة إلى ملف شواهد الاعتماد الرسمي المجمّع القابل للطباعة (`ملف_شواهد_الاعتماد_سباهي_YYYY-MM.html`).
     - `KSUMC_RSD_Safety_Archive/YYYY-MM/03_النسخ_الاحتياطي_الشامل/` (نسخة شاملة كاملة لقاعدة البيانات `KSUMC_Full_Backup_YYYY-MM-DD.json` تغطي كافة المجموعات الـ 13).
   - **على الجوال (iOS/Android) والمتصفحات الأخرى:** دعم مشاركة ورفع حزم الشواهد والملفات مباشرة إلى تطبيق **Microsoft OneDrive** على الجوال بضغطة واحدة عبر `Web Share API` (`navigator.share({ files })`) أو التنزيل المنظم، مع زر وصول مباشر لمستودع الجامعة `https://ksusa-my.sharepoint.com` وحقل لحفظ رابط مجلد الشواهد المشترك للرجوع السريع.
3. **جسر الأرشفة التلقائية واسترجاع الصور عالية الدقة عبر الأجهزة (`Cross-Device Vault & 24/7 Email Bridge`):**
   - إضافة نقطة نهاية في خادم الوكيل `oracle-vision-agent/agent_server.py` (`POST /safety/api/archive/dispatch`) تحفظ النسخة عالية الدقة (`1280px`) في `oracle-vision-agent/archive_vault/YYYY-MM/` وترسل عند تفعيل SMTP رسالة بريد إلكتروني مؤتمتة بترويسة `[RSD-ARCHIVE]` مرفقاً بها الصور ومحضر المخالفة إلى البريد الجامعي المعتمد ليلتقطها `Power Automate` القياسي ويحفظها في `OneDrive`.
   - **[قرار هندسي - Builder Call] استرجاع الصور الأصلية بين الأجهزة:** إضافة نقطة قراءة موثقة `GET /safety/api/archive/media/{cardId}` (مع دعم الإجراء المقابل `get-archive-media` في `firebase_bridge.py`) لتمكين المشرف أو المسؤول عند مزامنة `OneDrive` من جهازه الخاص من جلب الصور عالية الدقة (`1280px`) التي التقطتها جوالات المفتشين الميدانيين، مع التراجع السلس إلى `IndexedDB` المحلي ثم الصورة المصغّرة (`480px`) في حال عدم الاتصال بالخادم.
4. **التبديل التلقائي الذكي لمحرك الرؤية البصرية (`Gemini Primary -> GPT-4o Auto-Failover`):**
   - **وفق قرار مالك النظام:** يستمر المسار الأول في `assets/js/ksu-ai-client.js` (`analyzeInspectionImage`) باستخدام `Google Gemini 2.5 Flash` مباشرة لسرعة الاستجابة الفورية على جوالات المفتشين، وفي حال اكتمال حصة `Gemini` (`429 Quota Exceeded`) أو فشل الاتصال به، ينتقل الطلب **تلقائياً وفوراً** إلى خادم الوكيل (أو جسر الفايربيس `firebase_bridge.py` داخل شبكة المستشفى) ليعمل محرك **`GitHub Models (openai/gpt-4o)`** كبديل أول على الخادم، يليه `openai/gpt-4o-mini` ثم `Qwen2.5-VL` ثم `Ollama` المحلي.
   - حفظ مفتاح `github_pat_...` الخاص بالمستخدم حصرياً داخل ملف `oracle-vision-agent/.env` المستثنى في `.gitignore`، مع توثيق المتغيرات في `.env.example` فقط دون أي مفاتيح حقيقية.

### ب. غير الأهداف (Non-Goals)
- استبدال `Firebase Realtime Database` كمحرك مزامنة لحظي في هذه المرحلة؛ تظل Firebase مسؤولة عن المزامنة الفورية للجولات والإشعارات والاعتمادات لحين الانتقال المستقبلي لخادم المدينة الطبية الداخلي.
- فرض تسجيل دخول إجباري بحساب مايكروسوفت على المفتشين الميدانيين قبل بدء جولاتهم.

### ج. المحظورات الصارمة (Anti-Goals)
- **يُمنع منعاً باتاً** وضع أي مفتاح يبدأ بـ `github_pat_` أو كلمات مرور SMTP داخل أي ملف كود متتبع في `Git` أو داخل عقدة عامة القراءة في `Firebase RTDB` (حيث `.read: true`)، لأن GitHub يبطل المفتاح تلقائياً فور دفعه (`git push`).
- **يُمنع منعاً باتاً** إظهار أزرار إعدادات الخوادم أو مفاتيح الـ API التقنية داخل نافذة كاميرا المفتش الميداني (`openAIVisionInspectionModal` في `field.html`) التزاماً ببساطة واجهة المفتش المعتمدة في التحديث المعماري (`2b96308`).

---

## 3. القيود التقنية والمؤسسية (Constraints)

1. **قيود `Microsoft Entra ID` في جامعة الملك سعود:** تطبيقات الطرف الثالث التي تطلب صلاحيات `Files.ReadWrite.All` عبر `MSAL` تُحجب برسالة `Need admin approval`. لذا يعتمد الحل على: (أ) نظام الملفات المحلي المتزامن مع `OneDrive` على الكمبيوتر، (ب) مشاركة الملفات القياسية `Web Share API` لتطبيق `OneDrive` على الجوال، و(ج) أتمتة البريد الجامعي القياسية `Power Automate Standard`.
2. **حدود المتصفح وFirebase:** سعة `localStorage` هي ~5MB فقط، وسعة حزمة المزامنة في Firebase RTDB يجب أن تبقى خفيفة لسرعة التحميل على شبكات الـ 4G/Wi-Fi داخل المستشفيات.
3. **التوافق العكسي الكامل:** السجلات السابقة التي تحتوي على `cardInnerHtml` أو `fullPageHtml` تستمر في العرض والطباعة دون أي كسر، وكذلك استدعاءات `ksuSyncEngine` الموجودة في `assets/js/app.js` تستمر بالعمل بسلاسة عبر طبقة توافق (Compatibility Shims).

---

## 4. البدائل المدروسة والقرار المعتمد (Approaches)

1. **المسار الأول (مزامنة المجلد المحلي فقط عبر المتصفح):** بسيط ومجاني، لكنه يتطلب فتح المنصة من جهاز الكمبيوتر لكتابة الملفات في مجلد OneDrive ولا يرفع الصور عالية الدقة الملتقطة من جوالات المفتشين الآخرين بمفرده.
2. **المسار الثاني (أتمتة البريد الجامعي + `Power Automate` فقط):** يعمل في الخلفية 24/7 من أي جوال، لكنه يتطلب ضبط بيانات إرسال SMTP وقاعدة `Power Automate` قبل بدء الاستفادة منه.
3. **المسار الثالث (الحل الهجين الشامل - المسار المعتمد):** يجمع بين **تنحيف Firebase الفوري + مركز الأرشفة المباشر للكمبيوتر والجوال (`ksusa-my.sharepoint.com`) مع خزنة الصور العابرة للأجهزة + جسر الأرشفة البريدي الآلي عبر خادم أوراكل + التبديل التلقائي لمحرك `GPT-4o` عند اكتمال حصة Gemini**.

---

## 5. التصميم التفصيلي للمكونات (Detailed Architecture)

### أولاً: تنحيف السجلات ومخزن الوسائط (`assets/js/ksu-ai-client.js` & `assets/js/ksu-firebase-realtime.js`)
1. **مخزن الصور عالية الدقة `KSUMediaVault`:**
   - قاعدة بيانات `IndexedDB` محلية باسم `ksumc_media_vault` وجدول `media_files` مفهرس بـ `recordId` (`cardId`).
   - يحفظ الصور عالية الدقة (`1280px` بجودة `0.85`) قبل تقليصها للـ Thumbnail، ويرسل نسخة خلفية غير معطِّلة (`fire-and-forget`) إلى `POST /safety/api/archive/dispatch` (أو عبر `firebase_bridge.py` عند الحاجة) لتكون متاحة للمشرفين من أي جهاز آخر.
2. **تحديث `approveAndUploadVisualViolation` وعرض البطاقات في `assets/js/ksu-ai-client.js`:**
   - توليد صورة مصغّرة خفيفة (`480px`، جودة `0.6`) للحقل `photo` المرفوع إلى `localStorage` و`Firebase RTDB`.
   - التوقف عن حفظ النص المكرر الضخم `fullPageHtml` و`cardInnerHtml` داخل كائن `newViol` الجديد.
   - إضافة الدالة المساعدة `window.getOrBuildViolationCardHtml(viol, preferredImage)` لاستخدامها عند معاينة أو طباعة أي محضر مخالفة في كافة البوابات؛ تعيد `viol.fullPageHtml` إن كان محفوظاً قديماً، أو تولّده لحظياً عبر `buildVisualInspectionCardHtml` باستخدام الصورة عالية الدقة (إن توفرت) أو المصغّرة.
3. **حارس الحجم في `normalizeCloudPayload` (`assets/js/ksu-firebase-realtime.js`):**
   - عند رفع أي سجل في `safety_violations` يتضمن `visionData`، تُستبعد الحقول المكررة `fullPageHtml` و`cardInnerHtml` من النسخة المرسلة لـ Firebase لتوفير أكثر من 60% من حجم السجل فوراً.

### ثانياً: مسار التبديل التلقائي لمحركات الرؤية (`assets/js/ksu-ai-client.js` & `oracle-vision-agent/agent_server.py` & `firebase_bridge.py`)
1. **ترتيب التنفيذ في `analyzeInspectionImage` (`ksu-ai-client.js`):**
   - **الطبقة 1 (الأساسية السريعة):** `Google Gemini 2.5 Flash` مع تدوير كافة مفاتيح Gemini المتاحة.
   - **الطبقة 2 (التبديل التلقائي الفوري عند اكتمال الحصة أو الخطأ):** استدعاء وكيل الرؤية `POST /safety/api/ai/analyze-inspection-image` مباشرة (بمهلة استجابة سريعة)، وإن كانت شبكة المستشفى تحجب المنفذ الخارجي ينتقل تلقائياً إلى جسر `dispatchViaFirebaseBridge('analyze-inspection-image', ...)` المتصل بـ `firebase_bridge.py`.
   - **داخل خادم الوكيل (`agent_server.py`):** تكون أولوية المزودات `AI_PROVIDER_PRIORITY=github_models,qwen_api,ollama_local,gemini_api`:
     - يستدعي المزود الجديد `github_models` نقطة `https://models.github.ai/inference/chat/completions` بالنموذج `openai/gpt-4o` مستخدماً مفتاح `GITHUB_MODELS_KEYS` المحفوظ في `.env`.
     - عند حدوث `429` في `gpt-4o`، يجرب تلقائياً `openai/gpt-4o-mini` ثم ينتقل بسلاسة إلى `qwen_api` ثم `ollama_local`.

### ثالثاً: مركز الأرشفة السحابية الجامعية (`assets/js/ksu-cloud-sync.js` & `assets/js/ksu-nav-component.js`)
1. **التحميل والوصول الموحد عبر `KSUNav`:**
   - يتحقق `ksu-nav-component.js` من دور المستخدم الحالي؛ فإذا كان من أدوار الإشراف أو الجودة أو الإدارة أو المطور (`roleCategory !== 'field_inspector'`)، يضمن تحميل `assets/js/ksu-cloud-sync.js` تلقائياً (حتى في البوابات التي لم تكن تضمّنه مثل `dashboard.html` و`head.html`) ويعرض زر **"سحابة الجامعة (1TB)"** في الشريط العلوي.
   - يحافظ `ksu-cloud-sync.js` على كائن `window.ksuSyncEngine` ودواله القديمة (`updateUI`, `onDataChanged`, `login`) لضمان عدم تأثر أي كود قائم في `assets/js/app.js`.
2. **قدرات نافذة `#ksu-onedrive-archive-modal`:**
   - **فتح المستودع الجامعي والروابط المشتركة:** زر مباشر لفتح `https://ksusa-my.sharepoint.com` + حفظ ومزامنة رابط مجلد الشواهد المشترك لقسم السلامة.
   - **مزامنة المجلد المحلي على الكمبيوتر (`Desktop OneDrive Folder Sync`):** كتابة الصور الأصلية (`1280px` المسترجعة من الخزنة أو الوكيل)، محاضر الـ HTML القابلة للطباعة، سجلات الـ CSV الخمسة، ملف شواهد سباهي، والنسخة الاحتياطية الشاملة `.json` مباشرة داخل المجلد المختار، مع تتبع السجلات المؤرشفة لعدم إعادة كتابة الملفات غير المتغيرة.
   - **مشاركة الحزمة لتطبيق OneDrive على الجوال (`Mobile OneDrive Share`):** تجميع ملفات السجلات والمحاضر والصور ومشاركتها مباشرة لتطبيق `OneDrive` عبر `navigator.share({ files })` على أجهزة iPhone وAndroid (أو تنزيلها عند عدم دعم المتصفح).
   - **زر تنحيف السجلات القديمة في Firebase (`Optimize Legacy Cloud Storage`):** يفعل تنظيف السجلات القديمة المتضخمة في Firebase RTDB بأمان بعد التحقق من أرشفتها.
   - **دليل ربط `Power Automate` في 3 خطوات:** بطاقة إرشادية واضحة لتفعيل الحفظ الآلي لرسائل `[RSD-ARCHIVE]` داخل `ksusa-my.sharepoint.com`.

---

## 6. ما يُترك لتقدير المنفّذ البرمجي (Left to the Builder)

- التصميم البصري التفصيلي وتوزيع البطاقات داخل `#ksu-onedrive-archive-modal` وفق الهوية الرسمية لجامعة الملك سعود (`#004B87` والذهبي `#D97706` وخط `Cairo`).
- حجم دفعات الجلب والكتابة المتوازية (`Batch Size`) في `File System Access API` وعند سحب الصور من `agent_server.py`، وسياسة الاحتفاظ الدورية بملفات `oracle-vision-agent/archive_vault/` (مثلاً الاحتفاظ بآخر 90 يوماً على الخادم مع استثناء المجلد في `.gitignore`).
- تفاصيل إعدادات بروتوكول `SMTP` الاختياري (منافذ `587 STARTTLS` / `465 SSL`) والاختبارات الآلية لوحدات `agent_server.py` و`ksu-cloud-sync.js`.

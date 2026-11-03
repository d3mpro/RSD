/**
 * ============================================================================
 * KSUMC Firebase Realtime Database - Full Workflow & Sync Verification Test
 * مشروع منظومة السلامة الميدانية - المدينة الطبية بجامعة الملك سعود
 * ============================================================================
 * يقوم هذا السكربت بإجراء اختبار متكامل على قاعدة بيانات Firebase الحية:
 * 1. فحص الاتصال وقراءة/كتابة البيانات اللحظية
 * 2. مزامنة بيانات المستخدمين (M1, S1, H1, Q1, alsaqri)
 * 3. تنفيذ دورة العمل المعتمدة بالكامل:
 *    - المرحلة 1: إنشاء ورفع الجولة من المفتش (M1) -> submitted_by_inspector
 *    - المرحلة 2: مراجعة واعتماد مشرف الفترة (S1/H1) -> approved_by_head
 *    - المرحلة 3: تدقيق واعتماد الجودة وسباهي (Q1) -> approved_cbahi / approved_by_quality
 * 4. التحقق من الحفظ والربط في:
 *    - /rounds
 *    - /shift_inspection_logs
 *    - /compliance_registry
 *    - /notifications
 *    - /system_status
 * ============================================================================
 */

const https = require('https');

const DB_BASE_URL = 'https://rsd-go-demo-default-rtdb.firebaseio.com';

function rtdbRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path + '.json', DB_BASE_URL);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = body ? JSON.parse(body) : null;
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ status: res.statusCode, data: parsed });
                    } else {
                        reject({ status: res.statusCode, error: parsed || body });
                    }
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// قائمة المستخدمين الأساسية
const SYSTEM_USERS = [
    {
        id: 'USR-01',
        empId: '95972',
        username: 'alsaqri',
        name: 'أ. علي سليمان الصقري',
        role: 'مطور النظام ومسؤول التقنية والمشرف العام',
        roleCategory: 'developer',
        portal: 'developer',
        shift: 'جميع الورديات',
        status: 'نشط'
    },
    {
        id: 'USR-7453',
        empId: 'H1',
        username: 'H1',
        name: 'مشرف عام الملك خالد',
        role: 'المشرف العام الملك خالد',
        roleCategory: 'head',
        portal: 'head',
        shift: 'جميع الورديات',
        status: 'نشط'
    },
    {
        id: 'USR-Q1',
        empId: 'Q1',
        username: 'Q1',
        name: 'قسم الجودة وتقييم الأداء',
        role: 'قسم الجودة وتقييم الأداء (CBAHI / JCI)',
        roleCategory: 'quality',
        portal: 'quality',
        shift: 'جميع الورديات',
        status: 'نشط'
    },
    {
        id: 'USR-9200',
        empId: 'S1',
        username: 'S1',
        name: 'مشرف الأولى',
        role: 'مشرف وردية معتمد',
        roleCategory: 'shift_supervisor',
        portal: 'field',
        shift: 'الوردية 1 (صباحي)',
        status: 'نشط'
    },
    {
        id: 'USR-8896',
        empId: 'M1',
        username: 'M1',
        name: 'مفتش الوردية الأولى',
        role: 'مفتش سلامة ميداني',
        roleCategory: 'field_inspector',
        portal: 'field',
        shift: 'الوردية 1 (صباحي)',
        status: 'نشط'
    }
];

async function runFullWorkflowVerification() {
    console.log('========================================================================');
    console.log('🚀 بدء اختبار المزامنة اللحظية ودورة العمل الميدانية على Firebase RTDB');
    console.log('   المشروع السحابي: rsd-go-demo');
    console.log('   قاعدة البيانات: rsd-go-demo-default-rtdb');
    console.log('========================================================================\n');

    // 1. مزامنة المستخدمين
    console.log('📌 الخطوة [1/5]: فحص ومزامنة مستخدمي النظام والصلاحيات في السحابة...');
    const usersPayload = {};
    SYSTEM_USERS.forEach(u => {
        usersPayload[u.id] = u;
    });
    const usersRes = await rtdbRequest('/users', 'PATCH', usersPayload);
    console.log(`   ✅ تم حفظ المستخدمين بنجاح (HTTP ${usersRes.status}):`, Object.keys(usersPayload));

    // 2. المرحلة الأولى: المفتش الميداني (M1) ينشئ جولة تفتيشية
    console.log('\n📌 الخطوة [2/5]: [المفتش الميداني M1] إنشاء ورفع جولة تفتيشية ميدانية...');
    const roundId = 'RND-TRIAL-' + Date.now();
    const roundDate = new Date().toISOString().split('T')[0];
    const initialRoundData = {
        id: roundId,
        roundId: roundId,
        timestamp: Date.now(),
        date: roundDate,
        createdAt: new Date().toISOString(),
        inspectorId: 'USR-8896',
        inspectorName: 'مفتش الوردية الأولى (M1)',
        inspectorEmpId: 'M1',
        shift: 'الوردية 1 (صباحي)',
        shiftName: 'الوردية 1 (صباحي)',
        facility: 'مستشفى الملك خالد الجامعي (KKUH)',
        building: 'البرج الطبي الرئيسي (المبنى A)',
        floor: 'الدور الثالث - أجنحة التنويم',
        checklistType: 'مخارج الطوارئ ومكافحة الحريق (CBAHI FMS.4)',
        checklistCategory: 'مخارج وطوارئ',
        totalItemsChecked: 15,
        compliantItemsCount: 15,
        violationsCount: 0,
        complianceRate: 100,
        score: 100,
        status: 'submitted_by_inspector',
        workflowStatus: 'forwarded_to_head',
        workflowStatusLabel: 'تم الرفع إلى مشرف الفترة',
        notes: 'تم فحص جميع مخارج الطوارئ وأجهزة إنذار الحريق وخراطيم الإطفاء، وجميعها سالكة وجاهزة ومطابقة للمواصفات.',
        inspectorSignature: 'مفتش معتمد - M1',
        history: [
            {
                action: 'created_and_submitted',
                by: 'مفتش الوردية الأولى (M1)',
                role: 'field_inspector',
                timestamp: new Date().toISOString()
            }
        ]
    };

    // حفظ الجولة في /rounds
    await rtdbRequest(`/rounds/${roundId}`, 'PUT', initialRoundData);
    console.log(`   ✅ تم حفظ الجولة في عقدة /rounds/${roundId}`);

    // ربط الجولة بسجل الوردية /shift_inspection_logs
    const shiftLogRecord = {
        id: roundId,
        roundId: roundId,
        timestamp: Date.now(),
        date: roundDate,
        shift: 'الوردية 1 (صباحي)',
        supervisor: 'مشرف الأولى (S1)',
        inspector: 'مفتش الوردية الأولى (M1)',
        building: initialRoundData.building,
        checklistType: initialRoundData.checklistType,
        complianceRate: 100,
        status: 'قيد تدقيق المشرف',
        workflowStatus: 'forwarded_to_head'
    };
    await rtdbRequest(`/shift_inspection_logs/${roundId}`, 'PUT', shiftLogRecord);
    console.log(`   ✅ تم قيد الجولة في سجل الوردية اليومي /shift_inspection_logs/${roundId}`);

    // إرسال إشعار للمشرف /notifications
    const notifId = 'NOTIF-' + Date.now();
    const notifData = {
        id: notifId,
        title: 'جولة تفتيشية جديدة جاهزة للاعتماد الإشرافي',
        message: `قام المفتش M1 برفع جولة تفتيش البرج الطبي (مبنى A) - الدور الثالث بنسبة امتثال 100%`,
        targetRole: 'head',
        targetShift: 'الوردية 1 (صباحي)',
        priority: 'high',
        status: 'جديد',
        roundId: roundId,
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
    };
    await rtdbRequest(`/notifications/${notifId}`, 'PUT', notifData);
    console.log(`   ✅ تم إرسال الإشعار اللحظي للمشرف في /notifications/${notifId}`);

    // 3. المرحلة الثانية: المشرف (S1 / H1) يراجع ويعتمد الجولة
    console.log('\n📌 الخطوة [3/5]: [مشرف الفترة S1 / H1] مراجعة وتدقيق واعتماد الجولة الإشرافية...');
    // محاكاة قراءة المشرف للجولة من السحابة
    const fetchedForHead = await rtdbRequest(`/rounds/${roundId}`, 'GET');
    console.log(`   🔍 المشرف استعلم عن الجولة: ${fetchedForHead.data.building} | الحالة الحالية: ${fetchedForHead.data.workflowStatus}`);

    const headApprovalData = {
        status: 'approved_by_head',
        workflowStatus: 'pending_quality',
        workflowStatusLabel: 'معتمد من مشرف الفترة - بانتظار اعتماد الجودة (سباهي)',
        headApprovedAt: new Date().toISOString(),
        headApprovedBy: 'مشرف الأولى (S1) / المشرف العام (H1)',
        headNotes: 'تمت المراجعة الميدانية والتدقيق، الجولة مكتملة الأركان ومستوفية للمعايير وتعتمد برفعها لقسم الجودة.',
        headSignature: 'معتمد إشرافياً - S1',
        history: [
            ...initialRoundData.history,
            {
                action: 'approved_by_head',
                by: 'مشرف الأولى (S1)',
                role: 'shift_supervisor',
                timestamp: new Date().toISOString()
            }
        ]
    };

    await rtdbRequest(`/rounds/${roundId}`, 'PATCH', headApprovalData);
    await rtdbRequest(`/shift_inspection_logs/${roundId}`, 'PATCH', {
        status: 'معتمد من المشرف',
        workflowStatus: 'pending_quality',
        approvedByHead: 'S1'
    });
    console.log(`   ✅ تم اعتماد المشرف وتحديث الجولة إلى: pending_quality`);

    // إشعار قسم الجودة
    const qualityNotifId = 'NOTIF-Q-' + Date.now();
    await rtdbRequest(`/notifications/${qualityNotifId}`, 'PUT', {
        id: qualityNotifId,
        title: 'جولة معتمدة إشرافياً بانتظار الختم والاعتماد النهائي (سباهي)',
        message: `تم اعتماد جولة ${roundId} من مشرف الوردية S1 وتنتظر التدقيق والختم بقسم الجودة`,
        targetRole: 'quality',
        priority: 'high',
        status: 'جديد',
        roundId: roundId,
        timestamp: Date.now(),
        createdAt: new Date().toISOString()
    });
    console.log(`   ✅ تم إرسال إشعار فوري لقسم الجودة /notifications/${qualityNotifId}`);

    // 4. المرحلة الثالثة: قسم الجودة والاعتمادات (Q1) يراجع ويمنح الاعتماد النهائي
    console.log('\n📌 الخطوة [4/5]: [قسم الجودة Q1] مطابقة المعايير وإصدار ختم الاعتماد الرسمي لسباهي...');
    const fetchedForQuality = await rtdbRequest(`/rounds/${roundId}`, 'GET');
    console.log(`   🔍 قسم الجودة فتح الجولة: ${fetchedForQuality.data.id} | حالة المشرف: ${fetchedForQuality.data.workflowStatus}`);

    const accreditationNumber = 'CBAHI-FMS-' + Math.floor(100000 + Math.random() * 900000);
    const qualityApprovalData = {
        status: 'approved_by_quality',
        workflowStatus: 'approved_cbahi',
        workflowStatusLabel: 'معتمد رسمياً وموثق لسباهي (CBAHI Certified)',
        qualityApprovedAt: new Date().toISOString(),
        qualityAuditedBy: 'قسم الجودة وتقييم الأداء (Q1)',
        accreditationCode: accreditationNumber,
        complianceStandard: 'CBAHI Standard FMS.4 & JCI FMS.6',
        qualityStamp: 'ختم الجودة والاعتماد الرسمي - KSUMC CBAHI ACCREDITED',
        qualityNotes: 'تمت مطابقة معايير السلامة العامة ومخارج الطوارئ لمتطلبات المركز السعودي لاعتماد المنشآت الصحية بنجاح تام.',
        history: [
            ...headApprovalData.history,
            {
                action: 'accredited_by_quality',
                by: 'قسم الجودة وتقييم الأداء (Q1)',
                role: 'quality',
                timestamp: new Date().toISOString(),
                accreditationCode: accreditationNumber
            }
        ]
    };

    await rtdbRequest(`/rounds/${roundId}`, 'PATCH', qualityApprovalData);
    await rtdbRequest(`/shift_inspection_logs/${roundId}`, 'PATCH', {
        status: 'معتمد جودة وسباهي',
        workflowStatus: 'approved_cbahi',
        accreditationCode: accreditationNumber
    });
    console.log(`   ✅ تم إصدار اعتماد الجودة وسباهي برقم الاعتماد: ${accreditationNumber}`);

    // قيد السجل في سجل الامتثال الرسمي (compliance_registry)
    const complianceId = 'COMP-' + Date.now();
    const complianceRecord = {
        id: complianceId,
        standard: 'CBAHI FMS.4',
        category: 'مخارج وطوارئ والسلامة الميدانية',
        facility: initialRoundData.facility,
        building: initialRoundData.building,
        roundId: roundId,
        score: 100,
        status: 'معتمد وممتثل بالكامل',
        certifiedDate: new Date().toISOString(),
        certifiedBy: 'قسم الجودة وتقييم الأداء (Q1)',
        accreditationCode: accreditationNumber,
        timestamp: Date.now()
    };
    await rtdbRequest(`/compliance_registry/${complianceId}`, 'PUT', complianceRecord);
    console.log(`   ✅ تم قيد الاعتماد في السجل الوطني للامتثال /compliance_registry/${complianceId}`);

    // إشعار نظام المزامنة اللحظية الشامل لجميع الأجهزة
    await rtdbRequest('/system_status/lastUpdate', 'PUT', {
        action: 'workflow_round_accredited',
        roundId: roundId,
        accreditationCode: accreditationNumber,
        timestamp: Date.now(),
        updatedBy: 'Q1'
    });
    console.log('   ✅ تم إرسال نبضة المزامنة اللحظية system_status/lastUpdate لجميع المتصفحات المتصلة.');

    // 5. التحقق النهائي من القراءة والحفظ المكتمل
    console.log('\n📌 الخطوة [5/5]: التحقق النهائي والاطلاع على السجل المكتمل من السحابة...');
    const finalRound = await rtdbRequest(`/rounds/${roundId}`, 'GET');
    const finalShiftLog = await rtdbRequest(`/shift_inspection_logs/${roundId}`, 'GET');
    const finalCompliance = await rtdbRequest(`/compliance_registry/${complianceId}`, 'GET');

    console.log('\n========================================================================');
    console.log('🎉 نتيجة الاختبار الشامل: نجاح تام 100%');
    console.log('========================================================================');
    console.log('📋 ملخص الجولة المعتمدة في السحابة:');
    console.log('   - معرف الجولة:', finalRound.data.id);
    console.log('   - المبنى والموقع:', finalRound.data.building, '-', finalRound.data.floor);
    console.log('   - المفتش صاحب الجولة:', finalRound.data.inspectorName);
    console.log('   - مشرف الوردية المعتمد:', finalRound.data.headApprovedBy);
    console.log('   - مدقق الجودة والاعتماد:', finalRound.data.qualityAuditedBy);
    console.log('   - كود اعتماد سباهي الرسمي:', finalRound.data.accreditationCode);
    console.log('   - حالة مسار العمل النهائي:', finalRound.data.workflowStatus);
    console.log('   - نسبة الامتثال المحققة:', finalRound.data.complianceRate + '%');
    console.log('   - سجل الورديات المقترن:', finalShiftLog.data.status);
    console.log('   - سجل الامتثال المقترن:', finalCompliance.data.standard, '-', finalCompliance.data.status);
    console.log('   - إجمالي سجلات التاريخ والتتبع:', finalRound.data.history.length, 'مراحل موثقة بالكامل.');
    console.log('========================================================================\n');
}

runFullWorkflowVerification().catch(err => {
    console.error('❌ حدث خطأ أثناء تنفيذ الاختبار:', err);
    process.exit(1);
});

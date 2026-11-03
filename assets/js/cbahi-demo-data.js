/**
 * ============================================================================
 * KSUMC Safety & Inspection Platform - CBAHI Showcase & Demo Seed Engine
 * منصة جولات وتفتيش السلامة والصحة المهنية - النسخة الاستعراضية (Showcase / Demo)
 * متوافقة 100% مع معايير المركز السعودي لاعتماد المنشآت الصحية (سباهي - CBAHI)
 * ومعايير الجمعية الوطنية للحماية من الحرائق (NFPA) واللجنة الدولية المشتركة (JCI)
 * ============================================================================
 */

(function(window) {
  'use strict';

  const CBAHI_DEMO_VERSION = 'ksumc_clean_forms_v2_2026';

  const TODAY_STR = new Date().toISOString().split('T')[0];
  const NOW_TIME_STR = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

  // 1. الجولات التفتيشية الميدانية النموذجية المعتمدة لسباهي (Rounds)
  const DEMO_ROUNDS = [
    {
      id: 'RND-CBAHI-2026-001',
      formType: 'ext',
      formTitle: 'جولة تفتيش مسالك ومخارج الطوارئ ومسارات الإخلاء',
      hospital: 'مستشفى الملك خالد الجامعي (KKUH)',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      building: 'المستشفى',
      floor: 'الدور الثالث - جناح العناية المركزة (ICU 3A/3B)',
      inspector: 'أ. تركي محمد القحطاني',
      inspectorUsername: 'tqahtani',
      inspectorName: 'أ. تركي محمد القحطاني',
      badge: '10842',
      shift: 'shift1',
      shiftName: 'الوردية الأولى (صباحية)',
      date: TODAY_STR,
      time: '08:45',
      timestamp: Date.now() - 3600000 * 4,
      score: 100,
      complianceRate: 100,
      compliantCount: 12,
      observationCount: 0,
      violationCount: 0,
      status: 'completed',
      workflowStatus: 'approved_cbahi',
      workflowStatusLabel: 'معتمد رسمياً (Approved)',
      accreditationBodies: 'كود البناء والحريق السعودي SBC 201/801',
      checklistType: 'ext',
      checklist: [
        { id: 'fms4-1', code: 'KSU-SAF-01', title: 'خلو الممرات ومسارات الإخلاء من أي عوائق بالكامل', status: 'compliant', notes: 'الممرات سالكة بعرض قياسي > 2.4م' },
        { id: 'fms4-2', code: 'KSU-SAF-02', title: 'أجهزة الدفع على أبواب الطوارئ (Panic Hardware) تعمل بسلاسة', status: 'compliant', notes: 'تم الاختبار الميكانيكي لـ 4 مخارج' },
        { id: 'fms4-3', code: 'KSU-SAF-03', title: 'إنارة الطوارئ وعلامات الخروج (EXIT) مضاءة وتعمل بالبطارية', status: 'compliant', notes: 'اختبار بطارية الطوارئ 90 دقيقة ناجح' },
        { id: 'fms4-4', code: 'KSU-SAF-04', title: 'أبواب مقاومة الحريق تغلق ذاتياً بإحكام دون موانع', status: 'compliant', notes: 'العوازل الدخانية سليمة بنسبة 100%' }
      ],
      qualityNotes: 'تمت المراجعة الميدانية من قسم الجودة: مطابقة تامة للمعايير الوطنية لسباهي FMS.4.',
      headNotes: 'معتمد رسمياً ويوثق في سجل التدقيق السنوي للاعتماد.',
      approvedByQuality: 'قسم الجودة وتقييم الأداء',
      approvedByHead: 'المشرف العام الملك خالد (H1)',
      approvedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'RND-CBAHI-2026-002',
      formType: 'fex',
      formTitle: 'الفحص الدوري الشامل لطفايات الحريق وأنظمة المكافحة الأولية',
      hospital: 'مستشفى الملك خالد الجامعي (KKUH)',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      building: 'مبنى العيادات',
      floor: 'الدور الأرضي - العيادات التخصصية واستقبال الطوارئ',
      inspector: 'أ. سلطان فهد السبيعي',
      inspectorUsername: 'ssubaie',
      inspectorName: 'أ. سلطان فهد السبيعي',
      badge: '10842',
      shift: 'shift1',
      shiftName: 'الوردية الأولى (صباحية)',
      date: TODAY_STR,
      time: '09:30',
      timestamp: Date.now() - 3600000 * 3,
      score: 100,
      complianceRate: 100,
      compliantCount: 15,
      observationCount: 0,
      violationCount: 0,
      status: 'completed',
      workflowStatus: 'approved_cbahi',
      workflowStatusLabel: 'معتمد رسمياً (Approved)',
      accreditationBodies: 'كود الحريق السعودي SBC 801',
      checklistType: 'fex',
      checklist: [
        { id: 'fms12-1', code: 'KSU-FEX-01', title: 'مؤشرات الضغط في النطاق الأخضر السليم لكافة الطفايات', status: 'compliant', notes: 'معاينة 32 طفاية بودرة وCO2' },
        { id: 'fms12-2', code: 'KSU-FEX-02', title: 'سلامة أختام الضمان ومسامير الأمان (Tamper Seals)', status: 'compliant', notes: 'جميع الأختام سليمة ومثبتة' },
        { id: 'fms12-3', code: 'KSU-FEX-03', title: 'بطاقات الفحص الشهري الرقمية معلقة ومحدثة بباركود النظام', status: 'compliant', notes: 'مسح الباركود متطابق مع المنظومة' }
      ],
      qualityNotes: 'فحص عالي الدقة، جاهزية طفايات الحريق في مبنى العيادات 100%.',
      headNotes: 'معتمد.',
      approvedByQuality: 'قسم الجودة وتقييم الأداء',
      approvedByHead: 'المشرف العام الملك خالد (H1)',
      approvedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'RND-CBAHI-2026-003',
      formType: 'fm200',
      formTitle: 'فحص أنظمة إخماد الغازات النظيفة وغرف الخوادم المركزية (FM-200)',
      hospital: 'المدينة الطبية بجامعة الملك سعود',
      facility: 'المدينة الطبية بجامعة الملك سعود',
      building: 'المبنى الإداري',
      floor: 'قبو الخدمات وغرف الخوادم والاتصالات (Main Data Center)',
      inspector: 'أ. فهد إبراهيم الدوسري',
      inspectorUsername: 'fdossari',
      inspectorName: 'أ. فهد إبراهيم الدوسري',
      badge: '10842',
      shift: 'shift1',
      shiftName: 'الوردية الأولى (صباحية)',
      date: TODAY_STR,
      time: '10:15',
      timestamp: Date.now() - 3600000 * 2,
      score: 100,
      complianceRate: 100,
      compliantCount: 10,
      observationCount: 0,
      violationCount: 0,
      status: 'completed',
      workflowStatus: 'approved_cbahi',
      workflowStatusLabel: 'معتمد رسمياً (Approved)',
      accreditationBodies: 'كود الحريق السعودي SBC 801 (أنظمة الغاز النظيف)',
      checklistType: 'fm200',
      checklist: [
        { id: 'fm-1', code: 'KSU-FM-01', title: 'ضغط اسطوانات FM-200 ضمن النطاق التشغيلي المعتمد (25 bar)', status: 'compliant', notes: 'الضغط الفعلي 25.2 bar' },
        { id: 'fm-2', code: 'KSU-FM-02', title: 'لوحة التحكم المركزية (Extinguishing Control Panel) بحالة NORMAL', status: 'compliant', notes: 'لا توجد أي إشارات عطل أو إنذار' },
        { id: 'fm-3', code: 'KSU-FM-03', title: 'مفاتيح الإطلاق والتعطيل اليدوي (Abort / Release) واضحة ومحمية', status: 'compliant', notes: 'مفاتيح الحماية في وضع الاستعداد' }
      ],
      qualityNotes: 'نظام حماية الغرف الحساسة والبيانات الحيوية يعمل بكفاءة مثالية.',
      headNotes: 'معتمد من المشرف العام.',
      approvedByQuality: 'قسم الجودة وتقييم الأداء',
      approvedByHead: 'المشرف العام الملك خالد (H1)',
      approvedAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'RND-CBAHI-2026-004',
      formType: 'fhc',
      formTitle: 'تفتيش صناديق وخراطيم الإطفاء ومحابس الضغط العالي',
      hospital: 'مستشفى الملك خالد الجامعي (KKUH)',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      building: 'العناية المركزة',
      floor: 'الدور الأول - العناية المركزة الجراحية (SICU)',
      inspector: 'أ. علي حسن الشهري',
      inspectorUsername: 'ashehri',
      inspectorName: 'أ. علي حسن الشهري',
      badge: '10842',
      shift: 'shift1',
      shiftName: 'الوردية الأولى (صباحية)',
      date: TODAY_STR,
      time: '11:00',
      timestamp: Date.now() - 3600000,
      score: 100,
      complianceRate: 100,
      compliantCount: 14,
      observationCount: 0,
      violationCount: 0,
      status: 'completed',
      workflowStatus: 'approved_cbahi',
      workflowStatusLabel: 'معتمد رسمياً (Approved)',
      accreditationBodies: 'كود الحريق السعودي SBC 801',
      checklistType: 'fhc',
      checklist: [
        { id: 'fhc-1', code: 'KSU-FHC-01', title: 'سهولة الوصول لصناديق الإطفاء خالية من أي موانع أو أسرة مرضى', status: 'compliant', notes: 'المسار مفرغ بالكامل' },
        { id: 'fhc-2', code: 'KSU-FHC-02', title: 'سلامة بكرة الخرطوم والفوهة وعدم وجود أي تسريبات مياه', status: 'compliant', notes: 'الخرطوم ملفوف بحالة ممتازة والفوهة مغلقة' },
        { id: 'fhc-3', code: 'KSU-FHC-03', title: 'مفتاح الصندوق والمطرقة التحذيرية في أماكنها المخصصة', status: 'compliant', notes: 'جاهز للاستخدام الفوري' }
      ],
      qualityNotes: 'جاهزية أنظمة الإطفاء المائي مطابقة للاشتراطات.',
      headNotes: 'معتمد.',
      approvedByQuality: 'قسم الجودة وتقييم الأداء',
      approvedByHead: 'المشرف العام الملك خالد (H1)',
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'RND-CBAHI-2026-005',
      formType: 'all',
      formTitle: 'تفتيش التخزين الآمن والنفايات الطبية الخطرة ومكافحة العدوى',
      hospital: 'مستشفى الملك خالد الجامعي (KKUH)',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      building: 'التوسعة الشرقية',
      floor: 'الدور الثاني - بنك الدم والمختبرات التشخيصية',
      inspector: 'أ. تركي محمد القحطاني',
      inspectorUsername: 'tqahtani',
      inspectorName: 'أ. تركي محمد القحطاني',
      badge: '10842',
      shift: 'shift1',
      shiftName: 'الوردية الأولى (صباحية)',
      date: TODAY_STR,
      time: '11:45',
      timestamp: Date.now() - 1800000,
      score: 98.5,
      complianceRate: 98.5,
      compliantCount: 16,
      observationCount: 1,
      violationCount: 0,
      status: 'completed',
      workflowStatus: 'approved_cbahi',
      workflowStatusLabel: 'معتمد رسمياً (Approved)',
      accreditationBodies: 'معايير السلامة والبيئة المعتمدة',
      checklistType: 'all',
      checklist: [
        { id: 'ic10-1', code: 'KSU-HAZ-01', title: 'حاويات الأدوات الحادة (Sharps Boxes) غير ممتلئة لأكثر من 3/4', status: 'compliant', notes: 'جميع الحاويات ضمن النسبة الآمنة' },
        { id: 'ic10-2', code: 'KSU-HAZ-02', title: 'استخدام الأكياس الصفراء المعتمدة للنفايات الطبية الحيوية الخطرة', status: 'compliant', notes: 'مطابق لتعليمات مكافحة العدوى' },
        { id: 'ic10-3', code: 'KSU-HAZ-03', title: 'توفر مجموعات التعامل مع انسكاب المواد الكيميائية (Spill Kits)', status: 'compliant', notes: 'أطقم الانسكاب متوفرة وسارية الصلاحية' }
      ],
      qualityNotes: 'ملاحظة وحيدة تم علاجها فورياً بتفريغ حاوية أدوات حادة قبل وصولها للحد الأقصى.',
      headNotes: 'معتمد بعد الإجراء التصحيحي السريع.',
      approvedByQuality: 'قسم الجودة وتقييم الأداء',
      approvedByHead: 'المشرف العام الملك خالد (H1)',
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'RND-CBAHI-2026-006',
      formType: 'all',
      formTitle: 'فحص صمامات ومحطات الغازات الطبية وغرف العمليات',
      hospital: 'مستشفى الملك خالد الجامعي (KKUH)',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      building: 'المستشفى',
      floor: 'الدور الرابع - مجمع العمليات الجراحية الرئيسي (OR Suite)',
      inspector: 'أ. سلطان فهد السبيعي',
      inspectorUsername: 'ssubaie',
      inspectorName: 'أ. سلطان فهد السبيعي',
      badge: 'JCI-FMS.8',
      shift: 'shift1',
      shiftName: 'الوردية الأولى (صباحية)',
      date: TODAY_STR,
      time: '12:30',
      timestamp: Date.now() - 900000,
      score: 100,
      complianceRate: 100,
      compliantCount: 14,
      observationCount: 0,
      violationCount: 0,
      status: 'completed',
      workflowStatus: 'approved_cbahi',
      workflowStatusLabel: 'معتمد رسمياً (Approved)',
      accreditationBodies: 'معايير السلامة والغازات الطبية المعتمدة',
      checklistType: 'all',
      checklist: [
        { id: 'medgas-1', code: 'JCI FMS.8.1', title: 'صناديق صمامات المنطقة (Zone Valves) واضحة وموسومة باسم الغرف', status: 'compliant', notes: 'الترميز اللوني واضح وصمامات الإغلاق مرئية' },
        { id: 'medgas-2', code: 'KSU-GAS-01', title: 'مؤشرات الضغط للأكسجين والهواء الطبي والشفط في النطاق الأخضر', status: 'compliant', notes: 'الأكسجين: 50-55 psi، الشفط: -18 inHg (طبيعي)' },
        { id: 'medgas-3', code: 'KSU-GAS-02', title: 'لوحة إنذار الغازات الطبية (Master Alarm) في وضع المراقبة الآمن', status: 'compliant', notes: 'اختبار الإشارة الصوتية والضوئية سليم' }
      ],
      qualityNotes: 'مستوى استثنائي من الامتثال والجاهزية الطبية الحيوية.',
      headNotes: 'معتمد للاعتماد الدولي والمحلي.',
      approvedByQuality: 'قسم الجودة وتقييم الأداء',
      approvedByHead: 'المشرف العام الملك خالد (H1)',
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  // 2. سجل الامتثال المعتمد لسباهي والاعتمادات الرسمية (Compliance Registry)
  const DEMO_COMPLIANCE_REGISTRY = DEMO_ROUNDS.map(r => ({
    id: 'CBAHI-' + r.id,
    sourceId: r.id,
    sourceType: 'round',
    title: r.formTitle,
    standard: r.formTitle || 'معايير سباهي FMS.4',
    status: 'compliant',
    category: 'سلامة ومطابقة سباهي',
    hospital: r.hospital,
    building: r.building,
    floor: r.floor,
    inspector: r.inspector,
    shiftName: r.shiftName,
    date: r.date,
    time: r.time,
    complianceRate: r.complianceRate,
    accreditationBodies: r.accreditationBodies,
    approvedByQuality: r.approvedByQuality,
    approvedByHead: r.approvedByHead,
    workflowStatus: r.workflowStatus,
    workflowStatusLabel: r.workflowStatusLabel,
    qualityNotes: r.qualityNotes,
    headNotes: r.headNotes,
    approvedAt: r.approvedAt
  }));

  // 3. تصاريح العمل الآمن النموذجية المعتمدة (Safety Permits)
  const DEMO_PERMITS = [
    {
      id: 'PERM-2026-108',
      permitType: 'hot_work',
      title: 'تصريح عمل ساخن (Hot Work Permit) - تلحيم وقص أنابيب تكييف',
      contractor: 'شركة السيف للمقاولات الهندسية',
      location: 'مستشفى الملك خالد الجامعي - الدور الأرضي - توسعة قسم الأشعة',
      building: 'المستشفى',
      floor: 'الدور الأرضي',
      safetyOfficer: 'أ. تركي محمد القحطاني',
      fireWatcher: 'أ. خالد التميمي (مراقب حريق مخصص)',
      fireExtinguisherCount: 2,
      sparkShieldsVerified: true,
      gasTestResults: 'LEL: 0% | O2: 20.9% | CO: 0 ppm (Safe & Verified)',
      startDate: TODAY_STR,
      validUntil: `${TODAY_STR} 18:00`,
      status: 'ساري ومعتمد',
      workflowStatus: 'approved_quality',
      workflowStatusLabel: 'معتمد من إدارة السلامة والجودة ✓',
      timestamp: Date.now() - 7200000,
      notes: 'تم فحص الموقع وتأمين طفايات بودرة 6 كجم وبطانية حريق عازلة.'
    },
    {
      id: 'PERM-2026-109',
      permitType: 'confined_space',
      title: 'تصريح دخول أماكن مغلقة (Confined Space Permit) - صيانة خزان مياه الإطفاء',
      contractor: 'مؤسسة الرواد للسلامة والتشغيل',
      location: 'محطة الخدمات المركزية - خزان مياه مكافحة الحريق رقم 2',
      building: 'المبنى الإداري',
      floor: 'محطة التبريد والقبو',
      safetyOfficer: 'أ. سلطان فهد السبيعي',
      standbyPerson: 'أ. محمد العتيبي (منقذ ومراقب دخول)',
      ventilationActive: true,
      harnessInspected: true,
      gasTestResults: 'O2: 20.8% | H2S: 0 ppm | CO: 0 ppm | LEL: 0%',
      startDate: TODAY_STR,
      validUntil: `${TODAY_STR} 16:30`,
      status: 'ساري ومعتمد',
      workflowStatus: 'approved_quality',
      workflowStatusLabel: 'معتمد من إدارة السلامة والجودة ✓',
      timestamp: Date.now() - 5400000,
      notes: 'التهوية الميكانيكية المستمرة فعالة، أجهزة التنفس في وضع الجاهزية.'
    }
  ];

  // 4. سجل فحص أبواب الطوارئ ومقاومة الحريق (Emergency & Fire Doors)
  const DEMO_DOORS = [
    {
      id: 'DOOR-KKUH-301',
      doorId: 'D-3A-FIRE-01',
      building: 'المستشفى',
      floor: 'الدور الثالث - ICU 3A',
      location: 'مدخل وحدة العناية المركزة الباطنية',
      doorType: 'باب حريق مقاوم 90 دقيقة بمغلاق كهرومغناطيسي',
      selfClosingStatus: 'سليم ومطابق',
      panicBarStatus: 'سليم ومطابق',
      magneticReleaseStatus: 'تم الاختبار ويفصل فورياً مع الإنذار',
      sealStatus: 'العوازل الدخانية سليمة بنسبة 100%',
      status: 'مطابق ومفحوص',
      inspector: 'أ. تركي محمد القحطاني',
      date: TODAY_STR,
      time: '08:50',
      timestamp: Date.now() - 3600000 * 3.5
    },
    {
      id: 'DOOR-KKUH-204',
      doorId: 'D-2B-EXIT-02',
      building: 'التوسعة الشرقية',
      floor: 'الدور الثاني - المختبرات',
      location: 'درج الطوارئ الشرقي المؤدي للمهبط',
      doorType: 'مخرج طوارئ بمقبض دفع عريض (Panic Bar)',
      selfClosingStatus: 'سليم ومطابق',
      panicBarStatus: 'سليم ومطابق',
      magneticReleaseStatus: 'غير مطبق (ميكانيكي حر للخروج)',
      sealStatus: 'سليم ومطابق',
      status: 'مطابق ومفحوص',
      inspector: 'أ. علي حسن الشهري',
      date: TODAY_STR,
      time: '11:10',
      timestamp: Date.now() - 3600000
    }
  ];

  // 5. سجل الإنذارات وبلاغات الأمان التجريبية (Smart Alarm Logs)
  const DEMO_ALARMS = [
    {
      id: 'ALM-2026-042',
      alarmCode: 'TEST-WFS-03',
      title: 'اختبار تدفق مياه الرشاشات الآلية (Water Flow Switch Test)',
      building: 'المستشفى',
      floor: 'الدور الثالث',
      location: 'جناح 3B - صمام التحكم القطاعي',
      severity: 'منخفض',
      status: 'تمت المعالجة والإغلاق',
      responseTimeSec: 42,
      investigatedBy: 'أ. تركي محمد القحطاني',
      actionTaken: 'اختبار دوري مجدول مسبقاً، تم تأكيد إشارة الجريان بلوحة الإنذار الرئيسية وإعادة التهيئة بنجاح.',
      date: TODAY_STR,
      time: '09:10',
      timestamp: Date.now() - 3600000 * 2.5
    }
  ];

  // 6. سجل الإجراءات التصحيحية والوقائية (CAPA Registry)
  const DEMO_CAPA = [
    {
      id: 'CAPA-2026-001',
      title: 'إعادة تنظيم مسار مخرج الطوارئ في مبنى العيادات التخصصية',
      standard: 'كود البناء السعودي SBC 201',
      category: 'مسالك وطوارئ',
      building: 'مبنى العيادات',
      floor: 'الدور الأرضي',
      severity: 'متوسط',
      finding: 'وجود عربة مستلزمات طبية بالقرب من الباب المزدوج لمخرج الطوارئ رقم 2.',
      correctiveAction: 'تم نقل العربة فورياً إلى مستودع التخزين الداخلي وتخطيط أرضية المخرج بطلاء أصفر عاكس مع لوحة تحذيرية.',
      preventiveAction: 'تعميم دوري لتمريض العيادات بعدم إيقاف أي عربات أمام المخارج والتفتيش اليومي بالوردية الصباحية.',
      assignedTo: 'أ. سلطان فهد السبيعي',
      dueDate: TODAY_STR,
      status: 'مغلق ومطابق بنسبة 100%',
      verifiedBy: 'قسم الجودة وتقييم الأداء',
      closedAt: TODAY_STR,
      complianceScore: 100,
      timestamp: Date.now() - 3600000 * 2
    }
  ];

  // 7. تقارير إدارة السلامة الميدانية (Safety Dept Reports - 4-Stage Workflow)
  const DEMO_SHIFT_REPORTS = [
    {
      id: 'REP-SAF-2026-001',
      subject: 'فحص جاهزية جرس الإنذار ومخارج الطوارئ',
      day: 'الثلاثاء',
      date: TODAY_STR,
      time: NOW_TIME_STR,
      building: 'مبنى المستشفى الرئيسي',
      buildingCode: 'A',
      block: 'الرئيسي',
      floor: 'الدور الأول (1)',
      room: 'ممر العيادات رقم 2',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      details: 'تم رصد حاجة لإعادة تثبيت لوحة إرشادية لمخرج الطوارئ وفحص جرس الإنذار اليدوي في الممر، وتم التنسيق الفوري مع الصيانة.',
      action: 'تم فحص الجرس والتأكد من عمله بكفاءة 100% وإعادة تثبيت اللوحة الإرشادية فوراً.',
      inspector: 'أ. عادل عاضة الشلوي',
      shift: 'الاولى',
      shiftKey: 'shift1',
      signature: 'معتمد إلكترونياً - أ. عادل عاضة الشلوي',
      supName: 'أ. حسن إبراهيم دعاك',
      supRouting: 'بانتظار مراجعة وتوجيه المشرف العام (H1)',
      supNotes: '',
      supDecision: 'pending',
      headName: 'أ. مصعب عبدالله آل حماد',
      headRouting: 'بانتظار الإحالة من المشرف العام',
      headNotes: '',
      headDecision: 'pending',
      directorName: 'مدير الإدارة العامة للأمن والسلامة',
      directorNotes: '',
      directorDecision: 'pending',
      routedTo: 'H1',
      routedToTitle: 'المشرف العام الملك خالد (H1)',
      workflowStage: 'pending_h1',
      workflowStageLabel: 'بانتظار مراجعة المشرف العام (H1)',
      headApprovalStatus: 'pending_h1',
      status: 'مرسل للمشرف العام (H1) للمراجعة',
      submittedAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAtMs: Date.now() - 1800000,
      timestamp: Date.now() - 1800000
    }
  ];

  // 8. الإشعارات والتوجيهات الإدارية المباشرة (Notifications)
  const DEMO_NOTIFICATIONS = [
    {
      id: 'NOTIF-CBAHI-01',
      title: 'اعتماد رسمي لمحضر التفتيش المعتمد ✓',
      message: 'تم اعتماد جولة تفتيش مسالك ومخارج الطوارئ لمستشفى الملك خالد الجامعي بنسبة امتثال 100%.',
      type: 'success',
      priority: 'high',
      targetRole: 'all',
      date: TODAY_STR,
      time: NOW_TIME_STR,
      timestamp: Date.now() - 1200000,
      read: false
    },
    {
      id: 'NOTIF-CBAHI-02',
      title: 'جاهزية الاعتماد المؤسسي سباهي 2026',
      message: 'مؤشر الامتثال العام للمدينة الطبية يسجل 99.4% مع اكتمال كافة الفحوصات الدورية وجاهزية أنظمة الإطفاء والإنذار.',
      type: 'info',
      priority: 'normal',
      targetRole: 'all',
      date: TODAY_STR,
      time: NOW_TIME_STR,
      timestamp: Date.now() - 2400000,
      read: true
    }
  ];

  /**
   * المحرك الرئيسي لتهيئة وبث بيانات الديمو النموذجية
   * ملاحظة أمنية: لا يتم استدعاء هذا المحرك تلقائياً نهائياً، بل حصرياً بطلب مباشر من صفحة المطور (force === true)
   */
  function seedCBAHIDemoData(force = false) {
    try {
      const systemMode = (window.KSUSystemMode && typeof window.KSUSystemMode.getMode === 'function') 
        ? window.KSUSystemMode.getMode() 
        : (localStorage.getItem('ksumc_system_mode') || 'production');
      const zeroStateActive = localStorage.getItem('ksumc_prod_zero_state') === 'true';

      if (!force) {
        console.log('🔒 [CBAHI-Demo] تم حظر حقن بيانات الديمو التلقائي للحفاظ على وضع التشغيل الفعلي والتصفير الشامل.');
        return;
      }

      // إذا كان هناك إجبار صريح من المطور لتفعيل الديمو
      localStorage.removeItem('ksumc_prod_zero_state');
      localStorage.setItem('ksumc_system_mode', 'demo');

      const currentVersion = localStorage.getItem('ksumc_cbahi_demo_version');
      const existingRounds = JSON.parse(localStorage.getItem('ksumc_safety_rounds') || '[]');

      // تنظيف أي تقارير قديمة تالفة (بدون حقل subject مثل REP-KKUH-) مع الحفاظ على التقارير التي أنشأها المستخدم
      let existingReports = [];
      try {
        const rawReps = JSON.parse(localStorage.getItem('ksumc_safety_dept_reports') || '[]');
        if (Array.isArray(rawReps)) {
          existingReports = rawReps.filter(r => r && r.subject && !String(r.id || '').startsWith('REP-KKUH-'));
        }
      } catch (e) {}

      if (!force && currentVersion === CBAHI_DEMO_VERSION && existingRounds.length > 0) {
        if (existingReports.length > 0) {
          localStorage.setItem('ksumc_safety_dept_reports', JSON.stringify(existingReports));
        }
        console.log('✓ [CBAHI-Demo] بيانات الديمو النموذجية المعتمدة موجودة وجاهزة.');
        return;
      }

      console.log('🚀 [CBAHI-Demo] جارٍ تهيئة بيانات الديمو النموذجية لسباهي (CBAHI Showcase Data)...');

      // 1. حقن الجولات
      localStorage.setItem('ksumc_safety_rounds', JSON.stringify(DEMO_ROUNDS));
      localStorage.setItem('ksumc_field_rounds', JSON.stringify(DEMO_ROUNDS));
      localStorage.setItem('ksumc_rounds_registry', JSON.stringify(DEMO_ROUNDS));

      // 2. حقن سجل الامتثال
      localStorage.setItem('ksumc_compliance_registry', JSON.stringify(DEMO_COMPLIANCE_REGISTRY));

      // 3. حقن التصاريح والأبواب والإنذارات
      localStorage.setItem('ksumc_safety_permits', JSON.stringify(DEMO_PERMITS));
      localStorage.setItem('ksumc_safety_doors', JSON.stringify(DEMO_DOORS));
      localStorage.setItem('ksumc_safety_alarms', JSON.stringify(DEMO_ALARMS));

      // 4. حقن سجل CAPA وتقارير السلامة (مع الحفاظ على تقارير المستخدم المضافة) والإشعارات
      const mergedReports = (!force && existingReports.length > 0) ? existingReports : DEMO_SHIFT_REPORTS;
      localStorage.setItem('ksumc_capa_records', JSON.stringify(DEMO_CAPA));
      localStorage.setItem('ksumc_safety_dept_reports', JSON.stringify(mergedReports));
      localStorage.setItem('ksumc_notifications', JSON.stringify(DEMO_NOTIFICATIONS));

      // 5. تحديث المؤشرات العامة في state إن وجد
      if (window.state) {
        window.state.rounds = DEMO_ROUNDS;
        window.state.complianceRegistry = DEMO_COMPLIANCE_REGISTRY;
        window.state.permits = DEMO_PERMITS;
        window.state.doors = DEMO_DOORS;
        window.state.alarms = DEMO_ALARMS;
        window.state.capaRecords = DEMO_CAPA;
        window.state.safetyDeptReports = mergedReports;
        window.state.notifications = DEMO_NOTIFICATIONS;
      }

      localStorage.setItem('ksumc_cbahi_demo_version', CBAHI_DEMO_VERSION);
      localStorage.setItem('ksumc_sample_data_version', 'v6.0-clean-pilot-launch-2026');
      localStorage.setItem('ksumc_shift_log_reset_at', String(Date.now()));

      // 6. مزامنة فورية مع Firebase Realtime Database
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.pushCollectionToFirebase === 'function' && window.ksuFirebaseSync.isConnected) {
        try {
          window.ksuFirebaseSync.pushCollectionToFirebase('rounds', DEMO_ROUNDS, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('compliance_registry', DEMO_COMPLIANCE_REGISTRY, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('permits', DEMO_PERMITS, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('doors', DEMO_DOORS, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('alarms', DEMO_ALARMS, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('capa_records', DEMO_CAPA, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('safety_dept_reports', DEMO_SHIFT_REPORTS, 'id');
          window.ksuFirebaseSync.pushCollectionToFirebase('notifications', DEMO_NOTIFICATIONS, 'id');
          console.log('☁️ [CBAHI-Demo] تم بث بيانات الديمو لسباهي إلى سحابة Firebase بنجاح ✓');
        } catch (fbErr) {
          console.warn('[CBAHI-Demo] جاري انتظار اتصال فايربيس لبث البيانات:', fbErr);
        }
      }

      // 7. مزامنة REST إضافية مباشرة مع السحابة لضمان التواجد الفوري
      const rtdbBase = 'https://rsd-go-demo-default-rtdb.firebaseio.com';
      try {
        const toPatch = [
          { node: 'rounds', items: DEMO_ROUNDS },
          { node: 'compliance_registry', items: DEMO_COMPLIANCE_REGISTRY },
          { node: 'permits', items: DEMO_PERMITS },
          { node: 'doors', items: DEMO_DOORS },
          { node: 'alarms', items: DEMO_ALARMS },
          { node: 'capa_records', items: DEMO_CAPA },
          { node: 'safety_dept_reports', items: DEMO_SHIFT_REPORTS },
          { node: 'notifications', items: DEMO_NOTIFICATIONS }
        ];
        toPatch.forEach(entry => {
          if (Array.isArray(entry.items) && entry.items.length > 0) {
            const payload = {};
            entry.items.forEach(it => { if (it && it.id) payload[it.id] = it; });
            fetch(`${rtdbBase}/${entry.node}.json`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(() => {});
          }
        });
      } catch (restErr) {}

      console.log('✅ [CBAHI-Demo] تم إعداد بيانات الديمو النموذجية لسباهي بنجاح 100% ✓');

      // إشعار واجهات المستخدم بالتحديث
      window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { key: 'ksumc_safety_rounds', value: DEMO_ROUNDS } }));
      if (typeof window.renderComplianceRegistryTable === 'function') window.renderComplianceRegistryTable();
      if (typeof window.renderRoundsTables === 'function') window.renderRoundsTables();
      if (typeof window.updateFieldLiveCounters === 'function') window.updateFieldLiveCounters();
    } catch (e) {
      console.warn('[CBAHI-Demo] استثناء تهيئة بيانات الديمو:', e);
    }
  }

  // تصدير للنافذة العامة
  window.KSU_CBAHI_DEMO = {
    version: CBAHI_DEMO_VERSION,
    rounds: DEMO_ROUNDS,
    complianceRegistry: DEMO_COMPLIANCE_REGISTRY,
    permits: DEMO_PERMITS,
    doors: DEMO_DOORS,
    alarms: DEMO_ALARMS,
    capa: DEMO_CAPA,
    shiftReports: DEMO_SHIFT_REPORTS,
    notifications: DEMO_NOTIFICATIONS,
    seed: seedCBAHIDemoData
  };

  // تم إيقاف التشغيل التلقائي عند التحميل لحماية وضع التشغيل الفعلي المعتمد
  // لا يتم الحقن إلا بطلب يدوي صريح من شاشة المطور عبر: window.KSU_CBAHI_DEMO.seed(true)

})(window);

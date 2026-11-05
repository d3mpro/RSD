/**
 * ==============================================================================
 * KSUMC Smart Safety Vision Agent - Specialized Prompt Builders & Output Sanitizer
 * منصة رصد - المدينة الطبية بجامعة الملك سعود
 * ==============================================================================
 */

function resolveSubmode(submode, checklistType) {
  if (typeof submode === 'string' && submode.trim()) {
    const s = submode.trim().toLowerCase();
    if (s === 'extinguisher' || s === 'emergency_exit' || s === 'hazard' || s === 'general') {
      return s;
    }
    if (s === 'exit') return 'emergency_exit';
  }
  if (typeof checklistType === 'string' && checklistType.trim()) {
    const c = checklistType.trim().toLowerCase();
    if (c.includes('extinguisher') || c.includes('طفاية') || c.includes('طفايات') || c.includes('إطفاء')) {
      return 'extinguisher';
    }
    if (c.includes('exit') || c.includes('مخرج') || c.includes('مخارج') || c.includes('طوارئ') || c.includes('إخلاء') || c.includes('evacuation')) {
      return 'emergency_exit';
    }
    if (c.includes('hazard') || c.includes('كهرباء') || c.includes('electrical') || c.includes('panel') || c.includes('heating') || c.includes('سخان') || c.includes('أجهزة')) {
      return 'hazard';
    }
  }
  return 'general';
}

function buildExtinguisherPrompt(opts = {}) {
  const ctx = opts.riyadhCtx || {};
  const currentDate = ctx.currentDate || '2026-11-05';
  const year = ctx.year || 2026;
  const currentTime = ctx.currentTime || '11:00 AM';

  const facility = opts.facility || 'المدينة الطبية (KSUMC)';
  const building = opts.building || '';
  const floor = opts.floor || '';
  const itemLabel = opts.itemLabel || '';
  const notes = opts.notes || 'لا توجد ملاحظات إضافية';

  return `أنت خبير واستشاري السلامة والحماية من الحريق بالمدينة الطبية بجامعة الملك سعود (KSUMC) المتخصص في فحص طفايات الحريق وفق معايير CBAHI FMS.04 وكود الحريق SBC 801 ومواصفات NFPA 10.

التاريخ الفعلي الحالي للمعاينة بتوقيت الرياض: ${currentDate} (عام ${year}) والوقت: ${currentTime}.
سياق الفحص: المنشأة: ${facility} | المبنى: ${building} | الدور: ${floor} | البند/الطفاية: ${itemLabel}
ملاحظات المفتش: ${notes}

مهمتك فحص الصورة المرفقة واستخراج البيانات الفنية بدقة هندسية صارمة:
1. مقياس الضغط (Pressure Gauge):
   - افحص موقع إبرة العداد:
     * "green": إذا كانت الإبرة داخل المنطقة الخضراء السليمة (Green Zone / 100-195 psi).
     * "undercharge": إذا كانت الإبرة على اليسار في المنطقة الحمراء السفلية (ضغط منخفض بحاجة لإعادة تعبئة).
     * "overcharge": إذا كانت الإبرة على اليمين في المنطقة الحمراء العلوية (ضغط زائد خطر).
     * "unknown": إذا كان العداد غير واضح، أو طفاية CO2 بدون عداد، أو الصورة غير واضحة. لا تخمّن أبداً.
   - اكتب وصفاً دقيقاً في gauge_description.

2. بطاقة الفحص والصيانة الدورية (Inspection / Maintenance Tag):
   - تحقق من وجود بطاقة الفحص: tag_detected (true/false).
   - اقرأ آخر تاريخ صيانة مسجل على البطاقة بصيغة YYYY-MM في tag_last_date (مثال: "2026-08"). إذا لم يظهر، ضعه null أو "".
   - قارن التاريخ مع تاريخ اليوم الفعلي بتوقيت الرياض (${currentDate}):
     * إذا كان تاريخ الصيانة أقدم من سنة (12 شهراً للصيانة السنوية) أو أقدم من شهر للفحص الدوري الشهري، فالبطاقة منتهية (tag_valid: false).
     * إذا كان التاريخ ضمن الفترة النظامية السارية: tag_valid: true.
     * إذا لم تكتشف بطاقة: tag_valid: false.

3. مسمار الأمان والختم البلاستيكي (Safety Pin and Tamper Seal):
   - تحقق هل مسمار الأمان وسلك الختم البلاستيكي سليمين ومثبتين بإحكام: pin_and_seal_intact (true/false).

4. نوع الطفاية (Extinguisher Type):
   - حدد نوع الطفاية بدقة في extinguisher_type: "بودرة جافة (Dry Powder)" أو "ثاني أكسيد الكربون (CO2)" أو "رغوة (Foam)" أو "ماء (Water)" أو "غاز نظيف (Clean Agent)".

5. التقييم النهائي:
   - compliance_status: "مطابق" (إذا كان العداد أخضر والبطاقة سارية والختم سليم) أو "غير مطابق" في حال أي خلل.
   - risk_level: "منخفض" | "متوسط" | "عالي" | "عالي جداً".
   - standard_reference: "CBAHI FMS.04 / NFPA 10 / SBC 801".

أجب حصراً بكائن JSON نظيف وبدون أي نصوص مسبقة أو لاحقة:
{
  "submode": "extinguisher",
  "gauge_status": "green" | "undercharge" | "overcharge" | "unknown",
  "gauge_description": "وصف دقيق لمؤشر مقياس الضغط",
  "tag_detected": true,
  "tag_last_date": "YYYY-MM",
  "tag_valid": true,
  "pin_and_seal_intact": true,
  "extinguisher_type": "بودرة جافة (Dry Powder)",
  "compliance_status": "مطابق",
  "risk_level": "منخفض",
  "confidence_score": 95,
  "detected_element": "طفاية حريق",
  "findings_summary": "ملخص الفحص الفني للطفاية",
  "violations_list": [],
  "corrective_actions": [],
  "standard_reference": "CBAHI FMS.04 / NFPA 10 / SBC 801"
}`;
}

function buildExitPrompt(opts = {}) {
  const ctx = opts.riyadhCtx || {};
  const currentDate = ctx.currentDate || '2026-11-05';
  const year = ctx.year || 2026;
  const currentTime = ctx.currentTime || '11:00 AM';

  const facility = opts.facility || 'المدينة الطبية (KSUMC)';
  const building = opts.building || '';
  const floor = opts.floor || '';
  const itemLabel = opts.itemLabel || '';
  const notes = opts.notes || 'لا توجد ملاحظات إضافية';

  return `أنت خبير واستشاري السلامة والحماية من الحريق بالمدينة الطبية بجامعة الملك سعود (KSUMC) المتخصص في فحص مخارج الطوارئ ومسالك الهروب وفق معايير CBAHI FMS.14 وكود SBC 801 ومواصفات NFPA 101 و NFPA 80 للأبواب المقاومة للحريق.

التاريخ الفعلي الحالي للمعاينة بتوقيت الرياض: ${currentDate} (عام ${year}) والوقت: ${currentTime}.
سياق الفحص: المنشأة: ${facility} | المبنى: ${building} | الدور: ${floor} | البند/المخرج: ${itemLabel}
ملاحظات المفتش: ${notes}

مهمتك تقييم الصورة المرفقة لمخرج الطوارئ والمسار بدقة بالغة:
1. احتجاز الباب بأوتاد أو مخامد (Door Wedges / Propped Doors):
   - تحقق هل باب الطوارئ محتجز بقطعة خشبية، وتد، سلة مهملات، أو أي أداة تمنع إغلاقه التلقائي الذاتي (مخالفة صريحة لكود NFPA 80 الخاص بأبواب الحريق): door_wedged (true/false).
2. خلو المسار والمخرج ونسبة الانسداد (Clearance & Obstruction Percentage):
   - هل مخرج الطوارئ سالك تماماً وبدون عوائق: exit_clear (true/false).
   - احسب أو قدّر نسبة انسداد عرض المسار بالنسبة المئوية من 0 إلى 100: exit_obstruction_percent (0-100). إذا كان سالكاً تماماً تكون القيمة 0.
3. لوحة مخرج الطوارئ المضيئة (Illuminated Exit Sign):
   - تحقق من وجود لوحة مخرج الطوارئ وإنارتها: sign_illuminated (true / false / "unknown").
4. التقييم الهندسي:
   - compliance_status: "غير مطابق" إذا كان الباب محتجزاً (door_wedged: true) أو كان هناك عائق في المسار (exit_obstruction_percent > 0)، و"مطابق" إذا كان سالكاً ومغلقاً ذاتياً.
   - risk_level: "عالي جداً" إذا كان المخرج مغلقاً بقفل، "عالي" إذا كان محتجزاً بوتد أثناء العمل، "متوسط" إذا كان هناك عائق جزئي، "منخفض" إذا كان مطابقاً.
   - standard_reference: "CBAHI FMS.14 / NFPA 101 / NFPA 80 / SBC 801".

أجب حصراً بكائن JSON نظيف وصحيح:
{
  "submode": "emergency_exit",
  "door_wedged": false,
  "exit_clear": true,
  "exit_obstruction_percent": 0,
  "sign_illuminated": true,
  "compliance_status": "مطابق",
  "risk_level": "منخفض",
  "confidence_score": 95,
  "detected_element": "مخرج طوارئ وباب مقاوم للحريق",
  "findings_summary": "ملخص فحص مخرج الطوارئ ومسار الإخلاء",
  "violations_list": [],
  "corrective_actions": [],
  "standard_reference": "CBAHI FMS.14 / NFPA 101 / NFPA 80 / SBC 801"
}`;
}

function buildHazardPrompt(opts = {}) {
  const ctx = opts.riyadhCtx || {};
  const currentDate = ctx.currentDate || '2026-11-05';
  const year = ctx.year || 2026;
  const currentTime = ctx.currentTime || '11:00 AM';

  const facility = opts.facility || 'المدينة الطبية (KSUMC)';
  const building = opts.building || '';
  const floor = opts.floor || '';
  const itemLabel = opts.itemLabel || '';
  const notes = opts.notes || 'لا توجد ملاحظات إضافية';

  return `أنت خبير واستشاري السلامة والحماية من الحريق بالمدينة الطبية بجامعة الملك سعود (KSUMC) المتخصص في كشف المخاطر الكهربائية والحرارية والمواد القابلة للاشتعال وفق معايير CBAHI FMS.07 وكود الكهرباء NFPA 70 / SBC 401 وكود SBC 801.

التاريخ الفعلي الحالي للمعاينة بتوقيت الرياض: ${currentDate} (عام ${year}) والوقت: ${currentTime}.
سياق الفحص: المنشأة: ${facility} | المبنى: ${building} | الدور: ${floor} | الموقع: ${itemLabel}
ملاحظات المفتش: ${notes}

مهمتك تقييم الصورة المرفقة لاكتشاف أي مخاطر أو أجهزة مخالفة:
1. المخاطر الكهربائية ولوحات التوزيع (Electrical Panels & Wiring):
   - تحقق من خلو المسافة الأمامية أمام لوحات التوزيع الكهربائية بمسافة لا تقل عن 36 بوصة (90 سم) clearance_violation_36in (true/false) وفق NFPA 70.
   - تحقق من وجود أسلاك مكشوفة، توصيلات كهربائية رديئة (Extension Cords)، توصيلات متتالية (Daisy Chaining)، أو قواطع محملة بأكثر من طاقتها.
2. أجهزة التسخين والطهي المخالفة (Heating & Cooking Appliances):
   - تحقق من وجود سخانات مياه، غلايات كهربائية (Electric Kettles)، مايكرويف، أو دفايات في أماكن غير مرخصة داخل الأقسام الطبية أو غرف التمريض.
   - اذكر أسماء الأجهزة المكتشفة في قائمة detected_devices (مثال: ["غلاية ماء", "توصيلة كهربائية غير مطابقة"]).
3. التخزين العشوائي والمواد القابلة للاشتعال:
   - تخزين تحت السلالم، أو صناديق كرتون بالقرب من مصادر الحرارة.
4. نوع الخطر الرئيسي:
   - hazard_type: "electrical" | "heating_device" | "storage_combustible" | "smoking" | "other".
   - hazard_detected: true/false.
5. التقييم الهندسي:
   - compliance_status: "غير مطابق" في حال وجود أي خطر أو مخالفة، "مطابق" في حال السلامة.
   - standard_reference: "CBAHI FMS.07 / NFPA 70 / SBC 801".

أجب حصراً بكائن JSON نظيف:
{
  "submode": "hazard",
  "hazard_type": "electrical",
  "hazard_detected": true,
  "clearance_violation_36in": false,
  "detected_devices": [],
  "compliance_status": "غير مطابق",
  "risk_level": "متوسط",
  "confidence_score": 95,
  "detected_element": "لوحة كهربائية / توصيلات / أجهزة تسخين",
  "findings_summary": "ملخص تقييم المخاطر المكتشفة",
  "violations_list": [],
  "corrective_actions": [],
  "standard_reference": "CBAHI FMS.07 / NFPA 70 / SBC 801"
}`;
}

function buildGeneralPrompt(opts = {}) {
  const ctx = opts.riyadhCtx || {};
  const currentDate = ctx.currentDate || '2026-11-05';
  const year = ctx.year || 2026;
  const currentTime = ctx.currentTime || '11:00 AM';

  const facility = opts.facility || 'المدينة الطبية (KSUMC)';
  const building = opts.building || '';
  const floor = opts.floor || '';
  const checklistType = opts.checklistType || 'general';
  const itemLabel = opts.itemLabel || '';
  const notes = opts.notes || 'لا توجد ملاحظات إضافية';

  return `أنت خبير واستشاري السلامة والحماية من الحريق بالمدينة الطبية بجامعة الملك سعود (KSUMC).
قم بتقييم الصورة/الصور المرفقة وفق المعايير والأنظمة التالية بدقة صارمة:
1. معايير المركز السعودي لاعتماد المنشآت الصحية (CBAHI - معايير السلامة وإدارة المرافق FMS، وبخاصة FMS.04، FMS.05، FMS.07، FMS.11، FMS.14).
2. كود الحريق الوطني وكود البناء السعودي (SBC 801 / SBC 201).
3. مواصفات الجمعية الوطنية للحماية من الحرائق (NFPA 72 لوحات الإنذار، NFPA 101 مسالك الهروب، NFPA 99، NFPA 10 طفايات الحريق، NFPA 13 رشاشات المياه).
4. لائحة مكافحة التدخين بالمنشآت الحكومية والصحية (المرسوم الملكي م/56).

التاريخ الفعلي للمعاينة بتوقيت الرياض: ${currentDate} (عام ${year}) والوقت: ${currentTime}.
سياق الفحص: المنشأة: ${facility} | المبنى: ${building} | الدور: ${floor} | نوع الفحص: ${checklistType} | البند/الغرفة: ${itemLabel}
ملاحظات المفتش الميداني: ${notes}

أجب بصيغة JSON نظيفة وصحيحة فقط على الشكل التالي:
{
  "submode": "general",
  "hazard_detected": false,
  "compliance_status": "مطابق",
  "risk_level": "منخفض",
  "confidence_score": 96,
  "detected_element": "وصف دقيق للمعدة أو العنصر أو الخطر الظاهر في الصورة",
  "detected_devices": [],
  "findings_summary": "ملخص الملاحظات والمخاطر المكتشفة بأسلوب هندسي ورقابي رصين",
  "violations_list": [],
  "corrective_actions": [],
  "standard_reference": "CBAHI FMS / SBC 801 / NFPA",
  "inspector_recommendation": "توجيه مهني فوري للمفتش الميداني",
  "suggested_directive": "التوجيه الإداري المقترح لمدير إدارة السلامة"
}`;
}

function buildVisionPrompt(arg1, arg2) {
  let opts = {};
  if (arg1 && typeof arg1 === 'object' && arg2 && typeof arg2 === 'object') {
    opts = { riyadhCtx: arg1, ...arg2 };
  } else if (arg1 && typeof arg1 === 'object') {
    opts = arg1;
  }

  const submode = resolveSubmode(opts.submode, opts.checklistType);

  switch (submode) {
    case 'extinguisher':
      return buildExtinguisherPrompt(opts);
    case 'emergency_exit':
      return buildExitPrompt(opts);
    case 'hazard':
      return buildHazardPrompt(opts);
    case 'general':
    default:
      return buildGeneralPrompt(opts);
  }
}

function sanitizeVisionOutput(parsedData = {}, riyadhCtx = {}, submode = 'general') {
  const curDate = (riyadhCtx && riyadhCtx.currentDate) || new Date().toISOString().split('T')[0];
  const targetSubmode = resolveSubmode(submode || parsedData.submode, parsedData.checklistType);

  function cleanTxt(txt) {
    if (!txt || typeof txt !== 'string') return txt;
    let s = txt.replace(/تاريخ مستقبلي\s*\(.*?\)/gi, `تاريخ اليوم الفعلي (${curDate}) بتوقيت الرياض`);
    s = s.replace(/تاريخ مستقبلي/gi, 'تاريخ الحدث الفعلي الميداني');
    s = s.replace(/عدم دقة الوقت والتاريخ على شاشة لوحة FACP[^\.\n،]*/gi, '');
    return s.trim();
  }

  const result = { ...parsedData };

  if (result.findings_summary) {
    result.findings_summary = cleanTxt(result.findings_summary);
  }

  if (Array.isArray(result.violations_list)) {
    result.violations_list = result.violations_list
      .filter(v => v && !String(v).includes('عدم دقة الوقت والتاريخ') && !String(v).includes('تاريخ مستقبلي'))
      .map(cleanTxt);
  } else {
    result.violations_list = [];
  }

  if (Array.isArray(result.corrective_actions)) {
    result.corrective_actions = result.corrective_actions
      .filter(c => c && !String(c).includes('ضبط وتحديث الوقت والتاريخ') && !String(c).includes('تاريخ مستقبلي'))
      .map(cleanTxt);
  } else {
    result.corrective_actions = ['استمرار المتابعة الدورية وتوثيق الفحص'];
  }

  // Base universal fallbacks
  result.submode = targetSubmode;
  if (!result.compliance_status) result.compliance_status = result.violations_list.length > 0 ? 'غير مطابق' : 'مطابق';
  if (!result.risk_level) result.risk_level = result.violations_list.length > 0 ? 'متوسط' : 'منخفض';
  if (typeof result.confidence_score !== 'number') result.confidence_score = 95;
  if (!result.detected_element) result.detected_element = 'عنصر / معدة سلامة ميدانية';
  if (!result.findings_summary) {
    result.findings_summary = 'تم فحص الموقع وتدقيق الاشتراطات الهندسية وفق معايير CBAHI FMS و NFPA.';
  }
  if (!result.standard_reference) result.standard_reference = 'CBAHI FMS / SBC 801 / NFPA';

  // Submode specific and safe cross-defaults
  if (targetSubmode === 'extinguisher') {
    if (!result.gauge_status) result.gauge_status = 'unknown';
    if (!result.gauge_description) result.gauge_description = '';
    result.tag_detected = Boolean(result.tag_detected);
    result.tag_last_date = result.tag_last_date || '';
    result.tag_valid = Boolean(result.tag_valid);
    result.pin_and_seal_intact = result.pin_and_seal_intact !== undefined ? Boolean(result.pin_and_seal_intact) : true;
    if (!result.extinguisher_type) result.extinguisher_type = 'بودرة جافة (Dry Powder)';
    result.standard_reference = result.standard_reference || 'CBAHI FMS.04 / NFPA 10 / SBC 801';
  } else if (targetSubmode === 'emergency_exit') {
    result.door_wedged = Boolean(result.door_wedged);
    result.exit_clear = result.exit_clear !== undefined ? Boolean(result.exit_clear) : !result.door_wedged;
    result.exit_obstruction_percent = typeof result.exit_obstruction_percent === 'number' ? result.exit_obstruction_percent : (result.door_wedged ? 25 : 0);
    if (result.sign_illuminated === undefined) result.sign_illuminated = 'unknown';
    result.standard_reference = result.standard_reference || 'CBAHI FMS.14 / NFPA 101 / NFPA 80 / SBC 801';
  } else if (targetSubmode === 'hazard') {
    result.hazard_detected = result.hazard_detected !== undefined ? Boolean(result.hazard_detected) : (result.violations_list.length > 0);
    result.clearance_violation_36in = Boolean(result.clearance_violation_36in);
    if (!Array.isArray(result.detected_devices)) result.detected_devices = [];
    if (!result.hazard_type) result.hazard_type = 'other';
    result.standard_reference = result.standard_reference || 'CBAHI FMS.07 / NFPA 70 / SBC 801';
  }

  // Cross-default guarantees so callers can safely destructure or access
  if (result.gauge_status === undefined) result.gauge_status = 'unknown';
  if (result.tag_detected === undefined) result.tag_detected = false;
  if (result.tag_valid === undefined) result.tag_valid = false;
  if (result.pin_and_seal_intact === undefined) result.pin_and_seal_intact = true;
  if (result.door_wedged === undefined) result.door_wedged = false;
  if (result.exit_clear === undefined) result.exit_clear = true;
  if (result.exit_obstruction_percent === undefined) result.exit_obstruction_percent = 0;
  if (result.hazard_detected === undefined) result.hazard_detected = result.violations_list.length > 0 || result.compliance_status === 'غير مطابق';
  if (result.clearance_violation_36in === undefined) result.clearance_violation_36in = false;
  if (!Array.isArray(result.detected_devices)) result.detected_devices = [];

  return result;
}

module.exports = {
  resolveSubmode,
  buildExtinguisherPrompt,
  buildExitPrompt,
  buildHazardPrompt,
  buildGeneralPrompt,
  buildVisionPrompt,
  sanitizeVisionOutput
};

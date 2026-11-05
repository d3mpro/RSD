const test = require('node:test');
const assert = require('node:assert/strict');

test('Prompt builder exports all required specialized builders and helpers', () => {
  const promptBuilder = require('./prompt_builder.js');
  assert.equal(typeof promptBuilder.buildExtinguisherPrompt, 'function');
  assert.equal(typeof promptBuilder.buildExitPrompt, 'function');
  assert.equal(typeof promptBuilder.buildHazardPrompt, 'function');
  assert.equal(typeof promptBuilder.buildVisionPrompt, 'function');
  assert.equal(typeof promptBuilder.resolveSubmode, 'function');
  assert.equal(typeof promptBuilder.sanitizeVisionOutput, 'function');
});

test('resolveSubmode resolves explicit and inferred submodes correctly', () => {
  const { resolveSubmode } = require('./prompt_builder.js');
  assert.equal(resolveSubmode('extinguisher'), 'extinguisher');
  assert.equal(resolveSubmode('emergency_exit'), 'emergency_exit');
  assert.equal(resolveSubmode('exit'), 'emergency_exit');
  assert.equal(resolveSubmode('hazard'), 'hazard');
  assert.equal(resolveSubmode('general'), 'general');

  // Inferred from checklistType
  assert.equal(resolveSubmode(null, 'fire_extinguishers'), 'extinguisher');
  assert.equal(resolveSubmode(undefined, 'طفايات الحريق ومعدات الإطفاء'), 'extinguisher');
  assert.equal(resolveSubmode('', 'emergency_exits_doors'), 'emergency_exit');
  assert.equal(resolveSubmode(null, 'مخارج الطوارئ ومسارات الإخلاء'), 'emergency_exit');
  assert.equal(resolveSubmode(null, 'electrical_panel_hazards'), 'hazard');
  assert.equal(resolveSubmode(null, 'مخاطر التمديدات والأجهزة الكهربائية'), 'hazard');
  assert.equal(resolveSubmode(null, 'general_safety_round'), 'general');
  assert.equal(resolveSubmode(null, null), 'general');
});

test('buildExtinguisherPrompt produces comprehensive extinguisher requirements', () => {
  const { buildExtinguisherPrompt } = require('./prompt_builder.js');
  const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
  const prompt = buildExtinguisherPrompt({
    riyadhCtx: ctx,
    facility: 'KSUMC',
    building: 'المستشفى الرئيسي',
    floor: 'الدور الأرضي',
    itemLabel: 'طفاية رقم FE-01',
    notes: 'فحص دوري شهري'
  });

  // Gauge requirements
  assert.ok(prompt.includes('gauge_status'));
  assert.ok(prompt.includes('green'));
  assert.ok(prompt.includes('undercharge'));
  assert.ok(prompt.includes('overcharge'));
  assert.ok(prompt.includes('100-195 psi') || prompt.includes('Green'));

  // Tag requirements
  assert.ok(prompt.includes('tag_last_date'));
  assert.ok(prompt.includes('tag_valid'));
  assert.ok(prompt.includes('tag_detected'));
  assert.ok(prompt.includes('YYYY-MM'));

  // Seal & pin
  assert.ok(prompt.includes('pin_and_seal_intact'));

  // Extinguisher type
  assert.ok(prompt.includes('extinguisher_type'));

  // Standards
  assert.ok(prompt.includes('CBAHI FMS.04'));
  assert.ok(prompt.includes('NFPA 10'));
  assert.ok(prompt.includes('SBC 801'));

  // Context
  assert.ok(prompt.includes('2026-11-05'));
  assert.ok(prompt.includes('المستشفى الرئيسي'));
});

test('buildExitPrompt produces emergency exit inspection requirements', () => {
  const { buildExitPrompt } = require('./prompt_builder.js');
  const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
  const prompt = buildExitPrompt({
    riyadhCtx: ctx,
    facility: 'KSUMC',
    building: 'مركز الأورام',
    floor: 'الدور الأول',
    itemLabel: 'مخرج طوارئ EX-04',
    notes: 'ملاحظة احتمال وجود وتد خشبي'
  });

  assert.ok(prompt.includes('emergency_exit'));
  assert.ok(prompt.includes('door_wedged'));
  assert.ok(prompt.includes('exit_clear'));
  assert.ok(prompt.includes('exit_obstruction_percent'));
  assert.ok(prompt.includes('NFPA 80'));
  assert.ok(prompt.includes('NFPA 101'));
  assert.ok(prompt.includes('CBAHI FMS.14'));
  assert.ok(prompt.includes('مركز الأورام'));
});

test('buildHazardPrompt produces electrical and general hazard inspection requirements', () => {
  const { buildHazardPrompt } = require('./prompt_builder.js');
  const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
  const prompt = buildHazardPrompt({
    riyadhCtx: ctx,
    facility: 'KSUMC',
    building: 'المبنى الطبي',
    floor: 'القبو',
    itemLabel: 'غرفة الكهرباء الرئيسية'
  });

  assert.ok(prompt.includes('hazard'));
  assert.ok(prompt.includes('clearance_violation_36in') || prompt.includes('clearance'));
  assert.ok(prompt.includes('36') || prompt.includes('90'));
  assert.ok(prompt.includes('detected_devices'));
  assert.ok(prompt.includes('CBAHI FMS.07'));
  assert.ok(prompt.includes('NFPA 70'));
});

test('buildVisionPrompt dispatches according to submode', () => {
  const { buildVisionPrompt } = require('./prompt_builder.js');
  const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };

  const extPrompt = buildVisionPrompt(ctx, { submode: 'extinguisher' });
  assert.ok(extPrompt.includes('"submode": "extinguisher"'));

  const exitPrompt = buildVisionPrompt(ctx, { submode: 'emergency_exit' });
  assert.ok(exitPrompt.includes('"submode": "emergency_exit"'));

  const hazPrompt = buildVisionPrompt(ctx, { submode: 'hazard' });
  assert.ok(hazPrompt.includes('"submode": "hazard"'));

  const genPrompt = buildVisionPrompt(ctx, { submode: 'general' });
  assert.ok(genPrompt.includes('hazard_detected'));
});

test('sanitizeVisionOutput applies safe defaults across submodes', () => {
  const { sanitizeVisionOutput } = require('./prompt_builder.js');
  const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };

  // Empty extinguisher output
  const cleanExt = sanitizeVisionOutput({}, ctx, 'extinguisher');
  assert.equal(cleanExt.submode, 'extinguisher');
  assert.equal(cleanExt.gauge_status, 'unknown');
  assert.equal(cleanExt.tag_detected, false);
  assert.equal(cleanExt.tag_valid, false);
  assert.equal(cleanExt.pin_and_seal_intact, true);
  assert.equal(cleanExt.compliance_status, 'مطابق');

  // Empty exit output
  const cleanExit = sanitizeVisionOutput({}, ctx, 'emergency_exit');
  assert.equal(cleanExit.submode, 'emergency_exit');
  assert.equal(cleanExit.door_wedged, false);
  assert.equal(cleanExit.exit_clear, true);
  assert.equal(cleanExit.exit_obstruction_percent, 0);

  // Future date hallucination cleanup
  const hallucinatory = {
    submode: 'extinguisher',
    findings_summary: 'تم رصد تاريخ مستقبلي (2026-12-01) على العداد',
    violations_list: ['تاريخ مستقبلي على لوحة الإنذار', 'عدم دقة الوقت والتاريخ على شاشة لوحة FACP']
  };
  const sanitized = sanitizeVisionOutput(hallucinatory, ctx, 'extinguisher');
  assert.ok(!sanitized.findings_summary.includes('تاريخ مستقبلي (2026-12-01)'));
  assert.equal(sanitized.violations_list.length, 0);

  // Preservation of valid parsed values
  const parsedExt = {
    submode: 'extinguisher',
    gauge_status: 'undercharge',
    gauge_description: 'الإبرة في المنطقة الحمراء اليسرى',
    tag_detected: true,
    tag_last_date: '2025-01',
    tag_valid: false,
    pin_and_seal_intact: false,
    extinguisher_type: 'ثاني أكسيد الكربون (CO2)',
    compliance_status: 'غير مطابق',
    violations_list: ['انخفاض ضغط الطفاية', 'مسمار الأمان غير موجود']
  };
  const verifiedExt = sanitizeVisionOutput(parsedExt, ctx, 'extinguisher');
  assert.equal(verifiedExt.gauge_status, 'undercharge');
  assert.equal(verifiedExt.tag_last_date, '2025-01');
  assert.equal(verifiedExt.tag_valid, false);
  assert.equal(verifiedExt.pin_and_seal_intact, false);
  assert.equal(verifiedExt.extinguisher_type, 'ثاني أكسيد الكربون (CO2)');
  assert.equal(verifiedExt.violations_list.length, 2);
});

test('agent_server exports required helpers and initializes successfully', () => {
  const serverModule = require('./agent_server.js');
  assert.ok(serverModule.server);
  assert.equal(typeof serverModule.resolveSubmode, 'function');
  assert.equal(typeof serverModule.buildVisionPrompt, 'function');
  assert.equal(typeof serverModule.sanitizeVisionOutput, 'function');
});


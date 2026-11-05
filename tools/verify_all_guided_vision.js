/**
 * ==============================================================================
 * KSUMC Safety Platform - Guided Vision Inspection System
 * Unified Master Verification & End-to-End Regression Test Suite
 * ==============================================================================
 * Covers all 5 tasks and 7 core test suites:
 * 1. Backend Prompts & Submode Resolution (oracle-vision-agent/prompt_builder.js & agent_server.js)
 * 2. SVG Reticle Viewfinder & Submode Tabs (assets/js/vision-reticle-helper.js & styles.css)
 * 3. Result Card Formatters & AI Bridge (formatSpecializedAssetCard & ksu-ai-client.js)
 * 4. In-Round Asset State Immutability & Auto-Fill (updateAssetInspectionState & mapVisionToChecklistFields)
 * 5. Standalone Quick Scan Dispatchers (prepareViolationFromVision & prepareNewRoundFromVision)
 * 6. Full JavaScript Syntax Check on all modified components
 * 7. field.html DOM Integrity & Modal Element Validation
 * ==============================================================================
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

// File paths
const promptBuilderPath = path.resolve(__dirname, '../oracle-vision-agent/prompt_builder.js');
const agentServerPath = path.resolve(__dirname, '../oracle-vision-agent/agent_server.js');
const reticleHelperPath = path.resolve(__dirname, '../assets/js/vision-reticle-helper.js');
const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');
const stylesCssPath = path.resolve(__dirname, '../assets/css/styles.css');
const fieldHtmlPath = path.resolve(__dirname, '../field.html');

// Safe localStorage mock
const mockStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
if (!globalThis.localStorage) {
  globalThis.localStorage = mockStorage;
}

// ==============================================================================
// Helper Mock DOM Element for UI / Integration tests
// ==============================================================================
class MockClassList {
  constructor() {
    this._set = new Set();
  }
  add(...tokens) {
    tokens.forEach(t => this._set.add(t));
  }
  remove(...tokens) {
    tokens.forEach(t => this._set.delete(t));
  }
  contains(token) {
    return this._set.has(token);
  }
  toggle(token) {
    if (this._set.has(token)) {
      this._set.delete(token);
      return false;
    } else {
      this._set.add(token);
      return true;
    }
  }
}

class MockElement {
  constructor(id = '', tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList();
    this.attributes = {};
    this.value = '';
    this.checked = false;
    this.style = {};
    this.children = [];
    this._eventListeners = {};
    this.removed = false;
    this.innerHTML = '';
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(evt, fn) {
    this._eventListeners[evt] = this._eventListeners[evt] || [];
    this._eventListeners[evt].push(fn);
  }
  dispatchEvent(evt) {
    const fns = this._eventListeners[evt?.type || evt] || [];
    fns.forEach(fn => fn(evt));
    return true;
  }
  querySelector(selector) {
    if (selector.startsWith('#')) {
      const targetId = selector.slice(1).split(',')[0].trim();
      return globalThis.document?.getElementById(targetId) || null;
    }
    return null;
  }
  querySelectorAll() { return []; }
  remove() { this.removed = true; }
}

// ==============================================================================
// TEST SUITE 1: Backend Prompts & Submode Resolution
// ==============================================================================
describe('Suite 1: Backend Prompts & Submode Resolution', () => {
  const promptBuilder = require(promptBuilderPath);
  const agentServer = require(agentServerPath);

  it('1.1: prompt_builder exports all required specialized builders and helpers', () => {
    assert.equal(typeof promptBuilder.buildExtinguisherPrompt, 'function');
    assert.equal(typeof promptBuilder.buildExitPrompt, 'function');
    assert.equal(typeof promptBuilder.buildHazardPrompt, 'function');
    assert.equal(typeof promptBuilder.buildVisionPrompt, 'function');
    assert.equal(typeof promptBuilder.resolveSubmode, 'function');
    assert.equal(typeof promptBuilder.sanitizeVisionOutput, 'function');
  });

  it('1.2: agent_server exports required server and helper bindings', () => {
    assert.ok(agentServer.server, 'agentServer must export server');
    assert.ok(agentServer.CONFIG, 'agentServer must export CONFIG');
    assert.ok(agentServer.STATE, 'agentServer must export STATE');
    assert.equal(typeof agentServer.resolveSubmode, 'function');
    assert.equal(typeof agentServer.buildVisionPrompt, 'function');
    assert.equal(typeof agentServer.sanitizeVisionOutput, 'function');
  });

  it('1.3: resolveSubmode resolves explicit submodes and normalizes aliases', () => {
    const { resolveSubmode } = promptBuilder;
    assert.equal(resolveSubmode('extinguisher'), 'extinguisher');
    assert.equal(resolveSubmode('emergency_exit'), 'emergency_exit');
    assert.equal(resolveSubmode('exit'), 'emergency_exit', 'alias "exit" must map to "emergency_exit"');
    assert.equal(resolveSubmode('hazard'), 'hazard');
    assert.equal(resolveSubmode('general'), 'general');
  });

  it('1.4: resolveSubmode infers submodes accurately from checklistType or item titles', () => {
    const { resolveSubmode } = promptBuilder;
    assert.equal(resolveSubmode(null, 'fire_extinguishers'), 'extinguisher');
    assert.equal(resolveSubmode(undefined, 'طفايات الحريق ومعدات الإطفاء'), 'extinguisher');
    assert.equal(resolveSubmode('', 'emergency_exits_doors'), 'emergency_exit');
    assert.equal(resolveSubmode(null, 'مخارج الطوارئ ومسارات الإخلاء'), 'emergency_exit');
    assert.equal(resolveSubmode(null, 'electrical_panel_hazards'), 'hazard');
    assert.equal(resolveSubmode(null, 'مخاطر التمديدات والأجهزة الكهربائية'), 'hazard');
    assert.equal(resolveSubmode(null, 'general_safety_round'), 'general');
    assert.equal(resolveSubmode(null, null), 'general');
    assert.equal(resolveSubmode(undefined, undefined), 'general');
  });

  it('1.5: buildExtinguisherPrompt produces comprehensive NFPA 10 & CBAHI requirements', () => {
    const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
    const prompt = promptBuilder.buildExtinguisherPrompt({
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

    // Pin and seal
    assert.ok(prompt.includes('pin_and_seal_intact'));
    assert.ok(prompt.includes('extinguisher_type'));

    // Standards & contextual data
    assert.ok(prompt.includes('CBAHI FMS.04'));
    assert.ok(prompt.includes('NFPA 10'));
    assert.ok(prompt.includes('SBC 801'));
    assert.ok(prompt.includes('2026-11-05'));
    assert.ok(prompt.includes('المستشفى الرئيسي'));
  });

  it('1.6: buildExitPrompt produces emergency exit & CBAHI FMS.14 / NFPA 80 / 101 requirements', () => {
    const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
    const prompt = promptBuilder.buildExitPrompt({
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

  it('1.7: buildHazardPrompt produces electrical clearance & NFPA 70 / CBAHI FMS.07 requirements', () => {
    const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
    const prompt = promptBuilder.buildHazardPrompt({
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

  it('1.8: buildVisionPrompt dispatches according to submode', () => {
    const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };
    const extPrompt = promptBuilder.buildVisionPrompt(ctx, { submode: 'extinguisher' });
    assert.ok(extPrompt.includes('"submode": "extinguisher"'));

    const exitPrompt = promptBuilder.buildVisionPrompt(ctx, { submode: 'emergency_exit' });
    assert.ok(exitPrompt.includes('"submode": "emergency_exit"'));

    const hazPrompt = promptBuilder.buildVisionPrompt(ctx, { submode: 'hazard' });
    assert.ok(hazPrompt.includes('"submode": "hazard"'));

    const genPrompt = promptBuilder.buildVisionPrompt(ctx, { submode: 'general' });
    assert.ok(genPrompt.includes('hazard_detected'));
  });

  it('1.9: sanitizeVisionOutput applies safe defaults and cleans hallucinated future dates', () => {
    const ctx = { currentDate: '2026-11-05', year: 2026, currentTime: '11:00 AM' };

    // Empty extinguisher
    const cleanExt = promptBuilder.sanitizeVisionOutput({}, ctx, 'extinguisher');
    assert.equal(cleanExt.submode, 'extinguisher');
    assert.equal(cleanExt.gauge_status, 'unknown');
    assert.equal(cleanExt.tag_detected, false);
    assert.equal(cleanExt.tag_valid, false);
    assert.equal(cleanExt.pin_and_seal_intact, true);
    assert.equal(cleanExt.compliance_status, 'مطابق');

    // Empty exit
    const cleanExit = promptBuilder.sanitizeVisionOutput({}, ctx, 'emergency_exit');
    assert.equal(cleanExit.submode, 'emergency_exit');
    assert.equal(cleanExit.door_wedged, false);
    assert.equal(cleanExit.exit_clear, true);
    assert.equal(cleanExit.exit_obstruction_percent, 0);

    // Hallucination cleaning
    const hallucinatory = {
      submode: 'extinguisher',
      findings_summary: 'تم رصد تاريخ مستقبلي (2026-12-01) على العداد',
      violations_list: ['تاريخ مستقبلي على لوحة الإنذار', 'عدم دقة الوقت والتاريخ على شاشة لوحة FACP']
    };
    const sanitized = promptBuilder.sanitizeVisionOutput(hallucinatory, ctx, 'extinguisher');
    assert.ok(!sanitized.findings_summary.includes('تاريخ مستقبلي (2026-12-01)'));
    assert.equal(sanitized.violations_list.length, 0);
  });
});

// ==============================================================================
// TEST SUITE 2: SVG Reticle Viewfinder & Submode Tabs
// ==============================================================================
describe('Suite 2: SVG Reticle Viewfinder & Submode Tabs', () => {
  const reticleHelper = require(reticleHelperPath);

  it('2.1: reticle helper exports required viewfinder generators and helpers', () => {
    assert.equal(typeof reticleHelper.getReticleSvg, 'function');
    assert.equal(typeof reticleHelper.getSubmodeList, 'function');
    assert.equal(typeof reticleHelper.resolveSubmodeLabel, 'function');
    assert.equal(typeof reticleHelper.renderReticleInto, 'function');
  });

  it('2.2: getSubmodeList returns exactly the 4 expected safety inspection submodes', () => {
    const list = reticleHelper.getSubmodeList();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 4);

    const ids = list.map(item => item.id);
    assert.deepEqual(ids, ['extinguisher', 'emergency_exit', 'hazard', 'general']);

    const extinguisherItem = list.find(item => item.id === 'extinguisher');
    assert.ok(extinguisherItem.label.includes('طفايات') || extinguisherItem.fullLabel?.includes('طفايات'));
    assert.ok(extinguisherItem.icon.includes('🧯'));

    const exitItem = list.find(item => item.id === 'emergency_exit');
    assert.ok(exitItem.label.includes('مخارج') || exitItem.fullLabel?.includes('مخارج'));

    const hazardItem = list.find(item => item.id === 'hazard');
    assert.ok(hazardItem.label.includes('مخاطر') || hazardItem.label.includes('كهربائية'));

    const generalItem = list.find(item => item.id === 'general');
    assert.ok(generalItem.label.includes('عام'));
  });

  it('2.3: resolveSubmodeLabel maps submodes to Arabic labels with general fallback', () => {
    assert.ok(reticleHelper.resolveSubmodeLabel('extinguisher').includes('طفا'));
    assert.ok(reticleHelper.resolveSubmodeLabel('emergency_exit').includes('مخار') || reticleHelper.resolveSubmodeLabel('emergency_exit').includes('طوارئ'));
    assert.ok(reticleHelper.resolveSubmodeLabel('hazard').includes('مخاطر') || reticleHelper.resolveSubmodeLabel('hazard').includes('كهرب'));
    assert.ok(reticleHelper.resolveSubmodeLabel('general').includes('عام'));
    assert.ok(reticleHelper.resolveSubmodeLabel('unknown_xyz').includes('عام'));
  });

  it('2.4: getReticleSvg renders specialized elements and exact Arabic guidance for all submodes', () => {
    // Extinguisher
    const extSvg = reticleHelper.getReticleSvg('extinguisher');
    assert.ok(extSvg.includes('<svg') && extSvg.includes('</svg>'));
    assert.ok(extSvg.includes('ksu-reticle-overlay'));
    assert.ok(extSvg.includes('gauge-target-circle'));
    assert.ok(extSvg.includes('tag-target-rect'));
    assert.ok(extSvg.includes('ضع عداد الضغط داخل الدائرة وبطاقة الصيانة داخل المستطيل'));

    // Emergency Exit
    const exitSvg = reticleHelper.getReticleSvg('emergency_exit');
    assert.ok(exitSvg.includes('door-target-frame'));
    assert.ok(exitSvg.includes('floor-target-path'));
    assert.ok(exitSvg.includes('حدد إطار الباب ومسار الخروج بالكامل'));

    // Hazard
    const hazSvg = reticleHelper.getReticleSvg('hazard');
    assert.ok(hazSvg.includes('hazard-target-crosshair') || hazSvg.includes('hazard-zone-grid') || hazSvg.includes('hazard-target-grid'));
    assert.ok(hazSvg.includes('وجّه العدسة نحو اللوحة الكهربائية أو مصدر الخطر'));

    // General
    const genSvg = reticleHelper.getReticleSvg('general');
    assert.ok(genSvg.includes('general-crosshair') || genSvg.includes('reticle-crosshair'));
    assert.ok(genSvg.includes('وجّه الكاميرا نحو العنصر المراد فحصه'));
  });

  it('2.5: getReticleSvg supports options customization (showGuideText, guideText, viewBox)', () => {
    const noText = reticleHelper.getReticleSvg('extinguisher', { showGuideText: false });
    assert.ok(!noText.includes('ضع عداد الضغط'));

    const customText = reticleHelper.getReticleSvg('general', { guideText: 'توجيه تجريبي مخصص' });
    assert.ok(customText.includes('توجيه تجريبي مخصص'));

    const customBox = reticleHelper.getReticleSvg('hazard', { viewBox: '0 0 800 800', width: '400px' });
    assert.ok(customBox.includes('viewBox="0 0 800 800"'));
    assert.ok(customBox.includes('width="400px"'));
  });

  it('2.6: styles.css contains all required reticle and submode tab CSS classes', () => {
    const css = fs.readFileSync(stylesCssPath, 'utf8');
    assert.ok(css.includes('.ksu-reticle-overlay'));
    assert.ok(css.includes('.reticle-pulse-glow'));
    assert.ok(css.includes('.gauge-target-circle'));
    assert.ok(css.includes('.tag-target-rect'));
    assert.ok(css.includes('.reticle-hint-badge'));
    assert.ok(css.includes('pointer-events: none'));
    assert.ok(css.includes('.vision-submode-tab'));
  });
});

// ==============================================================================
// TEST SUITE 3: Result Card Formatters & AI Bridge
// ==============================================================================
describe('Suite 3: Result Card Formatters & AI Bridge', () => {
  const reticleHelper = require(reticleHelperPath);

  it('3.1: reticle helper exports all specialized result badge and card formatters', () => {
    assert.equal(typeof reticleHelper.formatExtinguisherBadge, 'function');
    assert.equal(typeof reticleHelper.formatExitBadge, 'function');
    assert.equal(typeof reticleHelper.formatHazardBadge, 'function');
    assert.equal(typeof reticleHelper.formatSpecializedAssetCard, 'function');
  });

  it('3.2: formatExtinguisherBadge formats green, undercharge, and overcharge conditions', () => {
    // Compliant
    const green = reticleHelper.formatExtinguisherBadge({
      gauge_status: 'green',
      tag_detected: true,
      tag_last_date: '2026-05',
      tag_valid: true,
      pin_and_seal_intact: true,
      extinguisher_type: 'بودرة جافة (ABC)'
    });
    assert.ok(green.includes('مؤشر الضغط في النطاق الأخضر') || green.includes('🟢'));
    assert.ok(green.includes('2026-05'));
    assert.ok(green.includes('سارية') || green.includes('صالحة'));
    assert.ok(green.includes('سليم'));

    // Undercharged & expired
    const under = reticleHelper.formatExtinguisherBadge({
      gauge_status: 'undercharge',
      tag_detected: true,
      tag_last_date: '2024-01',
      tag_valid: false,
      pin_and_seal_intact: false
    });
    assert.ok(under.includes('منخفض') || under.includes('إعادة التعبئة'));
    assert.ok(under.includes('منتهية الصلاحية') || under.includes('غير سارية'));
    assert.ok(under.includes('مفقود') || under.includes('مكسور'));

    // Overcharged & missing tag
    const over = reticleHelper.formatExtinguisherBadge({
      gauge_status: 'overcharge',
      tag_detected: false,
      pin_and_seal_intact: true
    });
    assert.ok(over.includes('مرتفع') || over.includes('زيادة الضغط'));
    assert.ok(over.includes('غير متوفرة') || over.includes('غير موجودة') || over.includes('مفقودة'));
  });

  it('3.3: formatExitBadge renders door wedging alert and obstruction percentages', () => {
    // Wedged door
    const wedged = reticleHelper.formatExitBadge({
      door_wedged: true,
      exit_obstruction_percent: 50,
      exit_clear: false,
      exit_sign_illuminated: true
    });
    assert.ok(wedged.includes('تنبيه حرج') || wedged.includes('مثبت بوتد'));
    assert.ok(wedged.includes('50%'));
    assert.ok(wedged.includes('CBAHI FMS.14') || wedged.includes('NFPA 80'));

    // Clear door
    const clear = reticleHelper.formatExitBadge({
      door_wedged: false,
      exit_obstruction_percent: 0,
      exit_clear: true,
      exit_sign_illuminated: true
    });
    assert.ok(!clear.includes('🚨 تنبيه حرج'));
    assert.ok(clear.includes('0%') || clear.includes('خالٍ تماماً') || clear.includes('100%'));
  });

  it('3.4: formatHazardBadge renders clearance violations and detected devices', () => {
    const viol = reticleHelper.formatHazardBadge({
      clearance_violation_36in: true,
      detected_devices: ['سخان ماء كهربائي', 'توصيلة رديئة'],
      hazard_detected: true
    });
    assert.ok(viol.includes('36') || viol.includes('90 سم') || viol.includes('مسافة الخلو'));
    assert.ok(viol.includes('سخان ماء كهربائي'));
    assert.ok(viol.includes('توصيلة رديئة'));

    const safe = reticleHelper.formatHazardBadge({
      clearance_violation_36in: false,
      detected_devices: []
    });
    assert.ok(safe.includes('مسافة خلو آمنة') || safe.includes('مستوفي') || safe.includes('سليمة'));
  });

  it('3.5: formatSpecializedAssetCard accurately dispatches by submode or returns empty string', () => {
    const extCard = reticleHelper.formatSpecializedAssetCard({ submode: 'extinguisher', gauge_status: 'green' });
    assert.ok(extCard.includes('مؤشر الضغط') || extCard.includes('طفايات'));

    const exitCard = reticleHelper.formatSpecializedAssetCard({ submode: 'emergency_exit', door_wedged: true });
    assert.ok(exitCard.includes('مخرج') || exitCard.includes('إخلاء') || exitCard.includes('طوارئ'));

    const hazCard = reticleHelper.formatSpecializedAssetCard({ submode: 'hazard', clearance_violation_36in: true });
    assert.ok(hazCard.includes('36') || hazCard.includes('كهربائية') || hazCard.includes('خلو'));

    const genCard = reticleHelper.formatSpecializedAssetCard({ submode: 'general' });
    assert.ok(genCard === '' || genCard.includes('عام'));

    const nullCard = reticleHelper.formatSpecializedAssetCard(null);
    assert.equal(nullCard, '');
  });

  it('3.6: ksu-ai-client.js integrates formatSpecializedAssetCard in renderVisionInspectionResults and heuristicVisualAnalysis', () => {
    const clientCode = fs.readFileSync(aiClientPath, 'utf8');
    assert.ok(clientCode.includes('formatSpecializedAssetCard'));
    assert.ok(clientCode.includes('gauge_status'));
    assert.ok(clientCode.includes('door_wedged'));
    assert.ok(clientCode.includes('clearance_violation_36in'));
  });
});

// ==============================================================================
// TEST SUITE 4: In-Round Asset State Immutability & Auto-Fill Mapping
// ==============================================================================
describe('Suite 4: In-Round Asset State Immutability & Auto-Fill Mapping', () => {
  const reticleHelper = require(reticleHelperPath);

  it('4.1: reticle helper exports updateAssetInspectionState and mapVisionToChecklistFields', () => {
    assert.equal(typeof reticleHelper.updateAssetInspectionState, 'function');
    assert.equal(typeof reticleHelper.mapVisionToChecklistFields, 'function');
  });

  it('4.2: updateAssetInspectionState is pure, immutable, and preserves other assets without side effects', () => {
    const initial = {
      'FE-01': { inspected: false, passed: false },
      'FE-02': { inspected: true, passed: true, gauge_status: 'green' }
    };
    const snapshot = JSON.parse(JSON.stringify(initial));

    const inspection = {
      compliance_status: 'مطابق',
      hazard_detected: false,
      gauge_status: 'green',
      tag_last_date: '2026-05',
      tag_valid: true,
      pin_and_seal_intact: true,
      door_wedged: false,
      exit_obstruction_percent: 0,
      submode: 'extinguisher',
      findings_summary: 'طفاية حريق سليمة ومطابقة'
    };

    const updated = reticleHelper.updateAssetInspectionState(initial, 'FE-01', inspection);

    assert.notEqual(updated, initial, 'Must return new reference');
    assert.deepEqual(initial, snapshot, 'Initial state must NOT be mutated');
    assert.ok(updated['FE-02'], 'FE-02 must be preserved');
    assert.equal(updated['FE-02'].inspected, true);
    assert.equal(updated['FE-02'].passed, true);

    const fe01 = updated['FE-01'];
    assert.ok(fe01);
    assert.equal(fe01.inspected, true);
    assert.equal(fe01.passed, true);
    assert.equal(fe01.gauge_status, 'green');
    assert.equal(fe01.tag_valid, true);
    assert.equal(fe01.pin_and_seal_intact, true);
    assert.equal(typeof fe01.timestamp, 'number');
    assert.ok(fe01.timestamp > 0);
  });

  it('4.3: updateAssetInspectionState sets passed=false on non-compliance or hazard detection', () => {
    const nonComp = reticleHelper.updateAssetInspectionState({}, 'FE-99', {
      compliance_status: 'غير مطابق',
      hazard_detected: false
    });
    assert.equal(nonComp['FE-99'].inspected, true);
    assert.equal(nonComp['FE-99'].passed, false);

    const haz = reticleHelper.updateAssetInspectionState({}, 'EX-12', {
      compliance_status: 'مطابق',
      hazard_detected: true,
      door_wedged: true
    });
    assert.equal(haz['EX-12'].inspected, true);
    assert.equal(haz['EX-12'].passed, false);

    const safe = reticleHelper.updateAssetInspectionState(null, 'FE-88', {
      compliance_status: 'مطابق',
      hazard_detected: false
    });
    assert.equal(safe['FE-88'].inspected, true);
    assert.equal(safe['FE-88'].passed, true);
  });

  it('4.4: mapVisionToChecklistFields accurately evaluates extinguishers and exits', () => {
    // Compliant extinguisher
    const extPlan = reticleHelper.mapVisionToChecklistFields({
      submode: 'extinguisher',
      gauge_status: 'green',
      tag_valid: true,
      pin_and_seal_intact: true
    });
    assert.ok(extPlan.compliantItems.includes('pressure_gauge'));
    assert.ok(extPlan.compliantItems.includes('tag'));
    assert.ok(extPlan.compliantItems.includes('pin'));
    assert.equal(extPlan.nonCompliantItems.length, 0);

    // Defective extinguisher
    const extDefPlan = reticleHelper.mapVisionToChecklistFields({
      submode: 'extinguisher',
      gauge_status: 'undercharge',
      tag_valid: false,
      pin_and_seal_intact: false
    });
    assert.ok(extDefPlan.nonCompliantItems.includes('pressure_gauge'));
    assert.ok(extDefPlan.nonCompliantItems.includes('tag'));
    assert.ok(extDefPlan.nonCompliantItems.includes('pin'));
    assert.equal(extDefPlan.compliantItems.length, 0);

    // Wedged exit
    const exitWedgedPlan = reticleHelper.mapVisionToChecklistFields({
      submode: 'emergency_exit',
      door_wedged: true,
      exit_obstruction_percent: 25
    });
    assert.ok(exitWedgedPlan.nonCompliantItems.includes('door_wedged'));
    assert.ok(exitWedgedPlan.nonCompliantItems.includes('exit_obstruction'));

    // Clear exit
    const exitClearPlan = reticleHelper.mapVisionToChecklistFields({
      submode: 'emergency_exit',
      door_wedged: false,
      exit_obstruction_percent: 0
    });
    assert.ok(exitClearPlan.compliantItems.includes('door_wedged'));
    assert.ok(exitClearPlan.compliantItems.includes('exit_obstruction'));
  });

  it('4.5: applyVisionToActiveRound end-to-end integration updates draft assets, items, and notes', () => {
    const mockElements = new Map();
    const toasts = [];

    const modalNewRound = new MockElement('newRoundModal');
    mockElements.set('newRoundModal', modalNewRound);

    const inpRoundNotes = new MockElement('inp-round-notes', 'input');
    inpRoundNotes.value = 'ملاحظات تمهيدية';
    mockElements.set('inp-round-notes', inpRoundNotes);

    const visionModal = new MockElement('ksu-ai-vision-modal');
    mockElements.set('ksu-ai-vision-modal', visionModal);

    const optComp32 = new MockElement('opt-comp-32', 'input');
    const optViol32 = new MockElement('opt-viol-32', 'input');
    mockElements.set('opt-comp-32', optComp32);
    mockElements.set('opt-viol-32', optViol32);

    const originalDoc = globalThis.document;
    const originalWin = globalThis.window;
    const originalState = globalThis.state;

    globalThis.document = {
      getElementById: id => mockElements.get(id) || null,
      querySelector: sel => sel.startsWith('#') ? (mockElements.get(sel.slice(1)) || null) : null
    };

    globalThis.Event = class Event { constructor(type) { this.type = type; } };
    globalThis.KSUReticleHelper = reticleHelper;

    globalThis.state = {
      currentRoundDraft: {
        floorAssetsStatus: { 'FE-01': 'pending', 'FE-02': { inspected: true, passed: true } },
        notes: 'ملاحظات تمهيدية',
        items: [{ id: 32, code: 'KSU-FEX-02', title: 'مؤشر الضغط ومسمار الأمان', desc: 'مؤشر الضغط ومسمار الأمان', result: 'pending' }]
      }
    };

    globalThis.window = {
      state: globalThis.state,
      KSUReticleHelper: reticleHelper,
      showToast: (msg, type) => { toasts.push({ msg, type }); },
      lastVisionAnalysisData: {
        submode: 'extinguisher',
        compliance_status: 'مطابق',
        hazard_detected: false,
        gauge_status: 'green',
        tag_valid: true,
        pin_and_seal_intact: true,
        findings_summary: 'فحص طفاية الحريق سليم ومطابق'
      }
    };

    const clientCode = fs.readFileSync(aiClientPath, 'utf8');
    const evalFunc = new Function('window', 'document', 'KSUReticleHelper', 'state', 'Event', 'showToast', `
      ${clientCode}
      return window.applyVisionToActiveRound;
    `);

    const applyVisionFn = evalFunc(globalThis.window, globalThis.document, reticleHelper, globalThis.state, globalThis.Event, globalThis.window.showToast);
    assert.equal(typeof applyVisionFn, 'function');

    applyVisionFn('FE-01');

    const statusMap = globalThis.state.currentRoundDraft.floorAssetsStatus;
    assert.ok(statusMap['FE-01']);
    assert.equal(statusMap['FE-01'].inspected, true);
    assert.equal(statusMap['FE-01'].passed, true);
    assert.equal(statusMap['FE-01'].gauge_status, 'green');

    assert.ok(statusMap['FE-02']);
    assert.equal(statusMap['FE-02'].passed, true);

    const item32 = globalThis.state.currentRoundDraft.items.find(i => i.id === 32);
    assert.equal(item32.result, 'compliant');

    assert.ok(inpRoundNotes.value.includes('[فحص بصري ذكي]'));
    assert.ok(globalThis.state.currentRoundDraft.notes.includes('[فحص بصري ذكي]'));
    assert.ok(toasts.some(t => t.msg.includes('تم فحص الأصل وتحديث بنود الجولة بنجاح ✅')));
    assert.equal(visionModal.removed, true);

    // Clean up
    globalThis.document = originalDoc;
    globalThis.window = originalWin;
    globalThis.state = originalState;
  });
});

// ==============================================================================
// TEST SUITE 5: Standalone Quick Scan Dispatchers
// ==============================================================================
describe('Suite 5: Standalone Quick Scan Dispatchers', () => {
  const reticleHelper = require(reticleHelperPath);

  it('5.1: reticle helper exports prepareViolationFromVision and prepareNewRoundFromVision', () => {
    assert.equal(typeof reticleHelper.prepareViolationFromVision, 'function');
    assert.equal(typeof reticleHelper.prepareNewRoundFromVision, 'function');
  });

  it('5.2: prepareViolationFromVision builds structured violation payload with complete metadata', () => {
    const analysis = {
      detected_element: 'لوحة كهربائية ذات خلو غير كافٍ',
      risk_level: 'عالي',
      standard_reference: 'NFPA 70 / CBAHI FMS.04',
      findings_summary: 'تخزين كراتين أمام القواطع',
      violations_list: ['عدم الالتزام بمسافة الخلو المقررة (36 بوصة / 90 سم)'],
      corrective_actions: ['إخلاء المنطقة فوراً']
    };
    const location = { building: 'المبنى الطبي', floor: 'الدور الأول', room: 'غرفة 102' };
    const img = 'data:image/jpeg;base64,mockImageBytes';

    const payload = reticleHelper.prepareViolationFromVision(analysis, location, img);
    assert.equal(payload.building, 'المبنى الطبي');
    assert.equal(payload.floor, 'الدور الأول');
    assert.equal(payload.room, 'غرفة 102');
    assert.equal(payload.title, 'لوحة كهربائية ذات خلو غير كافٍ');
    assert.equal(payload.risk_level, 'عالي');
    assert.equal(payload.standard_reference, 'NFPA 70 / CBAHI FMS.04');
    assert.equal(payload.image, img);
    assert.ok(payload.description.includes('تخزين كراتين أمام القواطع'));
    assert.ok(payload.description.includes('NFPA 70 / CBAHI FMS.04'));
    assert.ok(payload.description.includes('36 بوصة'));
    assert.ok(payload.description.includes('إخلاء المنطقة فوراً'));
    assert.equal(typeof payload.timestamp, 'number');
    assert.ok(payload.timestamp > 0);
  });

  it('5.3: prepareViolationFromVision provides safe defaults for null/empty arguments', () => {
    const payload = reticleHelper.prepareViolationFromVision(null, null, null);
    assert.equal(payload.building, 'المستشفى', 'Default building should be المستشفى');
    assert.equal(payload.floor, '');
    assert.equal(payload.room, '');
    assert.equal(payload.title, 'مخالفة سلامة مرصودة بالذكاء الاصطناعي');
    assert.equal(payload.risk_level, 'متوسط');
    assert.equal(payload.standard_reference, 'CBAHI / NFPA');
    assert.equal(payload.image, '');
    assert.equal(typeof payload.timestamp, 'number');
    assert.ok(payload.timestamp > 0);
    assert.equal(typeof payload.description, 'string');
  });

  it('5.4: prepareNewRoundFromVision maps submodes accurately to round checklist types', () => {
    const loc = { building: 'مبنى الأورام', floor: 'الدور الثالث' };

    // extinguisher -> fex
    const rExt = reticleHelper.prepareNewRoundFromVision({ submode: 'extinguisher', findings_summary: 'فحص طفاية' }, loc);
    assert.equal(rExt.checklistType, 'fex');
    assert.equal(rExt.building, 'مبنى الأورام');
    assert.equal(rExt.floor, 'الدور الثالث');
    assert.equal(rExt.notes, 'فحص طفاية');

    // emergency_exit -> ext
    const rExit = reticleHelper.prepareNewRoundFromVision({ submode: 'emergency_exit' }, loc);
    assert.equal(rExit.checklistType, 'ext');

    // exit -> ext
    const rExitAlias = reticleHelper.prepareNewRoundFromVision({ submode: 'exit' }, loc);
    assert.equal(rExitAlias.checklistType, 'ext');

    // hazard -> all
    const rHaz = reticleHelper.prepareNewRoundFromVision({ submode: 'hazard' }, loc);
    assert.equal(rHaz.checklistType, 'all');

    // general -> all
    const rGen = reticleHelper.prepareNewRoundFromVision({ submode: 'general' }, loc);
    assert.equal(rGen.checklistType, 'all');

    // fallback -> all
    const rDef = reticleHelper.prepareNewRoundFromVision(null, null);
    assert.equal(rDef.checklistType, 'all');
  });

  it('5.5: openViolationFromAI and startRoundFromAI execute modal transitions and input pre-fills', () => {
    const mockElements = new Map();

    const inpViolBuilding = new MockElement('inp-violation-building', 'input');
    const inpViolFloor = new MockElement('inp-violation-floor', 'input');
    const inpViolLocation = new MockElement('inp-violation-location', 'input');
    const inpViolDesc = new MockElement('inp-violation-desc', 'textarea');
    const imgPreview = new MockElement('violation-image-preview', 'img');
    const modalViol = new MockElement('newSafetyViolationModal', 'div');
    modalViol.classList.add('hidden');

    const inpRoundBuilding = new MockElement('inp-round-building', 'input');
    const inpRoundFloor = new MockElement('inp-round-floor', 'input');
    const inpRoundFormType = new MockElement('inp-round-form-type', 'select');
    const modalRound = new MockElement('newRoundModal', 'div');
    modalRound.classList.add('hidden');

    const visionModal = new MockElement('ksu-ai-vision-modal', 'div');

    mockElements.set('inp-violation-building', inpViolBuilding);
    mockElements.set('inp-violation-floor', inpViolFloor);
    mockElements.set('inp-violation-location', inpViolLocation);
    mockElements.set('inp-violation-desc', inpViolDesc);
    mockElements.set('violation-image-preview', imgPreview);
    mockElements.set('newSafetyViolationModal', modalViol);

    mockElements.set('inp-round-building', inpRoundBuilding);
    mockElements.set('inp-round-floor', inpRoundFloor);
    mockElements.set('inp-round-form-type', inpRoundFormType);
    mockElements.set('newRoundModal', modalRound);

    mockElements.set('ksu-ai-vision-modal', visionModal);

    const originalDoc = globalThis.document;
    const originalWin = globalThis.window;

    globalThis.document = {
      getElementById: id => mockElements.get(id) || null,
      querySelector: sel => sel.startsWith('#') ? (mockElements.get(sel.slice(1)) || null) : null
    };

    globalThis.window = {
      state: {},
      KSUReticleHelper: reticleHelper,
      showToast: () => {},
      lastVisionAnalysisData: {
        submode: 'hazard',
        detected_element: 'لوحة كهربائية محجوبة',
        findings_summary: 'تخزين كراتين ملاصقة للقواطع',
        violations_list: ['عدم الالتزام بمسافة الخلو 36 بوصة']
      },
      lastVisionLocation: {
        building: 'المستشفى الرئيسي',
        floor: 'الدور الثاني',
        room: 'غرفة 205'
      },
      lastCapturedVisionImage: 'data:image/jpeg;base64,sampleimage'
    };

    const clientCode = fs.readFileSync(aiClientPath, 'utf8');
    const evalFunc = new Function('window', 'document', 'KSUReticleHelper', `
      ${clientCode}
      return { openViolation: window.openViolationFromAI, startRound: window.startRoundFromAI };
    `);

    const { openViolation, startRound } = evalFunc(globalThis.window, globalThis.document, reticleHelper);
    assert.equal(typeof openViolation, 'function');
    assert.equal(typeof startRound, 'function');

    // Test openViolation
    openViolation();
    assert.equal(inpViolBuilding.value, 'المستشفى الرئيسي');
    assert.equal(inpViolFloor.value, 'الدور الثاني');
    assert.equal(inpViolLocation.value, 'المستشفى الرئيسي - الدور الثاني - غرفة 205');
    assert.ok(inpViolDesc.value.includes('تخزين كراتين ملاصقة للقواطع'));
    assert.equal(modalViol.classList.contains('hidden'), false);
    assert.equal(visionModal.removed, true);

    // Reset vision modal for startRound test
    visionModal.removed = false;
    globalThis.window.lastVisionAnalysisData = { submode: 'extinguisher', findings_summary: 'طفاية تحتاج فحص' };
    startRound();
    assert.equal(inpRoundBuilding.value, 'المستشفى الرئيسي');
    assert.equal(inpRoundFloor.value, 'الدور الثاني');
    assert.equal(inpRoundFormType.value, 'fex');
    assert.equal(modalRound.classList.contains('hidden'), false);
    assert.equal(visionModal.removed, true);

    // Clean up
    globalThis.document = originalDoc;
    globalThis.window = originalWin;
  });
});

// ==============================================================================
// TEST SUITE 6: Full Syntax Check on Modified JS Files
// ==============================================================================
describe('Suite 6: Full JavaScript Syntax Check', () => {
  const targetFiles = [
    { name: 'oracle-vision-agent/prompt_builder.js', path: promptBuilderPath },
    { name: 'oracle-vision-agent/agent_server.js', path: agentServerPath },
    { name: 'assets/js/vision-reticle-helper.js', path: reticleHelperPath },
    { name: 'assets/js/ksu-ai-client.js', path: aiClientPath }
  ];

  targetFiles.forEach(({ name, path: filePath }) => {
    it(`6.${name}: passes node -c syntax check without errors`, () => {
      assert.doesNotThrow(() => {
        execSync(`node -c "${filePath}"`, { stdio: 'pipe' });
      }, `Syntax check failed for ${name}`);
    });
  });
});

// ==============================================================================
// TEST SUITE 7: field.html DOM Integrity & Script Order Validation
// ==============================================================================
describe('Suite 7: field.html DOM Integrity & Script Order Validation', () => {
  const html = fs.readFileSync(fieldHtmlPath, 'utf8');

  it('7.1: script inclusion order places vision-reticle-helper.js before ksu-ai-client.js', () => {
    const helperIndex = html.indexOf('assets/js/vision-reticle-helper.js');
    const clientIndex = html.indexOf('assets/js/ksu-ai-client.js');

    assert.ok(helperIndex > -1, 'assets/js/vision-reticle-helper.js script tag must be present in field.html');
    assert.ok(clientIndex > -1, 'assets/js/ksu-ai-client.js script tag must be present in field.html');
    assert.ok(helperIndex < clientIndex, 'vision-reticle-helper.js must be loaded before ksu-ai-client.js');
  });

  it('7.2: in-round AI vision trigger button is present with expected attributes', () => {
    assert.ok(html.includes('id="btn-round-ai-vision"') || html.includes("id='btn-round-ai-vision'"));
    assert.ok(html.includes('openAIVisionInspectionModal'));
  });

  it('7.3: violation modal container and pre-fill input IDs are present', () => {
    assert.ok(html.includes('id="newSafetyViolationModal"') || html.includes('id="modal-new-violation"') || html.includes('id="violationModal"'));
    assert.ok(html.includes('id="inp-violation-building"'));
    assert.ok(html.includes('id="inp-violation-floor"'));
    assert.ok(html.includes('id="inp-violation-location"'));
    assert.ok(html.includes('id="inp-violation-desc"'));
    assert.ok(html.includes('id="violation-image-preview"') || html.includes('id="inp-violation-image-preview"'));
  });

  it('7.4: round modal container and pre-fill input IDs are present', () => {
    assert.ok(html.includes('id="newRoundModal"') || html.includes('id="modal-new-round"'));
    assert.ok(html.includes('id="inp-round-building"'));
    assert.ok(html.includes('id="inp-round-floor"'));
    assert.ok(html.includes('id="inp-round-form-type"'));
  });

  it('7.5: field.html contains zero dangerous monkeypatching of core DOM methods', () => {
    assert.ok(!html.includes('document.getElementById = function'), 'field.html must not monkeypatch document.getElementById');
    assert.ok(!html.includes('document.querySelector = function'), 'field.html must not monkeypatch document.querySelector');
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const reticleHelperPath = path.resolve(__dirname, '../assets/js/vision-reticle-helper.js');
const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');
const fieldHtmlPath = path.resolve(__dirname, '../field.html');

test('Reticle helper exports specialized result formatters', () => {
  const reticleHelper = require(reticleHelperPath);
  assert.equal(typeof reticleHelper.formatExtinguisherBadge, 'function', 'formatExtinguisherBadge should be a function');
  assert.equal(typeof reticleHelper.formatExitBadge, 'function', 'formatExitBadge should be a function');
  assert.equal(typeof reticleHelper.formatHazardBadge, 'function', 'formatHazardBadge should be a function');
  assert.equal(typeof reticleHelper.formatSpecializedAssetCard, 'function', 'formatSpecializedAssetCard should be a function');
});

test('formatExtinguisherBadge renders gauge status, tag details, and tamper seal accurately', () => {
  const { formatExtinguisherBadge } = require(reticleHelperPath);

  // Case 1: Green / Compliant Extinguisher
  const greenHtml = formatExtinguisherBadge({
    gauge_status: 'green',
    gauge_description: 'الإبرة في النطاق الأخضر',
    tag_detected: true,
    tag_last_date: '2026-05',
    tag_valid: true,
    pin_and_seal_intact: true,
    extinguisher_type: 'بودرة جافة (ABC)'
  });
  assert.ok(greenHtml.includes('مؤشر الضغط في النطاق الأخضر') || greenHtml.includes('🟢'), 'Should display green gauge status');
  assert.ok(greenHtml.includes('2026-05'), 'Should display last inspection date');
  assert.ok(greenHtml.includes('سارية') || greenHtml.includes('صالحة'), 'Should indicate tag is valid');
  assert.ok(greenHtml.includes('سليم') && !greenHtml.includes('مفقود أو مكسور'), 'Should indicate pin and seal intact');
  assert.ok(greenHtml.includes('بودرة جافة (ABC)'), 'Should display extinguisher type');

  // Case 2: Undercharged Extinguisher with expired tag and broken seal
  const underHtml = formatExtinguisherBadge({
    gauge_status: 'undercharge',
    tag_detected: true,
    tag_last_date: '2024-01',
    tag_valid: false,
    pin_and_seal_intact: false,
    extinguisher_type: 'ثاني أكسيد الكربون (CO2)'
  });
  assert.ok(underHtml.includes('منخفض') || underHtml.includes('إعادة التعبئة'), 'Should indicate undercharge pressure');
  assert.ok(underHtml.includes('منتهية الصلاحية') || underHtml.includes('غير سارية'), 'Should indicate tag expired');
  assert.ok(underHtml.includes('مفقود') || underHtml.includes('مكسور'), 'Should indicate pin/seal broken or missing');

  // Case 3: Overcharged Extinguisher with missing tag
  const overHtml = formatExtinguisherBadge({
    gauge_status: 'overcharge',
    tag_detected: false,
    pin_and_seal_intact: true
  });
  assert.ok(overHtml.includes('مرتفع') || overHtml.includes('زيادة الضغط'), 'Should indicate overcharge pressure');
  assert.ok(overHtml.includes('غير متوفرة') || overHtml.includes('غير موجودة') || overHtml.includes('مفقودة'), 'Should indicate tag not detected');

  // Case 4: Unknown / Unclear gauge
  const unknownHtml = formatExtinguisherBadge({
    gauge_status: 'unknown'
  });
  assert.ok(unknownHtml.includes('غير واضح') || unknownHtml.includes('غير ظاهر'), 'Should indicate unknown/unclear gauge status');
});

test('formatExitBadge renders door wedging alert, egress path bar, and exit sign status', () => {
  const { formatExitBadge } = require(reticleHelperPath);

  // Case 1: Wedged door with 45% obstruction (Critical)
  const wedgedHtml = formatExitBadge({
    door_wedged: true,
    exit_obstruction_percent: 45,
    exit_clear: false,
    exit_sign_illuminated: true
  });
  assert.ok(wedgedHtml.includes('تنبيه حرج') || wedgedHtml.includes('مثبت بوتد'), 'Must render wedged door critical alert');
  assert.ok(wedgedHtml.includes('CBAHI FMS.14') || wedgedHtml.includes('NFPA 80'), 'Must reference safety standards');
  assert.ok(wedgedHtml.includes('45%'), 'Must show 45% obstruction');
  assert.ok(wedgedHtml.includes('مضاءة') || wedgedHtml.includes('تعمل'), 'Must show illuminated exit sign status');

  // Case 2: Clear exit path (0% obstruction, door free)
  const clearHtml = formatExitBadge({
    door_wedged: false,
    exit_obstruction_percent: 0,
    exit_clear: true,
    exit_sign_illuminated: true
  });
  assert.ok(!clearHtml.includes('🚨 تنبيه حرج'), 'Clear door should not show wedged door alert');
  assert.ok(clearHtml.includes('0%') || clearHtml.includes('خالٍ تماماً') || clearHtml.includes('100%'), 'Should show clear egress path');

  // Case 3: Amber obstruction (15%) and non-illuminated sign
  const amberHtml = formatExitBadge({
    door_wedged: false,
    exit_obstruction_percent: 15,
    exit_clear: false,
    exit_sign_illuminated: false
  });
  assert.ok(amberHtml.includes('15%'), 'Must show 15% obstruction');
  assert.ok(amberHtml.includes('غير مضاءة') || amberHtml.includes('لا تعمل') || amberHtml.includes('غير واضحة'), 'Should indicate unlit exit sign');
});

test('formatHazardBadge renders electrical clearance and prohibited devices', () => {
  const { formatHazardBadge } = require(reticleHelperPath);

  // Case 1: Clearance violation with prohibited devices
  const violationHtml = formatHazardBadge({
    clearance_violation_36in: true,
    detected_devices: ['سخان ماء كهربائي', 'توصيلة رديئة غير مطابقة'],
    hazard_detected: true
  });
  assert.ok(violationHtml.includes('36') || violationHtml.includes('90 سم') || violationHtml.includes('مسافة الخلو'), 'Must alert about 36-inch clearance violation');
  assert.ok(violationHtml.includes('سخان ماء كهربائي'), 'Must list detected prohibited devices');
  assert.ok(violationHtml.includes('توصيلة رديئة غير مطابقة'), 'Must list detected electrical devices');

  // Case 2: Safe clearance without prohibited devices
  const safeHtml = formatHazardBadge({
    clearance_violation_36in: false,
    detected_devices: []
  });
  assert.ok(safeHtml.includes('مسافة خلو آمنة') || safeHtml.includes('مستوفي') || safeHtml.includes('سليمة'), 'Should indicate clearance is compliant');
});

test('formatSpecializedAssetCard dispatches based on submode', () => {
  const { formatSpecializedAssetCard } = require(reticleHelperPath);

  // Extinguisher dispatch
  const extCard = formatSpecializedAssetCard({ submode: 'extinguisher', gauge_status: 'green' });
  assert.ok(extCard.includes('مؤشر الضغط') || extCard.includes('طفايات'));

  // Emergency Exit dispatch
  const exitCard = formatSpecializedAssetCard({ submode: 'emergency_exit', door_wedged: true, exit_obstruction_percent: 20 });
  assert.ok(exitCard.includes('مخرج') || exitCard.includes('إخلاء') || exitCard.includes('طوارئ') || exitCard.includes('CBAHI FMS.14'));

  // Hazard dispatch
  const hazCard = formatSpecializedAssetCard({ submode: 'hazard', clearance_violation_36in: true });
  assert.ok(hazCard.includes('36') || hazCard.includes('90') || hazCard.includes('كهربائية') || hazCard.includes('خلو'));

  // General or unknown submode returns empty string or harmless empty container
  const genCard = formatSpecializedAssetCard({ submode: 'general' });
  assert.equal(typeof genCard, 'string');
  assert.ok(genCard === '' || genCard.includes('عام'));

  const nullCard = formatSpecializedAssetCard(null);
  assert.equal(nullCard, '');
});

test('field.html includes vision-reticle-helper.js script before ksu-ai-client.js', () => {
  const html = fs.readFileSync(fieldHtmlPath, 'utf8');
  assert.ok(html.includes('assets/js/vision-reticle-helper.js'), 'field.html must include vision-reticle-helper.js');

  const helperIndex = html.indexOf('assets/js/vision-reticle-helper.js');
  const clientIndex = html.indexOf('assets/js/ksu-ai-client.js');
  assert.ok(helperIndex > -1, 'vision-reticle-helper.js must be found in field.html');
  assert.ok(clientIndex > -1, 'ksu-ai-client.js must be found in field.html');
  assert.ok(helperIndex < clientIndex, 'vision-reticle-helper.js must be included before ksu-ai-client.js');
});

test('ksu-ai-client.js integrates formatSpecializedAssetCard in renderVisionInspectionResults and mock data in heuristicVisualAnalysis', () => {
  const clientCode = fs.readFileSync(aiClientPath, 'utf8');

  // Verify call to formatSpecializedAssetCard in renderVisionInspectionResults
  assert.ok(clientCode.includes('formatSpecializedAssetCard'), 'renderVisionInspectionResults must call formatSpecializedAssetCard');

  // Verify heuristicVisualAnalysis populates specialized submode mock data
  assert.ok(clientCode.includes('gauge_status'), 'heuristicVisualAnalysis must populate extinguisher fields');
  assert.ok(clientCode.includes('door_wedged'), 'heuristicVisualAnalysis must populate emergency exit fields');
  assert.ok(clientCode.includes('clearance_violation_36in'), 'heuristicVisualAnalysis must populate hazard fields');
});

test('Syntax check passes for modified JavaScript files', () => {
  assert.doesNotThrow(() => {
    execSync(`node -c "${reticleHelperPath}"`, { stdio: 'pipe' });
  }, 'vision-reticle-helper.js syntax check failed');

  assert.doesNotThrow(() => {
    execSync(`node -c "${aiClientPath}"`, { stdio: 'pipe' });
  }, 'ksu-ai-client.js syntax check failed');
});

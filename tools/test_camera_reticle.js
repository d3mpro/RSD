const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Module path
const reticleHelperPath = path.resolve(__dirname, '../assets/js/vision-reticle-helper.js');
const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');

test('Reticle helper module exports required functions', () => {
  const reticleHelper = require(reticleHelperPath);
  assert.equal(typeof reticleHelper.getReticleSvg, 'function', 'getReticleSvg should be a function');
  assert.equal(typeof reticleHelper.getSubmodeList, 'function', 'getSubmodeList should be a function');
  assert.equal(typeof reticleHelper.resolveSubmodeLabel, 'function', 'resolveSubmodeLabel should be a function');
});

test('getSubmodeList returns the 4 expected safety inspection submodes', () => {
  const { getSubmodeList } = require(reticleHelperPath);
  const list = getSubmodeList();
  assert.ok(Array.isArray(list), 'Submode list should be an array');
  assert.equal(list.length, 4, 'Submode list must contain exactly 4 items');

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

test('resolveSubmodeLabel returns human-readable Arabic titles', () => {
  const { resolveSubmodeLabel } = require(reticleHelperPath);
  assert.ok(resolveSubmodeLabel('extinguisher').includes('طفا'));
  assert.ok(resolveSubmodeLabel('emergency_exit').includes('مخار') || resolveSubmodeLabel('emergency_exit').includes('طوارئ'));
  assert.ok(resolveSubmodeLabel('hazard').includes('مخاطر') || resolveSubmodeLabel('hazard').includes('كهرب'));
  assert.ok(resolveSubmodeLabel('general').includes('عام'));
  assert.ok(resolveSubmodeLabel('unknown_mode').includes('عام'), 'Fallback should resolve to general');
});

test('getReticleSvg for extinguisher submode has gauge circle, tag rect, corner brackets, and Arabic guidance', () => {
  const { getReticleSvg } = require(reticleHelperPath);
  const svg = getReticleSvg('extinguisher');

  assert.ok(svg.includes('<svg'), 'Output should contain an SVG opening tag');
  assert.ok(svg.includes('</svg>'), 'Output should contain an SVG closing tag');
  assert.ok(svg.includes('ksu-reticle-overlay'), 'SVG should have ksu-reticle-overlay class');
  assert.ok(svg.includes('gauge-target-circle'), 'Must contain gauge-target-circle for pressure gauge');
  assert.ok(svg.includes('tag-target-rect'), 'Must contain tag-target-rect for maintenance tag');
  assert.ok(svg.includes('reticle-corner') || svg.includes('corner-bracket'), 'Must contain corner brackets');
  assert.ok(svg.includes('ضع عداد الضغط داخل الدائرة وبطاقة الصيانة داخل المستطيل'), 'Must contain exact extinguisher guidance text');
});

test('getReticleSvg for emergency_exit submode has door frame, floor path, and Arabic guidance', () => {
  const { getReticleSvg } = require(reticleHelperPath);
  const svg = getReticleSvg('emergency_exit');

  assert.ok(svg.includes('<svg'), 'Output should contain an SVG tag');
  assert.ok(svg.includes('door-target-frame'), 'Must contain door-target-frame element');
  assert.ok(svg.includes('floor-target-path'), 'Must contain floor-target-path element');
  assert.ok(svg.includes('حدد إطار الباب ومسار الخروج بالكامل'), 'Must contain exact exit guidance text');
});

test('getReticleSvg for hazard submode has crosshair, hazard grid, and Arabic guidance', () => {
  const { getReticleSvg } = require(reticleHelperPath);
  const svg = getReticleSvg('hazard');

  assert.ok(svg.includes('<svg'), 'Output should contain an SVG tag');
  assert.ok(svg.includes('hazard-target-crosshair') || svg.includes('hazard-zone-grid') || svg.includes('hazard-target-grid'), 'Must contain hazard targeting elements');
  assert.ok(svg.includes('وجّه العدسة نحو اللوحة الكهربائية أو مصدر الخطر'), 'Must contain exact hazard guidance text');
});

test('getReticleSvg for general submode has balanced crosshair and Arabic guidance', () => {
  const { getReticleSvg } = require(reticleHelperPath);
  const svg = getReticleSvg('general');

  assert.ok(svg.includes('<svg'), 'Output should contain an SVG tag');
  assert.ok(svg.includes('general-crosshair') || svg.includes('reticle-crosshair'), 'Must contain crosshair element');
  assert.ok(svg.includes('وجّه الكاميرا نحو العنصر المراد فحصه'), 'Must contain exact general guidance text');
});

test('JavaScript syntax check for vision-reticle-helper.js and ksu-ai-client.js', () => {
  // Check syntax of helper
  assert.doesNotThrow(() => {
    execSync(`node -c "${reticleHelperPath}"`, { stdio: 'pipe' });
  }, 'vision-reticle-helper.js must pass node -c syntax check');

  // Check syntax of AI client
  assert.doesNotThrow(() => {
    execSync(`node -c "${aiClientPath}"`, { stdio: 'pipe' });
  }, 'ksu-ai-client.js must pass node -c syntax check');
});

test('getReticleSvg supports options customization', () => {
  const { getReticleSvg } = require(reticleHelperPath);

  // showGuideText = false
  const svgWithoutText = getReticleSvg('extinguisher', { showGuideText: false });
  assert.ok(!svgWithoutText.includes('ضع عداد الضغط'), 'Guidance badge should be omitted when showGuideText is false');

  // custom guideText
  const svgCustomText = getReticleSvg('general', { guideText: 'توجيه مخصص للاختبار' });
  assert.ok(svgCustomText.includes('توجيه مخصص للاختبار'), 'Custom guide text should appear in SVG');

  // custom viewBox and width/height
  const svgCustomBox = getReticleSvg('hazard', { viewBox: '0 0 600 600', width: '500px' });
  assert.ok(svgCustomBox.includes('viewBox="0 0 600 600"'));
  assert.ok(svgCustomBox.includes('width="500px"'));
});

test('CSS styles file contains all required reticle and submode tab classes', () => {
  const fs = require('node:fs');
  const cssPath = path.resolve(__dirname, '../assets/css/styles.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(cssContent.includes('.ksu-reticle-overlay'), 'styles.css must define .ksu-reticle-overlay');
  assert.ok(cssContent.includes('.reticle-pulse-glow'), 'styles.css must define .reticle-pulse-glow');
  assert.ok(cssContent.includes('.gauge-target-circle'), 'styles.css must define .gauge-target-circle');
  assert.ok(cssContent.includes('.tag-target-rect'), 'styles.css must define .tag-target-rect');
  assert.ok(cssContent.includes('.reticle-hint-badge'), 'styles.css must define .reticle-hint-badge');
  assert.ok(cssContent.includes('pointer-events: none'), 'overlay must have pointer-events: none');
  assert.ok(cssContent.includes('.vision-submode-tab'), 'styles.css must define .vision-submode-tab');
});

test('ksu-ai-client.js integrates submode tabs, reticle overlay, and analysis execution', () => {
  const fs = require('node:fs');
  const clientContent = fs.readFileSync(aiClientPath, 'utf8');

  // Check submode tabs and reticle container
  assert.ok(clientContent.includes('vision-submode-tab'), 'Modal must render vision-submode-tab buttons');
  assert.ok(clientContent.includes('vision-reticle-overlay-container'), 'Modal must render vision-reticle-overlay-container');
  assert.ok(clientContent.includes('window.setVisionSubmode'), 'Must expose window.setVisionSubmode');
  assert.ok(clientContent.includes('window.toggleVisionReticleGuide'), 'Must expose window.toggleVisionReticleGuide');

  // Check submode passing in analysis
  assert.ok(clientContent.includes('submode: activeSubmode'), 'runVisionModalAnalysis must pass activeSubmode to analysis');
  assert.ok(clientContent.includes('analyzeInspectionImage({ image, images, checklistType, itemLabel, facility, building, floor, notes, submode }'), 'analyzeInspectionImage must accept submode');
});


// =============================================================================
// Comprehensive Unit & Integration Test: Worker M1
// Inspector Auto-Binding & FACP Modal Registry Verification
// =============================================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const fieldHtmlPath = path.join(rootDir, 'field.html');
const appJsPath = path.join(rootDir, 'assets/js/app.js');
const officialCardPath = path.join(rootDir, 'assets/js/ksu-official-card.js');
const facpAssetsPath = path.join(rootDir, 'assets/js/ksu-facp-assets.js');

const fieldHtml = fs.readFileSync(fieldHtmlPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const officialCardJs = fs.readFileSync(officialCardPath, 'utf8');
const { KSU_FACP_ASSETS } = require(facpAssetsPath);

test('M1.1: DOM Verification in field.html', () => {
  // 1. Manual Inspector selection group exists and wraps inspector & shift selects
  assert.ok(
    fieldHtml.includes('id="round-inspector-manual-selection-group"'),
    'field.html must contain #round-inspector-manual-selection-group'
  );
  assert.ok(
    fieldHtml.includes('id="round-inspector-auto-bound-badge"'),
    'field.html must contain #round-inspector-auto-bound-badge'
  );
  assert.ok(
    fieldHtml.includes('id="round-inspector-auto-name"'),
    'field.html must contain #round-inspector-auto-name'
  );
  assert.ok(
    fieldHtml.includes('id="round-inspector-auto-badge"'),
    'field.html must contain #round-inspector-auto-badge'
  );
  assert.ok(
    fieldHtml.includes('id="round-inspector-auto-shift"'),
    'field.html must contain #round-inspector-auto-shift'
  );
  assert.ok(
    fieldHtml.includes('id="inp-round-inspector"'),
    'field.html must preserve #inp-round-inspector inside the manual group'
  );
  assert.ok(
    fieldHtml.includes('id="inp-round-shift"'),
    'field.html must preserve #inp-round-shift inside the manual group'
  );
});

test('M1.2: getAllFacpAssets() Substring Bug Fix & Safety in app.js', () => {
  // Simulate the environment
  const vm = require('node:vm');
  const sandbox = {
    state: {
      assets: [
        { id: 'FE-001', category: 'طفايات الحريق', type: 'طفاية بودرة' },
        { id: 'FHC-002', category: 'صناديق الحريق', type: 'صندوق خرطوم' },
        { id: 'EX-003', category: 'مخارج الطوارئ', type: 'مخرج طوارئ' }
      ]
    },
    KSU_FACP_ASSETS: KSU_FACP_ASSETS,
    window: {}
  };

  // Extract getAllFacpAssets from appJs
  const facpFuncMatch = appJs.match(/function getAllFacpAssets\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(facpFuncMatch, 'getAllFacpAssets function must be present in app.js');

  vm.createContext(sandbox);
  vm.runInContext(facpFuncMatch[0], sandbox);

  const assets = sandbox.getAllFacpAssets();
  assert.strictEqual(Array.isArray(assets), true);
  assert.strictEqual(assets.length, 10, 'getAllFacpAssets must return 10 FACP assets');

  // Verify none of the items are extinguishers
  assets.forEach(a => {
    assert.notStrictEqual(a.category, 'طفايات الحريق', 'FACP assets must never include extinguishers');
    assert.notStrictEqual(a.category, 'صناديق الحريق', 'FACP assets must never include hose cabinets');
  });

  // Verify fallback when KSU_FACP_ASSETS is undefined but state has proper FACP
  const sandbox2 = {
    state: {
      assets: [
        { id: 'FE-001', category: 'طفايات الحريق' },
        { id: 'FACP-TEST', category: 'لوحات إنذار الحريق', name: 'لوحة اختبار' }
      ]
    },
    KSU_FACP_ASSETS: undefined,
    window: {}
  };
  vm.createContext(sandbox2);
  vm.runInContext(facpFuncMatch[0], sandbox2);
  const fallbackAssets = sandbox2.getAllFacpAssets();
  assert.strictEqual(fallbackAssets.length, 1);
  assert.strictEqual(fallbackAssets[0].id, 'FACP-TEST');
});

test('M1.3: Startup Merge of KSU_FACP_ASSETS into state.assets in app.js', () => {
  assert.ok(
    appJs.includes('realFACP = (typeof KSU_FACP_ASSETS !== \'undefined\' && Array.isArray(KSU_FACP_ASSETS)) ? KSU_FACP_ASSETS : [];'),
    'app.js must extract realFACP from KSU_FACP_ASSETS'
  );
  assert.ok(
    appJs.includes('state.assets = [...realExtinguishers, ...otherAssets, ...realFM200, ...realFHC, ...realFACP];'),
    'app.js must include realFACP when constructing state.assets on startup'
  );
  assert.ok(
    appJs.includes('missingAssets = [...otherAssets, ...realFM200, ...realFHC, ...realFACP].filter('),
    'app.js must include realFACP when backfilling cached state.assets'
  );
});

test('M1.4: FACP Panel Registry in ksu-official-card.js', () => {
  // 1. Building filter pills
  const pills = [
    'الكل (10)',
    'المبنى الشرقي C (2)',
    'المستشفى الرئيسي A (5)',
    'الإداري D (1)',
    'العناية المركزة H (1)',
    'المستودعات O (1)'
  ];
  pills.forEach(pill => {
    assert.ok(
      officialCardJs.includes(pill),
      `ksu-official-card.js must contain filter pill: "${pill}"`
    );
  });

  // 2. Live search bar and grid container
  assert.ok(
    officialCardJs.includes('id="inp-facp-search"'),
    'ksu-official-card.js must contain search input #inp-facp-search'
  );
  assert.ok(
    officialCardJs.includes('id="facp-panels-grid"'),
    'ksu-official-card.js must contain #facp-panels-grid'
  );

  // 3. Trouble highlight on Panel 10 (NM-0022113)
  assert.ok(
    officialCardJs.includes('NM-0022113'),
    'ksu-official-card.js must specifically handle Panel 10 (NM-0022113)'
  );
  assert.ok(
    officialCardJs.includes('يوجد إشارة عطل (Trouble)'),
    'ksu-official-card.js must display Trouble warning badge'
  );

  // 4. Panel selection function & synchronization
  assert.ok(
    officialCardJs.includes('window.selectFacpPanelCard = function'),
    'ksu-official-card.js must export window.selectFacpPanelCard'
  );
  assert.ok(
    officialCardJs.includes('window.setFacpBuildingFilter = function'),
    'ksu-official-card.js must export window.setFacpBuildingFilter'
  );
  assert.ok(
    officialCardJs.includes('window.filterFacpPanels = function'),
    'ksu-official-card.js must export window.filterFacpPanels'
  );

  // 5. Official inspection card generation
  assert.ok(
    officialCardJs.includes('لوحة إنذار الحريق (FACP Panel):'),
    'Official card generation must display FACP panel details'
  );
  assert.ok(
    officialCardJs.includes('منطقة التغطية (Zone):'),
    'Official card generation must display zone'
  );
  assert.ok(
    officialCardJs.includes('عدد الدوائر (Loops):'),
    'Official card generation must display loops'
  );
});

test('M1.5: saveNewInspectionRound Payload Integrity in app.js', () => {
  assert.ok(
    appJs.includes('facpControlNo: resolvedFacpControlNo'),
    'newRound payload must include facpControlNo'
  );
  assert.ok(
    appJs.includes('facpName: resolvedFacpName'),
    'newRound payload must include facpName'
  );
  assert.ok(
    appJs.includes('facpStatus: resolvedFacpStatus'),
    'newRound payload must include facpStatus'
  );
  assert.ok(
    appJs.includes('facpOperationalStatus: resolvedFacpOpStatus'),
    'newRound payload must include facpOperationalStatus'
  );
  assert.ok(
    appJs.includes('zone: resolvedZone'),
    'newRound payload must include zone'
  );
  assert.ok(
    appJs.includes('loopNo: resolvedLoop'),
    'newRound payload must include loopNo'
  );
  assert.ok(
    appJs.includes('devicesNo: resolvedDevices'),
    'newRound payload must include devicesNo'
  );
  assert.ok(
    appJs.includes('ppmDate: resolvedPpmDate'),
    'newRound payload must include ppmDate'
  );
});

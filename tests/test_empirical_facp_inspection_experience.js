/**
 * EMPIRICAL TEST: Comprehensive FACP User Journey and Asset Registration
 * Verifies that fire alarm panels are registered as first-class assets,
 * properly linked to their buildings and floors, and can be inspected
 * smoothly by building and floor like all other assets.
 */

const fs = require('fs');
const assert = require('assert');

console.log('🧪 Starting Empirical FACP Inspection Experience Test...\n');

// 1. Mock Browser Environment
const storage = {};
global.localStorage = {
  getItem: (k) => storage[k] || null,
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
};

// Simulate existing Safari user with older cached assets (before V6)
storage['ksumc_assets_version'] = '2026.11.08_KSU_FACP_REGISTRY_V4';
storage['ksumc_assets'] = JSON.stringify([{ id: 'FE-001', category: 'طفايات الحريق', building: 'المستشفى', floor: 'الدور الأرضي (G)' }]);

const elements = {};
function createMockElement(id, tagName = 'div') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    innerHTML: '',
    classList: {
      classes: new Set(),
      add: (c) => el.classList.classes.add(c),
      remove: (c) => el.classList.classes.delete(c),
      contains: (c) => el.classList.classes.has(c)
    },
    style: {},
    options: [],
    children: [],
    setAttribute: () => {},
    getAttribute: () => null,
    addEventListener: () => {}
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html || '',
    set: (val) => {
      el._html = val;
      el.textContent = val.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const optionMatches = [...val.matchAll(/<option\s+value="([^"]*)"([^>]*)>(.*?)<\/option>/gi)];
      if (optionMatches.length > 0) {
        el.options = optionMatches.map(m => ({ value: m[1], textContent: m[3] }));
      }
    }
  });
  return el;
}

global.document = {
  getElementById: (id) => {
    if (!elements[id]) {
      const tag = (id.includes('inp') || id.includes('sel')) ? (id.includes('building') || id.includes('floor') || id.includes('inspector') || id.includes('shift') ? 'select' : 'input') : 'div';
      elements[id] = createMockElement(id, tag);
    }
    return elements[id];
  },
  querySelectorAll: () => []
};

global.window = {
  state: null,
  addEventListener: () => {}
};
global.showToast = () => {};

// Load assets and app
const { KSU_FACP_ASSETS } = require('../assets/js/ksu-facp-assets.js');
global.KSU_FACP_ASSETS = KSU_FACP_ASSETS;

// Load app.js core
const appJsContent = fs.readFileSync('assets/js/app.js', 'utf8');

// Isolate building map, matching helpers, and round functions
let bldMapCode = appJsContent.slice(appJsContent.indexOf('const BUILDING_FLOOR_MAP = {'), appJsContent.indexOf('const OFFICIAL_BUILDING_BLOCKS_MAP'));
bldMapCode = bldMapCode.replace('const BUILDING_FLOOR_MAP =', 'global.BUILDING_FLOOR_MAP =');
eval(bldMapCode);

let helpersCode = appJsContent.slice(appJsContent.indexOf('function resolveCanonicalBuildingCode'), appJsContent.indexOf('function getAllFm200Assets'));
eval(helpersCode);
global.resolveCanonicalBuildingCode = resolveCanonicalBuildingCode;
global.matchBuilding = matchBuilding;
global.matchFloor = matchFloor;

let facpAssetsCode = appJsContent.slice(appJsContent.indexOf('function getAllFacpAssets'), appJsContent.indexOf('function populateRoundFloorOptions'));
eval(facpAssetsCode);
global.getAllFacpAssets = getAllFacpAssets;

const popRoundFloorIdx = appJsContent.indexOf('function populateRoundFloorOptions(');
const renderAdminBldIdx = appJsContent.indexOf('function renderAdminBuildings()');
eval(appJsContent.slice(popRoundFloorIdx, renderAdminBldIdx));

// Mock state
global.INITIAL_BUILDINGS = [
  { code: 'A', name: 'المستشفى' },
  { code: 'B', name: 'التوسعة الشرقية' },
  { code: 'C', name: 'كلية الطب' },
  { code: 'C2', name: 'توسعة كلية الطب' },
  { code: 'D', name: 'المبنى الإداري' },
  { code: 'E', name: 'مبنى العيادات' },
  { code: 'F', name: 'مواقف متعددة الأدوار' },
  { code: 'G', name: 'مبنى الاسنان' },
  { code: 'H', name: 'العناية المركزة' },
  { code: 'I', name: 'مواقف 25' },
  { code: 'O', name: 'المستودعات الخارجية' }
];

global.state = {
  assets: [...KSU_FACP_ASSETS],
  buildings: INITIAL_BUILDINGS,
  currentRoundDraft: {
    formType: 'fas_insp',
    building: 'المستشفى',
    floor: 'الدور الأرضي (G)',
    floorAssetsStatus: null,
    items: []
  }
};

// --- Test 1: Building Dropdown Population ---
console.log('Test 1: Testing Building Dropdown Population...');
populateDynamicDropdowns();
const bldSelect = elements['inp-round-building'];
assert.strictEqual(bldSelect.options.length, 11, 'Should have 11 official buildings');

const hospOpt = bldSelect.options.find(o => o.value === 'المستشفى');
assert(hospOpt, 'Should contain Hospital');
assert(hospOpt.textContent.includes('5 لوحات إنذار'), `Hospital option should indicate 5 panels: ${hospOpt.textContent}`);

const medOpt = bldSelect.options.find(o => o.value === 'كلية الطب');
assert(medOpt, 'Should contain Medicine College');
assert(medOpt.textContent.includes('لوحتان'), `Medicine college option should indicate 2 panels: ${medOpt.textContent}`);

const adminOpt = bldSelect.options.find(o => o.value === 'المبنى الإداري');
assert(adminOpt.textContent.includes('لوحة إنذار واحدة'), 'Admin building should indicate 1 panel');

const icuOpt = bldSelect.options.find(o => o.value === 'العناية المركزة');
assert(icuOpt.textContent.includes('لوحة إنذار واحدة'), 'ICU should indicate 1 panel');

const whOpt = bldSelect.options.find(o => o.value === 'المستودعات الخارجية');
assert(whOpt.textContent.includes('لوحة إنذار واحدة'), 'Warehouse should indicate 1 panel');
console.log('✔ Test 1 Passed: All 11 buildings populated with accurate panel counts!\n');

// --- Test 2: Hospital Floors & Panels ---
console.log('Test 2: Testing Hospital Floors and Panels...');
bldSelect.value = 'المستشفى';
onRoundBuildingChange('المستشفى');
const floorSelect = elements['inp-round-floor'];
assert.strictEqual(floorSelect.value, 'الدور الأرضي (G)', 'Hospital should default to Ground Floor (G)');

const gOpt = floorSelect.options.find(o => o.value === 'الدور الأرضي (G)');
assert(gOpt.textContent.includes('3 لوحات'), 'Ground floor option should show 3 panels');

const fl1Opt = floorSelect.options.find(o => o.value === 'الدور الأول (1)');
assert(fl1Opt.textContent.includes('لوحة إنذار واحدة'), 'Floor 1 option should show 1 panel');

const fl3Opt = floorSelect.options.find(o => o.value === 'الدور الثالث (3)');
assert(fl3Opt.textContent.includes('لوحة إنذار واحدة'), 'Floor 3 option should show 1 panel');

const reconWidget = elements['round-floor-assets-reconciliation-widget'];
assert(reconWidget.textContent.includes('FA0019'), 'FA0019 must appear on Hospital G');
assert(reconWidget.textContent.includes('FA0017'), 'FA0017 must appear on Hospital G');
assert(reconWidget.textContent.includes('FA0024'), 'FA0024 must appear on Hospital G');
assert(!reconWidget.textContent.includes('FA0054'), 'FA0054 must NOT appear on Hospital G');
console.log('✔ Test 2 Passed: Hospital Ground Floor displays FA0019, FA0017, FA0024!\n');

// --- Test 3: Hospital Floor 1 Inspection ---
console.log('Test 3: Testing Hospital Floor 1...');
onRoundFloorChange('الدور الأول (1)');
assert(reconWidget.textContent.includes('FA0054'), 'FA0054 must appear on Hospital Floor 1');
assert(!reconWidget.textContent.includes('FA0019'), 'FA0019 must NOT appear on Hospital Floor 1');
console.log('✔ Test 3 Passed: Hospital Floor 1 displays FA0054!\n');

// --- Test 4: Hospital Floor 3 Inspection ---
console.log('Test 4: Testing Hospital Floor 3...');
onRoundFloorChange('الدور الثالث (3)');
assert(reconWidget.textContent.includes('FA0020'), 'FA0020 must appear on Hospital Floor 3');
console.log('✔ Test 4 Passed: Hospital Floor 3 displays FA0020!\n');

// --- Test 5: Medicine College B1 Panels ---
console.log('Test 5: Testing Medicine College...');
onRoundBuildingChange('كلية الطب');
assert.strictEqual(floorSelect.value, 'القبو الأول (B1)', 'Medicine college should default to B1');
assert(reconWidget.textContent.includes('FA0074'), 'FA0074 must appear in Medicine College B1');
assert(reconWidget.textContent.includes('FA0095'), 'FA0095 must appear in Medicine College B1');
console.log('✔ Test 5 Passed: Medicine College B1 displays FA0074 and FA0095!\n');

// --- Test 6: ICU Panel NM1757 ---
console.log('Test 6: Testing ICU Building...');
onRoundBuildingChange('العناية المركزة');
assert.strictEqual(floorSelect.value, 'الدور الأرضي (G)', 'ICU should default to G');
assert(reconWidget.textContent.includes('NM1757'), 'NM1757 must appear in ICU G');
console.log('✔ Test 6 Passed: ICU displays NM1757!\n');

// --- Test 7: Admin Building Panel FA0092 ---
console.log('Test 7: Testing Admin Building...');
onRoundBuildingChange('المبنى الإداري');
assert.strictEqual(floorSelect.value, 'الدور الأرضي (G)', 'Admin should default to G');
assert(reconWidget.textContent.includes('FA0092'), 'FA0092 must appear in Admin G');
console.log('✔ Test 8 Passed: Admin Building displays FA0092!\n');

// --- Test 8: Central Warehouse Panel NM-0022113 ---
console.log('Test 8: Testing Central Medical Warehouse...');
onRoundBuildingChange('المستودعات الخارجية');
assert.strictEqual(floorSelect.value, 'الدور الأرضي (G)', 'Warehouse should default to G');
assert(reconWidget.textContent.includes('NM-0022113'), 'NM-0022113 must appear in Warehouse G');
console.log('✔ Test 8 Passed: Warehouse displays NM-0022113!\n');

// --- Test 9: Form [8] Fire Alarm Testing (fas_test) ---
console.log('Test 9: Testing Form 8 fas_test...');
state.currentRoundDraft.formType = 'fas_test';
populateDynamicDropdowns();
onRoundBuildingChange('المستشفى');
assert.strictEqual(floorSelect.value, 'الدور الأرضي (G)');
assert(reconWidget.textContent.includes('FA0019'));
console.log('✔ Test 9 Passed: fas_test operates identically and flawlessly!\n');

// --- Test 10: Status Toggle and Auto-Fill ---
console.log('Test 10: Testing Status Toggle and Metadata Sync...');
toggleFloorAssetStatus('FACP-FA0019', 'compliant');
assert.strictEqual(state.currentRoundDraft.floorAssetsStatus['FACP-FA0019'], 'compliant');
assert.strictEqual(state.currentRoundDraft.loopNo, 1, 'Loop count should auto-sync to 1');
assert.strictEqual(state.currentRoundDraft.devicesNo, 1289, 'Device count should auto-sync to 1289');
console.log('✔ Test 10 Passed: Status toggles to compliant and auto-syncs loop/device count!\n');

console.log('🎉 ALL 10 EMPIRICAL INSPECTION TESTS PASSED WITH 100% SUCCESS!');

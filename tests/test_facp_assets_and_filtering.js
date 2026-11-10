// =============================================================================
// Unit Test: Fire Alarm Control Panels (FACP) Assets & Dynamic Form Filtering
// =============================================================================

const assert = require('assert');
const { KSU_FACP_ASSETS } = require('../assets/js/ksu-facp-assets.js');

console.log('🧪 Starting Fire Alarm Control Panels (FACP) Asset Tests...\n');

// 1. Verify Assets Count
assert.strictEqual(Array.isArray(KSU_FACP_ASSETS), true, 'KSU_FACP_ASSETS must be an array');
assert.strictEqual(KSU_FACP_ASSETS.length, 10, 'Must have exactly 10 registered FACP panels');
console.log('✓ Test 1 Passed: 10 FACP assets registered successfully.');

// 2. Verify Building Code Resolution & Distribution
const buildingCounts = {};
KSU_FACP_ASSETS.forEach(a => {
  buildingCounts[a.buildingCode] = (buildingCounts[a.buildingCode] || 0) + 1;
});

assert.strictEqual(buildingCounts['C'], 2, 'Building C (East Building / كلية الطب) must have 2 panels');
assert.strictEqual(buildingCounts['H'], 1, 'Building H (ICU / العناية المركزة) must have 1 panel');
assert.strictEqual(buildingCounts['D'], 1, 'Building D (Admin / المبنى الإداري) must have 1 panel');
assert.strictEqual(buildingCounts['A'], 5, 'Building A (Hospital / المستشفى) must have 5 panels');
assert.strictEqual(buildingCounts['O'], 1, 'Building O (Central Medical Store / المستودع الطبي المركزي) must have 1 panel');
console.log('✓ Test 2 Passed: Building distribution matches official allocation (C:2, H:1, D:1, A:5, O:1).');

// 3. Verify East Building Panels (المبنى الشرقي)
const eastBuildingPanels = KSU_FACP_ASSETS.filter(a => a.buildingCode === 'C');
assert.strictEqual(eastBuildingPanels.length, 2);
assert.deepStrictEqual(eastBuildingPanels.map(p => p.controlNo).sort(), ['FA0074', 'FA0095'].sort());
eastBuildingPanels.forEach(p => {
  assert.strictEqual(p.floorCode, 'B1', 'East building panels must be on floor B1');
  assert.strictEqual(p.loopsCount, 10, 'East building panels have 10 loops');
});
console.log('✓ Test 3 Passed: East building (المبنى الشرقي) has FA0074 and FA0095 correctly on floor B1 with 10 loops each.');

// 4. Verify Hospital Panels & Floors Distribution
const hospitalPanels = KSU_FACP_ASSETS.filter(a => a.buildingCode === 'A');
assert.strictEqual(hospitalPanels.length, 5);

const gPanels = hospitalPanels.filter(p => p.floorCode === 'G');
const f1Panels = hospitalPanels.filter(p => p.floorCode === '1');
const f3Panels = hospitalPanels.filter(p => p.floorCode === '3');

assert.strictEqual(gPanels.length, 3, 'Hospital ground floor (G) must have 3 panels (FA0019, FA0017, FA0024)');
assert.strictEqual(f1Panels.length, 1, 'Hospital first floor (1) must have 1 panel (FA0054)');
assert.strictEqual(f3Panels.length, 1, 'Hospital third floor (3) must have 1 panel (FA0020)');
console.log('✓ Test 4 Passed: Hospital panels distributed across floors G (3), 1 (1), 3 (1).');

// 5. Verify Central Medical Warehouse (المستودع الطبي المركزي - O)
const storePanel = KSU_FACP_ASSETS.find(a => a.buildingCode === 'O');
assert.ok(storePanel, 'Central medical store panel must exist');
assert.strictEqual(storePanel.controlNo, 'NM-0022113');
assert.strictEqual(storePanel.floorCode, 'G');
console.log('✓ Test 5 Passed: Central Medical Warehouse panel NM-0022113 registered on floor G.');

// 6. Verify Total Device Count & Loop Capacity
const totalLoops = KSU_FACP_ASSETS.reduce((sum, a) => sum + (a.loopsCount || 0), 0);
const totalDevices = KSU_FACP_ASSETS.reduce((sum, a) => sum + (a.devicesCount || 0), 0);
assert.strictEqual(totalLoops, 47, 'Total loops count must equal 47');
console.log(`✓ Test 6 Passed: Total loop capacity = ${totalLoops} loops, Total monitored devices = ${totalDevices} points.`);

console.log('\n🎉 ALL FACP ASSET TESTS PASSED SUCCESSFULLY! 100% Verified.\n');

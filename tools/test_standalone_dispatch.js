const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const reticleHelperPath = path.resolve(__dirname, '../assets/js/vision-reticle-helper.js');
const aiClientPath = path.resolve(__dirname, '../assets/js/ksu-ai-client.js');
const fieldHtmlPath = path.resolve(__dirname, '../field.html');

const mockStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
globalThis.localStorage = mockStorage;

test('Reticle helper exports prepareViolationFromVision and prepareNewRoundFromVision', () => {
  const reticleHelper = require(reticleHelperPath);
  assert.equal(typeof reticleHelper.prepareViolationFromVision, 'function', 'prepareViolationFromVision should be a function');
  assert.equal(typeof reticleHelper.prepareNewRoundFromVision, 'function', 'prepareNewRoundFromVision should be a function');
});

test('prepareViolationFromVision generates structured violation payload with formatted description and image', () => {
  const { prepareViolationFromVision } = require(reticleHelperPath);

  const analysisData = {
    detected_element: 'لوحة كهربائية ذات خلو غير كافٍ',
    risk_level: 'عالي',
    standard_reference: 'NFPA 70 / CBAHI FMS.04',
    findings_summary: 'تم رصد مواد قابلة للاشتعال مخزنة على مسافة 40 سم من اللوحة الكهربائية',
    violations_list: [
      'عدم الالتزام بمسافة الخلو المقررة (36 بوصة / 90 سم)',
      'تخزين مواد كرتونية ملاصقة لقواطع التيار'
    ],
    corrective_actions: [
      'إخلاء المنطقة المحيطة باللوحة الكهربائية فوراً',
      'توجيه إشعار للقسم المخالف والرفع للجنة السلامة'
    ]
  };

  const locationData = {
    building: 'المبنى الرئيسي (KKUH)',
    floor: 'الدور الثاني',
    room: 'غرفة التحكم 210'
  };

  const imageBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDA...';
  const beforeTime = Date.now();
  const payload = prepareViolationFromVision(analysisData, locationData, imageBase64);
  const afterTime = Date.now();

  assert.equal(payload.building, 'المبنى الرئيسي (KKUH)');
  assert.equal(payload.floor, 'الدور الثاني');
  assert.equal(payload.room, 'غرفة التحكم 210');
  assert.equal(payload.title, 'لوحة كهربائية ذات خلو غير كافٍ');
  assert.equal(payload.risk_level, 'عالي');
  assert.equal(payload.standard_reference, 'NFPA 70 / CBAHI FMS.04');
  assert.equal(payload.image, imageBase64);
  assert.ok(payload.timestamp >= beforeTime && payload.timestamp <= afterTime, 'timestamp must be recent');

  // Verify description formatting
  const desc = payload.description;
  assert.ok(typeof desc === 'string' && desc.length > 0, 'description must be a non-empty string');
  assert.ok(desc.includes('تم رصد مواد قابلة للاشتعال'), 'description must contain findings summary');
  assert.ok(desc.includes('عدم الالتزام بمسافة الخلو المقررة'), 'description must contain violations');
  assert.ok(desc.includes('•') || desc.includes('-'), 'violations must be bulleted');
  assert.ok(desc.includes('NFPA 70 / CBAHI FMS.04') || desc.includes('المرجع'), 'description must contain standard reference');
  assert.ok(desc.includes('إخلاء المنطقة المحيطة') || desc.includes('CAPA'), 'description must contain CAPA corrective actions');
});

test('prepareViolationFromVision applies safe defaults on partial or empty arguments', () => {
  const { prepareViolationFromVision } = require(reticleHelperPath);

  const payload = prepareViolationFromVision(null, null, null);

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

test('prepareNewRoundFromVision maps submodes accurately to round checklist types', () => {
  const { prepareNewRoundFromVision } = require(reticleHelperPath);

  const location = { building: 'مبنى الأورام', floor: 'الدور الثالث' };

  // 1. extinguisher -> fex
  const rExt = prepareNewRoundFromVision({ submode: 'extinguisher', findings_summary: 'طفاية بحاجة لفحص' }, location);
  assert.equal(rExt.checklistType, 'fex');
  assert.equal(rExt.building, 'مبنى الأورام');
  assert.equal(rExt.floor, 'الدور الثالث');
  assert.equal(rExt.notes, 'طفاية بحاجة لفحص');
  assert.equal(typeof rExt.timestamp, 'number');

  // 2. emergency_exit -> ext
  const rExit = prepareNewRoundFromVision({ submode: 'emergency_exit', findings_summary: 'مخرج طوارئ مغلق' }, location);
  assert.equal(rExit.checklistType, 'ext');

  // 3. hazard -> all
  const rHaz = prepareNewRoundFromVision({ submode: 'hazard', findings_summary: 'خطر كهربائي' }, location);
  assert.equal(rHaz.checklistType, 'all');

  // 4. general -> all
  const rGen = prepareNewRoundFromVision({ submode: 'general', findings_summary: 'فحص عام' }, location);
  assert.equal(rGen.checklistType, 'all');

  // 5. unknown or missing -> all
  const rDef = prepareNewRoundFromVision({}, {});
  assert.equal(rDef.checklistType, 'all');
  assert.equal(rDef.building, '');
  assert.equal(rDef.floor, '');
});

test('ksu-ai-client.js renders standalone quick scan action buttons when no round active', () => {
  const clientCode = fs.readFileSync(aiClientPath, 'utf8');

  // Must reference standalone dispatch functions
  assert.ok(clientCode.includes('openViolationFromAI'), 'ksu-ai-client.js must define or call openViolationFromAI');
  assert.ok(clientCode.includes('startRoundFromAI'), 'ksu-ai-client.js must define or call startRoundFromAI');

  // Must have action labels
  assert.ok(clientCode.includes('إنشاء بلاغ مخالفة فوري'), 'ksu-ai-client.js must include instant violation button text');
  assert.ok(clientCode.includes('بدء جولة جديدة لهذا الموقع'), 'ksu-ai-client.js must include start new round button text');
});

test('openViolationFromAI pre-fills violation modal inputs, closes vision modal, and opens violation modal', () => {
  const reticleHelper = require(reticleHelperPath);

  class MockClassList {
    constructor() { this._set = new Set(); }
    add(...tokens) { tokens.forEach(t => this._set.add(t)); }
    remove(...tokens) { tokens.forEach(t => this._set.delete(t)); }
    contains(token) { return this._set.has(token); }
  }

  const mockElements = new Map();
  class MockElement {
    constructor(id = '', tag = 'div') {
      this.id = id;
      this.tagName = tag.toUpperCase();
      this.classList = new MockClassList();
      this.attributes = {};
      this.value = '';
      this.src = '';
      this.style = {};
    }
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }
    remove() { this.removed = true; }
  }

  // Setup DOM elements for violation modal
  const violModal = new MockElement('newSafetyViolationModal');
  violModal.classList.add('hidden');
  mockElements.set('newSafetyViolationModal', violModal);
  mockElements.set('violationModal', violModal);

  const inpBuilding = new MockElement('inp-violation-building', 'input');
  const inpFloor = new MockElement('inp-violation-floor', 'input');
  const inpLoc = new MockElement('inp-violation-location', 'input');
  const inpDesc = new MockElement('inp-violation-desc', 'textarea');
  const imgPreview = new MockElement('violation-image-preview', 'img');

  mockElements.set('inp-violation-building', inpBuilding);
  mockElements.set('inp-violation-floor', inpFloor);
  mockElements.set('inp-violation-location', inpLoc);
  mockElements.set('inp-violation-desc', inpDesc);
  mockElements.set('violation-image-preview', imgPreview);

  const visionModal = new MockElement('ksu-ai-vision-modal');
  mockElements.set('ksu-ai-vision-modal', visionModal);

  // Setup environment
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  globalThis.document = {
    getElementById: (id) => mockElements.get(id) || null
  };

  globalThis.KSUReticleHelper = reticleHelper;
  globalThis.window = {
    KSUReticleHelper: reticleHelper,
    lastVisionAnalysisData: {
      detected_element: 'سخان كهربائي مخالف',
      risk_level: 'عالي',
      findings_summary: 'استخدام سخان غير معتمد داخل مكاتب إدارية',
      violations_list: ['استخدام أجهزة تسخين غير مصرح بها'],
      corrective_actions: ['مصادرة الجهاز فوراً']
    },
    lastVisionLocation: {
      building: 'المبنى الطبي الرئيسي',
      floor: 'الدور الأول',
      room: 'مكتب 105'
    },
    lastVisionAnalysisImage: 'data:image/png;base64,mockImage123'
  };

  delete require.cache[aiClientPath];
  require(aiClientPath);

  assert.equal(typeof globalThis.window.openViolationFromAI, 'function', 'window.openViolationFromAI must be defined');

  // Trigger action
  globalThis.window.openViolationFromAI();

  // Verify inputs pre-filled
  assert.equal(inpBuilding.value, 'المبنى الطبي الرئيسي');
  assert.equal(inpFloor.value, 'الدور الأول');
  assert.ok(inpLoc.value.includes('المبنى الطبي الرئيسي') || inpLoc.value.includes('مكتب 105'));
  assert.ok(inpDesc.value.includes('استخدام سخان غير معتمد') && inpDesc.value.includes('مصادرة الجهاز فوراً'));
  assert.equal(imgPreview.src, 'data:image/png;base64,mockImage123');

  // Verify modal state transition
  assert.equal(visionModal.removed, true, 'ksu-ai-vision-modal should be closed / removed');
  assert.equal(violModal.classList.contains('hidden'), false, 'violation modal should not have hidden class');
  assert.equal(violModal.classList.contains('flex'), true, 'violation modal should have flex class');

  // Cleanup
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

test('startRoundFromAI pre-fills round modal inputs, closes vision modal, and opens new round modal', () => {
  const reticleHelper = require(reticleHelperPath);

  class MockClassList {
    constructor() { this._set = new Set(); }
    add(...tokens) { tokens.forEach(t => this._set.add(t)); }
    remove(...tokens) { tokens.forEach(t => this._set.delete(t)); }
    contains(token) { return this._set.has(token); }
  }

  const mockElements = new Map();
  class MockElement {
    constructor(id = '', tag = 'div') {
      this.id = id;
      this.tagName = tag.toUpperCase();
      this.classList = new MockClassList();
      this.value = '';
    }
    remove() { this.removed = true; }
  }

  const roundModal = new MockElement('newRoundModal');
  roundModal.classList.add('hidden');
  mockElements.set('newRoundModal', roundModal);

  const inpRoundBuilding = new MockElement('inp-round-building', 'select');
  const inpRoundFloor = new MockElement('inp-round-floor', 'select');
  const inpRoundFormType = new MockElement('inp-round-form-type', 'input');
  const inpRoundNotes = new MockElement('inp-round-notes', 'textarea');

  mockElements.set('inp-round-building', inpRoundBuilding);
  mockElements.set('inp-round-floor', inpRoundFloor);
  mockElements.set('inp-round-form-type', inpRoundFormType);
  mockElements.set('inp-round-notes', inpRoundNotes);

  const visionModal = new MockElement('ksu-ai-vision-modal');
  mockElements.set('ksu-ai-vision-modal', visionModal);

  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  globalThis.document = {
    getElementById: (id) => mockElements.get(id) || null
  };

  globalThis.KSUReticleHelper = reticleHelper;
  globalThis.window = {
    KSUReticleHelper: reticleHelper,
    lastVisionAnalysisData: {
      submode: 'extinguisher',
      detected_element: 'طفاية حريق منتهية الصلاحية',
      findings_summary: 'طفاية حريق بودرة بحاجة لإعادة تعبئة'
    },
    lastVisionLocation: {
      building: 'مبنى طب الأسنان',
      floor: 'الدور الأرضي'
    }
  };

  delete require.cache[aiClientPath];
  require(aiClientPath);

  assert.equal(typeof globalThis.window.startRoundFromAI, 'function', 'window.startRoundFromAI must be defined');

  // Trigger action
  globalThis.window.startRoundFromAI();

  // Verify inputs pre-filled
  assert.equal(inpRoundBuilding.value, 'مبنى طب الأسنان');
  assert.equal(inpRoundFloor.value, 'الدور الأرضي');
  assert.equal(inpRoundFormType.value, 'fex', 'extinguisher submode should map to fex form type');

  // Verify modal state transition
  assert.equal(visionModal.removed, true, 'ksu-ai-vision-modal should be closed / removed');
  assert.equal(roundModal.classList.contains('hidden'), false, 'round modal should not have hidden class');
  assert.equal(roundModal.classList.contains('flex'), true, 'round modal should have flex class');

  // Cleanup
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

test('field.html contains compatible violation modal inputs and round modal inputs', () => {
  const html = fs.readFileSync(fieldHtmlPath, 'utf8');

  // Violation modal inputs
  assert.ok(html.includes('id="inp-violation-building"') || html.includes("id='inp-violation-building'"), 'field.html must have inp-violation-building');
  assert.ok(html.includes('id="inp-violation-floor"') || html.includes("id='inp-violation-floor'"), 'field.html must have inp-violation-floor');
  assert.ok(html.includes('id="inp-violation-location"') || html.includes("id='inp-violation-location'"), 'field.html must have inp-violation-location');
  assert.ok(html.includes('id="inp-violation-desc"') || html.includes("id='inp-violation-desc'"), 'field.html must have inp-violation-desc');
  assert.ok(html.includes('id="violation-image-preview"') || html.includes('id="inp-violation-image-preview"'), 'field.html must have violation image preview');

  // Round modal inputs
  assert.ok(html.includes('id="newRoundModal"'), 'field.html must have newRoundModal');
  assert.ok(html.includes('id="inp-round-building"'), 'field.html must have inp-round-building');
  assert.ok(html.includes('id="inp-round-floor"'), 'field.html must have inp-round-floor');
  assert.ok(html.includes('id="inp-round-form-type"'), 'field.html must have inp-round-form-type');
});

test('Syntax check passes for modified JavaScript files', () => {
  assert.doesNotThrow(() => {
    execSync(`node -c "${reticleHelperPath}"`, { stdio: 'pipe' });
  }, 'vision-reticle-helper.js syntax check failed');

  assert.doesNotThrow(() => {
    execSync(`node -c "${aiClientPath}"`, { stdio: 'pipe' });
  }, 'ksu-ai-client.js syntax check failed');
});

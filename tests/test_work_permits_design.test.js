const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function extractFn(src, sig) {
  const start = src.indexOf(sig);
  assert.notEqual(start, -1, `Missing function ${sig}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      return src.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${sig}`);
}

function makeEl(id = '') {
  const classes = new Set();
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    placeholder: '',
    style: {},
    className: '',
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      contains: (c) => classes.has(c),
      toArray: () => Array.from(classes)
    },
    addEventListener() {},
    focus() {},
    remove() {},
    querySelector: () => null,
    appendChild() {}
  };
}

test('WP-1: field.html Work Permits view, Bento card, and modal follow RSD Royal Navy & Gold identity while preserving IDs', () => {
  const fieldHtml = fs.readFileSync(path.join(ROOT, 'field.html'), 'utf8');

  // View header upgraded to RSD Navy hero gradient
  const viewIdx = fieldHtml.indexOf('id="view-permits"');
  assert.notEqual(viewIdx, -1);
  const viewEndIdx = fieldHtml.indexOf('<!-- VIEW 10', viewIdx);
  const viewSlice = fieldHtml.slice(viewIdx, viewEndIdx !== -1 ? viewEndIdx : viewIdx + 5000);
  assert.ok(viewSlice.includes('#00162B') && viewSlice.includes('#082B49') && viewSlice.includes('#004B87'), 'view-permits must use RSD Royal Navy hero gradient');
  assert.ok(viewSlice.includes('#C59B27'), 'view-permits must use KSUMC Gold CTA/accents');
  assert.ok(viewSlice.includes('id="field-kpi-permits-count"'), 'Must preserve field-kpi-permits-count');
  assert.ok(viewSlice.includes('id="field-permits-list-container"'), 'Must preserve field-permits-list-container');
  assert.ok(viewSlice.includes('setPermitsFilter('), 'view-permits must expose quick status filter buttons');

  // Modal upgraded with z-[100] and Royal Navy header while keeping all input IDs
  const modalIdx = fieldHtml.indexOf('id="newPermitModal"');
  assert.notEqual(modalIdx, -1);
  const modalDivStart = fieldHtml.lastIndexOf('<div', modalIdx);
  const modalEndIdx = fieldHtml.indexOf('<!-- 5. Upgraded Door Open Request Modal', modalDivStart);
  const modalSlice = fieldHtml.slice(modalDivStart, modalEndIdx !== -1 ? modalEndIdx : modalDivStart + 25000);
  assert.ok(modalSlice.includes('z-[100]'), 'newPermitModal must use z-[100] above mobile nav');
  assert.ok(modalSlice.includes('#082B49') && modalSlice.includes('#004B87'), 'newPermitModal must use Royal Navy header & section styling');
  assert.ok(!modalSlice.includes('from-amber-500'), 'newPermitModal must not use legacy bright amber-only hero styling');

  for (const requiredId of [
    'inp-permit-cert-no',
    'inp-permit-date',
    'inp-permit-contractor',
    'inp-permit-technician',
    'inp-permit-job-id',
    'inp-permit-tel',
    'inp-permit-supervisor',
    'inp-permit-start-time',
    'inp-permit-end-time',
    'inp-permit-worktype',
    'inp-permit-zone',
    'inp-permit-floor',
    'inp-permit-room',
    'chk-hw-1',
    'chk-hw-8',
    'inp-permit-fire-equip',
    'canvas-hw-applicant',
    'canvas-hw-safety',
    'btn-hw-opt-cut',
    'btn-hw-opt-weld',
    'btn-hw-opt-cutweld',
    'btn-hw-opt-other',
    'hw-worktype-hint'
  ]) {
    assert.ok(modalSlice.includes(`id="${requiredId}"`), `newPermitModal must preserve input id="${requiredId}"`);
  }
});

test('WP-2: selectPermitWorkType applies RSD Royal Navy active state instead of orange bg-amber-600', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const fnSrc = extractFn(appJs, 'function selectPermitWorkType(');

  const elements = new Map([
    ['btn-hw-opt-cut', makeEl('btn-hw-opt-cut')],
    ['btn-hw-opt-weld', makeEl('btn-hw-opt-weld')],
    ['btn-hw-opt-cutweld', makeEl('btn-hw-opt-cutweld')],
    ['btn-hw-opt-other', makeEl('btn-hw-opt-other')],
    ['inp-permit-worktype', makeEl('inp-permit-worktype')],
    ['hw-worktype-hint', makeEl('hw-worktype-hint')]
  ]);

  const sandbox = vm.createContext({
    document: { getElementById: (id) => elements.get(id) || null },
    window: {}
  });
  vm.runInContext(fnSrc, sandbox);
  sandbox.selectPermitWorkType('لحام');

  const weldBtn = elements.get('btn-hw-opt-weld');
  assert.ok(weldBtn.classList.contains('bg-[#082B49]'), 'Selected worktype pill must use bg-[#082B49]');
  assert.ok(!weldBtn.classList.contains('bg-amber-600'), 'Selected worktype pill must NOT use bg-amber-600');
  assert.equal(elements.get('inp-permit-worktype').value, 'لحام');
});

test('WP-3: renderPermitsList renders RSD Royal Navy cards and supports status filtering', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const renderFn = extractFn(appJs, 'function renderPermitsList(');
  const filterFn = extractFn(appJs, 'function setPermitsFilter(');

  const container = makeEl('field-permits-list-container');
  const kpi = makeEl('field-kpi-permits-count');
  const filterAllBtn = makeEl('btn-permit-filter-all');
  const filterActiveBtn = makeEl('btn-permit-filter-active');
  const filterExpiredBtn = makeEl('btn-permit-filter-expired');
  const elements = new Map([
    ['field-permits-list-container', container],
    ['field-kpi-permits-count', kpi],
    ['btn-permit-filter-all', filterAllBtn],
    ['btn-permit-filter-active', filterActiveBtn],
    ['btn-permit-filter-expired', filterExpiredBtn]
  ]);

  const sandbox = vm.createContext({
    state: {
      permitsFilter: 'all',
      permits: [
        {
          id: 'HWP-2026-104',
          workType: 'قص + لحام',
          applicant: 'م. فهد السبيعي',
          contractor: 'شركة إسناد',
          zone: 'Zone A',
          floor: 'الدور 2',
          fireWatch: 'خالد العتيبي',
          inspector: 'أ. عادل الشلوي',
          date: '2026-11-26',
          endTime: '16:00',
          validUntil: '2026-11-26 16:00',
          status: 'ساري ومعتمد',
          applicantSignature: 'data:image/png;base64,AAA'
        },
        {
          id: 'HWP-2026-099',
          workType: 'لحام',
          applicant: 'فني صيانة',
          date: '2026-11-20',
          status: 'منتهي المدة'
        }
      ]
    },
    STORAGE_KEY_PERMITS: 'ksumc_safety_permits',
    localStorage: { getItem: () => null },
    document: { getElementById: (id) => elements.get(id) || null }
  });
  vm.runInContext(`${renderFn}\n${filterFn}`, sandbox);
  sandbox.renderPermitsList();

  assert.ok(container.innerHTML.includes('border-r-[#004B87]'), 'Rendered permit card must use Royal Navy right border');
  assert.ok(!container.innerHTML.includes('border-r-amber-500'), 'Rendered permit card must replace legacy orange border');
  assert.ok(container.innerHTML.includes('openOfficialPermitCardModal'), 'Rendered card must retain official card button');
  assert.ok(container.innerHTML.includes('printHotWorkPermit'), 'Rendered card must retain A4 print button');
  assert.equal(kpi.textContent, '1 سارية', 'KPI count must reflect active permits');

  sandbox.setPermitsFilter('active');
  assert.ok(container.innerHTML.includes('HWP-2026-104'), 'Active filter must include active permit');
  assert.ok(!container.innerHTML.includes('HWP-2026-099'), 'Active filter must exclude expired permit');
});

test('WP-4: Official Digital Permit Card and A4 Bilingual Print Sheet conform to KSUMC RSD design standards', () => {
  const officialCardCode = fs.readFileSync(path.join(ROOT, 'assets/js/ksu-official-card.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');

  assert.ok(!officialCardCode.includes('والأمن الميداني'), 'Safety naming rule must forbid والأمن الميداني');

  const cardSandbox = vm.createContext({
    window: {},
    document: { getElementById: () => null, createElement: () => makeEl() },
    Intl,
    Date,
    Math,
    localStorage: { getItem: () => '[]' }
  });
  cardSandbox.window = cardSandbox;
  vm.runInContext(officialCardCode, cardSandbox);

  const cardHtml = cardSandbox.generateOfficialPermitCardHtml({
    id: 'HWP-2026-501',
    workType: 'قص + لحام',
    applicant: 'م. فهد السبيعي',
    contractor: 'شركة إسناد',
    zone: 'Zone B',
    floor: 'الدور الأول',
    fireWatch: 'خالد العتيبي',
    inspector: 'أ. عادل الشلوي',
    date: '2026-11-26',
    startTime: '08:00',
    endTime: '16:00'
  });

  assert.ok(cardHtml.includes('2.5px solid #004B87'), 'Official permit card frame must use #004B87 navy');
  assert.ok(cardHtml.includes('linear-gradient(135deg, #004B87 0%, #002B49 100%)'), 'Official permit card banner must match RSD Royal Navy gradient');
  assert.ok(!cardHtml.includes('#b45309 0%, #002B49'), 'Official permit card must NOT use legacy brown/amber banner gradient');
  assert.ok(!cardHtml.includes('🔥'), 'Official permit card must replace flame emoji with clean RSD emblem/typography');

  let printedHtml = '';
  const printFn = extractFn(appJs, 'function printHotWorkPermit(');
  const printSandbox = vm.createContext({
    state: {
      permits: [{
        id: 'HWP-2026-501',
        workType: 'قص + لحام',
        applicant: 'م. فهد السبيعي',
        contractor: 'شركة إسناد',
        zone: 'Zone B',
        floor: 'الدور الأول',
        inspector: 'أ. عادل الشلوي',
        date: '2026-11-26',
        startTime: '08:00',
        endTime: '16:00',
        validUntil: '2026-11-26 16:00',
        status: 'ساري ومعتمد'
      }]
    },
    window: { location: { href: 'https://rsd-ksu.web.app/field.html' } },
    generateQRCodeSVG: () => '<svg></svg>',
    printHtmlContent: (html) => { printedHtml = html; },
    showToast: () => {}
  });
  vm.runInContext(printFn, printSandbox);
  printSandbox.printHotWorkPermit('HWP-2026-501');

  assert.ok(printedHtml.includes('#082B49'), 'Print sheet must apply KSUMC Royal Navy #082B49');
  assert.ok(printedHtml.includes('#C59B27'), 'Print sheet must apply KSUMC Gold #C59B27 accent');
  assert.ok(printedHtml.includes('Kingdom of Saudi Arabia'), 'Print sheet must fix Kingdome typo');
  assert.ok(!printedHtml.includes('Kingdome'), 'Print sheet must not contain Kingdome typo');
  assert.ok(printedHtml.includes('وزارة التعليم') && !printedHtml.includes('وزارة التعليم العالي'), 'Print sheet must use updated وزارة التعليم name');
});

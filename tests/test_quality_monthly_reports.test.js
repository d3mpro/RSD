const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('MR-1: quality.html exposes Monthly Building & Form Report Builder with CBAHI / Civil Defense & format toggles', () => {
  const qualityHtml = fs.readFileSync(path.join(ROOT, 'quality.html'), 'utf8');

  assert.ok(
    qualityHtml.includes('assets/js/ksu-monthly-reports.js'),
    'quality.html must load assets/js/ksu-monthly-reports.js'
  );
  assert.ok(
    qualityHtml.includes('id="monthly-building-report-builder"'),
    'quality.html must include #monthly-building-report-builder section'
  );

  for (const id of [
    'mr-form-type',
    'mr-building',
    'mr-month',
    'mr-status-filter',
    'btn-mr-reg-cbahi',
    'btn-mr-reg-civil_defense',
    'btn-mr-reg-unified',
    'btn-mr-mode-matrix_plus_details',
    'btn-mr-mode-summary_only',
    'mr-preview-container',
    'btn-open-monthly-report-builder'
  ]) {
    assert.ok(
      qualityHtml.includes(`id="${id}"`),
      `quality.html must include control id="${id}"`
    );
  }

  assert.ok(
    qualityHtml.includes('printMonthlyBuildingReport('),
    'quality.html must wire printMonthlyBuildingReport() button'
  );
  assert.ok(
    qualityHtml.includes('setMonthlyReportRegulatoryProfile('),
    'quality.html must allow toggling CBAHI / Civil Defense regulatory profile'
  );
  assert.ok(
    qualityHtml.includes('setMonthlyReportPrintMode('),
    'quality.html must allow switching between full binder and summary-only modes'
  );
});

test('MR-2: KSUMonthlyReports aggregates building rounds across all floors, avoids duplicates, and isolates building/form/month', () => {
  const MonthlyReports = require(path.join(ROOT, 'assets/js/ksu-monthly-reports.js'));

  const floorsMap = {
    'مبنى العيادات': ['القبو الأول (B1)', 'القبو (B)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح (Roof)'],
    'المستشفى': ['القبو الثاني (B2)', 'القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)']
  };

  const sampleRounds = [
    {
      id: 'RND-CLINIC-G',
      formType: 'ext',
      formTitle: '[2] مخارج الطوارئ (شهري)',
      building: 'مبنى العيادات',
      floor: 'الدور الأرضي (G)',
      date: '2026-11-05',
      inspector: 'أ. أحمد الأكلبي',
      score: 100,
      compliantCount: 5,
      observationCount: 0,
      violationCount: 0,
      workflowStatus: 'approved_cbahi',
      items: [
        { code: 'KSU-EXT-01', title: 'كفاءة أبواب مخارج الطوارئ', result: 'compliant', note: '' }
      ]
    },
    {
      id: 'RND-CLINIC-1',
      formType: 'ext',
      formTitle: '[2] مخارج الطوارئ (شهري)',
      building: 'مبنى العيادات (العيادات الخارجية)',
      floor: 'الدور الأول (1)',
      date: '2026-11-12',
      inspector: 'أ. عادل العنزي',
      score: 80,
      compliantCount: 4,
      observationCount: 1,
      violationCount: 0,
      workflowStatus: 'pending_quality',
      notes: 'ملاحظة على إضاءة مخرج الجناح الشمالي',
      items: [
        { code: 'KSU-EXT-01', title: 'كفاءة أبواب مخارج الطوارئ', result: 'compliant', note: '' },
        { code: 'KSU-EXT-02', title: 'لوحة EXIT المضيئة', result: 'observation', note: 'تحتاج استبدال لمبة الطوارئ' }
      ]
    },
    {
      // Different formType in same building/month -> MUST be excluded when formType='ext'
      id: 'RND-CLINIC-FEX',
      formType: 'fex',
      formTitle: '[1] طفايات الحريق',
      building: 'مبنى العيادات',
      floor: 'الدور الثاني (2)',
      date: '2026-11-14',
      inspector: 'أ. عادل العنزي',
      score: 100,
      compliantCount: 6,
      observationCount: 0,
      violationCount: 0,
      workflowStatus: 'approved_cbahi'
    },
    {
      // Different building -> MUST be excluded when building='مبنى العيادات'
      id: 'RND-HOSP-G',
      formType: 'ext',
      building: 'المستشفى',
      floor: 'الدور الأرضي (G)',
      date: '2026-11-10',
      inspector: 'أ. حسن دعاك',
      score: 100,
      workflowStatus: 'approved_cbahi'
    },
    {
      // Different month -> MUST be excluded when month='2026-11'
      id: 'RND-CLINIC-OCT',
      formType: 'ext',
      building: 'مبنى العيادات',
      floor: 'الدور الثاني (2)',
      date: '2026-10-18',
      inspector: 'أ. أحمد الأكلبي',
      score: 100,
      workflowStatus: 'approved_cbahi'
    }
  ];

  // Duplicate of RND-CLINIC-G inside shiftLogs + one extra basement round only in shiftLogs
  const sampleShiftLogs = [
    {
      id: 'RND-CLINIC-G',
      roundId: 'RND-CLINIC-G',
      modelId: 'ext',
      modelName: '[2] مخارج الطوارئ',
      building: 'مبنى العيادات',
      floor: 'الدور الأرضي (G)',
      date: '2026-11-05',
      inspector: 'أ. أحمد الأكلبي',
      complianceRate: 100,
      workflowStatus: 'approved_cbahi'
    },
    {
      id: 'SHF-CLINIC-B1',
      modelId: 'ext',
      modelName: 'نموذج مخارج الطوارئ',
      building: 'مبنى العيادات',
      floor: 'القبو (B)',
      date: '2026-11-19',
      inspector: 'أ. فهد المطيري',
      complianceRate: 100,
      workflowStatus: 'approved_by_quality'
    }
  ];

  const dataset = MonthlyReports.buildMonthlyReportDataset({
    formType: 'ext',
    building: 'مبنى العيادات',
    month: '2026-11',
    approvalFilter: 'all',
    rounds: sampleRounds,
    shiftLogs: sampleShiftLogs,
    buildingFloorMap: floorsMap
  });

  // 3 unique matching rounds (G, 1, and B1 from shiftLogs; duplicate G collapsed; FEX/HOSP/OCT excluded)
  assert.equal(dataset.matchedRounds.length, 3, 'Must find exactly 3 deduplicated Emergency Exit rounds in Clinics Building for 2026-11');

  // B and B1 alias collapsed cleanly so Clinics Building has 6 canonical unique floors: B1, G, 1, 2, 3, Roof
  assert.equal(dataset.floorRows.length, 6, 'Clinics Building canonical floor matrix must deduplicate B/B1 alias and cover all 6 unique floors');
  assert.equal(dataset.inspectedFloorsCount, 3, 'Must report 3 inspected floors out of 6');
  assert.equal(dataset.totalFloorsCount, 6);
  assert.equal(dataset.coveragePct, 50);
  assert.equal(dataset.avgScore, 93); // Math.round((100 + 80 + 100) / 3)
  assert.equal(dataset.totalObservations, 1);

  const b1Row = dataset.floorRows.find(f => f.floorLabel.includes('B1') || f.floorLabel.includes('القبو'));
  assert.ok(b1Row && b1Row.inspected === true, 'Basement round SHF-CLINIC-B1 must satisfy the basement floor row');
  const floor2Row = dataset.floorRows.find(f => f.floorLabel.includes('(2)'));
  assert.ok(floor2Row && floor2Row.inspected === false, 'Floor 2 (where only FEX or October round ran) must remain uninspected for Nov Exits');

  // Test approved-only filter excludes pending RND-CLINIC-1
  const approvedDataset = MonthlyReports.buildMonthlyReportDataset({
    formType: 'ext',
    building: 'مبنى العيادات',
    month: '2026-11',
    approvalFilter: 'approved',
    rounds: sampleRounds,
    shiftLogs: sampleShiftLogs,
    buildingFloorMap: floorsMap
  });
  assert.equal(approvedDataset.matchedRounds.length, 2, 'Approved filter must exclude pending_quality round RND-CLINIC-1');
});

test('MR-3: generateMonthlyReportPrintHtml switches cleanly between CBAHI, Civil Defense, Unified, and Full vs Summary print modes', () => {
  const MonthlyReports = require(path.join(ROOT, 'assets/js/ksu-monthly-reports.js'));

  const dataset = MonthlyReports.buildMonthlyReportDataset({
    formType: 'ext',
    building: 'مبنى العيادات',
    month: '2026-11',
    approvalFilter: 'all',
    rounds: [
      {
        id: 'RND-XSS-1',
        formType: 'ext',
        building: 'مبنى العيادات',
        floor: 'الدور الأرضي (G)',
        date: '2026-11-08',
        inspector: 'أ. خالد <script>alert(1)</script>',
        score: 90,
        compliantCount: 9,
        observationCount: 1,
        violationCount: 0,
        notes: 'باب مخرج 3 يحتاج ضبط إغلاق ذاتي',
        workflowStatus: 'approved_cbahi',
        items: [
          { code: 'KSU-EXT-01', title: 'كفاءة أبواب مخارج الطوارئ', result: 'observation', note: 'ضبط الدفاش الذاتي' }
        ]
      }
    ],
    buildingFloorMap: {
      'مبنى العيادات': ['الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)']
    }
  });

  // 1. CBAHI + full details
  const cbahiHtml = MonthlyReports.generateMonthlyReportPrintHtml(dataset, {
    regulatoryProfile: 'cbahi',
    printMode: 'matrix_plus_details'
  });
  assert.ok(cbahiHtml.includes('CBAHI'), 'CBAHI printout must include CBAHI accreditation framing');
  assert.ok(cbahiHtml.includes('سباهي'), 'CBAHI printout must include سباهي label');
  assert.ok(cbahiHtml.includes('مبنى العيادات'), 'Printout must name the selected building');
  assert.ok(cbahiHtml.includes('مخارج الطوارئ'), 'Printout must name the selected form');
  assert.ok(cbahiHtml.includes('ضبط الدفاش الذاتي'), 'matrix_plus_details mode must include per-floor checklist item details');
  assert.ok(cbahiHtml.includes('page-break-before: always'), 'matrix_plus_details must include clean page break before detailed floor sheets');
  assert.ok(!cbahiHtml.includes('<script>alert(1)</script>'), 'Must sanitize XSS payloads in inspector/notes');

  // 2. Civil Defense + summary_only
  const cdHtml = MonthlyReports.generateMonthlyReportPrintHtml(dataset, {
    regulatoryProfile: 'civil_defense',
    printMode: 'summary_only'
  });
  assert.ok(cdHtml.includes('الدفاع المدني'), 'Civil Defense printout must include الدفاع المدني framing');
  assert.ok(cdHtml.includes('SBC 801') || cdHtml.includes('SBC 201'), 'Civil Defense printout must reference Saudi Fire/Building Code');
  assert.ok(!cdHtml.includes('class="floor-detail-appendix"'), 'summary_only mode must omit per-floor detailed checklist appendices');

  // 3. Unified (CBAHI + Civil Defense together)
  const unifiedHtml = MonthlyReports.generateMonthlyReportPrintHtml(dataset, {
    regulatoryProfile: 'unified',
    printMode: 'matrix_plus_details'
  });
  assert.ok(unifiedHtml.includes('سباهي') && unifiedHtml.includes('الدفاع المدني'), 'Unified printout must address both CBAHI and Civil Defense');
});

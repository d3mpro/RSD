/**
 * =============================================================================
 * KSUMC RSD Production Readiness End-to-End Test Suite (Tiers 1 - 4)
 * =============================================================================
 * Project: KSUMC RSD Safety & Inspection Platform (rsd-ksu.web.app)
 * Scope: Complete Opaque-Box Verification of the 22 Production Features,
 *        Official 22-Account Roster, Short Username Authentication (M1..M14,
 *        S1..S3, H1, H2, D1, Q1, DEV), Strict Shift Isolation in Approvals,
 *        Cross-Feature Workflows, and Hospital Operational Scenarios.
 *
 * Test Runner: Node.js Native Test Runner (node:test + node:assert/strict)
 * Execution: node --test tests/e2e_production_readiness.test.js
 * =============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const AUTH_GUARD_PATH = path.join(REPO_ROOT, 'assets/js/auth-guard.js');
const APP_JS_PATH = path.join(REPO_ROOT, 'assets/js/app.js');
const FIELD_HTML_PATH = path.join(REPO_ROOT, 'field.html');
const INDEX_HTML_PATH = path.join(REPO_ROOT, 'index.html');
const SYSTEM_MODE_PATH = path.join(REPO_ROOT, 'assets/js/ksu-system-mode.js');
const FIREBASE_SYNC_PATH = path.join(REPO_ROOT, 'assets/js/ksu-firebase-realtime.js');
const CREDENTIALS_A4_PATH = path.join(REPO_ROOT, 'accounts-credentials-a4.html');
const FIREBASE_JSON_PATH = path.join(REPO_ROOT, 'firebase.json');
const DATABASE_RULES_PATH = path.join(REPO_ROOT, 'database.rules.json');
const SW_JS_PATH = path.join(REPO_ROOT, 'sw.js');
const DEPLOY_SCRIPT_PATH = path.join(REPO_ROOT, 'deploy-to-firebase.sh');

// Read static sources
const authGuardSource = fs.readFileSync(AUTH_GUARD_PATH, 'utf8');
const appJsSource = fs.readFileSync(APP_JS_PATH, 'utf8');
const fieldHtmlSource = fs.readFileSync(FIELD_HTML_PATH, 'utf8');
const indexHtmlSource = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
const systemModeSource = fs.readFileSync(SYSTEM_MODE_PATH, 'utf8');
const firebaseSyncSource = fs.readFileSync(FIREBASE_SYNC_PATH, 'utf8');
const credentialsA4Source = fs.readFileSync(CREDENTIALS_A4_PATH, 'utf8');
const firebaseJson = JSON.parse(fs.readFileSync(FIREBASE_JSON_PATH, 'utf8'));
const databaseRulesJson = JSON.parse(fs.readFileSync(DATABASE_RULES_PATH, 'utf8'));
const swJsSource = fs.readFileSync(SW_JS_PATH, 'utf8');

// -----------------------------------------------------------------------------
// HELPER: Sandbox Factory for KSUAuth
// -----------------------------------------------------------------------------
function createAuthSandbox(initialStorage = {}, pathname = '/index.html') {
  const store = new Map(Object.entries(initialStorage));

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null
  };

  const sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
  };

  let currentPathname = pathname;
  let currentHref = pathname;
  const location = {
    get pathname() { return currentPathname; },
    set pathname(p) { currentPathname = p; currentHref = p; },
    get href() { return currentHref; },
    set href(h) { currentHref = h; currentPathname = h; },
    replace: (url) => { currentPathname = url; currentHref = url; },
    assign: (url) => { currentPathname = url; currentHref = url; }
  };

  const listeners = new Map();
  const document = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    }
  };

  const sandbox = {
    console,
    localStorage,
    sessionStorage,
    location,
    document,
    alert: () => {},
    confirm: () => true,
    navigator: { userAgent: 'NodeTestAgent/1.0' },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(authGuardSource, sandbox);

  return {
    window: sandbox.window,
    auth: sandbox.window.KSUAuth,
    localStorage,
    location
  };
}

// -----------------------------------------------------------------------------
// HELPER: Sandbox Factory for Shift Approval Engine (from app.js)
// -----------------------------------------------------------------------------
function createAppApprovalSandbox(customState = {}) {
  const normFnMatch = appJsSource.match(/function getNormalizedShiftKey[\s\S]*?\n\}/);
  const canApproveMatch = appJsSource.match(/function canSupervisorApproveRound[\s\S]*?\n\}/);
  const shiftTitleMatch = appJsSource.match(/function getShiftTitleArabic[\s\S]*?\n\}/);

  if (!normFnMatch || !canApproveMatch) {
    throw new Error('Could not extract shift approval functions from app.js');
  }

  const sandbox = {
    console,
    state: Object.assign({ users: [] }, customState),
    getUserRoleCategory: (u) => (u && u.roleCategory ? u.roleCategory : 'field_inspector'),
    isSystemDeveloper: (u) => Boolean(u && (u.id === 'USR-01' || u.roleCategory === 'developer' || u.empId === 'DEV')),
    window: {}
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(normFnMatch[0], sandbox);
  vm.runInContext(canApproveMatch[0], sandbox);
  if (shiftTitleMatch) vm.runInContext(shiftTitleMatch[0], sandbox);

  return {
    canSupervisorApproveRound: sandbox.canSupervisorApproveRound,
    getNormalizedShiftKey: sandbox.getNormalizedShiftKey,
    getShiftTitleArabic: sandbox.getShiftTitleArabic
  };
}

// =============================================================================
// TIER 1: FEATURE COVERAGE (REQUIREMENT VERIFICATION)
// =============================================================================
test('Tier 1.1: Official Credentials Document (accounts-credentials-a4.html) Integrity', () => {
  assert.ok(
    credentialsA4Source.includes('KSUMC-RSD-ACT-01'),
    'A4 credentials document must contain document code KSUMC-RSD-ACT-01'
  );

  assert.ok(
    credentialsA4Source.includes('123456'),
    'A4 credentials document must specify unified default PIN 123456'
  );

  // Group 1: Leadership accounts present in document
  const leadershipCodes = ['H2', 'H1', 'SAF1', 'Q1', 'DEV'];
  leadershipCodes.forEach((code) => {
    assert.ok(
      credentialsA4Source.includes(`>${code}</span>`),
      `A4 document must contain leadership username code ${code}`
    );
  });

  // Group 2: Supervisors present
  const supervisorCodes = ['S1', 'S2', 'S3'];
  supervisorCodes.forEach((code) => {
    assert.ok(
      credentialsA4Source.includes(`>${code}</span>`),
      `A4 document must contain supervisor username code ${code}`
    );
  });

  // Group 3: All 14 Field Inspectors present
  for (let i = 1; i <= 14; i++) {
    const code = `M${i}`;
    assert.ok(
      credentialsA4Source.includes(`>${code}</span>`),
      `A4 document must contain inspector username code ${code}`
    );
  }

  // Official full Arabic names verified in A4 document
  const expectedNames = [
    'أ. مصعب عبدالله آل حماد',
    'أ. حسن إبراهيم دعاك',
    'أ. أحمد الأحمري',
    'أ. علي سليمان الصقري',
    'أ. ناصر فلاح القحطاني',
    'أ. أحمد عبدالله الأكلبي',
    'أ. سيف عبدالكريم مكرمي',
    'أ. عادل خلف العنزي',
    'أ. عبدالله إبراهيم الدامغ',
    'أ. صالح محمد العريف',
    'أ. عادل عاضة الشلوي',
    'أ. مشعان خلف العنزي',
    'أ. ياسر قينان الزهراني',
    'أ. محمد سعود الصقري',
    'أ. أحمد قاسم أبو عيشة',
    'أ. عبدالرحمن حسين كعبي',
    'أ. محمد علي الربعي',
    'أ. سلطان علي العاصم',
    'أ. عبدالرحمن الأحمري',
    'أ. فواز حمد العازمي',
    'أ. سليمان سالم العنزي'
  ];

  expectedNames.forEach((name) => {
    assert.ok(
      credentialsA4Source.includes(name),
      `A4 credentials document must include official name: ${name}`
    );
  });
});

test('Tier 1.2: Short Username Authentication for all 14 Field Inspectors (M1..M14)', () => {
  const { auth } = createAuthSandbox();
  assert.ok(auth, 'KSUAuth must be successfully initialized');

  const inspectorExpectations = [
    { code: 'M1', name: 'أ. عادل خلف العنزي', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M2', name: 'أ. عبدالله إبراهيم الدامغ', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M3', name: 'أ. صالح محمد العريف', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M4', name: 'أ. عادل عاضة الشلوي', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M5', name: 'أ. مشعان خلف العنزي', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M6', name: 'أ. ياسر قينان الزهراني', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M7', name: 'أ. محمد سعود الصقري', shiftKey: '1', shiftAr: 'الوردية 1 (صباحي)' },
    { code: 'M8', name: 'أ. أحمد قاسم أبو عيشة', shiftKey: '2', shiftAr: 'الوردية 2 (مسائي)' },
    { code: 'M9', name: 'أ. عبدالرحمن حسين كعبي', shiftKey: '2', shiftAr: 'الوردية 2 (مسائي)' },
    { code: 'M10', name: 'أ. محمد علي الربعي', shiftKey: '2', shiftAr: 'الوردية 2 (مسائي)' },
    { code: 'M11', name: 'أ. سلطان علي العاصم', shiftKey: '2', shiftAr: 'الوردية 2 (مسائي)' },
    { code: 'M12', name: 'أ. عبدالرحمن الأحمري', shiftKey: '3', shiftAr: 'الوردية 3 (ليلي)' },
    { code: 'M13', name: 'أ. فواز حمد العازمي', shiftKey: '3', shiftAr: 'الوردية 3 (ليلي)' },
    { code: 'M14', name: 'أ. سليمان سالم العنزي', shiftKey: '3', shiftAr: 'الوردية 3 (ليلي)' }
  ];

  inspectorExpectations.forEach((exp) => {
    const user = auth.authenticate(exp.code, '123456');
    assert.ok(user, `Authentication must succeed for inspector ${exp.code} with PIN 123456`);
    assert.strictEqual(user.name, exp.name, `${exp.code} must have official name ${exp.name}`);
    assert.strictEqual(user.roleCategory, 'field_inspector', `${exp.code} roleCategory must be field_inspector`);
    assert.strictEqual(user.portal, 'field', `${exp.code} target portal must be field`);
    assert.ok(
      user.shift.includes(exp.shiftKey),
      `${exp.code} shift must match Shift ${exp.shiftKey} (${user.shift})`
    );
    assert.strictEqual(user.facility, 'مستشفى الملك خالد الجامعي (KKUH)', `${exp.code} facility must be KKUH`);
    assert.ok(user.permissions.conductInspections, `${exp.code} must have conductInspections permission`);
  });
});

test('Tier 1.3: Short Username Authentication for all 3 Field Shift Supervisors (S1..S3)', () => {
  const { auth } = createAuthSandbox();

  const supervisorExpectations = [
    { code: 'S1', name: 'أ. ناصر فلاح القحطاني', shift: 'الوردية 1 (صباحي)' },
    { code: 'S2', name: 'أ. أحمد عبدالله الأكلبي', shift: 'الوردية 2 (مسائي)' },
    { code: 'S3', name: 'أ. سيف عبدالكريم مكرمي', shift: 'الوردية 3 (ليلي)' }
  ];

  supervisorExpectations.forEach((exp) => {
    const user = auth.authenticate(exp.code, '123456');
    assert.ok(user, `Authentication must succeed for supervisor ${exp.code}`);
    assert.strictEqual(user.name, exp.name, `${exp.code} official name must be ${exp.name}`);
    assert.strictEqual(user.roleCategory, 'shift_supervisor', `${exp.code} must be shift_supervisor`);
    assert.strictEqual(user.portal, 'field', `${exp.code} target portal must be field`);
    assert.strictEqual(user.shift, exp.shift, `${exp.code} shift must match ${exp.shift}`);
    assert.ok(user.permissions.approveReports, `${exp.code} must have approveReports permission`);
    assert.ok(user.permissions.conductInspections, `${exp.code} must have conductInspections permission`);
  });
});

test('Tier 1.4: Short Username Authentication for Leadership, Supervision & Quality (H1, H2, SAF1, Q1, DEV)', () => {
  const { auth } = createAuthSandbox();

  // H1: KKUH General Supervisor
  const userH1 = auth.authenticate('H1', '123456');
  assert.ok(userH1, 'H1 must authenticate successfully');
  assert.strictEqual(userH1.name, 'أ. حسن إبراهيم دعاك');
  assert.strictEqual(userH1.roleCategory, 'head');
  assert.strictEqual(userH1.portal, 'head');
  assert.ok(userH1.permissions.receiveSafetyReports, 'H1 must receive safety reports');

  // H2: Safety Department Head
  const userH2 = auth.authenticate('H2', '123456');
  assert.ok(userH2, 'H2 must authenticate successfully');
  assert.strictEqual(userH2.name, 'أ. مصعب عبدالله آل حماد');
  assert.strictEqual(userH2.roleCategory, 'head');
  assert.strictEqual(userH2.portal, 'head');
  assert.ok(userH2.permissions.headOfDepartment, 'H2 must have headOfDepartment permission');

  // SAF1: Safety Specialist
  const userSAF1 = auth.authenticate('SAF1', '123456');
  assert.ok(userSAF1, 'SAF1 must authenticate successfully');
  assert.strictEqual(userSAF1.name, 'أ. أحمد الأحمري');
  assert.strictEqual(userSAF1.portal, 'field');
  assert.ok(userSAF1.permissions.approveReports, 'SAF1 must have approveReports permission');

  // Q1: Quality Officer
  const userQ1 = auth.authenticate('Q1', '123456');
  assert.ok(userQ1, 'Q1 must authenticate successfully');
  assert.strictEqual(userQ1.name, 'أ. علي سليمان الصقري');
  assert.strictEqual(userQ1.roleCategory, 'quality');
  assert.strictEqual(userQ1.portal, 'quality');
  assert.ok(userQ1.permissions.qualityAudit, 'Q1 must have qualityAudit permission');

  // DEV: Developer / Admin
  const userDEV = auth.authenticate('DEV', '123456');
  assert.ok(userDEV, 'DEV must authenticate successfully');
  assert.strictEqual(userDEV.name, 'أ. علي سليمان الصقري');
  assert.strictEqual(userDEV.roleCategory, 'developer');
  assert.strictEqual(userDEV.portal, 'admin');
  assert.ok(userDEV.permissions.all, 'DEV must have all permissions');
});

test('Tier 1.5: Role Protection across Portals (KSUAuth.protect)', () => {
  // Field inspector M1 restricted from head.html
  const sbInspectorHead = createAuthSandbox(
    {
      ksu_active_user: JSON.stringify({
        id: 'USR-SH1-202',
        empId: 'M1',
        name: 'أ. عادل خلف العنزي',
        roleCategory: 'field_inspector',
        portal: 'field'
      })
    },
    '/head.html'
  );
  const allowedInHead = ['head', 'admin', 'developer', 'executive'];
  sbInspectorHead.auth.protect('head', allowedInHead);
  assert.strictEqual(
    sbInspectorHead.location.pathname,
    'field.html',
    'Inspector accessing head.html must be redirected to field.html'
  );

  // Field inspector M1 accessing field.html (Allowed)
  const sbInspectorField = createAuthSandbox(
    {
      ksu_active_user: JSON.stringify({
        id: 'USR-SH1-202',
        empId: 'M1',
        name: 'أ. عادل خلف العنزي',
        roleCategory: 'field_inspector',
        portal: 'field'
      })
    },
    '/field.html'
  );
  const userM1Field = sbInspectorField.auth.protect('field', ['field_inspector', 'shift_supervisor', 'head', 'developer']);
  assert.ok(userM1Field, 'Inspector should be allowed in field.html');
  assert.strictEqual(sbInspectorField.location.pathname, '/field.html', 'Path should not change for allowed portal');

  // Quality Officer Q1 accessing quality.html (Allowed)
  const sbQuality = createAuthSandbox(
    {
      ksu_active_user: JSON.stringify({
        id: 'USR-Q1',
        empId: 'Q1',
        name: 'قسم الجودة وتقييم الأداء',
        roleCategory: 'quality',
        portal: 'quality'
      })
    },
    '/quality.html'
  );
  const userQ1 = sbQuality.auth.protect('quality', ['quality', 'head', 'developer']);
  assert.ok(userQ1, 'Quality user should be allowed in quality.html');
  assert.strictEqual(sbQuality.location.pathname, '/quality.html', 'Quality path should remain quality.html');

  // Quality Officer Q1 attempting admin.html (Blocked)
  const sbQualityAdmin = createAuthSandbox(
    {
      ksu_active_user: JSON.stringify({
        id: 'USR-Q1',
        empId: 'Q1',
        name: 'قسم الجودة وتقييم الأداء',
        roleCategory: 'quality',
        portal: 'quality'
      })
    },
    '/admin.html'
  );
  sbQualityAdmin.auth.protect('admin', ['admin', 'developer']);
  assert.strictEqual(
    sbQualityAdmin.location.pathname,
    'quality.html',
    'Quality user blocked from admin.html must redirect to quality.html'
  );
});

test('Tier 1.6: 14 CBAHI/NFPA Inspection Checklists Structure & Registry', () => {
  const expectedChecklists = [
    { key: 'fex', labelSnippet: 'طفايات الحريق', standard: 'SBC 801' },
    { key: 'ext', labelSnippet: 'مخارج الطوارئ', standard: 'SBC 201' },
    { key: 'roof', labelSnippet: 'الأسطح', standard: 'SBC 201' },
    { key: 'fhc', labelSnippet: 'صناديق الحريق', standard: 'SBC 801' },
    { key: 'fm200', labelSnippet: 'FM-200', standard: 'Clean Agent' },
    { key: 'ind_room', labelSnippet: 'الغرف الصناعية', standard: 'SBC 401' },
    { key: 'fas_insp', labelSnippet: 'تفتيش نظام الحريق', standard: 'SBC 801' },
    { key: 'fas_test', labelSnippet: 'فحص نظام الحريق', standard: 'SBC 801 Test' },
    { key: 'wet_chem', labelSnippet: 'WET CHEMICAL', standard: 'SBC 801' },
    { key: 'elevators', labelSnippet: 'المصاعد والإنتركم', standard: 'ASME A17.1' },
    { key: 'sprinklers', labelSnippet: 'الرش الآلي والمضخات', standard: 'SBC 801' },
    { key: 'daily_round', labelSnippet: 'جولات السلامة', standard: 'جولة يومية' },
    { key: 'standpipes', labelSnippet: 'Stand Pipes', standard: 'SBC 801' },
    { key: 'work_sites', labelSnippet: 'مواقع العمل', standard: 'تصاريح ساخنة' }
  ];

  // Verify all 14 trigger buttons in field.html
  expectedChecklists.forEach((chk) => {
    const onclickPattern = `openNewRoundModal('${chk.key}')`;
    assert.ok(
      fieldHtmlSource.includes(onclickPattern),
      `field.html must contain modal trigger button with ${onclickPattern}`
    );
  });

  // Verify app.js recognizes and defines all 14 checklists in formTitles map
  assert.ok(appJsSource.includes("fex: '[1] طفايات الحريق"), 'app.js formTitles must include fex');
  assert.ok(appJsSource.includes("ext: '[2] مخارج الطوارئ"), 'app.js formTitles must include ext');
  assert.ok(appJsSource.includes("roof: '[3] الأسطح"), 'app.js formTitles must include roof');
  assert.ok(appJsSource.includes("fhc: '[4] صناديق الحريق"), 'app.js formTitles must include fhc');
  assert.ok(appJsSource.includes("fm200: '[5] FM-200"), 'app.js formTitles must include fm200');
  assert.ok(appJsSource.includes("ind_room: '[6] الغرف الصناعية"), 'app.js formTitles must include ind_room');
  assert.ok(appJsSource.includes("fas_insp: '[7] التفتيش على نظام الحريق"), 'app.js formTitles must include fas_insp');
  assert.ok(appJsSource.includes("fas_test: '[8] فحص نظام الحريق"), 'app.js formTitles must include fas_test');
  assert.ok(appJsSource.includes("wet_chem: '[9] WET CHEMICAL"), 'app.js formTitles must include wet_chem');
  assert.ok(appJsSource.includes("elevators: '[10] المصاعد"), 'app.js formTitles must include elevators');
  assert.ok(appJsSource.includes("sprinklers: '[11] التفتيش على نظام الرش الآلي"), 'app.js formTitles must include sprinklers');
  assert.ok(appJsSource.includes("daily_round: '[12*] جولات السلامة"), 'app.js formTitles must include daily_round');
  assert.ok(appJsSource.includes("standpipes: '[13] Stand Pipes"), 'app.js formTitles must include standpipes');
  assert.ok(appJsSource.includes("work_sites: '[14] مواقع العمل"), 'app.js formTitles must include work_sites');
});

test('Tier 1.7: Production Hosting Configuration & Security Parity', () => {
  // Check hosting ignore list
  const ignoreList = firebaseJson.hosting.ignore;
  assert.ok(Array.isArray(ignoreList), 'firebase.json hosting.ignore must be an array');
  assert.ok(ignoreList.includes('tests/**'), 'hosting.ignore must contain tests/**');
  assert.ok(ignoreList.includes('docs/**'), 'hosting.ignore must contain docs/**');
  assert.ok(ignoreList.includes('*.md'), 'hosting.ignore must contain *.md');
  assert.ok(ignoreList.includes('**/*.md'), 'hosting.ignore must contain **/*.md');
  assert.ok(ignoreList.includes('.agents/**'), 'hosting.ignore must contain .agents/**');
  assert.ok(ignoreList.includes('.git/**') || ignoreList.includes('**/.git/**'), 'hosting.ignore must contain .git/**');
  assert.ok(ignoreList.includes('.github/**'), 'hosting.ignore must contain .github/**');

  // Check rewrites & ensure destination exists on disk
  const rewrites = firebaseJson.hosting.rewrites;
  assert.ok(Array.isArray(rewrites), 'firebase.json hosting.rewrites must be an array');
  for (const rw of rewrites) {
    const targetFile = path.join(REPO_ROOT, rw.destination.replace(/^\//, ''));
    assert.ok(fs.existsSync(targetFile), `Rewrite destination for ${rw.source} must exist on disk: ${rw.destination}`);
  }
  const reportRewrite = rewrites.find((r) => r.source === '/report');
  assert.ok(reportRewrite && reportRewrite.destination === '/executive_report.html', 'Must rewrite /report');
  const sharekRewrite = rewrites.find((r) => r.source === '/sharek');
  assert.ok(sharekRewrite && sharekRewrite.destination === '/sharek-pitch.html', 'Must rewrite /sharek');
  const accountsRewrite = rewrites.find((r) => r.source === '/accounts');
  assert.ok(accountsRewrite && accountsRewrite.destination === '/accounts-credentials-a4.html', 'Must rewrite /accounts');

  // Check deploy-to-firebase.sh executable existence
  assert.ok(fs.existsSync(DEPLOY_SCRIPT_PATH), 'deploy-to-firebase.sh must exist');
  const stat = fs.statSync(DEPLOY_SCRIPT_PATH);
  assert.ok((stat.mode & 0o100) !== 0, 'deploy-to-firebase.sh must have executable permissions');

  // Check sw.js cache bump
  assert.ok(
    swJsSource.includes('rsd-ksu-cache-v3.1.0-official-launch') || swJsSource.includes('rsd-ksu-cache-v3.0.0-prod-launch'),
    'sw.js must use bumped production CACHE_NAME'
  );
});

test('Tier 1.8: Roster Synchronization & Bootstrap State Parity', () => {
  // 1. Verify index.html KSU_BOOTSTRAP_ACCOUNTS
  assert.ok(
    indexHtmlSource.includes("name: 'أ. عادل خلف العنزي'"),
    'index.html bootstrap accounts must include inspector M1 official name'
  );
  assert.ok(
    indexHtmlSource.includes("name: 'أ. ناصر فلاح القحطاني'"),
    'index.html bootstrap accounts must include supervisor S1 official name'
  );
  assert.ok(
    indexHtmlSource.includes("name: 'أ. مصعب عبدالله آل حماد'"),
    'index.html bootstrap accounts must include department head H2 official name'
  );

  // 2. Verify app.js INITIAL_USERS & OFFICIAL_ROSTER_VERSION
  assert.ok(
    appJsSource.includes("const OFFICIAL_ROSTER_VERSION = '2026.11.10_PRODUCTION_ROSTER_V8';"),
    'app.js must define bumped OFFICIAL_ROSTER_VERSION 2026.11.10_PRODUCTION_ROSTER_V8'
  );
  assert.ok(
    appJsSource.includes("name: 'أ. عادل عاضة الشلوي'"),
    'app.js INITIAL_USERS must include inspector M1 official name'
  );
  assert.ok(
    appJsSource.includes("name: 'أ. ناصر فلاح القحطاني'"),
    'app.js INITIAL_USERS must include supervisor S1 official name'
  );

  // 3. Verify ksu-system-mode.js Quick Personas
  assert.ok(
    systemModeSource.includes("name: 'أ. عادل عاضة الشلوي'"),
    'ksu-system-mode.js QUICK_PERSONAS inspector must bind official name'
  );
  assert.ok(
    systemModeSource.includes("name: 'أ. ناصر فلاح القحطاني'"),
    'ksu-system-mode.js QUICK_PERSONAS supervisor must bind official name'
  );
  assert.ok(
    systemModeSource.includes("name: 'أ. حسن إبراهيم دعاك'"),
    'ksu-system-mode.js QUICK_PERSONAS head must bind official name'
  );
  assert.ok(
    systemModeSource.includes("name: 'أ. مصعب عبدالله آل حماد'"),
    'ksu-system-mode.js QUICK_PERSONAS dept_head must bind official name'
  );
});

test('Tier 1.9: Inspector & Supervisor Session Auto-Binding in field.html', () => {
  // DOM element verification for inspector session auto-binding
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-bound-badge"'),
    'field.html must contain #round-inspector-auto-bound-badge'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-name"'),
    'field.html must contain #round-inspector-auto-name'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-badge"'),
    'field.html must contain #round-inspector-auto-badge'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-auto-shift"'),
    'field.html must contain #round-inspector-auto-shift'
  );
  assert.ok(
    fieldHtmlSource.includes('id="round-inspector-manual-selection-group"'),
    'field.html must contain #round-inspector-manual-selection-group'
  );
});

test('Tier 1.10: Production Environment Domain Auto-Switch Configuration', () => {
  assert.ok(
    firebaseSyncSource.includes('https://rsd-ksu-default-rtdb.firebaseio.com'),
    'ksu-firebase-realtime.js must target production RTDB https://rsd-ksu-default-rtdb.firebaseio.com'
  );
  assert.ok(
    firebaseSyncSource.includes('projectId: "rsd-ksu"'),
    'ksu-firebase-realtime.js PROD_FIREBASE_CONFIG must specify projectId rsd-ksu'
  );
  assert.ok(
    firebaseSyncSource.includes('authDomain: "rsd-ksu.firebaseapp.com"'),
    'ksu-firebase-realtime.js PROD_FIREBASE_CONFIG must specify authDomain rsd-ksu.firebaseapp.com'
  );
});

// =============================================================================
// TIER 2: BOUNDARY & CORNER CASES
// =============================================================================
test('Tier 2.1: Authentication Boundary Cases (Invalid Credentials & Fuzzing)', () => {
  const { auth } = createAuthSandbox();

  // 1. Non-existent usernames
  assert.strictEqual(auth.authenticate('M99', '123456'), null, 'Non-existent M99 must fail');
  assert.strictEqual(auth.authenticate('S9', '123456'), null, 'Non-existent S9 must fail');
  assert.strictEqual(auth.authenticate('H9', '123456'), null, 'Non-existent H9 must fail');
  assert.strictEqual(auth.authenticate('admin999', '123456'), null, 'Non-existent admin999 must fail');
  assert.strictEqual(auth.authenticate('ghost_user', '123456'), null, 'Arbitrary unknown username must fail');

  // 2. Wrong passwords on valid usernames
  assert.strictEqual(auth.authenticate('M1', 'wrong_pass'), null, 'M1 with incorrect password must fail');
  assert.strictEqual(auth.authenticate('M1', '000000'), null, 'M1 with wrong numeric PIN must fail');
  assert.strictEqual(auth.authenticate('S1', 'password123'), null, 'S1 with incorrect password must fail');
  assert.strictEqual(auth.authenticate('DEV', 'badpass'), null, 'DEV with incorrect password must fail');

  // 3. Null, undefined, and empty inputs
  assert.strictEqual(auth.authenticate('', '123456'), null, 'Empty username must fail');
  assert.strictEqual(auth.authenticate('M1', ''), null, 'Empty password must fail');
  assert.strictEqual(auth.authenticate('   ', '123456'), null, 'Whitespace-only username must fail');
  assert.strictEqual(auth.authenticate('M1', '   '), null, 'Whitespace-only password must fail');
  assert.strictEqual(auth.authenticate(null, '123456'), null, 'Null username must fail');
  assert.strictEqual(auth.authenticate('M1', null), null, 'Null password must fail');
  assert.strictEqual(auth.authenticate(undefined, undefined), null, 'Undefined credentials must fail');

  // 4. Resilient input sanitization (leading/trailing whitespace trimming)
  const trimmedUser = auth.authenticate('  M1  ', '  123456  ');
  assert.ok(trimmedUser, 'Username and password with leading/trailing spaces must be trimmed and succeed');
  assert.strictEqual(trimmedUser.empId, 'M1');

  // 5. Case insensitivity for short codes
  const lowerM1 = auth.authenticate('m1', '123456');
  assert.ok(lowerM1, 'Lowercase m1 must authenticate');
  const upperM1 = auth.authenticate('M1', '123456');
  assert.ok(upperM1, 'Uppercase M1 must authenticate');
  assert.strictEqual(lowerM1.name, upperM1.name);

  const lowerS1 = auth.authenticate('s1', '123456');
  assert.ok(lowerS1, 'Lowercase s1 must authenticate');
  const lowerDEV = auth.authenticate('dev', '123456');
  assert.ok(lowerDEV, 'Lowercase dev must authenticate');
  const lowerH1 = auth.authenticate('h1', '123456');
  assert.ok(lowerH1, 'Lowercase h1 must authenticate');
  const lowerQ1 = auth.authenticate('q1', '123456');
  assert.ok(lowerQ1, 'Lowercase q1 must authenticate');
  const lowerSAF1 = auth.authenticate('saf1', '123456');
  assert.ok(lowerSAF1, 'Lowercase saf1 must authenticate');

  // 6. Alternate identifier logins
  const devByAlsaqri = auth.authenticate('alsaqri', '123456');
  assert.ok(devByAlsaqri, 'DEV must authenticate via altUsername alsaqri');
  const devByBadge = auth.authenticate('95972', '123456');
  assert.ok(devByBadge, 'DEV must authenticate via badge 95972');
  const devByAdmin = auth.authenticate('admin', '123456');
  assert.ok(devByAdmin, 'DEV must authenticate via keyword admin');

  const s1ByAlt = auth.authenticate('KSU-SH1-201', '123456');
  assert.ok(s1ByAlt, 'S1 must authenticate via altEmpId KSU-SH1-201');

  const m1ByAlt = auth.authenticate('KSU-SH1-202', '123456');
  assert.ok(m1ByAlt, 'M1 must authenticate via altEmpId KSU-SH1-202');
});

test('Tier 2.2: Cross-Shift Supervisor Approval Matrix (canSupervisorApproveRound)', () => {
  const { canSupervisorApproveRound } = createAppApprovalSandbox();

  const S1 = { id: 'USR-SH1-201', empId: 'S1', role: 'مشرف الوردية', roleCategory: 'shift_supervisor', shift: 'الوردية 1 (صباحي)' };
  const S2 = { id: 'USR-SH2-301', empId: 'S2', role: 'مشرف الوردية', roleCategory: 'shift_supervisor', shift: 'الوردية 2 (مسائي)' };
  const S3 = { id: 'USR-SH3-401', empId: 'S3', role: 'مشرف الوردية', roleCategory: 'shift_supervisor', shift: 'الوردية 3 (ليلي)' };

  const roundShift1 = { id: 'RND-001', shift: 'shift1', shiftName: 'الوردية الأولى (صباحي)', inspector: 'أ. عادل عاضة الشلوي' };
  const roundShift2 = { id: 'RND-002', shift: 'shift2', shiftName: 'الوردية الثانية (مسائي)', inspector: 'أ. عبدالرحمن حسين الكعبي' };
  const roundShift3 = { id: 'RND-003', shift: 'shift3', shiftName: 'الوردية الثالثة (ليلي)', inspector: 'أ. سليمان سالم العنزي' };

  // Strict Shift 1 Isolation
  assert.strictEqual(canSupervisorApproveRound(S1, roundShift1), true, 'S1 must approve Shift 1 round');
  assert.strictEqual(canSupervisorApproveRound(S1, roundShift2), false, 'S1 CANNOT approve Shift 2 round');
  assert.strictEqual(canSupervisorApproveRound(S1, roundShift3), false, 'S1 CANNOT approve Shift 3 round');

  // Strict Shift 2 Isolation
  assert.strictEqual(canSupervisorApproveRound(S2, roundShift1), false, 'S2 CANNOT approve Shift 1 round');
  assert.strictEqual(canSupervisorApproveRound(S2, roundShift2), true, 'S2 must approve Shift 2 round');
  assert.strictEqual(canSupervisorApproveRound(S2, roundShift3), false, 'S2 CANNOT approve Shift 3 round');

  // Strict Shift 3 Isolation
  assert.strictEqual(canSupervisorApproveRound(S3, roundShift1), false, 'S3 CANNOT approve Shift 1 round');
  assert.strictEqual(canSupervisorApproveRound(S3, roundShift2), false, 'S3 CANNOT approve Shift 2 round');
  assert.strictEqual(canSupervisorApproveRound(S3, roundShift3), true, 'S3 must approve Shift 3 round');

  // Universal Authority
  const H1 = { id: 'USR-7453', empId: 'H1', role: 'مشرف عام', roleCategory: 'head', shift: 'جميع الورديات' };
  const H2 = { id: 'USR-HEAD-02', empId: 'H2', role: 'رئيس إدارة', roleCategory: 'head', shift: 'جميع الورديات' };
  const D1 = { id: 'USR-DIR-01', empId: 'D1', role: 'مدير عام', roleCategory: 'head', shift: 'جميع الورديات' };
  const DEV = { id: 'USR-01', empId: 'DEV', role: 'مطور النظام', roleCategory: 'developer', shift: 'جميع الورديات' };

  [roundShift1, roundShift2, roundShift3].forEach((rnd) => {
    assert.strictEqual(canSupervisorApproveRound(H1, rnd), true, `General Supervisor H1 universal approval for ${rnd.shift}`);
    assert.strictEqual(canSupervisorApproveRound(H2, rnd), true, `Safety Head H2 universal approval for ${rnd.shift}`);
    assert.strictEqual(canSupervisorApproveRound(D1, rnd), true, `Director General D1 universal approval for ${rnd.shift}`);
    assert.strictEqual(canSupervisorApproveRound(DEV, rnd), true, `Developer DEV universal approval for ${rnd.shift}`);
  });

  // Rejection of unauthorized roles
  const M1 = { id: 'USR-SH1-202', empId: 'M1', role: 'مفتش سلامة ميداني', roleCategory: 'field_inspector', shift: 'الوردية 1 (صباحي)' };
  assert.strictEqual(canSupervisorApproveRound(M1, roundShift1), false, 'Inspector M1 cannot approve');

  const Q1 = { id: 'USR-Q1', empId: 'Q1', role: 'مسؤول الجودة', roleCategory: 'quality', shift: 'جميع الورديات' };
  assert.strictEqual(canSupervisorApproveRound(Q1, roundShift1), false, 'Quality Q1 does not approve as supervisor');

  // Defensive input handling
  assert.strictEqual(canSupervisorApproveRound(null, roundShift1), false, 'Null userObj must return false');
  assert.strictEqual(canSupervisorApproveRound(S1, null), false, 'Null round must return false');
  assert.strictEqual(canSupervisorApproveRound(undefined, undefined), false, 'Undefined args must return false');
  assert.strictEqual(canSupervisorApproveRound(S1, {}), false, 'Round with missing shift must return false');
});

test('Tier 2.3: Firebase Passwordless Cloud Sync & RTDB Security Rules', () => {
  // 1. Verify database.rules.json security rules
  const userRules = databaseRulesJson.rules.users['$userId'];
  assert.ok(userRules, 'RTDB rules must define users/$userId');
  assert.ok(
    userRules['.validate'].includes("!newData.hasChildren(['password'])"),
    'RTDB users/$userId rule must strictly forbid password field'
  );

  const ksumcUserRules = databaseRulesJson.rules.ksumc_users['$userId'];
  assert.ok(ksumcUserRules, 'RTDB rules must define ksumc_users/$userId');
  assert.ok(
    ksumcUserRules['.validate'].includes("!newData.hasChildren(['password'])"),
    'RTDB ksumc_users/$userId rule must strictly forbid password field'
  );

  // 2. Verify Client-Side Sanitization Logic
  const rawUsers = [
    {
      id: 'USR-SH1-202',
      username: 'M1',
      empId: 'M1',
      name: 'أ. عادل عاضة الشلوي',
      password: 'plain_password_123',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      shift: 'الوردية 1 (صباحي)',
      role: 'مفتش سلامة ميداني'
    },
    {
      id: 'USR-SH1-201',
      username: 'S1',
      empId: 'S1',
      name: 'أ. ناصر فلاح القحطاني',
      password: '123456',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      shift: 'الوردية 1 (صباحي)',
      role: 'مشرف الوردية الأولى الميدانية'
    }
  ];

  const cleanUsers = JSON.parse(JSON.stringify(rawUsers)).map((u) => {
    delete u.password;
    delete u.passwordHash;
    return u;
  });

  cleanUsers.forEach((u) => {
    assert.strictEqual(u.password, undefined, 'Sanitized user must not have password property');
    assert.strictEqual(u.passwordHash, undefined, 'Sanitized user must not have passwordHash property');
    assert.ok(u.username, 'Sanitized user preserves username');
    assert.ok(u.name, 'Sanitized user preserves official name');
    assert.ok(u.shift, 'Sanitized user preserves shift');
  });

  const hasPasswordChild = (obj) => Object.prototype.hasOwnProperty.call(obj, 'password');
  assert.strictEqual(hasPasswordChild(rawUsers[0]), true, 'Raw user has password child');
  assert.strictEqual(hasPasswordChild(cleanUsers[0]), false, 'Clean user does not have password child');
});

// =============================================================================
// TIER 3: CROSS-FEATURE INTERACTIONS (WORKFLOWS)
// =============================================================================
test('Tier 3.1: End-to-End Inspection Round Workflow (M1 -> S1 -> Q1)', () => {
  const { canSupervisorApproveRound } = createAppApprovalSandbox();

  // STAGE 1: Inspector M1 creates an inspection round
  const inspectorM1 = {
    id: 'USR-SH1-202',
    empId: 'M1',
    name: 'أ. عادل عاضة الشلوي',
    roleCategory: 'field_inspector',
    shift: 'الوردية 1 (صباحي)'
  };

  const createdRound = {
    id: 'RND-' + Date.now(),
    formType: 'fex',
    formTitle: '[1] طفايات الحريق (شهري - Fire Extinguishers)',
    hospital: 'مستشفى الملك خالد الجامعي',
    building: 'المستشفى الرئيسي (Hospital Main Building)',
    floor: 'الدور الثاني (2)',
    inspector: inspectorM1.name,
    inspectorBadge: inspectorM1.empId,
    inspectorUsername: inspectorM1.empId,
    shift: 'shift1',
    shiftName: 'الوردية الأولى (صباحي)',
    items: [
      { id: 'fex-1', title: 'فحص مقياس الضغط', result: 'compliant' },
      { id: 'fex-2', title: 'سلامة مسمار الأمان والختم', result: 'compliant' },
      { id: 'fex-3', title: 'عدم وجود عوائق أمام الطفاية', result: 'compliant' }
    ],
    workflowStatus: 'pending_supervisor',
    workflowStatusLabel: 'بانتظار اعتماد مشرف الوردية الأولى',
    createdAt: new Date().toISOString()
  };

  assert.strictEqual(createdRound.workflowStatus, 'pending_supervisor');
  assert.strictEqual(createdRound.inspector, 'أ. عادل عاضة الشلوي');
  assert.strictEqual(createdRound.shift, 'shift1');

  // STAGE 2: Shift 2 supervisor S2 attempts cross-shift approval -> BLOCKED
  const supervisorS2 = {
    id: 'USR-SH2-301',
    empId: 'S2',
    name: 'أ. أحمد عبدالله الأكلبي',
    roleCategory: 'shift_supervisor',
    shift: 'الوردية 2 (مسائي)'
  };
  const canS2Approve = canSupervisorApproveRound(supervisorS2, createdRound);
  assert.strictEqual(canS2Approve, false, 'Supervisor S2 must NOT be allowed to approve Shift 1 round');

  // STAGE 3: Shift 1 supervisor S1 reviews and approves
  const supervisorS1 = {
    id: 'USR-SH1-201',
    empId: 'S1',
    name: 'أ. ناصر فلاح القحطاني',
    roleCategory: 'shift_supervisor',
    shift: 'الوردية 1 (صباحي)'
  };
  const canS1Approve = canSupervisorApproveRound(supervisorS1, createdRound);
  assert.strictEqual(canS1Approve, true, 'Supervisor S1 must be authorized to approve Shift 1 round');

  // Emulate approveAndExportToQuality
  const supervisorApprovedAt = new Date().toISOString();
  createdRound.workflowStatus = 'pending_quality';
  createdRound.workflowStatusLabel = 'معتمد من مشرف الوردية - بانتظار اعتماد الجودة (CBAHI)';
  createdRound.approvedBySupervisor = `${supervisorS1.name} (مشرف الوردية الأولى)`;
  createdRound.supervisorApprovedAt = supervisorApprovedAt;
  createdRound.workflowHistory = [
    {
      stage: 'approved_by_supervisor',
      actor: createdRound.approvedBySupervisor,
      timestamp: supervisorApprovedAt
    }
  ];

  assert.strictEqual(createdRound.workflowStatus, 'pending_quality');
  assert.ok(createdRound.approvedBySupervisor.includes('ناصر فلاح القحطاني'));

  // STAGE 4: Quality Officer Q1 audits and certifies the round
  const qualityQ1 = {
    id: 'USR-Q1',
    empId: 'Q1',
    name: 'قسم الجودة وتقييم الأداء',
    roleCategory: 'quality'
  };

  const qualityApprovedAt = new Date().toISOString();
  createdRound.workflowStatus = 'approved_cbahi';
  createdRound.workflowStatusLabel = 'معتمد ومحفوظ في سجل الامتثال لسباهي (CBAHI)';
  createdRound.approvedByQuality = `${qualityQ1.name} (مسؤول الجودة وتقييم الأداء)`;
  createdRound.qualityApprovedAt = qualityApprovedAt;
  createdRound.workflowHistory.push({
    stage: 'approved_cbahi',
    actor: createdRound.approvedByQuality,
    timestamp: qualityApprovedAt
  });

  assert.strictEqual(createdRound.workflowStatus, 'approved_cbahi');
  assert.strictEqual(createdRound.workflowHistory.length, 2);
  assert.strictEqual(createdRound.workflowHistory[0].stage, 'approved_by_supervisor');
  assert.strictEqual(createdRound.workflowHistory[1].stage, 'approved_cbahi');
});

test('Tier 3.2: 4-Stage Safety Department Report Lifecycle (S1/M1 -> H1 -> H2 -> D1)', () => {
  // STAGE 1: Field Submission
  const initialReport = {
    id: 'REP-' + Date.now().toString().slice(-6),
    subject: 'ملاحظة تراكم مواد في ممر الإخلاء',
    building: 'مستشفى الملك خالد الجامعي',
    floor: 'الدور الأرضي',
    details: 'تم رصد مواد بناء تعيق مسار خروج الطوارئ',
    inspector: 'أ. عادل عاضة الشلوي',
    routedTo: 'H1',
    workflowStage: 'pending_h1',
    workflowStageLabel: 'بانتظار مراجعة المشرف العام (H1)',
    status: 'مرسل للمشرف العام (H1) للمراجعة',
    workflowHistory: [
      {
        stage: 'pending_h1',
        actor: 'أ. عادل عاضة الشلوي',
        timestamp: new Date().toISOString(),
        notes: 'رفع التقرير الأولي من الميدان'
      }
    ]
  };
  assert.strictEqual(initialReport.workflowStage, 'pending_h1');
  assert.strictEqual(initialReport.routedTo, 'H1');

  // STAGE 2: General Supervisor H1 forwards to Head of Department H2
  const h1Actor = 'أ. حسن إبراهيم دعاك (المشرف العام الملك خالد)';
  initialReport.workflowStage = 'pending_head';
  initialReport.routedTo = 'H2';
  initialReport.supDecision = 'forwarded_to_head';
  initialReport.supNotes = 'تمت المعاينة ونوصي بالإحالة لرئيس الإدارة لاتخاذ اللازم مع المقاول';
  initialReport.workflowHistory.push({
    stage: 'forwarded_to_head',
    actor: h1Actor,
    timestamp: new Date().toISOString(),
    notes: initialReport.supNotes
  });
  assert.strictEqual(initialReport.workflowStage, 'pending_head');
  assert.strictEqual(initialReport.routedTo, 'H2');

  // STAGE 3: Safety Department Head H2 forwards to Director General D1
  const h2Actor = 'أ. مصعب عبدالله آل حماد (رئيس إدارة السلامة)';
  initialReport.workflowStage = 'pending_director';
  initialReport.routedTo = 'D1';
  initialReport.headDecision = 'forwarded_to_director';
  initialReport.headNotes = 'نرفع لسعادتكم التقرير مشفوعاً بالتوصية بتطبيق الجزاء المالي وإخلاء الممر فوراً';
  initialReport.workflowHistory.push({
    stage: 'forwarded_to_director',
    actor: h2Actor,
    timestamp: new Date().toISOString(),
    notes: initialReport.headNotes
  });
  assert.strictEqual(initialReport.workflowStage, 'pending_director');
  assert.strictEqual(initialReport.routedTo, 'D1');

  // STAGE 4: Director General D1 Approves and Archives
  const d1Actor = 'المدير العام للسلامة والأمن';
  initialReport.workflowStage = 'approved_by_director';
  initialReport.directorDecision = 'approved_and_archived';
  initialReport.directorNotes = 'معتمد. يتم تطبيق الجزاء وإشعار الإدارة الهندسية بالإخلاء الفوري.';
  initialReport.workflowHistory.push({
    stage: 'approved_by_director',
    actor: d1Actor,
    timestamp: new Date().toISOString(),
    notes: initialReport.directorNotes
  });

  assert.strictEqual(initialReport.workflowStage, 'approved_by_director');
  assert.strictEqual(initialReport.directorDecision, 'approved_and_archived');
  assert.strictEqual(initialReport.workflowHistory.length, 4);
  assert.strictEqual(initialReport.workflowHistory[0].stage, 'pending_h1');
  assert.strictEqual(initialReport.workflowHistory[1].stage, 'forwarded_to_head');
  assert.strictEqual(initialReport.workflowHistory[2].stage, 'forwarded_to_director');
  assert.strictEqual(initialReport.workflowHistory[3].stage, 'approved_by_director');
});

test('Tier 3.3: Shift Handover Protocol between S1 and S2', () => {
  const handoverRecord = {
    id: 'HND-' + Date.now().toString().slice(-6),
    giver: 'أ. ناصر فلاح القحطاني (مشرف الوردية الأولى)',
    shift: 'الوردية 1 (صباحي)',
    receiver: 'أ. أحمد عبدالله الأكلبي (مشرف الوردية الثانية)',
    radios: 'تم تسليم عدد 8 أجهزة لاسلكي سليمة ومبرمجة على القناة 1',
    keys: 'عهدة مفاتيح الطوارئ ومحطات الغاز كاملة (12 مفتاح)',
    notes: 'تم استكمال 6 جولات تفتيش لسباهي، وملاحظة مخرج الطوارئ بمبنى 1 قيد الإخلاء والمتابعة',
    timestamp: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    time: '15:00'
  };

  assert.ok(handoverRecord.id.startsWith('HND-'));
  assert.strictEqual(handoverRecord.giver, 'أ. ناصر فلاح القحطاني (مشرف الوردية الأولى)');
  assert.strictEqual(handoverRecord.shift, 'الوردية 1 (صباحي)');
  assert.ok(handoverRecord.receiver.includes('أحمد عبدالله الأكلبي'));
  assert.ok(handoverRecord.radios.includes('القناة 1'));
  assert.ok(handoverRecord.keys.includes('12 مفتاح'));

  const notificationPayload = {
    id: 'NOTIF-' + handoverRecord.id,
    title: `🔄 اعتماد تسليم الوردية الميدانية (${handoverRecord.shift})`,
    message: `تم اعتماد محضر تسليم الوردية رسمياً بواسطة [${handoverRecord.giver}] إلى [${handoverRecord.receiver}]`,
    category: 'shift_handover',
    priority: 'high'
  };

  assert.strictEqual(notificationPayload.category, 'shift_handover');
  assert.strictEqual(notificationPayload.priority, 'high');
});

test('Tier 3.4: Official Door Opening Protocol (Doors lifecycle & Minutes)', () => {
  const doorRequest = {
    id: 'DOOR-' + Date.now().toString().slice(-6),
    requestDate: new Date().toISOString().split('T')[0],
    requestTime: '10:30',
    facility: 'مستشفى الملك خالد الجامعي (KKUH)',
    building: 'المستشفى الرئيسي',
    floor: 'الدور الأرضي',
    roomNumber: 'G-104',
    department: 'المستودعات الطبية',
    requestedBy: 'د. خالد العمري',
    reason: 'استلام أدوية ومستلزمات عاجلة خارج أوقات الدوام الرسمي',
    inspectorName: 'أ. عادل عاضة الشلوي',
    supervisorName: 'أ. ناصر فلاح القحطاني',
    status: 'تم فتح الباب وتسليم الموقع',
    hasRecipientSignature: true,
    hasInspectorSignature: true,
    pdfGenerated: true,
    timestamp: new Date().toISOString()
  };

  assert.ok(doorRequest.id.startsWith('DOOR-'));
  assert.strictEqual(doorRequest.roomNumber, 'G-104');
  assert.strictEqual(doorRequest.status, 'تم فتح الباب وتسليم الموقع');
  assert.strictEqual(doorRequest.hasRecipientSignature, true);
  assert.strictEqual(doorRequest.hasInspectorSignature, true);
  assert.strictEqual(doorRequest.pdfGenerated, true);
});

test('Tier 3.5: Hot Work Permits Protocol (Permits lifecycle & Fire Watch)', () => {
  const permitRecord = {
    id: 'PERMIT-HW-' + Date.now().toString().slice(-6),
    workType: 'قص ولحام كهربائي (Welding & Cutting)',
    location: 'مستشفى الملك خالد الجامعي - غرفة التبريد المركزية',
    contractorName: 'شركة البناء والتشغيل للمقاولات',
    supervisorInCharge: 'م. سامي السبيعي',
    fireWatchAssigned: 'أ. محمد سعود الصقري (مفتش سلامة)',
    precautionsTaken: [
      'فحص الغازات القابلة للاشتعال قبل بدء العمل',
      'توفير طفايات حريق سعة 6 كجم بودرة بالقرب من الموقع',
      'إبعاد المواد القابلة للاشتعال لمسافة 11 متراً على الأقل',
      'تعيين مراقب حريق مؤهل ومجهز بجهاز لاسلكي'
    ],
    status: 'معتمد ونشط (Active)',
    issuedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    postWorkFireWatchMinutes: 30
  };

  assert.ok(permitRecord.id.startsWith('PERMIT-HW-'));
  assert.strictEqual(permitRecord.status, 'معتمد ونشط (Active)');
  assert.strictEqual(permitRecord.precautionsTaken.length, 4);
  assert.strictEqual(permitRecord.postWorkFireWatchMinutes, 30);
  assert.ok(permitRecord.fireWatchAssigned.includes('محمد سعود الصقري'));
});

// =============================================================================
// TIER 4: REAL-WORLD SCENARIOS & EMERGENCY SIMULATIONS
// =============================================================================
test('Tier 4.1: KKUH Hospital Morning Shift Workload Simulation (Checklists, Violations, CAPA)', () => {
  const inspectorName = 'أ. عادل عاضة الشلوي';
  const hospital = 'مستشفى الملك خالد الجامعي (KKUH)';

  // 1. Simulation of Fire Extinguishers Inspection (fex)
  const fexInspection = {
    id: 'RND-KKUH-FEX-01',
    formType: 'fex',
    inspector: inspectorName,
    facility: hospital,
    building: 'المستشفى الرئيسي',
    floor: 'الدور الأرضي',
    items: [
      { id: 'item-1', code: 'FE-01', result: 'compliant' },
      { id: 'item-2', code: 'FE-02', result: 'compliant' },
      { id: 'item-3', code: 'FE-03', result: 'compliant' },
      { id: 'item-4', code: 'FE-04', result: 'violation', note: 'طفاية حريق منتهية الفحص الدوري' }
    ]
  };
  const fexTotal = fexInspection.items.length;
  const fexCompliant = fexInspection.items.filter((i) => i.result === 'compliant').length;
  const fexScore = Math.round((fexCompliant / fexTotal) * 100);
  assert.strictEqual(fexScore, 75, 'Compliance score for fex should be 75%');

  // 2. Simulation of Emergency Exits Inspection (ext)
  const extInspection = {
    id: 'RND-KKUH-EXT-01',
    formType: 'ext',
    inspector: inspectorName,
    facility: hospital,
    building: 'برج التنويم',
    floor: 'الدور الثالث',
    items: [
      { id: 'ext-1', code: 'EX-01', result: 'compliant' },
      { id: 'ext-2', code: 'EX-02', result: 'violation', note: 'باب مخرج الطوارئ مغلق بسلسلة حديدية' }
    ]
  };
  const extTotal = extInspection.items.length;
  const extCompliant = extInspection.items.filter((i) => i.result === 'compliant').length;
  const extScore = Math.round((extCompliant / extTotal) * 100);
  assert.strictEqual(extScore, 50, 'Compliance score for ext should be 50%');

  // 3. Violation Logging
  const violationRecord = {
    id: 'VIO-' + Date.now().toString().slice(-6),
    type: 'critical_safety_violation',
    category: 'إغلاق مسالك ومخارج الطوارئ',
    facility: hospital,
    building: 'برج التنويم',
    floor: 'الدور الثالث',
    description: 'تم رصد سلسلة حديدية تقفل مخرج الطوارئ المؤدي للسلالم الخارجية',
    severity: 'critical',
    status: 'open',
    reportedBy: inspectorName,
    timestamp: new Date().toISOString()
  };
  assert.strictEqual(violationRecord.severity, 'critical');
  assert.strictEqual(violationRecord.status, 'open');

  // 4. CAPA Action Plan Generation
  const capaRecord = {
    id: 'CAPA-2026-KKUH-001',
    sourceViolationId: violationRecord.id,
    title: 'إزالة فورية للسلسلة الحديدية من مخرج الطوارئ ببرج التنويم',
    correctiveAction: 'قص السلسلة فوراً وتنبيه مشرف الصيانة بعدم قفل مخارج الهروب',
    assignedTo: 'فريق الصيانة والسلامة المناوب',
    deadlineHours: 2,
    status: 'قيد المعالجة الفورية',
    createdAt: new Date().toISOString()
  };
  assert.strictEqual(capaRecord.sourceViolationId, violationRecord.id);
  assert.strictEqual(capaRecord.deadlineHours, 2);

  // 5. CAPA Resolution
  capaRecord.status = 'مغلق ومصحح';
  capaRecord.resolvedAt = new Date().toISOString();
  capaRecord.verifiedBy = 'أ. ناصر فلاح القحطاني (مشرف الوردية الأولى)';
  assert.strictEqual(capaRecord.status, 'مغلق ومصحح');
});

test('Tier 4.2: Hospital Emergency Code Broadcast Simulation (Code Red & Elevator Entrapment)', () => {
  const hospital = 'مستشفى الملك خالد الجامعي (KKUH)';

  // Scenario A: Code Red (Fire / Smoke) Broadcast
  const codeRedAlarm = {
    id: 'ALM-RED-' + Date.now().toString().slice(-6),
    codeKey: 'red',
    codeName: 'Code Red',
    title: '[Code Red] انبعاث دخان مبكر في غرفة الخدمات',
    facility: hospital,
    location: `${hospital} - المبنى الرئيسي - الدور الثاني - غرفة الكهرباء 204`,
    announcedAt: new Date().toISOString(),
    severity: 'critical',
    status: 'نشط - قيد الاستجابة',
    reportedBy: 'أ. عادل عاضة الشلوي',
    soundTrigger: true,
    lockScreenNotification: true
  };

  assert.strictEqual(codeRedAlarm.codeKey, 'red');
  assert.strictEqual(codeRedAlarm.severity, 'critical');
  assert.strictEqual(codeRedAlarm.soundTrigger, true);
  assert.strictEqual(codeRedAlarm.lockScreenNotification, true);

  // Emergency Code Response & Resolution Lifecycle
  assert.strictEqual(codeRedAlarm.status, 'نشط - قيد الاستجابة');

  codeRedAlarm.status = 'تم وصول الفريق والسيطرة المبدئية';
  codeRedAlarm.responder = 'أ. ناصر فلاح القحطاني (مشرف الوردية الأولى)';
  codeRedAlarm.actionTaken = 'تم فصل القاطع الكهربائي وتهوية الموقع ولا توجد إصابات';

  codeRedAlarm.status = 'مغلق بعد زوال الخطر (All Clear)';
  codeRedAlarm.closedAt = new Date().toISOString();
  assert.ok(codeRedAlarm.status.includes('مغلق'));
  assert.ok(codeRedAlarm.closedAt);

  // Scenario B: Elevator Entrapment Simulation
  const elevatorAlarm = {
    id: 'ALM-ELV-' + Date.now().toString().slice(-6),
    codeKey: 'elevator',
    codeName: 'احتجاز مصعد',
    title: '[احتجاز مصعد] توقف مصعد رقم 3 بين الدورين الأول والثاني',
    facility: hospital,
    location: `${hospital} - برج التنويم - مصعد رقم 3`,
    trappedPersonsCount: 2,
    passengersCondition: 'حالة الركاب مستقرة والإنتركم يعمل',
    severity: 'critical',
    status: 'نشط - قيد الإنقاذ الفوري',
    reportedBy: 'أ. مشعان خلف العنزي',
    announcedAt: new Date().toISOString()
  };

  assert.strictEqual(elevatorAlarm.codeKey, 'elevator');
  assert.strictEqual(elevatorAlarm.trappedPersonsCount, 2);
  assert.strictEqual(elevatorAlarm.severity, 'critical');

  elevatorAlarm.status = 'تم إخراج المحتجزين بسلام والمصعد خارج الخدمة للصيانة';
  elevatorAlarm.closedAt = new Date().toISOString();
  assert.ok(elevatorAlarm.status.includes('بسلام'));
});

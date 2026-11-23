/**
 * =============================================================================
 * DEMO / SANDBOX ACCOUNT ISOLATION & REGRESSION TEST SUITE (M1)
 * =============================================================================
 * Execution: node --test tests/test_demo_account_isolation.test.js
 * =============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const authGuardSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/auth-guard.js'), 'utf8');
const dataBridgeSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/ksumc-data-bridge.js'), 'utf8');
const firebaseSyncSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/ksu-firebase-realtime.js'), 'utf8');
const integrationsSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/ksu-integrations.js'), 'utf8');
const appJsSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/app.js'), 'utf8');
const fieldHtmlSource = fs.readFileSync(path.join(REPO_ROOT, 'field.html'), 'utf8');
const dashboardHtmlSource = fs.readFileSync(path.join(REPO_ROOT, 'dashboard.html'), 'utf8');

function createStorageMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    _store: store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null
  };
}

function createSandbox({ pathname = '/index.html', initialLocal = {}, initialSession = {} } = {}) {
  const localStorage = createStorageMock(initialLocal);
  const sessionStorage = createStorageMock(initialSession);

  let currentPathname = pathname;
  let currentHref = pathname;
  const location = {
    get pathname() { return currentPathname; },
    set pathname(p) { currentPathname = p; currentHref = p; },
    get href() { return currentHref; },
    set href(h) { currentHref = h; currentPathname = h; },
    origin: 'https://rsd-ksu.web.app',
    hostname: 'rsd-ksu.web.app',
    replace: (url) => { currentPathname = url; currentHref = url; },
    assign: (url) => { currentPathname = url; currentHref = url; }
  };

  const document = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const sandbox = {
    console,
    localStorage,
    sessionStorage,
    document,
    location,
    navigator: { onLine: true },
    alert: () => {},
    CustomEvent: function(name, detail) { this.type = name; this.detail = detail?.detail; },
    dispatchEvent: () => {},
    addEventListener: () => {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Promise,
    Error
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

test('1. demo/demo authentication succeeds with isDemoAccount: true and rejects 123456', () => {
  const sandbox = createSandbox();
  vm.runInNewContext(authGuardSource, sandbox);

  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  assert.ok(demoUser, 'demo/demo must authenticate');
  assert.equal(demoUser.isDemoAccount, true);
  assert.equal(demoUser.username, 'demo');
  assert.equal(demoUser.roleCategory, 'field_inspector');
  assert.equal(demoUser.portal, 'field');
  assert.equal(sandbox.KSUAuth.isDemoUser(demoUser), true);

  // Must NOT accept 123456 or wrong password
  assert.equal(sandbox.KSUAuth.authenticate('demo', '123456'), null);
  assert.equal(sandbox.KSUAuth.authenticate('demo', 'wrong'), null);
  assert.equal(sandbox.KSUAuth.authenticate('DEMO', 'demo')?.username, 'demo');

  // Must NOT be seeded into ksumc_admin_users
  const adminUsers = JSON.parse(sandbox.localStorage.getItem('ksumc_admin_users') || '[]');
  assert.equal(adminUsers.some(u => u.username === 'demo' || u.id === 'USR-DEMO-01'), false);
});

test('2. KSUAuth.login(demoUser) stores session in sessionStorage, NOT localStorage', () => {
  const sandbox = createSandbox();
  vm.runInNewContext(authGuardSource, sandbox);

  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  assert.equal(sandbox.KSUAuth.login(demoUser), true);

  assert.ok(sandbox.sessionStorage.getItem('ksu_active_user'), 'sessionStorage must hold ksu_active_user');
  assert.equal(sandbox.sessionStorage.getItem('ksu_active_portal'), 'field');
  assert.equal(sandbox.localStorage.getItem('ksu_active_user'), null, 'localStorage must NOT hold demo user');
  assert.equal(sandbox.KSUAuth.getUser()?.username, 'demo');
  assert.equal(sandbox.KSUAuth.isDemoUser(), true);
});

test('3. KSUAuth.protect() allows field.html only and blocks quality/head/admin/profile/dashboard for demo', () => {
  const blockedPortals = ['quality', 'head', 'admin', 'profile', 'dashboard'];
  for (const portal of blockedPortals) {
    const sandbox = createSandbox({ pathname: `/${portal}.html` });
    vm.runInNewContext(authGuardSource, sandbox);
    const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
    sandbox.KSUAuth.login(demoUser);

    const allowed = sandbox.KSUAuth.protect(portal);
    assert.equal(allowed, false, `protect('${portal}') must return false for demo`);
    assert.equal(sandbox.location.pathname, 'field.html', `protect('${portal}') must redirect demo to field.html`);
  }

  const fieldSandbox = createSandbox({ pathname: '/field.html' });
  vm.runInNewContext(authGuardSource, fieldSandbox);
  fieldSandbox.KSUAuth.login(fieldSandbox.KSUAuth.authenticate('demo', 'demo'));
  assert.equal(fieldSandbox.KSUAuth.protect('field'), true, 'protect("field") must allow demo');

  // Verify dashboard.html has early isDemoUser redirect guard before metrics
  assert.match(dashboardHtmlSource, /KSUAuth\.isDemoUser\(\)/);
  assert.match(dashboardHtmlSource, /window\.location\.replace\('field\.html'\)/);
});

test('4. KSUAuth.saveUser and updateUserProfile are blocked for demo', () => {
  const sandbox = createSandbox();
  let firebasePushCalled = false;
  sandbox.ksuFirebaseSync = {
    pushUsersToFirebase: () => { firebasePushCalled = true; }
  };
  vm.runInNewContext(authGuardSource, sandbox);

  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  sandbox.KSUAuth.login(demoUser);

  assert.equal(sandbox.KSUAuth.saveUser(demoUser), false);
  assert.equal(sandbox.KSUAuth.updateUserProfile('USR-DEMO-01', { phone: '0500000000' }), false);
  assert.equal(sandbox.KSUAuth.updateUserProfile('demo', { name: 'hacked' }), false);
  assert.equal(firebasePushCalled, false);
});

test('5. Demo operations block Firebase, SharePoint, OracleSync, and isolate operational localStorage', async () => {
  const initialOfficialRounds = JSON.stringify([{ id: 'OFFICIAL-RND-1', title: 'Official Round' }]);
  const sandbox = createSandbox({
    pathname: '/field.html',
    initialLocal: {
      ksumc_safety_rounds: initialOfficialRounds,
      ksumc_sample_data_version: 'v7.0-clean-production-official-2026'
    }
  });

  let fetchCalls = 0;
  let oracleCalls = 0;
  let firebaseWrites = 0;
  sandbox.fetch = async () => { fetchCalls++; return { ok: true, status: 200 }; };
  sandbox.firebase = {
    apps: [{}],
    database: () => ({
      ref: () => ({
        set: () => { firebaseWrites++; return Promise.resolve(); },
        update: () => { firebaseWrites++; return Promise.resolve(); },
        remove: () => { firebaseWrites++; return Promise.resolve(); },
        on: () => {}
      })
    }),
    auth: () => ({ currentUser: null, onAuthStateChanged: () => {}, signInAnonymously: () => Promise.resolve() })
  };

  vm.runInNewContext(authGuardSource, sandbox);
  vm.runInNewContext(dataBridgeSource, sandbox);
  vm.runInNewContext(firebaseSyncSource, sandbox);
  vm.runInNewContext(integrationsSource, sandbox);

  // Seed official localStorage data after scripts initialize (before demo login)
  sandbox.localStorage.setItem('ksumc_safety_rounds', initialOfficialRounds);

  // Login as demo
  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  sandbox.KSUAuth.login(demoUser);

  // Spy on OracleSync
  sandbox.KSUOracleSync = {
    saveRound: () => { oracleCalls++; },
    saveAlarm: () => { oracleCalls++; },
    savePermit: () => { oracleCalls++; },
    saveDoor: () => { oracleCalls++; },
    saveCAPA: () => { oracleCalls++; },
    saveSafetyViolation: () => { oracleCalls++; },
    saveSmokingViolation: () => { oracleCalls++; },
    saveShiftLog: () => { oracleCalls++; },
    reportIncident: () => { oracleCalls++; },
    saveReport: () => { oracleCalls++; }
  };

  // Spy on ksuFirebaseSync
  const fb = sandbox.ksuFirebaseSync;
  fb.db = sandbox.firebase.database();
  fb.isConnected = true;
  let fbMethodReachedDb = false;
  const origSyncRound = fb.syncRound.bind(fb);
  const resRound = await origSyncRound({ id: 'DEMO-RND-1' });
  assert.equal(resRound, false);
  assert.equal(await fb.syncRoundsList([{ id: 'DEMO-RND-1' }]), false);
  assert.equal(await fb.syncSafetyViolation({ id: 'DEMO-V-1' }), false);
  assert.equal(await fb.syncShiftLogs([{ id: 'DEMO-L-1' }]), false);
  assert.equal(await fb.recordAuditLog('TEST', {}), false);
  assert.equal(fbMethodReachedDb, false);
  assert.equal(firebaseWrites, 0);

  // SharePoint sync must be blocked
  const spRes = await sandbox.KSUDataBridge.syncToSharePoint({ id: 'DEMO-RND-1' }, 'inspection');
  assert.deepEqual({ ...spRes }, { success: false, blocked: true, demo: true });
  assert.equal(fetchCalls, 0);

  // DataBridge storage writes must go to sessionStorage, not localStorage
  sandbox.KSUDataBridge.saveNotification({ id: 'DEMO-N-1', title: 'Test' });
  assert.equal(String(sandbox.localStorage.getItem('ksumc_notifications') || '').includes('DEMO-N-1'), false);
  assert.ok(sandbox.sessionStorage.getItem('demo_ksumc_notifications').includes('DEMO-N-1'));

  // KSUIntegrations audit trail must not write to official localStorage
  sandbox.KSUIntegrations.recordAuditTrail('DEMO_ACTION', { x: 1 });
  assert.equal(sandbox.localStorage.getItem('ksu_safety_audit_trail'), null);
  assert.ok(sandbox.sessionStorage.getItem('demo_ksu_safety_audit_trail'));

  // Verify app.js loadState & saveRounds isolation
  const stateBlockMatch = appJsSource.match(/function isDemoSandboxSession\(\)[\s\S]*?function loadState\(\)[\s\S]*?^\}/m);
  const saveBlockMatch = appJsSource.match(/function notifyCloudSync\(\)[\s\S]*?function saveCAPA\([\s\S]*?^\}/m);
  assert.ok(stateBlockMatch && saveBlockMatch, 'app.js isolation functions must exist');

  sandbox.STORAGE_KEY_ROUNDS = 'ksumc_safety_rounds';
  sandbox.STORAGE_KEY_ALARMS = 'ksumc_safety_alarms';
  sandbox.STORAGE_KEY_PERMITS = 'ksumc_safety_permits';
  sandbox.STORAGE_KEY_DOORS = 'ksumc_safety_doors';
  sandbox.STORAGE_KEY_SAFETY_VIOLATIONS = 'ksumc_safety_violations';
  sandbox.STORAGE_KEY_SMOKING_VIOLATIONS = 'ksumc_smoking_violations';
  sandbox.STORAGE_KEY_SAFETY_DEPT_REPORTS = 'ksumc_safety_dept_reports';
  sandbox.STORAGE_KEY_SHIFT_INCIDENTS = 'ksumc_shift_incidents';
  sandbox.STORAGE_KEY_SHIFT_INSPECTION_LOGS = 'ksumc_quality_shift_inspection_logs';
  sandbox.INITIAL_BUILDINGS = [];
  sandbox.state = { rounds: [], alarms: [], permits: [], doors: [], safetyViolations: [], smokingViolations: [], safetyDeptReports: [], shiftIncidents: [], capa: [] };
  sandbox.updateDashboardKPIs = () => {};
  sandbox.renderAlarmsList = () => {};
  sandbox.updateAlarmBadges = () => {};
  sandbox.renderPermitsList = () => {};
  sandbox.renderDoorsList = () => {};
  sandbox.syncRoundsToShiftInspectionLog = () => {};

  vm.runInNewContext(stateBlockMatch[0], sandbox);
  vm.runInNewContext(saveBlockMatch[0], sandbox);

  sandbox.loadState();
  assert.equal(sandbox.state.rounds.length, 0, 'Demo loadState must not load official localStorage rounds');

  sandbox.state.rounds.push({ id: 'DEMO-RND-99', title: 'Demo Round' });
  sandbox.saveRounds(sandbox.state.rounds[0]);

  assert.equal(oracleCalls, 0, 'KSUOracleSync must receive 0 calls');
  assert.equal(fetchCalls, 0, 'SharePoint fetch must receive 0 calls');
  assert.equal(firebaseWrites, 0, 'Firebase DB must receive 0 writes');
  assert.equal(sandbox.localStorage.getItem('ksumc_safety_rounds'), initialOfficialRounds, 'Official localStorage rounds must remain untouched');
  assert.ok(sandbox.sessionStorage.getItem('demo_ksumc_safety_rounds').includes('DEMO-RND-99'));
});

test('6. KSUAuth.logout() clears all demo sessionStorage keys', () => {
  const sandbox = createSandbox({ pathname: '/field.html' });
  vm.runInNewContext(authGuardSource, sandbox);

  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  sandbox.KSUAuth.login(demoUser);
  sandbox.sessionStorage.setItem('demo_ksumc_safety_rounds', '[{"id":"D1"}]');
  sandbox.sessionStorage.setItem('ksu_demo_extra', '1');

  sandbox.KSUAuth.logout();

  assert.equal(sandbox.sessionStorage.getItem('ksu_active_user'), null);
  assert.equal(sandbox.sessionStorage.getItem('ksu_active_portal'), null);
  assert.equal(sandbox.sessionStorage.getItem('demo_ksumc_safety_rounds'), null);
  assert.equal(sandbox.sessionStorage.getItem('ksu_demo_extra'), null);
  assert.equal(sandbox.location.pathname, 'index.html');
});

test('7. field.html includes Demo Mode banner and accounts-credentials-a4.html is removed', () => {
  assert.match(fieldHtmlSource, /id="demo-sandbox-banner"/);
  assert.match(fieldHtmlSource, /وضع الحساب التجريبي/);
  assert.match(fieldHtmlSource, /KSUAuth\.isDemoUser\(user\)/);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'accounts-credentials-a4.html')), false, 'accounts-credentials-a4.html must be removed');
});

test('8. KSUAuth.deleteUser() is blocked and returns false in demo mode', () => {
  const sandbox = createSandbox();
  vm.runInNewContext(authGuardSource, sandbox);

  const beforeDb = sandbox.localStorage.getItem('ksumc_users_db_v1');
  const beforeUsers = sandbox.localStorage.getItem('ksumc_users');
  const beforeAdmin = sandbox.localStorage.getItem('ksumc_admin_users');

  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  sandbox.KSUAuth.login(demoUser);

  assert.equal(sandbox.KSUAuth.deleteUser('USR-02'), false);
  assert.equal(sandbox.localStorage.getItem('ksumc_users_db_v1'), beforeDb);
  assert.equal(sandbox.localStorage.getItem('ksumc_users'), beforeUsers);
  assert.equal(sandbox.localStorage.getItem('ksumc_admin_users'), beforeAdmin);
});

test('9. saveNewInspectionRound() isolates round mirror writes and guards KSUOracleSync.saveCAPA in demo mode', () => {
  const fnMatch = appJsSource.match(/function saveNewInspectionRound\([\s\S]*?^\}/m);
  assert.ok(fnMatch, 'saveNewInspectionRound must exist in app.js');
  const body = fnMatch[0];
  assert.equal(/\blocalStorage\.setItem\(STORAGE_KEY_ROUNDS/.test(body), false, 'must not write directly to localStorage STORAGE_KEY_ROUNDS');
  assert.equal(/\blocalStorage\.setItem\('ksumc_rounds'/.test(body), false, 'must not write directly to localStorage ksumc_rounds');
  assert.match(body, /writeOp\(STORAGE_KEY_ROUNDS,\s*serialized\)/);
  assert.match(body, /writeOp\('ksumc_rounds',\s*serialized\)/);
  assert.match(body, /if\s*\(!isDemoCapa\s*&&\s*window\.KSUOracleSync/);
});

test('10. deleteSafetyDeptReport() and renderSafetyDeptReportsTable() isolate storage and OracleSync in demo mode', () => {
  const initialOfficialReports = JSON.stringify([{ id: 'OFFICIAL-REP-1', subject: 'Official' }]);
  const sandbox = createSandbox({
    pathname: '/field.html',
    initialLocal: { ksumc_safety_dept_reports: initialOfficialReports }
  });
  vm.runInNewContext(authGuardSource, sandbox);
  sandbox.KSUAuth.login(sandbox.KSUAuth.authenticate('demo', 'demo'));

  let oracleDeleteCalls = 0;
  let notifyCalls = 0;
  sandbox.KSUOracleSync = { deleteSafetyDeptReport: () => { oracleDeleteCalls++; } };
  sandbox.notifyCloudSync = () => { notifyCalls++; };
  sandbox.confirm = () => true;
  sandbox.showToast = () => {};
  sandbox.renderSafetyDeptReportsTable = () => {};
  sandbox.STORAGE_KEY_SAFETY_DEPT_REPORTS = 'ksumc_safety_dept_reports';
  sandbox.state = { safetyDeptReports: [{ id: 'DEMO-REP-1', subject: 'Demo' }] };

  const helpersMatch = appJsSource.match(/function isDemoSandboxSession\(\)[\s\S]*?function setOperationalStorageItem\([\s\S]*?\n\}/);
  const delMatch = appJsSource.match(/function deleteSafetyDeptReport\(reportId\)[\s\S]*?\n\}/);
  assert.ok(helpersMatch && delMatch, 'deleteSafetyDeptReport and helpers must exist');
  vm.runInNewContext(helpersMatch[0], sandbox);
  vm.runInNewContext(delMatch[0], sandbox);

  sandbox.deleteSafetyDeptReport('DEMO-REP-1');
  assert.equal(oracleDeleteCalls, 0, 'KSUOracleSync.deleteSafetyDeptReport must not be called in demo mode');
  assert.equal(notifyCalls, 0, 'notifyCloudSync must not be called in demo mode');
  assert.equal(sandbox.localStorage.getItem('ksumc_safety_dept_reports'), initialOfficialReports, 'Official localStorage reports must remain untouched');
  assert.equal(sandbox.sessionStorage.getItem('demo_ksumc_safety_dept_reports'), '[]');

  const renderMatch = appJsSource.match(/function renderSafetyDeptReportsTable\(\)[\s\S]*?^\}/m);
  assert.ok(renderMatch, 'renderSafetyDeptReportsTable must exist');
  assert.match(renderMatch[0], /setOperationalStorageItem\(STORAGE_KEY_SAFETY_DEPT_REPORTS/);
  assert.match(renderMatch[0], /isDemoSandboxSession\(\)/);
});

test('11. app.js resolves active user from KSUAuth.getUser() / sessionStorage so demo does not trigger #ksu-login-modal lockout', () => {
  const helperMatch = appJsSource.match(/function getResolvedActiveUser\(\)[\s\S]*?\n\}/);
  assert.ok(helperMatch, 'getResolvedActiveUser helper must exist in app.js');

  const sandbox = createSandbox({ pathname: '/field.html' });
  vm.runInNewContext(authGuardSource, sandbox);
  sandbox.KSUAuth.login(sandbox.KSUAuth.authenticate('demo', 'demo'));
  vm.runInNewContext(helperMatch[0], sandbox);

  const resolved = sandbox.getResolvedActiveUser();
  assert.equal(resolved?.username, 'demo');
  assert.equal(sandbox.localStorage.getItem('ksu_active_user'), null);

  assert.match(appJsSource, /const savedActive = getResolvedActiveUser\(\);/);
  assert.match(appJsSource, /const activeUser = !isLoggedOut \? getResolvedActiveUser\(\) : null;/);
  assert.match(appJsSource, /const parsed = !isLoggedOut \? getResolvedActiveUser\(\) : null;/);
});

test('12. ksu-ai-client.js fetchCloudKeysSilently() skips ai_keys.json fetch in demo mode', async () => {
  const aiClientSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/ksu-ai-client.js'), 'utf8');
  const fnMatch = aiClientSource.match(/async fetchCloudKeysSilently\(\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(fnMatch, 'fetchCloudKeysSilently must exist in ksu-ai-client.js');

  let fetchCalls = 0;
  const sandbox = createSandbox({ pathname: '/field.html' });
  sandbox.fetch = async () => { fetchCalls++; return { ok: true, json: async () => ({}) }; };
  vm.runInNewContext(authGuardSource, sandbox);
  sandbox.KSUAuth.login(sandbox.KSUAuth.authenticate('demo', 'demo'));

  vm.runInNewContext(`const obj = { ${fnMatch[0]} }; window._testFetchCloudKeys = () => obj.fetchCloudKeysSilently();`, sandbox);
  await sandbox._testFetchCloudKeys();
  assert.equal(fetchCalls, 0, 'ai_keys.json must not be fetched in demo mode');
});

test('13. ksu-firebase-realtime.js skips ensureCleanProductionStorage and signInAnonymously on demo boot', () => {
  const demoUserJson = JSON.stringify({ id: 'USR-DEMO-01', username: 'demo', isDemoAccount: true, portal: 'field' });
  let signInCalls = 0;
  const sandbox = createSandbox({
    pathname: '/field.html',
    initialSession: { ksu_active_user: demoUserJson, ksu_active_portal: 'field' }
  });
  sandbox.firebase = {
    apps: [],
    initializeApp: () => {},
    auth: () => ({
      currentUser: null,
      onAuthStateChanged: () => {},
      signInAnonymously: () => { signInCalls++; return Promise.resolve(); }
    }),
    database: () => ({ ref: () => ({ on: () => {} }) })
  };

  vm.runInNewContext(authGuardSource, sandbox);
  vm.runInNewContext(firebaseSyncSource, sandbox);

  assert.equal(signInCalls, 0, 'signInAnonymously must not fire on demo boot');
  assert.equal(sandbox.localStorage.getItem('ksumc_prod_clean_version'), null, 'ensureCleanProductionStorage must not write ksumc_prod_clean_version in demo mode');
  assert.equal(sandbox.localStorage.getItem('ksumc_safety_rounds'), null, 'ensureCleanProductionStorage must not seed trial keys in demo mode');
  assert.equal(sandbox.localStorage.getItem('ksumc_device_id'), null, 'getOrCreateDeviceId must not write ksumc_device_id in demo mode');
});

test('14. KSUDataBridge.saveRound() writes to sessionStorage and leaves localStorage ksumc_field_rounds and ksumc_rounds_registry null in demo mode', () => {
  const sandbox = createSandbox({ pathname: '/field.html' });
  vm.runInNewContext(authGuardSource, sandbox);
  vm.runInNewContext(dataBridgeSource, sandbox);

  const demoUser = sandbox.KSUAuth.authenticate('demo', 'demo');
  sandbox.KSUAuth.login(demoUser);

  const saved = sandbox.KSUDataBridge.saveRound({ facilityName: 'Demo Isolation Check', status: 'completed' });
  assert.ok(saved && saved.id, 'saveRound must return the saved demo round');
  assert.equal(saved.facilityName, 'Demo Isolation Check');

  const sessionRoundsRaw = sandbox.sessionStorage.getItem('demo_ksumc_safety_rounds');
  assert.ok(sessionRoundsRaw && sessionRoundsRaw.includes('Demo Isolation Check'), 'sessionStorage demo_ksumc_safety_rounds must contain the saved demo round');

  assert.equal(sandbox.localStorage.getItem('ksumc_field_rounds'), null, 'localStorage ksumc_field_rounds must remain null in demo mode');
  assert.equal(sandbox.localStorage.getItem('ksumc_rounds_registry'), null, 'localStorage ksumc_rounds_registry must remain null in demo mode');
  assert.equal(sandbox.localStorage.getItem('ksumc_safety_rounds'), null, 'localStorage ksumc_safety_rounds must remain null in demo mode');
});


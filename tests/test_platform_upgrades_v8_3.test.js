const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function makeStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    _map: map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] || null,
    get length() { return map.size; }
  };
}

// =============================================================================
// 1. SW Auth Token Sync & FCM Push Readiness (Fix 401 Background Polling)
// =============================================================================
test('UPG-1: sw.js skips unauthenticated/demo RTDB polling and attaches ?auth=<idToken> when authenticated', async () => {
  const swCode = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const fetchedUrls = [];
  const shownNotifications = [];
  const listeners = new Map();

  const swSandbox = {
    console,
    Date,
    Set,
    Map,
    URL,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    encodeURIComponent,
    caches: {
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null
    },
    fetch: async (url) => {
      fetchedUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          n1: {
            id: 'NOTIF-AUTH-1',
            title: 'تنبيه طارئ',
            message: 'رسالة اختبار مصادقة الخلفية',
            priority: 'critical',
            targetShift: 'all',
            createdAt: new Date().toISOString()
          }
        })
      };
    }
  };
  swSandbox.self = {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [] },
    navigator: { setAppBadge: async () => {}, clearAppBadge: async () => {} },
    registration: {
      showNotification: async (title, opts) => {
        shownNotifications.push({ title, opts });
      }
    }
  };
  vm.createContext(swSandbox);
  vm.runInContext(swCode, swSandbox);

  // 1) Unauthenticated state -> must NOT hit notifications.json without token
  await swSandbox.checkFirebaseNotificationsInBackground(0);
  assert.equal(fetchedUrls.length, 0, 'Unauthenticated SW must not send 401-triggering RTDB fetch');

  // 2) Demo mode -> must NOT hit notifications.json
  const msgHandlers = listeners.get('message') || [];
  assert.ok(msgHandlers.length > 0, 'sw.js must listen for message events');
  for (const h of msgHandlers) {
    h({ data: { type: 'SYNC_AUTH_TOKEN', idToken: 'DEMO_TOK', isDemo: true }, waitUntil: () => {} });
  }
  await swSandbox.checkFirebaseNotificationsInBackground(0);
  assert.equal(fetchedUrls.length, 0, 'Demo SW session must make 0 RTDB fetches');

  // 3) Real authenticated staff token -> must attach ?auth=<idToken> and display notification
  for (const h of msgHandlers) {
    h({
      data: {
        type: 'SYNC_AUTH_TOKEN',
        idToken: 'eyJ_REAL_STAFF_TOKEN_123',
        uid: 'uid-m1',
        role: 'field_inspector',
        shift: '1',
        isDemo: false
      },
      waitUntil: () => {}
    });
  }
  await swSandbox.checkFirebaseNotificationsInBackground(Date.now() - 60000);
  assert.equal(fetchedUrls.length, 1, 'Authenticated SW must fetch notifications once');
  assert.ok(
    fetchedUrls[0].includes('?auth=eyJ_REAL_STAFF_TOKEN_123'),
    `Expected ?auth= token in URL, got: ${fetchedUrls[0]}`
  );
  assert.equal(shownNotifications.length, 1, 'Must show lockscreen notification');

  // 4) Logout clears token
  for (const h of msgHandlers) {
    h({ data: { type: 'CLEAR_AUTH_TOKEN' }, waitUntil: () => {} });
  }
  await swSandbox.checkFirebaseNotificationsInBackground(0);
  assert.equal(fetchedUrls.length, 1, 'Cleared SW auth must stop fetching');

  // 5) Verify ksu-firebase-realtime.js exposes token sync & FCM registration helpers
  const fbRealtimeSrc = fs.readFileSync(path.join(ROOT, 'assets/js/ksu-firebase-realtime.js'), 'utf8');
  assert.ok(fbRealtimeSrc.includes('syncAuthTokenToServiceWorker'), 'ksu-firebase-realtime.js must sync auth token to SW');
  assert.ok(fbRealtimeSrc.includes('registerFCMWebPush'), 'ksu-firebase-realtime.js must include registerFCMWebPush helper');
});

// =============================================================================
// 2. Lazy Asset Loader & Offline Sync Queue Bar
// =============================================================================
test('UPG-2: ksu-asset-loader.js lazily loads heavy registries and field.html exposes offline sync banner', async () => {
  const loaderPath = path.join(ROOT, 'assets/js/ksu-asset-loader.js');
  assert.ok(fs.existsSync(loaderPath), 'assets/js/ksu-asset-loader.js must exist');

  const appendedScripts = [];
  const sandbox = {
    console,
    Promise,
    Set,
    Map,
    Object,
    Array,
    String,
    Boolean,
    setTimeout: (fn) => { fn(); return 1; },
    requestIdleCallback: (fn) => { fn({ didTimeout: false, timeRemaining: () => 50 }); return 1; },
    document: {
      createElement: () => {
        const el = { src: '', async: false, defer: false, charset: '', onload: null, onerror: null };
        return el;
      },
      head: {
        appendChild: (el) => {
          appendedScripts.push(el.src);
          if (el.src.includes('real_extinguishers_data.js')) {
            sandbox.KSU_REAL_EXTINGUISHERS = [{ id: 'EXT-0001', category: 'طفايات الحريق' }];
          }
          if (typeof el.onload === 'function') el.onload();
        }
      }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(loaderPath, 'utf8'), sandbox);

  assert.ok(sandbox.KSUAssetLoader, 'window.KSUAssetLoader must be defined');
  await sandbox.KSUAssetLoader.ensureRegistry('extinguishers');
  await sandbox.KSUAssetLoader.ensureRegistry('extinguishers'); // second call must deduplicate!
  const extLoads = appendedScripts.filter(s => s.includes('real_extinguishers_data.js'));
  assert.equal(extLoads.length, 1, 'Must load real_extinguishers_data.js only once');
  assert.equal(sandbox.KSU_REAL_EXTINGUISHERS.length, 1);

  const fieldHtml = fs.readFileSync(path.join(ROOT, 'field.html'), 'utf8');
  assert.ok(fieldHtml.includes('ksu-asset-loader.js'), 'field.html must include ksu-asset-loader.js');
  assert.ok(
    !/<script\s+src="assets\/js\/real_extinguishers_data\.js"/.test(fieldHtml),
    'field.html must not render-block on synchronous real_extinguishers_data.js'
  );
  assert.ok(fieldHtml.includes('id="ksu-offline-sync-banner"'), 'field.html must include #ksu-offline-sync-banner');
});

// =============================================================================
// 3. Zero-Raw-Key Exposure When Firebase AI Logic Bridge Is Active + App Check
// =============================================================================
test('UPG-3: ksu-ai-client.js avoids eager raw ai_keys.json download at boot when Firebase AI Logic bridge is active', async () => {
  let rawVaultFetches = 0;
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Promise,
    Set,
    Map,
    URL,
    TextEncoder,
    AbortController,
    Intl,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage,
    sessionStorage,
    navigator: { userAgent: 'NodeTest', onLine: true },
    location: { hostname: 'rsd-ksu.web.app', host: 'rsd-ksu.web.app', protocol: 'https:', href: 'https://rsd-ksu.web.app/field.html' },
    _ksuFirebaseAILogicBridge: {
      async generateContent() {
        return { response: { text: () => '{}' } };
      }
    },
    fetch: async (url) => {
      if (String(url).includes('system_config/ai_keys.json')) {
        rawVaultFetches++;
      }
      return { ok: true, status: 200, json: async () => null };
    }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-firebase-config.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ai-client.js'), 'utf8'), sandbox);

  assert.equal(sandbox.KSUAI.isFirebaseAILogicEnabled(), true);
  assert.equal(rawVaultFetches, 0, 'Boot must NOT eagerly pull raw ai_keys.json into browser when Firebase AI Logic bridge is active');
  assert.equal(typeof sandbox.KSUAI.ensureAppCheckInitialized, 'function', 'KSUAI must expose ensureAppCheckInitialized');
  assert.equal(typeof sandbox.KSUAI.verifyCapaClosureImage, 'function', 'KSUAI must expose verifyCapaClosureImage');
});

// =============================================================================
// 4. Closed-Loop CAPA Before/After Visual Verification
// =============================================================================
test('UPG-4: KSUOps enforces Before/After visual verification for Critical/High CAPA closure and isolates demo', async () => {
  const opsPath = path.join(ROOT, 'assets/js/ksu-ops-enhancements.js');
  assert.ok(fs.existsSync(opsPath), 'assets/js/ksu-ops-enhancements.js must exist');

  const updatedRecords = [];
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    Promise,
    Intl,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    KSUDataBridge: {
      updateCAPARecord: (id, patch) => {
        updatedRecords.push({ id, patch });
        return true;
      }
    },
    KSUAI: {
      async verifyCapaClosureImage({ afterImage, title }) {
        return {
          success: true,
          verified: Boolean(afterImage && afterImage.startsWith('data:image/')),
          confidence: 95,
          summary: `تم التحقق بصرياً من إزالة الخطر: ${title}`
        };
      }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(opsPath, 'utf8'), sandbox);

  const criticalCapa = {
    id: 'CAPA-901',
    title: 'إغلاق مخرج طوارئ بصناديق',
    severity: 'حرج (Critical)',
    priority: 'high',
    businessDaysAllowed: 5,
    status: 'open'
  };

  assert.equal(sandbox.KSUOps.requiresVisualClosure(criticalCapa), true);
  assert.equal(sandbox.KSUOps.requiresVisualClosure({ id: 'CAPA-902', severity: 'منخفض (Low)', priority: 'low', businessDaysAllowed: 10 }), false);

  // Reject closing Critical CAPA without afterImage
  const failRes = await sandbox.KSUOps.validateAndCloseCAPA(criticalCapa, {
    notes: 'تم الإغلاق بدون صورة',
    afterImage: ''
  });
  assert.equal(failRes.success, false, 'Must block closing Critical CAPA without after-fix image');
  assert.equal(updatedRecords.length, 0);

  // Succeed when afterImage is provided + AI verified
  const okRes = await sandbox.KSUOps.validateAndCloseCAPA(criticalCapa, {
    notes: 'تم إخلاء الممر بالكامل',
    afterImage: 'data:image/jpeg;base64,/9j/AFTER_FIX_CLEAN',
    closedBy: 'أ. مصعب الحماد'
  });
  assert.equal(okRes.success, true);
  assert.equal(updatedRecords.length, 1);
  assert.equal(updatedRecords[0].patch.status, 'resolved');
  assert.equal(updatedRecords[0].patch.afterImage, 'data:image/jpeg;base64,/9j/AFTER_FIX_CLEAN');
  assert.equal(updatedRecords[0].patch.aiClosureVerification.verified, true);

  const headHtml = fs.readFileSync(path.join(ROOT, 'head.html'), 'utf8');
  assert.ok(headHtml.includes('id="modal-close-capa-verified"'), 'head.html must provide Before/After CAPA closure modal');
});

// =============================================================================
// 5. Monthly Uninspected Assets Coverage Tracker
// =============================================================================
test('UPG-5: KSUOps.computeMonthlyAssetCoverage tracks remaining uninspected assets per system and building', () => {
  const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Intl };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ops-enhancements.js'), 'utf8'), sandbox);

  const assets = [
    { id: 'EXT-001', category: 'طفايات الحريق', buildingCode: 'A', building: 'المستشفى', floor: 'الدور الأرضي (G)' },
    { id: 'EXT-002', category: 'طفايات الحريق', buildingCode: 'A', building: 'المستشفى', floor: 'الدور الأول (1)' },
    { id: 'EXT-003', category: 'طفايات الحريق', buildingCode: 'E', building: 'مبنى العيادات', floor: 'الدور الأرضي (G)' },
    { id: 'PL01199', category: 'صناديق وخراطيم الإطفاء', buildingCode: 'D', building: 'المبنى الإداري', floor: 'القبو الثاني (B2)' },
    { id: 'FACP-FA0019', category: 'لوحات إنذار الحريق', buildingCode: 'A', building: 'المستشفى', floor: 'الدور الأرضي (G)' }
  ];

  const rounds = [
    // Inspected Hospital Ground Floor Fire Extinguishers in Nov 2026
    { id: 'R-100', date: '2026-11-10', checklistType: 'fex', formTitle: 'طفايات الحريق', building: 'المستشفى', floor: 'الدور الأرضي (G)' },
    // Inspected Hospital Ground Floor FACP in Nov 2026
    { id: 'R-101', date: '2026-11-12', checklistType: 'fas_insp', formTitle: 'التفتيش على نظام الحريق', building: 'المستشفى', floor: 'الدور الأرضي (G)' },
    // Old October round (must not count for Nov 2026!)
    { id: 'R-099', date: '2026-10-15', checklistType: 'fex', formTitle: 'طفايات الحريق', building: 'مبنى العيادات', floor: 'الدور الأرضي (G)' }
  ];

  const report = sandbox.KSUOps.computeMonthlyAssetCoverage({ assets, rounds, month: '2026-11' });
  assert.equal(report.totalAssets, 5);
  assert.equal(report.inspectedAssets, 2, 'Only Nov 2026 matching building+floor+system assets count');
  assert.equal(report.remainingAssets, 3);
  assert.equal(report.coveragePct, 40);
  assert.equal(report.byBuilding.A.total, 3);
  assert.equal(report.byBuilding.A.inspected, 2);
  assert.equal(report.byBuilding.A.remaining, 1);
  assert.equal(report.byBuilding.E.remaining, 1);

  const fieldHtml = fs.readFileSync(path.join(ROOT, 'field.html'), 'utf8');
  const qualityHtml = fs.readFileSync(path.join(ROOT, 'quality.html'), 'utf8');
  assert.ok(fieldHtml.includes('id="monthly-asset-coverage-panel"'), 'field.html must display #monthly-asset-coverage-panel');
  assert.ok(qualityHtml.includes('id="monthly-asset-coverage-panel"'), 'quality.html must display #monthly-asset-coverage-panel');
});

// =============================================================================
// 6. Hot Work Permit Post-Work Fire-Watch Timer (NFPA 51B)
// =============================================================================
test('UPG-6: KSUOps.evaluatePermitFireWatch tracks 30m and 60m post-work checks per NFPA 51B', () => {
  const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Intl };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ops-enhancements.js'), 'utf8'), sandbox);

  const endMs = Date.parse('2026-11-26T12:00:00Z');
  const permit = {
    id: 'HWP-501',
    workType: 'لحام وقص حراري (أعمال ساخنة)',
    workEndedAt: new Date(endMs).toISOString()
  };

  // At +15 min: awaiting 30m check
  const st15 = sandbox.KSUOps.evaluatePermitFireWatch(permit, endMs + 15 * 60 * 1000);
  assert.equal(st15.stage, 'awaiting_30m');
  assert.equal(st15.isOverdue, false);

  // At +35 min without 30m check: overdue_30m!
  const st35 = sandbox.KSUOps.evaluatePermitFireWatch(permit, endMs + 35 * 60 * 1000);
  assert.equal(st35.stage, 'overdue_30m');
  assert.equal(st35.isOverdue, true);

  // Record 30m check -> awaiting_60m
  sandbox.KSUOps.recordPermitFireWatchCheck(permit, '30m', 'أ. حسن دعاك', endMs + 36 * 60 * 1000);
  const st45 = sandbox.KSUOps.evaluatePermitFireWatch(permit, endMs + 45 * 60 * 1000);
  assert.equal(st45.stage, 'awaiting_60m');
  assert.equal(st45.isOverdue, false);

  // At +65 min without 60m check: overdue_60m!
  const st65 = sandbox.KSUOps.evaluatePermitFireWatch(permit, endMs + 65 * 60 * 1000);
  assert.equal(st65.stage, 'overdue_60m');
  assert.equal(st65.isOverdue, true);

  // Record 60m check -> completed!
  sandbox.KSUOps.recordPermitFireWatchCheck(permit, '60m', 'أ. حسن دعاك', endMs + 66 * 60 * 1000);
  const stDone = sandbox.KSUOps.evaluatePermitFireWatch(permit, endMs + 70 * 60 * 1000);
  assert.equal(stDone.stage, 'completed');
  assert.equal(stDone.isOverdue, false);
});

// =============================================================================
// 7. Interactive KSUMC Master Plan Risk Heatmap
// =============================================================================
test('UPG-7: KSUOps.computeCampusRiskHeatmap maps KSUMC buildings and renders in dashboard.html & head.html', () => {
  const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Intl };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ops-enhancements.js'), 'utf8'), sandbox);

  const heatmap = sandbox.KSUOps.computeCampusRiskHeatmap({
    capaRecords: [
      { id: 'C1', building: 'المستشفى', status: 'open', severity: 'حرج (Critical)', priority: 'high' }
    ],
    permits: [
      { id: 'P1', zone: 'مبنى العيادات', status: 'ساري' }
    ],
    alarms: [
      { id: 'AL1', building: 'كلية الطب', status: 'نشط' }
    ],
    doors: [
      { id: 'D1', building: 'المبنى الإداري', status: 'مفتوح مؤقتاً' }
    ]
  });

  const hospA = heatmap.buildings.find(b => b.code === 'A');
  const clinicsE = heatmap.buildings.find(b => b.code === 'E');
  const medC = heatmap.buildings.find(b => b.code === 'C');
  assert.ok(hospA && hospA.riskLevel === 'critical', 'Hospital A with open critical CAPA must be critical');
  assert.equal(clinicsE.activePermits, 1);
  assert.equal(medC.activeAlarms, 1);

  const dashHtml = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  const headHtml = fs.readFileSync(path.join(ROOT, 'head.html'), 'utf8');
  assert.ok(dashHtml.includes('id="ksumc-interactive-heatmap"'), 'dashboard.html must render #ksumc-interactive-heatmap');
  assert.ok(headHtml.includes('id="ksumc-interactive-heatmap"'), 'head.html must render #ksumc-interactive-heatmap');
});

// =============================================================================
// 8. SLA Auto-Escalation Engine (24h Critical / 48h High)
// =============================================================================
test('UPG-8: KSUIntegrations.runSLAAutoEscalation detects 24h/48h SLA breaches without duplicate spam and isolates demo', () => {
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const dispatchedNotifs = [];
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    localStorage,
    sessionStorage,
    showToast: () => {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-integrations.js'), 'utf8'), sandbox);

  const nowMs = Date.parse('2026-11-26T18:00:00Z');
  const items = [
    {
      id: 'CAPA-CRIT-25H',
      title: 'تعطل مضخة حريق رئيسية',
      severity: 'حرج (Critical)',
      building: 'المستشفى',
      status: 'open',
      createdAt: new Date(nowMs - 26 * 3600 * 1000).toISOString() // 26h ago (> 24h!)
    },
    {
      id: 'CAPA-HIGH-10H',
      title: 'طفاية تحتاج صيانة',
      severity: 'عالي (High)',
      building: 'العيادات',
      status: 'open',
      createdAt: new Date(nowMs - 10 * 3600 * 1000).toISOString() // 10h ago (< 48h)
    }
  ];

  const evalCrit = sandbox.KSUIntegrations.evaluateSLABreach(items[0], nowMs);
  assert.equal(evalCrit.isBreached, true);
  assert.ok(evalCrit.overdueHours >= 2);

  const evalHigh = sandbox.KSUIntegrations.evaluateSLABreach(items[1], nowMs);
  assert.equal(evalHigh.isBreached, false);

  const res1 = sandbox.KSUIntegrations.runSLAAutoEscalation({
    items,
    nowMs,
    onEscalate: (notif) => dispatchedNotifs.push(notif)
  });
  assert.equal(res1.breachedCount, 1);
  assert.equal(res1.newlyEscalatedCount, 1);
  assert.equal(dispatchedNotifs.length, 1);
  assert.equal(dispatchedNotifs[0].type, 'sla_escalation');

  // Running again must NOT duplicate escalation notification for the same item!
  const res2 = sandbox.KSUIntegrations.runSLAAutoEscalation({
    items,
    nowMs: nowMs + 60000,
    onEscalate: (notif) => dispatchedNotifs.push(notif)
  });
  assert.equal(res2.newlyEscalatedCount, 0, 'Must deduplicate already-escalated SLA breach');
  assert.equal(dispatchedNotifs.length, 1);
});

// =============================================================================
// 9. FACP False-Alarm & Loop Analytics
// =============================================================================
test('UPG-9: KSUOps.analyzeFACPAlarms detects chronic false-alarm panels/loops and generates PPM actions', () => {
  const { KSU_FACP_ASSETS } = require(path.join(ROOT, 'assets/js/ksu-facp-assets.js'));
  const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Intl, KSU_FACP_ASSETS };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ops-enhancements.js'), 'utf8'), sandbox);

  const alarms = [
    { id: 'A1', panelId: 'FA0074', loop: 'Loop 3', building: 'كلية الطب', alarmType: 'إنذار كاذب - غبار بالحساس', status: 'مغلق' },
    { id: 'A2', panelId: 'FA0074', loop: 'Loop 3', building: 'كلية الطب', alarmType: 'إنذار كاذب - أبخرة', status: 'مغلق' },
    { id: 'A3', panelId: 'FA0074', loop: 'Loop 5', building: 'كلية الطب', alarmType: 'عطل فني بالحساس', status: 'مغلق' },
    { id: 'A4', panelId: 'FA0019', loop: 'Loop 1', building: 'المستشفى', alarmType: 'بلاغ حقيقي تم التعامل معه', status: 'مغلق' }
  ];

  const analytics = sandbox.KSUOps.analyzeFACPAlarms({ alarms, facpAssets: KSU_FACP_ASSETS });
  assert.equal(analytics.totalAlarms, 4);
  assert.equal(analytics.falseOrFaultCount, 3);
  assert.ok(analytics.chronicPanels.some(p => p.controlNo === 'FA0074' && p.falseCount === 3), 'FA0074 must be flagged as chronic panel');
  assert.ok(analytics.topLoops.some(l => l.key.includes('FA0074') && l.key.includes('3') && l.count === 2), 'FA0074 Loop 3 must be top recurring loop');
  assert.ok(analytics.recommendations.length >= 1, 'Must generate actionable NFPA 72 / SBC 801 PPM recommendations');

  const dashHtml = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  assert.ok(dashHtml.includes('id="facp-false-alarm-analytics"'), 'dashboard.html must display #facp-false-alarm-analytics');
});

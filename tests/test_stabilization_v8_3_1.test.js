/**
 * =============================================================================
 * RSD v8.3.1 Stabilization & Isolated End-to-End Verification Suite
 * =============================================================================
 * Covers:
 * 1. CAPA Save-Layer Supervisor Authorization, Advisory-Only AI, Failure Honesty & Audit Trail
 * 2. Hot Work Fire-Watch Strict Milestone Validation (No Early Pass, No Auto-Fill, On-Time vs Late, SOP Gate)
 * 3. Offline Sync Persistence Across Restart, Mid-Send Drop, Retry Deduplication & Separate SharePoint Status
 * 4. Isolated Single-Building Synthetic End-to-End Flow:
 *    Offline Round -> Reopen -> Sync (RSD + SharePoint) -> Supervisor Review -> Verified Audited Closure
 * =============================================================================
 */

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
    get length() { return map.size; },
    snapshot() {
      return Object.fromEntries(map.entries());
    }
  };
}

function createStabilizationEnv({
  localInit = {},
  sessionInit = {},
  activeUser = null,
  online = true,
  rtdbConnected = true,
  rtdbWriteImpl = null,
  fetchImpl = null,
  aiBridge = null
} = {}) {
  const localStorage = makeStorage(localInit);
  const sessionStorage = makeStorage(sessionInit);
  if (activeUser) {
    localStorage.setItem('ksu_active_user', JSON.stringify(activeUser));
  }

  const toasts = [];
  const docElements = new Map();
  const makeEl = (id = '') => {
    const el = {
      id,
      className: '',
      textContent: '',
      innerHTML: '',
      value: '',
      style: {},
      classList: {
        _s: new Set(),
        add(...c) { c.forEach(x => el.classList._s.add(x)); },
        remove(...c) { c.forEach(x => el.classList._s.delete(x)); },
        contains(c) { return el.classList._s.has(c); }
      }
    };
    if (id) docElements.set(id, el);
    return el;
  };

  const rtdbStore = new Map();
  const defaultRtdbWrite = async (refPath, val, op) => {
    if (!rtdbConnected || !sandbox.navigator.onLine) {
      throw new Error('NETWORK_DISCONNECTED_DURING_RTDB_WRITE');
    }
    if (op === 'update' && val && typeof val === 'object') {
      const prev = rtdbStore.get(refPath) || {};
      rtdbStore.set(refPath, Object.assign({}, prev, JSON.parse(JSON.stringify(val))));
    } else {
      rtdbStore.set(refPath, JSON.parse(JSON.stringify(val)));
    }
    return true;
  };

  const dbMock = {
    ref: (refPath) => ({
      set: (val) => (rtdbWriteImpl ? rtdbWriteImpl(refPath, val, 'set', rtdbStore) : defaultRtdbWrite(refPath, val, 'set')),
      update: (val) => (rtdbWriteImpl ? rtdbWriteImpl(refPath, val, 'update', rtdbStore) : defaultRtdbWrite(refPath, val, 'update')),
      remove: async () => { rtdbStore.delete(refPath); return true; },
      on: () => {},
      off: () => {}
    })
  };

  const listeners = new Map();
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
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: (fn) => { return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage,
    sessionStorage,
    navigator: { userAgent: 'NodeStabilizationTest', onLine: online },
    location: { origin: 'https://rsd-ksu.web.app', hostname: 'rsd-ksu.web.app', host: 'rsd-ksu.web.app', pathname: '/field.html', protocol: 'https:', href: 'https://rsd-ksu.web.app/field.html' },
    CustomEvent: class CustomEvent {
      constructor(type, opts) {
        this.type = type;
        this.detail = opts && opts.detail;
      }
    },
    dispatchEvent: (ev) => {
      const fns = listeners.get(ev.type) || [];
      fns.forEach(fn => { try { fn(ev); } catch (_) {} });
    },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    document: {
      readyState: 'complete',
      getElementById: (id) => docElements.get(id) || makeEl(id),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeEl(),
      addEventListener: () => {},
      head: { appendChild: (el) => { if (el && typeof el.onload === 'function') el.onload(); } },
      body: makeEl('body')
    },
    showToast: (msg, type = 'info') => {
      toasts.push({ msg: String(msg), type });
    },
    fetch: fetchImpl || (async () => { throw new Error('OFFLINE_FETCH_BLOCKED'); }),
    state: { rounds: [], capa: [], permits: [], alarms: [], doors: [], safetyViolations: [], smokingViolations: [] }
  };

  if (aiBridge) {
    sandbox._ksuFirebaseAILogicBridge = aiBridge;
  }

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/auth-guard.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-firebase-config.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-official-card.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksumc-data-bridge.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-firebase-realtime.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ai-client.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js/ksu-ops-enhancements.js'), 'utf8'), sandbox);

  // Attach controlled RTDB mock onto ksuFirebaseSync
  if (sandbox.ksuFirebaseSync) {
    sandbox.ksuFirebaseSync.db = dbMock;
    sandbox.ksuFirebaseSync.isConnected = Boolean(online && rtdbConnected);
  }

  return {
    sandbox,
    localStorage,
    sessionStorage,
    toasts,
    rtdbStore,
    docElements,
    setNetworkState({ isOnline, isRtdbConnected }) {
      sandbox.navigator.onLine = isOnline;
      if (sandbox.ksuFirebaseSync) {
        sandbox.ksuFirebaseSync.isConnected = Boolean(isOnline && isRtdbConnected);
      }
    }
  };
}

// =============================================================================
// SUITE 1: CAPA CLOSURE, ADVISORY AI, FAILURE HONESTY & SAVE-LAYER ENFORCEMENT
// =============================================================================
test('STAB-1.1: When AI analysis fails or is unavailable, CAPA gets NO positive verified/confidence and stays pending_supervisor_review', async () => {
  const inspectorM1 = { id: 'USR-M1', empId: 'M1', username: 'M1', name: 'أ. عادل خلف العنزي', roleCategory: 'field_inspector', shift: '1' };
  const env = createStabilizationEnv({
    activeUser: inspectorM1,
    aiBridge: {
      async generateContent() {
        const err = new Error('AI service unavailable 503');
        err.status = 503;
        throw err;
      }
    },
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'Service Unavailable' })
  });

  const aiResult = await env.sandbox.KSUAI.verifyCapaClosureImage({
    afterImage: 'data:image/jpeg;base64,/9j/AFTER_EVIDENCE_01',
    title: 'تعطل إنارة مخرج طوارئ',
    description: 'إنارة الطوارئ لا تعمل عند فصل التيار',
    location: 'مبنى العيادات - الدور الأول'
  });

  assert.equal(aiResult.advisoryOnly, true, 'AI result must be explicitly advisoryOnly');
  assert.notEqual(aiResult.verified, true, 'Failed AI analysis must NEVER return verified: true');
  assert.equal(aiResult.verified, null, 'Failed AI analysis must set verified: null');
  assert.equal(aiResult.confidence, null, 'Failed AI analysis must NOT fabricate a confidence score');

  // Create High-severity CAPA and attempt closure as inspector -> must stay pending_supervisor_review with saved afterImage
  const saved = env.sandbox.KSUDataBridge.saveCAPARecord({
    id: 'CAPA-STAB-101',
    title: 'تعطل إنارة مخرج طوارئ',
    building: 'مبنى العيادات',
    floor: 'الدور الأول',
    severity: 'عالي (High)',
    priority: 'high',
    reporterShift: '1',
    status: 'open'
  });
  assert.equal(saved.status, 'open');

  const res = await env.sandbox.KSUOps.validateAndCloseCAPA(saved, {
    notes: 'تم استبدال بطارية الكشاف وإرفاق الصورة للمراجعة',
    afterImage: 'data:image/jpeg;base64,/9j/AFTER_EVIDENCE_01'
  });

  const updated = env.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-STAB-101');
  assert.equal(updated.afterImage, 'data:image/jpeg;base64,/9j/AFTER_EVIDENCE_01', 'afterImage evidence must be saved');
  assert.equal(updated.status, 'pending_supervisor_review', 'Record must remain pending_supervisor_review without supervisor approval');
  assert.equal(updated.closedAt, null, 'closedAt must remain null');
  assert.equal(res.closed, false, 'Inspector submission must not close CAPA');
});

test('STAB-1.2: Save-layer (updateCAPARecord / saveCAPARecord) blocks unauthorized or evidence-missing closure and logs supervisor audit on valid approval', async () => {
  const inspectorM1 = { id: 'USR-M1', empId: 'M1', username: 'M1', name: 'أ. عادل خلف العنزي', roleCategory: 'field_inspector', shift: '1' };
  const wrongShiftSupS2 = { id: 'USR-S2', empId: 'S2', username: 'S2', name: 'أ. مشرف الوردية الثانية', roleCategory: 'shift_supervisor', shift: '2' };
  const rightShiftSupS1 = { id: 'USR-S1', empId: 'S1', username: 'S1', name: 'أ. مشرف الوردية الأولى', roleCategory: 'shift_supervisor', shift: '1' };

  const env = createStabilizationEnv({
    activeUser: inspectorM1,
    fetchImpl: async () => ({ ok: true, status: 202 })
  });

  env.sandbox.KSUDataBridge.saveCAPARecord({
    id: 'CAPA-STAB-102',
    title: 'انسداد مخرج طوارئ بتروليات طبية',
    building: 'مبنى العيادات',
    floor: 'الدور الأرضي',
    severity: 'حرج (Critical)',
    priority: 'critical',
    reporterShift: '1',
    status: 'open'
  });

  // 1) Direct save-layer bypass attempt by Inspector M1 (calling updateCAPARecord directly, bypassing UI!)
  env.sandbox.KSUDataBridge.updateCAPARecord('CAPA-STAB-102', {
    status: 'resolved',
    afterImage: 'data:image/jpeg;base64,/9j/CLEAN_EXIT_PHOTO',
    resolutionNotes: 'محاولة إغلاق مباشر من المفتش'
  });
  let rec = env.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-STAB-102');
  assert.equal(rec.status, 'pending_supervisor_review', 'Save layer must block inspector from setting status=resolved');
  assert.equal(rec.afterImage, 'data:image/jpeg;base64,/9j/CLEAN_EXIT_PHOTO', 'Save layer must preserve uploaded afterImage evidence');
  assert.ok(!rec.approvedBy, 'approvedBy must not be set on unauthorized attempt');

  // 2) Wrong-shift supervisor S2 attempts to close Shift 1 CAPA -> blocked at save layer!
  env.localStorage.setItem('ksu_active_user', JSON.stringify(wrongShiftSupS2));
  env.sandbox.KSUDataBridge.updateCAPARecord('CAPA-STAB-102', {
    status: 'resolved',
    resolutionNotes: 'محاولة اعتماد من مشرف وردية مختلفة'
  });
  rec = env.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-STAB-102');
  assert.equal(rec.status, 'pending_supervisor_review', 'Save layer must block cross-shift supervisor from closing Shift 1 CAPA');

  // 3) Authorized Shift 1 supervisor S1 attempts to close another Critical CAPA WITHOUT afterImage -> blocked at save layer!
  env.localStorage.setItem('ksu_active_user', JSON.stringify(rightShiftSupS1));
  env.sandbox.KSUDataBridge.saveCAPARecord({
    id: 'CAPA-STAB-103-NO-IMG',
    title: 'تسرب غاز بمختبر',
    building: 'مبنى العيادات',
    floor: 'الدور الثاني',
    severity: 'حرج (Critical)',
    priority: 'critical',
    reporterShift: '1',
    status: 'open'
  });
  env.sandbox.KSUDataBridge.updateCAPARecord('CAPA-STAB-103-NO-IMG', {
    status: 'resolved',
    resolutionNotes: 'محاولة إغلاق بدون صورة بعد الإصلاح'
  });
  const recNoImg = env.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-STAB-103-NO-IMG');
  assert.notEqual(recNoImg.status, 'resolved', 'Save layer must block closing Critical CAPA without afterImage evidence');

  // 4) Authorized Shift 1 supervisor S1 approves closure of CAPA-STAB-102 (which has afterImage, even when AI says negative/advisory!)
  const closeRes = await env.sandbox.KSUOps.validateAndCloseCAPA(rec, {
    notes: 'تمت المعاينة الميدانية من مشرف الوردية الأولى واعتماد إزالة العائق',
    afterImage: rec.afterImage
  });
  assert.equal(closeRes.success, true);
  assert.equal(closeRes.closed, true);

  rec = env.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-STAB-102');
  assert.equal(rec.status, 'resolved');
  assert.equal(rec.approvedBy, rightShiftSupS1.name, 'Must persist authorized approver name');
  assert.ok(rec.approvedAt && !Number.isNaN(Date.parse(rec.approvedAt)), 'Must persist valid ISO approvedAt timestamp');

  const auditLogs = env.sandbox.KSUDataBridge.getAuditLogs();
  const approvalAudit = auditLogs.find(a => a.action === 'CAPA_CLOSURE_APPROVED' && a.details && a.details.capaId === 'CAPA-STAB-102');
  assert.ok(approvalAudit, 'Must write CAPA_CLOSURE_APPROVED entry to audit_logs');
  assert.equal(approvalAudit.details.approvedBy, rightShiftSupS1.name);
  assert.equal(approvalAudit.details.approvedAt, rec.approvedAt);
});

// =============================================================================
// SUITE 2: HOT WORK FIRE-WATCH STRICT TIMING & KSUMC SOP GATE
// =============================================================================
test('STAB-2.1: Hot Work Fire-Watch blocks early checks, blocks missing checks, never auto-fills timestamps, and distinguishes on_time vs late', () => {
  const env = createStabilizationEnv();
  const { KSUOps } = env.sandbox;

  // 1) Permit with NO workEndedAt -> must reject check and NEVER auto-fill workEndedAt
  const pNoEnd = { id: 'HWP-STAB-1', workType: 'أعمال ساخنة - لحام' };
  const rNoEnd = KSUOps.recordPermitFireWatchCheck(pNoEnd, '30m', 'أ. عادل العنزي', Date.parse('2026-11-27T10:30:00Z'));
  assert.equal(rNoEnd.accepted, false, 'Must reject post-work check when workEndedAt is missing');
  assert.equal(pNoEnd.workEndedAt, undefined, 'Must NEVER auto-fill missing workEndedAt');
  assert.equal(pNoEnd.fireWatch30mCheckedAt, undefined);

  // 2) Early check at +10 min -> rejected from satisfying 30m milestone
  const endMs = Date.parse('2026-11-27T10:00:00Z');
  const permit = {
    id: 'HWP-STAB-2',
    workType: 'أعمال ساخنة - قص ولحام',
    workEndedAt: new Date(endMs).toISOString()
  };

  const early30 = KSUOps.recordPermitFireWatchCheck(permit, '30m', 'أ. عادل العنزي', endMs + 10 * 60 * 1000);
  assert.equal(early30.accepted, false, 'Early 30m check at +10m must not satisfy milestone');
  assert.equal(early30.timingStatus, 'early');
  assert.equal(permit.fireWatch30mCheckedAt, undefined, 'Early check must not stamp fireWatch30mCheckedAt');
  assert.equal(Array.isArray(permit.fireWatchChecks), true);
  assert.equal(permit.fireWatchChecks[0].timingStatus, 'early', 'Actual early attempt must be logged with actual timestamp');

  // 3) Skipping 30m and recording 60m at +62 min -> must NOT auto-fill 30m and must NOT complete!
  const skipTo60 = KSUOps.recordPermitFireWatchCheck(permit, '60m', 'أ. عادل العنزي', endMs + 62 * 60 * 1000);
  assert.equal(permit.fireWatch30mCheckedAt, undefined, 'Must NEVER auto-fill missing 30m check when 60m is recorded');
  assert.equal(skipTo60.isComplete, false, 'Watch must NOT complete when 30m check is missing');
  assert.equal(skipTo60.stage, 'incomplete_missing_checks');

  // 4) Valid on-time vs late distinction on a clean permit
  const permit2 = {
    id: 'HWP-STAB-3',
    workType: 'أعمال ساخنة - لحام أنابيب',
    workEndedAt: new Date(endMs).toISOString()
  };
  const onTime30At = endMs + 33 * 60 * 1000; // +33m (within 30..40m on-time window)
  const check30 = KSUOps.recordPermitFireWatchCheck(permit2, '30m', 'أ. عادل العنزي', onTime30At);
  assert.equal(check30.accepted, true);
  assert.equal(check30.timingStatus, 'on_time');
  assert.equal(permit2.fireWatch30mCheckedAt, new Date(onTime30At).toISOString(), 'Must record exact actual check time');
  assert.equal(permit2.fireWatch30mTiming, 'on_time');

  const late60At = endMs + 82 * 60 * 1000; // +82m (22 minutes after 60m target -> late!)
  const check60 = KSUOps.recordPermitFireWatchCheck(permit2, '60m', 'أ. عادل العنزي', late60At);
  assert.equal(check60.accepted, true);
  assert.equal(check60.timingStatus, 'late');
  assert.equal(permit2.fireWatch60mCheckedAt, new Date(late60At).toISOString(), 'Must record exact actual check time');
  assert.equal(permit2.fireWatch60mTiming, 'late');
  assert.equal(permit2.fireWatch60mDelayMinutes, 22);

  // 5) Without verified KSUMC SOP, 30m & 60m MUST NOT claim regulatory compliance completion!
  const evalDefault = KSUOps.evaluatePermitFireWatch(permit2, late60At + 60000);
  assert.equal(evalDefault.complianceBlocked, true, 'Must flag complianceBlocked when KSUMC SOP is unverified');
  assert.equal(evalDefault.complianceStatus, 'blocked_pending_ksumc_sop');
  assert.equal(evalDefault.isComplete, false, 'Must not mark regulatory watch complete without verified KSUMC SOP');
});

// =============================================================================
// SUITE 3: OFFLINE SYNC PERSISTENCE, DROP RECOVERY, DEDUP & SHAREPOINT SEPARATION
// =============================================================================
test('STAB-3.1: Offline round survives app close/reopen, survives mid-send failure without queue loss or fake toast, deduplicates on retry, and separates RSD vs SharePoint status', async () => {
  const inspectorM1 = { id: 'USR-M1', empId: 'M1', username: 'M1', name: 'أ. عادل خلف العنزي', roleCategory: 'field_inspector', shift: '1' };

  // Phase A: Offline creation
  const envOffline = createStabilizationEnv({
    activeUser: inspectorM1,
    online: false,
    rtdbConnected: false,
    fetchImpl: async () => { throw new Error('ERR_INTERNET_DISCONNECTED'); }
  });

  const savedRound = envOffline.sandbox.KSUDataBridge.saveRound({
    id: 'RND-OFFLINE-301',
    formTitle: 'طفايات الحريق',
    checklistType: 'fex',
    facility: 'مستشفى الملك خالد الجامعي (KKUH)',
    building: 'مبنى العيادات',
    floor: 'الدور الأرضي (G)',
    inspector: inspectorM1.name,
    score: 100,
    compliantCount: 8,
    observationCount: 0,
    violationCount: 0
  });

  assert.equal(savedRound._isOfflinePending, true);
  assert.equal(savedRound.rsdSyncStatus, 'pending_sync');
  assert.equal(savedRound.sharepointArchiveStatus, 'pending_archive');

  // Phase B: Simulate closing the browser/PWA and reopening a brand-new runtime from persisted localStorage
  const persistedSnapshot = envOffline.localStorage.snapshot();
  let rtdbFailNext = true;
  let sharePointShouldSucceed = false;
  let sharePointPostCount = 0;

  const envReopened = createStabilizationEnv({
    localInit: persistedSnapshot,
    online: true,
    rtdbConnected: true,
    rtdbWriteImpl: async (refPath, val, op, store) => {
      if (rtdbFailNext && refPath.startsWith('rounds')) {
        throw new Error('CONNECTION_DROPPED_MID_SEND');
      }
      store.set(refPath, JSON.parse(JSON.stringify(val)));
      return true;
    },
    fetchImpl: async (url) => {
      if (String(url).includes('powerautomate')) {
        sharePointPostCount++;
        if (!sharePointShouldSucceed) {
          return { ok: false, status: 503 };
        }
        return { ok: true, status: 202 };
      }
      throw new Error('Unexpected URL: ' + url);
    }
  });

  // Verify pending status survived app restart BEFORE any sync runs
  const statusAfterReopen = envReopened.sandbox.KSUOps.getOfflineQueueStatus();
  assert.ok(statusAfterReopen.pendingRsdCount >= 1, 'Pending RSD sync item must survive app close & reopen');
  assert.ok(statusAfterReopen.pendingSharePointCount >= 1, 'Pending SharePoint archive item must survive app close & reopen');

  // Phase C: Attempt manual flush while RTDB drops mid-send -> MUST NOT clear queue and MUST NOT show success toast!
  const failedFlush = await envReopened.sandbox.KSUOps.flushOfflineQueueNow();
  assert.equal(failedFlush.rsdSynced, false, 'Flush must report rsdSynced=false when RTDB write fails');
  const successToastsOnFail = envReopened.toasts.filter(t => t.type === 'success');
  assert.equal(successToastsOnFail.length, 0, 'Must NEVER show success toast when server save fails');

  const roundAfterFail = envReopened.sandbox.KSUDataBridge.getRounds().find(r => r.id === 'RND-OFFLINE-301');
  assert.equal(roundAfterFail._isOfflinePending, true, 'Record must remain _isOfflinePending=true after mid-send failure');
  assert.equal(roundAfterFail.rsdSyncStatus, 'sync_failed');

  // Phase D: RTDB recovers, but SharePoint is STILL down -> RSD becomes 'synced', SharePoint stays separate ('archive_failed'/'pending_archive')!
  rtdbFailNext = false;
  sharePointShouldSucceed = false;

  // Trigger concurrent/double retry to verify strict deduplication (appears ONCE only!)
  await Promise.all([
    envReopened.sandbox.KSUOps.flushOfflineQueueNow(),
    envReopened.sandbox.KSUOps.flushOfflineQueueNow()
  ]);

  const roundsAfterRsdSync = envReopened.sandbox.KSUDataBridge.getRounds().filter(r => r.id === 'RND-OFFLINE-301');
  assert.equal(roundsAfterRsdSync.length, 1, 'Record must appear EXACTLY ONCE after reconnect and retries');
  assert.equal(roundsAfterRsdSync[0]._isOfflinePending, undefined, '_isOfflinePending must be cleared after RTDB confirmation');
  assert.equal(roundsAfterRsdSync[0].rsdSyncStatus, 'synced', 'RSD save status must be synced');
  assert.notEqual(roundsAfterRsdSync[0].sharepointArchiveStatus, 'archived', 'SharePoint status must remain separate and NOT archived yet');

  // Render banner and verify separate RSD vs SharePoint status visibility
  envReopened.sandbox.KSUOps.renderOfflineSyncBanner();
  const bannerHtml = envReopened.docElements.get('ksu-offline-sync-banner')?.innerHTML || '';
  assert.ok(bannerHtml.includes('SharePoint'), 'Banner must surface pending SharePoint archive status separately');

  // Phase E: SharePoint comes back online -> flushSharePointQueue archives it & updates sharepointArchiveStatus='archived'
  sharePointShouldSucceed = true;
  const spFlush = await envReopened.sandbox.KSUDataBridge.flushSharePointQueue();
  assert.equal(spFlush.flushed, 1);
  assert.equal(spFlush.remaining, 0);

  const finalRounds = envReopened.sandbox.KSUDataBridge.getRounds().filter(r => r.id === 'RND-OFFLINE-301');
  assert.equal(finalRounds.length, 1, 'Still exactly 1 deduplicated round');
  assert.equal(finalRounds[0].rsdSyncStatus, 'synced');
  assert.equal(finalRounds[0].sharepointArchiveStatus, 'archived', 'SharePoint archive status must update to archived once confirmed');
});

// =============================================================================
// SUITE 4: FULL ISOLATED E2E FLOW ON SINGLE BUILDING (SYNTHETIC DATA)
// Offline Round -> Sync -> Supervisor Review -> Verified Audited Closure
// =============================================================================
test('STAB-4.1: Isolated E2E lifecycle on Building E (مبنى العيادات): offline round -> sync -> supervisor review -> verified closure', async () => {
  const inspectorM1 = { id: 'USR-M1', empId: 'M1', username: 'M1', name: 'أ. عادل خلف العنزي', roleCategory: 'field_inspector', shift: '1' };
  const supervisorS1 = { id: 'USR-S1', empId: 'S1', username: 'S1', name: 'أ. مشرف الوردية الأولى', roleCategory: 'shift_supervisor', shift: '1' };
  const sharePointArchivedPayloads = [];

  // Step 1: Inspector M1 performs round offline in Building E (مبنى العيادات) with synthetic data
  const offlineSession = createStabilizationEnv({
    activeUser: inspectorM1,
    online: false,
    rtdbConnected: false,
    fetchImpl: async () => { throw new Error('OFFLINE'); }
  });

  const round = offlineSession.sandbox.KSUDataBridge.saveRound({
    id: 'RND-SYNTH-E-001',
    formTitle: 'مخارج الطوارئ',
    checklistType: 'ext',
    facility: 'مستشفى الملك خالد الجامعي (KKUH)',
    building: 'مبنى العيادات',
    buildingCode: 'E',
    floor: 'الدور الثاني (2)',
    room: 'ممر عيادات الباطنية - مخرج E2-04 (بيانات اختبار وهمية معزولة)',
    inspector: inspectorM1.name,
    shift: '1',
    score: 88,
    compliantCount: 7,
    observationCount: 0,
    violationCount: 1,
    notes: 'عائق كراتين مستلزمات أمام باب مخرج الطوارئ E2-04'
  });

  const capa = offlineSession.sandbox.KSUDataBridge.saveCAPARecord({
    id: 'CAPA-SYNTH-E-001',
    sourceType: 'inspection_round',
    sourceId: round.id,
    title: 'إغلاق جزئي لمخرج الطوارئ E2-04 بكراتين مستلزمات',
    description: 'بيانات وهمية معزولة للاختبار المتكامل على مبنى العيادات',
    facility: 'مستشفى الملك خالد الجامعي (KKUH)',
    building: 'مبنى العيادات',
    floor: 'الدور الثاني (2)',
    severity: 'عالي (High)',
    priority: 'high',
    reportedBy: inspectorM1.name,
    reporterShift: '1',
    status: 'open'
  });

  assert.equal(round.rsdSyncStatus, 'pending_sync');
  assert.equal(capa.rsdSyncStatus, 'pending_sync');

  // Step 2: App closes & reopens with network restored -> Syncs to RSD & SharePoint with zero duplicates
  const syncSession = createStabilizationEnv({
    localInit: offlineSession.localStorage.snapshot(),
    activeUser: inspectorM1,
    online: true,
    rtdbConnected: true,
    aiBridge: {
      async generateContent() {
        return {
          response: {
            text: () => JSON.stringify({
              verified: true,
              confidence: 93,
              safetyStatus: 'تم إخلاء الممر (رأي استشاري)',
              summary: 'الممر خالٍ من الكراتين ومخرج الطوارئ سالك.'
            })
          }
        };
      }
    },
    fetchImpl: async (url, opts) => {
      if (String(url).includes('powerautomate')) {
        sharePointArchivedPayloads.push(JSON.parse(opts.body));
        return { ok: true, status: 202 };
      }
      throw new Error('Unexpected fetch: ' + url);
    }
  });

  const flushRes = await syncSession.sandbox.KSUOps.flushOfflineQueueNow();
  assert.equal(flushRes.rsdSynced, true);
  assert.equal(flushRes.sharePointPending, 0);

  const syncedRounds = syncSession.sandbox.KSUDataBridge.getRounds().filter(r => r.id === 'RND-SYNTH-E-001');
  assert.equal(syncedRounds.length, 1, 'Round must exist once after sync');
  assert.equal(syncedRounds[0].rsdSyncStatus, 'synced');
  assert.equal(syncedRounds[0].sharepointArchiveStatus, 'archived');
  assert.ok(sharePointArchivedPayloads.some(p => p.recordId === 'RND-SYNTH-E-001'), 'SharePoint must receive round archive');
  assert.ok(sharePointArchivedPayloads.some(p => p.recordId === 'CAPA-SYNTH-E-001'), 'SharePoint must receive CAPA archive');

  // Step 3: Inspector attaches after-fix photo -> AI gives advisory result, record stays pending_supervisor_review!
  const inspectorSubmit = await syncSession.sandbox.KSUOps.validateAndCloseCAPA(
    syncSession.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-SYNTH-E-001'),
    {
      notes: 'تم رفع الكراتين وتنظيف مسار الهروب بالكامل',
      afterImage: 'data:image/jpeg;base64,/9j/SYNTHETIC_AFTER_FIX_IMAGE_E204'
    }
  );
  assert.equal(inspectorSubmit.closed, false, 'Even with positive advisory AI, inspector cannot close CAPA');
  let capaAfterInspector = syncSession.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-SYNTH-E-001');
  assert.equal(capaAfterInspector.status, 'pending_supervisor_review');
  assert.equal(capaAfterInspector.aiClosureVerification.advisoryOnly, true);

  // Step 4: Supervisor S1 logs in, reviews round & approves verified CAPA closure
  const supSession = createStabilizationEnv({
    localInit: syncSession.localStorage.snapshot(),
    activeUser: supervisorS1,
    online: true,
    rtdbConnected: true,
    fetchImpl: async (url, opts) => {
      if (String(url).includes('powerautomate')) {
        sharePointArchivedPayloads.push(JSON.parse(opts.body));
        return { ok: true, status: 202 };
      }
      throw new Error('Unexpected fetch: ' + url);
    }
  });

  const supTargetCapa = supSession.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-SYNTH-E-001');
  const supClose = await supSession.sandbox.KSUOps.validateAndCloseCAPA(supTargetCapa, {
    notes: 'تمت المراجعة الميدانية واعتماد الإغلاق الموثق بالصورة لمخرج الطوارئ E2-04',
    afterImage: supTargetCapa.afterImage
  });

  assert.equal(supClose.success, true);
  assert.equal(supClose.closed, true);

  const closedCapa = supSession.sandbox.KSUDataBridge.getCAPARecords().find(c => c.id === 'CAPA-SYNTH-E-001');
  assert.equal(closedCapa.status, 'resolved');
  assert.equal(closedCapa.afterImage, 'data:image/jpeg;base64,/9j/SYNTHETIC_AFTER_FIX_IMAGE_E204');
  assert.equal(closedCapa.approvedBy, supervisorS1.name);
  assert.ok(closedCapa.approvedAt);
  assert.equal(closedCapa.rsdSyncStatus, 'synced');
  assert.equal(closedCapa.sharepointArchiveStatus, 'archived');

  const logs = supSession.sandbox.KSUDataBridge.getAuditLogs();
  const auditEntry = logs.find(l => l.action === 'CAPA_CLOSURE_APPROVED' && l.details.capaId === 'CAPA-SYNTH-E-001');
  assert.ok(auditEntry, 'Supervisor closure must be permanently logged in audit_logs');
  assert.equal(auditEntry.details.approvedBy, supervisorS1.name);
  assert.equal(auditEntry.details.approvedAt, closedCapa.approvedAt);
});

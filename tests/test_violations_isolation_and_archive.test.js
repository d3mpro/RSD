const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const bridgeCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksumc-data-bridge.js'), 'utf-8');
const aiClientCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-ai-client.js'), 'utf-8');
const shareServiceCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-share-service.js'), 'utf-8');
const masterArchiveCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-master-archive.js'), 'utf-8');
const firebaseRealtimeCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-firebase-realtime.js'), 'utf-8');
const appJsCode = fs.readFileSync(path.join(repoRoot, 'assets/js/app.js'), 'utf-8');
const headHtml = fs.readFileSync(path.join(repoRoot, 'head.html'), 'utf-8');
const adminHtml = fs.readFileSync(path.join(repoRoot, 'admin.html'), 'utf-8');
const fieldHtml = fs.readFileSync(path.join(repoRoot, 'field.html'), 'utf-8');
const qualityHtml = fs.readFileSync(path.join(repoRoot, 'quality.html'), 'utf-8');

function extractFunctionSource(fileContent, fnSignature) {
  const startIdx = fileContent.indexOf(fnSignature);
  assert.notEqual(startIdx, -1, `Could not find "${fnSignature}"`);
  let searchFrom = startIdx;
  const openParen = fileContent.indexOf('(', startIdx);
  if (openParen !== -1) {
    let pDepth = 0;
    for (let j = openParen; j < fileContent.length; j++) {
      if (fileContent[j] === '(') pDepth++;
      else if (fileContent[j] === ')') {
        pDepth--;
        if (pDepth === 0) { searchFrom = j + 1; break; }
      }
    }
  }
  const openBrace = fileContent.indexOf('{', searchFrom);
  assert.notEqual(openBrace, -1, `Could not find opening brace for "${fnSignature}"`);

  // Stack modes: { type: 'code', depth: number } | { type: 'template' } | { type: 'expr', depth: number }
  const stack = [{ type: 'code', depth: 1 }];
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inRegex = false;
  let inRegexClass = false;
  let escaped = false;
  let lastSigChar = '{';
  let lastWord = '';

  const isRegexAllowedAfter = (ch, word) => {
    if (!ch || '([{,;:=!&|?+-*%~^<>'.includes(ch)) return true;
    return ['return', 'case', 'throw', 'typeof', 'void', 'delete', 'in', 'of', 'else', 'do'].includes(word);
  };

  for (let i = openBrace + 1; i < fileContent.length; i++) {
    const ch = fileContent[i];
    const next = fileContent[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inRegex) {
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '[' && !inRegexClass) { inRegexClass = true; continue; }
      if (ch === ']' && inRegexClass) { inRegexClass = false; continue; }
      if (ch === '/' && !inRegexClass) {
        inRegex = false;
        lastSigChar = '/';
        lastWord = '';
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') escaped = true;
      else if (ch === "'") { inSingle = false; lastSigChar = "'"; lastWord = ''; }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') escaped = true;
      else if (ch === '"') { inDouble = false; lastSigChar = '"'; lastWord = ''; }
      continue;
    }

    const top = stack[stack.length - 1];
    if (top.type === 'template') {
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '`') {
        stack.pop();
        lastSigChar = '`';
        lastWord = '';
        continue;
      }
      if (ch === '$' && next === '{') {
        stack.push({ type: 'expr', depth: 0 });
        lastSigChar = '{';
        lastWord = '';
        i++;
        continue;
      }
      continue;
    }

    // In 'code' or 'expr' mode
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (ch === '/' && isRegexAllowedAfter(lastSigChar, lastWord)) {
      inRegex = true;
      inRegexClass = false;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { stack.push({ type: 'template' }); continue; }

    if (ch === '{') {
      top.depth++;
    } else if (ch === '}') {
      if (top.type === 'expr' && top.depth === 0) {
        stack.pop();
      } else {
        top.depth--;
        if (top.type === 'code' && top.depth === 0) {
          return fileContent.slice(startIdx, i + 1);
        }
      }
    }

    if (!/\s/.test(ch)) {
      if (/[A-Za-z0-9_$]/.test(ch)) {
        lastWord = /[A-Za-z0-9_$]/.test(lastSigChar) ? (lastWord + ch) : ch;
      } else {
        lastWord = '';
      }
      lastSigChar = ch;
    }
  }
  throw new Error(`Unbalanced braces for "${fnSignature}"`);
}

function createSandbox(initialUser = null, initialStorage = {}) {
  const store = new Map();
  Object.entries(initialStorage).forEach(([k, v]) => {
    store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  });
  if (initialUser) {
    store.set('ksu_active_user', JSON.stringify(initialUser));
  }

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
  };

  const elementsById = new Map();
  const makeClassList = (initialClasses = []) => {
    const set = new Set(initialClasses);
    return {
      add: (...cls) => cls.forEach(c => set.add(c)),
      remove: (...cls) => cls.forEach(c => set.delete(c)),
      toggle: (c, force) => {
        if (force === true) { set.add(c); return true; }
        if (force === false) { set.delete(c); return false; }
        if (set.has(c)) { set.delete(c); return false; }
        set.add(c); return true;
      },
      contains: (c) => set.has(c),
      toArray: () => Array.from(set)
    };
  };

  const makeEl = (tag = 'div', id = '', initialClasses = []) => {
    const attrs = {};
    const el = {
      tagName: String(tag).toUpperCase(),
      id,
      innerHTML: '',
      textContent: '',
      value: '',
      readOnly: false,
      style: {},
      children: [],
      classList: makeClassList(initialClasses),
      set className(v) {
        this.classList = makeClassList(String(v || '').split(/\s+/).filter(Boolean));
      },
      get className() {
        return this.classList.toArray().join(' ');
      },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute: (k) => { delete attrs[k]; },
      appendChild(child) {
        this.children.push(child);
        if (child && child.id) elementsById.set(child.id, child);
        return child;
      },
      prepend(child) {
        this.children.unshift(child);
        if (child && child.id) elementsById.set(child.id, child);
        return child;
      },
      querySelector: (sel) => {
        if (sel && sel.startsWith('#')) return elementsById.get(sel.slice(1)) || null;
        return makeEl('div');
      },
      querySelectorAll: () => [],
      addEventListener: () => {},
      scrollIntoView: () => {},
      focus: () => {},
      select: () => {}
    };
    if (id) elementsById.set(id, el);
    return el;
  };

  const listeners = new Map();
  const toasts = [];
  const alerts = [];
  let promptReply = 'مؤرشف للمراجعة الرقابية';

  const document = {
    readyState: 'complete',
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (sel) => {
      if (sel && sel.startsWith('#')) {
        const cleanId = sel.slice(1).split(/[\s>]/)[0];
        return elementsById.get(cleanId) || makeEl('div');
      }
      return makeEl('div');
    },
    querySelectorAll: (sel) => {
      if (sel === '.tab-pane') {
        return Array.from(elementsById.values()).filter(e => e.id && e.id.startsWith('tab-'));
      }
      if (sel === '[data-path]') {
        return Array.from(elementsById.values()).filter(e => e.getAttribute('data-path'));
      }
      return [];
    },
    addEventListener: () => {},
    execCommand: () => true
  };

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    URL,
    Buffer,
    encodeURIComponent,
    decodeURIComponent,
    CustomEvent: function(name, opts) { this.type = name; this.detail = opts && opts.detail; },
    setTimeout: (fn) => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    localStorage,
    sessionStorage: localStorage,
    document,
    navigator: { userAgent: 'NodeSecurityTest', onLine: true, clipboard: { writeText: async () => {} } },
    location: { hostname: 'rsd.ksumc.local', protocol: 'https:', href: 'https://rsd.ksumc.local/admin.html', hash: '' },
    history: { replaceState: () => {} },
    dispatchEvent: (ev) => {
      const fns = listeners.get(ev && ev.type) || [];
      fns.forEach(fn => { try { fn(ev); } catch (_) {} });
    },
    addEventListener: (evName, fn) => {
      if (!listeners.has(evName)) listeners.set(evName, []);
      listeners.get(evName).push(fn);
    },
    confirm: () => true,
    alert: (msg) => { alerts.push(String(msg)); },
    prompt: () => promptReply,
    print: () => {},
    scrollTo: () => {},
    open: () => null,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }),
    showToast: (msg, type) => { toasts.push({ msg: String(msg), type }); },
    KSUAuth: {
      getUser: () => {
        try { return JSON.parse(localStorage.getItem('ksu_active_user') || 'null'); } catch (_) { return null; }
      },
      getRoleCategory: (u) => {
        if (!u || typeof u !== 'object') return 'field_inspector';
        const c = String(u.roleCategory || '').trim().toLowerCase();
        return c || 'field_inspector';
      }
    },
    _makeEl: makeEl,
    _elementsById: elementsById,
    _toasts: toasts,
    _alerts: alerts,
    _setPromptReply: (v) => { promptReply = v; }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  return vm.createContext(sandbox);
}

const USERS = {
  inspectorA: {
    id: 'USR-10',
    empId: '41001',
    username: 'm1',
    authUid: 'uid-inspector-1',
    name: 'م. خالد فهد السبيعي',
    role: 'مفتش سلامة ميداني',
    roleCategory: 'field_inspector',
    shift: 'الوردية 1 (صباحي)'
  },
  inspectorB: {
    id: 'USR-11',
    empId: '41002',
    username: 'm2',
    authUid: 'uid-inspector-2',
    name: 'م. سعد محمد القحطاني',
    role: 'مفتش سلامة ميداني',
    roleCategory: 'field_inspector',
    shift: 'الوردية 1 (صباحي)'
  },
  shiftSup1: {
    id: 'USR-05',
    empId: 'S1',
    username: 's1',
    authUid: 'uid-sup-1',
    name: 'أ. عبدالرحمن محمد الأحمري',
    role: 'مشرف السلامة الميدانية - الوردية 1',
    roleCategory: 'shift_supervisor',
    shift: 'الوردية 1 (صباحي)'
  },
  quality: {
    id: 'USR-03',
    empId: 'Q1',
    username: 'q1',
    authUid: 'uid-quality-1',
    name: 'د. نوره عبدالله العتيبي',
    role: 'أخصائي الجودة وتقييم الأداء',
    roleCategory: 'quality',
    shift: 'الوردية 1 (صباحي)'
  },
  head: {
    id: 'USR-02',
    empId: 'H1',
    username: 'h1',
    authUid: 'uid-head-1',
    name: 'أ. مصعب عبدالله آل حماد',
    role: 'رئيس قسم السلامة بالمدينة الطبية',
    roleCategory: 'head',
    shift: 'الكل',
    permissions: { headOfDepartment: true }
  },
  admin: {
    id: 'USR-01',
    empId: '95972',
    username: 'dev',
    authUid: 'uid-admin-1',
    name: 'أ. علي سليمان الصقري',
    role: 'مسؤول ومطور النظام',
    roleCategory: 'developer',
    shift: 'الكل',
    permissions: { manageUsers: true }
  }
};

function sampleViolations() {
  return {
    safety: [
      {
        id: 'SV-OWN-A1',
        date: '2026-11-14',
        time: '09:10',
        location: 'برج الجراحة - الدور 3',
        room: '305',
        devices: ['غلاية'],
        actionTaken: 'مصادرة الجهاز المخالف',
        violatorName: 'مخالف أ',
        violatorEmpId: '88001',
        officerName: USERS.inspectorA.name,
        officerEmpId: USERS.inspectorA.empId,
        createdByUid: USERS.inspectorA.authUid,
        createdById: USERS.inspectorA.id,
        createdByEmpId: USERS.inspectorA.empId,
        createdByUsername: USERS.inspectorA.username,
        createdByName: USERS.inspectorA.name,
        shift: 'الوردية 1 (صباحي)',
        status: 'قيد المتابعة',
        archived: false,
        isArchived: false
      },
      {
        id: 'SV-OWN-B1',
        date: '2026-11-14',
        time: '10:20',
        location: 'برج الباطنة - الدور 2',
        room: '208',
        devices: ['توصيلة كهربائية'],
        actionTaken: 'سحب الجهاز المخالف',
        violatorName: 'مخالف ب <script>alert(1)</script>',
        violatorEmpId: '88002',
        officerName: USERS.inspectorB.name,
        officerEmpId: USERS.inspectorB.empId,
        createdByUid: USERS.inspectorB.authUid,
        createdById: USERS.inspectorB.id,
        createdByEmpId: USERS.inspectorB.empId,
        createdByUsername: USERS.inspectorB.username,
        createdByName: USERS.inspectorB.name,
        shift: 'الوردية 2 (مسائي)',
        status: 'قيد المتابعة',
        archived: false,
        isArchived: false
      },
      {
        id: 'SV-ARCH-A1',
        date: '2026-11-13',
        time: '08:00',
        location: 'مبنى العيادات',
        room: '101',
        devices: ['سخان'],
        actionTaken: 'مصادرة الجهاز المخالف',
        violatorName: 'مخالف مؤرشف',
        violatorEmpId: '88003',
        officerName: USERS.inspectorA.name,
        officerEmpId: USERS.inspectorA.empId,
        createdByUid: USERS.inspectorA.authUid,
        createdById: USERS.inspectorA.id,
        createdByEmpId: USERS.inspectorA.empId,
        createdByUsername: USERS.inspectorA.username,
        createdByName: USERS.inspectorA.name,
        shift: 'الوردية 1 (صباحي)',
        status: 'archived',
        preArchiveStatus: 'قيد المتابعة',
        archived: true,
        isArchived: true,
        archivedAt: '2026-11-14T11:00:00.000Z',
        archivedByName: USERS.head.name,
        archiveReason: 'أرشفة مرجعية بعد المعالجة'
      },
      {
        id: 'SV-DEL-LEGACY',
        date: '2026-11-12',
        location: 'المختبرات',
        devices: ['فرن'],
        createdByUid: USERS.inspectorA.authUid,
        status: 'deleted'
      }
    ],
    smoking: [
      {
        id: 'SMK-OWN-A1',
        date: '2026-11-14',
        time: '11:00',
        location: 'بوابة الطوارئ',
        role: 'موظف',
        violatorName: 'مدخن أ',
        nationalId: '1012345678',
        officerName: USERS.inspectorA.name,
        officerEmpId: USERS.inspectorA.empId,
        createdByUid: USERS.inspectorA.authUid,
        createdById: USERS.inspectorA.id,
        createdByEmpId: USERS.inspectorA.empId,
        createdByUsername: USERS.inspectorA.username,
        createdByName: USERS.inspectorA.name,
        shift: 'الوردية 1 (صباحي)',
        status: 'تم الضبط',
        archived: false,
        isArchived: false
      },
      {
        id: 'SMK-OWN-B1',
        date: '2026-11-14',
        time: '19:30',
        location: 'مواقف كبار الشخصيات',
        role: 'زائر',
        violatorName: 'مدخن ب',
        nationalId: '1098765432',
        officerName: USERS.inspectorB.name,
        officerEmpId: USERS.inspectorB.empId,
        createdByUid: USERS.inspectorB.authUid,
        createdById: USERS.inspectorB.id,
        createdByEmpId: USERS.inspectorB.empId,
        createdByUsername: USERS.inspectorB.username,
        createdByName: USERS.inspectorB.name,
        shift: 'الوردية 2 (مسائي)',
        status: 'تم الضبط',
        archived: false,
        isArchived: false
      },
      {
        id: 'SMK-ARCH-B1',
        date: '2026-11-13',
        time: '20:15',
        location: 'ساحة العيادات',
        role: 'عامل',
        violatorName: 'مدخن مؤرشف',
        nationalId: '2012345678',
        officerName: USERS.inspectorB.name,
        officerEmpId: USERS.inspectorB.empId,
        createdByUid: USERS.inspectorB.authUid,
        createdById: USERS.inspectorB.id,
        createdByEmpId: USERS.inspectorB.empId,
        createdByUsername: USERS.inspectorB.username,
        createdByName: USERS.inspectorB.name,
        shift: 'الوردية 2 (مسائي)',
        status: 'archived',
        preArchiveStatus: 'تم الضبط',
        archived: true,
        isArchived: true,
        archivedAt: '2026-11-14T12:00:00.000Z',
        archivedByName: USERS.admin.name,
        archiveReason: 'حفظ في الأرشيف المرجعي'
      }
    ]
  };
}

// =========================================================================
// Suite 1: Data Bridge Isolation, Soft-Archive & Audit Logs
// =========================================================================
test('Suite 1: KSUDataBridge isolates violations per role, enforces head/admin-only soft archive/restore, and logs audit events', () => {
  const sample = sampleViolations();
  const ctx = createSandbox(USERS.inspectorA, {
    ksumc_safety_violations: sample.safety,
    ksumc_smoking_violations: sample.smoking
  });
  vm.runInContext(bridgeCode, ctx);

  // 1. Field inspector sees ONLY own non-archived records
  const resInspA = ctx.KSUDataBridge.getViolations({ user: USERS.inspectorA });
  assert.deepEqual(resInspA.safety.map(x => x.id), ['SV-OWN-A1']);
  assert.deepEqual(resInspA.smoking.map(x => x.id), ['SMK-OWN-A1']);

  // Generic officerName alone must NOT match a different inspector's record
  const forgedGeneric = {
    id: 'SV-GENERIC',
    createdByEmpId: '99999',
    officerName: 'مفتش السلامة الميداني',
    status: 'قيد المتابعة'
  };
  assert.equal(ctx.KSUViolationPolicy.isViolationOwner(forgedGeneric, USERS.inspectorA), false);

  // 2. Shift supervisor 1 sees shift 1 active records, NOT shift 2 or archived
  const resSup1 = ctx.KSUDataBridge.getViolations({ user: USERS.shiftSup1 });
  assert.deepEqual(resSup1.safety.map(x => x.id), ['SV-OWN-A1']);
  assert.deepEqual(resSup1.smoking.map(x => x.id), ['SMK-OWN-A1']);

  // 3. Quality sees all active non-archived violations, never archived or deleted
  const resQual = ctx.KSUDataBridge.getViolations({ user: USERS.quality });
  assert.deepEqual(resQual.safety.map(x => x.id), ['SV-OWN-A1', 'SV-OWN-B1']);
  assert.deepEqual(resQual.smoking.map(x => x.id), ['SMK-OWN-A1', 'SMK-OWN-B1']);

  // 4. Head & Admin see active by default and active+archived with includeArchived: true
  const resHeadDefault = ctx.KSUDataBridge.getViolations({ user: USERS.head });
  assert.deepEqual(resHeadDefault.safety.map(x => x.id), ['SV-OWN-A1', 'SV-OWN-B1']);
  const resHeadArchive = ctx.KSUDataBridge.getViolations({ user: USERS.head, includeArchived: true });
  assert.deepEqual(resHeadArchive.safety.map(x => x.id), ['SV-OWN-A1', 'SV-OWN-B1', 'SV-ARCH-A1']);
  assert.deepEqual(resHeadArchive.smoking.map(x => x.id), ['SMK-OWN-A1', 'SMK-OWN-B1', 'SMK-ARCH-B1']);

  // 5. Soft archive/restore denied for inspector, shift_supervisor, quality
  for (const unpriv of [USERS.inspectorA, USERS.shiftSup1, USERS.quality]) {
    const denyArch = ctx.KSUDataBridge.archiveViolationRecord('safety', 'SV-OWN-A1', 'محاولة غير مصرحة', unpriv);
    assert.equal(denyArch.ok, false);
    assert.equal(denyArch.reason, 'unauthorized');

    const denyRest = ctx.KSUDataBridge.restoreViolationRecord('safety', 'SV-ARCH-A1', unpriv);
    assert.equal(denyRest.ok, false);
    assert.equal(denyRest.reason, 'unauthorized');
  }

  // 6. Head archives SV-OWN-A1 and Admin restores it cleanly preserving preArchiveStatus
  const archRes = ctx.KSUDataBridge.archiveViolationRecord('safety', 'SV-OWN-A1', 'توثيق وأرشفة', USERS.head);
  assert.equal(archRes.ok, true);
  assert.equal(archRes.record.archived, true);
  assert.equal(archRes.record.preArchiveStatus, 'قيد المتابعة');

  const afterArchInsp = ctx.KSUDataBridge.getViolations({ user: USERS.inspectorA });
  assert.equal(afterArchInsp.safety.length, 0, 'Archived violation must leave active list');

  const restRes = ctx.KSUDataBridge.restoreViolationRecord('safety', 'SV-OWN-A1', USERS.admin);
  assert.equal(restRes.ok, true);
  assert.equal(restRes.record.archived, false);
  assert.equal(restRes.record.status, 'قيد المتابعة');

  const logs = ctx.KSUDataBridge.getAuditLogs();
  assert.equal(logs.some(l => l.action === 'UNAUTHORIZED_ARCHIVE_ATTEMPT'), true);
  assert.equal(logs.some(l => l.action === 'ARCHIVE_VIOLATION'), true);
  assert.equal(logs.some(l => l.action === 'RESTORE_VIOLATION'), true);
});

// =========================================================================
// Suite 2: Share Service IDOR Blocking & No Mock Fallback
// =========================================================================
test('Suite 2: KSUShareService blocks cross-inspector violation lookup and never fabricates mock violations', () => {
  const sample = sampleViolations();
  const ctx = createSandbox(USERS.inspectorA, {
    ksumc_safety_violations: sample.safety,
    ksumc_smoking_violations: sample.smoking
  });
  vm.runInContext(bridgeCode, ctx);
  vm.runInContext(shareServiceCode, ctx);

  // Inspector A cannot fetch Inspector B's violation by ID or by object
  assert.equal(ctx.KSUShareService.fetchRecord('safety_violation', 'SV-OWN-B1'), null);
  assert.equal(ctx.KSUShareService.fetchRecord('smoking_violation', 'SMK-OWN-B1'), null);
  assert.equal(ctx.KSUShareService.fetchRecord('safety_violation', sample.safety[1]), null);

  // Inspector A cannot fetch non-existent violation (no mock fallback fabricated)
  assert.equal(ctx.KSUShareService.fetchRecord('safety_violation', 'SV-DOES-NOT-EXIST'), null);
  assert.equal(ctx.KSUShareService.fetchRecord('smoking_violation', 'SMK-DOES-NOT-EXIST'), null);

  // Inspector A cannot fetch own archived violation; CAN fetch own active violation
  assert.equal(ctx.KSUShareService.fetchRecord('safety_violation', 'SV-ARCH-A1'), null);
  const ownActive = ctx.KSUShareService.fetchRecord('safety_violation', 'SV-OWN-A1');
  assert.ok(ownActive);
  assert.equal(ownActive.id, 'SV-OWN-A1');

  // Head CAN fetch archived violations
  ctx.localStorage.setItem('ksu_active_user', JSON.stringify(USERS.head));
  const headArch = ctx.KSUShareService.fetchRecord('safety_violation', 'SV-ARCH-A1');
  assert.ok(headArch);
  assert.equal(headArch.id, 'SV-ARCH-A1');
});

// =========================================================================
// Suite 3: AI Client Ownership Stamping & Field HTML Officer Lock
// =========================================================================
test('Suite 3: ksu-ai-client stamps active user ownership without hardcoded officer ID, and field.html locks officer fields', async () => {
  const ctx = createSandbox(USERS.inspectorB);
  vm.runInContext(bridgeCode, ctx);
  vm.runInContext(aiClientCode, ctx);

  ctx.window.lastVisionAnalysisImage = 'data:image/jpeg;base64,AAAA';
  ctx.window.lastVisionAnalysisImages = ['data:image/jpeg;base64,AAAA'];
  ctx.window.lastVisionLocation = { building: 'مبنى العيادات', floor: 'الأول', room: '12' };
  ctx.window.lastVisionAnalysisData = {
    status: 'غير مطابق',
    detected_element: 'غلاية كهربائية غير مصرحة',
    detected_devices: ['غلاية']
  };

  await ctx.window.approveAndUploadVisualViolation();
  const saved = JSON.parse(ctx.localStorage.getItem('ksumc_safety_violations') || '[]');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].officerName, USERS.inspectorB.name);
  assert.equal(saved[0].officerEmpId, USERS.inspectorB.empId);
  assert.equal(saved[0].createdByUid, USERS.inspectorB.authUid);
  assert.equal(saved[0].createdByEmpId, USERS.inspectorB.empId);
  assert.equal(saved[0].archived, false);
  assert.notEqual(saved[0].officerEmpId, '10842');

  // Check field.html has no hardcoded fallback names in officer input values
  assert.match(fieldHtml, /<input id="inp-sv-officer-name"[^>]*value=""/);
  assert.match(fieldHtml, /<input id="inp-smk-officer-name"[^>]*value=""/);

  // Test syncHandoverGiverFields extracted from field.html
  const syncFnSrc = extractFunctionSource(fieldHtml, 'function syncHandoverGiverFields(u)');
  const fCtx = createSandbox(USERS.inspectorA);
  vm.runInContext(bridgeCode, fCtx);
  const svInp = fCtx._makeEl('input', 'inp-sv-officer-name');
  const smkInp = fCtx._makeEl('input', 'inp-smk-officer-name');
  fCtx._makeEl('input', 'inp-handover-giver');
  fCtx._makeEl('input', 'inp-handover-shift');
  fCtx._makeEl('input', 'inp-shift-inc-reporter');
  fCtx._makeEl('input', 'inp-handover-nextsup');
  vm.runInContext(syncFnSrc, fCtx);

  fCtx.syncHandoverGiverFields(USERS.inspectorA);
  assert.equal(svInp.value, USERS.inspectorA.name);
  assert.equal(smkInp.value, USERS.inspectorA.name);
  assert.equal(svInp.readOnly, true, 'Inspector must not edit officer name');
  assert.equal(smkInp.readOnly, true);

  fCtx.syncHandoverGiverFields(USERS.head);
  assert.equal(svInp.readOnly, false, 'Head can adjust officer name if needed');
  assert.equal(smkInp.readOnly, false);
});

// =========================================================================
// Suite 4: app.js Permanent-Delete Block, UI Scoping, Print IDOR & RBAC
// =========================================================================
function buildAppViolationSandbox(initialUser, extraStorage = {}) {
  const sample = sampleViolations();
  const ctx = createSandbox(initialUser, {
    ksumc_safety_violations: sample.safety,
    ksumc_smoking_violations: sample.smoking,
    ksumc_safety_dept_reports: [],
    ksumc_safety_alarms: [],
    ksumc_shift_incidents: [],
    ...extraStorage
  });
  vm.runInContext(bridgeCode, ctx);

  ctx.STORAGE_KEY_SAFETY_VIOLATIONS = 'ksumc_safety_violations';
  ctx.STORAGE_KEY_SMOKING_VIOLATIONS = 'ksumc_smoking_violations';
  ctx.STORAGE_KEY_SAFETY_DEPT_REPORTS = 'ksumc_safety_dept_reports';
  ctx.STORAGE_KEY_ALARMS = 'ksumc_safety_alarms';
  ctx.STORAGE_KEY_SHIFT_INCIDENTS = 'ksumc_shift_incidents';
  ctx.state = {
    currentUser: initialUser,
    activePortal: 'field',
    activeTab: 'safety-violations',
    safetyViolations: JSON.parse(JSON.stringify(sample.safety)),
    smokingViolations: JSON.parse(JSON.stringify(sample.smoking)),
    safetyDeptReports: [],
    alarms: [],
    shiftIncidents: [],
    safetyViolsTimeFilter: 'all',
    smokingViolsTimeFilter: 'all'
  };
  ctx.activeHeadStream = 'all';
  ctx.notifyCloudSync = () => {};
  ctx.isDateInPeriod = () => true;
  ctx.openLoginModal = () => { ctx._loginOpened = (ctx._loginOpened || 0) + 1; };
  ctx.updateActivePortalUI = () => {};
  ctx.renderSafetyViolations = () => {};
  ctx.renderSmokingViolations = () => {};
  ctx.updateViolationBadges = () => {};
  ctx.renderHeadOperationalCenter = () => {};
  ctx.generateQRCodeSVG = () => '<svg></svg>';
  ctx.getSignatureData = () => '';
  ctx.initModalSignaturePads = () => {};
  ctx.closeNewSafetyViolationModal = () => {};
  ctx.closeNewSmokingViolationModal = () => {};
  ctx.getCurrentActiveShiftKey = () => 'shift1';
  ctx.getShiftLabel = (k) => k === 'shift1' ? 'الوردية 1 (صباحي)' : k;
  ctx.printHtmlContent = (html, title) => {
    ctx._lastPrinted = { html, title };
  };

  // DOM elements used by violations lists & badges & switchTab
  ctx._makeEl('div', 'safety-violations-list-container');
  ctx._makeEl('div', 'smoking-violations-list-container');
  ctx._makeEl('span', 'sidebar-safety-violations-count');
  ctx._makeEl('span', 'sidebar-smoking-violations-count');
  ctx._makeEl('span', 'sv-filter-count-badge');
  ctx._makeEl('span', 'smk-filter-count-badge');
  ctx._makeEl('span', 'kpi-safety-viols-total');
  ctx._makeEl('span', 'kpi-safety-viols-confiscated');
  ctx._makeEl('span', 'kpi-safety-viols-corrected');
  ctx._makeEl('span', 'kpi-safety-viols-referred');
  ctx._makeEl('span', 'kpi-smoking-viols-total');
  ctx._makeEl('span', 'kpi-smoking-viols-employees');
  ctx._makeEl('span', 'kpi-smoking-viols-students');
  ctx._makeEl('span', 'kpi-smoking-viols-workers');
  ctx._makeEl('span', 'kpi-smoking-viols-others');
  ctx._makeEl('input', 'inp-sv-officer-name');
  ctx._makeEl('input', 'inp-smk-officer-name');
  ctx._makeEl('div', 'tab-master-archive');
  ctx._makeEl('div', 'tab-safety-violations');
  ctx._makeEl('div', 'h1-operational-inbox-container');

  const fns = [
    'function _getViolationActiveUser()',
    'function _escapeViolationHtml(val)',
    'function _escapeViolationJs(val)',
    'function _isViolationArchivedFallback(v)',
    'function _isHeadOrAdminViolationUser(user)',
    'function _getScopedSafetyViolations(options = {})',
    'function _getScopedSmokingViolations(options = {})',
    'function saveSafetyViolations(targetViol)',
    'function saveSmokingViolations(targetViol)',
    'function updateViolationBadges()',
    'function isSystemDeveloper(user)',
    'function detectUserPortal(user)',
    'function getUserRoleCategory(user)',
    'function getAllowedTabsForUser(user, portalKey)',
    'function getDefaultTabForUser(user, portalKey)',
    'function switchTab(tabId)',
    'function renderSafetyViolations()',
    'function filterSafetyViolationsList()',
    'function saveNewSafetyViolation()',
    'function deleteSafetyViolation(id)',
    'function renderSmokingViolations()',
    'function filterSmokingViolationsList()',
    'function saveNewSmokingViolation()',
    'function deleteSmokingViolation(id)',
    'function printSafetyViolation(id)',
    'function printSmokingViolation(id)',
    'function renderHeadOperationalCenter()',
    'function archiveViolationFromUI(type, id, optionalReason)',
    'function restoreViolationFromUI(type, id)'
  ];

  const bundle = fns.map(sig => extractFunctionSource(appJsCode, sig)).join('\n\n');
  vm.runInContext(bundle, ctx);
  return ctx;
}

test('Suite 4: app.js blocks permanent delete for all roles, scopes UI cards & badges, escapes XSS, blocks IDOR print, and gates master-archive tab', () => {
  // Verify SAFE_EXPORTS attachment loop is intact at bottom of app.js
  assert.match(appJsCode, /const\s+SAFE_EXPORTS\s*=\s*\{[\s\S]*\};\s*Object\.entries\(SAFE_EXPORTS\)\.forEach/);

  // 4A. Field Inspector view & isolation
  const inspCtx = buildAppViolationSandbox(USERS.inspectorA);
  inspCtx.renderSafetyViolations();
  inspCtx.renderSmokingViolations();
  inspCtx.updateViolationBadges();

  const svHtml = inspCtx.document.getElementById('safety-violations-list-container').innerHTML;
  const smkHtml = inspCtx.document.getElementById('smoking-violations-list-container').innerHTML;

  assert.equal(svHtml.includes('SV-OWN-A1'), true);
  assert.equal(svHtml.includes('SV-OWN-B1'), false, 'Must NOT show other inspector safety violation');
  assert.equal(svHtml.includes('SV-ARCH-A1'), false, 'Inspector must NOT see archived violation');
  assert.equal(svHtml.includes('deleteSafetyViolation'), false, 'Permanent delete button must be absent');
  assert.equal(svHtml.includes('archiveViolationFromUI'), false, 'Inspector must NOT see archive button');

  assert.equal(smkHtml.includes('SMK-OWN-A1'), true);
  assert.equal(smkHtml.includes('SMK-OWN-B1'), false, 'Must NOT show other inspector smoking violation');
  assert.equal(smkHtml.includes('deleteSmokingViolation'), false, 'Permanent delete button must be absent');
  assert.equal(smkHtml.includes('archiveViolationFromUI'), false);

  assert.equal(inspCtx.document.getElementById('sidebar-safety-violations-count').textContent, 1);
  assert.equal(inspCtx.document.getElementById('sidebar-smoking-violations-count').textContent, 1);

  // Print IDOR blocked for cross-inspector & archived record
  assert.equal(inspCtx.printSafetyViolation('SV-OWN-B1'), false);
  assert.equal(inspCtx._lastPrinted, undefined);
  assert.equal(inspCtx.printSmokingViolation('SMK-OWN-B1'), false);
  assert.equal(inspCtx.printSafetyViolation('SV-ARCH-A1'), false);

  const inspLogs = inspCtx.KSUDataBridge.getAuditLogs();
  assert.equal(inspLogs.filter(l => l.action === 'UNAUTHORIZED_VIOLATION_PRINT_ATTEMPT').length, 3);

  // Spoofed officer input is ignored on inspector save
  inspCtx._makeEl('input', 'inp-sv-officer-name').value = 'منتحل صفة الرئيس';
  inspCtx._makeEl('input', 'inp-sv-location').value = 'مبنى التدريب';
  const createdSv = inspCtx.saveNewSafetyViolation();
  assert.equal(createdSv.officerName, USERS.inspectorA.name);
  assert.equal(createdSv.createdByUid, USERS.inspectorA.authUid);

  // Non-privileged roles cannot switch to master-archive tab
  inspCtx.state.activeTab = 'safety-violations';
  inspCtx.switchTab('master-archive');
  assert.equal(inspCtx.state.activeTab, 'safety-violations');

  // 4B. Head & Admin: permanent delete STILL disabled; XSS escaped; print allowed; switchTab('master-archive') allowed even from field portal
  const headCtx = buildAppViolationSandbox(USERS.head);
  const beforeLen = headCtx.state.safetyViolations.length;
  assert.equal(headCtx.deleteSafetyViolation('SV-OWN-A1'), false);
  assert.equal(headCtx.state.safetyViolations.length, beforeLen, 'Permanent delete must remain blocked even for head');
  assert.equal(headCtx.deleteSmokingViolation('SMK-OWN-A1'), false);

  headCtx.state.currentUser = USERS.admin;
  headCtx.localStorage.setItem('ksu_active_user', JSON.stringify(USERS.admin));
  assert.equal(headCtx.deleteSafetyViolation('SV-OWN-A1'), false);
  assert.equal(headCtx.state.safetyViolations.length, beforeLen, 'Permanent delete must remain blocked even for developer/admin');

  headCtx.renderSafetyViolations();
  const adminSvHtml = headCtx.document.getElementById('safety-violations-list-container').innerHTML;
  assert.equal(adminSvHtml.includes('<script>alert(1)</script>'), false, 'XSS payload must be escaped in card HTML');
  assert.equal(adminSvHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
  assert.equal(adminSvHtml.includes('archiveViolationFromUI'), true, 'Head/Admin sees archive button');
  assert.equal(adminSvHtml.includes('deleteSafetyViolation'), false, 'Permanent delete button must never render');

  // Archived violation excluded from operational inbox
  headCtx.renderHeadOperationalCenter();
  const h1Inbox = headCtx.document.getElementById('h1-operational-inbox-container').innerHTML;
  assert.equal(h1Inbox.includes('SV-ARCH-A1'), false, 'Archived violations excluded from pending operational inbox');

  // Head navigates to master-archive even with stale field activePortal
  let masterArchiveRendered = 0;
  headCtx.window.KSUMasterArchive = { render: () => { masterArchiveRendered++; } };
  headCtx.state.currentUser = USERS.head;
  headCtx.localStorage.setItem('ksu_active_user', JSON.stringify(USERS.head));
  headCtx.state.activePortal = 'field';
  headCtx.switchTab('master-archive');
  assert.equal(headCtx.state.activePortal, 'admin');
  assert.equal(headCtx.state.activeTab, 'master-archive');
  assert.equal(masterArchiveRendered, 1);

  // Shift supervisor & quality blocked from master-archive
  for (const deniedUser of [USERS.shiftSup1, USERS.quality]) {
    headCtx.state.currentUser = deniedUser;
    headCtx.localStorage.setItem('ksu_active_user', JSON.stringify(deniedUser));
    headCtx.state.activeTab = 'compliance-reports-logs';
    headCtx.switchTab('master-archive');
    assert.equal(headCtx.state.activeTab, 'compliance-reports-logs', `${deniedUser.roleCategory} must be blocked from master-archive`);
  }
});

// =========================================================================
// Suite 5: head.html Automatic Master Archive & RBAC
// =========================================================================
test('Suite 5: head.html automatically renders active + archived records for head/admin, supports soft archive/restore, and blocks unprivileged users', () => {
  const sample = sampleViolations();
  const ctx = createSandbox(USERS.head, {
    ksumc_safety_violations: sample.safety,
    ksumc_smoking_violations: sample.smoking,
    ksumc_safety_rounds: [],
    ksumc_quality_shift_inspection_logs: [],
    ksumc_safety_dept_reports: [],
    ksumc_shift_incidents: [],
    ksumc_safety_alarms: [],
    ksumc_permits: [],
    ksumc_doors: []
  });
  vm.runInContext(bridgeCode, ctx);

  ctx._makeEl('section', 'head-overview-auto-archive-card');
  ctx._makeEl('span', 'head-overview-archive-badge');
  ctx._makeEl('span', 'head-overview-active-viols-chip');
  ctx._makeEl('span', 'head-overview-archived-viols-chip');
  ctx._makeEl('div', 'head-overview-auto-archive-list');
  ctx._makeEl('tbody', 'head-master-archive-tbody');
  ctx._makeEl('span', 'arch-count-all');
  ctx._makeEl('span', 'arch-count-rounds');
  ctx._makeEl('span', 'arch-count-reports');
  ctx._makeEl('span', 'arch-count-violations');
  ctx._makeEl('span', 'arch-count-permits');
  ctx._makeEl('span', 'arch-total-badge');
  ctx._makeEl('select', 'arch-archive-status-filter').value = 'all';

  const headHelpersSrc = `
    let currentArchiveTab = 'all';
    let currentArchiveStatusFilter = 'all';
    let currentFacility = 'all';
    function getFilteredRealRounds() { return []; }
    function updateDashboardData() {
      renderHeadOverviewAutoArchive();
      renderHeadMasterArchive();
    }
    ${extractFunctionSource(headHtml, 'function _escHead(val)')}
    ${extractFunctionSource(headHtml, 'function _escHeadJs(val)')}
    ${extractFunctionSource(headHtml, 'function _isHeadArchivedRecord(v)')}
    ${extractFunctionSource(headHtml, 'function _isHeadDeletedRecord(v)')}
    ${extractFunctionSource(headHtml, 'function _getHeadActiveUser()')}
    ${extractFunctionSource(headHtml, 'function _isHeadPrivilegedArchiveUser()')}
    ${extractFunctionSource(headHtml, 'function _mergeRecordsById(primary, secondary)')}
    ${extractFunctionSource(headHtml, 'function getUnifiedArchiveRecords()')}
    ${extractFunctionSource(headHtml, 'function switchArchiveStatusFilter(status)')}
    ${extractFunctionSource(headHtml, 'function renderHeadOverviewAutoArchive()')}
    ${extractFunctionSource(headHtml, 'function archiveHeadViolationRecord(type, id)')}
    ${extractFunctionSource(headHtml, 'function restoreHeadViolationRecord(type, id)')}
    ${extractFunctionSource(headHtml, 'function getFilteredArchiveRecords()')}
    ${extractFunctionSource(headHtml, 'function renderHeadMasterArchive()')}
  `;
  vm.runInContext(headHelpersSrc, ctx);

  // Head sees spotlight automatically with active + archived counts
  ctx.renderHeadOverviewAutoArchive();
  ctx.renderHeadMasterArchive();

  const card = ctx.document.getElementById('head-overview-auto-archive-card');
  assert.equal(card.classList.contains('hidden'), false);
  assert.equal(ctx.document.getElementById('head-overview-active-viols-chip').textContent, 'مخالفات نشطة: 4');
  assert.equal(ctx.document.getElementById('head-overview-archived-viols-chip').textContent, 'مخالفات مؤرشفة: 2');

  const tbodyHtml = ctx.document.getElementById('head-master-archive-tbody').innerHTML;
  assert.equal(tbodyHtml.includes('SV-OWN-A1'), true);
  assert.equal(tbodyHtml.includes('SV-ARCH-A1'), true);
  assert.equal(tbodyHtml.includes('SMK-ARCH-B1'), true);
  assert.equal(tbodyHtml.includes('SV-DEL-LEGACY'), false, 'Deleted records must stay hidden');
  assert.equal(tbodyHtml.includes('<script>alert(1)</script>'), false, 'XSS must be escaped in head archive table');

  // Filter archived only
  ctx.switchArchiveStatusFilter('archived');
  const onlyArch = ctx.getFilteredArchiveRecords();
  assert.equal(onlyArch.length, 2);
  assert.equal(onlyArch.every(r => r.isArchived === true), true);

  // Soft-archive and restore via head actions
  const ar = ctx.archiveHeadViolationRecord('smoking', 'SMK-OWN-A1');
  assert.equal(ar.ok, true);
  assert.equal(ctx.getFilteredArchiveRecords().length, 3);
  const rr = ctx.restoreHeadViolationRecord('smoking', 'SMK-OWN-A1');
  assert.equal(rr.ok, true);
  assert.equal(ctx.getFilteredArchiveRecords().length, 2);

  // Non-privileged user sees nothing & card hidden
  ctx.localStorage.setItem('ksu_active_user', JSON.stringify(USERS.inspectorA));
  assert.equal(ctx.getUnifiedArchiveRecords().length, 0);
  ctx.renderHeadOverviewAutoArchive();
  assert.equal(card.classList.contains('hidden'), true);
  ctx.renderHeadMasterArchive();
  assert.match(ctx.document.getElementById('head-master-archive-tbody').innerHTML, /رئيس القسم ومسؤول النظام فقط/);
  assert.equal(ctx.archiveHeadViolationRecord('safety', 'SV-OWN-A1').ok, false);
});

// =========================================================================
// Suite 6: admin.html & KSUMasterArchive Engine + Structural Guarantees
// =========================================================================
test('Suite 6: admin.html & KSUMasterArchive auto-expose active+archived violations to head/admin, hide/block others, and pass hygiene checks', () => {
  assert.equal(adminHtml.includes('ksumc_gemini_api_key'), false, 'admin.html must never reintroduce ksumc_gemini_api_key');
  assert.match(adminHtml, /<div id="printable-round-sheet" class="hidden"><\/div>\s*\n\s*<!-- Scripts -->/);
  assert.equal(adminHtml.includes('assets/js/ksu-master-archive.js'), true);

  const sample = sampleViolations();
  const ctx = createSandbox(USERS.head, {
    ksumc_safety_violations: sample.safety,
    ksumc_smoking_violations: sample.smoking
  });
  ctx._makeEl('section', 'admin-auto-archive-spotlight', ['hidden']);
  ctx._makeEl('button', 'btn-admin-master-archive-tab', ['hidden']);
  ctx._makeEl('span', 'admin-tab-archive-count');
  ctx._makeEl('span', 'admin-arch-count-all');
  ctx._makeEl('span', 'admin-arch-count-violations');
  ctx._makeEl('span', 'admin-arch-violations-active-count');
  ctx._makeEl('span', 'admin-arch-violations-archived-count');
  ctx._makeEl('select', 'admin-arch-status-filter').value = 'all';
  ctx._makeEl('tbody', 'admin-master-archive-tbody');

  vm.runInContext(bridgeCode, ctx);
  vm.runInContext(masterArchiveCode, ctx);

  ctx.KSUMasterArchive.init();
  const spot = ctx.document.getElementById('admin-auto-archive-spotlight');
  assert.equal(spot.classList.contains('hidden'), false, 'Spotlight must auto-show for head');
  assert.equal(spot.innerHTML.includes('مخالفات نشطة: 4'), true);
  assert.equal(spot.innerHTML.includes('مخالفات مؤرشفة: 2'), true);

  const tableHtml = ctx.document.getElementById('admin-master-archive-tbody').innerHTML;
  assert.equal(tableHtml.includes('SV-OWN-A1'), true);
  assert.equal(tableHtml.includes('SV-ARCH-A1'), true);
  assert.equal(tableHtml.includes('SMK-ARCH-B1'), true);
  assert.equal(tableHtml.includes('SV-DEL-LEGACY'), false);
  assert.equal(tableHtml.includes('<script>alert(1)</script>'), false);

  // Soft-archive & restore in admin module
  const arch = ctx.KSUMasterArchive.archiveViolation('safety', 'SV-OWN-B1');
  assert.equal(arch.ok, true);
  assert.equal(ctx.document.getElementById('admin-arch-violations-archived-count').textContent, '3');
  const rest = ctx.KSUMasterArchive.restoreViolation('safety', 'SV-OWN-B1');
  assert.equal(rest.ok, true);
  assert.equal(ctx.document.getElementById('admin-arch-violations-archived-count').textContent, '2');

  // Shift supervisor in admin.html sees NO spotlight and NO archive records
  ctx.localStorage.setItem('ksu_active_user', JSON.stringify(USERS.shiftSup1));
  ctx.KSUMasterArchive.render();
  assert.equal(spot.classList.contains('hidden'), true);
  assert.equal(spot.innerHTML, '');
  assert.equal(ctx.KSUMasterArchive.getUnifiedRecords().length, 0);
  assert.equal(ctx.KSUMasterArchive.archiveViolation('safety', 'SV-OWN-A1').ok, false);
});

// =========================================================================
// Suite 7: quality.html Filtering & Firebase Realtime Authorization / Normalization
// =========================================================================
test('Suite 7: quality.html hides archived violations and ksu-firebase-realtime enforces purge RBAC & archive normalization', async () => {
  // Check quality.html renderQualityUnifiedWorkflow source filters archived/deleted violations
  const qualFnSrc = extractFunctionSource(qualityHtml, 'function renderQualityUnifiedWorkflow()');
  assert.match(qualFnSrc, /isViolationArchived|status === 'archived'/);

  // Test ksu-firebase-realtime.js
  const ctx = createSandbox(USERS.inspectorA);
  vm.runInContext(bridgeCode, ctx);
  vm.runInContext(firebaseRealtimeCode, ctx);

  const sync = ctx.window.ksuFirebaseSync;
  assert.equal(typeof sync.getAuthClaims, 'function');
  assert.equal(typeof sync.recordAuditLog, 'function');
  assert.equal(typeof sync.archiveViolationInCloud, 'function');

  // normalizeCloudPayload preserves archived flags and neutralizes legacy status:'deleted' poisoning
  const normalizedArchived = sync.normalizeCloudPayload('safety_violations', {
    id: 'SV-1',
    status: 'archived',
    isArchived: true,
    _deleted: true
  });
  assert.equal(normalizedArchived.archived, true);
  assert.equal(normalizedArchived.isArchived, true);
  assert.equal('_deleted' in normalizedArchived, false);

  const normalizedPoisoned = sync.normalizeCloudPayload('smoking_violations', {
    id: 'SMK-1',
    status: 'deleted',
    preArchiveStatus: 'تم الضبط'
  });
  assert.equal(normalizedPoisoned.status, 'تم الضبط');

  // Unauthorized user cannot execute purgeAllTrialOperationalData(true)
  const blockedPurge = await sync.purgeAllTrialOperationalData(true);
  assert.equal(blockedPurge, false);
  const logsAfterBlocked = ctx.KSUDataBridge.getAuditLogs();
  assert.equal(logsAfterBlocked.some(l => l.action === 'UNAUTHORIZED_MANUAL_PURGE'), true);

  // Authorized head user CAN invoke purgeAllTrialOperationalData(true) and writes audit log
  ctx.localStorage.setItem('ksu_active_user', JSON.stringify(USERS.head));
  const allowedPurge = await sync.purgeAllTrialOperationalData(true);
  assert.notEqual(allowedPurge, false);
  const logsAfterAllowed = ctx.KSUDataBridge.getAuditLogs();
  assert.equal(logsAfterAllowed.some(l => l.action === 'AUTHORIZED_MANUAL_PURGE'), true);
});

// =========================================================================
// Suite 8: Firebase RTDB Rules (Compat + Strict) & Custom Claims Tool
// =========================================================================
test('Suite 8: database.rules.json, database.rules.strict.json, and custom-claims-setup.js enforce valid security invariants', () => {
  const compatRaw = fs.readFileSync(path.join(repoRoot, 'database.rules.json'), 'utf-8');
  const strictRaw = fs.readFileSync(path.join(repoRoot, 'database.rules.strict.json'), 'utf-8');

  // Valid JSON & no JS === or !== inside Firebase RTDB rule strings
  assert.equal(/===|!==/.test(compatRaw), false, 'database.rules.json must use == / != not === / !==')
  assert.equal(/===|!==/.test(strictRaw), false, 'database.rules.strict.json must use == / != not === / !==');
  const compatRules = JSON.parse(compatRaw).rules;
  const strictRules = JSON.parse(strictRaw).rules;

  // Root lockdown & password strip compat
  assert.equal(compatRules['.read'], false);
  assert.equal(compatRules['.write'], false);
  assert.equal(compatRules.users.$userId['.validate'].includes("!newData.hasChildren(['password'])"), true);
  assert.ok(compatRules.system_config, 'Compat rules preserve system_config');

  // Violations reject status == 'deleted' and audit_logs is append-only
  for (const node of ['safety_violations', 'smoking_violations']) {
    assert.equal(compatRules[node].$violId['.validate'].includes("status').val() != 'deleted'"), true);
    assert.equal(strictRules[node].$violId['.validate'].includes("status').val() != 'deleted'"), true);
    assert.equal(strictRules[node]['.read'].includes('auth != null'), true);
    assert.equal(strictRules[node].$violId['.write'].includes("auth.token.role == 'head'"), true);
  }
  assert.equal(compatRules.audit_logs.$logId['.write'].includes('!data.exists()'), true);
  assert.equal(strictRules.audit_logs.$logId['.write'].includes('!data.exists()'), true);
  assert.equal(strictRules.audit_logs['.read'].includes("auth.token.role == 'head'"), true);

  // Custom claims setup syntax & roles
  const claimsSrc = fs.readFileSync(path.join(repoRoot, 'firebase-auth/custom-claims-setup.js'), 'utf-8');
  for (const r of ['head', 'admin', 'developer', 'executive', 'quality', 'shift_supervisor', 'field_inspector']) {
    assert.equal(claimsSrc.includes(`'${r}'`), true, `Missing role "${r}" in custom-claims-setup.js`);
  }
});

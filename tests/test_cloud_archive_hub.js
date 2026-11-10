const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createMockDirHandle(name = 'OneDriveRoot') {
  const dirs = new Map();
  const files = new Map();

  return {
    name,
    kind: 'directory',
    _dirs: dirs,
    _files: files,
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async getDirectoryHandle(subName, opts = {}) {
      if (!dirs.has(subName)) {
        if (!opts.create) throw new Error(`Dir not found: ${subName}`);
        dirs.set(subName, createMockDirHandle(subName));
      }
      return dirs.get(subName);
    },
    async getFileHandle(fileName, opts = {}) {
      if (!files.has(fileName) && !opts.create) {
        throw new Error(`File not found: ${fileName}`);
      }
      return {
        name: fileName,
        kind: 'file',
        async createWritable() {
          let chunks = [];
          return {
            async write(data) {
              chunks.push(data);
            },
            async close() {
              files.set(fileName, chunks.length === 1 ? chunks[0] : chunks.join(''));
            }
          };
        }
      };
    }
  };
}

function createHubSandbox(customFetch, customNavigator = {}) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  const elementsById = new Map();
  const makeEl = (tag = 'div') => {
    let _innerHTML = '';
    const el = {
      tagName: String(tag).toUpperCase(),
      id: '',
      className: '',
      style: {},
      get innerHTML() { return _innerHTML; },
      set innerHTML(val) {
        _innerHTML = String(val);
        const matches = _innerHTML.matchAll(/id="([^"]+)"/g);
        for (const m of matches) {
          if (!elementsById.has(m[1])) {
            elementsById.set(m[1], makeEl('input'));
          }
        }
      },
      textContent: '',
      value: '',
      children: [],
      classList: {
        _set: new Set(),
        add(...cls) { cls.forEach(c => this._set.add(c)); },
        remove(...cls) { cls.forEach(c => this._set.delete(c)); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._set.has(c)) this._set.delete(c); else this._set.add(c);
          } else if (force) this._set.add(c); else this._set.delete(c);
        },
        contains(c) { return this._set.has(c); }
      },
      appendChild(child) {
        this.children.push(child);
        if (child && child.id) elementsById.set(child.id, child);
        return child;
      },
      remove() {
        if (this.id) elementsById.delete(this.id);
      },
      setAttribute(k, v) {
        if (k === 'id') {
          this.id = v;
          elementsById.set(v, this);
        }
        this[k] = v;
      },
      click() {},
      addEventListener() {},
      getContext() { return null; }
    };
    return el;
  };

  const document = {
    readyState: 'complete',
    head: makeEl('head'),
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const sandbox = {
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => fn(),
    AbortController,
    AbortSignal,
    Intl,
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
    Uint8Array,
    Buffer,
    Blob: globalThis.Blob,
    File: globalThis.File,
    URL: Object.assign(
      function(...args) { return new globalThis.URL(...args); },
      {
        createObjectURL: () => 'blob:mock',
        revokeObjectURL: () => {}
      }
    ),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    encodeURIComponent,
    decodeURIComponent,
    localStorage,
    sessionStorage: localStorage,
    document,
    navigator: { userAgent: 'NodeTest', onLine: true, ...customNavigator },
    location: { origin: 'http://localhost:8080', pathname: '/quality.html', hostname: 'localhost', protocol: 'http:', href: 'http://localhost:8080/quality.html' },
    alert: () => {},
    confirm: () => true,
    fetch: customFetch || (async () => ({ ok: false, status: 404, json: async () => ({}) }))
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._elementsById = elementsById;
  return vm.createContext(sandbox);
}

const repoRoot = path.resolve(__dirname, '..');
const ksuAiClientCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-ai-client.js'), 'utf-8');
const ksuCloudSyncCode = fs.readFileSync(path.join(repoRoot, 'assets/js/ksu-cloud-sync.js'), 'utf-8');

test('Task 3.1: escapeCsvCell and buildArchiveCsvRegisters produce UTF-8 BOM RFC-4180 CSVs safe from Excel formula injection', () => {
  const ctx = createHubSandbox();
  ctx.localStorage.setItem('ksumc_safety_violations', JSON.stringify([
    {
      id: 'KSU-VIS-2026-1001',
      date: '2026-11-08',
      facility: 'مستشفى الملك خالد، المبنى "أ"',
      location: 'الدور الأول\nالممر الشرقي',
      devices: ['=CMD()|calc'],
      severity: 'high',
      status: 'معتمد'
    }
  ]));
  vm.runInContext(ksuCloudSyncCode, ctx);

  const eng = ctx.window.ksuSyncEngine;
  assert.equal(typeof eng.escapeCsvCell, 'function');
  assert.equal(typeof eng.buildArchiveCsvRegisters, 'function');

  // Formula injection neutralization
  const escapedFormula = eng.escapeCsvCell('=SUM(A1:A5)');
  assert.equal(escapedFormula.startsWith("'=SUM") || escapedFormula.startsWith("\"'=SUM"), true);

  // Quotes, commas, newlines escaping
  const escapedComplex = eng.escapeCsvCell('مستشفى الملك خالد، المبنى "أ"\nالدور الأول');
  assert.equal(escapedComplex, '"مستشفى الملك خالد، المبنى ""أ""\nالدور الأول"');

  const csvBundle = eng.buildArchiveCsvRegisters();
  for (const key of ['violationsCsv', 'roundsCsv', 'cbahiCsv', 'shiftReportsCsv', 'assetsCsv']) {
    assert.equal(typeof csvBundle[key], 'string', `${key} must be generated`);
    assert.equal(csvBundle[key].charCodeAt(0), 0xFEFF, `${key} must start with UTF-8 BOM`);
  }
  assert.equal(csvBundle.violationsCsv.includes('""أ""'), true);
  assert.equal(csvBundle.violationsCsv.includes("'=CMD()"), true);
});

test('Task 3.2: getUnifiedDatabasePackage exports all 13 operational collections from state and localStorage', () => {
  const ctx = createHubSandbox();
  ctx.localStorage.setItem('ksumc_safety_rounds', JSON.stringify([{ id: 'R1' }]));
  ctx.localStorage.setItem('ksumc_safety_violations', JSON.stringify([{ id: 'SV1' }]));
  ctx.localStorage.setItem('ksumc_smoking_violations', JSON.stringify([{ id: 'SMK1' }]));
  ctx.localStorage.setItem('ksumc_capa_records', JSON.stringify([{ id: 'CAPA1' }]));
  ctx.localStorage.setItem('ksumc_safety_doors', JSON.stringify([{ id: 'D1' }]));
  ctx.localStorage.setItem('ksumc_safety_permits', JSON.stringify([{ id: 'P1' }]));
  ctx.localStorage.setItem('ksumc_safety_alarms', JSON.stringify([{ id: 'AL1' }]));
  ctx.localStorage.setItem('ksumc_shift_incidents', JSON.stringify([{ id: 'INC1' }]));
  ctx.localStorage.setItem('ksumc_safety_dept_reports', JSON.stringify([{ id: 'REP1' }]));
  ctx.localStorage.setItem('ksumc_compliance_registry', JSON.stringify([{ id: 'CB1' }]));
  ctx.localStorage.setItem('ksumc_admin_users', JSON.stringify([{ id: 'U1' }]));
  ctx.localStorage.setItem('ksumc_safety_assets', JSON.stringify([{ id: 'AS1' }]));
  ctx.localStorage.setItem('ksumc_quality_monthly_schedule', JSON.stringify({ month: '2026-11' }));

  vm.runInContext(ksuCloudSyncCode, ctx);
  const pkg = ctx.window.ksuSyncEngine.getUnifiedDatabasePackage();
  const db = pkg.database;

  const expectedCollections = [
    'rounds',
    'safetyViolations',
    'smokingViolations',
    'capa',
    'doors',
    'permits',
    'alarms',
    'shiftIncidents',
    'safetyDeptReports',
    'complianceRegistry',
    'users',
    'assets',
    'qualitySchedule'
  ];
  for (const col of expectedCollections) {
    assert.notEqual(db[col], undefined, `Missing collection ${col} in getUnifiedDatabasePackage`);
  }
  assert.equal(db.safetyViolations.length, 1);
  assert.equal(db.capa.length, 1);
  assert.equal(db.complianceRegistry.length, 1);
});

test('Task 3.3: syncToDirectoryHandle pulls cross-device 1280px images from Vision Agent when local vault misses, writes structured OneDrive/SharePoint hierarchy, and records archived cardIds', async () => {
  const remoteHiResBytes = Buffer.from('CROSS_DEVICE_1280PX_JPEG_BINARY');
  const remoteHiResDataUrl = 'data:image/jpeg;base64,' + remoteHiResBytes.toString('base64');

  const mockFetch = async (url) => {
    if (url.includes('/archive/media/KSU-VIS-2026-3030')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          cardId: 'KSU-VIS-2026-3030',
          images: [remoteHiResDataUrl]
        })
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const ctx = createHubSandbox(mockFetch);
  ctx.localStorage.setItem('ksumc_oracle_agent_url', 'http://127.0.0.1:8000');
  ctx.localStorage.setItem('ksumc_safety_violations', JSON.stringify([
    {
      id: 'KSU-VIS-2026-3030',
      cardId: 'KSU-VIS-2026-3030',
      date: '2026-11-08',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      location: 'الدور الثالث',
      hasVisualInspectionCard: true,
      photo: 'data:image/jpeg;base64,' + Buffer.from('TINY_THUMB').toString('base64'),
      visionData: {
        compliance_status: 'غير مطابق',
        risk_level: 'عالي',
        detected_element: 'طفاية حريق بدون مسمار أمان',
        findings_summary: 'رصد فقدان مسمار الأمان في طفاية الحريق'
      }
    }
  ]));

  vm.runInContext(ksuAiClientCode, ctx);
  vm.runInContext(ksuCloudSyncCode, ctx);

  const rootDirHandle = createMockDirHandle('UserSelectedOneDriveFolder');
  const summary = await ctx.window.ksuSyncEngine.syncToDirectoryHandle(rootDirHandle);

  assert.equal(summary.archivedViolations, 1);
  assert.equal(rootDirHandle._dirs.has('KSUMC_RSD_Safety_Archive'), true);

  const archiveRoot = rootDirHandle._dirs.get('KSUMC_RSD_Safety_Archive');
  const monthDir = archiveRoot._dirs.get(summary.monthFolder);
  assert.ok(monthDir, 'Month folder YYYY-MM must be created');

  const dir01 = monthDir._dirs.get('01_صور_ومحاضر_الراصد_البصري');
  const dir02 = monthDir._dirs.get('02_سجلات_إكسل_وشواهد_سباهي');
  const dir03 = monthDir._dirs.get('03_النسخ_الاحتياطي_الشامل');
  assert.ok(dir01 && dir02 && dir03, 'All 3 standard Arabic archive subfolders must exist');

  // Verify binary 1280px JPEG and reconstructed HTML report were written
  assert.equal(dir01._files.has('KSU-VIS-2026-3030_0.jpg'), true);
  assert.equal(dir01._files.has('KSU-VIS-2026-3030_محضر_رصد.html'), true);
  const writtenHtml = dir01._files.get('KSU-VIS-2026-3030_محضر_رصد.html');
  assert.equal(writtenHtml.includes(remoteHiResDataUrl), true, 'HTML report must embed the 1280px image fetched from Vision Agent');

  // Verify 5 CSVs + printable CBAHI HTML in dir02
  assert.equal(dir02._files.size >= 6, true, 'Must write 5 CSVs + printable CBAHI evidence HTML');

  // Verify Full Backup JSON in dir03
  assert.equal(dir03._files.size, 1);

  // Verify cardId recorded as archived
  const archivedIds = JSON.parse(ctx.localStorage.getItem('ksumc_archived_card_ids') || '[]');
  assert.equal(archivedIds.includes('KSU-VIS-2026-3030'), true);
});

test('Task 3.4: slimLegacyCloudViolations refuses to slim unarchived records and slims only verified archived cardIds', async () => {
  const ctx = createHubSandbox();
  ctx.localStorage.setItem('ksumc_archived_card_ids', JSON.stringify(['ARCHIVED-CARD-1']));
  ctx.localStorage.setItem('ksumc_safety_violations', JSON.stringify([
    {
      id: 'ARCHIVED-CARD-1',
      cardId: 'ARCHIVED-CARD-1',
      hasVisualInspectionCard: true,
      visionData: { findings_summary: 'مؤرشف' },
      cardInnerHtml: '<div>BLOATED_ARCHIVED_INNER</div>',
      fullPageHtml: '<html>BLOATED_ARCHIVED_FULL</html>',
      photo: 'data:image/jpeg;base64,HIRES_1'
    },
    {
      id: 'UNARCHIVED-CARD-2',
      cardId: 'UNARCHIVED-CARD-2',
      hasVisualInspectionCard: true,
      visionData: { findings_summary: 'غير مؤرشف بعد' },
      cardInnerHtml: '<div>MUST_STAY_INTACT_INNER</div>',
      fullPageHtml: '<html>MUST_STAY_INTACT_FULL</html>',
      photo: 'data:image/jpeg;base64,HIRES_2'
    }
  ]));

  const syncedToCloud = [];
  ctx.window.ksuFirebaseSync = {
    isConnected: true,
    syncSafetyViolation: (v) => syncedToCloud.push(v.id)
  };

  vm.runInContext(ksuAiClientCode, ctx);
  vm.runInContext(ksuCloudSyncCode, ctx);

  const slimResult = await ctx.window.ksuSyncEngine.slimLegacyCloudViolations();
  assert.equal(slimResult.slimmedCount, 1);
  assert.equal(slimResult.skippedUnarchivedCount, 1);

  const afterList = JSON.parse(ctx.localStorage.getItem('ksumc_safety_violations'));
  const archivedRec = afterList.find(x => x.id === 'ARCHIVED-CARD-1');
  const unarchivedRec = afterList.find(x => x.id === 'UNARCHIVED-CARD-2');

  assert.equal('cardInnerHtml' in archivedRec, false);
  assert.equal('fullPageHtml' in archivedRec, false);
  assert.equal(unarchivedRec.cardInnerHtml, '<div>MUST_STAY_INTACT_INNER</div>');
  assert.equal(unarchivedRec.fullPageHtml, '<html>MUST_STAY_INTACT_FULL</html>');
  assert.deepEqual(syncedToCloud, ['ARCHIVED-CARD-1']);
});

test('Task 3.5: Legacy shims, self-injected OneDrive/SharePoint modal, and Mobile Web Share API work cleanly', async () => {
  let sharedPayload = null;
  const ctx = createHubSandbox(null, {
    canShare: () => true,
    share: async (data) => { sharedPayload = data; }
  });
  ctx.localStorage.setItem('ksumc_safety_violations', JSON.stringify([
    {
      id: 'KSU-MOB-2026-01',
      cardId: 'KSU-MOB-2026-01',
      date: '2026-11-08',
      hasVisualInspectionCard: true,
      photo: 'data:image/jpeg;base64,' + Buffer.from('MOBILE_JPG').toString('base64'),
      visionData: { findings_summary: 'فحص جوال' }
    }
  ]));

  vm.runInContext(ksuAiClientCode, ctx);
  vm.runInContext(ksuCloudSyncCode, ctx);

  const eng = ctx.window.ksuSyncEngine;
  assert.doesNotThrow(() => eng.onDataChanged());
  assert.doesNotThrow(() => eng.updateUI());
  assert.doesNotThrow(() => eng.openSyncModal());

  const injectedModal = ctx.document.getElementById('ksu-onedrive-archive-modal');
  assert.ok(injectedModal, 'openSyncModal must self-inject #ksu-onedrive-archive-modal when legacy modal is absent');
  assert.equal(injectedModal.innerHTML.includes('https://ksusa.sharepoint.com/sites/safty'), true, 'Must include Safety Dept SharePoint link');
  assert.equal(injectedModal.innerHTML.includes('https://ksusa-my.sharepoint.com'), true, 'Must include KSU 1TB OneDrive link');

  const mobRes = await eng.shareOrDownloadMobileBundle();
  assert.equal(mobRes.sharedViaWebShare, true);
  assert.ok(sharedPayload && Array.isArray(sharedPayload.files) && sharedPayload.files.length >= 2);
});

test('Task 3.6: Mobile download fallback (when Web Share unavailable) does NOT falsely mark violation cardIds as archived, and slimLegacyCloudViolations downscales oversized archived photos', async () => {
  const ctxFallback = createHubSandbox(null, {}); // no navigator.share
  const bloatedPhoto = 'data:image/jpeg;base64,' + 'Z'.repeat(60000);
  ctxFallback.localStorage.setItem('ksumc_safety_violations', JSON.stringify([
    {
      id: 'KSU-FALLBACK-99',
      cardId: 'KSU-FALLBACK-99',
      date: '2026-11-08',
      hasVisualInspectionCard: true,
      photo: bloatedPhoto,
      images: [bloatedPhoto],
      visionData: { findings_summary: 'فحص بدون Web Share' }
    }
  ]));

  vm.runInContext(ksuAiClientCode, ctxFallback);
  vm.runInContext(ksuCloudSyncCode, ctxFallback);

  const dlRes = await ctxFallback.window.ksuSyncEngine.shareOrDownloadMobileBundle();
  assert.equal(dlRes.sharedViaWebShare, false);
  const archivedAfterFallback = JSON.parse(ctxFallback.localStorage.getItem('ksumc_archived_card_ids') || '[]');
  assert.equal(archivedAfterFallback.includes('KSU-FALLBACK-99'), false, 'Download fallback must NOT mark cardId archived when .jpg/.html evidence was not exported');

  // Now mark KSU-FALLBACK-99 archived and provide a mock compressImageForAI to verify 480px photo downscaling
  ctxFallback.window.ksuSyncEngine.markCardIdsArchived(['KSU-FALLBACK-99']);
  ctxFallback.window.compressImageForAI = async (_src, maxDim) => `data:image/jpeg;base64,DOWNSCALED_${maxDim}PX`;

  const slimRes = await ctxFallback.window.ksuSyncEngine.slimLegacyCloudViolations();
  assert.equal(slimRes.slimmedCount, 1, 'Archived record with >45KB photo must be downscaled even without cardInnerHtml');
  const updatedViols = JSON.parse(ctxFallback.localStorage.getItem('ksumc_safety_violations'));
  assert.equal(updatedViols[0].photo, 'data:image/jpeg;base64,DOWNSCALED_480PX');
  assert.deepEqual(Array.from(updatedViols[0].images), ['data:image/jpeg;base64,DOWNSCALED_480PX']);
});

test('Task 3.7: resolveBestViolationImages falls back to Firebase Bridge on HTTP 502, CAPA reads ksumc_capa_registry, and evil-sharepoint.com URL is rejected', async () => {
  const mock502Fetch = async () => ({ ok: false, status: 502, json: async () => ({}) });
  const ctx = createHubSandbox(mock502Fetch);
  ctx.location.hostname = 'rsd-ksu.web.app';
  ctx.localStorage.setItem('ksumc_capa_records', '[]');
  ctx.localStorage.setItem('ksumc_capa_registry', JSON.stringify([{ id: 'CAPA-REG-1', title: 'خطة تصحيحية معتمدة' }]));

  vm.runInContext(ksuAiClientCode, ctx);
  ctx.window.KSUAI.dispatchViaFirebaseBridge = async (action, payload) => {
    if (action === 'archive-media' && payload.cardId === 'KSU-BRIDGE-502') {
      return { images: ['data:image/jpeg;base64,BRIDGE_1280PX_IMG'] };
    }
    return null;
  };
  vm.runInContext(ksuCloudSyncCode, ctx);

  const eng = ctx.window.ksuSyncEngine;
  const imgs = await eng.resolveBestViolationImages({ id: 'KSU-BRIDGE-502', photo: 'data:image/jpeg;base64,THUMB' });
  assert.deepEqual(Array.from(imgs), ['data:image/jpeg;base64,BRIDGE_1280PX_IMG']);

  const pkg = eng.getUnifiedDatabasePackage();
  assert.equal(pkg.database.capa.length, 1);
  assert.equal(pkg.database.capa[0].id, 'CAPA-REG-1');

  eng.openSyncModal();
  const urlInp = ctx.document.getElementById('ksu-custom-sp-folder-input');
  urlInp.value = 'https://evil-sharepoint.com/phish';
  eng.saveCustomSharedFolderUrl();
  assert.equal(ctx.localStorage.getItem('ksumc_custom_sharepoint_folder_url'), null, 'Lookalike domain must be rejected');

  urlInp.value = 'https://ksusa.sharepoint.com/sites/safty/Shared%20Documents';
  eng.saveCustomSharedFolderUrl();
  assert.equal(ctx.localStorage.getItem('ksumc_custom_sharepoint_folder_url'), 'https://ksusa.sharepoint.com/sites/safty/Shared%20Documents');
});

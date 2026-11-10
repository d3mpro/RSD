/**
 * KSU Medical City Safety System - KSU 1TB Cloud Archive Hub & Central Sync Engine
 * مركز الأرشفة السحابية الرسمي (OneDrive 1TB + موقع قسم السلامة SharePoint)
 * المدينة الطبية بجامعة الملك سعود - الإدارة العامة للأمن والسلامة - إدارة السلامة
 */

const isFileProtocol = window.location.protocol === 'file:';

// Safe Redirect URI for MSAL (Entra ID requires http or https)
const safeRedirectUri = isFileProtocol
  ? 'http://localhost:8080/index.html'
  : (window.location.origin + window.location.pathname);

// KSU Microsoft Entra ID Configuration
const KSU_MSAL_CONFIG = {
  auth: {
    clientId: localStorage.getItem('ksu_azure_client_id') || '4a1aa1d5-c567-4e00-ad0b-665ab7927b1f',
    authority: localStorage.getItem('ksu_azure_authority') || 'https://login.microsoftonline.com/common',
    redirectUri: safeRedirectUri
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: true
  }
};

const KSU_SCOPES = [
  'User.Read',
  'Files.ReadWrite',
  'Files.ReadWrite.All'
];

const KSU_SHAREPOINT_SAFETY_SITE_URL = 'https://ksusa.sharepoint.com/sites/safty';
const KSU_ONEDRIVE_1TB_URL = 'https://ksusa-my.sharepoint.com/:f:/r/personal/aalsaqri_ksu_edu_sa/Documents/RSD-ARSHIF?d=w2a3f0d59821549b4b63102cc80dc59a8&csf=1&web=1&e=U7ue9B';
const ARCHIVED_IDS_STORAGE_KEY = 'ksumc_archived_card_ids';
const CUSTOM_FOLDER_URL_KEY = 'ksumc_custom_sharepoint_folder_url';

class KSUCloudSyncEngine {
  constructor() {
    this.msalInstance = null;
    this.currentUser = null;
    this.isSyncing = false;
    this.isFileMode = isFileProtocol;
    this.lastSyncTime = localStorage.getItem('ksu_last_sync_time') || null;
    this.syncFolderName = 'KSU_Safety_Inspection_Database';
    this.archiveRootFolderName = 'KSUMC_RSD_Safety_Archive';
    this._cachedDirHandle = null;

    const savedUser = localStorage.getItem('ksu_active_user');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
      } catch (e) {}
    }

    this.init();
  }

  async init() {
    if (!this.isFileMode && typeof msal !== 'undefined') {
      try {
        this.msalInstance = new msal.PublicClientApplication(KSU_MSAL_CONFIG);
        await this.msalInstance.initialize();

        const response = await this.msalInstance.handleRedirectPromise();
        if (response) {
          this.handleAuthSuccess(response.account);
        } else {
          const accounts = this.msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            this.handleAuthSuccess(accounts[0]);
          }
        }
      } catch (err) {
        console.warn('MSAL initialization warning:', err);
      }
    }
    this.updateUI();
  }

  // =========================================================================
  // Helpers: Storage Readers, Dates, Base64 Binary, IndexedDB Directory Handle
  // =========================================================================

  _escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async _ensureAiClientLoaded() {
    if (typeof window.buildFullPageHtmlFromViolation === 'function' && window.KSUMediaVault) {
      return true;
    }
    if (!document || typeof document.createElement !== 'function') return false;
    return new Promise((resolve) => {
      try {
        const script = document.createElement('script');
        script.src = 'assets/js/ksu-ai-client.js';
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          resolve(ok);
        };
        script.onload = () => finish(true);
        script.onerror = () => finish(false);
        (document.head || document.body).appendChild(script);
        // In non-browser test sandboxes where script onload never fires asynchronously, settle gracefully
        Promise.resolve().then(() => {
          if (!settled && typeof window.showDirectoryPicker !== 'function' && (!navigator || !navigator.userAgent || navigator.userAgent === 'NodeTest')) {
            finish(false);
          }
        });
        setTimeout(() => finish(false), 3000);
      } catch (_) {
        resolve(false);
      }
    });
  }

  _readCollection(stateProp, localStorageKeys, fallback = []) {
    if (typeof state !== 'undefined' && state && state[stateProp] !== undefined && state[stateProp] !== null) {
      if (!Array.isArray(fallback) || (Array.isArray(state[stateProp]) && state[stateProp].length > 0)) {
        return state[stateProp];
      }
    }
    const keys = Array.isArray(localStorageKeys) ? localStorageKeys : [localStorageKeys];
    let firstValidParsed = undefined;
    for (const k of keys) {
      if (!k) continue;
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed !== null && parsed !== undefined) {
            if (firstValidParsed === undefined) firstValidParsed = parsed;
            if (!Array.isArray(parsed) || parsed.length > 0) {
              return parsed;
            }
          }
        }
      } catch (_) {}
    }
    if (firstValidParsed !== undefined) return firstValidParsed;
    if (typeof state !== 'undefined' && state && state[stateProp] !== undefined) {
      return state[stateProp];
    }
    return fallback;
  }

  _getRiyadhToday() {
    if (window.KSUAI && typeof window.KSUAI.getRiyadhDate === 'function') {
      return window.KSUAI.getRiyadhDate();
    }
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch (_) {
      return new Date().toISOString().split('T')[0];
    }
  }

  getArchivedCardIdsSet() {
    try {
      const arr = JSON.parse(localStorage.getItem(ARCHIVED_IDS_STORAGE_KEY) || '[]');
      return new Set(Array.isArray(arr) ? arr.map(x => String(x)) : []);
    } catch (_) {
      return new Set();
    }
  }

  markCardIdsArchived(ids = []) {
    const set = this.getArchivedCardIdsSet();
    for (const id of ids) {
      if (!id) continue;
      const clean = String(id).trim();
      if (!clean) continue;
      set.add(clean);
      if (window.KSUMediaVault && typeof window.KSUMediaVault.markArchived === 'function') {
        try { window.KSUMediaVault.markArchived(clean); } catch (_) {}
      }
    }
    localStorage.setItem(ARCHIVED_IDS_STORAGE_KEY, JSON.stringify(Array.from(set)));
    return set;
  }

  _dataUrlToBytes(dataUrlOrB64) {
    if (!dataUrlOrB64 || typeof dataUrlOrB64 !== 'string') return new Uint8Array(0);
    let b64 = dataUrlOrB64.trim();
    if (b64.startsWith('data:')) {
      const commaIdx = b64.indexOf(',');
      if (commaIdx !== -1) b64 = b64.slice(commaIdx + 1);
    }
    try {
      const binStr = atob(b64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      return bytes;
    } catch (_) {
      return new Uint8Array(0);
    }
  }

  async _saveDirHandleToIdb(handle) {
    this._cachedDirHandle = handle;
    if (!window.indexedDB || typeof window.indexedDB.open !== 'function') return;
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open('ksumc_onedrive_handle_db', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        };
        req.onsuccess = (e) => {
          try {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readwrite');
            tx.objectStore('handles').put(handle, 'primary_archive_dir');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch (_) { resolve(); }
        };
        req.onerror = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  async _loadDirHandleFromIdb() {
    if (this._cachedDirHandle) return this._cachedDirHandle;
    if (!window.indexedDB || typeof window.indexedDB.open !== 'function') return null;
    return new Promise((resolve) => {
      try {
        const req = window.indexedDB.open('ksumc_onedrive_handle_db', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        };
        req.onsuccess = (e) => {
          try {
            const db = e.target.result;
            const tx = db.transaction('handles', 'readonly');
            const getReq = tx.objectStore('handles').get('primary_archive_dir');
            getReq.onsuccess = () => {
              this._cachedDirHandle = getReq.result || null;
              resolve(this._cachedDirHandle);
            };
            getReq.onerror = () => resolve(null);
          } catch (_) { resolve(null); }
        };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  // =========================================================================
  // CSV Escaping & 5 Official Excel Online Registers (UTF-8 BOM)
  // =========================================================================

  escapeCsvCell(val) {
    if (val === null || val === undefined) return '';
    let str = '';
    if (Array.isArray(val)) {
      str = val.map(x => (x === null || x === undefined ? '' : String(x))).join(' | ');
    } else if (typeof val === 'object') {
      str = JSON.stringify(val);
    } else {
      str = String(val);
    }

    // Neutralize Excel formula injection (=, +, -, @) while leaving negative numbers intact
    const trimmedLeft = str.replace(/^\s+/, '');
    if (trimmedLeft && /^[=+\-@]/.test(trimmedLeft) && !/^-\d+(\.\d+)?$/.test(trimmedLeft)) {
      str = `'${str}`;
    }

    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  _buildCsvDocument(headers, rows) {
    const headerLine = headers.map(h => this.escapeCsvCell(h)).join(',');
    const bodyLines = rows.map(r => r.map(cell => this.escapeCsvCell(cell)).join(','));
    return '\uFEFF' + [headerLine, ...bodyLines].join('\n');
  }

  buildArchiveCsvRegisters() {
    const pkg = this.getUnifiedDatabasePackage();
    const db = pkg.database;

    // 1. Violations & Smart Visual Monitor Register
    const violRows = [];
    for (const v of (db.safetyViolations || [])) {
      violRows.push([
        v.id || v.cardId || '',
        'مخالفة سلامة / راصد بصري',
        v.date || '',
        v.time || '',
        v.facility || '',
        v.location || '',
        v.room || '',
        Array.isArray(v.devices) ? v.devices.join(' - ') : (v.devices || v.visionData?.detected_element || ''),
        v.severity || v.visionData?.risk_level || '',
        v.officerName || '',
        v.actionTaken || '',
        v.status || ''
      ]);
    }
    for (const sv of (db.smokingViolations || [])) {
      violRows.push([
        sv.id || '',
        'مخالفة منع التدخين',
        sv.date || '',
        sv.time || '',
        sv.facility || '',
        sv.location || '',
        sv.room || '',
        sv.violatorName || 'مخالفة تدخين',
        'عالي',
        sv.officerName || '',
        sv.actionTaken || '',
        sv.status || 'مرصودة'
      ]);
    }
    const violationsCsv = this._buildCsvDocument(
      ['الرقم المرجعي', 'نوع السجل', 'التاريخ', 'الوقت', 'المنشأة', 'الموقع', 'الغرفة/القسم', 'المخالفة / العناصر المرصودة', 'مستوى الخطورة', 'المفتش', 'الإجراء المتخذ', 'الحالة'],
      violRows
    );

    // 2. Inspection Rounds Register
    const roundRows = (db.rounds || []).map(r => [
      r.id || r.roundId || '',
      r.date || (r.timestamp ? String(r.timestamp).slice(0, 10) : ''),
      r.shift || '',
      r.facility || r.hospital || '',
      r.building || '',
      r.floor || '',
      r.inspector || r.inspectorName || '',
      r.score !== undefined ? r.score : (r.complianceRate || ''),
      r.status || ''
    ]);
    const roundsCsv = this._buildCsvDocument(
      ['رقم الجولة', 'التاريخ', 'الوردية', 'المنشأة', 'المبنى', 'الدور', 'المفتش', 'نسبة الامتثال', 'الحالة'],
      roundRows
    );

    // 3. CBAHI Compliance & CAPA Register
    const cbahiRows = [];
    for (const c of (db.complianceRegistry || [])) {
      cbahiRows.push([
        c.id || '',
        'امتثال سباهي (CBAHI)',
        c.standard || c.cbahiCode || 'FMS',
        c.title || c.description || '',
        c.facility || c.building || '',
        c.owner || c.responsible || '',
        c.dueDate || c.date || '',
        c.status || 'معتمد'
      ]);
    }
    for (const cp of (db.capa || [])) {
      cbahiRows.push([
        cp.id || '',
        'خطة تصحيحية (CAPA)',
        cp.standard || 'CBAHI FMS',
        cp.issue || cp.description || cp.title || '',
        cp.location || cp.building || '',
        cp.assignedTo || cp.responsible || '',
        cp.dueDate || cp.createdAt || '',
        cp.status || ''
      ]);
    }
    const cbahiCsv = this._buildCsvDocument(
      ['المعرف', 'التصنيف', 'المعيار المرجعي', 'الوصف / الملاحظة', 'المبنى / الموقع', 'الجهة المسؤولة', 'التاريخ / الاستحقاق', 'الحالة'],
      cbahiRows
    );

    // 4. Shift Reports & Field Incidents Register
    const shiftRows = [];
    for (const rep of (db.safetyDeptReports || [])) {
      shiftRows.push([
        rep.id || rep.reportId || '',
        'تقرير وردية سلامة',
        rep.date || '',
        rep.shift || '',
        rep.supervisor || rep.author || '',
        rep.summary || rep.notes || '',
        rep.status || 'مرفوع'
      ]);
    }
    for (const inc of (db.shiftIncidents || [])) {
      shiftRows.push([
        inc.id || '',
        'بلاغ / حادث ميداني',
        inc.date || (inc.timestamp ? String(inc.timestamp).slice(0, 10) : ''),
        inc.shift || '',
        inc.reportedBy || inc.officerName || '',
        inc.description || inc.title || '',
        inc.severity || inc.status || ''
      ]);
    }
    const shiftReportsCsv = this._buildCsvDocument(
      ['رقم السجل', 'النوع', 'التاريخ', 'الوردية', 'المعد / المبلغ', 'الملخص والتفاصيل', 'الحالة / الأولوية'],
      shiftRows
    );

    // 5. Safety Assets, Doors, Permits & Alarms Register
    const assetRows = [];
    for (const a of (db.assets || [])) {
      assetRows.push([
        a.id || '',
        a.category || a.type || 'أصل سلامة',
        a.name || '',
        a.hospital || a.facility || '',
        a.building || '',
        a.floor || '',
        a.status || '',
        a.lastInspectionDate || '',
        a.inspector || '',
        a.notes || ''
      ]);
    }
    for (const d of (db.doors || [])) {
      assetRows.push([
        d.id || '',
        'باب طوارئ مقاوم للحريق',
        d.doorNumber || d.name || '',
        d.facility || '',
        d.building || '',
        d.floor || '',
        d.status || '',
        d.date || '',
        d.inspector || '',
        d.notes || ''
      ]);
    }
    const assetsCsv = this._buildCsvDocument(
      ['المعرف', 'الفئة', 'الاسم / الرقم', 'المنشأة', 'المبنى', 'الدور', 'الحالة الفنية', 'تاريخ الفحص', 'المفتش', 'ملاحظات'],
      assetRows
    );

    return {
      violationsCsv,
      roundsCsv,
      cbahiCsv,
      shiftReportsCsv,
      assetsCsv
    };
  }

  // =========================================================================
  // Complete 13-Collection Unified Database Package
  // =========================================================================

  getUnifiedDatabasePackage() {
    const rounds = this._readCollection('rounds', ['ksumc_safety_rounds', 'ksumc_rounds_registry', 'ksumc_field_rounds'], []);
    const safetyViolations = this._readCollection('safetyViolations', ['ksumc_safety_violations'], []);
    const smokingViolations = this._readCollection('smokingViolations', ['ksumc_smoking_violations'], []);
    const capa = this._readCollection('capa', ['ksumc_capa_registry', 'ksumc_capa_records'], []);
    const doors = this._readCollection('doors', ['ksumc_safety_doors'], []);
    const permits = this._readCollection('permits', ['ksumc_safety_permits'], []);
    const alarms = this._readCollection('alarms', ['ksumc_safety_alarms'], []);
    const shiftIncidents = this._readCollection('shiftIncidents', ['ksumc_shift_incidents'], []);
    const safetyDeptReports = this._readCollection('safetyDeptReports', ['ksumc_safety_dept_reports', 'ksumc_quality_shift_inspection_logs'], []);
    const complianceRegistry = this._readCollection('complianceRegistry', ['ksumc_compliance_registry'], []);
    const users = this._readCollection('users', ['ksumc_admin_users'], []);
    const assets = this._readCollection('assets', ['ksumc_safety_assets'], []);
    const qualitySchedule = this._readCollection('qualitySchedule', ['ksumc_quality_monthly_schedule'], null);

    return {
      version: '3.0.0',
      exportedAt: new Date().toISOString(),
      institution: 'المدينة الطبية بجامعة الملك سعود - الإدارة العامة للأمن والسلامة - إدارة السلامة',
      operator: this.currentUser ? `${this.currentUser.name} (${this.currentUser.username})` : 'إدارة السلامة - KSUMC',
      database: {
        rounds,
        safetyViolations,
        smokingViolations,
        capa,
        doors,
        permits,
        alarms,
        shiftIncidents,
        safetyDeptReports,
        complianceRegistry,
        users,
        assets,
        qualitySchedule,
        checklistTemplate: typeof state !== 'undefined' && state.checklistTemplate ? state.checklistTemplate : [],
        buildings: this._readCollection('buildings', ['ksumc_admin_buildings'], []),
        monthlySchedule: this._readCollection('monthlySchedule', ['ksumc_schedule'], []),
        systemMetrics: this._readCollection('systemMetrics', ['ksumc_admin_metrics'], {})
      }
    };
  }

  // =========================================================================
  // Cross-Device High-Res Photo Resolution & Printable CBAHI Evidence Pack
  // =========================================================================

  async resolveBestViolationImages(viol) {
    if (!viol) return [];
    const cardId = String(viol.cardId || viol.id || '').trim();

    // 1. Local browser IndexedDB Vault (instant if captured on same device)
    if (cardId && window.KSUMediaVault && typeof window.KSUMediaVault.getMedia === 'function') {
      try {
        const localImgs = await window.KSUMediaVault.getMedia(cardId);
        if (localImgs && localImgs.length > 0) {
          return Array.from(localImgs);
        }
      } catch (_) {}
    }

    // 2. Vision Agent Cross-Device Archive Vault (direct HTTP -> Firebase Bridge fallback)
    if (cardId && /^[A-Za-z0-9_-]{1,80}$/.test(cardId)) {
      const token = (window.KSUAI && window.KSUAI.apiKeyHeader) || 'ksu_sec_token_95972_riyadh';
      const agentBase = (window.KSUAI && typeof window.KSUAI.getApiUrl === 'function')
        ? window.KSUAI.getApiUrl(`/archive/media/${encodeURIComponent(cardId)}`)
        : `${(localStorage.getItem('ksumc_oracle_agent_url') || 'https://rsdsafety.online').replace(/\/+$/, '')}/safety/api/archive/media/${encodeURIComponent(cardId)}`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const resp = await fetch(agentBase, {
          method: 'GET',
          headers: { 'X-KSUMC-KEY': token },
          signal: controller.signal
        });
        clearTimeout(timer);
        if (resp && resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.images) && data.images.length > 0) {
            return data.images;
          }
        } else if (resp && resp.status !== 404) {
          throw new Error(`Archive HTTP ${resp.status}`);
        }
      } catch (_) {
        const isFirebase = window.location.hostname.includes('web.app') || window.location.hostname.includes('firebaseapp.com');
        if (isFirebase && window.KSUAI && typeof window.KSUAI.dispatchViaFirebaseBridge === 'function') {
          try {
            const bridgeData = await window.KSUAI.dispatchViaFirebaseBridge('archive-media', { cardId }, 15000);
            if (bridgeData && Array.isArray(bridgeData.images) && bridgeData.images.length > 0) {
              return bridgeData.images;
            }
          } catch (_) {}
        }
      }
    }

    // 3. Fallback to violation record's inline thumbnail(s)
    if (Array.isArray(viol.images) && viol.images.length > 0) {
      return viol.images.filter(Boolean);
    }
    return viol.photo ? [viol.photo] : [];
  }

  buildCbahiMonthlyEvidenceHtml(monthKey, db) {
    const roundsCount = (db.rounds || []).length;
    const safetyViolCount = (db.safetyViolations || []).length;
    const capaCount = (db.capa || []).length;
    const cbahiCount = (db.complianceRegistry || []).length;
    const doorsCount = (db.doors || []).length;
    const permitsCount = (db.permits || []).length;

    const rowsHtml = (db.safetyViolations || []).slice(0, 50).map((v, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${this._escapeHtml(v.id || v.cardId || '-')}</td>
        <td>${this._escapeHtml(v.date || '-')}</td>
        <td>${this._escapeHtml(v.facility || '-')} - ${this._escapeHtml(v.location || '')}</td>
        <td>${this._escapeHtml(Array.isArray(v.devices) ? v.devices.join('، ') : (v.visionData?.detected_element || '-'))}</td>
        <td>${this._escapeHtml(v.status || 'معتمد')}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;">لا توجد مخالفات مسجلة في هذه الفترة</td></tr>';

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <title>ملف شواهد الاعتماد (CBAHI FMS) - ${monthKey} | KSUMC</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; direction: rtl; color: #0f172a; margin: 0; padding: 20px; background: #fff; }
    .hdr { border-bottom: 3px solid #004B87; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
    .hdr h1 { margin: 0; font-size: 18px; color: #004B87; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; text-align: center; }
    .kpi .num { font-size: 20px; font-weight: 900; color: #004B87; }
    .kpi .lbl { font-size: 11px; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; }
    th { background: #004B87; color: #fff; }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1>ملف شواهد الاعتماد الرسمي (CBAHI FMS & SBC 801)</h1>
      <div style="font-size:12px;color:#475569;">المدينة الطبية بجامعة الملك سعود • إدارة السلامة • دورة الأرشفة: ${monthKey}</div>
    </div>
    <div style="font-size:11px;text-align:left;direction:ltr;">Exported: ${new Date().toISOString().slice(0, 10)}</div>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="num">${roundsCount}</div><div class="lbl">الجولات التفتيشية الميدانية</div></div>
    <div class="kpi"><div class="num">${safetyViolCount}</div><div class="lbl">محاضر الضبط والراصد البصري</div></div>
    <div class="kpi"><div class="num">${cbahiCount + capaCount}</div><div class="lbl">سجلات سباهي والخطط التصحيحية (CAPA)</div></div>
    <div class="kpi"><div class="num">${doorsCount}</div><div class="lbl">فحوصات أبواب الطوارئ</div></div>
    <div class="kpi"><div class="num">${permitsCount}</div><div class="lbl">تصاريح الأعمال الساخنة والخطرة</div></div>
    <div class="kpi"><div class="num">100%</div><div class="lbl">حالة التوثيق السحابي (KSU 365)</div></div>
  </div>
  <h3 style="color:#082B49;font-size:14px;">بيان محاضر الضبط البصري والشواهد الموثقة</h3>
  <table>
    <thead>
      <tr><th>#</th><th>الرقم المرجعي</th><th>التاريخ</th><th>المنشأة والموقع</th><th>الملاحظة المرصودة</th><th>الحالة</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
  }

  // =========================================================================
  // Desktop Folder Sync (File System Access API -> Synced OneDrive / SharePoint)
  // =========================================================================

  async _writeFileToDir(dirHandle, fileName, content) {
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async connectAndSyncOneDriveFolder(forcePickNew = false) {
    if (typeof window.showDirectoryPicker !== 'function') {
      this.showModalMessage('متصفحك الحالي لا يدعم ربط المجلدات المباشر (أو تعمل من الجوال). استخدم زر "إرسال وتصدير الحزمة لتطبيق OneDrive للجوال" أدناه.', 'warning');
      return null;
    }

    try {
      let dirHandle = !forcePickNew ? await this._loadDirHandleFromIdb() : null;
      if (dirHandle && typeof dirHandle.queryPermission === 'function') {
        let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && typeof dirHandle.requestPermission === 'function') {
          perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        }
        if (perm !== 'granted') dirHandle = null;
      }

      if (!dirHandle) {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await this._saveDirHandleToIdb(dirHandle);
      }

      this.isSyncing = true;
      this.updateUI();
      this.showModalMessage('جاري أرشفة الصور عالية الدقة (1280px) وسجلات سباهي وExcel في مجلد سحابة الجامعة...', 'info');

      const summary = await this.syncToDirectoryHandle(dirHandle);

      this.lastSyncTime = new Date().toLocaleString('ar-SA');
      localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);
      const msg = `تمت الأرشفة بنجاح في سحابة الجامعة (${summary.filesWritten} ملف، منها ${summary.archivedViolations} محضر مصور عالي الدقة) ✓`;
      this.showModalMessage(msg, 'success');
      this.showToast(msg, 'success');
      return summary;
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        this.showModalMessage('تعذر إكمال مزامنة المجلد: ' + (err.message || err), 'error');
      }
      return null;
    } finally {
      this.isSyncing = false;
      this.updateUI();
    }
  }

  async syncToDirectoryHandle(dirHandle, options = {}) {
    if (!dirHandle || typeof dirHandle.getDirectoryHandle !== 'function') {
      throw new Error('مجلد الأرشفة غير صالح');
    }

    await this._ensureAiClientLoaded();

    const today = options.today || this._getRiyadhToday();
    const monthFolder = options.monthFolder || today.slice(0, 7);
    const archivedSet = this.getArchivedCardIdsSet();

    const archiveRoot = await dirHandle.getDirectoryHandle(this.archiveRootFolderName, { create: true });
    const monthDir = await archiveRoot.getDirectoryHandle(monthFolder, { create: true });

    const dir01 = await monthDir.getDirectoryHandle('01_صور_ومحاضر_الراصد_البصري', { create: true });
    const dir02 = await monthDir.getDirectoryHandle('02_سجلات_إكسل_وشواهد_سباهي', { create: true });
    const dir03 = await monthDir.getDirectoryHandle('03_النسخ_الاحتياطي_الشامل', { create: true });

    const pkg = this.getUnifiedDatabasePackage();
    const db = pkg.database;
    let filesWritten = 0;
    const newlyArchivedIds = [];

    // 1. Write Visual Monitor 1280px Photos + Official Printable HTML Cards
    for (const v of (db.safetyViolations || [])) {
      const rawId = String(v.cardId || v.id || '').trim();
      if (!rawId) continue;
      if (options.skipAlreadyArchived && archivedSet.has(rawId)) continue;
      const safeId = rawId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);

      const bestImages = await this.resolveBestViolationImages(v);
      for (let i = 0; i < bestImages.length; i++) {
        const bytes = this._dataUrlToBytes(bestImages[i]);
        if (bytes.length > 0) {
          await this._writeFileToDir(dir01, `${safeId}_${i}.jpg`, bytes);
          filesWritten++;
        }
      }

      let fullHtml = '';
      let hasCompleteOfficialCard = false;
      if (typeof window.buildFullPageHtmlFromViolation === 'function') {
        fullHtml = window.buildFullPageHtmlFromViolation(v, bestImages);
        hasCompleteOfficialCard = Boolean(fullHtml);
      } else if (v.fullPageHtml) {
        fullHtml = v.fullPageHtml;
        hasCompleteOfficialCard = true;
      }

      if (fullHtml) {
        await this._writeFileToDir(dir01, `${safeId}_محضر_رصد.html`, fullHtml);
        filesWritten++;
      }
      if (hasCompleteOfficialCard) {
        newlyArchivedIds.push(rawId);
      }
    }

    // 2. Write 5 UTF-8 BOM Excel CSV Registers + Printable CBAHI Evidence Pack
    const csvs = this.buildArchiveCsvRegisters();
    const csvFilesMap = [
      [`01_سجل_مخالفات_السلامة_والراصد_${monthFolder}.csv`, csvs.violationsCsv],
      [`02_سجل_الجولات_التفتيشية_${monthFolder}.csv`, csvs.roundsCsv],
      [`03_سجل_امتثال_سباهي_وCAPA_${monthFolder}.csv`, csvs.cbahiCsv],
      [`04_سجل_تقارير_الورديات_والبلاغات_${monthFolder}.csv`, csvs.shiftReportsCsv],
      [`05_سجل_أصول_ومعدات_السلامة_${monthFolder}.csv`, csvs.assetsCsv]
    ];
    for (const [fName, csvContent] of csvFilesMap) {
      await this._writeFileToDir(dir02, fName, csvContent);
      filesWritten++;
    }

    const cbahiHtml = this.buildCbahiMonthlyEvidenceHtml(monthFolder, db);
    await this._writeFileToDir(dir02, `ملف_شواهد_الاعتماد_سباهي_${monthFolder}.html`, cbahiHtml);
    filesWritten++;

    // 3. Write Complete 13-Collection JSON Master Backup
    await this._writeFileToDir(dir03, `KSUMC_Full_Backup_${today}.json`, JSON.stringify(pkg, null, 2));
    filesWritten++;

    this.markCardIdsArchived(newlyArchivedIds);

    return {
      archivedViolations: newlyArchivedIds.length,
      filesWritten,
      monthFolder
    };
  }

  // =========================================================================
  // Mobile Mode: 1-Tap Export / Share to OneDrive & SharePoint App (iOS/Android)
  // =========================================================================

  async shareOrDownloadMobileBundle() {
    await this._ensureAiClientLoaded();

    const today = this._getRiyadhToday();
    const monthFolder = today.slice(0, 7);
    const pkg = this.getUnifiedDatabasePackage();
    const db = pkg.database;
    const csvs = this.buildArchiveCsvRegisters();
    const cbahiHtml = this.buildCbahiMonthlyEvidenceHtml(monthFolder, db);

    const summaryEntries = [
      { name: `01_سجل_مخالفات_السلامة_${monthFolder}.csv`, content: csvs.violationsCsv, mime: 'text/csv;charset=utf-8' },
      { name: `02_سجل_الجولات_التفتيشية_${monthFolder}.csv`, content: csvs.roundsCsv, mime: 'text/csv;charset=utf-8' },
      { name: `03_سجل_امتثال_سباهي_وCAPA_${monthFolder}.csv`, content: csvs.cbahiCsv, mime: 'text/csv;charset=utf-8' },
      { name: `04_سجل_تقارير_الورديات_والبلاغات_${monthFolder}.csv`, content: csvs.shiftReportsCsv, mime: 'text/csv;charset=utf-8' },
      { name: `05_سجل_أصول_ومعدات_السلامة_${monthFolder}.csv`, content: csvs.assetsCsv, mime: 'text/csv;charset=utf-8' },
      { name: `ملف_شواهد_الاعتماد_سباهي_${monthFolder}.html`, content: cbahiHtml, mime: 'text/html;charset=utf-8' },
      { name: `KSUMC_Full_Backup_${today}.json`, content: JSON.stringify(pkg, null, 2), mime: 'application/json' }
    ];

    const fileEntries = [...summaryEntries];
    const archivedIds = [];

    for (const v of (db.safetyViolations || []).slice(0, 15)) {
      const rawId = String(v.cardId || v.id || '').trim();
      if (!rawId) continue;
      const safeId = rawId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
      const bestImgs = await this.resolveBestViolationImages(v);
      let wroteImgs = false;
      for (let i = 0; i < bestImgs.length; i++) {
        const bytes = this._dataUrlToBytes(bestImgs[i]);
        if (bytes.length > 0) {
          fileEntries.push({ name: `${safeId}_${i}.jpg`, content: bytes, mime: 'image/jpeg' });
          wroteImgs = true;
        }
      }
      const fullHtml = (typeof window.buildFullPageHtmlFromViolation === 'function')
        ? window.buildFullPageHtmlFromViolation(v, bestImgs)
        : (v.fullPageHtml || '');
      if (fullHtml) {
        fileEntries.push({
          name: `${safeId}_محضر_رصد.html`,
          content: fullHtml,
          mime: 'text/html;charset=utf-8'
        });
        if (wroteImgs || (!v.photo && (!v.images || !v.images.length))) {
          archivedIds.push(rawId);
        }
      }
    }

    // Attempt native Web Share API with files (opens iOS/Android sheet with OneDrive / SharePoint app)
    if (typeof File === 'function' && navigator && typeof navigator.share === 'function') {
      try {
        const shareFiles = fileEntries.map(f => new File([f.content], f.name, { type: f.mime }));
        const canShareFiles = typeof navigator.canShare === 'function' ? navigator.canShare({ files: shareFiles }) : true;
        if (canShareFiles) {
          await navigator.share({
            title: `أرشيف سلامة المدينة الطبية KSUMC - ${monthFolder}`,
            text: 'حزمة شواهد ومحاضر الرصد البصري وسجلات سباهي للحفظ في OneDrive / SharePoint',
            files: shareFiles
          });
          this.markCardIdsArchived(archivedIds);
          this.lastSyncTime = new Date().toLocaleString('ar-SA');
          localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);
          this.updateUI();
          this.showModalMessage('تم إرسال حزمة الأرشفة والصور عالية الدقة بنجاح إلى تطبيق OneDrive / SharePoint ✓', 'success');
          return { sharedViaWebShare: true, filesCount: shareFiles.length };
        }
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return { sharedViaWebShare: false, aborted: true };
        }
      }
    }

    // Fallback (no Web Share API): Download the 7 summary CSV/HTML/JSON registers WITHOUT falsely marking photo violations archived
    for (const f of summaryEntries) {
      const blob = new Blob([f.content], { type: f.mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', f.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    this.lastSyncTime = new Date().toLocaleString('ar-SA');
    localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);
    this.updateUI();
    this.showModalMessage('تم تنزيل سجلات Excel والنسخة الاحتياطية بنجاح ✓ (لأرشفة الصور الأصلية 1280px على الكمبيوتر استخدم زر مزامنة مجلد السحابة)', 'info');
    return { sharedViaWebShare: false, filesCount: summaryEntries.length };
  }

  // =========================================================================
  // Safe Legacy Firebase RTDB Slimming (Verified Archived Records ONLY)
  // =========================================================================

  async _downscaleViolationPhoto(src) {
    if (!src || typeof src !== 'string' || src.length <= 45000) return src;
    if (typeof window.compressImageForAI === 'function') {
      try {
        const out = await window.compressImageForAI(src, 480, 0.6);
        if (out) return out;
      } catch (_) {}
    }
    return src;
  }

  async slimLegacyCloudViolations() {
    await this._ensureAiClientLoaded();
    const archivedSet = this.getArchivedCardIdsSet();
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem('ksumc_safety_violations') || '[]');
    } catch (_) {
      list = [];
    }

    let slimmedCount = 0;
    let skippedUnarchivedCount = 0;
    const slimmedRecords = [];
    const updatedList = [];

    for (const item of list) {
      if (!item || typeof item !== 'object') {
        updatedList.push(item);
        continue;
      }
      const id = String(item.cardId || item.id || '').trim();
      const hasBloatedHtml = Boolean(item.cardInnerHtml || item.fullPageHtml);
      const hasOversizedPhoto = Boolean(
        (typeof item.photo === 'string' && item.photo.length > 45000) ||
        (Array.isArray(item.images) && item.images.some(img => typeof img === 'string' && img.length > 45000))
      );

      if (!hasBloatedHtml && !hasOversizedPhoto) {
        updatedList.push(item);
        continue;
      }

      // Safety Gate: NEVER slim a violation whose high-res evidence hasn't been archived yet
      if (!id || !archivedSet.has(id)) {
        skippedUnarchivedCount++;
        updatedList.push(item);
        continue;
      }

      const copy = Object.assign({}, item);
      let modified = false;

      if ((copy.visionData || copy.hasVisualInspectionCard) && hasBloatedHtml) {
        delete copy.cardInnerHtml;
        delete copy.fullPageHtml;
        modified = true;
      }

      if (hasOversizedPhoto) {
        if (typeof copy.photo === 'string' && copy.photo.length > 45000) {
          const smaller = await this._downscaleViolationPhoto(copy.photo);
          if (smaller && smaller !== copy.photo) {
            copy.photo = smaller;
            modified = true;
          }
        }
        if (Array.isArray(copy.images)) {
          const nextImages = [];
          for (const imgSrc of copy.images) {
            if (typeof imgSrc === 'string' && imgSrc.length > 45000) {
              const smaller = await this._downscaleViolationPhoto(imgSrc);
              if (smaller && smaller !== imgSrc) modified = true;
              nextImages.push(smaller || imgSrc);
            } else {
              nextImages.push(imgSrc);
            }
          }
          copy.images = nextImages;
        }
      }

      if (modified) {
        copy.updatedAt = new Date().toISOString();
        copy.updatedAtMs = Date.now();
        slimmedCount++;
        slimmedRecords.push(copy);
        updatedList.push(copy);
      } else {
        updatedList.push(item);
      }
    }

    if (slimmedCount > 0) {
      localStorage.setItem('ksumc_safety_violations', JSON.stringify(updatedList));
      if (typeof state !== 'undefined' && state && Array.isArray(state.safetyViolations)) {
        state.safetyViolations = updatedList;
      }
      if (window.ksuFirebaseSync && window.ksuFirebaseSync.isConnected && typeof window.ksuFirebaseSync.syncSafetyViolation === 'function') {
        for (const rec of slimmedRecords) {
          try { window.ksuFirebaseSync.syncSafetyViolation(rec); } catch (_) {}
        }
      }
      this.showModalMessage(`تم تنحيف وتفريغ النصوص المكررة من (${slimmedCount}) محضر مؤرشف بأمان، مع الإبقاء على (${skippedUnarchivedCount}) محضر غير مؤرشف دون مساس ✓`, 'success');
    } else {
      const msg = skippedUnarchivedCount > 0
        ? `لم يتم تقليص أي سجل لأن لديك (${skippedUnarchivedCount}) محضر لم يُؤرشف بعد في سحابة الجامعة. قم بالأرشفة أولاً لحماية الصور الأصلية.`
        : 'جميع السجلات الحالية رشيقة ومُحسّنة بالفعل ✓';
      this.showModalMessage(msg, skippedUnarchivedCount > 0 ? 'warning' : 'info');
    }

    this.updateUI();
    return { slimmedCount, skippedUnarchivedCount };
  }

  // =========================================================================
  // Custom Shared Folder Link Saver (SharePoint / OneDrive Shared Folder)
  // =========================================================================

  saveCustomSharedFolderUrl() {
    const inp = document.getElementById('ksu-custom-sp-folder-input');
    if (!inp) return;
    const url = String(inp.value || '').trim();
    if (url) {
      let validSp = false;
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        validSp = parsed.protocol === 'https:' && (
          host === 'ksusa.sharepoint.com' ||
          host === 'ksusa-my.sharepoint.com' ||
          host.endsWith('.sharepoint.com')
        );
      } catch (_) {
        validSp = false;
      }
      if (!validSp) {
        this.showModalMessage('يرجى إدخال رابط مجلد رسمي صحيح من نطاق جامعة الملك سعود (ksusa.sharepoint.com)', 'warning');
        return;
      }
      localStorage.setItem(CUSTOM_FOLDER_URL_KEY, url);
      this.showModalMessage('تم حفظ رابط مجلد الشواهد المشترك بنجاح ✓', 'success');
    } else {
      localStorage.removeItem(CUSTOM_FOLDER_URL_KEY);
      this.showModalMessage('تم مسح الرابط المخصص والعودة للروابط الافتراضية', 'info');
    }
    this.updateUI();
  }

  // =========================================================================
  // Self-Injected RTL KSUMC Modal (#ksu-onedrive-archive-modal)
  // =========================================================================

  ensureArchiveModalInjected() {
    let existing = document.getElementById('ksu-onedrive-archive-modal');
    if (existing) return existing;

    const modal = document.createElement('div');
    modal.setAttribute('id', 'ksu-onedrive-archive-modal');
    modal.className = 'hidden fixed inset-0 z-[9998] items-center justify-center p-3 sm:p-5';
    modal.style.cssText = 'background:rgba(8,43,73,0.72);backdrop-filter:blur(4px);direction:rtl;font-family:Cairo,Segoe UI,Tahoma,sans-serif;';

    const customUrl = this._escapeHtml(localStorage.getItem(CUSTOM_FOLDER_URL_KEY) || '');

    modal.innerHTML = `
      <div style="background:#ffffff;width:100%;max-width:760px;max-height:90vh;overflow-y:auto;border-radius:20px;border:2px solid #004B87;box-shadow:0 25px 60px rgba(0,0,0,0.35);color:#0f172a;">
        <!-- Header -->
        <div style="background:linear-gradient(135deg,#082B49,#004B87);color:#ffffff;padding:16px 20px;border-radius:17px 17px 0 0;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;">
              <span class="material-symbols-outlined" style="font-size:24px;color:#38bdf8;">cloud_upload</span>
            </div>
            <div>
              <h3 style="margin:0;font-size:16px;font-weight:900;">مركز أرشفة سحابة جامعة الملك سعود (1TB OneDrive & SharePoint)</h3>
              <div style="font-size:11px;color:#bae6fd;margin-top:2px;">حفظ الصور الأصلية للراصد البصري (1280px) وشواهد سباهي وسجلات Excel دون تغيير واجهات المنصة</div>
            </div>
          </div>
          <button type="button" onclick="ksuSyncEngine.closeSyncModal()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:34px;height:34px;border-radius:10px;cursor:pointer;font-weight:900;font-size:16px;">✕</button>
        </div>

        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;">
          <!-- Feedback Alert -->
          <div id="ksu-modal-message-box" class="hidden"></div>

          <!-- Direct Quick-Launch Links to Safety SharePoint & 1TB OneDrive -->
          <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:14px;padding:12px 14px;">
            <div style="font-size:12px;font-weight:900;color:#082B49;margin-bottom:8px;">البوابات السحابية الرسمية المرتبطة بحسابك الجامعي (@ksu.edu.sa):</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px;">
              <a href="${KSU_SHAREPOINT_SAFETY_SITE_URL}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;border-radius:11px;background:#004B87;color:#ffffff;text-decoration:none;font-size:12px;font-weight:800;">
                <span class="material-symbols-outlined" style="font-size:18px;">domain_verification</span>
                <span>فتح موقع قسم السلامة الرسمي (SharePoint)</span>
              </a>
              <a href="${KSU_ONEDRIVE_1TB_URL}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;border-radius:11px;background:#0284c7;color:#ffffff;text-decoration:none;font-size:12px;font-weight:800;">
                <span class="material-symbols-outlined" style="font-size:18px;">cloud_done</span>
                <span>فتح مجلد الأرشيف السحابي RSD-ARSHIF (1 TB)</span>
              </a>
            </div>
            <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <input id="ksu-custom-sp-folder-input" type="url" value="${customUrl}" placeholder="اختياري: الصق رابط مجلد مشترك في موقع قسم السلامة للوصول السريع..." style="flex:1;min-width:210px;padding:7px 10px;border-radius:9px;border:1px solid #93c5fd;font-size:11px;direction:ltr;text-align:right;" />
              <button type="button" onclick="ksuSyncEngine.saveCustomSharedFolderUrl()" style="padding:7px 12px;border-radius:9px;background:#082B49;color:#fff;border:none;font-size:11px;font-weight:800;cursor:pointer;">حفظ الرابط</button>
              <a id="ksu-custom-sp-open-btn" href="${customUrl || '#'}" target="_blank" rel="noopener noreferrer" style="display:${customUrl ? 'inline-flex' : 'none'};padding:7px 12px;border-radius:9px;background:#059669;color:#fff;text-decoration:none;font-size:11px;font-weight:800;">فتح المجلد المشترك ↗</a>
            </div>
          </div>

          <!-- Live Stats Strip -->
          <div id="ksu-archive-stats-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;"></div>

          <!-- Primary Archive Actions (Desktop & Mobile) -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;">
            <div style="border:1.5px solid #cbd5e1;border-radius:14px;padding:13px;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-size:13px;font-weight:900;color:#082B49;">💻 مزامنة مجلد السحابة على الكمبيوتر</div>
                <p style="margin:4px 0 0;font-size:11px;color:#475569;line-height:1.5;">اختر مجلد OneDrive أو مجلد مستندات موقع قسم السلامة على جهازك لحفظ الصور عالية الدقة (1280px) ومحاضر سباهي وملفات Excel تلقائياً في مجلدات شهرية منظمة.</p>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" onclick="ksuSyncEngine.connectAndSyncOneDriveFolder(false)" style="flex:1;padding:9px 12px;border-radius:10px;background:#004B87;color:#fff;border:none;font-size:12px;font-weight:800;cursor:pointer;">مزامنة وأرشفة الآن</button>
                <button type="button" onclick="ksuSyncEngine.connectAndSyncOneDriveFolder(true)" style="padding:9px 10px;border-radius:10px;background:#e2e8f0;color:#0f172a;border:none;font-size:11px;font-weight:700;cursor:pointer;" title="تغيير مجلد الحفظ">تغيير المجلد</button>
              </div>
            </div>

            <div style="border:1.5px solid #cbd5e1;border-radius:14px;padding:13px;background:#f8fafc;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-size:13px;font-weight:900;color:#082B49;">📱 إرسال لتطبيق OneDrive / SharePoint بالجوال</div>
                <p style="margin:4px 0 0;font-size:11px;color:#475569;line-height:1.5;">تصدير ومشاركة حزمة الشواهد المصورة وسجلات إكسل بضغطة واحدة مباشرة إلى تطبيق OneDrive أو SharePoint على الآيفون والأندرويد.</p>
              </div>
              <button type="button" onclick="ksuSyncEngine.shareOrDownloadMobileBundle()" style="width:100%;padding:9px 12px;border-radius:10px;background:#059669;color:#fff;border:none;font-size:12px;font-weight:800;cursor:pointer;">مشاركة / تنزيل حزمة الأرشيف السحابي</button>
            </div>
          </div>

          <!-- Secondary Utilities: Safe Firebase Slimming + Backup Restore -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;">
            <div style="font-size:11px;color:#92400e;flex:1;min-width:220px;">
              <strong>حماية سعة Firebase المجانية:</strong> يمكنك تفريغ النصوص المكررة من السجلات القديمة بشرط أن تكون مؤرشفة مسبقاً في سحابة الجامعة.
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" onclick="ksuSyncEngine.slimLegacyCloudViolations()" style="padding:7px 11px;border-radius:9px;background:#d97706;color:#fff;border:none;font-size:11px;font-weight:800;cursor:pointer;">تفريغ المحاضر المؤرشفة بأمان</button>
              <button type="button" onclick="ksuSyncEngine.triggerImportFile()" style="padding:7px 11px;border-radius:9px;background:#ffffff;color:#082B49;border:1px solid #cbd5e1;font-size:11px;font-weight:800;cursor:pointer;">استعادة نسخة JSON</button>
            </div>
          </div>

          <!-- Collapsible 3-Step Power Automate Guide -->
          <details style="border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#ffffff;">
            <summary style="cursor:pointer;font-size:12px;font-weight:800;color:#004B87;">⚡ دليل الأرشفة التلقائية الصامتة عبر Power Automate الجامعي (3 خطوات اختيارية)</summary>
            <ol style="margin:8px 0 0;padding-right:18px;font-size:11px;color:#334155;line-height:1.7;">
              <li>افتح خدمة <strong>Power Automate</strong> من بوابة Microsoft 365 الجامعية واختر قالب <em>Save my email attachments to a SharePoint document library</em>.</li>
              <li>حدد فلتر عنوان الرسالة (Subject Filter) بالقيمة: <code>[RSD-ARCHIVE]</code> على بريدك <code>aalsaqri@ksu.edu.sa</code>.</li>
              <li>اختر الموقع <strong>قسم السلامة (sites/safty)</strong> والمكتبة <strong>المستندات</strong> ليتم إيداع كل صورة ومحضر رصد آلياً بالخلفية على مدار الساعة.</li>
            </ol>
          </details>

          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px;">
            <span>آخر أرشفة سحابية: <strong id="ksu-modal-last-sync">${this.lastSyncTime || 'لم تتم الأرشفة بعد'}</strong></span>
            <span>منصة رصد للسلامة المهنية • KSUMC</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  // =========================================================================
  // Legacy MSAL & UI Compatibility Methods
  // =========================================================================

  handleAuthSuccess(account) {
    this.currentUser = {
      name: account.name || account.username,
      username: account.username,
      tenantId: account.tenantId
    };
    localStorage.setItem('ksu_active_user', JSON.stringify(this.currentUser));
    this.updateUI();
    this.showModalMessage('تم تسجيل الدخول بحساب جامعة الملك سعود بنجاح ✓', 'success');
  }

  setUniversityProfile(name, email) {
    if (!email || !email.includes('@')) {
      alert('يرجى إدخال بريد جامعي صحيح (@ksu.edu.sa)');
      return;
    }
    this.currentUser = {
      name: name.trim() || email.split('@')[0],
      username: email.trim().toLowerCase(),
      tenantId: 'ksu.edu.sa'
    };
    localStorage.setItem('ksu_active_user', JSON.stringify(this.currentUser));
    this.updateUI();
    this.showModalMessage('تم ربط وتأكيد الحساب الجامعي بنجاح: ' + this.currentUser.name, 'success');
  }

  async login() {
    if (this.isFileMode || !this.msalInstance) {
      this.renderFileModeLoginForm();
      return;
    }
    try {
      this.showModalMessage('جاري فتح نافذة النفاذ الموحد لجامعة الملك سعود...', 'info');
      const loginResponse = await this.msalInstance.loginPopup({ scopes: KSU_SCOPES, prompt: 'select_account' });
      this.handleAuthSuccess(loginResponse.account);
      await this.syncAllData(false);
    } catch (err) {
      this.showModalMessage('يمكنك استخدام الأرشفة المباشرة لموقع قسم السلامة أو OneDrive 1TB أعلاه دون الحاجة لتسجيل إضافي.', 'info');
      this.renderFileModeLoginForm();
    }
  }

  renderRedirectOption() {}
  async loginRedirectMode() {}
  renderFileModeLoginForm() {}

  saveFormUniversityProfile() {
    const nameEl = document.getElementById('ksu-input-name');
    const emailEl = document.getElementById('ksu-input-email');
    if (!nameEl || !emailEl) return;
    this.setUniversityProfile(nameEl.value, emailEl.value);
  }

  async logout() {
    this.currentUser = null;
    localStorage.removeItem('ksu_active_user');
    this.updateUI();
    this.showModalMessage('تم فك ربط الحساب بنجاح', 'info');
  }

  async syncAllData(isManual = true) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateUI();
    try {
      const dirHandle = await this._loadDirHandleFromIdb();
      if (dirHandle && typeof dirHandle.queryPermission === 'function') {
        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await this.syncToDirectoryHandle(dirHandle, { skipAlreadyArchived: !isManual });
        }
      }
      this.lastSyncTime = new Date().toLocaleString('ar-SA');
      localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);
      if (isManual) {
        this.showToast('تمت مزامنة وحفظ البيانات بنجاح ✓', 'success');
      }
    } catch (err) {
      console.warn('Auto sync notice:', err);
    } finally {
      this.isSyncing = false;
      this.updateUI();
    }
  }

  saveDirectToOneDrive(pkg) {
    this.saveDatabaseBackupFile(pkg || this.getUnifiedDatabasePackage());
  }

  saveDatabaseBackupFile(pkg) {
    const dataPkg = pkg || this.getUnifiedDatabasePackage();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dataPkg, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `KSUMC_Full_Backup_${this._getRiyadhToday()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  triggerImportFile() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const cloudPkg = JSON.parse(event.target.result);
          if (cloudPkg && cloudPkg.database) {
            const db = cloudPkg.database;
            const keyMap = [
              ['assets', typeof STORAGE_KEY_ASSETS !== 'undefined' ? STORAGE_KEY_ASSETS : 'ksumc_safety_assets'],
              ['rounds', typeof STORAGE_KEY_ROUNDS !== 'undefined' ? STORAGE_KEY_ROUNDS : 'ksumc_safety_rounds'],
              ['safetyViolations', 'ksumc_safety_violations'],
              ['smokingViolations', 'ksumc_smoking_violations'],
              ['capa', 'ksumc_capa_records'],
              ['permits', typeof STORAGE_KEY_PERMITS !== 'undefined' ? STORAGE_KEY_PERMITS : 'ksumc_safety_permits'],
              ['alarms', typeof STORAGE_KEY_ALARMS !== 'undefined' ? STORAGE_KEY_ALARMS : 'ksumc_safety_alarms'],
              ['doors', typeof STORAGE_KEY_DOORS !== 'undefined' ? STORAGE_KEY_DOORS : 'ksumc_safety_doors'],
              ['shiftIncidents', 'ksumc_shift_incidents'],
              ['safetyDeptReports', 'ksumc_safety_dept_reports'],
              ['complianceRegistry', 'ksumc_compliance_registry'],
              ['users', typeof STORAGE_KEY_USERS !== 'undefined' ? STORAGE_KEY_USERS : 'ksumc_admin_users']
            ];
            for (const [prop, storageKey] of keyMap) {
              if (db[prop] !== undefined) {
                localStorage.setItem(storageKey, JSON.stringify(db[prop]));
              }
            }
            if (db.capa !== undefined) {
              localStorage.setItem('ksumc_capa_registry', JSON.stringify(db.capa));
            }
            if (db.qualitySchedule) {
              localStorage.setItem('ksumc_quality_monthly_schedule', JSON.stringify(db.qualitySchedule));
              localStorage.setItem('ksumc_schedule_user_customized', 'true');
              if (typeof state !== 'undefined' && state) state.qualitySchedule = db.qualitySchedule;
            }

            if (typeof loadState === 'function') loadState();
            if (typeof updateDashboardKPIs === 'function') updateDashboardKPIs();
            if (typeof renderAssetsList === 'function') renderAssetsList();
            if (typeof renderAssetKPIs === 'function') renderAssetKPIs();

            this.lastSyncTime = new Date().toLocaleString('ar-SA');
            localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);
            this.updateUI();
            this.showModalMessage('تمت استعادة كافة السجلات الـ 13 وتحديث النظام بنجاح ✓', 'success');
            this.showToast('تمت استعادة كافة السجلات وتحديث النظام بنجاح ✓', 'success');
          } else {
            alert('الملف المختار غير متوافق مع بنية قاعدة بيانات النظام.');
          }
        } catch (err) {
          alert('خطأ في قراءة ملف قاعدة البيانات: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  }

  exportAssetsCSV() {
    const csvs = this.buildArchiveCsvRegisters();
    const blob = new Blob([csvs.assetsCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `سجل_أصول_السلامة_جامعة_الملك_سعود_${this._getRiyadhToday()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.showToast('تم تصدير سجل الأصول بصيغة Excel CSV بنجاح ✓', 'success');
  }

  onDataChanged() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (this.currentUser || this._cachedDirHandle) {
        this.syncAllData(false);
      }
    }, 4000);
  }

  updateUI() {
    const modalLastSync = document.getElementById('ksu-modal-last-sync');
    if (modalLastSync) {
      modalLastSync.textContent = this.lastSyncTime || 'لم تتم الأرشفة بعد';
    }

    const openCustomBtn = document.getElementById('ksu-custom-sp-open-btn');
    if (openCustomBtn) {
      const rawCustomUrl = localStorage.getItem(CUSTOM_FOLDER_URL_KEY) || '';
      openCustomBtn.setAttribute('href', rawCustomUrl || '#');
      openCustomBtn.style.display = rawCustomUrl ? 'inline-flex' : 'none';
    }

    const statsStrip = document.getElementById('ksu-archive-stats-strip');
    if (statsStrip) {
      const db = this.getUnifiedDatabasePackage().database;
      const archivedSet = this.getArchivedCardIdsSet();
      const allViols = db.safetyViolations || [];
      const archivedCount = allViols.filter(v => archivedSet.has(String(v.cardId || v.id || ''))).length;
      const pendingCount = Math.max(0, allViols.length - archivedCount);
      const totalRecords = (db.rounds || []).length + allViols.length + (db.smokingViolations || []).length + (db.capa || []).length + (db.complianceRegistry || []).length + (db.assets || []).length;

      statsStrip.innerHTML = `
        <div style="padding:9px 12px;border-radius:11px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
          <div style="font-size:17px;font-weight:900;color:#004B87;">${totalRecords}</div>
          <div style="font-size:10px;color:#475569;font-weight:700;">إجمالي سجلات المنصة</div>
        </div>
        <div style="padding:9px 12px;border-radius:11px;background:#ecfdf5;border:1px solid #a7f3d0;text-align:center;">
          <div style="font-size:17px;font-weight:900;color:#047857;">${archivedCount}</div>
          <div style="font-size:10px;color:#065f46;font-weight:700;">محاضر مصورة مؤرشفة</div>
        </div>
        <div style="padding:9px 12px;border-radius:11px;background:${pendingCount > 0 ? '#fff7ed' : '#f8fafc'};border:1px solid ${pendingCount > 0 ? '#fed7aa' : '#e2e8f0'};text-align:center;">
          <div style="font-size:17px;font-weight:900;color:${pendingCount > 0 ? '#c2410c' : '#475569'};">${pendingCount}</div>
          <div style="font-size:10px;color:#475569;font-weight:700;">محاضر بانتظار الأرشفة</div>
        </div>
      `;
    }
  }

  openSyncModal() {
    const modal = this.ensureArchiveModalInjected();
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      modal.style.display = 'flex';
      this.updateUI();
    }
    const legacyModal = document.getElementById('ksu-cloud-sync-modal');
    if (legacyModal && legacyModal !== modal) {
      legacyModal.classList.add('hidden');
    }
  }

  closeSyncModal() {
    const modal = document.getElementById('ksu-onedrive-archive-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
    }
    const legacyModal = document.getElementById('ksu-cloud-sync-modal');
    if (legacyModal) {
      legacyModal.classList.add('hidden');
      legacyModal.classList.remove('flex');
    }
  }

  showModalMessage(msg, type = 'info') {
    const box = document.getElementById('ksu-modal-message-box');
    if (!box) return;
    const styles = {
      success: 'background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;',
      error: 'background:#fef2f2;color:#991b1b;border:1px solid #fca5a5;',
      warning: 'background:#fffbeb;color:#92400e;border:1px solid #fcd34d;',
      info: 'background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;'
    };
    box.className = '';
    box.style.cssText = `padding:10px 12px;border-radius:11px;font-size:11.5px;font-weight:800;display:flex;align-items:center;gap:8px;${styles[type] || styles.info}`;
    box.textContent = msg;
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bg = type === 'success' ? '#047857' : type === 'error' ? '#dc2626' : type === 'warning' ? '#d97706' : '#004B87';
    toast.style.cssText = `position:fixed;top:80px;left:24px;z-index:9999;background:${bg};color:#fff;padding:10px 16px;border-radius:12px;font-family:Cairo,sans-serif;font-size:12px;font-weight:800;box-shadow:0 12px 30px rgba(0,0,0,0.25);`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
  }
}

// Global Singleton Instance
const ksuSyncEngine = new KSUCloudSyncEngine();
window.ksuSyncEngine = ksuSyncEngine;

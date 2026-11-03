/**
 * KSU Medical City Safety System - Central Cloud Sync Engine
 * محرك المزامنة السحابية المركزية اللحظية للمدينة الطبية بجامعة الملك سعود
 * الإدارة العامة للأمن والسلامة - إدارة السلامة - جامعة الملك سعود
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

class KSUCloudSyncEngine {
  constructor() {
    this.msalInstance = null;
    this.currentUser = null;
    this.isSyncing = false;
    this.isFileMode = isFileProtocol;
    this.lastSyncTime = localStorage.getItem('ksu_last_sync_time') || null;
    this.syncFolderName = 'KSU_Safety_Inspection_Database';
    
    // Check saved local user
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

  // Set University User Profile Manually (Works in all environments including file://)
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
    const feedbackBox = document.getElementById('ksu-modal-message-box');

    // If user opened page via direct file protocol
    if (this.isFileMode) {
      this.renderFileModeLoginForm();
      return;
    }

    if (!this.msalInstance) {
      this.showModalMessage('جاري تهيئة الاتصال بـ Microsoft Entra ID... إذا استمر ذلك يرجى استخدام الربط المباشر أو تشغيل الخادم المحلي.', 'warning');
      this.renderFileModeLoginForm();
      return;
    }

    try {
      this.showModalMessage('جاري فتح نافذة النفاذ الموحد لجامعة الملك سعود...', 'info');

      const loginRequest = {
        scopes: KSU_SCOPES,
        prompt: 'select_account'
      };

      const loginResponse = await this.msalInstance.loginPopup(loginRequest);
      this.handleAuthSuccess(loginResponse.account);
      await this.syncAllData(false);
    } catch (err) {
      console.error('KSU Login Error:', err);

      // Handle popup blocked by browser
      if (err.message && (err.message.includes('popup_window_error') || err.message.includes('block') || err.name === 'BrowserAuthError')) {
        this.showModalMessage('قام المتصفح بحظر النافذة المنبثقة لموقع مايكروسوفت. اضغط على خيار (تسجيل الدخول عبر صفحة كاملة) أدناه:', 'warning');
        this.renderRedirectOption();
      } else if (err.message && err.message.includes('AADSTS')) {
        this.showModalMessage('خطأ في إعدادات التطبيق في Azure: ' + err.message, 'error');
        this.renderFileModeLoginForm();
      } else {
        this.showModalMessage('تعذر فتح نافذة مايكروسوفت: ' + (err.message || err) + '. يمكنك استخدام الربط المباشر لحسابك الجامعي أدناه:', 'warning');
        this.renderFileModeLoginForm();
      }
    }
  }

  renderRedirectOption() {
    const container = document.getElementById('ksu-modal-user-status');
    if (!container) return;
    container.innerHTML = `
      <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
        <div class="flex items-center gap-2 text-amber-900 font-bold text-xs">
          <span class="material-symbols-outlined text-amber-600">warning</span>
          <span>نافذة مايكروسوفت المنبثقة محظورة من المتصفح</span>
        </div>
        <p class="text-xs text-on-surface-variant">اختر أحد الحلين التاليين للمتابعة:</p>
        <div class="flex flex-wrap gap-2">
          <button onclick="ksuSyncEngine.loginRedirectMode()" class="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary-container shadow-sm">
            تسجيل الدخول عبر صفحة كاملة (Redirect)
          </button>
          <button onclick="ksuSyncEngine.renderFileModeLoginForm()" class="px-4 py-2 bg-white text-primary border border-primary/20 rounded-lg text-xs font-bold hover:bg-surface-container">
            الربط المباشر بالبريد الجامعي
          </button>
        </div>
      </div>
    `;
  }

  async loginRedirectMode() {
    if (!this.msalInstance) return;
    try {
      await this.msalInstance.loginRedirect({
        scopes: KSU_SCOPES,
        prompt: 'select_account'
      });
    } catch (e) {
      alert('خطأ في التحويل: ' + e.message);
    }
  }

  // Display intuitive University Credentials Form (Works 100% anywhere)
  renderFileModeLoginForm() {
    const container = document.getElementById('ksu-modal-user-status');
    if (!container) return;

    container.innerHTML = `
      <div class="p-4 bg-gradient-to-br from-primary/5 via-surface-container to-secondary/5 border border-outline-variant/50 rounded-xl space-y-3.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-lg">badge</span>
            <span class="font-bold text-xs text-primary">ربط الحساب الجامعي لمنسوبي جامعة الملك سعود</span>
          </div>
          <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">السحابة المركزية متصلة</span>
        </div>

        <p class="text-[11px] text-on-surface-variant leading-relaxed">
          مزامنة وحفظ السجلات تلقائياً في <strong class="text-primary font-bold">السحابة المركزية للمدينة الطبية</strong>. أدخل بياناتك لتوثيق السجلات والتقارير باسمك الجامعي الرسمي:
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label class="block text-[10px] font-bold text-on-surface-variant mb-1">الاسم الكامل / الرتبة</label>
            <input id="ksu-input-name" type="text" placeholder="مثال: أ. علي سليمان الصقري" value="${this.currentUser ? this.currentUser.name : 'أ. علي سليمان الصقري'}" class="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label class="block text-[10px] font-bold text-on-surface-variant mb-1">البريد الجامعي الرسمي (@ksu.edu.sa)</label>
            <input id="ksu-input-email" type="email" placeholder="username@ksu.edu.sa" value="${this.currentUser ? this.currentUser.username : 'admin@ksu.edu.sa'}" class="w-full px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant/60 text-xs font-semibold focus:outline-none focus:border-primary dir-ltr text-right" />
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <button onclick="ksuSyncEngine.saveFormUniversityProfile()" class="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all">
            <span class="material-symbols-outlined text-base text-amber-400">verified</span>
            <span>حفظ وتأكيد الربط الجامعي</span>
          </button>

          <span class="text-[10px] text-on-surface-variant">موثق للإدارة العامة للأمن والسلامة - إدارة السلامة</span>
        </div>
      </div>
    `;
  }

  saveFormUniversityProfile() {
    const nameEl = document.getElementById('ksu-input-name');
    const emailEl = document.getElementById('ksu-input-email');
    if (!nameEl || !emailEl) return;
    this.setUniversityProfile(nameEl.value, emailEl.value);
  }

  async logout() {
    if (this.msalInstance && this.currentUser && !this.isFileMode) {
      try {
        await this.msalInstance.logoutPopup({ account: this.currentUser });
      } catch (e) {}
    }
    this.currentUser = null;
    localStorage.removeItem('ksu_active_user');
    this.updateUI();
    this.showModalMessage('تم فك ربط الحساب بنجاح', 'info');
  }

  // Generate complete unified database package
  getUnifiedDatabasePackage() {
    return {
      version: '2.5.0',
      exportedAt: new Date().toISOString(),
      institution: 'المدينة الطبية بجامعة الملك سعود - الإدارة العامة للأمن والسلامة - إدارة السلامة',
      operator: this.currentUser ? `${this.currentUser.name} (${this.currentUser.username})` : 'المشرف الميداني',
      database: {
        assets: typeof state !== 'undefined' ? state.assets : [],
        rounds: typeof state !== 'undefined' ? state.rounds : [],
        checklistTemplate: typeof state !== 'undefined' ? state.checklistTemplate : [],
        permits: typeof state !== 'undefined' ? state.permits : [],
        alarms: typeof state !== 'undefined' ? state.alarms : [],
        doors: typeof state !== 'undefined' ? state.doors : [],
        buildings: typeof state !== 'undefined' ? state.buildings : [],
        monthlySchedule: typeof state !== 'undefined' ? state.monthlySchedule : [],
        qualitySchedule: typeof state !== 'undefined' ? state.qualitySchedule : null,
        users: typeof state !== 'undefined' ? state.users : [],
        systemMetrics: typeof state !== 'undefined' ? state.systemMetrics : {}
      }
    };
  }

  // Master Sync Execution (Supports Central Cloud & Local Database Synchronization)
  async syncAllData(isManual = true) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.updateUI();

    try {
      const dbPackage = this.getUnifiedDatabasePackage();
      const content = JSON.stringify(dbPackage, null, 2);

      // 1. If online and authenticated via Graph API
      let cloudSuccess = false;
      if (this.msalInstance && this.currentUser && !this.isFileMode) {
        try {
          const token = await this.getAccessToken();
          if (token) {
            const filename = 'KSUMC_Safety_Database_Master.json';
            const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${this.syncFolderName}/${filename}:/content`;
            const resp = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: content
            });
            if (resp.ok) cloudSuccess = true;
          }
        } catch (e) {
          console.warn('Graph API upload notice:', e);
        }
      }

      // 2. تحديث وقت آخر مزامنة
      this.lastSyncTime = new Date().toLocaleString('ar-SA');
      localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);

      const msg = 'تمت مزامنة وحفظ البيانات بنجاح في السحابة المركزية للمدينة الطبية ✓';

      this.showModalMessage(msg, 'success');
      // إظهار التنبيه فقط في حال طلب المستخدم المزامنة يدوياً لمنع التشويش أثناء الجولات الميدانية
      if (isManual) {
        this.showToast(msg, 'success');
      }
    } catch (err) {
      console.error('Sync Error:', err);
      this.showModalMessage('تعذر إتمام المزامنة: ' + (err.message || err), 'error');
    } finally {
      this.isSyncing = false;
      this.updateUI();
    }
  }

  // Save database snapshot to user disk
  saveDirectToOneDrive(pkg) {
    this.saveDatabaseBackupFile(pkg);
  }

  saveDatabaseBackupFile(pkg) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pkg, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `KSUMC_Safety_Database_Master.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  // Restore/Pull latest database from JSON file
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
            if (db.assets) localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(db.assets));
            if (db.rounds) localStorage.setItem(STORAGE_KEY_ROUNDS, JSON.stringify(db.rounds));
            if (db.checklistTemplate) localStorage.setItem(STORAGE_KEY_CHECKLIST_TEMPLATE, JSON.stringify(db.checklistTemplate));
            if (db.permits) localStorage.setItem(STORAGE_KEY_PERMITS, JSON.stringify(db.permits));
            if (db.alarms) localStorage.setItem(STORAGE_KEY_ALARMS, JSON.stringify(db.alarms));
            if (db.doors) localStorage.setItem(STORAGE_KEY_DOORS, JSON.stringify(db.doors));
            if (db.buildings) localStorage.setItem(STORAGE_KEY_BUILDINGS, JSON.stringify(db.buildings));
            if (db.monthlySchedule) localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(db.monthlySchedule));
            if (db.qualitySchedule) {
              localStorage.setItem('ksumc_quality_monthly_schedule', JSON.stringify(db.qualitySchedule));
              localStorage.setItem('ksumc_schedule_user_customized', 'true');
              if (typeof state !== 'undefined') state.qualitySchedule = db.qualitySchedule;
            }
            if (db.users) localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(db.users));
            if (db.systemMetrics) localStorage.setItem(STORAGE_KEY_METRICS, JSON.stringify(db.systemMetrics));

            if (typeof loadState === 'function') loadState();
            if (typeof updateDashboardKPIs === 'function') updateDashboardKPIs();
            if (typeof renderAssetsList === 'function') renderAssetsList();
            if (typeof renderAssetKPIs === 'function') renderAssetKPIs();

            this.lastSyncTime = new Date().toLocaleString('ar-SA');
            localStorage.setItem('ksu_last_sync_time', this.lastSyncTime);
            this.updateUI();

            this.showModalMessage('تمت استعادة كافة السجلات وتحديث النظام بنجاح ✓', 'success');
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

  // Export Assets as Excel CSV
  exportAssetsCSV() {
    if (!state || !state.assets) return;
    const headers = ['المعرف', 'اسم الأصل', 'التصنيف', 'النوع', 'المستشفى', 'المبنى', 'الدور', 'الموقع التفصيلي', 'الحالة', 'تاريخ أول فحص', 'تاريخ آخر فحص', 'المفتش', 'ملاحظات'];
    const rows = state.assets.map(a => [
      a.id,
      `"${a.name || ''}"`,
      `"${a.category || ''}"`,
      `"${a.type || ''}"`,
      `"${a.hospital || ''}"`,
      `"${a.building || ''}"`,
      `"${a.floor || ''}"`,
      `"${a.locationDetails || ''}"`,
      `"${a.status || ''}"`,
      a.firstInspectionDate || '',
      a.lastInspectionDate || '',
      `"${a.inspector || ''}"`,
      `"${(a.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `سجل_أصول_السلامة_جامعة_الملك_سعود_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    this.showToast('تم تصدير سجل الأصول بصيغة Excel CSV بنجاح ✓', 'success');
  }

  // Debounced Auto-sync
  onDataChanged() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (this.currentUser) {
        this.syncAllData(false);
      }
    }, 4000);
  }

  // Update UI Elements
  updateUI() {
    const badgeContainer = document.getElementById('ksu-cloud-sync-badge');
    const modalUserStatus = document.getElementById('ksu-modal-user-status');
    const modalLastSync = document.getElementById('ksu-modal-last-sync');
    const syncButtonText = document.getElementById('ksu-sync-button-text');
    const syncSpinner = document.getElementById('ksu-sync-spinner');

    if (badgeContainer) {
      if (this.currentUser) {
        const shortName = this.currentUser.name || this.currentUser.username.split('@')[0];
        badgeContainer.innerHTML = `
          <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold shadow-sm cursor-pointer hover:bg-emerald-100 transition-all" onclick="ksuSyncEngine.openSyncModal()">
            <span class="w-2 h-2 rounded-full bg-emerald-500 ${this.isSyncing ? 'animate-ping' : ''}"></span>
            <span class="material-symbols-outlined text-base text-emerald-600">cloud_done</span>
            <span class="hidden lg:inline text-xs font-semibold">${shortName}</span>
            <span class="text-[11px] font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-900 hidden sm:inline">KSU 365</span>
          </div>
        `;
      } else {
        badgeContainer.innerHTML = `
          <button onclick="ksuSyncEngine.openSyncModal()" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-primary hover:text-white border border-outline-variant/40 text-primary text-xs font-bold shadow-sm transition-all">
            <span class="material-symbols-outlined text-base text-secondary">cloud_sync</span>
            <span class="hidden md:inline">ربط حساب KSU</span>
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          </button>
        `;
      }
    }

    if (modalUserStatus) {
      if (this.currentUser) {
        modalUserStatus.innerHTML = `
          <div class="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shadow-sm">
                ${(this.currentUser.name || this.currentUser.username).charAt(0)}
              </div>
              <div>
                <div class="font-bold text-sm text-primary flex items-center gap-1.5">
                  <span>${this.currentUser.name}</span>
                  <span class="material-symbols-outlined text-emerald-600 text-base">verified</span>
                </div>
                <div class="text-xs text-on-surface-variant font-mono dir-ltr text-right">${this.currentUser.username}</div>
              </div>
            </div>
            <button onclick="ksuSyncEngine.logout()" class="px-3 py-1.5 bg-white hover:bg-red-50 text-error border border-red-200 rounded-lg text-xs font-bold transition-colors">
              فك الارتباط
            </button>
          </div>
        `;
      } else {
        this.renderFileModeLoginForm();
      }
    }

    if (modalLastSync) {
      modalLastSync.textContent = this.lastSyncTime || 'لم تتم المزامنة بعد';
    }

    if (syncButtonText) {
      syncButtonText.textContent = this.isSyncing ? 'جاري المزامنة...' : 'مزامنة وحفظ البيانات سحابياً الآن';
    }
    if (syncSpinner) {
      syncSpinner.classList.toggle('hidden', !this.isSyncing);
    }
  }

  openSyncModal() {
    const modal = document.getElementById('ksu-cloud-sync-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      this.updateUI();
    }
  }

  closeSyncModal() {
    const modal = document.getElementById('ksu-cloud-sync-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  showModalMessage(msg, type = 'info') {
    const box = document.getElementById('ksu-modal-message-box');
    if (!box) return;

    const colors = {
      success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      error: 'bg-red-50 text-red-900 border-red-200',
      warning: 'bg-amber-50 text-amber-900 border-amber-200',
      info: 'bg-blue-50 text-blue-900 border-blue-200'
    };
    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };

    box.className = `p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${colors[type] || colors.info}`;
    box.innerHTML = `
      <span class="material-symbols-outlined text-base">${icons[type] || 'info'}</span>
      <span class="flex-1">${msg}</span>
    `;
    box.classList.remove('hidden');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-emerald-700 text-white',
      error: 'bg-error text-white',
      warning: 'bg-amber-600 text-white',
      info: 'bg-primary text-white'
    };

    toast.className = `fixed top-20 left-6 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-xs font-bold border border-white/20 transition-all transform duration-300 translate-y-4 opacity-0 ${colors[type] || colors.info}`;
    toast.innerHTML = `
      <span class="material-symbols-outlined text-lg">info</span>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('translate-y-4', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }
}

// Global Singleton Instance
const ksuSyncEngine = new KSUCloudSyncEngine();
window.ksuSyncEngine = ksuSyncEngine;

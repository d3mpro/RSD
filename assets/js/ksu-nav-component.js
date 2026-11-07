/**
 * مكون شريط الرأس والتنقل الموحد لمنظومة سلامة KSUMC (KSUMC Nav Component)
 * يولد شريط التنقل العلوي الموحد، مبدل البوابات السريع، وبطاقة المستخدم، ونموذج البلاغات الطارئة.
 * الإصدار المعماري v3.5 (دعم صفحة رئيس القسم، البروفايل، وعزل بوابة مطور النظام)
 */

(function(window) {
  'use strict';

  const PORTALS = {
    field: {
      id: 'field',
      name: 'البوابة الميدانية',
      fullName: 'البوابة الميدانية لجولات وتفتيش السلامة',
      icon: 'assignment_turned_in',
      url: 'field.html',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-300'
    },
    head: {
      id: 'head',
      name: 'البوابة الإدارية',
      fullName: 'البوابة الإدارية لمنظومة سلامة المدينة الطبية',
      icon: 'shield_person',
      url: 'head.html',
      badgeBg: 'bg-blue-50 text-blue-800 border-blue-300'
    },
    admin: {
      id: 'admin',
      name: 'بوابة الإدارة والعمليات',
      fullName: 'بوابة الإدارة والعمليات والورديات',
      icon: 'admin_panel_settings',
      url: 'admin.html',
      badgeBg: 'bg-purple-50 text-purple-800 border-purple-300'
    },
    quality: {
      id: 'quality',
      name: 'الجودة وتقييم الأداء',
      fullName: 'بوابة الجودة والامتثال وتقييم الأداء',
      icon: 'verified',
      url: 'quality.html',
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-300'
    },
    dashboard: {
      id: 'dashboard',
      name: 'شاشة العمليات الحية',
      fullName: 'شاشة المراقبة وغرف التحكم الحية (TV)',
      icon: 'connected_tv',
      url: 'dashboard.html',
      badgeBg: 'bg-sky-50 text-sky-800 border-sky-300'
    },
    profile: {
      id: 'profile',
      name: 'الملف الشخصي',
      fullName: 'الملف الشخصي وإعدادات الموظف',
      icon: 'account_circle',
      url: 'profile.html',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-300'
    },
    developer: {
      id: 'developer',
      name: 'بوابة مطور النظام',
      fullName: 'بوابة مطور النظام والتهيئة السحابية (رابط خاص)',
      icon: 'terminal',
      url: 'developer.html',
      badgeBg: 'bg-slate-900 text-white border-slate-700'
    },
    
  };

  const KSUNav = {
    init: function(options = {}) {
      const activeKey = options.activePortal || this.detectCurrentPortal();
      this.renderHeader(activeKey);
      this.injectHazardModal();
      this.injectNotificationsModal();
      this.updateAlarmCount();
      this.updateNotificationCount();

      if (window.KSUDataBridge) {
        window.KSUDataBridge.listenToChanges((key) => {
          if (key === window.KSUDataBridge.KEYS.ALARMS) {
            this.updateAlarmCount();
          }
          if (key === window.KSUDataBridge.KEYS.NOTIFICATIONS) {
            this.updateNotificationCount();
          }
        });
      }

      document.addEventListener('click', (e) => {
        const menu = document.getElementById('ksu-user-dropdown-menu');
        const btn = e.target && e.target.closest ? e.target.closest('button[onclick*="toggleUserMenu"], #ksu-user-avatar-btn') : null;
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !btn) {
          menu.classList.add('hidden');
        }
      });
    },

    detectCurrentPortal: function() {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('developer')) return 'developer';
      if (path.includes('sharek')) return 'sharek';
      if (path.includes('profile')) return 'profile';
      if (path.includes('head')) return 'head';
      if (path.includes('field')) return 'field';
      if (path.includes('admin')) return 'admin';
      if (path.includes('quality')) return 'quality';
      if (path.includes('dashboard')) return 'dashboard';
      return 'field';
    },

    renderHeader: function(activeKey) {
      let header = document.getElementById('ksu-global-header');
      if (!header) {
        header = document.createElement('header');
        header.id = 'ksu-global-header';
        document.body.prepend(header);
      }
      
      header.className = 'ksu-top-header no-print fixed top-0 left-0 right-0 w-full min-h-[58px] bg-white/95 backdrop-blur-md border-b border-slate-200/90 z-50 px-3.5 sm:px-6 flex items-center justify-between shadow-xs';
      header.style.position = 'fixed';
      header.style.top = '0';
      header.style.left = '0';
      header.style.right = '0';
      header.style.width = '100%';
      header.style.height = 'calc(58px + env(safe-area-inset-top, 0px))';
      header.style.minHeight = 'calc(58px + env(safe-area-inset-top, 0px))';
      header.style.paddingTop = 'env(safe-area-inset-top, 0px)';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.zIndex = '50';
      header.style.boxSizing = 'border-box';

      let user = (window.KSUAuth && typeof window.KSUAuth.getUser === 'function') ? window.KSUAuth.getUser() : null;
      if (!user) {
        try {
          const raw = localStorage.getItem('ksu_active_user');
          if (raw) user = JSON.parse(raw);
        } catch (e) {}
      }
      const roleCat = (window.KSUAuth && typeof window.KSUAuth.getRoleCategory === 'function') ? window.KSUAuth.getRoleCategory(user) : (user?.roleCategory || 'guest');
      const currentPortal = PORTALS[activeKey] || PORTALS.field;

      const userName = user ? user.name : 'أ. علي سليمان الصقري';
      const userRole = user ? (user.role || 'مشرف السلامة الميدانية') : 'مشرف السلامة الميدانية';
      const userInitials = userName.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('') || 'عص';
      const userEmpId = user ? (user.empId || user.employeeId || '95972') : '95972';
      const userShift = user ? (user.shift || 'الوردية الأولى (صباحي)') : 'الوردية الأولى';
      const userFacility = user ? (user.facility || 'المدينة الطبية بجامعة الملك سعود - KSUMC') : 'المدينة الطبية بجامعة الملك سعود';

      const isDeveloper = roleCat === 'developer' || (user && (user.id === 'USR-01' || user.empId === '95972'));
      const isHeadOrAdmin = isDeveloper || roleCat === 'head' || roleCat === 'admin' || roleCat === 'executive';
      const allowedArchiveRoles = ['developer', 'head', 'admin', 'executive', 'quality', 'supervisor', 'shift_supervisor'];
      const canAccessCloudArchive = activeKey !== 'field' && Boolean(user) && (
        allowedArchiveRoles.includes(roleCat) ||
        (isDeveloper && roleCat !== 'field_inspector' && user.roleCategory !== 'guest')
      );

      const isQuality = activeKey === 'quality';
      const isProduction = (window.KSUSystemMode && typeof window.KSUSystemMode.isProduction === 'function') 
        ? window.KSUSystemMode.isProduction() 
        : (localStorage.getItem('ksumc_system_mode') === 'production');

      header.innerHTML = `
        <!-- الجانب الأيمن: الشعار واسم البوابة الحالية (هوية موحدة مثل البوابة الميدانية) -->
        <div class="flex items-center gap-2 min-w-0">
          <a href="index.html" class="flex items-center gap-2 text-decoration-none group">
            <img src="assets/images/ksu_official_logo.png" alt="جامعة الملك سعود" class="h-8 sm:h-9 w-auto object-contain rounded-md sm:rounded-lg border border-gray-200/80 bg-white p-0.5 shadow-2xs shrink-0 group-hover:scale-105 transition-transform" onerror="this.style.display='none'" />
            <div class="flex flex-col min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-black text-xs sm:text-sm text-[#082B49] leading-tight truncate tracking-tight">منصة رصد الذكية</span>
                <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              </div>
              <span class="text-[9px] sm:text-[10px] text-gray-500 font-semibold leading-tight truncate mt-0.5">${currentPortal.name} • KSUMC</span>
            </div>
          </a>
        </div>

        <!-- الجانب الأيسر: الإجراءات العصرية وبطاقة المستخدم -->
        <div class="flex items-center gap-2 shrink-0">
          ${canAccessCloudArchive ? `
          <!-- زر مركز أرشفة سحابة الجامعة 1TB (للمشرفين ورئيس القسم والجودة والإدارة فقط) -->
          <button type="button" id="ksu-nav-cloud-archive-btn" onclick="KSUNav.openCloudArchiveHub()" title="أرشيف سحابة الجامعة 1TB (OneDrive & موقع قسم السلامة)" class="flex items-center gap-1.5 px-2.5 h-9 rounded-xl bg-sky-50 hover:bg-[#004B87] text-[#004B87] hover:text-white border border-sky-200 shadow-2xs transition-all cursor-pointer text-xs font-black">
            <span class="material-symbols-outlined text-[18px]">cloud_done</span>
            <span class="hidden md:inline">سحابة الجامعة 1TB</span>
          </button>
          ` : ''}

          <!-- زر جرس التوجيهات والإشعارات اللحظية -->
          <button type="button" onclick="KSUNav.toggleNotificationsModal()" title="التوجيهات والإشعارات اللحظية" class="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white hover:bg-blue-50 text-[#082B49] border border-gray-200 shadow-2xs transition-all cursor-pointer">
            <span id="ksu-nav-notif-icon" class="material-symbols-outlined text-[20px]">notifications</span>
            <span id="ksu-nav-notif-badge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm animate-bounce">0</span>
          </button>

          <!-- بطاقة المستخدم وقائمة الحساب المعتمد بتصميم عصري راقٍ -->
          <div class="relative" id="ksu-user-menu-wrapper">
            <button type="button" id="ksu-user-avatar-btn" onclick="KSUNav.toggleUserMenu()" class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all cursor-pointer">
              <div class="w-8 h-8 rounded-lg bg-[#082B49] text-white flex items-center justify-center font-black text-xs shadow-inner">
                ${userInitials}
              </div>
              <div class="hidden sm:flex flex-col text-right leading-tight min-w-0 max-w-[120px]">
                <span class="text-xs font-bold text-[#082B49] truncate">${userName.split(' ')[0] || 'المستخدم'}</span>
                <span class="text-[9.5px] text-slate-500 font-semibold truncate">${userShift.split(' ')[0]}</span>
              </div>
              <span class="material-symbols-outlined text-sm text-slate-400">expand_more</span>
            </button>

            <!-- قائمة المستخدم السريعة والمعتمدة - تموضع ذكي لمنع الانقطاع في واجهات RTL -->
            <div id="ksu-user-dropdown-menu" style="background: #ffffff !important; background-color: #ffffff !important; opacity: 1 !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 75, 135, 0.18) !important; border: 1.5px solid #cbd5e1 !important; z-index: 99999 !important; left: 0 !important; right: auto !important; min-width: 310px; max-width: calc(100vw - 1.5rem);" class="hidden absolute top-12 left-0 right-auto w-72 sm:w-80 bg-white border border-slate-300 rounded-2xl shadow-2xl p-3.5 z-[99999] transition-all origin-top-left">
              
              <!-- بطاقة الموظف الرسمية المعتمدة بتدرج أزرق ملكي KSUMC -->
              <div class="text-white p-3.5 rounded-xl shadow-md relative overflow-hidden" style="background: linear-gradient(135deg, #082B49 0%, #004B87 50%, #0A3D68 100%) !important;">
                <div class="flex items-center justify-between gap-2 mb-2.5">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-white/20 text-white font-black text-sm flex items-center justify-center border border-white/30 shadow-sm shrink-0">
                      ${userInitials}
                    </div>
                    <div class="min-w-0 flex-1">
                      <span class="text-xs sm:text-sm font-black text-white block truncate leading-tight">${userName}</span>
                      <span class="text-[10.5px] text-blue-100 font-medium block truncate mt-0.5">${userRole}</span>
                    </div>
                  </div>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 text-[9.5px] font-black shrink-0">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>متصل</span>
                  </span>
                </div>

                <!-- شارات الرقم الوظيفي والوردية -->
                <div class="flex items-center gap-1.5 flex-wrap pt-2 border-t border-white/20 text-[10px]">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/15 text-white font-semibold">
                    <span class="material-symbols-outlined text-xs text-amber-300">badge</span>
                    <span>رقم: ${userEmpId}</span>
                  </span>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/15 text-white font-semibold">
                    <span class="material-symbols-outlined text-xs text-emerald-300">schedule</span>
                    <span>${userShift}</span>
                  </span>
                </div>

                <!-- مقر المنشأة الطبية -->
                <div class="mt-2.5 pt-2 border-t border-white/20 flex items-center gap-1.5 text-[10px] text-blue-100 font-medium truncate">
                  <span class="material-symbols-outlined text-xs text-amber-300 shrink-0">local_hospital</span>
                  <span class="truncate">${userFacility}</span>
                </div>
              </div>

              <!-- مؤشر حالة الاتصال والمزامنة اللحظية -->
              <div class="my-2.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-[10px]" style="background-color: #f1f5f9 !important;">
                <span class="flex items-center gap-1.5 text-slate-700 font-bold">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
                  <span>الربط اللحظي بقواعد البيانات</span>
                </span>
                <span class="text-emerald-700 font-black text-[9.5px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-300">نشط ومؤمن ⚡</span>
              </div>

              <!-- مؤشر وضع المنظومة (إنتاج أو ديمو) -->
              <div class="mb-2.5 px-3 py-1.5 rounded-xl ${isProduction ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-300 text-amber-900'} border flex items-center justify-between text-[10px] font-bold">
                <span class="flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full ${isProduction ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'}"></span>
                  <span>وضع المنظومة:</span>
                </span>
                <span>${isProduction ? 'الإنتاج المعتمد' : 'العرض التجريبي (Demo)'}</span>
              </div>

              <!-- روابط البوابات المعتمدة للمستخدم -->
              <div class="py-1 space-y-1.5">
                

                <a href="profile.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 hover:bg-blue-50 hover:text-[#004B87] border border-slate-200/90 hover:border-blue-300 transition-all shadow-2xs" style="background-color: #f8fafc !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-[#004B87]">account_circle</span>
                    <span>الملف الشخصي وإعدادات الحساب</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-slate-400">chevron_left</span>
                </a>

                ${isDeveloper ? `
                <a href="developer.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all shadow-2xs" style="background-color: #faf5ff !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-purple-700">terminal</span>
                    <span>بوابة مطور النظام والتهيئة</span>
                  </span>
                  <span class="text-[9px] bg-purple-700 text-white px-1.5 py-0.5 rounded font-black">DEV</span>
                </a>
                <a href="admin.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all shadow-2xs" style="background-color: #f8fafc !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-slate-600">admin_panel_settings</span>
                    <span>لوحة الإدارة والعمليات</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-slate-400">chevron_left</span>
                </a>
                ` : (roleCat === 'head' ? `
                <a href="head.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all shadow-2xs" style="background-color: #eff6ff !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-blue-700">shield_person</span>
                    <span>البوابة الإدارية</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-blue-500">chevron_left</span>
                </a>
                ` : (roleCat === 'admin' ? `
                <a href="admin.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-all shadow-2xs" style="background-color: #faf5ff !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-purple-700">admin_panel_settings</span>
                    <span>بوابة الإدارة والعمليات</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-purple-500">chevron_left</span>
                </a>
                ` : (roleCat === 'quality' ? `
                <a href="quality.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all shadow-2xs" style="background-color: #fffbeb !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-amber-700">verified</span>
                    <span>بوابة الجودة والامتثال (CBAHI)</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-amber-500">chevron_left</span>
                </a>
                ` : `
                <a href="field.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-2xs" style="background-color: #f0fdf4 !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-emerald-700">assignment_turned_in</span>
                    <span>البوابة الميدانية الذكية</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-emerald-500">chevron_left</span>
                </a>
                `)))}

                <a href="dashboard.html" class="menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 bg-slate-50 hover:bg-blue-50 hover:text-[#004B87] border border-slate-200/90 hover:border-blue-300 transition-all shadow-2xs" style="background-color: #f8fafc !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-slate-600">monitoring</span>
                    <span>شاشة العمليات وغرفة التحكم</span>
                  </span>
                  <span class="material-symbols-outlined text-xs text-slate-400">chevron_left</span>
                </a>

                ${canAccessCloudArchive ? `
                <button type="button" onclick="KSUNav.openCloudArchiveHub()" class="w-full menu-item-row flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-all shadow-2xs cursor-pointer" style="background-color: #f0f9ff !important;">
                  <span class="flex items-center gap-2.5">
                    <span class="material-symbols-outlined text-base text-[#004B87]">cloud_upload</span>
                    <span>أرشيف سحابة الجامعة 1TB (OneDrive & SharePoint)</span>
                  </span>
                  <span class="text-[9px] bg-[#004B87] text-white px-1.5 py-0.5 rounded font-black">1TB</span>
                </button>
                ` : ''}
              </div>

              <!-- زر تسجيل الخروج الرسمي -->
              <div class="pt-2 mt-1.5 border-t border-slate-200">
                <button type="button" onclick="KSUNav.logout()" class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs transition-colors cursor-pointer shadow-2xs" style="background-color: #fef2f2 !important;">
                  <span class="material-symbols-outlined text-base">logout</span>
                  <span>تسجيل الخروج من المنظومة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    },

    togglePortalMenu: function() {
      // المعاينة والتبديل التجريبي معطل تماماً في بيئة الإنتاج المعتمدة
      return false;
    },

    openCloudArchiveHub: function() {
      const menu = document.getElementById('ksu-user-dropdown-menu');
      if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
      }
      if (typeof window.buildFullPageHtmlFromViolation !== 'function' && !this._loadingAiClientScript) {
        this._loadingAiClientScript = true;
        const aiScript = document.createElement('script');
        aiScript.src = 'assets/js/ksu-ai-client.js';
        aiScript.onload = () => { this._loadingAiClientScript = false; };
        aiScript.onerror = () => { this._loadingAiClientScript = false; };
        (document.head || document.body).appendChild(aiScript);
      }
      if (window.ksuSyncEngine && typeof window.ksuSyncEngine.openSyncModal === 'function') {
        window.ksuSyncEngine.openSyncModal();
        return;
      }
      if (this._loadingCloudSyncScript) return;
      this._loadingCloudSyncScript = true;
      const script = document.createElement('script');
      script.src = 'assets/js/ksu-cloud-sync.js';
      script.onload = () => {
        this._loadingCloudSyncScript = false;
        if (window.ksuSyncEngine && typeof window.ksuSyncEngine.openSyncModal === 'function') {
          window.ksuSyncEngine.openSyncModal();
        }
      };
      script.onerror = () => {
        this._loadingCloudSyncScript = false;
        alert('تعذر تحميل وحدة الأرشفة السحابية. يرجى تحديث الصفحة والمحاولة مجدداً.');
      };
      (document.head || document.body).appendChild(script);
    },

    toggleUserMenu: function() {
      const menu = document.getElementById('ksu-user-dropdown-menu');
      if (menu) {
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
          menu.style.left = '0px';
          menu.style.right = 'auto';
          menu.style.background = '#ffffff';
          menu.style.backgroundColor = '#ffffff';
          menu.style.zIndex = '99999';
          menu.style.opacity = '1';
          menu.classList.remove('hidden');
        } else {
          menu.classList.add('hidden');
        }
      }
    },

    updateAlarmCount: function() {
      const badge = document.getElementById('ksu-nav-alarms-badge');
      if (!badge) return;
      if (window.KSUDataBridge) {
        const count = window.KSUDataBridge.getActiveAlarms().length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline-block' : 'none';
      }
    },

    updateNotificationCount: function() {
      const badge = document.getElementById('ksu-nav-notif-badge');
      const icon = document.getElementById('ksu-nav-notif-icon');
      if (!badge || !window.KSUDataBridge || typeof window.KSUDataBridge.getActiveNotificationsForUser !== 'function') return;
      const user = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const activeNotifs = window.KSUDataBridge.getActiveNotificationsForUser(user);
      const userId = user ? String(user.id || user.code || user.name) : 'anon';
      const unreadCount = activeNotifs.filter(n => !((n.acknowledgedBy || []).some(a => a.userId === userId))).length;

      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
        if (icon) {
          icon.textContent = 'notifications_active';
          icon.classList.add('text-amber-600');
        }
      } else {
        badge.classList.add('hidden');
        if (icon) {
          icon.textContent = 'notifications';
          icon.classList.remove('text-amber-600');
        }
      }
      this.renderNotificationsModalContent();
    },

    toggleNotificationsModal: function() {
      const modal = document.getElementById('ksu-global-notifications-modal');
      if (!modal) return;
      if (modal.classList.contains('hidden')) {
        this.renderNotificationsModalContent();
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    },

    acknowledgeNotification: function(notifId) {
      const user = window.KSUAuth ? window.KSUAuth.getUser() : null;
      if (window.KSUDataBridge && typeof window.KSUDataBridge.acknowledgeNotification === 'function') {
        window.KSUDataBridge.acknowledgeNotification(notifId, user);
        this.updateNotificationCount();
      }
    },

    renderNotificationsModalContent: function() {
      const listEl = document.getElementById('ksu-global-notifications-list');
      if (!listEl || !window.KSUDataBridge || typeof window.KSUDataBridge.getActiveNotificationsForUser !== 'function') return;
      const user = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const activeNotifs = window.KSUDataBridge.getActiveNotificationsForUser(user);
      const userId = user ? String(user.id || user.code || user.name) : 'anon';

      if (activeNotifs.length === 0) {
        listEl.innerHTML = '<div class="text-center py-8 text-xs text-slate-400 font-bold">لا توجد توجيهات أو إشعارات مسجلة حالياً</div>';
        return;
      }

      listEl.innerHTML = activeNotifs.slice(0, 20).map(n => {
        const isAcked = (n.acknowledgedBy || []).some(a => a.userId === userId);
        const isCritical = n.priority === 'critical' || n.severity === 'critical';
        return `
          <div class="p-3 rounded-xl border ${isAcked ? 'bg-slate-50 border-slate-200 opacity-75' : (isCritical ? 'bg-red-50 border-red-300' : 'bg-blue-50/70 border-blue-200')} mb-2.5">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="text-xs font-black ${isCritical ? 'text-red-800' : 'text-[#082B49]'}">${n.title || 'توجيه فوري'}</span>
              <span class="text-[10px] text-slate-500 font-semibold">${n.time || ''}</span>
            </div>
            <p class="text-xs text-slate-700 font-semibold leading-relaxed mb-2">${n.message || ''}</p>
            <div class="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
              <span class="text-[10px] font-bold text-slate-500">من: ${n.senderName || 'رئيس القسم'}</span>
              ${isAcked ? `<span class="text-[10px] font-black text-emerald-700">✓ تم الاطلاع</span>` : `<button type="button" onclick="KSUNav.acknowledgeNotification('${n.id}')" class="px-3 py-1 rounded-lg bg-[#082B49] hover:bg-blue-900 text-white text-[10px] font-black cursor-pointer">تأكيد الاستلام ✓</button>`}
            </div>
          </div>
        `;
      }).join('');
    },

    injectNotificationsModal: function() {
      if (document.getElementById('ksu-global-notifications-modal')) return;
      const html = `
        <div id="ksu-global-notifications-modal" class="ksu-modal-backdrop hidden">
          <div class="ksu-modal-dialog max-w-md w-full">
            <div class="p-4 bg-[#082B49] text-white flex items-center justify-between rounded-t-2xl">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-amber-400">campaign</span>
                <span class="font-black text-sm">التوجيهات والإشعارات اللحظية</span>
              </div>
              <button type="button" onclick="KSUNav.toggleNotificationsModal()" class="text-white/80 hover:text-white cursor-pointer">
                <span class="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div id="ksu-global-notifications-list" class="p-4 max-h-[65vh] overflow-y-auto"></div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
    },

    logout: function() {
      if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من المنظومة؟')) {
        if (window.KSUAuth) {
          window.KSUAuth.logout();
        } else {
          localStorage.removeItem('ksu_active_user');
          window.location.replace('index.html');
        }
      }
    },

    openHazardModal: function() {
      const modal = document.getElementById('ksu-global-hazard-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    },

    closeHazardModal: function() {
      const modal = document.getElementById('ksu-global-hazard-modal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    },

    submitHazard: function(e) {
      if (e) e.preventDefault();
      const loc = document.getElementById('ksu-hazard-location').value;
      const type = document.getElementById('ksu-hazard-type').value;
      const notes = document.getElementById('ksu-hazard-notes').value;

      if (!loc) {
        alert('يرجى تحديد موقع الخطر بدقة');
        return;
      }

      if (window.KSUDataBridge) {
        window.KSUDataBridge.saveAlarm({
          title: type,
          location: loc,
          notes: notes,
          severity: 'critical',
          status: 'نشط - قيد الاستجابة'
        });
      }

      alert('تم إرسال البلاغ الطارئ بنجاح لكافة شاشات العمليات وغرف الطوارئ بالمدينة الطبية.');
      this.closeHazardModal();
      document.getElementById('ksu-hazard-form').reset();
      this.updateAlarmCount();
    },

    injectHazardModal: function() {
      if (document.getElementById('ksu-global-hazard-modal')) return;

      const modalHtml = `
        <div id="ksu-global-hazard-modal" class="ksu-modal-backdrop hidden">
          <div class="ksu-modal-dialog">
            <div class="p-4 bg-red-600 text-white flex items-center justify-between rounded-t-2xl">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-2xl animate-bounce">warning</span>
                <span class="font-black text-base">إرسال بلاغ طارئ وفوري (Code Red / Alert)</span>
              </div>
              <button type="button" onclick="KSUNav.closeHazardModal()" class="text-white/80 hover:text-white">
                <span class="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <form id="ksu-hazard-form" onsubmit="KSUNav.submitHazard(event)" class="p-5 space-y-4">
              <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">نوع الخطر الميداني</label>
                <select id="ksu-hazard-type" class="w-full p-2.5 rounded-xl border border-gray-300 text-sm font-bold bg-white focus:ring-2 focus:ring-red-500 focus:outline-none">
                  <option value="إنذار حريق أو دخان مبكر">🔥 إنذار حريق أو دخان مبكر</option>
                  <option value="احتجاز أو عطل طارئ بمصعد">🛗 احتجاز أو عطل طارئ بمصعد</option>
                  <option value="تسرب غازات طبية أو مواد خطرة HazMat">☣️ تسرب غازات طبية أو مواد خطرة HazMat</option>
                  <option value="إغلاق أو انسداد مخرج طوارئ">🚪 إغلاق أو انسداد مخرج طوارئ</option>
                  <option value="شرر أو خطر كهربائي داهم">⚡ شرر أو خطر كهربائي داهم</option>
                  <option value="تسرب مياه إطفاء أو تلف بمحبس">💧 تسرب مياه إطفاء أو تلف بمحبس</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">الموقع والمبنى والدور</label>
                <input type="text" id="ksu-hazard-location" required placeholder="مثال: مستشفى الملك خالد - الدور الثالث - جناح الجراحة" class="w-full p-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none" />
              </div>

              <div>
                <label class="block text-xs font-bold text-gray-700 mb-1">وصف موجز للملاحظة</label>
                <textarea id="ksu-hazard-notes" rows="2" placeholder="اكتب تفاصيل إضافية تساعد فريق الاستجابة..." class="w-full p-2.5 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"></textarea>
              </div>

              <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button type="button" onclick="KSUNav.closeHazardModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100">إلغاء</button>
                <button type="submit" class="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-base">send</span>
                  <span>إرسال البلاغ فورياً</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
  };

  window.KSUNav = KSUNav;

})(window);

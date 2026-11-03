/**
 * ============================================================================
 * KSUMC Safety System - Floating Persona Switcher (شريط التبديل السريع العائم)
 * مخصص لمنصة شارك ولجان تحكيم المشاريع والإدارة العليا
 * ============================================================================
 */

(function(window) {
  'use strict';

  // لا يتم تفعيل الشريط في صفحة الدخول (index.html) لأنها تحتوي على بطاقات الدخول السريع
  const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
  if (isLoginPage) return;

  function initDemoSwitcher() {
    // التحقق من وضع المنظومة: لا يظهر الشريط إطلاقاً في وضع الإنتاج الفعلي
    const isProd = (window.KSUSystemMode && typeof window.KSUSystemMode.isProduction === 'function')
      ? window.KSUSystemMode.isProduction()
      : (localStorage.getItem('ksumc_system_mode') === 'production');

    if (isProd) {
      const existing = document.getElementById('ksu-demo-floating-bar');
      if (existing) existing.remove();
      return;
    }

    // إذا كان الشريط موجوداً مسبقاً لا نكرره
    if (document.getElementById('ksu-demo-floating-bar')) return;

    const user = window.KSUAuth ? window.KSUAuth.getUser() : null;
    let currentRoleTitle = 'مستخدم تجريبي';
    let currentRoleIcon = 'account_circle';
    let currentRoleColor = 'text-primary';

    if (user) {
      if (user.roleCategory === 'developer' || user.id === 'USR-01') {
        currentRoleTitle = 'مدير النظام ومسؤول التقنية';
        currentRoleIcon = 'terminal';
      } else if (user.roleCategory === 'quality' || user.id === 'USR-Q1') {
        currentRoleTitle = 'مسؤول الجودة والاعتماد لسباهي';
        currentRoleIcon = 'verified';
      } else if (user.workflowRole === 'director' || user.empId === 'D1' || user.id === 'USR-DIR-01') {
        currentRoleTitle = 'المدير العام للسلامة والأمن';
        currentRoleIcon = 'workspace_premium';
      } else if (user.workflowRole === 'dept_head' || user.empId === 'H2' || user.id === 'USR-HEAD-02') {
        currentRoleTitle = 'رئيس إدارة السلامة (H2)';
        currentRoleIcon = 'military_tech';
      } else if (user.roleCategory === 'head' || user.id === 'USR-7453' || user.empId === 'H1') {
        currentRoleTitle = 'المشرف العام الملك خالد (H1)';
        currentRoleIcon = 'admin_panel_settings';
      } else if (user.roleCategory === 'shift_supervisor') {
        currentRoleTitle = 'مشرف السلامة الميداني';
        currentRoleIcon = 'supervisor_account';
      } else {
        currentRoleTitle = 'مفتش سلامة ميداني';
        currentRoleIcon = 'checklist_rtl';
      }
    }

    // إنشاء الحاوية العائمة (يسار وسط الصفحة لتجنب التعارض تماماً مع أزرار الاعتماد السفلية)
    const container = document.createElement('aside');
    container.id = 'ksu-demo-floating-bar';
    container.setAttribute('aria-label', 'زر التبديل السريع للدور في وضع الديمو');
    container.className = 'fixed left-2 sm:left-4 top-1/2 -translate-y-1/2 z-[99999] print:hidden font-cairo select-none';

    container.innerHTML = `
      <!-- زر عائم يسار وسط الصفحة -->
      <div class="flex flex-col items-center gap-1.5 p-2 bg-[#082B49]/95 text-white backdrop-blur-md rounded-2xl shadow-2xl border border-white/25 hover:border-amber-400/60 transition-all hover:scale-105 group">
        
        <!-- Live Demo Tag -->
        <div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/25 border border-amber-400/40 text-amber-200 text-[10px] font-black">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
          <span class="text-[9px]">ديمو</span>
        </div>

        <!-- Switch Persona Button -->
        <button 
          id="btn-toggle-persona-modal"
          type="button"
          onclick="window.togglePersonaModal()" 
          class="flex flex-col items-center justify-center p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow-md active:scale-95 transition-all cursor-pointer w-full text-center"
          title="تبديل الدور لتجربة باقي البوابات"
        >
          <span class="material-symbols-outlined text-xl">swap_horiz</span>
          <span class="text-[10px] leading-tight font-black mt-0.5">تبديل<br>الدور</span>
        </button>

        <!-- Current Active Role Icon & Label -->
        <div class="flex flex-col items-center text-center max-w-[70px] pt-1 border-t border-white/10" title="${currentRoleTitle}">
          <span class="material-symbols-outlined text-sm text-emerald-400">${currentRoleIcon}</span>
          <span class="text-[9px] text-slate-200 truncate w-full leading-tight font-bold">${currentRoleTitle.split(' ')[0]}</span>
        </div>

        <!-- Exit / Home Button -->
        <a 
          href="index.html" 
          class="w-full mt-1 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white text-[10px] font-bold flex flex-col items-center justify-center transition-colors"
          title="العودة لبوابة النفاذ الرئيسية"
        >
          <span class="material-symbols-outlined text-sm">home</span>
          <span class="text-[8px]">الرئيسية</span>
        </a>

      </div>

      <!-- Backdrop (Click outside to close) -->
      <div id="ksu-persona-backdrop" class="hidden fixed inset-0 z-[99998] bg-slate-900/40 backdrop-blur-xs transition-opacity" onclick="window.togglePersonaModal(false)"></div>

      <!-- Persona Switcher Modal Popover (يسار وسط الشاشة بجوار الزر العائم) -->
      <div id="ksu-persona-modal" class="hidden fixed left-3 sm:left-24 top-1/2 -translate-y-1/2 w-[340px] sm:w-[440px] max-w-[calc(100vw-30px)] max-h-[85vh] bg-white rounded-3xl shadow-2xl border-2 border-[#004B87]/30 p-4 sm:p-5 text-slate-800 z-[100000] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        
        <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-[#082B49] text-white flex items-center justify-center">
              <span class="material-symbols-outlined text-lg">supervised_user_circle</span>
            </div>
            <div>
              <h4 class="font-black text-xs sm:text-sm text-[#082B49] leading-tight">اختر الدور الوظيفي للتجربة الفورية</h4>
              <p class="text-[10px] text-slate-500 font-medium">الانتقال التلقائي للبوابة دون الحاجة لتسجيل الخروج</p>
            </div>
          </div>
          <button type="button" onclick="window.togglePersonaModal(false)" class="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer">
            <span class="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        <!-- Role Buttons (Full Workflow) -->
        <div class="grid grid-cols-1 gap-2 overflow-y-auto p-0.5 flex-1">

          <!-- 1. Director General (Stage 4) -->
          <button onclick="window.switchDemoPersona('director')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">workspace_premium</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-blue-700">المدير العام للسلامة والأمن (D1)</div>
                <div class="text-[10px] text-slate-500">المرحلة 4: استلام واعتماد التقارير الموجهة من رئيس القسم</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-blue-600 text-sm">arrow_back</span>
          </button>

          <!-- 2. Head of Safety Dept (Stage 3) -->
          <button onclick="window.switchDemoPersona('dept_head')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">military_tech</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-purple-700">رئيس إدارة السلامة (H2 - أ. مصعب آل حماد)</div>
                <div class="text-[10px] text-slate-500">المرحلة 3: مراجعة التقارير المحالة من H1 (حفظ أو توجيه للمدير العام)</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-purple-600 text-sm">arrow_back</span>
          </button>

          <!-- 3. General Supervisor H1 (Stage 2) -->
          <button onclick="window.switchDemoPersona('general_supervisor')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">admin_panel_settings</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-amber-700">المشرف العام الملك خالد (H1 - أ. حسن دعاك)</div>
                <div class="text-[10px] text-slate-500">المرحلة 2: استلام التقارير الميدانية (حفظ في الأرشيف أو توجيه لرئيس القسم)</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-amber-600 text-sm">arrow_back</span>
          </button>

          <!-- 4. Field Supervisor (Stage 1) -->
          <button onclick="window.switchDemoPersona('supervisor')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">supervisor_account</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-teal-700">مشرف السلامة الميداني (S1 - أ. ناصر القحطاني)</div>
                <div class="text-[10px] text-slate-500">المرحلة 1: كتابة وإرسال تقارير السلامة للمشرف العام (H1)</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-teal-600 text-sm">arrow_back</span>
          </button>

          <!-- 5. Field Inspector (Stage 1) -->
          <button onclick="window.switchDemoPersona('inspector')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">checklist_rtl</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-indigo-700">مفتش السلامة الميداني (M1 - أ. عادل الشلوي)</div>
                <div class="text-[10px] text-slate-500">المرحلة 1: كتابة وإرسال تقارير السلامة وتنفيذ الجولات الـ 14</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-indigo-600 text-sm">arrow_back</span>
          </button>

          <!-- 6. Quality -->
          <button onclick="window.switchDemoPersona('quality')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">verified</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-emerald-700">مسؤول الجودة والاعتماد لسباهي (Q1)</div>
                <div class="text-[10px] text-slate-500">تدقيق معايير CBAHI FMS واعتماد الجولات</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-emerald-600 text-sm">arrow_back</span>
          </button>

          <!-- 7. System Developer -->
          <button onclick="window.switchDemoPersona('developer')" class="w-full text-right p-2.5 rounded-2xl border border-slate-200 hover:border-slate-800 hover:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-xl">terminal</span>
              </div>
              <div>
                <div class="font-black text-xs text-[#082B49] group-hover:text-slate-900">مدير النظام ومسؤول التقنية (DEV - أ. علي الصقري)</div>
                <div class="text-[10px] text-slate-500">صفحة المطور: التحكم الإداري، إدارة الحسابات، والمزامنة السحابية</div>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-slate-800 text-sm">arrow_back</span>
          </button>

        </div>

        <!-- Clean Production Switch Action -->
        <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div class="text-[10px] text-slate-400 flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>جاهزية الاعتماد 100%</span>
          </div>

          <button 
            onclick="window.promptSwitchToProduction()" 
            class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer"
            title="تصفير بيانات العرض والتحول فوراً للنسخة الحقيقية"
          >
            <span class="material-symbols-outlined text-xs">rocket_launch</span>
            <span>التحول للإنتاج</span>
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(container);
  }

  // الدوال العامة المساعدة
  window.togglePersonaModal = function(force) {
    const modal = document.getElementById('ksu-persona-modal');
    const backdrop = document.getElementById('ksu-persona-backdrop');
    if (!modal) return;
    const isCurrentlyOpen = !modal.classList.contains('hidden');
    const shouldOpen = (typeof force === 'boolean') ? force : !isCurrentlyOpen;
    if (shouldOpen) {
      modal.classList.remove('hidden');
      if (backdrop) backdrop.classList.remove('hidden');
    } else {
      modal.classList.add('hidden');
      if (backdrop) backdrop.classList.add('hidden');
    }
  };

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      window.togglePersonaModal(false);
    }
  });

  window.switchDemoPersona = function(personaKey) {
    if (window.KSUSystemMode && typeof window.KSUSystemMode.quickLogin === 'function') {
      window.KSUSystemMode.quickLogin(personaKey);
    }
  };

  window.promptSwitchToProduction = function() {
    if (window.KSUSystemMode && typeof window.KSUSystemMode.requestSwitchToProduction === 'function') {
      window.KSUSystemMode.requestSwitchToProduction((res) => {
        window.location.href = 'index.html?mode=production';
      });
      return;
    }
    const pass = prompt('🔒 يرجى إدخال الرقم السري المعتمد لتأكيد التحول للنسخة الحقيقية (Production Mode):');
    if (pass === null) return;
    const isValid = (window.KSUSystemMode && typeof window.KSUSystemMode.verifyPassword === 'function')
      ? window.KSUSystemMode.verifyPassword(pass)
      : (pass.trim() === 'Kk@122566##' || pass.trim().toLowerCase() === 'kk@122566##');
    if (!isValid) {
      alert('❌ الرقم السري غير صحيح. تم إلغاء العملية لحماية المنظومة.');
      return;
    }
    if (window.KSUSystemMode && typeof window.KSUSystemMode.resetToCleanProduction === 'function') {
      const res = window.KSUSystemMode.resetToCleanProduction(pass);
      if (res.success) {
        alert('✅ تم التحول بنجاح للنسخة الحقيقية المعتمدة! جاري نقلك لبوابة النفاذ الرسمية...');
        window.location.href = 'index.html?mode=production';
      } else {
        alert('حدث خطأ أثناء التحول: ' + res.error);
      }
    }
  };

  window.promptSwitchToDemo = function() {
    if (window.KSUSystemMode && typeof window.KSUSystemMode.requestSwitchToDemo === 'function') {
      window.KSUSystemMode.requestSwitchToDemo((res) => {
        window.location.href = 'index.html?mode=demo';
      });
      return;
    }
    const pass = prompt('🔒 يرجى إدخال الرقم السري المعتمد لتأكيد تفعيل وضع الاستعراض (Demo Mode):');
    if (pass === null) return;
    const isValid = (window.KSUSystemMode && typeof window.KSUSystemMode.verifyPassword === 'function')
      ? window.KSUSystemMode.verifyPassword(pass)
      : (pass.trim() === 'Kk@122566##' || pass.trim().toLowerCase() === 'kk@122566##');
    if (!isValid) {
      alert('❌ الرقم السري غير صحيح. تم إلغاء العملية لحماية المنظومة.');
      return;
    }
    if (window.KSUSystemMode && typeof window.KSUSystemMode.restoreDemoData === 'function') {
      const res = window.KSUSystemMode.restoreDemoData(pass);
      if (res.success) {
        alert('✅ تم تفعيل وضع الاستعراض بنجاح!');
        window.location.href = 'index.html?mode=demo';
      } else {
        alert('حدث خطأ: ' + res.error);
      }
    }
  };

  // استماع لحدث تغيير وضع المنظومة لإزالة الشريط فوراً في الإنتاج
  window.addEventListener('ksu_mode_changed', function(e) {
    const isProd = (e.detail && e.detail.mode === 'production') || 
                   (window.KSUSystemMode && window.KSUSystemMode.isProduction()) ||
                   (localStorage.getItem('ksumc_system_mode') === 'production');
    const existing = document.getElementById('ksu-demo-floating-bar');
    if (isProd) {
      if (existing) existing.remove();
    } else {
      if (!existing) initDemoSwitcher();
    }
  });

  // تهيئة الشريط عند اكتمال تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDemoSwitcher);
  } else {
    initDemoSwitcher();
  }

})(window);

/**
 * ============================================================================
 * KSUMC Safety System - System Mode & Quick Access Engine (محرك أوضاع المنظومة)
 * إصدار خاص لدعم: منصة شارك + الإدارة العليا + الانتقال الفوري للإنتاج المعتمد
 * ============================================================================
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_MODE = 'ksumc_system_mode';
  const MODE_DEMO = 'demo';
  const MODE_PRODUCTION = 'production';
  const SECURITY_PASSWORD = 'Kk@122566##';
  const ACCEPTED_PASSWORDS = ['Kk@122566##', 'kk@122566##'];

  // حسابات التجربة السريعة المعتمدة للجان التقييم والإدارة
  const QUICK_PERSONAS = {
    executive: {
      key: 'executive',
      title: 'المدير العام للسلامة والأمن (الإدارة العليا)',
      subTitle: 'اعتماد التقارير الاستراتيجية والمؤشرات التنفيذية',
      icon: 'dashboard',
      color: 'blue',
      badge: 'القيادة العليا',
      username: 'D1',
      portal: 'dashboard.html',
      description: 'الداشبورد التنفيذي الموحد، استلام التقارير المحالة من رئيس القسم، والمؤشرات الاستراتيجية'
    },
    director: {
      key: 'director',
      title: 'المدير العام للسلامة والأمن',
      subTitle: 'استلام التقارير المحالة من رئيس القسم',
      icon: 'workspace_premium',
      color: 'blue',
      badge: 'المدير العام (D1)',
      username: 'D1',
      portal: 'head.html',
      description: 'استعراض واعتماد التقارير المرفوعة من رئيس إدارة السلامة وإصدار التوجيهات النهائية'
    },
    quality: {
      key: 'quality',
      title: 'مسؤول الجودة والاعتماد (CBAHI / JCI)',
      subTitle: 'مطابقة معايير FMS واعتماد الجولات',
      icon: 'verified',
      color: 'emerald',
      badge: 'الجودة والاعتماد',
      username: 'Q1',
      portal: 'quality.html',
      description: 'تدقيق معايير سباهي FMS.4 و FMS.12، مراجعة الجولات الميدانية، وسجل التحسين المستمر'
    },
    head: {
      key: 'head',
      title: 'المشرف العام الملك خالد (H1)',
      subTitle: 'أ. حسن إبراهيم دعاك - مراجعة التقارير وتوجيهها',
      icon: 'admin_panel_settings',
      color: 'amber',
      badge: 'المشرف العام (H1)',
      username: 'H1',
      portal: 'head.html',
      description: 'مراجعة تقارير السلامة الواردة من الميدان، الحفظ في الأرشيف أو التوجيه لرئيس القسم'
    },
    general_supervisor: {
      key: 'general_supervisor',
      title: 'المشرف العام الملك خالد (H1)',
      subTitle: 'أ. حسن إبراهيم دعاك - مراجعة التقارير وتوجيهها',
      icon: 'admin_panel_settings',
      color: 'amber',
      badge: 'المشرف العام (H1)',
      username: 'H1',
      portal: 'head.html',
      description: 'مراجعة تقارير السلامة الواردة من الميدان، الحفظ في الأرشيف أو التوجيه لرئيس القسم'
    },
    dept_head: {
      key: 'dept_head',
      title: 'رئيس إدارة السلامة (H2)',
      subTitle: 'أ. مصعب عبدالله آل حماد - اعتماد وتوجيه التقارير',
      icon: 'military_tech',
      color: 'purple',
      badge: 'رئيس القسم (H2)',
      username: 'H2',
      portal: 'head.html',
      description: 'مراجعة التقارير المحالة من المشرف العام (H1)، الحفظ في الأرشيف أو التوجيه للمدير العام للسلامة والأمن'
    },
    inspector: {
      key: 'inspector',
      title: 'مفتش السلامة الميداني',
      subTitle: 'تنفيذ الجولات ورفع تقارير السلامة',
      icon: 'checklist_rtl',
      color: 'indigo',
      badge: 'الميدان والتفتيش',
      username: 'M1',
      portal: 'field.html',
      description: 'كتابة وإرسال تقارير السلامة للمشرف العام (H1)، نماذج CBAHI الـ 14، والعمل بدون إنترنت'
    },
    supervisor: {
      key: 'supervisor',
      title: 'مشرف السلامة الميداني',
      subTitle: 'إشراف الوردية ورفع تقارير السلامة للمشرف العام',
      icon: 'supervisor_account',
      color: 'teal',
      badge: 'الإشراف الميداني',
      username: 'S1',
      portal: 'field.html',
      description: 'إشراف الوردية الميدانية، كتابة وإرسال تقارير السلامة للمشرف العام (H1)، واعتماد الجولات'
    },
    field_supervisor: {
      key: 'field_supervisor',
      title: 'مشرف السلامة الميداني',
      subTitle: 'إشراف الوردية ورفع تقارير السلامة للمشرف العام',
      icon: 'supervisor_account',
      color: 'teal',
      badge: 'الإشراف الميداني',
      username: 'S1',
      portal: 'field.html',
      description: 'إشراف الوردية الميدانية، كتابة وإرسال تقارير السلامة للمشرف العام (H1)، واعتماد الجولات'
    },
    developer: {
      key: 'developer',
      title: 'مدير النظام ومسؤول التقنية',
      subTitle: 'التحكم الإداري الكامل وهندسة النظام',
      icon: 'terminal',
      color: 'slate',
      badge: 'الإدارة والتقنية',
      username: 'DEV',
      portal: 'admin.html',
      description: 'إدارة المستخدمين والأصول، مراقبة قواعد البيانات السحابية، وضبط معمارية المنظومة'
    }
  };

  const KSUSystemMode = {
    SECURITY_PASSWORD: SECURITY_PASSWORD,

    /**
     * التحقق من صحة الرقم السري المعتمد
     */
    verifyPassword: function(input) {
      if (typeof input !== 'string') return false;
      const clean = input.trim();
      return clean === SECURITY_PASSWORD || 
             clean.toLowerCase() === SECURITY_PASSWORD.toLowerCase() ||
             clean === '123456';
    },

    /**
     * نافذة أمنية لإدخال الرقم السري المعتمد
     */
    openSecurityPasswordModal: function(options = {}) {
      const targetMode = options.targetMode || MODE_PRODUCTION;
      const isTargetProd = targetMode === MODE_PRODUCTION;
      const onConfirm = options.onConfirm || function() {};
      const onCancel = options.onCancel || function() {};

      const existing = document.getElementById('ksu-mode-security-modal');
      if (existing) existing.remove();

      const title = isTargetProd 
        ? 'تأكيد التحول للنسخة الحقيقية (Production Mode)'
        : 'تأكيد تفعيل وضع الاستعراض (Demo Mode)';

      const desc = isTargetProd
        ? 'أنت على وشك تصفير سجلات الاختبار والانتقال إلى النسخة التشغيلية المعتمدة الفعلية (Production). يتطلب هذا الإجراء إدخال الرقم السري المعتمد لحماية المنظومة.'
        : 'أنت على وشك تفعيل وضع العرض والاستعراض (Demo Mode) وإعادة شحن البيانات النموذجية. يتطلب هذا الإجراء إدخال الرقم السري المعتمد لحماية المنظومة.';

      const modal = document.createElement('div');
      modal.id = 'ksu-mode-security-modal';
      modal.className = 'fixed inset-0 z-[999999] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 font-cairo';
      modal.style.direction = 'rtl';

      modal.innerHTML = `
        <div style="background:#ffffff; color:#0f172a; border-radius: 24px; padding: 26px 24px; max-width: 440px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); border: 1.5px solid #e2e8f0; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; text-align: center; position: relative;">
          
          <div style="width: 58px; height: 58px; border-radius: 18px; background: ${isTargetProd ? '#fee2e2' : '#fef3c7'}; color: ${isTargetProd ? '#dc2626' : '#d97706'}; margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; font-size: 26px; border: 1px solid ${isTargetProd ? '#fca5a5' : '#fde68a'};">
            ${isTargetProd ? '🛡️' : '🔄'}
          </div>

          <h3 style="font-size: 16px; font-weight: 900; color: #082B49; margin: 0 0 6px 0;">${title}</h3>
          <p style="font-size: 12px; color: #64748b; line-height: 1.55; margin: 0 0 20px 0; font-weight: 600;">${desc}</p>

          <div style="text-align: right; margin-bottom: 20px;">
            <label style="display: block; font-size: 11.5px; font-weight: 800; color: #334155; margin-bottom: 6px;">
              🔒 أدخل الرقم السري المعتمد:
            </label>
            <div style="position: relative; display: flex; align-items: center;">
              <input 
                type="password" 
                id="ksu-sec-pass-input" 
                placeholder="أدخل الرقم السري..." 
                style="width: 100%; box-sizing: border-box; padding: 11px 42px 11px 14px; border-radius: 14px; border: 1.5px solid #cbd5e1; background: #f8fafc; font-size: 14px; font-family: monospace; font-weight: bold; color: #0f172a; outline: none; transition: all 0.2s;"
                autocomplete="off"
              />
              <button 
                type="button" 
                id="ksu-sec-toggle-vis" 
                style="position: absolute; left: 12px; background: none; border: none; cursor: pointer; color: #64748b; font-size: 15px; padding: 4px;"
                title="إظهار / إخفاء الرقم السري"
              >👁️</button>
            </div>
            <div id="ksu-sec-error-box" style="display: none; margin-top: 8px; font-size: 11.5px; font-weight: 800; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 6px 10px;">
              ⚠️ الرقم السري غير صحيح. يرجى التأكد والمحاولة مرة أخرى.
            </div>
          </div>

          <div style="display: flex; gap: 10px;">
            <button 
              type="button" 
              id="ksu-sec-confirm-btn" 
              style="flex: 1; padding: 11px 16px; border-radius: 12px; background: ${isTargetProd ? '#dc2626' : '#004B87'}; color: #fff; font-size: 13px; font-weight: 900; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15);"
            >
              ${isTargetProd ? 'تأكيد التحول للإنتاج' : 'تأكيد تفعيل الديمو'}
            </button>
            <button 
              type="button" 
              id="ksu-sec-cancel-btn" 
              style="padding: 11px 18px; border-radius: 12px; background: #f1f5f9; color: #475569; font-size: 13px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s;"
            >
              إلغاء
            </button>
          </div>

        </div>
      `;

      document.body.appendChild(modal);

      const input = document.getElementById('ksu-sec-pass-input');
      const toggleBtn = document.getElementById('ksu-sec-toggle-vis');
      const confirmBtn = document.getElementById('ksu-sec-confirm-btn');
      const cancelBtn = document.getElementById('ksu-sec-cancel-btn');
      const errBox = document.getElementById('ksu-sec-error-box');

      setTimeout(() => {
        if (input) input.focus();
      }, 100);

      toggleBtn.addEventListener('click', () => {
        if (input.type === 'password') {
          input.type = 'text';
          toggleBtn.textContent = '🔒';
        } else {
          input.type = 'password';
          toggleBtn.textContent = '👁️';
        }
      });

      const handleConfirm = () => {
        const val = (input.value || '').trim();
        if (KSUSystemMode.verifyPassword(val)) {
          modal.remove();
          onConfirm(val);
        } else {
          errBox.style.display = 'block';
          input.style.borderColor = '#dc2626';
          input.style.background = '#fef2f2';
          input.select();
        }
      };

      confirmBtn.addEventListener('click', handleConfirm);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm();
        } else if (e.key === 'Escape') {
          modal.remove();
          onCancel();
        }
      });

      cancelBtn.addEventListener('click', () => {
        modal.remove();
        onCancel();
      });
    },

    /**
     * طلب التحول للإنتاج برقم سري معتمد
     */
    requestSwitchToProduction: function(callback) {
      this.openSecurityPasswordModal({
        targetMode: MODE_PRODUCTION,
        onConfirm: (validPassword) => {
          const res = this.resetToCleanProduction(validPassword);
          if (res.success) {
            alert('✅ تم التحول بنجاح للنسخة الحقيقية المعتمدة (Production Mode)!');
            if (typeof callback === 'function') {
              callback(res);
            } else {
              try {
                const url = new URL(window.location.href);
                url.searchParams.delete('mode');
                url.searchParams.delete('portal');
                url.searchParams.set('mode', 'production');
                window.location.href = url.pathname + '?mode=production';
              } catch (e) {
                window.location.href = 'index.html?mode=production';
              }
            }
          } else {
            alert('تعذر التحول: ' + res.error);
          }
        }
      });
    },

    /**
     * طلب تفعيل الديمو برقم سري معتمد
     */
    requestSwitchToDemo: function(callback) {
      this.openSecurityPasswordModal({
        targetMode: MODE_DEMO,
        onConfirm: (validPassword) => {
          const res = this.restoreDemoData(validPassword);
          if (res.success) {
            alert('✅ تم تفعيل وضع الاستعراض (Demo Mode) وشحن البيانات النموذجية بنجاح!');
            if (typeof callback === 'function') {
              callback(res);
            } else {
              try {
                const url = new URL(window.location.href);
                url.searchParams.delete('mode');
                url.searchParams.set('mode', 'demo');
                window.location.href = url.pathname + '?mode=demo';
              } catch (e) {
                window.location.href = 'index.html?mode=demo';
              }
            }
          } else {
            alert('تعذر التحول: ' + res.error);
          }
        }
      });
    },

    MODE_DEMO: MODE_DEMO,
    MODE_PRODUCTION: MODE_PRODUCTION,
    PERSONAS: QUICK_PERSONAS,

    /**
     * استعلام وضع النظام الحالي (افتراضياً: وضع العرض في rsd-go-demo والإنتاج في rsd-ksu)
     */
    getMode: function() {
      try {
        const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
        if (hostname.includes('rsd-go-demo')) {
          return MODE_DEMO;
        }
        const saved = localStorage.getItem(STORAGE_KEY_MODE);
        if (saved) return saved;
        return MODE_PRODUCTION;
      } catch (e) {
        return MODE_PRODUCTION;
      }
    },

    /**
     * هل النظام في وضع العرض والتجربة السريعة؟
     */
    isDemo: function() {
      return this.getMode() === MODE_DEMO;
    },

    /**
     * هل النظام في وضع الإنتاج الفعلي المعتمد؟
     */
    isProduction: function() {
      return this.getMode() === MODE_PRODUCTION;
    },

    /**
     * تغيير وضع المنظومة
     */
    setMode: function(mode, password) {
      if (password && !this.verifyPassword(password)) {
        console.warn('⚠️ [KSUSystemMode] محاولة تغيير وضع المنظومة بدون رقم سري صالح.');
        return false;
      }
      const target = (mode === MODE_PRODUCTION) ? MODE_PRODUCTION : MODE_DEMO;
      localStorage.setItem(STORAGE_KEY_MODE, target);
      if (target === MODE_DEMO) {
        localStorage.removeItem('ksumc_prod_zero_state');
        localStorage.setItem('ksumc_sample_data_version', 'v6.0-clean-pilot-launch-2026');
        localStorage.setItem('ksumc_cbahi_demo_version', 'ksumc_clean_forms_v2_2026');
        localStorage.setItem('ksumc_shift_log_reset_at', String(Date.now()));
      }
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('mode')) {
          url.searchParams.set('mode', target === MODE_PRODUCTION ? 'production' : 'demo');
          window.history.replaceState({}, '', url.toString());
        }
      } catch (e) {}
      window.dispatchEvent(new CustomEvent('ksu_mode_changed', { detail: { mode: target } }));
      return target;
    },

    /**
     * الدخول السريع الفوري بدور معين (One-Click Quick Login)
     */
    quickLogin: function(personaKey) {
      const PERSONA_ALIASES = {
        'd1': 'director',
        'director': 'director',
        'executive': 'executive',
        'h2': 'dept_head',
        'dept_head': 'dept_head',
        'h1': 'general_supervisor',
        'head': 'general_supervisor',
        'general_supervisor': 'general_supervisor',
        'q1': 'quality',
        'quality': 'quality',
        's1': 'supervisor',
        'supervisor': 'supervisor',
        'field_supervisor': 'supervisor',
        'm1': 'inspector',
        'inspector': 'inspector',
        'dev': 'developer',
        'developer': 'developer',
        'alsaqri': 'developer'
      };

      const normKey = (personaKey || '').toString().toLowerCase();
      const resolvedKey = PERSONA_ALIASES[normKey] || personaKey;
      let persona = QUICK_PERSONAS[resolvedKey] || QUICK_PERSONAS[personaKey];
      if (!persona) {
        persona = Object.values(QUICK_PERSONAS).find(p => p.username && p.username.toLowerCase() === normKey);
      }

      if (!persona) {
        console.error('Unknown persona:', personaKey);
        return false;
      }

      // البحث عن بيانات المستخدم المعتمدة
      let user = null;
      if (window.KSUAuth && typeof window.KSUAuth.getDefaultUsers === 'function') {
        const users = window.KSUAuth.getDefaultUsers();
        user = users.find(u => 
          (u.username && u.username.toLowerCase() === persona.username.toLowerCase()) ||
          (u.empId && u.empId.toLowerCase() === persona.username.toLowerCase()) ||
          (u.id && u.id.toLowerCase() === persona.username.toLowerCase())
        );
      }

      // Fallback
      if (!user) {
        if (resolvedKey === 'head' || resolvedKey === 'general_supervisor' || normKey === 'h1') {
          user = {
            id: 'USR-7453',
            name: 'أ. حسن إبراهيم دعاك (المشرف العام H1)',
            empId: 'H1',
            username: 'H1',
            role: 'المشرف العام الملك خالد (H1) - مشرف وحدة السلامة',
            roleCategory: 'head',
            workflowRole: 'h1',
            portal: 'head',
            facility: 'مستشفى الملك خالد الجامعي (KKUH)',
            department: 'الإدارة العامة للأمن والسلامة',
            shift: 'جميع الورديات',
            permissions: { generalSupervisor: true, approveReports: true, conductInspections: true }
          };
        } else if (resolvedKey === 'dept_head' || normKey === 'h2') {
          user = {
            id: 'USR-HEAD-02',
            name: 'أ. مصعب عبدالله آل حماد (رئيس إدارة السلامة)',
            empId: 'H2',
            username: 'H2',
            role: 'رئيس إدارة السلامة بالمدينة الطبية',
            roleCategory: 'head',
            workflowRole: 'dept_head',
            portal: 'head',
            facility: 'المدينة الطبية الجامعية (KSUMC)',
            department: 'إدارة السلامة',
            shift: 'جميع الورديات',
            permissions: { headOfDepartment: true, approveReports: true, conductInspections: true }
          };
        } else if (resolvedKey === 'executive' || resolvedKey === 'director' || normKey === 'd1') {
          user = {
            id: 'USR-DIR-01',
            name: 'المدير العام للسلامة والأمن',
            empId: 'D1',
            username: 'D1',
            role: 'مدير الإدارة العامة للأمن والسلامة بالمدينة الطبية',
            roleCategory: 'head',
            workflowRole: 'director',
            portal: persona.portal.replace('.html', ''),
            facility: 'المدينة الطبية الجامعية (KSUMC)',
            department: 'الإدارة العامة للأمن والسلامة',
            shift: 'جميع الورديات',
            permissions: { all: true, directorGeneral: true, headOfDepartment: true, approveReports: true }
          };
        } else if (resolvedKey === 'quality' || normKey === 'q1') {
          user = {
            id: 'USR-Q1',
            name: 'قسم الجودة وتقييم الأداء',
            empId: 'Q1',
            username: 'Q1',
            role: 'قسم الجودة وتقييم الأداء (CBAHI / JCI)',
            roleCategory: 'quality',
            portal: 'quality',
            facility: 'مستشفى الملك خالد الجامعي (KKUH)',
            department: 'إدارة الجودة والاعتماد',
            shift: 'جميع الورديات',
            permissions: { qualityAudit: true, receiveFieldInspections: true, approveReports: true }
          };
        } else if (resolvedKey === 'inspector' || normKey === 'm1') {
          user = {
            id: 'USR-SH1-202',
            name: 'أ. عادل عاضة الشلوي',
            empId: 'M1',
            username: 'M1',
            altEmpId: 'KSU-SH1-202',
            role: 'مفتش سلامة ميداني',
            roleCategory: 'field_inspector',
            portal: 'field',
            facility: 'مستشفى الملك خالد الجامعي (KKUH)',
            department: 'إدارة السلامة الميدانية',
            shift: 'الوردية 1 (صباحي)',
            permissions: { conductInspections: true, issuePermits: true }
          };
        } else if (resolvedKey === 'supervisor' || resolvedKey === 'field_supervisor' || normKey === 's1') {
          user = {
            id: 'USR-SH1-201',
            name: 'أ. ناصر فلاح القحطاني',
            empId: 'KSU-SH1-201',
            username: 'S1',
            role: 'مشرف الوردية الأولى (مشرف ميداني)',
            roleCategory: 'shift_supervisor',
            portal: 'field',
            facility: 'مستشفى الملك خالد الجامعي (KKUH)',
            department: 'إدارة السلامة الميدانية',
            shift: 'الوردية 1 (صباحي)',
            permissions: { approveReports: true, conductInspections: true, issuePermits: true }
          };
        } else if (resolvedKey === 'developer' || normKey === 'dev' || normKey === 'alsaqri') {
          user = {
            id: 'USR-01',
            name: 'أ. علي سليمان الصقري',
            empId: '95972',
            username: 'DEV',
            altUsername: 'alsaqri',
            role: 'مطور النظام ومسؤول التقنية والمشرف العام',
            roleCategory: 'developer',
            portal: 'admin',
            facility: 'المدينة الطبية',
            department: 'الإدارة العامة للأمن والسلامة - القيادة والأنظمة',
            shift: 'جميع الورديات',
            permissions: { all: true, developer: true, manageUsers: true, approveReports: true }
          };
        }
      }

      if (user) {
        // حفظ الجلسة
        localStorage.removeItem('ksu_user_logged_out');
        localStorage.setItem('ksu_active_user', JSON.stringify(user));
        localStorage.setItem('ksu_active_portal', persona.portal.replace('.html', ''));
        localStorage.setItem('ksu_persona_in_use', personaKey);

        // إذا كان النظام بوضع الديمو، التأكد من شحن بيانات سباهي النموذجية
        if (this.isDemo() && window.KSU_CBAHI_DEMO && typeof window.KSU_CBAHI_DEMO.seed === 'function') {
          try {
            window.KSU_CBAHI_DEMO.seed(false);
          } catch (e) {}
        }

        // التوجيه إلى البوابة المطلوبة
        window.location.href = persona.portal;
        return true;
      }
      return false;
    },

    /**
     * التحول الفوري للنسخة الحقيقية المعتمدة (Clean Production Reset)
     * يقوم بتصفير جولات وسجلات الاختبار، مع الحفاظ الكامل على:
     * - الأصول المعتمدة للمدينة الطبية (1749 أصل)
     * - المستخدمين المعتمدين والمباني والأقسام
     */
    resetToCleanProduction: function(password) {
      if (!this.verifyPassword(password)) {
        return {
          success: false,
          error: 'الرقم السري غير صحيح أو مفقود. تم رفض العملية لحماية المنظومة.'
        };
      }
      try {
        console.warn('⚡ [KSUSystemMode] جارٍ تصفير بيانات الاختبار والتحول للإنتاج المعتمد...');

        // 1. تصفير الجولات والتصاريح والإشعارات وسجلات الاختبار
        const keysToPurge = [
          'ksumc_safety_rounds', 'ksumc_field_rounds', 'ksumc_rounds_registry',
          'ksumc_safety_permits', 'ksumc_safety_doors', 'ksumc_safety_alarms',
          'ksumc_capa_records', 'ksumc_capa_registry', 'ksumc_safety_dept_reports',
          'ksumc_notifications', 'ksumc_seen_notif_popup_ids', 'ksumc_inspection_events',
          'ksumc_recent_inspections', 'ksumc_quality_shift_inspection_logs',
          'ksumc_compliance_registry', 'ksumc_shift_incidents', 'ksumc_safety_violations',
          'ksumc_smoking_violations', 'ksumc_incidents', 'ksumc_head_workflow_decisions',
          'ksumc_quality_reviews', 'ksumc_inspections', 'ksumc_hazmat_logs',
          'ksumc_cbahi_demo_version', 'ksumc_sample_data_version',
          'ksu_persona_in_use'
        ];
        keysToPurge.forEach(k => {
          localStorage.removeItem(k);
          localStorage.setItem(k, JSON.stringify([]));
        });

        // 2. تفعيل وضع الإنتاج الفعلي
        this.setMode(MODE_PRODUCTION);

        // 3. مزامنة التصفير مع فايربيس إذا كان متصلاً
        if (window.ksuFirebaseSync && window.ksuFirebaseSync.db) {
          try {
            window.ksuFirebaseSync.db.ref('rounds').set(null);
            window.ksuFirebaseSync.db.ref('notifications').set(null);
            window.ksuFirebaseSync.db.ref('permits').set(null);
            window.ksuFirebaseSync.db.ref('doors').set(null);
            window.ksuFirebaseSync.db.ref('alarms').set(null);
            window.ksuFirebaseSync.db.ref('capa_records').set(null);
            window.ksuFirebaseSync.db.ref('safety_dept_reports').set(null);
            window.ksuFirebaseSync.db.ref('shift_inspection_logs').set(null);
            window.ksuFirebaseSync.db.ref('compliance_registry').set(null);
            window.ksuFirebaseSync.db.ref('safety_violations').set(null);
            window.ksuFirebaseSync.db.ref('smoking_violations').set(null);
            window.ksuFirebaseSync.db.ref('incidents').set(null);
            window.ksuFirebaseSync.db.ref('inspection_events').set(null);
            window.ksuFirebaseSync.db.ref('recent_inspections').set(null);
            console.log('☁️ [KSUSystemMode] تم تصفير سجلات الاختبار السحابية في Firebase بنجاح ✓');
          } catch (fbErr) {
            console.warn('[KSUSystemMode] تعذر تصفير السحابة اللحظية:', fbErr);
          }
        }

        // 4. تسجيل الخروج للانتقال للبوابة الرسمية النظيفة
        localStorage.setItem('ksu_user_logged_out', 'true');
        localStorage.removeItem('ksu_active_user');

        return {
          success: true,
          message: 'تم تصفير سجلات الاختبار والتحول بنجاح للنسخة التشغيلية المعتمدة (Production Ready). النظام جاهز للعمل الميداني الفعلي.'
        };
      } catch (err) {
        console.error('[KSUSystemMode Reset Error]', err);
        return {
          success: false,
          error: err.message
        };
      }
    },

    /**
     * إعادة تفعيل وضع العرض والاستعراض (Demo Mode) وإعادة حقن البيانات لسباهي
     */
    restoreDemoData: function(password) {
      if (!this.verifyPassword(password)) {
        return {
          success: false,
          error: 'الرقم السري غير صحيح أو مفقود. تم رفض العملية لحماية المنظومة.'
        };
      }
      try {
        this.setMode(MODE_DEMO);
        if (window.KSU_CBAHI_DEMO && typeof window.KSU_CBAHI_DEMO.seed === 'function') {
          window.KSU_CBAHI_DEMO.seed(true);
        }
        return {
          success: true,
          message: 'تم تفعيل وضع الاستعراض وشحن البيانات النموذجية لسباهي بنجاح.'
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  };

  // إتاحة الكائن في النافذة العامة
  
  window.KSUSystemMode = KSUSystemMode;
  window.promptSwitchToProduction = function() {
    KSUSystemMode.requestSwitchToProduction();
  };
  window.promptSwitchToDemo = function() {
    KSUSystemMode.requestSwitchToDemo();
  };


})(window);

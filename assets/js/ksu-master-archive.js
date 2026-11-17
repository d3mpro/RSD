/**
 * محرك الأرشيف والسجل المرجعي الشامل لبوابة الإدارة والقيادة (admin.html)
 * KSUMC Safety Master Archive Module (head & admin automatic visibility)
 * يعرض السجلات النشطة والمؤرشفة تلقائياً ويحصر الأرشفة والاسترجاع على head و admin فقط، مع منع الحذف النهائي للجميع.
 */
(function (window) {
  'use strict';

  let currentTab = 'all';
  let currentStatusFilter = 'all';
  let activeRecordUid = null;
  let initialized = false;

  function escHtml(val) {
    if (window.KSUDataBridge && typeof window.KSUDataBridge.escapeHtml === 'function') {
      return window.KSUDataBridge.escapeHtml(val);
    }
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escJs(val) {
    return escHtml(String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
  }

  function readStorageArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function getActiveUser() {
    if (window.KSUDataBridge && typeof window.KSUDataBridge.getCurrentActiveUser === 'function') {
      return window.KSUDataBridge.getCurrentActiveUser();
    }
    try {
      if (window.KSUAuth && typeof window.KSUAuth.getUser === 'function') {
        const u = window.KSUAuth.getUser();
        if (u && typeof u === 'object') return u;
      }
    } catch (_) {}
    if (window.state && window.state.currentUser) return window.state.currentUser;
    try {
      return JSON.parse(localStorage.getItem('ksu_active_user') || 'null');
    } catch (_) {
      return null;
    }
  }

  function canAccessMasterArchive(user) {
    const u = user === undefined ? getActiveUser() : user;
    if (!u || typeof u !== 'object') return false;
    if (window.KSUDataBridge && typeof window.KSUDataBridge.isHeadOrAdminUser === 'function') {
      return window.KSUDataBridge.isHeadOrAdminUser(u);
    }
    const cat = String(u.roleCategory || '').trim().toLowerCase();
    return cat === 'head' || cat === 'admin' || cat === 'developer' || cat === 'executive' || u.id === 'USR-01';
  }

  function isArchivedViolation(v) {
    if (window.KSUDataBridge && typeof window.KSUDataBridge.isViolationArchived === 'function') {
      return window.KSUDataBridge.isViolationArchived(v);
    }
    return Boolean(v && (v.archived === true || v.isArchived === true || v.status === 'archived' || v.status === 'مؤرشف'));
  }

  function isDeletedRecord(v) {
    if (!v || typeof v !== 'object') return true;
    if (window.KSUDataBridge && typeof window.KSUDataBridge.isViolationDeleted === 'function') {
      return window.KSUDataBridge.isViolationDeleted(v);
    }
    return v.status === 'deleted' || v._deleted === true || v.isPurged === true;
  }

  function mergeByIdPreferNewest(primary, secondary) {
    const map = new Map();
    [secondary || [], primary || []].forEach(arr => {
      arr.forEach(item => {
        if (!item || !item.id || isDeletedRecord(item)) return;
        const k = String(item.id);
        const existing = map.get(k);
        if (!existing) {
          map.set(k, item);
        } else {
          const tsOld = Number(existing.updatedAtMs || new Date(existing.updatedAt || existing.timestamp || 0).getTime() || 0);
          const tsNew = Number(item.updatedAtMs || new Date(item.updatedAt || item.timestamp || 0).getTime() || 0);
          map.set(k, tsNew >= tsOld ? Object.assign({}, existing, item) : Object.assign({}, item, existing));
        }
      });
    });
    return Array.from(map.values());
  }

  function collectAllViolations(user) {
    if (!canAccessMasterArchive(user)) return { safety: [], smoking: [] };
    let bridgeSafety = [];
    let bridgeSmoking = [];
    if (window.KSUDataBridge && typeof window.KSUDataBridge.getViolations === 'function') {
      const res = window.KSUDataBridge.getViolations({ user, includeArchived: true, bypassScope: true });
      bridgeSafety = Array.isArray(res && res.safety) ? res.safety : [];
      bridgeSmoking = Array.isArray(res && res.smoking) ? res.smoking : [];
    }
    const localSafety = readStorageArray('ksumc_safety_violations');
    const localSmoking = readStorageArray('ksumc_smoking_violations');
    const stateSafety = (window.state && Array.isArray(window.state.safetyViolations)) ? window.state.safetyViolations : [];
    const stateSmoking = (window.state && Array.isArray(window.state.smokingViolations)) ? window.state.smokingViolations : [];

    return {
      safety: mergeByIdPreferNewest(mergeByIdPreferNewest(bridgeSafety, localSafety), stateSafety),
      smoking: mergeByIdPreferNewest(mergeByIdPreferNewest(bridgeSmoking, localSmoking), stateSmoking)
    };
  }

  function getUnifiedRecords() {
    const user = getActiveUser();
    if (!canAccessMasterArchive(user)) return [];

    const records = [];

    // 1. Rounds (الجولات التفتيشية)
    const rawRounds = mergeByIdPreferNewest(
      readStorageArray('ksumc_safety_rounds'),
      (window.state && Array.isArray(window.state.rounds)) ? window.state.rounds : []
    );
    const shiftLogs = readStorageArray('ksumc_quality_shift_inspection_logs');
    const roundsMap = new Map();
    rawRounds.forEach(r => {
      if (r && r.id) roundsMap.set(String(r.id), r);
    });
    shiftLogs.forEach(s => {
      const k = s && (s.roundId || s.id);
      if (k && !roundsMap.has(String(k))) {
        roundsMap.set(String(k), {
          id: String(k),
          formTitle: s.modelName || 'جولة تفتيش سلامة',
          building: s.building || 'مستشفى الملك خالد الجامعي',
          floor: s.floor || '',
          facility: s.facility || s.building || 'مستشفى الملك خالد الجامعي',
          inspector: s.inspector || 'مفتش السلامة',
          shiftName: s.shiftName || 'الوردية 1 (صباحي)',
          score: typeof s.complianceRate === 'number' ? s.complianceRate : 100,
          workflowStatus: s.workflowStatus || 'pending_quality',
          date: s.dateKey || (s.submittedAt ? String(s.submittedAt).split('T')[0] : ''),
          time: s.timeLabel || ''
        });
      }
    });

    roundsMap.forEach(r => {
      const dateStr = String(r.date || (r.createdAt ? String(r.createdAt).split('T')[0] : '') || '').slice(0, 10);
      records.push({
        uid: `round::${r.id}`,
        id: String(r.id),
        category: 'rounds',
        categoryLabel: 'جولة تفتيشية (سباهي)',
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
        title: r.formTitle || r.title || 'جولة تفتيش سلامة وصحة مهنية',
        subtitle: `نسبة المطابقة: ${r.score ?? r.complianceRate ?? 100}%`,
        details: r.notes || r.deficiencies || 'تم فحص الموقع والتأكد من استيفاء اشتراطات السلامة المعتمدة.',
        actionTaken: r.action || r.actionTaken || 'مستوفٍ للاشتراطات الفنية والسلامة المعتمدة.',
        facility: r.facility || r.building || 'مستشفى الملك خالد الجامعي',
        location: `${r.building || 'المستشفى'}${r.floor ? ' - ' + r.floor : ''}`,
        officer: r.inspector || 'مفتش السلامة',
        shift: r.shiftName || r.shift || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: r.time || '',
        statusLabel: r.workflowStatus === 'approved_by_head' ? 'معتمد رسمياً' : (r.workflowStatus === 'forwarded_to_head' ? 'محال لرئيس القسم' : 'مكتمل ومرفوع'),
        isApproved: r.workflowStatus === 'approved_by_head',
        isViolation: false,
        isArchived: false,
        headNotes: r.headNotes || '',
        sortTime: r.updatedAtMs || new Date(`${dateStr || '2026-01-01'}T${r.time || '00:00'}`).getTime() || 0,
        raw: r
      });
    });

    // 2. Reports, Incidents & Alarms
    const safetyReports = readStorageArray('ksumc_safety_dept_reports');
    safetyReports.forEach(rep => {
      if (!rep || !rep.id || isDeletedRecord(rep)) return;
      const dateStr = String(rep.date || (rep.submittedAt ? String(rep.submittedAt).split('T')[0] : '') || '').slice(0, 10);
      records.push({
        uid: `report::${rep.id}`,
        id: String(rep.id),
        category: 'reports',
        categoryLabel: 'تقرير سلامة ميداني',
        badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        title: rep.subject || rep.title || 'تقرير سلامة ميداني',
        subtitle: rep.type || 'تقرير قسم السلامة',
        details: rep.details || rep.notes || '-',
        actionTaken: rep.action || rep.actionTaken || 'تم اتخاذ الإجراء الوقائي اللازم في الموقع.',
        facility: rep.facility || rep.building || 'مستشفى الملك خالد الجامعي',
        location: `${rep.building || 'المستشفى'}${rep.floor ? ' - ' + rep.floor : ''}`,
        officer: rep.inspector || rep.reportedBy || 'مفتش السلامة',
        shift: rep.shift || rep.shiftName || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: rep.time || '',
        statusLabel: rep.headApprovalStatus === 'approved_by_head' || rep.workflowStatus === 'approved_by_head' ? 'معتمد رسمياً' : 'موثق بالسجل',
        isApproved: rep.headApprovalStatus === 'approved_by_head' || rep.workflowStatus === 'approved_by_head',
        isViolation: false,
        isArchived: false,
        headNotes: rep.headNotes || '',
        sortTime: rep.updatedAtMs || new Date(rep.submittedAt || dateStr || Date.now()).getTime() || 0,
        raw: rep
      });
    });

    readStorageArray('ksumc_shift_incidents').forEach(inc => {
      if (!inc || !inc.id || isDeletedRecord(inc)) return;
      const dateStr = String(inc.date || '').slice(0, 10);
      records.push({
        uid: `incident::${inc.id}`,
        id: String(inc.id),
        category: 'reports',
        categoryLabel: 'بلاغ طوارئ / استجابة',
        badgeClass: 'bg-red-100 text-red-900 border-red-300',
        title: `${inc.typeName || 'بلاغ طوارئ ميداني'} — ${inc.building || 'المستشفى'}`,
        subtitle: `زمن الاستجابة: ${inc.responseTime || 'فوري'}`,
        details: inc.details || inc.notes || '-',
        actionTaken: inc.actionTaken || 'تمت مباشرة البلاغ وإنهاء الحالة الميدانية بنجاح.',
        facility: inc.facility || inc.building || 'مستشفى الملك خالد الجامعي',
        location: inc.location || `${inc.building || ''} - ${inc.floor || ''}`,
        officer: inc.reportedBy || inc.inspector || 'مفتش السلامة',
        shift: inc.shift || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: inc.time || '',
        statusLabel: inc.headApprovalStatus === 'approved_by_head' ? 'معتمد رسمياً' : 'تمت المباشرة',
        isApproved: inc.headApprovalStatus === 'approved_by_head',
        isViolation: false,
        isArchived: false,
        headNotes: inc.headNotes || '',
        sortTime: inc.updatedAtMs || Date.now(),
        raw: inc
      });
    });

    readStorageArray('ksumc_safety_alarms').forEach(a => {
      if (!a || !a.id || a.type === 'executive_directive' || isDeletedRecord(a)) return;
      const dateStr = String(a.date || '').slice(0, 10);
      records.push({
        uid: `alarm::${a.id}`,
        id: String(a.id),
        category: 'reports',
        categoryLabel: 'بلاغ كود / إنذار حريق',
        badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
        title: `${a.code ? '[' + a.code + '] ' : ''}${a.title || 'إنذار لوحة الحريق'}`,
        subtitle: `الحالة: ${a.status || 'تمت الاستجابة'}`,
        details: a.resolutionNotes || a.notes || 'بلاغ إنذار مسجل في غرفة العمليات.',
        actionTaken: a.resolutionNotes || 'تم فحص الموقع وإعادة ضبط اللوحة.',
        facility: a.facility || 'مستشفى الملك خالد الجامعي',
        location: a.location || a.building || 'المستشفى',
        officer: a.reportedBy || 'مفتش السلامة',
        shift: a.shift || 'جميع الورديات',
        date: dateStr,
        time: a.time || '',
        statusLabel: a.headApprovalStatus === 'approved_by_head' ? 'معتمد رسمياً' : (a.status || 'مغلق'),
        isApproved: a.headApprovalStatus === 'approved_by_head',
        isViolation: false,
        isArchived: false,
        headNotes: a.headNotes || '',
        sortTime: a.updatedAtMs || Date.now(),
        raw: a
      });
    });

    // 3. Violations (Safety + Smoking: Active AND Archived)
    const { safety, smoking } = collectAllViolations(user);

    safety.forEach(v => {
      if (!v || !v.id || isDeletedRecord(v)) return;
      const dateStr = String(v.date || '').slice(0, 10);
      const devStr = Array.isArray(v.devices) ? v.devices.join('، ') : (v.devices || 'مخالفة اشتراطات سلامة');
      const archived = isArchivedViolation(v);
      records.push({
        uid: `safety_viol::${v.id}`,
        id: String(v.id),
        category: 'violations',
        categoryLabel: 'محضر مخالفة سلامة',
        violationType: 'safety',
        isViolation: true,
        isArchived: archived,
        archivedAt: v.archivedAt || '',
        archivedByName: v.archivedByName || '',
        archiveReason: v.archiveReason || '',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        title: `مخالفة سلامة (${devStr})`,
        subtitle: `المخالف / الجهة: ${v.violatorName || v.department || '-'}`,
        details: `المضبوطات/المخالفة: ${devStr} | التوجيه: ${v.directive || v.notes || '-'}`,
        actionTaken: v.actionTaken || 'تم تحرير محضر مخالفة سلامة.',
        facility: v.facility || 'مستشفى الملك خالد الجامعي',
        location: `${v.location || 'المستشفى'}${v.room ? ' - غرفة ' + v.room : ''}`,
        officer: v.officerName || v.createdByName || v.inspector || 'مفتش السلامة',
        shift: v.shift || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: v.time || '',
        statusLabel: archived ? 'مؤرشف بالأرشيف' : (v.headApprovalStatus === 'approved_by_head' ? 'معتمد رسمياً' : 'محضر مسجل'),
        isApproved: v.headApprovalStatus === 'approved_by_head',
        headNotes: v.headNotes || '',
        sortTime: v.updatedAtMs || new Date(v.createdAt || v.date || Date.now()).getTime() || 0,
        raw: v
      });
    });

    smoking.forEach(s => {
      if (!s || !s.id || isDeletedRecord(s)) return;
      const dateStr = String(s.date || '').slice(0, 10);
      const archived = isArchivedViolation(s);
      records.push({
        uid: `smoking_viol::${s.id}`,
        id: String(s.id),
        category: 'violations',
        categoryLabel: 'محضر مخالفة تدخين',
        violationType: 'smoking',
        isViolation: true,
        isArchived: archived,
        archivedAt: s.archivedAt || '',
        archivedByName: s.archivedByName || '',
        archiveReason: s.archiveReason || '',
        badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
        title: `ضبط مخالفة تدخين — ${s.violatorName || 'مخالف'}`,
        subtitle: `الصفة: ${s.role || 'موظف/مراجع'} | الهوية/الوظيفي: ${s.nationalId || s.violatorEmpId || '-'}`,
        details: `القسم/الإدارة: ${s.dept || '-'} | الموقع: ${s.location || '-'}`,
        actionTaken: 'تم تحرير محضر ضبط مخالفة تدخين وفق نظام مكافحة التدخين.',
        facility: s.facility || 'مستشفى الملك خالد الجامعي',
        location: s.location || 'المستشفى',
        officer: s.officerName || s.createdByName || s.inspector || 'مفتش السلامة',
        shift: s.shift || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: s.time || '',
        statusLabel: archived ? 'مؤرشف بالأرشيف' : (s.headApprovalStatus === 'approved_by_head' ? 'معتمد رسمياً' : 'محضر مضبوط'),
        isApproved: s.headApprovalStatus === 'approved_by_head',
        headNotes: s.headNotes || '',
        sortTime: s.updatedAtMs || new Date(s.createdAt || s.date || Date.now()).getTime() || 0,
        raw: s
      });
    });

    // 4. Permits & Doors
    readStorageArray('ksumc_safety_permits').forEach(p => {
      if (!p || !p.id || isDeletedRecord(p)) return;
      const dateStr = String(p.date || p.startDate || '').slice(0, 10);
      records.push({
        uid: `permit::${p.id}`,
        id: String(p.id),
        category: 'permits',
        categoryLabel: 'تصريح عمل آمن / ساخن',
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        title: `${p.workType || p.type || 'تصريح عمل'} — ${p.contractor || p.company || 'مقاول معتمد'}`,
        subtitle: `مسؤول العمل: ${p.supervisor || p.requester || '-'}`,
        details: p.description || p.notes || `تصريح عمل في ${p.location || p.building || 'الموقع'}`,
        actionTaken: p.precautions || 'تم التحقق من اشتراطات السلامة.',
        facility: p.facility || 'مستشفى الملك خالد الجامعي',
        location: p.location || p.building || 'المستشفى',
        officer: p.issuedBy || p.inspector || 'مفتش السلامة',
        shift: p.shift || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: p.time || '',
        statusLabel: p.status || 'ساري المفعول',
        isApproved: true,
        isViolation: false,
        isArchived: false,
        headNotes: p.headNotes || '',
        sortTime: p.updatedAtMs || Date.now(),
        raw: p
      });
    });

    readStorageArray('ksumc_safety_doors').forEach(d => {
      if (!d || !d.id || isDeletedRecord(d)) return;
      const dateStr = String(d.date || '').slice(0, 10);
      records.push({
        uid: `door::${d.id}`,
        id: String(d.id),
        category: 'permits',
        categoryLabel: 'تصريح / طلب فتح باب',
        badgeClass: 'bg-teal-100 text-teal-900 border-teal-300',
        title: `طلب فتح باب (${d.doorNumber || d.doorName || d.location || 'باب طوارئ'})`,
        subtitle: `الجهة الطالبة: ${d.requester || d.requesterName || d.department || '-'}`,
        details: `السبب: ${d.reason || d.notes || 'أعمال صيانة وتشغيل'}`,
        actionTaken: d.status || 'تمت المتابعة الميدانية.',
        facility: d.facility || 'مستشفى الملك خالد الجامعي',
        location: d.location || d.building || 'المستشفى',
        officer: d.inspector || d.approvedBy || 'مفتش السلامة',
        shift: d.shift || 'الوردية 1 (صباحي)',
        date: dateStr,
        time: d.time || '',
        statusLabel: d.status || 'مسجل',
        isApproved: true,
        isViolation: false,
        isArchived: false,
        headNotes: d.headNotes || '',
        sortTime: d.updatedAtMs || Date.now(),
        raw: d
      });
    });

    return records.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
  }

  function getFilteredRecords() {
    const all = getUnifiedRecords();
    const viols = all.filter(x => x.category === 'violations');
    const activeViols = viols.filter(x => !x.isArchived).length;
    const archivedViols = viols.filter(x => x.isArchived).length;

    const setTxt = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };

    setTxt('admin-tab-archive-count', all.length);
    setTxt('admin-arch-count-all', all.length);
    setTxt('admin-arch-count-rounds', all.filter(x => x.category === 'rounds').length);
    setTxt('admin-arch-count-reports', all.filter(x => x.category === 'reports').length);
    setTxt('admin-arch-count-violations', viols.length);
    setTxt('admin-arch-count-permits', all.filter(x => x.category === 'permits').length);
    setTxt('admin-arch-total-badge', `${all.length} سجل مرجعي محفوظ`);
    setTxt('admin-arch-violations-active-count', activeViols);
    setTxt('admin-arch-violations-archived-count', archivedViols);

    let list = all;
    if (currentTab !== 'all') {
      list = list.filter(x => x.category === currentTab);
    }

    const stFilterEl = document.getElementById('admin-arch-status-filter');
    const statusFilter = stFilterEl ? stFilterEl.value : currentStatusFilter;
    if (statusFilter === 'archived') {
      list = list.filter(x => x.isArchived === true);
    } else if (statusFilter === 'active') {
      list = list.filter(x => !x.isArchived);
    }

    const q = (document.getElementById('admin-arch-search-input')?.value || '').trim().toLowerCase();
    if (q) {
      list = list.filter(x => {
        const hay = `${x.id} ${x.categoryLabel} ${x.title} ${x.subtitle} ${x.details} ${x.location} ${x.facility} ${x.officer} ${x.shift} ${x.headNotes || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const sh = document.getElementById('admin-arch-shift-filter')?.value || 'all';
    if (sh !== 'all') {
      list = list.filter(x => {
        const s = String(x.shift || '');
        if (sh === '1') return s.includes('1') || s.includes('صباح') || s.includes('الأولى') || s.includes('الاولى');
        if (sh === '2') return s.includes('2') || s.includes('مسائ') || s.includes('الثانية');
        if (sh === '3') return s.includes('3') || s.includes('ليل') || s.includes('الثالثة');
        return true;
      });
    }

    const dFrom = document.getElementById('admin-arch-date-from')?.value || '';
    const dTo = document.getElementById('admin-arch-date-to')?.value || '';
    if (dFrom) list = list.filter(x => (x.date || '') >= dFrom);
    if (dTo) list = list.filter(x => (x.date || '') <= dTo);

    return list;
  }

  function renderAutoArchiveSpotlight() {
    const host = document.getElementById('admin-auto-archive-spotlight');
    if (!host) return;

    const user = getActiveUser();
    if (!canAccessMasterArchive(user)) {
      host.classList.add('hidden');
      host.innerHTML = '';
      return;
    }

    host.classList.remove('hidden');
    const all = getUnifiedRecords();
    const viols = all.filter(x => x.category === 'violations');
    const activeViols = viols.filter(x => !x.isArchived).length;
    const archivedViols = viols.filter(x => x.isArchived).length;
    const latest = all.slice(0, 4);

    host.innerHTML = `
      <div class="p-5 rounded-2xl bg-surface-container-lowest border-2 border-primary/20 shadow-sm space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-outline-variant/30 pb-3">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-primary text-amber-300 flex items-center justify-center shadow-xs shrink-0">
              <span class="material-symbols-outlined text-2xl">inventory_2</span>
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-base font-black text-primary">الأرشيف التلقائي والسجل المرجعي الشامل (Head & Admin)</h3>
                <span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black">مفعل تلقائياً • ${all.length} سجل</span>
              </div>
              <p class="text-xs text-on-surface-variant mt-0.5">الوصول الدائم لكافة الجولات والتقارير والمخالفات النشطة والمؤرشفة دون حذف نهائي</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-black">مخالفات نشطة: ${activeViols}</span>
            <span class="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-300 text-xs font-black">مخالفات مؤرشفة: ${archivedViols}</span>
            <button type="button" onclick="switchTab('master-archive')" class="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer">
              <span class="material-symbols-outlined text-sm text-amber-300">open_in_new</span>
              <span>فتح الأرشيف الكامل</span>
            </button>
          </div>
        </div>

        ${latest.length === 0 ? `
          <div class="p-4 rounded-xl bg-surface-container-low text-center text-xs font-bold text-on-surface-variant">
            الأرشيف المرجعي جاهز ومتصل — سيتم عرض أحدث المخالفات والتقارير والجولات هنا تلقائياً فور تسجيلها.
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${latest.map(item => `
              <div class="p-3.5 rounded-xl border ${item.isArchived ? 'border-amber-300 bg-amber-50/40' : 'border-outline-variant/40 bg-surface-container-low/50'} flex flex-col justify-between gap-2">
                <div class="space-y-1">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded-md border text-[10px] font-black ${item.badgeClass}">${escHtml(item.categoryLabel)}</span>
                    <div class="flex items-center gap-1.5">
                      ${item.isArchived
                        ? '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">مؤرشف</span>'
                        : '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black">نشط</span>'}
                      <span class="font-mono text-[11px] font-bold text-primary">${escHtml(item.id)}</span>
                    </div>
                  </div>
                  <div class="font-bold text-xs text-primary line-clamp-1">${escHtml(item.title)}</div>
                  <div class="text-[11px] text-on-surface-variant flex items-center justify-between gap-2">
                    <span>المفتش: <strong>${escHtml(item.officer)}</strong></span>
                    <span class="font-mono">${escHtml(item.date || '-')}</span>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-1.5 pt-2 border-t border-outline-variant/30">
                  <button type="button" onclick="KSUMasterArchive.previewRecord('${escJs(item.uid)}')" class="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-primary border border-blue-200 font-bold text-[11px]">معاينة</button>
                  <button type="button" onclick="KSUMasterArchive.printRecord('${escJs(item.uid)}')" class="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-container text-white font-bold text-[11px]">طباعة</button>
                  ${item.isViolation ? (item.isArchived
                    ? `<button type="button" onclick="KSUMasterArchive.restoreViolation('${escJs(item.violationType)}', '${escJs(item.id)}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]">استرجاع</button>`
                    : `<button type="button" onclick="KSUMasterArchive.archiveViolation('${escJs(item.violationType)}', '${escJs(item.id)}')" class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px]">أرشفة</button>`
                  ) : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function render() {
    renderAutoArchiveSpotlight();

    const tbody = document.getElementById('admin-master-archive-tbody');
    if (!tbody) return;

    const user = getActiveUser();
    if (!canAccessMasterArchive(user)) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center bg-rose-50 text-rose-900 font-bold text-xs">
            عفواً، الوصول إلى الأرشيف والسجل المرجعي الشامل محصور على رئيس القسم ومسؤول النظام فقط.
          </td>
        </tr>
      `;
      return;
    }

    const list = getFilteredRecords();
    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-10 text-center bg-slate-50/70">
            <div class="flex flex-col items-center justify-center gap-2 text-slate-500">
              <span class="material-symbols-outlined text-4xl text-slate-300">inventory_2</span>
              <p class="text-xs font-black text-slate-700">لا توجد سجلات مرجعية مطابقة لمعايير التصفية الحالية</p>
              <p class="text-[11px] text-slate-400">يظهر الأرشيف تلقائياً لكافة الجولات والتقارير والمخالفات النشطة والمؤرشفة دون حذف نهائي</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(item => `
      <tr class="hover:bg-blue-50/40 transition-colors ${item.isArchived ? 'bg-amber-50/25' : ''}">
        <td class="p-3 align-top">
          <span class="font-mono text-xs font-black text-primary block">${escHtml(item.id)}</span>
          <span class="text-[10px] font-mono text-slate-500 block mt-0.5">${escHtml(item.date || '-')} ${escHtml(item.time || '')}</span>
        </td>
        <td class="p-3 align-top">
          <span class="inline-block px-2.5 py-0.5 rounded-md border text-[10px] font-black ${item.badgeClass}">${escHtml(item.categoryLabel)}</span>
          ${item.isArchived ? '<span class="block mt-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black w-fit">مؤرشف</span>' : '<span class="block mt-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold w-fit">نشط</span>'}
        </td>
        <td class="p-3 align-top max-w-xs">
          <div class="font-black text-slate-900 text-xs">${escHtml(item.title)}</div>
          <div class="text-[11px] text-[#004B87] font-bold mt-0.5">${escHtml(item.subtitle)}</div>
          <p class="text-[11px] text-slate-500 line-clamp-1 mt-0.5">${escHtml(item.details)}</p>
        </td>
        <td class="p-3 align-top">
          <div class="font-bold text-primary text-xs">${escHtml(item.location)}</div>
          <div class="text-[10px] text-slate-500 mt-0.5">${escHtml(item.facility)}</div>
        </td>
        <td class="p-3 align-top">
          <div class="font-bold text-[#004B87] text-xs">${escHtml(item.officer)}</div>
          <div class="text-[10px] text-slate-500 mt-0.5">${escHtml(item.shift)}</div>
        </td>
        <td class="p-3 align-top text-center">
          <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black ${item.isArchived ? 'bg-amber-100 text-amber-900 border border-amber-300' : (item.isApproved ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-200')}">
            ${escHtml(item.statusLabel)}
          </span>
        </td>
        <td class="p-3 align-top text-center">
          <div class="flex items-center justify-center gap-1.5 flex-wrap">
            <button type="button" onclick="KSUMasterArchive.previewRecord('${escJs(item.uid)}')" title="معاينة الوثيقة المرجعية" class="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#004B87] border border-blue-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all">
              <span class="material-symbols-outlined text-sm">visibility</span>
              <span>معاينة</span>
            </button>
            <button type="button" onclick="KSUMasterArchive.printRecord('${escJs(item.uid)}')" title="طباعة رسمية A4 / PDF" class="px-2.5 py-1.5 rounded-xl bg-[#082B49] hover:bg-[#004B87] text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-2xs">
              <span class="material-symbols-outlined text-sm text-amber-300">print</span>
              <span>طباعة</span>
            </button>
            <button type="button" onclick="KSUMasterArchive.openEmailModal('${escJs(item.uid)}')" title="مشاركة بالبريد الإلكتروني" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all shadow-2xs">
              <span class="material-symbols-outlined text-sm">mail</span>
              <span>بريد</span>
            </button>
            ${item.isViolation ? (item.isArchived
              ? `<button type="button" onclick="KSUMasterArchive.restoreViolation('${escJs(item.violationType)}', '${escJs(item.id)}')" title="استرجاع المخالفة إلى السجل النشط" class="px-2.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all"><span class="material-symbols-outlined text-sm">unarchive</span><span>استرجاع</span></button>`
              : `<button type="button" onclick="KSUMasterArchive.archiveViolation('${escJs(item.violationType)}', '${escJs(item.id)}')" title="أرشفة المخالفة ونقلها للسجل المؤرشف" class="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-all"><span class="material-symbols-outlined text-sm">archive</span><span>أرشفة</span></button>`
            ) : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  function switchTab(tab) {
    currentTab = tab || 'all';
    ['all', 'rounds', 'reports', 'violations', 'permits'].forEach(t => {
      const btn = document.getElementById('admin-arch-tab-' + t);
      if (!btn) return;
      if (t === currentTab) {
        btn.className = 'p-3 rounded-2xl border text-right transition-all cursor-pointer bg-[#082B49] text-white border-[#082B49] shadow-sm' + (t === 'permits' ? ' col-span-2 sm:col-span-1' : '');
      } else {
        btn.className = 'p-3 rounded-2xl border text-right transition-all cursor-pointer bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200' + (t === 'permits' ? ' col-span-2 sm:col-span-1' : '');
      }
    });
    render();
  }

  function switchStatusFilter(status) {
    currentStatusFilter = status || 'all';
    const sel = document.getElementById('admin-arch-status-filter');
    if (sel) sel.value = currentStatusFilter;
    render();
  }

  function resetFilters() {
    const s = document.getElementById('admin-arch-search-input');
    const sh = document.getElementById('admin-arch-shift-filter');
    const st = document.getElementById('admin-arch-status-filter');
    const df = document.getElementById('admin-arch-date-from');
    const dt = document.getElementById('admin-arch-date-to');
    if (s) s.value = '';
    if (sh) sh.value = 'all';
    if (st) st.value = 'all';
    if (df) df.value = '';
    if (dt) dt.value = '';
    currentStatusFilter = 'all';
    switchTab('all');
  }

  function findRecordByUid(uid) {
    return getUnifiedRecords().find(x => x.uid === uid) || null;
  }

  function previewRecord(uid) {
    const rec = findRecordByUid(uid);
    if (!rec) return;
    activeRecordUid = uid;
    window._activeAdminArchiveRecordUid = uid;

    const modal = document.getElementById('modal-admin-archive-record-preview');
    const titleEl = document.getElementById('admin-arch-preview-title');
    const badgeEl = document.getElementById('admin-arch-preview-badge');
    const refEl = document.getElementById('admin-arch-preview-ref');
    const body = document.getElementById('admin-arch-preview-body');
    if (!modal || !body) return;

    if (titleEl) titleEl.textContent = rec.title;
    if (badgeEl) badgeEl.textContent = rec.categoryLabel;
    if (refEl) refEl.textContent = `الرقم المرجعي: ${rec.id} • التاريخ: ${rec.date || '-'} ${rec.time || ''}`;

    const isSafetyCard = rec.uid && rec.uid.startsWith('safety_viol::');
    const hasCard = rec.raw && (rec.raw.cardInnerHtml || rec.raw.hasVisualInspectionCard);
    const modalBox = modal.querySelector('div');

    if ((hasCard || isSafetyCard) && (rec.raw?.cardInnerHtml || typeof window.buildCardHtmlFromViolation === 'function')) {
      const cardHtml = (rec.raw && rec.raw.cardInnerHtml) || window.buildCardHtmlFromViolation(rec.raw);
      if (cardHtml) {
        if (modalBox) {
          modalBox.classList.remove('max-w-2xl');
          modalBox.classList.add('max-w-4xl');
        }
        body.innerHTML = `
          <div class="p-3 rounded-2xl bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2 mb-3">
            <span class="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs">كارت فحص ومعاينة بصرية معتمد</span>
            <span class="text-xs font-mono font-bold text-slate-600">${escHtml(rec.id)}</span>
          </div>
          <div class="overflow-x-auto w-full py-1">${cardHtml}</div>
        `;
        modal.classList.remove('hidden');
        return;
      }
    }

    if (modalBox) {
      modalBox.classList.remove('max-w-4xl');
      modalBox.classList.add('max-w-2xl');
    }

    body.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
        <div>
          <span class="text-[10px] text-slate-500 block">تصنيف الوثيقة:</span>
          <span class="font-black text-primary text-xs">${escHtml(rec.categoryLabel)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-500 block">المنشأة والموقع:</span>
          <span class="font-bold text-slate-800 text-xs">${escHtml(rec.location)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-500 block">الحالة المرجعية:</span>
          <span class="font-black ${rec.isArchived ? 'text-amber-700' : 'text-emerald-700'} text-xs">${escHtml(rec.statusLabel)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-500 block">المسؤول / المفتش:</span>
          <span class="font-bold text-[#004B87] text-xs">${escHtml(rec.officer)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-500 block">الوردية:</span>
          <span class="font-bold text-slate-800 text-xs">${escHtml(rec.shift)}</span>
        </div>
        <div>
          <span class="text-[10px] text-slate-500 block">البيان الإضافي:</span>
          <span class="font-bold text-slate-800 text-xs">${escHtml(rec.subtitle)}</span>
        </div>
      </div>
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
        <span class="text-[11px] font-black text-primary block">التفاصيل والملاحظات الميدانية الموثقة:</span>
        <p class="text-slate-700 leading-relaxed font-semibold">${escHtml(rec.details)}</p>
      </div>
      <div class="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1">
        <span class="text-[11px] font-black text-[#004B87] block">الإجراء المتخذ / التوصيات المعتمدة:</span>
        <p class="text-slate-800 leading-relaxed font-semibold">${escHtml(rec.actionTaken)}</p>
      </div>
      ${rec.isArchived ? `
        <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
          <span class="text-[11px] font-black text-amber-900 block">بيانات الأرشفة المرجعية:</span>
          <p class="text-amber-950 font-bold">مؤرشف بواسطة: ${escHtml(rec.archivedByName || 'الإدارة')} • السبب: ${escHtml(rec.archiveReason || 'أرشفة مرجعية')}</p>
        </div>
      ` : ''}
      ${rec.headNotes ? `
        <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
          <span class="text-[11px] font-black text-emerald-900 block">قرار وتوجيه رئيس القسم / المشرف العام:</span>
          <p class="text-emerald-950 font-bold">${escHtml(rec.headNotes)}</p>
        </div>
      ` : ''}
    `;
    modal.classList.remove('hidden');
  }

  function closePreviewModal() {
    const modal = document.getElementById('modal-admin-archive-record-preview');
    if (modal) modal.classList.add('hidden');
  }

  function printRecord(uid) {
    const rec = findRecordByUid(uid || activeRecordUid);
    if (!rec) return;

    const isSafetyCard = rec.uid && rec.uid.startsWith('safety_viol::');
    const hasCard = rec.raw && (rec.raw.cardInnerHtml || rec.raw.hasVisualInspectionCard);
    if ((hasCard || isSafetyCard) && (rec.raw?.cardInnerHtml || typeof window.buildCardHtmlFromViolation === 'function')) {
      const cardHtml = (rec.raw && rec.raw.cardInnerHtml) || window.buildCardHtmlFromViolation(rec.raw);
      if (cardHtml && typeof window.triggerIsolatedPrint === 'function') {
        window.triggerIsolatedPrint(cardHtml);
        return;
      }
    }

    const sheet = document.getElementById('printable-round-sheet');
    if (!sheet) return;
    const dateStr = rec.date || new Date().toISOString().split('T')[0];
    const timeStr = rec.time || new Date().toLocaleTimeString('ar-SA');

    sheet.innerHTML = `
      <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;padding:22px;color:#0f172a;max-width:800px;margin:auto;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2.5px solid #082B49;padding-bottom:12px;margin-bottom:16px;">
          <div style="width:36%;line-height:1.45;">
            <div style="font-weight:900;font-size:12px;color:#082B49;">المملكة العربية السعودية — جامعة الملك سعود</div>
            <div style="font-size:10px;font-weight:800;color:#004B87;">المدينة الطبية الجامعية • الإدارة العامة للأمن والسلامة</div>
            <div style="font-size:10px;font-weight:700;color:#334155;">وثيقة مستخرجة من الأرشيف والسجل المرجعي الشامل</div>
          </div>
          <div style="width:32%;text-align:center;">
            <div style="font-size:13px;font-weight:900;color:#082B49;">وثيقة أرشيف مرجعي معتمد</div>
            <div style="font-size:10px;font-weight:800;color:#004B87;">${escHtml(rec.categoryLabel)}</div>
          </div>
          <div style="width:30%;text-align:left;font-family:monospace;font-size:10px;">
            <div style="display:inline-block;background:#f8fafc;border:1.5px solid #004B87;border-radius:8px;padding:7px 11px;">
              <div style="font-weight:900;color:#082B49;">${escHtml(rec.id)}</div>
              <div>${escHtml(dateStr)} ${escHtml(timeStr)}</div>
              <div style="color:#059669;font-weight:bold;">${escHtml(rec.statusLabel)}</div>
            </div>
          </div>
        </div>
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:900;color:#082B49;">${escHtml(rec.title)}</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:11px;">
          <tr>
            <td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;">الموقع والمنشأة</td>
            <td style="border:1px solid #cbd5e1;padding:8px;">${escHtml(rec.location)} (${escHtml(rec.facility)})</td>
            <td style="border:1px solid #cbd5e1;padding:8px;background:#f8fafc;font-weight:bold;">المسؤول / المفتش</td>
            <td style="border:1px solid #cbd5e1;padding:8px;">${escHtml(rec.officer)} — ${escHtml(rec.shift)}</td>
          </tr>
        </table>
        <div style="border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:10px;background:#f8fafc;">
          <div style="font-weight:900;font-size:11.5px;color:#082B49;margin-bottom:4px;">التفاصيل الموثقة:</div>
          <div style="font-size:11px;line-height:1.6;">${escHtml(rec.details)}</div>
        </div>
        <div style="border:1px solid #bae6fd;border-radius:8px;padding:12px;background:#f0f9ff;">
          <div style="font-weight:900;font-size:11.5px;color:#0369a1;margin-bottom:4px;">الإجراء المتخذ:</div>
          <div style="font-size:11px;line-height:1.6;">${escHtml(rec.actionTaken)}</div>
        </div>
      </div>
    `;

    document.body.classList.add('printing-single-round');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-single-round');
      }, 700);
    }, 150);
  }

  function printFilteredTable() {
    const list = getFilteredRecords();
    const sheet = document.getElementById('printable-round-sheet');
    if (!sheet) return;
    const todayStr = new Date().toISOString().split('T')[0];

    sheet.innerHTML = `
      <div style="font-family:'Cairo',sans-serif;direction:rtl;text-align:right;padding:20px;color:#0f172a;max-width:980px;margin:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #082B49;padding-bottom:10px;margin-bottom:14px;">
          <div>
            <div style="font-weight:900;font-size:13px;color:#082B49;">جامعة الملك سعود — المدينة الطبية الجامعية (KSUMC)</div>
            <div style="font-size:11px;font-weight:800;color:#004B87;">كشف الأرشيف والسجل المرجعي الشامل</div>
          </div>
          <div style="text-align:left;font-size:10px;">
            <div><strong>التاريخ:</strong> ${todayStr}</div>
            <div><strong>السجلات:</strong> ${list.length}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
          <thead>
            <tr style="background:#082B49;color:white;">
              <th style="border:1px solid #082B49;padding:7px;">#</th>
              <th style="border:1px solid #082B49;padding:7px;">الرقم والتاريخ</th>
              <th style="border:1px solid #082B49;padding:7px;">التصنيف</th>
              <th style="border:1px solid #082B49;padding:7px;">العنوان والتفاصيل</th>
              <th style="border:1px solid #082B49;padding:7px;">الموقع</th>
              <th style="border:1px solid #082B49;padding:7px;">المفتش والوردية</th>
              <th style="border:1px solid #082B49;padding:7px;">الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((item, idx) => `
              <tr>
                <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${idx + 1}</td>
                <td style="border:1px solid #cbd5e1;padding:6px;font-family:monospace;font-weight:bold;">${escHtml(item.id)}<br/><span style="font-size:9px;color:#64748b;">${escHtml(item.date || '')}</span></td>
                <td style="border:1px solid #cbd5e1;padding:6px;font-weight:bold;">${escHtml(item.categoryLabel)}</td>
                <td style="border:1px solid #cbd5e1;padding:6px;"><strong>${escHtml(item.title)}</strong><br/><span style="font-size:9.5px;color:#475569;">${escHtml(item.details)}</span></td>
                <td style="border:1px solid #cbd5e1;padding:6px;">${escHtml(item.location)}</td>
                <td style="border:1px solid #cbd5e1;padding:6px;">${escHtml(item.officer)}<br/><span style="font-size:9px;color:#64748b;">${escHtml(item.shift)}</span></td>
                <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;font-weight:bold;">${escHtml(item.statusLabel)}</td>
              </tr>
            `).join('') || '<tr><td colspan="7" style="padding:16px;text-align:center;">لا توجد سجلات</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    document.body.classList.add('printing-single-round');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-single-round');
      }, 700);
    }, 150);
  }

  function openEmailModal(uid) {
    const rec = findRecordByUid(uid || activeRecordUid);
    if (!rec) return;
    activeRecordUid = rec.uid;

    const modal = document.getElementById('modal-admin-archive-email-share');
    const subjEl = document.getElementById('admin-arch-email-subject');
    const bodyEl = document.getElementById('admin-arch-email-body');
    if (!modal) return;

    const subject = `[KSUMC Safety Archive] ${rec.categoryLabel} (${rec.id}) - ${rec.title}`;
    const bodyText = [
      'السلام عليكم ورحمة الله وبركاته،',
      '',
      'نسخة مرجعية من الأرشيف والسجل المرجعي الشامل لقسم السلامة (KSUMC):',
      '------------------------------------------------------------',
      `• الرقم المرجعي: ${rec.id}`,
      `• تصنيف الوثيقة: ${rec.categoryLabel}`,
      `• العنوان: ${rec.title}`,
      `• الحالة: ${rec.statusLabel}`,
      `• التاريخ والوقت: ${rec.date || '-'} ${rec.time || ''}`,
      `• الموقع: ${rec.location} (${rec.facility})`,
      `• المفتش / المسؤول: ${rec.officer} (${rec.shift})`,
      '------------------------------------------------------------',
      '• التفاصيل:',
      rec.details,
      '',
      '• الإجراء المتخذ:',
      rec.actionTaken
    ].join('\n');

    if (subjEl) subjEl.value = subject;
    if (bodyEl) bodyEl.value = bodyText;
    modal.classList.remove('hidden');
  }

  function closeEmailModal() {
    const modal = document.getElementById('modal-admin-archive-email-share');
    if (modal) modal.classList.add('hidden');
  }

  function sendEmailNow() {
    const to = (document.getElementById('admin-arch-email-recipient')?.value || 'aalsaqri@ksu.edu.sa').trim();
    const subj = document.getElementById('admin-arch-email-subject')?.value || '';
    const body = document.getElementById('admin-arch-email-body')?.value || '';
    if (!to) return;
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
  }

  function copyEmailBody() {
    const subj = document.getElementById('admin-arch-email-subject')?.value || '';
    const body = document.getElementById('admin-arch-email-body')?.value || '';
    const txt = `${subj}\n\n${body}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).catch(() => {});
    }
    if (typeof window.showToast === 'function') {
      window.showToast('تم نسخ نص الوثيقة المرجعية بنجاح.', 'success');
    }
  }

  function archiveViolation(type, id) {
    const user = getActiveUser();
    if (!canAccessMasterArchive(user)) {
      if (typeof window.showToast === 'function') {
        window.showToast('عفواً، الأرشفة صلاحية حصرية لرئيس القسم ومسؤول النظام.', 'error');
      }
      return { ok: false, reason: 'unauthorized' };
    }
    if (!window.KSUDataBridge || typeof window.KSUDataBridge.archiveViolationRecord !== 'function') {
      return { ok: false, reason: 'unavailable' };
    }
    const reason = (typeof window.prompt === 'function')
      ? (window.prompt('سبب الأرشفة المرجعية (اختياري):', 'مؤرشف بالأرشيف المرجعي الشامل') ?? '')
      : 'مؤرشف بالأرشيف المرجعي الشامل';
    const res = window.KSUDataBridge.archiveViolationRecord(type, id, reason, user);
    if (res && res.ok) {
      render();
      if (typeof window.renderSafetyViolations === 'function') window.renderSafetyViolations();
      if (typeof window.renderSmokingViolations === 'function') window.renderSmokingViolations();
      if (typeof window.updateViolationBadges === 'function') window.updateViolationBadges();
      if (typeof window.showToast === 'function') {
        window.showToast('تم نقل المخالفة إلى الأرشيف المرجعي الشامل بنجاح.', 'success');
      }
    } else if (typeof window.showToast === 'function') {
      window.showToast((res && res.message) || 'تعذرت أرشفة المخالفة.', 'error');
    }
    return res;
  }

  function restoreViolation(type, id) {
    const user = getActiveUser();
    if (!canAccessMasterArchive(user)) {
      if (typeof window.showToast === 'function') {
        window.showToast('عفواً، الاسترجاع من الأرشيف صلاحية حصرية لرئيس القسم ومسؤول النظام.', 'error');
      }
      return { ok: false, reason: 'unauthorized' };
    }
    if (!window.KSUDataBridge || typeof window.KSUDataBridge.restoreViolationRecord !== 'function') {
      return { ok: false, reason: 'unavailable' };
    }
    const res = window.KSUDataBridge.restoreViolationRecord(type, id, user);
    if (res && res.ok) {
      render();
      if (typeof window.renderSafetyViolations === 'function') window.renderSafetyViolations();
      if (typeof window.renderSmokingViolations === 'function') window.renderSmokingViolations();
      if (typeof window.updateViolationBadges === 'function') window.updateViolationBadges();
      if (typeof window.showToast === 'function') {
        window.showToast('تم استرجاع المخالفة إلى السجل النشط بنجاح.', 'success');
      }
    } else if (typeof window.showToast === 'function') {
      window.showToast((res && res.message) || 'تعذر استرجاع المخالفة.', 'error');
    }
    return res;
  }

  function init() {
    if (!initialized) {
      initialized = true;
      window.addEventListener('ksumc_data_updated', () => {
        render();
      });
      window.addEventListener('storage', (e) => {
        if (!e || !e.key || e.key.startsWith('ksumc_') || e.key === 'ksu_active_user') {
          render();
        }
      });
    }
    render();
  }

  window.KSUMasterArchive = {
    init,
    render,
    renderAutoArchiveSpotlight,
    getUnifiedRecords,
    getFilteredRecords,
    switchTab,
    switchStatusFilter,
    resetFilters,
    previewRecord,
    closePreviewModal,
    printRecord,
    printFilteredTable,
    openEmailModal,
    closeEmailModal,
    sendEmailNow,
    copyEmailBody,
    archiveViolation,
    restoreViolation
  };
})(window);

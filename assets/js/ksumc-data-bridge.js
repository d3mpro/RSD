/**
 * جسر البيانات الموحد لمنظومة سلامة المدينة الطبية (KSUMC Data Bridge)
 * يضمن تزامن ومشاركة البيانات بين كافة البوابات المستقلة (الميدان، الإدارة، الجودة، الشاشات، صفحة رئيس القسم، وبوابة المطور)
 * الإصدار المعماري المطور v3.5
 */

(function(window) {
  'use strict';

  const KEYS = {
    FACILITIES: 'ksumc_facilities',
    ROUNDS: 'ksumc_safety_rounds',
    ALARMS: 'ksumc_safety_alarms',
    PERMITS: 'ksumc_safety_permits',
    DOORS: 'ksumc_safety_doors',
    SAFETY_VIOLATIONS: 'ksumc_safety_violations',
    SMOKING_VIOLATIONS: 'ksumc_smoking_violations',
    HANDOVER: 'ksumc_safety_handover',
    INCIDENTS: 'ksumc_shift_incidents',
    ACTIVE_SHIFT: 'ksumc_safety_shift_active',
    BUILDINGS: 'ksumc_admin_buildings',
    USERS: 'ksumc_admin_users',
    ASSETS: 'ksumc_safety_assets',
    QUALITY_SCHEDULE: 'ksumc_quality_monthly_schedule',
    QUALITY_DIRECTIVES: 'ksumc_quality_directives',
    NOTIFICATIONS: 'ksumc_notifications',
    METRICS: 'ksumc_admin_metrics',
    TASKS: 'ksumc_safety_live_tasks',
    CAPA: 'ksumc_capa_records',
    INSPECTION_EVENTS: 'ksumc_inspection_events'
  };

  // قائمة المنشآت والمستشفيات المعتمدة الافتراضية
  const DEFAULT_FACILITIES = [
    {
      id: 'FAC-KKUH',
      code: 'KKUH',
      name: 'مستشفى الملك خالد الجامعي (KKUH)',
      type: 'مستشفى رئيسي جامعي',
      buildingsCount: 4,
      floorsCount: 9,
      dailyTargetRounds: 24,
      location: 'المدينة الطبية - الدرعية',
      status: 'نشط',
      complianceTarget: 95,
      description: 'المستشفى الجامعي الرئيسي (أجنحة التنويم، العناية المركزة، والعمليات).'
    },
    {
      id: 'FAC-KAUH',
      code: 'KAUH',
      name: 'مستشفى الملك عبدالعزيز الجامعي (KAUH)',
      type: 'مستشفى تخصصي جامعي',
      buildingsCount: 3,
      floorsCount: 6,
      dailyTargetRounds: 18,
      location: 'طريق المطار القديم - الملز',
      status: 'نشط',
      complianceTarget: 95,
      description: 'مستشفى تخصصي (الأنف والأذن والحنجرة، والعيون، والعيادات التخصصية).'
    },
    {
      id: 'FAC-KSUCCC',
      code: 'KSUCCC',
      name: 'مركز الأورام الجامعي (Comprehensive Cancer Center)',
      type: 'مركز أورام تخصصي',
      buildingsCount: 2,
      floorsCount: 7,
      dailyTargetRounds: 16,
      location: 'الحرم الطبي الرئيسي',
      status: 'نشط',
      complianceTarget: 98,
      description: 'علاج الأورام المتقدم، العلاج الإشعاعي، والصيدلية النووية.'
    },
    {
      id: 'FAC-KFCC',
      code: 'KFCC',
      name: 'مركز الملك فهد لطب وجراحة القلب (KFCC)',
      type: 'مركز قلب وجراحة متقدم',
      buildingsCount: 1,
      floorsCount: 5,
      dailyTargetRounds: 14,
      location: 'الحرم الطبي الرئيسي',
      status: 'نشط',
      complianceTarget: 98,
      description: 'جراحات القلب المفتوح، القسطرة التداخلية، والعناية القلبية المركزة.'
    },
    {
      id: 'FAC-OPD',
      code: 'Dental/OPD',
      name: 'مبنى العيادات التخصصية والأسنان',
      type: 'عيادات خارجية ومختبرات',
      buildingsCount: 1,
      floorsCount: 4,
      dailyTargetRounds: 10,
      location: 'المدينة الطبية - البوابة 2',
      status: 'نشط',
      complianceTarget: 95,
      description: 'مبنى العيادات الخارجية التخصصية ومختبرات الفحص والأسنان.'
    },
    {
      id: 'FAC-ADMIN',
      code: 'Admin',
      name: 'مبنى إدارة المدينة الطبية (Building 19)',
      type: 'مبنى إداري وتشغيلي',
      buildingsCount: 1,
      floorsCount: 4,
      dailyTargetRounds: 6,
      location: 'المدينة الطبية - البوابة 1',
      status: 'نشط',
      complianceTarget: 95,
      description: 'الإدارة العامة ومكاتب المشرفين والتحكم.'
    }
  ];

  // بيانات افتراضية للمباني
  const DEFAULT_BUILDINGS = [
    { id: 'BLD-01', name: 'مستشفى الملك خالد الجامعي (KKUH)', hospital: 'KKUH', floors: 'القبو، الأرضي، 1 - 8', type: 'مستشفى رئيسي' },
    { id: 'BLD-02', name: 'مستشفى الملك عبدالعزيز الجامعي (KAUH)', hospital: 'KAUH', floors: 'القبو، الأرضي، 1 - 5', type: 'مستشفى تخصصي' },
    { id: 'BLD-03', name: 'مركز الأورام الجامعي (KSUCCC)', hospital: 'KSUCCC', floors: 'القبو، الأرضي، 1 - 6', type: 'مركز أورام' },
    { id: 'BLD-04', name: 'مركز الملك فهد لطب وجراحة القلب', hospital: 'KFCC', floors: 'القبو، الأرضي، 1 - 4', type: 'مركز قلب' },
    { id: 'BLD-05', name: 'مبنى العيادات التخصصية والأسنان', hospital: 'Dental/OPD', floors: 'القبو، الأرضي، 1 - 3', type: 'عيادات خارجية' },
    { id: 'BLD-06', name: 'مبنى إدارة المدينة الطبية (Building 19)', hospital: 'Admin', floors: 'الأرضي، 1 - 3', type: 'مبنى إداري' }
  ];

  function getFromStorage(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Error reading ${key} from storage:`, e);
      return fallback;
    }
  }

  function setToStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { key, value } }));
      return true;
    } catch (e) {
      console.error(`Error writing ${key} to storage:`, e);
      return false;
    }
  }

  const KSUDataBridge = {
    KEYS: KEYS,

    /**
     * إدارة المنشآت والمستشفيات (Facilities Engine)
     */
    getFacilities: function() {
      const stored = getFromStorage(KEYS.FACILITIES, null);
      if (stored && Array.isArray(stored) && stored.length > 0) return stored;
      setToStorage(KEYS.FACILITIES, DEFAULT_FACILITIES);
      return DEFAULT_FACILITIES;
    },

    saveFacility: function(facility) {
      if (!facility || !facility.name) return false;
      const facilities = this.getFacilities();
      const existingIdx = facilities.findIndex(f => f.id === facility.id || (facility.code && f.code === facility.code));

      const newFacility = {
        id: facility.id || 'FAC-' + (facility.code || Date.now().toString().slice(-4)).toUpperCase(),
        code: facility.code || facility.name.slice(0, 4).toUpperCase(),
        name: facility.name,
        type: facility.type || 'مرفق صحي',
        buildingsCount: parseInt(facility.buildingsCount) || 1,
        floorsCount: parseInt(facility.floorsCount) || 3,
        dailyTargetRounds: parseInt(facility.dailyTargetRounds) || 12,
        location: facility.location || 'المدينة الطبية بجامعة الملك سعود',
        status: facility.status || 'نشط',
        complianceTarget: parseInt(facility.complianceTarget) || 95,
        description: facility.description || '',
        createdAt: facility.createdAt || new Date().toISOString()
      };

      if (existingIdx >= 0) {
        facilities[existingIdx] = { ...facilities[existingIdx], ...newFacility };
      } else {
        facilities.push(newFacility);
      }

      setToStorage(KEYS.FACILITIES, facilities);

      // تحديث قائمة المباني تلقائياً إذا كانت منشأة جديدة
      const buildings = this.getBuildings();
      if (!buildings.find(b => b.name === newFacility.name || b.hospital === newFacility.code)) {
        buildings.push({
          id: 'BLD-' + (buildings.length + 1).toString().padStart(2, '0'),
          name: newFacility.name,
          hospital: newFacility.code,
          floors: `الأرضي، 1 - ${newFacility.floorsCount}`,
          type: newFacility.type
        });
        setToStorage(KEYS.BUILDINGS, buildings);
      }

      return newFacility;
    },

    deleteFacility: function(facilityId) {
      let facilities = this.getFacilities();
      facilities = facilities.filter(f => f.id !== facilityId && f.code !== facilityId);
      setToStorage(KEYS.FACILITIES, facilities);
      return true;
    },

    getFacilityById: function(identifier) {
      if (!identifier) return null;
      const clean = identifier.trim().toLowerCase();
      const aliases = {
        'kkh': 'KKUH',
        'kkuh': 'KKUH',
        'kash': 'KAUH',
        'kauh': 'KAUH',
        'dentistry': 'Dental/OPD',
        'dental': 'Dental/OPD',
        'opd': 'Dental/OPD',
        'oncology': 'KSUCCC',
        'ksuccc': 'KSUCCC',
        'cancer': 'KSUCCC',
        'cardiac': 'KFCC',
        'kfcc': 'KFCC',
        'heart': 'KFCC',
        'admin': 'Admin'
      };
      const resolvedCode = (aliases[clean] || clean).toLowerCase();
      const facilities = this.getFacilities();
      return facilities.find(f => 
        (f.id && f.id.toLowerCase() === clean) || 
        (f.code && f.code.toLowerCase() === clean) || 
        (f.code && f.code.toLowerCase() === resolvedCode) ||
        (f.name && f.name.toLowerCase().includes(clean)) ||
        (f.name && f.name.toLowerCase().includes(resolvedCode))
      ) || null;
    },

    /**
     * المباني والمنشآت
     */
    getBuildings: function() {
      const blds = getFromStorage(KEYS.BUILDINGS, null);
      if (blds && blds.length > 0) return blds;
      setToStorage(KEYS.BUILDINGS, DEFAULT_BUILDINGS);
      return DEFAULT_BUILDINGS;
    },

    /**
     * جولات التفتيش الميدانية
     */
    getRounds: function() {
      return getFromStorage(KEYS.ROUNDS, []);
    },

    saveRound: function(round) {
      const rounds = this.getRounds();
      const userObj = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const newRound = {
        id: round.id || 'RND-' + Date.now(),
        date: round.date || new Date().toISOString().split('T')[0],
        time: round.time || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        timestamp: round.timestamp || new Date().toISOString(),
        facility: round.facility || round.hospital || 'مستشفى الملك خالد الجامعي (KKUH)',
        shift: round.shift || (userObj && userObj.shift) || 'الوردية 1 (صباحي)',
        routedTo: 'Q1',
        status: round.status || 'مكتملة',
        ...round
      };
      rounds.unshift(newRound);
      setToStorage(KEYS.ROUNDS, rounds);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncRound === 'function') {
        window.ksuFirebaseSync.syncRound(newRound);
      }
      return newRound;
    },

    /**
     * بلاغات الطوارئ وأجراس الإنذار (تُوجّه تلقائياً للمشرف العام الملك خالد H1 من جميع الورديات)
     */
    getAlarms: function() {
      return getFromStorage(KEYS.ALARMS, []);
    },

    getActiveAlarms: function() {
      return this.getAlarms().filter(a => a.status !== 'مغلق' && a.status !== 'تمت المعالجة');
    },

    saveAlarm: function(alarm) {
      const alarms = this.getAlarms();
      const userObj = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const newAlarm = {
        id: alarm.id || 'ALM-' + (alarms.length + 101) + '-' + Date.now().toString().slice(-3),
        title: alarm.title || 'إنذار طارئ',
        location: alarm.location || 'المبنى الرئيسي',
        facility: alarm.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
        severity: alarm.severity || 'critical',
        status: alarm.status || 'نشط - قيد الاستجابة',
        time: alarm.time || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        date: alarm.date || new Date().toISOString().split('T')[0],
        reportedBy: alarm.reportedBy || (userObj ? userObj.name : 'مفتش السلامة'),
        shift: alarm.shift || (userObj && userObj.shift) || 'الوردية 1 (صباحي)',
        routedTo: 'H1',
        routedToTitle: 'المشرف العام الملك خالد (H1)',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        ...alarm
      };
      alarms.unshift(newAlarm);
      setToStorage(KEYS.ALARMS, alarms);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncAlarm === 'function') {
        window.ksuFirebaseSync.syncAlarm(newAlarm);
      }
      return newAlarm;
    },

    resolveAlarm: function(alarmId, resolutionNotes = '') {
      const alarms = this.getAlarms();
      const found = alarms.find(a => a.id === alarmId);
      if (found) {
        found.status = 'تمت المعالجة';
        found.resolvedAt = new Date().toISOString();
        found.updatedAt = new Date().toISOString();
        found.updatedAtMs = Date.now();
        found.resolutionNotes = resolutionNotes;
        setToStorage(KEYS.ALARMS, alarms);
        if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncAlarm === 'function') {
          window.ksuFirebaseSync.syncAlarm(found);
        }
        return true;
      }
      return false;
    },

    /**
     * المخالفات والملاحظات الميدانية (تُوجّه للمشرف العام الملك خالد H1 من جميع الورديات)
     */
    getViolations: function() {
      const safety = getFromStorage(KEYS.SAFETY_VIOLATIONS, []);
      const smoking = getFromStorage(KEYS.SMOKING_VIOLATIONS, []);
      return { safety, smoking, total: safety.length + smoking.length };
    },

    saveSafetyViolation: function(violation) {
      const list = getFromStorage(KEYS.SAFETY_VIOLATIONS, []);
      const userObj = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const item = {
        id: violation.id || 'VIO-' + Date.now(),
        date: violation.date || new Date().toISOString().split('T')[0],
        status: violation.status || 'قيد المتابعة',
        facility: violation.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
        shift: violation.shift || (userObj && userObj.shift) || 'الوردية 1 (صباحي)',
        routedTo: 'H1',
        routedToTitle: 'المشرف العام الملك خالد (H1)',
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        ...violation
      };
      list.unshift(item);
      setToStorage(KEYS.SAFETY_VIOLATIONS, list);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncSafetyViolation === 'function') {
        window.ksuFirebaseSync.syncSafetyViolation(item);
      }
      return item;
    },

    saveSmokingViolation: function(violation) {
      const list = getFromStorage(KEYS.SMOKING_VIOLATIONS, []);
      const userObj = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const item = {
        id: violation.id || 'SMK-' + Date.now(),
        date: violation.date || new Date().toISOString().split('T')[0],
        status: violation.status || 'تم الضبط',
        facility: violation.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
        shift: violation.shift || (userObj && userObj.shift) || 'الوردية 1 (صباحي)',
        routedTo: 'H1',
        routedToTitle: 'المشرف العام الملك خالد (H1)',
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        ...violation
      };
      list.unshift(item);
      setToStorage(KEYS.SMOKING_VIOLATIONS, list);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncSmokingViolation === 'function') {
        window.ksuFirebaseSync.syncSmokingViolation(item);
      }
      return item;
    },

    /**
     * تصاريح العمل الساخن (تُوجّه لقسم الجودة وتقييم الأداء Q1 من جميع الورديات)
     */
    getPermits: function() {
      return getFromStorage(KEYS.PERMITS, []);
    },

    savePermit: function(permit) {
      const list = this.getPermits();
      const userObj = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const item = {
        id: permit.id || 'HWP-' + (list.length + 101),
        date: permit.date || new Date().toISOString().split('T')[0],
        status: permit.status || 'ساري',
        shift: permit.shift || (userObj && userObj.shift) || 'الوردية 1 (صباحي)',
        routedTo: 'Q1',
        routedToTitle: 'قسم الجودة وتقييم الأداء (Q1)',
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        ...permit
      };
      list.unshift(item);
      setToStorage(KEYS.PERMITS, list);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncPermit === 'function') {
        window.ksuFirebaseSync.syncPermit(item);
      }
      return item;
    },

    /**
     * سجل تسليم واستلام الورديات
     */
    getHandovers: function() {
      return getFromStorage(KEYS.HANDOVER, []);
    },

    saveHandover: function(handover) {
      const list = this.getHandovers();
      const item = {
        id: handover.id || 'HND-' + Date.now(),
        date: handover.date || new Date().toISOString().split('T')[0],
        time: handover.time || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        ...handover
      };
      list.unshift(item);
      setToStorage(KEYS.HANDOVER, list);
      return item;
    },

    /**
     * استرجاع وتتبع الأفراد المسجلين وحالتهم الميدانية الفعلية من الجولات الحقيقية
     */
    getActiveStaff: function(facilityFilter = 'all') {
      const users = (window.KSUAuth ? window.KSUAuth.getDefaultUsers() : []) || [];
      const rounds = this.getRounds();
      const todayStr = new Date().toISOString().split('T')[0];
      const todayRounds = rounds.filter(r => (this.extractRecordDateStr ? this.extractRecordDateStr(r) : (r.date || r.createdAt || '')) === todayStr);

      let staff = users.filter(u => u.roleCategory === 'field_inspector' || u.roleCategory === 'shift_supervisor' || u.roleCategory === 'head');

      if (facilityFilter && facilityFilter !== 'all') {
        const fac = this.getFacilityById(facilityFilter);
        staff = staff.filter(u => {
          const uFac = u.facility || '';
          return (this.matchesFacility ? this.matchesFacility({ facility: uFac }, fac || facilityFilter) : false) || uFac.includes('المدينة الطبية');
        });
      }

      return staff.map((s) => {
        const userRoundsToday = todayRounds.filter(r =>
          (r.inspectorId && (r.inspectorId === s.id || r.inspectorId === s.empId || r.inspectorId === s.username)) ||
          (r.inspector && s.name && r.inspector.trim() === s.name.trim())
        );
        const latestRound = userRoundsToday[0] || null;
        return {
          id: s.id,
          name: s.name,
          username: s.username || s.empId,
          empId: s.empId,
          role: s.role,
          roleCategory: s.roleCategory,
          phone: s.phone || '',
          facility: s.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
          shift: s.shift || 'الصباحية',
          todayRoundsCount: userRoundsToday.length,
          status: latestRound ? `أنجز (${userRoundsToday.length}) جولة اليوم` : 'جاهز للمباشرة الميدانية',
          location: latestRound ? (latestRound.building || latestRound.location || latestRound.floor || s.facility) : (s.facility || 'مستشفى الملك خالد الجامعي (KKUH)'),
          lastActive: latestRound ? (latestRound.time || 'اليوم') : 'لم تبدأ الجولة بعد'
        };
      });
    },

    /**
     * استرجاع وحفظ أهداف جولات العمل لرئيس القسم (مع المزامنة السحابية على Firebase)
     */
    getDepartmentTargets: function() {
      const defaults = {
        dailyRoundsTarget: 18,
        weeklyRoundsTarget: 126,
        monthlyRoundsTarget: 540,
        shift1Target: 6,
        shift2Target: 6,
        shift3Target: 6,
        inspectorDailyTarget: 3,
        complianceTargetPct: 96,
        buildingsTargetCount: 11,
        formsTargetCount: 14,
        updatedAt: new Date().toISOString()
      };
      try {
        const raw = localStorage.getItem('ksumc_department_targets');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            return Object.assign({}, defaults, parsed);
          }
        }
      } catch (e) {}
      return defaults;
    },

    saveDepartmentTargets: function(targetsObj) {
      const current = this.getDepartmentTargets();
      const merged = Object.assign({}, current, targetsObj, {
        updatedAt: new Date().toISOString()
      });
      localStorage.setItem('ksumc_department_targets', JSON.stringify(merged));
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncDepartmentTargets === 'function') {
        window.ksuFirebaseSync.syncDepartmentTargets(merged);
      }
      window.dispatchEvent(new CustomEvent('ksumc_targets_updated', { detail: { targets: merged } }));
      return merged;
    },

    /**
     * تصفير وحذف كافة الجولات والبيانات التجريبية استعداداً للعمل الحقيقي
     */
    purgeAllTrialData: function() {
      const keysToClear = [
        KEYS.ROUNDS,
        KEYS.ALARMS,
        KEYS.SAFETY_VIOLATIONS,
        KEYS.SMOKING_VIOLATIONS,
        KEYS.INCIDENTS,
        KEYS.PERMITS,
        KEYS.DOORS,
        KEYS.HANDOVER,
        KEYS.AUDIT_LOGS,
        KEYS.QUALITY_REVIEWS,
        'ksumc_quality_shift_inspection_logs',
        'ksumc_safety_dept_reports',
        'ksumc_compliance_registry',
        'ksumc_shift_incidents',
        'ksumc_capa_records',
        'ksumc_schedule',
        'ksumc_notifications',
        'ksumc_head_workflow_decisions'
      ];
      keysToClear.forEach(k => {
        try { localStorage.setItem(k, JSON.stringify([])); } catch (e) {}
      });
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.purgeAllTrialOperationalData === 'function') {
        window.ksuFirebaseSync.purgeAllTrialOperationalData(true);
      }
      window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { key: KEYS.ROUNDS, value: [] } }));
      return true;
    },

    /**
     * استرجاع المهام الحالية والمنفذة
     */
    getLiveTasks: function(facilityFilter = 'all') {
      const rounds = this.getRounds();
      const todayStr = new Date().toISOString().split('T')[0];

      let completedToday = rounds.filter(r => (r.date || r.createdAt || '').startsWith(todayStr));

      if (facilityFilter && facilityFilter !== 'all') {
        const fac = this.getFacilityById(facilityFilter);
        const matchName = fac ? fac.name : facilityFilter;
        const matchCode = fac ? fac.code : facilityFilter;

        completedToday = completedToday.filter(r => {
          const rFac = r.facility || r.hospital || r.location || '';
          return rFac.includes(matchName) || rFac.includes(matchCode);
        });
      }

      return {
        inProgress: [],
        completed: completedToday
      };
    },

    matchesFacility: function(record, targetFac) {
      if (!targetFac || targetFac === 'all') return true;
      const fObj = typeof targetFac === 'object' ? targetFac : this.getFacilityById(targetFac);
      const code = (fObj ? fObj.code : String(targetFac)).toLowerCase();
      const target = ((record.facility || '') + ' ' + (record.hospital || '') + ' ' + (record.location || '') + ' ' + (record.building || '')).toLowerCase();

      if (code === 'kkuh' || code === 'kkh') {
        return target.includes('خالد') || target.includes('kkuh') || target.includes('kkh');
      }
      if (code === 'kauh' || code === 'kash') {
        return target.includes('عبدالعزيز') || target.includes('عبد العزيز') || target.includes('kauh') || target.includes('kash');
      }
      if (code === 'dental/opd' || code === 'dentistry' || code === 'dental' || code === 'opd') {
        return target.includes('أسنان') || target.includes('اسنان') || target.includes('dental') || target.includes('opd') || target.includes('عيادات');
      }
      if (code === 'ksuccc' || code === 'oncology' || code === 'cancer') {
        return target.includes('أورام') || target.includes('اورام') || target.includes('cancer') || target.includes('ksuccc') || target.includes('onc');
      }
      if (code === 'kfcc' || code === 'cardiac' || code === 'heart') {
        return target.includes('قلب') || target.includes('kfcc') || target.includes('cardiac') || target.includes('heart');
      }
      if (code === 'admin') {
        return target.includes('إدارة') || target.includes('ادارة') || target.includes('admin') || target.includes('19');
      }

      if (fObj) {
        const cleanName = fObj.name.replace(/\(.*?\)/g, '').trim().toLowerCase();
        if (target.includes(cleanName) || cleanName.includes(target)) return true;
      }
      return target.includes(code);
    },

    extractRecordDateStr: function(r) {
      if (!r) return '';
      const raw = r.date || r.createdAt || r.timestamp || r.supervisorApprovedAt || r.submittedAt || (r.workflowHistory && r.workflowHistory[0] && r.workflowHistory[0].timestamp) || '';
      if (!raw) return '';
      if (typeof raw === 'string') {
        const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
        if (isoMatch) return isoMatch[0];
      }
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } catch (e) {}
      return '';
    },

    /**
     * حساب إحصائيات ونسب الامتثال والمستهدف لمنشأة محددة أو كامل المنظومة
     */
    getFacilityMetrics: function(facilityFilter = 'all', dateRange = 'all') {
      const facilities = this.getFacilities();
      const rounds = this.getRounds();
      const alarms = this.getActiveAlarms();
      const violations = this.getViolations();
      const deptTargets = this.getDepartmentTargets();
      const todayStr = new Date().toISOString().split('T')[0];

      let selectedFacility = null;
      let targetRounds = Number(deptTargets.dailyRoundsTarget) || 18;
      let targetCompliance = Number(deptTargets.complianceTargetPct) || 96;

      if (facilityFilter && facilityFilter !== 'all') {
        selectedFacility = this.getFacilityById(facilityFilter) || facilities[0];
        targetRounds = selectedFacility ? (Number(selectedFacility.dailyTargetRounds) || targetRounds) : targetRounds;
        targetCompliance = selectedFacility ? (Number(selectedFacility.complianceTarget) || targetCompliance) : targetCompliance;
      }

      // Filter by facility
      let filteredRounds = rounds.filter(r => this.matchesFacility(r, selectedFacility || facilityFilter));
      let filteredAlarms = alarms.filter(a => this.matchesFacility(a, selectedFacility || facilityFilter));

      // Filter by date range
      const now = new Date();
      let matchedRounds = filteredRounds.filter(r => {
        const rDateStr = this.extractRecordDateStr(r);
        if (!rDateStr) return true;
        if (!dateRange || dateRange === 'all') return true;
        if (dateRange === 'today') return rDateStr === todayStr;
        
        const rDate = new Date(rDateStr);
        if (isNaN(rDate.getTime())) return true;
        const diffDays = Math.max(0, (now - rDate) / (1000 * 60 * 60 * 24));
        if (dateRange === 'week') return diffDays <= 7;
        if (dateRange === 'month') return diffDays <= 30;
        if (dateRange === 'quarter') return diffDays <= 90;
        return true;
      });

      const achievedRounds = matchedRounds.length;

      // نسبة تحقيق الهدف للجولات (المحقق / المستهدف)
      const achievementRate = targetRounds > 0 
        ? Math.min(100, Math.round((achievedRounds / targetRounds) * 100))
        : 0;

      // حساب نسبة الامتثال الدقيقة من الفحوصات الفعلية
      let totalChecks = 0;
      let compliantChecks = 0;

      const roundsForCompliance = matchedRounds.length > 0 ? matchedRounds : filteredRounds;

      roundsForCompliance.forEach(r => {
        if (r.checklist && Array.isArray(r.checklist) && r.checklist.length > 0) {
          r.checklist.forEach(item => {
            totalChecks++;
            if (item.status === 'compliant' || item.result === 'مطابق' || item.status === 'مطابق' || item.pass === true) {
              compliantChecks++;
            }
          });
        } else if (typeof r.score === 'number') {
          totalChecks += 100;
          compliantChecks += Number(r.score);
        } else if (typeof r.complianceRate === 'number') {
          totalChecks += 100;
          compliantChecks += Number(r.complianceRate);
        } else {
          totalChecks += 100;
          compliantChecks += 100;
        }
      });

      const complianceRate = totalChecks > 0 
        ? Math.round((compliantChecks / totalChecks) * 100) 
        : (roundsForCompliance.length > 0 ? 100 : 100);

      const staffList = this.getActiveStaff(facilityFilter);

      return {
        facility: selectedFacility ? selectedFacility.name : 'المدينة الطبية بجامعة الملك سعود (كافة المنشآت)',
        facilityCode: selectedFacility ? selectedFacility.code : 'MEDCITY',
        targetRounds: targetRounds,
        achievedRounds: achievedRounds,
        remainingRounds: Math.max(0, targetRounds - achievedRounds),
        achievementRate: achievementRate,
        complianceRate: complianceRate,
        complianceTarget: targetCompliance,
        activeStaffCount: staffList.length,
        activeAlarmsCount: filteredAlarms.length,
        openViolationsCount: violations.total,
        totalRoundsHistory: filteredRounds.length,
        matchedRounds: matchedRounds
      };
    },

    /**
     * التوافق مع الكود السابق لمؤشرات الأداء العامة
     */
    getLiveKPIs: function() {
      const metrics = this.getFacilityMetrics('all');
      return {
        totalRounds: metrics.totalRoundsHistory,
        todayRoundsCount: metrics.achievedRounds,
        activeAlarmsCount: metrics.activeAlarmsCount,
        openViolationsCount: metrics.openViolationsCount,
        complianceRate: metrics.complianceRate,
        hotPermitsCount: this.getPermits().filter(p => !p.status || p.status.includes('ساري') || p.status.includes('معتمد') || p.status.includes('مطابق')).length,
        activeStaffEstimate: metrics.activeStaffCount
      };
    },

    /**
     * منظومة الإشعارات اللحظية والتوجيهات التنفيذية للمفتشين والمشرفين (Real-Time Notifications Engine)
     */
    getNotifications: function() {
      const notifs = getFromStorage(KEYS.NOTIFICATIONS, []);
      const alarms = getFromStorage(KEYS.ALARMS, []);
      const map = new Map();

      // 1. الإشعارات والتوجيهات المباشرة
      (Array.isArray(notifs) ? notifs : []).forEach(n => {
        if (n && n.id && !n._deleted) {
          map.set(String(n.id), n);
        }
      });

      // 2. التوجيهات المحفوظة سابقاً داخل سجل الإنذارات
      (Array.isArray(alarms) ? alarms : []).forEach(a => {
        if (!a || !a.id) return;
        const isDirective = (a.title && a.title.includes('توجيه')) || a.status === 'توجيه إداري نشط' || a.type === 'executive_directive';
        if (isDirective && a.status !== 'مغلق' && a.status !== 'تمت المعالجة') {
          const nid = String(a.id);
          if (!map.has(nid)) {
            map.set(nid, {
              id: nid,
              title: a.title || 'توجيه تنفيذي من رئيس القسم',
              message: a.notes || a.details || '',
              sender: a.reportedBy || 'رئيس القسم / المشرف العام (H1)',
              senderRole: 'head',
              targetShift: a.targetShift || 'all',
              targetRole: a.targetRole || 'all',
              facility: a.location || a.facility || 'كافة المنشآت الطبية',
              priority: a.priority || (a.severity === 'critical' ? 'critical' : 'high'),
              type: 'executive_directive',
              status: a.status || 'نشط',
              acknowledgedBy: Array.isArray(a.acknowledgedBy) ? a.acknowledgedBy : [],
              date: a.date || (a.createdAt ? a.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]),
              time: a.time || '',
              createdAt: a.createdAt || new Date().toISOString(),
              updatedAt: a.updatedAt || a.createdAt || new Date().toISOString(),
              updatedAtMs: a.updatedAtMs || new Date(a.updatedAt || a.createdAt || Date.now()).getTime() || Date.now()
            });
          }
        }
      });

      return Array.from(map.values()).sort((a, b) => {
        const tA = Number(a.updatedAtMs || a.createdAtMs || new Date(a.updatedAt || a.createdAt || 0).getTime() || 0);
        const tB = Number(b.updatedAtMs || b.createdAtMs || new Date(b.updatedAt || b.createdAt || 0).getTime() || 0);
        return tB - tA;
      });
    },

    getActiveNotificationsForUser: function(userObj) {
      const user = userObj || (window.KSUAuth ? window.KSUAuth.getUser() : null);
      const list = this.getNotifications().filter(n => n.status !== 'مؤرشف' && n.status !== 'مغلق' && !n._deleted);
      if (!user) return list;

      const uShift = String(user.shift || '');
      const uRoleCat = window.KSUAuth ? window.KSUAuth.getRoleCategory(user) : (user.roleCategory || 'field_inspector');
      const uId = String(user.id || '');
      const uEmpId = String(user.empId || user.username || '');
      const uName = String(user.name || '');

      return list.filter(n => {
        // 1. إذا كان التوجيه أو الإشعار مسنداً بالاسم أو الرقم الوظيفي لمفتش محدد
        if (n.targetInspector || n.targetEmpId || n.targetUser) {
          const isDirectTarget = (n.targetEmpId && (n.targetEmpId === uEmpId || n.targetEmpId === uId)) ||
                                 (n.targetUser && (n.targetUser === uId || n.targetUser === uEmpId)) ||
                                 (n.targetInspector && uName && (uName.includes(n.targetInspector) || n.targetInspector.includes(uName)));
          if (isDirectTarget) return true;
        }

        // 2. مطابقة الوردية أو التوجيهات العامة للوردية
        const targetShift = String(n.targetShift || 'all');
        if (targetShift !== 'all' && targetShift !== 'جميع الورديات') {
          const shiftMatched =
            uShift.includes(targetShift) ||
            targetShift.includes(uShift) ||
            (targetShift.includes('1') && (uShift.includes('1') || uShift.includes('صباح') || uShift.includes('الأولى') || uShift.includes('الاولى') || uEmpId.includes('1'))) ||
            (targetShift.includes('2') && (uShift.includes('2') || uShift.includes('مسائ') || uShift.includes('الثانية') || uEmpId.includes('2'))) ||
            (targetShift.includes('3') && (uShift.includes('3') || uShift.includes('ليل') || uShift.includes('الثالثة') || uEmpId.includes('3'))) ||
            targetShift === uId ||
            targetShift === uEmpId ||
            (uName && targetShift.includes(uName));

          if (!shiftMatched && uRoleCat !== 'head' && uRoleCat !== 'developer' && uRoleCat !== 'admin' && uRoleCat !== 'shift_supervisor') {
            return false;
          }
        }
        return true;
      });
    },

    saveNotification: function(notif) {
      if (!notif || (!notif.message && !notif.notes && !notif.title)) return null;
      const list = getFromStorage(KEYS.NOTIFICATIONS, []);
      const userObj = window.KSUAuth ? window.KSUAuth.getUser() : null;
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      const newNotif = {
        id: notif.id || ('DIR-' + nowMs.toString().slice(-6) + '-' + Math.random().toString(36).substring(2, 5).toUpperCase()),
        title: notif.title || 'توجيه تنفيذي فوري للمشرفين والمفتشين',
        message: notif.message || notif.notes || '',
        sender: notif.sender || notif.reportedBy || (userObj ? `${userObj.name} (${userObj.empId || userObj.role || ''})` : 'رئيس القسم / المشرف العام (H1)'),
        senderRole: notif.senderRole || (userObj ? userObj.roleCategory : 'head'),
        targetShift: notif.targetShift || 'all',
        targetShiftLabel: notif.targetShiftLabel || (notif.targetShift && notif.targetShift !== 'all' ? notif.targetShift : 'كافة المفتشين والمشرفين (جميع الورديات)'),
        targetRole: notif.targetRole || 'all',
        facility: notif.facility || notif.location || 'كافة المنشآت الطبية',
        priority: notif.priority || 'high',
        type: notif.type || 'executive_directive',
        status: notif.status || 'نشط',
        acknowledgedBy: Array.isArray(notif.acknowledgedBy) ? notif.acknowledgedBy : [],
        date: notif.date || nowIso.split('T')[0],
        time: notif.time || new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
        createdAt: notif.createdAt || nowIso,
        updatedAt: nowIso,
        createdAtMs: notif.createdAtMs || nowMs,
        updatedAtMs: nowMs,
        ...notif
      };

      const existingIdx = list.findIndex(item => String(item.id) === String(newNotif.id));
      if (existingIdx !== -1) {
        list[existingIdx] = Object.assign({}, list[existingIdx], newNotif);
      } else {
        list.unshift(newNotif);
      }

      setToStorage(KEYS.NOTIFICATIONS, list);

      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncNotification === 'function') {
        window.ksuFirebaseSync.syncNotification(newNotif);
      }

      window.dispatchEvent(new CustomEvent('ksumc_notifications_updated', { detail: { notification: newNotif, list } }));
      return newNotif;
    },

    acknowledgeNotification: function(notifId, userObj) {
      if (!notifId) return false;
      const user = userObj || (window.KSUAuth ? window.KSUAuth.getUser() : null) || {
        id: 'INSP',
        name: 'مفتش السلامة الميداني',
        empId: 'M1',
        shift: 'الوردية الميدانية'
      };
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

      const ackEntry = {
        userId: user.id || user.empId || user.username || 'USR',
        empId: user.empId || user.username || '',
        name: user.name || 'مفتش السلامة',
        role: user.role || 'مفتش سلامة',
        shift: user.shift || '',
        time: timeStr,
        timestamp: nowIso
      };

      const list = getFromStorage(KEYS.NOTIFICATIONS, []);
      let targetNotif = list.find(n => String(n.id) === String(notifId));

      if (!targetNotif) {
        // إذا كان التوجيه مخزناً في الإنذارات القديمة نرقيه إلى قائمة الإشعارات
        const allMerged = this.getNotifications();
        const foundFromAlarms = allMerged.find(n => String(n.id) === String(notifId));
        if (foundFromAlarms) {
          targetNotif = Object.assign({}, foundFromAlarms);
          list.unshift(targetNotif);
        }
      }

      if (targetNotif) {
        if (!Array.isArray(targetNotif.acknowledgedBy)) {
          targetNotif.acknowledgedBy = [];
        }
        const alreadyAcked = targetNotif.acknowledgedBy.some(a =>
          (a.userId && a.userId === ackEntry.userId) ||
          (a.empId && ackEntry.empId && a.empId === ackEntry.empId) ||
          (a.name && a.name === ackEntry.name)
        );
        if (!alreadyAcked) {
          targetNotif.acknowledgedBy.push(ackEntry);
        }
        targetNotif.updatedAt = nowIso;
        targetNotif.updatedAtMs = nowMs;
        setToStorage(KEYS.NOTIFICATIONS, list);

        if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncNotification === 'function') {
          window.ksuFirebaseSync.syncNotification(targetNotif);
        }
        window.dispatchEvent(new CustomEvent('ksumc_notifications_updated', { detail: { notification: targetNotif, list } }));
        return true;
      }
      return false;
    },

    deleteNotification: function(notifId) {
      if (!notifId) return false;
      let list = getFromStorage(KEYS.NOTIFICATIONS, []);
      list = list.filter(n => String(n.id) !== String(notifId));
      setToStorage(KEYS.NOTIFICATIONS, list);

      // وكذلك إغلاقه إن كان في سجل الإنذارات
      const alarms = getFromStorage(KEYS.ALARMS, []);
      const aIdx = alarms.findIndex(a => String(a.id) === String(notifId));
      if (aIdx !== -1) {
        alarms[aIdx].status = 'مغلق';
        alarms[aIdx].updatedAt = new Date().toISOString();
        alarms[aIdx].updatedAtMs = Date.now();
        setToStorage(KEYS.ALARMS, alarms);
        if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncAlarm === 'function') {
          window.ksuFirebaseSync.syncAlarm(alarms[aIdx]);
        }
      }

      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.deleteNotificationFromCloud === 'function') {
        window.ksuFirebaseSync.deleteNotificationFromCloud(notifId);
      }
      window.dispatchEvent(new CustomEvent('ksumc_notifications_updated', { detail: { deletedId: notifId, list } }));
      return true;
    },

    // =========================================================================
    // منظومة سجل الإجراءات التصحيحية والوقائية (CAPA Registry Engine)
    // =========================================================================

    /**
     * احتساب تاريخ الاستحقاق وفق أيام العمل الرسمية بالسعودية (الأحد - الخميس)
     * مع استبعاد عطلة نهاية الأسبوع (الجمعة والسبت)
     */
    addSaudiBusinessDays: function(startDateStr, businessDays) {
      const date = startDateStr ? new Date(startDateStr) : new Date();
      let count = 0;
      while (count < businessDays) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay(); // 0: Sun, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
        if (day !== 5 && day !== 6) {
          count++;
        }
      }
      return date.toISOString().split('T')[0];
    },

    /**
     * احتساب عدد أيام العمل المتبقية حتى تاريخ الاستحقاق (أو السالب إن كانت متأخرة)
     */
    calculateRemainingBusinessDays: function(dueDateStr) {
      if (!dueDateStr) return 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(dueDateStr);
      due.setHours(0, 0, 0, 0);

      const isOverdue = due < today;
      let cur = isOverdue ? new Date(due) : new Date(today);
      const target = isOverdue ? new Date(today) : new Date(due);

      let bDays = 0;
      while (cur < target) {
        cur.setDate(cur.getDate() + 1);
        const d = cur.getDay();
        if (d !== 5 && d !== 6) {
          bDays++;
        }
      }
      return isOverdue ? -bDays : bDays;
    },

    /**
     * استرجاع سجلات الإجراءات التصحيحية
     */
    getCAPARecords: function() {
      let records = getFromStorage(KEYS.CAPA, []);
      if (!Array.isArray(records) || records.length === 0) {
        records = this.syncAndExtractCAPAFromViolationsAndRounds();
      }
      return records;
    },

    /**
     * فحص واستخراج الإجراءات التصحيحية آلياً من مخالفات السلامة والتدخين وجولات التفتيش
     */
    syncAndExtractCAPAFromViolationsAndRounds: function() {
      const capaList = getFromStorage(KEYS.CAPA, []);
      const existingSourceIds = new Set(capaList.map(c => c.sourceId || c.id));
      let newlyAdded = 0;

      // 1. استخراج من مخالفات السلامة العامة (SLA = 5 أيام عمل)
      const safetyViols = getFromStorage(KEYS.SAFETY_VIOLATIONS, []);
      safetyViols.forEach(v => {
        if (!existingSourceIds.has(v.id)) {
          const reportDate = v.date || new Date().toISOString().split('T')[0];
          const dueDate = this.addSaudiBusinessDays(reportDate, 5);
          capaList.push({
            id: 'CAPA-' + (v.id || 'SV-' + Date.now().toString().slice(-4)),
            sourceType: 'safety_violation',
            sourceId: v.id,
            sourceTitle: 'محضر مخالفة سلامة ميدانية',
            facility: v.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
            building: v.location || 'المبنى الرئيسي (A)',
            floor: v.floor || 'الدور الأرضي',
            locationDetails: (v.location || '') + (v.room ? ' - غرفة ' + v.room : ''),
            itemDescription: 'رصد مخالفة سلامة ميدانية: ' + (Array.isArray(v.devices) ? v.devices.join('، ') : (v.notes || 'أجهزة ومعدات غير مصرحة')),
            severity: 'high',
            reportedBy: v.officerName || v.inspector || 'مفتش السلامة المناوب',
            reporterEmpId: v.officerEmpId || 'M1',
            reporterShift: v.shift || '1',
            reportedAt: (v.date || '') + ' ' + (v.time || ''),
            slaDays: 5,
            dueDate: dueDate,
            status: v.actionTaken && v.actionTaken.includes('تصحيح') ? 'closed' : 'open',
            correctiveAction: 'إزالة الأجهزة المخالفة وتأمين الموقع ومتابعة التزام القسم المعني بالمعايير',
            assignedDepartment: 'الإدارة العامة للأمن والسلامة - إدارة السلامة',
            followupReminders: [],
            reminderCount: 0,
            lastReminderAt: null,
            closureNotes: v.actionTaken || '',
            closedBy: v.actionTaken && v.actionTaken.includes('تصحيح') ? (v.officerName || 'المفتش') : null,
            closedAt: v.actionTaken && v.actionTaken.includes('تصحيح') ? reportDate : null,
            createdAt: v.date || new Date().toISOString()
          });
          existingSourceIds.add(v.id);
          newlyAdded++;
        }
      });

      // 2. استخراج من مخالفات التدخين (SLA = 5 أيام عمل)
      const smokingViols = getFromStorage(KEYS.SMOKING_VIOLATIONS, []);
      smokingViols.forEach(smk => {
        if (!existingSourceIds.has(smk.id)) {
          const reportDate = smk.date || new Date().toISOString().split('T')[0];
          const dueDate = this.addSaudiBusinessDays(reportDate, 5);
          capaList.push({
            id: 'CAPA-' + (smk.id || 'SMK-' + Date.now().toString().slice(-4)),
            sourceType: 'smoking_violation',
            sourceId: smk.id,
            sourceTitle: 'محضر ضبط مخالفة تدخين',
            facility: smk.facility || 'المدينة الطبية بجامعة الملك سعود',
            building: smk.location || 'المبنى الرئيسي',
            floor: smk.floor || 'المدخل',
            locationDetails: smk.location || 'منطقة محظورة',
            itemDescription: 'ضبط تدخين في منطقة صحية محظورة بموجب اشتراطات نظام مكافحة التدخين ولائحة سباهي',
            severity: 'medium',
            reportedBy: smk.officerName || 'مفتش السلامة',
            reporterEmpId: smk.officerEmpId || 'M2',
            reporterShift: smk.shift || '1',
            reportedAt: (smk.date || '') + ' ' + (smk.time || ''),
            slaDays: 5,
            dueDate: dueDate,
            status: 'open',
            correctiveAction: 'تحرير المخالفة وتوجيه المخالف وتكثيف اللوحات الإرشادية والرقابة الميدانية',
            assignedDepartment: 'إدارة السلامة ووحدة مكافحة التدخين',
            followupReminders: [],
            reminderCount: 0,
            lastReminderAt: null,
            createdAt: smk.date || new Date().toISOString()
          });
          existingSourceIds.add(smk.id);
          newlyAdded++;
        }
      });

      // 3. استخراج من الجولات التفتيشية غير المطابقة (SLA = 10 أيام عمل للملاحظات الهندسية وسباهي)
      const rounds = getFromStorage(KEYS.ROUNDS, []);
      rounds.forEach(r => {
        const hasViol = (r.violationCount && r.violationCount > 0) || (r.score && Number(r.score) < 100);
        if (hasViol && !existingSourceIds.has(r.id)) {
          const reportDate = (r.date || (r.submittedAt ? r.submittedAt.split('T')[0] : new Date().toISOString().split('T')[0]));
          const dueDate = this.addSaudiBusinessDays(reportDate, 10);
          
          let violDetails = r.notes || '';
          if (Array.isArray(r.items)) {
            const nonCompliantItems = r.items.filter(it => it.status === 'violation' || it.status === 'observation' || it.compliant === false);
            if (nonCompliantItems.length > 0) {
              violDetails = nonCompliantItems.map(it => it.name || it.text || it.title || 'بند غير مطابق').join(' | ');
            }
          }
          if (!violDetails) violDetails = `رصد عدم مطابقة في نموذج: ${r.formTitle || r.title || 'جولة تفتيش'} (نسبة الامتثال: ${r.score || 0}%)`;

          capaList.push({
            id: 'CAPA-RND-' + (r.id ? r.id.replace('RND-', '') : Date.now().toString().slice(-4)),
            sourceType: 'inspection_form',
            sourceId: r.id,
            sourceTitle: r.formTitle || r.title || 'نموذج تفتيش سلامة',
            facility: r.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
            building: r.building || 'المبنى الرئيسي',
            floor: r.floor || 'الدور الأرضي',
            locationDetails: `${r.building || ''} - ${r.floor || ''}`,
            itemDescription: violDetails,
            severity: (r.score && Number(r.score) < 75) ? 'high' : 'medium',
            reportedBy: r.inspector || 'مفتش السلامة',
            reporterEmpId: r.inspectorId || 'M1',
            reporterShift: r.shift || '1',
            reportedAt: `${r.date || reportDate} ${r.time || ''}`,
            slaDays: 10,
            dueDate: dueDate,
            status: r.status === 'approved' ? 'closed' : 'open',
            correctiveAction: 'إجراء الصيانة التصحيحية وإعادة فحص الموقع والتأكد من مطابقة معايير سباهي (CBAHI)',
            assignedDepartment: 'إدارة التشغيل والصيانة / السلامة',
            followupReminders: [],
            reminderCount: 0,
            lastReminderAt: null,
            closureNotes: r.headNotes || '',
            closedBy: r.status === 'approved' ? (r.headApprovedBy || 'المشرف العام') : null,
            closedAt: r.status === 'approved' ? reportDate : null,
            createdAt: r.submittedAt || new Date().toISOString()
          });
          existingSourceIds.add(r.id);
          newlyAdded++;
        }
      });

      if (newlyAdded > 0 || capaList.length > 0) {
        setToStorage(KEYS.CAPA, capaList);
      }
      return capaList;
    },

    saveCAPARecord: function(capa) {
      if (!capa) return null;
      const list = getFromStorage(KEYS.CAPA, []);
      const nowIso = new Date().toISOString();
      const reportDate = capa.date || nowIso.split('T')[0];
      const slaDays = Number(capa.slaDays) === 10 ? 10 : 5;
      const dueDate = capa.dueDate || this.addSaudiBusinessDays(reportDate, slaDays);

      const newRecord = {
        id: capa.id || ('CAPA-' + Date.now().toString().slice(-6)),
        sourceType: capa.sourceType || 'manual',
        sourceId: capa.sourceId || '',
        sourceTitle: capa.sourceTitle || 'إجراء تصحيحي ووقائي ميداني',
        facility: capa.facility || 'مستشفى الملك خالد الجامعي (KKUH)',
        building: capa.building || 'المبنى الرئيسي (A)',
        floor: capa.floor || 'الدور الأرضي',
        locationDetails: capa.locationDetails || '',
        itemDescription: capa.itemDescription || capa.description || '',
        severity: capa.severity || 'medium',
        reportedBy: capa.reportedBy || 'مفتش السلامة',
        reporterEmpId: capa.reporterEmpId || '',
        reporterShift: capa.reporterShift || '1',
        reportedAt: capa.reportedAt || `${reportDate} ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`,
        slaDays: slaDays,
        dueDate: dueDate,
        status: capa.status || 'open',
        correctiveAction: capa.correctiveAction || '',
        assignedDepartment: capa.assignedDepartment || 'الإدارة العامة للأمن والسلامة - إدارة السلامة',
        followupReminders: Array.isArray(capa.followupReminders) ? capa.followupReminders : [],
        reminderCount: Number(capa.reminderCount) || 0,
        lastReminderAt: capa.lastReminderAt || null,
        closureNotes: capa.closureNotes || '',
        closedBy: capa.closedBy || null,
        closedAt: capa.closedAt || null,
        createdAt: capa.createdAt || nowIso,
        updatedAt: nowIso
      };

      const idx = list.findIndex(c => String(c.id) === String(newRecord.id));
      if (idx !== -1) {
        list[idx] = Object.assign({}, list[idx], newRecord);
      } else {
        list.unshift(newRecord);
      }

      setToStorage(KEYS.CAPA, list);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncCAPARecord === 'function') {
        window.ksuFirebaseSync.syncCAPARecord(newRecord);
      }
      window.dispatchEvent(new CustomEvent('ksumc_capa_updated', { detail: { record: newRecord, list } }));
      return newRecord;
    },

    updateCAPARecord: function(id, updates) {
      if (!id || !updates) return null;
      const list = getFromStorage(KEYS.CAPA, []);
      const idx = list.findIndex(c => String(c.id) === String(id));
      if (idx === -1) return null;

      list[idx] = Object.assign({}, list[idx], updates, { updatedAt: new Date().toISOString() });
      setToStorage(KEYS.CAPA, list);

      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.syncCAPARecord === 'function') {
        window.ksuFirebaseSync.syncCAPARecord(list[idx]);
      }
      window.dispatchEvent(new CustomEvent('ksumc_capa_updated', { detail: { record: list[idx], list } }));
      return list[idx];
    },

    deleteCAPARecord: function(id) {
      if (!id) return false;
      let list = getFromStorage(KEYS.CAPA, []);
      list = list.filter(c => String(c.id) !== String(id));
      setToStorage(KEYS.CAPA, list);
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.deleteCAPARecordFromCloud === 'function') {
        window.ksuFirebaseSync.deleteCAPARecordFromCloud(id);
      }
      window.dispatchEvent(new CustomEvent('ksumc_capa_updated', { detail: { deletedId: id, list } }));
      return true;
    },

    /**
     * إرسال تنبيه متابعة ميداني فوري لراصد المخالفة / المفتش
     */
    sendCAPAFollowupReminder: function(capaId, customMessage, senderName) {
      const list = getFromStorage(KEYS.CAPA, []);
      const capa = list.find(c => String(c.id) === String(capaId));
      if (!capa) return { success: false, message: 'الإجراء التصحيحي غير موجود' };

      const sender = senderName || 'سعادة المشرف العام (H1)';
      const inspectorName = capa.reportedBy || 'مفتش السلامة الراصد';
      const remDays = this.calculateRemainingBusinessDays(capa.dueDate);
      const daysText = remDays < 0 
        ? `⚠️ متأخر عن المهلة بـ ${Math.abs(remDays)} أيام عمل` 
        : `متبقي ${remDays} أيام عمل حتى انتهاء المهلة (${capa.dueDate})`;

      const defaultMsg = `المفتش الزميل: ${inspectorName}، نأمل المتابعة الميدانية العاجلة للإجراء التصحيحي رقم (${capa.id}) بموقع (${capa.building} - ${capa.floor} - ${capa.locationDetails}). ${daysText}. نرجو سرعة التحقق من المعالجة وإرفاق ما يثبت.`;
      const finalMsg = customMessage && customMessage.trim() ? customMessage.trim() : defaultMsg;

      // 1. إنشاء وبث إشعار رسمي موجه للراصد عبر نظام الإشعارات المركزي
      const notif = this.saveNotification({
        id: 'REM-CAPA-' + Date.now().toString().slice(-6),
        title: `⚡ تنبيه متابعة عاجل من المشرف العام: الإجراء التصحيحي [${capa.id}]`,
        message: finalMsg,
        sender: sender,
        senderRole: 'head',
        targetShift: capa.reporterShift || 'all',
        targetRole: 'inspector',
        facility: capa.facility || 'كافة المنشآت الطبية',
        priority: remDays <= 0 ? 'critical' : 'high',
        type: 'capa_reminder',
        status: 'نشط',
        relatedCapaId: capa.id
      });

      // 2. تحديث سجل الإجراء التصحيحي بعدد وتاريخ التنبيهات
      const nowIso = new Date().toISOString();
      const reminderEntry = {
        timestamp: nowIso,
        sender: sender,
        message: finalMsg,
        remainingDaysAtReminder: remDays
      };

      if (!Array.isArray(capa.followupReminders)) {
        capa.followupReminders = [];
      }
      capa.followupReminders.push(reminderEntry);
      capa.reminderCount = (Number(capa.reminderCount) || 0) + 1;
      capa.lastReminderAt = nowIso;

      this.updateCAPARecord(capa.id, {
        followupReminders: capa.followupReminders,
        reminderCount: capa.reminderCount,
        lastReminderAt: capa.lastReminderAt
      });

      return {
        success: true,
        notification: notif,
        reminderCount: capa.reminderCount,
        lastReminderAt: nowIso,
        message: `تم إرسال تنبيه المتابعة بنجاح إلى المفتش (${inspectorName}) وبثه عبر Firebase`
      };
    },

    /**
     * الاستماع للتحديثات الفورية بين النوافذ والصفحات
     */
    listenToChanges: function(callback) {
      window.addEventListener('storage', (e) => {
        if (Object.values(KEYS).includes(e.key)) {
          callback(e.key, getFromStorage(e.key));
        }
      });
      window.addEventListener('ksumc_data_updated', (e) => {
        callback(e.detail.key, e.detail.value);
      });
      window.addEventListener('ksumc_notifications_updated', (e) => {
        callback(KEYS.NOTIFICATIONS, e.detail.list || this.getNotifications());
      });
      window.addEventListener('ksumc_capa_updated', (e) => {
        callback(KEYS.CAPA, e.detail.list || this.getCAPARecords());
      });
    }
  };

  window.KSUDataBridge = KSUDataBridge;

})(window);

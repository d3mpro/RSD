/**
 * KSUMC Safety Platform - Operational Intelligence & Closed-Loop Enhancements (v8.3)
 * المدينة الطبية بجامعة الملك سعود - محرك التطوير الميداني والرقابي المتكامل
 *
 * يشمل:
 * 1. التحقق البصري المزدوج (قبل / بعد) لإغلاق الإجراءات التصحيحية (CAPA Closed-Loop)
 * 2. مؤشر التغطية الشهرية للأصول غير المفحوصة (CBAHI / الدفاع المدني SBC 801)
 * 3. مؤقت الرقابة اللاحقة لتصاريح الأعمال الساخنة (30 و 60 دقيقة - NFPA 51B)
 * 4. الخريطة الحرارية التفاعلية على المخطط العام للمدينة الطبية (KSUMC Master Plan)
 * 5. تحليل الأعطال والإنذارات الكاذبة المتكررة للوحات الحريق والدوائر (FACP & Loops)
 * 6. شريط حالة العمل دون اتصال والمزامنة المعلقة (Offline Sync Queue Monitor)
 */
(function(window) {
  'use strict';

  const CAMPUS_BUILDINGS = [
    { code: 'A', name: 'المستشفى الرئيسي', shortName: 'المستشفى A', xPct: 44, yPct: 48 },
    { code: 'B', name: 'التوسعة الشرقية', shortName: 'التوسعة B', xPct: 61, yPct: 46 },
    { code: 'C', name: 'كلية الطب', shortName: 'كلية الطب C', xPct: 74, yPct: 38 },
    { code: 'C2', name: 'توسعة كلية الطب', shortName: 'توسعة الطب C2', xPct: 83, yPct: 34 },
    { code: 'D', name: 'المبنى الإداري', shortName: 'الإداري D', xPct: 54, yPct: 26 },
    { code: 'E', name: 'مبنى العيادات', shortName: 'العيادات E', xPct: 33, yPct: 60 },
    { code: 'F', name: 'مواقف متعددة الأدوار', shortName: 'المواقف F', xPct: 22, yPct: 68 },
    { code: 'G', name: 'مبنى الاسنان', shortName: 'الأسنان G', xPct: 67, yPct: 64 },
    { code: 'H', name: 'العناية المركزة', shortName: 'العناية H', xPct: 48, yPct: 36 },
    { code: 'I', name: 'مواقف 25', shortName: 'مواقف 25 (I)', xPct: 18, yPct: 40 },
    { code: 'O', name: 'المستودعات الخارجية', shortName: 'المستودعات O', xPct: 86, yPct: 72 }
  ];

  const ASSET_SYSTEMS = [
    { key: 'fex', label: 'طفايات الحريق', formCodes: ['fex', '1', 'طفايات'] },
    { key: 'fhc', label: 'صناديق الحريق (FHC)', formCodes: ['fhc', '4', 'صناديق'] },
    { key: 'fm200', label: 'أنظمة FM-200', formCodes: ['fm200', '5', 'fm-200'] },
    { key: 'fas_insp', label: 'لوحات إنذار الحريق (FACP)', formCodes: ['fas_insp', 'fas_test', '7', '8', 'نظام الحريق', 'لوحات إنذار'] },
    { key: 'ind_room', label: 'الغرف الصناعية', formCodes: ['ind_room', '6', 'الغرف الصناعية'] },
    { key: 'wet_chem', label: 'الإطفاء الرطب (Wet Chemical)', formCodes: ['wet_chem', '9', 'wet chemical', 'المطابخ'] },
    { key: 'ext', label: 'مخارج الطوارئ', formCodes: ['ext', '2', 'مخارج'] }
  ];

  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isDemoSession() {
    try {
      if (window.KSUAuth && typeof window.KSUAuth.isDemoUser === 'function' && window.KSUAuth.isDemoUser()) {
        return true;
      }
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem('ksu_active_user');
        if (raw) {
          const u = JSON.parse(raw);
          if (u && (u.isDemoAccount === true || String(u.username || '').toLowerCase() === 'demo')) return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function toLatinDigits(str) {
    return String(str || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }

  function resolveBuildingCode(raw) {
    if (!raw) return 'A';
    const b = String(raw).trim();
    const upper = b.toUpperCase();
    if (['A', 'B', 'C', 'C2', 'D', 'E', 'F', 'G', 'H', 'I', 'O'].includes(upper)) return upper;
    if (b.includes('توسعة كلية الطب') || b.includes('توسعة الكلية') || b.includes('بلك 40') || upper.includes('BLOCK-40')) return 'C2';
    if ((b.includes('كلية الطب') || b.includes('كليه الطب') || b.includes('المبنى الشرقي')) && !b.includes('توسعة')) return 'C';
    if (b.includes('التوسعة الشرق') || b.includes('المستشفى الشرقي')) return 'B';
    if (b.includes('الاسنان') || b.includes('الأسنان')) return 'G';
    if (b.includes('الإداري') || b.includes('الاداري') || b.includes('الخدمات')) return 'D';
    if (b.includes('العيادات') || upper.includes('CLINIC')) return 'E';
    if (b.includes('متعددة الأدوار') || b.includes('متعددة الادوار')) return 'F';
    if (b.includes('العناية المركزة') || upper.includes('ICU')) return 'H';
    if (b.includes('المستودعات') || b.includes('المولدات')) return 'O';
    if (b.includes('25')) return 'I';
    if (b.includes('المستشفى') || b.includes('الرئيسي') || b.includes('الغربي')) return 'A';
    return 'A';
  }

  function normalizeFloorCode(raw) {
    const s = toLatinDigits(String(raw || '').trim());
    if (!s) return 'G';
    const paren = s.match(/\(([^)]+)\)/);
    if (paren) {
      let p = paren[1].trim().toUpperCase().replace(/^ICU-/, '');
      if (p === 'ROOF' || p === 'R') return 'R';
      if (p === 'B' || p === 'B01' || p === 'B1') return 'B1';
      if (p === 'B02' || p === 'B2') return 'B2';
      return p;
    }
    const upper = s.toUpperCase();
    if (upper.includes('السطح') || upper.includes('ROOF') || upper === 'R') return 'R';
    if (s.includes('الأرضي') || s.includes('الارضي') || upper === 'G' || upper.includes('G00')) return 'G';
    if (s.includes('القبو الثاني') || upper.includes('B2')) return 'B2';
    if (s.includes('القبو') || upper.includes('B1') || upper === 'B') return 'B1';
    const numMatch = s.match(/\b(\d{1,2})\b/);
    if (numMatch) return numMatch[1];
    if (s.includes('الأول') || s.includes('الاول')) return '1';
    if (s.includes('الثاني')) return '2';
    if (s.includes('الثالث')) return '3';
    if (s.includes('الرابع')) return '4';
    if (s.includes('الخامس')) return '5';
    return s;
  }

  function classifyAssetSystem(asset) {
    if (!asset) return 'other';
    const id = String(asset.id || '').toUpperCase();
    const cat = String(asset.category || asset.type || '').toLowerCase();
    if (id.startsWith('EXT-') || id.startsWith('FE-') || cat.includes('طفايات')) return 'fex';
    if (id.startsWith('PL') || cat.includes('صناديق') || cat.includes('خرطوم')) return 'fhc';
    if (id.startsWith('FM200') || cat.includes('fm-200') || cat.includes('fm200')) return 'fm200';
    if (id.startsWith('FACP-') || cat.includes('لوحات إنذار') || cat.includes('لوحة إنذار')) return 'fas_insp';
    if (id.startsWith('IND-') || cat.includes('غرف صناعية') || cat.includes('الغرف الصناعية') || cat.includes('غرفة صناعية')) return 'ind_room';
    if (id.startsWith('WET-') || cat.includes('الإطفاء الرطب') || cat.includes('إطفاء رطب') || cat.includes('wet')) return 'wet_chem';
    if (id.startsWith('EXIT-') || cat.includes('مخارج')) return 'ext';
    return 'other';
  }

  function classifyRoundSystem(round) {
    if (!round) return '';
    const ct = String(round.checklistType || round.formId || '').toLowerCase();
    const title = String(round.formTitle || round.title || '').toLowerCase();
    for (const sys of ASSET_SYSTEMS) {
      if (sys.formCodes.some(fc => ct === fc || title.includes(fc))) {
        return sys.key;
      }
    }
    return '';
  }

  function getCurrentYearMonth() {
    try {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit' }).format(new Date());
      if (/^\d{4}-\d{2}/.test(f)) return f.slice(0, 7);
    } catch (_) {}
    return new Date().toISOString().slice(0, 7);
  }

  function extractMonth(raw) {
    if (!raw) return '';
    const s = toLatinDigits(String(raw).trim());
    const m = s.match(/(\d{4})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}`;
    return '';
  }

  // ===========================================================================
  // 1. Closed-Loop CAPA Visual Verification (قبل / بعد الإصلاح)
  // ===========================================================================
  function requiresVisualClosure(capa) {
    if (!capa || typeof capa !== 'object') return false;
    const sev = String(capa.severity || '').toLowerCase();
    const prio = String(capa.priority || '').toLowerCase();
    if (sev.includes('حرج') || sev.includes('critical') || sev.includes('عالي') || sev.includes('high')) return true;
    if (prio === 'critical' || prio === 'high') return true;
    const days = Number(capa.businessDaysAllowed || 0);
    if (days > 0 && days <= 5) return true;
    return false;
  }

  async function validateAndCloseCAPA(capa, { notes = '', afterImage = '', closedBy = '', emergencyOverrideReason = '' } = {}) {
    if (!capa || !capa.id) {
      return { success: false, error: 'لم يتم العثور على معرف الإجراء التصحيحي.' };
    }
    const cleanAfter = String(afterImage || '').trim();
    const cleanOverride = String(emergencyOverrideReason || '').trim();
    const mandatoryPhoto = requiresVisualClosure(capa);

    if (mandatoryPhoto && !cleanAfter && !cleanOverride) {
      return {
        success: false,
        requiresAfterImage: true,
        error: 'الملاحظات الحرجة والعالية تتطلب إرفاق صورة (بعد الإصلاح) للتحقق البصري قبل الإغلاق الرسمي.'
      };
    }

    let verification = null;
    if (cleanAfter && window.KSUAI && typeof window.KSUAI.verifyCapaClosureImage === 'function') {
      try {
        verification = await window.KSUAI.verifyCapaClosureImage({
          beforeImage: capa.beforeImage || capa.image || capa.photo || '',
          afterImage: cleanAfter,
          title: capa.title || '',
          description: capa.description || capa.actionRequired || '',
          location: `${capa.building || ''} - ${capa.floor || ''}`
        });
      } catch (_) {}
    }

    if (verification && verification.verified === false && !cleanOverride) {
      return {
        success: false,
        verification,
        error: verification.summary || 'أشار التدقيق البصري إلى عدم اكتمال إزالة الخطر في الصورة المرفقة.'
      };
    }

    const patch = {
      status: 'resolved',
      resolutionNotes: String(notes || 'تمت المعالجة الميدانية والتحقق من استيفاء اشتراطات السلامة').trim(),
      resolvedAt: new Date().toISOString(),
      closedBy: closedBy || (window.KSUAuth && window.KSUAuth.getUser && window.KSUAuth.getUser()?.name) || 'مشرف السلامة',
      ...(cleanAfter ? { afterImage: cleanAfter } : {}),
      ...(verification ? { aiClosureVerification: verification } : {}),
      ...(cleanOverride ? { emergencyOverrideReason: cleanOverride } : {})
    };

    if (window.KSUDataBridge && typeof window.KSUDataBridge.updateCAPARecord === 'function') {
      window.KSUDataBridge.updateCAPARecord(capa.id, patch);
    }

    return {
      success: true,
      patch,
      verification
    };
  }

  // ===========================================================================
  // 2. Monthly Uninspected Assets Coverage Tracker
  // ===========================================================================
  function collectAvailableAssets() {
    if (window.state && Array.isArray(window.state.assets) && window.state.assets.length > 0) {
      return window.state.assets;
    }
    const merged = [];
    const pushAll = (arr) => { if (Array.isArray(arr)) merged.push(...arr); };
    pushAll(window.KSU_REAL_EXTINGUISHERS);
    pushAll(window.KSU_FHC_ASSETS);
    pushAll(window.KSU_FM200_ASSETS);
    pushAll(window.KSU_FACP_ASSETS);
    pushAll(window.KSU_PLANT_ROOM_ASSETS);
    pushAll(window.KSU_WET_CHEM_ASSETS);
    if (merged.length > 0) return merged;
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = JSON.parse(localStorage.getItem('ksumc_assets') || '[]');
        if (Array.isArray(stored)) return stored;
      }
    } catch (_) {}
    return [];
  }

  function collectAvailableRounds() {
    if (window.state && Array.isArray(window.state.rounds) && window.state.rounds.length > 0) {
      return window.state.rounds;
    }
    try {
      if (window.KSUDataBridge && typeof window.KSUDataBridge.getRealRounds === 'function') {
        return window.KSUDataBridge.getRealRounds() || [];
      }
      if (typeof localStorage !== 'undefined') {
        return JSON.parse(localStorage.getItem('ksumc_rounds') || '[]');
      }
    } catch (_) {}
    return [];
  }

  function computeMonthlyAssetCoverage({ assets = null, rounds = null, month = '' } = {}) {
    const targetMonth = month || getCurrentYearMonth();
    const assetList = Array.isArray(assets) ? assets : collectAvailableAssets();
    const roundList = (Array.isArray(rounds) ? rounds : collectAvailableRounds()).filter(r => {
      if (!r || r.status === 'deleted') return false;
      const m = extractMonth(r.date || r.createdAt || r.timestamp);
      return m === targetMonth;
    });

    const explicitInspectedIds = new Set();
    const coveredScopeKeys = new Set();

    for (const r of roundList) {
      const sysKey = classifyRoundSystem(r);
      const bCode = resolveBuildingCode(r.buildingCode || r.building || r.facility);
      const rawFloor = String(r.floor || '').trim();
      const fCode = (!rawFloor || rawFloor === 'all' || rawFloor.includes('كافة')) ? 'ALL' : normalizeFloorCode(rawFloor);
      if (sysKey && bCode) {
        coveredScopeKeys.add(`${sysKey}::${bCode}::${fCode}`);
      }
      const ids = []
        .concat(Array.isArray(r.inspectedAssetIds) ? r.inspectedAssetIds : [])
        .concat(Array.isArray(r.selectedAssetIds) ? r.selectedAssetIds : [])
        .concat(r.facpPanelId ? [r.facpPanelId] : [])
        .concat(r.assetId ? [r.assetId] : []);
      ids.forEach(id => { if (id) explicitInspectedIds.add(String(id).trim()); });
    }

    const bySystem = {};
    ASSET_SYSTEMS.forEach(s => {
      bySystem[s.key] = { key: s.key, label: s.label, total: 0, inspected: 0, remaining: 0, coveragePct: 0 };
    });

    const byBuilding = {};
    CAMPUS_BUILDINGS.forEach(b => {
      byBuilding[b.code] = { code: b.code, name: b.name, total: 0, inspected: 0, remaining: 0, coveragePct: 0 };
    });

    let totalAssets = 0;
    let inspectedAssets = 0;
    const uninspectedSample = [];

    for (const asset of assetList) {
      if (!asset || !asset.id) continue;
      const sysKey = classifyAssetSystem(asset);
      const bCode = resolveBuildingCode(asset.buildingCode || asset.building || asset.block);
      const fCode = normalizeFloorCode(asset.floor || asset.level);

      const isInspected =
        explicitInspectedIds.has(String(asset.id)) ||
        (asset.controlNo && explicitInspectedIds.has(String(asset.controlNo))) ||
        coveredScopeKeys.has(`${sysKey}::${bCode}::ALL`) ||
        coveredScopeKeys.has(`${sysKey}::${bCode}::${fCode}`);

      totalAssets++;
      if (isInspected) {
        inspectedAssets++;
      } else if (uninspectedSample.length < 12) {
        uninspectedSample.push({
          id: asset.id,
          name: asset.name || asset.category || asset.id,
          buildingCode: bCode,
          building: asset.building || (byBuilding[bCode] && byBuilding[bCode].name) || bCode,
          floor: asset.floor || fCode,
          systemKey: sysKey
        });
      }

      if (bySystem[sysKey]) {
        bySystem[sysKey].total++;
        if (isInspected) bySystem[sysKey].inspected++;
      }
      if (!byBuilding[bCode]) {
        byBuilding[bCode] = { code: bCode, name: asset.building || bCode, total: 0, inspected: 0, remaining: 0, coveragePct: 0 };
      }
      byBuilding[bCode].total++;
      if (isInspected) byBuilding[bCode].inspected++;
    }

    Object.values(bySystem).forEach(s => {
      s.remaining = Math.max(0, s.total - s.inspected);
      s.coveragePct = s.total > 0 ? Math.round((s.inspected / s.total) * 100) : 100;
    });
    Object.values(byBuilding).forEach(b => {
      b.remaining = Math.max(0, b.total - b.inspected);
      b.coveragePct = b.total > 0 ? Math.round((b.inspected / b.total) * 100) : 100;
    });

    const remainingAssets = Math.max(0, totalAssets - inspectedAssets);
    const coveragePct = totalAssets > 0 ? Math.round((inspectedAssets / totalAssets) * 100) : 0;

    return {
      month: targetMonth,
      totalAssets,
      inspectedAssets,
      remainingAssets,
      coveragePct,
      bySystem,
      byBuilding,
      uninspectedSample
    };
  }

  // ===========================================================================
  // 3. Hot Work Permit Fire-Watch Timer (NFPA 51B: 30m & 60m Post-Work Checks)
  // ===========================================================================
  function parsePermitWorkEndMs(permit) {
    if (!permit) return 0;
    const raw = permit.workEndedAt || permit.validUntil || permit.expiryTimestamp || '';
    if (raw) {
      const ms = typeof raw === 'number' ? raw : Date.parse(String(raw));
      if (!Number.isNaN(ms) && ms > 0) return ms;
    }
    if (permit.date && permit.timeTo) {
      const combined = Date.parse(`${permit.date}T${permit.timeTo}`);
      if (!Number.isNaN(combined) && combined > 0) return combined;
    }
    return 0;
  }

  function evaluatePermitFireWatch(permit, nowMs = Date.now()) {
    if (!permit || typeof permit !== 'object') {
      return { stage: 'not_applicable', isOverdue: false, label: 'غير خاضع للمراقبة اللاحقة' };
    }
    const wt = String(permit.workType || 'أعمال ساخنة');
    const isHotWork = wt.includes('ساخن') || wt.includes('لحام') || wt.includes('قص') || wt.includes('شرار') || wt.toLowerCase().includes('hot');
    if (!isHotWork) {
      return { stage: 'not_applicable', isOverdue: false, label: 'تصريح عمل بارد / عام' };
    }

    if (permit.fireWatch30mCheckedAt && permit.fireWatch60mCheckedAt) {
      return {
        stage: 'completed',
        isOverdue: false,
        checked30m: true,
        checked60m: true,
        label: 'مكتمل ومؤمن ✓ (تم توثيق فحصي 30د و 60د - NFPA 51B)'
      };
    }

    const endMs = parsePermitWorkEndMs(permit);
    if (!endMs || nowMs < endMs) {
      return {
        stage: 'active_work',
        isOverdue: false,
        checked30m: Boolean(permit.fireWatch30mCheckedAt),
        checked60m: Boolean(permit.fireWatch60mCheckedAt),
        label: 'العمل الساخن جاري — تبدأ رقابة الحريق اللاحقة (30د / 60د) فور انتهاء العمل'
      };
    }

    const elapsedMin = Math.floor((nowMs - endMs) / 60000);
    if (!permit.fireWatch30mCheckedAt) {
      if (nowMs >= endMs + 30 * 60 * 1000) {
        return {
          stage: 'overdue_30m',
          isOverdue: true,
          elapsedMin,
          checked30m: false,
          checked60m: false,
          label: `🚨 حان وتجاوز موعد فحص 30 دقيقة (مضى ${elapsedMin} د من انتهاء العمل - NFPA 51B)`
        };
      }
      return {
        stage: 'awaiting_30m',
        isOverdue: false,
        minutesRemaining: Math.max(1, 30 - elapsedMin),
        checked30m: false,
        checked60m: false,
        label: `رقابة حريق نشطة: متبقي ${Math.max(1, 30 - elapsedMin)} د لفحص الـ 30 دقيقة الأول`
      };
    }

    if (nowMs >= endMs + 60 * 60 * 1000) {
      return {
        stage: 'overdue_60m',
        isOverdue: true,
        elapsedMin,
        checked30m: true,
        checked60m: false,
        label: `🚨 حان وتجاوز موعد الفحص النهائي 60 دقيقة (مضى ${elapsedMin} د - NFPA 51B)`
      };
    }

    return {
      stage: 'awaiting_60m',
      isOverdue: false,
      minutesRemaining: Math.max(1, 60 - elapsedMin),
      checked30m: true,
      checked60m: false,
      label: `تم فحص 30د ✓ • متبقي ${Math.max(1, 60 - elapsedMin)} د للفحص النهائي (60 دقيقة)`
    };
  }

  function recordPermitFireWatchCheck(permit, stage, inspectorName = '', nowMs = Date.now()) {
    if (!permit) return null;
    const iso = new Date(nowMs).toISOString();
    const who = inspectorName || (window.KSUAuth && window.KSUAuth.getUser && window.KSUAuth.getUser()?.name) || 'مفتش السلامة المناوب';
    if (stage === 'start_watch') {
      permit.workEndedAt = iso;
    } else if (stage === '30m') {
      if (!permit.workEndedAt) permit.workEndedAt = new Date(nowMs - 30 * 60 * 1000).toISOString();
      permit.fireWatch30mCheckedAt = iso;
      permit.fireWatch30mInspector = who;
    } else if (stage === '60m') {
      if (!permit.fireWatch30mCheckedAt) {
        permit.fireWatch30mCheckedAt = iso;
        permit.fireWatch30mInspector = who;
      }
      permit.fireWatch60mCheckedAt = iso;
      permit.fireWatch60mInspector = who;
      permit.fireWatchStatus = 'completed_nfpa51b';
    }
    return evaluatePermitFireWatch(permit, nowMs);
  }

  // ===========================================================================
  // 4. Interactive KSUMC Master Plan Risk Heatmap
  // ===========================================================================
  function computeCampusRiskHeatmap({
    capaRecords = [],
    safetyViolations = [],
    permits = [],
    alarms = [],
    doors = []
  } = {}) {
    const map = {};
    CAMPUS_BUILDINGS.forEach(b => {
      map[b.code] = {
        ...b,
        openCriticalCapa: 0,
        openCapa: 0,
        activeViolations: 0,
        activePermits: 0,
        activeAlarms: 0,
        openDoors: 0,
        riskScore: 0,
        riskLevel: 'safe'
      };
    });

    (capaRecords || []).forEach(c => {
      if (!c || c.status === 'resolved' || c.status === 'closed' || c.status === 'completed') return;
      const code = resolveBuildingCode(c.building || c.facility);
      const cell = map[code];
      if (!cell) return;
      cell.openCapa++;
      if (requiresVisualClosure(c)) cell.openCriticalCapa++;
    });

    (safetyViolations || []).forEach(v => {
      if (!v || v.status === 'deleted' || v.archived === true || v.isArchived === true || v.status === 'مغلق') return;
      const code = resolveBuildingCode(v.building || v.location);
      if (map[code]) map[code].activeViolations++;
    });

    (permits || []).forEach(p => {
      if (!p) return;
      const st = String(p.status || 'ساري');
      if (st.includes('منتهي') || st.includes('ملغ')) return;
      const code = resolveBuildingCode(p.building || p.zone || p.location);
      if (map[code]) map[code].activePermits++;
    });

    (alarms || []).forEach(a => {
      if (!a) return;
      const st = String(a.status || '');
      if (st === 'مغلق' || st === 'resolved' || st === 'closed') return;
      const code = resolveBuildingCode(a.building || a.location);
      if (map[code]) map[code].activeAlarms++;
    });

    (doors || []).forEach(d => {
      if (!d) return;
      const st = String(d.status || '');
      if (st === 'مغلق' || st === 'closed' || st === 'منتهي') return;
      const code = resolveBuildingCode(d.building || d.location);
      if (map[code]) map[code].openDoors++;
    });

    const buildings = Object.values(map).map(b => {
      b.riskScore = (b.openCriticalCapa * 5) + (b.activeAlarms * 4) + (b.openCapa * 2) + (b.activeViolations * 2) + (b.activePermits * 1) + (b.openDoors * 1);
      if (b.openCriticalCapa > 0 || b.activeAlarms > 0 || b.riskScore >= 6) {
        b.riskLevel = 'critical';
      } else if (b.riskScore > 0) {
        b.riskLevel = 'warning';
      } else {
        b.riskLevel = 'safe';
      }
      return b;
    });

    return {
      buildings,
      criticalBuildingsCount: buildings.filter(b => b.riskLevel === 'critical').length,
      warningBuildingsCount: buildings.filter(b => b.riskLevel === 'warning').length
    };
  }

  // ===========================================================================
  // 5. FACP False-Alarm & Loop Analytics
  // ===========================================================================
  function analyzeFACPAlarms({ alarms = [], facpAssets = null } = {}) {
    const panels = Array.isArray(facpAssets)
      ? facpAssets
      : (Array.isArray(window.KSU_FACP_ASSETS) ? window.KSU_FACP_ASSETS : []);

    const panelByControl = new Map();
    const panelsByBuilding = new Map();
    panels.forEach(p => {
      if (!p) return;
      const ctrl = String(p.controlNo || p.id || '').toUpperCase().replace(/^FACP-/, '');
      if (ctrl) panelByControl.set(ctrl, p);
      const bCode = resolveBuildingCode(p.buildingCode || p.building);
      if (!panelsByBuilding.has(bCode)) panelsByBuilding.set(bCode, []);
      panelsByBuilding.get(bCode).push(p);
    });

    const panelStats = new Map();
    const loopStats = new Map();
    let totalAlarms = 0;
    let falseOrFaultCount = 0;

    for (const al of (alarms || [])) {
      if (!al || al.status === 'deleted') continue;
      totalAlarms++;
      const text = `${al.alarmType || ''} ${al.cause || ''} ${al.notes || ''} ${al.description || ''} ${al.alarmCode || ''}`.toLowerCase();
      const isFalseOrFault = /كاذب|غبار|بخار|أبخرة|ابخره|طبخ|عطل|خلل|صيانة|false|fault|trouble|dust|steam/.test(text);
      if (isFalseOrFault) falseOrFaultCount++;

      let rawCtrl = String(al.panelId || al.facpId || al.controlNo || '').toUpperCase().replace(/^FACP-/, '').trim();
      if (!rawCtrl) {
        const matchInText = text.toUpperCase().match(/\b(FA\d{4}|NM-?\d{4,7})\b/);
        if (matchInText) rawCtrl = matchInText[1];
      }
      const bCode = resolveBuildingCode(al.building || al.location);
      let matchedPanel = rawCtrl ? panelByControl.get(rawCtrl) : null;
      if (!matchedPanel && panelsByBuilding.has(bCode)) {
        matchedPanel = panelsByBuilding.get(bCode)[0];
        if (!rawCtrl && matchedPanel) rawCtrl = String(matchedPanel.controlNo || matchedPanel.id);
      }
      const ctrlKey = rawCtrl || `BLD-${bCode}`;
      if (!panelStats.has(ctrlKey)) {
        panelStats.set(ctrlKey, {
          controlNo: ctrlKey,
          panelName: (matchedPanel && matchedPanel.name) || `لوحة إنذار (${al.building || bCode})`,
          building: (matchedPanel && matchedPanel.building) || al.building || bCode,
          buildingCode: bCode,
          totalCount: 0,
          falseCount: 0
        });
      }
      const pEntry = panelStats.get(ctrlKey);
      pEntry.totalCount++;
      if (isFalseOrFault) pEntry.falseCount++;

      const loopRaw = String(al.loop || al.loopNumber || al.zoneLoop || '').trim();
      if (loopRaw && isFalseOrFault) {
        const lKey = `${ctrlKey} • ${loopRaw}`;
        loopStats.set(lKey, {
          key: lKey,
          controlNo: ctrlKey,
          loop: loopRaw,
          building: pEntry.building,
          count: (loopStats.get(lKey)?.count || 0) + 1
        });
      }
    }

    const panelRanking = Array.from(panelStats.values()).sort((a, b) => b.falseCount - a.falseCount || b.totalCount - a.totalCount);
    const chronicPanels = panelRanking.filter(p => p.falseCount >= 2);
    const topLoops = Array.from(loopStats.values()).sort((a, b) => b.count - a.count).slice(0, 5);

    const recommendations = [];
    chronicPanels.forEach(cp => {
      recommendations.push(
        `توجيه صيانة وقائية عاجلة (NFPA 72) للوحة [${cp.controlNo}] في (${cp.building}): رُصد ${cp.falseCount} إنذارات كاذبة/أعطال متكررة — يلزم تنظيف الحساسات البصرية ومعايرة الحساسية.`
      );
    });
    topLoops.forEach(tl => {
      if (tl.count >= 2) {
        recommendations.push(
          `فحص عزل وكواشف الدائرة (${tl.key}) لتكرار البلاغات غير الحقيقية (${tl.count} مرات).`
        );
      }
    });
    if (recommendations.length === 0 && totalAlarms > 0) {
      recommendations.push('استقرار تشغيلي في لوحات إنذار الحريق — الاستمرار بجدول الفحص الدوري الشهري (SBC 801).');
    }

    return {
      totalAlarms,
      falseOrFaultCount,
      falseAlarmRatioPct: totalAlarms > 0 ? Math.round((falseOrFaultCount / totalAlarms) * 100) : 0,
      panelRanking,
      chronicPanels,
      topLoops,
      recommendations
    };
  }

  // ===========================================================================
  // 6. Offline Sync Queue Status & Live UI Renderers
  // ===========================================================================
  function getOfflineQueueStatus() {
    if (isDemoSession()) {
      return { isDemo: true, online: true, cloudConnected: false, pendingCount: 0, showBanner: false };
    }
    const online = typeof navigator !== 'undefined' && navigator.onLine !== false;
    const cloudConnected = Boolean(window.ksuFirebaseSync && window.ksuFirebaseSync.isConnected);
    let pendingCount = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        const q = JSON.parse(localStorage.getItem('ksumc_offline_sync_queue') || '[]');
        if (Array.isArray(q)) pendingCount += q.length;
        const rounds = JSON.parse(localStorage.getItem('ksumc_rounds') || '[]');
        if (Array.isArray(rounds)) {
          pendingCount += rounds.filter(r => r && r._pendingCloudSync === true).length;
        }
      }
    } catch (_) {}
    return {
      isDemo: false,
      online,
      cloudConnected,
      pendingCount,
      showBanner: !online || pendingCount > 0
    };
  }

  function renderOfflineSyncBanner() {
    if (typeof document === 'undefined') return;
    const banner = document.getElementById('ksu-offline-sync-banner');
    if (!banner) return;
    const st = getOfflineQueueStatus();
    if (!st.showBanner) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }
    banner.classList.remove('hidden');
    const bgClass = !st.online
      ? 'bg-amber-950 text-amber-50 border-amber-500/60'
      : 'bg-[#082B49] text-white border-[#C59B27]/60';
    banner.className = `w-full px-4 py-2.5 border-b text-xs font-bold flex items-center justify-between gap-3 transition-all ${bgClass}`;
    banner.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-base text-amber-400">${!st.online ? 'cloud_off' : 'cloud_sync'}</span>
        <span>${!st.online
          ? `وضع العمل دون اتصال نشط (الأقبية / ضعف الشبكة) — بياناتك محفوظة محلياً بأمان${st.pendingCount > 0 ? ` (${st.pendingCount} معاملة بانتظار المزامنة)` : ''}`
          : `يوجد (${st.pendingCount}) معاملات ميدانية محفوظة محلياً وجاهزة للمزامنة السحابية`}</span>
      </div>
      ${st.online ? `
        <button type="button" onclick="window.KSUOps && window.KSUOps.flushOfflineQueueNow()" class="px-3 py-1 rounded-lg bg-[#C59B27] hover:bg-amber-500 text-[#082B49] font-black text-[11px] shrink-0 cursor-pointer">
          مزامنة الآن
        </button>
      ` : '<span class="px-2 py-0.5 rounded bg-amber-900/80 text-amber-200 text-[10px]">حفظ تلقائي محلي</span>'}
    `;
  }

  function flushOfflineQueueNow() {
    if (isDemoSession()) return;
    try {
      if (window.ksuFirebaseSync && typeof window.ksuFirebaseSync.pushPendingLocalDataToCloud === 'function') {
        window.ksuFirebaseSync.pushPendingLocalDataToCloud();
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('ksumc_offline_sync_queue');
      }
      renderOfflineSyncBanner();
      if (typeof window.showToast === 'function') {
        window.showToast('تمت مزامنة السجلات المحفوظة مع سحابة رصد بنجاح ✓', 'success');
      }
    } catch (_) {}
  }

  function renderMonthlyCoveragePanels() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('monthly-asset-coverage-panel');
    if (!container) return;

    const cov = computeMonthlyAssetCoverage();
    const topRemainingBuildings = Object.values(cov.byBuilding)
      .filter(b => b.total > 0)
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 6);

    const sysCards = Object.values(cov.bySystem)
      .filter(s => s.total > 0)
      .map(s => `
        <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col gap-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-extrabold text-[#082B49] truncate">${escHtml(s.label)}</span>
            <span class="font-mono font-black ${s.remaining === 0 ? 'text-emerald-700' : 'text-amber-800'}">${s.coveragePct}%</span>
          </div>
          <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div class="h-full ${s.remaining === 0 ? 'bg-emerald-600' : 'bg-[#004B87]'}" style="width:${s.coveragePct}%"></div>
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-600 font-semibold">
            <span>مفحوص: ${s.inspected}</span>
            <span class="${s.remaining > 0 ? 'text-rose-700 font-bold' : 'text-emerald-700'}">متبقي: ${s.remaining}</span>
          </div>
        </div>
      `).join('');

    container.innerHTML = `
      <div class="rounded-2xl bg-white border border-slate-200/90 shadow-xs p-4 sm:p-5 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-[#082B49] text-[#F9F1DC] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-xl">fact_check</span>
            </div>
            <div>
              <h3 class="text-sm font-black text-[#082B49]">مؤشر التغطية الشهرية للأصول غير المفحوصة (${escHtml(cov.month)})</h3>
              <p class="text-[11px] text-slate-500 font-semibold">رقابة استباقية لضمان فحص 100% من الأصول قبل تدقيق سباهي (CBAHI) والدفاع المدني</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-3 py-1 rounded-xl bg-rose-50 text-rose-900 border border-rose-200 text-xs font-black">
              متبقي بدون فحص: ${cov.remainingAssets} من ${cov.totalAssets}
            </span>
            <span class="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-black">
              نسبة التغطية: ${cov.coveragePct}%
            </span>
          </div>
        </div>
        ${cov.totalAssets === 0 ? `
          <div class="text-xs text-slate-500 font-semibold py-2 flex items-center justify-between">
            <span>جاري تحميل سجلات الأصول المعتمدة بالخلفية لعدم إبطاء فتح الصفحة...</span>
            <button type="button" onclick="window.KSUAssetLoader && window.KSUAssetLoader.loadAllInBackground()" class="px-3 py-1 rounded-lg bg-[#004B87] text-white font-bold text-[11px] cursor-pointer">تحميل فوري للسجل</button>
          </div>
        ` : `
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">${sysCards}</div>
          <div class="flex items-center gap-1.5 flex-wrap pt-1">
            <span class="text-[11px] font-extrabold text-slate-700 ml-1">الأعلى احتياجاً للفحص حسب المبنى:</span>
            ${topRemainingBuildings.map(b => `
              <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold border ${b.remaining > 0 ? 'bg-amber-50/80 text-amber-950 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}">
                [${escHtml(b.code)}] ${escHtml(b.name)}: متبقي ${b.remaining}
              </span>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  let selectedHeatmapCode = 'A';
  function selectHeatmapBuilding(code) {
    selectedHeatmapCode = code || 'A';
    renderCampusHeatmap('ksumc-interactive-heatmap');
  }

  function gatherOperationalDataForDashboard() {
    const safeParse = (k) => {
      try { return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(k)) || '[]'); } catch (_) { return []; }
    };
    const capaRecords = (window.KSUDataBridge && typeof window.KSUDataBridge.getCAPARecords === 'function')
      ? window.KSUDataBridge.getCAPARecords()
      : safeParse('ksumc_capa_registry');
    const safetyViolations = (window.state && Array.isArray(window.state.safetyViolations)) ? window.state.safetyViolations : safeParse('ksumc_safety_violations');
    const permits = (window.state && Array.isArray(window.state.permits)) ? window.state.permits : safeParse('ksumc_hot_work_permits');
    const alarms = (window.state && Array.isArray(window.state.alarms)) ? window.state.alarms : safeParse('ksumc_safety_alarms');
    const doors = (window.state && Array.isArray(window.state.doors)) ? window.state.doors : safeParse('ksumc_door_requests');
    return { capaRecords, safetyViolations, permits, alarms, doors };
  }

  function renderCampusHeatmap(containerId = 'ksumc-interactive-heatmap') {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(containerId);
    if (!el) return;

    const opsData = gatherOperationalDataForDashboard();
    const hm = computeCampusRiskHeatmap(opsData);
    const activeBld = hm.buildings.find(b => b.code === selectedHeatmapCode) || hm.buildings[0];

    const pinHtml = hm.buildings.map(b => {
      const isSelected = b.code === activeBld.code;
      const colorCls = b.riskLevel === 'critical'
        ? 'bg-rose-600 text-white border-white ring-4 ring-rose-500/40 animate-pulse'
        : (b.riskLevel === 'warning'
            ? 'bg-amber-500 text-slate-950 border-white ring-2 ring-amber-400/40'
            : 'bg-emerald-600 text-white border-white');
      return `
        <button type="button"
          onclick="window.KSUOps && window.KSUOps.selectHeatmapBuilding('${b.code}')"
          style="left:${b.xPct}%; top:${b.yPct}%; transform:translate(-50%,-50%);"
          class="absolute z-20 px-2 py-1 rounded-full border-2 text-[10px] font-black shadow-md transition-transform hover:scale-110 cursor-pointer flex items-center gap-1 ${colorCls} ${isSelected ? 'scale-115 ring-4 ring-[#082B49]' : ''}"
          title="${escHtml(b.name)}">
          <span>${escHtml(b.code)}</span>
          ${b.riskScore > 0 ? `<span class="px-1 rounded-full bg-black/25 text-[9px] font-mono">${b.openCriticalCapa + b.activeAlarms + b.openCapa + b.activePermits}</span>` : ''}
        </button>
      `;
    }).join('');

    el.innerHTML = `
      <div class="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-[#082B49] text-[#F9F1DC] flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined">map</span>
            </div>
            <div>
              <h3 class="text-sm sm:text-base font-black text-[#082B49]">الخريطة الحرارية التفاعلية للمخاطر والعمليات — المدينة الطبية</h3>
              <p class="text-xs text-slate-500 font-semibold">توزيع لحظي للبلاغات الحرجة، الإنذارات النشطة، التصاريح الساخنة، والأبواب المفتوحة حسب المبنى</p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-[11px] font-bold flex-wrap">
            <span class="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200">حرج: ${hm.criticalBuildingsCount}</span>
            <span class="px-2.5 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200">تنبيه تشغيلي: ${hm.warningBuildingsCount}</span>
            <span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">آمن ومستقر: ${hm.buildings.length - hm.criticalBuildingsCount - hm.warningBuildingsCount}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
          <div class="lg:col-span-2 relative rounded-2xl overflow-hidden border border-slate-300 bg-slate-900 min-h-[260px] sm:min-h-[320px]">
            <img src="assets/images/ksumc_master_plan.jpg" alt="المخطط العام للمدينة الطبية" loading="lazy" class="w-full h-full object-cover opacity-85" />
            <div class="absolute inset-0 bg-slate-950/20"></div>
            ${pinHtml}
          </div>

          <div class="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex flex-col justify-between gap-3">
            <div>
              <div class="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div>
                  <span class="text-[11px] font-mono font-bold text-[#004B87]">BUILDING [${escHtml(activeBld.code)}]</span>
                  <h4 class="text-base font-black text-[#082B49]">${escHtml(activeBld.name)}</h4>
                </div>
                <span class="px-2.5 py-1 rounded-full text-[11px] font-black ${
                  activeBld.riskLevel === 'critical' ? 'bg-rose-100 text-rose-900 border border-rose-300' :
                  (activeBld.riskLevel === 'warning' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300')
                }">
                  ${activeBld.riskLevel === 'critical' ? 'أولوية قصوى' : (activeBld.riskLevel === 'warning' ? 'متابعة نشطة' : 'مستقر ✓')}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2.5 mt-3 text-xs">
                <div class="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span class="text-[10px] text-slate-500 block font-bold">إجراءات CAPA حرجة</span>
                  <span class="text-lg font-black ${activeBld.openCriticalCapa > 0 ? 'text-rose-700' : 'text-slate-800'}">${activeBld.openCriticalCapa}</span>
                </div>
                <div class="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span class="text-[10px] text-slate-500 block font-bold">إنذارات حريق نشطة</span>
                  <span class="text-lg font-black ${activeBld.activeAlarms > 0 ? 'text-rose-700' : 'text-slate-800'}">${activeBld.activeAlarms}</span>
                </div>
                <div class="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span class="text-[10px] text-slate-500 block font-bold">تصاريح عمل سارية</span>
                  <span class="text-lg font-black text-[#004B87]">${activeBld.activePermits}</span>
                </div>
                <div class="p-2.5 rounded-xl bg-white border border-slate-200">
                  <span class="text-[10px] text-slate-500 block font-bold">أبواب خدمات مفتوحة</span>
                  <span class="text-lg font-black text-amber-800">${activeBld.openDoors}</span>
                </div>
              </div>
            </div>

            <div class="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 font-semibold">
              انقر على أي رمز مبنى فوق المخطط لعرض تفاصيل المخاطر والتصاريح النشطة فيه فوراً.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFACPAnalyticsPanel(containerId = 'facp-false-alarm-analytics') {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(containerId);
    if (!el) return;

    const opsData = gatherOperationalDataForDashboard();
    const stats = analyzeFACPAlarms({ alarms: opsData.alarms });

    el.innerHTML = `
      <div class="rounded-3xl bg-white border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-xl bg-[#004B87] text-white flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined">detector_smoke</span>
            </div>
            <div>
              <h3 class="text-sm sm:text-base font-black text-[#082B49]">تحليل الأعطال المتكررة والإنذارات الكاذبة للوحات الحريق (FACP & Loops)</h3>
              <p class="text-xs text-slate-500 font-semibold">ربط مباشر بسجل الـ 10 لوحات المعتمدة لتوجيه الصيانة الوقائية وفق كود SBC 801 / NFPA 72</p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-xs font-black">
            <span class="px-3 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">إجمالي البلاغات: ${stats.totalAlarms}</span>
            <span class="px-3 py-1 rounded-xl bg-amber-50 text-amber-900 border border-amber-200">إنذارات كاذبة/أعطال: ${stats.falseOrFaultCount} (${stats.falseAlarmRatioPct}%)</span>
          </div>
        </div>

        ${stats.panelRanking.length === 0 ? `
          <div class="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
            <span class="material-symbols-outlined text-emerald-700">verified</span>
            <span>لا توجد أعطال أو إنذارات كاذبة متكررة مسجلة حالياً على لوحات إنذار الحريق المعتمدة.</span>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <h4 class="text-xs font-black text-[#082B49]">ترتيب اللوحات حسب تكرار الأعطال والإنذارات الكاذبة</h4>
              ${stats.panelRanking.slice(0, 4).map(p => `
                <div class="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs">
                  <div>
                    <span class="font-mono font-black text-[#004B87]">[${escHtml(p.controlNo)}]</span>
                    <span class="font-bold text-slate-800 mr-1">${escHtml(p.building)}</span>
                  </div>
                  <span class="px-2 py-0.5 rounded-full text-[11px] font-black ${p.falseCount >= 2 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}">
                    ${p.falseCount} كاذب / ${p.totalCount} بلاغ
                  </span>
                </div>
              `).join('')}
            </div>
            <div class="p-3.5 rounded-2xl bg-[#F9F1DC]/45 border border-[#C59B27]/40 space-y-2">
              <h4 class="text-xs font-black text-[#082B49]">توصيات الصيانة الوقائية (PPM)</h4>
              <ul class="space-y-1.5 text-xs text-slate-800 font-semibold list-disc pr-4">
                ${stats.recommendations.map(rec => `<li>${escHtml(rec)}</li>`).join('')}
              </ul>
            </div>
          </div>
        `}
      </div>
    `;
  }

  function renderPermitFireWatchSnippet(permit) {
    const fw = evaluatePermitFireWatch(permit);
    if (fw.stage === 'not_applicable') return '';

    const pid = escHtml(permit.id);
    const pillTone = fw.isOverdue
      ? 'bg-rose-50 border-rose-300 text-rose-900'
      : (fw.stage === 'completed'
          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
          : 'bg-amber-50/80 border-amber-300 text-amber-950');

    let actionBtns = '';
    if (fw.stage === 'active_work') {
      actionBtns = `
        <button type="button" onclick="window.KSUOps && window.KSUOps.handlePermitFireWatchAction('${pid}', 'start_watch')" class="px-2.5 py-1 rounded-lg bg-[#082B49] hover:bg-[#004B87] text-white text-[11px] font-bold cursor-pointer">
          إنهاء العمل وبدء رقابة 60د
        </button>
      `;
    } else if (fw.stage === 'awaiting_30m' || fw.stage === 'overdue_30m') {
      actionBtns = `
        <button type="button" onclick="window.KSUOps && window.KSUOps.handlePermitFireWatchAction('${pid}', '30m')" class="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer">
          ✓ توثيق فحص 30 دقيقة
        </button>
      `;
    } else if (fw.stage === 'awaiting_60m' || fw.stage === 'overdue_60m') {
      actionBtns = `
        <button type="button" onclick="window.KSUOps && window.KSUOps.handlePermitFireWatchAction('${pid}', '60m')" class="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black cursor-pointer">
          ✓ توثيق الفحص النهائي 60 دقيقة
        </button>
      `;
    }

    return `
      <div class="mt-1 p-2.5 rounded-xl border ${pillTone} flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div class="flex items-center gap-1.5 font-bold">
          <span class="material-symbols-outlined text-base">${fw.stage === 'completed' ? 'verified' : 'timer'}</span>
          <span>رقابة NFPA 51B: ${escHtml(fw.label)}</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">${actionBtns}</div>
      </div>
    `;
  }

  function handlePermitFireWatchAction(permitId, stage) {
    if (!window.state || !Array.isArray(window.state.permits)) return;
    const target = window.state.permits.find(p => String(p.id) === String(permitId));
    if (!target) return;
    recordPermitFireWatchCheck(target, stage);
    if (typeof window.savePermits === 'function') {
      window.savePermits(target);
    } else if (typeof window.renderPermitsList === 'function') {
      window.renderPermitsList();
    }
    if (typeof window.showToast === 'function') {
      window.showToast('تم تحديث سجل الرقابة اللاحقة للعمل الساخن (NFPA 51B) ✓', 'success');
    }
  }

  const notifiedFireWatchStages = new Set();
  function checkDueFireWatchTimers() {
    if (!window.state || !Array.isArray(window.state.permits)) return;
    const now = Date.now();
    for (const p of window.state.permits) {
      const fw = evaluatePermitFireWatch(p, now);
      if (fw.isOverdue) {
        const key = `${p.id}::${fw.stage}`;
        if (!notifiedFireWatchStages.has(key)) {
          notifiedFireWatchStages.add(key);
          if (typeof window.showToast === 'function') {
            window.showToast(`🚨 تنبيه NFPA 51B للتصريح (${p.id}): ${fw.label}`, 'error');
          }
        }
      }
    }
  }

  function initPortalEnhancements() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    renderOfflineSyncBanner();
    renderMonthlyCoveragePanels();
    renderCampusHeatmap('ksumc-interactive-heatmap');
    renderFACPAnalyticsPanel('facp-false-alarm-analytics');

    if (window.KSUIntegrations && typeof window.KSUIntegrations.runSLAAutoEscalation === 'function') {
      try { window.KSUIntegrations.runSLAAutoEscalation(); } catch (_) {}
    }

    if (window.KSUAssetLoader && typeof window.KSUAssetLoader.scheduleIdleHydration === 'function') {
      window.KSUAssetLoader.scheduleIdleHydration();
    }

    if (typeof window.addEventListener === 'function') {
      window.addEventListener('online', renderOfflineSyncBanner);
      window.addEventListener('offline', renderOfflineSyncBanner);
      window.addEventListener('ksumc_cloud_connection_changed', renderOfflineSyncBanner);
    }

    if (typeof setInterval === 'function') {
      setInterval(() => {
        checkDueFireWatchTimers();
        if (window.KSUIntegrations && typeof window.KSUIntegrations.runSLAAutoEscalation === 'function') {
          try { window.KSUIntegrations.runSLAAutoEscalation(); } catch (_) {}
        }
      }, 60000);
    }
  }

  const KSUOps = {
    CAMPUS_BUILDINGS,
    ASSET_SYSTEMS,
    resolveBuildingCode,
    normalizeFloorCode,
    requiresVisualClosure,
    validateAndCloseCAPA,
    computeMonthlyAssetCoverage,
    evaluatePermitFireWatch,
    recordPermitFireWatchCheck,
    computeCampusRiskHeatmap,
    analyzeFACPAlarms,
    getOfflineQueueStatus,
    renderOfflineSyncBanner,
    flushOfflineQueueNow,
    renderMonthlyCoveragePanels,
    renderCampusHeatmap,
    selectHeatmapBuilding,
    renderFACPAnalyticsPanel,
    renderPermitFireWatchSnippet,
    handlePermitFireWatchAction,
    checkDueFireWatchTimers,
    initPortalEnhancements
  };

  window.KSUOps = KSUOps;

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPortalEnhancements);
    } else {
      setTimeout(initPortalEnhancements, 50);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);

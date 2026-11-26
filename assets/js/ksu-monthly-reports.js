/**
 * ksu-monthly-reports.js
 * منصة رصد الذكية • محرك التقارير الشهرية المجمّعة للمباني والنماذج التفتيشية
 * متوافق مع متطلبات الاعتماد الوطني (سباهي - CBAHI) واشتراطات الدفاع المدني السعودي (SBC 801 / SBC 201)
 */

(function(rootScope) {
  'use strict';

  const FALLBACK_14_FORMS = [
    { codeNum: 1, id: 'fex', name: 'طفايات الحريق', nameEn: 'Fire Extinguishers', standard: 'SBC 801 / CBAHI FMS', frequency: 'شهري' },
    { codeNum: 2, id: 'ext', name: 'مخارج الطوارئ', nameEn: 'Emergency Exits', standard: 'SBC 201 / CBAHI FMS', frequency: 'شهري' },
    { codeNum: 3, id: 'roof', name: 'الأسطح', nameEn: 'Rooftops Safety', standard: 'SBC 201', frequency: 'شهري' },
    { codeNum: 4, id: 'fhc', name: 'صناديق الحريق', nameEn: 'Fire Hose Cabinets', standard: 'SBC 801', frequency: 'شهري' },
    { codeNum: 5, id: 'fm200', name: 'FM-200', nameEn: 'FM-200 Clean Agent', standard: 'SBC 801 / Clean Agent', frequency: 'شهري' },
    { codeNum: 6, id: 'ind_room', name: 'الغرف الصناعية', nameEn: 'Plant Rooms', standard: 'SBC 401', frequency: 'شهري' },
    { codeNum: 7, id: 'fas_insp', name: 'التفتيش على نظام الحريق', nameEn: 'Fire Alarm Inspection', standard: 'SBC 801', frequency: 'شهري' },
    { codeNum: 8, id: 'fas_test', name: 'فحص نظام الحريق', nameEn: 'Fire Alarm Testing', standard: 'SBC 801', frequency: 'شهري' },
    { codeNum: 9, id: 'wet_chem', name: 'WET CHEMICAL', nameEn: 'Kitchen Wet Chemical', standard: 'SBC 801', frequency: 'شهري' },
    { codeNum: 10, id: 'elevators', name: 'المصاعد', nameEn: 'Elevators & Intercom', standard: 'ASME A17.1', frequency: 'شهري' },
    { codeNum: 11, id: 'sprinklers', name: 'التفتيش على نظام الرش الآلي والمضخات', nameEn: 'Sprinklers & Pumps', standard: 'SBC 801', frequency: 'شهري' },
    { codeNum: '12*', id: 'daily_round', name: 'جولات السلامة', nameEn: 'Safety Daily Rounds', standard: 'CBAHI FMS / السلامة العامة', frequency: 'يومي' },
    { codeNum: 13, id: 'standpipes', name: 'Stand Pipes', nameEn: 'Standpipe Risers', standard: 'SBC 801', frequency: 'شهري' },
    { codeNum: 14, id: 'work_sites', name: 'مواقع العمل', nameEn: 'Work Sites Safety', standard: 'اشتراطات مواقع العمل', frequency: 'أسبوعي' }
  ];

  const FALLBACK_BUILDINGS = [
    { id: 'BLD-A', code: 'A', name: 'المستشفى', floors: 9 },
    { id: 'BLD-B', code: 'B', name: 'التوسعة الشرقية', floors: 9 },
    { id: 'BLD-C', code: 'C', name: 'كلية الطب', floors: 4 },
    { id: 'BLD-C2', code: 'C2', name: 'توسعة كلية الطب', floors: 5 },
    { id: 'BLD-D', code: 'D', name: 'المبنى الإداري', floors: 8 },
    { id: 'BLD-E', code: 'E', name: 'مبنى العيادات', floors: 5 },
    { id: 'BLD-F', code: 'F', name: 'مواقف متعددة الأدوار', floors: 6 },
    { id: 'BLD-G', code: 'G', name: 'مبنى الاسنان', floors: 12 },
    { id: 'BLD-H', code: 'H', name: 'العناية المركزة', floors: 5 },
    { id: 'BLD-I', code: 'I', name: 'مواقف 25', floors: 2 },
    { id: 'BLD-O', code: 'O', name: 'المستودعات الخارجية', floors: 2 }
  ];

  const FALLBACK_FLOORS_MAP = {
    'المستشفى': ['القبو الثاني (B2)', 'القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'الدور الرابع (4)', 'الدور الخامس (5)', 'الدور السادس (6)', 'السطح (Roof)'],
    'التوسعة الشرقية': ['القبو الثاني (B2)', 'القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'الدور الرابع (4)', 'الدور الخامس (5)', 'ملحق السطح والخدمات (Roof)'],
    'كلية الطب': ['القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح (Roof)'],
    'توسعة كلية الطب': ['القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح (Roof)'],
    'المبنى الإداري': ['القبو الثاني (B2)', 'القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'الدور الرابع (4)', 'السطح (Roof)'],
    'مبنى العيادات': ['القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح (Roof)'],
    'مواقف متعددة الأدوار': ['القبو (B)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح العلوي (R)'],
    'مبنى الاسنان': ['القبو الثاني (B2)', 'القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'الدور الرابع (4)', 'الدور الخامس (5)', 'الدور السادس (6)', 'الدور السابع (7)', 'الدور الثامن (8)', 'الدور التاسع (9)', 'السطح (Roof)'],
    'العناية المركزة': ['القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح (Roof)'],
    'المستودعات الخارجية': ['الدور الأرضي (G)', 'الدور الأول (1)', 'السطح (Roof)'],
    'مواقف 25': ['الموقع العام (G)', 'الدور الأول (1)', 'السطح (R)']
  };

  let monthlyState = {
    formType: 'ext',
    building: 'مبنى العيادات',
    month: '',
    approvalFilter: 'all',
    regulatoryProfile: 'cbahi', // 'cbahi' | 'civil_defense' | 'unified'
    printMode: 'matrix_plus_details' // 'matrix_plus_details' | 'summary_only'
  };

  function escHtml(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toLatinDigits(str) {
    return String(str || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }

  function getCurrentRiyadhMonth() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit'
      }).format(new Date());
      if (/^\d{4}-\d{2}/.test(parts)) return parts.slice(0, 7);
    } catch (_) {}
    return new Date().toISOString().slice(0, 7);
  }

  function extractYearMonth(raw) {
    if (!raw) return '';
    const s = toLatinDigits(String(raw)).trim();
    const ymd = s.match(/(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
    if (ymd) return `${ymd[1]}-${String(ymd[2]).padStart(2, '0')}`;
    const dmy = s.match(/\d{1,2}[-/](\d{1,2})[-/](\d{4})/);
    if (dmy) return `${dmy[2]}-${String(dmy[1]).padStart(2, '0')}`;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 7);
    return '';
  }

  function resolveCanonicalCodeLocal(rawBuilding) {
    if (typeof resolveCanonicalBuildingCode === 'function') {
      return resolveCanonicalBuildingCode(rawBuilding);
    }
    if (!rawBuilding) return '';
    const b = String(rawBuilding).trim();
    const upper = b.toUpperCase();
    if (['A', 'B', 'C', 'C2', 'D', 'E', 'F', 'G', 'H', 'O', 'I'].includes(upper)) return upper;
    if (b.includes('توسعة كلية الطب') || b.includes('توسعة الكلية') || b.includes('BLOCK-40') || b.includes('بلك 40')) return 'C2';
    if ((b.includes('كلية الطب') || b.includes('كليه الطب') || b.includes('المبنى الشرقي')) && !b.includes('توسعة')) return 'C';
    if (b.includes('التوسعة الشرق') || b.includes('المستشفى الشرقي')) return 'B';
    if (b.includes('الاسنان') || b.includes('الأسنان')) return 'G';
    if ((b === 'المستشفى' || b.includes('المستشفى الرئيسي') || b.includes('المستشفى الغربي') || b.includes('البرج الرئيسي')) && !b.includes('الأسنان') && !b.includes('الشرقي')) return 'A';
    if (b.includes('الإداري') || b.includes('الاداري')) return 'D';
    if (b.includes('العيادات') || b.toLowerCase().includes('clinic')) return 'E';
    if (b.includes('متعددة الأدوار') || b.includes('متعددة الادوار')) return 'F';
    if (b.includes('العناية المركزة') || b.toUpperCase().includes('ICU')) return 'H';
    if (b.includes('المستودعات') || b.includes('المولدات')) return 'O';
    if (b.includes('25')) return 'I';
    if (b.includes('أخرى') || b.includes('اخرى')) return 'OTHER';
    return '';
  }

  function matchBuildingStrict(b1, b2) {
    if (typeof matchBuilding === 'function') {
      return matchBuilding(b1, b2);
    }
    if (!b1 || !b2) return false;
    if (b1 === 'all' || b2 === 'all') return true;
    const s1 = String(b1).trim();
    const s2 = String(b2).trim();
    if (s1 === s2) return true;
    const c1 = resolveCanonicalCodeLocal(s1);
    const c2 = resolveCanonicalCodeLocal(s2);
    if (c1 || c2) return Boolean(c1 && c2 && c1 === c2);
    return s1 === s2;
  }

  function extractFloorCodeLocal(str) {
    const s = toLatinDigits(String(str || '').trim());
    const paren = s.match(/\(([^)]+)\)/);
    if (paren) {
      let p = paren[1].trim().toUpperCase();
      if (p.startsWith('ICU-')) p = p.replace('ICU-', '');
      if (p === 'ROOF' || p === 'R') return 'R';
      if (p === 'B' || p === 'B01' || p === 'B1') return 'B1';
      return p;
    }
    const upper = s.toUpperCase();
    if (upper.includes('السطح') || upper.includes('ROOF') || upper === 'R') return 'R';
    if (s.includes('الأرضي') || s.includes('الارضي') || upper.includes('G00')) return 'G';
    if (s.includes('القبو الثالث') || upper.includes('B3') || upper.includes('B03')) return 'B3';
    if (s.includes('القبو الثاني') || upper.includes('B2') || upper.includes('B02')) return 'B2';
    if (s.includes('القبو الأول') || s.includes('القبو الاول') || s.includes('القبو') || upper.includes('B1') || upper.includes('B01') || upper === 'B') return 'B1';
    if (s.includes('العاشر') || /\b10\b/.test(s)) return '10';
    if (s.includes('التاسع') || /\b9\b/.test(s)) return '9';
    if (s.includes('الثامن') || /\b8\b/.test(s)) return '8';
    if (s.includes('السابع') || /\b7\b/.test(s)) return '7';
    if (s.includes('السادس') || /\b6\b/.test(s)) return '6';
    if (s.includes('الخامس') || /\b5\b/.test(s)) return '5';
    if (s.includes('الرابع') || /\b4\b/.test(s)) return '4';
    if (s.includes('الثالث') || /\b3\b/.test(s)) return '3';
    if (s.includes('الثاني') || /\b2\b/.test(s)) return '2';
    if (s.includes('الأول') || s.includes('الاول') || /\b1\b/.test(s)) return '1';
    return s;
  }

  function matchFloorStrict(f1, f2) {
    if (typeof matchFloor === 'function') {
      return matchFloor(f1, f2);
    }
    if (!f1 || !f2) return false;
    if (f1 === 'all' || f2 === 'all') return true;
    const s1 = String(f1).trim();
    const s2 = String(f2).trim();
    if (s1 === s2) return true;
    const c1 = extractFloorCodeLocal(s1);
    const c2 = extractFloorCodeLocal(s2);
    if (c1 && c2 && c1 === c2) return true;
    return s1.includes(s2) || s2.includes(s1);
  }

  function getFormsCatalog() {
    if (typeof OFFICIAL_14_INSPECTION_TYPES !== 'undefined' && Array.isArray(OFFICIAL_14_INSPECTION_TYPES)) {
      return OFFICIAL_14_INSPECTION_TYPES;
    }
    return FALLBACK_14_FORMS;
  }

  function getBuildingsCatalog() {
    if (typeof state !== 'undefined' && state && Array.isArray(state.buildings) && state.buildings.length >= 10) {
      return state.buildings.filter(b => b && b.name && !b.name.includes('أخرى'));
    }
    if (typeof INITIAL_BUILDINGS !== 'undefined' && Array.isArray(INITIAL_BUILDINGS)) {
      return INITIAL_BUILDINGS.filter(b => b && b.name && !b.name.includes('أخرى'));
    }
    return FALLBACK_BUILDINGS;
  }

  function getFormMeta(formType) {
    if (!formType || formType === 'all') {
      return {
        id: 'all',
        name: 'جميع نماذج التفتيش المعتمدة',
        nameEn: 'Comprehensive Building Inspection',
        standard: 'CBAHI FMS & Saudi Fire Code (SBC 801 / 201)'
      };
    }
    const normalizedId = formType === 'fas' ? 'fas_insp' : formType;
    const forms = getFormsCatalog();
    const found = forms.find(f => f.id === normalizedId);
    if (found) return found;
    return { id: normalizedId, name: normalizedId, nameEn: 'Safety Inspection', standard: 'KSUMC Safety Standards' };
  }

  function normalizeRoundFormType(r) {
    const rawId = String(r.formType || r.modelId || '').trim();
    if (rawId && rawId !== 'all' && rawId !== 'safety_report') {
      return rawId === 'fas' ? 'fas_insp' : rawId;
    }
    const title = String(r.formTitle || r.modelName || '').toLowerCase();
    if (title.includes('مخارج الطوارئ') || title.includes('emergency exit')) return 'ext';
    if (title.includes('طفايات الحريق') || title.includes('extinguisher')) return 'fex';
    if (title.includes('الأسطح') || title.includes('الاسطح') || title.includes('rooftop')) return 'roof';
    if (title.includes('صناديق الحريق') || title.includes('hose cabinet')) return 'fhc';
    if (title.includes('fm-200') || title.includes('fm200')) return 'fm200';
    if (title.includes('الغرف الصناعية') || title.includes('plant room')) return 'ind_room';
    if (title.includes('اختبار') || title.includes('فحص نظام الحريق') || title.includes('testing')) return 'fas_test';
    if (title.includes('نظام الحريق') || title.includes('مراقبة الحريق') || title.includes('fire alarm')) return 'fas_insp';
    if (title.includes('wet chemical') || title.includes('الرطب')) return 'wet_chem';
    if (title.includes('المصاعد') || title.includes('elevator')) return 'elevators';
    if (title.includes('الرش الآلي') || title.includes('مضخات') || title.includes('sprinkler')) return 'sprinklers';
    if (title.includes('جولات السلامة') || title.includes('daily')) return 'daily_round';
    if (title.includes('stand pipe') || title.includes('صواعد')) return 'standpipes';
    if (title.includes('مواقع العمل') || title.includes('work site')) return 'work_sites';
    return rawId || 'all';
  }

  function isApprovedRecord(r) {
    const wf = String(r.workflowStatus || r.status || '').toLowerCase();
    return ['approved_cbahi', 'approved_by_head', 'approved_by_quality', 'approved_quality', 'archived_approved'].includes(wf) ||
      wf.includes('معتمد');
  }

  function collectAllOperationalRounds(opts) {
    if (opts && Array.isArray(opts.rounds)) {
      const pool = [...opts.rounds];
      if (Array.isArray(opts.shiftLogs)) pool.push(...opts.shiftLogs);
      return deduplicateRounds(pool);
    }

    const pool = [];
    if (typeof state !== 'undefined' && state && Array.isArray(state.rounds)) {
      pool.push(...state.rounds);
    }
    const readLS = (key) => {
      try {
        if (typeof getOperationalStorageItem === 'function') {
          const val = getOperationalStorageItem(key);
          if (val) return JSON.parse(val);
        } else if (typeof localStorage !== 'undefined') {
          const val = localStorage.getItem(key);
          if (val) return JSON.parse(val);
        }
      } catch (_) {}
      return [];
    };

    ['ksumc_safety_rounds', 'ksumc_field_rounds', 'ksumc_quality_shift_inspection_logs'].forEach(key => {
      const arr = readLS(key);
      if (Array.isArray(arr)) pool.push(...arr);
    });

    if (typeof getShiftInspectionRecords === 'function') {
      try {
        const sLogs = getShiftInspectionRecords();
        if (Array.isArray(sLogs)) pool.push(...sLogs);
      } catch (_) {}
    }

    return deduplicateRounds(pool);
  }

  function deduplicateRounds(rawList) {
    const map = new Map();
    (rawList || []).forEach(r => {
      if (!r || typeof r !== 'object') return;
      if (r.deleted === true || r.isDeleted === true) return;
      const key = String(r.roundId || r.id || `${r.date || ''}_${r.building || ''}_${r.floor || ''}_${r.formType || r.modelId || ''}`);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, r);
      } else {
        // Prefer richer round record (one that actually has checklist items[] or notes)
        const existingScore = (Array.isArray(existing.items) ? existing.items.length * 10 : 0) + (existing.formType ? 5 : 0);
        const currentScore = (Array.isArray(r.items) ? r.items.length * 10 : 0) + (r.formType ? 5 : 0);
        map.set(key, currentScore > existingScore ? Object.assign({}, existing, r) : Object.assign({}, r, existing));
      }
    });
    return Array.from(map.values());
  }

  function getCanonicalBuildingFloors(buildingName, customFloorMap) {
    if (!buildingName || buildingName === 'all') return [];
    const mapSource = customFloorMap || (typeof BUILDING_FLOOR_MAP !== 'undefined' ? BUILDING_FLOOR_MAP : FALLBACK_FLOORS_MAP);
    let rawFloors = mapSource[buildingName];
    if (!rawFloors) {
      const targetCode = resolveCanonicalCodeLocal(buildingName);
      const bldObj = getBuildingsCatalog().find(b => b.code === targetCode || matchBuildingStrict(b.name, buildingName));
      if (bldObj && mapSource[bldObj.name]) rawFloors = mapSource[bldObj.name];
    }
    if (!Array.isArray(rawFloors) || rawFloors.length === 0) {
      rawFloors = ['القبو الأول (B1)', 'الدور الأرضي (G)', 'الدور الأول (1)', 'الدور الثاني (2)', 'الدور الثالث (3)', 'السطح (Roof)'];
    }
    // Deduplicate floor aliases (e.g., القبو الأول (B1) + القبو (B) resolve to same floor code)
    const uniqueFloors = [];
    rawFloors.forEach(fl => {
      if (!uniqueFloors.some(u => matchFloorStrict(u, fl))) {
        uniqueFloors.push(fl);
      }
    });
    return uniqueFloors;
  }

  function normalizeRoundRecord(r) {
    const score = typeof r.score === 'number'
      ? r.score
      : (typeof r.complianceRate === 'number' ? r.complianceRate : 100);
    const items = Array.isArray(r.items) ? r.items : [];
    const compliantCount = typeof r.compliantCount === 'number'
      ? r.compliantCount
      : (items.length > 0 ? items.filter(i => i.result === 'compliant').length : (score >= 95 ? 1 : 0));
    const observationCount = typeof r.observationCount === 'number'
      ? r.observationCount
      : items.filter(i => i.result === 'observation').length;
    const violationCount = typeof r.violationCount === 'number'
      ? r.violationCount
      : items.filter(i => i.result === 'violation').length;
    const formType = normalizeRoundFormType(r);
    const formMeta = getFormMeta(formType);
    const dateStr = r.date || r.inspectionDate || (r.timestamp || r.createdAt || '').slice(0, 10) || '';
    const notes = r.notes || r.deficiencyDescription || '';
    const actions = r.actions || r.actionTaken || r.qualityNotes || '';

    return Object.assign({}, r, {
      id: String(r.id || r.roundId || 'RND'),
      formType,
      formTitle: r.formTitle || r.modelName || formMeta.name,
      building: r.building || r.buildingClean || 'المستشفى',
      floor: r.floor || 'الدور الأرضي (G)',
      date: dateStr,
      month: extractYearMonth(r.date || r.inspectionDate || r.timestamp || r.createdAt),
      inspector: r.inspector || 'مفتش السلامة المناوب',
      score,
      compliantCount,
      observationCount,
      violationCount,
      items,
      notes,
      actions,
      isApproved: isApprovedRecord(r)
    });
  }

  function buildMonthlyReportDataset(options) {
    const opts = options || {};
    const formType = opts.formType || 'ext';
    const building = opts.building || 'مبنى العيادات';
    const month = opts.month || getCurrentRiyadhMonth();
    const approvalFilter = opts.approvalFilter || 'all';

    const allRaw = collectAllOperationalRounds(opts);
    const normalized = allRaw
      .filter(r => r && r.sourceType !== 'safety_report' && r.formType !== 'safety_report')
      .map(normalizeRoundRecord);

    const targetForm = formType === 'fas' ? 'fas_insp' : formType;

    const matchedRounds = normalized.filter(r => {
      if (targetForm !== 'all' && r.formType !== targetForm) return false;
      if (building !== 'all' && !matchBuildingStrict(r.building, building)) return false;
      if (month && r.month !== month) return false;
      if (approvalFilter === 'approved' && !r.isApproved) return false;
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // Build full Floor-by-Floor Coverage Matrix for specific building OR Building-by-Building summary when building === 'all'
    let floorRows = [];
    if (building !== 'all') {
      const canonicalFloors = getCanonicalBuildingFloors(building, opts.buildingFloorMap);
      const extraFloors = [];
      matchedRounds.forEach(r => {
        if (!canonicalFloors.some(cf => matchFloorStrict(cf, r.floor)) && !extraFloors.some(ef => matchFloorStrict(ef, r.floor))) {
          extraFloors.push(r.floor);
        }
      });
      const allFloors = [...canonicalFloors, ...extraFloors];

      floorRows = allFloors.map((floorLabel, index) => {
        const floorRounds = matchedRounds.filter(r => matchFloorStrict(r.floor, floorLabel));
        const latest = floorRounds[0] || null;
        const avgFloorScore = floorRounds.length > 0
          ? Math.round(floorRounds.reduce((s, x) => s + x.score, 0) / floorRounds.length)
          : null;
        return {
          index: index + 1,
          floorLabel,
          inspected: floorRounds.length > 0,
          roundsCount: floorRounds.length,
          rounds: floorRounds,
          latestRound: latest,
          score: avgFloorScore,
          compliantCount: floorRounds.reduce((s, x) => s + x.compliantCount, 0),
          observationCount: floorRounds.reduce((s, x) => s + x.observationCount, 0),
          violationCount: floorRounds.reduce((s, x) => s + x.violationCount, 0),
          inspector: latest ? latest.inspector : '—',
          lastDate: latest ? latest.date : '—',
          approved: floorRounds.some(x => x.isApproved),
          deficiencies: floorRounds
            .filter(x => x.observationCount > 0 || x.violationCount > 0 || (x.items || []).some(i => i.result !== 'compliant'))
            .map(x => ({
              roundId: x.id,
              floor: floorLabel,
              date: x.date,
              notes: x.notes,
              actions: x.actions,
              nonCompliantItems: (x.items || []).filter(i => i.result !== 'compliant')
            }))
        };
      });
    } else {
      const buildings = getBuildingsCatalog();
      floorRows = buildings.map((bld, index) => {
        const bldRounds = matchedRounds.filter(r => matchBuildingStrict(r.building, bld.name));
        const bldFloors = getCanonicalBuildingFloors(bld.name, opts.buildingFloorMap);
        const coveredFloors = bldFloors.filter(fl => bldRounds.some(r => matchFloorStrict(r.floor, fl))).length;
        const avgBldScore = bldRounds.length > 0
          ? Math.round(bldRounds.reduce((s, x) => s + x.score, 0) / bldRounds.length)
          : null;
        return {
          index: index + 1,
          floorLabel: `[${bld.code}] ${bld.name} (${coveredFloors}/${bldFloors.length} دور)`,
          inspected: bldRounds.length > 0,
          roundsCount: bldRounds.length,
          rounds: bldRounds,
          latestRound: bldRounds[0] || null,
          score: avgBldScore,
          compliantCount: bldRounds.reduce((s, x) => s + x.compliantCount, 0),
          observationCount: bldRounds.reduce((s, x) => s + x.observationCount, 0),
          violationCount: bldRounds.reduce((s, x) => s + x.violationCount, 0),
          inspector: bldRounds[0] ? bldRounds[0].inspector : '—',
          lastDate: bldRounds[0] ? bldRounds[0].date : '—',
          approved: bldRounds.some(x => x.isApproved),
          deficiencies: bldRounds
            .filter(x => x.observationCount > 0 || x.violationCount > 0)
            .map(x => ({
              roundId: x.id,
              floor: `${bld.name} - ${x.floor}`,
              date: x.date,
              notes: x.notes,
              actions: x.actions,
              nonCompliantItems: (x.items || []).filter(i => i.result !== 'compliant')
            }))
        };
      });
    }

    const totalFloorsCount = floorRows.length;
    const inspectedFloorsCount = floorRows.filter(f => f.inspected).length;
    const coveragePct = totalFloorsCount > 0 ? Math.round((inspectedFloorsCount / totalFloorsCount) * 100) : 0;
    const avgScore = matchedRounds.length > 0
      ? Math.round(matchedRounds.reduce((sum, r) => sum + r.score, 0) / matchedRounds.length)
      : 0;
    const totalCompliant = matchedRounds.reduce((sum, r) => sum + r.compliantCount, 0);
    const totalObservations = matchedRounds.reduce((sum, r) => sum + r.observationCount, 0);
    const totalViolations = matchedRounds.reduce((sum, r) => sum + r.violationCount, 0);

    const allDeficiencies = [];
    matchedRounds.forEach(r => {
      const badItems = (r.items || []).filter(i => i.result === 'observation' || i.result === 'violation');
      if (badItems.length > 0) {
        badItems.forEach(item => {
          allDeficiencies.push({
            floor: r.floor,
            building: r.building,
            date: r.date,
            inspector: r.inspector,
            itemTitle: item.title || item.code || r.formTitle,
            severity: item.result === 'violation' ? 'مخالفة حرجة' : 'ملاحظة',
            note: item.note || r.notes || 'مرصودة أثناء الفحص',
            action: r.actions || 'محال للمتابعة والإجراء التصحيحي (CAPA)'
          });
        });
      } else if (r.observationCount > 0 || r.violationCount > 0) {
        allDeficiencies.push({
          floor: r.floor,
          building: r.building,
          date: r.date,
          inspector: r.inspector,
          itemTitle: r.formTitle,
          severity: r.violationCount > 0 ? 'مخالفة' : 'ملاحظة',
          note: r.notes || 'تم رصد ملاحظات أثناء الجولة',
          action: r.actions || 'قيد المعالجة'
        });
      }
    });

    const formMeta = getFormMeta(targetForm);
    return {
      formType: targetForm,
      formMeta,
      building,
      month,
      approvalFilter,
      matchedRounds,
      floorRows,
      totalFloorsCount,
      inspectedFloorsCount,
      coveragePct,
      avgScore,
      totalCompliant,
      totalObservations,
      totalViolations,
      allDeficiencies
    };
  }

  function getRegulatoryMeta(profile, formMeta) {
    const std = (formMeta && formMeta.standard) ? formMeta.standard : 'SBC 801 / SBC 201';
    if (profile === 'civil_defense') {
      return {
        key: 'civil_defense',
        badgeText: 'تقرير جاهزية السلامة — متطلبات الدفاع المدني السعودي',
        standardText: `المرجع التنظيمي: اشتراطات المديرية العامة للدفاع المدني • كود البناء والحريق السعودي (${std})`,
        declarationTitle: 'إقرار الجاهزية الوقائية وسلامة المبنى (الدفاع المدني):',
        declarationBody: 'نُقر بموجب هذا السجل الشهري الموثّق ميدانياً أن الأنظمة ومخارج الطوارئ ووسائل الوقاية والحماية من الحريق في المبنى المحدد أعلاه تخضع للتفتيش الدوري وفق اشتراطات الدفاع المدني وكود الحريق السعودي، ويُعمل على إغلاق أي ملاحظات مرصودة فوراً.'
      };
    }
    if (profile === 'unified') {
      return {
        key: 'unified',
        badgeText: 'تقرير الامتثال الموحّد — سباهي (CBAHI) & الدفاع المدني (SBC)',
        standardText: `المرجع التنظيمي: معايير اعتماد المنشآت الصحية سباهي (CBAHI FMS) + اشتراطات الدفاع المدني (${std})`,
        declarationTitle: 'إقرار المطابقة الموحّد للاعتماد الصحي والسلامة الوقائية:',
        declarationBody: 'تؤكد إدارة السلامة وقسم الجودة وتقييم الأداء اكتمال التوثيق الميداني والرقابي لنتائج هذا النموذج لجميع أدوار المبنى ومطابقته لمعايير إدارة المرافق والسلامة (CBAHI FMS) واشتراطات الدفاع المدني السعودي.'
      };
    }
    return {
      key: 'cbahi',
      badgeText: 'ملف الامتثال الشهري المعتمد — معايير سباهي (CBAHI FMS)',
      standardText: `المرجع التنظيمي: معايير المركز السعودي لاعتماد المنشآت الصحية سباهي (CBAHI - FMS Safety & Fire) • ${std}`,
      declarationTitle: 'شهادة التحقق ومراجعة الجودة لملف سباهي (CBAHI Compliance Statement):',
      declarationBody: 'تمت مراجعة ومطابقة نتائج التفتيش الميداني الشهري عبر جميع أدوار المبنى من قِبل وحدة الجودة وتقييم الأداء وفق متطلبات معايير سباهي (CBAHI FMS) وربط الملاحظات المرصودة بسجل الإجراءات التصحيحية والوقائية (CAPA).'
    };
  }

  function getQrSvg(payload) {
    if (typeof generateQRCodeSVG === 'function') {
      try { return generateQRCodeSVG(payload, 72); } catch (_) {}
    }
    return '<svg width="64" height="64" viewBox="0 0 64 64" style="border:1px solid #082B49;background:#fff;"><rect x="6" y="6" width="18" height="18" fill="#082B49"/><rect x="40" y="6" width="18" height="18" fill="#082B49"/><rect x="6" y="40" width="18" height="18" fill="#082B49"/><rect x="28" y="28" width="10" height="10" fill="#004B87"/></svg>';
  }

  function generateMonthlyReportPrintHtml(dataset, options) {
    const opts = options || {};
    const regulatoryProfile = opts.regulatoryProfile || monthlyState.regulatoryProfile || 'cbahi';
    const printMode = opts.printMode || monthlyState.printMode || 'matrix_plus_details';
    const reg = getRegulatoryMeta(regulatoryProfile, dataset.formMeta);
    const reportRef = `KSUMC-MREP-${String(dataset.formType).toUpperCase()}-${String(dataset.month || '').replace('-', '')}`;
    const baseHref = (typeof window !== 'undefined' && window.location && window.location.href) ? `<base href="${escHtml(window.location.href)}">` : '';
    const qrSvg = getQrSvg(`KSUMC-MONTHLY|${reportRef}|BLD:${dataset.building}|COV:${dataset.coveragePct}%|SCORE:${dataset.avgScore}%`);

    const buildingDisplay = dataset.building === 'all' ? 'جميع مباني المدينة الطبية الجامعية' : dataset.building;

    const floorRowsHtml = dataset.floorRows.map(row => {
      const statusBadge = row.inspected
        ? (row.score >= 90 && row.violationCount === 0
            ? `<span style="background:#dcfce7;color:#166534;border:1px solid #86efac;padding:2px 6px;border-radius:4px;font-weight:800;">✓ مكتمل ومطابق</span>`
            : `<span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;padding:2px 6px;border-radius:4px;font-weight:800;">⚠ مكتمل بملاحظات</span>`)
        : `<span style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:2px 6px;border-radius:4px;font-weight:800;">✕ لم يُفتّش هذا الشهر</span>`;

      const scoreCell = row.inspected ? `${row.score}%` : '—';
      const approvalCell = row.inspected
        ? (row.approved ? 'معتمد ✓' : 'قيد الاعتماد')
        : '—';

      return `
        <tr>
          <td style="text-align:center;font-weight:700;">${row.index}</td>
          <td style="font-weight:800;color:#082B49;">${escHtml(row.floorLabel)}</td>
          <td style="text-align:center;">${statusBadge}</td>
          <td style="text-align:center;font-weight:800;">${row.roundsCount}</td>
          <td style="text-align:center;font-weight:900;color:${row.inspected && row.score >= 90 ? '#166534' : (row.inspected ? '#b45309' : '#64748b')};">${scoreCell}</td>
          <td style="text-align:center;color:#166534;font-weight:700;">${row.inspected ? row.compliantCount : '—'}</td>
          <td style="text-align:center;color:#b45309;font-weight:700;">${row.inspected ? row.observationCount : '—'}</td>
          <td style="text-align:center;color:#b91c1c;font-weight:700;">${row.inspected ? row.violationCount : '—'}</td>
          <td>${escHtml(row.inspector)}</td>
          <td style="text-align:center;font-family:monospace;">${escHtml(row.lastDate)}</td>
          <td style="text-align:center;font-weight:700;">${approvalCell}</td>
        </tr>
      `;
    }).join('');

    const deficienciesHtml = dataset.allDeficiencies.length > 0
      ? `
        <div style="margin-top:10px;page-break-inside:avoid;">
          <div class="sec-title">سجل الملاحظات المرصودة والإجراءات التصحيحية (CAPA &amp; Deficiencies Log):</div>
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:16%;">الموقع / الدور</th>
                <th style="width:26%;">البند / النموذج</th>
                <th style="width:11%;">التصنيف</th>
                <th style="width:25%;">تفاصيل الملاحظة</th>
                <th style="width:22%;">الإجراء المتخذ (CAPA)</th>
              </tr>
            </thead>
            <tbody>
              ${dataset.allDeficiencies.map(d => `
                <tr>
                  <td style="font-weight:700;">${escHtml(d.floor)}</td>
                  <td>${escHtml(d.itemTitle)}</td>
                  <td style="text-align:center;font-weight:800;color:${d.severity.includes('مخالفة') ? '#b91c1c' : '#b45309'};">${escHtml(d.severity)}</td>
                  <td>${escHtml(d.note)}</td>
                  <td>${escHtml(d.action)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
      : `
        <div style="margin-top:8px;padding:7px 10px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;color:#166534;font-weight:800;font-size:10px;">
          ✓ لم تُسجّل أي مخالفات أو ملاحظات حرجة في الجولات المنفذة خلال شهر (${escHtml(dataset.month)}) للنموذج والمبنى المحددين.
        </div>
      `;

    let appendicesHtml = '';
    if (printMode === 'matrix_plus_details' && dataset.matchedRounds.length > 0) {
      appendicesHtml = dataset.matchedRounds.map((round, idx) => {
        const fallbackItems = (typeof getChecklistItemsForFormType === 'function' && typeof DEFAULT_CHECKLIST_ITEMS !== 'undefined')
          ? getChecklistItemsForFormType(round.formType, DEFAULT_CHECKLIST_ITEMS)
          : [];
        const itemsList = (Array.isArray(round.items) && round.items.length > 0)
          ? round.items
          : fallbackItems.map(it => Object.assign({}, it, { result: 'compliant', note: '' }));

        const itemsRows = itemsList.length > 0
          ? itemsList.map((it, i) => {
              const resText = it.result === 'violation' ? 'لا (مخالفة) ✕' : (it.result === 'observation' ? 'ملاحظة ⚠' : 'نعم (مطابق) ✓');
              const resColor = it.result === 'violation' ? '#b91c1c' : (it.result === 'observation' ? '#b45309' : '#166534');
              return `
                <tr>
                  <td style="text-align:center;font-weight:700;">${i + 1}</td>
                  <td style="font-family:monospace;font-size:8.5px;">${escHtml(it.code || '-')}</td>
                  <td style="font-weight:700;">${escHtml(it.title || it.desc || '-')}</td>
                  <td style="text-align:center;font-weight:900;color:${resColor};">${resText}</td>
                  <td>${escHtml(it.note || '—')}</td>
                </tr>
              `;
            }).join('')
          : `<tr><td colspan="5" style="text-align:center;padding:8px;color:#64748b;">نموذج تفتيش معتمد بنسبة امتثال (${round.score}%) — تم التوثيق الميداني عبر سجل الورديات.</td></tr>`;

        return `
          <div class="floor-detail-appendix" style="page-break-before: always; padding-top: 4px;">
            <div style="border:2px solid #082B49;border-radius:8px;padding:10px 12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #082B49;padding-bottom:6px;margin-bottom:8px;">
                <div>
                  <div style="font-size:13px;font-weight:900;color:#082B49;">ملحق تفصيلي رقم (${idx + 1}): ${escHtml(round.formTitle)}</div>
                  <div style="font-size:10px;color:#004B87;font-weight:800;">المبنى: ${escHtml(round.building)} • الدور: ${escHtml(round.floor)} • التاريخ: ${escHtml(round.date)}</div>
                </div>
                <div style="text-align:left;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:4px 10px;font-size:9.5px;">
                  <div><strong>المرجع:</strong> <span style="font-family:monospace;">${escHtml(round.id)}</span></div>
                  <div><strong>الامتثال:</strong> <span style="font-weight:900;color:${round.score >= 90 ? '#166534' : '#b45309'};">${round.score}%</span></div>
                </div>
              </div>

              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;background:#F7F9FF;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;font-size:9.5px;">
                <div><strong>المفتش:</strong> ${escHtml(round.inspector)}</div>
                <div><strong>الوردية:</strong> ${escHtml(round.shiftName || 'المناوبة')}</div>
                <div><strong>بنود مطابقة:</strong> ${round.compliantCount}</div>
                <div><strong>ملاحظات/مخالفات:</strong> ${round.observationCount + round.violationCount}</div>
              </div>

              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:6%;">#</th>
                    <th style="width:14%;">الكود / المعيار</th>
                    <th style="width:44%;">بند التفتيش والفحص الميداني</th>
                    <th style="width:14%;">النتيجة</th>
                    <th style="width:22%;">ملاحظات المفتش</th>
                  </tr>
                </thead>
                <tbody>${itemsRows}</tbody>
              </table>

              <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:9.5px;">
                <div style="border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;background:#f8fafc;">
                  <strong>ملاحظات الجولة الميدانية:</strong>
                  <div style="margin-top:3px;color:#334155;">${escHtml(round.notes || 'لا توجد ملاحظات سلبية — الموقع مستوفٍ للاشتراطات.')}</div>
                </div>
                <div style="border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;background:#f8fafc;">
                  <strong>الإجراءات التصحيحية وتوصية الجودة:</strong>
                  <div style="margin-top:3px;color:#334155;">${escHtml(round.actions || (round.isApproved ? 'تمت المراجعة والاعتماد رسمياً' : 'قيد المتابعة'))}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  ${baseHref}
  <title>التقرير الشهري المجمّع - ${escHtml(dataset.formMeta.name)} - ${escHtml(buildingDisplay)} (${escHtml(dataset.month)})</title>
  <style>
    @page { size: A4 portrait; margin: 7mm 9mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif; }
    body { background: #fff; color: #181C20; font-size: 10px; line-height: 1.3; direction: rtl; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { width: 100%; border: 2px solid #082B49; border-radius: 8px; padding: 10px 12px; }
    .hdr-table { width: 100%; border-collapse: collapse; border-bottom: 2.5px solid #082B49; padding-bottom: 8px; margin-bottom: 8px; }
    .reg-banner { background: linear-gradient(135deg, #00162B, #082B49, #004B87); color: #fff; padding: 7px 12px; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; border-right: 4px solid #C59B27; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
    .kpi-box { border: 1px solid #C3C6CE; border-radius: 6px; padding: 6px; text-align: center; background: #F7F9FF; }
    .kpi-box .lbl { font-size: 8.5px; color: #5B626C; font-weight: 700; display: block; }
    .kpi-box .val { font-size: 14px; font-weight: 900; color: #082B49; }
    .sec-title { background: #F7F9FF; border-right: 4px solid #004B87; padding: 4px 8px; font-size: 10.5px; font-weight: 900; color: #082B49; margin-bottom: 5px; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 6px; }
    .data-table th { background: #082B49; color: #fff; padding: 5px 4px; border: 1px solid #082B49; font-weight: 800; text-align: center; }
    .data-table td { border: 1px solid #C3C6CE; padding: 4px 5px; vertical-align: middle; }
    .data-table tbody tr:nth-child(even) { background: #F7F9FF; }
    .decl-box { border: 1px solid #C59B27; background: #FFFDF5; border-radius: 6px; padding: 6px 10px; margin-top: 8px; font-size: 9px; color: #082B49; page-break-inside: avoid; }
    .sigs-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; page-break-inside: avoid; }
    .sig-box { border: 1px solid #C3C6CE; border-radius: 6px; padding: 6px 8px; text-align: center; background: #fff; }
  </style>
</head>
<body>
  <div class="sheet">
    <table class="hdr-table">
      <tr>
        <td style="width:34%;vertical-align:top;">
          <div style="font-weight:900;font-size:11px;color:#082B49;">المملكة العربية السعودية</div>
          <div style="font-weight:900;font-size:10.5px;color:#082B49;">جامعة الملك سعود — المدينة الطبية الجامعية</div>
          <div style="font-size:9px;font-weight:700;color:#1e293b;">الإدارة العامة للأمن والسلامة</div>
          <div style="font-size:9px;font-weight:800;color:#004B87;">إدارة السلامة • قسم الجودة وتقييم الأداء</div>
        </td>
        <td style="width:40%;text-align:center;vertical-align:top;">
          <img src="assets/images/ksu_official_logo.png" alt="KSUMC" style="height:44px;width:auto;object-fit:contain;margin-bottom:3px;display:inline-block;" onerror="this.style.display='none'">
          <div style="font-size:13.5px;font-weight:900;color:#082B49;">التقرير الشهري المجمّع لتفتيش السلامة</div>
          <div style="font-size:10.5px;font-weight:800;color:#004B87;">${escHtml(dataset.formMeta.name)} — ${escHtml(buildingDisplay)}</div>
        </td>
        <td style="width:26%;text-align:left;vertical-align:top;">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
            <div style="background:#F7F9FF;border:1px solid #004B87;border-radius:6px;padding:4px 7px;text-align:left;font-size:8.5px;">
              <div><strong>المرجع:</strong> <span style="font-family:monospace;">${escHtml(reportRef)}</span></div>
              <div><strong>الشهر:</strong> <span style="font-family:monospace;">${escHtml(dataset.month)}</span></div>
              <div><strong>النطاق:</strong> ${dataset.approvalFilter === 'approved' ? 'المعتمدة فقط' : 'كافة الجولات'}</div>
            </div>
            <div>${qrSvg}</div>
          </div>
        </td>
      </tr>
    </table>

    <div class="reg-banner">
      <div>
        <div style="font-size:11px;font-weight:900;color:#F9F1DC;">${escHtml(reg.badgeText)}</div>
        <div style="font-size:9px;color:#D1E4FF;">${escHtml(reg.standardText)}</div>
      </div>
      <div style="font-size:9px;font-weight:800;background:rgba(255,255,255,0.14);padding:3px 8px;border-radius:4px;border:1px solid rgba(197,155,39,0.5);">
        ${printMode === 'matrix_plus_details' ? 'تقرير متكامل (ملخص + تفاصيل الأدوار)' : 'ملخص تنفيذي مجمّع'}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <span class="lbl">تغطية ${dataset.building === 'all' ? 'المباني' : 'أدوار المبنى'}</span>
        <span class="val" style="color:#004B87;">${dataset.inspectedFloorsCount} / ${dataset.totalFloorsCount} (${dataset.coveragePct}%)</span>
      </div>
      <div class="kpi-box">
        <span class="lbl">متوسط نسبة الامتثال</span>
        <span class="val" style="color:${dataset.avgScore >= 90 ? '#166534' : '#b45309'};">${dataset.matchedRounds.length > 0 ? dataset.avgScore + '%' : '—'}</span>
      </div>
      <div class="kpi-box">
        <span class="lbl">إجمالي الجولات المنفذة</span>
        <span class="val">${dataset.matchedRounds.length}</span>
      </div>
      <div class="kpi-box">
        <span class="lbl">ملاحظات / مخالفات مرصودة</span>
        <span class="val" style="color:${(dataset.totalObservations + dataset.totalViolations) > 0 ? '#b91c1c' : '#166534'};">${dataset.totalObservations + dataset.totalViolations}</span>
      </div>
    </div>

    <div class="sec-title">جدول تغطية وامتثال ${dataset.building === 'all' ? 'مباني المدينة الطبية' : 'جميع أدوار المبنى'} (${escHtml(buildingDisplay)} — شهر ${escHtml(dataset.month)}):</div>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:4%;">#</th>
          <th style="width:18%;">${dataset.building === 'all' ? 'المبنى' : 'الدور / الطابق'}</th>
          <th style="width:13%;">حالة التغطية</th>
          <th style="width:6%;">الجولات</th>
          <th style="width:8%;">الامتثال</th>
          <th style="width:6%;">مطابق</th>
          <th style="width:6%;">ملاحظة</th>
          <th style="width:6%;">مخالفة</th>
          <th style="width:14%;">المفتش</th>
          <th style="width:10%;">آخر فحص</th>
          <th style="width:9%;">الاعتماد</th>
        </tr>
      </thead>
      <tbody>${floorRowsHtml}</tbody>
    </table>

    ${deficienciesHtml}

    <div class="decl-box">
      <strong>${escHtml(reg.declarationTitle)}</strong>
      <div style="margin-top:2px;line-height:1.4;">${escHtml(reg.declarationBody)}</div>
    </div>

    <div class="sigs-grid">
      <div class="sig-box">
        <div style="font-size:8.5px;color:#5B626C;font-weight:700;">مشرف الوردية الميدانية</div>
        <div style="font-weight:900;color:#082B49;margin-top:4px;">مشرف السلامة المناوب</div>
        <div style="font-size:8px;color:#166534;margin-top:2px;">✓ تحقق ميداني</div>
      </div>
      <div class="sig-box" style="background:#FFFDF5;border-color:#C59B27;">
        <div style="font-size:8.5px;color:#082B49;font-weight:700;">مسؤول الجودة وتقييم الأداء</div>
        <div style="font-weight:900;color:#082B49;margin-top:4px;">SAQRI (أ. علي الصقري)</div>
        <div style="font-size:8px;color:#166534;margin-top:2px;">✓ مطابقة الجودة والاعتماد</div>
      </div>
      <div class="sig-box">
        <div style="font-size:8.5px;color:#5B626C;font-weight:700;">رئيس إدارة السلامة — المدينة الطبية</div>
        <div style="font-weight:900;color:#082B49;margin-top:4px;">أ. مصعب عبد الله الحماد</div>
        <div style="font-size:8px;color:#004B87;margin-top:2px;">🏅 اعتماد رسمي</div>
      </div>
    </div>
  </div>
  ${appendicesHtml}
</body>
</html>`;
  }

  // ==========================================================
  // QUALITY.HTML INTERACTIVE BUILDER CONTROLLER
  // ==========================================================
  function renderMonthlyBuildingReportPreview() {
    if (typeof document === 'undefined') return;
    const formEl = document.getElementById('mr-form-type');
    const bldEl = document.getElementById('mr-building');
    const monthEl = document.getElementById('mr-month');
    const statusEl = document.getElementById('mr-status-filter');
    const container = document.getElementById('mr-preview-container');
    if (!container) return;

    if (formEl && formEl.value) monthlyState.formType = formEl.value;
    if (bldEl && bldEl.value) monthlyState.building = bldEl.value;
    if (monthEl && monthEl.value) monthlyState.month = monthEl.value;
    if (statusEl && statusEl.value) monthlyState.approvalFilter = statusEl.value;

    const dataset = buildMonthlyReportDataset({
      formType: monthlyState.formType,
      building: monthlyState.building,
      month: monthlyState.month,
      approvalFilter: monthlyState.approvalFilter
    });

    const regMeta = getRegulatoryMeta(monthlyState.regulatoryProfile, dataset.formMeta);
    const bldLabel = dataset.building === 'all' ? 'جميع مباني المدينة الطبية' : dataset.building;

    const tableRows = dataset.floorRows.map(row => {
      const badge = row.inspected
        ? (row.score >= 90 && row.violationCount === 0
            ? '<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black">مكتمل ✓</span>'
            : '<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">ملاحظات ⚠</span>')
        : '<span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold">لم يُفتّش</span>';

      return `
        <tr class="hover:bg-[#F7F9FF] transition-colors">
          <td class="py-2 px-2.5 text-center font-mono text-slate-500 font-bold">${row.index}</td>
          <td class="py-2 px-2.5 font-extrabold text-[#082B49]">${escHtml(row.floorLabel)}</td>
          <td class="py-2 px-2.5 text-center">${badge}</td>
          <td class="py-2 px-2.5 text-center font-mono font-bold">${row.roundsCount}</td>
          <td class="py-2 px-2.5 text-center font-black ${row.inspected && row.score >= 90 ? 'text-emerald-700' : (row.inspected ? 'text-amber-700' : 'text-slate-400')}">${row.inspected ? row.score + '%' : '—'}</td>
          <td class="py-2 px-2.5 text-slate-700">${escHtml(row.inspector)}</td>
          <td class="py-2 px-2.5 text-center font-mono text-[11px] text-slate-500">${escHtml(row.lastDate)}</td>
          <td class="py-2 px-2.5 text-center text-[11px] font-bold">${row.inspected ? (row.approved ? '<span class="text-emerald-700">معتمد ✓</span>' : '<span class="text-sky-700">قيد الاعتماد</span>') : '—'}</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="space-y-3">
        <div class="p-3 rounded-2xl bg-[#F7F9FF] border border-[#004B87]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div class="text-xs font-black text-[#082B49]">${escHtml(regMeta.badgeText)}</div>
            <div class="text-[11px] text-[#5B626C] font-semibold mt-0.5">النموذج: <strong class="text-[#004B87]">${escHtml(dataset.formMeta.name)}</strong> • الموقع: <strong class="text-[#082B49]">${escHtml(bldLabel)}</strong> • الشهر: <span class="font-mono font-bold">${escHtml(dataset.month)}</span></div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="px-2.5 py-1 rounded-xl bg-white border border-[#C3C6CE] text-[11px] font-black text-[#082B49]">التغطية: ${dataset.inspectedFloorsCount}/${dataset.totalFloorsCount} (${dataset.coveragePct}%)</span>
            <span class="px-2.5 py-1 rounded-xl bg-white border border-[#C3C6CE] text-[11px] font-black ${dataset.avgScore >= 90 ? 'text-emerald-700' : 'text-amber-700'}">الامتثال: ${dataset.matchedRounds.length > 0 ? dataset.avgScore + '%' : '—'}</span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table class="w-full text-right text-xs">
            <thead class="bg-[#082B49] text-white font-bold">
              <tr>
                <th class="py-2.5 px-2.5 text-center">#</th>
                <th class="py-2.5 px-2.5">${dataset.building === 'all' ? 'المبنى' : 'الدور / الطابق'}</th>
                <th class="py-2.5 px-2.5 text-center">الحالة</th>
                <th class="py-2.5 px-2.5 text-center">الجولات</th>
                <th class="py-2.5 px-2.5 text-center">نسبة الامتثال</th>
                <th class="py-2.5 px-2.5">المفتش</th>
                <th class="py-2.5 px-2.5 text-center">التاريخ</th>
                <th class="py-2.5 px-2.5 text-center">حالة الجودة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function updateMonthlyToggleButtons() {
    if (typeof document === 'undefined') return;
    ['cbahi', 'civil_defense', 'unified'].forEach(p => {
      const btn = document.getElementById('btn-mr-reg-' + p);
      if (!btn) return;
      if (monthlyState.regulatoryProfile === p) {
        btn.className = 'px-3 py-1.5 rounded-xl bg-[#082B49] text-[#F9F1DC] border border-[#082B49] font-black text-xs shadow-xs transition-all cursor-pointer';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#082B49] border border-slate-300 font-bold text-xs transition-all cursor-pointer';
      }
    });
    ['matrix_plus_details', 'summary_only'].forEach(m => {
      const btn = document.getElementById('btn-mr-mode-' + m);
      if (!btn) return;
      if (monthlyState.printMode === m) {
        btn.className = 'px-3 py-1.5 rounded-xl bg-[#004B87] text-white border border-[#004B87] font-black text-xs shadow-xs transition-all cursor-pointer';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-[#082B49] border border-slate-300 font-bold text-xs transition-all cursor-pointer';
      }
    });
  }

  function setMonthlyReportRegulatoryProfile(profile) {
    monthlyState.regulatoryProfile = profile || 'cbahi';
    updateMonthlyToggleButtons();
    renderMonthlyBuildingReportPreview();
  }

  function setMonthlyReportPrintMode(mode) {
    monthlyState.printMode = mode || 'matrix_plus_details';
    updateMonthlyToggleButtons();
    renderMonthlyBuildingReportPreview();
  }

  function printMonthlyBuildingReport() {
    const formEl = typeof document !== 'undefined' ? document.getElementById('mr-form-type') : null;
    const bldEl = typeof document !== 'undefined' ? document.getElementById('mr-building') : null;
    const monthEl = typeof document !== 'undefined' ? document.getElementById('mr-month') : null;
    const statusEl = typeof document !== 'undefined' ? document.getElementById('mr-status-filter') : null;

    if (formEl && formEl.value) monthlyState.formType = formEl.value;
    if (bldEl && bldEl.value) monthlyState.building = bldEl.value;
    if (monthEl && monthEl.value) monthlyState.month = monthEl.value;
    if (statusEl && statusEl.value) monthlyState.approvalFilter = statusEl.value;

    const dataset = buildMonthlyReportDataset({
      formType: monthlyState.formType,
      building: monthlyState.building,
      month: monthlyState.month,
      approvalFilter: monthlyState.approvalFilter
    });

    const html = generateMonthlyReportPrintHtml(dataset, {
      regulatoryProfile: monthlyState.regulatoryProfile,
      printMode: monthlyState.printMode
    });
    const bldLabel = dataset.building === 'all' ? 'جميع المباني' : dataset.building;
    const title = `تقرير شهري - ${dataset.formMeta.name} - ${bldLabel} (${dataset.month})`;

    if (typeof rootScope.printHtmlContent === 'function') {
      rootScope.printHtmlContent(html, title);
    } else if (typeof window !== 'undefined' && typeof window.printHtmlContent === 'function') {
      window.printHtmlContent(html, title);
    }
  }

  function initMonthlyBuildingReportBuilder() {
    if (typeof document === 'undefined') return;
    const formEl = document.getElementById('mr-form-type');
    const bldEl = document.getElementById('mr-building');
    const monthEl = document.getElementById('mr-month');

    if (!monthlyState.month) {
      monthlyState.month = getCurrentRiyadhMonth();
    }

    if (formEl && formEl.options.length === 0) {
      const forms = getFormsCatalog();
      formEl.innerHTML = forms.map(f => `<option value="${escHtml(f.id)}">[${escHtml(f.codeNum)}] ${escHtml(f.name)} (${escHtml(f.nameEn)})</option>`).join('') +
        `<option value="all">📋 تقرير شامل بجميع النماذج للمبنى</option>`;
      formEl.value = monthlyState.formType || 'ext';
    }

    if (bldEl && bldEl.options.length === 0) {
      const blds = getBuildingsCatalog();
      bldEl.innerHTML = blds.map(b => `<option value="${escHtml(b.name)}">[${escHtml(b.code)}] ${escHtml(b.name)} (${b.floors} أدوار)</option>`).join('') +
        `<option value="all">🏥 جميع مباني المدينة الطبية</option>`;
      bldEl.value = monthlyState.building || 'مبنى العيادات';
    }

    if (monthEl && !monthEl.value) {
      monthEl.value = monthlyState.month;
    }

    updateMonthlyToggleButtons();
    renderMonthlyBuildingReportPreview();
  }

  const exportedApi = {
    getFormsCatalog,
    getBuildingsCatalog,
    getCanonicalBuildingFloors,
    buildMonthlyReportDataset,
    generateMonthlyReportPrintHtml,
    initMonthlyBuildingReportBuilder,
    renderMonthlyBuildingReportPreview,
    setMonthlyReportRegulatoryProfile,
    setMonthlyReportPrintMode,
    printMonthlyBuildingReport
  };

  if (typeof window !== 'undefined') {
    window.KSUMonthlyReports = exportedApi;
    window.initMonthlyBuildingReportBuilder = initMonthlyBuildingReportBuilder;
    window.renderMonthlyBuildingReportPreview = renderMonthlyBuildingReportPreview;
    window.setMonthlyReportRegulatoryProfile = setMonthlyReportRegulatoryProfile;
    window.setMonthlyReportPrintMode = setMonthlyReportPrintMode;
    window.printMonthlyBuildingReport = printMonthlyBuildingReport;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportedApi;
  }
})(typeof window !== 'undefined' ? window : globalThis);

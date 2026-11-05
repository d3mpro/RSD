/**
 * ==============================================================================
 * KSUMC Safety Platform - Camera Guided Reticle Overlay & Submode Helper
 * منصة رصد - المدينة الطبية بجامعة الملك سعود
 * Interactive Viewfinder Overlay & Safety Asset Submode Helper
 * ==============================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KSUReticleHelper = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUBMODES = [
    {
      id: 'extinguisher',
      label: 'طفايات حريق',
      icon: '🧯',
      fullLabel: '🧯 طفايات حريق',
      description: 'فحص مقياس الضغط وبطاقة الصيانة وتاريخ الصلاحية'
    },
    {
      id: 'emergency_exit',
      label: 'مخارج وطوارئ',
      icon: '🚪',
      fullLabel: '🚪 مخارج وطوارئ',
      description: 'مسالك الهروب، اللوحات الإرشادية، وخلو الأبواب من العوائق'
    },
    {
      id: 'hazard',
      label: 'مخاطر كهربائية',
      icon: '⚡',
      fullLabel: '⚡ مخاطر كهربائية',
      description: 'اللوحات الكهربائية، الأسلاك المكشوفة، ومصادر الاشتعال'
    },
    {
      id: 'general',
      label: 'فحص عام',
      icon: '🔍',
      fullLabel: '🔍 فحص عام',
      description: 'تدقيق بصري شامل لكافة متطلبات السلامة الميدانية'
    }
  ];

  const GUIDANCE_MAP = {
    extinguisher: 'ضع عداد الضغط داخل الدائرة وبطاقة الصيانة داخل المستطيل',
    emergency_exit: 'حدد إطار الباب ومسار الخروج بالكامل',
    hazard: 'وجّه العدسة نحو اللوحة الكهربائية أو مصدر الخطر',
    general: 'وجّه الكاميرا نحو العنصر المراد فحصه'
  };

  /**
   * Get list of available inspection submodes
   */
  function getSubmodeList() {
    return SUBMODES.map(item => ({ ...item }));
  }

  /**
   * Resolve human-readable Arabic title for a submode
   */
  function resolveSubmodeLabel(submode) {
    if (!submode) return '🔍 فحص عام';
    const s = String(submode).trim().toLowerCase();
    if (s === 'extinguisher') return '🧯 طفايات حريق';
    if (s === 'emergency_exit' || s === 'exit') return '🚪 مخارج وطوارئ';
    if (s === 'hazard') return '⚡ مخاطر كهربائية';
    if (s === 'general') return '🔍 فحص عام';
    return '🔍 فحص عام';
  }

  /**
   * Generate SVG Corner Brackets
   */
  function renderCornerBrackets() {
    return `
      <!-- Corner Brackets -->
      <g class="reticle-corner corner-bracket" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9">
        <!-- Top Left -->
        <path d="M 30 65 L 30 30 L 65 30" />
        <!-- Top Right -->
        <path d="M 335 30 L 370 30 L 370 65" />
        <!-- Bottom Left -->
        <path d="M 30 335 L 30 370 L 65 370" />
        <!-- Bottom Right -->
        <path d="M 335 370 L 370 370 L 370 335" />
      </g>
    `;
  }

  /**
   * Generate Bottom Guidance Pill Badge
   */
  function renderGuidanceBadge(text) {
    return `
      <!-- Guidance Badge -->
      <g class="reticle-hint-badge" transform="translate(0, 346)">
        <rect x="25" y="0" width="350" height="36" rx="18" fill="rgba(2, 6, 23, 0.85)" stroke="#38bdf8" stroke-width="1.2" />
        <circle cx="45" cy="18" r="4" fill="#38bdf8" class="reticle-pulse-glow" />
        <text x="200" y="23" text-anchor="middle" fill="#ffffff" font-family="'Cairo', system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" direction="rtl">
          ${text}
        </text>
      </g>
    `;
  }

  /**
   * Extinguisher Reticle Elements
   */
  function renderExtinguisherElements() {
    return `
      <!-- Fire Extinguisher Viewfinder Targeting -->
      <g class="reticle-extinguisher-group">
        <!-- Pressure Gauge Target Circle -->
        <g class="gauge-target-group">
          <circle cx="200" cy="135" r="46" class="gauge-target-circle reticle-pulse-glow" fill="rgba(56, 189, 248, 0.08)" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="6 3" />
          <circle cx="200" cy="135" r="14" fill="none" stroke="#38bdf8" stroke-width="1.2" opacity="0.6" />
          <circle cx="200" cy="135" r="3" fill="#38bdf8" />
          <!-- Gauge Cross Ticks -->
          <line x1="200" y1="83" x2="200" y2="95" stroke="#38bdf8" stroke-width="1.8" />
          <line x1="200" y1="175" x2="200" y2="187" stroke="#38bdf8" stroke-width="1.8" />
          <line x1="148" y1="135" x2="160" y2="135" stroke="#38bdf8" stroke-width="1.8" />
          <line x1="240" y1="135" x2="252" y2="135" stroke="#38bdf8" stroke-width="1.8" />
          <!-- Gauge Indicator Label -->
          <rect x="155" y="65" width="90" height="18" rx="9" fill="rgba(15, 23, 42, 0.75)" stroke="#38bdf8" stroke-width="0.8" />
          <text x="200" y="78" text-anchor="middle" fill="#38bdf8" font-family="'Cairo', system-ui, sans-serif" font-size="10" font-weight="700">عداد الضغط Gauge</text>
        </g>

        <!-- Maintenance / Inspection Tag Target Rect -->
        <g class="tag-target-group">
          <rect x="125" y="210" width="150" height="95" rx="8" class="tag-target-rect reticle-pulse-glow" fill="rgba(251, 191, 36, 0.08)" stroke="#fbbf24" stroke-width="2.2" stroke-dasharray="6 3" />
          <line x1="145" y1="240" x2="255" y2="240" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
          <line x1="145" y1="260" x2="255" y2="260" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
          <line x1="145" y1="280" x2="230" y2="280" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
          <!-- Tag Indicator Label -->
          <rect x="140" y="198" width="120" height="18" rx="9" fill="rgba(15, 23, 42, 0.75)" stroke="#fbbf24" stroke-width="0.8" />
          <text x="200" y="211" text-anchor="middle" fill="#fbbf24" font-family="'Cairo', system-ui, sans-serif" font-size="10" font-weight="700">بطاقة الفحص والصيانة Tag</text>
        </g>
      </g>
    `;
  }

  /**
   * Emergency Exit Reticle Elements
   */
  function renderEmergencyExitElements() {
    return `
      <!-- Emergency Exit & Egress Viewfinder Targeting -->
      <g class="reticle-exit-group">
        <!-- Doorway Boundary Frame -->
        <rect x="110" y="65" width="180" height="235" rx="6" class="door-target-frame reticle-pulse-glow" fill="rgba(52, 211, 153, 0.06)" stroke="#34d399" stroke-width="2.5" />
        
        <!-- Door Sign / Header Area -->
        <rect x="135" y="45" width="130" height="22" rx="6" fill="rgba(5, 150, 105, 0.85)" stroke="#34d399" stroke-width="1" />
        <text x="200" y="60" text-anchor="middle" fill="#ffffff" font-family="'Cairo', system-ui, sans-serif" font-size="10" font-weight="800">EXIT مخرج طوارئ</text>

        <!-- Door Handle Guide -->
        <circle cx="270" cy="180" r="7" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="3 2" />
        <line x1="265" y1="180" x2="275" y2="180" stroke="#34d399" stroke-width="2" />

        <!-- Ground Egress Path -->
        <path d="M 110 300 L 290 300 L 350 340 L 50 340 Z" class="floor-target-path" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="5 4" />
        <text x="200" y="325" text-anchor="middle" fill="#38bdf8" font-family="'Cairo', system-ui, sans-serif" font-size="10" font-weight="700">مسار الإخلاء الأرضي Egress Zone</text>
      </g>
    `;
  }

  /**
   * Electrical & Fire Hazard Reticle Elements
   */
  function renderHazardElements() {
    return `
      <!-- Hazard & Electrical Panel Viewfinder Targeting -->
      <g class="hazard-target-crosshair hazard-zone-grid reticle-pulse-glow">
        <!-- Hazard Bounding Box / Grid -->
        <rect x="90" y="80" width="220" height="225" rx="10" class="hazard-target-grid" fill="rgba(248, 113, 113, 0.06)" stroke="#f87171" stroke-width="2" stroke-dasharray="8 4" />
        
        <!-- Crosshairs -->
        <line x1="50" y1="192" x2="350" y2="192" stroke="#f87171" stroke-width="1.8" stroke-dasharray="4 4" opacity="0.8" />
        <line x1="200" y1="50" x2="200" y2="335" stroke="#f87171" stroke-width="1.8" stroke-dasharray="4 4" opacity="0.8" />

        <!-- Warning Center Diamond -->
        <polygon points="200,165 227,192 200,219 173,192" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="2" />
        <circle cx="200" cy="192" r="4" fill="#ef4444" />

        <!-- Hazard Header Badge -->
        <rect x="135" y="60" width="130" height="20" rx="10" fill="rgba(185, 28, 28, 0.85)" stroke="#f87171" stroke-width="1" />
        <text x="200" y="74" text-anchor="middle" fill="#ffffff" font-family="'Cairo', system-ui, sans-serif" font-size="10" font-weight="800">⚡ منطقة الخطر / اللوحة</text>
      </g>
    `;
  }

  /**
   * General Inspection Crosshair Reticle Elements
   */
  function renderGeneralElements() {
    return `
      <!-- Balanced View General Inspection Crosshairs -->
      <g class="general-crosshair reticle-crosshair">
        <!-- Center Target Rings -->
        <circle cx="200" cy="185" r="55" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 3" class="reticle-pulse-glow" />
        <circle cx="200" cy="185" r="18" fill="none" stroke="#38bdf8" stroke-width="1.2" opacity="0.7" />
        <circle cx="200" cy="185" r="3.5" fill="#38bdf8" />

        <!-- Crosshair Radial Lines with Center Gap -->
        <line x1="60" y1="185" x2="135" y2="185" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
        <line x1="265" y1="185" x2="340" y2="185" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
        <line x1="200" y1="55" x2="200" y2="120" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
        <line x1="200" y1="250" x2="200" y2="315" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" />
      </g>
    `;
  }

  /**
   * Generates interactive SVG overlay reticle string
   * @param {string} submode - 'extinguisher' | 'emergency_exit' | 'hazard' | 'general'
   * @param {Object} options - Customization options
   * @returns {string} SVG HTML markup
   */
  function getReticleSvg(submode, options = {}) {
    const mode = String(submode || 'general').trim().toLowerCase();
    const width = options.width || '100%';
    const height = options.height || '100%';
    const viewBox = options.viewBox || '0 0 400 400';
    const showGuideText = options.showGuideText !== false;
    const guideText = options.guideText || GUIDANCE_MAP[mode] || GUIDANCE_MAP.general;

    let targetElements = '';
    if (mode === 'extinguisher') {
      targetElements = renderExtinguisherElements();
    } else if (mode === 'emergency_exit' || mode === 'exit') {
      targetElements = renderEmergencyExitElements();
    } else if (mode === 'hazard') {
      targetElements = renderHazardElements();
    } else {
      targetElements = renderGeneralElements();
    }

    const corners = renderCornerBrackets();
    const guidance = showGuideText ? renderGuidanceBadge(guideText) : '';

    return `
<svg class="ksu-reticle-overlay" data-submode="${mode}" viewBox="${viewBox}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="reticle-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  ${corners}
  ${targetElements}
  ${guidance}
</svg>`.trim();
  }

  /**
   * Convenience helper to mount or update SVG into any DOM container
   */
  function renderReticleInto(container, submode, options = {}) {
    if (!container) return;
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = getReticleSvg(submode, options);
  }

  /**
   * Format Fire Extinguisher Specialized Result Card
   * @param {Object} data - Inspection results containing gauge_status, tag details, etc.
   * @returns {string} HTML card markup
   */
  function formatExtinguisherBadge(data) {
    if (!data) return '';
    const status = String(data.gauge_status || 'unknown').toLowerCase();
    let gaugeText = '⚠️ مقياس الضغط غير واضح أو غير ظاهر';
    let gaugeColorClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    let gaugeIndicator = '⚠️';

    if (status === 'green') {
      gaugeText = '🟢 مؤشر الضغط في النطاق الأخضر (سليم)';
      gaugeColorClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      gaugeIndicator = '🟢';
    } else if (status === 'undercharge') {
      gaugeText = '🔴 مؤشر الضغط منخفض (بحاجة لإعادة التعبئة)';
      gaugeColorClass = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      gaugeIndicator = '🔴';
    } else if (status === 'overcharge') {
      gaugeText = '🔴 مؤشر الضغط مرتفع (خطر زيادة الضغط)';
      gaugeColorClass = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      gaugeIndicator = '🔴';
    }

    const tagDetected = Boolean(data.tag_detected);
    const tagValid = Boolean(data.tag_valid);
    const tagDate = data.tag_last_date || 'غير محدد';
    const tagBadge = tagDetected
      ? (tagValid
          ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">🟢 سارية الصلاحية</span>'
          : '<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">🔴 منتهية الصلاحية</span>')
      : '<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">🔴 بطاقة الصيانة غير متوفرة / مفقودة</span>';

    const pinIntact = data.pin_and_seal_intact !== false;
    const pinBadge = pinIntact
      ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">🟢 سليم ومثبت</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">🔴 مفقود أو مكسور</span>';

    const extType = data.extinguisher_type || 'طفاية حريق يدوية معتمدة';

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 text-white border border-slate-700/80 shadow-md space-y-3 font-sans" dir="rtl">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xl">🧯</span>
            <span class="font-bold text-sm text-slate-100">فحص مكونات طفاية الحريق (NFPA 10 / CBAHI FMS.04)</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-cyan-500/30 text-xs font-semibold">${extType}</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <!-- Pressure Gauge -->
          <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1.5">
            <div class="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>مقياس الضغط (Gauge)</span>
              <span>${gaugeIndicator}</span>
            </div>
            <div class="p-2 rounded-lg border text-xs font-bold ${gaugeColorClass} flex items-center gap-1.5">
              <span>${gaugeText}</span>
            </div>
            ${data.gauge_description ? `<div class="text-[11px] text-slate-300 font-medium">${data.gauge_description}</div>` : ''}
          </div>

          <!-- Maintenance Tag -->
          <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1.5">
            <div class="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>بطاقة الصيانة الدورية (Tag)</span>
              ${tagBadge}
            </div>
            <div class="text-slate-200 text-xs font-semibold flex items-center justify-between pt-1">
              <span class="text-slate-400">تاريخ آخر فحص:</span>
              <span class="font-mono font-bold text-amber-300" dir="ltr">${tagDate}</span>
            </div>
            <div class="text-[10px] text-slate-400">
              ${tagDetected ? 'تم رصد وقراءة بيانات بطاقة الفحص الميداني' : 'لم يتم رصد بطاقة الفحص المعتمدة على جسم الطفاية'}
            </div>
          </div>

          <!-- Safety Pin & Seal -->
          <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-1.5">
            <div class="text-[11px] text-slate-400 font-semibold flex items-center justify-between">
              <span>مسمار الأمان والختم البلاستيكي</span>
              ${pinBadge}
            </div>
            <div class="text-xs text-slate-300 font-medium pt-1">
              ${pinIntact ? 'مسمار الأمان وختم التلاعب البلاستيكي سليم وفي موضعه' : 'مسمار الأمان أو ختم التلاعب مفقود أو مكسور (يتطلب إعادة تأهيل فوري)'}
            </div>
          </div>
        </div>
      </div>
    `.trim();
  }

  /**
   * Format Emergency Exit Specialized Result Card
   * @param {Object} data - Inspection results containing door_wedged, exit_obstruction_percent, etc.
   * @returns {string} HTML card markup
   */
  function formatExitBadge(data) {
    if (!data) return '';
    const doorWedged = Boolean(data.door_wedged);
    const obstruction = typeof data.exit_obstruction_percent === 'number'
      ? Math.max(0, Math.min(100, data.exit_obstruction_percent))
      : (data.exit_clear === false ? 25 : 0);

    let obsColor = 'bg-emerald-500';
    let obsBgBadge = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
    let obsStatusLabel = 'مسار الإخلاء خالٍ تماماً (0% إعاقة)';

    if (obstruction > 25) {
      obsColor = 'bg-rose-500';
      obsBgBadge = 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      obsStatusLabel = `إعاقة حرجة لمسار الخروج (${obstruction}%)`;
    } else if (obstruction > 0) {
      obsColor = 'bg-amber-500';
      obsBgBadge = 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      obsStatusLabel = `إعاقة جزئية لمسار الخروج (${obstruction}%)`;
    }

    const exitSignLit = data.exit_sign_illuminated !== false && data.exit_sign_illuminated !== null;
    const exitSignBadge = exitSignLit
      ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">🟢 لوحة المخرج مضاءة وتعمل</span>'
      : '<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[11px] font-bold">🔴 لوحة المخرج غير مضاءة أو معطلة</span>';

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 text-white border border-slate-700/80 shadow-md space-y-3 font-sans" dir="rtl">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xl">🚪</span>
            <span class="font-bold text-sm text-slate-100">فحص مخرج الطوارئ ومسار الإخلاء (NFPA 101 / CBAHI FMS.14)</span>
          </div>
          ${exitSignBadge}
        </div>

        ${doorWedged ? `
          <div class="p-3 rounded-xl bg-rose-950/80 border-2 border-rose-500 text-rose-200 flex items-center gap-3 animate-pulse">
            <span class="text-2xl shrink-0">🚨</span>
            <div>
              <div class="font-black text-xs text-rose-100">🚨 تنبيه حرج: باب الحريق مثبت بوتد أو حاجز أرضي (مخالفة CBAHI FMS.14 / NFPA 80)</div>
              <div class="text-[11px] text-rose-300 mt-0.5">يُحظر تثبيت أبواب الحريق أو منع إغلاقها التلقائي بمصدات أو أوتاد لحماية مسالك الهروب من الدخان واللهب.</div>
            </div>
          </div>
        ` : ''}

        <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2 text-xs">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-slate-300">نسبة إعاقة مسار الإخلاء (Egress Obstruction):</span>
            <span class="px-2 py-0.5 rounded-lg border text-[11px] font-bold ${obsBgBadge}">${obsStatusLabel}</span>
          </div>
          <div class="w-full bg-slate-700/70 rounded-full h-3 overflow-hidden p-0.5">
            <div class="${obsColor} h-2 rounded-full transition-all duration-500" style="width: ${Math.max(4, obstruction)}%"></div>
          </div>
          <div class="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>0% (خالٍ تماماً)</span>
            <span>25% (حد تحذيري)</span>
            <span>100% (إعاقة كاملة)</span>
          </div>
        </div>
      </div>
    `.trim();
  }

  /**
   * Format Electrical & Hazard Specialized Result Card
   * @param {Object} data - Inspection results containing clearance_violation_36in, detected_devices, etc.
   * @returns {string} HTML card markup
   */
  function formatHazardBadge(data) {
    if (!data) return '';
    const clearanceViolation = Boolean(data.clearance_violation_36in);
    const detectedDevices = Array.isArray(data.detected_devices) ? data.detected_devices : [];

    return `
      <div class="p-4 rounded-2xl bg-slate-900/90 text-white border border-slate-700/80 shadow-md space-y-3 font-sans" dir="rtl">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="text-xl">⚡</span>
            <span class="font-bold text-sm text-slate-100">فحص المخاطر الكهربائية ومسافة الخلو (NFPA 70 / CBAHI FMS.07)</span>
          </div>
          <span class="px-2 py-0.5 rounded-full ${clearanceViolation || detectedDevices.length ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'} text-xs font-bold">
            ${clearanceViolation || detectedDevices.length ? '⚠️ توجد مخالفات مرصودة' : '✅ الوضع الكهربائي آمن'}
          </span>
        </div>

        ${clearanceViolation ? `
          <div class="p-3 rounded-xl bg-rose-950/80 border border-rose-500 text-rose-200 flex items-start gap-2.5">
            <span class="text-xl shrink-0">⚠️</span>
            <div class="space-y-0.5 text-xs">
              <div class="font-bold text-rose-100">مخالفة مسافة الخلو أمام اللوحة الكهربائية (36 بوصة / 90 سم)</div>
              <div class="text-[11px] text-rose-300 font-normal">تم رصد تخزين مواد أو عوائق أمام القواطع مما يخالف متطلبات NFPA 70 ومعايير سباهي للوصول السريع والآمن.</div>
            </div>
          </div>
        ` : `
          <div class="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs flex items-center justify-between">
            <span class="text-slate-400">مسافة الخلو أمام اللوحة الكهربائية (36 بوصة / 90 سم):</span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold text-[11px]">مستوفي ومحقق لمسافة خلو آمنة</span>
          </div>
        `}

        ${detectedDevices.length ? `
          <div class="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2 text-xs">
            <span class="font-bold text-amber-300 block text-[11px]">الأجهزة والتوصيلات المرصودة والمحظورة:</span>
            <div class="flex flex-wrap gap-1.5">
              ${detectedDevices.map(dev => `
                <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-bold flex items-center gap-1">
                  <span>⚡</span>
                  <span>${dev}</span>
                </span>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs flex items-center justify-between">
            <span class="text-slate-400">الأجهزة والتوصيلات المحظورة:</span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold text-[11px]">لم يتم رصد أي أجهزة حرارية أو توصيلات عشوائية</span>
          </div>
        `}
      </div>
    `.trim();
  }

  /**
   * Dispatcher for Specialized Asset Result Cards
   * @param {Object} data - Vision inspection data
   * @returns {string} HTML markup for specialized card or empty string
   */
  function formatSpecializedAssetCard(data) {
    if (!data || typeof data !== 'object') return '';
    const mode = String(data.submode || '').trim().toLowerCase();

    if (mode === 'extinguisher' || (!mode && (data.gauge_status || data.tag_last_date))) {
      return formatExtinguisherBadge(data);
    }
    if (mode === 'emergency_exit' || mode === 'exit' || (!mode && (data.door_wedged !== undefined || data.exit_obstruction_percent !== undefined))) {
      return formatExitBadge(data);
    }
    if (mode === 'hazard' || (!mode && data.clearance_violation_36in !== undefined)) {
      return formatHazardBadge(data);
    }
    return '';
  }

  /**
   * Pure state updater for in-round asset-level inspection tracking
   * @param {Object} floorAssetsStatus - Existing floor assets status map
   * @param {string} assetId - Target asset ID
   * @param {Object} inspectionData - Results from vision inspection
   * @returns {Object} Updated copy of floorAssetsStatus preserving all other assets
   */
  function updateAssetInspectionState(floorAssetsStatus, assetId, inspectionData = {}) {
    const existingStatus = (floorAssetsStatus && typeof floorAssetsStatus === 'object') ? { ...floorAssetsStatus } : {};
    if (!assetId) return existingStatus;

    const data = inspectionData || {};
    const passed = !data.hazard_detected && data.compliance_status === 'مطابق';

    const assetRecord = {
      inspected: true,
      passed: Boolean(passed),
      gauge_status: data.gauge_status || 'unknown',
      tag_last_date: data.tag_last_date || '',
      tag_valid: data.tag_valid !== false,
      pin_and_seal_intact: data.pin_and_seal_intact !== false,
      door_wedged: !!data.door_wedged,
      exit_obstruction_percent: typeof data.exit_obstruction_percent === 'number' ? data.exit_obstruction_percent : (Number(data.exit_obstruction_percent) || 0),
      submode: data.submode || 'general',
      summary: data.findings_summary || '',
      timestamp: (typeof data.timestamp === 'number' && data.timestamp > 0) ? data.timestamp : Date.now()
    };

    return {
      ...existingStatus,
      [assetId]: assetRecord
    };
  }

  /**
   * Pure mapping helper from vision analysis output to checklist action plan
   * @param {Object} inspectionData - Results from vision inspection
   * @returns {{ compliantItems: string[], nonCompliantItems: string[], notesText: string }}
   */
  function mapVisionToChecklistFields(inspectionData = {}) {
    const data = inspectionData || {};
    const submode = String(data.submode || '').trim().toLowerCase();

    const compliantItems = [];
    const nonCompliantItems = [];

    // Extinguisher checks
    const hasExtinguisherSignals = submode === 'extinguisher' || data.gauge_status !== undefined || data.tag_valid !== undefined || data.pin_and_seal_intact !== undefined;
    if (hasExtinguisherSignals) {
      // Pressure gauge: compliant if gauge_status === 'green', else non_compliant
      if (data.gauge_status === 'green') {
        compliantItems.push('pressure_gauge');
      } else {
        nonCompliantItems.push('pressure_gauge');
      }

      // Tag: compliant if tag_valid === true, else non_compliant
      if (data.tag_valid === true) {
        compliantItems.push('tag');
      } else {
        nonCompliantItems.push('tag');
      }

      // Pin: compliant if pin_and_seal_intact === true, else non_compliant
      if (data.pin_and_seal_intact === true) {
        compliantItems.push('pin');
      } else {
        nonCompliantItems.push('pin');
      }
    }

    // Emergency Exits checks
    const hasExitSignals = submode === 'emergency_exit' || submode === 'exit' || data.door_wedged !== undefined || data.exit_obstruction_percent !== undefined;
    if (hasExitSignals) {
      // Door wedges: non_compliant if door_wedged === true
      if (data.door_wedged === true) {
        nonCompliantItems.push('door_wedged');
      } else {
        compliantItems.push('door_wedged');
      }

      // Obstruction: non_compliant if exit_obstruction_percent > 0
      const obsPct = typeof data.exit_obstruction_percent === 'number' ? data.exit_obstruction_percent : (Number(data.exit_obstruction_percent) || 0);
      if (obsPct > 0) {
        nonCompliantItems.push('exit_obstruction');
      } else {
        compliantItems.push('exit_obstruction');
      }
    }

    // Hazard checks (if hazard submode or explicit hazard clearance flags)
    const hasHazardSignals = submode === 'hazard' || data.clearance_violation_36in !== undefined;
    if (hasHazardSignals) {
      if (data.clearance_violation_36in === true) {
        nonCompliantItems.push('clearance_36in');
      } else {
        compliantItems.push('clearance_36in');
      }

      if (Array.isArray(data.detected_devices) && data.detected_devices.length > 0) {
        nonCompliantItems.push('prohibited_devices');
      } else {
        compliantItems.push('prohibited_devices');
      }
    }

    // General checks if no other specialized submode matched
    if (!hasExtinguisherSignals && !hasExitSignals && !hasHazardSignals) {
      const isPassing = !data.hazard_detected && data.compliance_status === 'مطابق';
      if (isPassing) {
        compliantItems.push('general_compliance');
      } else {
        nonCompliantItems.push('general_compliance');
      }
    }

    let notesText = data.findings_summary || '';
    if (!notesText) {
      if (nonCompliantItems.length > 0) {
        notesText = `تم رصد ملاحظات عدم مطابقة: ${nonCompliantItems.join(', ')}`;
      } else {
        notesText = 'فحص بصري سليم ومطابق لكافة المتطلبات';
      }
    }

    return {
      compliantItems,
      nonCompliantItems,
      notesText
    };
  }

  /**
   * إعداد وصف تقرير المخالفة المهني المنسق باللغة العربية
   */
  function formatViolationDescription(analysis) {
    const a = analysis || {};
    const parts = [];

    // 1. ملخص المعاينة
    const summary = a.findings_summary || a.detected_element || 'رصد ملاحظة ومخالفة سلامة ميدانية تستوجب التدخل والتصحيح.';
    parts.push(`ملخص المعاينة الميدانية:\n${summary}`);

    // 2. المخالفات المرصودة (منقطة)
    const viols = Array.isArray(a.violations_list)
      ? a.violations_list.filter(Boolean)
      : (a.violations_list ? [a.violations_list] : []);
    if (viols.length > 0) {
      parts.push(`المخالفات والملاحظات المرصودة:\n${viols.map(v => `• ${v}`).join('\n')}`);
    }

    // 3. المرجع الرقابي والنظامي
    const std = a.standard_reference || 'CBAHI / NFPA';
    parts.push(`المرجع النظامي والرقابي:\n${std}`);

    // 4. خطة الإجراءات التصحيحية والوقائية (CAPA)
    const capas = Array.isArray(a.corrective_actions)
      ? a.corrective_actions.filter(Boolean)
      : (a.corrective_actions ? [a.corrective_actions] : []);
    if (capas.length > 0) {
      parts.push(`خطة الإجراءات التصحيحية والوقائية (CAPA):\n${capas.map(c => `• ${c}`).join('\n')}`);
    } else if (a.suggested_directive) {
      parts.push(`خطة الإجراءات التصحيحية والوقائية (CAPA):\n• ${a.suggested_directive}`);
    }

    return parts.join('\n\n');
  }

  /**
   * تحضير بيانات بلاغ المخالفة الفوري من الفحص البصري المستقل
   * Prepare structured violation payload from vision analysis
   */
  function prepareViolationFromVision(analysisData, locationData, imageBase64) {
    const a = analysisData || {};
    const loc = locationData || {};

    const building = loc.building || 'المستشفى';
    const floor = loc.floor || '';
    const room = loc.room || '';
    const title = a.detected_element || 'مخالفة سلامة مرصودة بالذكاء الاصطناعي';
    const risk_level = a.risk_level || 'متوسط';
    const standard_reference = a.standard_reference || 'CBAHI / NFPA';
    const description = formatViolationDescription(a);
    const image = imageBase64 || '';
    const timestamp = Date.now();

    return {
      building,
      floor,
      room,
      title,
      risk_level,
      standard_reference,
      description,
      image,
      timestamp
    };
  }

  /**
   * تحضير بيانات الجولة التفتيشية الجديدة من الفحص البصري المستقل
   * Prepare new inspection round payload from vision analysis
   */
  function prepareNewRoundFromVision(analysisData, locationData) {
    const a = analysisData || {};
    const loc = locationData || {};

    const rawSubmode = (a.submode || loc.submode || '').toString().trim().toLowerCase();
    let checklistType = 'all';

    if (rawSubmode === 'extinguisher') {
      checklistType = 'fex';
    } else if (rawSubmode === 'emergency_exit' || rawSubmode === 'exit') {
      checklistType = 'ext';
    } else if (rawSubmode === 'hazard') {
      checklistType = 'all';
    } else if (rawSubmode === 'general') {
      checklistType = 'all';
    } else {
      checklistType = 'all';
    }

    const notes = a.findings_summary || a.detected_element || '';

    return {
      building: loc.building || '',
      floor: loc.floor || '',
      checklistType,
      notes,
      timestamp: Date.now()
    };
  }

  return {
    getReticleSvg,
    getSubmodeList,
    resolveSubmodeLabel,
    renderReticleInto,
    formatExtinguisherBadge,
    formatExitBadge,
    formatHazardBadge,
    formatSpecializedAssetCard,
    updateAssetInspectionState,
    mapVisionToChecklistFields,
    prepareViolationFromVision,
    prepareNewRoundFromVision,
    GUIDANCE_MAP
  };
});

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

  return {
    getReticleSvg,
    getSubmodeList,
    resolveSubmodeLabel,
    renderReticleInto,
    GUIDANCE_MAP
  };
});

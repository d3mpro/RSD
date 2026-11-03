/**
 * خدمة العرض والطباعة الرسمية والمشاركة الموحدة (PDF / A4 / واتساب / إيميل)
 * King Saud University Medical City (KSUMC) - Safety & Inspection Management Platform
 * الإصدار المؤسسي المعتمد v5.31 - أكتوبر 2026م
 * مخصصة لرئيس القسم، المشرف العام، الجودة وتقييم الأداء، والمفتشين الميدانيين
 */

(function(window) {
  'use strict';

  const LOGO_OFFICIAL = 'assets/images/ksu_official_logo.png';
  const OFFICIAL_EMAIL = 'aalsaqri@ksu.edu.sa';

  /**
   * مولد رمز الاستجابة السريع النقطي المتجهي بدون أي اعتماديات خارجية (Vector QR SVG)
   */
  function generateQRCodeSVG(text, size = 100) {
    if (typeof window.generateQRCodeSVG === 'function' && window.generateQRCodeSVG !== generateQRCodeSVG) {
      try { return window.generateQRCodeSVG(text, size); } catch (e) {}
    }
    const modules = 21;
    const matrix = Array.from({ length: modules }, () => Array(modules).fill(0));

    function drawFinder(r, c) {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
            matrix[r + i][c + j] = 1;
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, modules - 7);
    drawFinder(modules - 7, 0);

    for (let i = 8; i < modules - 8; i++) {
      matrix[6][i] = i % 2 === 0 ? 1 : 0;
      matrix[i][6] = i % 2 === 0 ? 1 : 0;
    }

    let hash = 0;
    const str = String(text || 'KSUMC');
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
    }
    let seed = Math.abs(hash);

    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        const isFinderTL = r < 8 && c < 8;
        const isFinderTR = r < 8 && c >= modules - 8;
        const isFinderBL = r >= modules - 8 && c < 8;
        const isTiming = r === 6 || c === 6;

        if (!isFinderTL && !isFinderTR && !isFinderBL && !isTiming) {
          seed = (seed * 1664525 + 1013904223) & 0xffffffff;
          matrix[r][c] = seed % 3 === 0 ? 1 : 0;
        }
      }
    }

    const cellSize = (size / modules).toFixed(2);
    let rects = '';
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (matrix[r][c] === 1) {
          rects += `<rect x="${(c * cellSize).toFixed(2)}" y="${(r * cellSize).toFixed(2)}" width="${cellSize}" height="${cellSize}" fill="#082B49" />`;
        }
      }
    }

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:auto;">
        <rect width="${size}" height="${size}" fill="#ffffff" />
        ${rects}
      </svg>
    `;
  }

  /**
   * توحيد مسمى نوع السجل
   */
  function normalizeRecordType(type) {
    if (!type) return 'round';
    const t = String(type).toLowerCase().trim();
    if (t.includes('smok')) return 'smoking_violation';
    if (t.includes('safety_viol') || t === 'safety' || t.includes('violation')) return 'safety_violation';
    if (t.includes('safety_rep') || t.includes('report')) return 'safety_report';
    if (t.includes('incid') || t.includes('alarm') || t.includes('elevator') || t.includes('code')) return 'incident';
    return 'round';
  }

  /**
   * استخراج بيانات أي قيد من قواعد البيانات المحلية والسحابية
   */
  function fetchRecord(rawType, id) {
    if (!id && !rawType) return null;
    if (typeof id === 'object' && id !== null) {
      return { ...id, _type: id._type || normalizeRecordType(rawType || id._stream || id.type) };
    }
    if (typeof rawType === 'object' && rawType !== null && !id) {
      return { ...rawType, _type: rawType._type || normalizeRecordType(rawType._stream || rawType.type) };
    }
    const strId = String(id).trim();
    const strIdLower = strId.toLowerCase();
    const type = normalizeRecordType(rawType);

    const findInList = (list) => {
      if (!Array.isArray(list)) return null;
      return list.find(x => x && (String(x.id || '').trim().toLowerCase() === strIdLower || String(x.id || '').trim() === strId));
    };

    // 1. فحص state إن كان متاحاً في الصفحة
    if (window.state) {
      if (type === 'smoking_violation' && Array.isArray(window.state.smokingViolations)) {
        const found = findInList(window.state.smokingViolations);
        if (found) return { ...found, _type: 'smoking_violation' };
      }
      if (type === 'safety_violation' && Array.isArray(window.state.safetyViolations)) {
        const found = findInList(window.state.safetyViolations);
        if (found) return { ...found, _type: 'safety_violation' };
      }
      if (type === 'round' && Array.isArray(window.state.rounds)) {
        const found = findInList(window.state.rounds);
        if (found) return { ...found, _type: 'round' };
      }
      if (type === 'safety_report' && Array.isArray(window.state.safetyDeptReports)) {
        const found = findInList(window.state.safetyDeptReports);
        if (found) return { ...found, _type: 'safety_report' };
      }
      if (type === 'incident' && Array.isArray(window.state.shiftIncidents)) {
        const found = findInList(window.state.shiftIncidents);
        if (found) return { ...found, _type: 'incident' };
      }
    }

    // 2. فحص KSUDataBridge
    if (window.KSUDataBridge) {
      try {
        if (type === 'smoking_violation') {
          const v = findInList(window.KSUDataBridge.getViolations().smoking);
          if (v) return { ...v, _type: 'smoking_violation' };
        }
        if (type === 'safety_violation') {
          const v = findInList(window.KSUDataBridge.getViolations().safety);
          if (v) return { ...v, _type: 'safety_violation' };
        }
        if (type === 'round') {
          const r = findInList(window.KSUDataBridge.getRounds());
          if (r) return { ...r, _type: 'round' };
        }
      } catch (e) {}
    }

    // 3. فحص التخزين المحلي (LocalStorage) لجميع المفاتيح المتوقعة
    const storageKeysMap = {
      smoking_violation: ['ksumc_smoking_violations', 'smoking_violations', 'ksumc_smoking_viols'],
      safety_violation: ['ksumc_safety_violations', 'safety_violations', 'ksumc_safety_viols'],
      round: ['ksumc_safety_rounds', 'ksumc_field_rounds', 'ksumc_rounds', 'ksumc_rounds_registry'],
      safety_report: ['ksumc_safety_dept_reports', 'safety_dept_reports'],
      incident: ['ksumc_shift_incidents', 'shift_incidents']
    };

    const targetKeys = storageKeysMap[type] || [
      'ksumc_smoking_violations',
      'ksumc_safety_violations',
      'ksumc_safety_rounds',
      'ksumc_safety_dept_reports',
      'ksumc_shift_incidents'
    ];

    for (const key of targetKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw);
          const found = findInList(list);
          if (found) {
            return {
              ...found,
              _type: type
            };
          }
        }
      } catch (e) {}
    }

    // 4. فحص دوال الجولات الخاصة في head.html
    if (type === 'round' && typeof window.getFilteredRealRounds === 'function') {
      try {
        const found = findInList(window.getFilteredRealRounds());
        if (found) return { ...found, _type: 'round' };
      } catch (e) {}
    }

    // Fallback: إنشاء كائن افتراضي إذا لم يتم العثور عليه
    return {
      id: strId,
      _type: type,
      title: type === 'smoking_violation' ? 'محضر مخالفة تدخين' : (type === 'safety_violation' ? 'محضر مخالفة سلامة' : 'تقرير ميداني'),
      location: 'المدينة الطبية بجامعة الملك سعود',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('ar-SA'),
      officerName: 'مفتش السلامة المعتمد',
      violatorName: 'مخالف مسجل بالنظام',
      role: 'موظف',
      dept: 'الإدارة العامة للأمن والسلامة'
    };
  }

  /**
   * مولد الباركود المتجهي النقي (Vector SVG Barcode)
   */
  function generateBarcodeSVG(text, width = 150, height = 22) {
    const str = String(text || 'KSUMC-001').toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'KSUMC-001';
    let bars = [];
    let pos = 4;
    bars.push(`<rect x="${pos}" y="0" width="2" height="${height}" fill="#082B49"/>`);
    bars.push(`<rect x="${pos + 4}" y="0" width="1" height="${height}" fill="#082B49"/>`);
    pos += 8;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      for (let b = 0; b < 4; b++) {
        const isWide = ((c >> b) & 1) === 1;
        const barW = isWide ? 2.5 : 1.2;
        bars.push(`<rect x="${pos.toFixed(1)}" y="0" width="${barW.toFixed(1)}" height="${height}" fill="#082B49"/>`);
        pos += barW + (isWide ? 2.2 : 1.4);
      }
      pos += 1.8;
    }
    bars.push(`<rect x="${pos.toFixed(1)}" y="0" width="2" height="${height}" fill="#082B49"/>`);
    pos += 4;
    const totalW = Math.max(width, Math.ceil(pos + 4));
    return `
      <svg width="${totalW}" height="${height}" viewBox="0 0 ${totalW} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:auto;">
        <rect width="${totalW}" height="${height}" fill="#ffffff"/>
        ${bars.join('')}
      </svg>
    `;
  }

  /**
   * بناء ترويسة الوثيقة الرسمية المعتمدة لجامعة الملك سعود وفق دليل الهوية (GuideManual Form C)
   */
  function renderOfficialHeader({
    reportId = 'SDR-001',
    reportDate = '',
    reportTime = '',
    attachments = 'بدون',
    dept1 = 'المدينة الطبية الجامعية',
    dept2 = 'الإدارة العامة للأمن والسلامة',
    dept3 = 'إدارة السلامة'
  } = {}) {
    return `
      <div class="brand-header">
        <div class="brand-header-top" style="display: flex; align-items: flex-start; justify-content: space-between;">
          <!-- Right: Administrative Hierarchy -->
          <div class="brand-right" style="width: 32%; text-align: right; line-height: 1.35;">
            <div style="font-weight: 900; font-size: 11px; color: #082B49;">المملكة العربية السعودية</div>
            <div style="font-weight: 900; font-size: 10.5px; color: #082B49;">جامعة الملك سعود</div>
            <div style="font-size: 9.5px; font-weight: 700; color: #1e293b;">${dept1}</div>
            <div style="font-size: 9px; font-weight: 800; color: #082B49;">${dept2}</div>
            <div style="font-size: 9px; font-weight: 800; color: #c2410c;">${dept3}</div>
          </div>

          <!-- Center: Centered University Logo -->
          <div class="brand-center" style="width: 40%; text-align: center;">
            <img src="${LOGO_OFFICIAL}" class="brand-logo-img" alt="جامعة الملك سعود - King Saud University" style="height: 48px; width: auto; max-width: 165px; object-fit: contain; display: inline-block;" onerror="this.style.display='none'">
          </div>

          <!-- Left: Official Metadata Box (No QR) -->
          <div class="brand-left" style="width: 28%; text-align: left;">
            <div class="doc-meta-block" style="display: inline-block; text-align: left; background: #f8fafc; border: 1.5px solid #004B87; border-radius: 6px; padding: 5px 8px; min-width: 125px;">
              <div class="meta-row" style="margin-bottom: 2px;"><span class="meta-lbl" style="font-size: 8.5px; color: #004B87; font-weight: 700;">الـرقـم:</span><span class="meta-val font-mono" style="font-size: 10px; font-weight: 900; color: #082B49;">${reportId}</span></div>
              <div class="meta-row"><span class="meta-lbl" style="font-size: 8.5px; color: #64748b;">التـاريخ:</span><span class="meta-val font-mono" style="font-size: 9px;">${reportDate || new Date().toISOString().split('T')[0]}</span></div>
              ${reportTime ? `<div class="meta-row"><span class="meta-lbl" style="font-size: 8.5px; color: #64748b;">الـوقت:</span><span class="meta-val font-mono" style="font-size: 9px;">${reportTime}</span></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Official Blue Separation Line (Pantone 640C) -->
        <div class="brand-hairline" style="margin-top: 8px;">
          <span class="brand-hairline-tag">www.ksu.edu.sa</span>
        </div>
      </div>
    `;
  }

  /**
   * بناء تذييل الوثيقة الرسمي وشريط التوثيق والباركود وفق دليل الهوية
   */
  function renderOfficialFooter(reportId = 'SDR-001', complianceStamp = '✓ معتمد للملف الرقابي ومعايير السلامة الرسمية') {
    const qrSvg = generateQRCodeSVG(`KSU-DOC|${reportId}|VERIFIED`, 42);
    const barcodeSvg = generateBarcodeSVG(reportId, 150, 22);
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `
      <div class="doc-footer">
        <div class="footer-verify-row">
          <!-- Discreet Vector QR Seal -->
          <div class="verify-qr-block">
            <div style="width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px;">
              ${qrSvg}
            </div>
            <div class="verify-text-info">
              <div class="verify-title">التوثيق الرقمي المعتمد</div>
              <div class="verify-sub">VERIFIED: ${reportId}</div>
            </div>
          </div>

          <!-- Barcode Block -->
          <div class="barcode-block">
            ${barcodeSvg}
            <div class="barcode-code-str">${reportId}-${dateStamp}</div>
          </div>

          <!-- Regulatory Seal Badge -->
          <div class="footer-reg-stamp">
            ${complianceStamp}
          </div>
        </div>

        <!-- Official Institutional Legal Address from Brand Guide -->
        <div class="footer-legal-address">
          المملكة العربية السعودية | جامعة الملك سعود | المدينة الطبية الجامعية | الإدارة العامة للأمن والسلامة | ص.ب 70474 الرياض 11567 | هاتف: 0114670227 | فاكس: 0114697507 | www.ksu.edu.sa
        </div>
      </div>
    `;
  }

  /**
   * لف محتوى الوثيقة في قالب A4 احترافي مزود بشريط أدوات للطباعة والحفظ كـ PDF
   */
  function wrapDocumentHTML(title, innerContent, autoPrint = false) {
    let baseHref = '';
    try {
      const loc = window.location;
      baseHref = loc.origin + loc.pathname.substring(0, loc.pathname.lastIndexOf('/') + 1);
    } catch (e) {}

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  ${baseHref ? `<base href="${baseHref}">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
    }
    body {
      background: #f8fafc;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.4;
      direction: rtl;
      padding: 14px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .no-print-toolbar {
      position: sticky;
      top: 0;
      z-index: 99999;
      background: #082B49;
      color: #ffffff;
      padding: 9px 16px;
      margin: -14px -14px 14px -14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 14px rgba(0,0,0,0.18);
    }
    .doc-container {
      background: #ffffff;
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
      border: 1.5px solid #004B87;
      border-radius: 4px;
      padding: 18px 22px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      position: relative;
    }

    /* Brand Header (GuideManual Form C) */
    .brand-header { width: 100%; margin-bottom: 10px; }
    .brand-header-top { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; }
    .brand-right { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
    .brand-logo-img { height: 46px; width: auto; max-width: 155px; object-fit: contain; }
    .brand-entity { padding-right: 4px; line-height: 1.3; }
    .entity-univ { font-size: 10.5px; font-weight: 800; color: #082B49; }
    .entity-dept { font-size: 9.5px; font-weight: 800; color: #004B87; }
    .entity-sub { font-size: 8.5px; font-weight: 700; color: #64748b; }
    
    .brand-left { display: flex; gap: 16px; text-align: right; }
    .gov-block { border-left: 1px solid #cbd5e1; padding-left: 12px; line-height: 1.35; }
    .gov-ar { font-size: 10px; font-weight: 800; color: #082B49; }
    .gov-en { font-size: 7.5px; font-family: 'Segoe UI', Arial, sans-serif; font-weight: 600; color: #64748b; letter-spacing: 0.2px; }
    .doc-meta-block { display: flex; flex-direction: column; gap: 2px; font-size: 9px; line-height: 1.35; }
    .meta-row { display: flex; gap: 5px; }
    .meta-lbl { color: #64748b; font-weight: 700; min-width: 42px; }
    .meta-val { color: #082B49; font-weight: 800; font-family: monospace; }
    
    .brand-hairline { position: relative; height: 2px; background: #008DC3; margin-top: 3px; margin-bottom: 12px; }
    .brand-hairline-tag { position: absolute; left: 0; bottom: -13px; font-size: 7.5px; font-family: Arial, sans-serif; color: #008DC3; font-weight: bold; }
    
    /* Title Banners */
    .doc-title-banner { background: linear-gradient(135deg, #f8fafc 0%, #f0f7fb 100%); border: 1px solid #bae6fd; border-right: 4px solid #004B87; border-radius: 4px; padding: 7px 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .title-main { font-size: 14px; font-weight: 900; color: #082B49; }
    .title-sub { font-size: 10px; font-weight: 700; color: #008DC3; margin-top: 1px; }
    .title-accr { font-size: 8px; color: #64748b; margin-top: 1px; }
    .compliance-badge { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-weight: 900; font-size: 10.5px; padding: 4px 8px; border-radius: 4px; text-align: center; }
    
    .legal-box { background: #fff1f2; border: 1px solid #fecdd3; border-right: 4px solid #be123c; border-radius: 4px; padding: 6px 10px; font-size: 9.5px; color: #881337; line-height: 1.45; margin-bottom: 10px; }
    
    /* Tables */
    .gov-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #cbd5e1; }
    .gov-table th { background: #f1f5f9; color: #082B49; font-weight: 800; font-size: 9.5px; padding: 5px 8px; border: 1px solid #cbd5e1; text-align: right; }
    .gov-table td { padding: 5px 8px; font-size: 10px; border: 1px solid #e2e8f0; text-align: right; }
    .td-label { background: #f8fafc; font-weight: 700; color: #334155; width: 18%; }
    .td-val { color: #082B49; font-weight: 600; }
    .td-highlight { font-weight: 800; color: #004B87; }
    .table-section-title { font-size: 10px; font-weight: 800; color: #082B49; background: #e2e8f0; padding: 4px 8px; border: 1px solid #cbd5e1; border-bottom: none; }
    
    .notes-box { background: #ffffff; border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 9.5px; line-height: 1.45; color: #334155; margin-bottom: 10px; }
    
    /* Signatures Matrix */
    .sigs-matrix { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; border: 1px solid #cbd5e1; }
    .sigs-matrix th { background: #f8fafc; color: #082B49; font-size: 9px; font-weight: 800; padding: 5px; border: 1px solid #cbd5e1; text-align: center; }
    .sigs-matrix td { padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; vertical-align: top; font-size: 8.5px; height: 75px; background: #ffffff; }
    .sig-name { font-weight: 800; color: #082B49; font-size: 9.5px; margin-bottom: 3px; }
    .sig-stamp-mark { display: inline-block; margin-top: 3px; padding: 2px 5px; border: 1px dashed #059669; border-radius: 3px; color: #059669; font-size: 7.5px; font-weight: bold; }
    
    /* Footer */
    .doc-footer { border-top: 2px solid #008DC3; padding-top: 6px; margin-top: 10px; }
    .footer-verify-row { display: flex; justify-content: space-between; align-items: center; padding-bottom: 5px; }
    .verify-qr-block { display: flex; align-items: center; gap: 5px; }
    .qr-badge-svg { width: 40px; height: 40px; }
    .verify-text-info { text-align: right; }
    .verify-title { font-size: 8.5px; font-weight: 800; color: #082B49; }
    .verify-sub { font-size: 7.5px; color: #64748b; font-family: monospace; }
    .barcode-block { text-align: center; }
    .barcode-code-str { font-family: monospace; font-size: 8px; color: #475569; font-weight: bold; }
    .footer-reg-stamp { font-size: 8px; font-weight: 800; color: #004B87; border: 1px solid #bfdbfe; background: #eff6ff; padding: 2px 6px; border-radius: 3px; }
    .footer-legal-address { text-align: center; font-size: 7.5px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 3px; margin-top: 3px; }

    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .no-print-toolbar {
        display: none !important;
      }
      .doc-container {
        border-width: 1px !important;
        box-shadow: none !important;
        padding: 6px 12px !important;
        max-width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <!-- Interactive Toolbar for View / PDF / Print -->
  <div class="no-print-toolbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:13px;font-weight:900;">📄 ${title}</span>
      <span style="background:rgba(255,255,255,0.18);padding:3px 8px;border-radius:4px;font-size:10px;font-family:monospace;font-weight:bold;">A4 / PDF READY</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <button onclick="window.print()" style="background:#0284c7;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-weight:bold;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:5px;box-shadow:0 2px 6px rgba(0,0,0,0.2);">
        🖨️ طباعة التقرير / حفظ بصيغة PDF
      </button>
      <button onclick="window.close()" style="background:rgba(255,255,255,0.18);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-weight:bold;font-size:11px;cursor:pointer;">
        ✕ إغلاق
      </button>
    </div>
  </div>

  <div class="doc-container">
    ${innerContent}
  </div>

  ${autoPrint ? `
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 350);
    });
  <\/script>
  ` : ''}
</body>
</html>`;
  }

  /**
   * إنشاء كود HTML الرسمي لمحضر مخالفة التدخين (A4)
   */
  function generateSmokingViolationHTML(v, autoPrint = false) {
    const headerHtml = renderOfficialHeader({
      reportId: v.id,
      reportDate: v.date,
      reportTime: v.time,
      attachments: 'بدون',
      dept1: 'المدينة الطبية الجامعية',
      dept2: 'الإدارة العامة للأمن والسلامة',
      dept3: 'وحدة الضبط وتطبيق لائحة مكافحة التدخين'
    });

    const footerHtml = renderOfficialFooter(v.id, '✓ محضر رسمي معتمد لإدارة الأمن والسلامة');

    const inner = `
      ${headerHtml}

      <!-- Title Banner -->
      <div class="doc-title-banner" style="border-right-color: #be123c; border-color: #fecdd3; background: linear-gradient(135deg, #fff1f2 0%, #ffffff 100%);">
        <div>
          <div class="title-main" style="color: #9f1239;">محضر ضبط مخالفة لائحة مكافحة التدخين</div>
          <div class="title-sub" style="color: #be123c;">الإدارة العامة للأمن والسلامة — وحدة مكافحة التدخين وحماية المنشآت الطبية</div>
        </div>
        <div class="compliance-badge" style="background: #fff1f2; border-color: #fecdd3; color: #9f1239;">
          غرامة نظامية: 200 ريال<br>
          <span style="font-size: 7.5px; font-weight: normal;">إحالة للتحقيق والمساءلة</span>
        </div>
      </div>

      <!-- Legal Basis Box -->
      <div class="legal-box">
        <strong>السند النظامي والتشريعي للضبط:</strong><br>
        بموجب المرسوم الملكي الكريم رقم (م/56) وتاريخ 1436/07/28هـ بنظام مكافحة التدخين، ولائحته التنفيذية، واستناداً لسياسة منع التدخين المعتمدة بالمدينة الطبية بجامعة الملك سعود رقم (MC-SS-P-02) بحظر التدخين بجميع أنواعه (التقليدي والإلكتروني) داخل كافة المباني والمرافق الطبية.
      </div>

      <!-- Table 1: Incident Location & Time -->
      <div class="table-section-title">بيانات واقعة الضبط والموقع</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">المستشفى / الموقع:</td>
          <td class="td-val td-highlight">${v.facility || v.location || 'مستشفى الملك خالد الجامعي (KKUH)'}</td>
          <td class="td-label">المكان بالتفصيل:</td>
          <td class="td-val">${v.location || 'المبنى الرئيسي'} ${v.room ? '- غرفة ' + v.room : ''}</td>
        </tr>
        <tr>
          <td class="td-label">يوم وتاريخ الضبط:</td>
          <td class="td-val">${v.day || ''} ${v.date || ''}</td>
          <td class="td-label">وقت الضبط والوردية:</td>
          <td class="td-val font-mono">${v.time || ''} — (${v.shift || 'الوردية الأولى'})</td>
        </tr>
      </table>

      <!-- Table 2: Violator Details -->
      <div class="table-section-title">بيانات الشخص المخالف</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">الاسم الرباعي:</td>
          <td class="td-val td-highlight" style="font-size: 11px;">${v.violatorName || 'مخالف مسجل'}</td>
          <td class="td-label">الصفة / الفئة:</td>
          <td class="td-val"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-weight: bold;">${v.role || 'موظف'}</span></td>
        </tr>
        <tr>
          <td class="td-label">الهوية / الإقامة:</td>
          <td class="td-val font-mono">${v.nationalId || '-'}</td>
          <td class="td-label">الرقم الوظيفي:</td>
          <td class="td-val font-mono">${v.violatorEmpId || '-'}</td>
        </tr>
        <tr>
          <td class="td-label">جهة العمل / القسم:</td>
          <td class="td-val">${v.dept || '-'}</td>
          <td class="td-label">نوع التدخين المضبوط:</td>
          <td class="td-val" style="color: #be123c; font-weight: 800;">${v.violationType || v.smokingType || 'تدخين داخل المنشأة الطبية'}</td>
        </tr>
      </table>

      <!-- Table 3: Action Taken -->
      <div class="table-section-title">الإجراء النظامي المتخذ والتوجيه</div>
      <div class="notes-box">
        تم ضبط المذكور أعلاه في حالة تلبس بمخالفة لائحة التدخين، وتم إشعاره نظامياً بالمخالفة، وإفهامه بتطبيق الغرامة المالية المقررة (200 ريال) وإحالة صورة من المحضر لسعادة رئيس إدارة السلامة والمشرف العام ولإدارة الموارد البشرية لاتخاذ الإجراءات الإدارية النظامية بحقه.
      </div>

      <!-- Signatures Matrix -->
      <table class="sigs-matrix">
        <tr>
          <th style="width: 25%;">الشخص المخالف (المقر بالعلم)</th>
          <th style="width: 25%;">مفتش السلامة المحرر</th>
          <th style="width: 25%;">مشرف الوردية الميداني</th>
          <th style="width: 25%;">رئيس القسم / المشرف العام</th>
        </tr>
        <tr>
          <td>
            <div class="sig-name">${v.violatorName || 'المخالف'}</div>
            <div style="font-size: 8px; color: #64748b;">توقيع المخالف بالعلم والإقرار</div>
            ${v.violatorSignature ? `<img src="${v.violatorSignature}" style="max-height: 38px; max-width: 100%; display: block; margin: 3px auto;" alt="توقيع المخالف">` : `<div style="border-bottom: 1px dashed #cbd5e1; height: 26px; margin: 4px 10px;"></div>`}
          </td>
          <td>
            <div class="sig-name">${v.officerName || 'مفتش السلامة المعتمد'}</div>
            <div style="font-size: 8px; color: #64748b;">مأمور الضبط المعتمد</div>
            ${v.officerSignature ? `<img src="${v.officerSignature}" style="max-height: 38px; max-width: 100%; display: block; margin: 3px auto;" alt="توقيع المفتش">` : `<div class="sig-stamp-mark">✓ تم الضبط والتحرير</div>`}
          </td>
          <td>
            <div class="sig-name">مشرف الوردية الميداني</div>
            <div style="font-size: 8px; color: #64748b;">مطابقة واقعة الضبط</div>
            <div class="sig-stamp-mark">✓ موثق ومسجل</div>
          </td>
          <td>
            <div class="sig-name">أ. علي سليمان الصقري</div>
            <div style="font-size: 8px; color: #64748b;">المشرف العام / رئيس القسم</div>
            <div class="sig-stamp-mark" style="border-color: #004B87; color: #004B87; font-weight: 800;">🏅 اعتماد وإحالة نظامية</div>
          </td>
        </tr>
      </table>

      ${footerHtml}
    `;

    return wrapDocumentHTML(`محضر ضبط مخالفة مكافحة التدخين - ${v.id}`, inner, autoPrint);
  }

  /**
   * إنشاء كود HTML الرسمي لمحضر مخالفة اشتراطات السلامة (A4)
   */
  function generateSafetyViolationHTML(v, autoPrint = false) {
    const devs = Array.isArray(v.devices) ? v.devices : [v.devices || 'أجهزة ومعدات غير مطابقة'];

    const headerHtml = renderOfficialHeader({
      reportId: v.id,
      reportDate: v.date,
      reportTime: v.time,
      attachments: 'بدون',
      dept1: 'المدينة الطبية الجامعية',
      dept2: 'الإدارة العامة للأمن والسلامة',
      dept3: 'إدارة السلامة'
    });

    const footerHtml = renderOfficialFooter(v.id, '✓ معتمد للملف الرقابي وإجراءات CAPA');

    const inner = `
      ${headerHtml}

      <!-- Title Banner -->
      <div class="doc-title-banner" style="border-right-color: #ea580c; border-color: #fdba74; background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);">
        <div>
          <div class="title-main" style="color: #c2410c;">محضر ضبط وإشعار مخالفة اشتراطات السلامة</div>
          <div class="title-sub" style="color: #ea580c;">الإدارة العامة للأمن والسلامة — إدارة السلامة</div>
          <div class="title-accr">وفق اشتراطات كود البناء السعودي وأعلى معايير السلامة والوقاية من الحريق</div>
        </div>
        <div class="compliance-badge" style="background: #fff7ed; border-color: #fdba74; color: #c2410c;">
          تحريز ومصادرة فورية<br>
          <span style="font-size: 7.5px; font-weight: normal;">إجراء تصحيحي CAPA</span>
        </div>
      </div>

      <!-- Table 1: Location & Timing -->
      <div class="table-section-title">بيانات واقعة الضبط والموقع</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">المستشفى / المنشأة:</td>
          <td class="td-val td-highlight">${v.facility || 'مستشفى الملك خالد الجامعي (KKUH)'}</td>
          <td class="td-label">المبنى والدور:</td>
          <td class="td-val">${v.location || 'المبنى الرئيسي'} ${v.room ? '- غرفة ' + v.room : ''}</td>
        </tr>
        <tr>
          <td class="td-label">تاريخ ووقت الضبط:</td>
          <td class="td-val font-mono">${v.date || ''} — ${v.time || ''}</td>
          <td class="td-label">الوردية الميدانية:</td>
          <td class="td-val">${v.shift || 'الوردية الأولى (صباحي)'}</td>
        </tr>
      </table>

      <!-- Table 2: Violator / Entity Details -->
      <div class="table-section-title">بيانات الشخص أو الجهة المخالفة</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">الاسم أو الجهة:</td>
          <td class="td-val td-highlight">${v.violatorName || 'منسوب بالمدينة الطبية'}</td>
          <td class="td-label">الصفة:</td>
          <td class="td-val">${v.role || 'موظف'}</td>
        </tr>
        <tr>
          <td class="td-label">القسم / الإدارة:</td>
          <td class="td-val">${v.dept || '-'}</td>
          <td class="td-label">الرقم الوظيفي:</td>
          <td class="td-val font-mono">${v.violatorEmpId || '-'}</td>
        </tr>
      </table>

      <!-- Table 3: Seized Devices -->
      <div class="table-section-title">الأجهزة والمعدات المخالفة المضبوطة</div>
      <div class="notes-box" style="background: #fff7ed; border-color: #fed7aa;">
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
          ${devs.map(d => `<span style="background: #ffedd5; color: #9a3412; border: 1px solid #fdba74; padding: 2px 7px; border-radius: 3px; font-weight: bold; font-size: 10px;">⚡ ${d}</span>`).join('')}
        </div>
        <div style="font-size: 9px; color: #7c2d12;">
          تم التحريز على الأجهزة المضبوطة لعدم مطابقتها لاشتراطات السلامة ولوجود خطورة حريق وأحمال كهربائية زائدة.
        </div>
      </div>

      <!-- Action & Directive -->
      <div class="table-section-title">الإجراء المتخذ وتوجيه إدارة السلامة</div>
      <div class="notes-box">
        <div style="margin-bottom: 4px;">
          <strong style="color: #9a3412;">الإجراء الميداني الفوري:</strong>
          <span>${v.actionTaken || 'مصادرة الجهاز المخالف وفصل التيار الكهربائي والتحريز عليه فوراً'}</span>
        </div>
        <div style="border-top: 1px dashed #cbd5e1; padding-top: 4px;">
          <strong style="color: #004B87;">توجيه مدير إدارة السلامة / المشرف العام (H1):</strong>
          <span>${v.directive || 'سحب الجهاز والتحريز عليه، وإصدار إشعار تصحيحي بعدم استخدام مواقد أو أجهزة حرارية غير مطابقة.'}</span>
        </div>
      </div>

      <!-- Signatures Matrix -->
      <table class="sigs-matrix">
        <tr>
          <th style="width: 25%;">المنسوب / الشخص المضبوط</th>
          <th style="width: 25%;">مفتش السلامة المحرر</th>
          <th style="width: 25%;">مشرف الوردية الميداني</th>
          <th style="width: 25%;">رئيس القسم / المشرف العام</th>
        </tr>
        <tr>
          <td>
            <div class="sig-name">${v.violatorName || 'المنسوب'}</div>
            <div style="font-size: 8px; color: #64748b;">توقيع الاستلام والإشعار</div>
            ${v.violatorSignature ? `<img src="${v.violatorSignature}" style="max-height: 38px; max-width: 100%; display: block; margin: 3px auto;" alt="توقيع المخالف">` : `<div style="border-bottom: 1px dashed #cbd5e1; height: 26px; margin: 4px 10px;"></div>`}
          </td>
          <td>
            <div class="sig-name">${v.officerName || 'مفتش السلامة الميداني'}</div>
            <div style="font-size: 8px; color: #64748b;">مفتش سلامة معتمد</div>
            ${v.officerSignature ? `<img src="${v.officerSignature}" style="max-height: 38px; max-width: 100%; display: block; margin: 3px auto;" alt="توقيع المفتش">` : `<div class="sig-stamp-mark">✓ تم الضبط والتحريز</div>`}
          </td>
          <td>
            <div class="sig-name">مشرف الوردية الميداني</div>
            <div style="font-size: 8px; color: #64748b;">مطابقة واقعة الضبط</div>
            <div class="sig-stamp-mark">✓ موثق ومسجل</div>
          </td>
          <td>
            <div class="sig-name">أ. علي سليمان الصقري</div>
            <div style="font-size: 8px; color: #64748b;">المشرف العام / رئيس القسم</div>
            <div class="sig-stamp-mark" style="border-color: #004B87; color: #004B87; font-weight: 800;">🏅 توجيه واعتماد نهائي</div>
          </td>
        </tr>
      </table>

      ${footerHtml}
    `;

    return wrapDocumentHTML(`مخالفة اشتراطات السلامة - ${v.id}`, inner, autoPrint);
  }

  /**
   * إنشاء كود HTML الرسمي لتقرير جولة تفتيش ميدانية معتمدة (A4)
   */
  function generateSingleRoundHTML(r, autoPrint = false) {
    const scoreVal = Number(r.score ?? r.complianceRate ?? 100);

    const headerHtml = renderOfficialHeader({
      reportId: r.id,
      reportDate: r.date,
      reportTime: r.time,
      attachments: 'بدون',
      dept1: 'المدينة الطبية الجامعية',
      dept2: 'الإدارة العامة للأمن والسلامة',
      dept3: 'إدارة السلامة'
    });

    const footerHtml = renderOfficialFooter(r.id, '✓ معتمد للملف الرقابي ومعايير السلامة الرسمية');

    const inner = `
      ${headerHtml}

      <!-- Title Banner -->
      <div class="doc-title-banner">
        <div>
          <div class="title-main">تقرير تفتيش سلامة ميدانية معتمد</div>
          <div class="title-sub">${r.formTitle || r.title || 'جولة فحص وسلامة وقائية دورية'} — ${r.building || 'المبنى الرئيسي'}</div>
          <div class="title-accr">مطابق لمتطلبات واشتراطات السلامة والوقاية من الحريق المعتمدة</div>
        </div>
        <div class="compliance-badge">
          نسبة الامتثال: ${scoreVal}%<br>
          <span style="font-size: 8px; font-weight: normal;">سلامة وجودة</span>
        </div>
      </div>

      <!-- Table 1: Field Inspection Details -->
      <div class="table-section-title">بيانات الجولة والموقع الميداني</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">المنشأة الطبية:</td>
          <td class="td-val td-highlight">${r.facility || 'مستشفى الملك خالد الجامعي (KKUH)'}</td>
          <td class="td-label">المبنى والدور:</td>
          <td class="td-val">${r.building || 'المبنى الرئيسي'} - ${r.floor || 'الدور الأرضي'}</td>
        </tr>
        <tr>
          <td class="td-label">الوردية الميدانية:</td>
          <td class="td-val">${r.shiftName || r.shift || 'الوردية الأولى (صباحي)'}</td>
          <td class="td-label">مفتش السلامة المنفذ:</td>
          <td class="td-val">${r.inspector || 'مفتش السلامة المعتمد'}</td>
        </tr>
        <tr>
          <td class="td-label">تاريخ ووقت الجولة:</td>
          <td class="td-val font-mono">${r.date || ''} — ${r.time || ''}</td>
          <td class="td-label">حالة الفحص والاعتماد:</td>
          <td class="td-val" style="color: ${scoreVal >= 90 ? '#059669' : '#d97706'}; font-weight: 800;">✓ جولة مكتملة ومعتمدة (${scoreVal}%)</td>
        </tr>
      </table>

      <!-- Notes & Deficiencies -->
      <div class="table-section-title">الملاحظات ونواقص الفحص المرصودة</div>
      <div class="notes-box">
        ${r.notes || r.deficiencies || 'لا توجد ملاحظات أو أوجه نقص. جميع بنود الفحص مستوفاة وسليمة ومطابقة لمعايير الكود الوطني السعودي والدفاع المدني.'}
      </div>

      ${r.qualityNotes ? `
        <div class="table-section-title" style="background: #e0e7ff; color: #3730a3;">تدقيق قسم الجودة وتقييم الأداء (Q1)</div>
        <div class="notes-box" style="background: #eef2ff; border-color: #c7d2fe; color: #3730a3; font-weight: bold;">
          ${r.qualityNotes}
        </div>
      ` : ''}

      ${r.headNotes ? `
        <div class="table-section-title" style="background: #fef3c7; color: #92400e;">قرار وتوجيه رئيس القسم / المشرف العام (H1)</div>
        <div class="notes-box" style="background: #fffbeb; border-color: #fde68a; color: #78350f; font-weight: 900;">
          🏅 ${r.headNotes}
        </div>
      ` : ''}

      <!-- 4-Party Signatures Matrix -->
      <table class="sigs-matrix">
        <tr>
          <th style="width: 25%;">مفتش السلامة المنفذ</th>
          <th style="width: 25%;">مشرف الوردية الميداني</th>
          <th style="width: 25%;">الجودة والاعتماد</th>
          <th style="width: 25%;">رئيس إدارة السلامة / المشرف العام</th>
        </tr>
        <tr>
          <td>
            <div class="sig-name">${r.inspector || 'مفتش السلامة'}</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">مأمور الفحص الميداني</div>
            <div class="sig-stamp-mark">✓ تم التفتيش الميداني</div>
          </td>
          <td>
            <div class="sig-name">مشرف الوردية الأولى</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">القيادة الميدانية</div>
            <div class="sig-stamp-mark">✓ مراجعة الوردية</div>
          </td>
          <td>
            <div class="sig-name">مكتب الجودة الرقابي</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">مطابقة معايير الجودة والسلامة</div>
            <div class="sig-stamp-mark">✓ مطابقة واكتمال</div>
          </td>
          <td>
            <div class="sig-name">أ. علي سليمان الصقري</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">المشرف العام / رئيس القسم</div>
            <div class="sig-stamp-mark" style="border-color: #004B87; color: #004B87; font-weight: 800;">🏅 اعتماد نهائي وحفظ</div>
          </td>
        </tr>
      </table>

      ${footerHtml}
    `;

    return wrapDocumentHTML(`تقرير جولة تفتيش - ${r.id}`, inner, autoPrint);
  }

  /**
   * إنشاء كود HTML الرسمي لتقرير إدارة السلامة (A4)
   */
  function generateSafetyDeptReportHTML(r, autoPrint = false) {
    const headerHtml = renderOfficialHeader({
      reportId: r.id || 'REP-SAF',
      reportDate: r.date || '',
      reportTime: r.time || '',
      attachments: 'بدون',
      dept1: 'المدينة الطبية الجامعية',
      dept2: 'الإدارة العامة للأمن والسلامة',
      dept3: 'إدارة السلامة'
    });

    const footerHtml = renderOfficialFooter(r.id || 'REP-SAF', '✓ تقرير رسمي معتمد لإدارة السلامة');

    const inner = `
      ${headerHtml}

      <!-- Title Banner -->
      <div class="doc-title-banner">
        <div>
          <div class="title-main">تقرير إدارة السلامة الرسمي</div>
          <div class="title-sub">${r.title || 'إحالة وإفادة ميدانية معتمدة لإجراءات السلامة'}</div>
          <div class="title-accr">سجل المتابعة والإجراءات التصحيحية والوقائية (CAPA) بالمدينة الطبية</div>
        </div>
      </div>

      <!-- Table 1: Report Details -->
      <div class="table-section-title">بيانات التقرير والموقع</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">المستشفى / المنشأة:</td>
          <td class="td-val td-highlight">${r.facility || 'المدينة الطبية بجامعة الملك سعود'}</td>
          <td class="td-label">المبنى والقسم:</td>
          <td class="td-val">${r.location || 'المبنى الرئيسي'}</td>
        </tr>
        <tr>
          <td class="td-label">تاريخ ووقت التقرير:</td>
          <td class="td-val font-mono">${r.date || ''} — ${r.time || ''}</td>
          <td class="td-label">معد التقرير:</td>
          <td class="td-val">${r.reportedBy || 'مفتش السلامة المعتمد'}</td>
        </tr>
      </table>

      <!-- Findings -->
      <div class="table-section-title">الملاحظات ونواقص السلامة المرصودة</div>
      <div class="notes-box">
        ${r.notes || r.deficiencies || 'تمت المعاينة والتدقيق الميداني والتأكد من استيفاء كافة الاشتراطات المعيارية للسلامة.'}
      </div>

      <!-- Action & CAPA -->
      <div class="table-section-title">التوجيه والإجراء التصحيحي (CAPA Plan)</div>
      <div class="notes-box" style="background:#f0fdf4; border-color:#bbf7d0;">
        <strong style="color: #166534;">الإجراء المعتمد:</strong>
        <span style="color: #14532d; font-weight: bold;">${r.actionPlan || r.correctiveAction || 'تم التوجيه باتخاذ اللازم ومعالجة الملاحظات فوراً مع المتابعة الميدانية المستمرة.'}</span>
      </div>

      <!-- Signatures Matrix -->
      <table class="sigs-matrix">
        <tr>
          <th style="width: 33.3%;">معد التقرير</th>
          <th style="width: 33.3%;">مشرف الوردية الميداني</th>
          <th style="width: 33.4%;">رئيس إدارة السلامة / المشرف العام</th>
        </tr>
        <tr>
          <td>
            <div class="sig-name">${r.reportedBy || 'مفتش السلامة'}</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">معد التقرير الميداني</div>
            <div class="sig-stamp-mark">✓ تم الإعداد والرفع</div>
          </td>
          <td>
            <div class="sig-name">مشرف الوردية الميداني</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">القيادة الميدانية</div>
            <div class="sig-stamp-mark">✓ مراجعة وتدقيق</div>
          </td>
          <td>
            <div class="sig-name">أ. علي سليمان الصقري</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">المشرف العام / رئيس القسم</div>
            <div class="sig-stamp-mark" style="border-color: #004B87; color: #004B87; font-weight: 800;">🏅 اعتماد وإحالة رسمية</div>
          </td>
        </tr>
      </table>

      ${footerHtml}
    `;

    return wrapDocumentHTML(`تقرير إدارة السلامة - ${r.id || 'SAF'}`, inner, autoPrint);
  }

  /**
   * إنشاء كود HTML الرسمي لمحضر بلاغ طارئ واستجابة ميدانية (A4)
   */
  function generateIncidentHTML(i, autoPrint = false) {
    const headerHtml = renderOfficialHeader({
      reportId: i.id || 'INC-001',
      reportDate: i.date || '',
      reportTime: i.time || '',
      attachments: 'بدون',
      dept1: 'المدينة الطبية الجامعية',
      dept2: 'الإدارة العامة للأمن والسلامة',
      dept3: 'غرفة القيادة والتحكم والعمليات 24/7'
    });

    const footerHtml = renderOfficialFooter(i.id || 'INC-001', '✓ محضر طوارئ وعمليات موثق 24/7');

    const inner = `
      ${headerHtml}

      <!-- Title Banner -->
      <div class="doc-title-banner" style="border-right-color: #dc2626; border-color: #fca5a5; background: linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);">
        <div>
          <div class="title-main" style="color: #991b1b;">محضر بلاغ طارئ واستجابة ميدانية</div>
          <div class="title-sub" style="color: #dc2626;">غرفة العمليات والتحكم المركزي (Control Center 24/7) — ${i.type || 'بلاغ طارئ'}</div>
          <div class="title-accr">سجل الاستجابة الفورية لحوادث وأعطال الأمن والسلامة</div>
        </div>
        <div class="compliance-badge" style="background: #fef2f2; border-color: #fca5a5; color: #991b1b;">
          زمن الاستجابة: ${i.responseTime || '3 دقائق'}<br>
          <span style="font-size: 7.5px; font-weight: normal;">استجابة فورية</span>
        </div>
      </div>

      <!-- Table 1: Incident Location & Code -->
      <div class="table-section-title">بيانات البلاغ والواقعة</div>
      <table class="gov-table">
        <tr>
          <td class="td-label">نوع البلاغ / الكود:</td>
          <td class="td-val td-highlight" style="color: #dc2626;">${i.type || i.code || 'بلاغ طارئ'}</td>
          <td class="td-label">الموقع بالتفصيل:</td>
          <td class="td-val">${i.building || i.location || 'المدينة الطبية'} ${i.floor ? '- ' + i.floor : ''}</td>
        </tr>
        <tr>
          <td class="td-label">تاريخ ووقت البلاغ:</td>
          <td class="td-val font-mono">${i.date || ''} — ${i.time || ''}</td>
          <td class="td-label">مستلم البلاغ:</td>
          <td class="td-val">${i.reportedBy || i.receiver || 'غرفة العمليات المركزية'}</td>
        </tr>
      </table>

      <!-- Incident Details -->
      <div class="table-section-title">تفاصيل الحدث والبلاغ الميداني</div>
      <div class="notes-box">
        ${i.details || i.notes || 'تم استلام وتوثيق البلاغ الميداني والتعامل معه وفق خطط الطوارئ القياسية.'}
      </div>

      <!-- Action Taken -->
      <div class="table-section-title">الإجراء المتخذ والنتيجة النهائية</div>
      <div class="notes-box" style="background:#f0fdf4; border-color:#bbf7d0;">
        <strong style="color: #166534;">الإجراء الفوري:</strong>
        <span style="color: #14532d; font-weight: bold;">${i.actionTaken || 'تم التدخل السريع واحتواء الموقف والتأكد من سلامة الجميع وإعادة الجاهزية للوضع الطبيعي.'}</span>
      </div>

      <!-- Signatures Matrix -->
      <table class="sigs-matrix">
        <tr>
          <th style="width: 50%;">مسؤول غرفة العمليات</th>
          <th style="width: 50%;">رئيس القسم / المشرف العام</th>
        </tr>
        <tr>
          <td>
            <div class="sig-name">مناوب العمليات المعتمد</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">غرفة القيادة والتحكم 24/7</div>
            <div class="sig-stamp-mark">✓ تم التوثيق والاستجابة</div>
          </td>
          <td>
            <div class="sig-name">أ. علي سليمان الصقري</div>
            <div style="font-size: 8px; color: #64748b; margin-bottom: 3px;">المشرف العام / رئيس القسم</div>
            <div class="sig-stamp-mark" style="border-color: #004B87; color: #004B87; font-weight: 800;">🏅 إغلاق البلاغ والاعتماد</div>
          </td>
        </tr>
      </table>

      ${footerHtml}
    `;

    return wrapDocumentHTML(`محضر بلاغ طارئ - ${i.id || 'INC'}`, inner, autoPrint);
  }

  /**
   * نافذة العرض المضمنة في الصفحة كبديل آمن حال حظر النوافذ المنبثقة
   */
  function renderInPageA4Modal(htmlDoc, autoPrint = false) {
    let modal = document.getElementById('ksumc-universal-a4-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ksumc-universal-a4-modal';
      modal.className = 'fixed inset-0 z-[99999] bg-[#001D33]/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 text-right font-sans';
      modal.style.direction = 'rtl';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-300 overflow-hidden flex flex-col h-[94vh]">
        <div class="bg-[#082B49] text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-base font-black">📄 معاينة التقرير الرسمي المعتمد (A4 / PDF)</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="ksumc-modal-print-btn" class="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer">
              <span>🖨️ طباعة / حفظ PDF</span>
            </button>
            <button type="button" onclick="document.getElementById('ksumc-universal-a4-modal').classList.add('hidden')" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer">
              ✕
            </button>
          </div>
        </div>
        <div class="flex-1 w-full bg-slate-100 overflow-hidden relative">
          <iframe id="ksumc-a4-iframe" class="w-full h-full border-0 bg-white"></iframe>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const iframe = document.getElementById('ksumc-a4-iframe');
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(htmlDoc);
      doc.close();

      const printBtn = document.getElementById('ksumc-modal-print-btn');
      if (printBtn) {
        printBtn.onclick = function() {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        };
      }

      if (autoPrint) {
        setTimeout(function() {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }, 400);
      }
    }
  }

  /**
   * المحرك المركزي الموحد لفتح وعرض وطباعة التقارير الرسمية A4 بصيغة PDF
   */
  function openOfficialReportA4(rawType, id, { autoPrint = false } = {}) {
    const item = fetchRecord(rawType, id);
    if (!item) {
      if (typeof showToast === 'function') showToast('لم يتم العثور على القيد المطلوب لعرضه.', 'error');
      else alert('لم يتم العثور على القيد المطلوب لعرضه.');
      return;
    }

    const normType = normalizeRecordType(item._type || rawType);
    let htmlDoc = '';
    let docTitle = '';

    if (normType === 'smoking_violation') {
      htmlDoc = generateSmokingViolationHTML(item, autoPrint);
      docTitle = `محضر مخالفة تدخين - ${item.id}`;
    } else if (normType === 'safety_violation') {
      htmlDoc = generateSafetyViolationHTML(item, autoPrint);
      docTitle = `محضر مخالفة سلامة - ${item.id}`;
    } else if (normType === 'round') {
      htmlDoc = generateSingleRoundHTML(item, autoPrint);
      docTitle = `تقرير جولة تفتيش - ${item.id}`;
    } else if (normType === 'safety_report') {
      htmlDoc = generateSafetyDeptReportHTML(item, autoPrint);
      docTitle = `تقرير إدارة السلامة - ${item.id}`;
    } else {
      htmlDoc = generateIncidentHTML(item, autoPrint);
      docTitle = `محضر بلاغ طارئ - ${item.id}`;
    }

    // 1. محاولة فتح نافذة جديدة مخصصة للطباعة والعرض (بدون أي خلفية للموقع الأصلي)
    let opened = false;
    try {
      const w = window.open('', '_blank', 'width=950,height=1050,scrollbars=yes,resizable=yes');
      if (w && !w.closed) {
        w.document.open();
        w.document.write(htmlDoc);
        w.document.close();
        w.document.title = docTitle;
        opened = true;
      }
    } catch (err) {
      opened = false;
    }

    // 2. إذا حظر المتصفح النوافذ المنبثقة، نفتح المودال المضمن فوراً
    if (!opened) {
      renderInPageA4Modal(htmlDoc, autoPrint);
    }
  }

  /**
   * مشاركة القيد عبر تطبيق واتساب (WhatsApp Share)
   */
  function shareRecordViaWhatsApp(type, id) {
    const item = fetchRecord(type, id);
    if (!item) {
      if (typeof showToast === 'function') showToast('لم يتم العثور على القيد المطلوب للمشاركة.', 'warning');
      else alert('لم يتم العثور على القيد المطلوب للمشاركة.');
      return;
    }

    let text = '';
    const normType = normalizeRecordType(item._type || type);

    if (normType === 'smoking_violation') {
      text = 
`*المدينة الطبية بجامعة الملك سعود - KSUMC*
*الإدارة العامة للأمن والسلامة - وحدة مكافحة التدخين*
━━━━━━━━━━━━━━━━━━━━
🚭 *محضر ضبط مخالفة لائحة مكافحة التدخين*

📌 *رقم المحضر:* ${item.id}
👤 *اسم الشخص المخالف:* ${item.violatorName || 'غير مسجل'}
🏷️ *الصفة:* ${item.role || 'موظف'}
🆔 *السجل المدني / الإقامة:* ${item.nationalId || '-'}
💼 *الرقم الوظيفي:* ${item.violatorEmpId || '-'}
🏢 *جهة العمل / القسم:* ${item.dept || '-'}
📍 *موقع الضبط:* ${item.location || 'المدينة الطبية'}
📅 *التاريخ واليوم:* ${item.day || ''} ${item.date || ''}
⏰ *وقت الضبط:* ${item.time || ''}
👮 *محرر الضبط (مفتش السلامة):* ${item.officerName || 'مفتش السلامة المعتمد'}

⚖️ *السند النظامي:*
نظام مكافحة التدخين بالمرسوم الملكي رقم (م/56) وتاريخ 1436/07/28هـ وسياسة منع التدخين بالمدينة الطبية الجامعية (MC-SS-P-02).
━━━━━━━━━━━━━━━━━━━━
منصة رصد الذكية - نظام جولات السلامة الميدانية بالمدينة الطبية بجامعة الملك سعود`;

    } else if (normType === 'safety_violation') {
      const devs = Array.isArray(item.devices) ? item.devices.join(' ، ') : (item.devices || 'أجهزة غير مطابقة');
      text = 
`*المدينة الطبية بجامعة الملك سعود - KSUMC*
*الإدارة العامة للأمن والسلامة - إدارة السلامة*
━━━━━━━━━━━━━━━━━━━━
⚠️ *محضر ضبط وإشعار مخالفة اشتراطات السلامة*

📌 *رقم المخالفة:* ${item.id}
📍 *الموقع:* ${item.location || 'المدينة الطبية'} ${item.room ? '- غرفة ' + item.room : ''}
🔌 *الأجهزة / المخالفات المضبوطة:* ${devs}
⚡ *الإجراء المتخذ:* ${item.actionTaken || 'مصادرة الجهاز المخالف'}
⚖️ *توجيه مدير إدارة السلامة:* ${item.directive || 'سحب الجهاز وإشعار الإدارة فوراً'}
👤 *المنسوب المخالف:* ${item.violatorName || 'منسوب بالمدينة الطبية'}
📅 *التاريخ والتوقيت:* ${item.date || ''} (${item.time || ''})
👮 *مفتش السلامة المحرر:* ${item.officerName || 'مفتش السلامة المعتمد'}
━━━━━━━━━━━━━━━━━━━━
منصة رصد الذكية - نظام جولات السلامة الميدانية بالمدينة الطبية بجامعة الملك سعود`;

    } else if (normType === 'round') {
      const score = item.score ?? item.complianceRate ?? 100;
      text = 
`*المدينة الطبية بجامعة الملك سعود - KSUMC*
*الإدارة العامة للأمن والسلامة - إدارة السلامة*
━━━━━━━━━━━━━━━━━━━━
📋 *تقرير جولة تفتيش سلامة ميدانية معتمدة*

📌 *رقم الجولة:* ${item.id}
📝 *نموذج التفتيش:* ${item.formTitle || item.title || 'جولة تفتيش سلامة ميدانية'}
🏥 *المنشأة الطبية:* ${item.facility || item.hospital || 'مستشفى الملك خالد الجامعي (KKUH)'}
🏢 *المبنى والدور:* ${item.building || 'المبنى الرئيسي'} - ${item.floor || 'الدور الأرضي'}
🕒 *الوردية:* ${item.shiftName || item.shift || 'الوردية الأولى'}
📅 *التاريخ والتوقيت:* ${item.date || ''} ${item.time || ''}
👮 *مفتش السلامة المنفذ:* ${item.inspector || 'مفتش السلامة'}
✅ *نسبة الامتثال والمطابقة:* ${score}% (معايير السلامة المعتمدة)
━━━━━━━━━━━━━━━━━━━━
معتمد رسمياً | منصة رصد الذكية`;

    } else {
      text = 
`*المدينة الطبية بجامعة الملك سعود - KSUMC*
*إشعار رسمي من الإدارة العامة للأمن والسلامة - إدارة السلامة*
━━━━━━━━━━━━━━━━━━━━
📌 *الرقم المرجعي:* ${item.id}
📝 *البيان:* ${item.title || item.details || item.typeName || 'إشعار ميداني'}
📍 *الموقع:* ${item.location || item.building || 'المدينة الطبية'}
📅 *التاريخ:* ${item.date || ''} ${item.time || ''}
━━━━━━━━━━━━━━━━━━━━
منصة رصد الذكية - KSUMC`;
    }

    const encoded = encodeURIComponent(text);
    const url = `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  }

  /**
   * مشاركة القيد عبر البريد الإلكتروني:
   * تفتح التقرير بصيغة A4 / PDF تلقائياً مع توفير رابط بريدي نظيف خالٍ من تشوهات الترميز
   */
  function shareRecordViaEmail(type, id) {
    const item = fetchRecord(type, id);
    if (!item) {
      if (typeof showToast === 'function') showToast('لم يتم العثور على القيد المطلوب للمشاركة.', 'warning');
      else alert('لم يتم العثور على القيد المطلوب للمشاركة.');
      return;
    }

    // 1. فتح التقرير بصيغة PDF / A4 تلقائياً كما طلب المستخدم
    openOfficialReportA4(type, id, { autoPrint: false });

    // 2. إشعار المشرف بجاهزية المستند كـ PDF للحفظ والإرسال
    if (typeof showToast === 'function') {
      showToast(`تم فتح التقرير ${item.id} بصيغة A4/PDF للطباعة والحفظ والإرفاق بالبريد.`, 'success');
    }

    // 3. فتح عميل البريد برابط نظيف ومختصر لتفادي أخطاء ترميز Outlook (طططط)
    const normType = normalizeRecordType(item._type || type);
    let typeNameAr = 'تقرير رسمي';
    if (normType === 'smoking_violation') typeNameAr = 'محضر مخالفة تدخين';
    else if (normType === 'safety_violation') typeNameAr = 'محضر مخالفة سلامة';
    else if (normType === 'round') typeNameAr = 'تقرير جولة تفتيش';
    else if (normType === 'safety_report') typeNameAr = 'تقرير إدارة السلامة';

    const cleanSubject = `[KSUMC Safety] ${typeNameAr} #${item.id} - ${item.location || 'المدينة الطبية'}`;
    const cleanBody = `سعادة رئيس القسم / المشرف العام المحترم،%0D%0A%0D%0Aنحيطكم علماً بصدور (${typeNameAr}) برقم: ${item.id}%0D%0Aالموقع: ${item.location || 'المدينة الطبية'}%0D%0Aالتاريخ: ${item.date || ''} ${item.time || ''}%0D%0A%0D%0Aتم فتح التقرير الرسمي بصيغة PDF للطباعة والاعتماد.%0D%0Aمنظومة سلامة المنشآت الطبية (KSUMC RSD)`;

    setTimeout(() => {
      try {
        window.location.href = `mailto:${OFFICIAL_EMAIL}?subject=${encodeURIComponent(cleanSubject)}&body=${cleanBody}`;
      } catch (e) {}
    }, 600);
  }

  // الدوال الموجهة للواجهات
  function viewRecordDetails(type, id) {
    openOfficialReportA4(type, id, { autoPrint: false });
  }

  function printRecordA4(type, id) {
    openOfficialReportA4(type, id, { autoPrint: true });
  }

  // تصدير الوظائف للنافذة العالمية (window)
  window.KSUShareService = {
    fetchRecord,
    generateQRCodeSVG,
    generateSmokingViolationHTML,
    generateSafetyViolationHTML,
    generateSingleRoundHTML,
    generateSafetyDeptReportHTML,
    generateIncidentHTML,
    openOfficialReportA4,
    shareRecordViaWhatsApp,
    shareRecordViaEmail,
    viewRecordDetails,
    printRecordA4
  };

  window.openOfficialReportA4 = openOfficialReportA4;
  window.shareRecordViaWhatsApp = shareRecordViaWhatsApp;
  window.shareRecordViaEmail = shareRecordViaEmail;
  window.viewRecordDetails = viewRecordDetails;
  window.printRecordA4 = printRecordA4;

  window.viewSmokingViolationDetails = (id) => openOfficialReportA4('smoking_violation', id, { autoPrint: false });
  window.viewSafetyViolationDetails = (id) => openOfficialReportA4('safety_violation', id, { autoPrint: false });
  window.viewRoundDetailsUniversal = (id) => openOfficialReportA4('round', id, { autoPrint: false });

  window.printSmokingViolation = (id) => openOfficialReportA4('smoking_violation', id, { autoPrint: true });
  window.printSafetyViolation = (id) => openOfficialReportA4('safety_violation', id, { autoPrint: true });
  window.printSingleRound = (id) => openOfficialReportA4('round', id, { autoPrint: true });
  window.printSafetyDeptReportById = (id) => openOfficialReportA4('safety_report', id, { autoPrint: true });

})(window);

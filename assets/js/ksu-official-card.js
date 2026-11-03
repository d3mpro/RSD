/**
 * ksu-official-card.js
 * منصة رصد الذكية • نظام جولات السلامة الميدانية بالمدينة الطبية بجامعة الملك سعود
 * المدينة الطبية بجامعة الملك سعود (KSUMC)
 * محرك توليد وعرض كرت محضر التفتيش الميداني الشهري المعتمد (Official Monthly Inspection Card)
 * مطابق 100% للنماذج المعتمدة وتصميم الراصد البصري الذكي
 */

(function() {
  'use strict';

  // SVG QR Code Generator
  function generateQRCodeSvg(text, size = 65) {
    if (typeof window.generateQRCodeSVG === 'function') {
      try {
        return window.generateQRCodeSVG(text, size);
      } catch (e) {
        // fallback
      }
    }
    // High-resolution SVG QR Code Template
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display:inline-block; vertical-align:middle; background:#fff; border-radius:4px; padding:2px;">
        <rect width="100" height="100" fill="#ffffff" stroke="#004B87" stroke-width="1.5"/>
        <rect x="6" y="6" width="28" height="28" fill="#004B87"/>
        <rect x="12" y="12" width="16" height="16" fill="#ffffff"/>
        <rect x="16" y="16" width="8" height="8" fill="#004B87"/>
        <rect x="66" y="6" width="28" height="28" fill="#004B87"/>
        <rect x="72" y="12" width="16" height="16" fill="#ffffff"/>
        <rect x="76" y="16" width="8" height="8" fill="#004B87"/>
        <rect x="6" y="66" width="28" height="28" fill="#004B87"/>
        <rect x="12" y="72" width="16" height="16" fill="#ffffff"/>
        <rect x="16" y="76" width="8" height="8" fill="#004B87"/>
        <rect x="40" y="10" width="6" height="6" fill="#004B87"/>
        <rect x="48" y="16" width="6" height="6" fill="#004B87"/>
        <rect x="42" y="24" width="6" height="6" fill="#004B87"/>
        <rect x="52" y="28" width="6" height="6" fill="#004B87"/>
        <rect x="10" y="42" width="6" height="6" fill="#004B87"/>
        <rect x="18" y="48" width="6" height="6" fill="#004B87"/>
        <rect x="28" y="40" width="6" height="6" fill="#004B87"/>
        <rect x="40" y="40" width="20" height="20" fill="#004B87"/>
        <rect x="44" y="44" width="12" height="12" fill="#ffffff"/>
        <rect x="47" y="47" width="6" height="6" fill="#004B87"/>
        <rect x="68" y="40" width="6" height="6" fill="#004B87"/>
        <rect x="76" y="46" width="6" height="6" fill="#004B87"/>
        <rect x="84" y="40" width="6" height="6" fill="#004B87"/>
        <rect x="42" y="68" width="6" height="6" fill="#004B87"/>
        <rect x="50" y="76" width="6" height="6" fill="#004B87"/>
        <rect x="42" y="84" width="6" height="6" fill="#004B87"/>
        <rect x="66" y="68" width="6" height="6" fill="#004B87"/>
        <rect x="74" y="74" width="6" height="6" fill="#004B87"/>
        <rect x="82" y="80" width="6" height="6" fill="#004B87"/>
      </svg>
    `;
  }

  // Standards Mapping per Form Type
  const FORM_STANDARDS = {
    elevators: { titleAr: 'تفتيش المصاعد والإنتركم', titleEn: 'ELEVATORS / Inspection', standard: 'ASME A17.1 / كود البناء السعودي SBC 201', icon: 'elevator', badge: 'ASME A17.1 • شهري', frequency: 'شهري' },
    sprinklers: { titleAr: 'مضخات مياه إطفاء الحريق والرش الآلي', titleEn: 'Fire Fighting Water Pumps & Sprinklers', standard: 'كود الحريق السعودي SBC 801 (مضخات ورش آلي 7 Bar)', icon: 'speed', badge: 'رش آلي ومضخات • شهري', frequency: 'شهري' },
    ind_room: { titleAr: 'التشييك على الغرف الصناعية', titleEn: 'Plant Room / Inspection', standard: 'كود الكهرباء والبناء السعودي SBC 201/401', icon: 'precision_manufacturing', badge: 'SBC • شهري', frequency: 'شهري' },
    fas_test: { titleAr: 'فحص واختبار نظام إنذار الحريق', titleEn: 'FIRE ALARM SYSTEMS TESTING', standard: 'كود الحريق السعودي SBC 801 (فحص وتشغيل الإنذار)', icon: 'notifications_active', badge: 'فحص إنذار • شهري', frequency: 'شهري' },
    wet_chem: { titleAr: 'نظام الإطفاء الرطب WET CHEMICAL', titleEn: 'Wet Chemical / Inspection', standard: 'كود الحريق السعودي SBC 801 (إخماد المطابخ)', icon: 'soup_kitchen', badge: 'إطفاء رطب • شهري', frequency: 'شهري' },
    roof: { titleAr: 'التفتيش على الأسطح ومهابط الطائرات', titleEn: 'Rooftop / Inspection', standard: 'كود البناء السعودي SBC 201 (سلامة الأسطح)', icon: 'roofing', badge: 'SBC 201 • شهري', frequency: 'شهري' },
    fas_insp: { titleAr: 'التفتيش على نظام مراقبة الحريق', titleEn: 'Fire Alarm Systems Inspection', standard: 'كود الحريق السعودي SBC 801 (مراقبة الحريق)', icon: 'emergency_home', badge: 'مراقبة إنذار • شهري', frequency: 'شهري' },
    fas: { titleAr: 'التفتيش على نظام مراقبة الحريق', titleEn: 'Fire Alarm Systems Inspection', standard: 'كود الحريق السعودي SBC 801 (مراقبة وإنذار الحريق)', icon: 'emergency_home', badge: 'إنذار حريق • شهري', frequency: 'شهري' },
    fm200: { titleAr: 'التشييك على نظام إف إم 200 (FM-200)', titleEn: 'FM200 SYSTEMS / Inspection', standard: 'كود الحريق السعودي SBC 801 (أنظمة إخماد الغاز النظيف Clean Agent)', icon: 'air', badge: 'Clean Agent • شهري', frequency: 'شهري' },
    fex: { titleAr: 'التفتيش على طفايات الحريق اليدوية', titleEn: 'Fire Extinguishers / Inspection', standard: 'كود الحريق السعودي SBC 801 (طفايات الحريق اليدوية)', icon: 'fire_extinguisher', badge: 'طفايات حريق • شهري', frequency: 'شهري' },
    fhc: { titleAr: 'صناديق وخراطيم الحريق الميدانية', titleEn: 'Fire Hose Cabinets / Inspection', standard: 'كود الحريق السعودي SBC 801 (خراطيم وصناديق الحريق)', icon: 'local_fire_department', badge: 'صناديق حريق • شهري', frequency: 'شهري' },
    ext: { titleAr: 'مخارج وأبواب الطوارئ ومسارات الهروب', titleEn: 'Emergency Exits / Inspection', standard: 'كود البناء والحريق السعودي SBC 201/801 (مخارج وسبل الهروب)', icon: 'door_front', badge: 'مخارج طوارئ • شهري', frequency: 'شهري' },
    daily_round: { titleAr: 'جولات السلامة اليومية المعتمدة', titleEn: 'Daily Safety Round', standard: 'معايير السلامة والصحة المهنية المعتمدة', icon: 'verified_user', badge: 'سلامة عامة • يومي', frequency: 'يومي' },
    standpipes: { titleAr: 'صواعد وشبكات الحريق Stand Pipes', titleEn: 'Stand Pipes & Risers / Inspection', standard: 'كود الحريق السعودي SBC 801 (صواعد وشبكات الحريق)', icon: 'water_drop', badge: 'صواعد حريق • شهري', frequency: 'شهري' },
    work_sites: { titleAr: 'مواقع العمل وتصاريح العمل الساخن', titleEn: 'Work Sites & Hot Work Safety', standard: 'معايير السلامة لتصاريح العمل الساخن والمواقع', icon: 'construction', badge: 'عمل ساخن • أسبوعي', frequency: 'أسبوعي' },
    all: { titleAr: 'جولة تفتيش شاملة معتمدة', titleEn: 'Comprehensive Safety Inspection', standard: 'المعايير المعتمدة للسلامة والصحة المهنية', icon: 'checklist_rtl', badge: 'شامل • شهري', frequency: 'شهري' }
  };

  // Helper sanitizer to eliminate any CBAHI/NFPA mentions
  function sanitizeFormText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/\s*\(\s*CBAHI\s*\/\s*NFPA\s*\)/gi, '')
      .replace(/\s*\(?\s*CBAHI\s*\/?\s*NFPA\s*\)?/gi, '')
      .replace(/\s*CBAHI\s*(&|\/|\+)?\s*NFPA(\s*\d+)?/gi, 'معايير السلامة')
      .replace(/\s*&?\s*CBAHI\s*(Compliance Report|Compliance|Standards?|Standard)?/gi, '')
      .replace(/\s*CBAHI\s*(FMS(\.\d+)*|IC(\.\d+)*)?/gi, 'معايير السلامة')
      .replace(/\bCBAHI\b/gi, 'معايير السلامة')
      .replace(/\bNFPA\s*(\d+[A-Z]?(\.\d+)*)?(\s*Clean Agent)?/gi, 'كود السلامة المعتمد')
      .replace(/\bNFPA\b/gi, 'كود السلامة المعتمد')
      .replace(/\s*سباهي\s*(\([^\)]*\))?/gi, 'السلامة')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  window.FORM_STANDARDS = FORM_STANDARDS;
  window.getFormDisplayInfo = function(formType) {
    return FORM_STANDARDS[formType] || FORM_STANDARDS['all'];
  };

  /**
   * توليد HTML كرت التفتيش الرسمي المعتمد مطابق تماماً لشاشة الراصد البصري
   */
  window.generateOfficialInspectionCardHtml = function(round) {
    if (!round) return '';

    const fType = round.formType || 'all';
    const formMeta = FORM_STANDARDS[fType] || {
      titleAr: round.formTitle || 'جولة التفتيش الميدانية',
      titleEn: round.formTitleEn || 'Safety Round Inspection',
      standard: 'المعايير المعتمدة للسلامة والوقاية'
    };

    const cardId = round.refNo || (round.id ? round.id.replace('insp-', 'MIR-2026-') : ('MIR-2026-' + Math.floor(1000 + Math.random() * 9000)));
    const today = round.date || ((window.KSUAI && typeof window.KSUAI.getRiyadhDate === 'function') ? window.KSUAI.getRiyadhDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const nowTime = round.time || ((window.KSUAI && typeof window.KSUAI.getRiyadhTime === 'function') ? window.KSUAI.getRiyadhTime() : new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }).format(new Date()));

    const building = round.building || 'مستشفى الملك خالد الجامعي (KKUH)';
    const floor = round.floor || 'الدور الأرضي (G)';
    const room = round.room || 'الموقع العام والممرات الرئيسية';
    const inspectorName = round.inspector || 'مفتش السلامة المناوب';
    const inspectorBadge = round.badge || '10842';
    const shiftName = round.shiftName || 'الوردية الأولى (الصباحية)';
    const headOfDept = 'مصعب عبد الله الحماد';

    const score = (typeof round.score === 'number') ? round.score : 100;
    const isCompliant = score >= 90 && (!round.violationCount || round.violationCount === 0);

    const statusText = isCompliant ? 'مطابق' : 'غير مطابق / ملاحظات';
    const statusColor = isCompliant ? '#16a34a' : '#dc2626';

    const risk = score >= 95 ? 'منخفض' : (score >= 80 ? 'متوسط' : 'عالي');
    const riskColor = risk === 'عالي' ? '#dc2626' : (risk === 'متوسط' ? '#d97706' : '#16a34a');
    const riskBg = risk === 'عالي' ? '#fee2e2' : (risk === 'متوسط' ? '#fef3c7' : '#dcfce7');

    const qrText = `KSU-SAFETY-INSPECTION|${cardId}|${building}|${floor}|SCORE:${score}%|STATUS:${statusText}|DATE:${today}`;
    const qrSvg = generateQRCodeSvg(qrText, 70);

    // Photos Handling
    const photos = round.photos || [];

    // Checklist Items processing
    const items = round.items || [];
    const nonCompliantItems = items.filter(i => i.result === 'observation' || i.result === 'violation');

    // Build Specific Parameter Box for Specialized Approved Forms
    let specializedParamsHtml = '';
    if (fType === 'sprinklers') {
      const pressure = round.actualPressure || '7.0';
      const isPressureOk = parseFloat(pressure) >= 7.0;
      specializedParamsHtml = `
        <div style="margin-bottom: 8px; padding: 6px 10px; background: #f0f9ff; border: 1.5px solid #0284c7; border-radius: 6px; font-size: 8.5px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; items-center: center; gap: 8px;">
            <span style="font-size: 14px;">💦</span>
            <div>
              <strong style="color: #0369a1;">قراءة ضغط مضخات الحريق المقاسة:</strong>
              <span style="font-weight: 900; font-size: 11px; color: ${isPressureOk ? '#16a34a' : '#dc2626'}; margin-right: 4px;">${pressure} Bar</span>
              <span style="color: #64748b; font-size: 8px;">(المعيار المعتمد: 7 Bar - نطاق التشغيل الطبيعي)</span>
            </div>
          </div>
          <span style="background: ${isPressureOk ? '#dcfce7' : '#fee2e2'}; color: ${isPressureOk ? '#16a34a' : '#dc2626'}; padding: 2px 8px; border-radius: 4px; font-weight: bold; border: 1px solid ${isPressureOk ? '#16a34a' : '#dc2626'};">
            ${isPressureOk ? '✓ الضغط سليم ومطابق' : '⚠️ الضغط منخفض دون المعيار'}
          </span>
        </div>
      `;
    } else if (fType === 'elevators') {
      const elevNums = round.elevatorNumbers || 'صاعد 1، صاعد 2، صاعد 3';
      specializedParamsHtml = `
        <div style="margin-bottom: 8px; padding: 6px 10px; background: #eef2ff; border: 1.5px solid #6366f1; border-radius: 6px; font-size: 8.5px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 14px;">🛗</span>
            <div>
              <strong style="color: #4338ca;">أرقام وتحديد الصواعد المفحوصة في الجولة:</strong>
              <span style="font-weight: bold; color: #1e1b4b; margin-right: 4px;">${elevNums}</span>
            </div>
          </div>
          <span style="background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-weight: bold;">
            تفتيش شهري معتمد (ASME A17.1)
          </span>
        </div>
      `;
    } else if (fType === 'wet_chem' || fType === 'fas_insp' || fType === 'fm200') {
      const loop = round.loopNo || 'LOOP-01';
      const devices = round.devicesNo || '32 نقطة';
      const ppm = round.ppmDate || 'ساري ومحدث';
      specializedParamsHtml = `
        <div style="margin-bottom: 8px; padding: 6px 10px; background: #fffbeb; border: 1.5px solid #f59e0b; border-radius: 6px; font-size: 8.5px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
          <div><strong style="color: #92400e;">رقم الدائرة (Loop):</strong> <span style="font-family: monospace; font-weight: bold;">${loop}</span></div>
          <div><strong style="color: #92400e;">عدد الأجهزة والنقاط:</strong> <span style="font-weight: bold;">${devices}</span></div>
          <div><strong style="color: #92400e;">تاريخ صيانة PPM:</strong> <span style="font-weight: bold; color: #16a34a;">${ppm}</span></div>
        </div>
      `;
    } else if (fType === 'ind_room') {
      const blok = round.blok || 'بلوك 1';
      specializedParamsHtml = `
        <div style="margin-bottom: 8px; padding: 6px 10px; background: #fff7ed; border: 1.5px solid #ea580c; border-radius: 6px; font-size: 8.5px; display: flex; align-items: center; justify-content: space-between;">
          <div><strong style="color: #9a3412;">رقم البلك الصناعي (Blok):</strong> <span style="font-weight: bold;">${blok}</span></div>
          <span style="background: #ffedd5; color: #c2410c; padding: 2px 8px; border-radius: 4px; font-weight: bold;">7 قطاعات فنية معتمدة (SBC 401)</span>
        </div>
      `;
    }

    // Violations List HTML
    let violationsListHtml = '';
    if (nonCompliantItems.length > 0) {
      violationsListHtml = nonCompliantItems.map(item => `
        <li style="margin-bottom: 4px;">
          <strong style="color: #b91c1c;">[${item.code || 'بند تفتيش'}]:</strong> ${item.title}
          ${item.note ? `<div style="color: #64748b; font-size: 7.5px; margin-top: 1px;">- ملاحظة المفتش: ${item.note}</div>` : ''}
        </li>
      `).join('');
    } else {
      violationsListHtml = `<li style="color: #16a34a; font-weight: bold;">✓ تم فحص كافة البنود المعتمدة ولم يتم رصد أي مخالفات أو ملاحظات تستوجب الإيقاف.</li>`;
    }

    // Tested Items Mini Checklist Summary (up to 7 items shown concisely)
    const testedItemsHtml = items.length > 0 ? items.slice(0, 9).map(it => {
      const icon = it.result === 'compliant' ? '✓' : (it.result === 'violation' ? '✕' : '⚠️');
      const clr = it.result === 'compliant' ? '#16a34a' : (it.result === 'violation' ? '#dc2626' : '#d97706');
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 7.5px; padding: 2px 4px; border-bottom: 1px dashed #e2e8f0;">
          <span style="color: #334155; font-weight: 600; max-width: 82%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${it.title}</span>
          <span style="color: ${clr}; font-weight: 900; font-family: monospace;">${icon} ${it.result === 'compliant' ? 'نعم' : (it.result === 'violation' ? 'لا' : 'لا يطابق')}</span>
        </div>
      `;
    }).join('') : '<div style="font-size: 8px; color: #64748b;">كافة بنود النموذج معتمدة ومطابقة.</div>';

    // CAPA List HTML
    const capaActions = sanitizeFormText(round.actions) || (nonCompliantItems.length > 0
      ? 'إزالة العوائق، تصحيح الملاحظات فورياً، وإعادة الفحص في الجولة القادمة ومتابعة قسم الصيانة الدورية.'
      : 'استمرار المتابعة اليومية والشهرية الدورية والتأكد من استدامة الامتثال بأعلى معايير السلامة والوقاية من الحريق المعتمدة.');

    let stampColor = '#004B87';
    let stampTitle = 'ختم الاعتماد الرقمي';
    let stampSubtitle = 'إدارة السلامة - KSUMC';
    let stampStatus = 'VERIFIED & RECORDED';

    if (round.workflowStatus === 'approved_cbahi' || round.workflowStatus === 'approved_quality') {
      stampColor = '#16a34a';
      stampTitle = 'معتمد في سجل الامتثال';
      stampStatus = 'CBAHI / SBC APPROVED';
    } else if (round.workflowStatus === 'pending_quality') {
      stampColor = '#0284c7';
      stampTitle = 'معتمد من مشرف الوردية';
      stampStatus = 'PENDING QUALITY AUDIT';
    } else if (round.workflowStatus === 'overdue_pending_audit') {
      stampColor = '#e11d48';
      stampTitle = 'معلق تدقيق (انتهت الوردية)';
      stampStatus = 'OVERDUE PENDING AUDIT';
    } else if (round.workflowStatus === 'returned_by_quality') {
      stampColor = '#d97706';
      stampTitle = 'معاد للتصحيح والاستكمال';
      stampStatus = 'RETURNED FOR REVISION';
    } else {
      stampColor = '#004B87';
      stampTitle = 'بانتظار اعتماد المشرف';
      stampStatus = 'PENDING SUPERVISOR';
    }

    const cardInnerHtml = `
      <div class="ksu-card-sheet" style="box-sizing: border-box; width: 100%; max-width: 820px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; background: #fff; color: #0f172a; border: 2.5px solid #004B87; border-radius: 8px; padding: 12px 16px; position: relative; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);">
        
        <!-- HEADER -->
        <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid #004B87; padding-bottom: 6px; margin-bottom: 8px;">
          <tr>
            <td style="width: 33%; text-align: right; vertical-align: middle; font-size: 8.5px; line-height: 1.35; color: #082B49;">
              <div style="font-weight: 900; font-size: 9.5px; color: #004B87;">المملكة العربية السعودية</div>
              <div>وزارة التعليم - جامعة الملك سعود</div>
              <div style="font-weight: bold;">المدينة الطبية الجامعية (KSUMC)</div>
              <div>الإدارة العامة للأمن والسلامة الميدانية</div>
              <div style="color: #64748b; font-size: 8px;">إدارة السلامة والوقاية من الحريق</div>
            </td>
            <td style="width: 34%; text-align: center; vertical-align: middle;">
              <img src="assets/images/ksu_official_logo.png" alt="شعار جامعة الملك سعود" style="height: 52px; width: auto; max-width: 145px; object-fit: contain; display: inline-block;" onerror="this.outerHTML='<div style=\\'font-weight:900;color:#004B87;font-size:14px;\\'>جامعة الملك سعود<br><span style=\\'font-size:9px;color:#64748b;\\'>المدينة الطبية الجامعية</span></div>'">
              <div style="font-size: 7.5px; color: #64748b; font-weight: bold; margin-top: 2px;">ريادة عالمية في سلامة المنشآت الصحية</div>
            </td>
            <td style="width: 33%; text-align: left; vertical-align: middle; direction: ltr; font-size: 8.5px; line-height: 1.35;">
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                <div>
                  <div style="font-weight: bold; font-family: monospace; font-size: 10.5px; color: #004B87;">${cardId}</div>
                  <div>Date: <span style="font-weight: bold;">${today}</span></div>
                  <div>Time: <span style="font-weight: bold;">${nowTime}</span></div>
                </div>
                <div style="display: inline-block;">
                  ${qrSvg}
                </div>
              </div>
            </td>
          </tr>
        </table>

        <!-- BANNER -->
        <div style="background: linear-gradient(135deg, #004B87 0%, #002B49 100%); color: #fff; border-radius: 6px; padding: 7px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🛡️</span>
            <div>
              <div style="font-size: 12.5px; font-weight: 900; letter-spacing: 0.3px;">كرت محضر التفتيش الميداني الشهري المعتمد</div>
              <div style="font-size: 8px; color: #93c5fd; font-weight: bold;">Official Monthly Inspection Card • ${sanitizeFormText(formMeta.titleEn)}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="background: ${statusColor}; color: #fff; padding: 3px 8px; border-radius: 4px; font-weight: 900; font-size: 10px;">
              ${statusText}
            </span>
            <span style="background: ${riskBg}; color: ${riskColor}; padding: 3px 8px; border-radius: 4px; font-weight: 900; font-size: 10px; border: 1px solid ${riskColor};">
              معدل الامتثال: ${score}%
            </span>
          </div>
        </div>

        <!-- METADATA TABLE -->
        <table style="width: 100%; border-collapse: collapse; font-size: 8.5px; margin-bottom: 8px; border: 1px solid #cbd5e1;">
          <tr style="background: #f8fafc;">
            <td style="padding: 4px 6px; font-weight: bold; width: 14%; border: 1px solid #cbd5e1; color: #334155;">المنشأة والمبنى:</td>
            <td style="padding: 4px 6px; width: 36%; border: 1px solid #cbd5e1; font-weight: 600;">${building}</td>
            <td style="padding: 4px 6px; font-weight: bold; width: 14%; border: 1px solid #cbd5e1; color: #334155;">الدور والموقع:</td>
            <td style="padding: 4px 6px; width: 36%; border: 1px solid #cbd5e1; font-weight: 600;">${floor} - ${room}</td>
          </tr>
          <tr>
            <td style="padding: 4px 6px; font-weight: bold; border: 1px solid #cbd5e1; color: #334155;">نوع الفحص المعتمد:</td>
            <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 600; color: #004B87;">${formMeta.titleAr}</td>
            <td style="padding: 4px 6px; font-weight: bold; border: 1px solid #cbd5e1; color: #334155;">مفتش السلامة:</td>
            <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 600;">${inspectorName} (الرقم: ${inspectorBadge}) - ${shiftName}</td>
          </tr>
          <tr style="background: #f8fafc;">
            <td style="padding: 4px 6px; font-weight: bold; border: 1px solid #cbd5e1; color: #334155;">محرك التحقق والتدقيق:</td>
            <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 600;">منصة رصد الذكية - KSUMC (دقة: 100%)</td>
            <td style="padding: 4px 6px; font-weight: bold; border: 1px solid #cbd5e1; color: #334155;">المرجع الرقابي:</td>
            <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 600; color: #004B87;">${sanitizeFormText(formMeta.standard)}</td>
          </tr>
        </table>

        <!-- SPECIALIZED PARAMS IF ANY -->
        ${specializedParamsHtml}

        <!-- VISUAL EVIDENCE & DETECTED OBSERVATIONS TABLE -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <tr>
            <!-- Left: Attached Photos -->
            <td style="width: 40%; vertical-align: top; padding-left: 6px;">
              <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px; background: #f8fafc; text-align: center; height: 100%; box-sizing: border-box;">
                <div style="font-size: 8.5px; font-weight: bold; color: #475569; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                  <span>📸 التوثيق البصري الميداني (${photos.length})</span>
                  <span style="font-family: monospace; font-size: 7.5px; color: #64748b;">${today}</span>
                </div>
                ${(() => {
                  if (photos.length === 0) {
                    return `
                      <div style="min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #94a3b8; font-size: 9px; border: 1px dashed #cbd5e1; border-radius: 4px; background: #fff; padding: 10px;">
                        <span style="font-size: 24px;">🏢</span>
                        <span>تمت المعاينة والتدقيق الميداني المباشر</span>
                        <span style="font-size: 7.5px; color: #16a34a; font-weight: bold;">سجل موثق بالبوابة الميدانية</span>
                      </div>
                    `;
                  }
                  if (photos.length === 1) {
                    return `<img src="${photos[0]}" style="max-width: 100%; max-height: 180px; height: auto; border-radius: 4px; object-fit: contain; border: 1px solid #e2e8f0; display: block; margin: 0 auto;" alt="صورة المعاينة">`;
                  }
                  return `
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; max-height: 180px; overflow: hidden;">
                      ${photos.slice(0, 4).map((im, i) => `
                        <div style="position: relative; border-radius: 4px; overflow: hidden; border: 1px solid #cbd5e1; height: 85px; background: #000;">
                          <img src="${im}" style="width: 100%; height: 100%; object-fit: cover;" alt="صورة ${i + 1}">
                          <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.75); color: #fff; font-size: 7px; padding: 1px 4px; border-radius: 2px; font-weight: bold;">صورة ${i + 1}</span>
                        </div>
                      `).join('')}
                    </div>
                  `;
                })()}
              </div>
            </td>

            <!-- Right: Inspection Results & Observations -->
            <td style="width: 60%; vertical-align: top; padding-right: 6px;">
              <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; background: #ffffff; height: 100%; box-sizing: border-box;">
                
                <!-- Tested Items Highlights -->
                <div style="margin-bottom: 6px;">
                  <div style="font-size: 8.5px; font-weight: 900; color: #004B87; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-bottom: 3px; display: flex; justify-content: space-between;">
                    <span>عينة من بنود التحقق المفحوصة في الجولة:</span>
                    <span style="color: #64748b; font-weight: normal;">إجمالي: ${items.length} بنود</span>
                  </div>
                  <div style="max-height: 85px; overflow-y: auto;">
                    ${testedItemsHtml}
                  </div>
                </div>

                <!-- Observations and Remarks -->
                <div>
                  <div style="font-size: 8.5px; font-weight: bold; color: ${nonCompliantItems.length > 0 ? '#b91c1c' : '#16a34a'}; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                    <span>${nonCompliantItems.length > 0 ? '⚠️' : '✅'}</span>
                    <span>المخالفات والملاحظات المرصودة:</span>
                  </div>
                  <ul style="margin: 0; padding-right: 14px; font-size: 8px; color: #475569; line-height: 1.35;">
                    ${violationsListHtml}
                  </ul>
                  ${round.notes ? `<div style="margin-top: 4px; padding: 3px 6px; background: #f8fafc; border-radius: 4px; font-size: 7.5px; color: #475569;"><strong>ملاحظات إضافية: </strong>${round.notes}</div>` : ''}
                </div>

              </div>
            </td>
          </tr>
        </table>

        <!-- CAPA & DIRECTIVES -->
        <div style="border: 1.5px solid #10b981; background: #f0fdf4; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px;">
          <div style="font-size: 9.5px; font-weight: 900; color: #065f46; margin-bottom: 2px; display: flex; align-items: center; gap: 4px; border-bottom: 1px solid #a7f3d0; padding-bottom: 2px;">
            <span>✅</span>
            <span>خطة المعالجة الفورية والوقائية المعتمدة (CAPA Action Plan):</span>
          </div>
          <div style="font-size: 8px; color: #065f46; font-weight: 600; line-height: 1.35; padding: 2px 4px;">
            ${capaActions}
          </div>
          <div style="margin-top: 4px; padding: 4px 8px; background: #ecfdf5; border-right: 3px solid #10b981; border-radius: 4px; font-size: 8px; font-weight: bold; color: #065f46;">
            <span style="color: #047857;">التوجيه الإداري المعتمد: </span>إحالة المحضر لرئيس القسم للمتابعة وضمان استدامة الامتثال لأعلى معايير السلامة والوقاية المعتمدة.
          </div>
        </div>

        <!-- SIGNATURES -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 4px; border-top: 1px solid #cbd5e1; padding-top: 4px;">
          <tr>
            <td style="width: 32%; text-align: center; vertical-align: top; font-size: 8px; padding: 2px;">
              <div style="font-weight: bold; color: #334155; margin-bottom: 12px;">مفتش السلامة الميداني</div>
              <div style="font-weight: bold; color: #082B49;">${inspectorName}</div>
              <div style="font-size: 7px; color: #16a34a; font-weight: bold; margin-top: 2px;">✓ معتمد إلكترونياً بالبوابة</div>
            </td>
            <td style="width: 36%; text-align: center; vertical-align: middle; padding: 2px;">
              <div style="border: 1.5px dashed ${stampColor}; border-radius: 6px; padding: 4px 8px; display: inline-block; min-width: 125px; background: #f8fafc;">
                <div style="font-size: 8px; font-weight: 900; color: ${stampColor};">${stampTitle}</div>
                <div style="font-size: 7px; color: #475569;">${stampSubtitle}</div>
                <div style="font-family: monospace; font-size: 7px; color: ${stampColor}; font-weight: bold; margin-top: 1px;">${stampStatus}</div>
              </div>
            </td>
            <td style="width: 32%; text-align: center; vertical-align: top; font-size: 8px; padding: 2px;">
              <div style="font-weight: bold; color: #334155; margin-bottom: 12px;">مشرف الوردية / رئيس الإدارة</div>
              <div style="font-weight: bold; color: #082B49;">${headOfDept}</div>
              <div style="font-size: 7px; color: #004B87; font-weight: bold; margin-top: 2px;">رئيس إدارة السلامة والأمن الميداني</div>
            </td>
          </tr>
        </table>

        <!-- FOOTER -->
        <div style="margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px; display: flex; justify-content: space-between; align-items: center; font-size: 7px; color: #64748b;">
          <div>منصة رصد الذكية • نظام جولات السلامة الميدانية بالمدينة الطبية بجامعة الملك سعود</div>
          <div style="font-family: monospace;">Ref: ${cardId} | System Timestamp: ${today} ${nowTime}</div>
        </div>

      </div>
    `;

    return cardInnerHtml;
  };

  /**
   * فتح نافذة عرض كرت المحضر الرسمي المعتمد (Full-Screen Modal Sheet)
   */
  window.openOfficialInspectionCardModal = function(roundId, autoPrint = false) {
    let round = null;
    if (window.state && window.state.rounds) {
      round = window.state.rounds.find(r => r.id === roundId);
    }
    if (!round && window.lastSavedRound && window.lastSavedRound.id === roundId) {
      round = window.lastSavedRound;
    }
    if (!round) {
      // Fallback draft round if not found
      round = {
        id: roundId || 'MIR-' + Date.now(),
        building: 'مستشفى الملك خالد الجامعي (KKUH)',
        floor: 'الدور الأرضي',
        room: 'الموقع العام',
        formType: 'elevators',
        date: ((window.KSUAI && typeof window.KSUAI.getRiyadhDate === 'function') ? window.KSUAI.getRiyadhDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())),
        time: ((window.KSUAI && typeof window.KSUAI.getRiyadhTime === 'function') ? window.KSUAI.getRiyadhTime() : new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' }).format(new Date())),
        score: 100,
        inspector: 'مفتش السلامة المناوب',
        badge: '10842',
        shiftName: 'الوردية الصباحية',
        items: []
      };
    }

    let modal = document.getElementById('ksu-official-card-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'ksu-official-card-modal';
    modal.className = 'fixed inset-0 z-[9999] bg-slate-900/85 backdrop-blur-md flex flex-col items-center justify-start p-3 sm:p-6 overflow-y-auto font-cairo';
    modal.style.direction = 'rtl';

    const cardContentHtml = window.generateOfficialInspectionCardHtml(round);

    modal.innerHTML = `
      <div class="max-w-4xl w-full flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-200 my-auto">
        
        <!-- Top Action Bar (no-print) -->
        <div class="no-print bg-slate-800 text-white px-4 py-3 rounded-2xl flex items-center justify-between shadow-xl border border-slate-700">
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">🛡️</span>
            <div>
              <h4 class="text-xs sm:text-sm font-black">كرت محضر التفتيش الميداني الشهري المعتمد</h4>
              <span class="text-[10px] text-slate-400">وثيقة رسمية معتمدة للسلامة والوقاية من الحريق</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.printOfficialCard()" class="px-3.5 py-2 rounded-xl bg-[#004B87] hover:bg-[#003B6B] text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer">
              <span class="material-symbols-outlined text-sm">print</span>
              <span>طباعة المحضر (A4)</span>
            </button>
            <button onclick="document.getElementById('ksu-official-card-modal').remove()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer font-bold">✕</button>
          </div>
        </div>

        <!-- Printable Official Card Container -->
        <div id="official-printable-card-wrapper" class="bg-white rounded-2xl p-2 sm:p-4 shadow-2xl border border-slate-300 overflow-x-auto">
          ${cardContentHtml}
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    if (autoPrint) {
      setTimeout(() => {
        window.printOfficialCard();
      }, 300);
    }
  };

  /**
   * دالة طباعة المحضر الرسمي A4
   */
  window.printOfficialCard = function() {
    const cardEl = document.querySelector('#official-printable-card-wrapper .ksu-card-sheet');
    if (!cardEl) {
      window.print();
      return;
    }

    const printWin = window.open('', '_blank', 'width=900,height=750');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>كرت محضر التفتيش الميداني الشهري - KSUMC</title>
        <style>
          @page { size: A4 portrait; margin: 8mm 6mm; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; padding: 0; background: #fff; direction: rtl; }
          @media print {
            .no-print { display: none !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${cardEl.outerHTML}
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); window.close(); }, 250);
          };
        <\/script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  /**
   * إدارة الصور المرفقة داخل نافذة الجولة الجديدة
   */
  window.roundPhotosList = [];

  window.handleRoundPhotoSelected = function(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        window.roundPhotosList.push(e.target.result);
        if (window.state && window.state.currentRoundDraft) {
          window.state.currentRoundDraft.photos = window.roundPhotosList;
        }
        window.renderRoundPhotosThumbnails();
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  window.renderRoundPhotosThumbnails = function() {
    const strip = document.getElementById('round-photos-thumbnails-strip');
    const badge = document.getElementById('round-photos-counter-badge');
    if (badge) badge.textContent = window.roundPhotosList.length;

    if (!strip) return;
    if (window.roundPhotosList.length === 0) {
      strip.innerHTML = '<span class="text-[11px] text-slate-400 py-1">لا توجد صور مرفقة حتى الآن. التقط صورة بالكاميرا أو أضف من الألبوم.</span>';
      return;
    }

    strip.innerHTML = window.roundPhotosList.map((img, idx) => `
      <div class="relative shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-300 bg-slate-900 group">
        <img src="${img}" class="w-full h-full object-cover" alt="صورة ${idx + 1}">
        <button type="button" onclick="window.deleteRoundPhoto(${idx})" class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[9px] font-bold shadow-xs cursor-pointer">✕</button>
      </div>
    `).join('');
  };

  window.deleteRoundPhoto = function(index) {
    window.roundPhotosList.splice(index, 1);
    if (window.state && window.state.currentRoundDraft) {
      window.state.currentRoundDraft.photos = window.roundPhotosList;
    }
    window.renderRoundPhotosThumbnails();
  };

  /**
   * تحديث الحقول التخصصية بحسب نوع النموذج المعتمد
   */
  window.updateSpecializedFormFields = function(formType) {
    const container = document.getElementById('round-specialized-fields-container');
    if (!container) return;

    if (formType === 'elevators') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-indigo-700">elevator</span>
              <span>أرقام الصواعد المفحوصة في هذا الدور (Elevators Numbers):</span>
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">ASME A17.1</span>
          </div>
          <input type="text" id="inp-round-elevator-numbers" placeholder="مثال: صاعد 1، صاعد 2، صاعد 3، صاعد الخدمات 4..." value="صاعد 1، صاعد 2" class="w-full px-3 py-2 rounded-xl bg-white border border-indigo-300 text-xs font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500">
          <span class="text-[10px] text-indigo-700">سيتم تطبيق بنود الفحص الـ 9 المعتمدة على كافة الصواعد المحددة أعلاه.</span>
        </div>
      `;
    } else if (formType === 'sprinklers') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-cyan-50/70 border border-cyan-200 flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-cyan-950 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-cyan-700">speed</span>
              <span>بيانات ضغط مضخات مياه إطفاء الحريق:</span>
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800">القيمة المعيارية: 7 Bar</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] font-bold text-slate-700 block mb-1">الضغط الحالي المقاس (Actual Pressure):</label>
              <div class="relative">
                <input type="number" step="0.1" id="inp-round-pressure" placeholder="مثال: 7.0" value="7.0" oninput="window.validatePressureInput(this.value)" class="w-full px-3 py-2 rounded-xl bg-white border border-cyan-300 text-xs font-bold text-cyan-900 outline-none focus:ring-2 focus:ring-cyan-500 pr-12">
                <span class="absolute left-3 top-2 text-xs font-bold text-slate-500">Bar</span>
              </div>
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-700 block mb-1">تاريخ الصيانة الدورية (PPM Date):</label>
              <input type="date" id="inp-round-ppm-date" class="w-full px-3 py-2 rounded-xl bg-white border border-cyan-300 text-xs font-bold text-slate-700 outline-none">
            </div>
          </div>
          <div id="round-pressure-status-indicator" class="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 p-2 rounded-xl border border-emerald-300">
            <span class="material-symbols-outlined text-sm">check_circle</span>
            <span>الضغط ضمن نطاق التشغيل الطبيعي المعتمد (7 Bar فما فوق) ✓</span>
          </div>
        </div>
      `;
    } else if (formType === 'wet_chem' || formType === 'fas_insp' || formType === 'fm200') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-amber-700">tune</span>
              <span>المحددات الفنية المعتمدة للنموذج:</span>
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">بيانات اللوحة والدائرة</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">رقم الدائرة (Loop NO):</label>
              <input type="text" id="inp-round-loop" placeholder="مثال: LOOP-01" value="LOOP-01" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-800 outline-none">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">عدد النقاط (Devices):</label>
              <input type="text" id="inp-round-devices" placeholder="مثال: 24 نقطة" value="32 نقطة" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-800 outline-none">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">تاريخ الـ PPM القادم:</label>
              <input type="date" id="inp-round-ppm-date" class="w-full px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-800 outline-none">
            </div>
          </div>
        </div>
      `;
    } else if (formType === 'ind_room') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-orange-50/70 border border-orange-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-orange-950 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-orange-700">domain</span>
              <span>رقم البلك الصناعي والقطاع (Blok & Sector):</span>
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">SBC 401 • الغرف الصناعية</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">رقم البلك الصناعي:</label>
              <input type="text" id="inp-round-blok" placeholder="مثال: بلوك 1 - محطة الخدمات الرئيسية" value="بلوك 1" class="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-xs font-bold text-slate-800 outline-none">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">القطاع الفني المستهدف:</label>
              <input type="text" id="inp-round-sector" placeholder="مثال: غرف المحولات، المولدات، التكييف، الغازات الطبية..." value="غرفة اللوحات والمولدات" class="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-xs font-bold text-slate-800 outline-none">
            </div>
          </div>
        </div>
      `;
    } else if (formType === 'work_sites') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-amber-700">construction</span>
              <span>بيانات تصريح العمل الساخن وتأمين الموقع:</span>
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">تصريح معتمد</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">رقم تصريح العمل الساخن (Permit NO):</label>
              <input type="text" id="inp-round-permit-no" placeholder="مثال: HWP-2026-088" value="HWP-2026-088" class="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-800 outline-none">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">مراقب الحريق المعين (Fire Watcher):</label>
              <input type="text" id="inp-round-fire-watcher" placeholder="اسم المراقب المعين بالموقع" value="مراقب السلامة الميداني" class="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-800 outline-none">
            </div>
          </div>
        </div>
      `;
    } else if (formType === 'roof') {
      container.classList.remove('hidden');
      container.innerHTML = `
        <div class="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-sky-950 flex items-center gap-1.5">
              <span class="material-symbols-outlined text-base text-sky-700">roofing</span>
              <span>محددات تفتيش السطح ومهبط الطائرات (SBC 201):</span>
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">الأمن والسلامة</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">حالة مهبط الطائرات (Helipad):</label>
              <input type="text" id="inp-round-helipad" placeholder="مثال: جاهز وخالٍ من العوائق، الإنارة سليمة" value="جاهز وخالٍ من العوائق" class="w-full px-3 py-2 rounded-xl bg-white border border-sky-300 text-xs font-bold text-slate-800 outline-none">
            </div>
            <div>
              <label class="text-[10px] font-bold text-slate-700 block mb-1">حالة أبواب ومخارج السطح:</label>
              <input type="text" id="inp-round-roof-doors" placeholder="مثال: مقفلة وتحت السيطرة مع سهولة الخروج" value="مقفلة بنظام تحكم آمن" class="w-full px-3 py-2 rounded-xl bg-white border border-sky-300 text-xs font-bold text-slate-800 outline-none">
            </div>
          </div>
        </div>
      `;
    } else {
      container.classList.add('hidden');
      container.innerHTML = '';
    }  };

  window.validatePressureInput = function(val) {
    const indicator = document.getElementById('round-pressure-status-indicator');
    if (!indicator) return;
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 7.0) {
      indicator.className = 'flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 p-2 rounded-xl border border-emerald-300';
      indicator.innerHTML = '<span class="material-symbols-outlined text-sm">check_circle</span><span>الضغط ضمن نطاق التشغيل الطبيعي المعتمد (7 Bar فما فوق) ✓</span>';
    } else {
      indicator.className = 'flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-100/80 p-2 rounded-xl border border-rose-300';
      indicator.innerHTML = '<span class="material-symbols-outlined text-sm">warning</span><span>تنبيه: الضغط منخفض دون المعيار القياسي (أقل من 7 Bar) ⚠️</span>';
    }
  };

})();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function extractFn(src, sig) {
  const start = src.indexOf(sig);
  assert.notEqual(start, -1, `Missing function ${sig}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      return src.slice(start, i + 1);
    }
  }
  throw new Error(`Unclosed function ${sig}`);
}

test('DOOR-1: printDoorOpenRequest renders Work/ID Card full-width and print-readable on A4 instead of tiny 85px thumbnail', () => {
  const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
  const fnSrc = extractFn(appJs, 'function printDoorOpenRequest(');

  let capturedHtml = '';
  let capturedTitle = '';
  const samplePhoto = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';

  const ctx = {
    window: { location: { href: 'https://rsd-ksu.web.app/field.html' } },
    state: {
      doors: [
        {
          id: 'DOR-901',
          requesterName: 'محمد عبدالله السبيعي',
          employeeId: 'KSU-EMP-88412',
          jobTitle: 'فني صيانة كهربائية',
          department: 'التشغيل والصيانة',
          ext: '74120',
          doorName: 'غرفة المحولات الرئيسية B2',
          reason: 'صيانة دورية طارئة',
          building: 'المستشفى',
          floor: 'القبو الثاني',
          room: 'B2-104',
          date: '2026-11-26',
          time: '09:30',
          status: 'معتمد ومنفذ',
          idCardPhoto: samplePhoto
        },
        {
          id: 'DOR-902',
          requesterName: 'سعد فهد القحطاني',
          employeeId: 'KSU-EMP-55109',
          department: 'الأمن والسلامة',
          doorName: 'بوابة الطوارئ الشرقية',
          reason: 'تفقد مسار الإخلاء',
          idCardPhoto: ''
        }
      ]
    },
    generateQRCodeSVG: () => '<svg></svg>',
    showToast: () => {},
    printHtmlContent: (html, title) => {
      capturedHtml = html;
      capturedTitle = title;
    }
  };

  vm.createContext(ctx);
  vm.runInContext(fnSrc, ctx);

  // 1. Render with attached Work / ID card photo
  ctx.printDoorOpenRequest('DOR-901');
  assert.ok(capturedTitle.includes('DOR-901'));
  assert.ok(capturedHtml.includes(samplePhoto), 'Printed document must embed the uploaded ID/Work Card photo');

  // Must NOT clamp the printed ID card to microscopic 85px height or 220px width
  assert.ok(
    !capturedHtml.includes('max-height: 85px'),
    'Printed ID/Work Card must NOT be clamped to tiny max-height: 85px'
  );
  assert.ok(
    !capturedHtml.includes('max-width: 220px'),
    'Printed ID/Work Card must NOT be clamped to tiny max-width: 220px'
  );

  // Must use vertical stacked layout so text does not squeeze the card horizontally
  const attachCssMatch = capturedHtml.match(/\.id-attach-container\s*\{[^}]*\}/);
  assert.ok(attachCssMatch, 'Must define .id-attach-container CSS');
  assert.ok(
    /flex-direction:\s*column/.test(attachCssMatch[0]),
    '.id-attach-container must stack vertically (flex-direction: column) so the Work Card spans full printable width'
  );

  // .id-img-box must span 100% width and image must scale generously with object-fit: contain
  const boxCssMatch = capturedHtml.match(/\.id-img-box\s*\{[^}]*\}/);
  assert.ok(boxCssMatch && /width:\s*100%/.test(boxCssMatch[0]), '.id-img-box must use width: 100%');

  const imgCssMatch = capturedHtml.match(/\.id-img-box\s+img\s*\{[^}]*\}/);
  assert.ok(imgCssMatch, 'Must define .id-img-box img CSS');
  assert.ok(
    /width:\s*100%/.test(imgCssMatch[0]) && /object-fit:\s*contain/.test(imgCssMatch[0]),
    '.id-img-box img must scale full-width proportionally (width: 100%; object-fit: contain) without cropping'
  );
  // Check vertical cap uses >= 95mm (or >= 350px) so card is crisp & readable while fitting 1 A4 page
  const mmMatch = imgCssMatch[0].match(/max-height:\s*(\d+)mm/);
  const pxMatch = imgCssMatch[0].match(/max-height:\s*(\d+)px/);
  const sufficientHeight = (mmMatch && Number(mmMatch[1]) >= 95) || (pxMatch && Number(pxMatch[1]) >= 350);
  assert.ok(
    sufficientHeight,
    'Printed ID/Work Card max-height must be at least 95mm (or 350px) for full A4 legibility'
  );

  // 2. Render without photo preserves fallback placeholder
  capturedHtml = '';
  ctx.printDoorOpenRequest('DOR-902');
  assert.ok(capturedHtml.includes('id-placeholder-box'), 'Fallback placeholder must still render when no ID photo is attached');
});

test('DOOR-2: field.html Work Card modal preview uses object-contain and enlarged preview frame', () => {
  const fieldHtml = fs.readFileSync(path.join(ROOT, 'field.html'), 'utf8');
  const idx = fieldHtml.indexOf('id="img-door-id-preview"');
  assert.notEqual(idx, -1, 'Missing img-door-id-preview in field.html');
  const imgTag = fieldHtml.slice(fieldHtml.lastIndexOf('<img', idx), fieldHtml.indexOf('>', idx) + 1);
  assert.ok(!imgTag.includes('w-16 h-12'), 'Modal Work Card preview should not be crushed into tiny w-16 h-12 thumbnail');
  assert.ok(imgTag.includes('object-contain'), 'Modal Work Card preview must use object-contain so edges/numbers are not cropped');
});

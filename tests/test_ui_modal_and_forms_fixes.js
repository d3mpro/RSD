const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

test('Form Signatures: رئيس إدارة السلامة & حذف والأمن الميداني', () => {
  const officialCardPath = path.join(rootDir, 'assets/js/ksu-official-card.js');
  const officialCardContent = fs.readFileSync(officialCardPath, 'utf8');

  // Verify "مشرف الوردية / رئيس الإدارة" was replaced by "رئيس إدارة السلامة"
  assert.ok(
    officialCardContent.includes('رئيس إدارة السلامة'),
    'ksu-official-card.js must contain رئيس إدارة السلامة'
  );
  assert.ok(
    !officialCardContent.includes('مشرف الوردية / رئيس الإدارة'),
    'ksu-official-card.js must not contain مشرف الوردية / رئيس الإدارة'
  );
  assert.ok(
    !officialCardContent.includes('والأمن الميداني'),
    'ksu-official-card.js must not contain والأمن الميداني'
  );

  const aiClientPath = path.join(rootDir, 'assets/js/ksu-ai-client.js');
  const aiClientContent = fs.readFileSync(aiClientPath, 'utf8');

  assert.ok(
    !aiClientContent.includes('مشرف الوردية / رئيس القسم'),
    'ksu-ai-client.js must not contain مشرف الوردية / رئيس القسم'
  );
  assert.ok(
    !aiClientContent.includes('والأمن الميداني'),
    'ksu-ai-client.js must not contain والأمن الميداني'
  );
});

test('Mobile UI: Notification Sheet Stacking & Viewport Fit', () => {
  const fieldHtmlPath = path.join(rootDir, 'field.html');
  const fieldHtml = fs.readFileSync(fieldHtmlPath, 'utf8');

  // Notifications sheet has z-[100] and dynamic dvh height
  assert.ok(
    fieldHtml.includes('id="field-notifications-sheet"') && fieldHtml.includes('z-[100]'),
    'field-notifications-sheet must have z-[100] to sit above bottom nav bar'
  );
  assert.ok(
    fieldHtml.includes('max-h-[85dvh]'),
    'field-notifications-sheet must use dynamic viewport height (dvh)'
  );
  assert.ok(
    fieldHtml.includes('safe-area-inset-bottom'),
    'field-notifications-sheet must have safe-area-inset-bottom clearance'
  );
});

test('Mobile UI: Save Reports Window (newRoundModal) Responsive Fit & Visibility', () => {
  const fieldHtmlPath = path.join(rootDir, 'field.html');
  const fieldHtml = fs.readFileSync(fieldHtmlPath, 'utf8');

  assert.ok(
    fieldHtml.includes('id="newRoundModal"') && fieldHtml.includes('z-[100]'),
    'newRoundModal must have z-[100]'
  );
  assert.ok(
    fieldHtml.includes('h-[100dvh]'),
    'newRoundModal must adapt to 100dvh on mobile so the footer is never pushed off screen'
  );
  assert.ok(
    fieldHtml.includes('حفظ التفتيش واعتماد المحضر الرسمي 🛡️'),
    'Save button must be present in footer'
  );

  // Bottom navigation z-index must be lower than modals
  assert.ok(
    fieldHtml.includes('ksu-mobile-nav') && fieldHtml.includes('z-index: 40 !important'),
    'ksu-mobile-nav must have z-index: 40 so modals with z-100 stack cleanly above it'
  );
});

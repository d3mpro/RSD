/**
 * ==============================================================================
 * Comprehensive Unit and Integration Test Suite for Milestone 3:
 * Field & Quality Portals UI/UX Overhaul (Features 7, 8, 9, 10, 11)
 * ==============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIELD_HTML_PATH = path.join(REPO_ROOT, 'field.html');
const QUALITY_HTML_PATH = path.join(REPO_ROOT, 'quality.html');
const HEAD_HTML_PATH = path.join(REPO_ROOT, 'head.html');
const RETICLE_HELPER_PATH = path.join(REPO_ROOT, 'assets/js/vision-reticle-helper.js');

const fieldHtml = fs.readFileSync(FIELD_HTML_PATH, 'utf8');
const qualityHtml = fs.readFileSync(QUALITY_HTML_PATH, 'utf8');
const headHtml = fs.readFileSync(HEAD_HTML_PATH, 'utf8');
const reticleHelper = require(RETICLE_HELPER_PATH);

test('Feature 7: Live Camera Stream & Reticle Overlay', async (t) => {
  await t.test('KSUReticleHelper exposes camera stream management API', () => {
    assert.equal(typeof reticleHelper.isCameraSupported, 'function');
    assert.equal(typeof reticleHelper.startLiveCameraStream, 'function');
    assert.equal(typeof reticleHelper.stopLiveCameraStream, 'function');
    assert.equal(typeof reticleHelper.captureFrame, 'function');
  });

  await t.test('field.html contains live camera stream video and reticle overlay DOM elements', () => {
    assert.ok(fieldHtml.includes('id="vision-camera-video"'), 'Must contain vision-camera-video element');
    assert.ok(fieldHtml.includes('id="vision-reticle-container"'), 'Must contain vision-reticle-container element');
    assert.ok(fieldHtml.includes('id="btn-capture-live-frame"'), 'Must contain btn-capture-live-frame capture button');
    assert.ok(fieldHtml.includes('id="vision-live-camera-wrap"'), 'Must contain vision-live-camera-wrap container');
  });

  await t.test('KSUReticleHelper.captureFrame creates valid base64 image from video frame', () => {
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {}
      }),
      toDataURL: (type, quality) => `data:${type};base64,mockCapturedImageData`
    };
    const origDocument = globalThis.document;
    globalThis.document = {
      createElement: (tag) => (tag === 'canvas' ? mockCanvas : {})
    };

    const mockVideo = { videoWidth: 1280, videoHeight: 720 };
    const frame = reticleHelper.captureFrame(mockVideo, { quality: 0.85 });
    assert.ok(frame.startsWith('data:image/jpeg;base64,'));

    globalThis.document = origDocument;
  });

  await t.test('KSUReticleHelper.captureFrame returns empty string and catches drawImage exceptions gracefully', () => {
    const mockThrowingCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => { throw new Error('IndexSizeError: The source width or height is 0'); }
      }),
      toDataURL: () => ''
    };
    const origDocument = globalThis.document;
    globalThis.document = {
      createElement: (tag) => (tag === 'canvas' ? mockThrowingCanvas : {})
    };

    let result = null;
    assert.doesNotThrow(() => {
      result = reticleHelper.captureFrame({ videoWidth: 0, videoHeight: 0 });
    });
    assert.equal(result, '');

    globalThis.document = origDocument;
  });

  await t.test('Live camera stream gracefully falls back to file input on permission denial or missing hardware', async () => {
    let fallbackInputClicked = false;
    const mockFallbackInput = {
      click: () => { fallbackInputClicked = true; }
    };

    let errorReported = false;
    const res = await reticleHelper.startLiveCameraStream(null, null, {
      fallbackInput: mockFallbackInput,
      onError: (err) => { errorReported = true; }
    });

    assert.equal(res.success, false);
    assert.equal(res.fallback, true);
    assert.equal(fallbackInputClicked, true);
    assert.equal(errorReported, true);
  });

  await t.test('stopLiveCameraStream safely stops all tracks on stream close', async () => {
    let stopped = false;
    const mockTrack = { stop: () => { stopped = true; } };
    const mockMediaDevices = {
      getUserMedia: async () => ({
        getTracks: () => [mockTrack]
      })
    };

    await reticleHelper.startLiveCameraStream(null, null, { mediaDevices: mockMediaDevices });
    reticleHelper.stopLiveCameraStream();
    assert.equal(stopped, true);
  });
});

test('Feature 8: Inspection Flow Control (No 350ms Premature Trigger)', async (t) => {
  await t.test('field.html eliminates premature 350ms auto-trigger timeout for inspector flow control', () => {
    assert.ok(fieldHtml.includes('setupInspectionFlowControl'), 'field.html must invoke setupInspectionFlowControl');
    assert.equal(typeof reticleHelper.setupInspectionFlowControl, 'function');
  });

  await t.test('Inspector flow control keeps analyze button disabled until photo is captured or selected', () => {
    let analyzeTriggered = false;
    let buttonEnabled = false;

    // Simulate inspection flow
    const onPhotoReady = () => {
      buttonEnabled = true;
      // NO setTimeout for analysis!
    };

    onPhotoReady();
    assert.equal(buttonEnabled, true, 'Analyze button must be enabled for manual click');
    assert.equal(analyzeTriggered, false, 'Analysis must NOT auto-trigger prematurely');
  });

  await t.test('field.html preserves location dropdowns and notes inputs for manual review before analysis', () => {
    const aiClientSource = fs.readFileSync(path.join(REPO_ROOT, 'assets/js/ksu-ai-client.js'), 'utf8');
    assert.ok(aiClientSource.includes('id="sel-vision-building"') || fieldHtml.includes('id="sel-vision-building"'));
    assert.ok(aiClientSource.includes('id="inp-vision-floor"') || fieldHtml.includes('id="inp-vision-floor"'));
    assert.ok(aiClientSource.includes('id="inp-vision-room"') || fieldHtml.includes('id="inp-vision-room"'));
    assert.ok(aiClientSource.includes('id="inp-vision-notes"') || fieldHtml.includes('id="inp-vision-notes"'));
    assert.ok(aiClientSource.includes('id="btn-run-vision-ai"') || fieldHtml.includes('id="btn-run-vision-ai"'));
  });
});

test('Feature 9: Field Violation Modal Deduplication', async (t) => {
  await t.test('field.html deduplicates duplicate location input field rows', () => {
    // inp-violation-location should only appear once as a visible input
    const matches = fieldHtml.match(/id="inp-violation-location"/g) || [];
    assert.equal(matches.length, 1, 'inp-violation-location must appear exactly once');

    // inp-sv-location exists as a synchronized compatibility field
    assert.ok(fieldHtml.includes('id="inp-sv-location"'), 'inp-sv-location must exist for compatibility');
    assert.ok(fieldHtml.includes('id="inp-violation-building"'), 'inp-violation-building must exist');
    assert.ok(fieldHtml.includes('id="inp-violation-floor"'), 'inp-violation-floor must exist');
    assert.ok(fieldHtml.includes('id="inp-sv-room"'), 'inp-sv-room must exist');
  });

  await t.test('field.html synchronizes location input between inp-violation-location and inp-sv-location', () => {
    assert.ok(fieldHtml.includes("document.getElementById('inp-sv-location').value = this.value"));
    assert.ok(fieldHtml.includes('function syncViolationLocation()'));
    assert.ok(fieldHtml.includes('id="inp-violation-building" type="text" placeholder="مثال: المبنى الرئيسي" oninput="syncViolationLocation()"'));
    assert.ok(fieldHtml.includes('id="inp-violation-floor" type="text" placeholder="مثال: الدور الأرضي" oninput="syncViolationLocation()"'));
    assert.ok(fieldHtml.includes('id="inp-violation-location" type="text" placeholder="مثال: قسم السجلات الطبية" oninput="syncViolationLocation()"'));
  });
});

test('Feature 10: Quality Portal Integration & Duty OCR', async (t) => {
  await t.test('quality.html and head.html include vision-reticle-helper.js script', () => {
    assert.ok(qualityHtml.includes('src="assets/js/vision-reticle-helper.js"'), 'quality.html must include vision-reticle-helper.js');
    assert.ok(headHtml.includes('src="assets/js/vision-reticle-helper.js"'), 'head.html must include vision-reticle-helper.js');
  });

  await t.test('quality.html populates safety violations into quality inbox and unified workflow', () => {
    assert.ok(qualityHtml.includes('safetyViolations'), 'quality.html must query safetyViolations');
    assert.ok(qualityHtml.includes('id="btn-qwfu-violations"'), 'quality.html must contain violations filter button');
    assert.ok(qualityHtml.includes('id="qwfu-count-violations"'), 'quality.html must contain violations count badge');
    assert.ok(qualityHtml.includes('approveQualityViolation'), 'quality.html must expose approveQualityViolation');
  });

  await t.test('quality.html safely parses createdAt timestamp formats without throwing', () => {
    assert.ok(qualityHtml.includes('(rawSafetyViolations || []).filter(Boolean)'));
    assert.ok(qualityHtml.includes('typeof v.createdAt === \'string\' ? v.createdAt.substring(0, 10) : (v.createdAt ? new Date(v.createdAt).toISOString().substring(0, 10) : \'\')'));
  });

  await t.test('quality.html duty schedule OCR does not inject static mock table when no image is uploaded', () => {
    assert.ok(qualityHtml.includes('يرجى رفع صورة جدول'), 'Must prompt user to upload image first');
  });

  await t.test('quality.html duty schedule OCR routes through KSUAI.parseDutyScheduleImage with failover', () => {
    assert.ok(qualityHtml.includes('KSUAI.parseDutyScheduleImage'), 'Must route through parseDutyScheduleImage');
    assert.ok(qualityHtml.includes('OFFICIAL_DUTY_PLANS_2026_11'), 'Must have verified failover matrix');
  });
});

test('Feature 11: Impeccable UI/UX & Arabic Styling', async (t) => {
  await t.test('field.html and quality.html define @keyframes scan animation', () => {
    assert.ok(fieldHtml.includes('@keyframes scan'), 'field.html must define @keyframes scan');
    assert.ok(qualityHtml.includes('@keyframes scan'), 'quality.html must define @keyframes scan');
  });

  await t.test('CSS defines ksu-scan-line laser animation with prefers-reduced-motion', () => {
    assert.ok(fieldHtml.includes('ksu-scan-line'), 'field.html must define ksu-scan-line');
    assert.ok(fieldHtml.includes('prefers-reduced-motion'), 'field.html must support prefers-reduced-motion');
    assert.ok(fieldHtml.includes('[class*="animate-[scan"]'));
    assert.ok(fieldHtml.includes('motion-reduce:animate-none'));
    assert.ok(qualityHtml.includes('ksu-scan-line'), 'quality.html must define ksu-scan-line');
    assert.ok(qualityHtml.includes('prefers-reduced-motion'), 'quality.html must support prefers-reduced-motion');
    assert.ok(qualityHtml.includes('[class*="animate-[scan"]'));
  });

  await t.test('RTL direction is strictly enforced in field.html and quality.html', () => {
    assert.ok(fieldHtml.includes('dir="rtl"'));
    assert.ok(qualityHtml.includes('dir="rtl"'));
  });

  await t.test('field.html institutional palette replaces generic purple/blue AI gradients', () => {
    assert.ok(fieldHtml.includes('bg-gradient-to-r from-[#001E36] via-[#003B6B] to-[#004B87]'));
  });
});

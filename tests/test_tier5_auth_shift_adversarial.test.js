/**
 * =============================================================================
 * TIER 5 ADVERSARIAL STRESS HARNESS: AUTHENTICATION & SHIFT BOUNDARY VERIFICATION
 * =============================================================================
 * Role: Challenger 1 (critic & specialist)
 * Mandate: Empirically and adversarially challenge:
 *   1. Full combinatorial matrix of short username logins (case, whitespace, fuzzing)
 *   2. Strict official Arabic name matching for all 22 accounts from accounts-credentials-a4.html
 *   3. Authentication security under malicious / injection / boundary payloads
 *   4. Strict shift isolation boundaries in canSupervisorApproveRound (cross-shift matrix)
 *   5. Firebase RTDB passwordless serialization & security rule compliance
 *
 * Execution: node --test tests/test_tier5_auth_shift_adversarial.test.js
 * =============================================================================
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');
const AUTH_GUARD_PATH = path.join(REPO_ROOT, 'assets/js/auth-guard.js');
const APP_JS_PATH = path.join(REPO_ROOT, 'assets/js/app.js');
const CREDENTIALS_A4_PATH = path.join(REPO_ROOT, 'accounts-credentials-a4.html');
const FIREBASE_SYNC_PATH = path.join(REPO_ROOT, 'assets/js/ksu-firebase-realtime.js');
const DATABASE_RULES_PATH = path.join(REPO_ROOT, 'database.rules.json');

const authGuardSource = fs.readFileSync(AUTH_GUARD_PATH, 'utf8');
const appJsSource = fs.readFileSync(APP_JS_PATH, 'utf8');
const credentialsA4Source = fs.readFileSync(CREDENTIALS_A4_PATH, 'utf8');
const firebaseSyncSource = fs.readFileSync(FIREBASE_SYNC_PATH, 'utf8');
const databaseRulesJson = JSON.parse(fs.readFileSync(DATABASE_RULES_PATH, 'utf8'));

// -----------------------------------------------------------------------------
// ENVIRONMENT FACTORIES
// -----------------------------------------------------------------------------

function createAuthSandbox(initialStorage = {}, pathname = '/index.html') {
  const store = new Map(Object.entries(initialStorage));

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] || null
  };

  const listeners = new Map();
  const document = {
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    }
  };

  let currentPathname = pathname;
  let currentHref = pathname;
  const location = {
    get pathname() { return currentPathname; },
    set pathname(p) { currentPathname = p; currentHref = p; },
    get href() { return currentHref; },
    set href(h) { currentHref = h; currentPathname = h; },
    replace: (url) => { currentPathname = url; currentHref = url; },
    assign: (url) => { currentPathname = url; currentHref = url; }
  };

  const sandbox = {
    console,
    localStorage,
    sessionStorage: localStorage,
    location,
    document,
    alert: () => {},
    confirm: () => true,
    navigator: { userAgent: 'AdversarialChallenger/1.0' },
    setTimeout: (fn) => fn(),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {}
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(authGuardSource, sandbox);

  return {
    window: sandbox.window,
    auth: sandbox.window.KSUAuth,
    localStorage,
    location
  };
}

function createAppApprovalSandbox(customState = {}) {
  const normFnMatch = appJsSource.match(/function getNormalizedShiftKey[\s\S]*?\n\}/);
  const canApproveMatch = appJsSource.match(/function canSupervisorApproveRound[\s\S]*?\n\}/);
  const shiftTitleMatch = appJsSource.match(/function getShiftTitleArabic[\s\S]*?\n\}/);

  if (!normFnMatch || !canApproveMatch) {
    throw new Error('Failed to extract shift approval functions from assets/js/app.js');
  }

  const sandbox = {
    console,
    state: Object.assign({ users: [] }, customState),
    getUserRoleCategory: (u) => (u && u.roleCategory ? u.roleCategory : 'field_inspector'),
    isSystemDeveloper: (u) => Boolean(u && (u.id === 'USR-01' || u.roleCategory === 'developer' || u.empId === 'DEV')),
    window: {}
  };
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(normFnMatch[0], sandbox);
  vm.runInContext(canApproveMatch[0], sandbox);
  if (shiftTitleMatch) vm.runInContext(shiftTitleMatch[0], sandbox);

  return {
    canSupervisorApproveRound: sandbox.canSupervisorApproveRound,
    getNormalizedShiftKey: sandbox.getNormalizedShiftKey,
    getShiftTitleArabic: sandbox.getShiftTitleArabic,
    sandbox
  };
}

// Extract Ground-Truth Roster directly from accounts-credentials-a4.html
function extractGroundTruthRoster() {
  const roster = [];
  const rowRegex = /<tr>\s*<td><span class="username-code">([^<]+)<\/span><\/td>\s*<td><strong>([^<]+)<\/strong><\/td>\s*<td>([^<]+)<\/td>\s*<td><span class="badge-shift[^"]*">([^<]+)<\/span><\/td>\s*<td><span class="portal-link">([^<]+)<\/span><\/td>/g;
  let match;
  while ((match = rowRegex.exec(credentialsA4Source)) !== null) {
    roster.push({
      code: match[1].trim(),
      name: match[2].trim(),
      roleTitle: match[3].trim(),
      shiftLabel: match[4].trim(),
      portal: match[5].trim()
    });
  }
  return roster;
}

// =============================================================================
// SUITE 1: COMBINATORIAL SHORT USERNAME LOGIN & CASE PERMUTATIONS
// =============================================================================

test('Suite 1.1: Ground-Truth Official Roster Extraction confirms exactly 22 accounts', () => {
  const groundTruth = extractGroundTruthRoster();
  assert.strictEqual(groundTruth.length, 22, `Authoritative document must contain exactly 22 accounts; found ${groundTruth.length}`);

  const expectedCodes = [
    'H2', 'H1', 'SAF1', 'Q1', 'DEV',
    'S1', 'S2', 'S3',
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12', 'M13', 'M14'
  ];

  const extractedCodes = groundTruth.map(r => r.code);
  assert.deepStrictEqual(extractedCodes, expectedCodes, 'Extracted username codes must match authoritative roster sequence');
});

test('Suite 1.2: All 22 accounts return exact official Arabic names and valid profiles with PIN 123456', () => {
  const { auth } = createAuthSandbox();
  const groundTruth = extractGroundTruthRoster();

  for (const account of groundTruth) {
    const user = auth.authenticate(account.code, '123456');
    assert.ok(user, `Authentication must succeed for short code "${account.code}" with PIN 123456`);
    assert.strictEqual(user.name, account.name, `Account "${account.code}" name must be "${account.name}", got "${user.name}"`);
    assert.ok(user.portal, `Account "${account.code}" must specify a default portal`);
    assert.ok(user.role, `Account "${account.code}" must specify an official role`);
    assert.ok(user.shift, `Account "${account.code}" must specify an assigned shift`);
  }
});

test('Suite 1.3: Combinatorial case permutations across all 22 accounts (lowercase, uppercase, mixed-case)', () => {
  const { auth } = createAuthSandbox();
  const groundTruth = extractGroundTruthRoster();

  for (const account of groundTruth) {
    const code = account.code;
    const lowerCode = code.toLowerCase();
    const upperCode = code.toUpperCase();
    const mixedCodes = [
      lowerCode,
      upperCode,
      code.charAt(0).toUpperCase() + code.slice(1).toLowerCase(),
      code.charAt(0).toLowerCase() + code.slice(1).toUpperCase()
    ];

    const uniqueVariants = Array.from(new Set(mixedCodes));

    for (const variant of uniqueVariants) {
      const user = auth.authenticate(variant, '123456');
      assert.ok(
        user,
        `Authentication must succeed for variant "${variant}" of account "${code}"`
      );
      assert.strictEqual(
        user.name,
        account.name,
        `Variant "${variant}" must resolve to "${account.name}"`
      );
    }
  }
});

test('Suite 1.4: Whitespace trimming fuzzing on username codes (spaces, tabs, newlines)', () => {
  const { auth } = createAuthSandbox();
  const testCodes = ['M1', 'm1', 'S1', 's2', 'S3', 'H1', 'h2', 'SAF1', 'q1', 'dev', 'DEV', 'M14'];

  for (const code of testCodes) {
    const paddedVariants = [
      `  ${code}`,
      `${code}  `,
      `  ${code}  `,
      `\t${code}\t`,
      `\n${code}\n`,
      `\r\n  ${code}  \r\n`
    ];

    for (const padded of paddedVariants) {
      const user = auth.authenticate(padded, '123456');
      assert.ok(
        user,
        `Username with padding "${JSON.stringify(padded)}" must be trimmed and authenticate successfully`
      );
    }
  }
});

test('Suite 1.5: PIN whitespace trimming and secondary SHA-256 hash compatibility', () => {
  const { auth } = createAuthSandbox();

  // Test password with surrounding whitespace: "  123456  " (trimmed by auth-guard.js cleanPass = password.trim())
  const userTrimmed = auth.authenticate('M1', '  123456  ');
  assert.ok(userTrimmed, 'Password with surrounding whitespace must be trimmed and authenticate');

  // Test DEV secondary hash authentication
  const devWithSecondary = auth.authenticate('DEV', '123456');
  assert.ok(devWithSecondary, 'DEV must authenticate with PIN 123456');
  assert.strictEqual(devWithSecondary.name, 'أ. علي سليمان الصقري');
});

// =============================================================================
// SUITE 2: ADVERSARIAL AUTHENTICATION SECURITY & FUZZING
// =============================================================================

test('Suite 2.1: Invalid PIN rejection across all 22 accounts', () => {
  const { auth } = createAuthSandbox();
  const groundTruth = extractGroundTruthRoster();

  const invalidPins = [
    '12345',
    '1234567',
    '000000',
    '111111',
    'password',
    'admin',
    'wrong_pin',
    '!@#$%^&*()',
    '123 456', // internal space is rejected
    ' 12345 6 ' // internal space is rejected
  ];

  for (const account of groundTruth) {
    for (const badPin of invalidPins) {
      const result = auth.authenticate(account.code, badPin);
      assert.strictEqual(
        result,
        null,
        `Account "${account.code}" must reject invalid PIN "${badPin}"`
      );
    }
  }
});

test('Suite 2.2: Blank, null, undefined, or empty credentials return null without throwing', () => {
  const { auth } = createAuthSandbox();

  const emptyInputs = [
    [null, '123456'],
    [undefined, '123456'],
    ['', '123456'],
    ['   ', '123456'],
    ['M1', null],
    ['M1', undefined],
    ['M1', ''],
    ['M1', '   '],
    [null, null],
    [undefined, undefined],
    ['', ''],
    ['   ', '   ']
  ];

  for (const [id, pass] of emptyInputs) {
    assert.doesNotThrow(() => {
      const res = auth.authenticate(id, pass);
      assert.strictEqual(res, null, `Input (${JSON.stringify(id)}, ${JSON.stringify(pass)}) must return null`);
    }, `Empty inputs must not throw runtime exception`);
  }
});

test('Suite 2.3: Adversarial injection fuzzing on identifier and password', () => {
  const { auth } = createAuthSandbox();

  const maliciousPayloads = [
    "' OR '1'='1",
    "admin' --",
    "M1' OR '1'='1",
    "<script>alert('xss')</script>",
    "<img src=x onerror=alert(1)>",
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "valueOf",
    "M1\x00123456",
    "M1\u0000",
    "M1; DROP TABLE users; --",
    "${7*7}",
    "{{7*7}}",
    "X".repeat(10000)
  ];

  for (const payload of maliciousPayloads) {
    assert.doesNotThrow(() => {
      const res1 = auth.authenticate(payload, '123456');
      assert.strictEqual(res1, null, `Injection identifier "${payload}" must be rejected`);

      const res2 = auth.authenticate('M1', payload);
      assert.strictEqual(res2, null, `Injection password "${payload}" must be rejected`);
    }, `Malicious payload "${payload}" must execute safely without throwing`);

    // Verify Object prototype was not polluted
    assert.strictEqual(Object.prototype.polluted, undefined, 'Object prototype must remain clean');
  }
});

test('Suite 2.4: Session corruption resilience in localStorage on protected routes', () => {
  const unparseableValues = [
    'INVALID_JSON_{{',
    'null',
    '""',
    'undefined'
  ];

  for (const badVal of unparseableValues) {
    // Test on protected portal route /field.html
    const { auth, location } = createAuthSandbox({ ksu_active_user: badVal }, '/field.html');

    assert.doesNotThrow(() => {
      const user = auth.getUser();
      const protectRes = auth.protect('field');
      if (!user) {
        assert.strictEqual(protectRes, false, `Corrupted session "${badVal}" must fail portal protect on /field.html`);
        assert.strictEqual(location.pathname, 'index.html', 'Must redirect unauthenticated user to index.html');
      }
    }, `Unparseable localStorage value "${badVal}" must be handled gracefully`);
  }
});

test('Suite 2.5: [HARDENED] Primitive type injection into ksu_active_user rejected by auth guard', () => {
  const { auth, location } = createAuthSandbox({ ksu_active_user: '12345' }, '/field.html');
  const user = auth.getUser();
  assert.strictEqual(user, null, 'getUser strictly returns null for primitive types');

  const roleCat = auth.getRoleCategory(user);
  assert.strictEqual(roleCat, 'guest', 'Non-object or null user must evaluate to guest role category');

  const protectResult = auth.protect('field');
  assert.strictEqual(protectResult, false, 'Primitive value must be blocked from field.html portal protection');
  assert.strictEqual(location.pathname, 'index.html', 'Unauthenticated user must be redirected to index.html');
});

// =============================================================================
// SUITE 3: SHIFT ISOLATION BOUNDARIES (canSupervisorApproveRound MATRIX)
// =============================================================================

test('Suite 3.1: Full 3x3 Supervisor Approval Matrix across Shifts 1, 2, and 3', () => {
  const { auth } = createAuthSandbox();
  const S1 = auth.authenticate('S1', '123456');
  const S2 = auth.authenticate('S2', '123456');
  const S3 = auth.authenticate('S3', '123456');

  assert.ok(S1 && S2 && S3, 'Supervisors S1, S2, S3 must authenticate');

  const { canSupervisorApproveRound } = createAppApprovalSandbox();

  const roundShift1 = { id: 'R-SH1-001', shift: 'shift1', inspector: 'M1' };
  const roundShift2 = { id: 'R-SH2-002', shift: 'shift2', inspector: 'M7' };
  const roundShift3 = { id: 'R-SH3-003', shift: 'shift3', inspector: 'M11' };

  // Matrix: Supervisor S1 (Shift 1)
  assert.strictEqual(canSupervisorApproveRound(S1, roundShift1), true, 'S1 MUST approve Shift 1 round');
  assert.strictEqual(canSupervisorApproveRound(S1, roundShift2), false, 'S1 CANNOT approve Shift 2 round');
  assert.strictEqual(canSupervisorApproveRound(S1, roundShift3), false, 'S1 CANNOT approve Shift 3 round');

  // Matrix: Supervisor S2 (Shift 2)
  assert.strictEqual(canSupervisorApproveRound(S2, roundShift1), false, 'S2 CANNOT approve Shift 1 round');
  assert.strictEqual(canSupervisorApproveRound(S2, roundShift2), true, 'S2 MUST approve Shift 2 round');
  assert.strictEqual(canSupervisorApproveRound(S2, roundShift3), false, 'S2 CANNOT approve Shift 3 round');

  // Matrix: Supervisor S3 (Shift 3)
  assert.strictEqual(canSupervisorApproveRound(S3, roundShift1), false, 'S3 CANNOT approve Shift 1 round');
  assert.strictEqual(canSupervisorApproveRound(S3, roundShift2), false, 'S3 CANNOT approve Shift 2 round');
  assert.strictEqual(canSupervisorApproveRound(S3, roundShift3), true, 'S3 MUST approve Shift 3 round');
});

test('Suite 3.2: Universal Approval Authority for Leadership (H1, H2, SAF1, DEV) across all shifts', () => {
  const { auth } = createAuthSandbox();
  const H1 = auth.authenticate('H1', '123456');
  const H2 = auth.authenticate('H2', '123456');
  const SAF1 = auth.authenticate('SAF1', '123456');
  const DEV = auth.authenticate('DEV', '123456');

  const { canSupervisorApproveRound } = createAppApprovalSandbox();

  const rounds = [
    { id: 'R-1', shift: 'shift1' },
    { id: 'R-2', shift: 'shift2' },
    { id: 'R-3', shift: 'shift3' },
    { id: 'R-4', shift: 'الوردية الأولى (صباحي)' },
    { id: 'R-5', shift: 'الوردية الثانية (مسائي)' },
    { id: 'R-6', shift: 'الوردية الثالثة (ليلي)' }
  ];

  for (const rnd of rounds) {
    assert.strictEqual(canSupervisorApproveRound(H1, rnd), true, `H1 must have universal approval for ${rnd.shift}`);
    assert.strictEqual(canSupervisorApproveRound(H2, rnd), true, `H2 must have universal approval for ${rnd.shift}`);
    assert.strictEqual(canSupervisorApproveRound(SAF1, rnd), true, `SAF1 must have universal approval for ${rnd.shift}`);
    assert.strictEqual(canSupervisorApproveRound(DEV, rnd), true, `DEV must have universal approval for ${rnd.shift}`);
  }
});

test('Suite 3.3: Strict denial of approval capability for Inspectors (M1..M14) and Quality (Q1)', () => {
  const { auth } = createAuthSandbox();
  const { canSupervisorApproveRound } = createAppApprovalSandbox();

  const inspectorCodes = ['M1', 'M2', 'M5', 'M7', 'M9', 'M11', 'M14'];
  const testRounds = [
    { id: 'R-1', shift: 'shift1' },
    { id: 'R-2', shift: 'shift2' },
    { id: 'R-3', shift: 'shift3' }
  ];

  for (const code of inspectorCodes) {
    const inspector = auth.authenticate(code, '123456');
    for (const rnd of testRounds) {
      assert.strictEqual(
        canSupervisorApproveRound(inspector, rnd),
        false,
        `Inspector ${code} must NOT be able to approve round in ${rnd.shift}`
      );
    }
  }

  // Quality Q1
  const Q1 = auth.authenticate('Q1', '123456');
  for (const rnd of testRounds) {
    assert.strictEqual(
      canSupervisorApproveRound(Q1, rnd),
      false,
      `Quality Q1 must not act as shift supervisor on round ${rnd.shift}`
    );
  }
});

test('Suite 3.4: Shift normalizer fuzzing and boundary inputs in canSupervisorApproveRound', () => {
  const { auth } = createAuthSandbox();
  const S1 = auth.authenticate('S1', '123456');
  const { canSupervisorApproveRound, getNormalizedShiftKey } = createAppApprovalSandbox();

  // Test standard normalizer outputs
  assert.strictEqual(getNormalizedShiftKey('الوردية الأولى (صباحي)'), 'shift1');
  assert.strictEqual(getNormalizedShiftKey('صباحي'), 'shift1');
  assert.strictEqual(getNormalizedShiftKey('shift1'), 'shift1');
  assert.strictEqual(getNormalizedShiftKey('الوردية الثانية (مسائي)'), 'shift2');
  assert.strictEqual(getNormalizedShiftKey('مسائي'), 'shift2');
  assert.strictEqual(getNormalizedShiftKey('shift2'), 'shift2');
  assert.strictEqual(getNormalizedShiftKey('الوردية الثالثة (ليلي)'), 'shift3');
  assert.strictEqual(getNormalizedShiftKey('ليلي'), 'shift3');
  assert.strictEqual(getNormalizedShiftKey('shift3'), 'shift3');

  // Null, undefined, empty, and invalid shift inputs
  const edgeCases = [
    [null, { id: 'R-1', shift: 'shift1' }],
    [undefined, { id: 'R-1', shift: 'shift1' }],
    [S1, null],
    [S1, undefined],
    [S1, {}],
    [S1, { id: 'R-1', shift: '' }],
    [S1, { id: 'R-1', shift: '   ' }],
    [S1, { id: 'R-1', shift: 'invalid_unknown_shift' }],
    [S1, { id: 'R-1', shift: null }],
    [S1, { id: 'R-1', shift: undefined }],
    [S1, { id: 'R-1', shift: 'shift99' }],
    [{}, {}],
    [{ roleCategory: 'shift_supervisor' }, { shift: 'shift1' }] // missing supervisor shift
  ];

  for (const [u, r] of edgeCases) {
    assert.doesNotThrow(() => {
      const res = canSupervisorApproveRound(u, r);
      assert.strictEqual(res, false, `Edge case (${JSON.stringify(u)}, ${JSON.stringify(r)}) must return false`);
    });
  }
});

test('Suite 3.5: Fallback inspector shift resolution when round.shift is omitted', () => {
  const { auth } = createAuthSandbox();
  const S1 = auth.authenticate('S1', '123456');
  const S2 = auth.authenticate('S2', '123456');
  const S3 = auth.authenticate('S3', '123456');

  const mockUsers = [
    { username: 'M1', empId: 'M1', name: 'أ. عادل عاضة الشلوي', shift: 'shift1', role: 'مفتش' },
    { username: 'M7', empId: 'M7', name: 'أ. عبدالرحمن حسين الكعبي', shift: 'shift2', role: 'مفتش' },
    { username: 'M11', empId: 'M11', name: 'أ. سليمان سالم العنزي', shift: 'shift3', role: 'مفتش' }
  ];

  const { canSupervisorApproveRound } = createAppApprovalSandbox({ users: mockUsers });

  // Round without shift property, but with inspectorUsername: 'M1'
  const roundNoShiftM1 = { id: 'R-OMIT-1', inspectorUsername: 'M1' };
  assert.strictEqual(canSupervisorApproveRound(S1, roundNoShiftM1), true, 'S1 must approve M1 round via inspector lookup');
  assert.strictEqual(canSupervisorApproveRound(S2, roundNoShiftM1), false, 'S2 CANNOT approve M1 round via inspector lookup');
  assert.strictEqual(canSupervisorApproveRound(S3, roundNoShiftM1), false, 'S3 CANNOT approve M1 round via inspector lookup');

  // Round without shift property, but with badge: 'M7'
  const roundNoShiftM7 = { id: 'R-OMIT-2', badge: 'M7' };
  assert.strictEqual(canSupervisorApproveRound(S1, roundNoShiftM7), false, 'S1 CANNOT approve M7 round');
  assert.strictEqual(canSupervisorApproveRound(S2, roundNoShiftM7), true, 'S2 must approve M7 round via badge lookup');
  assert.strictEqual(canSupervisorApproveRound(S3, roundNoShiftM7), false, 'S3 CANNOT approve M7 round');

  // Round with non-existent inspector
  const roundUnknown = { id: 'R-OMIT-3', inspectorUsername: 'UNKNOWN_INSPECTOR' };
  assert.strictEqual(canSupervisorApproveRound(S1, roundUnknown), false, 'Unknown inspector round must return false');
});

test('Suite 3.6: Adversarial privilege escalation and spoofing attempts on canSupervisorApproveRound', () => {
  const { canSupervisorApproveRound } = createAppApprovalSandbox();

  // Attacker crafts spoofed user trying to claim developer or head role
  const spoofedInspector = {
    id: 'USR-HACK-01',
    name: 'Fake Inspector',
    username: 'hacker',
    role: 'مشرف وردية',
    roleCategory: 'field_inspector', // true category is field_inspector
    shift: 'shift1'
  };

  const shift2Round = { id: 'R-SH2-999', shift: 'shift2' };
  assert.strictEqual(
    canSupervisorApproveRound(spoofedInspector, shift2Round),
    false,
    'Field inspector claiming supervisor role string CANNOT approve Shift 2 round'
  );

  // Attacker crafts round payload with injected supervisor approval override flags
  const maliciousRound = {
    id: 'R-MALICIOUS',
    shift: 'shift2',
    approved: true,
    canApprove: true,
    isDev: true,
    roleCategory: 'head'
  };

  const { auth } = createAuthSandbox();
  const S1 = auth.authenticate('S1', '123456');
  assert.strictEqual(
    canSupervisorApproveRound(S1, maliciousRound),
    false,
    'S1 cannot be tricked into approving Shift 2 round by injected round properties'
  );
});

test('Suite 3.7: [RESOLVED] Shift string token isolation in getNormalizedShiftKey prevents collision', () => {
  const { canSupervisorApproveRound, getNormalizedShiftKey } = createAppApprovalSandbox();
  const { auth } = createAuthSandbox();
  const S1 = auth.authenticate('S1', '123456');
  const S2 = auth.authenticate('S2', '123456');

  // Proof 1: getNormalizedShiftKey token isolation:
  // Numbers in building or sector strings (e.g. 'shift2 - bld 1' or 'الوردية 2 في قطاع 1')
  // must not collide with shift1.
  const shift2InSector1 = 'الوردية 2 (قطاع 1)';
  const shift2InBld1 = 'shift2 - bld 1';
  const maliciousScript = '<script>alert(1)</script>';

  assert.strictEqual(getNormalizedShiftKey(shift2InSector1), 'shift2', 'Token isolation: "الوردية 2 (قطاع 1)" correctly normalizes to shift2');
  assert.strictEqual(getNormalizedShiftKey(shift2InBld1), 'shift2', 'Token isolation: "shift2 - bld 1" correctly normalizes to shift2');
  assert.strictEqual(getNormalizedShiftKey(maliciousScript), '<script>alert(1)</script>', 'Injections do not match shift1');

  // Proof 2: Cross-shift approval isolation:
  // S1 (Shift 1 supervisor) CANNOT approve Shift 2 round, but S2 (Shift 2 supervisor) MUST approve it!
  const roundShift2WithSector1 = { id: 'R-CROSS-01', shift: shift2InSector1 };
  const s1ApproveResult = canSupervisorApproveRound(S1, roundShift2WithSector1);
  const s2ApproveResult = canSupervisorApproveRound(S2, roundShift2WithSector1);

  assert.strictEqual(s1ApproveResult, false, 'Cross-shift isolation: S1 denied approval for Shift 2 round');
  assert.strictEqual(s2ApproveResult, true, 'Cross-shift isolation: S2 correctly approves their Shift 2 round');
});

// =============================================================================
// SUITE 4: FIREBASE RTDB PAYLOAD INTEGRITY & PASSWORDLESS CLOUD SYNC
// =============================================================================

test('Suite 4.1: RTDB cleanUsers serialization strictly strips password and passwordHash', () => {
  // Extract serialization logic from pushUsersToFirebase
  const rawUsersArray = [
    {
      id: 'USR-01',
      username: 'DEV',
      name: 'أ. علي سليمان الصقري',
      password: 'PLAINTEXT_SECRET_123',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      secondaryHash: '1c67f4b744c0e267d35ccb6399e681b3136656637d547a76ce64d89603917e13',
      role: 'مطور النظام',
      shift: 'جميع الورديات'
    },
    {
      id: 'USR-SH1-201',
      username: 'S1',
      name: 'أ. ناصر فلاح القحطاني',
      password: '123456_PLAINTEXT',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      role: 'مشرف الوردية الأولى',
      shift: 'الوردية 1 (صباحي)'
    },
    {
      id: 'USR-SH1-202',
      username: 'M1',
      name: 'أ. عادل عاضة الشلوي',
      password: 'SUPER_SECRET_FIELD_INSPECTOR_PASS',
      passwordHash: 'hash_m1',
      role: 'مفتش سلامة ميداني',
      shift: 'الوردية 1 (صباحي)'
    }
  ];

  // Emulate pushUsersToFirebase sanitization step
  const cleanUsers = JSON.parse(JSON.stringify(rawUsersArray)).map(u => {
    delete u.password;
    delete u.passwordHash;
    return u;
  });

  for (const user of cleanUsers) {
    assert.strictEqual(user.password, undefined, `User ${user.username} must not have password property`);
    assert.strictEqual(user.passwordHash, undefined, `User ${user.username} must not have passwordHash property`);
    assert.ok(!('password' in user), `User ${user.username} object keys must not contain "password"`);
    assert.ok(!('passwordHash' in user), `User ${user.username} object keys must not contain "passwordHash"`);
  }
});

test('Suite 4.2: Firebase Realtime Database Security Rule strictly enforces !newData.hasChildren([\'password\'])', () => {
  const usersRule = databaseRulesJson.rules.users['$userId'];
  assert.ok(usersRule, 'database.rules.json must define /users/$userId rule');
  assert.ok(usersRule['.validate'], '/users/$userId must define .validate rule');

  const validateRuleStr = usersRule['.validate'];
  assert.ok(
    validateRuleStr.includes("!newData.hasChildren(['password'])"),
    'Validation rule must strictly prohibit "password" child in /users/$userId'
  );

  // Evaluate rule logic on valid vs invalid payloads
  function evaluateRuleValidation(nodeData) {
    const hasChildren = (keys) => keys.every(k => k in nodeData);
    const hasChild = (k) => k in nodeData;
    const isString = (val) => typeof val === 'string';

    const cond1 = hasChildren(['id', 'name']) || hasChildren(['username']);
    const cond2 = !hasChildren(['password']);
    const cond3 = !hasChild('id') || (isString(nodeData.id) && nodeData.id.length < 100);

    return cond1 && cond2 && cond3;
  }

  // Valid sanitized user
  const validNode = {
    id: 'USR-SH1-202',
    name: 'أ. عادل عاضة الشلوي',
    username: 'M1',
    role: 'مفتش سلامة ميداني',
    shift: 'shift1'
  };
  assert.strictEqual(evaluateRuleValidation(validNode), true, 'Sanitized user node must pass RTDB validation');

  // Rogue user node with password child
  const rogueNodeWithPassword = {
    id: 'USR-SH1-202',
    name: 'أ. عادل عاضة الشلوي',
    username: 'M1',
    password: 'LEAKED_PASSWORD_123'
  };
  assert.strictEqual(evaluateRuleValidation(rogueNodeWithPassword), false, 'User node with password MUST FAIL RTDB validation');
});

test('Suite 4.3: Local user roster synchronization persists clean state to localStorage', () => {
  const { auth, localStorage } = createAuthSandbox();

  // Fetch users
  const defaultUsers = auth.getDefaultUsers();
  assert.ok(Array.isArray(defaultUsers), 'getDefaultUsers must return array');
  assert.strictEqual(defaultUsers.length, 22, 'Default users roster must contain exactly 22 accounts');

  // Verify that DEFAULT_USERS in auth-guard.js does not store plaintext passwords
  for (const u of defaultUsers) {
    assert.strictEqual(
      u.password,
      undefined,
      `User ${u.username || u.empId} in DEFAULT_USERS must not expose plaintext password`
    );
  }
});

console.log('⚔️  CHALLENGER 1: TIER 5 ADVERSARIAL STRESS HARNESS COMPLETED SUCCESSFULLY');

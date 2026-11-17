/**
 * أداة تعيين Custom Claims لحسابات Firebase Auth في منظومة رصد (KSUMC)
 * تزامن صلاحيات الأدوار (head, admin, developer, executive, quality, shift_supervisor, field_inspector)
 * مع Firebase Custom Claims وربط authUid بسجل المستخدم في قاعدة البيانات.
 *
 * الاستخدام:
 *   npm install firebase-admin
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   export FIREBASE_DATABASE_URL="https://<your-project>.firebaseio.com"
 *   node firebase-auth/custom-claims-setup.js --email user@ksu.edu.sa --role head --empId h1
 *   node firebase-auth/custom-claims-setup.js --sync-db
 */
'use strict';

const admin = require('firebase-admin');

const ALLOWED_ROLES = new Set([
  'head',
  'admin',
  'developer',
  'executive',
  'quality',
  'shift_supervisor',
  'field_inspector'
]);

const HEAD_OR_ADMIN_ROLES = new Set(['head', 'admin', 'developer', 'executive']);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return admin.app();
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  const config = databaseURL ? { credential: admin.credential.applicationDefault(), databaseURL } : {
    credential: admin.credential.applicationDefault()
  };
  return admin.initializeApp(config);
}

async function assignClaimsForUser({ uid, email, role, empId, shift }) {
  const normalizedRole = String(role || 'field_inspector').trim().toLowerCase();
  if (!ALLOWED_ROLES.has(normalizedRole)) {
    throw new Error(`Unsupported role "${role}". Allowed: ${Array.from(ALLOWED_ROLES).join(', ')}`);
  }

  let userRecord = null;
  if (uid) {
    userRecord = await admin.auth().getUser(uid);
  } else if (email) {
    userRecord = await admin.auth().getUserByEmail(email);
  } else {
    throw new Error('Provide either --uid or --email');
  }

  const claims = {
    role: normalizedRole,
    headOrAdmin: HEAD_OR_ADMIN_ROLES.has(normalizedRole),
    empId: empId ? String(empId).trim() : (userRecord.customClaims?.empId || ''),
    shift: shift ? String(shift).trim() : (userRecord.customClaims?.shift || '')
  };

  await admin.auth().setCustomUserClaims(userRecord.uid, claims);
  console.log(`Updated claims for ${userRecord.email || userRecord.uid}:`, claims);
  return { uid: userRecord.uid, claims };
}

async function syncAllUsersFromRTDB() {
  const db = admin.database();
  const snap = await db.ref('users').once('value');
  const usersVal = snap.val();
  if (!usersVal || typeof usersVal !== 'object') {
    console.log('No users found under /users in RTDB.');
    return;
  }

  const entries = Array.isArray(usersVal)
    ? usersVal.map((u, idx) => [String(idx), u])
    : Object.entries(usersVal);

  for (const [key, user] of entries) {
    if (!user || typeof user !== 'object') continue;
    const role = String(user.roleCategory || user.role || 'field_inspector').trim().toLowerCase();
    const mappedRole = ALLOWED_ROLES.has(role) ? role : 'field_inspector';
    const uid = user.authUid || user.uid;
    const email = user.email;

    if (!uid && !email) continue;
    try {
      const res = await assignClaimsForUser({
        uid,
        email,
        role: mappedRole,
        empId: user.empId || user.username || '',
        shift: user.shift || ''
      });
      if (!user.authUid && res.uid) {
        await db.ref(`users/${key}/authUid`).set(res.uid);
      }
    } catch (err) {
      console.warn(`Skipped user "${key}" (${email || uid}): ${err.message}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.email && !args.uid && !args['sync-db'])) {
    console.log([
      'Usage:',
      '  node firebase-auth/custom-claims-setup.js --email <email> --role <role> [--empId <empId>] [--shift <shift>]',
      '  node firebase-auth/custom-claims-setup.js --uid <uid> --role <role> [--empId <empId>]',
      '  node firebase-auth/custom-claims-setup.js --sync-db'
    ].join('\n'));
    return;
  }

  initFirebaseAdmin();
  if (args['sync-db']) {
    await syncAllUsersFromRTDB();
  } else {
    await assignClaimsForUser({
      uid: args.uid,
      email: args.email,
      role: args.role,
      empId: args.empId,
      shift: args.shift
    });
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to assign Custom Claims:', err);
    process.exit(1);
  });
}

module.exports = {
  ALLOWED_ROLES,
  HEAD_OR_ADMIN_ROLES,
  assignClaimsForUser,
  syncAllUsersFromRTDB
};

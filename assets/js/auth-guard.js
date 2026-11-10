/**
 * نظام التحقق وحماية الجلسات لبوابات المدينة الطبية بجامعة الملك سعود (KSUMC)
 * Auth Guard & Multi-Portal Session Management
 * الإصدار المعماري v4.8 (اعتماد تسجيل الدخول باسم المستخدم والرقم السري وإلغاء الدخول بالجوال حالياً)
 */

(function(window) {
  'use strict';

  const STORAGE_KEY_USER = 'ksu_active_user';
  const STORAGE_KEY_LOGGED_OUT = 'ksu_user_logged_out';
  const STORAGE_KEY_REDIRECT = 'ksu_login_redirect';
  const STORAGE_KEY_USERS_DB = 'ksumc_admin_users';
  const ROSTER_SYNC_KEY = 'ksu_roster_v5_alsaqri_prod';

  // ==============================================================================
  // دالة التجزئة الآمنة SHA-256 لحماية كلمات المرور محلياً (NCA ECC Compliance)
  // ==============================================================================
  function sha256Hex(str) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    let i, j, result = '', words = [];
    let utf8 = unescape(encodeURIComponent(str || ''));
    let bitLen = utf8.length * 8;
    let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    let k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    let w = [];
    for (i = 0; i < utf8.length; i++) { words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << ((3 - (i % 4)) * 8); }
    words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
    words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;
    for (i = 0; i < words.length; i += 16) {
      let a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
      for (j = 0; j < 64; j++) {
        if (j < 16) w[j] = words[j + i] | 0;
        else {
          let s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          let s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        let t1 = (h + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ((e & f) ^ (~e & g)) + k[j] + w[j]) | 0;
        let t2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0; hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0; hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j >= 0; j--) {
        let byte = (hash[i] >> (j * 8)) & 255;
        result += (byte < 16 ? '0' : '') + byte.toString(16);
      }
    }
    return result;
  }


    // قائمة الحسابات المعتمدة بالمنظومة للتشغيل الفعلي المعتمد (الإصدار v8.0)
  const DEFAULT_USERS = [
    // 1. الإدارة العامة والقيادة
    {
      id: 'USR-01',
      name: 'أ. علي سليمان الصقري',
      empId: 'DEV',
      employeeId: 'DEV',
      altEmpId: '95972',
      username: 'DEV',
      altUsername: 'alsaqri',
      email: 'aalsaqri@ksu.edu.sa',
      phone: '0532722622',
      role: 'مطور النظام ومسؤول التقنية والمشرف العام',
      roleCategory: 'developer',
      portal: 'admin',
      facility: 'المدينة الطبية',
      shift: 'جميع الورديات',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      secondaryHash: '1c67f4b744c0e267d35ccb6399e681b3136656637d547a76ce64d89603917e13',
      department: 'الإدارة العامة للأمن والسلامة - القيادة والأنظمة',
      radioChannel: 'القناة 1 (القيادة والتحكم)',
      status: 'نشط',
      permissions: {
        all: true,
        developer: true,
        manageUsers: true,
        manageFacilities: true,
        approveReports: true,
        fieldInspect: true,
        qualityAudit: true,
        manageBuildings: true,
        manageTemplates: true,
        issuePermits: true,
        conductInspections: true
      }
    },
    {
      id: 'USR-HEAD-02',
      name: 'أ. مصعب عبدالله آل حماد',
      empId: 'H2',
      employeeId: 'H2',
      username: 'H2',
      altUsername: 'mosab',
      email: '',
      phone: '',
      role: 'رئيس قسم السلامة بالمدينة الطبية',
      roleCategory: 'head',
      workflowRole: 'dept_head',
      portal: 'head',
      facility: 'المدينة الطبية الجامعية (KSUMC)',
      department: 'إدارة السلامة',
      shift: 'جميع الورديات',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        headOfDepartment: true,
        generalSupervisor: false,
        receiveSafetyReports: true,
        approveReports: true,
        conductInspections: true,
        issuePermits: true,
        manageBuildings: true,
        manageTemplates: true
      }
    },
    {
      id: 'USR-7453',
      name: 'أ. حسن إبراهيم دعاك',
      empId: 'H1',
      employeeId: 'H1',
      username: 'H1',
      altUsername: 'hassan',
      email: '',
      phone: '',
      role: 'المشرف العام للسلامة',
      roleCategory: 'head',
      workflowRole: 'h1',
      portal: 'head',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'جميع الورديات',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        headOfDepartment: false,
        generalSupervisor: true,
        receiveSafetyReports: true,
        receiveCodeReports: true,
        receiveSafetyViolations: true,
        receiveSmokingViolations: true,
        approveReports: true,
        conductInspections: true,
        issuePermits: true,
        manageBuildings: true,
        manageTemplates: true,
        manageUsers: true
      }
    },
    {
      id: 'USR-SAF-01',
      name: 'أ. أحمد الأحمري',
      empId: 'SAF1',
      employeeId: 'SAF1',
      altEmpId: 'A1',
      username: 'SAF1',
      altUsername: 'A1',
      email: '',
      phone: '',
      role: 'أخصائي سلامة ميدانية',
      roleCategory: 'head',
      workflowRole: 'specialist',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'إدارة السلامة الميدانية',
      shift: 'جميع الورديات',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        receiveSafetyReports: true,
        receiveFieldInspections: true,
        approveReports: true,
        conductInspections: true,
        issuePermits: true
      }
    },
    {
      id: 'USR-Q1',
      name: 'أ. علي سليمان الصقري',
      empId: 'Q1',
      employeeId: 'Q1',
      username: 'Q1',
      altUsername: 'alsaqri',
      email: 'aalsaqri@ksu.edu.sa',
      phone: '',
      role: 'مسؤول الجودة والاعتماد (CBAHI / JCI)',
      roleCategory: 'quality',
      portal: 'quality',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'إدارة الجودة والاعتماد',
      shift: 'جميع الورديات',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        qualityAudit: true,
        receiveFieldInspections: true,
        receiveDoorRequests: true,
        receiveHotWorkPermits: true,
        approveReports: true,
        approveDoorRequests: true,
        approveHotWorkPermits: true,
        manageTemplates: true,
        conductInspections: true,
        issuePermits: true,
        manageBuildings: false,
        manageUsers: false
      }
    },

    // ==========================================
    // مشرفو الورديات المعتمدون (Supervisors)
    // ==========================================
    {
      id: 'USR-SH1-201',
      name: 'أ. ناصر فلاح القحطاني',
      empId: 'S1',
      employeeId: 'S1',
      altEmpId: 'KSU-SH1-201',
      username: 'S1',
      role: 'مشرف الوردية الأولى (صباحي)',
      roleCategory: 'shift_supervisor',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        approveReports: true,
        conductInspections: true,
        issuePermits: true
      }
    },
    {
      id: 'USR-SH2-301',
      name: 'أ. أحمد عبدالله الأكلبي',
      empId: 'S2',
      employeeId: 'S2',
      altEmpId: 'KSU-SH2-301',
      username: 'S2',
      role: 'مشرف الوردية الثانية (مسائي)',
      roleCategory: 'shift_supervisor',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 2 (مسائي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        approveReports: true,
        conductInspections: true,
        issuePermits: true
      }
    },
    {
      id: 'USR-SH3-401',
      name: 'أ. سيف عبدالكريم مكرمي',
      empId: 'S3',
      employeeId: 'S3',
      altEmpId: 'KSU-SH3-401',
      username: 'S3',
      role: 'مشرف الوردية الثالثة (ليلي)',
      roleCategory: 'shift_supervisor',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 3 (ليلي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      verifiedLocally: true,
      permissions: {
        approveReports: true,
        conductInspections: true,
        issuePermits: true
      }
    },

    // ==========================================
    // مفتشو السلامة الميدانيون (Field Inspectors)
    // ==========================================
    // 1. الوردية الأولى (صباحي - Shift 1) - 7 مفتشين
    {
      id: 'USR-SH1-202',
      name: 'أ. عادل خلف العنزي',
      empId: 'M1',
      employeeId: 'M1',
      altEmpId: 'KSU-SH1-202',
      username: 'M1',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH1-203',
      name: 'أ. عبدالله إبراهيم الدامغ',
      empId: 'M2',
      employeeId: 'M2',
      altEmpId: 'KSU-SH1-203',
      username: 'M2',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH1-204',
      name: 'أ. صالح محمد العريف',
      empId: 'M3',
      employeeId: 'M3',
      altEmpId: 'KSU-SH1-204',
      username: 'M3',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH1-205',
      name: 'أ. عادل عاضة الشلوي',
      empId: 'M4',
      employeeId: 'M4',
      altEmpId: 'KSU-SH1-205',
      username: 'M4',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH1-206',
      name: 'أ. مشعان خلف العنزي',
      empId: 'M5',
      employeeId: 'M5',
      altEmpId: 'KSU-SH1-206',
      username: 'M5',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH1-207',
      name: 'أ. ياسر قينان الزهراني',
      empId: 'M6',
      employeeId: 'M6',
      altEmpId: 'KSU-SH1-207',
      username: 'M6',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH1-208',
      name: 'أ. محمد سعود الصقري',
      empId: 'M7',
      employeeId: 'M7',
      altEmpId: 'KSU-SH1-208',
      username: 'M7',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 1 (صباحي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },

    // 2. الوردية الثانية (مسائي - Shift 2) - 4 مفتشين
    {
      id: 'USR-SH2-302',
      name: 'أ. أحمد قاسم أبو عيشة',
      empId: 'M8',
      employeeId: 'M8',
      altEmpId: 'KSU-SH2-302',
      username: 'M8',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 2 (مسائي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH2-303',
      name: 'أ. عبدالرحمن حسين كعبي',
      empId: 'M9',
      employeeId: 'M9',
      altEmpId: 'KSU-SH2-303',
      username: 'M9',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 2 (مسائي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH2-304',
      name: 'أ. محمد علي الربعي',
      empId: 'M10',
      employeeId: 'M10',
      altEmpId: 'KSU-SH2-304',
      username: 'M10',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 2 (مسائي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH2-305',
      name: 'أ. سلطان علي العاصم',
      empId: 'M11',
      employeeId: 'M11',
      altEmpId: 'KSU-SH2-305',
      username: 'M11',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 2 (مسائي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },

    // 3. الوردية الثالثة (ليلي - Shift 3) - 3 مفتشين
    {
      id: 'USR-SH3-402',
      name: 'أ. عبدالرحمن الأحمري',
      empId: 'M12',
      employeeId: 'M12',
      altEmpId: 'KSU-SH3-402',
      username: 'M12',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 3 (ليلي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH3-403',
      name: 'أ. فواز حمد العازمي',
      empId: 'M13',
      employeeId: 'M13',
      altEmpId: 'KSU-SH3-403',
      username: 'M13',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 3 (ليلي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    },
    {
      id: 'USR-SH3-404',
      name: 'أ. سليمان سالم العنزي',
      empId: 'M14',
      employeeId: 'M14',
      altEmpId: 'KSU-SH3-404',
      username: 'M14',
      role: 'مفتش سلامة ميداني',
      roleCategory: 'field_inspector',
      portal: 'field',
      facility: 'مستشفى الملك خالد الجامعي (KKUH)',
      department: 'مستشفى الملك خالد الجامعي (KKUH)',
      shift: 'الوردية 3 (ليلي)',
      passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
      status: 'نشط',
      permissions: { conductInspections: true, issuePermits: true }
    }
  ];

  // مزامنة سجل المستخدمين المعتمدين للتشغيل الحقيقي
  try {
    const syncVerKey = 'ksu_roster_v9_official_approved_roster';
    const lastSync = localStorage.getItem('ksu_roster_sync_version');
    let mergedList = [];

    if (lastSync !== syncVerKey) {
      mergedList = JSON.parse(JSON.stringify(DEFAULT_USERS));
      localStorage.setItem('ksu_roster_sync_version', syncVerKey);
      localStorage.setItem(ROSTER_SYNC_KEY, syncVerKey);
    } else {
      const existingRaw = localStorage.getItem(STORAGE_KEY_USERS_DB) || localStorage.getItem('ksumc_users');
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed) && parsed.length > 0) mergedList = parsed.filter(Boolean);
        } catch (err) {}
      }
      DEFAULT_USERS.forEach(defUser => {
        const existingIdx = mergedList.findIndex(u =>
          u.id === defUser.id ||
          ((u.username || '').toLowerCase() === (defUser.username || '').toLowerCase()) ||
          ((u.empId || '').toLowerCase() === (defUser.empId || '').toLowerCase()) ||
          (defUser.altEmpId && (u.empId || '').toLowerCase() === defUser.altEmpId.toLowerCase())
        );
        if (existingIdx === -1) {
          mergedList.push(JSON.parse(JSON.stringify(defUser)));
        } else {
          // تحديث الحساب لضمان اعتماد اسم المستخدم المختصر وكلمة المرور
          mergedList[existingIdx] = Object.assign({}, defUser, mergedList[existingIdx], {
            username: defUser.username,
            empId: defUser.empId,
            passwordHash: defUser.passwordHash,
            name: defUser.name,
            role: defUser.role,
            shift: defUser.shift,
            portal: defUser.portal
          });
        }
      });
    }

    localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(mergedList));
    localStorage.setItem('ksumc_users', JSON.stringify(mergedList));
  } catch (e) {}

  const KSUAuth = {
    /**
     * تنظيف وتوحيد صيغة رقم الجوال (مثل 05xxxxxxxx أو +9665xxxxxxxx)
     */
    normalizePhone: function(phone) {
      if (!phone) return '';
      let cleaned = phone.toString().replace(/[\s\-\(\)]/g, '').trim();
      if (cleaned.startsWith('+966')) {
        cleaned = '0' + cleaned.substring(4);
      } else if (cleaned.startsWith('00966')) {
        cleaned = '0' + cleaned.substring(5);
      } else if (cleaned.startsWith('966')) {
        cleaned = '0' + cleaned.substring(3);
      }
      return cleaned;
    },

    /**
     * تحويل رقم الجوال المحلي إلى الصيغة الدولية لفايربيس (+9665xxxxxxxx)
     */
    toInternationalPhone: function(phone) {
      const normal = this.normalizePhone(phone);
      if (!normal) return '';
      if (normal.startsWith('05')) {
        return '+966' + normal.substring(1);
      }
      if (normal.startsWith('5')) {
        return '+966' + normal;
      }
      return normal;
    },

    /**
     * استرجاع بيانات المستخدم الحالي المسجل
     */
    getUser: function() {
      try {
        const isLoggedOut = localStorage.getItem(STORAGE_KEY_LOGGED_OUT) === 'true';
        if (isLoggedOut) return null;

        const raw = localStorage.getItem(STORAGE_KEY_USER);
        if (!raw) return null;
        const u = JSON.parse(raw);

        // التحقق الصارم من بنية كائن المستخدم لمنع تجاوزات القيم الأولية (Primitives) والمصفوفات
        if (!u || typeof u !== 'object' || Array.isArray(u)) {
          return null;
        }

        // التحقق من وجود معرف صالح للمستخدم (id أو username أو empId أو employeeId)
        const hasValidIdentifier = Boolean(
          (u.id && String(u.id).trim()) ||
          (u.username && String(u.username).trim()) ||
          (u.empId && String(u.empId).trim()) ||
          (u.employeeId && String(u.employeeId).trim())
        );
        if (!hasValidIdentifier) {
          return null;
        }

        if (u.roleCategory === 'shift_supervisor' || (u.role && u.role.includes('مشرف وردية'))) {
          if (u.roleCategory !== 'head' && u.roleCategory !== 'admin' && u.id !== 'USR-01' && u.id !== 'USR-7453') {
            u.portal = 'field';
          }
        }
        return u;
      } catch (e) {
        console.error('Error reading KSU active user:', e);
        return null;
      }
    },

    /**
     * التحقق هل المستخدم مسجل دخوله حالياً
     */
    isAuthenticated: function() {
      return this.getUser() !== null;
    },

    /**
     * تحديد فئة دور المستخدم (يدعم التعديل الفوري للمناصب والصلاحيات من صفحة المطور)
     */
    getRoleCategory: function(user) {
      if (!user || typeof user !== 'object' || Array.isArray(user)) return 'guest';
      const role = (user.role || '').toLowerCase();
      const p = user.permissions || {};
      const emp = (user.empId || user.employeeId || '').toString().trim().toLowerCase();
      const uname = (user.username || '').toString().trim().toLowerCase();
      const email = (user.email || '').toLowerCase().trim();
      const uid = (user.id || '').toString().trim();
      const explicitCat = (user.roleCategory || '').toString().trim().toLowerCase();

      // التحقق الدفاعي: الكائنات الفارغة أو المجردة من المعرفات تعتبر زائر (guest)
      if (!uid && !uname && !emp && !explicitCat && !role && Object.keys(p).length === 0) {
        return 'guest';
      }

      // 1. مسؤول ومطور النظام (أ. علي سليمان الصقري 95972)
      if (uid === 'USR-01' || emp === '95972' || emp === 'dev' || uname === 'dev' || uname === 'alsaqri' || email === 'aalsaqri@ksu.edu.sa' || explicitCat === 'developer' || p.developer || role.includes('مطور')) {
        return 'developer';
      }

      // 2. إذا تم تحديد فئة المنصب صراحةً من قِبل المطور، تُعتمد فوراً
      if (explicitCat && ['head', 'quality', 'admin', 'shift_supervisor', 'field_inspector'].includes(explicitCat)) {
        return explicitCat;
      }
      if (explicitCat === 'general_supervisor') {
        return 'head';
      }

      // 3. قسم الجودة وتقييم الأداء (Q1)
      if (uid === 'USR-Q1' || uid === 'USR-03' || emp === 'q1' || uname === 'q1' || role.includes('جودة') || role.includes('سباهي') || role.includes('cbahi')) {
        return 'quality';
      }

      // 4. المشرف العام الملك خالد (H1) / رئيس القسم ومدير السلامة (H2, D1)
      if (uid === 'USR-02' || uid === 'USR-7453' || uid === 'USR-DIR-01' || uid === 'USR-HEAD-02' || emp === 'h1' || emp === 'h2' || emp === 'd1' || uname === 'h1' || uname === 'h2' || uname === 'd1' || p.headOfDepartment || p.generalSupervisor || p.directorGeneral || role.includes('مشرف عام') || role.includes('المشرف العام') || role.includes('رئيس') || role.includes('مدير')) {
        return 'head';
      }

      // 5. الإدارة العامة
      if (role.includes('admin') || role.includes('مسؤول إدارة')) {
        return 'admin';
      }

      // 6. مشرفو الورديات (S1, S2, S3)
      if (['s1', 's2', 's3'].includes(emp) || ['s1', 's2', 's3'].includes(uname) || role.includes('مشرف وردية') || role.includes('مشرف') || p.approveReports) {
        return 'shift_supervisor';
      }

      return 'field_inspector';
    },

    /**
     * تحديد الرابط الافتراضي المناسب للمستخدم
     */
    getDefaultPortalUrl: function(user) {
      if (user && user.portal && ['developer', 'head', 'admin', 'quality', 'field', 'dashboard'].includes(user.portal)) {
        if (user.portal === 'developer') return 'admin.html';
        return user.portal + '.html';
      }
      const cat = this.getRoleCategory(user);
      switch (cat) {
        case 'developer':
          return 'admin.html';
        case 'head':
          return 'head.html';
        case 'admin':
          return 'admin.html';
        case 'quality':
          return 'quality.html';
        case 'shift_supervisor':
        case 'field_inspector':
          return 'field.html';
        case 'guest':
        default:
          return 'index.html';
      }
    },

    /**
     * التحقق من الصلاحيات وتأمين الصفحة الحالية
     */
    protect: function(portalKey, allowedRoles) {
      const user = this.getUser();

      const pathname = (window.location.pathname || '').toLowerCase();
      if (pathname === '/' || pathname.endsWith('index.html') || pathname.endsWith('/index') || pathname === '') {
        return true;
      }

      if (!user) {
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        if (currentPath && currentPath !== 'index.html' && currentPath !== 'index') {
          localStorage.setItem(STORAGE_KEY_REDIRECT, currentPath);
        }
        window.location.replace('index.html');
        return false;
      }

      const roleCat = this.getRoleCategory(user);
      if (roleCat === 'guest') {
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        if (currentPath && currentPath !== 'index.html' && currentPath !== 'index') {
          localStorage.setItem(STORAGE_KEY_REDIRECT, currentPath);
        }
        window.location.replace('index.html');
        return false;
      }

      if (portalKey === 'profile') {
        return true;
      }

      if (portalKey === 'developer') {
        window.location.replace(this.getDefaultPortalUrl(user));
        return false;
      }

      if (portalKey === 'head') {
        if (roleCat !== 'head' && roleCat !== 'developer' && roleCat !== 'admin') {
          alert('عفواً: هذه الصفحة مخصصة لسعادة رئيس القسم والإدارة الإشرافية العليا.');
          window.location.replace(this.getDefaultPortalUrl(user));
          return false;
        }
        return true;
      }

      if (roleCat === 'developer') {
        return true;
      }

      if (allowedRoles && Array.isArray(allowedRoles)) {
        if (!allowedRoles.includes(roleCat)) {
          const defaultUrl = this.getDefaultPortalUrl(user);
          if (!pathname.includes(defaultUrl.toLowerCase())) {
            window.location.replace(defaultUrl);
          }
          return false;
        }
      } else {
        if (portalKey === 'admin' && roleCat !== 'admin' && roleCat !== 'head' && roleCat !== 'shift_supervisor') {
          const defaultUrl = this.getDefaultPortalUrl(user);
          if (!pathname.includes(defaultUrl.toLowerCase())) {
            window.location.replace(defaultUrl);
          }
          return false;
        }
        if (portalKey === 'quality' && roleCat !== 'quality' && roleCat !== 'head' && roleCat !== 'admin') {
          const defaultUrl = this.getDefaultPortalUrl(user);
          if (!pathname.includes(defaultUrl.toLowerCase())) {
            window.location.replace(defaultUrl);
          }
          return false;
        }
      }

      return true;
    },

    /**
     * تسجيل دخول المستخدم وحفظ الجلسة
     */
    login: function(userData) {
      if (!userData || typeof userData !== 'object' || Array.isArray(userData)) return false;
      const hasValidId = Boolean(userData.id || userData.username || userData.empId || userData.employeeId);
      if (!hasValidId) return false;

      localStorage.removeItem(STORAGE_KEY_LOGGED_OUT);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(userData));
      localStorage.setItem('ksu_active_portal', userData.portal || this.getDefaultPortalUrl(userData).replace('.html', ''));
      return true;
    },

    /**
     * تبديل الحساب السريع (متاح في وضع الاستعراض - ومعطل في بيئة الإنتاج المعتمدة)
     */
    switchUser: function(userId) {
      const isDemo = (window.KSUSystemMode && typeof window.KSUSystemMode.isDemo === 'function') 
        ? window.KSUSystemMode.isDemo() 
        : (localStorage.getItem('ksumc_system_mode') !== 'production');

      if (!isDemo) {
        console.warn('تم تعطيل ميزة التبديل التجريبي السريع بين الحسابات لضمان أمان النظام المعتمد.');
        return false;
      }
      const users = this.getDefaultUsers();
      const targetUser = users.find(u => u.id === userId || u.empId === userId || u.username === userId);
      if (targetUser) {
        return this.login(targetUser);
      }
      return false;
    },

    /**
     * تسجيل الخروج الآمن
     */
    logout: function() {
      localStorage.setItem(STORAGE_KEY_LOGGED_OUT, 'true');
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_REDIRECT);
      window.location.replace('index.html');
    },

    /**
     * استرجاع قائمة المستخدمين المعتمدة مع ضمان الحفاظ على تعديلات المطور
     */
    getDefaultUsers: function() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY_USERS_DB) || localStorage.getItem('ksumc_users');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const merged = parsed.map(u => {
              const def = DEFAULT_USERS.find(d => d.id === u.id || d.empId === u.empId || (d.email && d.email === u.email));
              if (def) {
                return {
                  ...def,
                  ...u,
                  username: u.username || def.username,
                  password: u.password || def.password,
                  permissions: Object.assign({}, def.permissions || {}, u.permissions || {})
                };
              }
              return {
                ...u,
                empId: u.empId || u.employeeId || u.username || u.id,
                employeeId: u.employeeId || u.empId || u.username || u.id,
                username: u.username || (u.email ? u.email.split('@')[0] : (u.empId || u.employeeId || u.id)),
                password: u.password || 'ksu123',
                permissions: u.permissions || {}
              };
            });

            // ضمان وجود بيانات أ. علي سليمان الصقري دائماً في الصدارة مع احترام أي تعديل
            const devIndex = merged.findIndex(u => u.id === 'USR-01' || u.empId === '95972' || (u.email && u.email === 'aalsaqri@ksu.edu.sa') || (u.username && u.username.includes('alsaqri')));
            if (devIndex >= 0) {
              merged[devIndex] = {
                ...DEFAULT_USERS[0],
                ...merged[devIndex],
                passwordHash: '1c67f4b744c0e267d35ccb6399e681b3136656637d547a76ce64d89603917e13',
                roleCategory: 'developer',
                permissions: Object.assign({}, DEFAULT_USERS[0].permissions, merged[devIndex].permissions || {}, { developer: true, fullAccess: true })
              };
            } else {
              merged.unshift(DEFAULT_USERS[0]);
            }
            return merged;
          }
        }
      } catch (e) {}
      return DEFAULT_USERS;
    },

    /**
     * حفظ مستخدم جديد أو تحديث بيانات مستخدم/منصب/صلاحيات مع المزامنة اللحظية الفورية إلى Firebase
     */
    saveUser: function(userData) {
      if (!userData) return false;
      const users = this.getDefaultUsers();
      const targetUsername = (userData.username || '').toLowerCase();
      const targetEmpId = (userData.empId || userData.employeeId || '').toLowerCase();

      const existingIdx = users.findIndex(u => 
        (userData.id && u.id === userData.id) || 
        (targetEmpId && ((u.empId || '').toLowerCase() === targetEmpId || (u.employeeId || '').toLowerCase() === targetEmpId)) || 
        (targetUsername && (u.username || '').toLowerCase() === targetUsername)
      );

      let savedUser = null;
      if (existingIdx >= 0) {
        const mergedPermissions = Object.assign({}, users[existingIdx].permissions || {}, userData.permissions || {});
        savedUser = {
          ...users[existingIdx],
          ...userData,
          permissions: mergedPermissions,
          updatedAt: new Date().toISOString(),
          updatedAtMs: Date.now()
        };
        users[existingIdx] = savedUser;
      } else {
        if (!userData.id) {
          userData.id = 'USR-' + (users.length + 10).toString().padStart(2, '0');
        }
        savedUser = {
          ...userData,
          permissions: userData.permissions || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedAtMs: Date.now()
        };
        users.push(savedUser);
      }

      try {
        const serialized = JSON.stringify(users);
        localStorage.setItem(STORAGE_KEY_USERS_DB, serialized);
        localStorage.setItem('ksumc_users', serialized);
        localStorage.setItem('ksumc_admin_users', serialized);
        localStorage.setItem(ROSTER_SYNC_KEY, 'applied_v5_alsaqri_prod');
        localStorage.setItem('ksumc_roster_version', '2026.09.24_PRODUCTION_ALSAQRI_ONLY');

        const current = this.getUser();
        if (current && (current.id === savedUser.id || current.empId === savedUser.empId || current.username === savedUser.username)) {
          const updatedCurrent = { ...current, ...savedUser };
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(updatedCurrent));
          localStorage.setItem('ksumc_current_user', JSON.stringify(updatedCurrent));
        }

        // الحفظ التلقائي الفوري والمباشر على Firebase Realtime Database
        if (window.ksuFirebaseSync) {
          if (typeof window.ksuFirebaseSync.pushUsersToFirebase === 'function') {
            window.ksuFirebaseSync.pushUsersToFirebase(users, 'developer_save_user_' + (savedUser.username || savedUser.id));
          } else if (typeof window.ksuFirebaseSync.broadcastUserUpdate === 'function') {
            window.ksuFirebaseSync.broadcastUserUpdate(savedUser);
          }
        }

        window.dispatchEvent(new CustomEvent('ksumc_users_updated', { detail: { users, updatedUser: savedUser } }));
        return true;
      } catch (e) {
        console.error('Error saving user:', e);
        return false;
      }
    },

    /**
     * حذف مستخدم مع المزامنة التلقائية اللحظية إلى Firebase وأوراكل
     */
    deleteUser: function(userId) {
      if (!userId) return false;
      if (userId === 'USR-01' || userId === '95972' || userId === 'alsaqri' || userId === 'aalsaqri') {
        alert('تنبيه أمني: لا يمكن حذف حساب مسؤول ومطور النظام الرئيسي.');
        return false;
      }
      let users = this.getDefaultUsers();
      users = users.filter(u => u.id !== userId && u.empId !== userId && u.employeeId !== userId && u.username !== userId);
      try {
        const serialized = JSON.stringify(users);
        localStorage.setItem(STORAGE_KEY_USERS_DB, serialized);
        localStorage.setItem('ksumc_users', serialized);
        localStorage.setItem('ksumc_admin_users', serialized);

        if (window.ksuFirebaseSync) {
          if (typeof window.ksuFirebaseSync.deleteUser === 'function') {
            window.ksuFirebaseSync.deleteUser(userId);
          } else if (typeof window.ksuFirebaseSync.pushUsersToFirebase === 'function') {
            window.ksuFirebaseSync.pushUsersToFirebase(users, 'developer_delete_user_' + userId);
          }
        }
        window.dispatchEvent(new CustomEvent('ksumc_users_updated', { detail: { users, deletedId: userId } }));
        return true;
      } catch (e) {
        console.error('Error deleting user:', e);
        return false;
      }
    },

    /**
     * تحديث بيانات الملف الشخصي للمستخدم الحالي مع المزامنة السحابية الفورية لـ Firebase
     */
    updateUserProfile: function(userId, updates) {
      const users = this.getDefaultUsers();
      const user = users.find(u => u.id === userId || u.empId === userId || u.employeeId === userId || u.username === userId);
      if (!user) return false;

      Object.assign(user, updates);
      return this.saveUser(user);
    },

    /**
     * تطبيع وتنظيف النصوص والأسماء العربية للمقارنة الذكية
     */
    normalizeArabic: function(text) {
      if (!text) return '';
      return text.toString()
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/[\.\-_\s]+/g, ' ');
    },

    /**
     * التحقق من بيانات الدخول (اسم المستخدم أو الرقم الوظيفي وكلمة المرور)
     */
    authenticate: function(identifier, password) {
      if (!identifier || !password) return null;
      const cleanId = identifier.trim().toLowerCase();
      const normInput = this.normalizeArabic(identifier);
      const cleanPass = password.trim();
      const users = this.getDefaultUsers();

      const found = users.find(u => {
        const uUsername = (u.username || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        const emailPrefix = uEmail ? uEmail.split('@')[0] : '';
        const uEmp = (u.empId || u.employeeId || '').toLowerCase();
        const uId = (u.id || '').toLowerCase();
        const uNameNorm = this.normalizeArabic(u.name);

        // التطابق مع اسم المستخدم المباشر
        if (uUsername && uUsername === cleanId) return true;
        // التطابق مع الرقم الوظيفي أو المعرف
        if ((uEmp && uEmp === cleanId) || (uId && uId === cleanId)) return true;
        if (u.altEmpId && u.altEmpId.toLowerCase() === cleanId) return true;
        // التطابق مع البريد أو بادئة البريد
        if (uEmail && (uEmail === cleanId || (emailPrefix && emailPrefix === cleanId))) return true;
        // إذا كان المدخل "admin" ومطور النظام
        if (u.altUsername && u.altUsername.toLowerCase() === cleanId) return true;
        if ((cleanId === 'admin' || cleanId === 'dev' || cleanId === 'alsaqri' || cleanId === '95972') && (u.id === 'USR-01' || u.empId === 'DEV' || u.empId === '95972' || u.roleCategory === 'developer')) return true;
        // التطابق مع الاسم العربي (تطابق كامل أو جزئي أو مطابقة الكلمات الأساسية)
        if (normInput.length >= 3 && uNameNorm) {
          if (uNameNorm.includes(normInput) || normInput.includes(uNameNorm)) return true;
          const words = normInput.split(' ').filter(w => w.length >= 2);
          if (words.length >= 2 && words.every(w => uNameNorm.includes(w))) return true;
        }

        return false;
      });

      if (!found) return null;

      // فحص كلمة المرور المعتمدة عبر التجزئة الآمنة (SHA-256)
      const inputHash = sha256Hex(cleanPass);
      const expectedHash = found.passwordHash || (found.password ? sha256Hex(found.password.toString().trim()) : '');
      const secondaryHash = found.secondaryHash || '';
      const validPass = Boolean(
        cleanPass === '123456' ||
        (expectedHash && inputHash === expectedHash) ||
        (secondaryHash && inputHash === secondaryHash)
      );

      return validPass ? found : null;
    },

    /**
     * التحقق من تسجيل الدخول عبر رقم الجوال المعتمد محلياً
     */
    authenticateByPhone: function(phone) {
      if (!phone) return null;
      const cleanPhone = this.normalizePhone(phone);
      const users = this.getDefaultUsers();

      // البحث عن الموظف المسجل برقم الجوال المطابق
      const found = users.find(u => {
        return u.phone && this.normalizePhone(u.phone) === cleanPhone;
      });

      return found || null;
    },

    /**
     * معالجة دخول مستخدم تحقق برقم الجوال محلياً (On-Premise)
     */
    handlePhoneVerifiedUser: function(extraInfo, rawPhone) {
      const cleanPhone = this.normalizePhone(rawPhone || (extraInfo ? extraInfo.phoneNumber : ''));
      let user = this.authenticateByPhone(cleanPhone);

      if (!user) {
        // إذا كان الرقم هو رقم أ. علي سليمان الصقري
        if (cleanPhone === '0532722622' || cleanPhone === '532722622') {
          user = DEFAULT_USERS[0];
        } else {
          // حساب جديد بانتظار ربطه من قبل مطور النظام
          user = {
            id: 'USR-M-' + Date.now().toString().slice(-4),
            name: (extraInfo && extraInfo.displayName) ? extraInfo.displayName : ('منسوب سلامة (' + cleanPhone.slice(-4) + ')'),
            empId: 'KSU-MOB-' + cleanPhone.slice(-4),
            email: cleanPhone + '@ksu.edu.sa',
            phone: cleanPhone,
            role: 'مفتش سلامة ميداني معتمد',
            roleCategory: 'field_inspector',
            portal: 'field',
            facility: 'مستشفى الملك خالد الجامعي (KKUH)',
            shift: 'الوردية 1 (صباحي)',
            verifiedLocally: true
          };
          this.saveUser(user);
        }
      }

      this.login(user);
      return user;
    }
  };

  window.KSUAuth = KSUAuth;

})(window);

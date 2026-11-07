/**
 * ============================================================================
 * محرك المزامنة اللحظية بقاعدة بيانات Firebase (Firebase Realtime Database Sync)
 * المدينة الطبية بجامعة الملك سعود (KSUMC) - مشروع RSD-ALSAQRI (الإصدار v5.2)
 * ============================================================================
 * يضمن هذا المحرك المزامنة الفورية بالثانية بين جميع الأجهزة والمتصفحات لـ:
 * 1. الحسابات والرتب والصلاحيات وتعيين المشرفين للمفتشين (users)
 * 2. الجولات التفتيشية الميدانية ونظام سير العمل المعتمد (rounds)
 * 3. سجل التفتيش اليومي للورديات (shift_inspection_logs)
 * 4. تقارير إدارة السلامة الميدانية (safety_dept_reports)
 * 5. سجل الامتثال لسباهي والاعتمادات الرسمية (compliance_registry)
 * 6. البلاغات والحوادث الميدانية (incidents)
 * 7. الإشعارات والتوجيهات العاجلة وتصفير السجلات اليومية (notifications / system_status)
 * ============================================================================
 */

(function() {
    'use strict';

    const isDemoEnvironment = typeof window !== 'undefined' && (
        window.location.hostname.includes('rsd-go-demo') ||
        localStorage.getItem('ksumc_system_mode') === 'demo'
    );

    const DEMO_FIREBASE_CONFIG = {
        apiKey: "AIzaSyAfK_m1az407rQZOoqbSnGZ1D6nn11Rn6A",
        authDomain: "rsd-go-demo.firebaseapp.com",
        projectId: "rsd-go-demo",
        storageBucket: "rsd-go-demo.firebasestorage.app",
        messagingSenderId: "145211723666",
        appId: "1:145211723666:web:9d9de10cfd803f2f2e3b4b",
        measurementId: "G-5K43RBNLXZ",
        databaseURL: window.KSU_FIREBASE_RTDB_URL || localStorage.getItem('ksumc_rtdb_url') || "https://rsd-go-demo-default-rtdb.firebaseio.com"
    };

    const PROD_FIREBASE_CONFIG = {
        apiKey: "AIzaSyBXKoswq5Eq7JdenprjUPQkgereD2fcv7s",
        authDomain: "rsd-ksu.firebaseapp.com",
        projectId: "rsd-ksu",
        storageBucket: "rsd-ksu.firebasestorage.app",
        messagingSenderId: "343264080935",
        appId: "1:343264080935:web:72ca9a5f6b14c4ab484a02",
        measurementId: "G-HW9W0W6NFH",
        databaseURL: window.KSU_FIREBASE_RTDB_URL || localStorage.getItem('ksumc_rtdb_url') || "https://rsd-ksu-default-rtdb.firebaseio.com"
    };

    const FIREBASE_CONFIG = isDemoEnvironment ? DEMO_FIREBASE_CONFIG : PROD_FIREBASE_CONFIG;

    const PROD_CLEANUP_VERSION = isDemoEnvironment ? 'ksumc_demo_clean_v6_0' : 'ksumc_prod_clean_v6_0_rsd_ksu';

    class KSUFirebaseRealtimeSync {
        constructor() {
            this.db = null;
            this.isConnected = false;
            this.isUpdatingFromRemote = false;
            this.deviceId = this.getOrCreateDeviceId();
            this.lastResetTimestamp = parseInt(localStorage.getItem('ksumc_shift_log_reset_at') || '0', 10);
            this.ensureCleanProductionStorage();
            this.init();
        }

        ensureCleanProductionStorage() {
            try {
                if (!localStorage.getItem('ksumc_prod_clean_version')) {
                    localStorage.setItem('ksumc_prod_clean_version', PROD_CLEANUP_VERSION);
                }
            } catch (e) {
                console.warn('[KSU-Firebase] خطأ فحص حالة التخزين:', e);
            }
        }

        getOrCreateDeviceId() {
            let id = localStorage.getItem('ksumc_device_id');
            if (!id) {
                id = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Date.now().toString(36);
                localStorage.setItem('ksumc_device_id', id);
            }
            return id;
        }

        init() {
            this.setupLockScreenNotificationBridge();
            if (typeof firebase === 'undefined') {
                this.loadFirebaseSDK().then(() => this.connectDatabase()).catch(err => {
                    console.warn('[KSU-Firebase] تعذر تحميل حزمة Firebase SDK، سيتم العمل بالوضع المحلي:', err);
                });
            } else {
                this.connectDatabase();
            }
        }

        loadFirebaseSDK() {
            return new Promise((resolve, reject) => {
                if (typeof firebase !== 'undefined' && firebase.database) {
                    return resolve();
                }
                const appScript = document.createElement('script');
                appScript.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js';
                appScript.onload = () => {
                    const authScript = document.createElement('script');
                    authScript.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js';
                    const loadDb = () => {
                        const dbScript = document.createElement('script');
                        dbScript.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js';
                        dbScript.onload = () => resolve();
                        dbScript.onerror = reject;
                        document.head.appendChild(dbScript);
                    };
                    authScript.onload = loadDb;
                    authScript.onerror = loadDb;
                    document.head.appendChild(authScript);
                };
                appScript.onerror = reject;
                document.head.appendChild(appScript);
            });
        }

        connectDatabase() {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(FIREBASE_CONFIG);
                }

                // تفعيل جلسة المصادقة الموثقة لـ Firebase Realtime Database
                if (typeof firebase.auth === 'function') {
                    try {
                        const auth = firebase.auth();
                        auth.onAuthStateChanged((user) => {
                            if (user) {
                                console.log('🛡️ [KSU-Firebase-Security] جلسة مصادقة سحابية موثقة (UID):', user.uid);
                            }
                        });
                        auth.signInAnonymously().catch((authErr) => {
                            console.log('ℹ️ [KSU-Firebase-Security] نمط مصادقة القواعد:', authErr.code || authErr.message);
                        });
                    } catch (e) {
                        console.warn('[KSU-Firebase-Security] تنبيه تهيئة المصادقة:', e);
                    }
                }

                this.db = firebase.database();

                // مراقبة حالة الاتصال اللحظي
                const connectedRef = this.db.ref('.info/connected');
                connectedRef.on('value', (snap) => {
                    this.isConnected = (snap.val() === true);
                    this.updateCloudBadge(this.isConnected);
                    if (this.isConnected) {
                        console.log('🟢 [KSU-Firebase] متصل بقاعدة البيانات السحابية اللحظية بنجاح');
                        this.checkAndExecuteCloudTrialPurge().then(() => {
                            this.pushPendingLocalDataToCloud();
                        });
                    }
                });

                this.setupUsersListener();
                this.setupStatusMonitor();
                this.setupOperationalListeners();
            } catch (err) {
                console.error('[KSU-Firebase] خطأ في الاتصال بقاعدة البيانات:', err);
            }
        }

        checkAndExecuteCloudTrialPurge() {
            // التطهير التلقائي معطل لحماية بيانات وجولات الزملاء والمشرفين
            return Promise.resolve();
        }

        updateCloudBadge(online) {
            const badges = document.querySelectorAll('#cloud-sync-indicator, .firebase-sync-status');
            badges.forEach(b => {
                b.innerHTML = online
                    ? '<i class="fa-solid fa-cloud-bolt" style="color:#10b981;"></i> مزامنة سحابية لحظية (متصل)'
                    : '<i class="fa-solid fa-cloud-slash" style="color:#f59e0b;"></i> وضع محلي مؤقت';
            });
        }

        // 1. الاستماع لتحديثات الحسابات والرتب والصلاحيات وتعيينات المشرفين لحظياً
        setupUsersListener() {
            if (!this.db) return;
            const usersRef = this.db.ref('users');

            usersRef.on('value', (snapshot) => {
                const remoteData = snapshot.val();

                if (!remoteData) {
                    const localUsers = this.getLocalUsers();
                    if (localUsers && localUsers.length > 0) {
                        this.pushUsersToFirebase(localUsers, 'initial_seed');
                    }
                    return;
                }

                const remoteUsers = Array.isArray(remoteData)
                    ? remoteData.filter(Boolean)
                    : Object.values(remoteData).filter(Boolean);

                if (remoteUsers.length === 0) return;

                this.isUpdatingFromRemote = true;
                try {
                    const serialized = JSON.stringify(remoteUsers);
                    localStorage.setItem('ksumc_users_db', serialized);
                    localStorage.setItem('ksumc_users', serialized);
                    localStorage.setItem('ksumc_admin_users', serialized);

                    // تحديث جلسة المستخدم النشط في KSUAuth إن تغير منصبه أو صلاحياته
                    try {
                        const activeRaw = localStorage.getItem('ksumc_active_user');
                        if (activeRaw) {
                            const activeObj = JSON.parse(activeRaw);
                            const matchedActive = remoteUsers.find(u =>
                                u.id === activeObj.id ||
                                (u.empId && activeObj.empId && String(u.empId).toLowerCase() === String(activeObj.empId).toLowerCase()) ||
                                (u.username && activeObj.username && String(u.username).toLowerCase() === String(activeObj.username).toLowerCase())
                            );
                            if (matchedActive) {
                                localStorage.setItem('ksumc_active_user', JSON.stringify(Object.assign({}, activeObj, matchedActive)));
                            }
                        }
                    } catch (err) {}

                    if (window.state) {
                        window.state.users = remoteUsers;

                        if (window.state.currentUser) {
                            const updatedMe = remoteUsers.find(u =>
                                u.id === window.state.currentUser.id ||
                                (u.username && window.state.currentUser.username &&
                                 u.username.toLowerCase() === window.state.currentUser.username.toLowerCase())
                            );
                            if (updatedMe) {
                                const oldRole = window.state.currentUser.role;
                                const oldSup = window.state.currentUser.supervisorId;
                                const oldShift = window.state.currentUser.shift;

                                window.state.currentUser = Object.assign({}, window.state.currentUser, updatedMe);
                                localStorage.setItem('ksumc_current_user', JSON.stringify(window.state.currentUser));
                                sessionStorage.setItem('ksumc_active_session', JSON.stringify(window.state.currentUser));

                                if (oldRole !== updatedMe.role || oldSup !== updatedMe.supervisorId || oldShift !== updatedMe.shift) {
                                    if (typeof window.applyRolePermissions === 'function') {
                                        window.applyRolePermissions(updatedMe.role);
                                    }
                                    if (typeof window.showToast === 'function') {
                                        window.showToast('🔄 تم تحديث صلاحياتك / منصبك لحظياً من الإدارة', 'info');
                                    }
                                }
                            }
                        }
                    }

                    window.dispatchEvent(new CustomEvent('ksumc_users_updated', { detail: { users: remoteUsers, source: 'firebase' } }));

                    if (typeof window.renderUsersManagementTable === 'function') {
                        window.renderUsersManagementTable();
                    }
                    if (typeof window.populateHierarchySupervisors === 'function') {
                        window.populateHierarchySupervisors();
                    }
                    if (typeof window.renderSupervisorTeamDashboard === 'function') {
                        window.renderSupervisorTeamDashboard();
                    }
                    if (typeof window.renderQualityShiftInspectionLog === 'function') {
                        window.renderQualityShiftInspectionLog();
                    }
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });
        }

        // 2. مراقبة حالة النظام وإشعارات التحديث وتصفير السجلات اليومية
        setupStatusMonitor() {
            if (!this.db) return;
            this.db.ref('system_status/lastUpdate').on('value', (snap) => {
                const info = snap.val();
                if (!info || info.deviceId === this.deviceId) return;
                console.log('⚡ [KSU-Firebase] تحديث فوري وارد من جهاز آخر:', info.action);
            });

            // الاستماع لأمر تصفير ومزامنة سجل التفتيش اليومي للورديات
            this.db.ref('system_status/shiftLogResetAt').on('value', (snap) => {
                const resetInfo = snap.val();
                if (!resetInfo || !resetInfo.timestamp) return;
                const isDemo = (window.KSUSystemMode && typeof window.KSUSystemMode.isDemo === 'function')
                    ? window.KSUSystemMode.isDemo()
                    : (localStorage.getItem('ksumc_system_mode') === 'demo');
                if (isDemo) return; // حماية وضع الديمو من التصفير التلقائي السحابي
                const resetTs = Number(resetInfo.timestamp) || 0;
                if (resetTs > this.lastResetTimestamp) {
                    this.lastResetTimestamp = resetTs;
                    localStorage.setItem('ksumc_shift_log_reset_at', String(resetTs));
                    if (resetInfo.resetDateKey) {
                        localStorage.setItem('ksumc_shift_log_last_date', resetInfo.resetDateKey);
                    }
                    if (resetInfo.clearAllToday) {
                        localStorage.setItem('ksumc_quality_shift_inspection_logs', JSON.stringify([]));
                        if (resetInfo.clearRoundsToo) {
                            const trialKeys = [
                                'ksumc_safety_rounds',
                                'ksumc_safety_dept_reports',
                                'ksumc_compliance_registry',
                                'ksumc_safety_doors',
                                'ksumc_safety_permits',
                                'ksumc_safety_alarms',
                                'ksumc_shift_incidents',
                                'ksumc_safety_violations',
                                'ksumc_smoking_violations',
                                'ksumc_incidents',
                                'ksumc_capa_records',
                                'ksumc_schedule'
                            ];
                            trialKeys.forEach(k => localStorage.setItem(k, JSON.stringify([])));
                            if (window.state) {
                                window.state.rounds = [];
                                window.state.safetyDeptReports = [];
                                window.state.complianceRegistry = [];
                                window.state.doors = [];
                                window.state.permits = [];
                                window.state.alarms = [];
                                window.state.shiftIncidents = [];
                                window.state.safetyViolations = [];
                                window.state.smokingViolations = [];
                            }
                        }
                    }
                    this.refreshAllWorkflowUIs();
                }
            });
        }

        // 3. الاستماع الفوري للجولات التفتيشية، سجل الورديات، تقارير السلامة، وسجل الامتثال لسباهي
        setupOperationalListeners() {
            if (!this.db) return;

            // أ) مزامنة الجولات التفتيشية (rounds) - السحابة هي المصدر المعتمد
            this.db.ref('rounds').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_safety_rounds', []);
                const isDemo = (window.KSUSystemMode && typeof window.KSUSystemMode.isDemo === 'function')
                    ? window.KSUSystemMode.isDemo()
                    : (localStorage.getItem('ksumc_system_mode') === 'demo');

                if (isDemo && remoteList.length === 0 && localList.length > 0) {
                    this.pushCollectionToFirebase('rounds', localList, 'id');
                    return;
                }
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_safety_rounds', JSON.stringify(finalList));
                    localStorage.setItem('ksumc_field_rounds', JSON.stringify(finalList));
                    localStorage.setItem('ksumc_rounds_registry', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.rounds = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('rounds', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ب) مزامنة سجل التفتيش اليومي للورديات (shift_inspection_logs)
            this.db.ref('shift_inspection_logs').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_quality_shift_inspection_logs', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_quality_shift_inspection_logs', JSON.stringify(finalList));
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('shift_inspection_logs', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ج) مزامنة تقارير إدارة السلامة الميدانية (safety_dept_reports)
            this.db.ref('safety_dept_reports').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_safety_dept_reports', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_safety_dept_reports', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.safetyDeptReports = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('safety_dept_reports', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // د) مزامنة سجل الامتثال لسباهي والاعتمادات الأخرى (compliance_registry)
            this.db.ref('compliance_registry').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_compliance_registry', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_compliance_registry', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.complianceRegistry = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('compliance_registry', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // هـ) مزامنة طلبات فتح الأبواب لجميع الورديات -> Q1 (doors)
            this.db.ref('doors').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_safety_doors', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_safety_doors', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.doors = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('doors', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // و) مزامنة تصاريح العمل على الساخن لجميع الورديات -> Q1 (permits)
            this.db.ref('permits').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_safety_permits', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_safety_permits', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.permits = finalList;
                    }
                    try {
                        window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { key: 'ksumc_safety_permits', value: finalList } }));
                        window.dispatchEvent(new CustomEvent('ksumc_permits_updated', { detail: { permits: finalList } }));
                    } catch (_) {}
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('permits', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ز) مزامنة تقارير الأكواد وأجراس الإنذار لجميع الورديات -> H1 (alarms)
            this.db.ref('alarms').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_safety_alarms', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_safety_alarms', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.alarms = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('alarms', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ح) مزامنة الحوادث السريعة والأكواد الميدانية لجميع الورديات -> H1 (shift_incidents)
            this.db.ref('shift_incidents').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_shift_incidents', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_shift_incidents', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.shiftIncidents = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('shift_incidents', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ط) مزامنة مخالفات السلامة لجميع الورديات -> H1 (safety_violations)
            this.db.ref('safety_violations').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_safety_violations', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_safety_violations', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.safetyViolations = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('safety_violations', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ي) مزامنة مخالفات التدخين لجميع الورديات -> H1 (smoking_violations)
            this.db.ref('smoking_violations').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal);
                const localList = this.safeParseJSON('ksumc_smoking_violations', []);
                const pendingOffline = localList.filter(item => item && item._isOfflinePending === true);
                const finalList = pendingOffline.length > 0 ? this.mergeCollectionsById(remoteList, pendingOffline, 'id') : remoteList;

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_smoking_violations', JSON.stringify(finalList));
                    if (window.state) {
                        window.state.smokingViolations = finalList;
                    }
                    if (pendingOffline.length > 0 && this.isConnected) {
                        this.pushCollectionToFirebase('smoking_violations', pendingOffline, 'id');
                    }
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ك) مزامنة أهداف جولات العمل ونسب الإنجاز لرئيس القسم (department_targets)
            this.db.ref('department_targets').on('value', (snapshot) => {
                const remoteTargets = snapshot.val();
                if (!remoteTargets || typeof remoteTargets !== 'object') return;
                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_department_targets', JSON.stringify(remoteTargets));
                    window.dispatchEvent(new CustomEvent('ksumc_targets_updated', { detail: { targets: remoteTargets } }));
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });

            // ل) مزامنة الإشعارات والتوجيهات التنفيذية اللحظية للمفتشين والمشرفين (notifications)
            this.db.ref('notifications').on('value', (snapshot) => {
                const remoteVal = snapshot.val();
                const remoteList = this.normalizeFirebaseCollection(remoteVal).filter(n => !n._deleted && n.status !== 'مغلق');

                this.isUpdatingFromRemote = true;
                try {
                    localStorage.setItem('ksumc_notifications', JSON.stringify(remoteList));
                    if (window.state) {
                        window.state.notifications = remoteList;
                    }
                    window.dispatchEvent(new CustomEvent('ksumc_notifications_updated', { detail: { list: remoteList, source: 'firebase' } }));
                    this.handleIncomingRealtimeNotifications(remoteList);
                    this.refreshAllWorkflowUIs();
                } finally {
                    this.isUpdatingFromRemote = false;
                }
            });
        }

        normalizeFirebaseCollection(val) {
            if (!val) return [];
            const arr = Array.isArray(val) ? val.filter(Boolean) : Object.values(val).filter(Boolean);
            return arr.filter(item => {
                if (!item || typeof item !== 'object') return false;
                const itemTs = Number(item.updatedAtMs || item.createdAtMs || 0);
                if (this.lastResetTimestamp > 0 && itemTs > 0 && itemTs < this.lastResetTimestamp && item._clearedByReset) {
                    return false;
                }
                return true;
            });
        }

        safeParseJSON(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return fallback;
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : fallback;
            } catch (e) {
                return fallback;
            }
        }

        mergeCollectionsById(remoteList, localList, idKey = 'id') {
            const map = new Map();
            const addOrUpdate = (item) => {
                if (!item || typeof item !== 'object') return;
                const rawId = item[idKey] || item.roundId || item.reportId;
                if (!rawId) return;
                const key = String(rawId);
                const existing = map.get(key);
                if (!existing) {
                    map.set(key, item);
                } else {
                    const existingTime = new Date(existing.updatedAt || existing.submittedAt || existing.createdAt || 0).getTime() || Number(existing.updatedAtMs || 0);
                    const newTime = new Date(item.updatedAt || item.submittedAt || item.createdAt || 0).getTime() || Number(item.updatedAtMs || 0);
                    if (newTime >= existingTime) {
                        map.set(key, Object.assign({}, existing, item));
                    } else {
                        map.set(key, Object.assign({}, item, existing));
                    }
                }
            };

            // نضيف السحابي أولاً ثم ندمج المحلي الأحدث
            (remoteList || []).forEach(addOrUpdate);
            (localList || []).forEach(addOrUpdate);

            return Array.from(map.values()).sort((a, b) => {
                const tA = new Date(a.updatedAt || a.submittedAt || a.createdAt || a.date || 0).getTime() || 0;
                const tB = new Date(b.updatedAt || b.submittedAt || b.createdAt || b.date || 0).getTime() || 0;
                return tB - tA;
            });
        }

        sanitizeFirebaseKey(rawKey) {
            return String(rawKey || ('ITEM_' + Date.now())).replace(/[.#$\[\]\/]/g, '_');
        }

        pushCollectionToFirebase(nodeName, list, idKey = 'id') {
            if (!this.db || !Array.isArray(list)) return Promise.resolve(false);
            const payload = {};
            list.forEach(item => {
                if (!item) return;
                const key = this.sanitizeFirebaseKey(item[idKey] || item.roundId || item.reportId);
                payload[key] = JSON.parse(JSON.stringify(item));
            });
            return this.db.ref(nodeName).update(payload).catch(err => {
                console.warn(`[KSU-Firebase] تعذر رفع القائمة (${nodeName}):`, err);
            });
        }

        pushPendingLocalDataToCloud() {
            if (!this.db || !this.isConnected) return;
            // رفع البيانات التي أُنشئت أثناء عدم الاتصال حصراً (_isOfflinePending === true) لمنع إعادة حقن بيانات قديمة
            const collections = [
                { key: 'ksumc_safety_rounds', node: 'rounds' },
                { key: 'ksumc_quality_shift_inspection_logs', node: 'shift_inspection_logs' },
                { key: 'ksumc_safety_dept_reports', node: 'safety_dept_reports' },
                { key: 'ksumc_compliance_registry', node: 'compliance_registry' },
                { key: 'ksumc_safety_doors', node: 'doors' },
                { key: 'ksumc_safety_permits', node: 'permits' },
                { key: 'ksumc_safety_alarms', node: 'alarms' },
                { key: 'ksumc_shift_incidents', node: 'shift_incidents' },
                { key: 'ksumc_safety_violations', node: 'safety_violations' },
                { key: 'ksumc_smoking_violations', node: 'smoking_violations' },
                { key: 'ksumc_notifications', node: 'notifications' }
            ];

            collections.forEach(({ key, node }) => {
                const local = this.safeParseJSON(key, []);
                const offlineOnly = local.filter(item => item && item._isOfflinePending === true);
                if (offlineOnly.length > 0) {
                    this.pushCollectionToFirebase(node, offlineOnly, 'id');
                }
            });
        }

        refreshAllWorkflowUIs() {
            if (typeof window.syncRoundsToShiftInspectionLog === 'function') {
                window.syncRoundsToShiftInspectionLog(true);
            }
            if (typeof window.renderQualityShiftInspectionLog === 'function') {
                window.renderQualityShiftInspectionLog();
            }
            if (typeof window.renderQualitySavedReports === 'function') {
                window.renderQualitySavedReports();
            }
            if (typeof window.renderQualityWorkflowInbox === 'function') {
                window.renderQualityWorkflowInbox();
            }
            if (typeof window.renderQualityDoorsAndPermitsInbox === 'function') {
                window.renderQualityDoorsAndPermitsInbox();
            }
            if (typeof window.renderComplianceRegistryTable === 'function') {
                window.renderComplianceRegistryTable();
            }
            if (typeof window.renderHeadWorkflowQueue === 'function') {
                window.renderHeadWorkflowQueue();
            }
            if (typeof window.renderHeadOperationalCenter === 'function') {
                window.renderHeadOperationalCenter();
            }
            if (typeof window.renderHeadSentDirectives === 'function') {
                window.renderHeadSentDirectives();
            }
            if (typeof window.renderInspectorWorkflowTracker === 'function') {
                window.renderInspectorWorkflowTracker();
            }
            if (typeof window.renderInspectorLiveNotifications === 'function') {
                window.renderInspectorLiveNotifications();
            }
            if (window.KSUNav && typeof window.KSUNav.updateNotificationCount === 'function') {
                window.KSUNav.updateNotificationCount();
            }
            if (typeof window.renderOfficialReport === 'function') {
                window.renderOfficialReport();
            }
            if (typeof window.renderRoundsTables === 'function') {
                window.renderRoundsTables();
            }
            if (typeof window.renderHomeRecentRounds === 'function') {
                window.renderHomeRecentRounds();
            }
            if (typeof window.renderDoorsTables === 'function') {
                window.renderDoorsTables();
            }
            if (typeof window.renderDoorsList === 'function') {
                window.renderDoorsList();
            }
            if (typeof window.renderPermitsTables === 'function') {
                window.renderPermitsTables();
            }
            if (typeof window.renderPermitsList === 'function') {
                window.renderPermitsList();
            }
            if (typeof window.renderAlarmsTables === 'function') {
                window.renderAlarmsTables();
            }
            if (typeof window.renderSafetyViolationsTables === 'function') {
                window.renderSafetyViolationsTables();
            }
            if (typeof window.renderSmokingViolationsTables === 'function') {
                window.renderSmokingViolationsTables();
            }
            if (typeof window.renderShiftQuickIncidentsList === 'function') {
                window.renderShiftQuickIncidentsList();
            }
            if (typeof window.renderSafetyDeptSubmittedReportsTable === 'function') {
                window.renderSafetyDeptSubmittedReportsTable();
            }
            if (typeof window.updateFieldLiveCounters === 'function') {
                window.updateFieldLiveCounters();
            }
            if (window.KSUNav && typeof window.KSUNav.updateAlarmCount === 'function') {
                window.KSUNav.updateAlarmCount();
            }
        }

        getLocalUsers() {
            try {
                const raw = localStorage.getItem('ksumc_users_db') || localStorage.getItem('ksumc_admin_users') || localStorage.getItem('ksumc_users');
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        }

        // 4. رفع قائمة المستخدمين كاملة إلى السحابة
        pushUsersToFirebase(usersArray, actionName = 'update_users') {
            if (!this.db || this.isUpdatingFromRemote) return Promise.resolve(false);
            if (!Array.isArray(usersArray)) return Promise.resolve(false);

            const cleanUsers = JSON.parse(JSON.stringify(usersArray)).map(u => {
                delete u.password;
                delete u.passwordHash;
                return u;
            });

            const updateMap = {};
            cleanUsers.forEach(u => {
                if (u && (u.id || u.username || u.empId)) {
                    const key = this.sanitizeFirebaseKey(u.id || u.username || u.empId);
                    updateMap[key] = u;
                }
            });

            return this.db.ref('users').update(updateMap).then(() => {
                return this.db.ref('system_status/lastUpdate').set({
                    action: actionName,
                    deviceId: this.deviceId,
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    updatedBy: (window.state && window.state.currentUser) ? window.state.currentUser.username : 'system'
                });
            }).then(() => {
                console.log('✅ [KSU-Firebase] تمت مزامنة المستخدمين والرتب والصلاحيات في السحابة بنجاح:', actionName);
                return true;
            }).catch(err => {
                console.error('[KSU-Firebase] فشل رفع التحديث للسحابة:', err);
                return false;
            });
        }

        // 5. تحديث مستخدم واحد أو إضافته لحظياً
        syncSingleUser(userObj, actionName = 'sync_single_user') {
            const users = (window.state && Array.isArray(window.state.users))
                ? window.state.users
                : this.getLocalUsers();

            const idx = users.findIndex(u =>
                u.id === userObj.id ||
                (u.empId && userObj.empId && String(u.empId).toLowerCase() === String(userObj.empId).toLowerCase()) ||
                (u.username && userObj.username && u.username.toLowerCase() === userObj.username.toLowerCase())
            );

            if (idx !== -1) {
                users[idx] = Object.assign({}, users[idx], userObj);
            } else {
                users.push(userObj);
            }

            const serialized = JSON.stringify(users);
            localStorage.setItem('ksumc_users_db', serialized);
            localStorage.setItem('ksumc_users', serialized);
            localStorage.setItem('ksumc_admin_users', serialized);
            if (window.state) window.state.users = users;

            return this.pushUsersToFirebase(users, actionName);
        }

        deleteUser(userId) {
            if (!userId) return Promise.resolve(false);
            let users = this.getLocalUsers();
            users = users.filter(u =>
                u.id !== userId &&
                u.empId !== userId &&
                u.employeeId !== userId &&
                u.username !== userId
            );
            const serialized = JSON.stringify(users);
            localStorage.setItem('ksumc_users_db', serialized);
            localStorage.setItem('ksumc_users', serialized);
            localStorage.setItem('ksumc_admin_users', serialized);
            if (window.state) window.state.users = users;

            return this.pushUsersToFirebase(users, 'delete_user_' + userId);
        }

        broadcastUserUpdate(userObj) {
            return this.syncSingleUser(userObj, 'broadcast_user_update');
        }

        syncDepartmentTargets(targetsObj) {
            if (!targetsObj || typeof targetsObj !== 'object') return Promise.resolve(false);
            localStorage.setItem('ksumc_department_targets', JSON.stringify(targetsObj));
            window.dispatchEvent(new CustomEvent('ksumc_targets_updated', { detail: { targets: targetsObj } }));
            if (!this.db) return Promise.resolve(true);
            return this.db.ref('department_targets').set(JSON.parse(JSON.stringify(targetsObj))).then(() => {
                this.notifySystemUpdate('sync_department_targets');
                return true;
            }).catch(() => false);
        }

        // 6. مزامنة جولة تفتيشية أو قائمة جولات
        syncRound(roundData) {
            if (!this.db || !roundData) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(roundData.id);
            const cleanData = JSON.parse(JSON.stringify(roundData));
            
            const p1 = this.db.ref('rounds/' + key).set(cleanData);
            let p2 = Promise.resolve();
            if (typeof window.syncRoundsToShiftInspectionLog === 'function') {
                try {
                    window.syncRoundsToShiftInspectionLog(true);
                    const shiftLogs = this.safeParseJSON('ksumc_quality_shift_inspection_logs', []);
                    const matchingLog = shiftLogs.find(l => String(l.id) === String(roundData.id) || String(l.roundId) === String(roundData.id));
                    if (matchingLog) {
                        p2 = this.db.ref('shift_inspection_logs/' + key).set(JSON.parse(JSON.stringify(matchingLog)));
                    }
                } catch (_) {}
            }

            return Promise.all([p1, p2]).then(() => {
                this.notifySystemUpdate('sync_round_' + key);
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر مزامنة الجولة:', err);
                return false;
            });
        }

        syncRoundsList(roundsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(roundsArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('rounds', roundsArray, 'id');
        }

        // 7. مزامنة سجل التفتيش اليومي للورديات
        syncShiftLogRecord(record) {
            if (!this.db || !record) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(record.id);
            const cleanData = JSON.parse(JSON.stringify(record));
            return this.db.ref('shift_inspection_logs/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_shift_log_' + key);
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر مزامنة سجل الوردية:', err);
                return false;
            });
        }

        syncShiftLogs(recordsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(recordsArray)) return Promise.resolve(false);
            const payload = {};
            recordsArray.forEach(item => {
                if (!item || !item.id) return;
                payload[this.sanitizeFirebaseKey(item.id)] = JSON.parse(JSON.stringify(item));
            });
            return this.db.ref('shift_inspection_logs').set(payload).catch(err => {
                console.warn('[KSU-Firebase] تعذر مزامنة قائمة سجل الورديات:', err);
            });
        }

        // 8. مزامنة تقارير إدارة السلامة الميدانية (-> H1)
        syncSafetyDeptReport(reportObj) {
            if (!this.db || !reportObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(reportObj.id);
            const cleanData = JSON.parse(JSON.stringify(reportObj));
            return this.db.ref('safety_dept_reports/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_safety_report_' + key);
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر مزامنة تقرير السلامة:', err);
                return false;
            });
        }

        syncSafetyDeptReportsList(reportsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(reportsArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('safety_dept_reports', reportsArray, 'id');
        }

        // 9. مزامنة سجل الامتثال لسباهي والاعتمادات الرسمية
        syncComplianceRecord(complianceObj) {
            if (!this.db || !complianceObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(complianceObj.id);
            const cleanData = JSON.parse(JSON.stringify(complianceObj));
            return this.db.ref('compliance_registry/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_compliance_' + key);
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر مزامنة سجل الامتثال:', err);
                return false;
            });
        }

        // 10. مزامنة طلبات فتح الأبواب وتصاريح العمل الساخن (-> Q1)
        syncDoor(doorObj) {
            if (!this.db || !doorObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(doorObj.id);
            const cleanData = JSON.parse(JSON.stringify(doorObj));
            return this.db.ref('doors/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_door_' + key);
                return true;
            }).catch(() => false);
        }

        syncDoorsList(doorsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(doorsArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('doors', doorsArray, 'id');
        }

        syncPermit(permitObj) {
            if (!this.db || !permitObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(permitObj.id);
            const cleanData = JSON.parse(JSON.stringify(permitObj));
            return this.db.ref('permits/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_permit_' + key);
                return true;
            }).catch(() => false);
        }

        syncPermitsList(permitsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(permitsArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('permits', permitsArray, 'id');
        }

        // 11. مزامنة تقارير الأكواد، الحوادث السريعة، مخالفات السلامة، ومخالفات التدخين (-> H1)
        syncAlarm(alarmObj) {
            if (!this.db || !alarmObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(alarmObj.id);
            const cleanData = JSON.parse(JSON.stringify(alarmObj));
            return this.db.ref('alarms/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_alarm_' + key);
                return true;
            }).catch(() => false);
        }

        syncAlarmsList(alarmsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(alarmsArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('alarms', alarmsArray, 'id');
        }

        syncShiftIncident(incObj) {
            if (!this.db || !incObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(incObj.id);
            const cleanData = JSON.parse(JSON.stringify(incObj));
            return this.db.ref('shift_incidents/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_shift_inc_' + key);
                return true;
            }).catch(() => false);
        }

        syncShiftIncidentsList(incArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(incArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('shift_incidents', incArray, 'id');
        }

        syncSafetyViolation(violObj) {
            if (!this.db || !violObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(violObj.id);
            const cleanData = JSON.parse(JSON.stringify(violObj));
            return this.db.ref('safety_violations/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_safety_viol_' + key);
                return true;
            }).catch(() => false);
        }

        syncSafetyViolationsList(violArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(violArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('safety_violations', violArray, 'id');
        }

        syncSmokingViolation(violObj) {
            if (!this.db || !violObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(violObj.id);
            const cleanData = JSON.parse(JSON.stringify(violObj));
            return this.db.ref('smoking_violations/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_smoking_viol_' + key);
                return true;
            }).catch(() => false);
        }

        syncSmokingViolationsList(violArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(violArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('smoking_violations', violArray, 'id');
        }

        // 12. تصفير ومزامنة سجل التفتيش اليومي للورديات أو مسح جميع الجولات التجريبية سحابياً ومحلياً
        resetDailyShiftLogs(clearAllRounds = false) {
            if (clearAllRounds) {
                return this.purgeAllTrialOperationalData(true);
            }
            const nowTs = Date.now();
            const todayKey = new Date().toISOString().split('T')[0];
            this.lastResetTimestamp = nowTs;
            localStorage.setItem('ksumc_shift_log_reset_at', String(nowTs));
            localStorage.setItem('ksumc_shift_log_last_date', todayKey);
            localStorage.setItem('ksumc_quality_shift_inspection_logs', JSON.stringify([]));

            if (!this.db) {
                this.refreshAllWorkflowUIs();
                return Promise.resolve(true);
            }

            return Promise.all([
                this.db.ref('shift_inspection_logs').remove(),
                this.db.ref('system_status/shiftLogResetAt').set({
                    timestamp: nowTs,
                    resetDateKey: todayKey,
                    clearAllToday: true,
                    clearRoundsToo: false,
                    deviceId: this.deviceId,
                    resetBy: (window.state && window.state.currentUser) ? window.state.currentUser.name : 'قسم الجودة وتقييم الأداء'
                })
            ]).then(() => {
                this.refreshAllWorkflowUIs();
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر تصفير السجل السحابي:', err);
                this.refreshAllWorkflowUIs();
                return false;
            });
        }

        // 13. حذف وتصفير جميع الجولات والسجلات التجريبية استعداداً للعمل الحقيقي المعتمد
        purgeAllTrialOperationalData(isManual = false) {
            const nowTs = Date.now();
            const todayKey = new Date().toISOString().split('T')[0];
            this.lastResetTimestamp = nowTs;
            localStorage.setItem('ksumc_shift_log_reset_at', String(nowTs));
            localStorage.setItem('ksumc_shift_log_last_date', todayKey);
            localStorage.setItem('ksumc_prod_clean_version', PROD_CLEANUP_VERSION);
            localStorage.setItem('ksumc_system_mode', 'production');
            localStorage.setItem('ksumc_prod_zero_state', 'true');

            const trialKeys = [
                'ksumc_safety_rounds',
                'ksumc_field_rounds',
                'ksumc_rounds_registry',
                'ksumc_quality_shift_inspection_logs',
                'ksumc_safety_dept_reports',
                'ksumc_compliance_registry',
                'ksumc_safety_doors',
                'ksumc_safety_permits',
                'ksumc_safety_alarms',
                'ksumc_shift_incidents',
                'ksumc_safety_violations',
                'ksumc_smoking_violations',
                'ksumc_incidents',
                'ksumc_capa_records',
                'ksumc_capa_registry',
                'ksumc_schedule',
                'ksumc_notifications',
                'ksumc_seen_notif_popup_ids',
                'ksumc_inspection_events',
                'ksumc_recent_inspections',
                'ksumc_head_workflow_decisions',
                'ksumc_quality_reviews',
                'ksumc_inspections',
                'ksumc_hazmat_logs'
            ];
            trialKeys.forEach(k => {
                try {
                    localStorage.removeItem(k);
                    localStorage.setItem(k, JSON.stringify([]));
                } catch(e) {}
            });

            if (window.state) {
                window.state.rounds = [];
                window.state.safetyDeptReports = [];
                window.state.complianceRegistry = [];
                window.state.doors = [];
                window.state.permits = [];
                window.state.alarms = [];
                window.state.shiftIncidents = [];
                window.state.safetyViolations = [];
                window.state.smokingViolations = [];
                window.state.incidents = [];
                window.state.schedule = [];
                window.state.notifications = [];
            }

            if (!this.db) {
                this.refreshAllWorkflowUIs();
                window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { type: 'purge_all_trial_data' } }));
                window.dispatchEvent(new CustomEvent('ksumc_notifications_updated', { detail: { list: [], source: 'purge' } }));
                window.dispatchEvent(new CustomEvent('ksumc_permits_updated', { detail: { permits: [] } }));
                return Promise.resolve(true);
            }

            const cloudNodes = [
                'rounds',
                'notifications',
                'shift_inspection_logs',
                'safety_dept_reports',
                'compliance_registry',
                'doors',
                'permits',
                'alarms',
                'shift_incidents',
                'safety_violations',
                'smoking_violations',
                'incidents',
                'capa_records',
                'inspection_events',
                'recent_inspections',
                'schedule'
            ];

            const promises = cloudNodes.map(node => this.db.ref(node).remove());
            promises.push(this.db.ref('system_status/prodCleanVersion').set(PROD_CLEANUP_VERSION));
            promises.push(this.db.ref('system_status/systemMode').set('production'));
            promises.push(this.db.ref('system_status/shiftLogResetAt').set({
                timestamp: nowTs,
                resetDateKey: todayKey,
                clearAllToday: true,
                clearRoundsToo: true,
                deviceId: this.deviceId,
                resetBy: (window.state && window.state.currentUser) ? window.state.currentUser.name : 'إدارة النظام - بدء العمل الفعلي'
            }));

            return Promise.all(promises).then(() => {
                console.log('✅ [KSU-Firebase] تم تطهير جميع الجولات والسجلات التجريبية محلياً وسحابياً استعداداً للعمل الفعلي.');
                this.refreshAllWorkflowUIs();
                window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { type: 'purge_all_trial_data' } }));
                window.dispatchEvent(new CustomEvent('ksumc_notifications_updated', { detail: { list: [], source: 'purge' } }));
                window.dispatchEvent(new CustomEvent('ksumc_permits_updated', { detail: { permits: [] } }));
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر تطهير بعض العقد السحابية:', err);
                this.refreshAllWorkflowUIs();
                return false;
            });
        }

        notifySystemUpdate(actionName) {
            if (!this.db) return;
            this.db.ref('system_status/lastUpdate').set({
                action: actionName,
                deviceId: this.deviceId,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                updatedBy: (window.state && window.state.currentUser) ? window.state.currentUser.username : 'system'
            }).catch(() => {});
        }

        // 14. مزامنة البلاغات الميدانية
        syncIncident(incidentData) {
            if (!this.db || !incidentData) return;
            const incId = this.sanitizeFirebaseKey(incidentData.id || ('INC-' + Date.now()));
            this.db.ref('incidents/' + incId).set(JSON.parse(JSON.stringify(incidentData)));
        }

        // 15. مزامنة الإشعارات والتوجيهات التنفيذية اللحظية للمفتشين والمشرفين
        syncNotification(notifObj) {
            if (!this.db || !notifObj) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(notifObj.id || ('DIR-' + Date.now()));
            const timestampVal = notifObj.timestamp || notifObj.createdAt || new Date().toISOString();
            const cleanData = JSON.parse(JSON.stringify(Object.assign({
                timestamp: timestampVal,
                createdAt: timestampVal
            }, notifObj, {
                timestamp: timestampVal,
                originDeviceId: notifObj.originDeviceId || this.deviceId
            })));
            return this.db.ref('notifications/' + key).set(cleanData).then(() => {
                this.notifySystemUpdate('sync_notification_' + key);
                return true;
            }).catch(err => {
                console.warn('[KSU-Firebase] تعذر مزامنة الإشعار والتوجيه:', err);
                return false;
            });
        }

        syncNotificationsList(notifsArray) {
            if (!this.db || this.isUpdatingFromRemote || !Array.isArray(notifsArray)) return Promise.resolve(false);
            return this.pushCollectionToFirebase('notifications', notifsArray, 'id');
        }

        deleteNotificationFromCloud(notifId) {
            if (!this.db || !notifId) return Promise.resolve(false);
            const key = this.sanitizeFirebaseKey(notifId);
            return this.db.ref('notifications/' + key).remove().then(() => {
                this.notifySystemUpdate('delete_notification_' + key);
                return true;
            }).catch(() => false);
        }

        // 16. معالج الإشعارات الفورية الواردة للمفتشين والمشرفين (صوت + نافذة منبثقة + إشعار متصفح)
        handleIncomingRealtimeNotifications(notifsList) {
            if (!Array.isArray(notifsList) || notifsList.length === 0) return;

            const user = (window.KSUAuth && typeof window.KSUAuth.getUser === 'function')
                ? window.KSUAuth.getUser()
                : (window.state && window.state.currentUser ? window.state.currentUser : null);

            let seenIds = [];
            try {
                seenIds = JSON.parse(localStorage.getItem('ksumc_seen_notif_popup_ids') || '[]') || [];
            } catch (e) {
                seenIds = [];
            }

            const uId = user ? String(user.id || user.empId || user.username || '') : '';
            const uEmpId = user ? String(user.empId || user.username || '') : '';
            const uName = user ? String(user.name || '') : '';
            const uShift = user ? String(user.shift || '') : '';
            const uRoleCat = (window.KSUAuth && user) ? window.KSUAuth.getRoleCategory(user) : (user ? user.roleCategory : 'field_inspector');

            // البحث عن أحدث توجيه أو إشعار نشط لم يتم عرضه منبثقاً لهذا الجهاز/المستخدم بعد
            const candidates = notifsList.filter(n => {
                if (!n || !n.id || n._deleted || n.status === 'مغلق' || n.status === 'مؤرشف') return false;
                if (seenIds.includes(String(n.id))) return false;

                // التحقق مما إذا كان المستخدم الحالي قد أكد الاطلاع مسبقاً
                const ackList = Array.isArray(n.acknowledgedBy) ? n.acknowledgedBy : [];
                const alreadyAcked = ackList.some(a =>
                    (uId && a.userId === uId) ||
                    (uEmpId && a.empId === uEmpId) ||
                    (uName && a.name === uName)
                );
                if (alreadyAcked) return false;

                // التحقق من مطابقة الوردية أو المستخدم المستهدف
                const targetShift = String(n.targetShift || 'all');
                if (targetShift !== 'all' && targetShift !== 'جميع الورديات' && user) {
                    const shiftMatched =
                        uShift.includes(targetShift) ||
                        targetShift.includes(uShift) ||
                        (targetShift.includes('1') && (uShift.includes('1') || uShift.includes('صباح') || uShift.includes('الأولى') || uShift.includes('الاولى'))) ||
                        (targetShift.includes('2') && (uShift.includes('2') || uShift.includes('مسائ') || uShift.includes('الثانية'))) ||
                        (targetShift.includes('3') && (uShift.includes('3') || uShift.includes('ليل') || uShift.includes('الثالثة'))) ||
                        targetShift === uId ||
                        targetShift === uEmpId ||
                        (uName && targetShift.includes(uName));
                    if (!shiftMatched && uRoleCat !== 'head' && uRoleCat !== 'developer') {
                        return false;
                    }
                }
                return true;
            });

            if (candidates.length > 0) {
                const latest = candidates[0];
                seenIds.push(String(latest.id));
                if (seenIds.length > 100) seenIds = seenIds.slice(-100);
                try {
                    localStorage.setItem('ksumc_seen_notif_popup_ids', JSON.stringify(seenIds));
                } catch (e) {}

                // عدم إزعاج المرسل نفسه بالنافذة المنبثقة إذا كان في صفحة رئيس القسم لحظة الإرسال
                const isOnHeadPage = window.location.pathname.toLowerCase().includes('head');
                if (isOnHeadPage && latest.originDeviceId === this.deviceId && latest.type === 'executive_directive') {
                    return;
                }

                this.playRealtimeAlertSound(latest.priority || 'high');
                this.triggerSystemNotification(latest);
                this.showRealtimeDirectivePopup(latest);
            }
        }

        playRealtimeAlertSound(priority = 'high') {
            try {
                if (navigator.vibrate) {
                    navigator.vibrate(priority === 'critical' ? [300, 120, 300, 120, 400] : [200, 100, 200]);
                }
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const now = ctx.currentTime;

                const playTone = (freq, startOffset, duration, gainVal = 0.18) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = priority === 'critical' ? 'sawtooth' : 'sine';
                    osc.frequency.setValueAtTime(freq, now + startOffset);
                    gain.gain.setValueAtTime(0.001, now + startOffset);
                    gain.gain.exponentialRampToValueAtTime(gainVal, now + startOffset + 0.03);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + startOffset);
                    osc.stop(now + startOffset + duration);
                };

                if (priority === 'critical') {
                    playTone(880, 0, 0.18, 0.22);
                    playTone(1174.66, 0.2, 0.18, 0.22);
                    playTone(880, 0.4, 0.25, 0.22);
                } else {
                    playTone(587.33, 0, 0.16, 0.16);   // D5
                    playTone(880.00, 0.18, 0.28, 0.18); // A5
                }
            } catch (e) {
                // قد يمنع المتصفح الصوت قبل أول تفاعل للمستخدم
            }
        }

        setupLockScreenNotificationBridge() {
            if (typeof window === 'undefined') return;

            // 1. تسجيل وتحديث Service Worker لضمان عمل إشعارات شاشة القفل (Lock-Screen Notifications)
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').then((reg) => {
                    if (reg.periodicSync) {
                        reg.periodicSync.register('ksumc-periodic-notifications', {
                            minInterval: 60 * 1000
                        }).catch(() => {});
                    }
                }).catch(() => {});

                // استقبال تأكيد الاطلاع إذا ضغط المفتش على زر "✓ تأكيد الاطلاع" من شاشة قفل الهاتف مباشرة
                navigator.serviceWorker.addEventListener('message', (event) => {
                    const data = event.data;
                    if (data && data.type === 'LOCKSCREEN_NOTIF_ACKNOWLEDGED' && data.notifId) {
                        const user = window.KSUAuth ? window.KSUAuth.getUser() : null;
                        if (window.KSUDataBridge && typeof window.KSUDataBridge.acknowledgeNotification === 'function') {
                            window.KSUDataBridge.acknowledgeNotification(data.notifId, user);
                        }
                        if (typeof window.renderInspectorLiveNotifications === 'function') {
                            window.renderInspectorLiveNotifications();
                        }
                    }
                });
            }

            // 2. معالجة الرابط في حال فتح البوابة الميدانية من زر تأكيد الاطلاع على شاشة القفل
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const ackNotifId = urlParams.get('ack_notif');
                if (ackNotifId) {
                    setTimeout(() => {
                        const user = window.KSUAuth ? window.KSUAuth.getUser() : null;
                        if (window.KSUDataBridge && typeof window.KSUDataBridge.acknowledgeNotification === 'function') {
                            window.KSUDataBridge.acknowledgeNotification(ackNotifId, user);
                        }
                        if (typeof window.renderInspectorLiveNotifications === 'function') {
                            window.renderInspectorLiveNotifications();
                        }
                    }, 1200);
                }
            } catch (e) {}

            // 3. عند إغلاق شاشة الهاتف أو العودة إليها (visibilitychange) نحافظ على نشاط الاتصال وفحص الإشعارات
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                        navigator.serviceWorker.controller.postMessage({
                            type: 'CHECK_FIREBASE_NOTIFICATIONS',
                            lastSeenTimestamp: Date.now() - 5 * 60 * 1000
                        });
                    }
                } else if (document.visibilityState === 'visible') {
                    if (this.db && typeof this.db.goOnline === 'function') {
                        try { this.db.goOnline(); } catch (e) {}
                    }
                    this.refreshAllWorkflowUIs();
                }
            });

            // 4. تصدير دوال تفعيل واختبار إشعارات شاشة القفل للمفتشين
            window.requestLockScreenNotificationsPermission = async () => {
                if (!('Notification' in window)) {
                    alert('متصفحك الحالي لا يدعم إشعارات شاشة القفل. في أجهزة الآيفون (iOS) يرجى الضغط على زر المشاركة ثم اختيار "إضافة إلى الشاشة الرئيسية (Add to Home Screen)" لتفعيل إشعارات شاشة القفل.');
                    return 'unsupported';
                }
                try {
                    const perm = await Notification.requestPermission();
                    if (typeof window.updateLockScreenNotifStatusUI === 'function') {
                        window.updateLockScreenNotifStatusUI();
                    }
                    if (perm === 'granted') {
                        this.triggerSystemNotification({
                            id: 'test-lockscreen-' + Date.now(),
                            title: '✅ تم تفعيل إشعارات شاشة القفل بنجاح',
                            message: 'ستصلك الآن التوجيهات التنفيذية الفورية بالصوت والاهتزاز حتى وشاشة الهاتف مغلقة.',
                            sender: 'منظومة سلامة KSUMC',
                            targetShiftLabel: 'جوال المفتش الميداني',
                            priority: 'critical'
                        });
                    }
                    return perm;
                } catch (e) {
                    return 'default';
                }
            };

            window.sendTestLockScreenNotification = () => {
                this.playRealtimeAlertSound('critical');
                this.triggerSystemNotification({
                    id: 'test-lock-' + Date.now(),
                    title: '🔔 تجربة إشعار شاشة القفل - سلامة KSUMC',
                    message: 'اختبار ناجح! يمكنك قفل شاشة الهاتف وسيظهر هذا التوجيه على شاشة القفل مع أزرار التأكيد المباشر.',
                    sender: 'رئيس القسم / المشرف العام (H1)',
                    targetShiftLabel: 'المفتش الميداني',
                    priority: 'critical'
                });
            };
        }

        triggerSystemNotification(notif) {
            try {
                if (!('Notification' in window)) return;
                if (Notification.permission !== 'granted') return;

                const isCritical = notif.priority === 'critical' || notif.severity === 'critical' || notif.type === 'quality_return' || notif.type === 'head_return';
                const title = notif.title || (isCritical ? '⚡ توجيه طارئ وعاجل - سلامة KSUMC' : '📢 توجيه تنفيذي فوري - سلامة KSUMC');
                const sender = notif.sender || notif.senderName || 'رئيس القسم (H1)';
                const targetLabel = notif.targetShiftLabel || (notif.targetShift === 'all' ? 'كافة الورديات والمفتشين' : (notif.targetShift || 'المفتشين'));
                const bodyText = `${notif.message || notif.notes || ''}\nالمرسل: ${sender} | المستهدف: ${targetLabel}`;
                const notifId = String(notif.id || ('ksumc-notif-' + Date.now()));

                // تحديث شارة أيقونة التطبيق على الشاشة الرئيسية للهاتف
                if (navigator.setAppBadge) {
                    try { navigator.setAppBadge(1); } catch (e) {}
                }

                // الطريقة الأولى (المعتمدة لشاشة قفل الجوال أندرويد وآيفون PWA): عبر Service Worker Registration
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then((reg) => {
                        if (reg && typeof reg.showNotification === 'function') {
                            return reg.showNotification(title, {
                                body: bodyText,
                                icon: './assets/images/app-icon.png',
                                badge: './assets/images/app-icon.png',
                                dir: 'rtl',
                                lang: 'ar',
                                tag: notifId,
                                renotify: true,
                                requireInteraction: true,
                                silent: false,
                                vibrate: isCritical ? [400, 150, 400, 150, 600, 200, 600] : [250, 120, 250, 120, 400],
                                data: {
                                    notifId: notifId,
                                    url: './field.html',
                                    notif: notif
                                },
                                actions: [
                                    { action: 'acknowledge', title: '✓ تأكيد الاطلاع والالتزام' },
                                    { action: 'open_portal', title: 'فتح البوابة الميدانية' }
                                ]
                            });
                        }
                    }).catch(() => {
                        // Fallback لمتصفحات سطح المكتب
                        try {
                            new Notification(title, {
                                body: bodyText,
                                icon: 'assets/images/app-icon.png',
                                dir: 'rtl',
                                lang: 'ar',
                                tag: notifId,
                                requireInteraction: true
                            });
                        } catch (err) {}
                    });
                    return;
                }

                // Fallback لمتصفحات سطح المكتب بدون Service Worker
                new Notification(title, {
                    body: bodyText,
                    icon: 'assets/images/app-icon.png',
                    dir: 'rtl',
                    lang: 'ar',
                    tag: notifId
                });
            } catch (e) {}
        }

        showRealtimeDirectivePopup(notif) {
            if (!notif || typeof document === 'undefined') return;

            let container = document.getElementById('ksumc-realtime-popup-host');
            if (!container) {
                container = document.createElement('div');
                container.id = 'ksumc-realtime-popup-host';
                container.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;width:94%;max-width:520px;font-family:Cairo,sans-serif;direction:rtl;';
                document.body.appendChild(container);
            }

            const isCritical = notif.priority === 'critical' || notif.type === 'quality_return' || notif.type === 'head_return';
            const headerBg = isCritical
                ? 'linear-gradient(135deg, #991B1B 0%, #DC2626 100%)'
                : 'linear-gradient(135deg, #00162B 0%, #082B49 55%, #004B87 100%)';
            const badgeText = isCritical ? '⚡ توجيه وتنبيه عاجل وفوري' : '📢 توجيه تنفيذي فوري للميدان';

            const cardId = 'ksumc-popup-' + String(notif.id).replace(/[^a-zA-Z0-9_-]/g, '');
            const existing = document.getElementById(cardId);
            if (existing) existing.remove();

            const card = document.createElement('div');
            card.id = cardId;
            card.style.cssText = 'background:#ffffff;border-radius:20px;box-shadow:0 20px 45px rgba(8,43,73,0.35);border:2px solid ' + (isCritical ? '#FCA5A5' : '#F59E0B') + ';overflow:hidden;margin-bottom:10px;animation:ksumcSlideDown 0.35s ease-out;';

            card.innerHTML = `
                <style>
                    @keyframes ksumcSlideDown {
                        from { opacity: 0; transform: translateY(-24px) scale(0.96); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                </style>
                <div style="background:${headerBg};color:#ffffff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;color:#FCD34D;flex-shrink:0;">
                            <span class="material-symbols-outlined" style="font-size:22px;">campaign</span>
                        </div>
                        <div>
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                <span style="font-size:10px;font-weight:900;background:#F59E0B;color:#082B49;padding:2px 8px;border-radius:999px;">${badgeText}</span>
                                <span style="font-size:10px;color:#E2E8F0;">${notif.time || 'الآن'}</span>
                            </div>
                            <div style="font-size:13px;font-weight:900;margin-top:2px;">${notif.title || 'توجيه تنفيذي من رئيس القسم'}</div>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('${cardId}')?.remove()" style="background:rgba(255,255,255,0.15);border:none;color:#ffffff;width:28px;height:28px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <span class="material-symbols-outlined" style="font-size:18px;">close</span>
                    </button>
                </div>
                <div style="padding:14px 16px;background:#F8FAFC;">
                    <p style="margin:0 0 10px 0;font-size:13px;font-weight:700;color:#0F172A;line-height:1.65;background:#ffffff;padding:10px 12px;border-radius:12px;border:1px solid #E2E8F0;">
                        ${notif.message || notif.notes || ''}
                    </p>
                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11px;color:#475569;margin-bottom:12px;">
                        <span>المرسل: <strong style="color:#082B49;">${notif.sender || 'رئيس القسم / المشرف العام (H1)'}</strong></span>
                        <span>المستهدف: <strong style="color:#004B87;">${notif.targetShiftLabel || (notif.targetShift === 'all' ? 'جميع الورديات والمفتشين' : notif.targetShift)}</strong></span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <button type="button" onclick="if(window.KSUDataBridge){window.KSUDataBridge.acknowledgeNotification('${notif.id}');} if(typeof window.renderInspectorLiveNotifications==='function'){window.renderInspectorLiveNotifications();} document.getElementById('${cardId}')?.remove();" style="flex:1;background:linear-gradient(to left,#059669,#10B981);color:#ffffff;border:none;padding:9px 14px;border-radius:12px;font-family:Cairo,sans-serif;font-size:12px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(16,185,129,0.25);">
                            <span class="material-symbols-outlined" style="font-size:16px;">task_alt</span>
                            <span>تأكيد الاطلاع والالتزام بالتوجيه ✓</span>
                        </button>
                        <button type="button" onclick="document.getElementById('${cardId}')?.remove()" style="background:#E2E8F0;color:#334155;border:none;padding:9px 12px;border-radius:12px;font-family:Cairo,sans-serif;font-size:11px;font-weight:700;cursor:pointer;">
                            لاحقاً
                        </button>
                    </div>
                </div>
            `;

            container.prepend(card);
        }
    }

    // تهيئة المحرك وتصديره للنافذة العامة
    window.ksuFirebaseSync = new KSUFirebaseRealtimeSync();
})();

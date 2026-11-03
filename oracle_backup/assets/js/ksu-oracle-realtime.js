/**
 * ============================================================================
 * محرك المزامنة اللحظية وقواعد البيانات لسيرفر أوراكل الرياض (Oracle Cloud Realtime Engine)
 * المدينة الطبية بجامعة الملك سعود (KSUMC) - مشروع RSD-ALSAQRI
 * مركز البيانات الوطني - منطقة الرياض (me-riyadh-1)
 * ============================================================================
 * يحل محل Firebase بالكامل، ويضمن توطين البيانات 100% داخل المملكة.
 * يوفر:
 * 1. مزامنة لحظية بالملي ثانية عبر الويب سوكت (WebSockets)
 * 2. تتبع المستخدمين النشطين (Active Online Users Roster)
 * 3. المزامنة الفورية للجولات التفتيشية والبلاغات والإحصائيات
 * 4. محرك بحث مركزي عالي السرعة في الأصول (أكثر من 1560 أصل مفهرس)
 * 5. دعم العمل دون اتصال (Offline-first) مع إعادة المزامنة التلقائية عند عودة الاتصال
 * ============================================================================
 */

(function(window) {
    'use strict';

    class KSUOracleRealtimeSync {
        constructor() {
            this.ws = null;
            this.isConnected = false;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 50;
            this.reconnectDelay = 3000;
            this.heartbeatTimer = null;
            this.offlineQueue = [];
            this.apiKey = 'ksu_sec_token_95972_riyadh';
            this.onlineUsers = [];
            
            // تحديد مسار الـ API والـ WebSocket المباشر لخادم أوراكل الرياض المعزول
            let targetHost = window.location.host;
            if (!targetHost || targetHost.includes('localhost') || targetHost.includes('127.0.0.1') || window.location.protocol === 'file:') {
                targetHost = '84.13.138.203';
            }
            const isHttps = window.location.protocol === 'https:';
            const wsScheme = (targetHost.includes('84.13.138.203') && !isHttps) ? 'ws:' : (isHttps ? 'wss:' : 'ws:');
            const httpProto = (targetHost.includes('84.13.138.203') && !isHttps) ? 'http:' : window.location.protocol;
            
            // المسار المعزول لمنظومة السلامة KSUMC دون التداخل مع منصة عنان
            this.apiBaseUrl = `${httpProto}//${targetHost}/safety/api`;
            this.wsBaseUrl = `${wsScheme}//${targetHost}/safety/api/ws`;

            this.init();
        }

        init() {
            this.loadOfflineQueue();
            this.connectWebSocket();
            this.updateBadge(false);

            // الاستماع لحالة اتصال الشبكة
            window.addEventListener('online', () => {
                console.log('🌐 [KSU-Oracle] عاد اتصال الإنترنت، جاري استئناف المزامنة...');
                this.connectWebSocket();
                this.flushOfflineQueue();
            });

            window.addEventListener('offline', () => {
                console.warn('⚠️ [KSU-Oracle] انقطع الاتصال، تم تفعيل الوضع المحلي دون اتصال');
                this.updateBadge(false);
            });

            // الاستماع لتسجيل الدخول أو تبديل الحساب لإعادة الاتصال بالويب سوكت فوراً بهوية المستخدم الصحيحة
            window.addEventListener('storage', (e) => {
                if (e.key === 'ksu_active_user' || e.key === 'ksumc_active_user' || e.key === 'ksumc_current_user') {
                    if (this.ws) {
                        try { this.ws.close(); } catch (err) {}
                    }
                    setTimeout(() => this.connectWebSocket(), 300);
                }
            });
            window.addEventListener('ksumc_user_logged_in', () => {
                if (this.ws) {
                    try { this.ws.close(); } catch (err) {}
                }
                setTimeout(() => this.connectWebSocket(), 300);
            });
        }

        getCurrentUser() {
            if (window.KSUAuth && typeof window.KSUAuth.getUser === 'function') {
                const u = window.KSUAuth.getUser();
                if (u && (u.username || u.empId || u.id)) return u;
            }
            try {
                const raw = localStorage.getItem('ksu_active_user') || 
                            localStorage.getItem('ksumc_active_user') || 
                            localStorage.getItem('ksumc_current_user') || 
                            sessionStorage.getItem('ksu_active_user') ||
                            sessionStorage.getItem('ksumc_active_session');
                if (raw) return JSON.parse(raw);
            } catch (e) {}
            return {
                id: 'USR-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
                username: 'inspector',
                name: 'مفتش سلامة ميداني',
                role: 'inspector'
            };
        }

        connectWebSocket() {
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
                return;
            }

            const user = this.getCurrentUser();
            const portal = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
            const empId = user.empId || user.employeeId || '';
            const url = `${this.wsBaseUrl}?id=${encodeURIComponent(user.id || user.username)}&username=${encodeURIComponent(user.username || 'user')}&name=${encodeURIComponent(user.name || 'مفتش')}&empId=${encodeURIComponent(empId)}&role=${encodeURIComponent(user.role || 'inspector')}&portal=${encodeURIComponent(portal)}&token=${encodeURIComponent(this.apiKey)}`;

            try {
                this.ws = new WebSocket(url);

                this.ws.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    console.log('🟢 [KSU-Oracle] متصل بقاعدة بيانات أوراكل الرياض اللحظية (WebSockets Online)');
                    this.updateBadge(true);
                    this.startHeartbeat();
                    this.flushOfflineQueue();
                    this.fetchLiveStats();
                    this.syncInitialData();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const payload = JSON.parse(event.data);
                        this.handleIncomingMessage(payload);
                    } catch (e) {
                        console.error('[KSU-Oracle] خطأ في قراءة رسالة السيرفر:', e);
                    }
                };

                this.ws.onclose = () => {
                    this.isConnected = false;
                    this.stopHeartbeat();
                    this.updateBadge(false);
                    this.scheduleReconnect();
                };

                this.ws.onerror = (err) => {
                    console.warn('[KSU-Oracle] تنبيه في اتصال الويب سوكت:', err);
                };
            } catch (e) {
                console.warn('[KSU-Oracle] تعذر إنشاء اتصال الويب سوكت:', e);
                this.scheduleReconnect();
            }
        }

        scheduleReconnect() {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                const delay = Math.min(this.reconnectDelay * Math.pow(1.3, this.reconnectAttempts - 1), 30000);
                setTimeout(() => this.connectWebSocket(), delay);
            }
        }

        startHeartbeat() {
            this.stopHeartbeat();
            this.heartbeatTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
                }
            }, 20000);
        }

        stopHeartbeat() {
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
        }

        handleIncomingMessage(payload) {
            const { event, data } = payload;

            switch (event) {
                case 'active_users_updated':
                    this.onlineUsers = data.users || [];
                    this.updateActiveUsersUI(data);
                    window.dispatchEvent(new CustomEvent('ksumc_active_users_updated', { detail: data }));
                    window.dispatchEvent(new CustomEvent('ksumc_presence_updated', { detail: { onlineUsers: this.onlineUsers } }));
                    break;

                case 'safety_violation_saved':
                    console.log('⚠️ [KSU-Oracle] تم استلام مخالفة سلامة جديدة لحظياً:', data.id);
                    this.mergeLocalCollection('ksumc_safety_violations', data);
                    if (window.state && window.state.safetyViolations) {
                        const idx = window.state.safetyViolations.findIndex(x => x.id === data.id);
                        if (idx >= 0) window.state.safetyViolations[idx] = data;
                        else window.state.safetyViolations.unshift(data);
                    }
                    if (typeof window.renderSafetyViolations === 'function') window.renderSafetyViolations();
                    if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                    if (typeof window.updateViolationBadges === 'function') window.updateViolationBadges();
                    window.dispatchEvent(new CustomEvent('ksumc_safety_violations_updated', { detail: { item: data } }));
                    break;

                case 'smoking_violation_saved':
                    console.log('🚭 [KSU-Oracle] تم استلام مخالفة تدخين جديدة لحظياً:', data.id);
                    this.mergeLocalCollection('ksumc_smoking_violations', data);
                    if (window.state && window.state.smokingViolations) {
                        const idx = window.state.smokingViolations.findIndex(x => x.id === data.id);
                        if (idx >= 0) window.state.smokingViolations[idx] = data;
                        else window.state.smokingViolations.unshift(data);
                    }
                    if (typeof window.renderSmokingViolations === 'function') window.renderSmokingViolations();
                    if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                    if (typeof window.updateViolationBadges === 'function') window.updateViolationBadges();
                    window.dispatchEvent(new CustomEvent('ksumc_smoking_violations_updated', { detail: { item: data } }));
                    break;

                case 'round_saved':
                    console.log('📋 [KSU-Oracle] تم استلام جولة تفتيشية جديدة لحظياً:', data.id);
                    this.mergeLocalCollection('ksumc_safety_rounds', data);
                    if (window.state && window.state.rounds) {
                        const idx = window.state.rounds.findIndex(x => x.id === data.id);
                        if (idx >= 0) window.state.rounds[idx] = data;
                        else window.state.rounds.unshift(data);
                    }
                    if (typeof window.renderRoundsTables === 'function') window.renderRoundsTables();
                    if (typeof window.updateDashboardKPIs === 'function') window.updateDashboardKPIs();
                    if (typeof window.renderDashboardLiveMetrics === 'function') window.renderDashboardLiveMetrics();
                    if (typeof window.updateFieldLiveCounters === 'function') window.updateFieldLiveCounters();
                    if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                    if (typeof window.renderQualitySavedReports === 'function') window.renderQualitySavedReports();
                    if (typeof window.renderQualityShiftInspectionLog === 'function') window.renderQualityShiftInspectionLog();
                    if (typeof window.renderHomeRecentRounds === 'function') window.renderHomeRecentRounds();
                    if (typeof window.renderQualityWorkflowInbox === 'function') window.renderQualityWorkflowInbox();
                    if (typeof window.renderInspectorWorkflowTracker === 'function') window.renderInspectorWorkflowTracker();
                    window.dispatchEvent(new CustomEvent('ksumc_rounds_updated', { detail: { round: data, source: 'oracle' } }));
                    window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { type: 'rounds', round: data, source: 'oracle' } }));
                    this.fetchLiveStats();
                    break;

                case 'facility_saved':
                    this.mergeLocalCollection('ksumc_facilities', data);
                    break;

                case 'building_saved':
                    this.mergeLocalCollection('ksumc_buildings', data);
                    this.mergeLocalCollection('ksumc_admin_buildings', data);
                    if (window.state && window.state.buildings) {
                        const idx = window.state.buildings.findIndex(x => x.id === data.id);
                        if (idx >= 0) window.state.buildings[idx] = data;
                        else window.state.buildings.push(data);
                    }
                    if (typeof window.renderAdminBuildings === 'function') window.renderAdminBuildings();
                    break;

                case 'safety_dept_report_saved':
                    console.log('📑 [KSU-Oracle] تم استلام تقرير سلامة جديد لحظياً:', data.id);
                    this.mergeLocalCollection('ksumc_safety_dept_reports', data);
                    if (window.state) {
                        if (!window.state.safetyDeptReports) window.state.safetyDeptReports = [];
                        const idx = window.state.safetyDeptReports.findIndex(x => x.id === data.id);
                        if (idx >= 0) window.state.safetyDeptReports[idx] = data;
                        else window.state.safetyDeptReports.unshift(data);
                    }
                    if (typeof window.renderSafetyDeptReportsTable === 'function') window.renderSafetyDeptReportsTable();
                    if (typeof window.renderSafetyReportsWorkflowCenter === 'function') window.renderSafetyReportsWorkflowCenter();
                    if (typeof window.renderDirectorSafetyReports === 'function') window.renderDirectorSafetyReports();
                    if (typeof window.renderOfficialReport === 'function') window.renderOfficialReport();
                    if (typeof window.renderQualitySavedReports === 'function') window.renderQualitySavedReports();
                    if (typeof window.renderQualityShiftInspectionLog === 'function') window.renderQualityShiftInspectionLog();
                    if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                    if (typeof window.renderQualityWorkflowInbox === 'function') window.renderQualityWorkflowInbox();
                    window.dispatchEvent(new CustomEvent('ksumc_safety_dept_reports_updated', { detail: { report: data, source: 'oracle' } }));
                    break;

                case 'incident_reported':
                    console.warn('🚨 [KSU-Oracle] إنذار ميداني جديد:', data.title);
                    this.mergeLocalCollection('ksumc_shift_incidents', data);
                    window.dispatchEvent(new CustomEvent('ksumc_incidents_updated', { detail: { incident: data, source: 'oracle' } }));
                    if (typeof window.showToast === 'function') {
                        window.showToast(`🚨 بلاغ ميداني عاجل: ${data.title} (${data.location})`, 'error');
                    }
                    this.fetchLiveStats();
                    break;

                case 'user_saved':
                    console.log('👤 [KSU-Oracle] تم استلام تحديث مستخدم جديد عبر أوراكل:', data.username || data.id);
                    this.mergeLocalUser(data);
                    window.dispatchEvent(new CustomEvent('ksumc_users_updated', { detail: { updatedUser: data, source: 'oracle' } }));
                    break;

                case 'user_deleted':
                    console.log('🗑️ [KSU-Oracle] تم حذف مستخدم عبر أوراكل:', data.id || data.deleted);
                    this.removeLocalUser(data.id || data.deleted);
                    window.dispatchEvent(new CustomEvent('ksumc_users_updated', { detail: { deletedId: data.id || data.deleted, source: 'oracle' } }));
                    break;

                case 'users_batch_updated':
                    console.log('👥 [KSU-Oracle] تم استلام تحديث جماعي للمستخدمين عبر أوراكل');
                    this.fetchUsersFromOracle();
                    break;

                default:
                    break;
            }
        }

        mergeLocalUser(user) {
            if (!user) return;
            const keys = ['ksumc_admin_users', 'ksumc_users'];
            keys.forEach(k => {
                try {
                    let list = JSON.parse(localStorage.getItem(k) || '[]');
                    const idx = list.findIndex(u => u.id === user.id || u.username === user.username || u.empId === user.empId);
                    if (idx >= 0) {
                        list[idx] = Object.assign({}, list[idx], user);
                    } else {
                        list.push(user);
                    }
                    localStorage.setItem(k, JSON.stringify(list));
                } catch (e) {}
            });
        }

        removeLocalUser(userId) {
            if (!userId) return;
            const keys = ['ksumc_admin_users', 'ksumc_users'];
            keys.forEach(k => {
                try {
                    let list = JSON.parse(localStorage.getItem(k) || '[]');
                    list = list.filter(u => u.id !== userId && u.username !== userId && u.empId !== userId);
                    localStorage.setItem(k, JSON.stringify(list));
                } catch (e) {}
            });
        }

        mergeLocalCollection(storageKey, newItem) {
            try {
                let items = JSON.parse(localStorage.getItem(storageKey) || '[]');
                const idx = items.findIndex(x => x.id === newItem.id);
                if (idx >= 0) {
                    items[idx] = Object.assign({}, items[idx], newItem);
                } else {
                    items.unshift(newItem);
                }
                localStorage.setItem(storageKey, JSON.stringify(items));
            } catch (e) {}
        }

        updateBadge(online) {
            const badges = document.querySelectorAll('#cloud-sync-indicator, .firebase-sync-status, .oracle-sync-status');
            badges.forEach(b => {
                b.innerHTML = online
                    ? '<i class="fa-solid fa-server" style="color:#10b981;"></i> سحابة أوراكل الرياض (مزامنة لحظية)'
                    : '<i class="fa-solid fa-cloud-slash" style="color:#f59e0b;"></i> وضع محلي مؤقت (سيعاد الاتصال)';
                b.style.cursor = 'pointer';
                b.title = online ? 'متصل ومحمي بمركز بيانات أوراكل الرياض' : 'يعمل محلياً وسيتم التزامن تلقائياً';
            });
        }

        updateActiveUsersUI(data) {
            const count = data.count || (data.users ? data.users.length : 0);
            const countEls = document.querySelectorAll('#active-users-count, .live-inspectors-badge, #head-online-inspectors-count, .h1-online-count');
            countEls.forEach(el => { el.textContent = count; });

            if (typeof window.updateStaffTablePresence === 'function') {
                try { window.updateStaffTablePresence(this.onlineUsers || []); } catch (e) {}
            }
            if (typeof window.refreshHeadDashboard === 'function') {
                try { window.refreshHeadDashboard(); } catch (e) {}
            }
        }

        isUserOnline(userIdOrEmpId) {
            if (!userIdOrEmpId || !this.onlineUsers || !Array.isArray(this.onlineUsers)) return false;
            const q = String(userIdOrEmpId).toLowerCase().trim();
            return this.onlineUsers.some(u => {
                if (!u) return false;
                const matchId = u.id && String(u.id).toLowerCase().trim() === q;
                const matchUid = u.user_id && String(u.user_id).toLowerCase().trim() === q;
                const matchUsername = u.username && String(u.username).toLowerCase().trim() === q;
                const matchEmpId = (u.emp_id && String(u.emp_id).toLowerCase().trim() === q) || (u.empId && String(u.empId).toLowerCase().trim() === q);
                const matchName = u.name && String(u.name).toLowerCase().trim() === q;
                return matchId || matchUid || matchUsername || matchEmpId || matchName;
            });
        }

        async syncInitialData() {
            try {
                this.fetchUsersFromOracle();
                
                // 1. مزامنة تقارير السلامة الميدانية (دمج ذكي بدون مسح التقارير المحلية)
                const resRep = await fetch(`${this.apiBaseUrl}/safety_dept_reports`, { headers: { 'X-KSUMC-KEY': this.apiKey } });
                if (resRep.ok) {
                    const remoteReports = await resRep.json();
                    let localReports = [];
                    try { localReports = JSON.parse(localStorage.getItem('ksumc_safety_dept_reports') || '[]') || []; } catch (e) {}
                    const mergedMap = new Map();
                    const isValidRep = (item) => item && item.id && !(String(item.id).startsWith('REP-KKUH-') && !item.subject);
                    if (Array.isArray(remoteReports)) {
                        remoteReports.filter(isValidRep).forEach(r => mergedMap.set(String(r.id), r));
                    }
                    if (Array.isArray(localReports)) {
                        localReports.filter(isValidRep).forEach(loc => {
                            const k = String(loc.id);
                            const existing = mergedMap.get(k);
                            if (!existing || (loc.updatedAtMs || 0) >= (existing.updatedAtMs || 0)) {
                                mergedMap.set(k, Object.assign({}, existing || {}, loc));
                                // دفع التقرير المحلي الأحدث إلى سحابة أوراكل لضمان التطابق
                                if (!existing || (loc.updatedAtMs || 0) > (existing.updatedAtMs || 0)) {
                                    fetch(`${this.apiBaseUrl}/safety_dept_reports`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': this.apiKey },
                                        body: JSON.stringify(loc)
                                    }).catch(() => {});
                                }
                            }
                        });
                    }
                    const mergedReports = Array.from(mergedMap.values()).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
                    localStorage.setItem('ksumc_safety_dept_reports', JSON.stringify(mergedReports));
                    if (window.state) window.state.safetyDeptReports = mergedReports;
                    if (typeof window.renderSafetyDeptReportsTable === 'function') window.renderSafetyDeptReportsTable();
                    if (typeof window.renderSafetyReportsWorkflowCenter === 'function') window.renderSafetyReportsWorkflowCenter();
                    if (typeof window.renderDirectorSafetyReports === 'function') window.renderDirectorSafetyReports();
                    if (typeof window.renderQualitySavedReports === 'function') window.renderQualitySavedReports();
                    if (typeof window.renderQualityShiftInspectionLog === 'function') window.renderQualityShiftInspectionLog();
                    if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                }

                // 2. مزامنة مخالفات السلامة
                const resSv = await fetch(`${this.apiBaseUrl}/safety_violations`, { headers: { 'X-KSUMC-KEY': this.apiKey } });
                if (resSv.ok) {
                    const viols = await resSv.json();
                    if (Array.isArray(viols) && viols.length > 0) {
                        localStorage.setItem('ksumc_safety_violations', JSON.stringify(viols));
                        if (window.state) window.state.safetyViolations = viols;
                        if (typeof window.renderSafetyViolations === 'function') window.renderSafetyViolations();
                        if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                        if (typeof window.updateViolationBadges === 'function') window.updateViolationBadges();
                    }
                }

                // 3. مزامنة مخالفات التدخين
                const resSm = await fetch(`${this.apiBaseUrl}/smoking_violations`, { headers: { 'X-KSUMC-KEY': this.apiKey } });
                if (resSm.ok) {
                    const smViols = await resSm.json();
                    if (Array.isArray(smViols) && smViols.length > 0) {
                        localStorage.setItem('ksumc_smoking_violations', JSON.stringify(smViols));
                        if (window.state) window.state.smokingViolations = smViols;
                        if (typeof window.renderSmokingViolations === 'function') window.renderSmokingViolations();
                        if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                        if (typeof window.updateViolationBadges === 'function') window.updateViolationBadges();
                    }
                }

                // 4. مزامنة الجولات التفتيشية
                const resR = await fetch(`${this.apiBaseUrl}/rounds`, { headers: { 'X-KSUMC-KEY': this.apiKey } });
                if (resR.ok) {
                    const rList = await resR.json();
                    if (Array.isArray(rList) && rList.length > 0) {
                        localStorage.setItem('ksumc_safety_rounds', JSON.stringify(rList));
                        if (window.state) window.state.rounds = rList;
                        if (typeof window.renderRoundsTables === 'function') window.renderRoundsTables();
                        if (typeof window.updateDashboardKPIs === 'function') window.updateDashboardKPIs();
                        if (typeof window.updateFieldLiveCounters === 'function') window.updateFieldLiveCounters();
                        if (typeof window.renderHeadOperationalCenter === 'function') window.renderHeadOperationalCenter();
                        if (typeof window.renderQualitySavedReports === 'function') window.renderQualitySavedReports();
                        if (typeof window.renderQualityShiftInspectionLog === 'function') window.renderQualityShiftInspectionLog();
                    }
                }

                // 5. مزامنة المباني
                const resBld = await fetch(`${this.apiBaseUrl}/buildings`, { headers: { 'X-KSUMC-KEY': this.apiKey } });
                if (resBld.ok) {
                    const bList = await resBld.json();
                    if (Array.isArray(bList) && bList.length > 0) {
                        localStorage.setItem('ksumc_admin_buildings', JSON.stringify(bList));
                        localStorage.setItem('ksumc_buildings', JSON.stringify(bList));
                        if (window.state) window.state.buildings = bList;
                        if (typeof window.renderAdminBuildings === 'function') window.renderAdminBuildings();
                    }
                }

                // إشعار لوحة القيادة والمؤشرات بتحديث كافة البيانات
                if (typeof window.renderDashboardLiveMetrics === 'function') window.renderDashboardLiveMetrics();
                window.dispatchEvent(new CustomEvent('ksumc_data_updated', { detail: { source: 'oracle', type: 'initial_sync' } }));
            } catch (e) {
                console.warn('[KSU-Oracle] تنبيه استرجاع البيانات الأولية:', e);
            }
        }

        async saveSafetyViolation(violData) {
            this.mergeLocalCollection('ksumc_safety_violations', violData);
            try {
                const res = await fetch(`${this.apiBaseUrl}/safety_violations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': this.apiKey },
                    body: JSON.stringify(violData)
                });
                return await res.json();
            } catch (e) {
                console.warn('[KSU-Oracle] تعذر الحفظ المباشر لمخالفة السلامة، تمت الجدولة في طابور العمل دون اتصال:', e);
                this.queueOfflineItem('safety_violation', violData);
                return { success: true, offline: true };
            }
        }

        async saveSmokingViolation(violData) {
            this.mergeLocalCollection('ksumc_smoking_violations', violData);
            try {
                const res = await fetch(`${this.apiBaseUrl}/smoking_violations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': this.apiKey },
                    body: JSON.stringify(violData)
                });
                return await res.json();
            } catch (e) {
                console.warn('[KSU-Oracle] تعذر الحفظ المباشر لمخالفة التدخين، تمت الجدولة في طابور العمل دون اتصال:', e);
                this.queueOfflineItem('smoking_violation', violData);
                return { success: true, offline: true };
            }
        }

        async saveBuilding(bldData) {
            this.mergeLocalCollection('ksumc_buildings', bldData);
            this.mergeLocalCollection('ksumc_admin_buildings', bldData);
            try {
                const res = await fetch(`${this.apiBaseUrl}/buildings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': this.apiKey },
                    body: JSON.stringify(bldData)
                });
                return await res.json();
            } catch (e) {
                this.queueOfflineItem('building', bldData);
                return { success: true, offline: true };
            }
        }

        async saveFacility(facData) {
            this.mergeLocalCollection('ksumc_facilities', facData);
            try {
                const res = await fetch(`${this.apiBaseUrl}/facilities`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': this.apiKey },
                    body: JSON.stringify(facData)
                });
                return await res.json();
            } catch (e) {
                this.queueOfflineItem('facility', facData);
                return { success: true, offline: true };
            }
        }

        async saveReport(repData) {
            this.mergeLocalCollection('ksumc_safety_dept_reports', repData);
            try {
                const res = await fetch(`${this.apiBaseUrl}/safety_dept_reports`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-KSUMC-KEY': this.apiKey },
                    body: JSON.stringify(repData)
                });
                return await res.json();
            } catch (e) {
                console.warn('[KSU-Oracle] تعذر الحفظ المباشر لتقرير السلامة، تمت الجدولة في طابور العمل دون اتصال:', e);
                this.queueOfflineItem('report', repData);
                return { success: true, offline: true };
            }
        }

        async saveSafetyDeptReport(repData) {
            return this.saveReport(repData);
        }

        async fetchAllFromOracle() {
            return this.syncInitialData();
        }

        // ----------------------------------------------------------------------
        // واجهات الحفظ والبحث والبيانات
        // ----------------------------------------------------------------------
        async saveRound(roundData) {
            // حفظ محلي فوري
            this.mergeLocalCollection('ksumc_safety_rounds', roundData);

            try {
                const res = await fetch(`${this.apiBaseUrl}/rounds`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-KSUMC-KEY': this.apiKey
                    },
                    body: JSON.stringify(roundData)
                });
                return await res.json();
            } catch (e) {
                console.warn('[KSU-Oracle] تعذر الحفظ على السيرفر مباشرة، تمت الجدولة محلياً:', e);
                this.queueOfflineItem('round', roundData);
                return { success: true, offline: true };
            }
        }

        async reportIncident(incidentData) {
            this.mergeLocalCollection('ksumc_shift_incidents', incidentData);

            try {
                const res = await fetch(`${this.apiBaseUrl}/incidents`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-KSUMC-KEY': this.apiKey
                    },
                    body: JSON.stringify(incidentData)
                });
                return await res.json();
            } catch (e) {
                this.queueOfflineItem('incident', incidentData);
                return { success: true, offline: true };
            }
        }

        // محرك البحث المركزي في الأصول
        async searchAssets(query, limit = 50) {
            if (!query || !query.trim()) return [];
            try {
                const res = await fetch(`${this.apiBaseUrl}/assets/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`);
                const data = await res.json();
                return data.results || [];
            } catch (e) {
                console.warn('[KSU-Oracle] تعذر البحث من الخادم، البحث في الذاكرة المحلية:', e);
                return this.localSearchAssets(query);
            }
        }

        localSearchAssets(q) {
            const normQ = q.trim().toLowerCase();
            const extList = window.KSU_REAL_EXTINGUISHERS || [];
            const fhcList = window.KSU_FHC_ASSETS || [];
            const combined = [...extList, ...fhcList];
            return combined.filter(item => {
                const matchName = item.name && item.name.toLowerCase().includes(normQ);
                const matchBarcode = (item.barcode || item.id || '').toLowerCase().includes(normQ);
                const matchBuilding = (item.building || '').toLowerCase().includes(normQ);
                return matchName || matchBarcode || matchBuilding;
            }).slice(0, 30);
        }

        async fetchLiveStats() {
            try {
                const res = await fetch(`${this.apiBaseUrl}/stats/live`);
                if (res.ok) {
                    const stats = await res.json();
                    window.dispatchEvent(new CustomEvent('ksumc_stats_updated', { detail: stats }));
                    this.updateStatsUI(stats);
                    return stats;
                }
            } catch (e) {}
            return null;
        }

        updateStatsUI(stats) {
            const compEl = document.getElementById('stat-compliance');
            if (compEl && stats.complianceRate !== undefined) {
                compEl.textContent = stats.complianceRate + '%';
            }
            const roundsEl = document.getElementById('stat-total-rounds');
            if (roundsEl && stats.totalRounds !== undefined) {
                roundsEl.textContent = stats.totalRounds;
            }
            const activeEl = document.getElementById('stat-active-inspectors');
            if (activeEl && stats.activeInspectorsCount !== undefined) {
                activeEl.textContent = stats.activeInspectorsCount;
            }
        }

        // ====================================================================
        // إدارة ومزامنة المستخدمين والمناصب والصلاحيات في سحابة أوراكل (Users API)
        // ====================================================================
        async saveUser(userData) {
            if (!userData) return false;
            try {
                const res = await fetch(`${this.apiBaseUrl}/users`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-KSUMC-KEY': this.apiKey
                    },
                    body: JSON.stringify(userData)
                });
                if (res.ok) {
                    const json = await res.json();
                    console.log('☁️ [KSU-Oracle] تم حفظ المستخدم بنجاح في قاعدة بيانات أوراكل:', json);
                    return true;
                } else {
                    console.warn('⚠️ [KSU-Oracle] فشل حفظ المستخدم في أوراكل، سيتم حفظه في طابور الانتظار:', res.status);
                    this.queueOfflineItem('user', userData);
                }
            } catch (err) {
                console.warn('⚠️ [KSU-Oracle] تعذر الاتصال بأوراكل لحفظ المستخدم:', err);
                this.queueOfflineItem('user', userData);
            }
            return false;
        }

        async deleteUser(userId) {
            if (!userId) return false;
            try {
                const res = await fetch(`${this.apiBaseUrl}/users/${encodeURIComponent(userId)}`, {
                    method: 'DELETE',
                    headers: {
                        'X-KSUMC-KEY': this.apiKey
                    }
                });
                if (res.ok) {
                    console.log('☁️ [KSU-Oracle] تم حذف المستخدم من قاعدة بيانات أوراكل:', userId);
                    return true;
                }
            } catch (err) {
                console.warn('⚠️ [KSU-Oracle] تعذر حذف المستخدم من أوراكل:', err);
            }
            return false;
        }

        async fetchUsersFromOracle() {
            try {
                const res = await fetch(`${this.apiBaseUrl}/users`, {
                    headers: {
                        'X-KSUMC-KEY': this.apiKey
                    }
                });
                if (res.ok) {
                    const users = await res.json();
                    if (Array.isArray(users) && users.length > 0) {
                        console.log(`☁️ [KSU-Oracle] تم استرجاع ${users.length} مستخدم من قاعدة بيانات أوراكل المركزية`);
                        return users;
                    }
                }
            } catch (err) {
                console.warn('⚠️ [KSU-Oracle] تعذر استرجاع المستخدمين من أوراكل:', err);
            }
            return null;
        }

        async syncAllUsersToOracle(usersList) {
            if (!Array.isArray(usersList) || usersList.length === 0) return false;
            try {
                const res = await fetch(`${this.apiBaseUrl}/users/batch`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-KSUMC-KEY': this.apiKey
                    },
                    body: JSON.stringify(usersList)
                });
                if (res.ok) {
                    const json = await res.json();
                    console.log('☁️ [KSU-Oracle] تمت مزامنة كافة المستخدمين دفعة واحدة في أوراكل:', json);
                    return true;
                }
            } catch (err) {
                console.warn('⚠️ [KSU-Oracle] فشلت المزامنة الجماعية للمستخدمين في أوراكل:', err);
            }
            return false;
        }

        async pullUsersFromOracle() {
            const users = await this.fetchUsersFromOracle();
            if (users && users.length > 0) {
                ['ksumc_admin_users', 'ksumc_users'].forEach(k => {
                    localStorage.setItem(k, JSON.stringify(users));
                });
                window.dispatchEvent(new CustomEvent('ksumc_users_updated', { detail: { users, source: 'oracle' } }));
            }
        }

        // إدارة طابور العمل دون اتصال (Offline Queue)
        queueOfflineItem(type, data) {
            this.offlineQueue.push({ type, data, queuedAt: Date.now() });
            localStorage.setItem('ksumc_oracle_offline_queue', JSON.stringify(this.offlineQueue));
        }

        loadOfflineQueue() {
            try {
                this.offlineQueue = JSON.parse(localStorage.getItem('ksumc_oracle_offline_queue') || '[]');
            } catch (e) {
                this.offlineQueue = [];
            }
        }

        async flushOfflineQueue() {
            if (this.offlineQueue.length === 0) return;
            console.log(`⏳ [KSU-Oracle] جاري رفع العمليات المعلقة دون اتصال (${this.offlineQueue.length} عناصر)...`);

            const toSend = [...this.offlineQueue];
            this.offlineQueue = [];
            localStorage.setItem('ksumc_oracle_offline_queue', JSON.stringify([]));

            for (const item of toSend) {
                try {
                    let endpoint = null;
                    if (item.type === 'round') endpoint = 'rounds';
                    else if (item.type === 'incident') endpoint = 'incidents';
                    else if (item.type === 'user') endpoint = 'users';
                    else if (item.type === 'safety_violation') endpoint = 'safety_violations';
                    else if (item.type === 'smoking_violation') endpoint = 'smoking_violations';
                    else if (item.type === 'report') endpoint = 'safety_dept_reports';
                    else if (item.type === 'building') endpoint = 'buildings';
                    else if (item.type === 'facility') endpoint = 'facilities';

                    if (endpoint) {
                        await fetch(`${this.apiBaseUrl}/${endpoint}`, {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'X-KSUMC-KEY': this.apiKey
                            },
                            body: JSON.stringify(item.data)
                        });
                    }
                } catch (e) {
                    this.offlineQueue.push(item);
                }
            }
            localStorage.setItem('ksumc_oracle_offline_queue', JSON.stringify(this.offlineQueue));
        }
    }

    // تصدير المحرك ككائن عام متاح لكافة البوابات
    window.KSUOracleSync = new KSUOracleRealtimeSync();

})(window);

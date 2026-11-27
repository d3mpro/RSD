/**
 * KSUMC Safety System - Service Worker (PWA Offline Engine v5.0-official-launch)
 * المدينة الطبية بجامعة الملك سعود - محرك العمل دون اتصال
 */

const CACHE_NAME = 'rsd-ksu-cache-v3.6.0-ops-platform-upgrade';
const FIREBASE_NOTIFS_URL = 'https://rsd-ksu-default-rtdb.firebaseio.com/notifications.json';

// سياق المصادقة المؤقت بالذاكرة لتمرير ?auth=<idToken> ومنع طلبات 401 غير المصرحة أو تسرب الحساب التجريبي
let swAuthContext = {
  idToken: '',
  uid: '',
  role: '',
  shift: '',
  isDemo: false,
  updatedAt: 0
};

// سجل الإشعارات التي تم عرضها عبر Service Worker لمنع التكرار
const swShownNotifIds = new Set();

// قائمة التخزين الأولي الخفيف والسريع (Core Shell فقط) لتحميل فوري فائق السرعة
const ASSETS_TO_PRECACHE = [
  './',
  './index.html',
  './field.html',
  './manifest.json',
  './assets/css/core-theme.css',
  './assets/css/styles.css',
  './assets/js/auth-guard.js',
  './assets/js/ksu-asset-loader.js',
  './assets/js/ksumc-data-bridge.js',
  './assets/images/app-icon.png',
  './assets/images/ksu_official_logo.png'
];

// Install Event: Pre-cache essential offline shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[KSUMC SW v5.9] Pre-caching offline assets...');
      return cache.addAll(ASSETS_TO_PRECACHE).catch((err) => {
        console.warn('[KSUMC SW v5.9] Pre-cache non-fatal warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up outdated caches immediately and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[KSUMC SW v5.9] Purging old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * دالة موحدة لإظهار إشعار النظام على شاشة القفل (Lock Screen Notification)
 */
async function displayLockScreenNotification(notif) {
  if (!notif) return;
  const notifId = String(notif.id || ('ksumc-' + Date.now()));
  swShownNotifIds.add(notifId);

  const isCritical = notif.priority === 'critical' || notif.severity === 'critical' || notif.type === 'quality_return' || notif.type === 'head_return';
  const title = notif.title || (isCritical ? '⚡ توجيه طارئ وعاجل - سلامة KSUMC' : '📢 توجيه تنفيذي فوري - سلامة KSUMC');
  const sender = notif.sender || notif.senderName || 'رئيس القسم (H1)';
  const targetLabel = notif.targetShiftLabel || (notif.targetShift === 'all' ? 'كافة الورديات والمفتشين' : (notif.targetShift || 'المفتشين'));
  const bodyText = `${notif.message || notif.notes || ''}\nالمرسل: ${sender} | المستهدف: ${targetLabel}`;

  const options = {
    body: bodyText,
    icon: './assets/images/app-icon.png',
    badge: './assets/images/app-icon.png',
    dir: 'rtl',
    lang: 'ar',
    tag: notifId,
    renotify: true,
    requireInteraction: true, // يبقى الإشعار ظاهراً على شاشة القفل حتى يتفاعل معه المفتش
    silent: false,
    vibrate: isCritical ? [400, 150, 400, 150, 600, 200, 600] : [250, 120, 250, 120, 400],
    timestamp: notif.createdAt ? new Date(notif.createdAt).getTime() : Date.now(),
    data: {
      notifId: notifId,
      url: './field.html',
      notif: notif
    },
    actions: [
      {
        action: 'acknowledge',
        title: '✓ تأكيد الاطلاع والالتزام'
      },
      {
        action: 'open_portal',
        title: 'فتح البوابة الميدانية'
      }
    ]
  };

  if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
    try {
      await self.navigator.setAppBadge(1);
    } catch (e) {}
  }

  return self.registration.showNotification(title, options);
}

/**
 * استلام الأوامر المباشرة من الصفحة لعرض إشعار شاشة القفل أو فحص التوجيهات بالخلفية
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === 'SYNC_AUTH_TOKEN') {
    const isDemo = Boolean(data.isDemo);
    swAuthContext = {
      idToken: isDemo ? '' : String(data.idToken || '').trim(),
      uid: isDemo ? '' : String(data.uid || ''),
      role: isDemo ? '' : String(data.role || ''),
      shift: isDemo ? '' : String(data.shift || ''),
      isDemo,
      updatedAt: Date.now()
    };
    return;
  }

  if (data.type === 'CLEAR_AUTH_TOKEN') {
    swAuthContext = { idToken: '', uid: '', role: '', shift: '', isDemo: false, updatedAt: 0 };
    return;
  }

  if (data.type === 'SHOW_LOCKSCREEN_NOTIFICATION' && data.notification) {
    if (swAuthContext.isDemo) return;
    if (typeof event.waitUntil === 'function') {
      event.waitUntil(displayLockScreenNotification(data.notification));
    } else {
      displayLockScreenNotification(data.notification);
    }
  } else if (data.type === 'CHECK_FIREBASE_NOTIFICATIONS') {
    if (data.idToken && !data.isDemo) {
      swAuthContext.idToken = String(data.idToken).trim();
      swAuthContext.updatedAt = Date.now();
    }
    if (typeof event.waitUntil === 'function') {
      event.waitUntil(checkFirebaseNotificationsInBackground(data.lastSeenTimestamp || 0));
    } else {
      checkFirebaseNotificationsInBackground(data.lastSeenTimestamp || 0);
    }
  }
});

/**
 * دعم Web Push API / Firebase Cloud Messaging (FCM) القياسي عند وصول إشعار الدفع السحابي والهاتف مغلق
 */
self.addEventListener('push', (event) => {
  if (swAuthContext.isDemo) return;
  let payload = {
    id: 'push-' + Date.now(),
    title: '📢 توجيه تنفيذي فوري - سلامة KSUMC',
    message: 'لديك توجيه ميداني جديد في منظومة السلامة بالمدينة الطبية.',
    priority: 'critical'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      const notifBlock = parsed.notification || {};
      const dataBlock = parsed.data || {};
      payload = Object.assign(payload, dataBlock, notifBlock, {
        message: notifBlock.body || dataBlock.message || dataBlock.body || payload.message,
        url: (parsed.fcmOptions && parsed.fcmOptions.link) || dataBlock.url || './field.html'
      });
    } catch (e) {
      payload.message = event.data.text();
    }
  }

  event.waitUntil(displayLockScreenNotification(payload));
});

/**
 * التعامل مع النقر على الإشعار من شاشة قفل الهاتف (Lock Screen Tap / Action Buttons)
 */
self.addEventListener('notificationclick', (event) => {
  const notif = event.notification;
  const data = notif.data || {};
  const action = event.action;
  notif.close();

  if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
    try {
      self.navigator.clearAppBadge();
    } catch (e) {}
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // إرسال أمر تأكيد الاطلاع إذا ضغط المفتش على زر "تأكيد الاطلاع" من شاشة القفل
      for (const client of clientList) {
        if (action === 'acknowledge' && data.notifId) {
          client.postMessage({
            type: 'LOCKSCREEN_NOTIF_ACKNOWLEDGED',
            notifId: data.notifId
          });
        }
        if (client.url.includes('field.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // إذا كانت الصفحة مغلقة، نفتح البوابة الميدانية مع تمرير معرف التوجيه
      if (self.clients.openWindow) {
        const targetUrl = action === 'acknowledge' && data.notifId
          ? `./field.html?ack_notif=${encodeURIComponent(data.notifId)}`
          : (data.url || './field.html');
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

/**
 * فحص سحابة Firebase في الخلفية عند استيقاظ Service Worker (Periodic Sync / Sync) باستخدام ?auth=<idToken>
 */
async function checkFirebaseNotificationsInBackground(sinceTimestamp = 0) {
  try {
    if (swAuthContext.isDemo || !swAuthContext.idToken) return;

    const authedUrl = `${FIREBASE_NOTIFS_URL}?auth=${encodeURIComponent(swAuthContext.idToken)}`;
    const res = await fetch(authedUrl, { cache: 'no-store' }).catch(() => null);
    if (!res) return;
    if (res.status === 401 || res.status === 403) {
      swAuthContext.idToken = '';
      return;
    }
    if (!res.ok) return;
    const raw = await res.json();
    if (!raw || typeof raw !== 'object') return;

    const list = Array.isArray(raw) ? raw.filter(Boolean) : Object.values(raw).filter(Boolean);
    const cutoff = sinceTimestamp || (Date.now() - 15 * 60 * 1000); // آخر 15 دقيقة

    for (const item of list) {
      if (!item || item._deleted || item.status === 'مغلق') continue;
      if (item.targetRole && item.targetRole !== 'all' && swAuthContext.role && item.targetRole !== swAuthContext.role) {
        if (!(swAuthContext.role === 'developer' || swAuthContext.role === 'admin' || swAuthContext.role === 'head')) {
          continue;
        }
      }
      if (item.targetShift && item.targetShift !== 'all' && swAuthContext.shift && String(item.targetShift) !== String(swAuthContext.shift)) {
        if (!(swAuthContext.role === 'developer' || swAuthContext.role === 'admin' || swAuthContext.role === 'head' || swAuthContext.role === 'quality')) {
          continue;
        }
      }
      const itemId = String(item.id || '');
      const createdRaw = item.createdAt || item.timestamp || 0;
      const createdMs = typeof createdRaw === 'number' ? createdRaw : (createdRaw ? new Date(createdRaw).getTime() : 0);
      if (createdMs >= cutoff && !swShownNotifIds.has(itemId)) {
        await displayLockScreenNotification(item);
      }
    }
  } catch (err) {
    // تجاهل أخطاء الشبكة أثناء انقطاع الاتصال
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'ksumc-sync-notifications') {
    event.waitUntil(checkFirebaseNotificationsInBackground());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'ksumc-periodic-notifications') {
    event.waitUntil(checkFirebaseNotificationsInBackground());
  }
});

// Fetch Event: استراتيجية تسريع فائقة مخصصة للهواتف والآيفون (Lightning Fast Mobile Experience)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  if (req.method !== 'GET') return;

  // Ignore API calls, WebSockets, MSAL auth endpoints, Google APIs, reCAPTCHA, Firebase App Check / AI Logic, or Power Automate
  if (
    req.url.includes('/api/') ||
    req.url.includes('login.microsoftonline.com') ||
    req.url.includes('graph.microsoft.com') ||
    req.url.includes('firebaseio.com') ||
    req.url.includes('googleapis.com') ||
    req.url.includes('google.com/recaptcha') ||
    req.url.includes('recaptcha.net') ||
    req.url.includes('gstatic.com/recaptcha') ||
    req.url.includes('firebaseappcheck') ||
    req.url.includes('firebasevertexai') ||
    req.url.includes('powerplatform.com')
  ) {
    return;
  }

  // 1. Navigation (HTML Documents): جلب سريع للشبكة مع مهلة 800ms -> الرجوع الفوري للكاش إن كانت الشبكة بطيئة
  if (req.mode === 'navigate' || req.destination === 'document' || req.url.endsWith('.html')) {
    event.respondWith(
      new Promise((resolve) => {
        let hasResolved = false;
        const timeoutId = setTimeout(() => {
          if (!hasResolved) {
            caches.match(req).then((cached) => {
              if (cached && !hasResolved) {
                hasResolved = true;
                resolve(cached);
              }
            });
          }
        }, 800);

        fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            if (!hasResolved) {
              clearTimeout(timeoutId);
              hasResolved = true;
              resolve(networkResponse);
            }
          })
          .catch(() => {
            if (!hasResolved) {
              clearTimeout(timeoutId);
              caches.match(req).then((cached) => {
                resolve(cached || caches.match('./index.html'));
              });
            }
          });
      })
    );
    return;
  }

  // 2. Scripts, Styles & Fonts: Stale-While-Revalidate (استجابة فورية 0ms من الكاش مع تحديث خلفي صامت)
  if (
    req.destination === 'script' ||
    req.destination === 'style' ||
    req.url.endsWith('.js') ||
    req.url.endsWith('.css') ||
    req.url.includes('tailwindcss.com') ||
    req.url.includes('fonts.googleapis.com') ||
    req.url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Images and Other Assets: Cache-First
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => null);
    })
  );
});

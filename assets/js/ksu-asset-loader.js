/**
 * KSUMC Safety Platform - Smart Non-Blocking Asset Registry Loader
 * المدينة الطبية بجامعة الملك سعود - محرك التحميل الذكي غير الحاجب لسجلات الأصول
 * يزيل حجب العرض الأولي (~1.85MB) في الأقبية وضعف التغطية مع ضمان توفر الأصول كاملة بالخلفية أو عند الطلب
 */
(function(window) {
  'use strict';

  const REGISTRIES = {
    extinguishers: {
      src: 'assets/js/real_extinguishers_data.js?v=8.3.0',
      globalName: 'KSU_REAL_EXTINGUISHERS'
    },
    fm200: {
      src: 'assets/js/ksu-fm200-assets.js?v=5.5',
      globalName: 'KSU_FM200_ASSETS'
    },
    fhc: {
      src: 'assets/js/ksu-fhc-assets.js?v=1.0',
      globalName: 'KSU_FHC_ASSETS'
    },
    plant_rooms: {
      src: 'assets/js/ksu-plant-rooms-assets.js?v=1.0',
      globalName: 'KSU_PLANT_ROOM_ASSETS'
    },
    wet_chem: {
      src: 'assets/js/ksu-wet-chemical-assets.js?v=1.0',
      globalName: 'KSU_WET_CHEM_ASSETS'
    },
    facp: {
      src: 'assets/js/ksu-facp-assets.js?v=2.0',
      globalName: 'KSU_FACP_ASSETS'
    }
  };

  const inFlight = new Map();

  function isRegistryLoaded(key) {
    const cfg = REGISTRIES[key];
    if (!cfg) return false;
    const val = window[cfg.globalName];
    return Array.isArray(val) && val.length > 0;
  }

  function ensureRegistry(key) {
    const cfg = REGISTRIES[key];
    if (!cfg) return Promise.resolve([]);
    if (isRegistryLoaded(key)) {
      return Promise.resolve(window[cfg.globalName]);
    }
    if (inFlight.has(key)) {
      return inFlight.get(key);
    }
    if (typeof document === 'undefined' || !document.head) {
      return Promise.resolve([]);
    }

    const promise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = cfg.src;
      script.async = true;
      script.charset = 'UTF-8';
      script.onload = () => {
        inFlight.delete(key);
        const loaded = Array.isArray(window[cfg.globalName]) ? window[cfg.globalName] : [];
        if (typeof window.rehydrateOfficialAssets === 'function') {
          try { window.rehydrateOfficialAssets(); } catch (_) {}
        }
        if (window.KSUOps && typeof window.KSUOps.renderMonthlyCoveragePanels === 'function') {
          try { window.KSUOps.renderMonthlyCoveragePanels(); } catch (_) {}
        }
        resolve(loaded);
      };
      script.onerror = () => {
        inFlight.delete(key);
        resolve(Array.isArray(window[cfg.globalName]) ? window[cfg.globalName] : []);
      };
      document.head.appendChild(script);
    });

    inFlight.set(key, promise);
    return promise;
  }

  function loadAllInBackground() {
    const keys = Object.keys(REGISTRIES);
    return Promise.all(keys.map((k) => ensureRegistry(k)));
  }

  function scheduleIdleHydration() {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => {
        loadAllInBackground();
      }, { timeout: 1200 });
    } else if (typeof setTimeout === 'function') {
      setTimeout(() => {
        loadAllInBackground();
      }, 250);
    }
  }

  const KSUAssetLoader = {
    REGISTRIES,
    isRegistryLoaded,
    ensureRegistry,
    loadAllInBackground,
    scheduleIdleHydration
  };

  window.KSUAssetLoader = KSUAssetLoader;
})(typeof window !== 'undefined' ? window : globalThis);

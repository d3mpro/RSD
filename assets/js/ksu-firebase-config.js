/**
 * KSUMC Safety Platform - Shared Firebase Client Configuration
 * المدينة الطبية بجامعة الملك سعود - إعدادات مشروع Firebase المعتمدة
 */
(function(window) {
  'use strict';

  const PROD_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBXKoswq5Eq7JdenprjUPQkgereD2fcv7s",
    authDomain: "rsd-ksu.firebaseapp.com",
    projectId: "rsd-ksu",
    storageBucket: "rsd-ksu.firebasestorage.app",
    messagingSenderId: "343264080935",
    appId: "1:343264080935:web:72ca9a5f6b14c4ab484a02",
    measurementId: "G-HW9W0W6NFH",
    databaseURL: (typeof window !== 'undefined' && window.KSU_FIREBASE_RTDB_URL)
      || (typeof localStorage !== 'undefined' && localStorage.getItem('ksumc_rtdb_url'))
      || "https://rsd-ksu-default-rtdb.firebaseio.com"
  };

  window.PROD_FIREBASE_CONFIG = PROD_FIREBASE_CONFIG;
  window.KSU_FIREBASE_CONFIG = PROD_FIREBASE_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);

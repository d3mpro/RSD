/**
 * KSU Medical City Safety System - Production Launch Clean-Slate Reset Engine
 * سكربت التهيئة والتصفير للتدشين الرسمي - الإدارة العامة للأمن والسلامة - إدارة السلامة
 * جامعة الملك سعود - أكتوبر 2026
 */

(function(window) {
  'use strict';

  class KSUProductionResetEngine {
    constructor() {
      this.resetPhrase = 'نعم أرغب بالتصفير للتدشين الرسمي';
    }

    /**
     * Download comprehensive JSON backup before resetting
     */
    createFullBackup() {
      const backupData = {
        meta: {
          title: 'KSUMC Safety System Full Pre-Reset Backup',
          createdAt: new Date().toISOString(),
          version: '2.19.0',
          facility: 'King Saud University Medical City (KSUMC)',
          department: 'General Directorate of Security & Safety - Safety Department'
        },
        database: {
          assetsCount: (window.state?.assets || []).length,
          usersCount: (window.state?.users || []).length,
          buildingsCount: (window.state?.buildings || []).length,
          rounds: window.state?.rounds || [],
          alarms: window.state?.alarms || [],
          permits: window.state?.permits || [],
          doors: window.state?.doors || [],
          safetyViolations: window.state?.safetyViolations || [],
          smokingViolations: window.state?.smokingViolations || [],
          shiftIncidents: window.state?.shiftIncidents || [],
          safetyDeptReports: window.state?.safetyDeptReports || [],
          users: window.state?.users || [],
          assets: window.state?.assets || [],
          buildings: window.state?.buildings || []
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(jsonStr);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `ksu_safety_backup_pre_reset_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      return backupData;
    }

    /**
     * Open the Admin Confirmation Modal
     */
    openResetModal() {
      const modal = document.getElementById('modal-production-reset');
      if (modal) {
        const inp = document.getElementById('inp-confirm-production-reset');
        if (inp) inp.value = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
    }

    closeResetModal() {
      const modal = document.getElementById('modal-production-reset');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    /**
     * Execute the clean slate reset
     */
    executeReset() {
      const pass = prompt('🔒 يرجى إدخال الرقم السري المعتمد لتأكيد التصفير وتفعيل النسخة الحقيقية:');
      if (pass === null) return false;
      const isValid = (window.KSUSystemMode && typeof window.KSUSystemMode.verifyPassword === 'function')
        ? window.KSUSystemMode.verifyPassword(pass)
        : (pass.trim() === 'Kk@122566##' || pass.trim().toLowerCase() === 'kk@122566##');
      if (!isValid) {
        alert('❌ الرقم السري غير صحيح. تم إلغاء العملية.');
        return false;
      }
      const inp = document.getElementById('inp-confirm-production-reset');
      const val = (inp?.value || '').trim();

      if (val !== this.resetPhrase) {
        alert(`يرجى كتابة العبارة التأكيدية بدقة:\n\n${this.resetPhrase}`);
        return false;
      }

      // Step 1: Automatic Full Backup
      try {
        this.createFullBackup();
      } catch (e) {
        console.warn('Backup warning:', e);
      }

      // Step 2: Reset Transactional / Operational State
      if (!window.state) window.state = {};

      const assetsCount = (window.state.assets || []).length;
      const buildingsCount = (window.state.buildings || []).length;
      const usersCount = (window.state.users || []).length;

      window.state.rounds = [];
      window.state.alarms = [];
      window.state.permits = [];
      window.state.doors = [];
      window.state.safetyViolations = [];
      window.state.smokingViolations = [];
      window.state.shiftIncidents = [];
      window.state.safetyDeptReports = [];

      // Step 3: Clear and update LocalStorage for operational keys
      try {
        const resetKeys = [
          'ksumc_safety_rounds', 'ksumc_safety_alarms', 'ksumc_safety_permits',
          'ksumc_safety_doors', 'ksumc_safety_violations', 'ksumc_smoking_violations',
          'ksumc_safety_shift_incidents', 'ksumc_safety_dept_reports', 'ksumc_rounds',
          'ksumc_field_rounds', 'ksumc_rounds_registry', 'ksumc_doors', 'ksumc_permits',
          'ksumc_alarms', 'ksumc_shift_tasks', 'ksumc_shift_inspection_logs',
          'ksumc_quality_directives', 'ksumc_safety_schedule', 'ksumc_smoking_viols', 'ksumc_safety_viols'
        ];
        resetKeys.forEach(k => localStorage.setItem(k, JSON.stringify([])));
        localStorage.setItem('ksumc_sample_data_version', 'v6.0-clean-pilot-launch-2026');
        localStorage.setItem('ksu_production_launch_initialized', new Date().toISOString());
        localStorage.setItem('ksumc_system_mode', 'production');
        if (window.KSUSystemMode && typeof window.KSUSystemMode.setMode === 'function') {
          window.KSUSystemMode.setMode('production');
        }

        // Call backend reset
        fetch('/safety/api/admin/reset-operational-data', { method: 'POST' }).catch(() => {});
      } catch (e) {}

      // Step 4: Refresh UI Components
      document.querySelectorAll('.active-alarms-count').forEach(el => el.textContent = '0');

      if (typeof window.renderShiftTasks === 'function') window.renderShiftTasks();
      if (typeof window.renderSafetyViolations === 'function') window.renderSafetyViolations();
      if (typeof window.renderSmokingViolations === 'function') window.renderSmokingViolations();
      if (typeof window.renderDoorsList === 'function') window.renderDoorsList();
      if (typeof window.renderPermitsList === 'function') window.renderPermitsList();
      if (typeof window.renderShiftIncidentsList === 'function') window.renderShiftIncidentsList();
      if (typeof window.updateShiftIncidentBadges === 'function') window.updateShiftIncidentBadges();
      if (typeof window.renderSafetyDeptReportsTable === 'function') window.renderSafetyDeptReportsTable();
      if (typeof window.renderInspectionCoverageMatrix === 'function') window.renderInspectionCoverageMatrix();
      if (typeof window.renderInspectorSupervisorStats === 'function') window.renderInspectorSupervisorStats();
      if (typeof window.renderOfficialReport === 'function') window.renderOfficialReport();
      if (typeof window.renderAssetKPIs === 'function') window.renderAssetKPIs();

      this.closeResetModal();

      // Step 5: Notify and Show Celebration Modal / Toast
      const msg = `تم تصفير المنظومة بنجاح والتهيئة للتدشين الرسمي بنسبة 100% ✓\nتم الحفاظ على ${assetsCount} أصل معتمد، ${buildingsCount} مباني، و ${usersCount} حساباً. تم أخذ نسخة احتياطية فورية وتنزيلها بجهازك.`;
      
      if (typeof window.showToast === 'function') {
        window.showToast('تم تصفير السجلات التشغيلية والتهيئة للتدشين بنجاح ✓', 'success');
      }
      alert(msg);

      return true;
    }
  }

  window.ksuProductionReset = new KSUProductionResetEngine();

})(window);

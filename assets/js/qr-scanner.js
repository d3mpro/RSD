/**
 * KSU Medical City Safety System - Live QR & Barcode Camera Scanner Engine
 * محرك مسح باركود وأكواد الاستجابة السريعة للأصول بالكاميرا المباشرة
 * الإدارة العامة للأمن والسلامة - إدارة السلامة - جامعة الملك سعود
 */

(function(window) {
  'use strict';

  class KSUQRScannerEngine {
    constructor() {
      this.videoStream = null;
      this.videoEl = null;
      this.canvasEl = null;
      this.canvasCtx = null;
      this.isScanning = false;
      this.facingMode = 'environment'; // 'environment' (back camera) or 'user' (front)
      this.hasTorch = false;
      this.isTorchOn = false;
      this.scanInterval = null;
      this.barcodeDetector = null;
      this.audioContext = null;
      this.lastScannedCode = null;
      this.lastScanTime = 0;
      
      this.initBarcodeDetector();
    }

    initBarcodeDetector() {
      if ('BarcodeDetector' in window) {
        try {
          this.barcodeDetector = new BarcodeDetector({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix']
          });
          console.log('[KSU Scanner] Native BarcodeDetector API initialized.');
        } catch (e) {
          console.warn('[KSU Scanner] Native BarcodeDetector init notice:', e);
          this.barcodeDetector = null;
        }
      } else {
        console.log('[KSU Scanner] Native BarcodeDetector not supported, using jsQR offline engine.');
      }
    }

    /**
     * Open Scanner Modal & Request Camera Permission
     */
    async openScanner() {
      const modal = document.getElementById('modal-qr-camera-scanner');
      if (!modal) return;

      modal.classList.remove('hidden');
      modal.classList.add('flex');

      this.videoEl = document.getElementById('qr-scanner-video');
      this.canvasEl = document.getElementById('qr-scanner-canvas');
      if (this.canvasEl) {
        this.canvasCtx = this.canvasEl.getContext('2d', { willReadFrequently: true });
      }

      const errBox = document.getElementById('scanner-error-container');
      if (errBox) errBox.classList.add('hidden');

      const manualInp = document.getElementById('inp-manual-qr-code');
      if (manualInp) manualInp.value = '';

      this.updateScannerStatus('جاري تشغيل كاميرا الفحص...');
      await this.startCamera();
    }

    /**
     * Close Scanner Modal & Clean up Resources
     */
    closeScanner() {
      this.stopCamera();
      const modal = document.getElementById('modal-qr-camera-scanner');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    /**
     * Start WebRTC Camera Stream
     */
    async startCamera() {
      this.stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.showCameraError('المتصفح أو الجهاز لا يدعم تشغيل الكاميرا المباشرة. يمكنك استخدام خيار التقاط صورة أو إدخال الكود يدوياً.');
        return;
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.videoStream = stream;

        if (this.videoEl) {
          this.videoEl.srcObject = stream;
          this.videoEl.setAttribute('playsinline', 'true'); // Required for iOS Safari
          await this.videoEl.play();
        }

        // Check Torch capability
        const track = stream.getVideoTracks()[0];
        if (track && track.getCapabilities) {
          const caps = track.getCapabilities();
          this.hasTorch = !!caps.torch;
          const torchBtn = document.getElementById('btn-scanner-torch');
          if (torchBtn) {
            torchBtn.style.display = this.hasTorch ? 'flex' : 'none';
          }
        }

        this.isScanning = true;
        this.updateScannerStatus('وجه الكاميرا نحو باركود الأصل أو كود الـ QR');
        this.startScanningLoop();
      } catch (err) {
        console.error('[KSU Scanner] Camera access error:', err);
        let errorMsg = 'تعذر تشغيل الكاميرا. ';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg += 'يرجى السماح بالوصول إلى الكاميرا من إعدادات المتصفح أو الخصوصية.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          errorMsg += 'لم يتم العثور على كاميرا في هذا الجهاز.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          errorMsg += 'الكاميرا قيد الاستخدام بواسطة تطبيق آخر.';
        } else {
          errorMsg += err.message;
        }
        this.showCameraError(errorMsg);
      }
    }

    stopCamera() {
      this.isScanning = false;
      if (this.scanInterval) {
        cancelAnimationFrame(this.scanInterval);
        this.scanInterval = null;
      }
      if (this.videoStream) {
        this.videoStream.getTracks().forEach(track => {
          try { track.stop(); } catch (e) {}
        });
        this.videoStream = null;
      }
      if (this.videoEl) {
        this.videoEl.srcObject = null;
      }
      this.isTorchOn = false;
      this.updateTorchUI();
    }

    switchCamera() {
      this.facingMode = (this.facingMode === 'environment') ? 'user' : 'environment';
      this.startCamera();
    }

    async toggleTorch() {
      if (!this.videoStream || !this.hasTorch) return;
      const track = this.videoStream.getVideoTracks()[0];
      if (!track) return;

      try {
        this.isTorchOn = !this.isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: this.isTorchOn }]
        });
        this.updateTorchUI();
      } catch (e) {
        console.warn('Torch toggle error:', e);
      }
    }

    updateTorchUI() {
      const icon = document.getElementById('icon-scanner-torch');
      if (icon) {
        icon.textContent = this.isTorchOn ? 'flash_on' : 'flash_off';
        icon.style.color = this.isTorchOn ? '#f59e0b' : '#ffffff';
      }
    }

    updateScannerStatus(text) {
      const statusEl = document.getElementById('scanner-status-text');
      if (statusEl) statusEl.textContent = text;
    }

    showCameraError(msg) {
      this.updateScannerStatus(msg);
      const errBox = document.getElementById('scanner-error-container');
      const errMsg = document.getElementById('scanner-error-message');
      if (errBox && errMsg) {
        errMsg.textContent = msg;
        errBox.classList.remove('hidden');
      }
    }

    /**
     * Continuous Frame Analysis Loop
     */
    startScanningLoop() {
      const scanFrame = async () => {
        if (!this.isScanning) return;

        if (this.videoEl && this.videoEl.readyState === this.videoEl.HAVE_ENOUGH_DATA) {
          try {
            let detectedCode = null;

            // Method 1: Modern Native BarcodeDetector
            if (this.barcodeDetector) {
              try {
                const barcodes = await this.barcodeDetector.detect(this.videoEl);
                if (barcodes && barcodes.length > 0) {
                  detectedCode = barcodes[0].rawValue;
                }
              } catch (be) {}
            }

            // Method 2: jsQR Canvas analysis
            if (!detectedCode && typeof jsQR !== 'undefined' && this.canvasEl && this.canvasCtx) {
              const width = this.videoEl.videoWidth;
              const height = this.videoEl.videoHeight;
              if (width > 0 && height > 0) {
                const targetW = Math.min(width, 640);
                const targetH = Math.floor(height * (targetW / width));

                this.canvasEl.width = targetW;
                this.canvasEl.height = targetH;
                this.canvasCtx.drawImage(this.videoEl, 0, 0, targetW, targetH);
                
                const imageData = this.canvasCtx.getImageData(0, 0, targetW, targetH);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: 'dontInvert'
                });
                if (code && code.data) {
                  detectedCode = code.data;
                }
              }
            }

            if (detectedCode) {
              const now = Date.now();
              if (detectedCode !== this.lastScannedCode || now - this.lastScanTime > 2000) {
                this.lastScannedCode = detectedCode;
                this.lastScanTime = now;
                this.onQRCodeDetected(detectedCode);
                return;
              }
            }
          } catch (err) {}
        }

        if (this.isScanning) {
          this.scanInterval = requestAnimationFrame(scanFrame);
        }
      };

      this.scanInterval = requestAnimationFrame(scanFrame);
    }

    /**
     * QR Code Successfully Detected
     */
    onQRCodeDetected(rawCode) {
      this.playSuccessFeedback();
      this.closeScanner();
      this.handleScannedCode(rawCode);
    }

    playSuccessFeedback() {
      // Audio Chime
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          if (!this.audioContext) this.audioContext = new AudioCtx();
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
          }
          const ctx = this.audioContext;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.09);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.22);
        }
      } catch (e) {}

      // Haptic Vibration
      if (navigator.vibrate) {
        try {
          navigator.vibrate([70, 40, 70]);
        } catch (e) {}
      }
    }

    cleanCode(raw) {
      if (!raw) return '';
      let clean = String(raw).trim();
      if (clean.includes('asset=')) {
        const match = clean.match(/asset=([^&]+)/);
        if (match) clean = decodeURIComponent(match[1]);
      } else if (clean.includes('/asset/')) {
        const parts = clean.split('/asset/');
        if (parts[1]) clean = parts[1].split(/[?#]/)[0];
      }
      return clean.trim();
    }

    /**
     * Lookup Asset & Present Direct Inspection Sheet
     */
    handleScannedCode(rawCode) {
      const code = this.cleanCode(rawCode);
      if (!code) return;

      console.log('[KSU Scanner] Processing Scanned Code:', code);

      const allAssets = window.state?.assets || [];
      const codeLower = code.toLowerCase();
      const codeClean = codeLower.replace(/[^a-z0-9]/g, '');

      let matched = allAssets.find(a => 
        (a.id && a.id.toLowerCase() === codeLower) ||
        (a.controlNo && a.controlNo.toLowerCase() === codeLower) ||
        (a.locationCode && a.locationCode.toLowerCase() === codeLower) ||
        (a.barcode && a.barcode.toLowerCase() === codeLower) ||
        (a.id && a.id.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean) ||
        (a.controlNo && a.controlNo.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean)
      );

      // Secondary search in real extinguishers dataset
      if (!matched && typeof KSU_REAL_EXTINGUISHERS !== 'undefined') {
        matched = KSU_REAL_EXTINGUISHERS.find(a =>
          (a.id && a.id.toLowerCase() === codeLower) ||
          (a.id && a.id.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean)
        );
      }

      // Secondary search in official FM-200 systems dataset
      if (!matched && typeof KSU_FM200_ASSETS !== 'undefined') {
        matched = KSU_FM200_ASSETS.find(a =>
          (a.id && a.id.toLowerCase() === codeLower) ||
          (a.controlNo && a.controlNo.toLowerCase() === codeLower) ||
          (a.locationCode && a.locationCode.toLowerCase() === codeLower) ||
          (a.id && a.id.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean) ||
          (a.controlNo && a.controlNo.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean)
        );
      }

      // Secondary search in official Fire Hose Cabinets dataset
      if (!matched && typeof KSU_FHC_ASSETS !== 'undefined') {
        matched = KSU_FHC_ASSETS.find(a =>
          (a.id && a.id.toLowerCase() === codeLower) ||
          (a.controlNo && a.controlNo.toLowerCase() === codeLower) ||
          (a.barcode && a.barcode.toLowerCase() === codeLower) ||
          (a.tag && a.tag.toLowerCase() === codeLower) ||
          (a.id && a.id.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean) ||
          (a.controlNo && a.controlNo.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean)
        );
      }

      // Secondary search in official Wet Chemical systems dataset
      if (!matched && typeof KSU_WET_CHEM_ASSETS !== 'undefined') {
        matched = KSU_WET_CHEM_ASSETS.find(a =>
          (a.id && a.id.toLowerCase() === codeLower) ||
          (a.controlNo && a.controlNo.toLowerCase() === codeLower) ||
          (a.barcode && a.barcode.toLowerCase() === codeLower) ||
          (a.tag && a.tag.toLowerCase() === codeLower) ||
          (a.id && a.id.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean) ||
          (a.controlNo && a.controlNo.toLowerCase().replace(/[^a-z0-9]/g, '') === codeClean)
        );
      }

      // Secondary search by name or location
      if (!matched) {
        matched = allAssets.find(a => 
          (a.locationDetails && a.locationDetails.toLowerCase().includes(codeLower)) ||
          (a.name && a.name.toLowerCase().includes(codeLower))
        );
      }

      if (matched) {
        this.showScannedAssetModal(matched);
      } else {
        this.showUnregisteredCodeModal(code);
      }
    }

    /**
     * Display Scanned Asset Inspection Sheet
     */
    showScannedAssetModal(asset) {
      const modal = document.getElementById('modal-scanned-asset-details');
      if (!modal) return;

      document.getElementById('scanned-asset-id').textContent = asset.id || 'N/A';
      document.getElementById('scanned-asset-name').textContent = asset.name || 'أصل سلامة معتمد';
      document.getElementById('scanned-asset-category').textContent = asset.category || 'معدات السلامة';
      document.getElementById('scanned-asset-type').textContent = asset.type || asset.category || '-';
      document.getElementById('scanned-asset-building').textContent = asset.building || 'المدينة الطبية';
      document.getElementById('scanned-asset-floor').textContent = asset.floor || '-';
      document.getElementById('scanned-asset-location').textContent = asset.locationDetails || 'الموقع العام';
      
      const statusEl = document.getElementById('scanned-asset-status');
      if (statusEl) {
        statusEl.textContent = asset.status || 'سليم ومطابق';
        statusEl.className = (asset.status === 'سليم ومطابق' || asset.status === 'جاهز للتشغيل')
          ? 'px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-300'
          : 'px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold text-xs border border-amber-300';
      }

      const lastInspEl = document.getElementById('scanned-asset-last-inspection');
      if (lastInspEl) {
        lastInspEl.textContent = asset.lastInspectionDate || 'غير مسجل مسبقاً';
      }

      const inspectorEl = document.getElementById('scanned-asset-inspector');
      if (inspectorEl) {
        inspectorEl.textContent = asset.inspector || 'فريق السلامة الميداني';
      }

      window.state.currentScannedAsset = asset;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    closeScannedAssetModal() {
      const modal = document.getElementById('modal-scanned-asset-details');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    /**
     * 1-Click Instant Field Inspection Verification
     */
    verifyCurrentScannedAsset() {
      const asset = window.state?.currentScannedAsset;
      if (!asset) return;

      const today = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
      const inspectorName = window.state?.currentUser?.name || 'أ. عادل خلف العنزي';

      asset.status = 'سليم ومطابق';
      asset.lastInspectionDate = today;
      asset.inspector = inspectorName;

      // Update in state.assets
      if (window.state?.assets) {
        const idx = window.state.assets.findIndex(a => a.id === asset.id);
        if (idx !== -1) {
          window.state.assets[idx] = { ...asset };
        }
        try {
          localStorage.setItem('ksu_safety_assets', JSON.stringify(window.state.assets));
        } catch (e) {}
      }

      // Add to Rounds/Compliance
      if (window.state) {
        if (!window.state.rounds) window.state.rounds = [];
        const newRound = {
          id: 'RND-' + Date.now().toString().slice(-6),
          title: `فحص ومطابقة أصل: ${asset.name} (${asset.id})`,
          formType: asset.category === 'طفايات الحريق' ? 'طفايات الحريق' : 'مخارج الطوارئ',
          hospital: asset.hospital || 'مستشفى الملك خالد الجامعي',
          building: asset.building,
          floor: asset.floor,
          location: asset.locationDetails,
          inspector: inspectorName,
          date: today,
          time: timeStr,
          status: 'معتمد ومطابق (100%)',
          score: 100,
          complianceRate: '100%',
          notes: `تم الفحص والمطابقة الميدانية المباشرة عبر مسح باركود الـ QR (${asset.id}). مطابقة لكود NFPA 10 واشتراطات سباهي (CBAHI).`,
          itemsChecked: 1,
          itemsPassed: 1
        };
        window.state.rounds.unshift(newRound);
        try {
          localStorage.setItem('ksu_safety_rounds', JSON.stringify(window.state.rounds));
        } catch (e) {}
      }

      this.playSuccessFeedback();
      this.closeScannedAssetModal();

      if (typeof window.showToast === 'function') {
        window.showToast(`تم توثيق فحص واعتماد الأصل (${asset.id}) بنجاح ✓`, 'success');
      }

      if (typeof window.renderAssetsList === 'function') {
        window.renderAssetsList();
      }
    }

    /**
     * Report Issue on Scanned Asset
     */
    reportIssueOnScannedAsset() {
      const asset = window.state?.currentScannedAsset;
      this.closeScannedAssetModal();

      if (typeof window.switchTab === 'function') {
        window.switchTab('safety-violations');
      }

      setTimeout(() => {
        if (asset && typeof window.openNewViolationModal === 'function') {
          window.openNewViolationModal({
            location: `${asset.building} - ${asset.floor} (${asset.locationDetails})`,
            description: `ملاحظة فنية أو عطل على الأصل (${asset.id} - ${asset.name}) أثناء المسح الميداني بالـ QR.`
          });
        }
      }, 300);
    }

    /**
     * Show Asset in Registry Tab
     */
    viewScannedAssetInRegistry() {
      const asset = window.state?.currentScannedAsset;
      this.closeScannedAssetModal();

      if (typeof window.switchTab === 'function') {
        window.switchTab('assets-qr-registry');
      }

      setTimeout(() => {
        const inp = document.getElementById('search-assets-input');
        if (inp && asset) {
          inp.value = asset.id;
          inp.dispatchEvent(new Event('input'));
        }
      }, 300);
    }

    /**
     * Display Unregistered Code Modal
     */
    showUnregisteredCodeModal(code) {
      const modal = document.getElementById('modal-unregistered-qr-code');
      if (!modal) {
        alert(`تم مسح الرمز: ${code}\nهذا الأصل غير مسجل مسبقاً في قاعدة بيانات المنظومة.`);
        return;
      }

      document.getElementById('unregistered-code-display').textContent = code;
      window.state.lastUnregisteredCode = code;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    closeUnregisteredCodeModal() {
      const modal = document.getElementById('modal-unregistered-qr-code');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }

    /**
     * File Upload / Camera Snapshot Fallback
     */
    async handleFileCapture(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      this.updateScannerStatus('جاري تحليل الصورة واستخراج الكود...');

      const img = new Image();
      img.onload = async () => {
        let detected = null;

        // Native BarcodeDetector
        if (this.barcodeDetector) {
          try {
            const barcodes = await this.barcodeDetector.detect(img);
            if (barcodes && barcodes.length > 0) {
              detected = barcodes[0].rawValue;
            }
          } catch (e) {}
        }

        // jsQR Fallback
        if (!detected && typeof jsQR !== 'undefined') {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            detected = code.data;
          }
        }

        if (detected) {
          this.onQRCodeDetected(detected);
        } else {
          this.updateScannerStatus('لم يتم العثور على رمز QR أو باركود واضح في الصورة. يرجى تجربة التقاط صورة أقرب أو إدخال الكود يدوياً.');
        }
      };

      img.src = URL.createObjectURL(file);
    }
  }

  // Global Engine Instance
  window.ksuQRScanner = new KSUQRScannerEngine();

  // Helper bindings for onclick handlers
  window.openQRScannerModal = () => window.ksuQRScanner.openScanner();
  window.closeQRScannerModal = () => window.ksuQRScanner.closeScanner();
  window.switchScannerCamera = () => window.ksuQRScanner.switchCamera();
  window.toggleScannerTorch = () => window.ksuQRScanner.toggleTorch();
  window.verifyCurrentScannedAsset = () => window.ksuQRScanner.verifyCurrentScannedAsset();
  window.reportIssueOnScannedAsset = () => window.ksuQRScanner.reportIssueOnScannedAsset();
  window.viewScannedAssetInRegistry = () => window.ksuQRScanner.viewScannedAssetInRegistry();
  window.closeScannedAssetModal = () => window.ksuQRScanner.closeScannedAssetModal();
  window.closeUnregisteredCodeModal = () => window.ksuQRScanner.closeUnregisteredCodeModal();
  window.handleQRFileSelected = (e) => window.ksuQRScanner.handleFileCapture(e);

  window.submitManualAssetCode = () => {
    const inp = document.getElementById('inp-manual-qr-code');
    const val = inp ? inp.value.trim() : '';
    if (!val) {
      if (typeof window.showToast === 'function') {
        window.showToast('يرجى إدخال كود الأصل أولاً', 'warning');
      }
      return;
    }
    window.ksuQRScanner.closeScanner();
    window.ksuQRScanner.handleScannedCode(val);
  };

  window.navigateBackFromAssetRegistry = () => {
    const user = window.state?.currentUser;
    const roleCat = window.getUserRoleCategory ? window.getUserRoleCategory(user) : 'inspector';
    if (roleCat === 'shift_supervisor' || roleCat === 'executive' || roleCat === 'admin') {
      window.switchTab('shift-supervisor-dashboard');
    } else {
      window.switchTab('field-inspection-rounds');
    }
  };

})(window);

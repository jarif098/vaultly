/**
 * Vaultly - Mobile Navigation & High-Speed QR Code Pairing Engine
 * Handles responsive mobile navigation drawer, bottom nav bar,
 * QR code pairing modal generation for PC, and dual-engine camera viewfinder scanner for Android.
 */

'use strict';

(function(root) {
  let activeVideoStream = null;
  let activeScanTimerId = null;
  let isScanningActive = false;
  let currentCameraFacing = 'environment'; // 'environment' (back) or 'user' (front)
  let activeTorch = false;
  let currentZoomLevel = 1;
  let nativeBarcodeDetector = null;

  // Initialize hardware-accelerated BarcodeDetector if supported by Android WebView / Chromium
  try {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      nativeBarcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (e) {
    nativeBarcodeDetector = null;
  }

  /**
   * Parses and validates a raw QR string into a Vaultly pairing payload object.
   */
  function parseVaultlyPairingString(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') return null;
    const trimmed = rawStr.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.type === 'vaultly-pair') {
        return parsed;
      }
      // Support compact alias format { t: 'vp', m: 'gh', o, r, b, k }
      if (parsed && parsed.t === 'vp') {
        return {
          type: 'vaultly-pair',
          v: 1,
          mode: parsed.m === 'gh' ? 'github' : 'local',
          owner: parsed.o || '',
          repo: parsed.r || '',
          branch: parsed.b || 'main',
          token: parsed.k || '',
          localKey: parsed.lk || null
        };
      }
    } catch (e) {
      // Check if JSON is embedded inside a URL or text wrapper
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          const sub = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
          if (sub && sub.type === 'vaultly-pair') return sub;
        } catch (_) {}
      }
    }
    return null;
  }

  /**
   * Generates and displays the PC Pairing QR Code modal.
   * Uses low-density error correction ('L') and generous quiet-zone margin for instant camera lock-on.
   */
  async function openMobilePairModal() {
    const modal = document.getElementById('qr-pair-modal');
    const container = document.getElementById('pair-qr-graphic');
    const infoPill = document.getElementById('pair-repo-info');
    const copyBtn = document.getElementById('btn-copy-pairing-text');

    if (!modal) return;

    try {
      if (container) container.innerHTML = '<span style="font-size:0.8rem; font-weight:700; color:#121212;">Generating QR code...</span>';
      modal.classList.add('open');
      modal.style.display = 'flex';

      const pairData = await window.vaultlyApi.getMobilePairingData();
      const jsonPayload = JSON.stringify(pairData);

      // Auto-register mobile device so it displays in Connected Devices list
      try {
        if (window.vaultlyApi && window.vaultlyApi.registerConnectedDevice) {
          await window.vaultlyApi.registerConnectedDevice({
            id: 'device-mobile-android',
            name: 'Android Phone (Vaultly Mobile)',
            type: 'mobile',
            platform: 'Android',
            pairedVia: 'QR Scan',
            pairedAt: Date.now(),
            lastActive: Date.now(),
            isCurrent: false,
            status: 'authorized'
          });
        }
      } catch (_) {}

      const qrGen = (typeof window !== 'undefined' && window.qrcode) || (typeof root !== 'undefined' && root.qrcode) || (typeof qrcode !== 'undefined' ? qrcode : null);
      if (qrGen) {
        // Level 'L' keeps module count low and squares large on digital screens
        const qr = qrGen(0, 'L');
        qr.addData(jsonPayload);
        qr.make();
        const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 4 });
        if (container) {
          container.innerHTML = qrSvg;
          const svg = container.querySelector('svg');
          if (svg) {
            svg.style.width = '240px';
            svg.style.height = '240px';
            svg.style.maxWidth = '100%';
            svg.style.display = 'block';
            svg.style.margin = '0 auto';
            svg.style.background = '#FFFFFF';
            svg.style.shapeRendering = 'crispEdges';
          }
        }
      } else {
        if (container) container.innerHTML = '<p style="font-size:0.75rem; color:red;">QR generator library not loaded.</p>';
      }

      if (infoPill) {
        if (pairData.mode === 'github') {
          infoPill.textContent = `GitHub: @${pairData.owner || 'github'}/${pairData.repo || 'vault'} (${pairData.branch || 'main'})`;
          infoPill.style.background = '#00E599';
        } else {
          infoPill.textContent = 'Offline Local Vault (Instant Pair)';
          infoPill.style.background = '#FFE500';
        }
      }

      if (copyBtn) {
        copyBtn.onclick = async () => {
          await window.vaultlyApi.copyToClipboard(jsonPayload, false);
          copyBtn.textContent = 'Copied Pairing Code!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy Pairing Code Text';
          }, 2500);
        };
      }
    } catch (err) {
      if (container) container.innerHTML = `<span style="color:var(--color-danger); font-size:0.8rem;">Error: ${err.message}</span>`;
    }
  }

  /**
   * Automatically renders a live, scannable QR Code directly on the Welcome / Setup Screen.
   */
  async function renderWelcomeLiveQr() {
    const graphicEl = document.getElementById('welcome-qr-graphic');
    const badgeEl = document.getElementById('welcome-qr-badge');
    if (!graphicEl) return;

    try {
      graphicEl.innerHTML = '<span style="font-size:0.7rem; font-weight:800; color:#121212;">Loading QR...</span>';
      const pairData = await window.vaultlyApi.getMobilePairingData();
      const jsonPayload = JSON.stringify(pairData);

      const qrGen = (typeof window !== 'undefined' && window.qrcode) || (typeof root !== 'undefined' && root.qrcode) || (typeof qrcode !== 'undefined' ? qrcode : null);
      if (!qrGen) {
        graphicEl.innerHTML = '<span style="font-size:0.7rem; color:red;">QR library missing</span>';
        return;
      }

      const qr = qrGen(0, 'L');
      qr.addData(jsonPayload);
      qr.make();
      const qrSvg = qr.createSvgTag({ cellSize: 4, margin: 3 });
      graphicEl.innerHTML = qrSvg;
      const svg = graphicEl.querySelector('svg');
      if (svg) {
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.display = 'block';
        svg.style.background = '#FFFFFF';
        svg.style.shapeRendering = 'crispEdges';
      }

      if (badgeEl) {
        if (pairData.mode === 'github') {
          badgeEl.textContent = `@${pairData.owner || 'github'}`;
          badgeEl.style.background = '#00E599';
        } else {
          badgeEl.textContent = 'Local Vault';
          badgeEl.style.background = '#FFE500';
        }
      }

      const copyBtn = document.getElementById('btn-welcome-copy-pairing');
      if (copyBtn) {
        copyBtn.onclick = async () => {
          await window.vaultlyApi.copyToClipboard(jsonPayload, false);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy Code'; }, 2000);
        };
      }
    } catch (err) {
      console.warn('renderWelcomeLiveQr notice:', err);
      graphicEl.innerHTML = `<span style="font-size:0.68rem; color:red;">${err.message}</span>`;
    }
  }

  async function closeMobilePairModal() {
    const modal = document.getElementById('qr-pair-modal');
    if (modal) {
      modal.classList.remove('open');
      modal.style.display = 'none';
    }

    try {
      if (window.vaultlyApi && window.vaultlyApi.registerConnectedDevice) {
        await window.vaultlyApi.registerConnectedDevice({
          id: 'device-mobile-android',
          name: 'Android Phone (Vaultly Mobile)',
          type: 'mobile',
          platform: 'Android',
          pairedVia: 'QR Scan',
          pairedAt: Date.now(),
          lastActive: Date.now(),
          isCurrent: false,
          status: 'authorized'
        });
      }
    } catch (_) {}

    try {
      if (typeof window.loadAppSettings === 'function') {
        await window.loadAppSettings();
      }
      const settingsView = document.getElementById('settings-view');
      if (settingsView && settingsView.style.display !== 'none' && typeof window.showSettingsView === 'function') {
        window.showSettingsView(true);
      }
    } catch (_) {}
  }

  /**
   * Opens the Android camera viewfinder modal and scans for PC QR codes.
   */
  async function openQrScannerModal() {
    const modal = document.getElementById('qr-scanner-modal');
    const statusEl = document.getElementById('scanner-status');
    const video = document.getElementById('qr-scanner-video');
    const canvas = document.getElementById('qr-scanner-canvas');

    if (!modal) return;
    modal.classList.add('open');
    currentZoomLevel = 1;
    updateZoomButtonUI();

    // Reset corner styling
    document.querySelectorAll('.scanner-corner').forEach(el => {
      el.style.borderColor = '#00E599';
    });

    if (statusEl) {
      statusEl.textContent = 'Starting HD camera scanner...';
      statusEl.style.color = 'var(--text-muted)';
    }

    const manualContainer = document.getElementById('scanner-manual-container');
    if (manualContainer) manualContainer.style.display = 'none';

    await startCameraStream(video, canvas, statusEl);
  }

  function updateZoomButtonUI() {
    const zoomBtn = document.getElementById('btn-scanner-zoom');
    const video = document.getElementById('qr-scanner-video');
    if (zoomBtn) {
      const span = zoomBtn.querySelector('span');
      if (span) span.textContent = `Zoom ${currentZoomLevel}x`;
      zoomBtn.style.background = currentZoomLevel > 1 ? '#FFE500' : '';
      zoomBtn.style.color = currentZoomLevel > 1 ? '#121212' : '';
    }
    if (video) {
      video.style.transform = currentZoomLevel > 1 ? `scale(${currentZoomLevel})` : 'scale(1)';
      video.style.transition = 'transform 0.2s ease';
    }
  }

  async function applyCameraTrackEnhancements(track) {
    if (!track || typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') {
      return;
    }
    try {
      const caps = track.getCapabilities() || {};
      const advanced = {};

      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        advanced.focusMode = 'continuous';
      }
      if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
        advanced.exposureMode = 'continuous';
      }
      if (caps.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number') {
        const targetZoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, currentZoomLevel));
        advanced.zoom = targetZoom;
      }

      if (Object.keys(advanced).length > 0) {
        await track.applyConstraints({ advanced: [advanced] });
      }
    } catch (e) {
      // Ignore unsupported constraint warnings
    }
  }

  async function startCameraStream(video, canvas, statusEl) {
    stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (statusEl) {
        statusEl.textContent = 'Camera API unavailable. Use "Scan Image" or paste code below.';
        statusEl.style.color = 'var(--color-danger)';
      }
      showManualPasteOption();
      return;
    }

    try {
      let stream = null;
      try {
        // Request sharp 720p HD stream for dense QR codes on PC monitors
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: currentCameraFacing },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 }
          },
          audio: false
        });
      } catch (hdErr) {
        // Fallback to standard constraints if device rejects resolution hints
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: currentCameraFacing },
          audio: false
        });
      }

      activeVideoStream = stream;
      if (video) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
      }

      const track = stream.getVideoTracks()[0];
      await applyCameraTrackEnhancements(track);

      // Check if torch/flashlight is supported
      const torchBtn = document.getElementById('btn-scanner-torch');
      if (torchBtn && track && track.getCapabilities) {
        const caps = track.getCapabilities() || {};
        torchBtn.style.display = caps.torch ? 'inline-flex' : 'none';
      } else if (torchBtn) {
        torchBtn.style.display = 'none';
      }

      if (statusEl) {
        statusEl.textContent = 'Point camera at PC QR code (Tap video or Zoom 2x if far)';
        statusEl.style.color = 'var(--text-muted)';
      }

      isScanningActive = true;
      scanVideoFrames(video, canvas, statusEl);
    } catch (err) {
      console.warn('Camera access failed:', err);
      if (statusEl) {
        statusEl.textContent = `Camera error: ${err.message || 'Permission denied'}. Use "Scan Image" or paste code below.`;
        statusEl.style.color = 'var(--color-danger)';
      }
      showManualPasteOption();
    }
  }

  function stopCameraStream() {
    isScanningActive = false;
    if (activeScanTimerId) {
      clearTimeout(activeScanTimerId);
      activeScanTimerId = null;
    }

    if (activeVideoStream) {
      activeVideoStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      activeVideoStream = null;
    }

    const video = document.getElementById('qr-scanner-video');
    if (video) {
      video.srcObject = null;
      video.style.transform = 'scale(1)';
    }
    activeTorch = false;
  }

  function closeQrScannerModal() {
    stopCameraStream();
    const modal = document.getElementById('qr-scanner-modal');
    if (modal) modal.classList.remove('open');
  }

  function showManualPasteOption() {
    const manualContainer = document.getElementById('scanner-manual-container');
    if (manualContainer) manualContainer.style.display = 'flex';
  }

  /**
   * Decodes a QR code from an image/video source using both native BarcodeDetector and multi-scale jsQR.
   */
  async function decodeSourceFrame(sourceEl, sourceWidth, sourceHeight, canvas, ctx) {
    // 1. Hardware-accelerated native BarcodeDetector (fastest & handles screen glare/angles)
    if (nativeBarcodeDetector) {
      try {
        const barcodes = await nativeBarcodeDetector.detect(sourceEl);
        if (barcodes && barcodes.length > 0) {
          for (const b of barcodes) {
            const parsed = parseVaultlyPairingString(b.rawValue);
            if (parsed) return parsed;
          }
        }
      } catch (e) {
        // Fallback to jsQR
      }
    }

    if (typeof root.jsQR === 'undefined' || !canvas || !ctx || !sourceWidth || !sourceHeight) {
      return null;
    }

    // 2. Pass A: Center Region of Interest (ROI) crop at 1:1 native pixel resolution
    // This catches dense QR codes held 1-3 feet away from the PC monitor!
    const roiRatio = currentZoomLevel > 1 ? 0.45 : 0.65;
    const cropW = Math.floor(sourceWidth * roiRatio);
    const cropH = Math.floor(sourceHeight * roiRatio);
    const cropX = Math.floor((sourceWidth - cropW) / 2);
    const cropY = Math.floor((sourceHeight - cropH) / 2);

    const maxRoiDim = 520;
    const roiScale = Math.min(1, maxRoiDim / Math.max(cropW, cropH));
    const dstW = Math.max(120, Math.floor(cropW * roiScale));
    const dstH = Math.max(120, Math.floor(cropH * roiScale));

    canvas.width = dstW;
    canvas.height = dstH;
    ctx.drawImage(sourceEl, cropX, cropY, cropW, cropH, 0, 0, dstW, dstH);

    let imgData = ctx.getImageData(0, 0, dstW, dstH);
    let qrCode = root.jsQR(imgData.data, dstW, dstH, { inversionAttempts: 'attemptBoth' });
    if (qrCode && qrCode.data) {
      const parsed = parseVaultlyPairingString(qrCode.data);
      if (parsed) return parsed;
    }

    // 3. Pass B: Full frame downscaled to 480px width (catches close-up / off-center QR codes)
    const fullScale = Math.min(1, 480 / Math.max(sourceWidth, sourceHeight));
    const fullW = Math.max(120, Math.floor(sourceWidth * fullScale));
    const fullH = Math.max(120, Math.floor(sourceHeight * fullScale));

    canvas.width = fullW;
    canvas.height = fullH;
    ctx.drawImage(sourceEl, 0, 0, sourceWidth, sourceHeight, 0, 0, fullW, fullH);

    imgData = ctx.getImageData(0, 0, fullW, fullH);
    qrCode = root.jsQR(imgData.data, fullW, fullH, { inversionAttempts: 'attemptBoth' });
    if (qrCode && qrCode.data) {
      const parsed = parseVaultlyPairingString(qrCode.data);
      if (parsed) return parsed;
    }

    return null;
  }

  /**
   * Real-time non-blocking QR frame decoding loop (~15 scans/sec while video plays at 60fps).
   */
  function scanVideoFrames(video, canvas, statusEl) {
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function scanStep() {
      if (!isScanningActive) return;

      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        try {
          const matchedPayload = await decodeSourceFrame(
            video,
            video.videoWidth,
            video.videoHeight,
            canvas,
            ctx
          );

          if (matchedPayload) {
            await handleSuccessfulScan(matchedPayload, statusEl);
            return;
          }
        } catch (err) {
          // Ignore transient frame decode errors
        }
      }

      if (isScanningActive) {
        activeScanTimerId = setTimeout(scanStep, 65);
      }
    }

    activeScanTimerId = setTimeout(scanStep, 65);
  }

  /**
   * Decodes a QR code from a user-selected image / screenshot file.
   */
  async function handleImageFileScan(file, canvas, statusEl) {
    if (!file || !canvas) return;
    if (statusEl) {
      statusEl.textContent = 'Analyzing image for QR code...';
      statusEl.style.color = 'var(--text-main)';
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const matched = await decodeSourceFrame(img, img.naturalWidth || img.width, img.naturalHeight || img.height, canvas, ctx);
        URL.revokeObjectURL(objectUrl);

        if (matched) {
          await handleSuccessfulScan(matched, statusEl);
        } else {
          if (statusEl) {
            statusEl.textContent = 'No valid Vaultly QR code found in image. Try closer crop or paste code below.';
            statusEl.style.color = 'var(--color-danger)';
          }
          showManualPasteOption();
        }
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        if (statusEl) {
          statusEl.textContent = 'Failed to read image: ' + err.message;
          statusEl.style.color = 'var(--color-danger)';
        }
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (statusEl) {
        statusEl.textContent = 'Could not load selected image file.';
        statusEl.style.color = 'var(--color-danger)';
      }
    };

    img.src = objectUrl;
  }

  /**
   * Processes a verified QR pairing payload.
   */
  async function handleSuccessfulScan(pairingData, statusEl) {
    stopCameraStream();

    // Visual lock-on indicator
    document.querySelectorAll('.scanner-corner').forEach(el => {
      el.style.borderColor = '#FFE500';
    });

    // Haptic feedback
    if (navigator.vibrate) {
      try { navigator.vibrate([80, 40, 120]); } catch (e) {}
    }

    if (statusEl) {
      statusEl.textContent = 'QR Code Verified! Syncing encrypted vault...';
      statusEl.style.color = '#00E599';
    }

    try {
      await window.vaultlyApi.loginWithPairingCode(pairingData);
      closeQrScannerModal();

      // Immediately transition directly to main home app screen
      if (typeof root.showScreen === 'function') {
        root.showScreen('app');
      } else {
        const loginScreen = document.getElementById('github-login-screen');
        const appRoot = document.getElementById('app-root');
        const mobBottomNav = document.getElementById('mobile-bottom-nav');
        if (loginScreen) loginScreen.style.display = 'none';
        if (appRoot) appRoot.style.display = 'flex';
        if (mobBottomNav) mobBottomNav.style.display = '';
      }

      // Reset bottom nav active state to "Vault" (passwords)
      updateMobileBottomNavAuth(true);
      document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
      const vaultNavBtn = document.getElementById('mob-nav-passwords');
      if (vaultNavBtn) vaultNavBtn.classList.add('active');

      // Ensure settings view is closed and password search/header is visible
      const settingsEl = document.getElementById('settings-view');
      const pageHeader = document.getElementById('page-header');
      const searchBox = document.querySelector('.search-box');
      if (settingsEl) settingsEl.style.display = 'none';
      if (pageHeader) pageHeader.style.display = '';
      if (searchBox) searchBox.style.display = '';

      if (typeof root.handleCategorySelect === 'function') {
        root.handleCategorySelect('all');
      }

      if (root.showToast) {
        root.showToast('Paired with PC successfully!', 'success');
      }

      // Refresh app view and entries immediately
      if (root.checkVaultState) {
        await root.checkVaultState();
      }
      if (root.refreshVaultData) {
        await root.refreshVaultData();
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Pairing failed: ${err.message}`;
        statusEl.style.color = 'var(--color-danger)';
      }
      showManualPasteOption();
    }
  }

  /**
   * Initializes all mobile UI controls, drawer, bottom nav, and scanner buttons.
   */
  function initMobileAndQR() {
    // 1. Mobile Menu Hamburger Toggle & Backdrop
    const btnMobileMenu = document.getElementById('btn-mobile-menu');
    const sidebar = document.querySelector('.sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    function toggleSidebar(forceState) {
      if (!sidebar) return;
      const isOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains('mobile-open');
      if (isOpen) {
        sidebar.classList.add('mobile-open');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
      } else {
        sidebar.classList.remove('mobile-open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      }
    }

    if (btnMobileMenu) {
      btnMobileMenu.addEventListener('click', () => toggleSidebar());
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));
    }

    // Close mobile sidebar when a navigation category is clicked
    const sidebarNav = document.getElementById('sidebar-nav');
    if (sidebarNav) {
      sidebarNav.addEventListener('click', (e) => {
        if (e.target.closest('.nav-item') && window.innerWidth <= 768) {
          toggleSidebar(false);
        }
      });
    }

    // 2. PC Mobile Link Buttons
    const btnTbMobilePair = document.getElementById('btn-tb-mobile-pair');
    if (btnTbMobilePair) {
      btnTbMobilePair.addEventListener('click', openMobilePairModal);
    }

    const btnNavMobilePair = document.getElementById('nav-btn-mobile-pair');
    if (btnNavMobilePair) {
      btnNavMobilePair.addEventListener('click', () => {
        toggleSidebar(false);
        openMobilePairModal();
      });
    }

    const btnClosePairModal = document.getElementById('btn-close-pair-modal');
    const btnPairDone = document.getElementById('btn-pair-done');
    if (btnClosePairModal) {
      btnClosePairModal.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMobilePairModal();
      });
    }
    if (btnPairDone) {
      btnPairDone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMobilePairModal();
      });
    }

    // Close modal when clicking backdrop
    const qrPairModal = document.getElementById('qr-pair-modal');
    if (qrPairModal) {
      qrPairModal.addEventListener('click', (e) => {
        if (e.target === qrPairModal) {
          closeMobilePairModal();
        }
      });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const pairModal = document.getElementById('qr-pair-modal');
        if (pairModal && (pairModal.classList.contains('open') || pairModal.style.display === 'flex')) {
          closeMobilePairModal();
        }
      }
    });

    // 3. Android QR Scanner Trigger Buttons
    const btnWelcomeEnlargeQr = document.getElementById('btn-welcome-enlarge-qr');
    if (btnWelcomeEnlargeQr) {
      btnWelcomeEnlargeQr.addEventListener('click', openMobilePairModal);
    }

    renderWelcomeLiveQr();

    const btnWelcomeScanQr = document.getElementById('btn-welcome-scan-qr');
    if (btnWelcomeScanQr) {
      btnWelcomeScanQr.addEventListener('click', openQrScannerModal);
    }

    const btnTbScanQr = document.getElementById('btn-tb-scan-qr');
    if (btnTbScanQr) {
      btnTbScanQr.addEventListener('click', openQrScannerModal);
    }

    const btnCloseScannerModal = document.getElementById('btn-close-scanner-modal');
    const btnCancelScanner = document.getElementById('btn-cancel-scanner');
    if (btnCloseScannerModal) btnCloseScannerModal.addEventListener('click', closeQrScannerModal);
    if (btnCancelScanner) btnCancelScanner.addEventListener('click', closeQrScannerModal);

    // Tap video viewport to re-trigger focus or toggle zoom
    const viewportWrapper = document.querySelector('.scanner-viewport-wrapper');
    if (viewportWrapper) {
      viewportWrapper.addEventListener('click', async () => {
        if (!activeVideoStream) return;
        const track = activeVideoStream.getVideoTracks()[0];
        await applyCameraTrackEnhancements(track);
      });
    }

    // Zoom 1x / 2x Toggle
    const btnZoom = document.getElementById('btn-scanner-zoom');
    if (btnZoom) {
      btnZoom.addEventListener('click', async () => {
        currentZoomLevel = currentZoomLevel === 1 ? 2 : 1;
        updateZoomButtonUI();
        if (activeVideoStream) {
          const track = activeVideoStream.getVideoTracks()[0];
          await applyCameraTrackEnhancements(track);
        }
      });
    }

    // Scan QR from Image / Screenshot
    const btnUploadImg = document.getElementById('btn-scanner-upload-img');
    const fileInput = document.getElementById('qr-scanner-file-input');
    if (btnUploadImg && fileInput) {
      btnUploadImg.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const canvas = document.getElementById('qr-scanner-canvas');
        const statusEl = document.getElementById('scanner-status');
        await handleImageFileScan(file, canvas, statusEl);
      });
    }

    // Switch Camera (Flip)
    const btnSwitchCam = document.getElementById('btn-scanner-switch-cam');
    if (btnSwitchCam) {
      btnSwitchCam.addEventListener('click', async () => {
        currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
        const video = document.getElementById('qr-scanner-video');
        const canvas = document.getElementById('qr-scanner-canvas');
        const statusEl = document.getElementById('scanner-status');
        await startCameraStream(video, canvas, statusEl);
      });
    }

    // Torch Toggle
    const btnTorch = document.getElementById('btn-scanner-torch');
    if (btnTorch) {
      btnTorch.addEventListener('click', async () => {
        if (!activeVideoStream) return;
        const track = activeVideoStream.getVideoTracks()[0];
        if (track && track.applyConstraints) {
          try {
            activeTorch = !activeTorch;
            await track.applyConstraints({
              advanced: [{ torch: activeTorch }]
            });
            btnTorch.style.background = activeTorch ? '#FFE500' : '';
            btnTorch.style.color = activeTorch ? '#121212' : '';
          } catch (e) {}
        }
      });
    }

    // Manual Pairing Toggle & Submit
    const btnToggleManual = document.getElementById('btn-toggle-manual-pairing');
    if (btnToggleManual) {
      btnToggleManual.addEventListener('click', () => {
        const container = document.getElementById('scanner-manual-container');
        if (container) {
          container.style.display = container.style.display === 'none' ? 'flex' : 'none';
        }
      });
    }

    const btnSubmitManual = document.getElementById('btn-submit-manual-pairing');
    if (btnSubmitManual) {
      btnSubmitManual.addEventListener('click', async () => {
        const input = document.getElementById('manual-pairing-input');
        const statusEl = document.getElementById('scanner-status');
        if (!input || !input.value.trim()) return;

        try {
          btnSubmitManual.disabled = true;
          btnSubmitManual.textContent = 'Connecting...';
          const parsed = parseVaultlyPairingString(input.value);
          if (!parsed) {
            throw new Error('Invalid pairing code format.');
          }
          await handleSuccessfulScan(parsed, statusEl);
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = `Invalid code: ${err.message}`;
            statusEl.style.color = 'var(--color-danger)';
          }
        } finally {
          btnSubmitManual.disabled = false;
          btnSubmitManual.textContent = 'Connect with Pairing Code';
        }
      });
    }

    // 4. Mobile Bottom Navigation Items
    const mobNavPasswords = document.getElementById('mob-nav-passwords');
    const mobNavFavorites = document.getElementById('mob-nav-favorites');
    const mobNavAdd = document.getElementById('mob-nav-add');
    const mobNavScan = document.getElementById('mob-nav-scan');
    const mobNavSettings = document.getElementById('mob-nav-settings');

    function updateBottomNavActive(activeId) {
      document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
      const activeEl = document.getElementById(activeId);
      if (activeEl) activeEl.classList.add('active');
    }

    if (mobNavPasswords) {
      mobNavPasswords.addEventListener('click', () => {
        updateBottomNavActive('mob-nav-passwords');
        const settingsEl = document.getElementById('settings-view');
        const pageHeader = document.getElementById('page-header');
        const cardsEl = document.getElementById('cards-container');
        const topBar = document.querySelector('.top-bar');
        const mobCatStrip = document.getElementById('mobile-category-strip');
        if (settingsEl) settingsEl.style.display = 'none';
        if (topBar) topBar.style.display = '';
        if (mobCatStrip) mobCatStrip.style.display = '';
        if (pageHeader) pageHeader.style.display = 'flex';
        if (cardsEl) cardsEl.style.display = '';
        if (root.handleCategorySelect) root.handleCategorySelect('all');
      });
    }

    if (mobNavFavorites) {
      mobNavFavorites.addEventListener('click', () => {
        updateBottomNavActive('mob-nav-favorites');
        const settingsEl = document.getElementById('settings-view');
        const pageHeader = document.getElementById('page-header');
        const cardsEl = document.getElementById('cards-container');
        const topBar = document.querySelector('.top-bar');
        const mobCatStrip = document.getElementById('mobile-category-strip');
        if (settingsEl) settingsEl.style.display = 'none';
        if (topBar) topBar.style.display = '';
        if (mobCatStrip) mobCatStrip.style.display = '';
        if (pageHeader) pageHeader.style.display = 'flex';
        if (cardsEl) cardsEl.style.display = '';
        if (root.handleCategorySelect) root.handleCategorySelect('favorites');
      });
    }

    if (mobNavAdd) {
      mobNavAdd.addEventListener('click', () => {
        const btnOpenAdd = document.getElementById('btn-open-add-modal');
        if (btnOpenAdd) btnOpenAdd.click();
      });
    }

    if (mobNavScan) {
      mobNavScan.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isAppScreenActive = Boolean(document.getElementById('screen-app')?.classList.contains('active'));
        const isUnlocked = Boolean(
          (window.state && window.state.vaultState === 'unlocked') ||
          isAppScreenActive
        );

        if (isUnlocked) {
          if (confirm('Log out and disconnect from Vaultly on this device?')) {
            try {
              if (window.vaultlyApi && window.vaultlyApi.disconnectGitHub) {
                await window.vaultlyApi.disconnectGitHub();
              }
              if (window.vaultlyApi && window.vaultlyApi.lockVault) {
                await window.vaultlyApi.lockVault();
              }
              try {
                localStorage.removeItem('vaultly_gh_token');
                localStorage.removeItem('vaultly_local_key');
                localStorage.removeItem('vaultly_encrypted_vault');
                const rawSettings = localStorage.getItem('vaultly_settings');
                if (rawSettings) {
                  const parsed = JSON.parse(rawSettings);
                  parsed.hasGitHubToken = false;
                  parsed.mode = 'unconfigured';
                  if (parsed.github) {
                    parsed.github.owner = '';
                    parsed.github.repo = '';
                    parsed.github.user = null;
                    parsed.github.lastSyncStatus = 'not_configured';
                    parsed.github.pairedViaQr = false;
                  }
                  localStorage.setItem('vaultly_settings', JSON.stringify(parsed));
                }
              } catch (_) {}

              if (window.state) {
                window.state.vaultState = 'locked';
                window.state.entries = [];
                window.state.selectedEntry = null;
              }

              updateMobileBottomNavAuth(false);

              if (typeof root.showToast === 'function') {
                root.showToast('Logged out successfully', 'info');
              }

              if (typeof window.checkVaultState === 'function') {
                await window.checkVaultState();
              } else {
                window.location.reload();
              }
            } catch (err) {
              alert('Logout error: ' + err.message);
            }
          }
        } else {
          openQrScannerModal();
        }
      });
    }

    if (mobNavSettings) {
      mobNavSettings.addEventListener('click', () => {
        updateBottomNavActive('mob-nav-settings');
        const btnSettings = document.getElementById('nav-btn-settings');
        if (btnSettings) btnSettings.click();
      });
    }

    // Initialize bottom nav auth state
    const isInitialUnlocked = Boolean(
      (window.state && window.state.vaultState === 'unlocked') ||
      document.getElementById('screen-app')?.classList.contains('active')
    );
    updateMobileBottomNavAuth(isInitialUnlocked);
  }

  function updateMobileBottomNavAuth(isLoggedIn) {
    const navScanBtn = document.getElementById('mob-nav-scan');
    if (!navScanBtn) return;
    if (isLoggedIn) {
      navScanBtn.title = 'Log Out of Vaultly';
      navScanBtn.setAttribute('aria-label', 'Log Out');
      navScanBtn.innerHTML = `
        <span class="mob-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
        <span class="mob-label">Logout</span>
      `;
    } else {
      navScanBtn.title = 'Scan PC QR';
      navScanBtn.setAttribute('aria-label', 'Scan PC QR');
      navScanBtn.innerHTML = `
        <span class="mob-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></span>
        <span class="mob-label">Scan PC</span>
      `;
    }
  }

  /**
   * Android Hardware Back Button Handler.
   * Dismisses open modals, drawers, or views in sequence before allowing app minimize.
   */
  function handleAndroidBackPress() {
    // 1. QR Scanner modal
    const scannerModal = document.getElementById('qr-scanner-modal');
    if (scannerModal && scannerModal.classList.contains('open')) {
      closeQrScannerModal();
      return true;
    }

    // 2. Mobile QR Pair modal
    const pairModal = document.getElementById('qr-pair-modal');
    if (pairModal && pairModal.classList.contains('open')) {
      closeMobilePairModal();
      return true;
    }

    // 3. Open modal dialog backdrops
    const openModals = Array.from(document.querySelectorAll('.modal-backdrop.open'));
    if (openModals.length > 0) {
      const topModal = openModals[openModals.length - 1];
      topModal.classList.remove('open');
      return true;
    }

    // 4. Details drawer
    const drawer = document.getElementById('details-drawer');
    if (drawer && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
      return true;
    }

    // 5. Mobile sidebar drawer
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      return true;
    }

    // 6. Settings view open -> navigate back to vault entries
    const settingsView = document.getElementById('settings-view');
    if (settingsView && settingsView.style.display !== 'none') {
      const mobNavPasswords = document.getElementById('mob-nav-passwords');
      if (mobNavPasswords) {
        mobNavPasswords.click();
        return true;
      }
    }

    // 7. Search input query active -> clear search
    const searchInput = document.getElementById('global-search-input');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      return true;
    }

    return false;
  }

  root.openMobilePairModal = openMobilePairModal;
  root.renderWelcomeLiveQr = renderWelcomeLiveQr;
  root.openQrScannerModal = openQrScannerModal;
  root.handleAndroidBackPress = handleAndroidBackPress;
  root.updateMobileBottomNavAuth = updateMobileBottomNavAuth;
  root.initMobileAndQR = initMobileAndQR;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileAndQR);
  } else {
    initMobileAndQR();
  }
})(typeof window !== 'undefined' ? window : global);

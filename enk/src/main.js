const { app, BrowserWindow, desktopCapturer, ipcMain, Notification, screen, systemPreferences, net } = require('electron');
const path = require('path');
const Store = require('electron-store').default;

const store = new Store({
  name: 'enk-config',
  schema: {
    apiKey: { type: 'string', default: '' },
    enabled: { type: 'boolean', default: true },
    firstLaunch: { type: 'boolean', default: true }
  },
  encryptionKey: 'enk-secure-storage-key-v1'
});

let mainWindow = null;
let overlayWindow = null;
let settingsWindow = null;
let analysisTimer = null;
let isAnalyzing = false;
let tesseractWorker = null;

// Track per-screen state for change detection — store raw pixel samples
const previousScreens = {};

// Track per-screen last sent text to avoid sending duplicate content
const previousTexts = {};

// Track active alert timeout so we don't flicker
let alertTimeout = null;

// ─── Privacy scrubbing ───────────────────────────────────────────
function scrubSensitiveData(text) {
  let scrubbed = text.replace(/\b(\d[ -]?){13,19}\b/g, '[CARD REDACTED]');
  scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN REDACTED]');
  scrubbed = scrubbed.replace(/(password|passwd|pwd|passcode)\s*[:=]?\s*\S+/gi, '$1: [REDACTED]');
  scrubbed = scrubbed.replace(/\b(sk-[a-zA-Z0-9_-]{20,})\b/g, '[API KEY REDACTED]');
  scrubbed = scrubbed.replace(/(secret|token|key)\s*[:=]?\s*\S+/gi, '$1: [REDACTED]');
  return scrubbed;
}

// ─── Text similarity (cheap check to skip duplicate API calls) ───
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  // Normalize whitespace and compare
  const na = a.replace(/\s+/g, ' ').trim();
  const nb = b.replace(/\s+/g, ' ').trim();
  if (na === nb) return 1;

  // Simple character-level overlap ratio
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  if (longer.length === 0) return 1;

  // Count matching characters in order (LCS-lite via sliding window)
  let matches = 0;
  let searchStart = 0;
  for (let i = 0; i < shorter.length; i++) {
    const idx = longer.indexOf(shorter[i], searchStart);
    if (idx !== -1) {
      matches++;
      searchStart = idx + 1;
    }
  }
  return matches / longer.length;
}

// ─── Change detection (sample raw pixels, 25% threshold) ────────
function hasScreenChanged(screenId, nativeImage) {
  const bmp = nativeImage.toBitmap();
  const size = nativeImage.getSize();
  const totalPixels = size.width * size.height;

  const sampleCount = 500;
  const step = Math.max(1, Math.floor(totalPixels / sampleCount));
  const samples = Buffer.alloc(sampleCount * 3);

  for (let i = 0; i < sampleCount; i++) {
    const pixelIndex = i * step;
    const byteOffset = pixelIndex * 4; // BGRA format
    if (byteOffset + 2 < bmp.length) {
      samples[i * 3] = bmp[byteOffset];
      samples[i * 3 + 1] = bmp[byteOffset + 1];
      samples[i * 3 + 2] = bmp[byteOffset + 2];
    }
  }

  const prev = previousScreens[screenId];
  previousScreens[screenId] = samples;

  if (!prev) return true;

  let diffCount = 0;
  for (let i = 0; i < sampleCount * 3; i += 3) {
    const dr = Math.abs(samples[i] - prev[i]);
    const dg = Math.abs(samples[i + 1] - prev[i + 1]);
    const db = Math.abs(samples[i + 2] - prev[i + 2]);
    if (dr + dg + db > 30) diffCount++;
  }

  const diffPercent = (diffCount / sampleCount) * 100;
  return diffPercent > 25;
}

// ─── Tesseract OCR (runs in main process) ────────────────────────
async function initTesseract() {
  const Tesseract = require('tesseract.js');
  tesseractWorker = await Tesseract.createWorker('eng');
  console.log('[Enk] Tesseract worker initialized');
}

async function runOCR(pngBuffer) {
  if (!tesseractWorker) await initTesseract();
  const result = await tesseractWorker.recognize(pngBuffer);
  return {
    text: result.data.text,
    confidence: result.data.confidence
  };
}

// ─── Claude API ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a scam detection system analyzing text extracted from a user's screen. Determine if anything dangerous is happening. Flag the following: remote access software open (AnyDesk, TeamViewer, UltraViewer), fake Microsoft/Apple/IRS/Social Security support interfaces, anyone asking for gift cards, wire transfers, or cryptocurrency as payment, urgent language about viruses or account suspension, fake login pages or phishing sites, unusual pop-ups demanding immediate action. Respond in JSON: {"flagged": true/false, "risk_level": "low/medium/high", "reason": "brief plain English explanation"}`;

async function analyzeWithClaude(scrubbedText, base64Screenshot, lowConfidence) {
  const apiKey = store.get('apiKey');
  if (!apiKey) return null;

  const content = [];

  if (lowConfidence && base64Screenshot) {
    // Downscale to 960x540 before sending to save tokens
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: base64Screenshot }
    });
    content.push({
      type: 'text',
      text: 'Analyze this screenshot for scams or dangerous situations. OCR was low confidence, so please read the screen directly. Any text we could extract: ' + (scrubbedText || '(none)')
    });
  } else {
    content.push({
      type: 'text',
      text: 'Analyze the following text extracted from a user\'s screen for scams or dangerous activity:\n\n' + scrubbedText
    });
  }

  const body = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }]
  });

  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages'
    });
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('x-api-key', apiKey);
    request.setHeader('anthropic-version', '2023-06-01');

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => { responseData += chunk.toString(); });
      response.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          if (data.error) {
            console.error('[Enk] API error:', data.error);
            resolve(null);
            return;
          }
          const text = data.content?.[0]?.text;
          if (!text) { resolve(null); return; }
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            resolve(null);
          }
        } catch (e) {
          console.error('[Enk] Failed to parse response:', e.message);
          resolve(null);
        }
      });
    });

    request.on('error', (err) => {
      console.error('[Enk] Request error:', err.message);
      resolve(null);
    });

    request.write(body);
    request.end();
  });
}

// ─── Screen capture (all screens, downscaled to 960x540) ────────
async function captureAllScreens() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 960, height: 540 }
    });
    if (sources.length === 0) return [];
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      nativeImage: source.thumbnail
    }));
  } catch (err) {
    console.error('[Enk] Screen capture failed:', err.message);
    return [];
  }
}

// ─── Main analysis loop ──────────────────────────────────────────
function updateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', status);
  }
}

async function analyzeLoop() {
  if (!store.get('enabled') || !store.get('apiKey')) {
    updateStatus('inactive');
    return;
  }

  if (isAnalyzing) return;
  isAnalyzing = true;

  try {
    const screens = await captureAllScreens();
    if (screens.length === 0) { isAnalyzing = false; return; }

    // Check which screens actually changed (pixel comparison, 25% threshold)
    const changedScreens = screens.filter(s => hasScreenChanged(s.id, s.nativeImage));

    if (changedScreens.length === 0) {
      isAnalyzing = false;
      return;
    }

    updateStatus('processing');

    let threatFound = false;
    for (const screenCapture of changedScreens) {
      const pngBuffer = screenCapture.nativeImage.toPNG();

      console.log(`[Enk] Screen "${screenCapture.name}" changed, running OCR...`);
      const ocr = await runOCR(pngBuffer);
      const lowConfidence = ocr.confidence < 70;
      console.log(`[Enk] OCR done (${screenCapture.name}). Confidence: ${ocr.confidence.toFixed(1)}%, text length: ${ocr.text.length}`);

      const scrubbedText = scrubSensitiveData(ocr.text);

      // Skip if too little text and confidence is OK
      if (!lowConfidence && scrubbedText.trim().length < 20) {
        console.log(`[Enk] Too little text on "${screenCapture.name}", skipping`);
        continue;
      }

      // Skip if the text is nearly identical to what we last sent for this screen
      const prevText = previousTexts[screenCapture.id];
      const similarity = textSimilarity(scrubbedText, prevText);
      if (similarity > 0.85) {
        console.log(`[Enk] Text ${(similarity * 100).toFixed(0)}% similar to last send, skipping API call`);
        continue;
      }
      previousTexts[screenCapture.id] = scrubbedText;

      const base64Data = pngBuffer.toString('base64');
      console.log(`[Enk] Sending "${screenCapture.name}" to Claude...`);
      const result = await analyzeWithClaude(scrubbedText, base64Data, lowConfidence);
      console.log(`[Enk] Result (${screenCapture.name}):`, JSON.stringify(result));

      if (result && result.flagged) {
        threatFound = true;
        showScamAlert(result);
      }
    }

    if (threatFound) {
      updateStatus('threat');
    } else {
      updateStatus('active');
    }
  } catch (err) {
    console.error('[Enk] Analysis error:', err);
    updateStatus('active');
  }

  isAnalyzing = false;
}

function showScamAlert(data) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: '⚠️ Possible Scam Detected',
      body: data.reason,
      urgency: 'critical'
    });
    notification.show();
  }

  if (alertTimeout) {
    clearTimeout(alertTimeout);
    alertTimeout = null;
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('show-alert', data);
    overlayWindow.showInactive();

    alertTimeout = setTimeout(() => {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('hide-alert');
      }
      updateStatus('active');
      alertTimeout = null;
    }, 15000);
  }
}

// ─── Monitoring control ──────────────────────────────────────────
function startMonitoring() {
  if (analysisTimer) return;
  if (!store.get('apiKey') || !store.get('enabled')) return;
  console.log('[Enk] Starting monitoring loop (5s interval)');
  updateStatus('active');
  analyzeLoop();
  analysisTimer = setInterval(analyzeLoop, 5000);
}

function stopMonitoring() {
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
  }
  updateStatus('inactive');
  console.log('[Enk] Monitoring stopped');
}

// ─── Windows ─────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 72,
    height: 72,
    x: screen.getPrimaryDisplay().workAreaSize.width - 90,
    y: screen.getPrimaryDisplay().workAreaSize.height - 90,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'ui', 'indicator.html'));
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
    width: width,
    height: 100,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    visibleOnAllWorkspaces: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  overlayWindow.loadFile(path.join(__dirname, 'ui', 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.showInactive();
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 580,
    frame: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── IPC Handlers ────────────────────────────────────────────────
ipcMain.handle('get-settings', () => ({
  apiKey: store.get('apiKey'),
  enabled: store.get('enabled'),
  firstLaunch: store.get('firstLaunch')
}));

ipcMain.handle('save-settings', (_, settings) => {
  if (settings.apiKey !== undefined) store.set('apiKey', settings.apiKey);
  if (settings.enabled !== undefined) store.set('enabled', settings.enabled);
  if (settings.firstLaunch !== undefined) store.set('firstLaunch', settings.firstLaunch);

  if (settings.enabled === false) {
    stopMonitoring();
  } else if (settings.enabled === true && store.get('apiKey')) {
    startMonitoring();
  }
  return true;
});

ipcMain.handle('get-api-key', () => store.get('apiKey'));
ipcMain.on('open-settings', () => createSettingsWindow());

// ─── App lifecycle ───────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen');
    console.log('[Enk] Screen recording permission:', status);
  }

  createMainWindow();
  createOverlayWindow();

  if (store.get('firstLaunch') || !store.get('apiKey')) {
    createSettingsWindow();
  }

  console.log('[Enk] Initializing Tesseract...');
  try {
    await initTesseract();
  } catch (err) {
    console.error('[Enk] Tesseract init failed:', err);
  }

  if (store.get('apiKey') && store.get('enabled')) {
    startMonitoring();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

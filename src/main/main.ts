import { app, safeStorage, BrowserWindow, ipcMain, shell, Menu, globalShortcut, session, dialog, Notification, screen, Tray, nativeImage } from 'electron';
import {
  initUpdater,
  isUpdateInstallInProgress,
  hasPendingUpdate,
  notifyPendingUpdate,
  performUpdateCheck,
  triggerStartupUpdateCheck,
} from './updater';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import zlib from 'zlib';
import readline from 'readline';
import { PSTFile, PSTFolder, PSTMessage } from 'pst-extractor';
import { MailService, MailServerConfig, ImapServerAction } from './services/mailService';
import { ImapIdleService } from './services/imapIdleService';
import {
  applyMarkOfTheWeb,
  BLOCKED_ATTACHMENT_EXTENSIONS,
  isDisguisedExecutable,
  readFileHead,
} from './services/attachmentSafety';
import { SearchIndexService } from './services/searchIndexService';
import { MailStore, StoreUpsertRecord } from './services/mailStore';
import { discoverMailSettings } from './services/accountDiscovery';
import { testAccount } from './services/connectionTest';
import { implicitTls } from './services/mailSecurity';
import { importIntoAccount } from './services/mailImport';
import { AIAssistantService } from './services/aiAssistantService';
import { EmlExporterService } from './services/emlExporterService';
import { OAuthService, OAuthProvider } from './services/oauthService';
import { CloudSyncService } from './services/cloudSyncService';
import { PgpService } from './services/pgpService';
import { SmimeService } from './services/smimeService';
import { TranslateService } from './services/translateService';
import { simpleParser } from 'mailparser';
import { ensureTlsTrust } from './services/tlsTrust';
import {
  getDataStorageDir,
  getDefaultUserDataDir,
  getStorageConfigPath,
} from './services/storagePath';

// Evita que quedas transitórias de socket TLS (ex: ECONNRESET em conexões IMAP/POP3)
// exibam a caixa de diálogo fatal "A JavaScript error occurred in the main process".
process.on('uncaughtException', (err: any) => {
  const code = err?.code || '';
  const msg = err?.message || String(err);
  if (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    code === 'ENOTFOUND' ||
    msg.includes('ECONNRESET')
  ) {
    console.warn(`[MAIN] Erro transitório de rede/socket interceptado (${code || 'network'}):`, msg);
    return;
  }
  console.error('[MAIN] Uncaught Exception interceptado:', err);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn('[MAIN] Unhandled Rejection interceptado:', reason?.message || reason);
});

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let splashShownAt = 0;
const SPLASH_MIN_DURATION_MS = 4800;
let quickComposeWindow: BrowserWindow | null = null;
let notifierWindow: BrowserWindow | null = null;
let notifierTimeout: NodeJS.Timeout | null = null;
let lastNotifierData: any = null;
let blockedTrackersCount = 0;
let isClosingAfterSync = false;
let closeSafetyTimer: NodeJS.Timeout | null = null;

const MIN_ZOOM_FACTOR = 0.7;
const MAX_ZOOM_FACTOR = 1.5;
const ZOOM_STEP = 0.1;
const zoomPrefsFile = () => path.join(app.getPath('userData'), 'zoom.json');

/** Zoom de quem instala o app pela primeira vez. */
const NEW_INSTALL_ZOOM_FACTOR = 0.9;
/** Zoom que o app sempre usou antes (mantido para quem já usava e nunca mexeu no zoom). */
const LEGACY_ZOOM_FACTOR = 1.0;

function saveMainZoom(factor: number): void {
  try {
    fs.writeFileSync(zoomPrefsFile(), JSON.stringify({ factor }));
  } catch {}
}

/**
 * Zoom inicial da janela principal:
 * 1) zoom salvo pelo usuário (Ctrl + / Ctrl - / botões da barra) → mantém;
 * 2) sem zoom salvo, mas o app já tem dados (configurações ou instalação concluída) → usuário antigo, 100%;
 * 3) sem nada → instalação nova, 90%.
 * A decisão é salva na primeira vez, e depois vale sempre o que o usuário escolher.
 */
function loadSavedMainZoom(): number {
  try {
    const v = Number(JSON.parse(fs.readFileSync(zoomPrefsFile(), 'utf8'))?.factor);
    if (Number.isFinite(v)) return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, v));
  } catch {}
  const isExistingUser = [getSettingsFilePath(), getSetupStateFilePath()].some((f) => {
    try {
      return fs.existsSync(f);
    } catch {
      return false;
    }
  });
  const initial = isExistingUser ? LEGACY_ZOOM_FACTOR : NEW_INSTALL_ZOOM_FACTOR;
  saveMainZoom(initial);
  return initial;
}
let mainZoomFactor = 1.0;
let mainZoomLoaded = false;

/**
 * Applies a clamped zoom factor to the main window and remembers it (cada usuário mantém o seu zoom).
 */
function applyMainZoom(factor: number): void {
  const clamped = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, factor));
  mainZoomFactor = Math.round(clamped * 100) / 100;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(mainZoomFactor);
    // Atualiza o controle de zoom da barra superior (botões e Ctrl + / Ctrl -)
    mainWindow.webContents.send('zoom:changed', mainZoomFactor);
  }
  saveMainZoom(mainZoomFactor);
}

/**
 * Prevents accidental pinch/Ctrl+wheel zoom and resets persisted Chromium zoom on load.
 */
function configureZoomProtection(win: BrowserWindow, isMain = false): void {
  if (isMain && !mainZoomLoaded) {
    mainZoomLoaded = true;
    mainZoomFactor = loadSavedMainZoom();
  }
  const targetZoom = () => (isMain ? mainZoomFactor : 1.0);

  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  win.webContents.setZoomLevel(0);
  win.webContents.setZoomFactor(targetZoom());

  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed()) return;
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    win.webContents.setZoomLevel(0);
    win.webContents.setZoomFactor(targetZoom());
  });

  win.webContents.on('zoom-changed', () => {
    if (win.isDestroyed()) return;
    win.webContents.setZoomLevel(0);
    win.webContents.setZoomFactor(targetZoom());
  });

  // Janela principal: Ctrl + / Ctrl - aumentam/diminuem o zoom (passos de 10%) e Ctrl 0 volta a 100%.
  // Demais janelas: atalhos de zoom bloqueados (Ctrl 0 restaura 100%).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.control || input.meta) && !input.alt) {
      const zoomIn = input.key === '+' || input.key === '=' || input.code === 'NumpadAdd';
      const zoomOut = input.key === '-' || input.key === '_' || input.code === 'NumpadSubtract';
      if (input.key === '0' || input.code === 'Numpad0') {
        event.preventDefault();
        if (isMain) applyMainZoom(1.0);
        else win.webContents.setZoomFactor(1.0);
      } else if (zoomIn || zoomOut) {
        event.preventDefault();
        if (isMain) applyMainZoom(mainZoomFactor + (zoomIn ? ZOOM_STEP : -ZOOM_STEP));
      }
    }
  });
}

const TRACKER_DOMAINS = [
  'mailtrack.io',
  'mixmax.com',
  'doubleclick.net',
  'pixel.wp.com',
  'hubspot.com',
  'hs-scripts.com',
  'google-analytics.com',
  'mandrillapp.com',
  'sendgrid.net',
  'pstmrk.it',
  'bananatag.com',
  'yesware.com',
  'superhuman.com',
  'list-manage.com',
  'cmail19.com',
  'cmail20.com',
];

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  const iconCandidate = path.join(process.resourcesPath, 'icon.ico');
  const iconPath = fs.existsSync(iconCandidate)
    ? iconCandidate
    : path.join(__dirname, '../../build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Anectta MAIL - Corporate Desktop',
    backgroundColor: '#070d18',
    show: false,
    center: true,
    frame: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
      webviewTag: true,
    },
  });

  // Safe navigation & new-window opening: NUNCA permite que a janela principal navegue para fora do Anectta MAIL
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocalApp =
      url.startsWith('file://') ||
      (isDev && url.startsWith('http://localhost:5173'));
    if (!isLocalApp) {
      event.preventDefault();
      if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.webContents.on('will-redirect', (event, url) => {
    const isLocalApp =
      url.startsWith('file://') ||
      (isDev && url.startsWith('http://localhost:5173'));
    if (!isLocalApp) {
      event.preventDefault();
    }
  });

  // Segurança de <webview>: remove privilégios e só permite destinos https conhecidos
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete (webPreferences as any).preload;
    delete (webPreferences as any).preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    (params as any).allowpopups = 'false';

    let allowed = false;
    try {
      const u = new URL(params.src || '');
      if (u.protocol === 'https:') {
        allowed =
          params.partition === 'persist:whatsapp'
            ? /(^|\.)whatsapp\.(com|net)$/i.test(u.hostname)
            : !params.partition ||
              !params.partition.startsWith('persist:') ||
              /^persist:webapp-[a-z0-9._-]+$/i.test(params.partition);
      }
    } catch {
      allowed = false;
    }
    if (!allowed) {
      console.warn('[MAIN] <webview> bloqueado:', params.src, params.partition);
      event.preventDefault();
    }
  });

  configureZoomProtection(mainWindow, true);

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] Page finished loading successfully!');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[MAIN] Failed to load URL:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[RENDERER ${level}] ${message} (${sourceId}:${line})`);
  });

  // Gracefully show window when ready (after splash minimum duration if splash is active)
  mainWindow.once('ready-to-show', () => {
    closeSplashAndShowMain();
  });

  const indexPath = path.join(app.getAppPath(), 'dist/index.html');
  console.log('[MAIN] Loading index file:', indexPath);
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('[MAIN] loadFile error:', err);
    mainWindow?.loadURL('http://localhost:5173');
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      requestGracefulClose();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createSplashWindow(): void {
  if (splashWindow && !splashWindow.isDestroyed()) return;

  const iconCandidate = path.join(process.resourcesPath, 'icon.ico');
  const iconPath = fs.existsSync(iconCandidate)
    ? iconCandidate
    : path.join(__dirname, '../../build/icon.ico');

  splashShownAt = Date.now();
  splashWindow = new BrowserWindow({
    width: 540,
    height: 360,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#091322',
    title: 'Anectta MAIL',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const indexPath = path.join(app.getAppPath(), 'dist/index.html');
  splashWindow.loadURL(`${pathToFileURL(indexPath).href}#splash`).catch(() => {
    splashWindow?.loadURL('http://localhost:5173#splash');
  });

  configureZoomProtection(splashWindow, false);

  splashWindow.once('ready-to-show', () => {
    splashShownAt = Date.now();
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function closeSplashAndShowMain(): void {
  const revealMain = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.maximize();
      mainWindow.show();
      mainWindow.focus();
      notifyPendingUpdate();
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  };

  if (!splashWindow || splashWindow.isDestroyed()) {
    revealMain();
    return;
  }

  const elapsed = Date.now() - splashShownAt;
  const remaining = Math.max(0, SPLASH_MIN_DURATION_MS - elapsed);
  setTimeout(revealMain, remaining);
}

function finalizeQuit(): void {
  if (closeSafetyTimer) {
    clearTimeout(closeSafetyTimer);
    closeSafetyTimer = null;
  }
  isQuitting = true;
  isClosingAfterSync = true;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
    splashWindow = null;
  }
  if (quickComposeWindow && !quickComposeWindow.isDestroyed()) {
    quickComposeWindow.destroy();
    quickComposeWindow = null;
  }
  if (notifierWindow && !notifierWindow.isDestroyed()) {
    notifierWindow.destroy();
    notifierWindow = null;
  }
  if (systemTray && !systemTray.isDestroyed()) {
    systemTray.destroy();
    systemTray = null;
  }
  app.quit();
}

function requestGracefulClose(): void {
  if (isQuitting || isClosingAfterSync) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    finalizeQuit();
    return;
  }
  isClosingAfterSync = true;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('app:prepare-close');

  if (closeSafetyTimer) clearTimeout(closeSafetyTimer);
  closeSafetyTimer = setTimeout(() => {
    console.warn('[MAIN] Timeout ao aguardar envio/recebimento no fechamento. Encerrando...');
    finalizeQuit();
  }, 20000);
}

let systemTray: Tray | null = null;
let isQuitting = false;
let minimizeToTray = true;

function resolveTrayIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'logo.png'),
    path.join(app.getAppPath(), 'public', 'logo.png'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return '';
}

function createSystemTray(): void {
  if (systemTray) return;
  try {
    const iconPath = resolveTrayIconPath();
    const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    systemTray = new Tray(img);
    systemTray.setToolTip('Anectta MAIL');

    const restoreMainWindow = () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createSystemTray();
        createWindow();
        return;
      }
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    };

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Anectta MAIL',
        click: restoreMainWindow,
      },
      {
        label: 'Novo E-mail (Rápido)',
        click: () => toggleQuickComposeWindow(),
      },
      { type: 'separator' },
      {
        label: 'Sair do Anectta MAIL',
        click: () => {
          requestGracefulClose();
        },
      },
    ]);

    systemTray.setContextMenu(contextMenu);
    systemTray.on('click', restoreMainWindow);
    systemTray.on('double-click', restoreMainWindow);
  } catch (err: any) {
    console.warn('[MAIN] Não foi possível inicializar System Tray:', err?.message);
  }
}

/**
 * Cria a janela flutuante de Quick Compose Global (estilo Spotlight / Raycast)
 */
function createQuickComposeWindow(): void {
  if (quickComposeWindow) {
    if (quickComposeWindow.isMinimized()) quickComposeWindow.restore();
    quickComposeWindow.show();
    quickComposeWindow.focus();
    return;
  }

  const iconCandidate = path.join(process.resourcesPath, 'icon.ico');
  const iconPath = fs.existsSync(iconCandidate)
    ? iconCandidate
    : path.join(__dirname, '../../build/icon.ico');

  quickComposeWindow = new BrowserWindow({
    width: 680,
    height: 520,
    minWidth: 500,
    minHeight: 400,
    title: 'Anectta MAIL - Quick Compose',
    backgroundColor: '#070d18',
    show: false,
    center: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const indexPath = path.join(app.getAppPath(), 'dist/index.html');
  quickComposeWindow.loadURL(`${pathToFileURL(indexPath).href}#quick-compose`).catch(() => {
    quickComposeWindow?.loadURL('http://localhost:5173#quick-compose');
  });

  configureZoomProtection(quickComposeWindow, false);

  quickComposeWindow.once('ready-to-show', () => {
    if (quickComposeWindow) {
      quickComposeWindow.show();
      quickComposeWindow.focus();
    }
  });

  quickComposeWindow.on('blur', () => {
    // Opcional: mantem ou oculta dependendo do foco
  });

  quickComposeWindow.on('closed', () => {
    quickComposeWindow = null;
  });
}

function toggleQuickComposeWindow(): void {
  if (quickComposeWindow && quickComposeWindow.isVisible()) {
    quickComposeWindow.hide();
  } else {
    createQuickComposeWindow();
  }
}

// IPC Handlers para Quick Compose
ipcMain.on('quick-compose:open', () => {
  createQuickComposeWindow();
});

ipcMain.on('quick-compose:close', () => {
  if (quickComposeWindow) {
    quickComposeWindow.close();
  }
});

/**
 * Cria ou exibe a janela flutuante secundária de notificação ('Notifier')
 * Sem bordas (frame: false), transparente (transparent: true), sempre no topo (alwaysOnTop: true)
 * e posicionada no canto inferior direito da tela com animação e auto-fechamento.
 */
function showNotifierWindow(emailData: {
  id: string;
  sender: string;
  senderEmail?: string;
  subject: string;
  snippet?: string;
  avatar?: string;
}): void {
  lastNotifierData = emailData;

  // Detecta o monitor ativo onde a janela principal está localizada para posicionamento ideal
  const targetDisplay =
    mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = targetDisplay.workArea;

  const notifWidth = 390;
  const notifHeight = 110;
  const posX = Math.round(screenX + screenWidth - notifWidth - 24);
  const posY = Math.round(screenY + screenHeight - notifHeight - 24);

  if (!notifierWindow || notifierWindow.isDestroyed()) {
    notifierWindow = new BrowserWindow({
      width: notifWidth,
      height: notifHeight,
      x: posX,
      y: posY,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    const indexPath = path.join(app.getAppPath(), 'dist/index.html');
    notifierWindow.loadURL(`${pathToFileURL(indexPath).href}#notifier`).catch(() => {
      notifierWindow?.loadURL('http://localhost:5173#notifier');
    });

    configureZoomProtection(notifierWindow, false);

    notifierWindow.webContents.on('did-finish-load', () => {
      notifierWindow?.webContents.send('notifier:data', lastNotifierData);
    });

    notifierWindow.on('closed', () => {
      notifierWindow = null;
    });

    // Primeira vez: só mostra quando o conteúdo estiver pronto (janela transparente aberta antes
    // de carregar pode ficar invisível); garante exibição mesmo se o evento não vier
    const win = notifierWindow;
    let shown = false;
    const reveal = () => {
      if (shown || win.isDestroyed()) return;
      shown = true;
      win.setAlwaysOnTop(true, 'screen-saver');
      win.showInactive();
    };
    win.once('ready-to-show', reveal);
    setTimeout(reveal, 1500);
  } else {
    notifierWindow.setPosition(posX, posY);
    notifierWindow.webContents.send('notifier:data', lastNotifierData);
    notifierWindow.setAlwaysOnTop(true, 'screen-saver');
    notifierWindow.showInactive();
  }

  if (notifierTimeout) clearTimeout(notifierTimeout);
  notifierTimeout = setTimeout(() => {
    if (notifierWindow && !notifierWindow.isDestroyed()) {
      notifierWindow.hide();
    }
  }, 6500);
}

// IPC Handlers para Notifier Window
ipcMain.handle('notifier:show', (_event, emailData: any) => {
  showNotifierWindow(emailData);
  return true;
});

ipcMain.on('notifier:close', () => {
  if (notifierWindow && !notifierWindow.isDestroyed()) {
    notifierWindow.hide();
  }
});

ipcMain.on('notifier:click', (_event, emailId: string) => {
  if (notifierWindow && !notifierWindow.isDestroyed()) {
    notifierWindow.hide();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (emailId) {
      mainWindow.webContents.send('notification:email-clicked', emailId);
    }
  }
});

ipcMain.handle('notifier:get-latest', () => {
  return lastNotifierData;
});

// IPC Handlers for window management
ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

// Controle de zoom e tela cheia da barra superior
ipcMain.handle('zoom:get', () => mainZoomFactor);
ipcMain.handle('zoom:set', (_event, factor: number) => {
  if (Number.isFinite(factor)) applyMainZoom(factor);
  return mainZoomFactor;
});
ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const next = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(next);
  return next;
});
ipcMain.handle('window:is-fullscreen', () => Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isFullScreen()));

ipcMain.on('app:confirm-close', () => {
  finalizeQuit();
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

// Real Email Service IPC Handlers (Supports both IMAP and POP3)
function getAnecttaStorageDir(): string {
  const docsDir = app.getPath('documents');
  const storageDir = path.join(docsDir, 'Arquivos do Anectta MAIL');
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
}

function sanitizeEmailForFilename(email: string): string {
  const clean = (email || 'conta-padrao@anectta.com.br')
    .trim()
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  return clean || 'conta-padrao@anectta.com.br';
}

function getAccountDataPaths(accountEmail: string) {
  const folderPath = getAnecttaStorageDir();
  const baseName = sanitizeEmailForFilename(accountEmail);
  const pstFilePath = path.join(folderPath, `${baseName}.pst`);
  const mboxFilePath = path.join(folderPath, `${baseName}.mbox`);
  return { folderPath, pstFilePath, mboxFilePath };
}

function buildMboxContent(emails: any[]): string {
  return (emails || [])
    .map((m) => {
      const fromAddr = m.senderEmail || 'no-reply@anectta.com.br';
      const dateStr = m.dateStr ? new Date(m.dateStr).toUTCString() : new Date().toUTCString();
      const bodyLines = String(m.body || '').replace(/^From /gm, '>From ');
      return [
        `From ${fromAddr} ${new Date().toDateString()}`,
        `From: "${m.sender || fromAddr}" <${fromAddr}>`,
        `To: ${m.recipient || ''}`,
        `Subject: ${m.subject || '(Sem Assunto)'}`,
        `Date: ${dateStr}`,
        `X-Anectta-Folder: ${m.folder || 'inbox'}`,
        `X-Anectta-Id: ${m.id || ''}`,
        '',
        bodyLines,
        '',
      ].join('\r\n');
    })
    .join('\r\n');
}

async function writeJsonMailboxStream(filePath: string, pstPayload: {
  format: string;
  accountEmail: string;
  protocol: string;
  updatedAt: string;
  messageCount: number;
  emails: any[];
}): Promise<void> {
  // Grava num temporário e troca no fim: uma interrupção nunca deixa a cópia cortada
  const tmpPath = `${filePath}.tmp`;
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(tmpPath, { encoding: 'utf-8' });
    stream.on('error', reject);
    stream.on('finish', () => {
      fs.promises.rename(tmpPath, filePath).then(resolve, reject);
    });

    stream.write(
      `{\n  "format": ${JSON.stringify(pstPayload.format)},\n  "accountEmail": ${JSON.stringify(
        pstPayload.accountEmail
      )},\n  "protocol": ${JSON.stringify(pstPayload.protocol)},\n  "updatedAt": ${JSON.stringify(
        pstPayload.updatedAt
      )},\n  "messageCount": ${pstPayload.messageCount},\n  "emails": [\n`
    );

    const emails = pstPayload.emails;
    for (let i = 0; i < emails.length; i++) {
      const suffix = i < emails.length - 1 ? ',\n' : '\n';
      stream.write(`    ${JSON.stringify(emails[i])}${suffix}`);
    }

    stream.end('  ]\n}\n');
  });
}

async function writeMboxStream(filePath: string, emails: any[]): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createWriteStream(tmpPath, { encoding: 'utf-8' });
    stream.on('error', reject);
    stream.on('finish', () => {
      fs.promises.rename(tmpPath, filePath).then(resolve, reject);
    });

    for (const email of emails) {
      const fromAddr = email.senderEmail || 'unknown@anectta.local';
      const dateStr = email.timestampMs ? new Date(email.timestampMs).toUTCString() : new Date().toUTCString();
      const bodyLines = String(email.body || email.preview || '').replace(/\r?\nFrom /g, '\n>From ');
      const block = [
        `From ${fromAddr} ${dateStr}`,
        `From: ${email.sender || fromAddr} <${fromAddr}>`,
        `To: ${email.recipient || ''}`,
        `Subject: ${email.subject || '(Sem assunto)'}`,
        `Date: ${dateStr}`,
        `X-Anectta-Folder: ${email.folder || 'inbox'}`,
        '',
        bodyLines,
        '',
      ].join('\r\n');
      stream.write(`${block}\r\n`);
    }

    stream.end();
  });
}

async function saveMailboxToDisk(accountEmail: string, emails: any[], protocol: string = 'pop3') {
  const { folderPath, pstFilePath, mboxFilePath } = getAccountDataPaths(accountEmail);
  const nowIso = new Date().toISOString();
  const safeEmails = Array.isArray(emails) ? emails : [];
  const pstPayload = {
    format: 'ANECTTA-PST-V1',
    accountEmail,
    protocol: protocol.toUpperCase(),
    updatedAt: nowIso,
    messageCount: safeEmails.length,
    emails: safeEmails,
  };

  await Promise.all([
    writeJsonMailboxStream(pstFilePath, pstPayload),
    writeMboxStream(mboxFilePath, safeEmails),
  ]);
  const stat = await fs.promises.stat(pstFilePath);

  return {
    folderPath,
    pstFilePath,
    mboxFilePath,
    exists: true,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    messageCount: pstPayload.messageCount,
  };
}

ipcMain.handle('storage:get-info', async (_event, accountEmail: string) => {
  try {
    const { folderPath, pstFilePath, mboxFilePath } = getAccountDataPaths(accountEmail);
    if (fs.existsSync(pstFilePath)) {
      const stat = fs.statSync(pstFilePath);
      let messageCount = 0;
      try {
        const raw = JSON.parse(fs.readFileSync(pstFilePath, 'utf-8'));
        messageCount = Array.isArray(raw?.emails) ? raw.emails.length : 0;
      } catch {
        // ignore parse error
      }
      return {
        folderPath,
        pstFilePath,
        mboxFilePath,
        exists: true,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        messageCount,
      };
    }
    return {
      folderPath,
      pstFilePath,
      mboxFilePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      messageCount: 0,
    };
  } catch (err: any) {
    console.error('[MAIN] storage:get-info error:', err);
    const { folderPath, pstFilePath, mboxFilePath } = getAccountDataPaths(accountEmail);
    return {
      folderPath,
      pstFilePath,
      mboxFilePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
      messageCount: 0,
    };
  }
});

ipcMain.handle('storage:save-mailbox', async (_event, payload: { accountEmail: string; protocol?: string; emails: any[] }) => {
  try {
    // A indexação de pesquisa não é feita aqui: o app envia só os e-mails novos/alterados
    // via 'search:index-emails' (reindexar a conta inteira a cada gravação travava o app)
    return await saveMailboxToDisk(payload.accountEmail, payload.emails || [], payload.protocol || 'pop3');
  } catch (err: any) {
    console.error('[MAIN] storage:save-mailbox error:', err);
    throw err;
  }
});

// IPC Handler de Busca Instantânea com SQLite + FTS5
ipcMain.handle(
  'search:query',
  async (
    _event,
    payload: { query: string; accountEmail?: string; folder?: string; limit?: number }
  ) => {
    try {
      // Banco disponível: pesquisa pelo índice do próprio banco (FTS5)
      if (MailStore.get().isAvailable()) {
        return MailStore.get().search(payload.query, {
          accountEmail: payload.accountEmail,
          folder: payload.folder,
          limit: payload.limit || 100,
        });
      }
      return SearchIndexService.getInstance().search(payload.query, {
        accountEmail: payload.accountEmail,
        folder: payload.folder,
        limit: payload.limit || 100,
      });
    } catch (err: any) {
      console.error('[MAIN] search:query error:', err);
      return { results: [], durationMs: 0, totalFound: 0, error: err.message };
    }
  }
);

// IPC Handler para reindexação sob demanda
ipcMain.handle(
  'search:index-emails',
  async (_event, payload: { emails: any[]; accountEmail?: string }) => {
    try {
      return SearchIndexService.getInstance().indexEmails(payload.emails, payload.accountEmail);
    } catch (err: any) {
      console.error('[MAIN] search:index-emails error:', err);
      return { indexedCount: 0, durationMs: 0, error: err.message };
    }
  }
);

// IDs que ainda não estão no índice de pesquisa (o app envia só esses ao abrir)
ipcMain.handle('search:unindexed-ids', async (_event, ids: string[]) => {
  try {
    return SearchIndexService.getInstance().getUnindexedIds(Array.isArray(ids) ? ids : []);
  } catch {
    return [];
  }
});

// Remove do índice e-mails que saíram do app
ipcMain.handle('search:remove-ids', async (_event, ids: string[]) => {
  try {
    SearchIndexService.getInstance().removeIds(Array.isArray(ids) ? ids : []);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('storage:load-mailbox', async (_event, accountEmail: string) => {
  try {
    const { pstFilePath } = getAccountDataPaths(accountEmail);
    if (!fs.existsSync(pstFilePath)) {
      return { success: false, emails: [], pstFilePath };
    }
    const raw = JSON.parse(fs.readFileSync(pstFilePath, 'utf-8'));
    return {
      success: true,
      emails: Array.isArray(raw?.emails) ? raw.emails : [],
      pstFilePath,
    };
  } catch (err: any) {
    console.error('[MAIN] storage:load-mailbox error:', err);
    return { success: false, emails: [], error: err.message };
  }
});

ipcMain.handle('storage:open-folder', async (_event, accountEmail?: string) => {
  const { folderPath, pstFilePath } = getAccountDataPaths(accountEmail || 'carlosamoroso@anectta.com.br');
  if (fs.existsSync(pstFilePath)) {
    shell.showItemInFolder(pstFilePath);
  } else {
    await shell.openPath(folderPath);
  }
  return { success: true, folderPath, pstFilePath };
});

async function tlsGate(config: any): Promise<{ success: false; error: string } | null> {
  const r = await ensureTlsTrust(config?.host, config?.port, config?.secure !== false);
  return r.ok ? null : { success: false, error: r.error || 'Certificado não confiável.' };
}

ipcMain.handle('mail:test-incoming', async (_event, config: MailServerConfig) => {
  { const g = await tlsGate(config); if (g) return g; }
  return await MailService.testIncomingConnection(config);
});

// Assistente de conta: descobre os servidores a partir do e-mail (só o domínio sai do computador)
ipcMain.handle('mail:autodiscover', async (_event, email: string) => {
  try {
    return await discoverMailSettings(String(email || ''));
  } catch (err: any) {
    return { found: false, trail: [err?.message || 'falha na descoberta'] };
  }
});

// Assistente de conta: testa entrada e saída separadamente, com mensagens claras
ipcMain.handle('mail:test-account', async (_event, payload: any) => {
  const incoming = payload?.incoming;
  // Certificado não reconhecido no servidor de entrada: o app pergunta se deve confiar (mesmo fluxo da conexão normal)
  const gate = incoming?.host
    ? await tlsGate({ host: incoming.host, port: incoming.port, secure: implicitTls(incoming.port, incoming.security === 'ssl') })
    : null;
  if (gate) {
    return {
      incoming: { ok: false, code: 'certificate', message: gate.error || 'Certificado do servidor não confiável.' },
      outgoing: { ok: false, code: 'unknown', message: 'Não testado (corrija o servidor de entrada primeiro).' },
    };
  }
  return await testAccount(payload);
});

ipcMain.handle('mail:test-imap', async (_event, config: MailServerConfig) => {
  { const g = await tlsGate(config); if (g) return g; }
  return await MailService.testIncomingConnection(config);
});

ipcMain.handle('shell:open-external', async (_event, url: string) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'URL inválida' };
});

// Segurança de anexos: só aceita arquivos dentro da pasta de cache de anexos do app
// e nunca executa diretamente tipos de arquivo executáveis.
const BLOCKED_EXEC_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.lnk', '.vbs', '.vbe',
  '.js', '.jse', '.wsf', '.wsh', '.ps1', '.psm1', '.reg', '.hta', '.cpl', '.jar', '.dll',
  '.appx', '.msix', '.application', '.gadget', '.url',
]);

function getAttachmentsBaseDir(): string {
  return path.join(getDataStorageDir(), 'attachments');
}

function isPathInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Retorna o caminho real validado do anexo ou null se estiver fora da pasta permitida. */
function resolveSafeAttachmentPath(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath) return null;
  try {
    const real = fs.realpathSync(filePath);
    const base = fs.existsSync(getAttachmentsBaseDir())
      ? fs.realpathSync(getAttachmentsBaseDir())
      : getAttachmentsBaseDir();
    return isPathInside(real, base) ? real : null;
  } catch {
    return null;
  }
}

/**
 * Verifica se um arquivo PDF no disco foi truncado pelo antigo limite de 150 KB do fetch IMAP
 * e, se necessário, baixa novamente a versão íntegra direto do servidor IMAP.
 */
async function ensureIntactAttachmentFile(filePath: string): Promise<void> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    let needsRepair = !fs.existsSync(filePath);

    if (!needsRepair && ext === '.pdf') {
      const buf = await fs.promises.readFile(filePath);
      const tailLen = Math.min(buf.length, 1024);
      const tail = buf.subarray(buf.length - tailLen).toString('latin1');
      if (!tail.includes('%%EOF')) {
        needsRepair = true;
      }
    }

    if (!needsRepair) return;

    // Extrai a pasta e o UID a partir do diretório do anexo (ex.: imap-inbox-1234 ou imap-imap_Contratos-3242)
    const parentFolder = path.basename(path.dirname(filePath));
    const match = parentFolder.match(/^(?:acc-[^_]+-)?imap-(.+)-(\d+)$/);
    if (!match) return;

    const rawFolderPart = match[1]; // ex.: "inbox" ou "imap_Contratos"
    const uid = parseInt(match[2], 10);
    if (!uid || Number.isNaN(uid)) return;

    const folderOrPath = rawFolderPart.startsWith('imap_')
      ? `imap:${rawFolderPart.slice(5)}`
      : rawFolderPart;

    // Carrega as contas salvas em settings.json para autenticar no servidor IMAP
    const settingsFile = getSettingsFilePath();
    if (!fs.existsSync(settingsFile)) return;
    const rawSettings = JSON.parse(await fs.promises.readFile(settingsFile, 'utf-8'));
    const settings = mapSecrets(rawSettings, decryptSecret);
    const accounts: any[] = Array.isArray(settings?.accounts) && settings.accounts.length > 0
      ? settings.accounts
      : settings?.account
      ? [settings.account]
      : [];

    for (const acc of accounts) {
      const inc = acc?.incomingServer;
      if (!inc?.host || (inc.protocol && inc.protocol !== 'imap')) continue;
      const ok = await MailService.redownloadImapAttachment(
        {
          protocol: 'imap',
          host: inc.host,
          port: inc.port || 993,
          secure: inc.security !== 'none',
          user: inc.username || acc.email,
          pass: inc.password || acc.password,
          accessToken: acc.oauthAccessToken,
        },
        folderOrPath,
        uid,
        path.basename(filePath),
        filePath
      );
      if (ok) break;
    }
  } catch (err: any) {
    console.warn('[ATTACHMENT] Aviso ao verificar/reparar anexo:', err?.message || err);
  }
}

// IPC Handlers para Abertura, Visualização e Download de Anexos
ipcMain.handle('attachment:open', async (_event, rawPath: string) => {
  try {
    const filePath = resolveSafeAttachmentPath(rawPath);
    if (!filePath) {
      return { success: false, error: 'Arquivo do anexo não foi localizado ou está fora da pasta segura do aplicativo.' };
    }
    const ext = path.extname(filePath).toLowerCase();
    if (BLOCKED_ATTACHMENT_EXTENSIONS.has(ext) || BLOCKED_EXEC_EXTENSIONS.has(ext)) {
      return {
        success: false,
        blocked: 'dangerous',
        ext,
        error: 'Por segurança, este tipo de arquivo não é aberto diretamente pelo e-mail.',
      };
    }
    await ensureIntactAttachmentFile(filePath);
    // Confere o "DNA" do arquivo: um "fatura.pdf" que na verdade é um programa não abre
    try {
      const disguised = isDisguisedExecutable(filePath, readFileHead(filePath));
      if (disguised) {
        return {
          success: false,
          blocked: 'disguised',
          ext,
          error: `Este anexo diz ser "${ext || 'documento'}", mas na verdade é um programa. Não foi aberto.`,
        };
      }
    } catch {
      // sem leitura do arquivo, segue a verificação normal do sistema
    }
    // Marca "veio da internet": o Windows avisa antes de executar e o Office abre em Modo Protegido
    applyMarkOfTheWeb(filePath);
    const errMsg = await shell.openPath(filePath);
    if (errMsg) {
      // Se não há programa padrão associado, abre a pasta selecionando o arquivo
      shell.showItemInFolder(filePath);
      return { success: false, error: `Não foi possível abrir diretamente: ${errMsg}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('attachment:show-in-folder', async (_event, rawPath: string) => {
  try {
    const filePath = resolveSafeAttachmentPath(rawPath);
    if (!filePath) {
      return { success: false, error: 'Arquivo do anexo não encontrado no disco local.' };
    }
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('attachment:save-as', async (_event, payload: { sourcePath: string; defaultName?: string }) => {
  try {
    const safeSource = resolveSafeAttachmentPath(payload?.sourcePath);
    if (!safeSource) {
      return { success: false, error: 'Arquivo original do anexo não encontrado ou fora da pasta segura.' };
    }
    await ensureIntactAttachmentFile(safeSource);
    payload = { ...payload, sourcePath: safeSource };
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const suggestedName = path.basename(payload.defaultName || path.basename(safeSource));
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      title: 'Salvar Anexo',
      defaultPath: path.join(app.getPath('downloads'), suggestedName),
    });
    if (canceled || !filePath) {
      return { canceled: true };
    }
    await fs.promises.copyFile(payload.sourcePath, filePath);
    applyMarkOfTheWeb(filePath);
    return { success: true, savedPath: filePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

const getSetupStateFilePath = () => path.join(app.getPath('userData'), 'setup_state.json');
const getSettingsFilePath = () => path.join(app.getPath('userData'), 'settings.json');
const getCalendarFilePath = () => path.join(app.getPath('userData'), 'calendar-data.json');

// ---------------------------------------------------------------------------
// Proteção de credenciais (DPAPI no Windows via Electron safeStorage)
// Campos sensíveis são gravados como "enc:v1:<base64>". Valores antigos em texto puro
// continuam sendo lidos normalmente e são criptografados na próxima gravação (migração automática).
// ---------------------------------------------------------------------------
const SECRET_KEYS = new Set(['password', 'pass', 'oauthAccessToken', 'oauthRefreshToken', 'accessToken', 'refreshToken']);
const ENC_PREFIX = 'enc:v1:';

function encryptSecret(value: string): string {
  if (!value || value.startsWith(ENC_PREFIX)) return value;
  try {
    if (!safeStorage.isEncryptionAvailable()) return value;
    return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
  } catch {
    return value;
  }
}

function decryptSecret(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

function mapSecrets(node: any, fn: (v: string) => string): any {
  if (Array.isArray(node)) return node.map((n) => mapSecrets(n, fn));
  if (node && typeof node === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = SECRET_KEYS.has(k) && typeof v === 'string' ? fn(v) : mapSecrets(v, fn);
    }
    return out;
  }
  return node;
}

function isTrustedRendererSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url || '';
  return url.startsWith('file://') || url.startsWith('http://localhost:5173');
}

// Chamadas síncronas usadas pelo renderer para proteger/revelar credenciais no localStorage
ipcMain.on('secure:protect-settings', (event, obj: any) => {
  event.returnValue = isTrustedRendererSender(event) ? mapSecrets(obj, encryptSecret) : null;
});
ipcMain.on('secure:reveal-settings', (event, obj: any) => {
  event.returnValue = isTrustedRendererSender(event) ? mapSecrets(obj, decryptSecret) : null;
});

// Cache local de mensagens (substitui o localStorage, que tem limite de ~5 MB)
const getMessageCachePath = () => path.join(getDataStorageDir(), 'mail-cache.bin');
let messageCacheWriting = false;
let messageCachePending: string | null = null;

/** Cache antigo; se ele já foi convertido para o banco, usa a cópia de segurança mais recente. */
function resolveLegacyCachePath(): string {
  const p = getMessageCachePath();
  if (fs.existsSync(p)) return p;
  try {
    const dir = path.dirname(p);
    const backups = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('mail-cache.bin.migrado-') && f.endsWith('.bak'))
      .sort();
    if (backups.length > 0) return path.join(dir, backups[backups.length - 1]);
  } catch {}
  return p;
}

// ==========================================
// Banco local de e-mails (SQLite) — ver services/mailStore.ts
// ==========================================
function mailStoreLog(message: string): void {
  try {
    const file = path.join(app.getPath('userData'), 'mail-store.log');
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 512 * 1024) fs.writeFileSync(file, '');
    } catch {}
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
}

function initMailStore(): void {
  const t0 = Date.now();
  const status = MailStore.get().init(
    getDataStorageDir(),
    {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (text) => safeStorage.encryptString(text),
      decrypt: (data) => safeStorage.decryptString(data),
    },
    getMessageCachePath(),
    mailStoreLog
  );
  mailStoreLog(`[store] inicialização em ${Date.now() - t0} ms — disponível: ${status.available}`);
  // O índice de pesquisa antigo (Documentos) não é mais carregado quando o banco está disponível;
  // o arquivo é mantido como está (serve ao modo antigo, se o banco falhar).
}

/** Há cache antigo a converter (primeira abertura desta versão)? */
function isMailStoreConversionPending(): boolean {
  try {
    return fs.existsSync(getMessageCachePath());
  } catch {
    return false;
  }
}

/** Banco de e-mails + (só se o banco falhar) o índice de pesquisa antigo. Executa uma única vez. */
let storageLayerReady = false;
function initStorageLayer(): void {
  if (storageLayerReady) return;
  storageLayerReady = true;
  try {
    initMailStore();
  } catch (storeErr) {
    mailStoreLog(`[store] falha inesperada na inicialização: ${(storeErr as any)?.message}`);
  }
  if (!MailStore.get().isAvailable()) {
    try {
      SearchIndexService.getInstance().initialize(getAnecttaStorageDir());
    } catch (initErr) {
      console.warn('[MAIN] Falha ao inicializar SearchIndexService:', initErr);
    }
  }
}

// ATENÇÃO (chamadas síncronas): no Electron, a PRIMEIRA atribuição a event.returnValue já envia
// a resposta. Calcule o valor e atribua UMA única vez, no final.
ipcMain.on('store:status-sync', (event) => {
  let reply: any = { available: false, count: 0 };
  if (isTrustedRendererSender(event)) {
    try {
      initStorageLayer(); // caso alguma janela peça antes da inicialização normal
      reply = { ...MailStore.get().getStatus() };
    } catch (err: any) {
      mailStoreLog(`[store] erro no status: ${err?.message}`);
    }
  }
  event.returnValue = reply;
});

ipcMain.on('store:load-sync', (event) => {
  let reply: string | null = null;
  if (isTrustedRendererSender(event)) {
    try {
      if (MailStore.get().isAvailable()) {
        const t0 = Date.now();
        reply = MailStore.get().loadAllMetaJson();
        mailStoreLog(`[store] carregamento dos resumos em ${Date.now() - t0} ms (${(reply.length / 1048576).toFixed(1)} MB)`);
      }
    } catch (err: any) {
      mailStoreLog(`[store] erro ao carregar resumos: ${err?.message}`);
    }
  }
  event.returnValue = reply;
});

ipcMain.handle('store:upsert', async (event, records: StoreUpsertRecord[]) => {
  if (!isTrustedRendererSender(event)) return 0;
  try {
    return MailStore.get().upsert(Array.isArray(records) ? records : []);
  } catch (err: any) {
    mailStoreLog(`[store] erro ao gravar: ${err?.message}`);
    throw err;
  }
});

ipcMain.handle('store:remove', async (event, ids: string[]) => {
  if (!isTrustedRendererSender(event)) return 0;
  try {
    return MailStore.get().remove(Array.isArray(ids) ? ids : []);
  } catch (err: any) {
    mailStoreLog(`[store] erro ao excluir: ${err?.message}`);
    throw err;
  }
});

ipcMain.handle('store:get-bodies', async (event, ids: string[]) => {
  if (!isTrustedRendererSender(event)) return {};
  return MailStore.get().getBodies(Array.isArray(ids) ? ids.slice(0, 2000) : []);
});

// Cópias .pst/.mbox em Documentos montadas a partir do banco (o app envia só os IDs da conta)
ipcMain.handle(
  'storage:save-mailbox-ids',
  async (event, payload: { accountEmail: string; protocol?: string; ids: string[] }) => {
    if (!isTrustedRendererSender(event)) return null;
    const emails = MailStore.get().getFullEmails(Array.isArray(payload?.ids) ? payload.ids : []);
    return await saveMailboxToDisk(payload.accountEmail, emails, payload.protocol || 'pop3');
  }
);

ipcMain.on('cache:load-messages-sync', (event) => {
  let reply: any[] | null = null;
  try {
    const p = isTrustedRendererSender(event) ? resolveLegacyCachePath() : '';
    if (p && fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      const text =
        buf.subarray(0, 4).toString('utf-8') === 'ENC1'
          ? safeStorage.decryptString(buf.subarray(4))
          : buf.toString('utf-8');
      const parsed = JSON.parse(text);
      reply = Array.isArray(parsed) ? parsed : null;
    }
  } catch (e) {
    console.warn('[MAIN] Falha ao ler cache de mensagens:', (e as any)?.message);
  }
  event.returnValue = reply;
});

ipcMain.handle('cache:load-messages', async (event) => {
  if (!isTrustedRendererSender(event)) return null;
  try {
    const p = getMessageCachePath();
    if (!fs.existsSync(p)) return null;
    const buf = await fs.promises.readFile(p);
    const text =
      buf.subarray(0, 4).toString('utf-8') === 'ENC1'
        ? safeStorage.decryptString(buf.subarray(4))
        : buf.toString('utf-8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.warn('[MAIN] Falha ao ler cache de mensagens (async):', (e as any)?.message);
    return null;
  }
});

async function flushMessageCache(): Promise<void> {
  if (messageCacheWriting) return;
  messageCacheWriting = true;
  try {
    while (messageCachePending !== null) {
      const json = messageCachePending;
      messageCachePending = null;
      const p = getMessageCachePath();
      const data = safeStorage.isEncryptionAvailable()
        ? Buffer.concat([Buffer.from('ENC1'), safeStorage.encryptString(json)])
        : Buffer.from(json, 'utf-8');
      await fs.promises.writeFile(`${p}.tmp`, data);
      await fs.promises.rename(`${p}.tmp`, p);
    }
  } catch (e) {
    console.warn('[MAIN] Falha ao gravar cache de mensagens:', (e as any)?.message);
  } finally {
    messageCacheWriting = false;
  }
}

ipcMain.on('cache:save-messages', (event, json: string) => {
  if (!isTrustedRendererSender(event) || typeof json !== 'string') return;
  messageCachePending = json;
  void flushMessageCache();
});

// Gravação imediata e aguardada (usada ao fechar o app)
ipcMain.handle('cache:save-messages-now', async (event, json: string) => {
  if (!isTrustedRendererSender(event) || typeof json !== 'string') return false;
  messageCachePending = json;
  // Se já houver uma gravação em andamento, espera ela terminar e grava a versão final
  while (messageCacheWriting) await new Promise((r) => setTimeout(r, 50));
  await flushMessageCache();
  return true;
});

ipcMain.handle('settings:load', async () => {
  try {
    const filePath = getSettingsFilePath();
    if (!fs.existsSync(filePath)) {
      return { success: false };
    }
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const rawParsed = JSON.parse(content);
    // Migração automática: se houver credenciais em texto puro, regrava o arquivo criptografado
    try {
      const encrypted = mapSecrets(rawParsed, encryptSecret);
      if (JSON.stringify(encrypted) !== JSON.stringify(rawParsed)) {
        const tmp = `${filePath}.tmp`;
        await fs.promises.writeFile(tmp, JSON.stringify(encrypted, null, 2), 'utf-8');
        await fs.promises.rename(tmp, filePath);
      }
    } catch (migrateErr) {
      console.warn('[MAIN] Falha na migração de credenciais do settings.json:', migrateErr);
    }
    const parsed = mapSecrets(rawParsed, decryptSecret);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false };
    }
    if (parsed.proxy) {
      void applyElectronProxyConfig(parsed.proxy);
    }
    return { success: true, settings: parsed };
  } catch (e: any) {
    console.warn('[MAIN] Erro ao ler settings.json:', e?.message || e);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('settings:save', async (_event, settingsObj: any) => {
  try {
    if (!settingsObj || typeof settingsObj !== 'object') {
      return { success: false, error: 'Configurações inválidas.' };
    }
    const filePath = getSettingsFilePath();
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(mapSecrets(settingsObj, encryptSecret), null, 2), 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
    if (settingsObj.proxy) {
      void applyElectronProxyConfig(settingsObj.proxy);
    }
    return { success: true };
  } catch (e: any) {
    console.warn('[MAIN] Erro ao salvar settings.json:', e?.message || e);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('calendar:load', async () => {
  try {
    const filePath = getCalendarFilePath();
    if (!fs.existsSync(filePath)) {
      return { success: false };
    }
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object') {
      return { success: false };
    }
    return { success: true, data: parsed };
  } catch (e: any) {
    console.warn('[MAIN] Erro ao ler calendar-data.json:', e?.message || e);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('calendar:save', async (_event, dataObj: any) => {
  try {
    if (!dataObj || typeof dataObj !== 'object') {
      return { success: false, error: 'Dados de calendário inválidos.' };
    }
    const filePath = getCalendarFilePath();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tmpPath, JSON.stringify(dataObj, null, 2), 'utf-8');
    await fs.promises.rename(tmpPath, filePath);
    return { success: true };
  } catch (e: any) {
    console.warn('[MAIN] Erro ao salvar calendar-data.json:', e?.message || e);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('mail:print-email', async (_event, payload: {
  subject?: string;
  sender?: string;
  senderEmail?: string;
  recipient?: string;
  cc?: string;
  dateLabel?: string;
  bodyHtml?: string;
  body?: string;
  attachments?: string[];
}) => {
  const esc = (s: string) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const subject = esc(payload?.subject || '(Sem Assunto)');
  const sender = esc(payload?.sender || '');
  const senderEmail = payload?.senderEmail ? `&lt;${esc(payload.senderEmail)}&gt;` : '';
  const recipient = esc(payload?.recipient || '');
  const cc = esc(payload?.cc || '');
  const dateLabel = esc(payload?.dateLabel || '');
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

  const bodyContent = payload?.bodyHtml
    ? payload.bodyHtml
    : `<pre style="white-space:pre-wrap;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;line-height:1.6;color:#111827;margin:0;">${esc(payload?.body || '')}</pre>`;

  const attachmentsHtml =
    attachments.length > 0
      ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#4b5563;">
          <strong>Anexos (${attachments.length}):</strong> ${attachments.map(esc).join(', ')}
        </div>`
      : '';

  const printHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${subject}</title>
<style>
  @page { margin: 16mm; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
    color: #111827;
    background: #ffffff;
    margin: 0;
    padding: 0;
    font-size: 13px;
    line-height: 1.55;
  }
  .mail-header {
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .mail-subject {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px 0;
  }
  .mail-meta {
    font-size: 12px;
    color: #374151;
    line-height: 1.5;
  }
  .mail-body {
    overflow-wrap: break-word;
  }
  .mail-body img {
    max-width: 100%;
    height: auto;
  }
</style>
</head>
<body>
  <div class="mail-header">
    <h1 class="mail-subject">${subject}</h1>
    <div class="mail-meta">
      <div><strong>De:</strong> ${sender} ${senderEmail}</div>
      ${recipient ? `<div><strong>Para:</strong> ${recipient}</div>` : ''}
      ${cc ? `<div><strong>Cc:</strong> ${cc}</div>` : ''}
      ${dateLabel ? `<div><strong>Data:</strong> ${dateLabel}</div>` : ''}
    </div>
  </div>
  <div class="mail-body">${bodyContent}</div>
  ${attachmentsHtml}
</body>
</html>`;

  return await new Promise((resolve) => {
    const printWin = new BrowserWindow({
      show: false,
      width: 820,
      height: 1000,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        try {
          if (!printWin.isDestroyed()) printWin.close();
        } catch {}
        if (success) {
          resolve({ success: true });
        } else if (failureReason === 'cancelled' || failureReason === 'canceled') {
          resolve({ success: false, canceled: true });
        } else {
          resolve({ success: false, error: failureReason || 'Falha ao imprimir.' });
        }
      });
    });

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHtml)}`).catch((err: any) => {
      try {
        if (!printWin.isDestroyed()) printWin.close();
      } catch {}
      resolve({ success: false, error: err?.message || 'Erro ao preparar impressão.' });
    });
  });
});

ipcMain.handle('storage:get-config', async () => {
  const defaultDir = getDefaultUserDataDir();
  const currentDir = getDataStorageDir();
  return {
    defaultDir,
    currentDir,
    isCustom: path.resolve(currentDir).toLowerCase() !== path.resolve(defaultDir).toLowerCase(),
  };
});

ipcMain.handle('storage:select-folder', async (_event, currentDir?: string) => {
  const res = await dialog.showOpenDialog(mainWindow || undefined as any, {
    title: 'Selecionar pasta de armazenamento (Local ou Rede)',
    defaultPath: currentDir && fs.existsSync(currentDir) ? currentDir : getDefaultUserDataDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths?.[0]) return { canceled: true };
  return { canceled: false, path: res.filePaths[0] };
});

ipcMain.handle('storage:open-data-folder', async (_event, targetDir?: string) => {
  const dir = (targetDir && targetDir.trim()) || getDataStorageDir();
  await fs.promises.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
  return { success: true };
});

ipcMain.handle(
  'storage:set-folder',
  async (_event, payload: { targetDir?: string; migrateData?: boolean }) => {
    try {
      const defaultDir = getDefaultUserDataDir();
      const previousDir = getDataStorageDir();
      const rawTarget = (payload?.targetDir || '').trim();
      const targetDir = rawTarget || defaultDir;

      // Garante acesso de leitura/escrita (fundamental para pastas de rede UNC / unidades mapeadas)
      await fs.promises.mkdir(targetDir, { recursive: true });
      const probeFile = path.join(targetDir, `.anectta-write-test-${Date.now()}.tmp`);
      await fs.promises.writeFile(probeFile, 'ok', 'utf-8');
      await fs.promises.unlink(probeFile);

      const isSameDir =
        path.resolve(previousDir).toLowerCase() === path.resolve(targetDir).toLowerCase();

      if (payload?.migrateData && !isSameDir) {
        // Banco de e-mails: cópia consistente (VACUUM INTO), mesmo com o app aberto
        if (MailStore.get().isAvailable()) {
          MailStore.get().copyTo(targetDir);
        }
        const cacheSrc = path.join(previousDir, 'mail-cache.bin');
        if (fs.existsSync(cacheSrc)) {
          await fs.promises.copyFile(cacheSrc, path.join(targetDir, 'mail-cache.bin'));
        }
        for (const sub of ['attachments', 'templates']) {
          const srcSub = path.join(previousDir, sub);
          if (fs.existsSync(srcSub)) {
            await fs.promises.cp(srcSub, path.join(targetDir, sub), {
              recursive: true,
              force: false,
            });
          }
        }
      }

      const cfgPath = getStorageConfigPath();
      const isDefault =
        path.resolve(targetDir).toLowerCase() === path.resolve(defaultDir).toLowerCase();
      if (isDefault) {
        if (fs.existsSync(cfgPath)) await fs.promises.unlink(cfgPath);
      } else {
        await fs.promises.writeFile(
          cfgPath,
          JSON.stringify({ dataDir: targetDir, updatedAt: new Date().toISOString() }, null, 2),
          'utf-8'
        );
      }

      return { success: true, currentDir: targetDir, isCustom: !isDefault, requiresRestart: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Não foi possível gravar na pasta selecionada. Verifique as permissões de rede.',
      };
    }
  }
);

ipcMain.handle('app:restart', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('backup:get-default-dir', async () => {
  return path.join(app.getPath('documents'), 'Anectta MAIL Backups');
});

ipcMain.handle('backup:select-folder', async (_event, currentDir?: string) => {
  const res = await dialog.showOpenDialog(mainWindow || undefined as any, {
    title: 'Selecionar pasta de destino do Backup',
    defaultPath: currentDir && fs.existsSync(currentDir) ? currentDir : app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths?.[0]) return { canceled: true };
  return { canceled: false, path: res.filePaths[0] };
});

ipcMain.handle('backup:open-folder', async (_event, targetDir?: string) => {
  const dir = (targetDir && targetDir.trim()) || path.join(app.getPath('documents'), 'Anectta MAIL Backups');
  await fs.promises.mkdir(dir, { recursive: true });
  await shell.openPath(dir);
  return { success: true };
});

ipcMain.handle('backup:run-now', async (_event, payload?: { destinationDir?: string; keepLastCount?: number }) => {
  try {
    const destDir = (payload?.destinationDir && payload.destinationDir.trim()) || path.join(app.getPath('documents'), 'Anectta MAIL Backups');
    const keepLast = Math.max(1, Math.min(50, Number(payload?.keepLastCount) || 3));
    await fs.promises.mkdir(destDir, { recursive: true });

    let settingsData: any = null;
    const settingsPath = getSettingsFilePath();
    if (fs.existsSync(settingsPath)) {
      const rawSettings = JSON.parse(await fs.promises.readFile(settingsPath, 'utf-8'));
      settingsData = mapSecrets(rawSettings, decryptSecret);
    }

    let emailsData: any[] = [];
    const cachePath = getMessageCachePath();
    if (fs.existsSync(cachePath)) {
      const buf = await fs.promises.readFile(cachePath);
      const jsonStr =
        buf.subarray(0, 4).toString() === 'ENC1'
          ? safeStorage.decryptString(buf.subarray(4))
          : buf.toString('utf-8');
      const parsed = JSON.parse(jsonStr);
      emailsData = Array.isArray(parsed) ? parsed : (parsed?.emails || []);
    }
    // Com o banco local, os e-mails (com conteúdo) vêm dele
    if (MailStore.get().isAvailable()) {
      emailsData = MailStore.get().getFullEmails(MailStore.get().getAllIds());
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const fileName = `anectta-mail-backup-${stamp}.anectta-bak`;
    const filePath = path.join(destDir, fileName);

    const bundle = {
      format: 'anectta-mail-backup-v1',
      appVersion: app.getVersion(),
      createdAt: now.toISOString(),
      settings: settingsData,
      emails: emailsData,
    };

    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf-8'));
    await fs.promises.writeFile(filePath, compressed);

    // Política de retenção: mantém apenas os N backups mais recentes
    const entries = await fs.promises.readdir(destDir);
    const bakFiles = entries
      .filter((f) => f.startsWith('anectta-mail-backup-') && f.endsWith('.anectta-bak'))
      .sort()
      .reverse();

    for (const oldFile of bakFiles.slice(keepLast)) {
      try {
        await fs.promises.unlink(path.join(destDir, oldFile));
      } catch {}
    }

    return {
      success: true,
      filePath,
      fileName,
      sizeBytes: compressed.length,
      emailsCount: emailsData.length,
      createdAt: now.toISOString(),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao criar arquivo de backup.' };
  }
});

ipcMain.handle('backup:restore', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow || undefined as any, {
      title: 'Selecionar arquivo de Backup do Anectta MAIL',
      defaultPath: path.join(app.getPath('documents'), 'Anectta MAIL Backups'),
      filters: [{ name: 'Backup Anectta MAIL', extensions: ['anectta-bak'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths?.[0]) return { canceled: true, success: false };

    const raw = await fs.promises.readFile(res.filePaths[0]);
    const bundle = JSON.parse(zlib.gunzipSync(raw).toString('utf-8'));
    if (!bundle || bundle.format !== 'anectta-mail-backup-v1') {
      return { success: false, error: 'Arquivo de backup inválido ou incompatível.' };
    }

    if (bundle.settings && typeof bundle.settings === 'object') {
      const settingsPath = getSettingsFilePath();
      await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.promises.writeFile(
        settingsPath,
        JSON.stringify(mapSecrets(bundle.settings, encryptSecret), null, 2),
        'utf-8'
      );
    }

    const emails = Array.isArray(bundle.emails) ? bundle.emails : [];
    if (MailStore.get().isAvailable()) {
      // Banco local: substitui o conteúdo pelo do backup
      MailStore.get().replaceAll(emails);
    } else {
      const cachePath = getMessageCachePath();
      const cacheJson = JSON.stringify(emails);
      const data = safeStorage.isEncryptionAvailable()
        ? Buffer.concat([Buffer.from('ENC1'), safeStorage.encryptString(cacheJson)])
        : Buffer.from(cacheJson, 'utf-8');
      await fs.promises.writeFile(cachePath, data);
    }

    return {
      success: true,
      emailsCount: emails.length,
      createdAt: bundle.createdAt,
      settings: bundle.settings || null,
      emails,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao restaurar backup.' };
  }
});

ipcMain.handle('spellcheck:get-languages', async () => {
  const ses = mainWindow?.webContents.session || session.defaultSession;
  return {
    available: ses.availableSpellCheckerLanguages || [],
    active: ses.getSpellCheckerLanguages() || [],
    enabled: ses.isSpellCheckerEnabled(),
  };
});

ipcMain.handle('spellcheck:configure', async (_event, payload: { enabled?: boolean; languages?: string[] }) => {
  try {
    const ses = mainWindow?.webContents.session || session.defaultSession;
    const enabled = payload?.enabled !== false;
    ses.setSpellCheckerEnabled(enabled);
    if (enabled && Array.isArray(payload?.languages) && payload.languages.length > 0) {
      const available = new Set(ses.availableSpellCheckerLanguages || []);
      const valid = payload.languages.filter((lang) => available.has(lang));
      if (valid.length > 0) {
        ses.setSpellCheckerLanguages(valid);
      }
    }
    return {
      success: true,
      enabled: ses.isSpellCheckerEnabled(),
      active: ses.getSpellCheckerLanguages(),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao configurar corretor ortográfico.' };
  }
});

ipcMain.handle('spellcheck:add-word', async (_event, word: string) => {
  try {
    const clean = (word || '').trim();
    if (!clean) return { success: false };
    const ses = mainWindow?.webContents.session || session.defaultSession;
    const added = ses.addWordToSpellCheckerDictionary(clean);
    return { success: added };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('app:get-setup-completed', async () => {
  try {
    const filePath = getSetupStateFilePath();
    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return !!parsed.completed;
    }
  } catch (e) {
    console.warn('[MAIN] Erro ao ler setup_state.json:', e);
  }
  return false;
});

ipcMain.handle('app:set-setup-completed', async () => {
  try {
    const filePath = getSetupStateFilePath();
    await fs.promises.writeFile(
      filePath,
      JSON.stringify({ completed: true, timestamp: Date.now() }),
      'utf-8'
    );
    return { success: true };
  } catch (e: any) {
    console.warn('[MAIN] Erro ao salvar setup_state.json:', e);
    return { success: false, error: e?.message };
  }
});

ipcMain.handle('mail:fetch-inbox', async (_event, config: MailServerConfig) => {
  { const g = await tlsGate(config); if (g) return g; }
  console.log('[MAIN] mail:fetch-inbox para', config?.user, config?.host);
  return await MailService.fetchIncomingInbox(config);
});

ipcMain.handle('mail:fetch-folder', async (_event, payload: any, maybeFolder?: any) => {
  { const g = await tlsGate(payload?.config || payload); if (g) return g; }
  const config: MailServerConfig = payload?.config || payload;
  const folder = payload?.folder || maybeFolder || 'inbox';
  const limit = payload?.limit || 50;
  const imapPath = payload?.imapPath;
  console.log('[MAIN] mail:fetch-folder para', config?.user, 'pasta:', folder, imapPath ? `(${imapPath})` : '');
  return await MailService.fetchFolderMessages(config, folder, limit, imapPath);
});

ipcMain.handle('mail:sync-all-folders', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config || payload); if (g) return g; }
  const config: MailServerConfig = payload?.config || payload;
  const limitPerFolder =
    typeof payload?.limitPerFolder === 'number' ? payload.limitPerFolder : 150;
  console.log('[MAIN] mail:sync-all-folders para', config?.user, 'no servidor', config?.host, 'limit:', limitPerFolder);
  const res = await MailService.syncAllFolders(config, limitPerFolder);
  if (res.vanished || res.catchUpPending || !res.success) {
    const vanished = res.vanished
      ? Object.entries(res.vanished).map(([f, uids]) => `${f}:${uids.length}`).join(', ')
      : '-';
    imapSyncLog(
      `servidor→app ${config?.user || ''}: ${res.success ? 'ok' : 'ERRO ' + res.error} | removidas no servidor [${vanished}]` +
        (res.catchUpPending ? ` | recuperação pendente ${JSON.stringify(res.catchUpPending)}` : '')
    );
  }
  // Diagnóstico: o que o servidor listou × o que o app conhece, por pasta
  if (Array.isArray(res.diag)) {
    for (const line of res.diag) imapSyncLog(`   diagnóstico ${config?.user || ''} → ${line}`);
  }
  return res;
});

ipcMain.handle('mail:fetch-older-folder', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config || payload); if (g) return g; }
  const config: MailServerConfig = payload?.config || payload;
  const folder: string = payload?.folder || 'inbox';
  const res = await MailService.fetchOlderFolderMessages(config, folder, {
    offset: payload?.offset,
    batchSize: payload?.batchSize,
    imapPath: payload?.imapPath,
    knownUids: payload?.knownUids,
    missingOnly: payload?.missingOnly === true,
  });
  // Diagnóstico do download automático: só quando baixou algo (ou falhou)
  if (payload?.missingOnly === true && (!res.success || (res.attemptedUids?.length ?? 0) > 0)) {
    const uids = res.attemptedUids || [];
    imapSyncLog(
      `download automático ${config?.user || ''} ${folder}${res.mailboxPath ? ` [pasta "${res.mailboxPath}"]` : ''}: ${res.success ? 'ok' : 'ERRO ' + res.error} | servidor diz ${res.serverTotal ?? '?'}` +
        `, app conhecia ${Array.isArray(payload?.knownUids) ? payload.knownUids.length : '?'}, baixou ${res.emails?.length ?? 0}` +
        (uids.length ? ` (UIDs ${Math.min(...uids)}..${Math.max(...uids)})` : '') +
        `, faltam ${res.remaining ?? '?'}`
    );
  }
  return res;
});

ipcMain.handle('mail:start-idle', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config || payload); if (g) return g; }
  const config: MailServerConfig = payload?.config || payload;
  ImapIdleService.setListener((accountKey) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mail:new-mail', accountKey);
    }
  });
  return { success: ImapIdleService.start(config) };
});

app.on('before-quit', () => ImapIdleService.stopAll());

ipcMain.handle('mail:create-folder', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config); if (g) return g; }
  const config: MailServerConfig = payload?.config;
  const folderName: string = payload?.folderName || '';
  const parentFolderOrPath: string | undefined = payload?.parentFolderOrPath;
  return await MailService.createImapFolder(config, folderName, parentFolderOrPath);
});

ipcMain.handle('mail:rename-folder', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config); if (g) return g; }
  const config: MailServerConfig = payload?.config;
  const oldImapPath: string = payload?.oldImapPath || '';
  const newName: string = payload?.newName || '';
  return await MailService.renameImapFolder(config, oldImapPath, newName);
});

ipcMain.handle('mail:delete-folder', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config); if (g) return g; }
  const config: MailServerConfig = payload?.config;
  const imapPath: string = payload?.imapPath || '';
  return await MailService.deleteImapFolder(config, imapPath);
});

ipcMain.handle('mail:send-smtp', async (_event, payload: any) => {
  { const g = await tlsGate(payload?.config || payload); if (g) return g; }
  const config: MailServerConfig = payload?.config || payload;
  const emailData = payload?.emailData;
  console.log('[MAIN] mail:send-smtp para', emailData?.recipient);
  const sentCopyConfig: MailServerConfig | undefined = payload?.sentCopyConfig || undefined;
  return await MailService.sendSmtp(config, emailData, sentCopyConfig);
});

/** Log de diagnóstico da sincronização IMAP (só pastas/UIDs/resultados — nunca conteúdo de e-mail). */
function imapSyncLog(message: string): void {
  try {
    const file = path.join(app.getPath('userData'), 'imap-sync.log');
    try {
      // Mantém o arquivo pequeno: recomeça ao passar de ~1 MB
      if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.writeFileSync(file, '');
    } catch {}
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
}

ipcMain.on('mail:imap-sync-log', (event, message: string) => {
  if (!isTrustedRendererSender(event) || typeof message !== 'string') return;
  imapSyncLog(message.slice(0, 2000));
});

// Reflete no servidor IMAP as ações feitas no app (lido/estrela, mover, excluir)
ipcMain.handle('mail:imap-server-actions', async (_event, payload: any) => {
  const g = await tlsGate(payload?.config || payload);
  if (g) {
    imapSyncLog(`app→servidor BLOQUEADO pelo TLS (${payload?.config?.host}): ${JSON.stringify(g).slice(0, 200)}`);
    return g;
  }
  const config: MailServerConfig = payload?.config;
  const actions: ImapServerAction[] = Array.isArray(payload?.actions) ? payload.actions : [];
  const summary = actions.map((a) => `${a.kind}:${a.folderKey}#${a.uid}${a.toFolderKey ? '→' + a.toFolderKey : ''}`).join(', ');
  imapSyncLog(`app→servidor ${config?.user || ''}: ${actions.length} ação(ões) [${summary}]`);
  const res = await MailService.applyServerActions(config, actions);
  const failed = res.results.filter((r) => !r.ok);
  imapSyncLog(
    `app→servidor resultado: ${res.results.length - failed.length} ok, ${failed.length} falha(s)` +
      (failed.length ? ` — ${failed.map((f) => `${f.ref} (${f.retry ? 'nova tentativa' : 'recusada'}: ${f.error})`).join('; ')}` : '')
  );
  return res;
});

// Smart Attachments: 5 arquivos mais recentes de Downloads
ipcMain.handle('downloads:get-recent', async () => {
  try {
    const downloadsDir = app.getPath('downloads');
    if (!fs.existsSync(downloadsDir)) return [];
    const entries = await fs.promises.readdir(downloadsDir, { withFileTypes: true });
    const results: Array<{ name: string; path: string; size: number; mtime: number }> = [];

    for (const entry of entries) {
      if (
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        !entry.name.endsWith('.crdownload') &&
        !entry.name.endsWith('.tmp')
      ) {
        try {
          const fullPath = path.join(downloadsDir, entry.name);
          const stat = await fs.promises.stat(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            size: stat.size,
            mtime: stat.mtimeMs,
          });
        } catch {}
      }
    }
    results.sort((a, b) => b.mtime - a.mtime);
    return results.slice(0, 5);
  } catch (err: any) {
    console.warn('[MAIN] Erro ao listar downloads recentes:', err?.message);
    return [];
  }
});

// Smart Attachments: Dialog nativo de seleção de arquivos
ipcMain.handle('dialog:open-files', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Anexar Arquivos ao E-mail Corporativo',
    properties: ['openFile', 'multiSelections'],
  });
  if (res.canceled || !res.filePaths.length) return [];
  const results: Array<{ name: string; path: string; size: number; mtime: number }> = [];
  for (const filePath of res.filePaths) {
    try {
      const stat = await fs.promises.stat(filePath);
      results.push({
        name: path.basename(filePath),
        path: filePath,
        size: stat.size,
        mtime: stat.mtimeMs,
      });
    } catch {}
  }
  return results;
});

// Privacy Shield IPC Handlers
ipcMain.handle('privacy:get-stats', async () => {
  return { blockedCount: blockedTrackersCount };
});

ipcMain.handle('privacy:reset-stats', async () => {
  blockedTrackersCount = 0;
  return { blockedCount: 0 };
});

// AI Assistant IPC Handlers
ipcMain.handle('ai:summarize', async (_event, payload: { content: string; subject?: string }) => {
  return AIAssistantService.summarize(payload?.content || '', payload?.subject || '');
});

ipcMain.handle('ai:suggest-replies', async (_event, payload: { content: string }) => {
  return AIAssistantService.suggestReplies(payload?.content || '');
});

// Interactive Notifications & Dynamic Badge
ipcMain.handle('notifications:show', async (_event, payload: { title: string; body: string; emailId?: string }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: payload.title || 'Anectta MAIL',
      body: payload.body || '',
      silent: false,
    });
    notif.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        if (payload.emailId) {
          mainWindow.webContents.send('notification:email-clicked', payload.emailId);
        }
      }
    });
    notif.show();
    return true;
  }
  return false;
});

ipcMain.handle('app:set-badge-count', async (_event, count: number) => {
  try {
    if (app.setBadgeCount) {
      app.setBadgeCount(count);
    }
  } catch {}

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (count > 0) {
      mainWindow.setTitle(`(${count}) Anectta MAIL - Corporate Desktop`);
      try {
        mainWindow.flashFrame(true);
      } catch {}
    } else {
      mainWindow.setTitle('Anectta MAIL - Corporate Desktop');
      try {
        mainWindow.flashFrame(false);
      } catch {}
    }
  }
  if (systemTray) {
    systemTray.setToolTip(
      count > 0 ? `Anectta MAIL — ${count} não lida(s)` : 'Anectta MAIL'
    );
  }
  return true;
});

ipcMain.handle('system:set-minimize-to-tray', async (_event, enabled: boolean) => {
  minimizeToTray = Boolean(enabled);
  return minimizeToTray;
});

// OAuth 2.0 PKCE Handlers (Microsoft 365 / Outlook.com & Google Gmail)
ipcMain.handle(
  'oauth:start',
  async (_event, payload: { provider: OAuthProvider; clientId?: string; loginHint?: string }) => {
    return await OAuthService.startOAuthFlow(payload, mainWindow);
  }
);

ipcMain.handle(
  'oauth:refresh',
  async (_event, payload: { provider: OAuthProvider; refreshToken: string; clientId?: string }) => {
    return await OAuthService.refreshAccessToken(payload);
  }
);

ipcMain.handle('sync:test-dav', async (_event, payload: { url: string; username: string; password: string }) => {
  return await CloudSyncService.testDavConnection(payload);
});

ipcMain.handle('sync:calendar', async (_event, payload: any) => {
  return await CloudSyncService.syncCalendar(payload);
});

ipcMain.handle('sync:push-calendar-event', async (_event, payload: any) => {
  return await CloudSyncService.pushCalendarEvent(payload);
});

ipcMain.handle('sync:update-calendar-event', async (_event, payload: any) => {
  return await CloudSyncService.updateCalendarEvent(payload);
});

ipcMain.handle('sync:delete-calendar-event', async (_event, payload: any) => {
  return await CloudSyncService.deleteCalendarEvent(payload);
});

ipcMain.handle('sync:list-calendars', async (_event, payload: any) => {
  return await CloudSyncService.listRemoteCalendars(payload);
});

ipcMain.handle('sync:contacts', async (_event, payload: any) => {
  return await CloudSyncService.syncContacts(payload);
});

ipcMain.handle('mail:one-click-unsubscribe', async (_event, url: string) => {
  try {
    if (!url || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'URL inválida' };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    });
    return { success: res.ok, status: res.status };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de rede' };
  }
});

// ==========================================
// OpenPGP — Criptografia Ponta-a-Ponta
// ==========================================
ipcMain.handle('pgp:generate-key', async (_event, payload: { name: string; email: string; passphrase?: string }) => {
  return await PgpService.generateKeyPair(payload);
});

ipcMain.handle('pgp:inspect-key', async (_event, armoredKey: string) => {
  return await PgpService.inspectKey(armoredKey);
});

ipcMain.handle('pgp:encrypt', async (_event, payload: any) => {
  return await PgpService.encryptMessage(payload);
});

ipcMain.handle('pgp:sign', async (_event, payload: any) => {
  return await PgpService.signCleartext(payload);
});

ipcMain.handle('pgp:decrypt-verify', async (_event, payload: any) => {
  return await PgpService.decryptOrVerify(payload);
});

// ==========================================
// S/MIME — Certificados X.509 (.p12/.pfx) & PKCS#7
// ==========================================
ipcMain.handle('smime:import-p12', async (_event, payload: { p12Base64: string; passphrase: string }) => {
  return SmimeService.importPkcs12(payload);
});

ipcMain.handle('smime:inspect-cert', async (_event, certContent: string) => {
  return SmimeService.inspectPublicCert(certContent);
});

ipcMain.handle('smime:sign', async (_event, payload: { text: string; certPem: string; privateKeyPem: string }) => {
  return SmimeService.signMessage(payload);
});

ipcMain.handle('smime:encrypt', async (_event, payload: { text: string; recipientCertPems: string[] }) => {
  return SmimeService.encryptMessage(payload);
});

ipcMain.handle('smime:decrypt-verify', async (_event, payload: { pkcs7Pem: string; privateKeyPem?: string; certPem?: string }) => {
  return SmimeService.decryptOrVerify(payload);
});

// ==========================================
// Tradução Instantânea de E-mails
// ==========================================
ipcMain.handle(
  'mail:translate-text',
  async (_event, payload: { text: string; targetLang: string; sourceLang?: string }) => {
    return await TranslateService.translate(payload);
  }
);

// ==========================================
// Funções do Sistema: Sons Nativos & Templates Locais
// ==========================================

// Tocar sons nativos do sistema operacional
ipcMain.handle('system:play-sound', async (_event, soundType?: 'beep' | 'notification' | 'alert') => {
  try {
    shell.beep();
    return true;
  } catch (err: any) {
    console.warn('[MAIN] Falha ao tocar som nativo:', err?.message);
    return false;
  }
});

// Abrir configurações de notificação do sistema operacional
ipcMain.handle('system:open-notification-settings', async () => {
  try {
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:notifications');
      return true;
    }
    if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.notifications');
      return true;
    }
    return false;
  } catch {
    return false;
  }
});

// ==========================================
// Servidor Proxy do Sistema & Autenticação
// ==========================================
let currentProxyConfig: {
  mode: 'system' | 'direct' | 'manual';
  host?: string;
  port?: number;
  bypassList?: string;
  requiresAuth: boolean;
  username: string;
  password?: string;
} = {
  mode: 'system',
  host: '',
  port: 8080,
  bypassList: 'localhost,127.0.0.1,<local>',
  requiresAuth: false,
  username: '',
  password: '',
};

async function applyElectronProxyConfig(cfg?: Partial<typeof currentProxyConfig>): Promise<boolean> {
  if (cfg && typeof cfg === 'object') {
    currentProxyConfig = {
      ...currentProxyConfig,
      ...cfg,
    };
  }
  try {
    const ses = mainWindow?.webContents.session || session.defaultSession;
    const mode = currentProxyConfig.mode || 'system';
    let proxyConfigObj: Electron.ProxyConfig = { mode: 'system' };
    if (mode === 'direct') {
      proxyConfigObj = { mode: 'direct' };
    } else if (mode === 'manual' && currentProxyConfig.host?.trim()) {
      const host = currentProxyConfig.host.trim();
      const port = Number(currentProxyConfig.port) || 8080;
      proxyConfigObj = {
        mode: 'fixed_servers',
        proxyRules: `http=${host}:${port};https=${host}:${port}`,
        proxyBypassRules: currentProxyConfig.bypassList || 'localhost,127.0.0.1,<local>',
      };
    } else {
      proxyConfigObj = { mode: 'system' };
    }

    await ses.setProxy(proxyConfigObj);
    try {
      const waSes = session.fromPartition('persist:whatsapp');
      await waSes.setProxy(proxyConfigObj);
    } catch {}
    return true;
  } catch (err: any) {
    console.warn('[MAIN] Falha ao aplicar configuração de proxy:', err?.message);
    return false;
  }
}

app.on('login', (event, _webContents, _details, authInfo, callback) => {
  if (authInfo?.isProxy && currentProxyConfig.requiresAuth && currentProxyConfig.username) {
    event.preventDefault();
    callback(currentProxyConfig.username, currentProxyConfig.password || '');
  }
});

ipcMain.handle('system:open-proxy-settings', async () => {
  try {
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:network-proxy');
      return true;
    }
    if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.network?Proxies');
      return true;
    }
    return false;
  } catch {
    return false;
  }
});

ipcMain.handle('proxy:apply', async (_event, cfg: any) => {
  const ok = await applyElectronProxyConfig(cfg);
  return { success: ok };
});

// Diretório local de templates de e-mail / papéis de carta em disco
function getTemplatesDirectory(): string {
  const dir = path.join(getDataStorageDir(), 'templates');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Salvar template local em arquivo JSON no disco
ipcMain.handle(
  'templates:save',
  async (
    _event,
    template: {
      id: string;
      name: string;
      content: string;
      background?: string;
      styles?: any;
    }
  ) => {
    try {
      const dir = getTemplatesDirectory();
      const safeId = (template.id || `tpl-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(dir, `${safeId}.json`);
      const payload = {
        ...template,
        id: safeId,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return { success: true, id: safeId };
    } catch (err: any) {
      console.warn('[MAIN] Erro ao salvar template:', err.message);
      return { success: false, error: err.message };
    }
  }
);

// Carregar todos os templates salvos localmente
ipcMain.handle('templates:load', async () => {
  try {
    const dir = getTemplatesDirectory();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const templates = files
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return templates;
  } catch (err: any) {
    console.warn('[MAIN] Erro ao carregar templates locais:', err.message);
    return [];
  }
});

// Excluir template local por ID
ipcMain.handle('templates:delete', async (_event, templateId: string) => {
  try {
    const dir = getTemplatesDirectory();
    const safeId = templateId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(dir, `${safeId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn('[MAIN] Erro ao excluir template:', err.message);
    return false;
  }
});

// ==========================================
// Exportação Padrão RFC 822 (.EML)
// ==========================================

/** E-mails vindos do app só com o resumo: completa o conteúdo a partir do banco local. */
function withStoredBodies(emails: any[]): any[] {
  if (!Array.isArray(emails) || !MailStore.get().isAvailable()) return emails || [];
  const need = emails
    .filter((e) => e && e.bodyStored && e.body === undefined && e.bodyHtml === undefined)
    .map((e) => e.id);
  if (need.length === 0) return emails;
  const bodies = MailStore.get().getBodies(need);
  return emails.map((e) => (e && bodies[e.id] ? { ...e, ...bodies[e.id] } : e));
}

ipcMain.handle('mail:export-eml-dialog', async (_event, email: any) => {
  return await EmlExporterService.exportSingleEmailDialog(withStoredBodies([email])[0]);
});

ipcMain.handle('mail:export-eml-batch', async (_event, payload: { emails: any[]; directory?: string }) => {
  return await EmlExporterService.exportBatchEmails(withStoredBodies(payload.emails || []), payload.directory);
});

// ==========================================
// IMPORTAR / EXPORTAR ARQUIVOS E CONFIGURAÇÕES
// ==========================================

function parsedMailToEmailItem(parsed: any, accountId: string, idx: number, fallbackName?: string) {
  const fromObj = parsed.from?.value?.[0];
  const sender = fromObj?.name || fromObj?.address || fallbackName || 'Remetente Desconhecido';
  const senderEmail = fromObj?.address || 'desconhecido@anectta.local';
  const toList = parsed.to?.value?.map((v: any) => v.address).filter(Boolean) || [];
  const ccList = parsed.cc?.value?.map((v: any) => v.address).filter(Boolean) || [];
  const referencesList = Array.isArray(parsed.references)
    ? parsed.references.map((r: any) => String(r || '').trim()).filter(Boolean)
    : typeof parsed.references === 'string'
    ? parsed.references.split(/[\s,]+/).map((r: string) => r.trim()).filter(Boolean)
    : [];
  const textBody = parsed.text || '';
  const htmlBody = typeof parsed.html === 'string' ? parsed.html : '';
  const preview = (textBody || htmlBody.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
  const dateObj = parsed.date ? new Date(parsed.date) : new Date();
  const timestampMs = isNaN(dateObj.getTime()) ? Date.now() : dateObj.getTime();

  return {
    id: `imported-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    accountId,
    messageIdHeader: parsed.messageId ? String(parsed.messageId).trim() : undefined,
    inReplyToHeader: parsed.inReplyTo ? String(parsed.inReplyTo).trim() : undefined,
    referencesHeader: referencesList.length > 0 ? referencesList : undefined,
    sender,
    senderEmail,
    recipient: toList.join(', '),
    cc: ccList.join(', ') || undefined,
    subject: parsed.subject || '(Sem assunto)',
    preview: preview || '(Sem prévia)',
    body: textBody || htmlBody.replace(/<[^>]+>/g, ' ').trim(),
    htmlBody: htmlBody || undefined,
    date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    timestampMs,
    isRead: false,
    isStarred: false,
    folder: 'inbox',
    hasAttachments: Array.isArray(parsed.attachments) && parsed.attachments.length > 0,
    category: 'inbox',
  };
}

ipcMain.handle('mail:export-archive', async (_event, payload: { emails: any[]; accountEmail?: string }) => {
  try {
    const emails = withStoredBodies(Array.isArray(payload?.emails) ? payload.emails : []);
    const safeName = (payload?.accountEmail || 'anectta-backup').replace(/[^a-z0-9@._-]/gi, '_');
    const targetWin = BrowserWindow.getFocusedWindow() || mainWindow;
    const { canceled, filePath } = await dialog.showSaveDialog(targetWin!, {
      title: 'Exportar Backup de E-mails (.MBOX / .PST / .JSON)',
      defaultPath: `${safeName}-backup.mbox`,
      filters: [
        { name: 'Arquivo MBOX (Thunderbird / Padrão)', extensions: ['mbox'] },
        { name: 'Arquivo de Dados Anectta (.pst)', extensions: ['pst'] },
        { name: 'Backup JSON (.json)', extensions: ['json'] },
      ],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mbox') {
      await fs.promises.writeFile(filePath, buildMboxContent(emails), 'utf-8');
    } else {
      const pstPayload = {
        format: 'ANECTTA-PST-V1',
        accountEmail: payload?.accountEmail || 'all',
        updatedAt: new Date().toISOString(),
        messageCount: emails.length,
        emails,
      };
      await fs.promises.writeFile(filePath, JSON.stringify(pstPayload, null, 2), 'utf-8');
    }

    return { success: true, filePath, count: emails.length };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao exportar arquivo.' };
  }
});

const MAX_READFILE_BYTES = 2 * 1024 * 1024 * 1024 - 1; // Node.js fs.readFile 2 GiB limit
const MAX_STREAM_IMPORT_BYTES = 50 * 1024 * 1024 * 1024; // 50 GiB limit for streaming/random-access PST/MBOX

async function isOutlookBinaryPst(filePath: string): Promise<boolean> {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await fh.read(header, 0, 4, 0);
    return bytesRead === 4 && header.toString('ascii') === '!BDN';
  } finally {
    await fh.close();
  }
}

function mapOutlookFolderName(displayName: string): string {
  const name = (displayName || '').toLowerCase();
  if (name.includes('sent') || name.includes('enviad')) return 'sent';
  if (name.includes('draft') || name.includes('rascunho')) return 'drafts';
  if (name.includes('deleted') || name.includes('trash') || name.includes('exclu') || name.includes('lixeira')) return 'trash';
  if (name.includes('junk') || name.includes('spam') || name.includes('lixo eletr')) return 'spam';
  if (name.includes('archive') || name.includes('arquivo')) return 'archive';
  return 'inbox';
}

function importOutlookPst(filePath: string, accountId: string, startIdx: number): any[] {
  const results: any[] = [];
  const pstFile = new PSTFile(filePath);

  const walkFolder = (folder: PSTFolder, mappedFolder: string) => {
    try {
      if (folder.contentCount > 0 || folder.emailCount > 0) {
        let child = folder.getNextChild();
        while (child != null) {
          try {
            if (child instanceof PSTMessage && !child.isAssociated) {
              const msgClass = (child.messageClass || '').toUpperCase();
              const isEmailLike = !msgClass || msgClass.startsWith('IPM.NOTE') || msgClass.startsWith('IPM.POST');
              if (isEmailLike) {
                const textBody = child.body || '';
                const htmlBody = child.bodyHTML || '';
                const preview = (textBody || htmlBody.replace(/<[^>]+>/g, ' '))
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 140);
                const dateObj = child.messageDeliveryTime || child.clientSubmitTime || new Date();
                const timestampMs = isNaN(dateObj.getTime()) ? Date.now() : dateObj.getTime();
                const sender = child.senderName || child.sentRepresentingName || 'Remetente Desconhecido';
                const senderEmail =
                  child.senderEmailAddress || child.sentRepresentingEmailAddress || 'desconhecido@anectta.local';

                results.push({
                  id: `pst-${Date.now()}-${startIdx + results.length}-${Math.random().toString(36).slice(2, 7)}`,
                  accountId,
                  sender,
                  senderEmail,
                  recipient: child.displayTo || '',
                  cc: child.displayCC || undefined,
                  subject: child.subject || '(Sem assunto)',
                  preview: preview || '(Sem prévia)',
                  body: textBody || htmlBody.replace(/<[^>]+>/g, ' ').trim(),
                  htmlBody: htmlBody || undefined,
                  date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                  timestampMs,
                  isRead: Boolean(child.isRead),
                  isStarred: false,
                  folder: mappedFolder,
                  hasAttachments: Boolean(child.hasAttachments),
                  priority: child.importance === 2 ? 'high' : child.importance === 0 ? 'low' : 'normal',
                  category: mappedFolder,
                });
              }
            }
          } catch {
            // Ignora item individual corrompido dentro do PST
          }
          child = folder.getNextChild();
        }
      }
    } catch {
      // Ignora pasta sem itens legíveis
    }

    if (folder.hasSubfolders) {
      try {
        for (const sub of folder.getSubFolders()) {
          walkFolder(sub, mapOutlookFolderName(sub.displayName));
        }
      } catch {
        // Ignora subpasta inacessível
      }
    }
  };

  try {
    walkFolder(pstFile.getRootFolder(), 'inbox');
  } finally {
    pstFile.close();
  }

  return results;
}

async function importMboxStream(filePath: string, accountId: string, startIdx: number): Promise<any[]> {
  const results: any[] = [];
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let bufferLines: string[] = [];

  const flushChunk = async () => {
    const rawChunk = bufferLines.join('\n').trim();
    bufferLines = [];
    if (!rawChunk) return;
    try {
      const parsed = await simpleParser(rawChunk);
      results.push(parsedMailToEmailItem(parsed, accountId, startIdx + results.length));
    } catch {
      // Ignora bloco malformado no mbox
    }
  };

  for await (const line of rl) {
    if (line.startsWith('From ') && bufferLines.length > 0) {
      await flushChunk();
    } else if (!line.startsWith('From ') || bufferLines.length > 0) {
      bufferLines.push(line);
    }
  }
  await flushChunk();
  return results;
}

ipcMain.handle('mail:import-emails', async (_event, payload: { accountId: string }) => {
  try {
    const accountId = payload?.accountId || 'acc-default';
    const targetWin = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(targetWin!, {
      title: 'Importar E-mails (.EML, .MBOX, .PST, .JSON)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Arquivos de E-mail (*.eml, *.mbox, *.pst, *.json)', extensions: ['eml', 'mbox', 'pst', 'json'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });

    if (res.canceled || res.filePaths.length === 0) {
      return { success: false, canceled: true, emails: [], count: 0 };
    }

    const importedEmails: any[] = [];
    for (const filePath of res.filePaths) {
      const ext = path.extname(filePath).toLowerCase();
      const stat = await fs.promises.stat(filePath);

      if (stat.size > MAX_STREAM_IMPORT_BYTES) {
        return {
          success: false,
          emails: [],
          count: 0,
          error: `O arquivo "${path.basename(filePath)}" excede o limite máximo suportado de 50 GiB.`,
        };
      }

      if (ext === '.pst' && (await isOutlookBinaryPst(filePath))) {
        const pstItems = importOutlookPst(filePath, accountId, importedEmails.length);
        importedEmails.push(...pstItems);
        continue;
      }

      if (ext === '.mbox') {
        const mboxItems = await importMboxStream(filePath, accountId, importedEmails.length);
        importedEmails.push(...mboxItems);
        continue;
      }

      if (stat.size > MAX_READFILE_BYTES) {
        return {
          success: false,
          emails: [],
          count: 0,
          error: `O arquivo "${path.basename(filePath)}" excede o limite de 2 GiB para leitura direta em JSON/EML.`,
        };
      }

      const raw = await fs.promises.readFile(filePath, 'utf-8');

      if (ext === '.eml') {
        const parsed = await simpleParser(raw);
        importedEmails.push(parsedMailToEmailItem(parsed, accountId, importedEmails.length, path.basename(filePath)));
      } else if (ext === '.pst' || ext === '.json') {
        try {
          const parsedJson = JSON.parse(raw);
          const list = Array.isArray(parsedJson)
            ? parsedJson
            : Array.isArray(parsedJson?.emails)
            ? parsedJson.emails
            : [];
          for (const item of list) {
            if (item && (item.subject || item.body || item.senderEmail)) {
              importedEmails.push({
                ...item,
                id: item.id ? `${item.id}-imp-${importedEmails.length}` : `imp-${Date.now()}-${importedEmails.length}`,
                accountId,
                folder: item.folder || 'inbox',
              });
            }
          }
        } catch {
          // Arquivo inválido
        }
      }
    }

    return { success: true, emails: importedEmails, count: importedEmails.length };
  } catch (err: any) {
    return { success: false, emails: [], count: 0, error: err?.message || 'Erro ao importar e-mails.' };
  }
});

// Assistente de Migração Guiado (.PST Outlook, .MBOX Thunderbird/Apple Mail, .EML em lote ou Pasta de Perfil)
// Importar e-mails de outro programa (.pst/.mbox/.eml/pasta de perfil) para uma conta específica
ipcMain.handle(
  'mail:import-into-account',
  async (event, payload: { accountId: string; accountEmail: string; mode: 'pst' | 'mbox' | 'eml' | 'folder'; knownMessageIds?: string[] }) => {
    if (!isTrustedRendererSender(event)) return { success: false, error: 'não autorizado' };
    const mode = payload?.mode || 'pst';
    const targetWin = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow() || mainWindow;
    const dialogOptions: Electron.OpenDialogOptions =
      mode === 'folder'
        ? { title: 'Selecionar a pasta de e-mails (perfil do Thunderbird ou pasta com arquivos)', properties: ['openDirectory'] }
        : mode === 'pst'
        ? {
            title: 'Selecionar arquivo do Outlook (.pst)',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Arquivo de dados do Outlook (*.pst)', extensions: ['pst'] }],
          }
        : mode === 'mbox'
        ? {
            title: 'Selecionar arquivo .mbox',
            properties: ['openFile', 'multiSelections'],
            filters: [
              { name: 'Caixa de e-mail MBOX (*.mbox)', extensions: ['mbox'] },
              { name: 'Todos os arquivos (*.*)', extensions: ['*'] },
            ],
          }
        : {
            title: 'Selecionar mensagens .eml',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Mensagens EML (*.eml)', extensions: ['eml'] }],
          };
    const pick = await dialog.showOpenDialog(targetWin!, dialogOptions);
    if (pick.canceled || pick.filePaths.length === 0) {
      return { success: false, canceled: true, count: 0, duplicates: 0, failed: 0, filesScanned: 0, folders: [], emails: [], storedInDb: false };
    }
    const result = await importIntoAccount({
      accountId: payload.accountId,
      accountEmail: payload.accountEmail,
      mode,
      paths: pick.filePaths,
      knownMessageIds: Array.isArray(payload?.knownMessageIds) ? payload.knownMessageIds : [],
      onProgress: (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('mail:import-progress', p);
      },
    });
    imapSyncLog(
      `importação ${payload.accountEmail} (${mode}): ${result.count} importados, ${result.duplicates} repetidos ignorados, ` +
        `${result.failed} com erro, ${result.filesScanned} arquivo(s)` +
        (result.error ? ` — ${result.error}` : '')
    );
    return result;
  }
);

ipcMain.handle(
  'mail:import-migration',
  async (_event, payload: { accountId: string; mode?: 'folder' | 'pst' | 'mbox' | 'eml' }) => {
    try {
      const accountId = payload?.accountId || 'acc-default';
      const mode = payload?.mode || 'folder';
      const targetWin = BrowserWindow.getFocusedWindow() || mainWindow;

      const dialogOptions: Electron.OpenDialogOptions =
        mode === 'folder'
          ? {
              title: 'Selecionar Pasta de Perfil / E-mails (Thunderbird, Apple Mail ou pasta .EML)',
              properties: ['openDirectory'],
            }
          : mode === 'pst'
          ? {
              title: 'Selecionar Arquivo Outlook (.PST)',
              properties: ['openFile', 'multiSelections'],
              filters: [{ name: 'Microsoft Outlook (*.pst)', extensions: ['pst'] }],
            }
          : mode === 'mbox'
          ? {
              title: 'Selecionar Arquivo Thunderbird / Apple Mail (.MBOX)',
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Caixa MBOX (*.mbox)', extensions: ['mbox'] },
                { name: 'Arquivos Thunderbird sem extensão (*)', extensions: ['*'] },
              ],
            }
          : {
              title: 'Selecionar Arquivos .EML em Lote',
              properties: ['openFile', 'multiSelections'],
              filters: [{ name: 'Mensagens EML (*.eml)', extensions: ['eml'] }],
            };

      const res = await dialog.showOpenDialog(targetWin!, dialogOptions);
      if (res.canceled || res.filePaths.length === 0) {
        return { success: false, canceled: true, emails: [], count: 0 };
      }

      const candidateFiles: Array<{ filePath: string; folderHint?: string }> = [];

      const collectFromDir = async (dirPath: string, depth: number, relFolder?: string) => {
        if (depth > 4) return;
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
        for (const entry of entries) {
          const full = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const cleanFolder = entry.name.replace(/\.sbd$/i, '');
            await collectFromDir(full, depth + 1, relFolder ? `${relFolder}/${cleanFolder}` : cleanFolder);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === '.eml' || ext === '.mbox' || ext === '.pst') {
              candidateFiles.push({ filePath: full, folderHint: relFolder });
            } else if (!ext && !entry.name.startsWith('.')) {
              // Possível arquivo MBOX sem extensão do Thunderbird (ex.: Inbox, Sent)
              try {
                const fd = await fs.promises.open(full, 'r');
                const buf = Buffer.alloc(64);
                const { bytesRead } = await fd.read(buf, 0, 64, 0);
                await fd.close();
                if (bytesRead > 5 && buf.toString('utf8', 0, bytesRead).startsWith('From ')) {
                  candidateFiles.push({ filePath: full, folderHint: entry.name });
                }
              } catch {
                // ignore unreadable
              }
            }
          }
        }
      };

      if (mode === 'folder') {
        await collectFromDir(res.filePaths[0], 0);
      } else {
        for (const fp of res.filePaths) {
          candidateFiles.push({ filePath: fp, folderHint: path.basename(fp, path.extname(fp)) });
        }
      }

      const importedEmails: any[] = [];
      for (const item of candidateFiles) {
        const { filePath, folderHint } = item;
        const ext = path.extname(filePath).toLowerCase();
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.size === 0 || stat.size > MAX_STREAM_IMPORT_BYTES) continue;

          if (ext === '.pst' && (await isOutlookBinaryPst(filePath))) {
            const pstItems = importOutlookPst(filePath, accountId, importedEmails.length);
            importedEmails.push(...pstItems);
          } else if (ext === '.mbox' || !ext) {
            const mboxItems = await importMboxStream(filePath, accountId, importedEmails.length);
            for (const m of mboxItems) {
              if (folderHint) {
                m.tags = Array.from(new Set([...(m.tags || []), `Migração: ${folderHint}`]));
              }
            }
            importedEmails.push(...mboxItems);
          } else if (ext === '.eml' && stat.size <= MAX_READFILE_BYTES) {
            const raw = await fs.promises.readFile(filePath, 'utf-8');
            const parsed = await simpleParser(raw);
            const emailObj: any = parsedMailToEmailItem(
              parsed,
              accountId,
              importedEmails.length,
              path.basename(filePath)
            );
            if (folderHint) {
              emailObj.tags = Array.from(new Set([...(emailObj.tags || []), `Migração: ${folderHint}`]));
            }
            importedEmails.push(emailObj);
          }
        } catch {
          // continua para próximo arquivo
        }
      }

      return {
        success: true,
        emails: importedEmails,
        count: importedEmails.length,
        filesScanned: candidateFiles.length,
        sourceLabel: path.basename(res.filePaths[0]),
      };
    } catch (err: any) {
      return {
        success: false,
        emails: [],
        count: 0,
        error: err?.message || 'Erro ao executar migração de e-mails.',
      };
    }
  }
);

ipcMain.handle('settings:export', async (_event, settingsObj: any) => {
  try {
    const targetWin = BrowserWindow.getFocusedWindow() || mainWindow;
    const { canceled, filePath } = await dialog.showSaveDialog(targetWin!, {
      title: 'Exportar Configurações do Anectta MAIL',
      defaultPath: 'anectta-configuracoes.json',
      filters: [{ name: 'Configurações Anectta (.json)', extensions: ['json'] }],
    });
    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }
    await fs.promises.writeFile(
      filePath,
      JSON.stringify({ format: 'ANECTTA-SETTINGS-V1', exportedAt: new Date().toISOString(), settings: settingsObj }, null, 2),
      'utf-8'
    );
    return { success: true, filePath };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao exportar configurações.' };
  }
});

ipcMain.handle('settings:import', async () => {
  try {
    const targetWin = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(targetWin!, {
      title: 'Importar Configurações do Anectta MAIL',
      properties: ['openFile'],
      filters: [{ name: 'Configurações Anectta (.json)', extensions: ['json'] }],
    });
    if (res.canceled || res.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    const raw = await fs.promises.readFile(res.filePaths[0], 'utf-8');
    const parsed = JSON.parse(raw);
    const loadedSettings = parsed?.settings || parsed;
    if (!loadedSettings || (!loadedSettings.account && !Array.isArray(loadedSettings.accounts))) {
      return { success: false, error: 'Arquivo de configurações inválido ou incompatível.' };
    }
    return { success: true, settings: loadedSettings, filePath: res.filePaths[0] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao importar configurações.' };
  }
});

// App Lifecycle
if (process.platform === 'win32') {
  app.setAppUserModelId('com.anectta.mail');
}

/**
 * Prepara o app para o instalador da atualização.
 * ATENÇÃO (regra R1 de ./updater): apenas OCULTA as janelas. Destruí-las dispara
 * window-all-closed → app.quit() antes de o instalador ser iniciado.
 */
function prepareAppForUpdateInstall(): void {
  isQuitting = true;
  isClosingAfterSync = true;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win && !win.isDestroyed()) {
      try {
        // O handler 'close' da janela principal já libera o fechamento quando isQuitting = true
        win.hide();
      } catch {}
    }
  }
  if (systemTray && !systemTray.isDestroyed()) {
    try {
      systemTray.destroy();
    } catch {}
  }
  systemTray = null;
}

function restoreAppAfterFailedInstall(): void {
  isQuitting = false;
  isClosingAfterSync = false;
  createSystemTray();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// Garante instância única para evitar conflito de lock no LevelDB (localStorage) quando minimizado na bandeja
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (hasPendingUpdate()) {
        notifyPendingUpdate();
      } else {
        void performUpdateCheck(false);
      }
    } else {
      createSystemTray();
      createWindow();
      triggerStartupUpdateCheck();
    }
  });

  app.whenReady().then(() => {

  // Ensure keyboard shortcuts for editing (Cut, Copy, Paste, SelectAll, Undo, Redo) are always available
  const template: any[] = [
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar Tudo' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        {
          label: 'Tamanho Real (100%)',
          accelerator: 'CmdOrCtrl+0',
          click: () => applyMainZoom(1.0),
        },
        {
          label: 'Aumentar Zoom',
          accelerator: 'CmdOrCtrl+=',
          click: () => applyMainZoom(mainZoomFactor + ZOOM_STEP),
        },
        {
          label: 'Diminuir Zoom',
          accelerator: 'CmdOrCtrl+-',
          click: () => applyMainZoom(mainZoomFactor - ZOOM_STEP),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Privacy Shield: Bloqueador de Rastreadores (Tracking pixels 1x1 e domínios espiões)
  try {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details, callback) => {
        const url = details.url.toLowerCase();
        if (url.startsWith('file:') || url.includes('localhost:') || url.includes('127.0.0.1')) {
          callback({ cancel: false });
          return;
        }

        const isTrackerDomain = TRACKER_DOMAINS.some((domain) => url.includes(domain));
        const isPixelPattern =
          /(\/pixel|\/track\/open|spacer\.gif|1x1\.gif|transparent\.gif|beacon\.png|open\.gif|\/beacon)/i.test(url);

        if (isTrackerDomain || isPixelPattern) {
          blockedTrackersCount++;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('privacy:tracker-blocked', {
              url: details.url,
              totalBlocked: blockedTrackersCount,
            });
          }
          callback({ cancel: true });
          return;
        }

        callback({ cancel: false });
      }
    );
  } catch (err: any) {
    console.warn('[MAIN] Falha ao registrar interceptador Privacy Shield:', err.message);
  }

  // Otimiza a sessão persistente do WhatsApp Web para autenticação e sincronização rápidas
  try {
    const whatsappSession = session.fromPartition('persist:whatsapp');
    const whatsappUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

    whatsappSession.setUserAgent(whatsappUserAgent);

    whatsappSession.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.whatsapp.com/*', 'https://*.whatsapp.net/*'] },
      (details, callback) => {
        const headers = { ...details.requestHeaders };
        headers['User-Agent'] = whatsappUserAgent;
        if (headers['sec-ch-ua'] || headers['Sec-CH-UA']) {
          delete headers['sec-ch-ua'];
          headers['Sec-CH-UA'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
        }
        callback({ requestHeaders: headers });
      }
    );

    const allowedWhatsAppPermissions = new Set([
      'notifications',
      'persistent-storage',
      'clipboard-read',
      'clipboard-sanitized-write',
      'media',
    ]);
    whatsappSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(allowedWhatsAppPermissions.has(permission));
    });
  } catch (err: any) {
    console.warn('[MAIN] Falha ao configurar sessão persist:whatsapp:', err.message);
  }

  isClosingAfterSync = false;
  createSplashWindow();
  createSystemTray();
  if (isMailStoreConversionPending()) {
    // Conversão única do cache antigo para o banco: ocupa o processo principal por alguns
    // segundos, então primeiro deixa a tela de abertura aparecer
    let started = false;
    const startAfterSplash = () => {
      if (started) return;
      started = true;
      setTimeout(() => {
        initStorageLayer();
        createWindow();
      }, 300);
    };
    splashWindow?.once('ready-to-show', startAfterSplash);
    setTimeout(startAfterSplash, 4000);
  } else {
    initStorageLayer();
    createWindow();
  }

  // Auto-Updater: todo o fluxo fica isolado em ./updater (módulo crítico — ver RELEASE.md)
  initUpdater({
    getMainWindow: () => mainWindow,
    prepareForInstall: prepareAppForUpdateInstall,
    restoreAfterFailedInstall: restoreAppAfterFailedInstall,
  });

  // Registra o atalho global corporativo: Ctrl+Shift+E ou Cmd+Shift+E para Quick Compose
  try {
    const registered = globalShortcut.register('CommandOrControl+Shift+E', () => {
      console.log('[MAIN] Global Shortcut CommandOrControl+Shift+E acionado!');
      toggleQuickComposeWindow();
    });
    if (registered) {
      console.log('[MAIN] Global Shortcut CommandOrControl+Shift+E registrado com sucesso!');
    } else {
      console.warn('[MAIN] Falha ao registrar atalho global CommandOrControl+Shift+E.');
    }
  } catch (err: any) {
    console.warn('[MAIN] Erro ao registrar atalho global:', err.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSystemTray();
      createWindow();
      triggerStartupUpdateCheck();
    }
  });
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  MailStore.get().close();
  if (systemTray && !systemTray.isDestroyed()) {
    systemTray.destroy();
    systemTray = null;
  }
});

app.on('window-all-closed', () => {
  if (isUpdateInstallInProgress()) return;
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Segurança e interceptação de links para WebViews (coluna de anúncios e WhatsApp Web)
const isWhatsAppWebviewUrl = (targetUrl: string): boolean =>
  /^https:\/\/([a-z0-9-]+\.)?(whatsapp\.com|whatsapp\.net)(\/|$)/i.test(targetUrl);

app.on('web-contents-created', (_event, contents) => {
  // Menu de contexto nativo com corretor ortográfico em campos editáveis (janela principal e webviews, fora do WhatsApp Web)
  contents.on('context-menu', (ctxEvent, params) => {
    if (isWhatsAppWebviewUrl(contents.getURL())) return;
    ctxEvent.preventDefault();

    const menuItems: Electron.MenuItemConstructorOptions[] = [];

    if (params.misspelledWord) {
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
          menuItems.push({
            label: suggestion,
            click: () => contents.replaceMisspelling(suggestion),
          });
        }
      } else {
        menuItems.push({
          label: 'Sem sugestões de ortografia',
          enabled: false,
        });
      }
      menuItems.push({ type: 'separator' });
      menuItems.push({
        label: `Adicionar "${params.misspelledWord}" ao dicionário`,
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      menuItems.push({ type: 'separator' });
    }

    if (params.isEditable) {
      menuItems.push(
        { label: 'Desfazer', role: 'undo', enabled: params.editFlags.canUndo },
        { label: 'Refazer', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy || Boolean(params.selectionText?.trim()) },
        { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Selecionar tudo', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      );
    } else {
      const hasSelection = Boolean(params.selectionText && params.selectionText.length > 0);
      menuItems.push(
        { label: 'Copiar', role: 'copy', enabled: hasSelection || params.editFlags.canCopy },
        { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Selecionar tudo', role: 'selectAll' }
      );
    }

    if (menuItems.length > 0) {
      const win = BrowserWindow.fromWebContents(contents) || mainWindow || undefined;
      Menu.buildFromTemplate(menuItems).popup({ window: win });
    }
  });

  if (contents.getType() !== 'webview') return;

  // Evita throttling de timers, WebSockets e IndexedDB enquanto o WhatsApp sincroniza contatos
  if (contents.session === session.fromPartition('persist:whatsapp')) {
    contents.setBackgroundThrottling(false);
  }

  // Bloqueia popups / novas janelas e abre no navegador padrão do SO
  contents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Intercepta cliques em links / navegação dentro da WebView
  contents.on('will-navigate', (navEvent, url) => {
    const currentUrl = contents.getURL();
    if (isWhatsAppWebviewUrl(currentUrl) && isWhatsAppWebviewUrl(url)) {
      return;
    }
    // Navegação interna no mesmo site (aplicativos web do usuário, ex.: Notion) é permitida
    try {
      const from = new URL(currentUrl);
      const to = new URL(url);
      if (to.protocol === 'https:' && from.hostname === to.hostname) {
        return;
      }
    } catch {
      // URL inválida: segue para o bloqueio abaixo
    }
    if (url && url !== currentUrl && (url.startsWith('https://') || url.startsWith('http://'))) {
      navEvent.preventDefault();
      shell.openExternal(url);
    }
  });

  // Desativa atalhos de navegação e reload apenas fora do WhatsApp Web
  contents.on('before-input-event', (inputEvent, input) => {
    if (isWhatsAppWebviewUrl(contents.getURL())) return;
    const key = (input.key || '').toLowerCase();
    const isNavShortcut =
      (input.alt && (key === 'arrowleft' || key === 'arrowright')) ||
      key === 'browserback' ||
      key === 'browserforward' ||
      key === 'f5' ||
      ((input.control || input.meta) && key === 'r');

    if (isNavShortcut) {
      inputEvent.preventDefault();
    }
  });
});

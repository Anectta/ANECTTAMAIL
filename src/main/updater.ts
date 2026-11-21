/**
 * ============================================================================
 *  MÓDULO CRÍTICO — ATUALIZADOR DO ANECTTA MAIL
 * ============================================================================
 *
 *  Este arquivo concentra TODO o fluxo de atualização do app:
 *    1. Atualização normal (electron-updater / GitHub Releases).
 *    2. Detecção de falha na instalação (o app percebe que não atualizou).
 *    3. Canal de resgate remoto (update-policy.json no repositório).
 *
 *  QUALQUER alteração neste arquivo exige o teste real de atualização descrito
 *  em RELEASE.md (instalar a versão nova e verificar que ELA consegue se
 *  atualizar para a seguinte, publicada como pre-release) ANTES de liberar a
 *  versão para os clientes.
 *
 *  REGRAS INVIOLÁVEIS (cada uma já derrubou a atualização em produção):
 *    R1. Nunca DESTRUIR janelas antes de iniciar o instalador. Destruir dispara
 *        `window-all-closed` → `app.quit()` e o processo morre antes do spawn.
 *        Apenas oculte (UpdaterHost.prepareForInstall).
 *    R2. O instalador precisa estar em execução ANTES de qualquer `app.quit()`.
 *        launchInstaller() só encerra o app depois de confirmar que o
 *        instalador foi iniciado.
 *    R3. Nada de setTimeout/atrasos entre "download concluído" e a instalação.
 *    R4. O canal de resgate NÃO usa electron-updater. Mantenha-o simples e
 *        independente: é a saída de emergência quando o resto quebrar.
 *    R5. O instalador NÃO pode ser processo filho do app. O build/installer.nsh
 *        encerra o app antes de instalar; se o instalador estiver na árvore de
 *        processos do app, ele pode ser encerrado junto (falha 1.0.224 -> 1.0.225).
 *        Por isso NÃO usamos autoUpdater.quitAndInstall(): o instalador é
 *        iniciado via "cmd /c start" (startIndependentInstaller).
 * ============================================================================
 */
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const REPO_OWNER = 'Anectta';
const REPO_NAME = 'ANECTTAMAIL';
const RELEASE_DOWNLOAD_PREFIX = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/`;
const RELEASES_PAGE_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const POLICY_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/update-policy.json`;

/** Após este número de tentativas automáticas sem sucesso, o app passa para o modo de instalação manual. */
const MAX_AUTO_INSTALL_ATTEMPTS = 2;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export interface UpdaterHost {
  getMainWindow(): BrowserWindow | null;
  /** Marca o app como encerrando, OCULTA (não destrói — R1) as janelas e remove o ícone da bandeja. */
  prepareForInstall(): void;
  /** Desfaz prepareForInstall quando a instalação não pôde ser iniciada. */
  restoreAfterFailedInstall(): void;
}

export type RescueKind = 'none' | 'blocked' | 'install-failed';

export interface RescueState {
  kind: RescueKind;
  message: string;
  currentVersion: string;
  targetVersion?: string;
  attempts?: number;
  busy: boolean;
  progress: number;
  error?: string;
}

interface UpdatePolicy {
  blockedVersions?: string[];
  minVersion?: string;
  message?: string;
  targetVersion?: string;
  downloadUrl?: string;
  sha512?: string;
}

interface InstallAttempt {
  fromVersion: string;
  targetVersion: string;
  attempts: number;
  lastAttemptAt: string;
  method: 'auto' | 'rescue';
  installerPath?: string;
}

let host: UpdaterHost | null = null;
let initialized = false;
let feedConfigured = false;
let pendingUpdateVersion: string | null = null;
let inFlightUpdateCheck: Promise<{ latestVersion: string; error?: string }> | null = null;
let lastUpdateCheckAt = 0;
let startupRetryTimers: NodeJS.Timeout[] = [];
let periodicTimer: NodeJS.Timeout | null = null;
let isDownloadingUpdate = false;
let installingUpdate = false;

let blockedByPolicy: { message: string; targetVersion?: string; policy: UpdatePolicy } | null = null;
let failedInstall: { targetVersion: string; attempts: number; installerPath?: string } | null = null;
let rescueBusy = false;
let rescueProgress = 0;
let rescueError: string | undefined;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function updaterLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log('[AUTO-UPDATER]', message);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'updater.log'), line + '\n');
  } catch {
    // ignore
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function sendToRenderer(channel: string, ...args: any[]): void {
  const win = host?.getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

function isBetaChannelEnabled(): boolean {
  try {
    return fs.existsSync(path.join(app.getPath('userData'), 'beta-channel.flag'));
  } catch {
    return false;
  }
}

function attemptFilePath(): string {
  return path.join(app.getPath('userData'), 'update-attempt.json');
}

// ---------------------------------------------------------------------------
// Detecção de falha na instalação
// ---------------------------------------------------------------------------

function readInstallAttempt(): InstallAttempt | null {
  try {
    const raw = fs.readFileSync(attemptFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.targetVersion === 'string' && typeof parsed.fromVersion === 'string') {
      return parsed as InstallAttempt;
    }
  } catch {
    // sem registro
  }
  return null;
}

function clearInstallAttempt(): void {
  try {
    fs.unlinkSync(attemptFilePath());
  } catch {
    // ignore
  }
}

/** Grava a tentativa de instalação ANTES de fechar o app, para conferir o resultado na próxima abertura. */
function recordInstallAttempt(targetVersion: string, method: InstallAttempt['method'], installerPath?: string): void {
  const current = app.getVersion();
  const previous = readInstallAttempt();
  const attempts = previous && previous.fromVersion === current ? (previous.attempts || 0) + 1 : 1;
  const record: InstallAttempt = {
    fromVersion: current,
    targetVersion,
    attempts,
    lastAttemptAt: new Date().toISOString(),
    method,
    installerPath,
  };
  try {
    fs.writeFileSync(attemptFilePath(), JSON.stringify(record, null, 2));
  } catch (err: any) {
    updaterLog(`Não foi possível gravar update-attempt.json: ${err?.message || err}`);
  }
  updaterLog(`Tentativa de instalação #${attempts} (${method}): ${current} -> ${targetVersion}`);
}

/** Executado na abertura: confere se a última tentativa de instalação realmente atualizou o app. */
function evaluatePreviousInstallAttempt(): void {
  const attempt = readInstallAttempt();
  if (!attempt) return;
  const current = app.getVersion();

  if (compareSemver(current, attempt.targetVersion) >= 0) {
    updaterLog(`Atualização confirmada: ${attempt.fromVersion} -> ${current} (tentativa #${attempt.attempts}, ${attempt.method}).`);
    clearInstallAttempt();
    return;
  }
  if (attempt.fromVersion !== current) {
    // Versão mudou por outro caminho (reinstalação manual/downgrade): registro não se aplica mais.
    clearInstallAttempt();
    return;
  }

  updaterLog(
    `FALHA DE INSTALAÇÃO DETECTADA: continua na ${current} após ${attempt.attempts} tentativa(s) de instalar a ${attempt.targetVersion} (${attempt.method}).`
  );
  if (attempt.attempts >= MAX_AUTO_INSTALL_ATTEMPTS) {
    failedInstall = {
      targetVersion: attempt.targetVersion,
      attempts: attempt.attempts,
      installerPath: attempt.installerPath,
    };
    updaterLog('Atualização automática suspensa. Modo de instalação manual ativado.');
  }
}

// ---------------------------------------------------------------------------
// Estado do canal de resgate (exibido pela faixa no renderer)
// ---------------------------------------------------------------------------

export function getRescueState(): RescueState {
  const currentVersion = app.getVersion();
  const base = { currentVersion, busy: rescueBusy, progress: rescueProgress, error: rescueError };
  if (blockedByPolicy) {
    return {
      ...base,
      kind: 'blocked',
      message: blockedByPolicy.message,
      targetVersion: blockedByPolicy.targetVersion,
    };
  }
  if (failedInstall) {
    return {
      ...base,
      kind: 'install-failed',
      message: 'A atualização automática não foi concluída. Clique em "Instalar manualmente" para atualizar o Anectta MAIL.',
      targetVersion: pendingUpdateVersion || failedInstall.targetVersion,
      attempts: failedInstall.attempts,
    };
  }
  return { ...base, kind: 'none', message: '' };
}

function pushRescueState(): void {
  sendToRenderer('rescue:state', getRescueState());
}

/** No modo manual a atualização automática fica suspensa: o modal padrão não é exibido. */
function isAutoUpdateSuspended(): boolean {
  return failedInstall !== null;
}

async function fetchUpdatePolicy(): Promise<UpdatePolicy | null> {
  const res = await session.defaultSession.fetch(`${POLICY_URL}?t=${Date.now()}`, {
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  return data && typeof data === 'object' ? (data as UpdatePolicy) : null;
}

async function checkUpdatePolicy(): Promise<void> {
  if (!app.isPackaged) return;
  let policy: UpdatePolicy | null = null;
  try {
    policy = await withTimeout(fetchUpdatePolicy(), 15_000, 'Tempo esgotado ao consultar a política de atualização.');
  } catch (err: any) {
    updaterLog(`Política de atualização indisponível: ${err?.message || err}`);
    return; // Sem rede: mantém o estado atual
  }

  const current = app.getVersion();
  const blockedList = Array.isArray(policy?.blockedVersions) ? policy!.blockedVersions!.map(String) : [];
  const isBlocked = blockedList.some((v) => compareSemver(v, current) === 0);
  const belowMin = !!policy?.minVersion && compareSemver(current, String(policy.minVersion)) < 0;

  const wasBlocked = blockedByPolicy !== null;
  if (policy && (isBlocked || belowMin)) {
    blockedByPolicy = {
      message:
        (policy.message && String(policy.message)) ||
        `A versão ${current} do Anectta MAIL precisa ser atualizada. Clique em "Atualizar agora".`,
      targetVersion: policy.targetVersion ? String(policy.targetVersion) : undefined,
      policy,
    };
    if (!wasBlocked) updaterLog(`Versão ${current} BLOQUEADA pela política remota. Canal de resgate ativado.`);
  } else {
    blockedByPolicy = null;
  }
  pushRescueState();
}

// ---------------------------------------------------------------------------
// Canal de resgate: download + execução do instalador SEM electron-updater (R4)
// ---------------------------------------------------------------------------

async function fetchLatestStableVersion(): Promise<string> {
  const res = await session.defaultSession.fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest?t=${Date.now()}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AnecttaMAIL/${app.getVersion()}`,
        'Cache-Control': 'no-cache',
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub respondeu HTTP ${res.status}`);
  const data: any = await res.json();
  return String(data?.tag_name || data?.name || '').replace(/^v/i, '');
}

async function fetchBetaVersion(): Promise<string> {
  const res = await session.defaultSession.fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases?per_page=10&t=${Date.now()}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `AnecttaMAIL/${app.getVersion()}`,
        'Cache-Control': 'no-cache',
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub respondeu HTTP ${res.status}`);
  const list: any[] = (await res.json()) as any[];
  const versions = (Array.isArray(list) ? list : [])
    .filter((r) => r && !r.draft)
    .map((r) => String(r.tag_name || '').replace(/^v/i, ''))
    .filter(Boolean)
    .sort((a, b) => compareSemver(b, a));
  return versions[0] || '';
}

interface RescueTarget {
  version: string;
  url: string;
  fileName: string;
  sha512?: string;
}

async function resolveRescueTarget(): Promise<RescueTarget> {
  const policy = blockedByPolicy?.policy;

  if (policy?.downloadUrl) {
    const url = String(policy.downloadUrl);
    if (!url.startsWith(RELEASE_DOWNLOAD_PREFIX) || !/\.exe$/i.test(url)) {
      throw new Error('Endereço de download da política inválido (apenas releases oficiais do Anectta MAIL são aceitas).');
    }
    const fileName = decodeURIComponent(url.split('/').pop() || 'Anectta-MAIL-Setup.exe');
    const versionMatch = /\/download\/v?([^/]+)\//i.exec(url);
    return {
      version: policy.targetVersion ? String(policy.targetVersion) : versionMatch?.[1] || '',
      url,
      fileName,
      sha512: policy.sha512 ? String(policy.sha512) : undefined,
    };
  }

  let version = policy?.targetVersion ? String(policy.targetVersion) : '';
  if (!version) {
    version = await withTimeout(fetchLatestStableVersion(), 15_000, 'Tempo esgotado ao consultar a versão mais recente.');
  }
  if (!version) throw new Error('Não foi possível identificar a versão mais recente.');

  // latest.yml da release informa o nome exato do instalador e o hash SHA-512 para verificação de integridade
  const ymlRes = await withTimeout(
    session.defaultSession.fetch(`${RELEASE_DOWNLOAD_PREFIX}v${version}/latest.yml?t=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache' },
    }),
    15_000,
    'Tempo esgotado ao consultar os dados da versão.'
  );
  if (!ymlRes.ok) throw new Error(`Dados da versão ${version} indisponíveis (HTTP ${ymlRes.status}).`);
  const yml = await ymlRes.text();
  const fileName = (/^path:\s*['"]?(.+?)['"]?\s*$/m.exec(yml)?.[1] || '').trim();
  const sha512 = (/^sha512:\s*['"]?(\S+?)['"]?\s*$/m.exec(yml)?.[1] || '').trim();
  if (!fileName || !/\.exe$/i.test(fileName)) throw new Error('Instalador não encontrado nos dados da versão.');

  return {
    version,
    url: `${RELEASE_DOWNLOAD_PREFIX}v${version}/${encodeURIComponent(fileName)}`,
    fileName,
    sha512: sha512 || undefined,
  };
}

function sha512OfFile(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', () => resolve(''));
  });
}

async function downloadInstaller(target: RescueTarget): Promise<string> {
  const dir = path.join(app.getPath('temp'), 'anectta-mail-rescue');
  await fs.promises.mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, path.basename(target.fileName));
  const partPath = `${finalPath}.part`;

  const controller = new AbortController();
  let idleTimer: NodeJS.Timeout | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), 60_000);
  };

  armIdle();
  try {
    const res: any = await session.defaultSession.fetch(target.url, { signal: controller.signal as any });
    if (!res.ok || !res.body) throw new Error(`Falha no download do instalador (HTTP ${res.status}).`);

    const total = Number(res.headers.get('content-length') || 0);
    const hash = crypto.createHash('sha512');
    const out = fs.createWriteStream(partPath);
    const reader = res.body.getReader();
    let received = 0;
    let lastPercent = -1;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        armIdle();
        const chunk = Buffer.from(value);
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) {
          await new Promise<void>((resolve) => out.once('drain', () => resolve()));
        }
        if (total > 0) {
          const percent = Math.min(99, Math.floor((received / total) * 100));
          if (percent !== lastPercent) {
            lastPercent = percent;
            rescueProgress = percent;
            sendToRenderer('rescue:progress', percent);
          }
        }
      }
    } finally {
      await new Promise<void>((resolve) => out.end(() => resolve()));
    }

    if (received < 1024 * 1024) throw new Error('Instalador baixado está incompleto.');
    if (target.sha512) {
      const digest = hash.digest('base64');
      if (digest !== target.sha512) {
        throw new Error('O instalador baixado não passou na verificação de integridade (SHA-512).');
      }
    }

    try {
      await fs.promises.unlink(finalPath);
    } catch {
      // não existia
    }
    await fs.promises.rename(partPath, finalPath);
    rescueProgress = 100;
    sendToRenderer('rescue:progress', 100);
    return finalPath;
  } catch (err: any) {
    try {
      await fs.promises.unlink(partPath);
    } catch {
      // ignore
    }
    if (err?.name === 'AbortError') throw new Error('Download interrompido: conexão sem resposta por 60 segundos.');
    throw err;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

const INSTALLER_ARGS = ['--updated', '/S', '--force-run'];

/**
 * Inicia o instalador como processo INDEPENDENTE do app (R5), via "cmd /c start".
 * O cmd encerra logo após disparar o instalador, então o instalador não fica na árvore
 * de processos do app — nenhum "taskkill /T" no app consegue derrubá-lo.
 */
function startIndependentInstaller(installerPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const comspec = process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe');
    const commandLine = `/d /s /c "start "" "${installerPath}" ${INSTALLER_ARGS.join(' ')}"`;
    const child = spawn(comspec, [commandLine], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    const timer = setTimeout(() => reject(new Error('Tempo esgotado ao iniciar o instalador.')), 15_000);
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`cmd start terminou com código ${code}`));
    });
    child.unref();
  });
}

/** Executa o instalador e só então encerra o app (R2). Usado pela atualização normal e pelo canal de resgate. */
async function launchInstaller(installerPath: string, targetVersion: string, method: InstallAttempt['method']): Promise<void> {
  if (!fs.existsSync(installerPath)) throw new Error(`Instalador não encontrado: ${installerPath}`);
  recordInstallAttempt(targetVersion, method, installerPath);
  updaterLog(`Executando instalador (${method}) de forma independente: ${installerPath}`);

  try {
    await startIndependentInstaller(installerPath);
  } catch (err: any) {
    updaterLog(`Falha ao iniciar o instalador via cmd (${err?.code || err?.message}). Tentando via shell.`);
    const shellError = await shell.openPath(installerPath);
    if (shellError) throw new Error(`Não foi possível executar o instalador: ${shellError}`);
  }

  updaterLog('Instalador iniciado. Ocultando janelas e encerrando o app.');
  installingUpdate = true;
  host?.prepareForInstall(); // R1: apenas oculta
  setImmediate(() => app.quit());
}

async function runRescueInstall(): Promise<{ success: boolean; error?: string }> {
  if (rescueBusy) return { success: true };
  if (!app.isPackaged) return { success: false, error: 'Disponível apenas no aplicativo instalado.' };

  rescueBusy = true;
  rescueProgress = 0;
  rescueError = undefined;
  pushRescueState();

  try {
    const target = await resolveRescueTarget();
    if (target.version && compareSemver(target.version, app.getVersion()) <= 0 && !blockedByPolicy) {
      throw new Error('Nenhuma versão mais nova disponível no momento.');
    }

    // Reaproveita o instalador já baixado pelo updater quando for a mesma versão e o hash conferir
    let installerPath = '';
    const cached = failedInstall?.installerPath;
    if (cached && failedInstall?.targetVersion === target.version && fs.existsSync(cached)) {
      if (!target.sha512 || (await sha512OfFile(cached)) === target.sha512) {
        installerPath = cached;
        updaterLog(`Canal de resgate: reutilizando instalador já baixado (${cached}).`);
      }
    }
    if (!installerPath) {
      updaterLog(`Canal de resgate: baixando ${target.url}`);
      installerPath = await downloadInstaller(target);
    }

    await launchInstaller(installerPath, target.version || 'desconhecida', 'rescue');
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    updaterLog(`Canal de resgate falhou: ${msg}`);
    rescueBusy = false;
    rescueError = msg;
    pushRescueState();
    sendToRenderer('rescue:error', msg);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Atualização normal (electron-updater)
// ---------------------------------------------------------------------------

function ensureFeedConfigured(): void {
  if (feedConfigured) return;
  feedConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = isBetaChannelEnabled();
  autoUpdater.logger = {
    info: (m: any) => updaterLog(`[electron-updater] ${m}`),
    warn: (m: any) => updaterLog(`[electron-updater][warn] ${m}`),
    error: (m: any) => updaterLog(`[electron-updater][error] ${m}`),
    debug: () => {},
  } as any;
  autoUpdater.requestHeaders = {
    ...(autoUpdater.requestHeaders || {}),
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };
  try {
    const appUpdateYml = path.join(process.resourcesPath, 'app-update.yml');
    if (!fs.existsSync(appUpdateYml)) {
      autoUpdater.setFeedURL({ provider: 'github', owner: REPO_OWNER, repo: REPO_NAME });
    }
  } catch {
    // ignore
  }
  if (autoUpdater.allowPrerelease) updaterLog('Canal BETA ativo (beta-channel.flag): versões pre-release serão oferecidas.');
}

function notifyUpdateAvailable(version: string): void {
  if (!version) return;
  pendingUpdateVersion = version;
  if (isAutoUpdateSuspended()) {
    pushRescueState();
    return;
  }
  sendToRenderer('update-available', version);
}

/** Reenvia ao renderer a atualização pendente (ao exibir a janela, segunda instância, etc.). */
export function notifyPendingUpdate(): void {
  if (pendingUpdateVersion) notifyUpdateAvailable(pendingUpdateVersion);
  pushRescueState();
}

export function hasPendingUpdate(): boolean {
  return pendingUpdateVersion !== null;
}

export function isUpdateInstallInProgress(): boolean {
  return installingUpdate;
}

export async function performUpdateCheck(force = false): Promise<{ latestVersion: string; error?: string }> {
  if (!app.isPackaged) return { latestVersion: app.getVersion() };
  if (pendingUpdateVersion) {
    notifyUpdateAvailable(pendingUpdateVersion);
    return { latestVersion: pendingUpdateVersion };
  }
  if (inFlightUpdateCheck) return inFlightUpdateCheck;
  const now = Date.now();
  if (!force && now - lastUpdateCheckAt < 60_000) return { latestVersion: app.getVersion() };

  ensureFeedConfigured();
  lastUpdateCheckAt = now;

  inFlightUpdateCheck = (async () => {
    const current = app.getVersion();
    let updaterVersion = '';
    let updaterError = '';
    try {
      const result = await withTimeout(autoUpdater.checkForUpdates(), 25_000, 'Tempo esgotado ao consultar o servidor de atualizações.');
      updaterVersion = result?.updateInfo?.version || '';
      updaterLog(`electron-updater: versão publicada=${updaterVersion || '(nenhuma)'} instalada=${current}`);
    } catch (err: any) {
      updaterError = err?.message || String(err);
      updaterLog(`electron-updater falhou: ${updaterError}`);
    }

    // Confirmação direta pela API do GitHub (evita cache do feed e falhas do updater)
    let apiVersion = '';
    if (!updaterVersion || compareSemver(updaterVersion, current) <= 0) {
      try {
        apiVersion = await withTimeout(
          isBetaChannelEnabled() ? fetchBetaVersion() : fetchLatestStableVersion(),
          15_000,
          'Tempo esgotado ao consultar o GitHub.'
        );
        updaterLog(`GitHub API: versão publicada=${apiVersion || '(nenhuma)'}`);
      } catch (err: any) {
        updaterLog(`GitHub API falhou: ${err?.message || err}`);
      }
    }

    try {
      const latestVersion = [updaterVersion, apiVersion].filter(Boolean).sort((a, b) => compareSemver(b, a))[0] || '';
      if (latestVersion && compareSemver(latestVersion, current) > 0) {
        notifyUpdateAvailable(latestVersion);
        return { latestVersion };
      }
      if (!latestVersion && updaterError) return { latestVersion: '', error: updaterError };
      return { latestVersion: latestVersion || current };
    } finally {
      inFlightUpdateCheck = null;
    }
  })();

  return inFlightUpdateCheck;
}

export function triggerStartupUpdateCheck(): void {
  if (!app.isPackaged) return;
  for (const t of startupRetryTimers) clearTimeout(t);
  startupRetryTimers = [];

  void performUpdateCheck(true);
  void checkUpdatePolicy();

  // Novas tentativas caso a rede/DNS/GitHub ainda não esteja disponível na abertura
  for (const delayMs of [20_000, 90_000]) {
    startupRetryTimers.push(
      setTimeout(() => {
        if (!pendingUpdateVersion) void performUpdateCheck(true);
        void checkUpdatePolicy();
      }, delayMs)
    );
  }

  if (!periodicTimer) {
    periodicTimer = setInterval(() => {
      if (!pendingUpdateVersion) void performUpdateCheck(true);
      void checkUpdatePolicy();
    }, UPDATE_CHECK_INTERVAL_MS);
  }
}

// Garante que o electron-updater conheça a versão nova antes de baixar
async function ensureUpdaterHasUpdateInfo(): Promise<void> {
  const result = await withTimeout(autoUpdater.checkForUpdates(), 25_000, 'Tempo esgotado ao preparar o download.');
  const v = result?.updateInfo?.version || '';
  if (!v || compareSemver(v, app.getVersion()) <= 0) {
    throw new Error('O servidor de atualizações ainda está propagando a nova versão. Tente novamente em alguns minutos.');
  }
}

async function installDownloadedUpdate(version: string, downloadedFile?: string): Promise<void> {
  if (installingUpdate) return;
  installingUpdate = true;
  isDownloadingUpdate = false;

  const installerPath = downloadedFile || (autoUpdater as any).installerPath || '';
  updaterLog(`Download concluído (${version}). Iniciando instalação.`);

  try {
    // R3: sem atrasos. R5: instalador independente do processo do app.
    await launchInstaller(installerPath, version, 'auto');
  } catch (err: any) {
    const msg = err?.message || String(err);
    updaterLog(`Não foi possível iniciar o instalador: ${msg}. Restaurando o aplicativo.`);
    installingUpdate = false;
    host?.restoreAfterFailedInstall();
    sendToRenderer('update-error', 'Não foi possível iniciar o instalador da atualização. Tente novamente.');
  }
}

// ---------------------------------------------------------------------------
// Inicialização (chamar uma única vez, dentro de app.whenReady)
// ---------------------------------------------------------------------------

export function initUpdater(updaterHost: UpdaterHost): void {
  host = updaterHost;
  if (initialized) return;
  initialized = true;

  evaluatePreviousInstallAttempt();
  ensureFeedConfigured();

  ipcMain.handle('updater:get-pending', () => (isAutoUpdateSuspended() ? null : pendingUpdateVersion));

  ipcMain.handle('updater:check-manual', async () => {
    const currentVersion = app.getVersion();
    if (!app.isPackaged) {
      return {
        status: 'dev',
        currentVersion,
        message: 'Verificação automática de atualização disponível apenas no aplicativo instalado.',
      };
    }
    const res = await performUpdateCheck(true);
    void checkUpdatePolicy();
    if (res.error) return { status: 'error', currentVersion, error: res.error };
    const latestVersion = pendingUpdateVersion || res.latestVersion;
    if (latestVersion && compareSemver(latestVersion, currentVersion) > 0) {
      pendingUpdateVersion = latestVersion;
      return { status: 'available', currentVersion, latestVersion };
    }
    return { status: 'up-to-date', currentVersion, latestVersion: latestVersion || currentVersion };
  });

  ipcMain.on('iniciar-download-atualizacao', () => {
    // No modo manual, o pedido de atualização vai direto para o canal de resgate
    if (isAutoUpdateSuspended()) {
      void runRescueInstall();
      return;
    }
    if (isDownloadingUpdate || installingUpdate) return;
    isDownloadingUpdate = true;
    updaterLog('Iniciando download da atualização...');
    ensureUpdaterHasUpdateInfo()
      .then(() => autoUpdater.downloadUpdate())
      .catch((err) => {
        isDownloadingUpdate = false;
        const msg = err?.message || String(err);
        updaterLog(`Falha ao baixar atualização: ${msg}`);
        sendToRenderer('update-error', msg);
      });
  });

  ipcMain.handle('rescue:get-state', () => getRescueState());
  ipcMain.handle('rescue:install', () => runRescueInstall());
  ipcMain.handle('rescue:open-download-page', async () => {
    await shell.openExternal(RELEASES_PAGE_URL);
    return true;
  });

  autoUpdater.on('update-available', (info) => {
    const version = info?.version || '';
    if (!version || compareSemver(version, app.getVersion()) <= 0) return;
    updaterLog(`Nova atualização disponível: ${version}`);
    notifyUpdateAvailable(version);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendToRenderer('download-progress', Math.round(progressObj?.percent || 0));
  });

  autoUpdater.on('update-downloaded', (info: any) => {
    void installDownloadedUpdate(String(info?.version || pendingUpdateVersion || ''), info?.downloadedFile);
  });

  autoUpdater.on('error', (err) => {
    const wasDownloading = isDownloadingUpdate;
    isDownloadingUpdate = false;
    installingUpdate = false;
    const msg = err?.message || String(err);
    updaterLog(`evento error (download=${wasDownloading}): ${msg}`);
    // Erros de verificação já são tratados (com fallback) em performUpdateCheck
    if (wasDownloading) sendToRenderer('update-error', msg);
  });

  const win = host.getMainWindow();
  if (win) {
    win.webContents.on('did-finish-load', () => notifyPendingUpdate());
    win.on('show', () => {
      if (pendingUpdateVersion) notifyPendingUpdate();
      else void performUpdateCheck(false);
    });
  }

  triggerStartupUpdateCheck();
}

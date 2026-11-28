export type PriorityLevel = 'high' | 'medium' | 'low';
export type MailFolder =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'snooze'
  | 'trash'
  | 'junk'
  | 'outbox'
  | 'search_folders';

export type TimePeriod = 'today' | 'yesterday' | 'last_week' | 'older';

/** Astro Respostas Inteligentes — progresso do aprendizado de uma conta. */
export interface AstroLearningStatus {
  accountEmail: string;
  running: boolean;
  phase: 'parado' | 'pareando' | 'lendo_pares' | 'estilo' | 'concluido' | 'erro';
  done?: number;
  total?: number;
  pairsAdded?: number;
  pairsTotal?: number;
  styleSamples?: number;
  startedMs?: number;
  finishedMs?: number;
  error?: string;
}

/** Astro Respostas Inteligentes — "DNA de escrita" aprendido. */
export interface AstroStyleProfile {
  version: 1;
  sampleCount: number;
  greetings: Array<{ text: string; count: number }>;
  closings: Array<{ text: string; count: number }>;
  signatureLines: string[];
  formality: number;
  formalityLabel: 'informal' | 'neutro' | 'formal';
  avgWords: number;
  medianWords: number;
  avgParagraphs: number;
  avgSentenceWords: number;
  emojiRate: number;
  frequentPhrases: Array<{ text: string; count: number }>;
  updatedMs: number;
}

export interface MailImportFolder {
  id: string;
  name: string;
  path: string;
  parentSystem?: string;
  parentId?: string;
}

export interface MailImportProgress {
  processed: number;
  imported: number;
  duplicates: number;
  folder?: string;
  file?: string;
}

export interface MailImportResult {
  success: boolean;
  canceled?: boolean;
  count: number;
  duplicates: number;
  failed: number;
  filesScanned: number;
  folders: MailImportFolder[];
  emails: any[];
  storedInDb: boolean;
  error?: string;
}

export interface MailServerSpec {
  protocol: 'imap' | 'pop3' | 'smtp';
  host: string;
  port: number;
  security: 'ssl' | 'starttls' | 'none';
}

export interface MailDiscoveryResult {
  found: boolean;
  source?: 'provedor-conhecido' | 'base-publica' | 'dominio' | 'registro-mx' | 'teste-de-portas';
  providerId?: string;
  providerName?: string;
  incoming?: MailServerSpec;
  outgoing?: MailServerSpec;
  oauth?: 'google' | 'microsoft';
  appPassword?: boolean;
  trail: string[];
}

export interface MailTestStep {
  ok: boolean;
  message: string;
  hint?: string;
  helpUrl?: string;
  helpLabel?: string;
  code?: string;
}

export interface EmailItem {
  id: string;
  accountId?: string;
  messageIdHeader?: string;
  inReplyToHeader?: string;
  referencesHeader?: string[];
  sender: string;
  senderEmail: string;
  avatar?: string;
  recipient: string;
  cc?: string;
  bcc?: string;
  subject: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  attachments?: any[];
  timestamp: string;
  dateStr?: string;
  date?: string;
  period: TimePeriod;
  folder: MailFolder;
  imapLocation?: { folderKey: string; uid: number };
  priority: PriorityLevel;
  isRead: boolean;
  isStarred?: boolean;
  hasAttachment?: boolean;
  category?: 'Finanças' | 'Clientes' | 'DevOps' | 'Jurídico' | 'Urgente';
  tags?: string[];
  calendarInvite?: {
    uid: string;
    method?: string;
    summary: string;
    date: string;
    endDate?: string;
    startTime: string;
    endTime: string;
    allDay?: boolean;
    location?: string;
    organizerName?: string;
    organizerEmail?: string;
    description?: string;
    meetingUrl?: string;
    rawIcs?: string;
    rsvpStatus?: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED';
  };
}

export interface AISummaryResult {
  summary: string;
  keyPoints: string[];
  actionRequired: boolean;
  suggestedAction?: string;
}

export interface LocalStorageInfo {
  folderPath: string;
  pstFilePath: string;
  mboxFilePath: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
  messageCount: number;
}

export interface QuotaInfo {
  usedBytes: number;
  limitBytes: number;
}

export interface SearchResultPayload {
  results: string[];
  durationMs: number;
  totalFound: number;
  error?: string;
}

export interface RecentFileItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

export interface PrivacyStats {
  blockedCount: number;
}

export interface ElectronAPI {
  fetchEmails: () => Promise<EmailItem[]>;
  sendEmail: (email: Omit<EmailItem, 'id' | 'timestamp'>) => Promise<{ success: boolean; id: string }>;
  archiveEmail: (id: string) => Promise<boolean>;
  snoozeEmail: (id: string, until?: string) => Promise<boolean>;
  deleteEmail: (id: string) => Promise<boolean>;
  markAsRead: (id: string, read: boolean) => Promise<boolean>;
  summarizeEmailWithAI: (content: string, subject?: string) => Promise<AISummaryResult>;
  suggestRepliesWithAI: (emailContent: string) => Promise<string[]>;
  testImapConnection: (config: any) => Promise<{ success: boolean; message: string }>;
  /** Importa e-mails de outro programa (.pst/.mbox/.eml/pasta) para uma conta. */
  importMailIntoAccount?: (payload: {
    accountId: string;
    accountEmail: string;
    mode: 'pst' | 'mbox' | 'eml' | 'folder';
    knownMessageIds?: string[];
  }) => Promise<MailImportResult>;
  onMailImportProgress?: (callback: (p: MailImportProgress) => void) => () => void;
  /** Descobre os servidores de e-mail a partir do endereço. */
  discoverMailSettings?: (email: string) => Promise<MailDiscoveryResult>;
  /** Testa entrada e saída separadamente, com mensagens claras. */
  testMailAccount?: (payload: {
    incoming: MailServerSpec;
    outgoing: MailServerSpec;
    user: string;
    pass: string;
    email?: string;
  }) => Promise<{ incoming: MailTestStep; outgoing: MailTestStep }>;
  fetchRealInbox: (config: any) => Promise<{ success: boolean; emails?: EmailItem[]; error?: string; count?: number; serverTotal?: number; hasMore?: boolean; quota?: QuotaInfo }>;
  fetchRealFolder: (config: any, folder: string, limit?: number, imapPath?: string) => Promise<{ success: boolean; emails?: EmailItem[]; error?: string; count?: number; serverTotal?: number; quota?: QuotaInfo }>;
  loadMessageCache: () => Promise<any[] | null>;
  startImapIdle: (config: any) => Promise<{ success: boolean }>;
  onNewMail: (callback: (accountKey: string) => void) => () => void;
  syncAllRealFolders: (config: any, limitPerFolder?: number) => Promise<{ success: boolean; emails?: EmailItem[]; error?: string; count?: number; folderStats?: Record<string, number>; serverTotals?: Record<string, number>; customFolders?: Array<{ imapPath: string; name: string; parentImapPath?: string; parentSystemFolder?: string; delimiter?: string }>; quota?: QuotaInfo; flagUpdates?: Array<{ id: string; isRead: boolean; isStarred: boolean }>; catchUpPending?: Record<string, number>; vanished?: Record<string, number[]>; serverFolderPaths?: string[] }>;
  fetchOlderFolderMessages?: (payload: {
    config: any;
    folder: string;
    offset?: number;
    batchSize?: number;
    imapPath?: string;
    knownUids?: number[];
    missingOnly?: boolean;
  }) => Promise<{
    success: boolean;
    emails?: EmailItem[];
    count?: number;
    serverTotal?: number;
    hasMore?: boolean;
    attemptedUids?: number[];
    remaining?: number;
    error?: string;
  }>;
  createImapFolder?: (config: any, folderName: string, parentFolderOrPath?: string) => Promise<{ success: boolean; imapPath?: string; error?: string }>;
  renameImapFolder?: (config: any, oldImapPath: string, newName: string) => Promise<{ success: boolean; imapPath?: string; error?: string }>;
  deleteImapFolder?: (config: any, imapPath: string) => Promise<{ success: boolean; error?: string }>;
  sendRealEmail: (
    config: any,
    emailData: any,
    sentCopyConfig?: any
  ) => Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    sentCopy?: { saved: boolean; uid?: number; skipped?: 'provider'; error?: string };
  }>;
  /** Grava uma linha no registro de diagnóstico da sincronização (imap-sync.log). */
  logImapSync?: (message: string) => void;
  applyImapServerActions?: (
    config: any,
    actions: Array<{
      ref: string;
      kind: 'move' | 'flags' | 'delete';
      folderKey: string;
      uid: number;
      toFolderKey?: string;
      seen?: boolean;
      flagged?: boolean;
    }>
  ) => Promise<{
    success: boolean;
    error?: string;
    results: Array<{
      ref: string;
      ok: boolean;
      retry?: boolean;
      error?: string;
      newLocation?: { folderKey: string; uid: number };
    }>;
  }>;
  simulateIncomingEmail: () => Promise<EmailItem>;
  getAppVersion: () => Promise<string>;
  getLocalStorageInfo: (accountEmail: string) => Promise<LocalStorageInfo>;
  saveLocalMailbox: (payload: { accountEmail: string; protocol?: string; emails: any[] }) => Promise<LocalStorageInfo>;
  loadLocalMailbox: (accountEmail: string) => Promise<{ success: boolean; emails: EmailItem[]; pstFilePath?: string; error?: string }>;
  openLocalStorageFolder: (accountEmail?: string) => Promise<{ success: boolean; folderPath: string; pstFilePath: string }>;
  searchEmailsFts: (payload: { query: string; accountEmail?: string; folder?: string; limit?: number }) => Promise<SearchResultPayload>;
  indexEmailsFts: (payload: { emails: any[]; accountEmail?: string }) => Promise<{ indexedCount: number; durationMs: number; error?: string }>;
  /** IDs da lista que ainda não estão no índice de pesquisa. */
  getUnindexedEmailIds?: (ids: string[]) => Promise<string[]>;
  /** Remove do índice de pesquisa e-mails que saíram do app. */
  removeIndexedEmails?: (ids: string[]) => Promise<boolean>;
  /** Grava o cache de e-mails imediatamente e aguarda terminar (usado ao fechar o app). */
  saveMessageCacheNow?: (json: string) => Promise<boolean>;

  // ---- Banco local de e-mails (SQLite) ----
  getMailStoreStatusSync?: () => { available: boolean; count: number; migratedNow?: boolean; error?: string };
  /** Resumos de todos os e-mails (sem conteúdo) como texto JSON; null se o banco não estiver disponível. */
  loadMailStoreSync?: () => string | null;
  storeUpsertEmails?: (
    records: Array<{ meta: any; body?: string; bodyHtml?: string; hasBody?: boolean; accountEmail?: string }>
  ) => Promise<number>;
  storeRemoveEmails?: (ids: string[]) => Promise<number>;
  storeGetBodies?: (ids: string[]) => Promise<Record<string, { body?: string; bodyHtml?: string }>>;
  /** Astro Respostas Inteligentes: inicia o aprendizado de uma conta (pares + estilo). */
  astroLearnStart?: (payload: { accountEmail: string; myAddresses: string[] }) => Promise<AstroLearningStatus | null>;
  astroLearnStatus?: (accountEmail: string) => Promise<AstroLearningStatus | null>;
  astroGetProfile?: (accountEmail: string) => Promise<{ profile: AstroStyleProfile | null; pairCount: number } | null>;
  astroClearLearning?: (accountEmail: string) => Promise<boolean>;
  onAstroLearnProgress?: (callback: (status: AstroLearningStatus) => void) => () => void;
  saveLocalMailboxIds?: (payload: { accountEmail: string; protocol?: string; ids: string[] }) => Promise<any>;
  getRecentDownloads: () => Promise<RecentFileItem[]>;
  openFileDialog: () => Promise<RecentFileItem[]>;
  getPrivacyStats: () => Promise<PrivacyStats>;
  resetPrivacyStats: () => Promise<PrivacyStats>;
  onTrackerBlocked: (callback: (data: { url: string; totalBlocked: number }) => void) => () => void;
  showNotification: (payload: { title: string; body: string; emailId?: string }) => Promise<boolean>;
  setBadgeCount: (count: number) => Promise<boolean>;
  playNativeSound: (type?: 'beep' | 'notification' | 'alert') => Promise<boolean>;
  saveLocalTemplate: (template: {
    id: string;
    name: string;
    content: string;
    background?: string;
    styles?: any;
  }) => Promise<{ success: boolean; id?: string; error?: string }>;
  loadLocalTemplates: () => Promise<any[]>;
  deleteLocalTemplate: (templateId: string) => Promise<boolean>;
  exportEmailToEml: (email: any) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  printEmail?: (payload: {
    subject: string;
    sender: string;
    senderEmail?: string;
    recipient: string;
    cc?: string;
    dateLabel: string;
    bodyHtml?: string;
    body: string;
    attachments?: string[];
  }) => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
  exportBatchToEml: (emails: any[], directory?: string) => Promise<{ success: boolean; count: number; directory?: string; error?: string }>;
  exportMailArchive?: (emails: any[], accountEmail?: string) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; count?: number; error?: string }>;
  importEmailsFromFile?: (accountId: string) => Promise<{ success: boolean; canceled?: boolean; emails: EmailItem[]; count: number; error?: string }>;
  exportSettingsFile?: (settingsObj: any) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  importSettingsFile?: () => Promise<{ success: boolean; canceled?: boolean; settings?: any; filePath?: string; error?: string }>;
  loadAppSettings?: () => Promise<{ success: boolean; settings?: any; error?: string }>;
  saveAppSettings?: (settingsObj: any) => Promise<{ success: boolean; error?: string }>;
  loadCalendarData?: () => Promise<{ success: boolean; data?: any; error?: string }>;
  saveCalendarData?: (dataObj: any) => Promise<{ success: boolean; error?: string }>;
  getSpellcheckLanguages?: () => Promise<{ available: string[]; active: string[]; enabled: boolean }>;
  configureSpellcheck?: (payload: { enabled?: boolean; languages?: string[] }) => Promise<{ success: boolean; enabled?: boolean; active?: string[]; error?: string }>;
  addWordToDictionary?: (word: string) => Promise<{ success: boolean }>;
  getDefaultBackupDir?: () => Promise<string>;
  selectBackupFolder?: (currentDir?: string) => Promise<{ canceled: boolean; path?: string }>;
  openBackupFolder?: (targetDir?: string) => Promise<{ success: boolean }>;
  runBackupNow?: (payload?: { destinationDir?: string; keepLastCount?: number }) => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    sizeBytes?: number;
    emailsCount?: number;
    createdAt?: string;
    error?: string;
  }>;
  restoreBackupFile?: () => Promise<{
    success: boolean;
    canceled?: boolean;
    emailsCount?: number;
    createdAt?: string;
    settings?: any;
    emails?: EmailItem[];
    error?: string;
  }>;
  getStorageConfig?: () => Promise<{ defaultDir: string; currentDir: string; isCustom: boolean }>;
  selectStorageFolder?: (currentDir?: string) => Promise<{ canceled: boolean; path?: string }>;
  openStorageFolder?: (targetDir?: string) => Promise<{ success: boolean }>;
  setStorageFolder?: (payload: { targetDir?: string; migrateData?: boolean }) => Promise<{
    success: boolean;
    currentDir?: string;
    isCustom?: boolean;
    requiresRestart?: boolean;
    error?: string;
  }>;
  restartApp?: () => Promise<void>;
  protectSettingsSync?: (settingsObj: any) => any;
  revealSettingsSync?: (settingsObj: any) => any;
  loadMessageCacheSync?: () => any[] | null;
  saveMessageCache?: (json: string) => void;
  openAttachment?: (filePath: string) => Promise<{ success: boolean; error?: string; blocked?: 'dangerous' | 'disguised'; ext?: string }>;
  showAttachmentInFolder?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  saveAttachmentAs?: (payload: { sourcePath: string; defaultName?: string }) => Promise<{ success?: boolean; canceled?: boolean; savedPath?: string; error?: string }>;
  showNotifier: (data: {
    id: string;
    sender: string;
    senderEmail?: string;
    subject: string;
    snippet?: string;
    avatar?: string;
    /** Quantos e-mails novos o aviso resume (1 = um e-mail). */
    count?: number;
  }) => Promise<boolean>;
  closeNotifier: () => void;
  clickNotifier: (emailId: string) => void;
  /** Janela principal: o usuário clicou no aviso de novo e-mail. */
  onNotificationEmailClicked?: (callback: (emailId: string) => void) => () => void;
  getLatestNotifierData: () => Promise<{
    id: string;
    sender: string;
    senderEmail?: string;
    subject: string;
    snippet?: string;
    avatar?: string;
  } | null>;
  onNotifierData: (callback: (data: {
    id: string;
    sender: string;
    senderEmail?: string;
    subject: string;
    snippet?: string;
    avatar?: string;
  }) => void) => () => void;
  openQuickCompose: () => void;
  closeQuickCompose: () => void;
  getSetupCompleted?: () => Promise<boolean>;
  setSetupCompleted?: () => Promise<{ success: boolean; error?: string }>;
  startOAuthLogin?: (payload: {
    provider: 'microsoft' | 'google';
    clientId?: string;
    loginHint?: string;
  }) => Promise<{
    success: boolean;
    provider?: 'microsoft' | 'google';
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    email?: string;
    displayName?: string;
    clientId?: string;
    error?: string;
  }>;
  refreshOAuthToken?: (payload: {
    provider: 'microsoft' | 'google';
    refreshToken: string;
    clientId?: string;
  }) => Promise<{
    success: boolean;
    provider?: 'microsoft' | 'google';
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId?: string;
    error?: string;
  }>;
  testDavConnection?: (payload: {
    url: string;
    username: string;
    password: string;
  }) => Promise<{ success: boolean; message: string }>;
  syncCloudCalendar?: (payload: {
    provider: 'google' | 'microsoft' | 'caldav';
    accessToken?: string;
    caldavUrl?: string;
    username?: string;
    password?: string;
    sourceLabel?: string;
  }) => Promise<{ success: boolean; events?: any[]; error?: string }>;
  pushCloudCalendarEvent?: (payload: {
    provider: 'google' | 'microsoft' | 'caldav';
    accessToken?: string;
    caldavUrl?: string;
    username?: string;
    password?: string;
    event: any;
  }) => Promise<{ success: boolean; remoteId?: string; error?: string }>;
  updateCloudCalendarEvent?: (payload: {
    provider: 'google' | 'microsoft' | 'caldav';
    accessToken?: string;
    caldavUrl?: string;
    username?: string;
    password?: string;
    remoteId: string;
    calendarId?: string;
    event: any;
  }) => Promise<{ success: boolean; error?: string }>;
  deleteCloudCalendarEvent?: (payload: {
    provider: 'google' | 'microsoft' | 'caldav';
    accessToken?: string;
    caldavUrl?: string;
    username?: string;
    password?: string;
    remoteId: string;
    calendarId?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  listCloudCalendars?: (payload: {
    provider: 'google' | 'microsoft';
    accessToken: string;
  }) => Promise<{
    success: boolean;
    calendars?: Array<{ id: string; name: string; primary?: boolean; color?: string }>;
    error?: string;
  }>;
  syncCloudContacts?: (payload: {
    provider: 'google' | 'microsoft' | 'carddav';
    accessToken?: string;
    carddavUrl?: string;
    username?: string;
    password?: string;
    sourceLabel?: string;
  }) => Promise<{ success: boolean; contacts?: any[]; error?: string }>;
  importMigrationFolder?: (payload: {
    accountId: string;
    mode?: 'folder' | 'pst' | 'mbox' | 'eml';
  }) => Promise<{
    success: boolean;
    canceled?: boolean;
    emails: EmailItem[];
    count: number;
    filesScanned?: number;
    sourceLabel?: string;
    error?: string;
  }>;
  oneClickUnsubscribe?: (url: string) => Promise<{ success: boolean; status?: number; error?: string }>;
  pgpGenerateKey?: (payload: { name: string; email: string; passphrase?: string }) => Promise<{
    success: boolean;
    publicKey?: string;
    privateKey?: string;
    fingerprint?: string;
    createdAt?: string;
    error?: string;
  }>;
  pgpInspectKey?: (armoredKey: string) => Promise<{
    success: boolean;
    name?: string;
    email?: string;
    fingerprint?: string;
    isPrivate?: boolean;
    error?: string;
  }>;
  pgpEncrypt?: (payload: {
    text: string;
    recipientPublicKeys: string[];
    senderPrivateKey?: string;
    senderPassphrase?: string;
  }) => Promise<{ success: boolean; armored?: string; error?: string }>;
  pgpSign?: (payload: {
    text: string;
    senderPrivateKey: string;
    senderPassphrase?: string;
  }) => Promise<{ success: boolean; armored?: string; error?: string }>;
  pgpDecryptVerify?: (payload: {
    armoredText: string;
    privateKey?: string;
    passphrase?: string;
    senderPublicKey?: string;
  }) => Promise<{
    success: boolean;
    mode?: 'decrypted' | 'verified';
    plainText?: string;
    verified?: boolean;
    signerKeyId?: string;
    error?: string;
  }>;
  translateEmailText?: (payload: {
    text: string;
    targetLang: string;
    sourceLang?: string;
  }) => Promise<{
    success: boolean;
    translatedText?: string;
    detectedLang?: string;
    targetLang: string;
    provider?: string;
    error?: string;
  }>;
  smimeImportP12?: (payload: { p12Base64: string; passphrase: string }) => Promise<{
    success: boolean;
    metadata?: {
      commonName: string;
      email: string;
      issuer: string;
      validFrom: string;
      validTo: string;
      fingerprint: string;
      certPem: string;
    };
    privateKeyPem?: string;
    error?: string;
  }>;
  smimeInspectCert?: (certContent: string) => Promise<{
    success: boolean;
    metadata?: {
      commonName: string;
      email: string;
      issuer: string;
      validFrom: string;
      validTo: string;
      fingerprint: string;
      certPem: string;
    };
    error?: string;
  }>;
  smimeSign?: (payload: { text: string; certPem: string; privateKeyPem: string }) => Promise<{
    success: boolean;
    pkcs7Pem?: string;
    error?: string;
  }>;
  smimeEncrypt?: (payload: { text: string; recipientCertPems: string[] }) => Promise<{
    success: boolean;
    pkcs7Pem?: string;
    error?: string;
  }>;
  smimeDecryptVerify?: (payload: { pkcs7Pem: string; privateKeyPem?: string; certPem?: string }) => Promise<{
    success: boolean;
    mode?: 'decrypted' | 'verified';
    plainText?: string;
    signerSubject?: string;
    signerIssuer?: string;
    signerEmail?: string;
    validTo?: string;
    error?: string;
  }>;
  setMinimizeToTray?: (enabled: boolean) => Promise<boolean>;
  openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  /** Zoom da janela principal (0.7 a 1.5). */
  getZoom?: () => Promise<number>;
  setZoom?: (factor: number) => Promise<number>;
  /** Avisa quando o zoom muda (botões ou Ctrl + / Ctrl - / Ctrl 0). */
  onZoomChanged?: (callback: (factor: number) => void) => () => void;
  toggleFullScreen?: () => Promise<boolean>;
  isFullScreen?: () => Promise<boolean>;
  onPrepareClose?: (callback: () => void) => () => void;
  confirmAppClose?: () => void;
}

export interface UpdaterAPI {
  onUpdateAvailable: (callback: (version: string) => void) => (() => void) | void;
  onDownloadProgress: (callback: (percent: number) => void) => (() => void) | void;
  onUpdateError?: (callback: (message: string) => void) => (() => void) | void;
  getPendingUpdate?: () => Promise<string | null>;
  checkForUpdatesManual?: () => Promise<{
    status: 'available' | 'up-to-date' | 'error' | 'dev';
    currentVersion: string;
    latestVersion?: string;
    message?: string;
    error?: string;
  }>;
  startDownload: () => void;
  getRescueState?: () => Promise<RescueState>;
  startRescueInstall?: () => Promise<{ success: boolean; error?: string }>;
  openRescueDownloadPage?: () => Promise<boolean>;
  onRescueState?: (callback: (state: RescueState) => void) => () => void;
  onRescueProgress?: (callback: (percent: number) => void) => () => void;
  onRescueError?: (callback: (message: string) => void) => () => void;
}

export interface RescueState {
  kind: 'none' | 'blocked' | 'install-failed';
  message: string;
  currentVersion: string;
  targetVersion?: string;
  attempts?: number;
  busy: boolean;
  progress: number;
  error?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    updaterAPI?: UpdaterAPI;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          partition?: string;
          useragent?: string;
          allowpopups?: string | boolean;
          disablewebsecurity?: string | boolean;
          webpreferences?: string;
          preload?: string;
        },
        HTMLElement
      >;
    }
  }
}

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

export interface EmailItem {
  id: string;
  accountId?: string;
  sender: string;
  senderEmail: string;
  avatar?: string;
  recipient: string;
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
  priority: PriorityLevel;
  isRead: boolean;
  isStarred?: boolean;
  hasAttachment?: boolean;
  category?: 'Finanças' | 'Clientes' | 'DevOps' | 'Jurídico' | 'Urgente';
  tags?: string[];
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
  fetchRealInbox: (config: any) => Promise<{ success: boolean; emails?: EmailItem[]; error?: string; count?: number; quota?: QuotaInfo }>;
  fetchRealFolder: (config: any, folder: string, limit?: number, imapPath?: string) => Promise<{ success: boolean; emails?: EmailItem[]; error?: string; count?: number; quota?: QuotaInfo }>;
  loadMessageCache: () => Promise<any[] | null>;
  startImapIdle: (config: any) => Promise<{ success: boolean }>;
  onNewMail: (callback: (accountKey: string) => void) => () => void;
  syncAllRealFolders: (config: any, limitPerFolder?: number) => Promise<{ success: boolean; emails?: EmailItem[]; error?: string; count?: number; folderStats?: Record<string, number>; customFolders?: Array<{ imapPath: string; name: string; parentImapPath?: string; parentSystemFolder?: string; delimiter?: string }>; quota?: QuotaInfo }>;
  createImapFolder?: (config: any, folderName: string, parentFolderOrPath?: string) => Promise<{ success: boolean; imapPath?: string; error?: string }>;
  renameImapFolder?: (config: any, oldImapPath: string, newName: string) => Promise<{ success: boolean; imapPath?: string; error?: string }>;
  deleteImapFolder?: (config: any, imapPath: string) => Promise<{ success: boolean; error?: string }>;
  sendRealEmail: (config: any, emailData: any) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  simulateIncomingEmail: () => Promise<EmailItem>;
  getAppVersion: () => Promise<string>;
  getLocalStorageInfo: (accountEmail: string) => Promise<LocalStorageInfo>;
  saveLocalMailbox: (payload: { accountEmail: string; protocol?: string; emails: any[] }) => Promise<LocalStorageInfo>;
  loadLocalMailbox: (accountEmail: string) => Promise<{ success: boolean; emails: EmailItem[]; pstFilePath?: string; error?: string }>;
  openLocalStorageFolder: (accountEmail?: string) => Promise<{ success: boolean; folderPath: string; pstFilePath: string }>;
  searchEmailsFts: (payload: { query: string; accountEmail?: string; folder?: string; limit?: number }) => Promise<SearchResultPayload>;
  indexEmailsFts: (payload: { emails: any[]; accountEmail?: string }) => Promise<{ indexedCount: number; durationMs: number; error?: string }>;
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
  openAttachment?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  showAttachmentInFolder?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  saveAttachmentAs?: (payload: { sourcePath: string; defaultName?: string }) => Promise<{ success?: boolean; canceled?: boolean; savedPath?: string; error?: string }>;
  showNotifier: (data: {
    id: string;
    sender: string;
    senderEmail?: string;
    subject: string;
    snippet?: string;
    avatar?: string;
  }) => Promise<boolean>;
  closeNotifier: () => void;
  clickNotifier: (emailId: string) => void;
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
  setMinimizeToTray?: (enabled: boolean) => Promise<boolean>;
  openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  onPrepareClose?: (callback: () => void) => () => void;
  confirmAppClose?: () => void;
}

export interface UpdaterAPI {
  onUpdateAvailable: (callback: (version: string) => void) => (() => void) | void;
  onDownloadProgress: (callback: (percent: number) => void) => (() => void) | void;
  startDownload: () => void;
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

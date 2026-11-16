import type { OutgoingAnimationType } from '../services/stationeryCompiler';

export interface AccountSettings {
  id: string;
  accountName: string;
  color: string;
  isDefault: boolean;
  displayName: string;
  email: string;
  role: string;
  avatar?: string;
  replyTo?: string;
  organization?: string;
  signature: string;
  signatureUseHtml?: boolean;
  attachVCard?: boolean;
  password?: string;
  provider?: string;
  serverType: 'exchange' | 'm365' | 'google' | 'imap_smtp';
  authType?: 'password' | 'oauth2';
  oauthProvider?: 'microsoft' | 'google';
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthExpiresAt?: number;
  oauthClientId?: string;
  incomingServer: {
    protocol: 'imap' | 'pop3';
    host: string;
    port: number;
    security: 'ssl' | 'tls' | 'starttls' | 'auto' | 'none';
    requireSpa?: boolean;
    rememberPassword?: boolean;
    username: string;
    password?: string;
    checkEveryMinutes?: number;
    checkOnStartup?: boolean;
    leaveOnServer?: boolean;
    removeAfterDaysEnabled?: boolean;
    deleteAfterDays?: number;
    removeWhenDeletedFromTrash?: boolean;
    timeoutSeconds?: number;
  };
  outgoingServer: {
    host: string;
    port: number;
    security: 'ssl' | 'tls' | 'starttls' | 'auto' | 'none';
    requiresAuth?: boolean;
    authMode?: 'same_as_incoming' | 'custom_credentials' | 'logon_incoming_first';
    requireSpa?: boolean;
    rememberPassword?: boolean;
    username: string;
    password?: string;
  };
}

export interface AISettings {
  apiKey: string;
  model: 'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gemini-2.0-flash';
  autoSummarize: boolean;
  suggestReplies: boolean;
  tone: 'executive' | 'formal' | 'concise' | 'friendly';
  language: string;
}

export interface AppearanceSettings {
  theme: 'dark' | 'light' | 'system';
  ribbonStyle: 'full' | 'compact' | 'minimal';
  density: 'compact' | 'normal' | 'spacious';
  fontFamily: string;
  accentColor: string;
  minimizeToTray?: boolean;
  showUnifiedInbox?: boolean;
}

export interface SecuritySettings {
  blockExternalImages: boolean;
  requirePasswordOnResume: boolean;
  enableEncryption: boolean;
  clearCacheOnExit: boolean;
  soc2ComplianceMode: boolean;
  privacyMode?: boolean;
  blockTrackingPixels?: boolean;
  blockBlockedSenders?: boolean;
  trackSentEmails?: boolean;
  shareDiagnostics?: boolean;
  downloadExternalAvatars?: boolean;
  blockedSenders?: string[];
}

export type NotificationSoundPreset =
  | 'theme'
  | 'chirp'
  | 'chime'
  | 'pulse'
  | 'bell'
  | 'none';

export interface NotificationSettings {
  notificationsEnabled: boolean;
  notificationSound: NotificationSoundPreset;
  unreadBadgeEnabled: boolean;
}

export interface CalendarSettings {
  connectedAccountIds: string[];
  use24HourFormat: boolean;
  showWeekNumbers: boolean;
  weekStartsOn: 'sunday' | 'monday' | 'saturday';
  defaultEventDurationMinutes: 15 | 30 | 60 | 90 | 120;
}

export interface CustomWebApp {
  id: string;
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
  color?: string;
}

export interface AppsSettings {
  enableCalendarApp: boolean;
  enableContactsApp: boolean;
  enableWhatsAppApp: boolean;
  customApps: CustomWebApp[];
}

export interface EmailSignature {
  id: string;
  name: string;
  defaultAccountId: string;
  html: string;
}

export interface SpellcheckSettings {
  enabled: boolean;
  checkEmailCompose: boolean;
  checkQuickRepliesAndSignatures: boolean;
  languages: string[];
}

export interface BackupSettings {
  enabled: boolean;
  destinationDir: string;
  frequencyDays: 1 | 3 | 7 | 14 | 30;
  keepLastCount: number;
  lastBackupAt?: string;
  lastBackupFile?: string;
  lastBackupSizeBytes?: number;
}

export interface AppSettings {
  accounts: AccountSettings[];
  activeAccountId: string;
  account: AccountSettings; // Shortcut to currently active account
  ai: AISettings;
  appearance: AppearanceSettings;
  security: SecuritySettings;
  notifications?: NotificationSettings;
  calendar?: CalendarSettings;
  apps?: AppsSettings;
  signatures?: EmailSignature[];
  isPremium?: boolean;
  drafts?: DraftSettings;
  sending?: SendingSettings;
  spellcheck?: SpellcheckSettings;
  backup?: BackupSettings;
}

export interface SendingSettings {
  /** Tempo, em segundos, para desfazer um envio antes de ele sair de fato (0 a 30). */
  undoSendSeconds: number;
  /** Animação cinematográfica exibida ao despachar uma mensagem. */
  outgoingAnimation?: OutgoingAnimationType;
}

export interface DraftSettings {
  /** Guarda automaticamente, neste computador, a mensagem que está sendo escrita. */
  autoSaveEnabled: boolean;
  /** Intervalo do salvamento automático, em minutos (1 a 60). */
  autoSaveMinutes: number;
}

const DEFAULT_MAIN_ACCOUNT: AccountSettings = {
  id: 'acc-default',
  accountName: '',
  color: '#2563eb',
  isDefault: true,
  displayName: '',
  email: '',
  role: 'Usuário',
  replyTo: '',
  organization: '',
  signature: '',
  signatureUseHtml: false,
  attachVCard: false,
  serverType: 'imap_smtp',
  incomingServer: {
    protocol: 'imap',
    host: '',
    port: 993,
    security: 'ssl',
    username: '',
    checkEveryMinutes: 10,
    checkOnStartup: true,
    leaveOnServer: true,
    deleteAfterDays: 14,
  },
  outgoingServer: {
    host: '',
    port: 465,
    security: 'ssl',
    username: '',
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  accounts: [],
  activeAccountId: '',
  account: DEFAULT_MAIN_ACCOUNT,
  ai: {
    apiKey: '',
    model: 'gemini-1.5-pro',
    autoSummarize: true,
    suggestReplies: true,
    tone: 'executive',
    language: 'pt-BR',
  },
  appearance: {
    theme: 'dark',
    ribbonStyle: 'full',
    density: 'normal',
    fontFamily: 'Inter',
    accentColor: '#2563eb',
    showUnifiedInbox: true,
  },
  security: {
    blockExternalImages: true,
    requirePasswordOnResume: false,
    enableEncryption: true,
    clearCacheOnExit: false,
    soc2ComplianceMode: true,
    privacyMode: true,
    blockTrackingPixels: true,
    blockBlockedSenders: true,
    trackSentEmails: false,
    shareDiagnostics: false,
    downloadExternalAvatars: true,
    blockedSenders: [],
  },
  notifications: {
    notificationsEnabled: true,
    notificationSound: 'theme',
    unreadBadgeEnabled: true,
  },
  calendar: {
    connectedAccountIds: [],
    use24HourFormat: true,
    showWeekNumbers: false,
    weekStartsOn: 'monday',
    defaultEventDurationMinutes: 60,
  },
  apps: {
    enableCalendarApp: true,
    enableContactsApp: true,
    enableWhatsAppApp: false,
    customApps: [],
  },
  drafts: {
    autoSaveEnabled: true,
    autoSaveMinutes: 3,
  },
  sending: {
    undoSendSeconds: 8,
    outgoingAnimation: 'airplane',
  },
  spellcheck: {
    enabled: true,
    checkEmailCompose: true,
    checkQuickRepliesAndSignatures: true,
    languages: ['pt-BR', 'en-US'],
  },
  backup: {
    enabled: false,
    destinationDir: '',
    frequencyDays: 14,
    keepLastCount: 3,
  },
  isPremium: false,
};

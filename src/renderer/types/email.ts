export type PriorityLevel = 'high' | 'medium' | 'low';
export type MailFolder =
  | 'inbox'
  | 'favorites'
  | 'tasks'
  | 'reading_list'
  | 'important'
  | 'sent'
  | 'drafts'
  | 'archive'
  | 'snooze'
  | 'trash'
  | 'junk'
  | 'outbox'
  | 'search_folders'
  | (string & {});

export interface CustomFolder {
  id: string;
  name: string;
  accountId: string;
  parentFolder?: MailFolder;
  imapPath?: string;
  order?: number;
  createdAt: string;
}

export interface FavoriteFolder {
  accountId: string;
  folderId: MailFolder;
  label: string;
}

export type TimePeriod = 'today' | 'yesterday' | 'last_week' | 'older';

export interface RecipientReadStatus {
  name: string;
  email: string;
  status: 'delivered' | 'opened';
  openedAt?: string;
  openedDateStr?: string;
}

export interface CalendarInviteInfo {
  uid: string;
  method?: string;
  summary: string;
  date: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  allDay?: boolean;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  description?: string;
  meetingUrl?: string;
  rawIcs?: string;
  rsvpStatus?: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED';
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
  stationery?: string;
  draftAttachments?: Array<{ name: string; path: string; size: number }>;
  timestamp: string;
  dateStr?: string;
  /** Data em que o servidor recebeu a mensagem (IMAP INTERNALDATE). Ausente em e-mails antigos. */
  receivedDateStr?: string;
  /** Tamanho total da mensagem em bytes. Ausente em e-mails baixados antes da v1.0.242. */
  sizeBytes?: number;
  period: TimePeriod;
  folder: MailFolder;
  /**
   * IMAP: onde a mensagem está AGORA no servidor, quando difere do que o id indica
   * (após mover no servidor ou cópia gravada em Enviados). Ver utils/imapLocation.
   */
  imapLocation?: { folderKey: string; uid: number };
  priority: PriorityLevel;
  isRead: boolean;
  isStarred?: boolean;
  isTask?: boolean;
  isReadingList?: boolean;
  isImportant?: boolean;
  hasAttachment?: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: number;
    contentType?: string;
    path?: string;
    isSignature?: boolean;
    isInline?: boolean;
  }>;
  category?: 'Finanças' | 'Clientes' | 'DevOps' | 'Jurídico' | 'Urgente';
  tags?: string[];
  trackingEnabled?: boolean;
  requestReadReceipt?: boolean;
  readReceiptRequestedBy?: string;
  readReceiptSent?: boolean;
  recipientTracking?: RecipientReadStatus[];
  calendarInvite?: CalendarInviteInfo;
  listUnsubscribe?: string;
  listUnsubscribePost?: string;
  listId?: string;
  precedence?: string;
  snoozedUntil?: number; // epoch ms
  followUpAt?: number; // epoch ms
  followUpNote?: string;
}

export type TriageCategory = 'all' | 'priority' | 'newsletters' | 'notifications' | 'snoozed';

export interface ScheduledEmailItem {
  id: string;
  scheduledAt: number; // epoch ms
  accountId?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{ name: string; path: string; size: number }>;
  requestReadReceipt?: boolean;
  inReplyTo?: string;
  references?: string[];
  createdAt: number;
}

export interface EmailTemplateItem {
  id: string;
  name: string;
  category: string;
  subject?: string;
  body: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: PriorityLevel;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  sourceEmailId?: string;
  sourceEmailSubject?: string;
  sourceEmailSender?: string;
  tags?: string[];
  syncedToCalendar?: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface AISummaryResult {
  summary: string;
  keyPoints: string[];
  actionRequired: boolean;
}

export interface UserAccount {
  name: string;
  email: string;
  role: string;
  avatar: string;
  status: 'online' | 'busy' | 'away';
}

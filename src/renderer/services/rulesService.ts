import { EmailItem, MailFolder, PriorityLevel } from '../types/email';

export type RuleConditionField =
  | 'sender'
  | 'subject'
  | 'body'
  | 'recipient'
  | 'has_attachment'
  | 'size'
  | 'folder'
  | 'any';
export type RuleConditionOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'is_true'
  | 'is_false';

export interface RuleCondition {
  id: string;
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string;
}

export interface RuleActions {
  moveToFolder?: MailFolder;
  copyToFolder?: MailFolder;
  markAsRead?: boolean;
  markAsStarred?: boolean;
  markAsImportant?: boolean;
  setPriority?: PriorityLevel;
  setCategory?: EmailItem['category'];
  redirectTo?: string;
}

export interface MailRule {
  id: string;
  name: string;
  enabled: boolean;
  accountId?: string;
  matchMode: 'all' | 'any';
  conditions: RuleCondition[];
  actions: RuleActions;
  stopProcessing?: boolean;
  createdAt: string;
}

const RULES_STORAGE_KEY = 'anectta_mail_rules_v1';

export function loadMailRules(): MailRule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMailRules(rules: MailRule[]): void {
  try {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
}

function getEmailSizeKb(email: EmailItem): number {
  const bodyBytes = (email.body || '').length + (email.bodyHtml || '').length;
  const attBytes = (email.attachments || []).reduce((sum, a) => sum + (a.size || 0), 0);
  return Math.max(1, Math.round((bodyBytes + attBytes) / 1024));
}

function getFieldText(email: EmailItem, field: RuleConditionField): string {
  switch (field) {
    case 'sender':
      return `${email.sender || ''} ${email.senderEmail || ''}`.toLowerCase().trim();
    case 'subject':
      return (email.subject || '').toLowerCase();
    case 'body':
      return `${email.snippet || ''} ${email.body || ''}`.toLowerCase();
    case 'recipient':
      return (email.recipient || '').toLowerCase();
    case 'folder':
      return (email.folder || '').toLowerCase();
    case 'any':
    default:
      return `${email.sender || ''} ${email.senderEmail || ''} ${email.recipient || ''} ${email.subject || ''} ${email.snippet || ''} ${email.body || ''}`.toLowerCase();
  }
}

function matchesCondition(email: EmailItem, condition: RuleCondition): boolean {
  if (condition.field === 'has_attachment') {
    const hasAtt = Boolean(email.hasAttachment || (email.attachments && email.attachments.length > 0));
    return condition.operator === 'is_false' ? !hasAtt : hasAtt;
  }

  if (condition.field === 'size') {
    const thresholdKb = Number(condition.value);
    if (isNaN(thresholdKb) || thresholdKb < 0) return false;
    const sizeKb = getEmailSizeKb(email);
    if (condition.operator === 'less_than') return sizeKb < thresholdKb;
    return sizeKb > thresholdKb;
  }

  const needle = (condition.value || '').toLowerCase().trim();
  if (!needle) return false;
  const hay = getFieldText(email, condition.field);

  switch (condition.operator) {
    case 'contains':
      return hay.includes(needle);
    case 'not_contains':
      return !hay.includes(needle);
    case 'equals':
      return hay === needle || (condition.field === 'sender' && (email.senderEmail || '').toLowerCase().trim() === needle);
    case 'starts_with':
      return hay.startsWith(needle);
    case 'ends_with':
      return hay.endsWith(needle);
    default:
      return false;
  }
}

export function matchesRule(email: EmailItem, rule: MailRule): boolean {
  if (!rule.enabled) return false;
  if (rule.accountId && email.accountId && rule.accountId !== email.accountId) {
    return false;
  }
  const validConditions = (rule.conditions || []).filter(
    (c) => c.field === 'has_attachment' || (c.value && c.value.trim().length > 0)
  );
  if (validConditions.length === 0) return false;

  if (rule.matchMode === 'any') {
    return validConditions.some((c) => matchesCondition(email, c));
  }
  return validConditions.every((c) => matchesCondition(email, c));
}

export function evaluateRulesForEmail(
  email: EmailItem,
  rules: MailRule[]
): { email: EmailItem; matched: boolean } {
  let updated = email;
  let matchedAny = false;

  for (const rule of rules) {
    if (!matchesRule(updated, rule)) continue;
    matchedAny = true;

    const next: EmailItem = { ...updated };
    if (rule.actions.moveToFolder) {
      next.folder = rule.actions.moveToFolder;
    }
    if (rule.actions.markAsRead) {
      next.isRead = true;
    }
    if (rule.actions.markAsStarred) {
      next.isStarred = true;
    }
    if (rule.actions.markAsImportant) {
      next.isImportant = true;
    }
    if (rule.actions.setPriority) {
      next.priority = rule.actions.setPriority;
    }
    if (rule.actions.setCategory) {
      next.category = rule.actions.setCategory;
    }
    updated = next;

    if (rule.stopProcessing) {
      break;
    }
  }

  return { email: updated, matched: matchedAny };
}

export function applyRulesToEmails(
  emails: EmailItem[],
  rules: MailRule[],
  onlyIds?: Set<string>
): { emails: EmailItem[]; affectedCount: number } {
  if (!rules || rules.length === 0) {
    return { emails, affectedCount: 0 };
  }
  const activeRules = rules.filter((r) => r.enabled);
  if (activeRules.length === 0) {
    return { emails, affectedCount: 0 };
  }

  let affectedCount = 0;
  const nextEmails = emails.map((item) => {
    if (onlyIds && !onlyIds.has(item.id)) return item;
    const { email: evaluated, matched } = evaluateRulesForEmail(item, activeRules);
    if (matched) {
      affectedCount++;
    }
    return evaluated;
  });

  return { emails: nextEmails, affectedCount };
}

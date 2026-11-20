import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Mail,
  Paperclip,
  StickyNote,
  UserPlus,
  Building2,
  Phone,
  Briefcase,
  FileText,
  ExternalLink,
  Check,
  Clock,
  Tag,
} from 'lucide-react';
import { EmailItem } from '@/types/email';
import { CorporateContact } from './ContactsView';
import { SenderAvatar } from './SenderAvatar';
import { filterRealAttachments } from '../utils/attachmentUtils';
import { formatReceivedLabel, getEmailTimestampMs } from '../utils/dateSortUtils';

const EMAIL_NOTES_KEY = 'anectta_email_notes_v1';
const CONTACT_NOTES_KEY = 'anectta_contact_notes_v1';

export function getPrivateNoteForEmail(emailId: string): string {
  try {
    const raw = localStorage.getItem(EMAIL_NOTES_KEY);
    if (!raw) return '';
    const map = JSON.parse(raw);
    return typeof map?.[emailId] === 'string' ? map[emailId] : '';
  } catch {
    return '';
  }
}

function savePrivateNoteForEmail(emailId: string, note: string): void {
  try {
    const raw = localStorage.getItem(EMAIL_NOTES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (note.trim()) {
      map[emailId] = note;
    } else {
      delete map[emailId];
    }
    localStorage.setItem(EMAIL_NOTES_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('anectta:notes-updated', { detail: { emailId } }));
  } catch {
    // ignore
  }
}

function getPrivateNoteForContact(emailAddr: string): string {
  try {
    const key = emailAddr.trim().toLowerCase();
    if (!key) return '';
    const raw = localStorage.getItem(CONTACT_NOTES_KEY);
    if (!raw) return '';
    const map = JSON.parse(raw);
    return typeof map?.[key] === 'string' ? map[key] : '';
  } catch {
    return '';
  }
}

function savePrivateNoteForContact(emailAddr: string, note: string): void {
  try {
    const key = emailAddr.trim().toLowerCase();
    if (!key) return;
    const raw = localStorage.getItem(CONTACT_NOTES_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (note.trim()) {
      map[key] = note;
    } else {
      delete map[key];
    }
    localStorage.setItem(CONTACT_NOTES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

interface ContactContextSidebarProps {
  email: EmailItem;
  allEmails: EmailItem[];
  contacts: CorporateContact[];
  onClose: () => void;
  onSelectEmail: (id: string) => void;
  onAddContact?: (contact: { name: string; email: string }) => void;
  onComposeToContact?: (emailAddr: string) => void;
}

export const ContactContextSidebar: React.FC<ContactContextSidebarProps> = ({
  email,
  allEmails,
  contacts,
  onClose,
  onSelectEmail,
  onAddContact,
  onComposeToContact,
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'history' | 'attachments'>('notes');
  const contactEmail = (email.senderEmail || '').trim().toLowerCase();

  const savedContact = useMemo(
    () => contacts.find((c) => c.email.trim().toLowerCase() === contactEmail),
    [contacts, contactEmail]
  );

  const [emailNote, setEmailNote] = useState(() => getPrivateNoteForEmail(email.id));
  const [contactNote, setContactNote] = useState(() => getPrivateNoteForContact(contactEmail));
  const [savedFlag, setSavedFlag] = useState(false);

  useEffect(() => {
    setEmailNote(getPrivateNoteForEmail(email.id));
    setContactNote(getPrivateNoteForContact(contactEmail));
  }, [email.id, contactEmail]);

  const handleEmailNoteChange = (val: string) => {
    setEmailNote(val);
    savePrivateNoteForEmail(email.id, val);
    setSavedFlag(true);
    window.setTimeout(() => setSavedFlag(false), 1200);
  };

  const handleContactNoteChange = (val: string) => {
    setContactNote(val);
    savePrivateNoteForContact(contactEmail, val);
    setSavedFlag(true);
    window.setTimeout(() => setSavedFlag(false), 1200);
  };

  const contactHistory = useMemo(() => {
    if (!contactEmail) return [];
    return allEmails
      .filter((m) => {
        const s = (m.senderEmail || '').trim().toLowerCase();
        const r = (m.recipient || '').toLowerCase();
        return s === contactEmail || r.includes(contactEmail);
      })
      .sort((a, b) => getEmailTimestampMs(b) - getEmailTimestampMs(a))
      .slice(0, 40);
  }, [allEmails, contactEmail]);

  const sharedAttachments = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      size: number;
      path?: string;
      emailId: string;
      emailSubject: string;
      dateLabel: string;
    }> = [];
    for (const m of contactHistory) {
      if (!m.attachments || m.attachments.length === 0) continue;
      const real = filterRealAttachments(m.attachments, m.bodyHtml);
      for (const att of real) {
        items.push({
          id: `${m.id}-${att.id || att.name}`,
          name: att.name,
          size: att.size,
          path: att.path,
          emailId: m.id,
          emailSubject: m.subject || '(Sem assunto)',
          dateLabel: formatReceivedLabel(m),
        });
      }
    }
    return items.slice(0, 50);
  }, [contactHistory]);

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <aside className="w-80 shrink-0 bg-slate-950 border-l border-slate-800/90 flex flex-col h-full text-slate-200 overflow-hidden">
      {/* Top Bar */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Contexto & Mini-CRM
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Fechar painel lateral"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contact Profile Card */}
      <div className="p-4 border-b border-slate-800/80 space-y-3 shrink-0">
        <div className="flex items-center gap-3">
          <SenderAvatar
            name={savedContact?.name || email.sender}
            email={email.senderEmail}
            avatar={savedContact?.avatar || email.avatar}
            size={40}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-100 truncate">
              {savedContact?.name || email.sender}
            </h3>
            <p className="text-[11px] text-slate-400 font-mono truncate">{email.senderEmail}</p>
            {savedContact?.role && (
              <p className="text-[10px] text-brand-400 truncate mt-0.5 flex items-center gap-1">
                <Briefcase className="w-2.5 h-2.5 shrink-0" />
                <span>{savedContact.role}</span>
              </p>
            )}
          </div>
        </div>

        {(savedContact?.company || savedContact?.phone || (savedContact?.groups && savedContact.groups.length > 0)) && (
          <div className="space-y-1 text-[11px] text-slate-400 bg-slate-900/70 rounded-xl p-2.5 border border-slate-800/80">
            {savedContact.company && (
              <div className="flex items-center gap-1.5 truncate">
                <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{savedContact.company}</span>
              </div>
            )}
            {savedContact.phone && (
              <div className="flex items-center gap-1.5 truncate">
                <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{savedContact.phone}</span>
              </div>
            )}
            {savedContact.groups && savedContact.groups.length > 0 && (
              <div className="flex items-center gap-1.5 truncate">
                <Tag className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{savedContact.groups.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {onComposeToContact && email.senderEmail && (
            <button
              type="button"
              onClick={() => onComposeToContact(email.senderEmail)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold transition-colors"
            >
              <Mail className="w-3 h-3" />
              <span>Novo E-mail</span>
            </button>
          )}
          {!savedContact && onAddContact && email.senderEmail && (
            <button
              type="button"
              onClick={() => onAddContact({ name: email.sender, email: email.senderEmail })}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition-colors"
              title="Salvar nos Contatos"
            >
              <UserPlus className="w-3 h-3 text-emerald-400" />
              <span>Salvar</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-slate-800 text-[11px] font-semibold shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-amber-400 text-amber-300 bg-amber-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <StickyNote className="w-3 h-3" />
          <span>Notas</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-brand-400 text-brand-300 bg-brand-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-3 h-3" />
          <span>Histórico ({contactHistory.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attachments')}
          className={`py-2.5 flex items-center justify-center gap-1 border-b-2 transition-colors ${
            activeTab === 'attachments'
              ? 'border-sky-400 text-sky-300 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Paperclip className="w-3 h-3" />
          <span>Anexos ({sharedAttachments.length})</span>
        </button>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'notes' && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>Nota Privada deste E-mail</span>
                </label>
                {savedFlag && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Salvo
                  </span>
                )}
              </div>
              <textarea
                rows={4}
                value={emailNote}
                onChange={(e) => handleEmailNoteChange(e.target.value)}
                placeholder="Anote lembretes privados sobre este e-mail (visível apenas para você)..."
                className="w-full rounded-xl bg-amber-500/5 border border-amber-500/25 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-brand-400" />
                <span>Notas Gerais do Contato (CRM)</span>
              </label>
              <textarea
                rows={5}
                value={contactNote}
                onChange={(e) => handleContactNoteChange(e.target.value)}
                placeholder="Preferências, negociações em andamento, histórico comercial deste contato..."
                className="w-full rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
              />
              <p className="text-[10px] text-slate-500">
                Salvo localmente no seu computador. Nunca é enviado em respostas.
              </p>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            {contactHistory.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Nenhuma outra mensagem encontrada com este contato.
              </p>
            ) : (
              contactHistory.map((m) => {
                const isCurrent = m.id === email.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectEmail(m.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                      isCurrent
                        ? 'bg-brand-500/15 border-brand-500/40'
                        : 'bg-slate-900/70 hover:bg-slate-900 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-100 truncate">
                        {m.subject || '(Sem assunto)'}
                      </span>
                      <span className="text-[9px] text-slate-500 shrink-0">
                        {m.timestamp}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">
                      {m.snippet || m.body?.slice(0, 90)}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'attachments' && (
          <div className="space-y-2">
            {sharedAttachments.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                Nenhum anexo trocado com este contato.
              </p>
            ) : (
              sharedAttachments.map((att) => (
                <div
                  key={att.id}
                  className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-200 truncate">
                        {att.name}
                      </p>
                      <p className="text-[9px] text-slate-500 truncate">
                        {formatSize(att.size)} · {att.emailSubject}
                      </p>
                    </div>
                  </div>
                  {att.path ? (
                    <button
                      type="button"
                      onClick={() => window.electronAPI?.openAttachment?.(att.path!)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors shrink-0"
                      title="Abrir anexo"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectEmail(att.emailId)}
                      className="text-[10px] text-brand-400 hover:underline shrink-0"
                    >
                      Ver e-mail
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

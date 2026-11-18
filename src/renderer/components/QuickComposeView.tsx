import React, { useState, useEffect } from 'react';
import { loadSettingsLocal } from '../utils/secureSettingsStorage';
import {
  X,
  Send,
  AlertCircle,
  Zap,
  Paperclip,
  Download,
  AlertTriangle,
  FileText,
  Plus,
} from 'lucide-react';
import { PriorityLevel } from '@/types/email';
import { AppSettings, DEFAULT_SETTINGS } from '@/types/settings';
import { RecentFileItem } from '../../types/electron';
import { EmailSending } from './animated-icons';
import logoImg from '../assets/logo.png';

export const QuickComposeView: React.FC = () => {
  const [settings] = useState<AppSettings>(() => {
    try {
      const saved = loadSettingsLocal<AppSettings>();
      return saved ? saved : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const accounts = settings.accounts && settings.accounts.length > 0 ? settings.accounts : [settings.account];
  const [fromAccountId, setFromAccountId] = useState<string>(settings.activeAccountId || accounts[0]?.id || '');

  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string; size: number }>>([]);
  const [recentDownloads, setRecentDownloads] = useState<RecentFileItem[]>([]);
  const [showMissingAttachmentAlert, setShowMissingAttachmentAlert] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successBanner, setSuccessBanner] = useState(false);

  const selectedSendingAccount = accounts.find((a) => a.id === fromAccountId) || accounts[0];

  useEffect(() => {
    if (window.electronAPI?.getRecentDownloads) {
      window.electronAPI
        .getRecentDownloads()
        .then((files) => setRecentDownloads(files || []))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.electronAPI?.closeQuickCompose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleSubmit(e as any);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recipient, subject, body, priority, selectedSendingAccount, attachments]);

  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handlePickFiles = async () => {
    if (!window.electronAPI?.openFileDialog) return;
    try {
      const selected = await window.electronAPI.openFileDialog();
      if (selected && selected.length > 0) {
        setAttachments((prev) => {
          const existingPaths = new Set(prev.map((a) => a.path));
          const newOnes = selected.filter((s) => !existingPaths.has(s.path));
          return [...prev, ...newOnes];
        });
      }
    } catch (err: any) {
      console.warn('Erro ao abrir diálogo de arquivos:', err);
    }
  };

  const handleAddRecentDownload = (file: RecentFileItem) => {
    setAttachments((prev) => {
      if (prev.some((a) => a.path === file.path)) return prev;
      return [...prev, { name: file.name, path: file.path, size: file.size }];
    });
  };

  const handleRemoveAttachment = (filePath: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== filePath));
  };

  const executeSend = async () => {
    setIsSending(true);
    setErrorMessage('');

    try {
      const outgoing = selectedSendingAccount?.outgoingServer;
      const incoming = selectedSendingAccount?.incomingServer;
      const useCustomSmtp = outgoing?.authMode === 'custom_credentials';
      const smtpUser = useCustomSmtp
        ? outgoing?.username || incoming?.username || selectedSendingAccount.email
        : incoming?.username || selectedSendingAccount.email || outgoing?.username;
      const smtpPassword = useCustomSmtp
        ? outgoing?.password || incoming?.password || selectedSendingAccount.password || ''
        : incoming?.password || selectedSendingAccount.password || outgoing?.password || '';

      const smtpHost =
        outgoing?.host &&
        !(outgoing.host === 'email-ssl.com.br' && incoming?.host && !incoming.host.includes('email-ssl.com.br'))
          ? outgoing.host
          : incoming?.host
          ? incoming.host.replace(/^(pop3?|imap4?)\./i, 'smtp.')
          : outgoing?.host || '';

      const signatureToAppend = selectedSendingAccount.signature
        ? `\n\n--\n${selectedSendingAccount.signature}`
        : '';
      const fullBody = `${body}${signatureToAppend}`;

      if (window.electronAPI?.sendRealEmail && smtpHost && smtpPassword) {
        const res = await window.electronAPI.sendRealEmail(
          {
            host: smtpHost,
            incomingHost: incoming?.host || '',
            port: outgoing?.port || 465,
            secure: (outgoing?.port || 465) === 465,
            user: smtpUser,
            pass: smtpPassword,
          },
          {
            sender: selectedSendingAccount.displayName || selectedSendingAccount.email,
            recipient: recipient.trim(),
            subject: subject.trim(),
            body: fullBody,
            attachments,
          }
        );

        if (!res.success) {
          throw new Error(res.error || 'Falha ao despachar mensagem pelo servidor SMTP');
        }
      }

      setSuccessBanner(true);
      setTimeout(() => {
        window.electronAPI?.closeQuickCompose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao enviar e-mail. Verifique a conexão com o servidor.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient.trim() || !subject.trim() || !body.trim()) {
      setErrorMessage('Preencha destinatário, assunto e corpo da mensagem.');
      return;
    }

    const mentionsAttachment = /(anexo|anexei|anexado|segue anexo|em anexo|anexando|anexos)/i.test(body);
    if (mentionsAttachment && attachments.length === 0) {
      setShowMissingAttachmentAlert(true);
      return;
    }

    await executeSend();
  };

  return (
    <div className="h-screen w-screen bg-slate-950/95 flex flex-col overflow-hidden text-slate-200 font-sans border border-slate-700/80 rounded-2xl shadow-2xl backdrop-blur-xl">
      {/* Frameless Drag Header */}
      <header className="h-10 bg-slate-925 border-b border-slate-800/80 px-3.5 flex items-center justify-between app-drag-region shrink-0">
        <div className="flex items-center space-x-2 app-no-drag">
          <img src={logoImg} alt="Anectta MAIL" className="w-4 h-4 object-contain" />
          <span className="text-xs font-bold text-white tracking-wide flex items-center space-x-1.5">
            <span>Quick Compose</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-brand-500/20 text-brand-300 border border-brand-500/30 rounded">
              Ctrl+Shift+E
            </span>
          </span>
        </div>

        <div className="flex items-center space-x-2 app-no-drag">
          <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
            Esc para fechar
          </kbd>
          <button
            onClick={() => window.electronAPI?.closeQuickCompose()}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col p-4 space-y-2.5 overflow-hidden app-no-drag">
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {showMissingAttachmentAlert && (
          <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Você mencionou anexo! Deseja enviar sem arquivos?</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowMissingAttachmentAlert(false);
                  handlePickFiles();
                }}
                className="px-2 py-0.5 bg-amber-500/30 border border-amber-500/50 rounded text-amber-100 text-[11px]"
              >
                Anexar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMissingAttachmentAlert(false);
                  executeSend();
                }}
                className="px-2 py-0.5 bg-slate-800 rounded text-slate-300 text-[11px]"
              >
                Enviar
              </button>
            </div>
          </div>
        )}

        {successBanner && (
          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in">
            <Zap className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>E-mail corporativo enviado com sucesso! Fechando...</span>
          </div>
        )}

        {/* De: Selector */}
        {accounts.length > 0 && (
          <div className="flex items-center border-b border-slate-800/80 pb-1.5">
            <span className="w-14 text-xs text-slate-400 font-medium">De:</span>
            <select
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-200 focus:outline-none font-mono cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-slate-900 text-slate-200">
                  {acc.displayName ? `${acc.displayName} <${acc.email}>` : acc.email} (
                  {(acc.incomingServer?.protocol || 'imap').toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Para: Input */}
        <div className="flex items-center border-b border-slate-800/80 pb-1.5">
          <span className="w-14 text-xs text-slate-400 font-medium">Para:</span>
          <input
            type="email"
            required
            autoFocus
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="destinatario@empresa.com.br"
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono"
          />
        </div>

        {/* Assunto: Input */}
        <div className="flex items-center border-b border-slate-800/80 pb-1.5">
          <span className="w-14 text-xs text-slate-400 font-medium">Assunto:</span>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Assunto da mensagem..."
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
          />
        </div>

        {/* Prioridade */}
        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <span className="w-14 font-medium">Prioridade:</span>
          <div className="flex items-center space-x-1.5">
            {(['low', 'medium', 'high'] as PriorityLevel[]).map((lvl) => (
              <button
                type="button"
                key={lvl}
                onClick={() => setPriority(lvl)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all border ${
                  priority === lvl
                    ? lvl === 'high'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : lvl === 'medium'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                    : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
              >
                {lvl === 'high' ? 'Alta' : lvl === 'medium' ? 'Média' : 'Baixa'}
              </button>
            ))}
          </div>
        </div>

        {/* Body Textarea (Cor de fundo sempre fiel ao skin escolhido) */}
        <div
          style={{
            backgroundColor: 'var(--bg-app)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          className="compose-message-canvas flex-1 min-h-0 rounded-xl border p-3 flex flex-col"
        >
          <textarea
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={true}
            placeholder="Escreva sua mensagem rápida..."
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
            }}
            className="compose-message-field w-full h-full bg-transparent border-0 text-xs focus:outline-none resize-none font-sans leading-relaxed custom-scroll"
          />
        </div>

        {/* Anexos Inteligentes (Downloads) */}
        {recentDownloads.length > 0 && (
          <div className="py-1 flex items-center space-x-1.5 overflow-x-auto custom-scroll shrink-0">
            <span className="text-[10px] text-slate-400 flex items-center space-x-1 shrink-0 font-medium">
              <Download className="w-3 h-3 text-brand-400" />
              <span>Downloads:</span>
            </span>
            {recentDownloads.slice(0, 3).map((f) => {
              const isAdded = attachments.some((a) => a.path === f.path);
              return (
                <button
                  type="button"
                  key={f.path}
                  onClick={() => handleAddRecentDownload(f)}
                  disabled={isAdded}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] border truncate max-w-[130px] ${
                    isAdded
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                  title={f.name}
                >
                  <Plus className="w-2.5 h-2.5 text-brand-400 shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Attachments */}
        {attachments.length > 0 && (
          <div className="flex items-center space-x-1.5 overflow-x-auto py-1 shrink-0">
            {attachments.map((att) => (
              <span
                key={att.path}
                className="flex items-center space-x-1 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-200"
              >
                <FileText className="w-3 h-3 text-brand-400" />
                <span className="truncate max-w-[110px]">{att.name}</span>
                <span className="text-[9px] text-slate-400">({formatFileSize(att.size)})</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(att.path)}
                  className="text-slate-400 hover:text-rose-400 ml-1"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePickFiles}
              className="flex items-center space-x-1 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
            >
              <Paperclip className="w-3 h-3" />
              <span>Anexar...</span>
            </button>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              <kbd className="text-slate-400">Ctrl+Enter</kbd> envia
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => window.electronAPI?.closeQuickCompose()}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSending}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 active:scale-98 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-600/30 transition-all disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <EmailSending size={16} primaryColor="#ffffff" secondaryColor="#93c5fd" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar Agora</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

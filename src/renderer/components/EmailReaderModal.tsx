import React, { useEffect, useState } from 'react';
import { X, Maximize2, Minimize2, MailOpen } from 'lucide-react';
import { EmailItem } from '@/types/email';
import { EmailView } from './EmailView';
import { soundService } from '../services/soundService';

interface EmailReaderModalProps {
  isOpen: boolean;
  email: EmailItem | null;
  onClose: () => void;
  onArchive: (id?: string) => void;
  onSnooze: (id?: string) => void;
  onDelete: (id?: string) => void;
  onReply: (email: EmailItem) => void;
  onReplyAll?: (email: EmailItem) => void;
  onForward?: (email: EmailItem) => void;
  onAddContact?: (contact: { name: string; email: string }) => void;
  isSenderSaved?: boolean;
  onSendReadReceipt?: (email: EmailItem) => Promise<void> | void;
  blockExternalImages?: boolean;
  blockTrackingPixels?: boolean;
  blockBlockedSenders?: boolean;
  onChangePrivacySetting?: (
    key: 'blockExternalImages' | 'blockTrackingPixels' | 'blockBlockedSenders',
    value: boolean
  ) => void;
  getSenderBlockRule?: (senderEmail?: string) => string | null;
  threadMessages?: EmailItem[];
  onRespondCalendarInvite?: (
    email: EmailItem,
    status: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'
  ) => Promise<void> | void;
}

export const EmailReaderModal: React.FC<EmailReaderModalProps> = ({
  isOpen,
  email,
  onClose,
  onArchive,
  onSnooze,
  onDelete,
  onReply,
  onReplyAll,
  onForward,
  onAddContact,
  isSenderSaved = false,
  onSendReadReceipt,
  blockExternalImages = false,
  blockTrackingPixels = true,
  blockBlockedSenders = true,
  onChangePrivacySetting,
  getSenderBlockRule,
  threadMessages,
  onRespondCalendarInvite,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || !email) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-150 ${
          isMaximized
            ? 'w-[98vw] h-[95vh] max-w-none'
            : 'w-[92vw] max-w-5xl h-[90vh]'
        }`}
      >
        {/* Barra Superior da Caixa de Leitura (estilo Outlook Mensagem Aberta) */}
        <div className="h-10 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 min-w-0 pr-4">
            <MailOpen className="w-4 h-4 text-brand-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-200 truncate">
              {email.subject || '(Sem assunto)'}
            </span>
            <span className="text-[11px] text-slate-500 shrink-0 hidden sm:inline">
              — Mensagem
            </span>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundService.play('click');
                setIsMaximized((prev) => !prev);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title={isMaximized ? 'Restaurar tamanho' : 'Maximizar leitura'}
            >
              {isMaximized ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                soundService.play('click');
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Fechar caixa de leitura (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Conteúdo Completo do E-mail */}
        <div className="flex-1 flex overflow-hidden">
          <EmailView
            email={email}
            threadMessages={threadMessages}
            onRespondCalendarInvite={onRespondCalendarInvite}
            isModalMode={true}
            onAddContact={onAddContact}
            isSenderSaved={isSenderSaved}
            onSendReadReceipt={onSendReadReceipt}
            blockExternalImages={blockExternalImages}
            blockTrackingPixels={blockTrackingPixels}
            blockBlockedSenders={blockBlockedSenders}
            onChangePrivacySetting={onChangePrivacySetting}
            getSenderBlockRule={getSenderBlockRule}
            onArchive={(id) => {
              onArchive(id);
              onClose();
            }}
            onSnooze={(id) => {
              onSnooze(id);
              onClose();
            }}
            onDelete={(id) => {
              onDelete(id);
              onClose();
            }}
            onReply={(em) => {
              onClose();
              onReply(em);
            }}
            onReplyAll={
              onReplyAll
                ? (em) => {
                    onClose();
                    onReplyAll(em);
                  }
                : undefined
            }
            onForward={
              onForward
                ? (em) => {
                    onClose();
                    onForward(em);
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
};

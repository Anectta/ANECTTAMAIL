import React from 'react';
import {
  Archive,
  BellRing,
  CheckCircle2,
  Eye,
  Filter,
  MailX,
  MessageCircleQuestion,
  Reply,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { NotifierMascot } from './NotifierMascot';
import { soundService } from '@/services/soundService';
import type { EmailItem } from '@/types/email';
import { ageLabel, type AgendaItem, type AstroAgenda } from '../utils/astroAgenda';
import type { CleanupSuggestion } from '../utils/astroCleanup';

interface Props {
  agenda: AstroAgenda;
  followUpAfterDays: number;
  cleanup: CleanupSuggestion[];
  onClose: () => void;
  onOpen: (email: EmailItem) => void;
  onReply: (email: EmailItem) => void;
  onFollowUp: (email: EmailItem) => void;
  onDismiss: (id: string) => void;
  onArchiveSender: (s: CleanupSuggestion) => void;
  onUnsubscribeSender: (s: CleanupSuggestion) => void;
  onRuleForSender: (s: CleanupSuggestion) => void;
  onKeepSender: (s: CleanupSuggestion) => void;
}

const recipientLabel = (raw: string) => {
  const first = (raw || '').split(/[,;]/)[0].trim();
  const name = first.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  const extra = (raw || '').split(/[,;]/).filter((s) => s.trim()).length - 1;
  return `${name || first}${extra > 0 ? ` +${extra}` : ''}`;
};

/**
 * Painel do Astro: o que está aguardando a sua resposta e os e-mails que você enviou e
 * ninguém respondeu. Tudo é calculado no próprio computador.
 */
export const AstroAgendaPanel: React.FC<Props> = ({
  agenda,
  followUpAfterDays,
  cleanup,
  onClose,
  onOpen,
  onReply,
  onFollowUp,
  onDismiss,
  onArchiveSender,
  onUnsubscribeSender,
  onRuleForSender,
  onKeepSender,
}) => {
  const total = agenda.needsReply.length + agenda.awaitingAnswer.length + cleanup.length;
  const smallBtn =
    'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors';

  const row = (item: AgendaItem, kind: 'needsReply' | 'awaitingAnswer') => {
    const e = item.email;
    return (
      <li key={e.id} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-100 truncate">
              {kind === 'needsReply' ? e.sender || e.senderEmail : `Para: ${recipientLabel(e.recipient)}`}
            </p>
            <p className="text-xs text-slate-300 truncate">{e.subject || '(sem assunto)'}</p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5" title={item.keyPoint}>
              “{item.keyPoint}”
            </p>
          </div>
          <span className="text-[10px] text-slate-500 shrink-0">
            {kind === 'needsReply' ? `recebido ${ageLabel(item.ageDays)}` : `enviado ${ageLabel(item.ageDays)}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onOpen(e)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            <Eye className="w-3.5 h-3.5" />
            Abrir
          </button>
          {kind === 'needsReply' ? (
            <button
              type="button"
              onClick={() => onReply(e)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-600/90 hover:bg-sky-500 text-white"
            >
              <Reply className="w-3.5 h-3.5" />
              Responder
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onFollowUp(e)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/90 hover:bg-amber-400 text-slate-950"
            >
              <Send className="w-3.5 h-3.5" />
              Cobrar resposta
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              soundService.play('click');
              onDismiss(e.id);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-200"
            title="Tirar da lista (não volta a aparecer)"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Dispensar
          </button>
        </div>
      </li>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-16"
      style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
      onClick={onClose}
    >
      <div
        className="assistant-card w-full max-w-xl max-h-[80vh] flex flex-col rounded-2xl bg-slate-950 border border-sky-500/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Astro: pendências"
      >
        <header className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-slate-800">
          <div className="-my-1 shrink-0">
            <NotifierMascot size={48} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-sky-200">Astro</p>
            <p className="text-[10px] text-slate-400">Assistente Virtual · Pendências</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-5">
          {total === 0 && (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-slate-200">Tudo em dia!</p>
              <p className="text-xs mt-1">Nada aguardando sua resposta e nenhum e-mail enviado sem retorno.</p>
            </div>
          )}

          {agenda.needsReply.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-sky-300">
                <MessageCircleQuestion className="w-3.5 h-3.5" />
                Aguardando sua resposta ({agenda.needsReply.length})
              </h3>
              <ul className="space-y-2">{agenda.needsReply.map((i) => row(i, 'needsReply'))}</ul>
            </section>
          )}

          {agenda.awaitingAnswer.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <BellRing className="w-3.5 h-3.5" />
                Sem resposta há {followUpAfterDays}+ dias ({agenda.awaitingAnswer.length})
              </h3>
              <ul className="space-y-2">{agenda.awaitingAnswer.map((i) => row(i, 'awaitingAnswer'))}</ul>
            </section>
          )}

          {cleanup.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-teal-300">
                <Sparkles className="w-3.5 h-3.5" />
                Sugestões de limpeza ({cleanup.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Remetentes que mandam vários e-mails que você não abre. Nada é feito sem a sua confirmação.
              </p>
              <ul className="space-y-2">
                {cleanup.map((s) => (
                  <li key={s.senderEmail} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{s.senderName}</p>
                      <p className="text-[11px] text-slate-500 truncate">{s.senderEmail}</p>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        {s.count} e-mails nos últimos 30 dias, {s.opened === 0 ? 'nenhum aberto' : `só ${s.opened} aberto`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onArchiveSender(s)}
                        className={`${smallBtn} bg-teal-600/90 hover:bg-teal-500 text-white border-teal-500/40`}
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Arquivar todos ({s.inboxIds.length})
                      </button>
                      {s.canUnsubscribe && (
                        <button
                          type="button"
                          onClick={() => onUnsubscribeSender(s)}
                          className={`${smallBtn} bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700`}
                        >
                          <MailX className="w-3.5 h-3.5" />
                          Cancelar inscrição
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRuleForSender(s)}
                        className={`${smallBtn} bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700`}
                        title="Os próximos e-mails deste remetente vão direto para o Arquivo"
                      >
                        <Filter className="w-3.5 h-3.5" />
                        Criar regra
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          soundService.play('click');
                          onKeepSender(s);
                        }}
                        className={`${smallBtn} text-slate-400 hover:text-slate-200 border-transparent`}
                        title="Não sugerir mais este remetente"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Manter
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

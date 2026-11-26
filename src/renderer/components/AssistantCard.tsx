import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  EyeOff,
  Heart,
  KeyRound,
  ListTodo,
  MailCheck,
  Paperclip,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import type { EmailItem } from '@/types/email';
import { NotifierMascot } from './NotifierMascot';
import { buildInsights, DateMention } from '../utils/assistantInsights';
import { soundService } from '@/services/soundService';

const COLLAPSED_KEY = 'anectta_assistant_collapsed';

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

interface AssistantCardProps {
  email: EmailItem;
  onQuickReply?: (email: EmailItem, kind: 'confirm' | 'thanks') => void;
  onCreateEvent?: (email: EmailItem, when?: DateMention) => void;
  onCreateReminder?: (email: EmailItem, when?: DateMention) => void;
  /** Desliga o assistente (pode ser religado em Configurações → Aparência e Assistente). */
  onHide?: () => void;
  wide?: boolean;
  /** Ícones do Escudo Anectta, à direita das ações rápidas. */
  sideActions?: React.ReactNode;
}

/**
 * Amoroso — Assistente Anectta. Resumo rápido feito no próprio computador (sem IA externa):
 * fatos do e-mail (datas, valores, anexos, código, pedido de resposta) e ações de um clique.
 */
export const AssistantCard: React.FC<AssistantCardProps> = ({
  email,
  onQuickReply,
  onCreateEvent,
  onCreateReminder,
  onHide,
  wide = false,
  sideActions,
}) => {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [copied, setCopied] = useState(false);

  const insights = useMemo(
    () =>
      buildInsights({
        subject: email.subject,
        body: email.body,
        bodyHtml: email.bodyHtml,
        snippet: email.snippet,
        senderEmail: email.senderEmail,
        dateStr: email.receivedDateStr || email.dateStr,
        attachments: email.attachments,
        calendarInvite: email.calendarInvite,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [email.id, email.body, email.bodyHtml, email.snippet, email.attachments, email.calendarInvite]
  );

  const toggle = () => {
    soundService.play('pop');
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* preferência só desta máquina */
      }
      return next;
    });
  };

  const eventDate = insights.dates.find((d) => !d.isDeadline) || insights.dates[0];
  const reminderDate = insights.dates.find((d) => d.isDeadline) || insights.dates[0];

  const copyCode = async () => {
    if (!insights.code) return;
    try {
      await navigator.clipboard.writeText(insights.code);
      setCopied(true);
      soundService.play('pop');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sem acesso à área de transferência */
    }
  };

  const chip =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ' +
    'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/35 hover:border-sky-400/60 hover:shadow-[0_0_12px_rgba(56,189,248,0.25)]';

  return (
    <div
      className={`assistant-card relative rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-slate-900/40 to-indigo-500/10 shadow-[0_0_24px_rgba(56,189,248,0.08)] ${
        wide ? 'max-w-none' : 'max-w-3xl'
      }`}
    >
      {/* Cabeçalho: Amoroso + recolher/ocultar */}
      <div className={`flex items-center gap-3 ${collapsed ? 'px-3 py-1.5' : 'px-4 pt-3'}`}>
        <div className="shrink-0 -my-1">
          <NotifierMascot size={collapsed ? 34 : 56} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-extrabold text-sky-200 tracking-tight">Astro</span>
            {!collapsed && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/80">
                {insights.kindLabel}
              </span>
            )}
          </div>
          <span className="block text-[10px] font-medium text-slate-400 leading-tight">Assistente Virtual · Resumo rápido</span>
          {collapsed && (
            <p className="text-[11px] text-slate-300 truncate">
              <ArrowRight className="w-3 h-3 inline -mt-0.5 mr-1 text-sky-400" />
              {insights.nextStep}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {collapsed && sideActions && <div className="mr-2">{sideActions}</div>}
          {onHide && !collapsed && (
            <button
              type="button"
              onClick={() => {
                soundService.play('click');
                onHide();
              }}
              title="Ocultar o Astro (religue em Configurações → Aparência e Assistente)"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800/70 transition-colors cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Mostrar resumo' : 'Recolher'}
            aria-expanded={!collapsed}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-sky-300 hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 pb-3.5 pt-2 space-y-3">
          {/* Fatos */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2.5 space-y-1.5 text-xs min-w-0 [overflow-wrap:anywhere]">
            <div className="text-slate-200 leading-relaxed">
              <span className="font-semibold text-slate-400">Pontos-chave: </span>
              {insights.keyPoint}
            </div>

            {insights.dates.length > 0 && (
              <div className="flex items-start gap-2 text-slate-300">
                <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-400" />
                <span>
                  {insights.dates.map((d, i) => (
                    <span key={`${d.date}-${d.time || ''}`}>
                      {i > 0 && ' · '}
                      {d.label}
                      {d.isDeadline && <span className="ml-1 text-amber-400 font-semibold">(prazo)</span>}
                    </span>
                  ))}
                </span>
              </div>
            )}

            {insights.amounts.length > 0 && (
              <div className="flex items-center gap-2 text-slate-300">
                <Wallet className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="font-semibold">{insights.amounts.join(' · ')}</span>
              </div>
            )}

            {insights.attachments.length > 0 && (
              <div className="flex items-start gap-2 text-slate-300">
                <Paperclip className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                <span className="truncate">
                  {insights.attachments.length} anexo(s): {insights.attachments.slice(0, 3).join(', ')}
                  {insights.attachments.length > 3 ? '…' : ''}
                </span>
              </div>
            )}

            {insights.code && (
              <div className="flex items-center gap-2 text-slate-300">
                <KeyRound className="w-3.5 h-3.5 shrink-0 text-violet-400" />
                <span>
                  Código: <span className="font-mono font-bold tracking-widest text-slate-100">{insights.code}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-sky-300 hover:bg-sky-500/15 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            )}

            <div className="flex items-start gap-2 pt-1 border-t border-slate-800/80 text-slate-200">
              <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-400" />
              <span>
                <span className="font-semibold text-slate-400">Próximo passo: </span>
                {insights.nextStep}
              </span>
            </div>
          </div>

          {/* Ações rápidas (à esquerda) e ícones do Escudo Anectta (à direita) */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Ações rápidas</div>
            <div className="flex flex-wrap gap-1.5">
              {onQuickReply && !insights.automated && (
                <>
                  <button type="button" className={chip} onClick={() => onQuickReply(email, 'confirm')}>
                    <MailCheck className="w-3.5 h-3.5" /> Confirmar recebimento
                  </button>
                  <button type="button" className={chip} onClick={() => onQuickReply(email, 'thanks')}>
                    <Heart className="w-3.5 h-3.5" /> Agradecer
                  </button>
                </>
              )}
              {onCreateEvent && (
                <button
                  type="button"
                  className={chip}
                  title={eventDate ? `Criar na Agenda: ${eventDate.label}` : 'Criar na Agenda (amanhã, 9h — ajuste depois)'}
                  onClick={() => onCreateEvent(email, eventDate)}
                >
                  <CalendarPlus className="w-3.5 h-3.5" /> Criar compromisso
                </button>
              )}
              {onCreateReminder && (
                <button
                  type="button"
                  className={chip}
                  title={reminderDate ? `Lembrete para ${reminderDate.label}` : 'Lembrete para amanhã, 9h'}
                  onClick={() => onCreateReminder(email, reminderDate)}
                >
                  <ListTodo className="w-3.5 h-3.5" /> Criar lembrete
                </button>
              )}
            </div>
          </div>
          {sideActions && <div className="ml-auto">{sideActions}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

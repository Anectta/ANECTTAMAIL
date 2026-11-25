import React from 'react';
import { BellRing, CalendarClock, CheckCircle2, MessageCircleQuestion, Newspaper, Receipt, Star, X } from 'lucide-react';
import { NotifierMascot } from './NotifierMascot';
import type { EmailItem } from '@/types/email';
import type { DailyDigest } from '../utils/astroDaily';

interface Props {
  digest: DailyDigest;
  needsReply: number;
  awaitingAnswer: number;
  onClose: () => void;
  onOpenEmail: (email: EmailItem) => void;
  onOpenPending: () => void;
}

const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h < 12 ? 'Bom dia!' : h < 18 ? 'Boa tarde!' : 'Boa noite!';
};

/** Resumo do dia do Astro: o que precisa de atenção hoje. */
export const AstroDailyPanel: React.FC<Props> = ({ digest, needsReply, awaitingAnswer, onClose, onOpenEmail, onOpenPending }) => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const counters = [
    { icon: MessageCircleQuestion, label: 'Aguardam sua resposta', value: needsReply, color: 'text-sky-300' },
    { icon: BellRing, label: 'Enviados sem resposta', value: awaitingAnswer, color: 'text-amber-300' },
    { icon: Star, label: 'VIPs não lidos', value: digest.vipUnread.length, color: 'text-amber-300' },
    { icon: Newspaper, label: 'Newsletters não lidas', value: digest.newslettersUnread, color: 'text-slate-300' },
  ];
  const nothing =
    needsReply + awaitingAnswer + digest.vipUnread.length + digest.payments.length + digest.meetings.length === 0;

  const row = (e: EmailItem, left: React.ReactNode, right?: React.ReactNode, tone = 'border-slate-800') => (
    <li key={e.id}>
      <button
        type="button"
        onClick={() => onOpenEmail(e)}
        className={`w-full text-left p-2.5 rounded-xl bg-slate-900/70 hover:bg-slate-800 border ${tone} flex items-center gap-2`}
      >
        <span className="min-w-0 flex-1">{left}</span>
        {right}
      </button>
    </li>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-14" style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)' }} onClick={onClose}>
      <div
        className="assistant-card w-full max-w-xl max-h-[82vh] flex flex-col rounded-2xl bg-slate-950 border border-sky-500/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Resumo do dia do Astro"
      >
        <header className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-slate-800">
          <div className="-my-1 shrink-0">
            <NotifierMascot size={52} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-sky-200">{greeting()} Aqui está o seu dia.</p>
            <p className="text-[11px] text-slate-400 first-letter:uppercase">Astro · Resumo do dia · {today}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {counters.map((c) => (
              <div key={c.label} className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
                <c.icon className={`w-4 h-4 ${c.color}`} />
                <p className="text-lg font-extrabold text-white leading-tight mt-1">{c.value}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{c.label}</p>
              </div>
            ))}
          </div>

          {nothing && (
            <div className="text-center py-6 text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-slate-200">Nada urgente hoje.</p>
              <p className="text-xs mt-1">Sem pagamentos próximos, reuniões ou respostas pendentes.</p>
            </div>
          )}

          {digest.payments.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                <Receipt className="w-3.5 h-3.5" /> Pagamentos e prazos ({digest.payments.length})
              </h3>
              <ul className="space-y-1.5">
                {digest.payments.map((p) =>
                  row(
                    p.email,
                    <>
                      <span className="block text-xs font-semibold text-slate-100 truncate">
                        {p.overdue ? 'Venceu' : 'Vence'} {p.label}
                        {p.amount ? ` · ${p.amount}` : ''}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {p.email.sender || p.email.senderEmail} — {p.email.subject}
                      </span>
                    </>,
                    p.overdue ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 shrink-0">vencido</span>
                    ) : undefined,
                    p.overdue ? 'border-rose-500/40' : 'border-slate-800'
                  )
                )}
              </ul>
            </section>
          )}

          {digest.meetings.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                <CalendarClock className="w-3.5 h-3.5" /> Reuniões hoje e amanhã ({digest.meetings.length})
              </h3>
              <ul className="space-y-1.5">
                {digest.meetings.map((m) =>
                  row(
                    m.email,
                    <>
                      <span className="block text-xs font-semibold text-slate-100 truncate">{m.label}</span>
                      <span className="block text-[11px] text-slate-500 truncate">
                        {m.email.sender || m.email.senderEmail} — {m.email.subject}
                      </span>
                    </>
                  )
                )}
              </ul>
            </section>
          )}

          {digest.vipUnread.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <Star className="w-3.5 h-3.5" /> VIPs não lidos ({digest.vipUnread.length})
              </h3>
              <ul className="space-y-1.5">
                {digest.vipUnread.map((e) =>
                  row(
                    e,
                    <>
                      <span className="block text-xs font-semibold text-slate-100 truncate">⭐ {e.sender || e.senderEmail}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{e.subject}</span>
                    </>
                  )
                )}
              </ul>
            </section>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-800">
          <span className="text-[10px] text-slate-500">Calculado no seu computador. Aparece uma vez por dia.</span>
          <div className="flex gap-2">
            {needsReply + awaitingAnswer > 0 && (
              <button type="button" onClick={onOpenPending} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white">
                Ver pendências
              </button>
            )}
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white">
              Fechar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

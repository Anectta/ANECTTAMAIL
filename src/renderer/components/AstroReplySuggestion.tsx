import React, { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, FileText, MailCheck, ShieldAlert, Sparkles } from 'lucide-react';
import type { EmailItem } from '@/types/email';
import { ACTION_LABELS, CATEGORY_LABELS, TRIGGER_LABELS } from '../../shared/astro/labels';
import type { AstroDecisionView } from '../../types/electron';

type SimilarItem = {
  pairId: number;
  inboundId: string;
  outboundId: string;
  similarity: number;
  subject: string;
  question: string;
  answer: string;
  answeredAtMs: number;
};

interface Props {
  email: EmailItem;
  /** Conta à qual o e-mail pertence. */
  accountEmail?: string;
  /** Endereços de todas as contas do usuário. */
  myAddresses: string[];
  senderBlocked: boolean;
  phishingDanger: boolean;
  replyToSuspicious: boolean;
  onUseDraft?: (email: EmailItem, decision: AstroDecisionView) => void;
  onOpenEmailById?: (id: string) => void;
  wide?: boolean;
}

/** Travas que não precisam aparecer como aviso (são escolha do usuário ou já ditas no texto). */
const QUIET_TRIGGERS = new Set(['autonomia', 'historico_insuficiente', 'sem_padrao']);

/**
 * Astro Respostas Inteligentes — sugestão para o e-mail aberto, com o "selo de transparência":
 * confiança, quantos e-mails parecidos foram usados (com links para abrir cada um), travas e
 * dados de outros clientes removidos. Só aparece nas contas em que a opção está ligada.
 */
export const AstroReplySuggestion: React.FC<Props> = ({
  email,
  accountEmail,
  myAddresses,
  senderBlocked,
  phishingDanger,
  replyToSuspicious,
  onUseDraft,
  onOpenEmailById,
  wide = false,
}) => {
  const api = window.electronAPI;
  const [decision, setDecision] = useState<AstroDecisionView | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [sources, setSources] = useState<SimilarItem[] | null>(null);
  const [showSources, setShowSources] = useState(false);

  useEffect(() => {
    setDecision(null);
    setSources(null);
    setShowSources(false);
    if (!api?.astroEvaluate || !api.astroGetConfig || !accountEmail || email.folder !== 'inbox') return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await api.astroGetConfig!(accountEmail);
        if (cancelled || !cfg || cfg.autonomy === 'desligado') return;
        const d = await api.astroEvaluate!({ accountEmail, emailId: email.id, myAddresses, senderBlocked, phishingDanger, replyToSuspicious });
        if (!cancelled) setDecision(d);
      } catch {
        // Banco local indisponível: o e-mail abre normalmente, sem sugestão
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.id, accountEmail, senderBlocked, phishingDanger, replyToSuspicious]);

  const loadSources = async () => {
    setShowSources((v) => !v);
    if (sources || !api?.astroFindSimilar || !accountEmail || !decision) return;
    const list = (await api.astroFindSimilar({ accountEmail, emailId: email.id })) || [];
    const used = new Set(decision.pares_utilizados_ids);
    setSources(list.filter((s) => used.has(s.pairId)));
  };

  if (!decision) return null;
  // E-mails automáticos/promocionais: o Astro só classifica, sem ocupar espaço
  if (decision.categoria === 'automatico' && decision.acao === 'apenas_classificar') return null;

  const width = wide ? 'max-w-none' : 'max-w-3xl';
  const warnings = decision.travas_acionadas.filter((t) => !QUIET_TRIGGERS.has(t));
  const pct = Math.round(decision.score_confianca * 100);
  const used = decision.pares_utilizados_ids.length;

  // Ainda aprendendo / apenas classificar: linha discreta
  if (!decision.resposta_sugerida) {
    const needsYou = decision.acao === 'escalar_humano';
    return (
      <div
        className={`${width} flex items-start gap-2 px-3 py-2 rounded-xl border text-[11px] ${
          needsYou ? 'border-amber-500/30 bg-amber-500/5 text-amber-100' : 'border-slate-800 bg-slate-900/50 text-slate-300'
        }`}
      >
        <Sparkles className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${needsYou ? 'text-amber-400' : 'text-sky-400'}`} />
        <span>
          <strong>Astro · {CATEGORY_LABELS[decision.categoria as keyof typeof CATEGORY_LABELS] || 'Mensagem'}</strong>
          {' · '}
          {ACTION_LABELS[decision.acao]}. {decision.justificativa}
        </span>
      </div>
    );
  }

  return (
    <div className={`${width} rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-slate-900/40 to-indigo-500/10`}>
      {/* Selo de transparência */}
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left">
        <span className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs text-slate-200 truncate">
            <strong className="text-sky-200">Astro sugeriu esta resposta</strong> ({pct}% de confiança)
            {used > 0 ? ` com base em ${used} ${used === 1 ? 'e-mail parecido' : 'e-mails parecidos'}` : ''}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/80">
            {CATEGORY_LABELS[decision.categoria as keyof typeof CATEGORY_LABELS] || 'Mensagem'}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3.5 space-y-2.5">
          {warnings.length > 0 && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-200">
              <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
              <span>Revise antes de enviar: {warnings.map((t) => TRIGGER_LABELS[t as keyof typeof TRIGGER_LABELS] || t).join('; ')}.</span>
            </div>
          )}
          {decision.dados_removidos.length > 0 && (
            <div className="text-[11px] text-slate-400">
              O Astro removeu {decision.dados_removidos.length}{' '}
              {decision.dados_removidos.length === 1 ? 'dado de outro cliente' : 'dados de outros clientes'} da resposta antiga.
            </div>
          )}

          <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2.5">
            <div className="text-[10px] text-slate-500 mb-1">
              Para: {decision.resposta_sugerida.para} · {decision.resposta_sugerida.assunto}
            </div>
            <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{decision.resposta_sugerida.corpo}</div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onUseDraft?.(email, decision)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold"
            >
              <MailCheck className="w-3.5 h-3.5" /> Usar este rascunho
            </button>
            {used > 0 && (
              <button
                type="button"
                onClick={() => void loadSources()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-[11px]"
              >
                <FileText className="w-3.5 h-3.5" /> {showSources ? 'Ocultar' : 'Ver'} e-mails usados como base
              </button>
            )}
            <span className="text-[10px] text-slate-500">Você revisa e envia; nada sai sem você.</span>
          </div>

          {showSources && (
            <div className="space-y-1.5">
              {!sources ? (
                <div className="text-[11px] text-slate-500">Carregando…</div>
              ) : sources.length === 0 ? (
                <div className="text-[11px] text-slate-500">Os e-mails de referência não estão mais no computador.</div>
              ) : (
                sources.map((s) => (
                  <div key={s.pairId} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 truncate">
                        {s.subject || '(sem assunto)'} · {Math.round(s.similarity * 100)}% parecido ·{' '}
                        {new Date(s.answeredAtMs).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => onOpenEmailById?.(s.inboundId)} className="text-sky-300 hover:underline inline-flex items-center gap-0.5">
                          Pergunta <ExternalLink className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => onOpenEmailById?.(s.outboundId)} className="text-sky-300 hover:underline inline-flex items-center gap-0.5">
                          Sua resposta <ExternalLink className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                    <div className="text-slate-500 mt-0.5 line-clamp-2">“{s.answer}”</div>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="text-[10px] text-slate-500">{decision.justificativa}</div>
        </div>
      )}
    </div>
  );
};

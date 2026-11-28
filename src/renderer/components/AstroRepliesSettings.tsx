import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { AUTONOMY_OPTIONS } from '../../shared/astro/labels';
import { astroLastLearnKey } from '../hooks/useAstroAutoLearning';
import type { AstroLearningStatus, AstroReplyConfigView, AstroStyleProfile } from '../../types/electron';

interface AccountLite {
  email: string;
  displayName?: string;
}

interface ProfileInfo {
  profile: AstroStyleProfile | null;
  pairCount: number;
  approvedDrafts: number;
  minPairs: number;
  minStyleSamples: number;
  minApprovedDrafts: number;
}

const PHASE_LABEL: Record<AstroLearningStatus['phase'], string> = {
  parado: 'Parado',
  pareando: 'Procurando suas conversas…',
  estilo: 'Lendo seus e-mails enviados…',
  lendo_pares: 'Aprendendo com as suas respostas…',
  concluido: 'Aprendizado concluído',
  erro: 'Erro no aprendizado',
};

const Bar: React.FC<{ value: number; max: number; label: string }> = ({ value, max, label }) => {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const done = value >= max;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-300">{label}</span>
        <span className={done ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
          {Math.min(value, max)}/{max}
          {done ? ' ✓' : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

/**
 * Configurações → Aparência e Assistente → "Astro Respostas Inteligentes" (por conta).
 * As mudanças são salvas na hora no banco do Astro (não dependem de "Salvar Alterações").
 */
export const AstroRepliesSettings: React.FC<{ accounts: AccountLite[] }> = ({ accounts }) => {
  const api = window.electronAPI;
  const available = Boolean(api?.astroGetConfig);
  const accountList = useMemo(() => accounts.filter((a) => a?.email), [accounts]);
  const [account, setAccount] = useState(() => accountList[0]?.email || '');
  const [config, setConfig] = useState<AstroReplyConfigView | null>(null);
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [status, setStatus] = useState<AstroLearningStatus | null>(null);
  const [pendingAutonomy, setPendingAutonomy] = useState<AstroReplyConfigView['autonomy'] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [closing, setClosing] = useState('');

  const myAddresses = useMemo(() => accountList.map((a) => a.email.toLowerCase()), [accountList]);

  const refresh = useCallback(async () => {
    if (!api?.astroGetConfig || !account) return;
    const [c, p, s] = await Promise.all([
      api.astroGetConfig(account),
      api.astroGetProfile?.(account) ?? null,
      api.astroLearnStatus?.(account) ?? null,
    ]);
    setConfig(c);
    setInfo(p);
    setStatus(s);
    setGreeting(c?.greetingOverride || '');
    setClosing(c?.closingOverride || '');
  }, [api, account]);

  useEffect(() => {
    if (!account && accountList[0]) setAccount(accountList[0].email);
  }, [account, accountList]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Progresso do aprendizado em tempo real
  useEffect(() => {
    if (!api?.onAstroLearnProgress) return;
    return api.onAstroLearnProgress((s) => {
      if (s.accountEmail !== account.toLowerCase()) return;
      setStatus(s);
      if (!s.running) void refresh();
    });
  }, [api, account, refresh]);

  const save = async (patch: Partial<AstroReplyConfigView>) => {
    if (!api?.astroSetConfig || !account) return null;
    const next = await api.astroSetConfig({ accountEmail: account, patch });
    if (next) setConfig(next);
    return next;
  };

  const startLearning = async () => {
    if (!api?.astroLearnStart || !account) return;
    const s = await api.astroLearnStart({ accountEmail: account, myAddresses });
    if (s) setStatus(s);
    try {
      localStorage.setItem(astroLastLearnKey(account), String(Date.now()));
    } catch {}
  };

  const chooseAutonomy = async (value: AstroReplyConfigView['autonomy']) => {
    if (!config || value === config.autonomy) return;
    if (value === 'automatico' && (info?.approvedDrafts ?? 0) < (info?.minApprovedDrafts ?? 20)) return;
    // Ao ligar pela primeira vez: termo de consentimento antes
    if (config.autonomy === 'desligado' && value !== 'desligado') {
      setPendingAutonomy(value);
      return;
    }
    await save({ autonomy: value });
  };

  const confirmActivation = async () => {
    if (!pendingAutonomy) return;
    const next = await save({ autonomy: pendingAutonomy });
    setPendingAutonomy(null);
    if (next && next.autonomy !== 'desligado') await startLearning();
  };

  if (!available) {
    return (
      <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-[11px] text-slate-400">
        Astro Respostas Inteligentes está disponível no aplicativo instalado.
      </div>
    );
  }
  if (accountList.length === 0) return null;

  const enabled = !!config && config.autonomy !== 'desligado';
  const running = !!status?.running;
  const autoLocked = (info?.approvedDrafts ?? 0) < (info?.minApprovedDrafts ?? 20);
  const profile = info?.profile || null;
  const pct = status?.total ? Math.round(((status.done || 0) / status.total) * 100) : 0;

  return (
    <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3.5">
      {/* Cabeçalho + conta */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            Astro Respostas Inteligentes
          </div>
          <div className="text-[11px] text-slate-400">
            O Astro aprende o seu jeito de escrever e sugere respostas baseadas nas que você já enviou. Tudo fica no seu
            computador, cifrado. Configuração por conta, salva na hora.
          </div>
        </div>
        {accountList.length > 1 && (
          <select
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setPendingAutonomy(null);
              setConfirmClear(false);
            }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500 max-w-[240px]"
            aria-label="Conta"
          >
            {accountList.map((a) => (
              <option key={a.email} value={a.email}>
                {a.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Autonomia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {AUTONOMY_OPTIONS.map((opt) => {
          const active = config?.autonomy === opt.value;
          const locked = opt.value === 'automatico' && autoLocked;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={!config || locked}
              onClick={() => void chooseAutonomy(opt.value)}
              title={locked ? `Liberado após ${info?.minApprovedDrafts ?? 20} rascunhos aprovados` : opt.description}
              className={`text-left p-2.5 rounded-lg border transition-colors ${
                active ? 'border-brand-500 bg-brand-500/15' : 'border-slate-800 hover:border-slate-600 bg-slate-950/40'
              } ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`text-[11px] font-semibold flex items-center gap-1 ${active ? 'text-white' : 'text-slate-200'}`}>
                {locked && <Lock className="w-3 h-3" />}
                {opt.label}
              </div>
              <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{opt.description}</div>
            </button>
          );
        })}
      </div>

      {/* Termo ao ligar */}
      {pendingAutonomy && (
        <div className="p-3 rounded-lg border border-sky-500/40 bg-sky-500/10 space-y-2">
          <div className="text-[11px] font-semibold text-sky-200 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Antes de ativar nesta conta ({account})
          </div>
          <ul className="text-[11px] text-slate-300 list-disc pl-4 space-y-0.5">
            <li>O Astro vai ler os e-mails desta conta que já estão no computador (últimos 12 meses), incluindo os enviados.</li>
            <li>O que ele aprende fica só no seu computador, cifrado. Nada é enviado para fora.</li>
            <li>E-mails recebidos antes de agora nunca são respondidos sozinhos.</li>
            <li>Você pode desligar ou apagar o que ele aprendeu a qualquer momento.</li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => void confirmActivation()} className="px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold">
              Ativar e começar a aprender
            </button>
            <button type="button" onClick={() => setPendingAutonomy(null)} className="px-3 py-1 rounded-lg border border-slate-700 text-slate-300 text-[11px]">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {enabled && (
        <>
          {/* Progresso */}
          <div className="grid md:grid-cols-3 gap-3 pt-1">
            <Bar label="Conversas aprendidas" value={info?.pairCount ?? 0} max={info?.minPairs ?? 20} />
            <Bar label="E-mails do seu estilo" value={profile?.sampleCount ?? 0} max={info?.minStyleSamples ?? 10} />
            <Bar label="Rascunhos aprovados" value={info?.approvedDrafts ?? 0} max={info?.minApprovedDrafts ?? 20} />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
            <span className={status?.phase === 'erro' ? 'text-rose-400' : 'text-slate-400'}>
              {running
                ? `${PHASE_LABEL[status!.phase]} ${pct}%`
                : status?.finishedMs
                ? `${PHASE_LABEL[status.phase]} · ${new Date(status.finishedMs).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : 'Atualiza sozinho uma vez por dia.'}
              {status?.error ? ` — ${status.error}` : ''}
            </span>
            <button
              type="button"
              disabled={running}
              onClick={() => void startLearning()}
              className="px-2.5 py-1 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${running ? 'animate-spin' : ''}`} /> Aprender agora
            </button>
          </div>

          {/* Estilo aprendido + ajuste manual */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
            <div className="text-[11px] font-semibold text-slate-200">Estilo aprendido</div>
            {profile ? (
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <div>
                  Saudação: <span className="text-slate-200">{profile.greetings[0]?.text || '—'}</span>
                </div>
                <div>
                  Despedida: <span className="text-slate-200">{profile.closings[0]?.text || '—'}</span>
                </div>
                <div>
                  Tom: <span className="text-slate-200">{profile.formalityLabel}</span>
                </div>
                <div>
                  Tamanho médio: <span className="text-slate-200">{Math.round(profile.avgWords)} palavras</span>
                </div>
                {profile.frequentPhrases.length > 0 && (
                  <div className="sm:col-span-2">
                    Expressões frequentes:{' '}
                    <span className="text-slate-200">{profile.frequentPhrases.slice(0, 3).map((f) => `"${f.text}"`).join(', ')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">Ainda aprendendo. Aparece após a primeira leitura dos seus enviados.</div>
            )}
            <div className="grid sm:grid-cols-2 gap-2 pt-1">
              <label className="text-[10px] text-slate-400 space-y-1">
                <span>Saudação preferida (opcional, use {'{nome}'})</span>
                <input
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  onBlur={() => void save({ greetingOverride: greeting })}
                  placeholder={profile?.greetings[0]?.text || 'Olá {nome},'}
                  maxLength={80}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </label>
              <label className="text-[10px] text-slate-400 space-y-1">
                <span>Despedida preferida (opcional)</span>
                <input
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                  onBlur={() => void save({ closingOverride: closing })}
                  placeholder={profile?.closings[0]?.text || 'Atenciosamente,'}
                  maxLength={80}
                  className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500"
                />
              </label>
            </div>
          </div>

          {/* Limites */}
          <div className="grid sm:grid-cols-3 gap-3 text-[11px]">
            <label className="space-y-1">
              <span className="text-slate-300">Confiança mínima p/ envio automático: {Math.round((config?.minConfidence ?? 0.7) * 100)}%</span>
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={Math.round((config?.minConfidence ?? 0.7) * 100)}
                onChange={(e) => setConfig((c) => (c ? { ...c, minConfidence: Number(e.target.value) / 100 } : c))}
                onMouseUp={(e) => void save({ minConfidence: Number((e.target as HTMLInputElement).value) / 100 })}
                onKeyUp={(e) => void save({ minConfidence: Number((e.target as HTMLInputElement).value) / 100 })}
                className="w-full accent-brand-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">Envios automáticos por dia</span>
              <input
                type="number"
                min={0}
                max={500}
                value={config?.maxAutoPerDay ?? 30}
                onChange={(e) => setConfig((c) => (c ? { ...c, maxAutoPerDay: Number(e.target.value) } : c))}
                onBlur={(e) => void save({ maxAutoPerDay: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-brand-500"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-300">Só responder e-mails de até</span>
              <select
                value={config?.maxAgeHours ?? 48}
                onChange={(e) => void save({ maxAgeHours: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:border-brand-500"
              >
                {[12, 24, 48, 72].map((h) => (
                  <option key={h} value={h}>
                    {h} horas
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Pausar / apagar */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-800">
            {config?.autonomy === 'automatico' ? (
              <button
                type="button"
                onClick={() => void save({ paused: !config.paused })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${config.paused ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'border border-amber-500/50 text-amber-300 hover:bg-amber-500/10'}`}
              >
                {config.paused ? 'Retomar envios automáticos' : 'Pausar envios automáticos'}
              </button>
            ) : (
              <span />
            )}
            {confirmClear ? (
              <div className="flex items-center gap-2 text-[11px] text-rose-300">
                <span>Apagar estilo, conversas e aprovações desta conta?</span>
                <button
                  type="button"
                  onClick={async () => {
                    await api?.astroClearLearning?.(account);
                    setConfirmClear(false);
                    void refresh();
                  }}
                  className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  Sim, apagar
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="px-2 py-1 rounded-md border border-slate-700 text-slate-300">
                  Não
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={running}
                onClick={() => setConfirmClear(true)}
                className="text-[11px] text-slate-500 hover:text-rose-400 flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" /> Apagar o que o Astro aprendeu
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

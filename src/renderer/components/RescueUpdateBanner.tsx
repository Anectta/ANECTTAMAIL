import React, { useEffect, useState } from 'react';
import { AlertTriangle, DownloadCloud, ExternalLink, RefreshCw } from 'lucide-react';
import type { RescueState } from '../../types/electron';

/**
 * Faixa fixa do canal de resgate.
 * Aparece quando a versão instalada foi bloqueada remotamente (update-policy.json)
 * ou quando o app detectou que a atualização automática falhou repetidamente.
 * Não pode ser dispensada: o usuário pode continuar usando o app, mas o aviso permanece.
 */
export const RescueUpdateBanner: React.FC = () => {
  const [state, setState] = useState<RescueState | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const updater = window.updaterAPI;
    if (!updater?.getRescueState) return;

    const apply = (s: RescueState) => {
      setState(s);
      setBusy(!!s.busy);
      setProgress(s.progress || 0);
      setError(s.error || null);
    };

    updater.getRescueState().then(apply).catch(() => {});
    const offState = updater.onRescueState?.(apply);
    const offProgress = updater.onRescueProgress?.((p) => setProgress(Math.max(0, Math.min(100, Math.round(p)))));
    const offError = updater.onRescueError?.((msg) => {
      setBusy(false);
      setError(msg);
    });

    return () => {
      offState?.();
      offProgress?.();
      offError?.();
    };
  }, []);

  if (!state || state.kind === 'none') return null;

  const handleInstall = async () => {
    setError(null);
    setBusy(true);
    setProgress(0);
    const res = await window.updaterAPI?.startRescueInstall?.();
    if (res && !res.success) {
      setBusy(false);
      setError(res.error || 'Não foi possível concluir a atualização.');
    }
  };

  const isBlocked = state.kind === 'blocked';
  const actionLabel = isBlocked ? 'Atualizar agora' : 'Instalar manualmente';

  return (
    <div
      role="alert"
      className={`fixed top-0 inset-x-0 z-[10000] border-b shadow-lg ${
        isBlocked
          ? 'bg-rose-950/95 border-rose-500/50 text-rose-50'
          : 'bg-amber-950/95 border-amber-500/50 text-amber-50'
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5">
        <AlertTriangle className={`h-5 w-5 shrink-0 ${isBlocked ? 'text-rose-300' : 'text-amber-300'}`} />

        <div className="min-w-[220px] flex-1 text-xs leading-relaxed">
          <p className="font-semibold">
            {state.message}
            {state.targetVersion ? ` (nova versão: v${state.targetVersion})` : ''}
          </p>
          {busy && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/40">
                <div className="h-full rounded-full bg-white/80 transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <span className="tabular-nums opacity-90">
                {progress >= 100 ? 'Iniciando instalação...' : `Baixando ${progress}%`}
              </span>
            </div>
          )}
          {error && !busy && (
            <p className="mt-1 opacity-90">
              {error} Se o problema continuar, baixe o instalador pelo navegador.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow transition hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
            {busy ? 'Atualizando...' : error ? 'Tentar novamente' : actionLabel}
          </button>
          {error && !busy && (
            <button
              type="button"
              onClick={() => window.updaterAPI?.openRescueDownloadPage?.()}
              className="flex items-center gap-1.5 rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Baixar pelo navegador
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { DownloadCloud, RefreshCw, ShieldCheck } from 'lucide-react';

export const ForceUpdateModal: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const updater = window.updaterAPI;
    if (!updater) return;

    const cleanupAvailable = updater.onUpdateAvailable((version: string) => {
      if (!version) return;
      setNewVersion(version);
      setUpdateAvailable(true);
    });

    const cleanupProgress = updater.onDownloadProgress((percent: number) => {
      setIsDownloading(true);
      setErrorMsg(null);
      setProgress(Math.min(100, Math.max(0, Math.round(percent))));
    });

    const cleanupError = updater.onUpdateError?.((message: string) => {
      setIsDownloading(false);
      setErrorMsg(message || 'Falha ao baixar atualização.');
    });

    updater.getPendingUpdate?.().then((version) => {
      if (version) {
        setNewVersion(version);
        setUpdateAvailable(true);
      }
    }).catch(() => {});

    return () => {
      if (typeof cleanupAvailable === 'function') cleanupAvailable();
      if (typeof cleanupProgress === 'function') cleanupProgress();
      if (typeof cleanupError === 'function') cleanupError();
    };
  }, []);

  if (!updateAvailable) {
    return null;
  }

  const handleStartDownload = () => {
    setErrorMsg(null);
    setIsDownloading(true);
    window.updaterAPI?.startDownload();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl text-slate-100">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <DownloadCloud className="h-6 w-6" />
          </div>
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 border border-amber-500/30">
              <ShieldCheck className="h-3 w-3" />
              Atualização Obrigatória
            </span>
            <h2 className="text-lg font-bold text-white mt-0.5">
              Nova versão disponível
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5">
          Uma nova atualização crítica do <strong className="text-white">Anectta MAIL</strong>{' '}
          {newVersion ? (
            <span className="inline-block rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-xs font-semibold text-sky-300 border border-sky-500/30">
              v{newVersion}
            </span>
          ) : null}{' '}
          está disponível. Para continuar utilizando o sistema com segurança e estabilidade, atualize agora.
        </p>

        {errorMsg && (
          <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {!isDownloading ? (
          <button
            type="button"
            onClick={handleStartDownload}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:bg-sky-600 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition-all"
          >
            <DownloadCloud className="h-4 w-4" />
            Atualizar Agora
          </button>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <span className="flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
                {progress >= 100
                  ? 'Download concluído! Reiniciando aplicativo...'
                  : 'Baixando atualização...'}
              </span>
              <span className="font-mono font-bold text-sky-400">{progress}%</span>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800 border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-[11px] text-center text-slate-400 pt-1">
              O aplicativo será reiniciado automaticamente após a conclusão.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

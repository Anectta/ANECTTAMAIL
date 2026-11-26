import React, { useEffect, useState } from 'react';
import { DownloadCloud, RefreshCw } from 'lucide-react';
import logoImg from '../assets/logo.png';
import { BrandWordmark } from './BrandLogo';

export const ForceUpdateModal: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string>('');
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((v) => {
      if (v) setCurrentVersion(v);
    }).catch(() => {});

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
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div className="splash-screen relative w-full max-w-[560px] min-h-[380px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#091322] via-[#102036] to-[#08101d] text-slate-100 flex flex-col items-center justify-between p-8 border border-sky-500/25 shadow-2xl">
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #00a8ff 0%, transparent 70%)' }}
          aria-hidden="true"
        />

        {/* Top Bar */}
        <div className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400/80 z-10">
          <span>Corporate Desktop</span>
          <span className="flex items-center gap-1.5 text-sky-400">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            {newVersion
              ? `Nova Versão v${newVersion}`
              : currentVersion
              ? `Versão Atual v${currentVersion}`
              : 'Atualização Obrigatória'}
          </span>
        </div>

        {/* Center Logo & Branding */}
        <div className="flex flex-col items-center text-center z-10 my-5">
          <div className="relative mb-3">
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-45"
              style={{ backgroundColor: '#00a8ff' }}
              aria-hidden="true"
            />
            <img
              src={logoImg}
              alt="Anectta MAIL"
              className="relative w-20 h-20 object-contain anectta-logo-spin drop-shadow-[0_0_16px_rgba(0,168,255,0.55)]"
            />
          </div>

          <h1 className="leading-tight">
            <BrandWordmark className="text-[34px] text-white" />
          </h1>

          <div className="mt-2 flex items-center justify-center gap-2.5 text-xs font-normal tracking-wider text-slate-200">
            <span>Ágil</span>
            <span
              style={{ backgroundColor: '#00a8ff' }}
              className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,168,255,0.95)] shrink-0"
              aria-hidden="true"
            />
            <span>Seguro</span>
            <span
              style={{ backgroundColor: '#00a8ff' }}
              className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,168,255,0.95)] shrink-0"
              aria-hidden="true"
            />
            <span>Conectado</span>
          </div>

          <p className="mt-4 text-[13px] font-medium text-sky-200/95 tracking-wide max-w-md leading-relaxed">
            {isDownloading
              ? progress >= 100
                ? 'Atualização concluída! Reiniciando o Anectta MAIL...'
                : `Baixando Atualização Crítica do Sistema (${progress}%)`
              : `Nova atualização ${newVersion ? `v${newVersion} ` : ''}disponível para instalação obrigatória`}
          </p>

          {errorMsg && (
            <div className="mt-3 w-full max-w-sm rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Bottom Action / Progress Bar */}
        <div className="w-full max-w-sm z-10 flex flex-col items-center gap-2.5">
          {!isDownloading ? (
            <div className="w-full flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleStartDownload}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0284c7] via-[#00a8ff] to-[#38bdf8] hover:brightness-110 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition-all"
              >
                <DownloadCloud className="h-4 w-4" />
                Atualizar Agora
              </button>

              {errorMsg && (
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setUpdateAvailable(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition-all"
                >
                  Mais tarde
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="w-full h-1.5 bg-slate-800/90 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-200 ease-out"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #0284c7, #00a8ff, #38bdf8)',
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300/90">
                <RefreshCw className="h-3 w-3 animate-spin text-sky-400" />
                <span>O aplicativo será reiniciado automaticamente após a conclusão.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

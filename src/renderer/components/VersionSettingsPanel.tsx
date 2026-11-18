import React, { useEffect, useState } from 'react';
import { CheckCircle2, DownloadCloud, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';
import logoImg from '../assets/logo.png';

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error' | 'dev';

export const VersionSettingsPanel: React.FC = () => {
  const [installedVersion, setInstalledVersion] = useState<string>('');
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    window.electronAPI?.getAppVersion?.()
      .then((v) => {
        if (v) setInstalledVersion(v);
      })
      .catch(() => {});

    const updater = window.updaterAPI;
    if (!updater) return;

    updater.getPendingUpdate?.()
      .then((pending) => {
        if (pending) {
          setLatestVersion(pending);
          setStatus('available');
        }
      })
      .catch(() => {});

    const offAvailable = updater.onUpdateAvailable((version: string) => {
      if (!version) return;
      setLatestVersion(version);
      setStatus((prev) => (prev === 'downloading' ? prev : 'available'));
    });

    const offProgress = updater.onDownloadProgress((percent: number) => {
      setStatus('downloading');
      setProgress(Math.min(100, Math.max(0, Math.round(percent))));
    });

    const offError = updater.onUpdateError?.((errMsg: string) => {
      setStatus('error');
      setMessage(errMsg || 'Não foi possível concluir a atualização.');
    });

    return () => {
      if (typeof offAvailable === 'function') offAvailable();
      if (typeof offProgress === 'function') offProgress();
      if (typeof offError === 'function') offError();
    };
  }, []);

  const handleCheckUpdates = async () => {
    if (!window.updaterAPI?.checkForUpdatesManual) {
      setStatus('error');
      setMessage('O módulo de atualização não está disponível nesta janela. Reinicie o Anectta MAIL e tente novamente.');
      return;
    }
    setStatus('checking');
    setMessage('');
    try {
      const res = await Promise.race([
        window.updaterAPI.checkForUpdatesManual(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tempo esgotado ao verificar atualizações. Verifique sua conexão/proxy.')), 60_000)
        ),
      ]);
      if (res?.currentVersion) setInstalledVersion(res.currentVersion);

      if (res?.status === 'available' && res.latestVersion) {
        setLatestVersion(res.latestVersion);
        setStatus('available');
      } else if (res?.status === 'up-to-date') {
        setStatus('up-to-date');
        const checkedAt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setMessage(
          `Seu Anectta MAIL já está na versão mais recente${
            res.latestVersion ? ` (última publicada: v${res.latestVersion})` : ''
          }. Verificado às ${checkedAt}.`
        );
      } else if (res?.status === 'dev') {
        setStatus('dev');
        setMessage(res.message || 'Verificação de atualização disponível apenas no aplicativo instalado.');
      } else {
        setStatus('error');
        setMessage(res?.error || 'Falha ao verificar atualizações.');
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err?.message || 'Erro ao consultar atualizações.');
    }
  };

  const handleStartDownload = () => {
    setStatus('downloading');
    setProgress(0);
    setMessage('');
    window.updaterAPI?.startDownload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-sky-400" />
          Versão e Atualizações do Sistema
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Acompanhe a numeração da versão instalada e verifique novas melhorias disponíveis para o Anectta MAIL.
        </p>
      </div>

      {/* Card da Versão Instalada */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-2 shrink-0">
            <img src={logoImg} alt="Anectta MAIL" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <div className="text-sm font-light tracking-[0.06em] text-white">
              &#923;NECTT&#923; M@il <span className="font-semibold tracking-normal">Corporate Desktop</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Versão instalada:{' '}
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 font-mono font-semibold text-sky-300">
                {installedVersion ? `v${installedVersion}` : 'Carregando...'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckUpdates}
          disabled={status === 'checking' || status === 'downloading'}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-xs font-semibold text-white border border-slate-700 flex items-center gap-2 transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${status === 'checking' ? 'animate-spin' : ''}`} />
          <span>{status === 'checking' ? 'Verificando...' : 'Verificar Melhorias'}</span>
        </button>
      </div>

      {/* Status da Atualização */}
      {status === 'up-to-date' && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3 text-xs text-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <div className="font-semibold text-emerald-200">Sistema atualizado!</div>
            <div className="mt-0.5">{message}</div>
          </div>
        </div>
      )}

      {status === 'dev' && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-xs text-slate-300">
          {message}
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center gap-3 text-xs text-rose-300">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <div className="font-semibold text-rose-200">Não foi possível atualizar</div>
            <div className="mt-0.5">{message}</div>
          </div>
        </div>
      )}

      {status === 'available' && (
        <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 border border-sky-500/30">
                Nova Versão Disponível
              </span>
              <h4 className="text-sm font-bold text-white mt-2">
                Anectta MAIL <span className="font-mono text-sky-300">v{latestVersion}</span>
              </h4>
              <p className="text-xs text-slate-300 mt-1">
                Há novas melhorias e correções prontas para instalação. Clique abaixo para atualizar agora.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStartDownload}
            className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>Atualizar Melhorias Agora</span>
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="rounded-2xl border border-sky-500/30 bg-slate-950/80 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-200">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
              {progress >= 100
                ? 'Download concluído! Reiniciando para instalar...'
                : 'Baixando pacote de melhorias...'}
            </span>
            <span className="font-mono font-bold text-sky-400">{progress}%</span>
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800 border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            O aplicativo será reiniciado automaticamente assim que a atualização terminar.
          </p>
        </div>
      )}
    </div>
  );
};

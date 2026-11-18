import React, { useEffect, useState } from 'react';
import logoImg from '../assets/logo.png';

export const SplashScreenView: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    window.electronAPI?.getAppVersion?.().then((v) => {
      if (v) setAppVersion(v);
    }).catch(() => {});
  }, []);

  return (
    <div className="splash-screen h-screen w-screen overflow-hidden bg-gradient-to-br from-[#091322] via-[#102036] to-[#08101d] text-slate-100 flex flex-col items-center justify-between p-8 border border-sky-500/20 relative">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #00a8ff 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400/80 z-10">
        <span>Corporate Desktop</span>
        <span className="flex items-center gap-1.5 text-sky-400">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          Versão Atual {appVersion ? `v${appVersion}` : ''}
        </span>
      </div>

      {/* Center Logo & Branding */}
      <div className="flex flex-col items-center text-center z-10 my-auto">
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

        <h1 className="text-[30px] font-light tracking-[0.06em] text-white leading-tight select-none">
          &#923;NECTT&#923; M@il
        </h1>

        <div className="mt-2 flex items-center justify-center gap-2.5 text-xs font-normal tracking-wider text-slate-200">
          <span>Simples</span>
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

        <p className="mt-5 text-[13px] font-medium text-sky-200/95 tracking-wide max-w-md leading-relaxed">
          Iniciando Gerenciador Cliente de E-mail Corporativo de Alta Performance
        </p>
      </div>

      {/* Bottom Progress Bar */}
      <div className="w-full max-w-xs z-10 flex flex-col items-center gap-2">
        <div className="w-full h-1 bg-slate-800/90 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-pulse"
            style={{
              width: '100%',
              background: 'linear-gradient(90deg, #0284c7, #00a8ff, #38bdf8)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

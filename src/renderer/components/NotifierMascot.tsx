import React from 'react';

/**
 * Rosto do Amoroso em tamanho pequeno (frase motivacional do cabeçalho).
 * Parado; só pisca os olhos de vez em quando (animação leve).
 */
export const AmorosoFace: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="16 4 88 74" className="amoroso-face shrink-0" role="img" aria-label="Astro">
    <style>{`
      .amoroso-face .af-eyes { animation: afBlink 5.5s ease-in-out infinite; transform-origin: 60px 48px; }
      @keyframes afBlink { 0%,94%,100% { transform: scaleY(1); } 96.5% { transform: scaleY(.15); } }
    `}</style>
    <line x1="60" y1="16" x2="60" y2="26" stroke="#9fb7d8" strokeWidth="4" strokeLinecap="round" />
    <circle cx="60" cy="11" r="6" fill="#38bdf8" />
    <rect x="18" y="38" width="12" height="22" rx="6" fill="#7cc7f0" />
    <rect x="90" y="38" width="12" height="22" rx="6" fill="#7cc7f0" />
    <rect x="25" y="23" width="70" height="53" rx="23" fill="#eef4fc" />
    <rect x="33" y="32" width="54" height="34" rx="15" fill="#0d1a3a" />
    <g className="af-eyes">
      <path d="M44 49 q6 -8 12 0" fill="none" stroke="#5ee0ff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M64 49 q6 -8 12 0" fill="none" stroke="#5ee0ff" strokeWidth="4.5" strokeLinecap="round" />
    </g>
    <path d="M52 57 q8 6 16 0" fill="none" stroke="#5ee0ff" strokeWidth="3.6" strokeLinecap="round" />
  </svg>
);

/**
 * Amoroso — mascote e assistente do Anectta (desenho original): robozinho segurando um envelope.
 * Usado no aviso de novo e-mail. Animações leves: flutua, a antena pisca e ele pisca os olhos.
 */
export const NotifierMascot: React.FC<{ size?: number }> = ({ size = 76 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    className="anectta-mascot"
    role="img"
    aria-label="Astro, seu assistente virtual"
  >
    <style>{`
      .anectta-mascot .m-float { animation: mFloat 2.6s ease-in-out infinite; transform-origin: 60px 60px; }
      .anectta-mascot .m-glow { animation: mGlow 1.6s ease-in-out infinite; }
      .anectta-mascot .m-eyes { animation: mBlink 4.2s ease-in-out infinite; transform-origin: 60px 48px; }
      .anectta-mascot .m-letter { animation: mLetter 2.6s ease-in-out infinite; transform-origin: 60px 96px; }
      @keyframes mFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes mGlow { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
      @keyframes mBlink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.15); } }
      @keyframes mLetter { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-3deg); } }
    `}</style>
    <defs>
      <linearGradient id="mShell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d6e4f7" />
      </linearGradient>
      <linearGradient id="mVisor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#13234a" />
        <stop offset="1" stopColor="#0a1430" />
      </linearGradient>
      <radialGradient id="mHalo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#38bdf8" stopOpacity=".55" />
        <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* Brilho de fundo */}
    <circle cx="60" cy="64" r="52" fill="url(#mHalo)" opacity=".5" />

    <g className="m-float">
      {/* Antena */}
      <line x1="60" y1="16" x2="60" y2="26" stroke="#9fb7d8" strokeWidth="3" strokeLinecap="round" />
      <circle className="m-glow" cx="60" cy="12" r="5" fill="#38bdf8" />
      <circle cx="60" cy="12" r="2" fill="#e0f7ff" />

      {/* Orelhas */}
      <rect x="20" y="40" width="10" height="18" rx="5" fill="#7cc7f0" />
      <rect x="90" y="40" width="10" height="18" rx="5" fill="#7cc7f0" />

      {/* Cabeça */}
      <rect x="27" y="24" width="66" height="50" rx="22" fill="url(#mShell)" />
      {/* Visor */}
      <rect x="35" y="33" width="50" height="31" rx="14" fill="url(#mVisor)" />
      {/* Olhos felizes + sorriso */}
      <g className="m-eyes">
        <path d="M45 48 q5 -6 10 0" fill="none" stroke="#5ee0ff" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M65 48 q5 -6 10 0" fill="none" stroke="#5ee0ff" strokeWidth="3.2" strokeLinecap="round" />
      </g>
      <path d="M53 55 q7 5 14 0" fill="none" stroke="#5ee0ff" strokeWidth="2.6" strokeLinecap="round" />
      {/* Bochechas */}
      <circle cx="42" cy="56" r="2.4" fill="#5ee0ff" opacity=".35" />
      <circle cx="78" cy="56" r="2.4" fill="#5ee0ff" opacity=".35" />

      {/* Corpo */}
      <rect x="40" y="72" width="40" height="34" rx="14" fill="url(#mShell)" />

      {/* Envelope nas mãos */}
      <g className="m-letter">
        <rect x="31" y="80" width="58" height="36" rx="6" fill="#ffffff" stroke="#c8d6ea" strokeWidth="1.5" />
        <path d="M33 83 L60 101 L87 83" fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M33 114 L52 97 M87 114 L68 97" fill="none" stroke="#c8d6ea" strokeWidth="1.5" strokeLinecap="round" />
        {/* Mãos */}
        <circle cx="31" cy="96" r="6" fill="#e6eef9" stroke="#c8d6ea" strokeWidth="1.2" />
        <circle cx="89" cy="96" r="6" fill="#e6eef9" stroke="#c8d6ea" strokeWidth="1.2" />
      </g>
    </g>
  </svg>
);

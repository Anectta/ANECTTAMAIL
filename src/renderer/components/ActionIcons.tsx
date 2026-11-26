import React from 'react';

/**
 * Ícones preenchidos da barra de ações do e-mail (desenho próprio do Anectta MAIL).
 * A cor principal vem de `currentColor` (a cor da ação); os detalhes internos são brancos,
 * então funcionam igual nos temas claro e escuro.
 */
type IconProps = { className?: string };

const Svg: React.FC<React.PropsWithChildren<IconProps>> = ({ className, children }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
    {children}
  </svg>
);

const W = '#ffffff';

export const FilledArchive: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="2" y="3" width="20" height="5.5" rx="1.6" fill="currentColor" />
    <path d="M3.6 10h16.8v8.4A2.6 2.6 0 0 1 17.8 21H6.2a2.6 2.6 0 0 1-2.6-2.6V10Z" fill="currentColor" />
    <path d="M9.5 13.6h5" stroke={W} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const FilledTrash: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M9 3.2c0-.7.5-1.2 1.2-1.2h3.6c.7 0 1.2.5 1.2 1.2V4.5H9V3.2Z" fill="currentColor" />
    <rect x="3" y="4.5" width="18" height="2.8" rx="1.4" fill="currentColor" />
    <path d="M5 8.8h14l-1 10.4A2.4 2.4 0 0 1 15.6 21.4H8.4A2.4 2.4 0 0 1 6 19.2L5 8.8Z" fill="currentColor" />
    <path d="M10 12v5.6M14 12v5.6" stroke={W} strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const FilledPrinter: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path d="M6.5 3.5A1.5 1.5 0 0 1 8 2h8a1.5 1.5 0 0 1 1.5 1.5V7h-11V3.5Z" fill="currentColor" />
    <rect x="2" y="8" width="20" height="9.5" rx="2.6" fill="currentColor" />
    <rect x="6.6" y="13.2" width="10.8" height="8.3" rx="1.3" fill={W} stroke="currentColor" strokeWidth="1.6" />
    <circle cx="18" cy="11.2" r="1.1" fill={W} />
  </Svg>
);

export const FilledOctagonAlert: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path
      d="M8.2 2h7.6c.5 0 1 .2 1.4.6l4.2 4.2c.4.4.6.9.6 1.4v7.6c0 .5-.2 1-.6 1.4l-4.2 4.2c-.4.4-.9.6-1.4.6H8.2c-.5 0-1-.2-1.4-.6l-4.2-4.2c-.4-.4-.6-.9-.6-1.4V8.2c0-.5.2-1 .6-1.4l4.2-4.2C7.2 2.2 7.7 2 8.2 2Z"
      fill="currentColor"
    />
    <path d="M12 7v6" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="12" cy="16.6" r="1.35" fill={W} />
  </Svg>
);

export const FilledCheckCircle: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m7.6 12.3 3 3 5.9-6.2" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const FilledClock: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M12 6.8V12l3.4 2.2" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const FilledBellRing: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <path
      d="M12 3.2a5.6 5.6 0 0 0-5.6 5.6v3.6c0 .9-.3 1.7-.9 2.4l-.9 1.1c-.5.6-.1 1.6.7 1.6h13.4c.8 0 1.2-1 .7-1.6l-.9-1.1a3.7 3.7 0 0 1-.9-2.4V8.8A5.6 5.6 0 0 0 12 3.2Z"
      fill="currentColor"
    />
    <path d="M9.8 19.6a2.4 2.4 0 0 0 4.4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M2.6 8.2a8.7 8.7 0 0 1 2.2-4.4M21.4 8.2a8.7 8.7 0 0 0-2.2-4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

export const FilledCheckSquare: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="2.5" y="2.5" width="19" height="19" rx="4.2" fill="currentColor" />
    <path d="m7.4 12.3 3 3 6.2-6.4" stroke={W} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const FilledPanelRight: React.FC<IconProps> = ({ className }) => (
  <Svg className={className}>
    <rect x="2.5" y="3" width="19" height="18" rx="3.4" fill="currentColor" />
    <path d="M15 3.8v16.4" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

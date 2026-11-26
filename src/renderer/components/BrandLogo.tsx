import React, { useId } from 'react';

/**
 * Logo alloM@il (desenho vetorial do logo fornecido pelo cliente):
 * "@" azul com a curva de impulso e o avião de papel subindo.
 * - BrandMark: só o símbolo (@ + avião), usado como ícone.
 * - BrandWordmark: o nome completo "alloM@il"; as letras usam a cor do texto (currentColor),
 *   então funciona em fundo escuro e claro.
 */
const MarkShapes: React.FC<{ uid: string }> = ({ uid }) => {
  const at = `${uid}-at`;
  const sw = `${uid}-sw`;
  const pt = `${uid}-pt`;
  const pb = `${uid}-pb`;
  return (
    <>
      <defs>
        <linearGradient id={at} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#3b9bff" />
        </linearGradient>
        <linearGradient id={sw} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4338ca" stopOpacity=".15" />
          <stop offset=".3" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={pt} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#5eead4" />
        </linearGradient>
        <linearGradient id={pb} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* Curva de impulso */}
      <path d="M16 100 C14 64 40 40 76 34 C46 46 30 70 28 100 Z" fill={`url(#${sw})`} />
      {/* @ */}
      <circle cx="54" cy="72" r="12.5" fill="none" stroke={`url(#${at})`} strokeWidth="9" />
      <path
        d="M66.5 60 V80 Q66.5 88 74 88 Q82 88 82 72 A28 28 0 1 0 70 95"
        fill="none"
        stroke={`url(#${at})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Avião de papel */}
      <path d="M114 8 L60 30 L82 40 Z" fill={`url(#${pt})`} />
      <path d="M114 8 L82 40 L90 60 Z" fill={`url(#${pb})`} />
      <path d="M82 40 L80 54 L88 47 Z" fill="#3730a3" />
    </>
  );
};

const useSvgId = () => `brand${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

export const BrandMark: React.FC<{ size?: number; className?: string; title?: string }> = ({
  size = 32,
  className,
  title = 'alloM@il',
}) => {
  const uid = useSvgId();
  return (
    <svg width={size} height={size} viewBox="5 -3 120 120" className={className} role="img" aria-label={title}>
      <MarkShapes uid={uid} />
    </svg>
  );
};

export const BrandWordmark: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => {
  const uid = useSvgId();
  return (
    <span
      role="img"
      aria-label="alloM@il"
      className={`inline-flex items-baseline font-bold leading-none whitespace-nowrap select-none ${className || ''}`}
      style={{ letterSpacing: '-0.015em', ...style }}
    >
      <span aria-hidden="true">alloM</span>
      <svg
        aria-hidden="true"
        viewBox="12 4 106 100"
        style={{
          height: '1.23em',
          width: '1.3em',
          margin: '0 -0.26em 0 -0.07em',
          transform: 'translateY(0.06em)',
          position: 'relative',
          zIndex: 1,
          overflow: 'visible',
          flexShrink: 0,
        }}
      >
        <MarkShapes uid={uid} />
      </svg>
      <span aria-hidden="true">il</span>
    </span>
  );
};

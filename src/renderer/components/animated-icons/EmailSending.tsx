import React from 'react';
import './email-animations.css';

export interface EmailSendingProps {
  /**
   * Tamanho em pixels (largura e altura). Padrão: 64px.
   */
  size?: number;
  /**
   * Classes CSS adicionais do Tailwind ou personalizadas.
   */
  className?: string;
  /**
   * Cor primária (traçado do envelope e do avião). Padrão: var(--mail-anim-primary) / #3b82f6.
   */
  primaryColor?: string;
  /**
   * Cor secundária (dobra interna do avião). Padrão: var(--mail-anim-secondary) / #06b6d4.
   */
  secondaryColor?: string;
  /**
   * Cor do rastro de decolagem pontilhado. Padrão: var(--mail-anim-trail) / #94a3b8.
   */
  trailColor?: string;
  /**
   * Espessura do traço (stroke-width). Padrão: 2.
   */
  strokeWidth?: number;
  /**
   * Controle de reprodução da animação. Se false, pausa a animação no estado atual.
   */
  playing?: boolean;
  /**
   * Estilo inline adicional.
   */
  style?: React.CSSProperties;
}

export const EmailSending: React.FC<EmailSendingProps> = ({
  size = 64,
  className = '',
  primaryColor,
  secondaryColor,
  trailColor,
  strokeWidth = 2,
  playing = true,
  style = {},
}) => {
  const customVariables: React.CSSProperties = {
    ...(primaryColor ? { ['--mail-anim-primary' as any]: primaryColor } : {}),
    ...(secondaryColor ? { ['--mail-anim-secondary' as any]: secondaryColor } : {}),
    ...(trailColor ? { ['--mail-anim-trail' as any]: trailColor } : {}),
    ...(strokeWidth ? { ['--mail-anim-stroke' as any]: `${strokeWidth}px` } : {}),
    ...style,
  };

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, ...customVariables }}
      role="img"
      aria-label="Enviando e-mail"
    >
      <svg
        className={`email-sending-svg ${!playing ? 'is-paused' : ''}`}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Rastro Pontilhado de Decolagem */}
        <path
          className="trail-line mail-anim-gpu"
          d="M 16 46 Q 24 40, 32 30"
          stroke="var(--mail-anim-trail, #94a3b8)"
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
        />

        {/* Envelope que se dobra e fecha */}
        <g className="envelope-box mail-anim-gpu">
          {/* Corpo do envelope com cantos arredondados limpos */}
          <rect
            x="15"
            y="21"
            width="34"
            height="24"
            rx="3.5"
            stroke="var(--mail-anim-primary, #3b82f6)"
            strokeWidth="var(--mail-anim-stroke, 2px)"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Aba do envelope */}
          <path
            d="M 16 23 L 32 35 L 48 23"
            stroke="var(--mail-anim-primary, #3b82f6)"
            strokeWidth="var(--mail-anim-stroke, 2px)"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Avião de Papel em Decolagem */}
        <g className="plane-box mail-anim-gpu">
          {/* Fuselagem geométrica do avião */}
          <path
            d="M 14 36 L 49 15 L 32 47 L 27 36 Z"
            stroke="var(--mail-anim-primary, #3b82f6)"
            strokeWidth="var(--mail-anim-stroke, 2px)"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Linha da dobra central em cor secundária */}
          <path
            d="M 49 15 L 27 36"
            stroke="var(--mail-anim-secondary, #06b6d4)"
            strokeWidth="var(--mail-anim-stroke, 2px)"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      </svg>
    </div>
  );
};

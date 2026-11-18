import React from 'react';
import './email-animations.css';

export interface EmailReceivingProps {
  /**
   * Tamanho em pixels (largura e altura). Padrão: 64px.
   */
  size?: number;
  /**
   * Classes CSS adicionais do Tailwind ou personalizadas.
   */
  className?: string;
  /**
   * Cor primária (envelope e traçado principal). Padrão: var(--mail-anim-primary) / #3b82f6.
   */
  primaryColor?: string;
  /**
   * Cor secundária (asas suaves). Padrão: var(--mail-anim-secondary) / #06b6d4.
   */
  secondaryColor?: string;
  /**
   * Cor da bandeja receptora. Padrão: var(--mail-anim-tray) / #64748b.
   */
  trayColor?: string;
  /**
   * Espessura do traço (stroke-width). Padrão: 2.
   */
  strokeWidth?: number;
  /**
   * Controle de reprodução da animação. Se false, pausa a animação.
   */
  playing?: boolean;
  /**
   * Estilo inline adicional.
   */
  style?: React.CSSProperties;
}

export const EmailReceiving: React.FC<EmailReceivingProps> = ({
  size = 64,
  className = '',
  primaryColor,
  secondaryColor,
  trayColor,
  strokeWidth = 2,
  playing = true,
  style = {},
}) => {
  const customVariables: React.CSSProperties = {
    ...(primaryColor ? { ['--mail-anim-primary' as any]: primaryColor } : {}),
    ...(secondaryColor ? { ['--mail-anim-secondary' as any]: secondaryColor } : {}),
    ...(trayColor ? { ['--mail-anim-tray' as any]: trayColor } : {}),
    ...(strokeWidth ? { ['--mail-anim-stroke' as any]: `${strokeWidth}px` } : {}),
    ...style,
  };

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size, ...customVariables }}
      role="img"
      aria-label="Recebendo e-mail"
    >
      <svg
        className={`email-receiving-svg ${!playing ? 'is-paused' : ''}`}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bandeja da Caixa de Entrada (Fixa na Base com Reação Elástica) */}
        <g className="tray-box mail-anim-gpu">
          {/* Borda Externa da Bandeja com cantos suaves */}
          <path
            d="M 14 42 L 18 54 C 18.5 55.5 19.8 56.5 21.5 56.5 H 42.5 C 44.2 56.5 45.5 55.5 46 54 L 50 42"
            stroke="var(--mail-anim-tray, #64748b)"
            strokeWidth="var(--mail-anim-stroke, 2px)"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Recorte Frontal Ergonômico de Entrada */}
          <path
            d="M 14 42 H 24 L 27 47 H 37 L 40 42 H 50"
            stroke="var(--mail-anim-tray, #64748b)"
            strokeWidth="var(--mail-anim-stroke, 2px)"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* E-mail Voador (Envelope com Asas que Pousa) */}
        <g className="flying-envelope-carrier mail-anim-gpu">
          {/* Asas Animadas (batem e se recolhem ao pousar) */}
          <g className="wings-layer mail-anim-gpu">
            {/* Asa Esquerda */}
            <path
              className="wing-l mail-anim-gpu"
              d="M 22 22 C 15 17, 10 20, 9 26 C 13 25, 18 25, 22 23"
              stroke="var(--mail-anim-secondary, #06b6d4)"
              strokeWidth="var(--mail-anim-stroke, 2px)"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Asa Direita */}
            <path
              className="wing-r mail-anim-gpu"
              d="M 42 22 C 49 17, 54 20, 55 26 C 51 25, 46 25, 42 23"
              stroke="var(--mail-anim-secondary, #06b6d4)"
              strokeWidth="var(--mail-anim-stroke, 2px)"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>

          {/* Envelope */}
          <g className="mail-anim-gpu">
            <rect
              x="20"
              y="16"
              width="24"
              height="17"
              rx="2.5"
              stroke="var(--mail-anim-primary, #3b82f6)"
              strokeWidth="var(--mail-anim-stroke, 2px)"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <path
              d="M 21 17.5 L 32 25.5 L 43 17.5"
              stroke="var(--mail-anim-primary, #3b82f6)"
              strokeWidth="var(--mail-anim-stroke, 2px)"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
        </g>
      </svg>
    </div>
  );
};

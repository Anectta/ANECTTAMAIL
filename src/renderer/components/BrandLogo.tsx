import React from 'react';
import wordmarkWhite from '../assets/wordmark.png';
import wordmarkDark from '../assets/wordmark-dark.png';

/**
 * Logo alloM@il — arquivos originais do cliente, usados sem alterações:
 * - wordmark.png: letras brancas (fundos escuros)
 * - wordmark-dark.png: letras escuras (fundos claros)
 *
 * variant:
 * - 'auto' (padrão): segue o tema — temas claros (.clean-white) mostram o logo escuro;
 * - 'white': sempre o de letras brancas (telas de fundo sempre escuro, como a abertura);
 * - 'dark': sempre o de letras escuras (telas de fundo sempre claro).
 * O tamanho acompanha o tamanho da fonte (classe text-[..]) de quem usa.
 */
export const BrandWordmark: React.FC<{ className?: string; variant?: 'auto' | 'white' | 'dark' }> = ({
  className,
  variant = 'auto',
}) => {
  const style: React.CSSProperties = { height: '1.9em', width: 'auto' };
  const img = (src: string, cls: string) => (
    <img src={src} alt="alloM@il" draggable={false} className={`align-middle select-none ${cls}`} style={style} />
  );
  return (
    <span className={`inline-flex items-center ${className || ''}`}>
      {variant === 'white' && img(wordmarkWhite, 'inline-block')}
      {variant === 'dark' && img(wordmarkDark, 'inline-block')}
      {variant === 'auto' && (
        <>
          {img(wordmarkWhite, 'brand-wm-white')}
          {img(wordmarkDark, 'brand-wm-dark')}
        </>
      )}
    </span>
  );
};

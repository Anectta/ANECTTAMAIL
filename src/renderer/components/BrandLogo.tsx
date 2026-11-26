import React from 'react';
import wordmarkImg from '../assets/wordmark.png';

/**
 * Logo alloM@il — arquivo original do cliente (assets/wordmark.png), usado sem alterações.
 * As letras do logo são brancas: em fundo claro, use `onLight` (põe o logo sobre uma etiqueta escura).
 * O tamanho acompanha o tamanho da fonte (classe text-[..]) de quem usa.
 */
export const BrandWordmark: React.FC<{ className?: string; onLight?: boolean }> = ({ className, onLight }) => {
  const img = (
    <img
      src={wordmarkImg}
      alt="alloM@il"
      draggable={false}
      className="inline-block align-middle select-none"
      style={{ height: '1.9em', width: 'auto' }}
    />
  );
  if (onLight) {
    return (
      <span className={`inline-flex items-center rounded-md bg-slate-900 px-1.5 py-0.5 ${className || ''}`}>{img}</span>
    );
  }
  return <span className={`inline-flex items-center ${className || ''}`}>{img}</span>;
};

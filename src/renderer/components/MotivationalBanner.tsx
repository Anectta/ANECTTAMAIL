import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  MotivationalPrefs,
  getPrefs,
  getQuotes,
  pickQuoteIndex,
  savePrefs,
  subscribe,
} from '../services/motivationalQuotesService';
import { AmorosoFace } from './NotifierMascot';

const FADE_DURATION_MS = 600;

const FONT_CLASS: Record<MotivationalPrefs['fontSize'], string> = {
  small: 'text-[11px]',
  medium: 'text-xs',
  large: 'text-sm',
};

/**
 * Frase motivacional no cabeçalho. Lista, intervalo, ordem e exibição são configurados em
 * Configurações → Mensagens Motivacionais.
 */
export const MotivationalBanner: React.FC = () => {
  const [quotes, setQuotes] = useState<string[]>(getQuotes);
  const [prefs, setPrefs] = useState<MotivationalPrefs>(getPrefs);
  // Avanço manual (clique na frase) somado ao período atual
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Recarrega quando a lista ou as preferências mudam nas Configurações
  useEffect(
    () =>
      subscribe(() => {
        setQuotes(getQuotes());
        setPrefs(getPrefs());
      }),
    []
  );

  // Troca a frase ao virar o período (com transição suave)
  useEffect(() => {
    if (!prefs.enabled) return;
    const periodMs = prefs.intervalSec * 1000;
    let fadeTimeout: number | null = null;
    const msToNext = periodMs - (Date.now() % periodMs);
    const first = window.setTimeout(function rotate() {
      setIsVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setTick((t) => t + 1);
        setIsVisible(true);
      }, FADE_DURATION_MS);
    }, msToNext + 50);
    return () => {
      window.clearTimeout(first);
      if (fadeTimeout !== null) window.clearTimeout(fadeTimeout);
    };
  }, [prefs.enabled, prefs.intervalSec, tick]);

  if (!prefs.enabled || quotes.length === 0) return null;

  const index = pickQuoteIndex(quotes.length, prefs, offset);
  const quote = quotes[index] || '';

  const handleNext = () => {
    setIsVisible(false);
    window.setTimeout(() => {
      setOffset((o) => o + 1);
      setIsVisible(true);
    }, 250);
  };

  const handleHide = () => savePrefs({ ...prefs, enabled: false });

  return (
    <div
      className="motivational-pill flex items-center space-x-2 px-3 py-1 rounded-full border shadow-sm max-w-xl min-w-0"
      title={`${quote}\n\nClique para ver a próxima mensagem`}
    >
      {prefs.showAmoroso ? (
        <span className="-my-1 -ml-1.5 flex items-center" title="Astro — Assistente Virtual">
          <AmorosoFace size={prefs.fontSize === 'large' ? 24 : 22} />
        </span>
      ) : (
        <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      )}
      <button
        type="button"
        onClick={handleNext}
        className={`motivational-text ${FONT_CLASS[prefs.fontSize]} font-medium text-amber-50 truncate text-left transition-opacity duration-500 ease-in-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        &ldquo;{quote}&rdquo;
      </button>
      <button
        type="button"
        onClick={handleHide}
        title="Ocultar mensagens (reative em Configurações → Mensagens Motivacionais)"
        aria-label="Ocultar mensagens motivacionais"
        className="motivational-btn motivational-close p-0.5 rounded-full transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

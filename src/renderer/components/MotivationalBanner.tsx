import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { MOTIVATIONAL_QUOTES } from '../data/motivationalQuotes';

const STORAGE_HIDDEN_KEY = 'anectta_hide_motivational_quotes';
const ROTATION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const FADE_DURATION_MS = 1000;

export const MotivationalBanner: React.FC = () => {
  const [isHidden, setIsHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_HIDDEN_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [quoteIndex, setQuoteIndex] = useState<number>(() => {
    const slot = Math.floor(Date.now() / ROTATION_INTERVAL_MS);
    return slot % MOTIVATIONAL_QUOTES.length;
  });

  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (isHidden) return;

    let fadeTimeout: number | null = null;
    const interval = window.setInterval(() => {
      setIsVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
        setIsVisible(true);
      }, FADE_DURATION_MS);
    }, ROTATION_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      if (fadeTimeout !== null) {
        window.clearTimeout(fadeTimeout);
      }
    };
  }, [isHidden]);

  const handleHide = () => {
    setIsHidden(true);
    try {
      localStorage.setItem(STORAGE_HIDDEN_KEY, 'true');
    } catch {}
  };

  const handleShow = () => {
    setIsHidden(false);
    setIsVisible(true);
    try {
      localStorage.setItem(STORAGE_HIDDEN_KEY, 'false');
    } catch {}
  };

  if (isHidden) {
    return (
      <button
        type="button"
        onClick={handleShow}
        title="Exibir mensagens motivadoras"
        aria-label="Exibir mensagens motivadoras"
        className="motivational-pill motivational-btn p-1.5 rounded-full border transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>
    );
  }

  return (
    <div
      className="motivational-pill flex items-center space-x-2 px-3 py-1 rounded-full border shadow-sm max-w-xl min-w-0"
      title={MOTIVATIONAL_QUOTES[quoteIndex]}
    >
      <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <span
        className={`text-xs font-medium text-amber-50 truncate transition-opacity duration-1000 ease-in-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        &ldquo;{MOTIVATIONAL_QUOTES[quoteIndex]}&rdquo;
      </span>
      <button
        type="button"
        onClick={handleHide}
        title="Ocultar mensagem motivadora"
        aria-label="Ocultar mensagem motivadora"
        className="motivational-btn motivational-close p-0.5 rounded-full transition-colors shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};

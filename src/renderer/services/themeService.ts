/**
 * ThemeService - Sistema de Skins e Variáveis CSS para o Anectta MAIL
 * Gerencia paletas completas de cores, estilos visuais e integração sonora.
 */

import { soundService, SoundTheme } from './soundService';

export interface SkinDefinition {
  id: string;
  name: string;
  subtitle: string;
  category: 'dark' | 'light' | 'special';
  soundTheme: SoundTheme;
  previewColors: string[]; // [bg, surface, accent]
  icon: string;
  variables: Record<string, string>;
}

export const AVAILABLE_SKINS: SkinDefinition[] = [
  {
    id: 'executive-midnight',
    name: 'Meia-Noite Executivo',
    subtitle: 'Azul-marinho corporativo clássico com azul cobalto e dourado discreto',
    category: 'dark',
    soundTheme: 'executive',
    icon: 'briefcase',
    previewColors: ['#070d18', '#0f172a', '#2563eb'],
    variables: {
      '--bg-app': '#060a12',
      '--bg-sidebar': '#090e18',
      '--bg-surface': '#0f172a',
      '--bg-surface-hover': '#1e293b',
      '--bg-card': '#0d1527',
      '--bg-input': '#09101d',
      '--border-subtle': '#1e293b',
      '--border-highlight': '#3b82f6',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#94a3b8',
      '--text-muted': '#64748b',
      '--accent-primary': '#2563eb',
      '--accent-hover': '#3b82f6',
      '--accent-gradient': 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)',
      '--accent-glow': '0 0 20px rgba(37, 99, 235, 0.35)',
      '--badge-bg': 'rgba(37, 99, 235, 0.15)',
      '--badge-text': '#60a5fa',
      '--email-anim-primary': '#2563eb',
      '--email-anim-accent': '#38bdf8',
      '--email-anim-trail': '#60a5fa',
      '--icon-border-radius': '10px',
      '--selection-bg': '#1e2d4a',
      '--selection-border': '#3b82f6',
      '--primary-btn-bg': '#2563eb',
      '--primary-btn-hover': '#3b82f6',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#172236',
    },
  },
];

class ThemeService {
  private activeSkinId: string = 'executive-midnight';

  constructor() {
    try {
      const saved = localStorage.getItem('anectta_active_skin');
      if (saved && AVAILABLE_SKINS.some((s) => s.id === saved)) {
        this.activeSkinId = saved;
      }
    } catch {}
  }

  public getActiveSkin(): SkinDefinition {
    return (
      AVAILABLE_SKINS.find((s) => s.id === this.activeSkinId) || AVAILABLE_SKINS[0]
    );
  }

  public setSkin(skinId: string, playFeedbackSound: boolean = true): void {
    const skin = AVAILABLE_SKINS.find((s) => s.id === skinId);
    if (!skin) return;

    this.activeSkinId = skinId;
    try {
      localStorage.setItem('anectta_active_skin', skinId);
      localStorage.setItem('anectta_theme_mode', skin.category === 'light' ? 'clean' : 'dark');
    } catch {}

    // Aplica variáveis e classes de modo (dark / clean-white) no root do documento
    const root = document.documentElement;
    root.setAttribute('data-theme', skin.id);
    root.style.colorScheme = skin.category === 'light' ? 'light' : 'dark';
    if (skin.category === 'light') {
      root.classList.remove('dark');
      root.classList.add('clean-white');
    } else {
      root.classList.add('dark');
      root.classList.remove('clean-white');
    }

    Object.entries(skin.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Atualiza o tema sonoro
    soundService.setTheme(skin.soundTheme);

    if (playFeedbackSound) {
      soundService.play('pop');
    }

    // Dispara evento customizado para os componentes reativos
    window.dispatchEvent(
      new CustomEvent('anectta:skin-change', { detail: { skin } })
    );
  }

  public init(): void {
    this.setSkin(this.activeSkinId, false);
  }
}

export const themeService = new ThemeService();

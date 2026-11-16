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
  {
    id: 'graphite',
    name: 'Grafite',
    subtitle: 'Grafite escuro moderno com destaque em azul-petróleo (ciano)',
    category: 'dark',
    soundTheme: 'nordic',
    icon: 'layers',
    previewColors: ['#1b1f23', '#252b31', '#2a8c9e'],
    variables: {
      '--bg-app': '#1b1f23',
      '--bg-sidebar': '#1f2429',
      '--bg-surface': '#252b31',
      '--bg-surface-hover': '#2d363e',
      '--bg-card': '#22282e',
      '--bg-input': '#181c20',
      '--border-subtle': '#323942',
      '--border-highlight': '#2a8c9e',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#9ca3af',
      '--text-muted': '#6b7280',
      '--accent-primary': '#2a8c9e',
      '--accent-hover': '#36a2b6',
      '--accent-gradient': 'linear-gradient(135deg, #21707f 0%, #2a8c9e 50%, #389db0 100%)',
      '--accent-glow': '0 0 20px rgba(42, 140, 158, 0.35)',
      '--badge-bg': 'rgba(42, 140, 158, 0.22)',
      '--badge-text': '#5ec4d6',
      '--email-anim-primary': '#2a8c9e',
      '--email-anim-accent': '#5ec4d6',
      '--email-anim-trail': '#389db0',
      '--icon-border-radius': '8px',
      '--selection-bg': '#204954',
      '--selection-border': '#2a8c9e',
      '--primary-btn-bg': '#2a8c9e',
      '--primary-btn-hover': '#36a2b6',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#2b323a',
    },
  },
  {
    id: 'pine',
    name: 'Pinheiro',
    subtitle: 'Pinheiro escuro profundo com acentos em verde esmeralda',
    category: 'dark',
    soundTheme: 'executive',
    icon: 'trees',
    previewColors: ['#121915', '#1b2720', '#1ea366'],
    variables: {
      '--bg-app': '#121915',
      '--bg-sidebar': '#16201a',
      '--bg-surface': '#1b2720',
      '--bg-surface-hover': '#223229',
      '--bg-card': '#18231c',
      '--bg-input': '#101713',
      '--border-subtle': '#283b30',
      '--border-highlight': '#1ea366',
      '--text-primary': '#edf7f1',
      '--text-secondary': '#9cb8a8',
      '--text-muted': '#6b8a78',
      '--accent-primary': '#1ea366',
      '--accent-hover': '#24b874',
      '--accent-gradient': 'linear-gradient(135deg, #167c4d 0%, #1ea366 50%, #28c07a 100%)',
      '--accent-glow': '0 0 20px rgba(30, 163, 102, 0.35)',
      '--badge-bg': 'rgba(30, 163, 102, 0.22)',
      '--badge-text': '#4ade80',
      '--email-anim-primary': '#1ea366',
      '--email-anim-accent': '#4ade80',
      '--email-anim-trail': '#24b874',
      '--icon-border-radius': '8px',
      '--selection-bg': '#194d34',
      '--selection-border': '#1ea366',
      '--primary-btn-bg': '#1ea366',
      '--primary-btn-hover': '#24b874',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#1f2e25',
    },
  },
  {
    id: 'pistachio',
    name: 'Pistache',
    subtitle: 'Claro suave com verde pistache/oliva e cartões nítidos',
    category: 'light',
    soundTheme: 'light',
    icon: 'leaf',
    previewColors: ['#f4f6f0', '#ffffff', '#4e7030'],
    variables: {
      '--bg-app': '#f4f6f0',
      '--bg-sidebar': '#f7f9f4',
      '--bg-surface': '#ffffff',
      '--bg-surface-hover': '#edf2e6',
      '--bg-card': '#ffffff',
      '--bg-input': '#ffffff',
      '--border-subtle': '#d8e0ce',
      '--border-highlight': '#5a8038',
      '--text-primary': '#1e2918',
      '--text-secondary': '#3f4f36',
      '--text-muted': '#6b7a62',
      '--accent-primary': '#4e7030',
      '--accent-hover': '#5d8539',
      '--accent-gradient': 'linear-gradient(135deg, #3f5c26 0%, #4e7030 50%, #5d8539 100%)',
      '--accent-glow': '0 0 15px rgba(78, 112, 48, 0.25)',
      '--badge-bg': '#e6f0da',
      '--badge-text': '#3d5a24',
      '--email-anim-primary': '#4e7030',
      '--email-anim-accent': '#6fa044',
      '--email-anim-trail': '#8bc34a',
      '--icon-border-radius': '8px',
      '--selection-bg': '#e7f0dc',
      '--selection-border': '#5a8038',
      '--primary-btn-bg': '#4e7030',
      '--primary-btn-hover': '#5d8539',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#eef4e6',
    },
  },
  {
    id: 'glacier',
    name: 'Geleira',
    subtitle: 'Claro glacial com azul aço elegante e contraste refinado',
    category: 'light',
    soundTheme: 'light',
    icon: 'droplet',
    previewColors: ['#f2f6fa', '#ffffff', '#2e618e'],
    variables: {
      '--bg-app': '#f2f6fa',
      '--bg-sidebar': '#f6f9fc',
      '--bg-surface': '#ffffff',
      '--bg-surface-hover': '#e8f0f8',
      '--bg-card': '#ffffff',
      '--bg-input': '#ffffff',
      '--border-subtle': '#d0dce8',
      '--border-highlight': '#3872a6',
      '--text-primary': '#0f2338',
      '--text-secondary': '#334e68',
      '--text-muted': '#627d98',
      '--accent-primary': '#2e618e',
      '--accent-hover': '#3a76ab',
      '--accent-gradient': 'linear-gradient(135deg, #244d72 0%, #2e618e 50%, #3a76ab 100%)',
      '--accent-glow': '0 0 15px rgba(46, 97, 142, 0.25)',
      '--badge-bg': '#e1edf7',
      '--badge-text': '#234d73',
      '--email-anim-primary': '#2e618e',
      '--email-anim-accent': '#4b8cc4',
      '--email-anim-trail': '#60a5fa',
      '--icon-border-radius': '8px',
      '--selection-bg': '#e2eef9',
      '--selection-border': '#3872a6',
      '--primary-btn-bg': '#2e618e',
      '--primary-btn-hover': '#3a76ab',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#ebf3fa',
    },
  },
  {
    id: 'cyberpunk-neon',
    name: 'Neon Futurista',
    subtitle: 'Escuro tecnológico com ciano elétrico, verde neon e bordas iluminadas',
    category: 'special',
    soundTheme: 'cyberpunk',
    icon: 'cpu',
    previewColors: ['#04070d', '#07101e', '#00f0ff'],
    variables: {
      '--bg-app': '#03060a',
      '--bg-sidebar': '#050b14',
      '--bg-surface': '#081220',
      '--bg-surface-hover': '#0c1b30',
      '--bg-card': '#07111f',
      '--bg-input': '#050c18',
      '--border-subtle': '#0e2540',
      '--border-highlight': '#00f0ff',
      '--text-primary': '#e0f2fe',
      '--text-secondary': '#7dd3fc',
      '--text-muted': '#0284c7',
      '--accent-primary': '#00f0ff',
      '--accent-hover': '#38bdf8',
      '--accent-gradient': 'linear-gradient(135deg, #0284c7 0%, #00f0ff 50%, #10b981 100%)',
      '--accent-glow': '0 0 25px rgba(0, 240, 255, 0.45)',
      '--badge-bg': 'rgba(0, 240, 255, 0.12)',
      '--badge-text': '#00f0ff',
      '--email-anim-primary': '#00f0ff',
      '--email-anim-accent': '#10b981',
      '--email-anim-trail': '#38bdf8',
      '--icon-border-radius': '6px',
      '--selection-bg': '#0c233a',
      '--selection-border': '#00f0ff',
      '--primary-btn-bg': '#00d2e0',
      '--primary-btn-hover': '#00f0ff',
      '--primary-btn-text': '#04111d',
      '--secondary-btn-bg': '#0b1b2e',
    },
  },
  {
    id: 'nordic-frost',
    name: 'Gelo Nórdico',
    subtitle: 'Ardósia ártica minimalista com azul glacial e harmonia suave',
    category: 'dark',
    soundTheme: 'nordic',
    icon: 'snowflake',
    previewColors: ['#0b1320', '#111e33', '#38bdf8'],
    variables: {
      '--bg-app': '#09101a',
      '--bg-sidebar': '#0d1726',
      '--bg-surface': '#132137',
      '--bg-surface-hover': '#1a2c47',
      '--bg-card': '#101c2e',
      '--bg-input': '#0b1422',
      '--border-subtle': '#1c314f',
      '--border-highlight': '#38bdf8',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#94a3b8',
      '--text-muted': '#64748b',
      '--accent-primary': '#38bdf8',
      '--accent-hover': '#7dd3fc',
      '--accent-gradient': 'linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #bae6fd 100%)',
      '--accent-glow': '0 0 20px rgba(56, 189, 248, 0.35)',
      '--badge-bg': 'rgba(56, 189, 248, 0.15)',
      '--badge-text': '#7dd3fc',
      '--email-anim-primary': '#38bdf8',
      '--email-anim-accent': '#e2e8f0',
      '--email-anim-trail': '#7dd3fc',
      '--icon-border-radius': '12px',
      '--selection-bg': '#172e4a',
      '--selection-border': '#38bdf8',
      '--primary-btn-bg': '#0284c7',
      '--primary-btn-hover': '#38bdf8',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#132338',
    },
  },
  {
    id: 'corporate-light',
    name: 'Polar Executivo Claro',
    subtitle: 'Branco nítido moderno com azul real e legibilidade ultra-alta',
    category: 'light',
    soundTheme: 'light',
    icon: 'sun',
    previewColors: ['#f8fafc', '#ffffff', '#1d4ed8'],
    variables: {
      '--bg-app': '#f1f5f9',
      '--bg-sidebar': '#ffffff',
      '--bg-surface': '#ffffff',
      '--bg-surface-hover': '#e2e8f0',
      '--bg-card': '#ffffff',
      '--bg-input': '#ffffff',
      '--border-subtle': '#cbd5e1',
      '--border-highlight': '#1d4ed8',
      '--text-primary': '#0f172a',
      '--text-secondary': '#334155',
      '--text-muted': '#64748b',
      '--accent-primary': '#1d4ed8',
      '--accent-hover': '#2563eb',
      '--accent-gradient': 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 50%, #3b82f6 100%)',
      '--accent-glow': '0 0 15px rgba(29, 78, 216, 0.25)',
      '--badge-bg': 'rgba(29, 78, 216, 0.1)',
      '--badge-text': '#1d4ed8',
      '--email-anim-primary': '#1d4ed8',
      '--email-anim-accent': '#0284c7',
      '--email-anim-trail': '#3b82f6',
      '--icon-border-radius': '10px',
      '--selection-bg': '#eff6ff',
      '--selection-border': '#2563eb',
      '--primary-btn-bg': '#1d4ed8',
      '--primary-btn-hover': '#2563eb',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#e8eef7',
    },
  },
  {
    id: 'vintage-parchment',
    name: 'Âmbar Real Retrô',
    subtitle: 'Conhaque nobre com detalhes em ouro champanhe e acabamento retrô',
    category: 'special',
    soundTheme: 'vintage',
    icon: 'crown',
    previewColors: ['#171210', '#221b18', '#d97706'],
    variables: {
      '--bg-app': '#140f0d',
      '--bg-sidebar': '#1a1411',
      '--bg-surface': '#241b17',
      '--bg-surface-hover': '#322620',
      '--bg-card': '#1f1714',
      '--bg-input': '#181210',
      '--border-subtle': '#3d2e27',
      '--border-highlight': '#d97706',
      '--text-primary': '#fef3c7',
      '--text-secondary': '#d5c4a1',
      '--text-muted': '#927b68',
      '--accent-primary': '#d97706',
      '--accent-hover': '#f59e0b',
      '--accent-gradient': 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)',
      '--accent-glow': '0 0 20px rgba(217, 119, 6, 0.35)',
      '--badge-bg': 'rgba(217, 119, 6, 0.18)',
      '--badge-text': '#fbbf24',
      '--email-anim-primary': '#d97706',
      '--email-anim-accent': '#fbbf24',
      '--email-anim-trail': '#f59e0b',
      '--icon-border-radius': '8px',
      '--selection-bg': '#332218',
      '--selection-border': '#d97706',
      '--primary-btn-bg': '#d97706',
      '--primary-btn-hover': '#f59e0b',
      '--primary-btn-text': '#ffffff',
      '--secondary-btn-bg': '#291e19',
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

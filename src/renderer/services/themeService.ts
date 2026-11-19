/**
 * ThemeService - Sistema de 16 Skins (1 Padrão + 7 Claros + 8 Escuros) e Variáveis CSS para o Anectta MAIL
 * Gerencia paletas completas de cores, estilos visuais, persistência de último tema Claro/Escuro e integração sonora.
 */

import { soundService, SoundTheme } from './soundService';

export type SkinSection = 'default' | 'light' | 'dark';

export interface SkinDefinition {
  id: string;
  name: string;
  subtitle: string;
  category: 'dark' | 'light';
  section: SkinSection;
  soundTheme: SoundTheme;
  previewColors: string[]; // [bg, surface/sidebar, accent]
  icon: string;
  variables: Record<string, string>;
}

export const AVAILABLE_SKINS: SkinDefinition[] = [
  // =========================================================================
  // TEMA PADRÃO (1)
  // =========================================================================
  {
    id: 'executive-midnight',
    name: 'Marinho Profundo + Azul',
    subtitle: 'Azul-marinho corporativo clássico com azul cobalto e dourado discreto',
    category: 'dark',
    section: 'default',
    soundTheme: 'executive',
    icon: 'briefcase',
    previewColors: ['#060a12', '#0f172a', '#2563eb'],
    variables: {
      '--bg-app': '#060a12',
      '--bg-sidebar': '#090e18',
      '--bg-surface': '#0f172a',
      '--bg-surface-hover': '#1e293b',
      '--bg-hover': '#1e293b',
      '--bg-card': '#0d1527',
      '--bg-input': '#09101d',
      '--border-subtle': '#1e293b',
      '--border-highlight': '#3b82f6',
      '--text-primary': '#f8fafc',
      '--text-secondary': '#94a3b8',
      '--text-muted': '#64748b',
      '--accent-primary': '#2563eb',
      '--accent-hover': '#3b82f6',
      '--accent-contrast': '#ffffff',
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

  // =========================================================================
  // TEMAS CLAROS (7) — Paletas 1, 2, 3, 4, 5, 7 e 10
  // =========================================================================
  {
    id: 'slate-teal',
    name: 'Ardósia + Azul-petróleo',
    subtitle: 'Ardósia clara minimalista com destaque verde-azulado (Teal)',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'droplet',
    previewColors: ['#F8FAFC', '#FFFFFF', '#0D9488'],
    variables: {
      '--bg-app': '#F8FAFC',
      '--bg-sidebar': '#F1F5F9',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-hover': '#E2E8F0',
      '--bg-hover': '#E2E8F0',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#CBD5E1',
      '--border-highlight': '#0D9488',
      '--text-primary': '#0F172A',
      '--text-secondary': '#334155',
      '--text-muted': '#64748B',
      '--accent-primary': '#0D9488',
      '--accent-hover': '#0F766E',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #0F766E 0%, #0D9488 50%, #14B8A6 100%)',
      '--accent-glow': '0 0 16px rgba(13, 148, 136, 0.25)',
      '--badge-bg': '#CCFBF1',
      '--badge-text': '#0F766E',
      '--email-anim-primary': '#0D9488',
      '--email-anim-accent': '#14B8A6',
      '--email-anim-trail': '#2DD4BF',
      '--icon-border-radius': '10px',
      '--selection-bg': '#E6FFFA',
      '--selection-border': '#0D9488',
      '--primary-btn-bg': '#0D9488',
      '--primary-btn-hover': '#0F766E',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#E2E8F0',
    },
  },
  {
    id: 'creme-sage',
    name: '2. Creme + Verde Sálvia',
    subtitle: 'Fundo creme orgânico com barra lateral escura e acento verde sálvia',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'leaf',
    previewColors: ['#F5F2EB', '#2B2D25', '#4D6B3C'],
    variables: {
      '--bg-app': '#F5F2EB',
      '--bg-sidebar': '#ECE8DF',
      '--bg-surface': '#FAF8F3',
      '--bg-surface-hover': '#E5E0D3',
      '--bg-hover': '#E5E0D3',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#D5CFC0',
      '--border-highlight': '#4D6B3C',
      '--text-primary': '#23261E',
      '--text-secondary': '#454A3D',
      '--text-muted': '#6E7464',
      '--accent-primary': '#4D6B3C',
      '--accent-hover': '#3E5730',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #3E5730 0%, #4D6B3C 50%, #62854E 100%)',
      '--accent-glow': '0 0 16px rgba(77, 107, 60, 0.25)',
      '--badge-bg': '#E3ECD9',
      '--badge-text': '#3B542D',
      '--email-anim-primary': '#4D6B3C',
      '--email-anim-accent': '#62854E',
      '--email-anim-trail': '#84A96E',
      '--icon-border-radius': '10px',
      '--selection-bg': '#E6EFE0',
      '--selection-border': '#4D6B3C',
      '--primary-btn-bg': '#4D6B3C',
      '--primary-btn-hover': '#3E5730',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#E7E3D8',
    },
  },
  {
    id: 'gray-indigo',
    name: '3. Cinza + Índigo',
    subtitle: 'Cinza corporativo neutro com contraste marinho e acento índigo vibrante',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'layers',
    previewColors: ['#F3F4F6', '#111827', '#4F46E5'],
    variables: {
      '--bg-app': '#F3F4F6',
      '--bg-sidebar': '#E5E7EB',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-hover': '#E5E7EB',
      '--bg-hover': '#E5E7EB',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#D1D5DB',
      '--border-highlight': '#4F46E5',
      '--text-primary': '#111827',
      '--text-secondary': '#374151',
      '--text-muted': '#6B7280',
      '--accent-primary': '#4F46E5',
      '--accent-hover': '#4338CA',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #4338CA 0%, #4F46E5 50%, #6366F1 100%)',
      '--accent-glow': '0 0 16px rgba(79, 70, 229, 0.25)',
      '--badge-bg': '#E0E7FF',
      '--badge-text': '#3730A3',
      '--email-anim-primary': '#4F46E5',
      '--email-anim-accent': '#6366F1',
      '--email-anim-trail': '#818CF8',
      '--icon-border-radius': '10px',
      '--selection-bg': '#EEF2FF',
      '--selection-border': '#4F46E5',
      '--primary-btn-bg': '#4F46E5',
      '--primary-btn-hover': '#4338CA',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#E5E7EB',
    },
  },
  {
    id: 'offwhite-coral',
    name: '4. Off-white + Coral',
    subtitle: 'Superfície marfim acolhedora com tipografia café e destaque coral quente',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'sun',
    previewColors: ['#FFFBF7', '#231815', '#EA580C'],
    variables: {
      '--bg-app': '#FFFBF7',
      '--bg-sidebar': '#F7EFE8',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-hover': '#F3E5D8',
      '--bg-hover': '#F3E5D8',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#E6D5C6',
      '--border-highlight': '#EA580C',
      '--text-primary': '#231815',
      '--text-secondary': '#4A3731',
      '--text-muted': '#7C655D',
      '--accent-primary': '#EA580C',
      '--accent-hover': '#C2410C',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #C2410C 0%, #EA580C 50%, #F97316 100%)',
      '--accent-glow': '0 0 16px rgba(234, 88, 12, 0.25)',
      '--badge-bg': '#FFEDD5',
      '--badge-text': '#C2410C',
      '--email-anim-primary': '#EA580C',
      '--email-anim-accent': '#F97316',
      '--email-anim-trail': '#FB923C',
      '--icon-border-radius': '10px',
      '--selection-bg': '#FFF3E6',
      '--selection-border': '#EA580C',
      '--primary-btn-bg': '#EA580C',
      '--primary-btn-hover': '#C2410C',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#F2E7DC',
    },
  },
  {
    id: 'lavender-purple',
    name: '5. Lavanda + Roxo',
    subtitle: 'Lavanda suave moderna com contraste violeta profundo e acento roxo real',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'sparkles',
    previewColors: ['#F5F3FF', '#1E1B4B', '#7C3AED'],
    variables: {
      '--bg-app': '#F5F3FF',
      '--bg-sidebar': '#EDE9FE',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-hover': '#DDD6FE',
      '--bg-hover': '#DDD6FE',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#C4B5FD',
      '--border-highlight': '#7C3AED',
      '--text-primary': '#1E1B4B',
      '--text-secondary': '#3B356B',
      '--text-muted': '#6D6797',
      '--accent-primary': '#7C3AED',
      '--accent-hover': '#6D28D9',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #6D28D9 0%, #7C3AED 50%, #8B5CF6 100%)',
      '--accent-glow': '0 0 16px rgba(124, 58, 237, 0.25)',
      '--badge-bg': '#EDE9FE',
      '--badge-text': '#6D28D9',
      '--email-anim-primary': '#7C3AED',
      '--email-anim-accent': '#8B5CF6',
      '--email-anim-trail': '#A78BFA',
      '--icon-border-radius': '10px',
      '--selection-bg': '#F0EBFF',
      '--selection-border': '#7C3AED',
      '--primary-btn-bg': '#7C3AED',
      '--primary-btn-hover': '#6D28D9',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#E9E3FE',
    },
  },
  {
    id: 'royal-cyan',
    name: '7. Azul Royal + Ciano',
    subtitle: 'Claro cristalino com azul royal executivo e detalhes em ciano luminoso',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'snowflake',
    previewColors: ['#F0F9FF', '#1D4ED8', '#06B6D4'],
    variables: {
      '--bg-app': '#F0F9FF',
      '--bg-sidebar': '#E0F2FE',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-hover': '#BAE6FD',
      '--bg-hover': '#BAE6FD',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#BAE6FD',
      '--border-highlight': '#1D4ED8',
      '--text-primary': '#0C2340',
      '--text-secondary': '#1E3A5F',
      '--text-muted': '#4B6B8E',
      '--accent-primary': '#1D4ED8',
      '--accent-hover': '#1E40AF',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #1D4ED8 0%, #0284C7 50%, #06B6D4 100%)',
      '--accent-glow': '0 0 16px rgba(29, 78, 216, 0.25)',
      '--badge-bg': '#E0F2FE',
      '--badge-text': '#1D4ED8',
      '--email-anim-primary': '#1D4ED8',
      '--email-anim-accent': '#06B6D4',
      '--email-anim-trail': '#38BDF8',
      '--icon-border-radius': '10px',
      '--selection-bg': '#E0F2FE',
      '--selection-border': '#1D4ED8',
      '--primary-btn-bg': '#1D4ED8',
      '--primary-btn-hover': '#1E40AF',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#E0F2FE',
    },
  },
  {
    id: 'red-offwhite',
    name: '10. Vermelho + Off-white',
    subtitle: 'Off-white rosado suave com contraste carvão e vermelho carmim executivo',
    category: 'light',
    section: 'light',
    soundTheme: 'light',
    icon: 'flame',
    previewColors: ['#FFF5F5', '#1C1917', '#DC2626'],
    variables: {
      '--bg-app': '#FFF5F5',
      '--bg-sidebar': '#FEE2E2',
      '--bg-surface': '#FFFFFF',
      '--bg-surface-hover': '#FECACA',
      '--bg-hover': '#FECACA',
      '--bg-card': '#FFFFFF',
      '--bg-input': '#FFFFFF',
      '--border-subtle': '#FCA5A5',
      '--border-highlight': '#DC2626',
      '--text-primary': '#1C1917',
      '--text-secondary': '#44403C',
      '--text-muted': '#78716C',
      '--accent-primary': '#DC2626',
      '--accent-hover': '#B91C1C',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #B91C1C 0%, #DC2626 50%, #EF4444 100%)',
      '--accent-glow': '0 0 16px rgba(220, 38, 38, 0.25)',
      '--badge-bg': '#FEE2E2',
      '--badge-text': '#B91C1C',
      '--email-anim-primary': '#DC2626',
      '--email-anim-accent': '#EF4444',
      '--email-anim-trail': '#F87171',
      '--icon-border-radius': '10px',
      '--selection-bg': '#FEF2F2',
      '--selection-border': '#DC2626',
      '--primary-btn-bg': '#DC2626',
      '--primary-btn-hover': '#B91C1C',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#FCE7E7',
    },
  },

  // =========================================================================
  // TEMAS ESCUROS (8) — Paletas 6, 8, 9, 11, 12, 13, 14 e 15
  // =========================================================================
  {
    id: 'purple-yellow',
    name: '6. Roxo + Amarelo',
    subtitle: 'Noturno violeta profundo com cards roxos vibrantes e destaque amarelo ouro',
    category: 'dark',
    section: 'dark',
    soundTheme: 'cyberpunk',
    icon: 'zap',
    previewColors: ['#131126', '#6D28D9', '#FACC15'],
    variables: {
      '--bg-app': '#131126',
      '--bg-sidebar': '#181530',
      '--bg-surface': '#1F1B3D',
      '--bg-surface-hover': '#2B2552',
      '--bg-hover': '#2B2552',
      '--bg-card': '#1C1836',
      '--bg-input': '#141229',
      '--border-subtle': '#332C61',
      '--border-highlight': '#FACC15',
      '--text-primary': '#F8FAFC',
      '--text-secondary': '#C4B5FD',
      '--text-muted': '#8B7EC8',
      '--accent-primary': '#8B5CF6',
      '--accent-hover': '#A78BFA',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 50%, #FACC15 100%)',
      '--accent-glow': '0 0 20px rgba(139, 92, 246, 0.35)',
      '--badge-bg': 'rgba(250, 204, 21, 0.16)',
      '--badge-text': '#FACC15',
      '--email-anim-primary': '#8B5CF6',
      '--email-anim-accent': '#FACC15',
      '--email-anim-trail': '#A78BFA',
      '--icon-border-radius': '10px',
      '--selection-bg': '#2D2459',
      '--selection-border': '#FACC15',
      '--primary-btn-bg': '#FACC15',
      '--primary-btn-hover': '#EAB308',
      '--primary-btn-text': '#131126',
      '--secondary-btn-bg': '#251F47',
    },
  },
  {
    id: 'orange-navy',
    name: '8. Laranja + Azul Marinho',
    subtitle: 'Azul marinho profundo com superfícies cobalto e acento laranja energético',
    category: 'dark',
    section: 'dark',
    soundTheme: 'executive',
    icon: 'compass',
    previewColors: ['#0B1325', '#1E3A8A', '#EA580C'],
    variables: {
      '--bg-app': '#0B1325',
      '--bg-sidebar': '#0E182E',
      '--bg-surface': '#15223F',
      '--bg-surface-hover': '#1E3056',
      '--bg-hover': '#1E3056',
      '--bg-card': '#131F3A',
      '--bg-input': '#0C1528',
      '--border-subtle': '#233863',
      '--border-highlight': '#EA580C',
      '--text-primary': '#F8FAFC',
      '--text-secondary': '#93C5FD',
      '--text-muted': '#6482B8',
      '--accent-primary': '#EA580C',
      '--accent-hover': '#F97316',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #C2410C 0%, #EA580C 50%, #F97316 100%)',
      '--accent-glow': '0 0 20px rgba(234, 88, 12, 0.35)',
      '--badge-bg': 'rgba(234, 88, 12, 0.18)',
      '--badge-text': '#FB923C',
      '--email-anim-primary': '#EA580C',
      '--email-anim-accent': '#3B82F6',
      '--email-anim-trail': '#FB923C',
      '--icon-border-radius': '10px',
      '--selection-bg': '#1E3158',
      '--selection-border': '#EA580C',
      '--primary-btn-bg': '#EA580C',
      '--primary-btn-hover': '#F97316',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#1A2A4C',
    },
  },
  {
    id: 'neon-black',
    name: '9. Verde Neon + Preto',
    subtitle: 'Preto obsidiana de alto contraste com verde matriz neon luminoso',
    category: 'dark',
    section: 'dark',
    soundTheme: 'cyberpunk',
    icon: 'cpu',
    previewColors: ['#060A07', '#0F1A12', '#22C55E'],
    variables: {
      '--bg-app': '#060A07',
      '--bg-sidebar': '#0A110C',
      '--bg-surface': '#101C14',
      '--bg-surface-hover': '#17291D',
      '--bg-hover': '#17291D',
      '--bg-card': '#0D1710',
      '--bg-input': '#080E0A',
      '--border-subtle': '#1E3525',
      '--border-highlight': '#22C55E',
      '--text-primary': '#ECFDF5',
      '--text-secondary': '#86EFAC',
      '--text-muted': '#4D8B62',
      '--accent-primary': '#22C55E',
      '--accent-hover': '#4ADE80',
      '--accent-contrast': '#051409',
      '--accent-gradient': 'linear-gradient(135deg, #16A34A 0%, #22C55E 50%, #4ADE80 100%)',
      '--accent-glow': '0 0 22px rgba(34, 197, 94, 0.4)',
      '--badge-bg': 'rgba(34, 197, 94, 0.16)',
      '--badge-text': '#4ADE80',
      '--email-anim-primary': '#22C55E',
      '--email-anim-accent': '#4ADE80',
      '--email-anim-trail': '#86EFAC',
      '--icon-border-radius': '8px',
      '--selection-bg': '#132E1C',
      '--selection-border': '#22C55E',
      '--primary-btn-bg': '#22C55E',
      '--primary-btn-hover': '#4ADE80',
      '--primary-btn-text': '#051409',
      '--secondary-btn-bg': '#142419',
    },
  },
  {
    id: 'deepblue-teal',
    name: '11. Deep Blue + Teal',
    subtitle: 'Azul oceânico profundo com ciano-esmeralda (Teal) luminoso',
    category: 'dark',
    section: 'dark',
    soundTheme: 'nordic',
    icon: 'anchor',
    previewColors: ['#081220', '#102138', '#2DD4BF'],
    variables: {
      '--bg-app': '#081220',
      '--bg-sidebar': '#0B1728',
      '--bg-surface': '#102138',
      '--bg-surface-hover': '#182F4D',
      '--bg-hover': '#182F4D',
      '--bg-card': '#0E1C30',
      '--bg-input': '#091423',
      '--border-subtle': '#1D3759',
      '--border-highlight': '#2DD4BF',
      '--text-primary': '#F0FDFA',
      '--text-secondary': '#94A3B8',
      '--text-muted': '#5E7896',
      '--accent-primary': '#14B8A6',
      '--accent-hover': '#2DD4BF',
      '--accent-contrast': '#042F2E',
      '--accent-gradient': 'linear-gradient(135deg, #0D9488 0%, #14B8A6 50%, #2DD4BF 100%)',
      '--accent-glow': '0 0 20px rgba(45, 212, 191, 0.35)',
      '--badge-bg': 'rgba(45, 212, 191, 0.16)',
      '--badge-text': '#2DD4BF',
      '--email-anim-primary': '#2DD4BF',
      '--email-anim-accent': '#14B8A6',
      '--email-anim-trail': '#5EEAD4',
      '--icon-border-radius': '10px',
      '--selection-bg': '#14334A',
      '--selection-border': '#2DD4BF',
      '--primary-btn-bg': '#2DD4BF',
      '--primary-btn-hover': '#14B8A6',
      '--primary-btn-text': '#061A1E',
      '--secondary-btn-bg': '#152A45',
    },
  },
  {
    id: 'darkslate-emerald',
    name: '12. Slate Escuro + Esmeralda',
    subtitle: 'Ardósia escura equilibrada com acentos em verde esmeralda corporativo',
    category: 'dark',
    section: 'dark',
    soundTheme: 'executive',
    icon: 'trees',
    previewColors: ['#111827', '#1E293B', '#10B981'],
    variables: {
      '--bg-app': '#111827',
      '--bg-sidebar': '#161F30',
      '--bg-surface': '#1E293B',
      '--bg-surface-hover': '#28364D',
      '--bg-hover': '#28364D',
      '--bg-card': '#192334',
      '--bg-input': '#121A2A',
      '--border-subtle': '#2E3E57',
      '--border-highlight': '#10B981',
      '--text-primary': '#F1F5F9',
      '--text-secondary': '#94A3B8',
      '--text-muted': '#64748B',
      '--accent-primary': '#10B981',
      '--accent-hover': '#34D399',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #059669 0%, #10B981 50%, #34D399 100%)',
      '--accent-glow': '0 0 20px rgba(16, 185, 129, 0.35)',
      '--badge-bg': 'rgba(16, 185, 129, 0.18)',
      '--badge-text': '#34D399',
      '--email-anim-primary': '#10B981',
      '--email-anim-accent': '#34D399',
      '--email-anim-trail': '#6EE7B7',
      '--icon-border-radius': '10px',
      '--selection-bg': '#163B38',
      '--selection-border': '#10B981',
      '--primary-btn-bg': '#10B981',
      '--primary-btn-hover': '#059669',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#243146',
    },
  },
  {
    id: 'graphite-softpurple',
    name: '13. Grafite + Roxo Soft',
    subtitle: 'Grafite neutro sofisticado com destaque em lilás e roxo suave',
    category: 'dark',
    section: 'dark',
    soundTheme: 'nordic',
    icon: 'moon',
    previewColors: ['#151519', '#202027', '#A855F7'],
    variables: {
      '--bg-app': '#151519',
      '--bg-sidebar': '#19191F',
      '--bg-surface': '#212129',
      '--bg-surface-hover': '#2C2C37',
      '--bg-hover': '#2C2C37',
      '--bg-card': '#1D1D24',
      '--bg-input': '#141418',
      '--border-subtle': '#32323F',
      '--border-highlight': '#A855F7',
      '--text-primary': '#F4F4F6',
      '--text-secondary': '#A1A1AA',
      '--text-muted': '#71717A',
      '--accent-primary': '#A855F7',
      '--accent-hover': '#C084FC',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #9333EA 0%, #A855F7 50%, #C084FC 100%)',
      '--accent-glow': '0 0 20px rgba(168, 85, 247, 0.35)',
      '--badge-bg': 'rgba(168, 85, 247, 0.18)',
      '--badge-text': '#C084FC',
      '--email-anim-primary': '#A855F7',
      '--email-anim-accent': '#C084FC',
      '--email-anim-trail': '#D8B4FE',
      '--icon-border-radius': '10px',
      '--selection-bg': '#2D223D',
      '--selection-border': '#A855F7',
      '--primary-btn-bg': '#A855F7',
      '--primary-btn-hover': '#9333EA',
      '--primary-btn-text': '#FFFFFF',
      '--secondary-btn-bg': '#272730',
    },
  },
  {
    id: 'charcoal-amber',
    name: '14. Carvão + Âmbar',
    subtitle: 'Carvão mineral quente com detalhes dourados e âmbar executivo',
    category: 'dark',
    section: 'dark',
    soundTheme: 'vintage',
    icon: 'crown',
    previewColors: ['#141311', '#211F1C', '#F59E0B'],
    variables: {
      '--bg-app': '#141311',
      '--bg-sidebar': '#191715',
      '--bg-surface': '#221F1C',
      '--bg-surface-hover': '#2E2A25',
      '--bg-hover': '#2E2A25',
      '--bg-card': '#1D1A17',
      '--bg-input': '#141210',
      '--border-subtle': '#38322C',
      '--border-highlight': '#F59E0B',
      '--text-primary': '#FEF3C7',
      '--text-secondary': '#D6C7B2',
      '--text-muted': '#8C7E6D',
      '--accent-primary': '#F59E0B',
      '--accent-hover': '#FBBF24',
      '--accent-contrast': '#18130A',
      '--accent-gradient': 'linear-gradient(135deg, #D97706 0%, #F59E0B 50%, #FBBF24 100%)',
      '--accent-glow': '0 0 20px rgba(245, 158, 11, 0.35)',
      '--badge-bg': 'rgba(245, 158, 11, 0.18)',
      '--badge-text': '#FBBF24',
      '--email-anim-primary': '#F59E0B',
      '--email-anim-accent': '#FBBF24',
      '--email-anim-trail': '#FDE68A',
      '--icon-border-radius': '10px',
      '--selection-bg': '#332818',
      '--selection-border': '#F59E0B',
      '--primary-btn-bg': '#F59E0B',
      '--primary-btn-hover': '#D97706',
      '--primary-btn-text': '#18130A',
      '--secondary-btn-bg': '#292521',
    },
  },
  {
    id: 'black-white',
    name: '15. Preto + Branco',
    subtitle: 'Monocromático OLED de altíssimo contraste com acento branco puro e azul sutil',
    category: 'dark',
    section: 'dark',
    soundTheme: 'executive',
    icon: 'contrast',
    previewColors: ['#09090B', '#18181B', '#3B82F6'],
    variables: {
      '--bg-app': '#09090B',
      '--bg-sidebar': '#101013',
      '--bg-surface': '#18181B',
      '--bg-surface-hover': '#27272A',
      '--bg-hover': '#27272A',
      '--bg-card': '#141417',
      '--bg-input': '#0C0C0E',
      '--border-subtle': '#2E2E33',
      '--border-highlight': '#3B82F6',
      '--text-primary': '#FAFAFA',
      '--text-secondary': '#A1A1AA',
      '--text-muted': '#71717A',
      '--accent-primary': '#3B82F6',
      '--accent-hover': '#60A5FA',
      '--accent-contrast': '#FFFFFF',
      '--accent-gradient': 'linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #60A5FA 100%)',
      '--accent-glow': '0 0 20px rgba(59, 130, 246, 0.35)',
      '--badge-bg': 'rgba(255, 255, 255, 0.12)',
      '--badge-text': '#FFFFFF',
      '--email-anim-primary': '#3B82F6',
      '--email-anim-accent': '#FFFFFF',
      '--email-anim-trail': '#60A5FA',
      '--icon-border-radius': '10px',
      '--selection-bg': '#1E2433',
      '--selection-border': '#3B82F6',
      '--primary-btn-bg': '#FFFFFF',
      '--primary-btn-hover': '#E4E4E7',
      '--primary-btn-text': '#09090B',
      '--secondary-btn-bg': '#222226',
    },
  },
];

const STORAGE_ACTIVE_KEY = 'anectta_active_skin';
const STORAGE_LAST_LIGHT_KEY = 'anectta_last_light_skin';
const STORAGE_LAST_DARK_KEY = 'anectta_last_dark_skin';
const STORAGE_MODE_KEY = 'anectta_theme_mode';

class ThemeService {
  private activeSkinId: string = 'executive-midnight';
  private lastLightSkinId: string = 'slate-teal';
  private lastDarkSkinId: string = 'executive-midnight';

  constructor() {
    try {
      const savedLight = localStorage.getItem(STORAGE_LAST_LIGHT_KEY);
      if (savedLight && AVAILABLE_SKINS.some((s) => s.id === savedLight && s.category === 'light')) {
        this.lastLightSkinId = savedLight;
      }

      const savedDark = localStorage.getItem(STORAGE_LAST_DARK_KEY);
      if (savedDark && AVAILABLE_SKINS.some((s) => s.id === savedDark && s.category === 'dark')) {
        this.lastDarkSkinId = savedDark;
      }

      const saved = localStorage.getItem(STORAGE_ACTIVE_KEY);
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

  public getLastLightSkinId(): string {
    return this.lastLightSkinId;
  }

  public getLastDarkSkinId(): string {
    return this.lastDarkSkinId;
  }

  public toggleLightDark(playFeedbackSound: boolean = true): SkinDefinition {
    const current = this.getActiveSkin();
    const targetId =
      current.category === 'light' ? this.lastDarkSkinId : this.lastLightSkinId;
    this.setSkin(targetId, playFeedbackSound);
    return this.getActiveSkin();
  }

  public setSkin(skinId: string, playFeedbackSound: boolean = true): void {
    const skin = AVAILABLE_SKINS.find((s) => s.id === skinId);
    if (!skin) return;

    this.activeSkinId = skinId;
    if (skin.category === 'light') {
      this.lastLightSkinId = skin.id;
    } else {
      this.lastDarkSkinId = skin.id;
    }

    try {
      localStorage.setItem(STORAGE_ACTIVE_KEY, skinId);
      localStorage.setItem(STORAGE_MODE_KEY, skin.category === 'light' ? 'clean' : 'dark');
      if (skin.category === 'light') {
        localStorage.setItem(STORAGE_LAST_LIGHT_KEY, skin.id);
      } else {
        localStorage.setItem(STORAGE_LAST_DARK_KEY, skin.id);
      }
    } catch {}

    // Aplica atributo [data-theme], variáveis CSS e classes (.dark / .clean-white) no <html>
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

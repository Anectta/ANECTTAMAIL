import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  PenSquare,
  Inbox,
  Send,
  Archive,
  Clock,
  Trash2,
  Shield,
  RefreshCw,
  Zap,
  Sparkles,
  Palette,
  FileDown,
  UserPlus,
} from 'lucide-react';
import { themeService } from '../services/themeService';
import { soundService } from '../services/soundService';

interface CommandItem {
  id: string;
  title: string;
  category: 'Navegação' | 'Ações Rápidas' | 'Sistema';
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateFolder: (folder: any) => void;
  onCompose: () => void;
  onArchiveCurrent: () => void;
  onSnoozeCurrent: () => void;
  onExportCurrentEml?: () => void;
  onToggleTheme?: () => void;
  onRefresh: () => void;
  onOpenAnimationPreview?: () => void;
  onOpenSetupWizard?: () => void;
  onOpenSkins?: () => void;
  isDark?: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigateFolder,
  onCompose,
  onArchiveCurrent,
  onSnoozeCurrent,
  onExportCurrentEml,
  onRefresh,
  onOpenAnimationPreview,
  onOpenSetupWizard,
  onOpenSkins,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'quick-compose',
      title: 'Quick Compose Global (Janela Flutuante)',
      category: 'Ações Rápidas',
      icon: Zap,
      shortcut: 'Ctrl+Shift+E',
      action: () => {
        window.electronAPI?.openQuickCompose();
        onClose();
      },
    },
    {
      id: 'compose',
      title: 'Escrever Novo E-mail Corporativo',
      category: 'Ações Rápidas',
      icon: PenSquare,
      shortcut: 'C',
      action: () => {
        onCompose();
        onClose();
      },
    },
    ...(onOpenSetupWizard
      ? [
          {
            id: 'setup-wizard',
            title: 'Conectar Nova Conta (Gmail, Outlook, M365, iCloud, Yahoo, Manual)',
            category: 'Ações Rápidas' as const,
            icon: UserPlus,
            shortcut: 'Ctrl+Shift+A',
            action: () => {
              onOpenSetupWizard();
              onClose();
            },
          },
        ]
      : []),
    {
      id: 'inbox',
      title: 'Ir para Caixa de Entrada',
      category: 'Navegação',
      icon: Inbox,
      shortcut: 'G + I',
      action: () => {
        onNavigateFolder('inbox');
        onClose();
      },
    },
    {
      id: 'sent',
      title: 'Ir para Enviados',
      category: 'Navegação',
      icon: Send,
      shortcut: 'G + S',
      action: () => {
        onNavigateFolder('sent');
        onClose();
      },
    },
    {
      id: 'archive-folder',
      title: 'Ir para Arquivados',
      category: 'Navegação',
      icon: Archive,
      action: () => {
        onNavigateFolder('archive');
        onClose();
      },
    },
    {
      id: 'snooze-folder',
      title: 'Ir para Snoozed (Adiados)',
      category: 'Navegação',
      icon: Clock,
      action: () => {
        onNavigateFolder('snooze');
        onClose();
      },
    },
    {
      id: 'trash-folder',
      title: 'Ir para Lixeira',
      category: 'Navegação',
      icon: Trash2,
      action: () => {
        onNavigateFolder('trash');
        onClose();
      },
    },
    {
      id: 'archive-active',
      title: 'Arquivar E-mail Ativo',
      category: 'Ações Rápidas',
      icon: Archive,
      shortcut: 'E',
      action: () => {
        onArchiveCurrent();
        onClose();
      },
    },
    {
      id: 'snooze-active',
      title: 'Adiar E-mail Ativo (Snooze)',
      category: 'Ações Rápidas',
      icon: Clock,
      shortcut: 'S',
      action: () => {
        onSnoozeCurrent();
        onClose();
      },
    },
    {
      id: 'export-eml',
      title: 'Exportar E-mail Selecionado para Formato Aberto (.EML)',
      category: 'Ações Rápidas',
      icon: FileDown,
      action: () => {
        if (onExportCurrentEml) onExportCurrentEml();
        onClose();
      },
    },
    {
      id: 'preview-icons',
      title: 'Preview: Ícones Animados de Envio e Recebimento (SVG)',
      category: 'Sistema',
      icon: Sparkles,
      action: () => {
        if (onOpenAnimationPreview) onOpenAnimationPreview();
        onClose();
      },
    },
    {
      id: 'open-skins',
      title: 'Skins, Temas & Ambientação Sonora (Cores, Ícones e Sons)',
      category: 'Sistema',
      icon: Palette,
      shortcut: 'Alt+S',
      action: () => {
        if (onOpenSkins) onOpenSkins();
        onClose();
      },
    },
    {
      id: 'skin-midnight',
      title: 'Ativar Tema: Marinho Profundo + Azul (Tema Escuro)',
      category: 'Sistema',
      icon: Palette,
      action: () => {
        themeService.setSkin('executive-midnight');
        onClose();
      },
    },
    {
      id: 'toggle-sound',
      title: soundService.isEnabled() ? 'Desativar Sons do App (Mudo)' : 'Ativar Sons do App (Web Audio)',
      category: 'Sistema',
      icon: Sparkles,
      action: () => {
        const next = !soundService.isEnabled();
        soundService.setEnabled(next);
        if (next) soundService.play('pop');
        onClose();
      },
    },
    {
      id: 'sync',
      title: 'Sincronizar Servidor Corporativo',
      category: 'Sistema',
      icon: RefreshCw,
      shortcut: 'R',
      action: () => {
        onRefresh();
        onClose();
      },
    },
  ];

  // Filter commands by text query in title or category
  const filteredCommands = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-start justify-center pt-20 px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-slate-950/80 overflow-hidden text-slate-200"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-slate-800 bg-slate-900/90">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite uma ação ou pesquise comandos corporativos..."
            className="w-full bg-transparent py-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
            Esc
          </kbd>
        </div>

        {/* Command List */}
        <div className="max-h-80 overflow-y-auto p-2 custom-scroll space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Nenhuma ação encontrada para &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((command, index) => {
              const Icon = command.icon;
              const isSelected = selectedIndex === index;
              return (
                <div
                  key={command.id}
                  onClick={() => command.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-600/20 text-white border border-brand-500/30'
                      : 'text-slate-300 hover:bg-slate-850 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        isSelected
                          ? 'bg-brand-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold">{command.title}</div>
                      <div className="text-[10px] text-slate-500">
                        {command.category}
                      </div>
                    </div>
                  </div>

                  {command.shortcut && (
                    <kbd className="px-2 py-0.5 text-[10px] font-mono bg-slate-800/90 text-slate-300 rounded border border-slate-700">
                      {command.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center space-x-3">
            <span>↑↓ Navegar</span>
            <span>↵ Executar</span>
            <span>Esc Fechar</span>
          </div>
          <div className="flex items-center space-x-1.5 text-brand-400">
            <Shield className="w-3 h-3" />
            <span>Anectta Enterprise Core</span>
          </div>
        </div>
      </div>
    </div>
  );
};

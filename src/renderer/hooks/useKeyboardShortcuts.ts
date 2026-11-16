import { useEffect } from 'react';

interface ShortcutHandlers {
  disabled?: boolean;
  onOpenCommandPalette?: () => void;
  onOpenSkins?: () => void;
  onCompose?: () => void;
  onArchive?: () => void;
  onSnooze?: () => void;
  onDelete?: () => void;
  onFocusSearch?: () => void;
  onNextEmail?: () => void;
  onPrevEmail?: () => void;
  onEscape?: () => void;
  onToggleStar?: () => void;
  onToggleMinimalLayout?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Global shortcut: Ctrl+K or Cmd+K always available
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        handlers.onOpenCommandPalette?.();
        return;
      }

      // Alt+S: Skins & Sons
      if (event.altKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        handlers.onOpenSkins?.();
        return;
      }

      // Ctrl+Shift+F: Layout mínimo
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'f' || event.key === 'F')) {
        event.preventDefault();
        handlers.onToggleMinimalLayout?.();
        return;
      }

      // Escape always available
      if (event.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }

      // Do not trigger single-key productivity navigation when typing inside input/textarea or when modal/settings is active
      if (handlers.disabled || isInput) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          handlers.onCompose?.();
          break;
        case 'e':
          event.preventDefault();
          handlers.onArchive?.();
          break;
        case 's':
          event.preventDefault();
          handlers.onSnooze?.();
          break;
        case '#':
        case 'delete':
          event.preventDefault();
          handlers.onDelete?.();
          break;
        case '/':
          event.preventDefault();
          handlers.onFocusSearch?.();
          break;
        case 'j':
        case 'arrowdown':
          event.preventDefault();
          handlers.onNextEmail?.();
          break;
        case 'k':
        case 'arrowup':
          event.preventDefault();
          handlers.onPrevEmail?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};

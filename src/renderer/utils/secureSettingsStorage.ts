/**
 * Persistência local das configurações com credenciais criptografadas.
 * As senhas/tokens são protegidos pelo processo principal (safeStorage/DPAPI).
 * Valores antigos em texto puro continuam legíveis (migração automática na próxima gravação).
 */
const SETTINGS_KEY = 'anectta_mail_settings';

export function saveSettingsLocal(settings: unknown): void {
  try {
    const protectedCopy = window.electronAPI?.protectSettingsSync?.(settings);
    // Se a criptografia não estiver disponível, grava como antes (comportamento anterior)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(protectedCopy ?? settings));
  } catch {
    // ignora falhas de armazenamento
  }
}

export function loadSettingsLocal<T = any>(): T | null {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const revealed = window.electronAPI?.revealSettingsSync?.(parsed);
    const result = (revealed ?? parsed) as T;
    // Migração: regrava protegido caso o valor salvo ainda esteja em texto puro
    if (revealed) saveSettingsLocal(result);
    return result;
  } catch {
    return null;
  }
}

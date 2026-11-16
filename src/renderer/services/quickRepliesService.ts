export const DEFAULT_QUICK_REPLIES = [
  'Excelente, obrigado pelo alinhamento. Ciente das informações.',
  'Recebido. Vou analisar internamente e dou um retorno até o fim do dia.',
  'Aprovado para seguirmos com os próximos passos conforme planejado.',
  'Confirmado, estarei presente no horário agendado.',
  'Recebido. Encaminhei para nossa equipe financeira processar.',
  'Recebido com sucesso. Já estou revisando os documentos anexados.',
];

const STORAGE_KEY = 'anectta_custom_quick_replies';

export class QuickRepliesService {
  public static getReplies(): string[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return [...DEFAULT_QUICK_REPLIES];
  }

  public static isCustomized(): boolean {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  }

  public static saveReplies(replies: string[]): void {
    try {
      const clean = replies.map((r) => r.trim()).filter((r) => r.length > 0);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      window.dispatchEvent(
        new CustomEvent('anectta:quick-replies-updated', { detail: clean })
      );
    } catch (err) {
      console.error('Erro ao salvar respostas rápidas:', err);
    }
  }

  public static resetToDefaults(): string[] {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(
        new CustomEvent('anectta:quick-replies-updated', { detail: DEFAULT_QUICK_REPLIES })
      );
    } catch {}
    return [...DEFAULT_QUICK_REPLIES];
  }
}

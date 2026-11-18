export interface QuickSnippetItem {
  id: string;
  title: string;
  content: string;
}

export const DEFAULT_QUICK_SNIPPETS: QuickSnippetItem[] = [
  {
    id: 'snip-1',
    title: 'Confirmação de Recebimento',
    content: 'Recebido. Vou analisar internamente e dou um retorno até o fim do dia.',
  },
  {
    id: 'snip-2',
    title: 'Aprovação de Próximos Passos',
    content: 'Aprovado para seguirmos com os próximos passos conforme planejado.',
  },
  {
    id: 'snip-3',
    title: 'Revisão de Documentos',
    content: 'Recebido com sucesso. Já estou revisando os documentos anexados.',
  },
  {
    id: 'snip-4',
    title: 'Agradecimento e Disposição',
    content: 'Desde já, agradecemos pela atenção e permanecemos à disposição para quaisquer esclarecimentos.',
  },
];

export const DEFAULT_QUICK_REPLIES = DEFAULT_QUICK_SNIPPETS.map((s) => s.content);

const STORAGE_KEY = 'anectta_custom_quick_replies';
const SNIPPETS_STORAGE_KEY = 'anectta_mail_snippets_v1';

const buildTitleFromContent = (content: string, index: number): string => {
  const firstLine = content.replace(/\r?\n/g, ' ').trim();
  if (!firstLine) return `Resposta Rápida #${index + 1}`;
  const words = firstLine.split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?]+$/, '');
  return words || `Resposta Rápida #${index + 1}`;
};

export class QuickRepliesService {
  public static getSnippets(): QuickSnippetItem[] {
    try {
      const savedSnips = localStorage.getItem(SNIPPETS_STORAGE_KEY);
      if (savedSnips) {
        const parsed = JSON.parse(savedSnips);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.content) {
          return parsed.map((item: any, idx: number) => ({
            id: String(item.id || `snip-${idx + 1}`),
            title: String(item.title || '').trim() || buildTitleFromContent(String(item.content || ''), idx),
            content: String(item.content || '').trim(),
          })).filter((s: QuickSnippetItem) => s.content.length > 0);
        }
      }
      const savedReplies = localStorage.getItem(STORAGE_KEY);
      if (savedReplies) {
        const parsed = JSON.parse(savedReplies);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
            .map((text: any, idx: number) => {
              const content = String(text || '').trim();
              const defMatch = DEFAULT_QUICK_SNIPPETS.find((d) => d.content === content);
              return {
                id: `snip-${idx + 1}`,
                title: defMatch?.title || buildTitleFromContent(content, idx),
                content,
              };
            })
            .filter((s: QuickSnippetItem) => s.content.length > 0);
        }
      }
    } catch {}
    return DEFAULT_QUICK_SNIPPETS.map((s) => ({ ...s }));
  }

  public static saveSnippets(snippets: QuickSnippetItem[]): QuickSnippetItem[] {
    const clean = snippets
      .map((s, idx) => {
        const content = String(s.content || '').trim();
        const title = String(s.title || '').trim() || buildTitleFromContent(content, idx);
        return {
          id: s.id || `snip-${Date.now()}-${idx}`,
          title,
          content,
        };
      })
      .filter((s) => s.content.length > 0);

    try {
      const repliesOnly = clean.map((s) => s.content);
      localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(clean));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(repliesOnly));
      window.dispatchEvent(
        new CustomEvent('anectta:quick-replies-updated', {
          detail: repliesOnly,
        })
      );
      window.dispatchEvent(
        new CustomEvent('anectta:snippets-updated', {
          detail: clean,
        })
      );
    } catch (err) {
      console.error('Erro ao salvar snippets / respostas rápidas:', err);
    }
    return clean;
  }

  public static getReplies(): string[] {
    return this.getSnippets().map((s) => s.content);
  }

  public static isCustomized(): boolean {
    return Boolean(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(SNIPPETS_STORAGE_KEY));
  }

  public static saveReplies(replies: string[]): void {
    const existing = this.getSnippets();
    const mapped: QuickSnippetItem[] = replies
      .map((r) => String(r || '').trim())
      .filter((r) => r.length > 0)
      .map((content, idx) => {
        const byContent = existing.find((e) => e.content === content);
        const byIndex = existing[idx];
        return {
          id: byContent?.id || byIndex?.id || `snip-${Date.now()}-${idx}`,
          title: byContent?.title || buildTitleFromContent(content, idx),
          content,
        };
      });
    this.saveSnippets(mapped);
  }

  public static resetToDefaults(): string[] {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SNIPPETS_STORAGE_KEY);
      const defaults = DEFAULT_QUICK_SNIPPETS.map((s) => ({ ...s }));
      const replies = defaults.map((s) => s.content);
      window.dispatchEvent(
        new CustomEvent('anectta:quick-replies-updated', { detail: replies })
      );
      window.dispatchEvent(
        new CustomEvent('anectta:snippets-updated', { detail: defaults })
      );
      return replies;
    } catch {}
    return [...DEFAULT_QUICK_REPLIES];
  }
}

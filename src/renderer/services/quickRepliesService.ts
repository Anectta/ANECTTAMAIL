export interface QuickSnippetItem {
  id: string;
  title: string;
  content: string;
  category?: string;
  subject?: string;
}

export const DEFAULT_QUICK_SNIPPETS: QuickSnippetItem[] = [
  {
    id: 'snip-1',
    title: 'Confirmação de Recebimento',
    category: 'Atendimento',
    subject: 'Recebemos sua solicitação',
    content: 'Olá {{nome}},\n\nConfirmamos o recebimento da sua mensagem em {{data}}. Vou analisar internamente e dou um retorno em breve.',
  },
  {
    id: 'snip-2',
    title: 'Aprovação de Próximos Passos',
    category: 'Rápida',
    content: 'Aprovado para seguirmos com os próximos passos conforme planejado.',
  },
  {
    id: 'snip-3',
    title: 'Follow-up Comercial',
    category: 'Comercial',
    subject: 'Retorno sobre nossa proposta — {{empresa}}',
    content: 'Olá {{nome}},\n\nPassando para confirmar se você teve a oportunidade de avaliar nossa proposta para a {{empresa}}. Caso precise de algum ajuste, estou à disposição.',
  },
  {
    id: 'snip-4',
    title: 'Convite para Reunião',
    category: 'Agenda',
    subject: 'Agendamento de alinhamento — {{data}}',
    content: 'Olá {{nome}},\n\nGostaria de agendar uma breve reunião de alinhamento com você. Qual horário fica melhor na sua agenda?',
  },
  {
    id: 'snip-5',
    title: 'Agradecimento e Disposição',
    category: 'Rápida',
    content: 'Desde já, agradecemos pela atenção e permanecemos à disposição para quaisquer esclarecimentos.',
  },
];

export const DEFAULT_QUICK_REPLIES = DEFAULT_QUICK_SNIPPETS.map((s) => s.content);

const STORAGE_KEY = 'anectta_custom_quick_replies';
const SNIPPETS_STORAGE_KEY = 'anectta_mail_snippets_v1';
const LEGACY_TEMPLATES_KEY = 'anectta_email_templates_v1';
const TEMPLATES_MIGRATED_FLAG = 'anectta_snippets_templates_merged_v1';

const buildTitleFromContent = (content: string, index: number): string => {
  const firstLine = content.replace(/\r?\n/g, ' ').trim();
  if (!firstLine) return `Resposta Rápida #${index + 1}`;
  const words = firstLine.split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?]+$/, '');
  return words || `Resposta Rápida #${index + 1}`;
};

export class QuickRepliesService {
  public static getSnippets(): QuickSnippetItem[] {
    let items: QuickSnippetItem[] | null = null;
    try {
      const savedSnips = localStorage.getItem(SNIPPETS_STORAGE_KEY);
      if (savedSnips) {
        const parsed = JSON.parse(savedSnips);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.content) {
          items = parsed
            .map((item: any, idx: number) => ({
              id: String(item.id || `snip-${idx + 1}`),
              title: String(item.title || '').trim() || buildTitleFromContent(String(item.content || ''), idx),
              content: String(item.content || '').trim(),
              category: item.category ? String(item.category).trim() : undefined,
              subject: item.subject ? String(item.subject).trim() : undefined,
            }))
            .filter((s: QuickSnippetItem) => s.content.length > 0);
        }
      }
      if (!items) {
        const savedReplies = localStorage.getItem(STORAGE_KEY);
        if (savedReplies) {
          const parsed = JSON.parse(savedReplies);
          if (Array.isArray(parsed) && parsed.length > 0) {
            items = parsed
              .map((text: any, idx: number) => {
                const content = String(text || '').trim();
                const defMatch = DEFAULT_QUICK_SNIPPETS.find((d) => d.content === content);
                return {
                  id: `snip-${idx + 1}`,
                  title: defMatch?.title || buildTitleFromContent(content, idx),
                  content,
                  category: defMatch?.category || 'Rápida',
                  subject: defMatch?.subject,
                };
              })
              .filter((s: QuickSnippetItem) => s.content.length > 0);
          }
        }
      }

      // Migração única de templates antigos (anectta_email_templates_v1) para o repositório unificado
      if (!localStorage.getItem(TEMPLATES_MIGRATED_FLAG)) {
        const legacyRaw = localStorage.getItem(LEGACY_TEMPLATES_KEY);
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw);
          if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
            const base = items || DEFAULT_QUICK_SNIPPETS.map((s) => ({ ...s }));
            const existingTitles = new Set(base.map((b) => b.title.toLowerCase()));
            const additions: QuickSnippetItem[] = legacyParsed
              .filter((t: any) => t?.body && !existingTitles.has(String(t.name || '').toLowerCase()))
              .map((t: any, i: number) => ({
                id: String(t.id || `tpl-mig-${i}`),
                title: String(t.name || 'Modelo').trim(),
                content: String(t.body || '').trim(),
                category: t.category ? String(t.category).trim() : 'Modelo',
                subject: t.subject ? String(t.subject).trim() : undefined,
              }));
            if (additions.length > 0) {
              items = [...base, ...additions];
              localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(items));
            }
          }
        }
        localStorage.setItem(TEMPLATES_MIGRATED_FLAG, '1');
      }
    } catch {}
    return items || DEFAULT_QUICK_SNIPPETS.map((s) => ({ ...s }));
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
          category: s.category?.trim() || undefined,
          subject: s.subject?.trim() || undefined,
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

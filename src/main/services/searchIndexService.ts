import MiniSearch from 'minisearch';
import path from 'path';
import fs from 'fs';

export interface IndexedEmail {
  id: string;
  accountId?: string;
  accountEmail?: string;
  sender: string;
  senderEmail: string;
  recipient?: string;
  subject: string;
  snippet?: string;
  body: string;
  folder?: string;
  timestamp?: string;
  priority?: string;
  attachmentNames?: string;
  attachments?: Array<{ name?: string; filename?: string }>;
  attachmentsList?: Array<{ filename?: string; name?: string }>;
}

export class SearchIndexService {
  private static instance: SearchIndexService | null = null;
  private miniSearch: MiniSearch<IndexedEmail>;
  private indexPath: string = '';
  private indexedIds: Set<string> = new Set();

  private constructor() {
    this.miniSearch = new MiniSearch<IndexedEmail>({
      fields: ['subject', 'sender', 'senderEmail', 'recipient', 'body', 'attachmentNames'],
      storeFields: ['id', 'accountId', 'accountEmail', 'folder'],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { subject: 3, attachmentNames: 2.5, sender: 2, senderEmail: 2, body: 1 },
      },
    });
  }

  public static getInstance(): SearchIndexService {
    if (!SearchIndexService.instance) {
      SearchIndexService.instance = new SearchIndexService();
    }
    return SearchIndexService.instance;
  }

  /**
   * Inicializa o motor de busca e carrega o índice persistido do disco se disponível.
   */
  public initialize(storageDir: string): void {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }

    this.indexPath = path.join(storageDir, 'anectta_mail_fts_index.json');
    console.log('[SEARCH] Inicializando Motor de Busca Instantânea FTS em:', this.indexPath);

    if (fs.existsSync(this.indexPath)) {
      try {
        const raw = fs.readFileSync(this.indexPath, 'utf-8');
        this.miniSearch = MiniSearch.loadJSON(raw, {
          fields: ['subject', 'sender', 'senderEmail', 'recipient', 'body', 'attachmentNames'],
          storeFields: ['id', 'accountId', 'accountEmail', 'folder'],
          searchOptions: {
            prefix: true,
            fuzzy: 0.2,
            boost: { subject: 3, attachmentNames: 2.5, sender: 2, senderEmail: 2, body: 1 },
          },
        });
        // Reconstrói set de IDs existentes
        this.indexedIds.clear();
        const stored = JSON.parse(raw);
        if (stored?.storedFields) {
          for (const key of Object.keys(stored.storedFields)) {
            this.indexedIds.add(key);
          }
        }
        console.log(`[SEARCH] Índice FTS carregado com sucesso (${this.indexedIds.size} e-mails indexados)`);
      } catch (err: any) {
        console.warn('[SEARCH] Falha ao ler índice persistido existente, criando novo:', err.message);
      }
    }
  }

  /**
   * Indexa uma lista de e-mails em lote com tempo de resposta < 10ms.
   */
  public indexEmails(emails: IndexedEmail[], accountEmail?: string): { indexedCount: number; durationMs: number } {
    if (!emails || emails.length === 0) {
      return { indexedCount: 0, durationMs: 0 };
    }

    const start = Date.now();
    const toAdd: IndexedEmail[] = [];

    for (const email of emails) {
      if (!email || !email.id) continue;

      if (this.indexedIds.has(email.id)) {
        try {
          this.miniSearch.discard(email.id);
        } catch {
          // ignore
        }
      }

      const rawAtts = Array.isArray(email.attachments)
        ? email.attachments
        : Array.isArray(email.attachmentsList)
        ? email.attachmentsList
        : [];
      const attachmentNames = rawAtts
        .map((att) => att?.name || att?.filename || '')
        .filter(Boolean)
        .join(' ');

      toAdd.push({
        id: email.id,
        accountId: email.accountId || '',
        accountEmail: accountEmail || email.accountEmail || '',
        sender: email.sender || '',
        senderEmail: email.senderEmail || '',
        recipient: email.recipient || '',
        subject: email.subject || '',
        body: email.body || email.snippet || '',
        attachmentNames,
        folder: email.folder || 'inbox',
      });
      this.indexedIds.add(email.id);
    }

    if (toAdd.length > 0) {
      this.miniSearch.addAll(toAdd);
      this.persistIndexDebounced();
    }

    const durationMs = Date.now() - start;
    console.log(`[SEARCH] Indexados ${toAdd.length} e-mails em ${durationMs}ms`);
    return { indexedCount: toAdd.length, durationMs };
  }

  /**
   * Executa busca instantânea de alta performance (< 10ms) com ranking de relevância e correspondência por prefixo.
   */
  public search(
    query: string,
    options?: { accountEmail?: string; folder?: string; limit?: number }
  ): { results: string[]; durationMs: number; totalFound: number } {
    if (!query || !query.trim()) {
      return { results: [], durationMs: 0, totalFound: 0 };
    }

    const start = Date.now();
    const searchResults = this.miniSearch.search(query.trim(), {
      prefix: true,
      fuzzy: 0.2,
      filter: (result) => {
        if (options?.accountEmail && result.accountEmail && result.accountEmail !== options.accountEmail) {
          return false;
        }
        if (options?.folder && result.folder && result.folder !== options.folder) {
          return false;
        }
        return true;
      },
    });

    const limit = options?.limit || 100;
    const ids = searchResults.slice(0, limit).map((r) => String(r.id));
    const durationMs = Date.now() - start;

    return {
      results: ids,
      durationMs,
      totalFound: searchResults.length,
    };
  }

  private persistTimer: NodeJS.Timeout | null = null;
  private persistIndexDebounced(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      if (!this.indexPath) return;
      try {
        const json = JSON.stringify(this.miniSearch);
        fs.writeFileSync(this.indexPath, json, 'utf-8');
      } catch (err: any) {
        console.warn('[SEARCH] Erro ao persistir índice FTS no disco:', err.message);
      }
    }, 1500);
  }
}

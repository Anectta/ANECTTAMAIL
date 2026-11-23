import { contextBridge, ipcRenderer } from 'electron';

// Initial corporate mock data store
let mockEmails = [
  {
    id: 'msg-101',
    sender: 'Beatriz Vasconcelos',
    senderEmail: 'beatriz.vasconcelos@anectta.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    recipient: 'alexandre@anectta.corp',
    subject: 'Relatório Trimestral Q3 & Alinhamento Estratégico de Expansão',
    snippet: 'Olá Alexandre, finalizamos a consolidação dos dados de faturamento do Q3. Superamos o forecast em 14.8%...',
    body: `Olá Alexandre,\n\nFinalizamos a consolidação dos dados de faturamento do Q3. Superamos o forecast em 14.8%, principalmente impulsionado pela adesão corporativa da nossa nova esteira de serviços na América Latina.\n\nPrincipais destaques para nossa reunião executiva:\n1. Margem de contribuição líquida subiu de 28% para 34.2%.\n2. O CAC diminuiu 11% devido à otimização das campanhas institucionais.\n3. O churn corporativo permaneceu abaixo de 0.6% pelo terceiro mês consecutivo.\n\nAnexei a apresentação completa com os gráficos de projeção. Gostaria de 15 minutos amanhã às 14h para repassarmos as metas do Q4 antes de enviar ao conselho.\n\nAbraços,\nBeatriz Vasconcelos\nVP de Operações | Anectta Corp`,
    timestamp: '10:42',
    folder: 'inbox',
    priority: 'high',
    isRead: false,
    isStarred: true,
    tags: ['Financeiro', 'Conselho', 'Q3'],
  },
  {
    id: 'msg-102',
    sender: 'Carlos Eduardo Mendes',
    senderEmail: 'carlos.mendes@cyberdefense.io',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    recipient: 'alexandre@anectta.corp',
    subject: 'Auditoria de Segurança SOC 2 Tipo II & Relatório Pentest',
    snippet: 'Prezada equipe Anectta, concluímos os testes de intrusão externos. A infraestrutura atende a todos os requisitos...',
    body: `Prezado Alexandre,\n\nA equipe da CyberDefense concluiu com sucesso os testes de intrusão do ambiente de produção e a avaliação preliminar da auditoria SOC 2 Tipo II.\n\nResumo Técnico:\n- Nenhuma vulnerabilidade crítica ou de alta severidade encontrada.\n- Duas recomendações de média criticidade referentes à política de expiração de tokens JWT foram identificadas e já catalogadas no backlog do Jira.\n- Criptografia em repouso (AES-256) e em trânsito (TLS 1.3) devidamente validadas.\n\nO certificado oficial de conformidade será emitido até sexta-feira.\n\nAtenciosamente,\nCarlos E. Mendes\nLead Security Engineer`,
    timestamp: '09:15',
    folder: 'inbox',
    priority: 'high',
    isRead: true,
    isStarred: false,
    tags: ['Segurança', 'SOC2', 'DevOps'],
  },
  {
    id: 'msg-103',
    sender: 'Mariana Duarte',
    senderEmail: 'm.duarte@enterprise-partners.com',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    recipient: 'alexandre@anectta.corp',
    subject: 'Minuta do Contrato de Parceria Tecnológica Enterprise',
    snippet: 'Alexandre, nosso departamento jurídico revisou as cláusulas de SLA e proteção de dados LGPD...',
    body: `Olá Alexandre, tudo bem?\n\nNosso departamento jurídico revisou as cláusulas 7 (SLA de 99.99%) e 12 (Tratamento de Dados e LGPD). Concordamos com a redação proposta por vocês no Anexo B.\n\nPodemos avançar para a coleta de assinaturas digitais via DocuSign ainda hoje se a sua diretoria der o de acordo.\n\nFico no aguardo do seu retorno para disparar o envelope.\n\nMariana Duarte\nHead of Strategic Alliances`,
    timestamp: 'Ontem',
    folder: 'inbox',
    priority: 'medium',
    isRead: true,
    isStarred: true,
    tags: ['Jurídico', 'Contrato'],
  },
  {
    id: 'msg-104',
    sender: 'Anectta DevOps Bot',
    senderEmail: 'no-reply-alerts@anectta.internal',
    avatar: '',
    recipient: 'alexandre@anectta.corp',
    subject: '[CI/CD] Deploy da v2.4.0 concluído com sucesso em us-east-1',
    snippet: 'Pipeline #8492 finalizada sem erros. 42 microsserviços atualizados com zero downtime.',
    body: `Pipeline ID: #8492\nBranch: main\nCommit: 8f9b31d (feat: enterprise email routing engine)\nStatus: 🟢 Sucesso\nRegiões: us-east-1, sa-east-1\nTempo total: 4m 12s\n\nTodos os healthchecks responderam com HTTP 200. Nenhuma degradação de latência foi observada.`,
    timestamp: 'Ontem',
    folder: 'inbox',
    priority: 'low',
    isRead: true,
    isStarred: false,
    tags: ['DevOps', 'Alertas'],
  },
  {
    id: 'msg-105',
    sender: 'Gabriel Fontes',
    senderEmail: 'gabriel.fontes@designops.co',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    recipient: 'alexandre@anectta.corp',
    subject: 'Apresentação do Design System "Anectta Aurora" para Desktop',
    snippet: 'Montamos os novos tokens de espaçamento, tipografia fluida e suporte a alto contraste...',
    body: `Olá Alexandre,\n\nConcluímos a especificação do novo Design System "Aurora" para o Anectta MAIL.\n\nO foco deste ciclo foi:\n- Otimização para monitores ultra-wide e telas de alta densidade (Retina/4K).\n- Curadoria de fontes de alta legibilidade para leitura prolongada de comunicações críticas.\n- Paleta corporativa escura com contraste certificado WCAG AAA.\n\nO link do Figma com os componentes interativos já está compartilhado com o seu e-mail.\n\nGabriel Fontes\nPrincipal Product Designer`,
    timestamp: '04 Nov',
    folder: 'inbox',
    priority: 'medium',
    isRead: true,
    isStarred: false,
    tags: ['UI/UX', 'Design'],
  },
  {
    id: 'msg-106',
    sender: 'Você (Rascunho)',
    senderEmail: 'alexandre@anectta.corp',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
    recipient: 'investors@anectta.com',
    subject: 'Draft: Atualização Mensal para Investidores - Outubro',
    snippet: 'Prezados investidores, gostaríamos de compartilhar os principais indicadores deste mês...',
    body: `Prezados investidores,\n\nNeste mês atingimos a marca de 150 mil usuários ativos corporativos na suíte Anectta...\n[Rascunho em edição]`,
    timestamp: '03 Nov',
    folder: 'drafts',
    priority: 'medium',
    isRead: true,
    isStarred: false,
    tags: ['Investidores'],
  },
  {
    id: 'msg-107',
    sender: 'Dr. Roberto Silveira',
    senderEmail: 'roberto.silveira@anectta.corp',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80',
    recipient: 'board@anectta.corp',
    subject: 'Ata da Reunião de Diretoria de 28 de Outubro',
    snippet: 'Segue em anexo a ata assinada digitalmente com as decisões sobre a expansão na Europa...',
    body: `Prezados membros da diretoria,\n\nSegue em anexo o documento oficial da ata de reunião realizada no dia 28 de outubro.\n\nPontos acordados:\n1. Aprovação unânime do plano de contratações de engenharia.\n2. Alocação orçamentária para a infraestrutura de inteligência artificial privada.\n\nAtenciosamente,\nDr. Roberto Silveira\nSecretário Geral`,
    timestamp: '29 Out',
    folder: 'archive',
    priority: 'low',
    isRead: true,
    isStarred: false,
    tags: ['Arquivo', 'Diretoria'],
  },
  {
    id: 'msg-108',
    sender: 'Luciana Brandão',
    senderEmail: 'luciana.brandao@talentsearch.corp',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    recipient: 'alexandre@anectta.corp',
    subject: 'Candidatos Finais para a vaga de Staff Security Architect',
    snippet: 'Selecionamos os dois finalistas com perfil sênior em segurança Electron e Rust...',
    body: `Olá Alexandre,\n\nAvançamos com os 2 candidatos mais qualificados para a posição de Staff Security Architect.\nAmbos possuem mais de 10 anos de experiência e sólida bagagem em arquiteturas seguras e isolamento de processos.\n\nGostaria de saber se podemos agendar a rodada final com você na próxima semana.\n\nLuciana Brandão\nHeadhunter Executiva`,
    timestamp: '26 Out',
    folder: 'snooze',
    priority: 'high',
    isRead: true,
    isStarred: true,
    tags: ['Recrutamento', 'Segurança'],
  },
];

// Exposed secure API bridge
const electronAPI = {
  fetchEmails: async () => {
    // Simulate network delay for realistic feel
    await new Promise((res) => setTimeout(res, 80));
    return JSON.parse(JSON.stringify(mockEmails));
  },

  sendEmail: async (emailData: any) => {
    await new Promise((res) => setTimeout(res, 250));
    const newEmail = {
      ...emailData,
      id: `msg-${Date.now()}`,
      timestamp: 'Agora',
      folder: 'sent',
      isRead: true,
      priority: emailData.priority || 'medium',
    };
    mockEmails.unshift(newEmail);
    return { success: true, id: newEmail.id };
  },

  archiveEmail: async (id: string) => {
    const item = mockEmails.find((e) => e.id === id);
    if (item) {
      item.folder = 'archive';
      return true;
    }
    return false;
  },

  snoozeEmail: async (id: string, _until?: string) => {
    const item = mockEmails.find((e) => e.id === id);
    if (item) {
      item.folder = 'snooze';
      return true;
    }
    return false;
  },

  deleteEmail: async (id: string) => {
    const item = mockEmails.find((e) => e.id === id);
    if (item) {
      item.folder = 'trash';
      return true;
    }
    return false;
  },

  markAsRead: async (id: string, read: boolean) => {
    const item = mockEmails.find((e) => e.id === id);
    if (item) {
      item.isRead = read;
      return true;
    }
    return false;
  },

  // Corporate AI Assistant
  summarizeEmailWithAI: async (content: string, subject?: string) => {
    return ipcRenderer.invoke('ai:summarize', { content, subject });
  },

  suggestRepliesWithAI: async (content: string) => {
    return ipcRenderer.invoke('ai:suggest-replies', { content });
  },

  // Real IMAP / SMTP integration
  testImapConnection: (config: any) => ipcRenderer.invoke('mail:test-imap', config),
  fetchRealInbox: (config: any) => ipcRenderer.invoke('mail:fetch-inbox', config),
  fetchRealFolder: (config: any, folder: string, limit?: number, imapPath?: string) =>
    ipcRenderer.invoke('mail:fetch-folder', { config, folder, limit, imapPath }),
  syncAllRealFolders: (config: any, limitPerFolder?: number) =>
    ipcRenderer.invoke('mail:sync-all-folders', { config, limitPerFolder }),
  fetchOlderFolderMessages: (payload: {
    config: any;
    folder: string;
    offset?: number;
    batchSize?: number;
    imapPath?: string;
    knownUids?: number[];
    missingOnly?: boolean;
  }) => ipcRenderer.invoke('mail:fetch-older-folder', payload),
  startImapIdle: (config: any) => ipcRenderer.invoke('mail:start-idle', { config }),
  onNewMail: (callback: (accountKey: string) => void) => {
    const listener = (_event: any, key: string) => callback(key);
    ipcRenderer.on('mail:new-mail', listener);
    return () => ipcRenderer.removeListener('mail:new-mail', listener);
  },
  createImapFolder: (config: any, folderName: string, parentFolderOrPath?: string) =>
    ipcRenderer.invoke('mail:create-folder', { config, folderName, parentFolderOrPath }),
  renameImapFolder: (config: any, oldImapPath: string, newName: string) =>
    ipcRenderer.invoke('mail:rename-folder', { config, oldImapPath, newName }),
  deleteImapFolder: (config: any, imapPath: string) =>
    ipcRenderer.invoke('mail:delete-folder', { config, imapPath }),
  sendRealEmail: (config: any, emailData: any, sentCopyConfig?: any) =>
    ipcRenderer.invoke('mail:send-smtp', { config, emailData, sentCopyConfig }),
  applyImapServerActions: (config: any, actions: any[]) =>
    ipcRenderer.invoke('mail:imap-server-actions', { config, actions }),

  // Dynamic incoming email simulation for corporate testing
  simulateIncomingEmail: async () => {
    const dynamicSenders = [
      {
        name: 'COWORKING SMART',
        email: 'faturamento@coworkingsmart.conexa.app',
        subject: `Novo Comprovante de Pagamento #${Math.floor(100000 + Math.random() * 900000)}`,
        snippet: 'Seu pagamento foi confirmado pelo gateway de recebimento corporativo...',
        body: 'Prezado(a) Carlos Amoroso,\n\nConfirmamos a identificação do pagamento da locação de infraestrutura corporativa.\nOs serviços continuam ativos normalmente.\n\nAtenciosamente,\nCoworking Smart Faturamento',
        category: 'Finanças' as const,
      },
      {
        name: 'Google Cloud Platform Alertas',
        email: 'billing-noreply@google.com',
        subject: '[GCP] Fatura Consolidada do Mês Processada',
        snippet: 'Os custos de computação e armazenamento em nuvem fecharam dentro do limite estipulado...',
        body: 'Olá Carlos,\n\nSua fatura de serviços Cloud da conta corporativa Anectta foi fechada com sucesso sem excedentes de cota.\n\nGoogle Cloud Team',
        category: 'DevOps' as const,
      },
    ];

    const pick = dynamicSenders[Math.floor(Math.random() * dynamicSenders.length)];
    const now = new Date();
    const newArrival = {
      id: `msg-${Date.now()}`,
      sender: pick.name,
      senderEmail: pick.email,
      avatar: '',
      recipient: 'carlosamoroso@anectta.com.br',
      subject: pick.subject,
      snippet: pick.snippet,
      body: pick.body,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      period: 'today' as const,
      folder: 'inbox' as const,
      priority: 'high' as const,
      isRead: false,
      isStarred: false,
      hasAttachment: false,
      category: pick.category,
      tags: ['Chegou Agora'],
    };

    mockEmails.unshift(newArrival);
    return newArrival;
  },

  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Local PST / MBOX Storage Management (Outlook-style local data files)
  getLocalStorageInfo: (accountEmail: string) => ipcRenderer.invoke('storage:get-info', accountEmail),
  saveLocalMailbox: (payload: { accountEmail: string; protocol?: string; emails: any[] }) =>
    ipcRenderer.invoke('storage:save-mailbox', payload),
  loadLocalMailbox: (accountEmail: string) => ipcRenderer.invoke('storage:load-mailbox', accountEmail),
  openLocalStorageFolder: (accountEmail?: string) => ipcRenderer.invoke('storage:open-folder', accountEmail),

  // Instant SQLite + FTS5 Local Search (< 15ms)
  searchEmailsFts: (payload: { query: string; accountEmail?: string; folder?: string; limit?: number }) =>
    ipcRenderer.invoke('search:query', payload),
  indexEmailsFts: (payload: { emails: any[]; accountEmail?: string }) =>
    ipcRenderer.invoke('search:index-emails', payload),
  getUnindexedEmailIds: (ids: string[]) => ipcRenderer.invoke('search:unindexed-ids', ids),
  removeIndexedEmails: (ids: string[]) => ipcRenderer.invoke('search:remove-ids', ids),

  // Smart Attachments (Downloads recentes e File Dialog)
  getRecentDownloads: () => ipcRenderer.invoke('downloads:get-recent'),
  openFileDialog: () => ipcRenderer.invoke('dialog:open-files'),
  openAttachment: (filePath: string) => ipcRenderer.invoke('attachment:open', filePath),
  showAttachmentInFolder: (filePath: string) => ipcRenderer.invoke('attachment:show-in-folder', filePath),
  saveAttachmentAs: (payload: { sourcePath: string; defaultName?: string }) =>
    ipcRenderer.invoke('attachment:save-as', payload),

  // Privacy Shield: Bloqueador de Rastreadores
  getPrivacyStats: () => ipcRenderer.invoke('privacy:get-stats'),
  resetPrivacyStats: () => ipcRenderer.invoke('privacy:reset-stats'),
  onTrackerBlocked: (callback: (data: { url: string; totalBlocked: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('privacy:tracker-blocked', listener);
    return () => ipcRenderer.removeListener('privacy:tracker-blocked', listener);
  },

  // Interactive Notifications & Dynamic Badge
  showNotification: (payload: { title: string; body: string; emailId?: string }) =>
    ipcRenderer.invoke('notifications:show', payload),
  setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count),

  // Sons Nativos do Sistema
  playNativeSound: (type?: 'beep' | 'notification' | 'alert') =>
    ipcRenderer.invoke('system:play-sound', type),
  openSystemNotificationSettings: () =>
    ipcRenderer.invoke('system:open-notification-settings'),
  openSystemProxySettings: () =>
    ipcRenderer.invoke('system:open-proxy-settings'),
  applyProxySettings: (proxyConfig: any) =>
    ipcRenderer.invoke('proxy:apply', proxyConfig),

  // Templates e Papéis de Carta Locais em Disco
  saveLocalTemplate: (template: {
    id: string;
    name: string;
    content: string;
    background?: string;
    styles?: any;
  }) => ipcRenderer.invoke('templates:save', template),
  loadLocalTemplates: () => ipcRenderer.invoke('templates:load'),
  deleteLocalTemplate: (templateId: string) =>
    ipcRenderer.invoke('templates:delete', templateId),

  // Exportação Padrão RFC 822 (.EML) e Importação / Backup
  exportEmailToEml: (email: any) =>
    ipcRenderer.invoke('mail:export-eml-dialog', email),
  printEmail: (payload: any) =>
    ipcRenderer.invoke('mail:print-email', payload),
  exportBatchToEml: (emails: any[], directory?: string) =>
    ipcRenderer.invoke('mail:export-eml-batch', { emails, directory }),
  exportMailArchive: (emails: any[], accountEmail?: string) =>
    ipcRenderer.invoke('mail:export-archive', { emails, accountEmail }),
  importEmailsFromFile: (accountId: string) =>
    ipcRenderer.invoke('mail:import-emails', { accountId }),
  exportSettingsFile: (settingsObj: any) =>
    ipcRenderer.invoke('settings:export', settingsObj),
  importSettingsFile: () =>
    ipcRenderer.invoke('settings:import'),
  loadAppSettings: () =>
    ipcRenderer.invoke('settings:load'),
  saveAppSettings: (settingsObj: any) =>
    ipcRenderer.invoke('settings:save', settingsObj),
  loadCalendarData: () =>
    ipcRenderer.invoke('calendar:load'),
  saveCalendarData: (dataObj: any) =>
    ipcRenderer.invoke('calendar:save', dataObj),

  // Corretor ortográfico (Electron / Hunspell)
  getSpellcheckLanguages: () =>
    ipcRenderer.invoke('spellcheck:get-languages'),
  configureSpellcheck: (payload: { enabled?: boolean; languages?: string[] }) =>
    ipcRenderer.invoke('spellcheck:configure', payload),
  addWordToDictionary: (word: string) =>
    ipcRenderer.invoke('spellcheck:add-word', word),

  // Backup automático e restauração local
  getDefaultBackupDir: () =>
    ipcRenderer.invoke('backup:get-default-dir'),
  selectBackupFolder: (currentDir?: string) =>
    ipcRenderer.invoke('backup:select-folder', currentDir),
  openBackupFolder: (targetDir?: string) =>
    ipcRenderer.invoke('backup:open-folder', targetDir),
  runBackupNow: (payload?: { destinationDir?: string; keepLastCount?: number }) =>
    ipcRenderer.invoke('backup:run-now', payload),
  restoreBackupFile: () =>
    ipcRenderer.invoke('backup:restore'),

  // Armazenamento em rede / pasta personalizada do banco de dados
  getStorageConfig: () =>
    ipcRenderer.invoke('storage:get-config'),
  selectStorageFolder: (currentDir?: string) =>
    ipcRenderer.invoke('storage:select-folder', currentDir),
  openStorageFolder: (targetDir?: string) =>
    ipcRenderer.invoke('storage:open-data-folder', targetDir),
  setStorageFolder: (payload: { targetDir?: string; migrateData?: boolean }) =>
    ipcRenderer.invoke('storage:set-folder', payload),
  restartApp: () =>
    ipcRenderer.invoke('app:restart'),

  // Proteção de credenciais e cache de mensagens (sem limite do localStorage)
  protectSettingsSync: (settingsObj: any) =>
    ipcRenderer.sendSync('secure:protect-settings', settingsObj),
  revealSettingsSync: (settingsObj: any) =>
    ipcRenderer.sendSync('secure:reveal-settings', settingsObj),
  loadMessageCacheSync: () =>
    ipcRenderer.sendSync('cache:load-messages-sync'),
  loadMessageCache: () => ipcRenderer.invoke('cache:load-messages'),
  saveMessageCache: (json: string) =>
    ipcRenderer.send('cache:save-messages', json),
  saveMessageCacheNow: (json: string) => ipcRenderer.invoke('cache:save-messages-now', json),

  // Banco local de e-mails (SQLite)
  getMailStoreStatusSync: () => ipcRenderer.sendSync('store:status-sync'),
  loadMailStoreSync: () => ipcRenderer.sendSync('store:load-sync'),
  storeUpsertEmails: (records: any[]) => ipcRenderer.invoke('store:upsert', records),
  storeRemoveEmails: (ids: string[]) => ipcRenderer.invoke('store:remove', ids),
  storeGetBodies: (ids: string[]) => ipcRenderer.invoke('store:get-bodies', ids),
  saveLocalMailboxIds: (payload: { accountEmail: string; protocol?: string; ids: string[] }) =>
    ipcRenderer.invoke('storage:save-mailbox-ids', payload),

  // Quick Compose Window
  openQuickCompose: () => ipcRenderer.send('quick-compose:open'),
  closeQuickCompose: () => ipcRenderer.send('quick-compose:close'),

  // Notifier Popup Window (Janela Secundária Animada sem bordas)
  showNotifier: (data: any) => ipcRenderer.invoke('notifier:show', data),
  closeNotifier: () => ipcRenderer.send('notifier:close'),
  clickNotifier: (emailId: string) => ipcRenderer.send('notifier:click', emailId),
  getLatestNotifierData: () => ipcRenderer.invoke('notifier:get-latest'),
  onNotifierData: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('notifier:data', listener);
    return () => ipcRenderer.removeListener('notifier:data', listener);
  },

  getSetupCompleted: () => ipcRenderer.invoke('app:get-setup-completed'),
  setSetupCompleted: () => ipcRenderer.invoke('app:set-setup-completed'),

  // OAuth 2.0 PKCE & System Tray
  startOAuthLogin: (payload: { provider: 'microsoft' | 'google'; clientId?: string; loginHint?: string }) =>
    ipcRenderer.invoke('oauth:start', payload),
  refreshOAuthToken: (payload: { provider: 'microsoft' | 'google'; refreshToken: string; clientId?: string }) =>
    ipcRenderer.invoke('oauth:refresh', payload),
  testDavConnection: (payload: { url: string; username: string; password: string }) =>
    ipcRenderer.invoke('sync:test-dav', payload),
  syncCloudCalendar: (payload: any) =>
    ipcRenderer.invoke('sync:calendar', payload),
  pushCloudCalendarEvent: (payload: any) =>
    ipcRenderer.invoke('sync:push-calendar-event', payload),
  updateCloudCalendarEvent: (payload: any) =>
    ipcRenderer.invoke('sync:update-calendar-event', payload),
  deleteCloudCalendarEvent: (payload: any) =>
    ipcRenderer.invoke('sync:delete-calendar-event', payload),
  listCloudCalendars: (payload: any) =>
    ipcRenderer.invoke('sync:list-calendars', payload),
  syncCloudContacts: (payload: any) =>
    ipcRenderer.invoke('sync:contacts', payload),
  importMigrationFolder: (payload: { accountId: string; mode?: 'folder' | 'pst' | 'mbox' | 'eml' }) =>
    ipcRenderer.invoke('mail:import-migration', payload),
  oneClickUnsubscribe: (url: string) =>
    ipcRenderer.invoke('mail:one-click-unsubscribe', url),
  pgpGenerateKey: (payload: { name: string; email: string; passphrase?: string }) =>
    ipcRenderer.invoke('pgp:generate-key', payload),
  pgpInspectKey: (armoredKey: string) =>
    ipcRenderer.invoke('pgp:inspect-key', armoredKey),
  pgpEncrypt: (payload: any) =>
    ipcRenderer.invoke('pgp:encrypt', payload),
  pgpSign: (payload: any) =>
    ipcRenderer.invoke('pgp:sign', payload),
  pgpDecryptVerify: (payload: any) =>
    ipcRenderer.invoke('pgp:decrypt-verify', payload),
  smimeImportP12: (payload: { p12Base64: string; passphrase: string }) =>
    ipcRenderer.invoke('smime:import-p12', payload),
  smimeInspectCert: (certContent: string) =>
    ipcRenderer.invoke('smime:inspect-cert', certContent),
  smimeSign: (payload: { text: string; certPem: string; privateKeyPem: string }) =>
    ipcRenderer.invoke('smime:sign', payload),
  smimeEncrypt: (payload: { text: string; recipientCertPems: string[] }) =>
    ipcRenderer.invoke('smime:encrypt', payload),
  smimeDecryptVerify: (payload: { pkcs7Pem: string; privateKeyPem?: string; certPem?: string }) =>
    ipcRenderer.invoke('smime:decrypt-verify', payload),
  translateEmailText: (payload: { text: string; targetLang: string; sourceLang?: string }) =>
    ipcRenderer.invoke('mail:translate-text', payload),
  setMinimizeToTray: (enabled: boolean) =>
    ipcRenderer.invoke('system:set-minimize-to-tray', enabled),

  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onPrepareClose: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:prepare-close', listener);
    return () => ipcRenderer.removeListener('app:prepare-close', listener);
  },
  confirmAppClose: () => ipcRenderer.send('app:confirm-close'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

const updaterAPI = {
  onUpdateAvailable: (callback: (version: string) => void) => {
    const listener = (_event: any, version: string) => callback(version);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onDownloadProgress: (callback: (percent: number) => void) => {
    const listener = (_event: any, percent: number) => callback(percent);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onUpdateError: (callback: (message: string) => void) => {
    const listener = (_event: any, message: string) => callback(message);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  getPendingUpdate: () => ipcRenderer.invoke('updater:get-pending'),
  checkForUpdatesManual: () => ipcRenderer.invoke('updater:check-manual'),
  startDownload: () => ipcRenderer.send('iniciar-download-atualizacao'),
  // Canal de resgate (versão bloqueada remotamente ou falha de instalação detectada)
  getRescueState: () => ipcRenderer.invoke('rescue:get-state'),
  startRescueInstall: () => ipcRenderer.invoke('rescue:install'),
  openRescueDownloadPage: () => ipcRenderer.invoke('rescue:open-download-page'),
  onRescueState: (callback: (state: any) => void) => {
    const listener = (_event: any, state: any) => callback(state);
    ipcRenderer.on('rescue:state', listener);
    return () => ipcRenderer.removeListener('rescue:state', listener);
  },
  onRescueProgress: (callback: (percent: number) => void) => {
    const listener = (_event: any, percent: number) => callback(percent);
    ipcRenderer.on('rescue:progress', listener);
    return () => ipcRenderer.removeListener('rescue:progress', listener);
  },
  onRescueError: (callback: (message: string) => void) => {
    const listener = (_event: any, message: string) => callback(message);
    ipcRenderer.on('rescue:error', listener);
    return () => ipcRenderer.removeListener('rescue:error', listener);
  },
};

contextBridge.exposeInMainWorld('updaterAPI', updaterAPI);

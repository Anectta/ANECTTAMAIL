# Anectta MAIL - Cliente de E-mail Corporativo de Alta Performance

Cliente de e-mail corporativo moderno, ultra-rápido e focado em produtividade extrema, com visual minimalista Dark Mode nativo e marca própria (White Label). Empacotado para Desktop (Windows, macOS e Linux).

## Stack Tecnológica

- **Runtime Desktop:** Electron com TypeScript (Segurança rígida: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
- **Frontend:** React 18+ com TypeScript
- **Estilização:** Tailwind CSS v3 com paleta corporativa Slate/Brand e suporte Dark Mode
- **Ícones:** Lucide React
- **Build Tooling:** Vite + TypeScript Compiler + Electron Builder

---

## Estrutura de Diretórios

```text
/
├── dist/                          # Build de produção do React
├── dist-electron/                 # Build de produção do Electron (main e preload)
├── src/
│   ├── main/                      # Processo Principal do Electron
│   │   ├── main.ts                # Inicialização da janela, segurança e ciclo de vida
│   │   └── preload.ts             # API de segurança bridge (window.electronAPI)
│   ├── renderer/                  # Interface do Usuário (React)
│   │   ├── components/            # Componentes do Workspace Corporativo
│   │   │   ├── TitleBar.tsx       # Barra de título frameless customizada
│   │   │   ├── Sidebar.tsx        # Coluna 1: Pastas, marcadores e conta ativa
│   │   │   ├── EmailList.tsx      # Coluna 2: Lista com pesquisa e tags de prioridade
│   │   │   ├── EmailView.tsx      # Coluna 3: Leitura, barra de ações e IA Corporativa
│   │   │   ├── CommandPalette.tsx # Modal flutuante de ações rápidas (Ctrl+K)
│   │   │   └── ComposeModal.tsx   # Modal de composição de mensagens
│   │   ├── hooks/
│   │   │   └── useKeyboardShortcuts.ts # Hook de atalhos globais de produtividade
│   │   ├── types/
│   │   │   └── email.ts           # Interfaces e tipos de dados de e-mail
│   │   ├── App.tsx                # Orquestrador de estado e layout de 3 colunas
│   │   ├── main.tsx               # Ponto de entrada do React
│   │   ├── index.css              # Configuração global de Tailwind e scrollbars
│   │   └── index.html             # Documento HTML do renderer
│   └── types/
│       └── electron.d.ts          # Definição de tipos para window.electronAPI
├── package.json                   # Dependências e scripts
├── tailwind.config.js             # Tokens de design do Tailwind CSS
├── tsconfig.json                  # TypeScript para o Frontend (React)
├── tsconfig.electron.json         # TypeScript para Electron Main/Preload
└── vite.config.ts                 # Configuração do Vite
```

---

## Recursos Exclusivos de Produtividade

1. **Atalhos de Teclado Globais:**
   - <kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>Cmd</kbd> + <kbd>K</kbd>: Abre a Command Palette corporativa.
   - <kbd>C</kbd>: Escrever novo e-mail.
   - <kbd>E</kbd>: Arquivar o e-mail ativo.
   - <kbd>S</kbd>: Adiar / Snooze do e-mail ativo.
   - <kbd>J</kbd> / <kbd>K</kbd> ou <kbd>↓</kbd> / <kbd>↑</kbd>: Navegação sequencial entre e-mails.
   - <kbd>/</kbd>: Foco imediato na barra de pesquisa.
   - <kbd>Esc</kbd>: Fechar qualquer modal ou limpar seleção.

2. **Command Palette Flutuante (<kbd>Ctrl+K</kbd>):**
   - Pesquisa preditiva de comandos de navegação entre pastas, ações rápidas, IA e alternância de temas.

3. **IA Corporativa Integrada (Gemini API Placeholder):**
   - ✨ **Resumir com IA**: Extrai resumo executivo e pontos acionáveis do e-mail em segundos.
   - 🪄 **Sugerir Resposta Rápida**: Gera opções profissionais de resposta que podem ser inseridas ou enviadas com 1 clique.

---

## Como Executar

### 1. Modo de Desenvolvimento (Vite + Electron):

Terminal 1 (Inicie o servidor de desenvolvimento Vite):
```bash
npm run dev
```

Terminal 2 (Inicie o Electron conectando ao dev server):
```bash
npm start
```

### 2. Compilação para Produção:
```bash
npm run build
```

### 3. Empacotamento para Desktop (Windows, macOS e Linux):
```bash
npm run dist
```
Os instaladores gerados estarão disponíveis na pasta `release/`.

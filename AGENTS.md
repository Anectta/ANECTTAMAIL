# Regras do Projeto — Anectta MAIL

## Geração Obrigatória do Instalador e Incremento de Versão após Alterações
- **Incremento Obrigatório de Versão:** Sempre que realizar qualquer alteração no código-fonte ou configuração do sistema (`src/`, `public/`, etc.), você **DEVE** incrementar o número da versão (`"version"`) no `package.json` (ex.: `1.0.81` -> `1.0.82`) antes de gerar o instalador.
- **Geração Obrigatória do Instalador:** Em seguida, gere automaticamente a nova versão do instalador Windows executando `npm.cmd run dist` (`npm run build && electron-builder --win`) antes de concluir a tarefa.
- **No PowerShell (Windows):** Utilize `npm.cmd run dist` (em vez de `npm run dist`) para evitar bloqueios de política de execução do `npm.ps1`.
- **Entrega ao Usuário:** Ao finalizar a compilação do instalador, informe sempre os links diretos para os artefatos gerados com a nova versão em:
  - `c:\ANECTTA MAIL\release\Anectta MAIL Setup <nova_versão>.exe`
  - `c:\ANECTTA MAIL\release\win-unpacked\Anectta MAIL.exe`

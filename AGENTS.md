# Regras do Projeto — Anectta MAIL

## Geração Obrigatória do Instalador e Incremento de Versão após Alterações
- **Incremento Obrigatório de Versão:** Sempre que realizar qualquer alteração no código-fonte ou configuração do sistema (`src/`, `public/`, etc.), você **DEVE** incrementar o número da versão (`"version"`) no `package.json` (ex.: `1.0.81` -> `1.0.82`) antes de gerar o instalador.
- **Geração Obrigatória do Instalador:** Em seguida, gere automaticamente a nova versão do instalador Windows executando `npm.cmd run dist` (`npm run build && electron-builder --win`) antes de concluir a tarefa.
- **No PowerShell (Windows):** Utilize `npm.cmd run dist` (em vez de `npm run dist`) para evitar bloqueios de política de execução do `npm.ps1`.
- **Entrega ao Usuário:** Ao finalizar a compilação do instalador, informe sempre os links diretos para os artefatos gerados com a nova versão em:
  - `c:\ANECTTA MAIL\release\Anectta MAIL Setup <nova_versão>.exe`
  - `c:\ANECTTA MAIL\release\win-unpacked\Anectta MAIL.exe`

## Commit e Push Obrigatórios no GitHub ao Finalizar Atualizações
- **Commit Obrigatório no GitHub:** Ao finalizar qualquer atualização no código-fonte, configuração ou versão do sistema, você **DEVE** registrar as alterações com `git add`, criar um `git commit` descritivo (mencionando a nova versão, ex.: `chore: release v1.0.122`) e enviar para o repositório remoto no GitHub (`git push origin <branch>`) antes de concluir a tarefa.
- **Segurança:** Nunca inclua tokens, credenciais ou arquivos binários pesados ignorados pelo `.gitignore` (como `release/`) no commit. Caso o `git push` falhe por falta de autenticação ou conflito, informe o erro claramente ao usuário.

## Proibição Absoluta de Plágio e Originalidade nas Implementações
- **Zero Plágio:** **NUNCA** copie código proprietário, layouts, identidades visuais, textos, marcas, nomes comerciais, ícones ou assets protegidos por direitos autorais de terceiros ou concorrentes em nenhuma implementação do sistema.
- **Implementação Original:** Todo código, design de interface, copy e solução técnica deve ser autoral e desenvolvido especificamente para o projeto. Referências externas, quando fornecidas pelo usuário, servem apenas como inspiração funcional ou conceitual — nunca para reprodução literal.
- **Dependências e Licenças:** Utilize apenas bibliotecas open-source com licenças permissivas e compatíveis (ex.: MIT, Apache-2.0, BSD), respeitando integralmente os termos de licença.

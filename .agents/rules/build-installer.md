# Regra Obrigatória: Incrementar Versão e Gerar Instalador após Alterações

Sempre que realizar qualquer alteração no código-fonte ou configuração do sistema (`src/`, `public/`, etc.), você **DEVE**:
1. Incrementar o campo `"version"` no arquivo `package.json` (ex.: `1.0.81` -> `1.0.82`).
2. Gerar automaticamente a nova versão do instalador Windows executando `npm.cmd run dist` (`npm run build && electron-builder --win`) antes de concluir a tarefa.
3. Informar os links diretos para o novo instalador gerado em `c:\ANECTTA MAIL\release\Anectta MAIL Setup <nova_versão>.exe`.

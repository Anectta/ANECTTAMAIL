# Processo de Release — Anectta MAIL

Este documento descreve como uma versão chega aos clientes e como agir quando algo der errado.

## 1. Fluxo normal

1. Alteração no código → incrementar `version` no `package.json` → `npm.cmd run dist` (instalador local) → commit → `git push origin main`.
2. O GitHub Actions ([.github/workflows/release.yml](.github/workflows/release.yml)) gera o instalador e publica a release como **pre-release (beta)**.
   - Os clientes **não recebem** pre-releases.
3. Teste a versão (veja a seção 2).
4. Libere para os clientes:

   ```powershell
   gh release edit v1.0.XXX --prerelease=false --latest
   ```

   Ou, no GitHub: Releases → editar a versão → desmarcar "Set as a pre-release" → marcar "Set as the latest release" → Update.

Se a versão tiver defeito, **não libere**. Apague a pre-release (`gh release delete v1.0.XXX --cleanup-tag`), corrija e gere outra.

## 2. Teste obrigatório quando `src/main/updater.ts`, `build/installer.nsh` ou `build/installer-ui.ps1` mudarem

Quem executa uma atualização é o código da versão **instalada**. Um defeito no atualizador da versão N só aparece quando a N tenta atualizar para a N+1.

1. Instale a versão nova (N) numa máquina de teste com o instalador da pre-release.
2. Ative o canal beta nessa máquina: crie o arquivo vazio
   `%APPDATA%\anectta-mail\beta-channel.flag`
   (com ele, o app também oferece pre-releases).
3. Publique uma N+1 qualquer (pode ser só o incremento de versão), que sairá como pre-release.
4. No app N, aceite a atualização e confirme que:
   - o app fecha, o instalador roda e o app reabre já na N+1;
   - o `%APPDATA%\anectta-mail\updater.log` registra `Atualização confirmada: N -> N+1`.
5. Só então libere a N para os clientes.

## 3. Canal de resgate (versão com defeito já liberada)

O app (a partir da v1.0.224) lê o [update-policy.json](update-policy.json) deste repositório ao abrir e a cada 30 minutos.

```json
{
  "blockedVersions": ["1.0.230"],
  "minVersion": "",
  "message": "Texto exibido na faixa vermelha do app.",
  "targetVersion": ""
}
```

| Campo | Efeito |
|---|---|
| `blockedVersions` | Versões que exibem a faixa vermelha com o botão "Atualizar agora". |
| `minVersion` | Toda versão **abaixo** desta também é bloqueada. |
| `message` | Texto da faixa (opcional). |
| `targetVersion` | Versão a instalar (opcional). Vazio = a última release liberada (Latest). |
| `downloadUrl` / `sha512` | Avançado (opcional): instalador específico. Só aceita URLs de `github.com/Anectta/ANECTTAMAIL/releases/download/`. |

**Como usar:** edite o arquivo no GitHub (pelo navegador mesmo) e faça commit na `main`. Em até ~5 minutos (cache do GitHub), os clientes nas versões bloqueadas veem o aviso. Essa edição **não** gera release nova.

O botão baixa o instalador direto da release, confere o SHA-512 do `latest.yml` e o executa **sem passar pelo electron-updater**. Se isso falhar, aparece o botão "Baixar pelo navegador".

> Antes de bloquear uma versão, confirme que a release de destino (Latest) está corrigida e liberada.

## 4. Detecção automática de falha na instalação

Antes de instalar, o app grava `%APPDATA%\anectta-mail\update-attempt.json`. Na abertura seguinte:

- se a versão subiu → registra sucesso e apaga o arquivo;
- se continua na mesma versão → registra a falha no `updater.log`;
- após **2 falhas** → suspende a atualização automática e mostra a faixa amarela "Instalar manualmente", que usa o mesmo caminho do canal de resgate.

## 5. Diagnóstico

- `%APPDATA%\anectta-mail\updater.log`: verificações, downloads, tentativas, falhas e logs internos do electron-updater.
- `%LOCALAPPDATA%\anectta-mail-updater\pending\`: instalador baixado pelo electron-updater.
- `%TEMP%\anectta-mail-rescue\`: instalador baixado pelo canal de resgate.

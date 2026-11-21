# Assinatura Digital Windows (Code Signing) — Anectta MAIL

O instalador Windows (`Anectta MAIL Setup <versão>.exe`) e o executável (`Anectta MAIL.exe`) já estão preparados para assinatura digital **Authenticode SHA-256 + RFC 3161 Timestamp** via hook [sign-windows.cjs](../scripts/sign-windows.cjs).

## 1. Assinando com certificado `.pfx` / `.p12` (OV ou A1 Code Signing)
1. Copie `.env.signing.example` para `.env.signing` na raiz do projeto (arquivo já ignorado pelo `.gitignore`).
2. Preencha:
   ```env
   CSC_LINK=C:\caminho\seguro\anectta-codesign.pfx
   CSC_KEY_PASSWORD=sua-senha-secreta
   WIN_TIMESTAMP_URL=http://timestamp.digicert.com
   REQUIRE_CODE_SIGNING=true
   ```
3. Execute normalmente:
   ```powershell
   npm.cmd run dist
   ```
4. Verifique a assinatura gerada:
   ```powershell
   npm.cmd run verify:sign
   ```

## 2. Assinando com Token USB EV (SmartScreen reputação imediata)
1. Plugue o token USB (DigiCert, Sectigo, Certum, GlobalSign) e verifique o *Thumbprint SHA-1* no `certmgr.msc` (Pessoal → Certificados).
2. Configure no `.env.signing`:
   ```env
   WIN_CERT_SHA1=SEU_THUMBPRINT_SHA1_SEM_ESPACOS
   REQUIRE_CODE_SIGNING=true
   ```
3. Rode `npm.cmd run dist` e digite o PIN do token quando solicitado.

## 3. GitHub Actions / CI-CD
Converta seu `.pfx` para Base64:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\anectta-codesign.pfx")) | Set-Clipboard
```
Cadastre como *Repository Secrets* no GitHub:
- `CSC_LINK` (conteúdo Base64 do `.pfx`)
- `CSC_KEY_PASSWORD` (senha do `.pfx`)
- `REQUIRE_CODE_SIGNING=true`

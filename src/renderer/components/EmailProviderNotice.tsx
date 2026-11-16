import React from 'react';
import { AlertTriangle, ExternalLink, ShieldAlert, KeyRound } from 'lucide-react';

export type DetectedProviderType = 'gmail' | 'yahoo' | 'icloud' | 'aol' | 'microsoft' | 'custom';

export function detectProviderType(
  email?: string,
  host?: string,
  providerId?: string
): DetectedProviderType {
  const e = (email || '').trim().toLowerCase();
  const h = (host || '').trim().toLowerCase();
  const p = (providerId || '').trim().toLowerCase();

  // 1. Microsoft (Outlook, Hotmail, Live, MSN, m365)
  if (
    p === 'outlook' ||
    p === 'm365' ||
    p === 'hotmail' ||
    e.endsWith('@outlook.com') ||
    e.includes('@outlook.') ||
    e.endsWith('@hotmail.com') ||
    e.includes('@hotmail.') ||
    e.endsWith('@live.com') ||
    e.includes('@live.') ||
    e.endsWith('@msn.com') ||
    h.includes('outlook.office365.com') ||
    h.includes('outlook.com') ||
    h.includes('hotmail.com')
  ) {
    return 'microsoft';
  }

  // 2. Gmail / Google
  if (
    p === 'gmail' ||
    e.endsWith('@gmail.com') ||
    e.endsWith('@googlemail.com') ||
    h.includes('gmail.com') ||
    h.includes('googlemail.com')
  ) {
    return 'gmail';
  }

  // 3. Yahoo Mail
  if (
    p === 'yahoo' ||
    e.includes('@yahoo.') ||
    e.endsWith('@ymail.com') ||
    h.includes('yahoo.com')
  ) {
    return 'yahoo';
  }

  // 4. iCloud Mail (Apple)
  if (
    p === 'icloud' ||
    e.endsWith('@icloud.com') ||
    e.endsWith('@me.com') ||
    e.endsWith('@mac.com') ||
    h.includes('mail.me.com') ||
    h.includes('icloud.com')
  ) {
    return 'icloud';
  }

  // 5. AOL Mail
  if (
    p === 'aol' ||
    e.endsWith('@aol.com') ||
    e.endsWith('@aim.com') ||
    h.includes('aol.com')
  ) {
    return 'aol';
  }

  // 6. Domínios próprios / corporativos (@suaempresa.com.br, cPanel, Locaweb, etc.)
  return 'custom';
}

interface EmailProviderNoticeProps {
  email?: string;
  host?: string;
  providerId?: string;
  variant?: 'dark' | 'light';
  className?: string;
}

export const EmailProviderNotice: React.FC<EmailProviderNoticeProps> = ({
  email,
  host,
  providerId,
  variant = 'dark',
  className = '',
}) => {
  const provider = detectProviderType(email, host, providerId);

  // Regra para domínios próprios: nenhum alerta exibido
  if (provider === 'custom') {
    return null;
  }

  const handleOpenUrl = (url: string) => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
        (window as any).electronAPI.openExternal(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Erro ao abrir link externo:', err);
    }
  };

  const isDark = variant === 'dark';

  if (provider === 'microsoft') {
    return (
      <div
        className={`mt-2.5 p-3 rounded-lg text-xs space-y-1.5 transition-all ${
          isDark
            ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200'
            : 'bg-rose-50 border border-rose-200 text-rose-900'
        } ${className}`}
      >
        <div
          className={`flex items-center space-x-1.5 font-bold ${
            isDark ? 'text-rose-300' : 'text-rose-800'
          }`}
        >
          <ShieldAlert className={`w-4 h-4 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
          <span>Aviso: Contas Microsoft (Outlook, Hotmail e Live)</span>
        </div>
        <p
          className={`text-[11px] leading-relaxed font-normal ${
            isDark ? 'text-rose-200/90' : 'text-rose-800'
          }`}
        >
          A Microsoft <strong>desativou o login por senha</strong> (incluindo senhas normais e senhas de app) para conexões IMAP em contas <strong>@outlook.com</strong>, <strong>@hotmail.com</strong> e <strong>@live.com</strong>. A Microsoft agora exige autenticação moderna via <strong>OAuth 2.0</strong> (&quot;Entrar com a Microsoft&quot;). Conexões apenas com usuário e senha não são mais aceitas pelos servidores da Microsoft.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() =>
              handleOpenUrl(
                'https://support.microsoft.com/pt-br/office/m%C3%A9todos-de-autentica%C3%A7%C3%A3o-modernos-necess%C3%A1rios-para-continuar-a-sincronizar-o-e-mail-do-outlook-em-aplicativos-de-e-mail-que-n%C3%A3o-s%C3%A3o-da-microsoft-c5aeed13-c4a7-4743-a148-b2964bb1c82d'
              )
            }
            className={`inline-flex items-center text-[11px] font-semibold underline underline-offset-2 cursor-pointer transition-colors ${
              isDark ? 'text-rose-300 hover:text-rose-100' : 'text-rose-700 hover:text-rose-900'
            }`}
          >
            <span>Ver comunicado oficial da Microsoft</span>
            <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  if (provider === 'gmail') {
    return (
      <div
        className={`mt-2.5 p-3 rounded-lg text-xs space-y-1.5 transition-all ${
          isDark
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
            : 'bg-amber-50 border border-amber-200 text-amber-900'
        } ${className}`}
      >
        <div
          className={`flex items-center space-x-1.5 font-bold ${
            isDark ? 'text-amber-300' : 'text-amber-800'
          }`}
        >
          <KeyRound className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>Atenção ao usar o Gmail (Google):</span>
        </div>
        <p
          className={`text-[11px] leading-relaxed font-normal ${
            isDark ? 'text-amber-200/90' : 'text-amber-800'
          }`}
        >
          O Gmail <strong>exige uma Senha de App de 16 dígitos</strong>. O usuário precisa ter a <strong>Verificação em Duas Etapas</strong> ativada em sua Conta Google antes de gerá-la. Não utilize a sua senha pessoal comum.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => handleOpenUrl('https://myaccount.google.com/apppasswords')}
            className={`inline-flex items-center text-[11px] font-semibold underline underline-offset-2 cursor-pointer transition-colors ${
              isDark ? 'text-amber-300 hover:text-amber-100' : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            <span>Gerar Senha de App na Conta Google</span>
            <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  if (provider === 'yahoo') {
    return (
      <div
        className={`mt-2.5 p-3 rounded-lg text-xs space-y-1.5 transition-all ${
          isDark
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
            : 'bg-amber-50 border border-amber-200 text-amber-900'
        } ${className}`}
      >
        <div
          className={`flex items-center space-x-1.5 font-bold ${
            isDark ? 'text-amber-300' : 'text-amber-800'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>Atenção ao usar o Yahoo Mail:</span>
        </div>
        <p
          className={`text-[11px] leading-relaxed font-normal ${
            isDark ? 'text-amber-200/90' : 'text-amber-800'
          }`}
        >
          Não utilize a sua senha comum. Para conectar sua conta, acesse a página de Segurança do Yahoo, crie uma senha de aplicativo exclusiva e cole o código gerado aqui. Lembre-se de que essa senha continua ativa mesmo se você alterar sua senha principal, sendo necessário excluí-la manualmente no Yahoo caso pare de usar este app.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => handleOpenUrl('https://login.yahoo.com/account/security')}
            className={`inline-flex items-center text-[11px] font-semibold underline underline-offset-2 cursor-pointer transition-colors ${
              isDark ? 'text-amber-300 hover:text-amber-100' : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            <span>Acessar Central de Segurança do Yahoo</span>
            <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  if (provider === 'icloud') {
    return (
      <div
        className={`mt-2.5 p-3 rounded-lg text-xs space-y-1.5 transition-all ${
          isDark
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
            : 'bg-amber-50 border border-amber-200 text-amber-900'
        } ${className}`}
      >
        <div
          className={`flex items-center space-x-1.5 font-bold ${
            isDark ? 'text-amber-300' : 'text-amber-800'
          }`}
        >
          <KeyRound className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>Atenção ao usar o iCloud Mail (Apple):</span>
        </div>
        <p
          className={`text-[11px] leading-relaxed font-normal ${
            isDark ? 'text-amber-200/90' : 'text-amber-800'
          }`}
        >
          A Apple exige obrigatoriamente uma <strong>Senha Específica de App</strong> gerada nas configurações do seu ID Apple. Sua senha comum do ID Apple não funcionará para conexão IMAP/SMTP direta.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => handleOpenUrl('https://appleid.apple.com/account/manage')}
            className={`inline-flex items-center text-[11px] font-semibold underline underline-offset-2 cursor-pointer transition-colors ${
              isDark ? 'text-amber-300 hover:text-amber-100' : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            <span>Gerar Senha no Portal do ID Apple</span>
            <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  if (provider === 'aol') {
    return (
      <div
        className={`mt-2.5 p-3 rounded-lg text-xs space-y-1.5 transition-all ${
          isDark
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
            : 'bg-amber-50 border border-amber-200 text-amber-900'
        } ${className}`}
      >
        <div
          className={`flex items-center space-x-1.5 font-bold ${
            isDark ? 'text-amber-300' : 'text-amber-800'
          }`}
        >
          <AlertTriangle className={`w-4 h-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
          <span>Atenção ao usar o AOL Mail:</span>
        </div>
        <p
          className={`text-[11px] leading-relaxed font-normal ${
            isDark ? 'text-amber-200/90' : 'text-amber-800'
          }`}
        >
          O AOL Mail pertence ao mesmo grupo do Yahoo e <strong>exige exatamente a mesma Senha de Aplicativo</strong> de 16 caracteres gerada na segurança da conta AOL. Não utilize sua senha pessoal de login.
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => handleOpenUrl('https://login.aol.com/account/security')}
            className={`inline-flex items-center text-[11px] font-semibold underline underline-offset-2 cursor-pointer transition-colors ${
              isDark ? 'text-amber-300 hover:text-amber-100' : 'text-amber-700 hover:text-amber-900'
            }`}
          >
            <span>Acessar Central de Segurança da AOL</span>
            <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};

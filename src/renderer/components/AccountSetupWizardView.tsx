import React, { useState } from 'react';
import { 
  ChevronRight, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  Server, 
  Minus,
  X,
  ShieldCheck
} from 'lucide-react';
import { AccountSettings, AppSettings } from '@/types/settings';
import { soundService } from '@/services/soundService';
import { EmailProviderNotice, detectProviderType } from './EmailProviderNotice';

export type ProviderId = 
  | 'gmail' 
  | 'outlook' 
  | 'm365' 
  | 'locaweb' 
  | 'terra' 
  | 'uol' 
  | 'icloud' 
  | 'yahoo' 
  | 'aol'
  | 'manual';

interface AccountSetupWizardViewProps {
  currentSettings?: AppSettings;
  onAccountConnected: (account: AccountSettings) => void;
  onClose: () => void;
  isFirstRun?: boolean;
}

export const AccountSetupWizardView: React.FC<AccountSetupWizardViewProps> = ({
  onAccountConnected,
  onClose,
  isFirstRun = false,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Manual server configuration states
  const [protocol, setProtocol] = useState<'imap' | 'pop3'>('imap');
  const [incomingHost, setIncomingHost] = useState('');
  const [incomingPort, setIncomingPort] = useState<number | string>('');
  const [incomingSecurity, setIncomingSecurity] = useState<'ssl' | 'starttls' | 'none'>('ssl');

  const [outgoingHost, setOutgoingHost] = useState('');
  const [outgoingPort, setOutgoingPort] = useState<number | string>('');
  const [outgoingSecurity, setOutgoingSecurity] = useState<'ssl' | 'starttls' | 'none'>('ssl');

  // Test and connection status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // OAuth 2.0 states (Microsoft 365 / Outlook & Google Gmail)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [oauthClientId, setOauthClientId] = useState('');
  const [showOAuthAdvanced, setShowOAuthAdvanced] = useState(false);

  // Select provider handler
  const handleSelectProvider = (provider: ProviderId) => {
    soundService.play('click');
    setSelectedProvider(provider);
    setTestResult(null);

    // Apply default presets for the selected provider
    switch (provider) {
      case 'gmail':
        setIncomingHost('imap.gmail.com');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.gmail.com');
        setOutgoingPort(465);
        setOutgoingSecurity('ssl');
        break;
      case 'outlook':
        setIncomingHost('outlook.office365.com');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.office365.com');
        setOutgoingPort(587);
        setOutgoingSecurity('starttls');
        break;
      case 'm365':
        setIncomingHost('outlook.office365.com');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.office365.com');
        setOutgoingPort(587);
        setOutgoingSecurity('starttls');
        break;
      case 'locaweb':
        setIncomingHost('email-ssl.com.br');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('email-ssl.com.br');
        setOutgoingPort(465);
        setOutgoingSecurity('ssl');
        break;
      case 'terra':
        setIncomingHost('imap.terra.com.br');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.terra.com.br');
        setOutgoingPort(587);
        setOutgoingSecurity('starttls');
        break;
      case 'uol':
        setIncomingHost('imap.uol.com.br');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtps.uol.com.br');
        setOutgoingPort(587);
        setOutgoingSecurity('starttls');
        break;
      case 'icloud':
        setIncomingHost('imap.mail.me.com');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.mail.me.com');
        setOutgoingPort(587);
        setOutgoingSecurity('starttls');
        break;
      case 'yahoo':
        setIncomingHost('imap.mail.yahoo.com');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.mail.yahoo.com');
        setOutgoingPort(465);
        setOutgoingSecurity('ssl');
        break;
      case 'aol':
        setIncomingHost('imap.aol.com');
        setIncomingPort(993);
        setIncomingSecurity('ssl');
        setOutgoingHost('smtp.aol.com');
        setOutgoingPort(465);
        setOutgoingSecurity('ssl');
        break;
      case 'manual':
        // 100% limpo: nenhum dado pré-escrito para o cliente configurar tudo manualmente do zero
        setIncomingHost('');
        setIncomingPort('');
        setIncomingSecurity('ssl');
        setOutgoingHost('');
        setOutgoingPort('');
        setOutgoingSecurity('ssl');
        break;
    }
  };

  const handleProtocolChange = (newProto: 'imap' | 'pop3') => {
    setProtocol(newProto);
    if (newProto === 'pop3') {
      if (incomingPort === 993) setIncomingPort(995);
    } else {
      if (incomingPort === 995) setIncomingPort(993);
    }
  };

  // Build account object from form
  const buildAccountObject = (): AccountSettings => {
    const accountId = `acc-${Date.now()}`;
    const cleanEmail = email.trim();
    const cleanName = displayName.trim() || cleanEmail.split('@')[0] || 'Usuário';

    return {
      id: accountId,
      accountName: cleanEmail,
      color: selectedProvider === 'gmail' ? '#ea4335' : 
             selectedProvider === 'outlook' || selectedProvider === 'm365' ? '#0078d4' : 
             selectedProvider === 'locaweb' ? '#f0142f' :
             selectedProvider === 'terra' ? '#ff6700' :
             selectedProvider === 'uol' ? '#f26f21' :
             selectedProvider === 'yahoo' ? '#6001d2' : '#2563eb',
      isDefault: true,
      displayName: cleanName,
      email: cleanEmail,
      role: 'Conta Pessoal / Corporativa',
      signature: `Atenciosamente,\n${cleanName}\n${cleanEmail}`,
      signatureUseHtml: false,
      attachVCard: false,
      password: password,
      serverType: selectedProvider === 'm365' ? 'm365' : 
                  selectedProvider === 'gmail' ? 'google' : 
                  selectedProvider === 'outlook' ? 'exchange' : 'imap_smtp',
      incomingServer: {
        protocol: selectedProvider === 'manual' ? protocol : 'imap',
        host: incomingHost.trim(),
        port: Number(incomingPort) || (protocol === 'imap' ? 993 : 995),
        security: incomingSecurity,
        username: cleanEmail,
        password: password,
        rememberPassword: true,
        checkOnStartup: true,
        checkEveryMinutes: 10,
      },
      outgoingServer: {
        host: outgoingHost.trim(),
        port: Number(outgoingPort) || 465,
        security: outgoingSecurity,
        requiresAuth: true,
        authMode: 'same_as_incoming',
        username: cleanEmail,
        password: password,
        rememberPassword: true,
      },
    };
  };

  // OAuth 2.0 connect handler (Microsoft 365 / Outlook & Google Gmail)
  const handleOAuthConnect = async () => {
    if (!selectedProvider || !['gmail', 'outlook', 'm365'].includes(selectedProvider)) return;
    if (!window.electronAPI?.startOAuthLogin) {
      setTestResult({
        success: false,
        message: 'OAuth 2.0 disponível apenas no aplicativo desktop Anectta MAIL.',
      });
      return;
    }

    const oauthProvider: 'google' | 'microsoft' = selectedProvider === 'gmail' ? 'google' : 'microsoft';
    setIsOAuthLoading(true);
    setTestResult(null);

    try {
      const result = await window.electronAPI.startOAuthLogin({
        provider: oauthProvider,
        clientId: oauthClientId.trim() || undefined,
        loginHint: email.trim() || undefined,
      });

      if (!result.success || !result.accessToken) {
        soundService.play('error');
        setTestResult({
          success: false,
          message: result.error || 'Não foi possível concluir a autenticação OAuth 2.0.',
        });
        return;
      }

      const resolvedEmail = (result.email || email).trim();
      if (!resolvedEmail) {
        soundService.play('error');
        setTestResult({
          success: false,
          message: 'Autenticação concluída, mas o endereço de e-mail não foi retornado. Preencha o campo de e-mail acima e tente novamente.',
        });
        return;
      }

      const baseAccount = buildAccountObject();
      const oauthAccount: AccountSettings = {
        ...baseAccount,
        accountName: resolvedEmail,
        displayName: displayName.trim() || result.displayName || resolvedEmail.split('@')[0] || 'Usuário',
        email: resolvedEmail,
        password: '',
        authType: 'oauth2',
        oauthProvider,
        oauthAccessToken: result.accessToken,
        oauthRefreshToken: result.refreshToken,
        oauthExpiresAt: result.expiresAt,
        oauthClientId: oauthClientId.trim() || undefined,
        incomingServer: {
          ...baseAccount.incomingServer,
          username: resolvedEmail,
          password: '',
        },
        outgoingServer: {
          ...baseAccount.outgoingServer,
          username: resolvedEmail,
          password: '',
        },
      };

      const imapTest = await window.electronAPI.testImapConnection({
        protocol: oauthAccount.incomingServer.protocol,
        host: oauthAccount.incomingServer.host,
        port: oauthAccount.incomingServer.port,
        security: oauthAccount.incomingServer.security,
        username: resolvedEmail,
        password: '',
        accessToken: result.accessToken,
      });

      if (!imapTest.success) {
        soundService.play('error');
        setTestResult({
          success: false,
          message: imapTest.message || 'Token OAuth obtido, mas o servidor IMAP recusou a conexão.',
        });
        return;
      }

      soundService.play('send');
      setTestResult({
        success: true,
        message: 'Autenticado via OAuth 2.0! Adicionando conta...',
      });
      setTimeout(() => {
        onAccountConnected(oauthAccount);
      }, 600);
    } catch (err: any) {
      soundService.play('error');
      setTestResult({
        success: false,
        message: err?.message || 'Erro ao autenticar com OAuth 2.0.',
      });
    } finally {
      setIsOAuthLoading(false);
    }
  };

  // Test and connect handler
  const handleTestAndConnect = async () => {
    if (!email.trim() || !password) {
      setTestResult({
        success: false,
        message: 'Por favor, preencha o seu e-mail e a senha para conectar.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    soundService.play('click');

    try {
      if (window.electronAPI?.testImapConnection) {
        const res = await window.electronAPI.testImapConnection({
          protocol: selectedProvider === 'manual' ? protocol : 'imap',
          host: incomingHost.trim(),
          port: Number(incomingPort) || (protocol === 'imap' ? 993 : 995),
          secure: incomingSecurity !== 'none',
          user: email.trim(),
          pass: password,
        });

        if (res.success) {
          soundService.play('pop');
          setTestResult({
            success: true,
            message: res.message || 'Conta conectada e autenticada com sucesso no servidor!',
          });

          setTimeout(() => {
            const newAcc = buildAccountObject();
            onAccountConnected(newAcc);
          }, 800);
        } else {
          soundService.play('error');
          setTestResult({
            success: false,
            message: res.message || 'Falha de autenticação. Verifique os dados e a senha.',
          });
        }
      } else {
        setTimeout(() => {
          soundService.play('pop');
          const newAcc = buildAccountObject();
          onAccountConnected(newAcc);
        }, 600);
      }
    } catch (err: any) {
      soundService.play('error');
      setTestResult({
        success: false,
        message: err?.message || 'Erro ao comunicar com o servidor de e-mail.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveWithoutTest = () => {
    if (!email.trim()) {
      setTestResult({
        success: false,
        message: 'Preencha ao menos o endereço de e-mail.',
      });
      return;
    }
    soundService.play('click');
    const newAcc = buildAccountObject();
    onAccountConnected(newAcc);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-slate-900 select-none overflow-y-auto">
      {/* Decorative top color stripe */}
      <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shrink-0" />

      {/* Top Frameless Window Header - Compact (h-8) */}
      <div className="h-8 flex items-center justify-between px-3 select-none app-drag-region border-b border-slate-100 bg-slate-50/70 shrink-0">
        <div className="flex items-center space-x-2 app-no-drag">
          <span className="text-xs font-semibold text-slate-700">Anectta MAIL</span>
          <span className="text-[10px] text-slate-400 font-medium">&bull; Assistente de Conexão</span>
        </div>
        <div className="flex items-center space-x-1 app-no-drag">
          <button
            type="button"
            onClick={() => window.electronAPI?.minimizeWindow()}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition-colors"
            title="Minimizar"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              soundService.play('click');
              onClose();
            }}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500 rounded transition-colors cursor-pointer"
            title={isFirstRun ? 'Fechar e ir para Caixa de Entrada' : 'Fechar assistente'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Container - Compact Spacing (Reduzido em 50% dos espaços em branco) */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 sm:py-5">
        <div className="w-full max-w-md mx-auto">
          {/* STEP 1: Provider selection list */}
          {!selectedProvider ? (
            <div className="animate-in fade-in zoom-in-95 duration-150">
              {/* Header Title and Subtitle - Compact */}
              <div className="text-center mb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Vamos conectar sua conta
                </h1>
                <p className="text-slate-500 text-xs sm:text-sm font-normal mt-1">
                  Não se preocupe, leva só um instante.
                </p>
              </div>

              {/* Provider List Container - Compact Borders and Item Heights */}
              <div className="divide-y divide-slate-100 border-t border-b border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm border border-slate-100">
                {/* 1. Gmail */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('gmail')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15Z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.93 6.72-4.93Z" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Gmail
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 2. Outlook */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('outlook')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <svg viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                      <path fill="#0078D4" d="M26 6h16a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H26V6z"/>
                      <path fill="#28A8EA" d="M35 15l-9 7 9 7 9-7-9-7z"/>
                      <path fill="#0078D4" d="M44 22v18a2 2 0 0 1-2 2H26V29l9-7 9 7z"/>
                      <path fill="#106EBE" d="M26 6v36H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h18z"/>
                      <circle cx="17" cy="24" r="8" fill="#fff"/>
                      <circle cx="17" cy="24" r="5" fill="#106EBE"/>
                    </svg>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Outlook
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 3. Microsoft 365 */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('m365')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <svg viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                      <path fill="#EA3E23" d="M38 12.5 25.5 5 13 12.5v23L25.5 43 38 35.5v-23Z"/>
                      <path fill="#D83B01" d="M25.5 5v19.5L38 32V12.5L25.5 5Z"/>
                      <path fill="#FF6A39" d="M25.5 24.5 13 32v3.5L25.5 43V24.5Z"/>
                      <path fill="#F25022" d="M13 12.5 25.5 20v23L13 35.5v-23Z"/>
                    </svg>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Microsoft 365
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 4. Locaweb */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('locaweb')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 rounded-md bg-[#f0142f] flex items-center justify-center shrink-0 shadow-sm">
                      <span className="text-white text-[9px] font-black tracking-tight leading-none">LW</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Locaweb
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 5. Terra Mail */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('terra')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#ff6700] to-[#e04f00] flex items-center justify-center shrink-0 shadow-sm">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Terra Mail
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 6. UOL */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('uol')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 rounded-full bg-[#f26f21] flex items-center justify-center shrink-0 shadow-sm">
                      <div className="w-3 h-3 rounded-full bg-[#ffcc00] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      UOL
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 7. iCloud */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('icloud')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 fill-current text-slate-900">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.56-.73.94-1.74.83-2.77-.85.04-1.89.58-2.5 1.29-.53.62-.99 1.63-.87 2.63.95.07 1.94-.49 2.54-1.15Z"/>
                    </svg>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      iCloud
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 8. Yahoo */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('yahoo')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <svg viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                      <rect width="48" height="48" rx="8" fill="#6001d2" />
                      <path fill="#fff" d="M14 13l6.5 13.5V35h4.5v-8.5L31.5 13h-4.8l-4.5 10.2L17.8 13H14zM34.5 28.5c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5-1.1-2.5-2.5-2.5z" />
                    </svg>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Yahoo
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 9. AOL Mail */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('aol')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                      <span className="text-white font-extrabold text-[10px] tracking-tight">Aol.</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      AOL Mail
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>

                {/* 10. Configurar manualmente */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('manual')}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 active:bg-slate-100 transition-all cursor-pointer group text-left"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-blue-600 font-bold text-xs leading-none">@</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-950 transition-colors">
                      Configurar manualmente
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                </button>
              </div>

              {/* Bottom Skip / Demo Mode Link */}
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    soundService.play('click');
                    onClose();
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors underline-offset-4 hover:underline cursor-pointer"
                >
                  {isFirstRun
                    ? 'Explorar o Anectta MAIL primeiro (Modo de Demonstração) →'
                    : 'Cancelar e voltar para a Caixa de Entrada →'}
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2: Provider Configuration Form */
            <div className="animate-in fade-in slide-in-from-right-4 duration-150">
              {/* Back to list button */}
              <button
                type="button"
                onClick={() => {
                  soundService.play('click');
                  setSelectedProvider(null);
                }}
                className="inline-flex items-center text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-4 group cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5 transition-transform group-hover:-translate-x-1" />
                Voltar à lista de provedores
              </button>

              {/* Provider Header Banner */}
              <div className="flex items-center space-x-3 mb-4">
                {selectedProvider === 'gmail' && (
                  <svg viewBox="0 0 24 24" className="w-8 h-8 shrink-0">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z" />
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15Z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.93 6.72-4.93Z" />
                  </svg>
                )}
                {selectedProvider === 'outlook' && (
                  <svg viewBox="0 0 48 48" className="w-8 h-8 shrink-0">
                    <path fill="#0078D4" d="M26 6h16a2 2 0 0 1 2 2v32a2 2 0 0 1-2 2H26V6z"/>
                    <path fill="#28A8EA" d="M35 15l-9 7 9 7 9-7-9-7z"/>
                    <path fill="#0078D4" d="M44 22v18a2 2 0 0 1-2 2H26V29l9-7 9 7z"/>
                    <path fill="#106EBE" d="M26 6v36H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h18z"/>
                    <circle cx="17" cy="24" r="8" fill="#fff"/>
                    <circle cx="17" cy="24" r="5" fill="#106EBE"/>
                  </svg>
                )}
                {selectedProvider === 'm365' && (
                  <svg viewBox="0 0 48 48" className="w-8 h-8 shrink-0">
                    <path fill="#EA3E23" d="M38 12.5 25.5 5 13 12.5v23L25.5 43 38 35.5v-23Z"/>
                    <path fill="#D83B01" d="M25.5 5v19.5L38 32V12.5L25.5 5Z"/>
                    <path fill="#FF6A39" d="M25.5 24.5 13 32v3.5L25.5 43V24.5Z"/>
                    <path fill="#F25022" d="M13 12.5 25.5 20v23L13 35.5v-23Z"/>
                  </svg>
                )}
                {selectedProvider === 'locaweb' && (
                  <div className="w-8 h-8 rounded-lg bg-[#f0142f] flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-white text-xs font-black tracking-tight leading-none">LW</span>
                  </div>
                )}
                {selectedProvider === 'terra' && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#ff6700] to-[#e04f00] flex items-center justify-center shrink-0 shadow-sm">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                    </svg>
                  </div>
                )}
                {selectedProvider === 'uol' && (
                  <div className="w-8 h-8 rounded-full bg-[#f26f21] flex items-center justify-center shrink-0 shadow-sm">
                    <div className="w-5 h-5 rounded-full bg-[#ffcc00] flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
                    </div>
                  </div>
                )}
                {selectedProvider === 'icloud' && (
                  <svg viewBox="0 0 24 24" className="w-8 h-8 shrink-0 fill-current text-slate-900">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.56-.73.94-1.74.83-2.77-.85.04-1.89.58-2.5 1.29-.53.62-.99 1.63-.87 2.63.95.07 1.94-.49 2.54-1.15Z"/>
                  </svg>
                )}
                {selectedProvider === 'yahoo' && (
                  <svg viewBox="0 0 48 48" className="w-8 h-8 shrink-0">
                    <rect width="48" height="48" rx="8" fill="#6001d2" />
                    <path fill="#fff" d="M14 13l6.5 13.5V35h4.5v-8.5L31.5 13h-4.8l-4.5 10.2L17.8 13H14zM34.5 28.5c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5-1.1-2.5-2.5-2.5z" />
                  </svg>
                )}
                {selectedProvider === 'aol' && (
                  <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
                    <span className="text-white font-extrabold text-sm tracking-tight">Aol.</span>
                  </div>
                )}
                {selectedProvider === 'manual' && (
                  <div className="w-8 h-8 rounded-full border-2 border-blue-600 flex items-center justify-center shrink-0">
                    <span className="text-blue-600 font-bold text-sm leading-none">@</span>
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-900 leading-tight">
                    {selectedProvider === 'gmail' && 'Conectar conta Gmail'}
                    {selectedProvider === 'outlook' && 'Conectar conta Outlook'}
                    {selectedProvider === 'm365' && 'Conectar Microsoft 365'}
                    {selectedProvider === 'locaweb' && 'Conectar Locaweb'}
                    {selectedProvider === 'terra' && 'Conectar Terra Mail'}
                    {selectedProvider === 'uol' && 'Conectar UOL'}
                    {selectedProvider === 'icloud' && 'Conectar conta iCloud'}
                    {selectedProvider === 'yahoo' && 'Conectar conta Yahoo'}
                    {selectedProvider === 'aol' && 'Conectar conta AOL Mail'}
                    {selectedProvider === 'manual' && 'Configuração Manual (IMAP/POP)'}
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    {selectedProvider === 'manual'
                      ? 'Preencha os endereços e portas do seu servidor'
                      : 'Servidores pré-configurados com criptografia segura'}
                  </span>
                </div>
              </div>

              {/* OAuth 2.0 Modern Auth Banner for Microsoft / Google */}
              {(selectedProvider === 'outlook' || selectedProvider === 'm365' || selectedProvider === 'gmail') && (
                <div className="mb-3 p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-blue-900">
                      <span className="font-bold block">Login Moderno OAuth 2.0</span>
                      <span className="text-[11px] text-blue-700">
                        {selectedProvider === 'gmail'
                          ? 'Autentique-se diretamente com sua conta Google (XOAUTH2).'
                          : 'Autentique-se diretamente com Microsoft 365 / Outlook (XOAUTH2).'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleOAuthConnect}
                      disabled={isOAuthLoading || isTesting}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {isOAuthLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      {isOAuthLoading ? 'Autenticando...' : 'Entrar com OAuth 2.0'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-blue-700">
                      Ou preencha abaixo com senha / senha de aplicativo.
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowOAuthAdvanced((v) => !v)}
                      className="text-[10px] font-semibold text-blue-700 hover:underline"
                    >
                      {showOAuthAdvanced ? 'Ocultar Client ID' : 'Client ID customizado'}
                    </button>
                  </div>
                  {showOAuthAdvanced && (
                    <input
                      type="text"
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder="Client ID OAuth 2.0 (opcional)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
                    />
                  )}
                </div>
              )}

              {/* Form Input Fields */}
              <div className="space-y-3">
                {/* Display Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-0.5">
                    Seu Nome Completo
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Carlos Amoroso"
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-0.5">
                    Endereço de E-mail
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      selectedProvider === 'gmail' ? 'seuemail@gmail.com' :
                      selectedProvider === 'outlook' ? 'seuemail@outlook.com' :
                      selectedProvider === 'm365' ? 'voce@empresa.com' :
                      selectedProvider === 'locaweb' ? 'voce@seudominio.com.br' :
                      selectedProvider === 'terra' ? 'seuemail@terra.com.br' :
                      selectedProvider === 'uol' ? 'seuemail@uol.com.br' :
                      selectedProvider === 'icloud' ? 'seuemail@icloud.com' :
                      selectedProvider === 'yahoo' ? 'seuemail@yahoo.com' :
                      selectedProvider === 'aol' ? 'seuemail@aol.com' : 'voce@seudominio.com.br'
                    }
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all font-mono"
                  />
                </div>

                {/* Password / App Password */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-xs font-semibold text-slate-700">
                      {['gmail', 'yahoo', 'icloud', 'aol'].includes(
                        detectProviderType(email, incomingHost, selectedProvider || undefined)
                      )
                        ? 'Senha de Aplicativo (Exclusiva)'
                        : 'Senha da Conta'}
                    </label>
                    {['gmail', 'yahoo', 'icloud', 'aol'].includes(
                      detectProviderType(email, incomingHost, selectedProvider || undefined)
                    ) && (
                      <span className="text-[10px] text-amber-600 font-semibold">16 dígitos</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••••••"
                      className="w-full pl-3 pr-10 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-900 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {/* Alertas dinâmicos de provedor (Gmail, Yahoo, iCloud, AOL, Microsoft, e neutro para domínios próprios) */}
                  <EmailProviderNotice
                    email={email}
                    host={incomingHost}
                    providerId={selectedProvider || undefined}
                    variant="light"
                  />
                </div>

                {/* Manual Server Configuration Details - Clean for User Input */}
                {selectedProvider === 'manual' && (
                  <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center">
                        <Server className="w-3.5 h-3.5 mr-1 text-blue-600" /> Servidores de Correio
                      </span>
                      <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => handleProtocolChange('imap')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            protocol === 'imap' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'
                          }`}
                        >
                          IMAP (Recomendado)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleProtocolChange('pop3')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            protocol === 'pop3' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'
                          }`}
                        >
                          POP3
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          Servidor Entrada ({protocol.toUpperCase()})
                        </label>
                        <input
                          type="text"
                          value={incomingHost}
                          onChange={(e) => setIncomingHost(e.target.value)}
                          placeholder={protocol === 'imap' ? 'ex: imap.seudominio.com.br' : 'ex: pop.seudominio.com.br'}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          Porta
                        </label>
                        <input
                          type="text"
                          value={incomingPort}
                          onChange={(e) => setIncomingPort(e.target.value)}
                          placeholder={protocol === 'imap' ? '993' : '995'}
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          Servidor Saída (SMTP)
                        </label>
                        <input
                          type="text"
                          value={outgoingHost}
                          onChange={(e) => setOutgoingHost(e.target.value)}
                          placeholder="ex: smtp.seudominio.com.br"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                          Porta SMTP
                        </label>
                        <input
                          type="text"
                          value={outgoingPort}
                          onChange={(e) => setOutgoingPort(e.target.value)}
                          placeholder="465 ou 587"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Status or Error Banner */}
              {testResult && (
                <div
                  className={`mt-3 p-2.5 rounded-xl text-xs flex items-start space-x-2 ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span className="font-medium leading-relaxed">{testResult.message}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  disabled={isTesting}
                  onClick={handleTestAndConnect}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center space-x-2 disabled:opacity-60 cursor-pointer text-xs sm:text-sm"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Validando credenciais com o servidor...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Testar e Conectar Conta</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleSaveWithoutTest}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-medium transition-colors cursor-pointer"
                  >
                    Salvar sem testar agora
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      soundService.play('click');
                      onClose();
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-800 font-medium transition-colors cursor-pointer"
                  >
                    {isFirstRun ? 'Pular por enquanto' : 'Cancelar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Bottom Footer */}
      <div className="py-2.5 border-t border-slate-100 text-center text-[10px] text-slate-400">
        Anectta MAIL Enterprise &bull; Conexão Direta TLS 1.3 &bull; Sem Intermediação em Nuvem
      </div>
    </div>
  );
};

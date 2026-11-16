import http from 'http';
import crypto from 'crypto';
import { BrowserWindow } from 'electron';

export type OAuthProvider = 'microsoft' | 'google';

export interface OAuthStartParams {
  provider: OAuthProvider;
  clientId?: string;
  loginHint?: string;
}

export interface OAuthTokenResult {
  success: boolean;
  provider?: OAuthProvider;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  email?: string;
  displayName?: string;
  clientId?: string;
  error?: string;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function getProviderConfig(provider: OAuthProvider, customClientId?: string) {
  if (provider === 'microsoft') {
    const clientId = (customClientId || process.env.ANECTTA_MS_CLIENT_ID || '').trim();
    return {
      clientId,
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: [
        'offline_access',
        'https://outlook.office.com/IMAP.AccessAsUser.All',
        'https://outlook.office.com/SMTP.Send',
        'User.Read',
      ].join(' '),
    };
  }

  const clientId = (customClientId || process.env.ANECTTA_GOOGLE_CLIENT_ID || '').trim();
  return {
    clientId,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'https://mail.google.com/ email profile',
  };
}

async function fetchUserProfile(
  provider: OAuthProvider,
  accessToken: string
): Promise<{ email?: string; displayName?: string }> {
  try {
    const url =
      provider === 'microsoft'
        ? 'https://graph.microsoft.com/v1.0/me'
        : 'https://www.googleapis.com/oauth2/v2/userinfo';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return {};
    const data: any = await res.json();
    if (provider === 'microsoft') {
      return {
        email: data.mail || data.userPrincipalName || undefined,
        displayName: data.displayName || undefined,
      };
    }
    return {
      email: data.email || undefined,
      displayName: data.name || undefined,
    };
  } catch {
    return {};
  }
}

export class OAuthService {
  /**
   * Inicia fluxo OAuth 2.0 com PKCE (S256) e servidor loopback local 127.0.0.1.
   */
  public static async startOAuthFlow(
    params: OAuthStartParams,
    parentWindow?: BrowserWindow | null
  ): Promise<OAuthTokenResult> {
    const { provider, clientId: customClientId, loginHint } = params;
    const cfg = getProviderConfig(provider, customClientId);

    if (!cfg.clientId) {
      const providerLabel = provider === 'microsoft' ? 'Microsoft (Azure AD)' : 'Google Cloud';
      return {
        success: false,
        error: `Client ID OAuth 2.0 não informado para ${providerLabel}. Informe o Client ID do aplicativo registrado (Desktop/Redirect http://127.0.0.1) no campo OAuth.`,
      };
    }

    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(
      crypto.createHash('sha256').update(codeVerifier).digest()
    );
    const state = base64UrlEncode(crypto.randomBytes(16));

    return await new Promise<OAuthTokenResult>((resolve) => {
      let settled = false;
      let authWindow: BrowserWindow | null = null;
      let server: http.Server | null = null;

      const finish = (result: OAuthTokenResult) => {
        if (settled) return;
        settled = true;
        try {
          if (authWindow && !authWindow.isDestroyed()) {
            authWindow.close();
          }
        } catch {
          // ignore
        }
        try {
          server?.close();
        } catch {
          // ignore
        }
        resolve(result);
      };

      server = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
          if (reqUrl.pathname !== '/callback') {
            res.writeHead(404);
            res.end();
            return;
          }

          const errParam = reqUrl.searchParams.get('error');
          const errDesc = reqUrl.searchParams.get('error_description');
          const code = reqUrl.searchParams.get('code');
          const returnedState = reqUrl.searchParams.get('state');

          if (errParam) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h3>Autenticação cancelada ou recusada. Você pode fechar esta janela.</h3>');
            finish({ success: false, error: errDesc || errParam });
            return;
          }

          if (!code || returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h3>Resposta OAuth inválida.</h3>');
            finish({ success: false, error: 'Parâmetros OAuth inválidos ou state divergente.' });
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<div style="font-family:sans-serif;padding:24px;text-align:center;"><h2>Autenticação concluída!</h2><p>Retornando ao Anectta MAIL...</p></div>'
          );

          const addr = server?.address();
          const port = typeof addr === 'object' && addr ? addr.port : 0;
          const redirectUri = `http://127.0.0.1:${port}/callback`;

          const body = new URLSearchParams({
            client_id: cfg.clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          });

          const tokenRes = await fetch(cfg.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });
          const tokenJson: any = await tokenRes.json();

          if (!tokenRes.ok || !tokenJson.access_token) {
            finish({
              success: false,
              error:
                tokenJson.error_description ||
                tokenJson.error ||
                'Falha ao trocar o código OAuth por token.',
            });
            return;
          }

          const expiresInSec = Number(tokenJson.expires_in) || 3600;
          const profile = await fetchUserProfile(provider, tokenJson.access_token);

          finish({
            success: true,
            provider,
            accessToken: tokenJson.access_token,
            refreshToken: tokenJson.refresh_token,
            expiresAt: Date.now() + expiresInSec * 1000,
            email: profile.email || loginHint,
            displayName: profile.displayName,
            clientId: cfg.clientId,
          });
        } catch (err: any) {
          finish({ success: false, error: err?.message || 'Erro interno no callback OAuth.' });
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server?.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        const redirectUri = `http://127.0.0.1:${port}/callback`;

        const authParams = new URLSearchParams({
          client_id: cfg.clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          response_mode: 'query',
          scope: cfg.scopes,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          ...(provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : {}),
          ...(loginHint ? { login_hint: loginHint } : {}),
        });

        const fullAuthUrl = `${cfg.authUrl}?${authParams.toString()}`;

        authWindow = new BrowserWindow({
          width: 520,
          height: 680,
          parent: parentWindow || undefined,
          modal: Boolean(parentWindow),
          title:
            provider === 'microsoft'
              ? 'Entrar com Microsoft (OAuth 2.0)'
              : 'Entrar com Google (OAuth 2.0)',
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });

        authWindow.on('closed', () => {
          finish({ success: false, error: 'Janela de autenticação fechada pelo usuário.' });
        });

        authWindow.loadURL(fullAuthUrl).catch((err) => {
          finish({ success: false, error: err?.message || 'Erro ao carregar página de login.' });
        });
      });

      server.on('error', (err) => {
        finish({ success: false, error: `Erro no servidor local OAuth: ${err.message}` });
      });
    });
  }

  /**
   * Renova access_token expirado usando refresh_token.
   */
  public static async refreshAccessToken(params: {
    provider: OAuthProvider;
    refreshToken: string;
    clientId?: string;
  }): Promise<OAuthTokenResult> {
    const cfg = getProviderConfig(params.provider, params.clientId);
    if (!cfg.clientId || !params.refreshToken) {
      return { success: false, error: 'Client ID ou refresh_token ausente.' };
    }

    try {
      const body = new URLSearchParams({
        client_id: cfg.clientId,
        grant_type: 'refresh_token',
        refresh_token: params.refreshToken,
        scope: cfg.scopes,
      });

      const res = await fetch(cfg.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const json: any = await res.json();
      if (!res.ok || !json.access_token) {
        return {
          success: false,
          error: json.error_description || json.error || 'Falha ao renovar token OAuth.',
        };
      }

      const expiresInSec = Number(json.expires_in) || 3600;
      return {
        success: true,
        provider: params.provider,
        accessToken: json.access_token,
        refreshToken: json.refresh_token || params.refreshToken,
        expiresAt: Date.now() + expiresInSec * 1000,
        clientId: cfg.clientId,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao renovar token OAuth.' };
    }
  }
}

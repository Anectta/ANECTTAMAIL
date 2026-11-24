import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { isTlsHostTrusted } from './tlsTrust';
import { implicitTls } from './mailSecurity';
import { MailService } from './mailService';

/**
 * Teste completo de uma conta: entrada (IMAP/POP3) e saída (SMTP) separadamente, com login,
 * e explicação clara do problema quando algo falha.
 */

export type Security = 'ssl' | 'starttls' | 'none';

export interface TestServerInput {
  protocol: 'imap' | 'pop3' | 'smtp';
  host: string;
  port: number;
  security: Security;
}

export interface TestStepResult {
  ok: boolean;
  /** Mensagem curta para o usuário. */
  message: string;
  /** O que fazer para resolver. */
  hint?: string;
  /** Link de ajuda (ex.: como gerar senha de aplicativo). */
  helpUrl?: string;
  helpLabel?: string;
  code?: 'auth' | 'app-password' | 'not-found' | 'refused' | 'timeout' | 'tls-mismatch' | 'certificate' | 'unknown';
}

export interface AccountTestResult {
  incoming: TestStepResult;
  outgoing: TestStepResult;
}

/** Ajuda específica de cada provedor para senha de aplicativo. */
function appPasswordHelp(email: string, host: string): { name: string; url: string } | null {
  const s = `${email} ${host}`.toLowerCase();
  if (/yahoo|ymail|rocketmail/.test(s)) return { name: 'Yahoo', url: 'https://login.yahoo.com/account/security' };
  if (/gmail|googlemail|google/.test(s)) return { name: 'Google', url: 'https://myaccount.google.com/apppasswords' };
  if (/icloud|me\.com|mac\.com|mail\.me/.test(s)) return { name: 'Apple (iCloud)', url: 'https://account.apple.com' };
  if (/aol/.test(s)) return { name: 'AOL', url: 'https://login.aol.com/account/security' };
  return null;
}

/** Traduz o erro técnico em mensagem + orientação. */
export function classifyMailError(
  err: any,
  kind: 'entrada' | 'saída',
  server: TestServerInput,
  email: string
): TestStepResult {
  const raw = `${err?.code || ''} ${err?.responseCode || ''} ${err?.response || ''} ${err?.responseText || ''} ${err?.message || err || ''}`;
  const text = raw.toLowerCase();
  const where = `${server.host}:${server.port}`;

  if (/enotfound|eai_again|getaddrinfo/.test(text)) {
    return {
      ok: false,
      code: 'not-found',
      message: `Servidor de ${kind} não encontrado (${server.host}).`,
      hint: 'Confira se o endereço do servidor está escrito corretamente. Se não souber, peça ao seu provedor de e-mail.',
    };
  }
  if (/econnrefused/.test(text)) {
    return {
      ok: false,
      code: 'refused',
      message: `O servidor de ${kind} recusou a conexão na porta ${server.port}.`,
      hint: 'A porta provavelmente está errada. Use "Usar padrões" ou confira a porta com o seu provedor.',
    };
  }
  if (/wrong version number|ssl3_get_record|eproto|packet length too long|unknown protocol|tls_validate_record_header/.test(text)) {
    return {
      ok: false,
      code: 'tls-mismatch',
      message: `Tipo de segurança não combina com a porta ${server.port} do servidor de ${kind}.`,
      hint:
        server.protocol === 'smtp'
          ? 'Para SMTP: porta 465 usa SSL/TLS e porta 587 usa STARTTLS. Use "Usar padrões".'
          : 'Para IMAP: porta 993 usa SSL/TLS e 143 usa STARTTLS (POP3: 995 e 110). Use "Usar padrões".',
    };
  }
  if (/cert|self.signed|unable to verify|depth_zero|altnames|hostname\/ip does not match/.test(text)) {
    return {
      ok: false,
      code: 'certificate',
      message: `O certificado de segurança do servidor de ${kind} não é reconhecido (${server.host}).`,
      hint: 'Confira o endereço do servidor. Em servidores próprios da empresa, o app pedirá confirmação para confiar no certificado.',
    };
  }
  if (/etimedout|timed? ?out|connect_timeout|required time|esocket|greeting never received|econnreset|socket hang up/.test(text)) {
    return {
      ok: false,
      code: 'timeout',
      message: `O servidor de ${kind} não respondeu (${where}).`,
      hint: 'A porta pode estar bloqueada pela rede (firewall/antivírus) ou o servidor está fora do ar. Tente outra porta com "Usar padrões" ou outra rede.',
    };
  }
  const authFailed =
    /authenticationfailed|authentication failed|invalid credentials|login failed|auth.*fail|535|534|username and password not accepted|incorrect password|invalid login|logon failure|\bno\b.*login|bad credentials|web login required|application-specific password/.test(
      text
    );
  if (authFailed) {
    const help = appPasswordHelp(email, server.host);
    if (help) {
      return {
        ok: false,
        code: 'app-password',
        message: `${help.name} recusou o login no servidor de ${kind}.`,
        hint: `${help.name} exige uma "senha de aplicativo" para programas de e-mail — a senha normal da conta não funciona. Gere uma e use-a aqui.`,
        helpUrl: help.url,
        helpLabel: `Gerar senha de aplicativo (${help.name})`,
      };
    }
    return {
      ok: false,
      code: 'auth',
      message: `Usuário ou senha incorretos no servidor de ${kind}.`,
      hint: 'Confira a senha (letras maiúsculas/minúsculas) e se o usuário é o e-mail completo.',
    };
  }
  return {
    ok: false,
    code: 'unknown',
    message: `Não foi possível conectar ao servidor de ${kind} (${where}).`,
    hint: String(err?.message || err || '').slice(0, 300) || undefined,
  };
}

async function testImap(server: TestServerInput, user: string, pass: string, email: string): Promise<TestStepResult> {
  const secure = implicitTls(server.port, server.security === 'ssl');
  const client = new ImapFlow({
    host: server.host,
    port: server.port,
    secure,
    // STARTTLS obrigatório só quando a conexão não é SSL direto (a biblioteca recusa os dois juntos)
    doSTARTTLS: !secure && server.security === 'starttls' ? true : undefined,
    auth: { user, pass },
    tls: { rejectUnauthorized: !isTlsHostTrusted(server.host) },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  } as any);
  client.on('error', () => {});
  try {
    await client.connect();
    const status = await client.status('INBOX', { messages: true });
    await client.logout().catch(() => {});
    const total = (status as any)?.messages ?? 0;
    return { ok: true, message: `Recebimento OK (IMAP) — ${total} mensagens na Caixa de Entrada.` };
  } catch (err: any) {
    try {
      client.close();
    } catch {}
    return classifyMailError(err, 'entrada', server, email);
  }
}

async function testPop3(server: TestServerInput, user: string, pass: string, email: string): Promise<TestStepResult> {
  try {
    const res = await MailService.testIncomingConnection({
      protocol: 'pop3',
      host: server.host,
      port: server.port,
      secure: implicitTls(server.port, server.security === 'ssl'),
      user,
      pass,
    } as any);
    if (res.success) return { ok: true, message: 'Recebimento OK (POP3).' };
    return classifyMailError({ message: res.message }, 'entrada', server, email);
  } catch (err) {
    return classifyMailError(err, 'entrada', server, email);
  }
}

async function testSmtp(server: TestServerInput, user: string, pass: string, email: string): Promise<TestStepResult> {
  const secure = server.port === 465 ? true : server.port === 587 || server.port === 25 ? false : server.security === 'ssl';
  const transporter = nodemailer.createTransport({
    host: server.host,
    port: server.port,
    secure,
    requireTLS: !secure && server.security === 'starttls',
    auth: { user, pass },
    tls: { rejectUnauthorized: !isTlsHostTrusted(server.host), servername: server.host },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  try {
    await transporter.verify();
    return { ok: true, message: 'Envio OK (SMTP) — login aceito.' };
  } catch (err) {
    return classifyMailError(err, 'saída', server, email);
  } finally {
    transporter.close();
  }
}

export async function testAccount(payload: {
  incoming: TestServerInput;
  outgoing: TestServerInput;
  user: string;
  pass: string;
  email?: string;
}): Promise<AccountTestResult> {
  const email = payload.email || payload.user;
  const [incoming, outgoing] = await Promise.all([
    payload.incoming.protocol === 'pop3'
      ? testPop3(payload.incoming, payload.user, payload.pass, email)
      : testImap(payload.incoming, payload.user, payload.pass, email),
    payload.outgoing.host
      ? testSmtp(payload.outgoing, payload.user, payload.pass, email)
      : Promise.resolve<TestStepResult>({ ok: false, code: 'not-found', message: 'Servidor de saída (SMTP) não informado.' }),
  ]);
  return { incoming, outgoing };
}

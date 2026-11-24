/**
 * Criptografia "direta" (SSL/TLS desde o início) ou não (texto + STARTTLS) para IMAP/POP3.
 *
 * As portas padrão já definem o modo, independentemente da configuração salva:
 *  - 993 (IMAP) e 995 (POP3): SSL/TLS direto;
 *  - 143 (IMAP) e 110 (POP3): conexão normal, com STARTTLS quando o servidor oferece.
 * Em outras portas vale a configuração da conta (secure).
 *
 * Antes, qualquer conta com segurança diferente de "nenhuma" tentava SSL direto — o que fazia
 * contas STARTTLS na porta 143/110 falharem.
 */
export function implicitTls(port: number | undefined, secure: boolean | undefined): boolean {
  const p = Number(port);
  if (p === 993 || p === 995) return true;
  if (p === 143 || p === 110) return false;
  return secure !== false;
}

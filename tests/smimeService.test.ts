import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { SmimeService } from '../src/main/services/smimeService';

function createSelfSignedTestCert(commonName: string, email: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'emailAddress', value: email },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

describe('SmimeService (X.509 / PKCS#7)', () => {
  it('inspeciona certificado público, assina e verifica PKCS#7 SignedData', () => {
    const { certPem, privateKeyPem } = createSelfSignedTestCert('Diretoria Anectta', 'dir@anectta.test');

    const meta = SmimeService.inspectPublicCert(certPem);
    expect(meta.success).toBe(true);
    expect(meta.metadata?.commonName).toBe('Diretoria Anectta');
    expect(meta.metadata?.email).toBe('dir@anectta.test');

    const signed = SmimeService.signMessage({
      text: 'Ata assinada digitalmente via S/MIME.',
      certPem,
      privateKeyPem,
    });
    expect(signed.success).toBe(true);
    expect(signed.pkcs7Pem).toContain('-----BEGIN PKCS7-----');

    const verified = SmimeService.decryptOrVerify({ pkcs7Pem: signed.pkcs7Pem! });
    expect(verified.success).toBe(true);
    expect(verified.mode).toBe('verified');
    expect(verified.plainText).toBe('Ata assinada digitalmente via S/MIME.');
    expect(verified.signerSubject).toBe('Diretoria Anectta');
  });

  it('criptografa e descriptografa PKCS#7 EnvelopedData AES-256', () => {
    const { certPem, privateKeyPem } = createSelfSignedTestCert('Jurídico', 'juridico@anectta.test');

    const enc = SmimeService.encryptMessage({
      text: 'Contrato sigiloso S/MIME AES-256.',
      recipientCertPems: [certPem],
    });
    expect(enc.success).toBe(true);
    expect(enc.pkcs7Pem).toContain('-----BEGIN PKCS7-----');

    const dec = SmimeService.decryptOrVerify({
      pkcs7Pem: enc.pkcs7Pem!,
      certPem,
      privateKeyPem,
    });
    expect(dec.success).toBe(true);
    expect(dec.mode).toBe('decrypted');
    expect(dec.plainText).toBe('Contrato sigiloso S/MIME AES-256.');
  });
});

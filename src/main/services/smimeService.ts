import forge from 'node-forge';

export interface SmimeCertMetadata {
  commonName: string;
  email: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  certPem: string;
}

function extractCertMetadata(cert: forge.pki.Certificate): SmimeCertMetadata {
  const cnAttr = cert.subject.getField('CN');
  const emailAttr = cert.subject.getField('E') || cert.subject.getField('emailAddress');
  const issuerCn = cert.issuer.getField('CN') || cert.issuer.getField('O');

  let email = emailAttr ? String(emailAttr.value || '') : '';
  if (!email) {
    const sanExt: any = cert.getExtension('subjectAltName');
    if (sanExt && Array.isArray(sanExt.altNames)) {
      const rfc822 = sanExt.altNames.find((a: any) => a.type === 1 && a.value);
      if (rfc822) email = String(rfc822.value);
    }
  }

  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const sha256 = forge.md.sha256.create();
  sha256.update(derBytes);
  const fingerprint = sha256.digest().toHex().toUpperCase();

  return {
    commonName: cnAttr ? String(cnAttr.value || '') : email || 'Certificado X.509',
    email: email.trim().toLowerCase(),
    issuer: issuerCn ? String(issuerCn.value || '') : 'Autoridade Certificadora',
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    fingerprint,
    certPem: forge.pki.certificateToPem(cert),
  };
}

export class SmimeService {
  /**
   * Parses a PKCS#12 (.p12 / .pfx) digital certificate (including ICP-Brasil A1 / corporate X.509).
   */
  public static importPkcs12(params: {
    p12Base64: string;
    passphrase: string;
  }): {
    success: boolean;
    metadata?: SmimeCertMetadata;
    privateKeyPem?: string;
    error?: string;
  } {
    try {
      const p12Der = forge.util.decode64(params.p12Base64);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, params.passphrase || '');

      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
      const keyBags =
        p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ||
        p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
        [];

      const certBag = certBags.find((b) => b.cert);
      const keyBag = keyBags.find((b) => b.key);

      if (!certBag?.cert || !keyBag?.key) {
        return {
          success: false,
          error: 'O arquivo .p12/.pfx não contém um par válido de certificado X.509 e chave privada.',
        };
      }

      const metadata = extractCertMetadata(certBag.cert);
      const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key);

      return {
        success: true,
        metadata,
        privateKeyPem,
      };
    } catch (err: any) {
      return {
        success: false,
        error:
          err?.message?.includes('Invalid password') || err?.message?.includes('MAC')
            ? 'Senha incorreta para o certificado .p12/.pfx.'
            : err?.message || 'Falha ao ler certificado PKCS#12 (.p12/.pfx).',
      };
    }
  }

  /**
   * Parses a public X.509 certificate (.pem, .crt, .cer in PEM or Base64 DER).
   */
  public static inspectPublicCert(certContent: string): {
    success: boolean;
    metadata?: SmimeCertMetadata;
    error?: string;
  } {
    try {
      const trimmed = (certContent || '').trim();
      let cert: forge.pki.Certificate;
      if (trimmed.includes('BEGIN CERTIFICATE')) {
        cert = forge.pki.certificateFromPem(trimmed);
      } else {
        const der = forge.util.decode64(trimmed.replace(/\s+/g, ''));
        const asn1 = forge.asn1.fromDer(der);
        cert = forge.pki.certificateFromAsn1(asn1);
      }
      return {
        success: true,
        metadata: extractCertMetadata(cert),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Certificado público X.509 (.pem/.crt/.cer) inválido.',
      };
    }
  }

  /**
   * Signs text using PKCS#7 / CMS SignedData (S/MIME).
   */
  public static signMessage(params: {
    text: string;
    certPem: string;
    privateKeyPem: string;
  }): { success: boolean; pkcs7Pem?: string; error?: string } {
    try {
      const cert = forge.pki.certificateFromPem(params.certPem);
      const privateKey = forge.pki.privateKeyFromPem(params.privateKeyPem);

      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(params.text, 'utf8');
      p7.addCertificate(cert);
      p7.addSigner({
        key: privateKey as any,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
          { type: forge.pki.oids.messageDigest },
          { type: forge.pki.oids.signingTime, value: new Date() as any },
        ],
      });
      p7.sign();
      const pkcs7Pem = forge.pkcs7.messageToPem(p7);
      return { success: true, pkcs7Pem };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao assinar mensagem com S/MIME.' };
    }
  }

  /**
   * Encrypts text using PKCS#7 / CMS EnvelopedData (AES-256-CBC) for one or more X.509 recipients.
   */
  public static encryptMessage(params: {
    text: string;
    recipientCertPems: string[];
  }): { success: boolean; pkcs7Pem?: string; error?: string } {
    try {
      const certs = params.recipientCertPems.map((pem) => forge.pki.certificateFromPem(pem));
      if (certs.length === 0) {
        return { success: false, error: 'Nenhum certificado público X.509 de destinatário informado.' };
      }

      const p7 = forge.pkcs7.createEnvelopedData();
      p7.content = forge.util.createBuffer(params.text, 'utf8');
      for (const cert of certs) {
        p7.addRecipient(cert);
      }
      p7.encrypt(undefined, forge.pki.oids['aes256-CBC']);
      const pkcs7Pem = forge.pkcs7.messageToPem(p7 as any);
      return { success: true, pkcs7Pem };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Erro ao criptografar mensagem com S/MIME.' };
    }
  }

  /**
   * Decrypts (EnvelopedData) or reads/verifies (SignedData) a PKCS#7 S/MIME block.
   */
  public static decryptOrVerify(params: {
    pkcs7Pem: string;
    privateKeyPem?: string;
    certPem?: string;
  }): {
    success: boolean;
    mode?: 'decrypted' | 'verified';
    plainText?: string;
    signerSubject?: string;
    signerIssuer?: string;
    signerEmail?: string;
    validTo?: string;
    error?: string;
  } {
    try {
      const p7: any = forge.pkcs7.messageFromPem(params.pkcs7Pem.trim());

      // EnvelopedData (encrypted)
      if (typeof p7.decrypt === 'function' && Array.isArray(p7.recipients)) {
        if (!params.privateKeyPem || !params.certPem) {
          return {
            success: false,
            error:
              'Certificado digital .p12/.pfx não encontrado para descriptografar. Importe seu certificado em Configurações → Privacidade → S/MIME.',
          };
        }
        const cert = forge.pki.certificateFromPem(params.certPem);
        const privateKey = forge.pki.privateKeyFromPem(params.privateKeyPem);
        const recipient = p7.findRecipient(cert);
        if (!recipient) {
          return {
            success: false,
            error: 'Esta mensagem S/MIME não foi criptografada para o seu certificado X.509 atual.',
          };
        }
        p7.decrypt(recipient, privateKey);
        const plainText = p7.content ? p7.content.toString('utf8') : '';
        return {
          success: true,
          mode: 'decrypted',
          plainText,
        };
      }

      // SignedData (digitally signed)
      const extractAsn1Text = (node: any): string => {
        if (!node) return '';
        if (typeof node === 'string') return forge.util.decodeUtf8(node);
        if (typeof node.toString === 'function' && node.bytes && typeof node.bytes === 'function') {
          return node.toString('utf8');
        }
        if (typeof node.value === 'string') return forge.util.decodeUtf8(node.value);
        if (Array.isArray(node.value)) {
          return node.value.map((child: any) => extractAsn1Text(child)).join('');
        }
        return '';
      };

      let plainText = '';
      if (p7.content && typeof p7.content.toString === 'function' && p7.content.length && p7.content.length() > 0) {
        plainText = p7.content.toString('utf8');
      } else if (p7.rawCapture?.content) {
        plainText = extractAsn1Text(p7.rawCapture.content);
      }
      let signerSubject: string | undefined;
      let signerIssuer: string | undefined;
      let signerEmail: string | undefined;
      let validTo: string | undefined;

      if (Array.isArray(p7.certificates) && p7.certificates.length > 0) {
        const meta = extractCertMetadata(p7.certificates[0]);
        signerSubject = meta.commonName;
        signerIssuer = meta.issuer;
        signerEmail = meta.email;
        validTo = meta.validTo;
      }

      return {
        success: true,
        mode: 'verified',
        plainText,
        signerSubject,
        signerIssuer,
        signerEmail,
        validTo,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Falha ao processar bloco S/MIME PKCS#7.',
      };
    }
  }
}

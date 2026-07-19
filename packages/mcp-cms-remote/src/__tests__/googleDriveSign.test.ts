import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { signRs256Workers } from '../googleDriveSign';

describe('signRs256Workers', () => {
  it('PKCS8 PEM鍵で署名し、公開鍵で検証できる', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const signingInput = 'header-part.payload-part';
    const signatureB64Url = await signRs256Workers(privateKey, signingInput);

    expect(signatureB64Url).not.toMatch(/[+/=]/);

    const signatureBuf = Buffer.from(signatureB64Url, 'base64url');
    const isValid = cryptoVerify(
      'RSA-SHA256',
      Buffer.from(signingInput, 'utf-8'),
      { key: publicKey, padding: 1 },
      signatureBuf,
    );
    expect(isValid).toBe(true);
  });
});

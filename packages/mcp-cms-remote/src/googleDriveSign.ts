import { base64UrlEncodeBytes, type SignRs256 } from '@anytime-markdown/cms-core';

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  // atob の戻り値は各文字が 0x00-0xFF の binary string なので codePointAt は charCodeAt と一致する。
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes.buffer;
}

export const signRs256Workers: SignRs256 = async (privateKeyPem, signingInput) => {
  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return base64UrlEncodeBytes(new Uint8Array(signatureBuffer));
};

import { sign as cryptoSign, constants } from 'node:crypto';
import { base64UrlEncodeBytes, type SignRs256 } from '@anytime-markdown/cms-core';

export const signRs256Node: SignRs256 = (privateKeyPem, signingInput) => {
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput, 'utf-8'), {
    key: privateKeyPem,
    padding: constants.RSA_PKCS1_PADDING,
  });
  return Promise.resolve(base64UrlEncodeBytes(signature));
};

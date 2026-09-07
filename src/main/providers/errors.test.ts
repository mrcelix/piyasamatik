import { describe, it, expect } from 'vitest';
import { describeFetchError, FETCH_ERROR_FALLBACK } from './errors';

// Reproduces how undici (and therefore Electron's fetch) surfaces a failure:
// a TypeError whose `cause` carries the real code.
function fetchFailed(code: string) {
  const err: any = new TypeError('fetch failed');
  err.cause = Object.assign(new Error('underlying'), { code });
  return err;
}

describe('describeFetchError', () => {
  it('reports a filtered network for a self-signed certificate', () => {
    // The measured real-world case: a corporate DNS sinkholes api.coingecko.com
    // and its appliance answers TLS with a default self-signed certificate.
    expect(describeFetchError(fetchFailed('DEPTH_ZERO_SELF_SIGNED_CERT'))).toBe('ag engelliyor');
  });

  it('treats every untrusted-certificate variant the same way', () => {
    for (const code of [
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'CERT_UNTRUSTED',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ]) {
      expect(describeFetchError(fetchFailed(code))).toBe('ag engelliyor');
    }
  });

  it('separates name resolution, timeout and connection failures', () => {
    expect(describeFetchError(fetchFailed('ENOTFOUND'))).toBe('adres bulunamadi');
    expect(describeFetchError(fetchFailed('EAI_AGAIN'))).toBe('adres bulunamadi');
    expect(describeFetchError(fetchFailed('ETIMEDOUT'))).toBe('zaman asimi');
    expect(describeFetchError(fetchFailed('UND_ERR_CONNECT_TIMEOUT'))).toBe('zaman asimi');
    expect(describeFetchError(fetchFailed('ECONNREFUSED'))).toBe('baglanti yok');
    expect(describeFetchError(fetchFailed('ECONNRESET'))).toBe('baglanti yok');
  });

  it('reads the code off the error itself when there is no cause wrapper', () => {
    const err: any = Object.assign(new Error('boom'), { code: 'ENOTFOUND' });
    expect(describeFetchError(err)).toBe('adres bulunamadi');
  });

  it('calls out rate limiting separately from other HTTP statuses', () => {
    expect(describeFetchError(new Error('HTTP 429'))).toBe('istek siniri');
    expect(describeFetchError(new Error('HTTP 503'))).toBe('servis hatasi 503');
    // Providers prefix their own name on some throws; the status still wins.
    expect(describeFetchError(new Error('tefas HTTP 500'))).toBe('servis hatasi 500');
  });

  it('falls back for anything it cannot classify', () => {
    expect(describeFetchError(new Error('veri bulunamadi'))).toBe(FETCH_ERROR_FALLBACK);
    expect(describeFetchError(fetchFailed('SOMETHING_NEW'))).toBe(FETCH_ERROR_FALLBACK);
    expect(describeFetchError(undefined)).toBe(FETCH_ERROR_FALLBACK);
    expect(describeFetchError('a string')).toBe(FETCH_ERROR_FALLBACK);
  });
});

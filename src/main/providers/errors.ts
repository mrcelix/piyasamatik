// Turns a thrown fetch/provider error into a short Turkish label shown in the
// row where the price would be.
//
// Why this exists: every provider used to store `err.message`, and the renderer
// threw it away and printed a flat "veri alinamadi" for every failure. That
// hides the single most common cause on managed networks — the domain being
// filtered. A corporate DNS that sinkholes a domain answers TLS with its
// appliance's default self-signed certificate, so `fetch` rejects with
// TypeError("fetch failed") and cause.code DEPTH_ZERO_SELF_SIGNED_CERT
// (measured, not guessed). That is indistinguishable from "the API is down"
// unless we look at the cause, and it is worth distinguishing: nothing the user
// or the app can do will fix it, whereas a 5xx is worth retrying.
//
// Labels are deliberately short — they render inside a ~120px grid card — and
// written in plain ASCII to match the rest of the app's Turkish strings.

// The connection was answered by something presenting a certificate we cannot
// verify. On a home network this is essentially never seen; on a filtered
// network it is the signature of interception.
const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_UNTRUSTED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// The name did not resolve at all, or resolved to somewhere nothing answers.
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);

const CONNECT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']);

export const FETCH_ERROR_FALLBACK = 'veri alinamadi';

function causeCode(err: any): string | undefined {
  // undici wraps the underlying failure: TypeError('fetch failed') with the
  // real error on `cause`. Older/other paths put the code on the error itself.
  const code = err?.cause?.code ?? err?.code;
  return typeof code === 'string' ? code : undefined;
}

export function describeFetchError(err: unknown): string {
  const code = causeCode(err);
  if (code) {
    if (TLS_CODES.has(code)) return 'ag engelliyor';
    if (DNS_CODES.has(code)) return 'adres bulunamadi';
    if (TIMEOUT_CODES.has(code)) return 'zaman asimi';
    if (CONNECT_CODES.has(code)) return 'baglanti yok';
  }

  // Providers throw `new Error('HTTP 503')` / `new Error('tefas HTTP 503')` for
  // a non-ok response. A 429 is worth calling out separately: these are all
  // free, unauthenticated endpoints, and rate limiting is the failure a user is
  // most likely to hit repeatedly and most likely to recover from by waiting.
  const message = (err as any)?.message;
  if (typeof message === 'string') {
    const status = message.match(/HTTP (\d{3})/);
    if (status) {
      if (status[1] === '429') return 'istek siniri';
      return `servis hatasi ${status[1]}`;
    }
  }

  return FETCH_ERROR_FALLBACK;
}

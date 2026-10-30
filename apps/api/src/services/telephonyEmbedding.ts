import { assertDialpadUrl, TelephonyUrlError } from './telephonyUrl';

export type EmbeddingHeaders = {
  xFrameOptions: string | null;
  contentSecurityPolicy: string | null;
  frameAncestors: string | null;
};

function sourceAllowsOrigin(source: string, origin: string, responseOrigin: string) {
  if (source === '*') return true;
  if (source === "'self'") return origin === responseOrigin;
  if (source === "'none'") return false;
  if (/^[a-z][a-z\d+.-]*:$/i.test(source)) return new URL(origin).protocol === source.toLowerCase();

  try {
    const target = new URL(origin);
    if (source.startsWith('*.')) {
      return target.protocol === new URL(responseOrigin).protocol &&
        target.hostname.toLowerCase().endsWith(`.${source.slice(2).toLowerCase()}`);
    }
    if (source.includes('://*.')) {
      const suffix = source.slice(source.indexOf('://*.') + 5).split(/[/:]/, 1)[0].toLowerCase();
      return target.protocol === source.slice(0, source.indexOf(':') + 1).toLowerCase() &&
        target.hostname.toLowerCase().endsWith(`.${suffix}`);
    }
    return new URL(source).origin === origin;
  } catch {
    return false;
  }
}

export function readEmbeddingHeaders(headers: Headers): EmbeddingHeaders {
  const contentSecurityPolicy = headers.get('content-security-policy');
  const frameAncestors = contentSecurityPolicy
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => /^frame-ancestors(?:\s|$)/i.test(directive))
    ?.replace(/^frame-ancestors\s*/i, '') || null;
  return {
    xFrameOptions: headers.get('x-frame-options'),
    contentSecurityPolicy,
    frameAncestors,
  };
}

export function embeddingVerdict(
  headers: EmbeddingHeaders,
  targetOrigin: string,
  responseOrigin: string,
) {
  if (headers.frameAncestors !== null) {
    const allowed = headers.frameAncestors
      .split(/\s+/)
      .filter(Boolean)
      .some((source) => sourceAllowsOrigin(source, targetOrigin, responseOrigin));
    return allowed ? `Allowed for ${targetOrigin}` : `Blocked: Bizcall does not allow ${targetOrigin}`;
  }

  const xFrameOptions = headers.xFrameOptions?.trim().toLowerCase();
  if (xFrameOptions === 'deny') return `Blocked: Bizcall does not allow ${targetOrigin}`;
  if (xFrameOptions === 'sameorigin') {
    return targetOrigin === responseOrigin
      ? `Allowed for ${targetOrigin}`
      : `Blocked: Bizcall does not allow ${targetOrigin}`;
  }
  if (xFrameOptions?.startsWith('allow-from ')) {
    const allowedOrigin = xFrameOptions.slice('allow-from '.length).trim();
    return sourceAllowsOrigin(allowedOrigin, targetOrigin, responseOrigin)
      ? `Allowed for ${targetOrigin}`
      : `Blocked: Bizcall does not allow ${targetOrigin}`;
  }
  return `Allowed for ${targetOrigin}`;
}

export async function checkDialpadEmbedding(
  dialpadUrl: string,
  targetOrigin: string,
  fetchImpl: typeof fetch = fetch,
) {
  const url = new URL(assertDialpadUrl(dialpadUrl));
  if (url.protocol !== 'https:') throw new TelephonyUrlError('The dialpad URL must use HTTPS.');
  let originUrl: URL;
  try {
    originUrl = new URL(targetOrigin);
  } catch {
    throw new TelephonyUrlError('Provide a valid CRM origin.');
  }
  if (originUrl.origin !== targetOrigin || !['https:', 'http:'].includes(originUrl.protocol)) {
    throw new TelephonyUrlError('Provide a valid CRM origin.');
  }

  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  });
  const headers = readEmbeddingHeaders(response.headers);
  await response.body?.cancel();
  return {
    httpStatus: response.status,
    headers,
    verdict: response.status >= 300 && response.status < 400
      ? `Blocked: Bizcall redirected the dialpad request for ${targetOrigin}`
      : embeddingVerdict(headers, originUrl.origin, url.origin),
  };
}

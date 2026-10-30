export const PRIVATE_API_URL_WARNING =
  'This URL is not reachable from outside. Open this page from your public domain, or set PUBLIC_API_BASE_URL, before giving it to a telecom provider.';

export interface PublicApiBaseInput {
  nodeEnv?: string;
  publicBaseUrl?: string;
  allowedHosts?: string;
  trustProxy?: boolean;
  protocol?: string;
  host?: string;
  forwardedProto?: string;
  forwardedHost?: string;
}

export interface PublicApiBaseUrl {
  baseUrl: string;
  source: 'env' | 'request' | 'rejected';
  privateHost: boolean;
  warning: string | null;
}

interface HostParts {
  hostname: string;
  port?: string;
}

function firstHeaderValue(value?: string) {
  return (value || '').split(',')[0]?.trim() || '';
}

function splitHost(value: string): HostParts | null {
  const raw = value.trim();
  if (!raw || raw.includes('/') || raw.includes(' ') || raw.includes('@')) return null;
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end <= 1) return null;
    const hostname = raw.slice(1, end);
    const rest = raw.slice(end + 1);
    if (rest && !rest.startsWith(':')) return null;
    const port = rest.slice(1);
    if (port && !/^\d+$/.test(port)) return null;
    return { hostname, port: port || undefined };
  }
  const colon = raw.lastIndexOf(':');
  if (colon > -1 && raw.indexOf(':') === colon) {
    const hostname = raw.slice(0, colon);
    const port = raw.slice(colon + 1);
    if (!hostname || !/^\d+$/.test(port)) return null;
    return { hostname, port };
  }
  return { hostname: raw };
}

function protocolOf(value?: string) {
  const protocol = firstHeaderValue(value).toLowerCase().replace(/:$/, '');
  return protocol === 'https' ? 'https' : 'http';
}

function originFrom(protocol: string, parts: HostParts) {
  const proto = protocol === 'https' ? 'https' : 'http';
  const defaultPort = proto === 'https' ? '443' : '80';
  const port = parts.port && parts.port !== defaultPort ? `:${parts.port}` : '';
  const hostname = parts.hostname.includes(':') ? `[${parts.hostname}]` : parts.hostname;
  return `${proto}://${hostname}${port}`;
}

export function isPrivateApiHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
  if (host.endsWith('.local')) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (private172) {
    const octet = Number(private172[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  return false;
}

function envOrigin(value?: string): { origin: string; parts: HostParts } | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.username || url.password || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
    const parts = splitHost(url.host);
    if (!parts) return null;
    return { origin: originFrom(url.protocol.replace(':', ''), parts), parts };
  } catch {
    return null;
  }
}

function allowlistEntries(input: PublicApiBaseInput) {
  const entries = (input.allowedHosts || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const fromEnv = envOrigin(input.publicBaseUrl);
  if (fromEnv) entries.push(fromEnv.parts.port ? `${fromEnv.parts.hostname.toLowerCase()}:${fromEnv.parts.port}` : fromEnv.parts.hostname.toLowerCase());
  return entries;
}

function hostAllowed(parts: HostParts, input: PublicApiBaseInput) {
  const hostname = parts.hostname.toLowerCase();
  const development = input.nodeEnv !== 'production';
  if (development && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.local') || isPrivateApiHost(hostname))) {
    return true;
  }
  return allowlistEntries(input).some((entry) => {
    const allowed = splitHost(entry);
    if (!allowed) return false;
    if (allowed.hostname.toLowerCase() !== hostname) return false;
    return !allowed.port || allowed.port === parts.port;
  });
}

function rejected(warning: string): PublicApiBaseUrl {
  return { baseUrl: '', source: 'rejected', privateHost: false, warning };
}

export function getPublicApiBaseUrl(input: PublicApiBaseInput): PublicApiBaseUrl {
  const configured = envOrigin(input.publicBaseUrl);
  if ((input.publicBaseUrl || '').trim()) {
    if (!configured) return rejected('PUBLIC_API_BASE_URL is not a valid http(s) origin.');
    const privateHost = isPrivateApiHost(configured.parts.hostname);
    return {
      baseUrl: configured.origin,
      source: 'env',
      privateHost,
      warning: privateHost ? PRIVATE_API_URL_WARNING : null,
    };
  }

  const trustForwarded = Boolean(input.trustProxy);
  const hostHeader = trustForwarded
    ? firstHeaderValue(input.forwardedHost) || input.host || ''
    : input.host || '';
  const protocol = trustForwarded
    ? protocolOf(firstHeaderValue(input.forwardedProto) || input.protocol)
    : protocolOf(input.protocol);
  const parts = splitHost(hostHeader);
  if (!parts || !parts.hostname) {
    return rejected('Set PUBLIC_API_BASE_URL before sharing links.');
  }
  if (!hostAllowed(parts, input)) {
    return rejected('The detected host is not on the allowlist. Set PUBLIC_API_BASE_URL before sharing links.');
  }
  const privateHost = isPrivateApiHost(parts.hostname);
  return {
    baseUrl: originFrom(protocol, parts),
    source: 'request',
    privateHost,
    warning: privateHost ? PRIVATE_API_URL_WARNING : null,
  };
}

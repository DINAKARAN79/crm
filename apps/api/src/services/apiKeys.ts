import { createHash, randomBytes } from 'crypto';
import type { Request } from 'express';
import { prisma } from '@dct-crm/db';

export const COMPANY_API_SCOPES = [
  'leads:read',
  'leads:write',
  'call-details:write',
  'follow-ups:read',
  'follow-ups:write',
  'site-visits:read',
  'site-visits:write',
  'webhooks:manage',
] as const;

export type CompanyApiScope = typeof COMPANY_API_SCOPES[number];

const READ_GRANTED_BY: Record<string, CompanyApiScope> = {
  'leads:read': 'leads:write',
  'follow-ups:read': 'follow-ups:write',
  'site-visits:read': 'site-visits:write',
};

const rateHits = new Map<string, number[]>();

export class ApiKeyAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function resetApiKeyRateLimits() {
  rateHits.clear();
}

export function hashApiKey(apiKey: string) {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generateApiKeySecret() {
  const apiKey = `dct_${randomBytes(32).toString('base64url')}`;
  return { apiKey, keyPrefix: apiKey.slice(0, 12), keyHash: hashApiKey(apiKey) };
}

export function scopeAllows(granted: string[], required: string) {
  if (granted.includes(required)) return true;
  const writer = READ_GRANTED_BY[required];
  return Boolean(writer && granted.includes(writer));
}

export function requiredScopeForRequest(method: string, path: string): string | null {
  const pathname = path.split('?')[0];
  const write = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (pathname === '/api/leads' || pathname.startsWith('/api/leads/')) {
    return write ? 'leads:write' : 'leads:read';
  }
  if (pathname === '/api/call-details' || pathname.startsWith('/api/call-details/')) {
    return 'call-details:write';
  }
  if (pathname === '/api/follow-ups' || pathname.startsWith('/api/follow-ups/')) {
    return write ? 'follow-ups:write' : 'follow-ups:read';
  }
  if (pathname === '/api/site-visits' || pathname.startsWith('/api/site-visits/')) {
    return write ? 'site-visits:write' : 'site-visits:read';
  }
  return null;
}

export function requestIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = typeof forwarded === 'string' && forwarded.trim()
    ? forwarded.split(',')[0].trim()
    : req.ip || '';
  return raw.replace(/^::ffff:/, '');
}

export function consumeApiKeyRateLimit(keyId: string, limit: number, now = Date.now()) {
  const windowStart = now - 60_000;
  const recent = (rateHits.get(keyId) || []).filter((timestamp) => timestamp > windowStart);
  if (recent.length >= limit) {
    rateHits.set(keyId, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(keyId, recent);
  return true;
}

export function presentedApiKey(req: Request) {
  const header = req.headers['x-api-key'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (typeof fromHeader === 'string' && fromHeader.trim()) return fromHeader.trim();
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token.startsWith('dct_')) return token;
  }
  return null;
}

export function publicApiKey(record: {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  ipAllowlist: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    scopes: record.scopes,
    rateLimitPerMinute: record.rateLimitPerMinute,
    ipAllowlist: record.ipAllowlist,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt,
  };
}

export async function listCompanyApiKeys(tenantId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return keys.map(publicApiKey);
}

export async function createCompanyApiKey(input: {
  tenantId: string;
  name: string;
  scopes: string[];
  rateLimitPerMinute: number;
  ipAllowlist: string[];
  expiresAt: Date | null;
  createdById: string;
}) {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
  if (!tenant) throw new ApiKeyAuthError(404, 'Company not found');
  const secret = generateApiKeySecret();
  const record = await prisma.apiKey.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      keyPrefix: secret.keyPrefix,
      keyHash: secret.keyHash,
      scopes: input.scopes,
      rateLimitPerMinute: input.rateLimitPerMinute,
      ipAllowlist: input.ipAllowlist,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
    },
  });
  return { record: publicApiKey(record), apiKey: secret.apiKey };
}

export async function revokeCompanyApiKey(tenantId: string, keyId: string) {
  const existing = await prisma.apiKey.findFirst({ where: { id: keyId, tenantId } });
  if (!existing) throw new ApiKeyAuthError(404, 'API key not found');
  if (existing.revokedAt) return publicApiKey(existing);
  const record = await prisma.apiKey.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
  return publicApiKey(record);
}

export async function rotateCompanyApiKey(tenantId: string, keyId: string, createdById: string) {
  const existing = await prisma.apiKey.findFirst({ where: { id: keyId, tenantId } });
  if (!existing) throw new ApiKeyAuthError(404, 'API key not found');
  if (existing.revokedAt) throw new ApiKeyAuthError(409, 'Revoked API keys cannot be rotated');
  const secret = generateApiKeySecret();
  const record = await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    return tx.apiKey.create({
      data: {
        tenantId,
        name: existing.name,
        keyPrefix: secret.keyPrefix,
        keyHash: secret.keyHash,
        scopes: existing.scopes,
        rateLimitPerMinute: existing.rateLimitPerMinute,
        ipAllowlist: existing.ipAllowlist,
        expiresAt: existing.expiresAt,
        createdById,
      },
    });
  });
  return { record: publicApiKey(record), apiKey: secret.apiKey, previousId: existing.id };
}

export async function authenticatePresentedApiKey(req: Request, rawKey: string) {
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(rawKey) } });
  if (!record || record.revokedAt) throw new ApiKeyAuthError(401, 'Invalid or revoked API key');
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    throw new ApiKeyAuthError(401, 'API key has expired');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: record.tenantId },
    select: { id: true, isActive: true, companyStartDate: true, companyExpiryDate: true },
  });
  if (!tenant || !tenant.isActive) throw new ApiKeyAuthError(403, 'Company is inactive. Contact Super Admin.');
  const now = new Date();
  if (tenant.companyStartDate && now < tenant.companyStartDate) {
    throw new ApiKeyAuthError(403, 'Company has not started yet.');
  }
  if (tenant.companyExpiryDate && now > tenant.companyExpiryDate) {
    throw new ApiKeyAuthError(403, 'Company subscription has expired. Contact Super Admin.');
  }

  const requestedTenant = typeof req.query.tenantId === 'string' ? req.query.tenantId.trim() : '';
  if (requestedTenant && requestedTenant !== record.tenantId) {
    throw new ApiKeyAuthError(403, 'tenantId does not match this API key');
  }

  if (record.ipAllowlist.length > 0 && !record.ipAllowlist.includes(requestIp(req))) {
    throw new ApiKeyAuthError(403, 'Request IP is not allowed for this API key');
  }

  const required = requiredScopeForRequest(req.method, req.originalUrl || req.url || '');
  if (!required) throw new ApiKeyAuthError(403, 'This API key cannot access this endpoint');
  if (!scopeAllows(record.scopes, required)) {
    throw new ApiKeyAuthError(403, `API key is missing the ${required} scope`);
  }

  if (!consumeApiKeyRateLimit(record.id, record.rateLimitPerMinute)) {
    throw new ApiKeyAuthError(429, 'API key rate limit exceeded');
  }

  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });

  const creator = await prisma.user.findUnique({
    where: { id: record.createdById },
    select: { id: true, email: true, isActive: true },
  });

  return {
    record,
    user: {
      id: creator?.isActive ? creator.id : record.createdById,
      email: creator?.email || 'api-key',
      tenantId: record.tenantId,
      isSuperAdmin: false,
      isAdmin: false,
    },
  };
}

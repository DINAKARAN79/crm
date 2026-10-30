import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import {
  assertCatalogPath,
  buildCompanyApiCatalog,
  validateCatalogBody,
} from '../services/companyApiCatalog';
import { getPublicApiBaseUrl } from '../services/publicApiBaseUrl';

const router = Router();
router.use(authenticate);
router.use(requireSuperAdmin);

const trySchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  path: z.string().startsWith('/api/'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.unknown().optional(),
  apiKey: z.string().min(8).optional(),
  sandbox: z.boolean().optional(),
  objectName: z.string().min(1),
  operationId: z.string().min(1),
});

function headerValue(req: AuthRequest, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function resolvedBaseUrl(req: AuthRequest) {
  return getPublicApiBaseUrl({
    nodeEnv: process.env.NODE_ENV,
    publicBaseUrl: process.env.PUBLIC_API_BASE_URL,
    allowedHosts: process.env.ALLOWED_API_HOSTS,
    trustProxy: Boolean(req.app.get('trust proxy')),
    protocol: req.protocol,
    host: req.get('host') || '',
    forwardedProto: headerValue(req, 'x-forwarded-proto'),
    forwardedHost: headerValue(req, 'x-forwarded-host'),
  });
}

router.get('/', (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: buildCompanyApiCatalog() });
});

router.get('/base-url', (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: resolvedBaseUrl(req) });
});

router.post('/validate', (req: AuthRequest, res: Response) => {
  const body = z.object({
    objectName: z.string().min(1),
    operationId: z.string().min(1),
    body: z.unknown(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ success: false, error: 'Invalid validation request' });
  res.json({ success: true, data: validateCatalogBody(body.data.objectName, body.data.operationId, body.data.body) });
});

router.post('/try', async (req: AuthRequest, res: Response) => {
  const parsed = trySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || 'Invalid try request' });
  const input = parsed.data;
  if (!assertCatalogPath(input.path)) {
    return res.status(400).json({ success: false, error: 'That path is not in the API catalog' });
  }
  if (input.query && 'tenantId' in input.query) {
    return res.status(400).json({ success: false, error: 'tenantId is not part of this URL' });
  }
  const validation = input.method === 'GET' || input.method === 'DELETE'
    ? { valid: true, fieldErrors: [] as Array<{ field: string; message: string }> }
    : validateCatalogBody(input.objectName, input.operationId, input.body);
  if (!validation.valid || input.sandbox || !input.apiKey) {
    return res.json({
      success: true,
      data: {
        sandbox: true,
        status: validation.valid ? 200 : 400,
        body: validation.valid ? { success: true, sandbox: true } : { success: false, fieldErrors: validation.fieldErrors },
        fieldErrors: validation.fieldErrors,
        ms: 0,
      },
    });
  }

  const resolved = resolvedBaseUrl(req);
  if (!resolved.baseUrl) {
    return res.status(400).json({ success: false, error: resolved.warning || 'No public API URL is configured.' });
  }
  const url = new URL(input.path, resolved.baseUrl);
  if (url.host !== new URL(resolved.baseUrl).host) {
    return res.status(400).json({ success: false, error: 'That path is not in the API catalog' });
  }
  for (const [key, value] of Object.entries(input.query || {})) url.searchParams.set(key, String(value));
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        ...(input.method === 'POST' || input.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: input.method === 'GET' || input.method === 'DELETE' ? undefined : JSON.stringify(input.body ?? {}),
    });
    const text = await response.text();
    let responseBody: unknown = text;
    try { responseBody = text ? JSON.parse(text) : null; } catch { responseBody = text; }
    res.json({
      success: true,
      data: { sandbox: false, status: response.status, ms: Date.now() - started, body: responseBody, fieldErrors: [] },
    });
  } catch (error) {
    console.error('API catalog try failed:', error);
    res.status(502).json({ success: false, error: 'The API could not be reached' });
  }
});

export default router;

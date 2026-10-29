import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { auditLog } from '../middleware/audit';
import {
  ApiKeyAuthError,
  COMPANY_API_SCOPES,
  createCompanyApiKey,
  listCompanyApiKeys,
  revokeCompanyApiKey,
  rotateCompanyApiKey,
} from '../services/apiKeys';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requireSuperAdmin);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  scopes: z.array(z.enum(COMPANY_API_SCOPES)).min(1, 'Select at least one scope'),
  rateLimitPerMinute: z.number().int().min(1).max(10000).optional(),
  ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

function tenantIdOf(req: AuthRequest) {
  return String(req.params.tenantId || '');
}

function sendError(res: Response, error: unknown) {
  if (error instanceof ApiKeyAuthError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid API key' });
  }
  console.error('Company API key error:', error);
  return res.status(500).json({ success: false, error: 'Failed to update API keys' });
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await listCompanyApiKeys(tenantIdOf(req));
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const body = createSchema.parse(req.body || {});
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, error: 'Expiry must be in the future' });
    }
    const created = await createCompanyApiKey({
      tenantId: tenantIdOf(req),
      name: body.name,
      scopes: body.scopes,
      rateLimitPerMinute: body.rateLimitPerMinute ?? 120,
      ipAllowlist: body.ipAllowlist ?? [],
      expiresAt,
      createdById: req.user!.id,
    });
    await auditLog(tenantIdOf(req), req.user!.id, 'API_KEY_CREATED', 'ApiKey', created.record.id, undefined, {
      name: created.record.name,
      keyPrefix: created.record.keyPrefix,
      scopes: created.record.scopes,
    }, req.ip);
    res.status(201).json({ success: true, data: created.record, apiKey: created.apiKey });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:keyId/revoke', async (req: AuthRequest, res: Response) => {
  try {
    const data = await revokeCompanyApiKey(tenantIdOf(req), req.params.keyId);
    await auditLog(tenantIdOf(req), req.user!.id, 'API_KEY_REVOKED', 'ApiKey', data.id, undefined, {
      name: data.name,
      keyPrefix: data.keyPrefix,
    }, req.ip);
    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/:keyId/rotate', async (req: AuthRequest, res: Response) => {
  try {
    const rotated = await rotateCompanyApiKey(tenantIdOf(req), req.params.keyId, req.user!.id);
    await auditLog(tenantIdOf(req), req.user!.id, 'API_KEY_ROTATED', 'ApiKey', rotated.record.id, {
      previousId: rotated.previousId,
    }, {
      name: rotated.record.name,
      keyPrefix: rotated.record.keyPrefix,
      scopes: rotated.record.scopes,
    }, req.ip);
    res.json({ success: true, data: rotated.record, apiKey: rotated.apiKey });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;

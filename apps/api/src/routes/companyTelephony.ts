import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/superAdmin';
import { auditLog } from '../middleware/audit';
import {
  createSandboxLead,
  createTelephonyIntegration,
  listTelephonyIntegrations,
  revokeTelephonyIntegration,
  rotateTelephonyIntegration,
  sendTelephonyTestLead,
} from '../services/telephonyIntegration';

const router = Router({ mergeParams: true });
router.use(authenticate);
router.use(requireSuperAdmin);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).default('Telephony'),
  rateLimitPerMinute: z.number().int().min(1).max(10000).optional(),
  ipAllowlist: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});

function tenantIdOf(req: AuthRequest) {
  return String(req.params.tenantId || '');
}

function sendError(res: Response, error: unknown, fallback: string) {
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : fallback;
  if (status >= 400 && status < 500) return res.status(status).json({ success: false, error: message });
  console.error(fallback, error instanceof Error ? error.message : error);
  return res.status(500).json({ success: false, error: fallback });
}

async function companyExists(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  return Boolean(tenant);
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await companyExists(tenantIdOf(req)))) return res.status(404).json({ success: false, error: 'Company not found' });
    res.json({ success: true, data: await listTelephonyIntegrations(tenantIdOf(req)) });
  } catch (error) {
    sendError(res, error, 'Failed to load telephony connections');
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await companyExists(tenantIdOf(req)))) return res.status(404).json({ success: false, error: 'Company not found' });
    const body = createSchema.parse(req.body || {});
    const created = await createTelephonyIntegration({
      tenantId: tenantIdOf(req),
      name: body.name,
      ipAllowlist: body.ipAllowlist ?? [],
      rateLimitPerMinute: body.rateLimitPerMinute ?? 120,
      createdById: req.user!.id,
    });
    await auditLog(tenantIdOf(req), req.user!.id, 'TELEPHONY_INTEGRATION_CREATED', 'TelephonyIntegration', created.record.id, undefined, {
      name: created.record.name,
      keyPrefix: created.record.keyPrefix,
    }, req.ip);
    res.status(201).json({ success: true, data: created.record, integrationKey: created.integrationKey });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid connection' });
    sendError(res, error, 'Failed to create the telephony connection');
  }
});

router.post('/:integrationId/rotate', async (req: AuthRequest, res: Response) => {
  try {
    const rotated = await rotateTelephonyIntegration(tenantIdOf(req), String(req.params.integrationId || ''));
    await auditLog(tenantIdOf(req), req.user!.id, 'TELEPHONY_INTEGRATION_ROTATED', 'TelephonyIntegration', rotated.record.id, undefined, {
      keyPrefix: rotated.record.keyPrefix,
    }, req.ip);
    res.json({ success: true, data: rotated.record, integrationKey: rotated.integrationKey });
  } catch (error) {
    sendError(res, error, 'Failed to rotate the telephony connection');
  }
});

router.post('/:integrationId/revoke', async (req: AuthRequest, res: Response) => {
  try {
    const revoked = await revokeTelephonyIntegration(tenantIdOf(req), String(req.params.integrationId || ''));
    await auditLog(tenantIdOf(req), req.user!.id, 'TELEPHONY_INTEGRATION_REVOKED', 'TelephonyIntegration', revoked.id, undefined, {
      keyPrefix: revoked.keyPrefix,
    }, req.ip);
    res.json({ success: true, data: revoked });
  } catch (error) {
    sendError(res, error, 'Failed to revoke the telephony connection');
  }
});

router.post('/test-lead', async (req: AuthRequest, res: Response) => {
  try {
    if (!(await companyExists(tenantIdOf(req)))) return res.status(404).json({ success: false, error: 'Company not found' });
    const style = z.object({ style: z.enum(['header', 'url-token']) }).parse(req.body || {}).style;
    const result = style === 'url-token'
      ? await sendTelephonyTestLead(tenantIdOf(req), req.user!.id)
      : await createSandboxLead(tenantIdOf(req), req.user!.id);
    const lead = await prisma.lead.findFirst({
      where: { id: result.leadId, tenantId: tenantIdOf(req) },
      select: { id: true, leadNumber: true, tenantId: true },
    });
    if (!lead || lead.tenantId !== tenantIdOf(req)) {
      return res.status(500).json({ success: false, error: 'The test lead was not created in this company.' });
    }
    res.status(201).json({ success: true, data: { leadId: lead.id, leadNumber: lead.leadNumber } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Choose a connection style.' });
    sendError(res, error, 'Failed to send the test lead');
  }
});

export default router;

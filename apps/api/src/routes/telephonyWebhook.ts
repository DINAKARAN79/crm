import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { hashApiKey, consumeApiKeyRateLimit, requestIp } from '../services/apiKeys';
import { ingestTelephonyIntegration } from '../services/telephonyIntegration';

const router = Router({ mergeParams: true });

router.post('/:integrationKey/lead', async (req, res: Response) => {
  const rawKey = String(req.params.integrationKey || '');
  if (!rawKey.startsWith('tel_') || rawKey.length < 20) {
    return res.status(401).json({ success: false, error: 'Invalid or revoked integration key' });
  }
  try {
    const integration = await prisma.telephonyIntegration.findUnique({ where: { keyHash: hashApiKey(rawKey) } });
    if (!integration || integration.revokedAt) {
      return res.status(401).json({ success: false, error: 'Invalid or revoked integration key' });
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: integration.tenantId },
      select: { id: true, isActive: true, companyStartDate: true, companyExpiryDate: true },
    });
    if (!tenant || !tenant.isActive) return res.status(403).json({ success: false, error: 'Company is inactive. Contact Super Admin.' });
    const now = new Date();
    if (tenant.companyStartDate && now < tenant.companyStartDate) {
      return res.status(403).json({ success: false, error: 'Company has not started yet.' });
    }
    if (tenant.companyExpiryDate && now > tenant.companyExpiryDate) {
      return res.status(403).json({ success: false, error: 'Company subscription has expired. Contact Super Admin.' });
    }
    if (integration.ipAllowlist.length > 0 && !integration.ipAllowlist.includes(requestIp(req))) {
      return res.status(403).json({ success: false, error: 'Request IP is not allowed for this connection' });
    }
    if (!consumeApiKeyRateLimit(integration.id, integration.rateLimitPerMinute)) {
      return res.status(429).json({ success: false, error: 'Integration rate limit exceeded' });
    }
    const result = await ingestTelephonyIntegration(integration, req.body);
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });
    await prisma.telephonyIntegration.update({
      where: { id: integration.id },
      data: { lastUsedAt: new Date() },
    });
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      leadNumber: result.leadNumber,
    });
  } catch (error) {
    console.error('Telephony webhook error:', error instanceof Error ? error.message : 'failed');
    return res.status(500).json({ success: false, error: 'Failed to accept the call' });
  }
});

export default router;

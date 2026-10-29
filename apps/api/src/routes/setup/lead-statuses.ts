import { Router, Response, NextFunction } from 'express';
import { prisma } from '@dct-crm/db';
import { LEAD_STATUS_DEFINITIONS } from '@dct-crm/shared';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { getLeadStatusSettings } from '../../services/leadStatusSettings';

const router = Router();
router.use(authenticate);

function requireAdministrator(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.isSuperAdmin && !req.user?.isAdmin) {
    return res.status(403).json({ success: false, error: 'Administrator access is required' });
  }
  next();
}

const leadStatusesSchema = z.object({
  statuses: z.array(z.object({
    statusId: z.enum(['1', '2', '3', '4', '5', '6', '7']),
    label: z.string().trim().min(1, 'Status label is required').max(80),
    enabled: z.boolean(),
  })).length(LEAD_STATUS_DEFINITIONS.length)
    .superRefine((statuses, context) => {
      const seen = new Set<string>();
      statuses.forEach((status, index) => {
        if (seen.has(status.statusId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'statusId'],
            message: `Duplicate status ID ${status.statusId}`,
          });
        }
        seen.add(status.statusId);
      });
    }),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const statuses = await getLeadStatusSettings(req.tenantId!);
    res.json({ success: true, data: statuses });
  } catch (error) {
    console.error('Get lead status settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead status settings' });
  }
});

router.put('/', requirePermission('USER_UPDATE'), requireAdministrator, async (req: AuthRequest, res: Response) => {
  const parsed = leadStatusesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid lead status settings',
    });
  }

  const tenantId = req.tenantId!;
  try {
    await getLeadStatusSettings(tenantId);
    const statuses = await prisma.$transaction(async (tx) => {
      for (const status of parsed.data.statuses) {
        if (!status.enabled) {
          const definition = LEAD_STATUS_DEFINITIONS.find((item) => item.id === status.statusId);
          if (!definition) {
            throw new Error(`Unknown status ID ${status.statusId}`);
          }
          const leadsUsingStatus = await tx.lead.count({
            where: { tenantId, status: definition.value },
          });
          if (leadsUsingStatus > 0) {
            const error = new Error(`Status ${status.statusId} cannot be disabled while leads are using it`);
            Object.assign(error, { statusCode: 409 });
            throw error;
          }
        }

        await tx.leadStatusSetting.upsert({
          where: { tenantId_statusId: { tenantId, statusId: Number(status.statusId) } },
          create: {
            tenantId,
            statusId: Number(status.statusId),
            label: status.label,
            enabled: status.enabled,
          },
          update: { label: status.label, enabled: status.enabled },
        });
      }

      return tx.leadStatusSetting.findMany({
        where: { tenantId },
        orderBy: { statusId: 'asc' },
      });
    });
    res.json({
      success: true,
      data: statuses.map((status) => ({
        statusId: String(status.statusId),
        status: LEAD_STATUS_DEFINITIONS.find((item) => Number(item.id) === status.statusId)?.value,
        label: status.label,
        enabled: status.enabled,
      })),
    });
  } catch (error) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error
      ? Number(error.statusCode)
      : 500;
    if (statusCode === 500) console.error('Update lead status settings error:', error);
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save lead status settings',
    });
  }
});

export default router;

import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';

const router = Router();
router.use(authenticate);
router.use(requirePermission('USER_UPDATE'));

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  accessUrl: z.string().url().optional().or(z.literal('')),
  fiscalYear: z.object({
    type: z.enum(['standard', 'custom']),
    startsIn: z.string().min(1),
  }).optional(),
  businessHours: z.object({
    weekStartsOn: z.string().min(1),
    timezone: z.string().min(1),
    days: z.array(z.string()),
    start: z.string().min(1),
    end: z.string().min(1),
  }).optional(),
  holidays: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    date: z.string().min(1),
  })).optional(),
  currency: z.object({
    code: z.string().min(1),
    symbol: z.string().min(1),
    separator: z.enum(['en-IN', 'en-US', 'de-DE']),
    decimals: z.number().int().min(0).max(4),
  }).optional(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: {
        id: true,
        name: true,
        companyCode: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        city: true,
        state: true,
        country: true,
        timezone: true,
        currency: true,
        logo: true,
        settings: true,
      },
    });

    if (!tenant) return res.status(404).json({ success: false, error: 'Company not found' });
    res.json({ success: true, data: tenant });
  } catch (error) {
    console.error('Get company settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch company settings' });
  }
});

router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = settingsSchema.parse(req.body);
    const current = await prisma.tenant.findUnique({
      where: { id: req.tenantId! },
      select: { settings: true },
    });

    if (!current) return res.status(404).json({ success: false, error: 'Company not found' });

    const currentSettings = current.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
      ? current.settings as Record<string, unknown>
      : {};
    const settings = { ...currentSettings, ...data };

    const tenant = await prisma.tenant.update({
      where: { id: req.tenantId! },
      data: {
        name: data.name,
        settings,
        timezone: data.businessHours?.timezone,
        currency: data.currency?.code,
      },
      select: { id: true, name: true, companyCode: true, settings: true, timezone: true, currency: true },
    });

    res.json({ success: true, data: tenant });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid settings' });
    }
    console.error('Update company settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update company settings' });
  }
});

export default router;

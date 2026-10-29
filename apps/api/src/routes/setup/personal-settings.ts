import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const settingsSchema = z.object({
  language: z.string().min(1),
  countryLocale: z.string().min(1),
  dateFormat: z.string().min(1),
  timeFormat: z.enum(['12 Hours', '24 Hours']),
  timeZone: z.string().min(1),
  distanceUnit: z.enum(['Kilometers (km)', 'Miles (mi)']),
  numberFormat: z.string().min(1),
  nameFormat: z.string().min(1),
  sortOrder: z.string().min(1),
  accessibility: z.object({
    font: z.enum(['Modern Sans', 'Humanist Sans', 'Readable Serif']),
    fontSize: z.number().int().min(0).max(3),
    spacing: z.enum(['Normal', 'Wide', 'Wider']),
    magnifyText: z.boolean(),
    motion: z.enum(['Minimum', 'Default', 'System Settings']),
    switchLabels: z.boolean(),
    strikethroughDisabled: z.boolean(),
    mandatoryFieldsOnly: z.boolean(),
    mandatoryFieldDisplay: z.enum(['Red Accent Line (Default)', 'Asterisk', 'Bold Label']),
    errorColor: z.string().min(1),
    errorIcon: z.boolean(),
    flashScreen: z.boolean(),
    ariaLandmark: z.boolean(),
    keyboardShortcuts: z.boolean(),
    voiceAssistant: z.boolean(),
    readingFocus: z.boolean(),
    underlineLinks: z.boolean(),
    standardNavigation: z.boolean(),
  }),
});

const defaults = {
  language: 'English (United States)',
  countryLocale: 'India',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12 Hours',
  timeZone: 'Asia/Kolkata',
  distanceUnit: 'Kilometers (km)',
  numberFormat: '1,23,456.789',
  nameFormat: 'Salutation, First Name, Last Name',
  sortOrder: 'First Name, Last Name',
  accessibility: {
    font: 'Modern Sans', fontSize: 1, spacing: 'Normal', magnifyText: false,
    motion: 'Default', switchLabels: false, strikethroughDisabled: false,
    mandatoryFieldsOnly: false, mandatoryFieldDisplay: 'Red Accent Line (Default)',
    errorColor: '#ff5a5f', errorIcon: false, flashScreen: false, ariaLandmark: false,
    keyboardShortcuts: false, voiceAssistant: false, readingFocus: false,
    underlineLinks: false, standardNavigation: false,
  },
};

async function readSettings(tenantId: string, userId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = tenant?.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings)
    ? tenant.settings as Record<string, any>
    : {};
  const stored = settings.personalPreferences?.[userId] || {};
  const storedAccessibility = stored.accessibility || {};
  const migratedFont = storedAccessibility.font === 'Zoho Puvi' || storedAccessibility.font === 'Roboto'
    ? 'Modern Sans'
    : storedAccessibility.font;
  return {
    ...defaults,
    ...stored,
    accessibility: {
      ...defaults.accessibility,
      ...storedAccessibility,
      font: migratedFont || defaults.accessibility.font,
    },
  };
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, profile: { select: { id: true, name: true } }, roles: { include: { role: { select: { name: true } } } } },
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: { user, settings: await readSettings(req.tenantId!, req.user!.id) } });
  } catch (error) {
    console.error('Get personal settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch personal settings' });
  }
});

router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = settingsSchema.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! }, select: { settings: true } });
    if (!tenant) return res.status(404).json({ success: false, error: 'Company not found' });
    const settings = tenant.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings) ? tenant.settings as Record<string, any> : {};
    const personalPreferences = { ...(settings.personalPreferences || {}), [req.user!.id]: data };
    await prisma.tenant.update({ where: { id: req.tenantId! }, data: { settings: { ...settings, personalPreferences } } });
    res.json({ success: true, data });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues[0]?.message || 'Invalid settings' });
    console.error('Update personal settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to update personal settings' });
  }
});

export default router;

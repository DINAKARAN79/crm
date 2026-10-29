import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('PERMISSION_SET_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const { module, search, limit = 100, page = 1 } = req.query;
    const where: any = { isActive: true };

    if (module) where.module = String(module);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { label: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const take = Math.min(Number(limit) || 100, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [permissions, total] = await Promise.all([
      prisma.permission.findMany({
        where,
        orderBy: [{ module: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      prisma.permission.count({ where }),
    ]);

    res.json({
      success: true,
      data: permissions,
      pagination: {
        page: Math.max(Number(page) || 1, 1),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error('Get permission catalog error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch permissions' });
  }
});

router.get('/modules', requirePermission('PERMISSION_SET_READ'), async (_req, res) => {
  try {
    const modules = await prisma.permission.findMany({
      where: { isActive: true },
      distinct: ['module'],
      select: { module: true },
      orderBy: { module: 'asc' },
    });

    res.json({ success: true, data: modules.map(({ module }) => module) });
  } catch (error) {
    console.error('Get permission modules error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch permission modules' });
  }
});

export { router as permissionCatalogRoutes };

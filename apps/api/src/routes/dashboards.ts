import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { loadEffectivePermissions } from '../middleware/permissions';
import { canAccessReportForUser, runReport } from '../reports/report-engine';
import { auditLog } from '../middleware/audit';
import PDFDocument from 'pdfkit';
import { applyScope, getScopeClause } from '../services/recordAccess';
import { EffectivePermissionService } from '../services/effectivePermissions';
import { getLeadStatusSettings } from '../services/leadStatusSettings';
import { leadStatusIdFromValue } from '@dct-crm/shared';

const router = Router();

router.use(authenticate);
router.use(loadEffectivePermissions);

router.get('/folders', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { view = 'all', search } = req.query;
    const allCompanies = !req.impersonation && req.user!.isSuperAdmin && req.query.scope === 'allCompanies';
    const where: any = allCompanies ? {} : { tenantId: req.tenantId! };
    if (!allCompanies && view === 'createdByMe') where.createdBy = req.user!.id;
    if (!allCompanies && view === 'favorites') {
      where.favorites = { some: { userId: req.user!.id } };
    }
    if (!allCompanies && view === 'sharedWithMe') {
      const roleIds = await getRoleIds(req.user!.id);
      where.dashboards = {
        some: {
          OR: [
            { shares: { some: { userId: req.user!.id } } },
            ...(roleIds.length ? [{ shares: { some: { roleId: { in: roleIds } } } }] : []),
            ...(roleIds.length ? [{ shares: { some: { teamId: { in: roleIds } } } }] : []),
          ],
        },
      };
    }
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }
    const folders = await prisma.dashboardFolder.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        tenant: { select: { id: true, name: true } },
        favorites: { where: { userId: req.user!.id }, select: { id: true } },
        _count: { select: { dashboards: true } },
      },
    });
    const folderCreatorIds = Array.from(new Set(folders.map((folder) => folder.createdBy).filter(Boolean))) as string[];
    const folderCreators = folderCreatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: folderCreatorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    res.json({
      success: true,
      data: folders.map(({ favorites, ...folder }) => {
        const creator = folderCreators.find((candidate) => candidate.id === folder.createdBy);
        return {
          ...folder,
          createdByName: creator
            ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || creator.email
            : null,
          isFavorite: favorites.length > 0,
        };
      }),
    });
  } catch (error) {
    console.error('Get dashboard folders error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard folders' });
  }
});

router.put('/folders/:id', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const name = z.string().min(1).parse(req.body?.name).trim();
    const folder = await prisma.dashboardFolder.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId! },
      data: { name },
    });
    if (!folder.count) return res.status(404).json({ success: false, error: 'Folder not found' });
    res.json({
      success: true,
      data: await prisma.dashboardFolder.findUnique({
        where: { id: req.params.id },
      }),
    });
  } catch (error: any) {
    const message =
      error?.code === 'P2002'
        ? 'A dashboard folder with this name already exists'
        : 'Failed to rename dashboard folder';
    res.status(error?.code === 'P2002' ? 409 : 400).json({ success: false, error: message });
  }
});

router.delete('/folders/:id', authorize('Dashboard', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.dashboard.updateMany({
      where: { tenantId: req.tenantId!, folderId: req.params.id },
      data: { folderId: null },
    });
    const deleted = await prisma.dashboardFolder.deleteMany({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!deleted.count) return res.status(404).json({ success: false, error: 'Folder not found' });
    res.json({ success: true, data: null });
  } catch {
    res.status(400).json({ success: false, error: 'Failed to delete dashboard folder' });
  }
});

router.post('/folders/:id/favorite', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const folder = await prisma.dashboardFolder.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!folder) return res.status(404).json({ success: false, error: 'Folder not found' });
    const favorite = await prisma.dashboardFolderFavorite.upsert({
      where: {
        folderId_userId: { folderId: folder.id, userId: req.user!.id },
      },
      create: {
        id: randomUUID(),
        tenantId: req.tenantId!,
        folderId: folder.id,
        userId: req.user!.id,
      },
      update: {},
    });
    res.json({ success: true, data: { isFavorite: true, favorite } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to favorite dashboard folder' });
  }
});

router.delete('/folders/:id/favorite', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  await prisma.dashboardFolderFavorite.deleteMany({
    where: {
      folderId: req.params.id,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    },
  });
  res.json({ success: true, data: { isFavorite: false } });
});

router.post('/folders', authorize('Dashboard', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const name = z.string().min(1).parse(req.body?.name).trim();
    const folder = await prisma.dashboardFolder.create({
      data: { tenantId: req.tenantId!, createdBy: req.user!.id, name },
      select: { id: true, name: true, description: true, tenantId: true },
    });
    res.status(201).json({ success: true, data: folder });
  } catch (error: any) {
    const message =
      error?.code === 'P2002'
        ? 'A dashboard folder with this name already exists'
        : 'Failed to create dashboard folder';
    res.status(error?.code === 'P2002' ? 409 : 400).json({ success: false, error: message });
  }
});

const widgetSchema = z.object({
  id: z.string(),
  type: z.enum([
    'kpi',
    'metric',
    'chart',
    'table',
    'funnel',
    'leaderboard',
    'trend',
    'gauge',
    'text',
    'image',
    'column',
    'line',
    'area',
    'pie',
    'donut',
    'horizontalBar',
    'stackedBar',
    'stackedColumn',
    'summary',
    'progress',
    'list',
    'ranking',
    'custom',
  ]),
  title: z.string(),
  metric: z.string().optional(),
  reportId: z.string().optional(),
  config: z.record(z.any()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
});

const dashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().nullable().optional(),
  filters: z
    .array(
      z.object({
        field: z.string().min(1),
        operator: z.string().min(1),
        value: z.any(),
      }),
    )
    .optional(),
  layout: z.array(widgetSchema),
  layoutConfig: z
    .object({
      gridColumns: z.union([z.literal(9), z.literal(12)]),
      spacing: z.enum(['compact', 'normal', 'wide']),
      snapToGrid: z.boolean(),
      autoArrange: z.boolean(),
      showGridLines: z.boolean(),
    })
    .optional(),
  isDefault: z.boolean().optional(),
  visibility: z.enum(['PRIVATE', 'SHARED', 'PUBLIC']).optional(),
  refreshInterval: z.enum(['MANUAL', '5_MINUTES', '15_MINUTES', '30_MINUTES', '1_HOUR']).optional(),
  autoRefreshWhileEditing: z.boolean().optional(),
});

const updateDashboardSchema = dashboardSchema.partial();
const MAX_DASHBOARD_WIDGETS = 20;

const shareSchema = z.object({
  userId: z.string().optional(),
  roleId: z.string().optional(),
  teamId: z.string().optional(),
  accessLevel: z.enum(['VIEW', 'EDIT', 'SHARE', 'DELETE', 'MANAGE']).default('VIEW'),
});

async function getRoleIds(userId: string) {
  return (
    await prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    })
  ).map((role) => role.roleId);
}

async function canAccessDashboard(
  dashboard: any,
  req: AuthRequest,
  minimum: 'VIEW' | 'EDIT' | 'SHARE' | 'DELETE' | 'MANAGE' = 'VIEW',
) {
  if (!dashboard) return false;
  if (req.user!.isSuperAdmin) return true;
  if (dashboard.tenantId !== req.tenantId!) return false;
  if (dashboard.ownerId === req.user!.id || dashboard.createdBy === req.user!.id) return true;
  if (minimum === 'VIEW') {
    // Pre-merge behavior: the tenant's default dashboard was readable by every
    // DASHBOARD_READ user. PUBLIC keeps friend's sharing model; isDefault
    // preserves the existing home-dashboard read access (edit still owner/share only).
    if (dashboard.visibility === 'PUBLIC' || dashboard.isDefault) return true;
  }
  const roleIds = await getRoleIds(req.user!.id);
  const share = await prisma.dashboardShare.findFirst({
    where: {
      dashboardId: dashboard.id,
      tenantId: req.tenantId!,
      OR: [
        { userId: req.user!.id },
        ...(roleIds.length ? [{ roleId: { in: roleIds } }] : []),
        ...(roleIds.length ? [{ teamId: { in: roleIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!share) return false;
  const rank = { VIEW: 1, EDIT: 2, SHARE: 3, DELETE: 4, MANAGE: 5 };
  return rank[share.accessLevel as keyof typeof rank] >= rank[minimum];
}

async function getDashboardForRequest(id: string, req: AuthRequest) {
  return prisma.dashboard.findFirst({
    where: { id, tenantId: req.tenantId! },
    include: {
      folder: { select: { id: true, name: true } },
      favorites: { where: { userId: req.user!.id }, select: { id: true } },
      subscriptions: { where: { userId: req.user!.id }, select: { id: true } },
    },
  });
}

router.get('/', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      isDefault,
      search,
      folderId,
      view = 'recent',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;
    const allCompanies = !req.impersonation && req.user!.isSuperAdmin && req.query.scope === 'allCompanies';
    const tenantId = allCompanies ? undefined : req.tenantId!;
    const viewingCompanyAsSuperAdmin = req.user!.isSuperAdmin && tenantId !== req.user!.tenantId;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = allCompanies ? {} : { tenantId };
    const roleIds = await getRoleIds(req.user!.id);
    const sharedIds = (
      await prisma.dashboardShare.findMany({
        where: {
          tenantId,
          OR: [
            { userId: req.user!.id },
            ...(roleIds.length ? [{ roleId: { in: roleIds } }] : []),
            ...(roleIds.length ? [{ teamId: { in: roleIds } }] : []),
          ],
        },
        select: { dashboardId: true },
      })
    ).map((share) => share.dashboardId);
    const accessible = [
      { ownerId: req.user!.id },
      { createdBy: req.user!.id },
      { visibility: 'PUBLIC' },
      { isDefault: true },
      ...(sharedIds.length ? [{ id: { in: sharedIds } }] : []),
    ];
    if (allCompanies || viewingCompanyAsSuperAdmin) {
      // The company setup-home builder needs the selected company's own widgets.
    } else if (view === 'createdByMe' || view === 'my') where.OR = [{ ownerId: req.user!.id }, { createdBy: req.user!.id }];
    else if (view === 'private') {
      where.OR = [{ ownerId: req.user!.id }, { createdBy: req.user!.id }];
      where.visibility = 'PRIVATE';
    }
    else if (view === 'shared') where.OR = [{ id: { in: sharedIds } }];
    else if (view === 'favorites') where.favorites = { some: { userId: req.user!.id } };
    else where.OR = accessible;
    if (isDefault !== undefined) where.isDefault = isDefault === 'true';
    if (folderId) where.folderId = folderId as string;
    if (search) {
      const [matchingFolders, matchingUsers] = await Promise.all([
        prisma.dashboardFolder.findMany({
          where: {
              tenantId,
            OR: [
              { name: { contains: search as string, mode: 'insensitive' } },
              { description: { contains: search as string, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        prisma.user.findMany({
          where: {
              tenantId,
            OR: [
              { firstName: { contains: search as string, mode: 'insensitive' } },
              { lastName: { contains: search as string, mode: 'insensitive' } },
              { email: { contains: search as string, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
      ]);
      const searchWhere = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
        ...(matchingFolders.length ? [{ folderId: { in: matchingFolders.map((folder) => folder.id) } }] : []),
        ...(matchingUsers.length
          ? [
              {
                OR: [
                  { createdBy: { in: matchingUsers.map((user) => user.id) } },
                  { ownerId: { in: matchingUsers.map((user) => user.id) } },
                ],
              },
            ]
          : []),
      ];
      where.AND = [{ OR: searchWhere }, ...(where.OR ? [{ OR: where.OR }] : [])];
      delete where.OR;
    }

    // Whitelist sort inputs: arbitrary query values previously reached Prisma's
    // orderBy and produced a 500 instead of a graceful default.
    const sortable = new Set(['createdAt', 'updatedAt', 'name', 'isDefault']);
    const sortField = typeof sortBy === 'string' && sortable.has(sortBy) ? sortBy : 'createdAt';
    const sortDirection: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';

    const [dashboards, total] = await Promise.all([
      prisma.dashboard.findMany({
        where,
        include: {
          folder: { select: { id: true, name: true } },
          tenant: { select: { id: true, name: true } },
          favorites: { where: { userId: req.user!.id }, select: { id: true } },
          subscriptions: { where: { userId: req.user!.id }, select: { id: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortField]: sortDirection },
      }),
      prisma.dashboard.count({ where }),
    ]);

    // Human-facing rows must show names, never raw user ids (createdBy/ownerId
    // have no Prisma relation on Dashboard, so resolve them in one extra query).
    const creatorIds = Array.from(
      new Set(
        dashboards.flatMap((dashboard: any) => [dashboard.createdBy, dashboard.ownerId].filter(Boolean)),
      ),
    ) as string[];
    const creatorUsers = creatorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userLabel = (id: string | null | undefined) => {
      if (!id) return null;
      const user = creatorUsers.find((candidate) => candidate.id === id);
      if (!user) return null;
      return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    };

    res.json({
      success: true,
      data: dashboards.map((dashboard: any) => ({
        ...dashboard,
        createdByName: userLabel(dashboard.createdBy),
        ownerName: userLabel(dashboard.ownerId),
        isFavorite: dashboard.favorites.length > 0,
        isSubscribed: dashboard.subscriptions.length > 0,
        favorites: undefined,
        subscriptions: undefined,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get dashboards error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboards' });
  }
});

for (const shortcut of ['recent', 'my', 'private', 'shared', 'all']) {
  router.get(`/${shortcut}`, authorize('Dashboard', 'read'), (req: AuthRequest, res: Response) => {
    const view = shortcut === 'my' ? 'createdByMe' : shortcut;
    const query = new URLSearchParams({
      ...(req.query as Record<string, string>),
      view,
    }).toString();
    return res.redirect(307, `/api/dashboards?${query}`);
  });
}

router.get('/default', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { tenantId: req.tenantId!, isDefault: true },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'No default dashboard found' });
    }
    if (!(await canAccessDashboard(dashboard, req)))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this dashboard',
      });

    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Get default dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch default dashboard' });
  }
});

router.get('/:id', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await getDashboardForRequest(req.params.id, req);

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    if (!(await canAccessDashboard(dashboard, req))) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this dashboard',
      });
    }

    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
});

router.post('/', authorize('Dashboard', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = dashboardSchema.parse(req.body);
    if (data.layout.length > MAX_DASHBOARD_WIDGETS) {
      return res.status(400).json({
        success: false,
        error: `Maximum of ${MAX_DASHBOARD_WIDGETS} dashboard components reached.`,
      });
    }

    // Folder must belong to the caller's tenant: an unvalidated folderId would
    // let a dashboard be filed into another tenant's folder (FK accepts it).
    if (data.folderId) {
      const folder = await prisma.dashboardFolder.findFirst({
        where: { id: data.folderId, tenantId: req.tenantId! },
        select: { id: true },
      });
      if (!folder) return res.status(400).json({ success: false, error: 'Target folder was not found' });
    }

    if (data.isDefault) {
      await prisma.dashboard.updateMany({
        where: { tenantId: req.tenantId!, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: req.tenantId!,
        createdBy: req.user!.id,
        ownerId: req.user!.id,
        name: data.name,
        description: data.description,
        folderId: data.folderId,
        filters: data.filters,
        layout: data.layout,
        visibility: data.visibility || 'PRIVATE',
        refreshInterval: data.refreshInterval || 'MANUAL',
        autoRefreshWhileEditing: data.autoRefreshWhileEditing || false,
        isDefault: data.isDefault || false,
      },
    });

    await auditLog(req.tenantId!, req.user!.id, 'CREATE', 'Dashboard', dashboard.id, null, { name: data.name });

    res.status(201).json({ success: true, data: dashboard });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (error.code === 'P2002') {
      // @@unique([tenantId, name]) — surface as 409 like clone does, not a 500.
      return res.status(409).json({ success: false, error: 'A dashboard with this name already exists' });
    }
    console.error('Create dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to create dashboard' });
  }
});

router.put('/:id', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingDashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingDashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    if (!(await canAccessDashboard(existingDashboard, req, 'EDIT')))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to edit this dashboard',
      });

    const data = updateDashboardSchema.parse(req.body);
    if (Array.isArray(data.layout) && data.layout.length > MAX_DASHBOARD_WIDGETS) {
      return res.status(400).json({
        success: false,
        error: `Maximum of ${MAX_DASHBOARD_WIDGETS} dashboard components reached.`,
      });
    }
    if (data.folderId) {
      const folder = await prisma.dashboardFolder.findFirst({
        where: { id: data.folderId, tenantId: req.tenantId! },
        select: { id: true },
      });
      if (!folder) return res.status(400).json({ success: false, error: 'Target folder was not found' });
    }

    if (data.isDefault) {
      await prisma.dashboard.updateMany({
        where: { tenantId: req.tenantId!, isDefault: true, id: { not: req.params.id } },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.update({
      where: { id: req.params.id },
      data,
    });

    await auditLog(req.tenantId!, req.user!.id, 'UPDATE', 'Dashboard', dashboard.id, existingDashboard, data);
    if (Array.isArray(data.layout)) {
      const previousLayout = Array.isArray(existingDashboard.layout) ? (existingDashboard.layout as any[]) : [];
      const nextLayout = data.layout as any[];
      const previousIds = new Set(previousLayout.map((widget) => widget.id));
      const nextIds = new Set(nextLayout.map((widget) => widget.id));
      for (const widget of nextLayout) {
        const previous = previousLayout.find((item) => item.id === widget.id);
        await auditLog(
          req.tenantId!,
          req.user!.id,
          previous ? 'WIDGET_EDIT' : 'WIDGET_ADD',
          'Dashboard',
          dashboard.id,
          previous || null,
          widget,
        );
      }
      for (const widget of previousLayout) {
        if (!nextIds.has(widget.id))
          await auditLog(req.tenantId!, req.user!.id, 'WIDGET_DELETE', 'Dashboard', dashboard.id, widget, null);
      }
      void previousIds;
    }

    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to update dashboard' });
  }
});

router.post('/:id/widgets', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!dashboard || !(await canAccessDashboard(dashboard, req, 'EDIT')))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to edit this dashboard',
      });
    const widget = widgetSchema.parse(req.body);
    const layout = Array.isArray(dashboard.layout) ? (dashboard.layout as any[]) : [];
    if (layout.some((item) => item.id === widget.id))
      return res.status(409).json({
        success: false,
        error: 'A widget with this id already exists',
      });
    if (layout.length >= MAX_DASHBOARD_WIDGETS)
      return res.status(400).json({
        success: false,
        error: `Maximum of ${MAX_DASHBOARD_WIDGETS} dashboard components reached.`,
      });
    await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: { layout: [...layout, widget] },
    });
    await auditLog(req.tenantId!, req.user!.id, 'WIDGET_ADD', 'Dashboard', dashboard.id, null, widget);
    res.status(201).json({ success: true, data: widget });
  } catch (error: any) {
    if (error.name === 'ZodError')
      return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Failed to add dashboard widget' });
  }
});

router.put('/:id/widgets/:widgetId', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!dashboard || !(await canAccessDashboard(dashboard, req, 'EDIT')))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to edit this dashboard',
      });
    const incoming = widgetSchema.parse({
      ...req.body,
      id: req.params.widgetId,
    });
    const layout = Array.isArray(dashboard.layout) ? (dashboard.layout as any[]) : [];
    const index = layout.findIndex((item) => item.id === req.params.widgetId);
    if (index < 0) return res.status(404).json({ success: false, error: 'Widget not found' });
    const previous = layout[index];
    layout[index] = incoming;
    await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: { layout },
    });
    await auditLog(req.tenantId!, req.user!.id, 'WIDGET_EDIT', 'Dashboard', dashboard.id, previous, incoming);
    res.json({ success: true, data: incoming });
  } catch (error: any) {
    if (error.name === 'ZodError')
      return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Failed to update dashboard widget' });
  }
});

router.delete('/:id/widgets/:widgetId', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!dashboard || !(await canAccessDashboard(dashboard, req, 'EDIT')))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to edit this dashboard',
      });
    const layout = Array.isArray(dashboard.layout) ? (dashboard.layout as any[]) : [];
    const widget = layout.find((item) => item.id === req.params.widgetId);
    if (!widget) return res.status(404).json({ success: false, error: 'Widget not found' });
    await prisma.dashboard.update({
      where: { id: dashboard.id },
      data: {
        layout: layout.filter((item) => item.id !== req.params.widgetId),
      },
    });
    await auditLog(req.tenantId!, req.user!.id, 'WIDGET_DELETE', 'Dashboard', dashboard.id, widget, null);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete dashboard widget' });
  }
});

router.delete('/:id', authorize('Dashboard', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    if (!(await canAccessDashboard(dashboard, req, 'DELETE')))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this dashboard',
      });

    if (dashboard.isDefault) {
      return res.status(400).json({ success: false, error: 'Cannot delete default dashboard' });
    }

    await prisma.dashboard.delete({ where: { id: req.params.id } });

    await auditLog(req.tenantId!, req.user!.id, 'DELETE', 'Dashboard', req.params.id, dashboard, null);

    res.json({ success: true, message: 'Dashboard deleted successfully' });
  } catch (error) {
    console.error('Delete dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete dashboard' });
  }
});

router.post('/:id/clone', authorize('Dashboard', 'create'), async (req: AuthRequest, res: Response) => {
  const source = await getDashboardForRequest(req.params.id, req);
  if (!source || !(await canAccessDashboard(source, req)))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to clone this dashboard',
    });
  const name = String(req.body?.name || `${source.name} Copy`).trim();
  try {
    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: req.tenantId!,
        createdBy: req.user!.id,
        ownerId: req.user!.id,
        name,
        description: source.description,
        folderId: source.folderId,
        filters: source.filters === null ? undefined : (source.filters as any),
        layout: source.layout as any,
        visibility: 'PRIVATE',
      },
    });
    await auditLog(
      req.tenantId!,
      req.user!.id,
      'CLONE',
      'Dashboard',
      dashboard.id,
      { sourceDashboardId: source.id },
      { name },
    );
    res.status(201).json({ success: true, data: dashboard });
  } catch (error: any) {
    if (error.code === 'P2002')
      return res.status(409).json({
        success: false,
        error: 'A dashboard with this name already exists',
      });
    console.error('Clone dashboard error:', error);
    res.status(500).json({ success: false, error: 'Unable to clone dashboard' });
  }
});

router.delete('/:id/share/:shareId', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req, 'SHARE')))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to change dashboard sharing',
    });
  const removed = await prisma.dashboardShare.deleteMany({
    where: {
      id: req.params.shareId,
      dashboardId: dashboard.id,
      tenantId: req.tenantId!,
    },
  });
  if (!removed.count) return res.status(404).json({ success: false, error: 'Dashboard share not found' });
  await auditLog(
    req.tenantId!,
    req.user!.id,
    'UNSHARE',
    'Dashboard',
    dashboard.id,
    { shareId: req.params.shareId },
    null,
  );
  res.json({ success: true, data: { removed: true } });
});

router.post('/:id/share', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req, 'SHARE')))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to share this dashboard',
    });
  const data = shareSchema.parse(req.body);
  if (data.userId) {
    const user = await prisma.user.findFirst({
      where: {
        id: data.userId,
        tenantId: req.tenantId!,
        isActive: true,
      },
      select: { id: true },
    });
    if (!user) return res.status(404).json({ success: false, error: 'Target user was not found' });
  }
  if (data.roleId) {
    const role = await prisma.role.findFirst({
      where: { id: data.roleId, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!role) return res.status(404).json({ success: false, error: 'Target role was not found' });
  }
  if (data.teamId) {
    const teamRole = await prisma.role.findFirst({
      where: { id: data.teamId, tenantId: req.tenantId! },
      select: { id: true },
    });
    if (!teamRole) return res.status(404).json({ success: false, error: 'Target team was not found' });
  }
  if (!data.userId && !data.roleId && !data.teamId)
    return res.status(400).json({ success: false, error: 'Select a user or role to share with' });
  const existingShare = await prisma.dashboardShare.findFirst({
    where: {
      dashboardId: dashboard.id,
      tenantId: req.tenantId!,
      userId: data.userId || null,
      roleId: data.roleId || null,
      teamId: data.teamId || null,
    },
  });
  const share = existingShare
    ? await prisma.dashboardShare.update({
        where: { id: existingShare.id },
        data: { accessLevel: data.accessLevel, createdBy: req.user!.id },
      })
    : await prisma.dashboardShare.create({
        data: {
          id: randomUUID(),
          tenantId: req.tenantId!,
          dashboardId: dashboard.id,
          userId: data.userId,
          roleId: data.roleId,
          teamId: data.teamId,
          accessLevel: data.accessLevel,
          createdBy: req.user!.id,
        },
      });
  await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: { visibility: 'SHARED' },
  });
  await auditLog(req.tenantId!, req.user!.id, 'SHARE', 'Dashboard', dashboard.id, null, {
    userId: data.userId,
    roleId: data.roleId,
    accessLevel: data.accessLevel,
  });
  res.status(201).json({ success: true, data: share });
});

router.post('/:id/change-owner', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req, 'MANAGE')))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to change the dashboard owner',
    });
  const targetUser = await prisma.user.findFirst({
    where: {
      id: req.body?.userId,
      tenantId: req.tenantId!,
      isActive: true,
    },
    select: { id: true, email: true },
  });
  if (!targetUser) return res.status(404).json({ success: false, error: 'Target user was not found' });
  const updated = await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: { ownerId: targetUser.id },
  });
  await auditLog(
    req.tenantId!,
    req.user!.id,
    'CHANGE_OWNER',
    'Dashboard',
    dashboard.id,
    { ownerId: dashboard.ownerId },
    { ownerId: targetUser.id },
  );
  if (req.body?.sendEmail) console.info(`Dashboard owner notification requested for ${targetUser.email}`);
  res.json({
    success: true,
    data: updated,
    message: req.body?.sendEmail ? 'Owner changed and notification queued' : 'Owner changed successfully',
  });
});

router.post('/:id/favorite', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req)))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to favorite this dashboard',
    });
  const favorite = await prisma.dashboardFavorite.upsert({
    where: {
      dashboardId_userId: { dashboardId: dashboard.id, userId: req.user!.id },
    },
    create: {
      id: randomUUID(),
      tenantId: req.tenantId!,
      dashboardId: dashboard.id,
      userId: req.user!.id,
    },
    update: {},
  });
  await auditLog(req.tenantId!, req.user!.id, 'FAVORITE', 'Dashboard', dashboard.id, null, { favorite: true });
  res.json({ success: true, data: { isFavorite: true, favorite } });
});

router.delete('/:id/favorite', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  await prisma.dashboardFavorite.deleteMany({
    where: {
      dashboardId: req.params.id,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    },
  });
  res.json({ success: true, data: { isFavorite: false } });
});

router.post('/:id/subscribe', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req)))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to subscribe to this dashboard',
    });
  const subscription = await prisma.dashboardSubscription.upsert({
    where: {
      dashboardId_userId: { dashboardId: dashboard.id, userId: req.user!.id },
    },
    create: {
      id: randomUUID(),
      tenantId: req.tenantId!,
      dashboardId: dashboard.id,
      userId: req.user!.id,
    },
    update: {},
  });
  res.json({ success: true, data: { isSubscribed: true, subscription } });
});

router.delete('/:id/subscribe', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  await prisma.dashboardSubscription.deleteMany({
    where: {
      dashboardId: req.params.id,
      tenantId: req.tenantId!,
      userId: req.user!.id,
    },
  });
  res.json({ success: true, data: { isSubscribed: false } });
});

router.post('/:id/refresh', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req)))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to refresh this dashboard',
    });
  const updated = await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: { lastRefreshedAt: new Date() },
  });
  await auditLog(req.tenantId!, req.user!.id, 'REFRESH', 'Dashboard', dashboard.id, null, {
    lastRefreshedAt: updated.lastRefreshedAt,
  });
  res.json({
    success: true,
    data: { lastRefreshedAt: updated.lastRefreshedAt },
  });
});

router.get('/:id/export', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  const dashboard = await getDashboardForRequest(req.params.id, req);
  if (!dashboard || !(await canAccessDashboard(dashboard, req)))
    return res.status(403).json({
      success: false,
      error: 'You do not have permission to export this dashboard',
    });
  const format = String(req.query.format || 'json').toLowerCase();
  const exportWidgets: any[] = Array.isArray(dashboard.layout) ? (dashboard.layout as any[]) : [];
  if (format === 'csv') {
    const rows: string[] = [];
    for (const widget of exportWidgets) {
      const reportId = widget.config?.reportId || widget.reportId;
      if (!reportId) continue;
      const report = await prisma.report.findFirst({
        where: { id: reportId, tenantId: req.tenantId!, deletedAt: null },
      });
      if (
        !report ||
        !canAccessReportForUser(
          report,
          {
            id: req.user!.id,
            tenantId: req.tenantId!,
            isSuperAdmin: req.user!.isSuperAdmin,
          },
          req.effectivePermissions?.map((permission) => permission.name) || [],
        )
      )
        continue;
      const config = (report.config && typeof report.config === 'object' ? report.config : {}) as Record<string, any>;
      const result = await runReport({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        objectName: report.objectName,
        columns: Array.isArray(report.columns) ? (report.columns as string[]) : [],
        filters: Array.isArray(report.filters) ? (report.filters as any[]) : [],
        filterTree: config.filterTree,
        filterLogic: config.filterLogic,
        groupBy: report.groupBy || config.groupBy,
        sortBy: report.sortBy || config.sortBy,
        sortOrder: config.sortOrder,
        limit: config.limit,
        aggregates: config.aggregates,
      });
      for (const row of result.rows || [])
        rows.push(
          [widget.title, report.name, ...Object.values(row)].map((value) => JSON.stringify(value ?? '')).join(','),
        );
    }
    await auditLog(req.tenantId!, req.user!.id, 'EXPORT', 'Dashboard', dashboard.id, null, { format });
    res.type('text/csv').send(['Widget,Report,Value', ...rows].join('\n'));
    return;
  }
  if (format === 'pdf') {
    const document = new PDFDocument({ margin: 40 });
    res.type('application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${dashboard.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf"`,
    );
    document.pipe(res);
    document.fontSize(20).text(dashboard.name).moveDown();
    document.fontSize(10).text(`Generated ${new Date().toISOString()}`).moveDown();
    document.fontSize(10).text(`Filters: ${JSON.stringify(dashboard.filters || [])}`).moveDown();
    for (const widget of exportWidgets) {
      document.fontSize(12).text(`${widget.title} (${widget.type})`);
      const reportId = widget.config?.reportId || widget.reportId;
      if (!reportId) continue;
      const report = await prisma.report.findFirst({
        where: { id: reportId, tenantId: req.tenantId!, deletedAt: null },
      });
      if (
        !report ||
        !canAccessReportForUser(
          report,
          {
            id: req.user!.id,
            tenantId: req.tenantId!,
            isSuperAdmin: req.user!.isSuperAdmin,
          },
          req.effectivePermissions?.map((permission) => permission.name) || [],
        )
      )
        continue;
      const config = (report.config && typeof report.config === 'object' ? report.config : {}) as Record<string, any>;
      const result = await runReport({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        objectName: report.objectName,
        columns: Array.isArray(report.columns) ? (report.columns as string[]) : [],
        filters: [
          ...(Array.isArray(report.filters) ? (report.filters as any[]) : []),
          ...(Array.isArray(dashboard.filters) ? (dashboard.filters as any[]) : []),
        ],
        filterTree: config.filterTree,
        filterLogic: config.filterLogic,
        groupBy: report.groupBy || config.groupBy,
        sortBy: report.sortBy || config.sortBy,
        sortOrder: config.sortOrder,
        limit: 25,
        aggregates: config.aggregates,
      });
      const reportRows = result.rows || [];
      const values = reportRows.map((row: any) =>
        Number(Object.values(row).find((value) => typeof value === 'number') || 0),
      );
      const maximum = Math.max(...values, 1);
      reportRows.slice(0, 10).forEach((row: any, index: number) => {
        const label = String(Object.values(row).find((value) => typeof value !== 'number') || `Item ${index + 1}`);
        const value = values[index] || 0;
        document.fontSize(8).text(`${label}: ${value}`);
        document
          .rect(80, document.y, Math.max(4, (value / maximum) * 420), 8)
          .fill('#dc2626')
          .fillColor('black');
        document.moveDown(0.7);
      });
      document.moveDown();
    }
    document.end();
    await auditLog(req.tenantId!, req.user!.id, 'EXPORT', 'Dashboard', dashboard.id, null, { format });
    return;
  }
  res.json({
    success: true,
    data: {
      dashboard,
      generatedAt: new Date().toISOString(),
      filters: dashboard.filters || [],
    },
  });
});

router.post(
  '/:id/widgets/:widgetId/drilldown',
  authorize('Dashboard', 'read'),
  async (req: AuthRequest, res: Response) => {
    try {
      const dashboard = await getDashboardForRequest(req.params.id, req);
      if (!dashboard || !(await canAccessDashboard(dashboard, req)))
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to drill into this dashboard',
        });
      const widgets = Array.isArray(dashboard.layout) ? (dashboard.layout as any[]) : [];
      const widget = widgets.find((item) => item.id === req.params.widgetId);
      const reportId = widget?.config?.reportId || widget?.reportId;
      if (!reportId)
        return res.status(400).json({
          success: false,
          error: 'This widget is not connected to a saved report',
        });
      const report = await prisma.report.findFirst({
        where: { id: reportId, tenantId: req.tenantId!, deletedAt: null },
      });
      if (
        !report ||
        !canAccessReportForUser(
          report,
          {
            id: req.user!.id,
            tenantId: req.tenantId!,
            isSuperAdmin: req.user!.isSuperAdmin,
          },
          req.effectivePermissions?.map((permission) => permission.name) || [],
        )
      )
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view the selected report',
        });
      const field = String(req.body?.field || '');
      const value = req.body?.value;
      if (!field || value === undefined || value === null || value === '')
        return res.status(400).json({
          success: false,
          error: 'A data point field and value are required',
        });
      const config = (report.config && typeof report.config === 'object' ? report.config : {}) as Record<string, any>;
      const result = await runReport({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        objectName: report.objectName,
        columns: Array.isArray(report.columns) ? (report.columns as string[]) : [],
        filters: [
          ...(Array.isArray(report.filters) ? (report.filters as any[]) : []),
          { field, operator: 'equals', value },
        ],
        filterTree: config.filterTree,
        filterLogic: config.filterLogic,
        groupBy: report.groupBy || config.groupBy,
        sortBy: report.sortBy || config.sortBy,
        sortOrder: config.sortOrder,
        limit: config.limit,
        aggregates: config.aggregates,
      });
      await auditLog(req.tenantId!, req.user!.id, 'DRILL_DOWN', 'Dashboard', dashboard.id, null, {
        reportId,
        field,
        value,
      });
      res.json({
        success: true,
        data: {
          reportId,
          reportName: report.name,
          filters: [{ field, operator: 'equals', value }],
          result,
        },
      });
    } catch (error) {
      console.error('Dashboard drilldown error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unable to drill into dashboard data',
      });
    }
  },
);

router.post('/:id/widgets/:widgetId/data', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }
    if (!(await canAccessDashboard(dashboard, req)))
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this dashboard',
      });

    const layout = Array.isArray(dashboard.layout) ? (dashboard.layout as any[]) : [];
    const previewReportId = typeof req.body?.reportId === 'string' ? req.body.reportId : undefined;
    const widget =
      layout.find((w: any) => w.id === req.params.widgetId) ||
      (previewReportId ? { id: req.params.widgetId } : undefined);

    if (!widget) {
      return res.status(404).json({ success: false, error: 'Widget not found' });
    }

    const hasMetricPermission = async (name: string) => {
      const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
      return EffectivePermissionService.hasPermissionIn(perms, name);
    };
    // KPI counts must follow the same record-access scope as the corresponding
    // lists/details (analytics.ts already does this): an OWNER-scoped user only
    // counts records they can actually access.
    const scopedWhere = async (kind: 'lead' | 'activity'): Promise<any> =>
      applyScope({ tenantId: req.tenantId! }, await getScopeClause(req.user!, kind));

    const metricMap: Record<string, () => Promise<any>> = {
      totalLeads: async () => {
        if (!(await hasMetricPermission('LEAD_READ'))) return 0;
        return prisma.lead.count({ where: await scopedWhere('lead') });
      },
      leadsByStatus: async () => {
        if (!(await hasMetricPermission('LEAD_READ'))) return [];
        const results = await prisma.lead.groupBy({
          by: ['status'],
          where: await scopedWhere('lead'),
          _count: { id: true },
        });
        const statusSettings = await getLeadStatusSettings(req.tenantId!);
        const statusByValue = new Map(statusSettings.map((status) => [status.status, status]));
        return results.map((r) => ({
          status: r.status,
          statusId: leadStatusIdFromValue(r.status),
          statusLabel: statusByValue.get(r.status)?.label || r.status,
          count: r._count.id,
        }));
      },
      recentActivities: async () => {
        if (!(await hasMetricPermission('ACTIVITY_READ'))) return [];
        return prisma.activity.findMany({
          where: await scopedWhere('activity'),
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
      },
      topOwners: async () => {
        if (!(await hasMetricPermission('LEAD_READ'))) return [];
        const owners = await prisma.lead.groupBy({
          by: ['ownerId'],
          where: { ...(await scopedWhere('lead')), ownerId: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        });
        const ownerIds = owners.map((o) => o.ownerId!);
        const users = await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        });
        return owners.map((o) => ({
          ...o,
          user: users.find((u) => u.id === o.ownerId),
        }));
      },
    };

    const metric = widget.metric || widget.config?.metric;
    let data: any = null;

    const reportId = previewReportId || widget.config?.reportId || widget.reportId;
    if (reportId) {
      const report = await prisma.report.findFirst({
        where: { id: reportId, tenantId: req.tenantId!, deletedAt: null },
      });
      if (!report) {
        return res.status(404).json({ success: false, error: 'Saved report not found' });
      }
      if (
        !canAccessReportForUser(
          report,
          {
            id: req.user!.id,
            tenantId: req.tenantId!,
            isSuperAdmin: req.user!.isSuperAdmin,
          },
          req.effectivePermissions?.map((permission) => permission.name) || [],
        )
      ) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view the selected report',
        });
      }
      const config = (report.config && typeof report.config === 'object' ? report.config : {}) as Record<string, any>;
      const dashboardFilters = Array.isArray(req.body?.filters)
        ? req.body.filters
        : Array.isArray(dashboard.filters)
          ? dashboard.filters
          : [];
      const result = await runReport({
        tenantId: req.tenantId!,
        userId: req.user!.id,
        objectName: report.objectName,
        columns: Array.isArray(report.columns) ? (report.columns as string[]) : [],
        filters: [
          ...(Array.isArray(report.filters) ? (report.filters as any[]) : []),
          ...dashboardFilters.filter(
            (filter: any) => typeof filter?.field === 'string' && typeof filter?.operator === 'string',
          ),
        ],
        filterTree: config.filterTree,
        filterLogic: config.filterLogic,
        aggregates: config.aggregates,
        groupBy: report.groupBy || config.groupBy,
        groupColumn: config.groupColumn,
        rowGroups: config.rowGroups,
        columnGroups: config.columnGroups,
        sortBy: report.sortBy || config.sortBy,
        sortOrder: config.sortOrder,
        limit: config.limit,
      });
      data = {
        source: 'report',
        report: { id: report.id, name: report.name },
        result,
      };
    } else if (metric && metricMap[metric]) {
      data = await metricMap[metric]();
    } else {
      data = { message: 'No data source configured for this widget' };
    }

    res.json({ success: true, data: { widget, data } });
  } catch (error) {
    console.error('Get widget data error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch widget data' });
  }
});

export { router as dashboardRoutes };
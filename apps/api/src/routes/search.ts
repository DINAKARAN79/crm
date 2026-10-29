import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { EffectivePermissionService } from '../services/effectivePermissions';
import { getScopeClause } from '../services/recordAccess';
import { getLeadStatusSettings } from '../services/leadStatusSettings';
import { leadStatusIdFromValue } from '@dct-crm/shared';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { q, types, status, owner, limit = 20 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = q as string;
    const allowedTypes = types ? (types as string).split(',') : [
      'leads', 'siteVisits', 'projects', 'units', 'tasks',
    ];

    // Every search type requires the same read permission as its own module
    // (identical naming to authorize(object, 'read')), and scoped objects apply
    // the same record-access clause as their list routes.
    const TYPE_PERMS: Record<string, string> = {
      leads: 'LEAD_READ',
      siteVisits: 'SITE_VISIT_READ',
      projects: 'PROJECT_READ',
      units: 'UNIT_READ',
      tasks: 'FOLLOW_UP_READ',
    };
    const TYPE_SCOPES: Record<string, 'lead' | 'siteVisit' | 'followUp'> = {
      leads: 'lead',
      siteVisits: 'siteVisit',
      tasks: 'followUp',
    };
    const effectivePerms = req.user!.isSuperAdmin
      ? null
      : await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);

    const searchConfig: Record<string, { model: any; titleField: string; subtitleField: string; urlPrefix: string; whereExtra?: any }> = {
      leads: {
        model: prisma.lead,
        titleField: 'firstName',
        subtitleField: 'phone',
        urlPrefix: '/leads',
        whereExtra: {
          OR: [
            { leadNumber: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      siteVisits: {
        model: prisma.siteVisit,
        titleField: 'siteVisitNumber',
        subtitleField: 'status',
        urlPrefix: '/site-visits',
        whereExtra: {
          siteVisitNumber: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      projects: {
        model: prisma.project,
        titleField: 'name',
        subtitleField: 'city',
        urlPrefix: '/projects',
        whereExtra: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { city: { contains: searchTerm, mode: 'insensitive' } },
            { address: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      units: {
        model: prisma.unit,
        titleField: 'number',
        subtitleField: 'type',
        urlPrefix: '/units',
        whereExtra: {
          number: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      tasks: {
        model: prisma.followUp,
        titleField: 'title',
        subtitleField: 'status',
        urlPrefix: '/follow-ups',
        whereExtra: {
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { subject: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { followUpNumber: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
    };

    const searchPromises = allowedTypes
      .filter((type) => searchConfig[type])
      .map(async (type) => {
        const config = searchConfig[type];
        const requiredPerm = TYPE_PERMS[type];
        if (effectivePerms && requiredPerm && !EffectivePermissionService.hasPermissionIn(effectivePerms, requiredPerm)) {
          return [];
        }
        const where: any = { tenantId: req.tenantId!, ...config.whereExtra };
        const scopeKind = TYPE_SCOPES[type];
        if (scopeKind) {
          const clause = await getScopeClause(req.user!, scopeKind);
          if (clause) where.AND = [...(where.AND || []), clause];
        }
        if (status) where.status = status;
        if (owner && ['leads', 'tasks'].includes(type)) where.ownerId = owner;

        const items = await config.model.findMany({
          where,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
        });

        return items.map((item: any) => ({
          id: item.id,
          type,
          title: item[config.titleField] || 'Untitled',
          subtitle: item[config.subtitleField] || '',
          url: `${config.urlPrefix}/${item.id}`,
          tenantId: req.tenantId,
          data: item,
        }));
      });

    const searchResults = await Promise.all(searchPromises);
    const flatResults = searchResults.flat().slice(0, Number(limit));

    res.json({ success: true, data: flatResults, total: flatResults.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

router.get('/quick', async (req: AuthRequest, res: Response) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = q as string;
    const numLimit = Number(limit);

    const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
    const isSuper = !!req.user!.isSuperAdmin;
    const canReadLeads = isSuper || EffectivePermissionService.hasPermissionIn(perms, 'LEAD_READ');
    const canReadTasks = isSuper || EffectivePermissionService.hasPermissionIn(perms, 'FOLLOW_UP_READ');

    const leadScope = await getScopeClause(req.user!, 'lead');
    const taskScope = await getScopeClause(req.user!, 'followUp');

    const leadWhere: any = canReadLeads
      ? {
          tenantId: req.tenantId!,
          OR: [
            { leadNumber: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
          ],
        }
      : { id: { in: [] as string[] } };
    if (leadScope && canReadLeads) leadWhere.AND = [leadScope];

    const taskWhere: any = canReadTasks
      ? {
          tenantId: req.tenantId!,
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { subject: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { followUpNumber: { contains: searchTerm, mode: 'insensitive' } },
          ],
        }
      : { id: { in: [] as string[] } };
    if (taskScope && canReadTasks) taskWhere.AND = [taskScope];

    const [leads, tasks] = await Promise.all([
      prisma.lead.findMany({
        where: leadWhere,
        select: { id: true, leadNumber: true, firstName: true, lastName: true, phone: true, status: true },
        take: numLimit,
      }),
      prisma.followUp.findMany({
        where: taskWhere,
        select: { id: true, title: true, status: true, followUpNumber: true },
        take: numLimit,
      }),
    ]);

    const statusSettings = await getLeadStatusSettings(req.tenantId!);
    const statusByValue = new Map(statusSettings.map((status) => [status.status, status]));
    res.json({
      success: true,
      data: {
        leads: leads.map((l) => ({
          ...l,
          statusId: leadStatusIdFromValue(l.status),
          statusLabel: statusByValue.get(l.status)?.label || l.status,
          type: 'lead',
          url: `/leads/${l.id}`,
        })),
        tasks: tasks.map((t) => ({ ...t, type: 'followUp', url: `/follow-ups/${t.id}` })),
      },
    });
  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({ success: false, error: 'Quick search failed' });
  }
});

export { router as searchRoutes };
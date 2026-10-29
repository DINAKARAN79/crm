import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  getLeadRecordScope,
  leadScopeClause,
} from '../services/recordAccess';
import { getLeadStatusSettings } from '../services/leadStatusSettings';
import { leadStatusIdFromValue } from '@dct-crm/shared';

const router = Router();

router.use(authenticate);

function parseDateFilter(startDate?: string, endDate?: string) {
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate as string);
  if (endDate) {
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }
  return dateFilter;
}

router.get('/leads', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = parseDateFilter(startDate as string, endDate as string);

    let where: any = { tenantId: req.tenantId! };
    if (startDate || endDate) where.createdAt = dateFilter;
    where = applyScope(where, leadScopeClause(await getLeadRecordScope(req.user!)));

    const [total, byStatus, bySource, byOwner, recentTrend] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['source'],
        where,
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['ownerId'],
        where: { ...where, ownerId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.lead.findMany({
        where,
        select: { createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const ownerIds = byOwner.map((o) => o.ownerId!).filter(Boolean);
    const owners = ownerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const statusSettings = await getLeadStatusSettings(req.tenantId!);
    const statusLabels = new Map(statusSettings.map((status) => [status.status, status]));

    res.json({
      success: true,
      data: {
        total,
        byStatus: byStatus.map((s) => ({
          status: s.status,
          statusId: leadStatusIdFromValue(s.status),
          statusLabel: statusLabels.get(s.status)?.label || s.status,
          count: s._count.id,
        })),
        bySource: bySource.map((s) => ({ source: s.source, count: s._count.id })),
        byOwner: byOwner.map((o) => ({
          owner: owners.find((u) => u.id === o.ownerId),
          count: o._count.id,
        })),
        trend: recentTrend.map((lead) => ({
          ...lead,
          statusId: leadStatusIdFromValue(lead.status),
          statusLabel: statusLabels.get(lead.status)?.label || lead.status,
        })),
      },
    });
  } catch (error) {
    console.error('Lead analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead analytics' });
  }
});

router.get('/projects', authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const leadScope = await getLeadRecordScope(req.user!);

    const [projects, unitStats, leadStats] = await Promise.all([
      prisma.project.findMany({
        where: { tenantId },
        include: {
          _count: {
            select: { units: true, leads: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.unit.groupBy({
        by: ['projectId', 'status'],
        where: { tenantId },
        _count: { id: true },
      }),
      prisma.lead.groupBy({
        by: ['projectId'],
        where: applyScope({ tenantId }, leadScopeClause(leadScope)),
        _count: { id: true },
      }),
    ]);

    const unitsByProject = new Map<string, Array<{ status: string; count: number }>>();
    for (const row of unitStats) {
      if (!row.projectId) continue;
      const list = unitsByProject.get(row.projectId) || [];
      list.push({ status: row.status, count: row._count.id });
      unitsByProject.set(row.projectId, list);
    }

    const leadsByProject = new Map<string, number>();
    for (const row of leadStats) {
      if (!row.projectId) continue;
      leadsByProject.set(row.projectId, row._count.id);
    }

    const projectStats = projects.map((project) => ({
      ...project,
      unitStats: unitsByProject.get(project.id) || [],
      leadCount: leadsByProject.get(project.id) || 0,
    }));

    res.json({ success: true, data: projectStats });
  } catch (error) {
    console.error('Project analytics error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch project analytics' });
  }
});

export { router as analyticsRoutes };
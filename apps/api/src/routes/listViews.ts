import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  emptyFilters,
  isListModule,
  systemViewByKey,
  validateFilterSet,
  type ListModule,
} from '../services/listViewCatalog';
import { assertApiName, listViewCatalog, normalizeApiName, rememberView } from '../services/listViewService';

const router = Router();
router.use(authenticate);

const actorOf = (req: AuthRequest) => ({
  id: req.user!.id,
  tenantId: req.tenantId!,
  isAdmin: req.user!.isAdmin,
  isSuperAdmin: req.user!.isSuperAdmin,
});

const canManage = (req: AuthRequest, createdById: string) =>
  req.user!.isSuperAdmin || req.user!.isAdmin || req.user!.id === createdById;

const moduleOf = (value: unknown, res: Response): ListModule | null => {
  if (typeof value === 'string' && isListModule(value)) return value;
  res.status(400).json({ success: false, error: 'Choose a CRM module' });
  return null;
};

const saveSchema = z.object({
  module: z.string(),
  name: z.string().trim().min(1).max(80),
  apiName: z.string().trim().max(61).optional(),
  visibility: z.enum(['ONLY_ME', 'ALL_USERS', 'SELECTED_USERS']),
  sharedUserIds: z.array(z.string()).max(50).optional(),
  filters: z.unknown().optional(),
});

async function ownedUsers(tenantId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const users = await prisma.user.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true } });
  return users.length === unique.length ? unique : null;
}

async function acceptFilters(tenantId: string, module: ListModule, input: unknown) {
  const validated = validateFilterSet(module, input);
  if (!validated.ok) return validated;
  if (validated.filters.ownerFilter === 'SELECTED') {
    const owners = await ownedUsers(tenantId, validated.filters.ownerUserIds || []);
    if (!owners) return { ok: false as const, error: 'Choose users from this company' };
    validated.filters.ownerUserIds = owners;
  }
  return validated;
}

async function visibleCustom(req: AuthRequest, id: string) {
  const view = await prisma.savedListView.findFirst({
    where: { id, tenantId: req.tenantId! },
    include: { shares: { select: { userId: true } } },
  });
  if (!view || !isListModule(view.module)) return null;
  const shared = view.shares.some((share) => share.userId === req.user!.id);
  const visible = req.user!.isAdmin || req.user!.isSuperAdmin || view.createdById === req.user!.id || view.visibility === 'ALL_USERS' || shared;
  return visible ? view : null;
}

router.get('/', async (req: AuthRequest, res: Response) => {
  const module = moduleOf(req.query.module, res);
  if (!module) return;
  const data = await listViewCatalog(actorOf(req), module);
  return res.json({ success: true, data });
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Enter a list view name and visibility' });
  const module = moduleOf(parsed.data.module, res);
  if (!module) return;
  const accepted = parsed.data.filters === undefined ? { ok: true as const, filters: emptyFilters() } : await acceptFilters(req.tenantId!, module, parsed.data.filters);
  if (!accepted.ok) return res.status(400).json({ success: false, error: accepted.error });
  const filters = accepted.filters;
  const apiName = normalizeApiName(parsed.data.name, parsed.data.apiName);
  if (!assertApiName(apiName)) return res.status(400).json({ success: false, error: 'List View API Name must start with a letter and use lowercase letters, numbers, or underscores' });
  const shared = parsed.data.visibility === 'SELECTED_USERS' ? await ownedUsers(req.tenantId!, parsed.data.sharedUserIds || []) : [];
  if (!shared) return res.status(400).json({ success: false, error: 'Choose users from this company' });
  try {
    const created = await prisma.savedListView.create({
      data: {
        tenantId: req.tenantId!,
        module,
        name: parsed.data.name,
        apiName,
        visibility: parsed.data.visibility,
        filters,
        createdById: req.user!.id,
        shares: { create: shared.map((userId) => ({ userId })) },
      },
    });
    await rememberView(actorOf(req), module, created.id);
    return res.status(201).json({ success: true, data: { id: created.id } });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ success: false, error: 'A list view with that API name already exists in this module' });
    }
    console.error('Create list view error:', error);
    return res.status(500).json({ success: false, error: 'Could not save the list view' });
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const current = await visibleCustom(req, req.params.id);
  if (!current) return res.status(404).json({ success: false, error: 'List view not found' });
  if (!canManage(req, current.createdById)) return res.status(403).json({ success: false, error: 'You cannot edit this list view' });
  const parsed = saveSchema.partial({ module: true }).safeParse({ ...req.body, module: current.module });
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Check the list view details' });
  const module = current.module as ListModule;
  const accepted = parsed.data.filters === undefined
    ? await acceptFilters(req.tenantId!, module, current.filters).then((result) => result.ok ? result : { ok: true as const, filters: emptyFilters() })
    : await acceptFilters(req.tenantId!, module, parsed.data.filters);
  if (!accepted.ok) return res.status(400).json({ success: false, error: accepted.error });
  const nextFilters = accepted.filters;
  const name = parsed.data.name || current.name;
  const apiName = normalizeApiName(name, parsed.data.apiName || current.apiName);
  if (!assertApiName(apiName)) return res.status(400).json({ success: false, error: 'List View API Name must start with a letter and use lowercase letters, numbers, or underscores' });
  const visibility = parsed.data.visibility || current.visibility;
  const shared = visibility === 'SELECTED_USERS'
    ? await ownedUsers(req.tenantId!, parsed.data.sharedUserIds || current.shares.map((share) => share.userId))
    : [];
  if (!shared) return res.status(400).json({ success: false, error: 'Choose users from this company' });
  try {
    await prisma.$transaction([
      prisma.savedListView.update({
        where: { id: current.id },
        data: { name, apiName, visibility, filters: nextFilters },
      }),
      prisma.savedListViewShare.deleteMany({ where: { listViewId: current.id } }),
      ...(shared.length ? [prisma.savedListViewShare.createMany({ data: shared.map((userId) => ({ listViewId: current.id, userId })) })] : []),
    ]);
    return res.json({ success: true });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ success: false, error: 'A list view with that API name already exists in this module' });
    }
    console.error('Update list view error:', error);
    return res.status(500).json({ success: false, error: 'Could not update the list view' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const current = await visibleCustom(req, req.params.id);
  if (!current) return res.status(404).json({ success: false, error: 'List view not found' });
  if (!canManage(req, current.createdById)) return res.status(403).json({ success: false, error: 'You cannot delete this list view' });
  await prisma.savedListView.delete({ where: { id: current.id } });
  await prisma.listViewPreference.deleteMany({ where: { tenantId: req.tenantId!, module: current.module, viewKey: current.id } });
  await prisma.listViewPin.deleteMany({ where: { tenantId: req.tenantId!, module: current.module, viewKey: current.id } });
  await prisma.listViewRecent.deleteMany({ where: { tenantId: req.tenantId!, module: current.module, viewKey: current.id } });
  return res.json({ success: true });
});

router.post('/:id/duplicate', async (req: AuthRequest, res: Response) => {
  const current = await visibleCustom(req, req.params.id);
  const system = !current && typeof req.body?.module === 'string' && isListModule(req.body.module)
    ? systemViewByKey(req.body.module, req.params.id)
    : undefined;
  if (!current && !system) return res.status(404).json({ success: false, error: 'List view not found' });
  const module = (current?.module || system!.module) as ListModule;
  const baseName = current?.name || system!.name;
  const filters = current ? current.filters : system!.filters;
  let apiName = normalizeApiName(`Copy of ${baseName}`);
  for (let attempt = 2; attempt < 20; attempt += 1) {
    const existing = await prisma.savedListView.findFirst({ where: { tenantId: req.tenantId!, module, apiName }, select: { id: true } });
    if (!existing) break;
    apiName = normalizeApiName(`Copy of ${baseName} ${attempt}`);
  }
  const created = await prisma.savedListView.create({
    data: {
      tenantId: req.tenantId!,
      module,
      name: `Copy of ${baseName}`.slice(0, 80),
      apiName,
      visibility: 'ONLY_ME',
      filters: filters as object,
      createdById: req.user!.id,
    },
  });
  await rememberView(actorOf(req), module, created.id);
  return res.status(201).json({ success: true, data: { id: created.id } });
});

router.post('/select', async (req: AuthRequest, res: Response) => {
  const module = moduleOf(req.body?.module, res);
  if (!module) return;
  const viewKey = typeof req.body?.viewKey === 'string' ? req.body.viewKey : '';
  if (systemViewByKey(module, viewKey)) {
    await rememberView(actorOf(req), module, viewKey);
    return res.json({ success: true });
  }
  const saved = await visibleCustom(req, viewKey);
  if (!saved || saved.module !== module) return res.status(403).json({ success: false, error: 'You do not have access to this list view' });
  await rememberView(actorOf(req), module, saved.id);
  return res.json({ success: true });
});

router.post('/pin', async (req: AuthRequest, res: Response) => {
  const module = moduleOf(req.body?.module, res);
  if (!module) return;
  const viewKey = typeof req.body?.viewKey === 'string' ? req.body.viewKey : '';
  const pinned = req.body?.pinned === true;
  const allowed = systemViewByKey(module, viewKey) || (await visibleCustom(req, viewKey))?.module === module;
  if (!allowed) return res.status(403).json({ success: false, error: 'You do not have access to this list view' });
  if (pinned) {
    await prisma.listViewPin.upsert({
      where: { tenantId_userId_module_viewKey: { tenantId: req.tenantId!, userId: req.user!.id, module, viewKey } },
      create: { tenantId: req.tenantId!, userId: req.user!.id, module, viewKey },
      update: {},
    });
  } else {
    await prisma.listViewPin.deleteMany({ where: { tenantId: req.tenantId!, userId: req.user!.id, module, viewKey } });
  }
  return res.json({ success: true });
});

router.post('/record-view', async (req: AuthRequest, res: Response) => {
  const module = moduleOf(req.body?.module, res);
  if (!module) return;
  const recordId = typeof req.body?.recordId === 'string' ? req.body.recordId.trim() : '';
  if (!/^[a-zA-Z0-9_-]{8,40}$/.test(recordId)) return res.status(400).json({ success: false, error: 'Record not found' });
  await prisma.crmRecordView.upsert({
    where: { tenantId_userId_module_recordId: { tenantId: req.tenantId!, userId: req.user!.id, module, recordId } },
    create: { tenantId: req.tenantId!, userId: req.user!.id, module, recordId, viewedAt: new Date() },
    update: { viewedAt: new Date() },
  });
  return res.json({ success: true });
});

export default router;

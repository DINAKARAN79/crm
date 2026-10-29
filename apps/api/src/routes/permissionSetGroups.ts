import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();
router.use(authenticate);

const groupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requirePermission('PERMISSION_SET_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.permissionSetGroup.findMany({
      where: { tenantId: req.tenantId!, ...(req.query.isActive !== undefined ? { isActive: req.query.isActive === 'true' } : {}) },
      include: {
        assignments: { include: { permissionSet: { select: { id: true, name: true, isActive: true } } } },
        _count: { select: { users: true, assignments: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: groups });
  } catch (error) {
    console.error('Get permission set groups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch permission set groups' });
  }
});

router.get('/:id', requirePermission('PERMISSION_SET_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.permissionSetGroup.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        assignments: { include: { permissionSet: { include: { items: { include: { permission: true } } } } } },
        users: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } } } },
      },
    });
    if (!group) return res.status(404).json({ success: false, error: 'Permission Set Group not found' });
    res.json({ success: true, data: group });
  } catch (error) {
    console.error('Get permission set group error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch permission set group' });
  }
});

router.post('/', requirePermission('PERMISSION_SET_CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const data = groupSchema.parse(req.body);
    const duplicate = await prisma.permissionSetGroup.findFirst({ where: { tenantId: req.tenantId!, name: data.name } });
    if (duplicate) return res.status(409).json({ success: false, error: 'Permission Set Group with this name already exists' });

    const group = await prisma.permissionSetGroup.create({ data: { tenantId: req.tenantId!, name: data.name, description: data.description, isActive: data.isActive ?? true } });
    res.status(201).json({ success: true, data: group });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues[0]?.message });
    console.error('Create permission set group error:', error);
    res.status(500).json({ success: false, error: 'Failed to create permission set group' });
  }
});

router.put('/:id', requirePermission('PERMISSION_SET_UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.permissionSetGroup.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
    if (!existing) return res.status(404).json({ success: false, error: 'Permission Set Group not found' });
    const data = groupSchema.partial().parse(req.body);
    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.permissionSetGroup.findFirst({ where: { tenantId: req.tenantId!, name: data.name, id: { not: req.params.id } } });
      if (duplicate) return res.status(409).json({ success: false, error: 'Permission Set Group with this name already exists' });
    }
    const group = await prisma.permissionSetGroup.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: group });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.issues[0]?.message });
    console.error('Update permission set group error:', error);
    res.status(500).json({ success: false, error: 'Failed to update permission set group' });
  }
});

router.delete('/:id', requirePermission('PERMISSION_SET_DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.permissionSetGroup.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, include: { _count: { select: { users: true } } } });
    if (!group) return res.status(404).json({ success: false, error: 'Permission Set Group not found' });
    if (group._count.users > 0) return res.status(400).json({ success: false, error: 'Remove user assignments before deleting this group' });
    await prisma.permissionSetGroup.delete({ where: { id: group.id } });
    res.json({ success: true, message: 'Permission Set Group deleted successfully' });
  } catch (error) {
    console.error('Delete permission set group error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete permission set group' });
  }
});

router.post('/:id/permission-sets', requirePermission('PERMISSION_SET_UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const permissionSetIds: string[] | null = Array.isArray(req.body.permissionSetIds)
      ? [...new Set((req.body.permissionSetIds as unknown[]).filter((id): id is string => typeof id === 'string'))]
      : null;
    if (!permissionSetIds) return res.status(400).json({ success: false, error: 'permissionSetIds must be an array' });
    const group = await prisma.permissionSetGroup.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true } });
    if (!group) return res.status(404).json({ success: false, error: 'Permission Set Group not found' });
    const validCount = await prisma.newPermissionSet.count({ where: { id: { in: permissionSetIds }, tenantId: req.tenantId!, isActive: true } });
    if (validCount !== permissionSetIds.length) return res.status(422).json({ success: false, error: 'One or more permission sets are invalid' });
    await prisma.permissionSetGroupItem.createMany({ data: permissionSetIds.map((permissionSetId) => ({ groupId: group.id, permissionSetId })), skipDuplicates: true });
    res.json({ success: true, data: { assigned: permissionSetIds.length } });
  } catch (error) {
    console.error('Assign permission sets to group error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign permission sets to group' });
  }
});

router.delete('/:id/permission-sets/:permissionSetId', requirePermission('PERMISSION_SET_UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.permissionSetGroup.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, select: { id: true } });
    if (!group) return res.status(404).json({ success: false, error: 'Permission Set Group not found' });
    const deleted = await prisma.permissionSetGroupItem.deleteMany({ where: { groupId: group.id, permissionSetId: req.params.permissionSetId } });
    if (!deleted.count) return res.status(404).json({ success: false, error: 'Permission Set is not assigned to this group' });
    res.json({ success: true, message: 'Permission Set removed from group' });
  } catch (error) {
    console.error('Remove permission set from group error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove permission set from group' });
  }
});

export const permissionSetGroupRoutes = router;

const userGroupRouter = Router();
userGroupRouter.use(authenticate);

userGroupRouter.get('/:userId', requirePermission('PERMISSION_SET_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.userId, tenantId: req.tenantId! }, select: { id: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const groups = await prisma.userPermissionSetGroup.findMany({ where: { userId: user.id, group: { tenantId: req.tenantId! } }, include: { group: { include: { assignments: { include: { permissionSet: { select: { id: true, name: true } } } } } } } });
    res.json({ success: true, data: groups });
  } catch (error) {
    console.error('Get user permission set groups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user permission set groups' });
  }
});

userGroupRouter.post('/:userId', requirePermission('PERMISSION_SET_ASSIGN'), async (req: AuthRequest, res: Response) => {
  try {
    const groupIds: string[] | null = Array.isArray(req.body.groupIds)
      ? [...new Set((req.body.groupIds as unknown[]).filter((id): id is string => typeof id === 'string'))]
      : null;
    if (!groupIds) return res.status(400).json({ success: false, error: 'groupIds must be an array' });
    const user = await prisma.user.findFirst({ where: { id: req.params.userId, tenantId: req.tenantId! }, select: { id: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const validCount = await prisma.permissionSetGroup.count({ where: { id: { in: groupIds }, tenantId: req.tenantId!, isActive: true } });
    if (validCount !== groupIds.length) return res.status(422).json({ success: false, error: 'One or more permission set groups are invalid' });
    await prisma.userPermissionSetGroup.createMany({ data: groupIds.map((groupId) => ({ userId: user.id, groupId })), skipDuplicates: true });
    res.json({ success: true, data: { assigned: groupIds.length } });
  } catch (error) {
    console.error('Assign user permission set groups error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign permission set groups' });
  }
});

userGroupRouter.delete('/:userId/:groupId', requirePermission('PERMISSION_SET_ASSIGN'), async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({ where: { id: req.params.userId, tenantId: req.tenantId! }, select: { id: true } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const deleted = await prisma.userPermissionSetGroup.deleteMany({ where: { userId: user.id, groupId: req.params.groupId, group: { tenantId: req.tenantId! } } });
    if (!deleted.count) return res.status(404).json({ success: false, error: 'Group assignment not found' });
    res.json({ success: true, message: 'Permission Set Group unassigned successfully' });
  } catch (error) {
    console.error('Unassign user permission set group error:', error);
    res.status(500).json({ success: false, error: 'Failed to unassign permission set group' });
  }
});

export const userPermissionSetGroupRoutes = userGroupRouter;

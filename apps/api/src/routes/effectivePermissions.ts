import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { EffectivePermissionService } from '../services/effectivePermissions';

const router = Router();
router.use(authenticate);

router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const summary = await EffectivePermissionService.getUserPermissionsSummary(req.user.id);

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Get effective permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch effective permissions' });
  }
});

router.get('/user/:userId', requirePermission('USER_PERMISSION_READ'), async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.userId, tenantId: req.tenantId! },
      select: { id: true, firstName: true, lastName: true, email: true, profileId: true, profile: { select: { id: true, name: true } } },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const summary = await EffectivePermissionService.getUserPermissionsSummary(req.params.userId);

    const [profilePerms, permSetPerms, groupPerms, directPerms] = await Promise.all([
      EffectivePermissionService.getProfilePermissions(user.profileId, req.tenantId!),
      EffectivePermissionService.getPermissionSetPermissions(req.params.userId, req.tenantId!),
      EffectivePermissionService.getPermissionSetGroupPermissions(req.params.userId, req.tenantId!),
      EffectivePermissionService.getDirectPermissions(req.params.userId),
    ]);

    res.json({
      success: true,
      data: {
        user,
        ...summary,
        sources: {
          profile: profilePerms,
          permissionSets: permSetPerms,
          permissionSetGroups: groupPerms,
          direct: directPerms,
        },
      },
    });
  } catch (error) {
    console.error('Get user effective permissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user effective permissions' });
  }
});

router.get('/check/:permissionName', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (req.user.isSuperAdmin) {
      return res.json({ success: true, data: { hasPermission: true, permission: req.params.permissionName } });
    }

    const has = await EffectivePermissionService.hasPermission(req.user.id, req.params.permissionName);

    res.json({ success: true, data: { hasPermission: has, permission: req.params.permissionName } });
  } catch (error) {
    console.error('Check permission error:', error);
    res.status(500).json({ success: false, error: 'Failed to check permission' });
  }
});

export { router as effectivePermissionRoutes };
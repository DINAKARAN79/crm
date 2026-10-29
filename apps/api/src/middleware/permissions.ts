import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { EffectivePermissionService } from '../services/effectivePermissions';

export const requirePermission = (permissionName: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin) {
        return next();
      }

      const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user, req.user.id);
      const allowed = EffectivePermissionService.hasPermissionIn(perms, permissionName);

      if (!allowed) {
        return res.status(403).json({ success: false, error: `Permission denied: ${permissionName} required` });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

export const requireAnyPermission = (permissionNames: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin) {
        return next();
      }

      const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user, req.user.id);
      const has =
        perms.some((p) => p.name === 'FULL_SYSTEM_ACCESS') ||
        permissionNames.some((name) => perms.some((p) => p.name === name));

      if (!has) {
        return res.status(403).json({
          success: false,
          error: `Permission denied: one of [${permissionNames.join(', ')}] required`,
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ success: false, error: 'Permission check failed' });
    }
  };
};

export const loadEffectivePermissions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user) {
      req.effectivePermissions = await EffectivePermissionService.getEffectivePermissionsCached(req.user, req.user.id);
    }
  } catch (error) {
    console.error('Failed to load effective permissions:', error);
  }
  next();
};
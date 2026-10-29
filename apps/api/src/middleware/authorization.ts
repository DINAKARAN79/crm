import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { EffectivePermissionService } from '../services/effectivePermissions';

export interface Permission {
  create?: boolean;
  read?: boolean;
  edit?: boolean;
  delete?: boolean;
  viewAll?: boolean;
  modifyAll?: boolean;
  assign?: boolean;
}

export const authorize = (objectName: string, requiredPermission: keyof Permission) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (req.user.isSuperAdmin) {
        return next();
      }

      const moduleName = objectName === 'AuditLog' ? 'AUDIT' : objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
      const actionName = requiredPermission === 'edit' ? 'UPDATE' : requiredPermission.toUpperCase();
      const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user, req.user.id);
      let hasPermission = EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_${actionName}`);
      if (!hasPermission && moduleName === 'REPORT' && actionName === 'READ') {
        hasPermission = EffectivePermissionService.hasPermissionIn(perms, 'REPORT_VIEW');
      }

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Insufficient permissions for ${objectName}:${requiredPermission}`,
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
  };
};

export const authorizeAny = (checks: Array<[string, keyof Permission]>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (req.user.isSuperAdmin) return next();

      const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user, req.user.id);
      const allowed = checks.some(([objectName, requiredPermission]) => {
        const moduleName = objectName === 'AuditLog' ? 'AUDIT' : objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
        const actionName = requiredPermission === 'edit' ? 'UPDATE' : requiredPermission.toUpperCase();
        return EffectivePermissionService.hasPermissionIn(perms, `${moduleName}_${actionName}`);
      });
      if (!allowed) {
        return res.status(403).json({
          success: false,
          error: `Insufficient permissions for ${checks.map(([objectName, action]) => `${objectName}:${action}`).join(' or ')}`,
        });
      }
      return next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
  };
};

export const authorizeEffectivePermission = (permissionName: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      if (req.user.isSuperAdmin) return next();

      const permissions = await EffectivePermissionService.getEffectivePermissionsCached(req.user, req.user.id);
      if (!EffectivePermissionService.hasPermissionIn(permissions, permissionName)) {
        return res.status(403).json({
          success: false,
          error: `Insufficient permissions: ${permissionName}`,
        });
      }
      return next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({ success: false, error: 'Authorization check failed' });
    }
  };
};

export const checkRecordAccess = async (
  userId: string,
  tenantId: string,
  objectName: string,
  recordId: string,
  action: 'read' | 'edit' | 'delete',
  isSuperAdmin?: boolean
): Promise<boolean> => {
  if (isSuperAdmin) return true;

  const moduleName = objectName === 'AuditLog' ? 'AUDIT' : objectName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
  const actionName = action === 'edit' ? 'UPDATE' : action.toUpperCase();
  return EffectivePermissionService.hasPermission(userId, `${moduleName}_${actionName}`);
};
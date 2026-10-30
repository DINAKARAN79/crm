import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';

export function isUserObjectName(name: string | undefined): boolean {
  return (name || '').toLowerCase() === 'user';
}

export function canManageUserObject(req: AuthRequest): boolean {
  return Boolean(req.user?.isSuperAdmin || req.user?.isAdmin);
}

export function denyUnlessUserObjectAdmin(req: AuthRequest, res: Response): boolean {
  const name = String(req.params.objectName || req.params.name || '');
  if (!isUserObjectName(name) || canManageUserObject(req)) return false;
  res.status(403).json({
    success: false,
    error: 'Only Admin or System Admin can manage the User object.',
  });
  return true;
}

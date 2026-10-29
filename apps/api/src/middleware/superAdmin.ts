import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ success: false, error: 'Super Admin access required' });
  }

  next();
};

export const requireSuperAdminOrSelf = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const targetUserId = req.params.id || req.params.userId;
  if (req.user.isSuperAdmin || req.user.id === targetUserId) {
    return next();
  }

  return res.status(403).json({ success: false, error: 'Super Admin access required' });
};

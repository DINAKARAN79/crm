import { EffectivePermission } from './services/effectivePermissions';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        tenantId: string;
        isSuperAdmin: boolean;
      };
      tenantId?: string;
      effectivePermissions?: EffectivePermission[];
    }
  }
}

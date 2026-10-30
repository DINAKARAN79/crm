"use client";

import * as React from "react";
import { getDefaultLeadStatusLabel, normalizePermissionName } from "@dct-crm/shared";
import {
  authApi,
  ApiResponse,
  clearSessionToken,
  getSessionLastActivity,
  getSessionToken,
  impersonationApi,
  impersonationMeta,
  recordSessionActivity,
  SESSION_IDLE_TIMEOUT_MS,
  leadApi,
} from "@/lib/api";

export interface LeadStatusOption {
  statusId: string;
  status: string;
  label: string;
  enabled: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  description?: string;
  isAdmin?: boolean;
}

export interface UserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  phone?: string;
  isSuperAdmin?: boolean;
  impersonatedBy?: string | null;
}

export interface AuthContextType {
  user: UserData | null;
  profile: UserProfile | null;
  roles: string[];
  permissions: Record<string, any>;
  effectivePermissions: string[];
  effectivePermissionsByModule: Record<string, string[]>;
  hasFullAccess: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  tenant: { id: string; name: string; slug: string; country?: string | null } | null;
  leadStatuses: LeadStatusOption[];
  getLeadStatusLabel: (status: string) => string;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
  hasPermission: (objectName: string, action: string) => boolean;
  hasEffectivePermission: (permissionName: string) => boolean;
  hasAnyEffectivePermission: (permissionNames: string[]) => boolean;
  hasModulePermission: (module: string, action: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<UserData | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [roles, setRoles] = React.useState<string[]>([]);
  const [permissions, setPermissions] = React.useState<Record<string, any>>({});
  const [effectivePermissions, setEffectivePermissions] = React.useState<string[]>([]);
  const [effectivePermissionsByModule, setEffectivePermissionsByModule] = React.useState<Record<string, string[]>>({});
  const [hasFullAccess, setHasFullAccess] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [tenant, setTenant] = React.useState<{ id: string; name: string; slug: string; country?: string | null } | null>(null);
  const [leadStatuses, setLeadStatuses] = React.useState<LeadStatusOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const loadUser = React.useCallback(async () => {
    try {
      const res = await authApi.me();
      if (res.data.success && res.data.data) {
        const data = res.data.data;
        setUser(data.user);
        setRoles(data.roles || []);
        setPermissions(data.permissions || {});
        setEffectivePermissions(data.effectivePermissions || []);
        setEffectivePermissionsByModule(data.effectivePermissionsByModule || {});
        setHasFullAccess(data.hasFullAccess || false);
        setIsSuperAdmin(data.user?.isSuperAdmin || false);
        setTenant(data.tenant);
        try {
          const statusResponse = await leadApi.statuses();
          const statuses = statusResponse.data?.data;
          setLeadStatuses(Array.isArray(statuses) ? statuses : []);
        } catch {
          setLeadStatuses([]);
        }
        if (data.profile) {
          setProfile(data.profile);
        }
        setIsAdmin(Boolean(data.user?.isSuperAdmin || data.profile?.isAdmin));
      }
    } catch (error) {
      // Not authenticated - will redirect to login via API interceptor
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUser();
  }, [loadUser]);

  React.useEffect(() => {
    if (!user || !getSessionToken()) return;

    let idleTimer: ReturnType<typeof setTimeout>;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let lastRefreshAt = Date.now();

    const endSessionIfIdle = () => {
      const remaining = SESSION_IDLE_TIMEOUT_MS - (Date.now() - getSessionLastActivity());
      if (remaining <= 0) {
        const finish = () => {
          clearSessionToken();
          window.location.replace("/login");
        };
        if (impersonationMeta()) {
          void impersonationApi.exit().catch(() => undefined).finally(finish);
          return;
        }
        void authApi.logout().catch(() => undefined).finally(finish);
        return;
      }
      idleTimer = setTimeout(endSessionIfIdle, remaining);
    };

    const handleActivity = () => {
      if (Date.now() - getSessionLastActivity() >= 250) {
        recordSessionActivity();
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(endSessionIfIdle, SESSION_IDLE_TIMEOUT_MS);

      if (!refreshTimer) {
        const refreshDelay = Math.max(0, 15_000 - (Date.now() - lastRefreshAt));
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          if (Date.now() - getSessionLastActivity() < SESSION_IDLE_TIMEOUT_MS) {
            lastRefreshAt = Date.now();
            void authApi.refresh().catch((error) => {
              console.error("Unable to refresh the active CRM session", error);
            });
          }
        }, refreshDelay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(idleTimer);
        endSessionIfIdle();
      }
    };

    endSessionIfIdle();
    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("wheel", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let heartbeatTimer: number | undefined;
    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      void authApi.heartbeat().catch(() => undefined);
    };
    const armHeartbeat = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (document.visibilityState !== "visible") return;
      sendHeartbeat();
      heartbeatTimer = window.setInterval(sendHeartbeat, 30_000);
    };
    const pauseHeartbeat = () => {
      if (document.visibilityState === "visible") {
        armHeartbeat();
        return;
      }
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    };
    const sendCloseBeacon = () => {
      const token = getSessionToken();
      if (!token) return;
      const body = new Blob([JSON.stringify({ token })], { type: "application/json" });
      navigator.sendBeacon("/api/proxy/api/auth/leave", body);
    };
    armHeartbeat();
    document.addEventListener("visibilitychange", pauseHeartbeat);
    window.addEventListener("pagehide", sendCloseBeacon);

    return () => {
      clearTimeout(idleTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("wheel", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", pauseHeartbeat);
      window.removeEventListener("pagehide", sendCloseBeacon);
    };
  }, [user]);

  const hasRole = React.useCallback(
    (role: string) => roles.includes(role),
    [roles]
  );

  const hasEffectivePermission = React.useCallback(
    (permissionName: string) => {
      if (hasFullAccess) return true;
      const requestedPermission = normalizePermissionName(permissionName);
      return effectivePermissions.some(
        (grantedPermission) => normalizePermissionName(grantedPermission) === requestedPermission
      );
    },
    [effectivePermissions, hasFullAccess]
  );

  const hasPermission = React.useCallback(
    (objectName: string, action?: string) => {
      if (!action) {
        return hasEffectivePermission(objectName);
      }

      const normalizedAction = (action || "").toLowerCase();
      const aliasMap: Record<string, string> = {
        view: "read",
        edit: "update",
        delect: "delete",
      };
      const normalizedPermission = aliasMap[normalizedAction] || normalizedAction;

      const objectNameCandidates = new Set<string>([
        objectName,
        objectName.replace(/([a-z])([A-Z])/g, "$1_$2"),
        objectName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase(),
      ]);

      const objPerms = Array.from(objectNameCandidates).reduce<Record<string, any> | undefined>((result, candidate) => {
        if (result) return result;
        return permissions[candidate] || result;
      }, undefined);

      if (objPerms) {
        if (objPerms.modifyAll) return true;
        if (normalizedPermission === "read" && objPerms.viewAll) return true;
        return !!objPerms[normalizedPermission];
      }

      const moduleName = objectName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      const permissionName = `${moduleName}_${normalizedPermission.toUpperCase()}`;
      if (normalizedPermission === "read" && hasEffectivePermission(`${moduleName}_VIEW_ALL`)) return true;
      if (normalizedPermission === "delete" && hasEffectivePermission(`${moduleName}_MODIFY_ALL`)) return true;
      if (normalizedPermission === "update" && hasEffectivePermission(`${moduleName}_MODIFY_ALL`)) return true;
      return hasEffectivePermission(permissionName);
    },
    [hasEffectivePermission, permissions]
  );

  const hasAnyEffectivePermission = React.useCallback(
    (permissionNames: string[]) => {
      if (hasFullAccess) return true;
      return permissionNames.some((name) => hasEffectivePermission(name));
    },
    [hasEffectivePermission, hasFullAccess]
  );

  const hasModulePermission = React.useCallback(
    (module: string, action: string) => {
      if (hasFullAccess) return true;
      return hasEffectivePermission(`${module}_${action}`);
    },
    [hasEffectivePermission, hasFullAccess]
  );
  const getLeadStatusLabel = React.useCallback(
    (status: string) => leadStatuses.find((item) => item.status === status)?.label || getDefaultLeadStatusLabel(status),
    [leadStatuses],
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roles,
        permissions,
        effectivePermissions,
        effectivePermissionsByModule,
        hasFullAccess,
        isSuperAdmin,
        isAdmin,
        tenant,
        leadStatuses,
        getLeadStatusLabel,
        isLoading,
        isAuthenticated: !!user,
        hasRole,
        hasPermission,
        hasEffectivePermission,
        hasAnyEffectivePermission,
        hasModulePermission,
        refresh: loadUser,
        logout: async () => {
          try {
            await authApi.logout();
          } catch (e) {
            // ignore
          } finally {
            clearSessionToken();
            setUser(null);
            setProfile(null);
            setRoles([]);
            setPermissions({});
            setEffectivePermissions([]);
            setEffectivePermissionsByModule({});
            setHasFullAccess(false);
            setIsSuperAdmin(false);
            setIsAdmin(false);
            setTenant(null);
            setLeadStatuses([]);
            window.location.href = "/login";
          }
        },
        stopImpersonating: async () => {
          try {
            await authApi.stopImpersonation();
          } finally {
            window.location.href = "/home";
          }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

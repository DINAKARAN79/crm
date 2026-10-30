const HOME_PROFILE_KEY = "crm-home-profile";

type TenantPath = { name?: string | null; slug?: string | null } | null | undefined;

export function userHomePath(tenant: TenantPath, userId: string | null | undefined) {
  const tenantName = (tenant?.name || tenant?.slug || "").trim();
  if (!tenantName || !userId) return "/home";
  return `/${encodeURIComponent(tenantName)}/${encodeURIComponent(userId)}`;
}

export function rememberHomeProfile(profile: { id?: string | null; name?: string | null; label?: string | null } | null) {
  if (typeof window === "undefined") return;
  if (!profile?.id) {
    sessionStorage.removeItem(HOME_PROFILE_KEY);
    return;
  }
  sessionStorage.setItem(
    HOME_PROFILE_KEY,
    JSON.stringify({ id: profile.id, label: profile.label || profile.name || "" }),
  );
}

export function readHomeProfile(): { id: string; label: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HOME_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; label?: string };
    if (!parsed?.id) return null;
    return { id: String(parsed.id), label: String(parsed.label || "") };
  } catch {
    return null;
  }
}

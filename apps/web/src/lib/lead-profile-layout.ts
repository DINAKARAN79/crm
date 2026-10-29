export interface LeadPageLayout {
  id?: string;
  name?: string;
  isDefault?: boolean;
  sections?: unknown;
}

export function selectLeadPageLayout(
  layouts: LeadPageLayout[],
  defaultLayout: LeadPageLayout | null | undefined,
  profileName?: string | null,
  assignedLayoutId?: string | null,
): LeadPageLayout | null {
  if (assignedLayoutId) {
    const assigned = layouts.find((layout) => layout.id === assignedLayoutId);
    if (assigned) return assigned;
  }
  const normalizedProfile = profileName?.trim().toLocaleLowerCase();
  if (normalizedProfile) {
    const profileLayout = layouts.find(
      (layout) => layout.name?.trim().toLocaleLowerCase() === normalizedProfile,
    );
    if (profileLayout) return profileLayout;
  }

  return layouts.find((layout) => layout.isDefault) || defaultLayout || layouts[0] || null;
}

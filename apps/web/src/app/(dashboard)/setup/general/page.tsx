import SetupSectionPage from "../section-page";

export default function GeneralSetupPage() {
  return (
    <SetupSectionPage
      title="General Setup"
      description="Manage your organization details and people."
      items={[
        {
          label: "Users",
          description: "Create users, assign roles, and manage access.",
          href: "/setup/general/users",
        },
        {
          label: "Company Settings",
          description: "Configure company details, business hours, holidays, fiscal year, and currencies.",
          href: "/setup/general/company-settings",
        },
      ]}
    />
  );
}

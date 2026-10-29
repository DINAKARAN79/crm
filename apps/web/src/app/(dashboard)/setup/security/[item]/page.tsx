import SetupSectionPage from "../../section-page";
import { notFound } from "next/navigation";

const items = {
  profiles: { label: "Profiles", description: "Define baseline access for each user profile.", href: "/setup/security/profiles" },
  "permission-sets": { label: "Permission Sets", description: "Grant additional permissions without changing a profile.", href: "/setup/security/permission-sets" },
  roles: { label: "Roles", description: "Manage role hierarchy and record visibility structure.", href: "/setup/security/roles" },
};

export default async function SecuritySetupPage({ params }: { params: { item: string } }) {
  const item = items[params.item as keyof typeof items];
  if (!item) notFound();
  return <SetupSectionPage title={item.label} description={item.description} items={[item]} />;
}

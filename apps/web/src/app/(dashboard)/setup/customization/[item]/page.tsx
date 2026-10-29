import SetupSectionPage from "../../section-page";
import { notFound } from "next/navigation";

const items = {
  rrqueues: { label: "Round Robins", description: "Manage project-specific SVC and Sales assignment queues.", href: "/setup/customization/rrqueues" },
  objects: { label: "Object Manager", description: "Create and configure CRM objects and fields.", href: "/admin/object-manager" },
};

export default async function CustomizationSetupPage({ params }: { params: { item: string } }) {
  const item = items[params.item as keyof typeof items];
  if (!item) notFound();
  return <SetupSectionPage title={item.label} description={item.description} items={[item]} />;
}
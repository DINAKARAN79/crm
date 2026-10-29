import SetupSectionPage from "../../section-page";

const items = {
  "api-keys": { label: "API Keys", description: "Manage credentials for trusted integrations." },
  webhooks: { label: "Webhooks", description: "Configure outbound events for connected systems." },
  email: { label: "Email", description: "Configure email delivery and communication settings." },
};

export default async function DeveloperSetupPage({ params }: { params: { item: string } }) {
  const item = items[params.item as keyof typeof items];
  return <SetupSectionPage title={item?.label || "Developer"} description={item?.description || "Connect external systems securely."} items={item ? [item] : Object.values(items)} />;
}

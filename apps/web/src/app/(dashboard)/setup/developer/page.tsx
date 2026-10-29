import { redirect } from "next/navigation";

export default function DeveloperSetupPage() {
  redirect("/setup/developer/api-keys");
}
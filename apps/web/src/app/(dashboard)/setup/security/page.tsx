import { redirect } from "next/navigation";

export default function SecuritySetupPage() {
  redirect("/setup/security/profiles");
}
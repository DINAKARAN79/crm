import { redirect } from "next/navigation";

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  redirect(`/follow-ups/${params.id}`);
}

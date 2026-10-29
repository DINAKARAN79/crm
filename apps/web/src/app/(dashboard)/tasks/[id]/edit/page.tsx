import { redirect } from "next/navigation";

export default function EditTaskPage({ params }: { params: { id: string } }) {
  redirect(`/follow-ups/${params.id}`);
}

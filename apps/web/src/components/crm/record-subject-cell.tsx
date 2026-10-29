import Link from "next/link";
import { cn } from "@/lib/utils";

export function RecordSubjectCell({
  href,
  subject,
  title,
  className,
}: {
  href: string;
  subject: string;
  title: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        "block max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap font-medium text-primary hover:underline sm:max-w-xs dark:text-sky-300",
        className,
      )}
    >
      {subject}
    </Link>
  );
}

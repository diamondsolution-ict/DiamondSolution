import { AdminLayout } from "@/components/AdminLayout";

export function AdminComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AdminLayout>
      <div className="card-luxury flex flex-col items-center gap-2 p-10 text-center">
        <p className="font-heading text-lg font-bold text-text-1">
          {title} — coming soon
        </p>
        <p className="text-sm text-text-3">{description}</p>
      </div>
    </AdminLayout>
  );
}

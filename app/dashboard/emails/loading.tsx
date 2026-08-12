import { Skeleton } from "@/components/ui/skeleton";

export default function EmailDashboardLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="正在加载邮件中心">
      <div className="border-b pb-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-8" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-72 max-w-[75vw]" />
          </div>
        </div>
      </div>
      <Skeleton className="h-11 w-[25rem] max-w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

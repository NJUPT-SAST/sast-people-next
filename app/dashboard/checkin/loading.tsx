import { Skeleton } from "@/components/ui/skeleton";

export default function CheckinLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="正在加载签到叫号">
      <div className="flex flex-col gap-3 border-b pb-3">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-6 w-24" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[420px] w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[260px] w-full" />
          <Skeleton className="h-[240px] w-full" />
        </div>
      </div>
    </div>
  );
}

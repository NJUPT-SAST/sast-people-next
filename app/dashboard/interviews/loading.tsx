import { Skeleton } from "@/components/ui/skeleton";

export default function InterviewsLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="正在加载面试管理">
      <div className="flex flex-col gap-2 border-b pb-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-3 border-y p-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full sm:w-72" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

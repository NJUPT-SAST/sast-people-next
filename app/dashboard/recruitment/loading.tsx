import { Skeleton } from "@/components/ui/skeleton";

export default function RecruitmentLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="正在加载成绩管理">
      <div className="space-y-2 border-b pb-4">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="space-y-3 border-y p-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full sm:w-72" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

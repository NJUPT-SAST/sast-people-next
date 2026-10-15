import { Skeleton } from "@/components/ui/skeleton";

export default function GradingFairnessLoading() {
  return (
    <div className="flex flex-col gap-4 px-4 pb-10 lg:px-6" aria-busy="true" aria-label="正在加载阅卷分析">
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

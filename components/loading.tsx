import { Skeleton } from './ui/skeleton';

/** 通用页面加载骨架：镜像页面头（标题 + 描述 + 操作）与一块内容卡片的结构，
    避免整页只有一个居中转圈的单薄感。 */
export function Loading() {
  return (
    <div
      className="flex w-full flex-col gap-5 lg:gap-7"
      aria-busy="true"
      aria-label="正在加载页面"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="hidden h-9 w-28 sm:block" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

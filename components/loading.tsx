import { Loader2 } from 'lucide-react';

export function Loading() {
  return (
    <div className="flex h-full min-h-20 w-full flex-col items-center justify-center gap-3">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-xs text-muted-foreground">加载中</p>
    </div>
  );
}
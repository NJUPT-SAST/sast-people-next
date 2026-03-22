import { Loader2 } from 'lucide-react';

export function Loading() {
  return (
    <div className="flex min-h-20 h-full w-full flex-col items-center justify-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">加载中...</p>
    </div>
  );
}

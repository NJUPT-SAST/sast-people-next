'use server';

import { Loader2 } from 'lucide-react';

export async function Loading() {
  return (
    <div className="w-full h-full flex flex-col justify-center items-center gap-3 min-h-20">
      <Loader2 className="animate-spin h-8 w-8 text-primary" />
      <p className="text-sm text-muted-foreground">加载中...</p>
    </div>
  );
}

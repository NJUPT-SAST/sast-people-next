"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function ReviewSheet({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(false);
    window.addEventListener("reviewRangeUpdated", handler);
    return () => window.removeEventListener("reviewRangeUpdated", handler);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          设置阅卷范围
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:w-3/4 sm:max-w-2xl overflow-y-auto p-4 sm:p-6 flex flex-col">
        <SheetHeader className="text-2xl font-semibold px-2 pt-2 pb-2">
          <SheetTitle>设置阅卷范围</SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-32">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

/** 流程选择器：切换后把 flowId 写进查询串（与 /dashboard/manage 的搜索框同一套做法）。 */
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GradingFairnessFlow } from "@/action/user-flow/grading-fairness/load";

export function FairnessFlowPicker({
  flows,
  selectedId,
}: {
  flows: GradingFairnessFlow[];
  selectedId: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={String(selectedId)}
      onValueChange={(value) => {
        startTransition(() => {
          router.push(`${pathname}?flowId=${value}`);
        });
      }}
    >
      <SelectTrigger className="w-full sm:w-[22rem]" aria-label="选择流程" disabled={isPending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {flows.map((flow) => (
          <SelectItem key={flow.id} value={String(flow.id)}>
            {flow.title}（{flow.observationCount} 条 · {flow.judgerCount} 名阅卷讲师）
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

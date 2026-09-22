"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EditProblems, type EditProblemsHandle } from "@/components/flow/operations/editProblems";
import { FlowEditor, type FlowEditorHandle } from "@/components/flow/operations/flowEditor";
import type { displayFlow } from "@/types/flow";
import type { fullStepType } from "@/types/step";
import type { InferSelectModel } from "drizzle-orm";
import type { problem } from "@/db/schema";

type ProblemRow = InferSelectModel<typeof problem>;
type ProblemStep = Pick<fullStepType, "id" | "title" | "description" | "fkFlowId" | "order">;

export function FlowEditWorkspace({
  data,
  steps,
  problemsByStep,
  defaultStepId,
}: {
  data: displayFlow;
  steps?: ProblemStep[];
  problemsByStep?: Record<number, ProblemRow[]>;
  defaultStepId?: number;
}) {
  const flowEditorRef = useRef<FlowEditorHandle>(null);
  const problemsEditorRef = useRef<EditProblemsHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const saveAll = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        flowEditorRef.current?.save(),
        problemsEditorRef.current?.save(),
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">编辑工作区</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              在这里完成流程信息、流程步骤和笔试题目的全部修改，最后统一保存。
            </p>
          </div>
          <span className="text-xs font-medium text-primary">未保存的修改只保留在当前页面</span>
        </div>
      </div>

      <FlowEditor ref={flowEditorRef} data={data} embedded hideSaveButton />
      {data.type === "recruitment" && steps && problemsByStep && defaultStepId !== undefined && (
        <EditProblems
          ref={problemsEditorRef}
          steps={steps}
          problemsByStep={problemsByStep}
          defaultStepId={defaultStepId}
          flowTypeId={data.id}
          hideSaveButton
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="hidden text-sm text-muted-foreground sm:block">流程信息{data.type === "recruitment" ? "、步骤和题目" : "和步骤"}将一起保存</p>
          <Button
            className="ml-auto min-w-40"
            onClick={() => toast.promise(saveAll(), {
              loading: "正在保存全部修改",
              success: "流程、步骤和题目已保存",
              error: "保存失败，请检查后重试",
            })}
            loading={isSaving}
            disabled={isSaving}
          >
            保存全部修改
          </Button>
        </div>
      </div>
    </div>
  );
}

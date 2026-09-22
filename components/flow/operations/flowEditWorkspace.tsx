"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
    <div className="space-y-6 pb-20">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard/flow"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回流程管理
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">编辑流程</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{data.title}</p>
        </div>
        <p className="text-xs text-muted-foreground">修改完成后点击右下角保存全部修改</p>
      </header>

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

      <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-8">
          <Button
            className="min-w-40 rounded-full px-5 shadow-lg shadow-primary/20"
            onClick={() => toast.promise(saveAll(), {
              loading: "正在保存全部修改",
              success: data.type === "recruitment" ? "流程、步骤和题目已保存" : "流程和步骤已保存",
              error: "保存失败，请检查后重试",
            })}
            loading={isSaving}
            disabled={isSaving}
          >
            保存全部修改
          </Button>
      </div>
    </div>
  );
}

"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Copy, FilePlus2, PlusIcon, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProblems } from "@/action/flow/problem/edit";
import { toast } from "sonner";
import { InferSelectModel } from "drizzle-orm";
import { problem, flowStep } from "@/db/schema";

type ProblemRow = InferSelectModel<typeof problem>;
type StepRow = Pick<InferSelectModel<typeof flowStep>, "id" | "title" | "description" | "fkFlowId" | "order">;

type LocalProblem = {
  id: number;
  title: string;
  score: number;
  fkFlowStepId: number;
};

const EditProblems = ({
  steps,
  problemsByStep,
  defaultStepId,
  flowTypeId,
}: {
  steps: StepRow[];
  problemsByStep: Record<number, ProblemRow[]>;
  defaultStepId: number;
  flowTypeId: number;
}) => {
  const selectedStepId = defaultStepId;
  const [localProblems, setLocalProblems] = useState<LocalProblem[]>(
    (problemsByStep[defaultStepId] ?? []).map((p) => ({ ...p })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tempIdRef = useRef(-1);
  const nextTempId = () => {
    tempIdRef.current -= 1;
    return tempIdRef.current;
  };

  const currentStep = steps.find((step) => step.id === selectedStepId);

  const addProblem = () => {
    setLocalProblems((prev) => [
      ...prev,
      {
        id: nextTempId(),
        title: "",
        score: 0,
        fkFlowStepId: selectedStepId,
      },
    ]);
  };

  const updateProblem = (problemId: number, updates: Partial<LocalProblem>) => {
    setLocalProblems((prev) =>
      prev.map((p) => (p.id === problemId ? { ...p, ...updates } : p)),
    );
  };

  const duplicateProblem = (index: number) => {
    const p = localProblems[index];
    setLocalProblems((prev) => [
      ...prev.slice(0, index + 1),
      { ...p, id: nextTempId(), title: p.title + " (副本)" },
      ...prev.slice(index + 1),
    ]);
  };

  const deleteProblem = (problemId: number) => {
    setLocalProblems((prev) => prev.filter((p) => p.id !== problemId));
  };

  const validateProblems = (): string | null => {
    if (!selectedStepId) return "当前笔试流程还没有可挂载题目的步骤";
    for (const p of localProblems) {
      if (!p.title.trim()) return "题目名称不能为空";
      if (!p.score || p.score <= 0) return "分数必须为大于 0 的数字";
      if (!Number.isInteger(p.score)) return "分数必须为整数";
    }
    if (localProblems.length === 0) return "至少需要一道题目";
    return null;
  };

  const handleSave = async () => {
    const error = validateProblems();
    if (error) {
      toast.error(error);
      return;
    }

    setIsSubmitting(true);
    const problemsForSave = {
      default: localProblems.map((p) => ({
        id: p.id,
        title: p.title.trim(),
        score: p.score,
        fkFlowStepId: selectedStepId,
      })),
    };

    toast.promise(
      updateProblems(selectedStepId, problemsForSave, flowTypeId).finally(() => {
        setIsSubmitting(false);
      }),
      {
        loading: "正在保存题目...",
        success: "题目已成功保存",
        error: "保存题目时出错",
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <CardTitle className="text-base sm:text-lg">编辑笔试题目</CardTitle>
              <p className="text-sm text-muted-foreground">
                维护这个笔试流程的一套题目。题目会用于阅卷范围选择和成绩统计。
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Button
                onClick={addProblem}
                variant="outline"
                disabled={isSubmitting || !selectedStepId}
                className="flex-1 sm:flex-none"
              >
                <PlusIcon />
                添加题目
              </Button>
              <Button
                onClick={handleSave}
                loading={isSubmitting}
                disabled={isSubmitting || !selectedStepId}
                className="flex-1 sm:flex-none"
              >
                <Save />
                保存
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  题目用于：{currentStep?.title ?? "未找到批卷环节"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {currentStep
                    ? "这个流程的所有笔试题目都会集中用于批卷和成绩统计"
                    : "请先确认流程中存在批卷环节"}
                </p>
              </div>
              <span className="text-sm text-muted-foreground">
                {localProblems.length} 道题目
              </span>
            </div>
          </div>
          {localProblems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-10 text-center">
              <FilePlus2 className="text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">当前笔试流程还没有题目</p>
                <p className="text-sm text-muted-foreground">
                  添加题目后填写名称和最高分数，再点击保存。
                </p>
              </div>
              <Button
                onClick={addProblem}
                variant="outline"
                disabled={isSubmitting || !selectedStepId}
              >
                <PlusIcon />
                添加第一道题
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {localProblems.map((p, index) => (
                <fieldset key={p.id} className="min-w-0 rounded-lg border p-4">
                  <legend className="px-2 text-sm font-medium text-muted-foreground">
                    题目 {index + 1}
                  </legend>
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor={`problem-name-${p.id}`}>题目名称</Label>
                      <Input
                        id={`problem-name-${p.id}`}
                        value={p.title}
                        onChange={(e) =>
                          updateProblem(p.id, { title: e.target.value })
                        }
                        placeholder="请输入题目名称"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`problem-maxScore-${p.id}`}>
                        最高分数
                      </Label>
                      <Input
                        id={`problem-maxScore-${p.id}`}
                        type="number"
                        value={p.score || ""}
                        onChange={(e) =>
                          updateProblem(p.id, {
                            score: e.target.value === "" ? 0 : Number(e.target.value),
                          })
                        }
                        placeholder="请输入最高分数"
                        min={0}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => duplicateProblem(index)}
                        disabled={isSubmitting}
                        title="复制题目"
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteProblem(p.id)}
                        disabled={isSubmitting}
                        title="删除题目"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export { EditProblems };

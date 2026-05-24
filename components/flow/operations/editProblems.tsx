"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Copy, PlusIcon, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProblems } from "@/action/flow/problem/edit";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [selectedStepId, setSelectedStepId] = useState<number>(defaultStepId);
  const [localProblems, setLocalProblems] = useState<LocalProblem[]>(
    (problemsByStep[defaultStepId] ?? []).map((p) => ({ ...p })),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tempIdRef = useRef(-1);
  const nextTempId = () => {
    tempIdRef.current -= 1;
    return tempIdRef.current;
  };

  const currentStep = steps.find((s) => s.id === selectedStepId);
  const problemCount = (problemsByStep[selectedStepId] ?? []).length;

  const switchStep = (value: string) => {
    const stepId = Number(value);
    setSelectedStepId(stepId);
    setLocalProblems(
      (problemsByStep[stepId] ?? []).map((p) => ({ ...p })),
    );
  };

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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle>题目列表</CardTitle>
              <Select value={String(selectedStepId)} onValueChange={switchStep}>
                <SelectTrigger className="w-44 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {steps.map((step) => (
                    <SelectItem key={step.id} value={String(step.id)}>
                      {step.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">
                {localProblems.length} 道题目
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={addProblem}
                variant="outline"
                disabled={isSubmitting}
              >
                <PlusIcon className="w-4 h-4 mr-2" />
                添加题目
              </Button>
              <Button
                onClick={handleSave}
                loading={isSubmitting}
                disabled={isSubmitting}
              >
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {localProblems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无题目，点击上方【添加题目】按钮创建
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {localProblems.map((p, index) => (
                <fieldset key={p.id} className="border p-4 rounded-lg">
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
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteProblem(p.id)}
                        disabled={isSubmitting}
                        title="删除题目"
                      >
                        <Trash2 className="w-4 h-4" />
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

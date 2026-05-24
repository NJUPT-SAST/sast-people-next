"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Copy, PlusIcon, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProblems } from "@/action/flow/problem/edit";
import { toast } from "sonner";

type Problem = {
  id: number;
  title: string;
  score: number;
  fkFlowStepId: number;
};

const EditProblems = ({
  problems,
  stepList,
  currentStepId,
  flowTypeId,
}: {
  problems: Problem[];
  stepList: {
    id: number;
    title: string;
    description: string | null;
    fkFlowId: number;
    order: number;
    problemCount: number;
  }[];
  currentStepId: number;
  flowTypeId: number;
}) => {
  const [localProblems, setLocalProblems] = useState<Problem[]>(problems);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const tempIdRef = useRef(-1);
  const nextTempId = () => {
    tempIdRef.current -= 1;
    return tempIdRef.current;
  };

  const currentStepTitle =
    stepList.find((s) => s.id === currentStepId)?.title ?? "当前步骤";

  const addProblem = () => {
    const newProblem: Problem = {
      id: nextTempId(),
      title: "",
      score: 0,
      fkFlowStepId: currentStepId,
    };
    setLocalProblems((prev) => [...prev, newProblem]);
  };

  const updateProblem = (problemId: number, updates: Partial<Problem>) => {
    setLocalProblems((prev) =>
      prev.map((p) => (p.id === problemId ? { ...p, ...updates } : p))
    );
  };

  const duplicateProblem = (index: number) => {
    const problem = localProblems[index];
    const newProblem: Problem = {
      ...problem,
      id: nextTempId(),
      title: problem.title + " (副本)",
    };
    setLocalProblems((prev) => [
      ...prev.slice(0, index + 1),
      newProblem,
      ...prev.slice(index + 1),
    ]);
  };

  const deleteProblem = (problemId: number) => {
    setLocalProblems((prev) => prev.filter((p) => p.id !== problemId));
  };

  const validateProblems = (): string | null => {
    for (const p of localProblems) {
      if (!p.title.trim()) {
        return "题目名称不能为空";
      }
      if (!p.score || p.score <= 0) {
        return "分数必须为大于 0 的数字";
      }
      if (!Number.isInteger(p.score)) {
        return "分数必须为整数";
      }
    }
    if (localProblems.length === 0) {
      return "至少需要一道题目";
    }
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
      default: localProblems.map((problem) => ({
        id: problem.id,
        title: problem.title.trim(),
        score: problem.score,
        fkFlowStepId: currentStepId,
      })),
    };

    toast.promise(
      updateProblems(currentStepId, problemsForSave, flowTypeId).finally(() => {
        setIsSubmitting(false);
      }),
      {
        loading: "正在保存题目...",
        success: "题目已成功保存",
        error: "保存题目时出错",
      }
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>题目列表 — {currentStepTitle}</CardTitle>
              <CardDescription>{localProblems.length} 道题目</CardDescription>
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
              <Button onClick={handleSave} loading={isSubmitting} disabled={isSubmitting}>
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {localProblems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无题目，点击上方"添加题目"按钮创建
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {localProblems.map((problem, index) => (
                <fieldset key={problem.id} className="border p-4 rounded-lg">
                  <legend className="px-2 text-sm font-medium text-muted-foreground">
                    题目 {index + 1}
                  </legend>
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label htmlFor={`problem-name-${problem.id}`}>
                        题目名称
                      </Label>
                      <Input
                        id={`problem-name-${problem.id}`}
                        value={problem.title}
                        onChange={(e) =>
                          updateProblem(problem.id, {
                            title: e.target.value,
                          })
                        }
                        placeholder="请输入题目名称"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`problem-maxScore-${problem.id}`}>
                        最高分数
                      </Label>
                      <Input
                        id={`problem-maxScore-${problem.id}`}
                        type="number"
                        value={problem.score || ""}
                        onChange={(e) =>
                          updateProblem(problem.id, {
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
                        onClick={() => deleteProblem(problem.id)}
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

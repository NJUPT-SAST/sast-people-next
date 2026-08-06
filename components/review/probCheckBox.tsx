'use client';

import { Dispatch, SetStateAction } from 'react';

import { displayProblemType, selectProbType } from '@/types/problem';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

interface ProbCheckBoxProps {
  probList: displayProblemType[];
  selectedProbs: selectProbType['problemList'];
  setSelectedProbs: Dispatch<SetStateAction<selectProbType['problemList']>>;
  handleSave: () => void;
}

const ProbCheckBox: React.FC<ProbCheckBoxProps> = ({
  probList,
  selectedProbs,
  setSelectedProbs,
  handleSave,
}) => {
  const safeProbList = Array.isArray(probList) ? probList : [];
  const safeSelectedProbs = Array.isArray(selectedProbs) ? selectedProbs : [];
  const totalScore = safeSelectedProbs.reduce((sum, problem) => sum + problem.maxPoint, 0);
  const allSelected =
    safeProbList.length > 0 && safeSelectedProbs.length === safeProbList.length;

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedProbs([]);
      return;
    }

    setSelectedProbs(
      safeProbList.map((problem) => ({
        id: problem.id,
        name: problem.title,
        maxPoint: problem.score,
      })),
    );
  };

  if (!safeProbList.length) {
    return (
      <div className="border-y border-dashed px-4 py-4 text-sm text-muted-foreground">
        当前流程下没有可用于阅卷的题目。
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">已选 {safeSelectedProbs.length} 题</Badge>
          <Badge variant="outline">总分 {totalScore} 分</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToggleAll}
          >
            {allSelected ? '取消全选' : '全选'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedProbs([])}
            disabled={safeSelectedProbs.length === 0}
          >
            清空
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {safeProbList.map((problem) => {
          const checked = safeSelectedProbs.some((item) => item.id === problem.id);

          return (
            <label
              key={problem.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-4 transition-colors hover:bg-muted/20"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => {
                  setSelectedProbs((prev) => {
                    if (value) {
                      return [
                        ...prev.filter((item) => item.id !== problem.id),
                        {
                          id: problem.id,
                          name: problem.title,
                          maxPoint: problem.score,
                        },
                      ];
                    }

                    return prev.filter((item) => item.id !== problem.id);
                  });
                }}
              />
              <div className="flex flex-1 flex-col gap-1">
                <Label className="cursor-pointer text-sm font-medium">
                  {problem.title}
                </Label>
                <p className="text-xs text-muted-foreground">
                  题目 ID: {problem.id}
                </p>
              </div>
              <Badge variant="outline">{problem.score} 分</Badge>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={handleSave}>
          保存范围
        </Button>
      </div>
    </div>
  );
};

export default ProbCheckBox;

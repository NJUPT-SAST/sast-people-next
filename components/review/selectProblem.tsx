'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Loading } from '@/components/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProblems as getProblems } from '@/hooks/useProblemList';
import { useStepWithProblem as getStepWithProblem } from '@/hooks/useStepWithProblem';
import {
  displayProblemType,
  selectProbSchema,
  selectProbType,
} from '@/types/problem';
import { displayUserFlow } from '@/types/userflow';

import { Badge } from '../ui/badge';
import ProbCheckBox from './probCheckBox';

const readStoredRange = (): selectProbType | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const selectedProbs = localStorage.getItem('people_selectedProbs');

  if (!selectedProbs) {
    return null;
  }

  const result = selectProbSchema.safeParse(JSON.parse(selectedProbs));
  return result.success ? result.data : null;
};

const SelectProblem = ({
  flowList,
}: {
  flowList: Partial<displayUserFlow>[];
}) => {
  const storedRange = useMemo(readStoredRange, []);
  const [probList, setProbList] = useState<displayProblemType[] | null>(null);
  const [selectedProbs, setSelectedProbs] = useState<
    selectProbType['problemList']
  >(storedRange?.problemList ?? []);
  const [selectedFlow, setSelectedFlow] = useState<string>(
    storedRange?.flowTypeId?.toString() ?? '',
  );
  const [stepId, setStepId] = useState<number | undefined>(storedRange?.stepId);
  const [isLoadingProblems, setIsLoadingProblems] = useState(false);

  const currentFlow = flowList.find(
    (flow) => flow.id?.toString() === selectedFlow,
  );

  const loadProblemsForFlow = async (
    flowId: string,
    nextSelectedProbs?: selectProbType['problemList'],
  ) => {
    setSelectedFlow(flowId);
    setIsLoadingProblems(true);

    try {
      const flowSteps = await getStepWithProblem(Number.parseInt(flowId, 10));

      if (!flowSteps?.stepWithProblemId) {
        setStepId(undefined);
        setProbList([]);
        setSelectedProbs([]);
        toast.error('当前流程下没有可阅卷题目');
        return;
      }

      setStepId(flowSteps.stepWithProblemId);

      const nextProbList = await getProblems(flowSteps.stepWithProblemId);
      setProbList(nextProbList);

      if (nextSelectedProbs) {
        const selectedIds = new Set(nextSelectedProbs.map((item) => item.id));
        setSelectedProbs(
          nextProbList
            .filter((problem) => selectedIds.has(problem.id))
            .map((problem) => ({
              id: problem.id,
              name: problem.title,
              maxPoint: problem.score,
            })),
        );
        return;
      }

      setSelectedProbs([]);
    } catch {
      setProbList([]);
      setSelectedProbs([]);
      toast.error('加载题目失败，请稍后重试');
    } finally {
      setIsLoadingProblems(false);
    }
  };

  useEffect(() => {
    if (!storedRange?.flowTypeId) {
      return;
    }

    void loadProblemsForFlow(
      storedRange.flowTypeId.toString(),
      storedRange.problemList,
    );
  }, [storedRange]);

  const handleUpdateStorageProbs = () => {
    const result = selectProbSchema.safeParse({
      flowTypeId: Number.parseInt(selectedFlow, 10),
      flowTitle: currentFlow?.title,
      stepId,
      problemList: selectedProbs,
    });

    if (!result.success) {
      localStorage.removeItem('people_selectedProbs');
      window.dispatchEvent(new Event('reviewRangeUpdated'));
      toast.error('保存失败');
      return;
    }

    localStorage.setItem('people_selectedProbs', JSON.stringify(result.data));
    window.dispatchEvent(new Event('reviewRangeUpdated'));
    toast.success('保存成功');
  };

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">选择评卷流程</p>
          <p className="text-xs text-muted-foreground">
            先选择试卷所属流程，再勾选本次需要批改的题目范围。
          </p>
        </div>
        <Select
          value={selectedFlow || undefined}
          onValueChange={(value) => void loadProblemsForFlow(value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="请选择试卷" />
          </SelectTrigger>
          <SelectContent>
            {flowList.map((flow) => (
              <SelectItem key={flow.id} value={flow?.id?.toString() || ''}>
                {flow.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {currentFlow?.title && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{currentFlow.title}</Badge>
            <Badge variant="outline">已选 {selectedProbs.length} 题</Badge>
          </div>
        )}
      </div>
      {isLoadingProblems ? <Loading /> : null}
      {!isLoadingProblems && probList ? (
        <ProbCheckBox
          probList={probList}
          selectedProbs={selectedProbs}
          setSelectedProbs={setSelectedProbs}
          handleSave={handleUpdateStorageProbs}
        />
      ) : null}
    </div>
  );
};

export default SelectProblem;

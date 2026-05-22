'use client';

import { useState } from 'react';
import { SelectFlow } from '@/components/recruitment/selectFlow';
import { DataTable } from '@/components/recruitment/table';
import { columns } from '@/components/recruitment/columns';
import { calScore } from '@/action/user-flow/user-point/calScore';
import { Loading } from '@/components/loading';
import { displayFlow } from '@/types/flow';

type ExamResult = Awaited<ReturnType<typeof calScore>>;

export const RecruitmentContent = ({
  flowTypes,
  initialData,
  defaultFlowId,
}: {
  flowTypes: displayFlow[];
  initialData: ExamResult;
  defaultFlowId?: string;
}) => {
  const [flowId, setFlowId] = useState(defaultFlowId);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  const handleFlowChange = async (value: string) => {
    setFlowId(value);
    setLoading(true);
    try {
      const result = await calScore(parseInt(value));
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const averageScore =
    data.length === 0
      ? 0
      : data.reduce(
          (acc, cur) => acc + parseInt(cur.totalScore ?? '0', 10),
          0,
        ) / data.length;

  return (
    <>
      <SelectFlow
        flowTypes={flowTypes}
        defaultFlowTypeId={flowId}
        onChange={handleFlowChange}
      />
      {flowId ? (
        loading ? (
          <Loading />
        ) : (
          <>
            <p className="text-muted-foreground">
              总人数：{data.length} &nbsp; 平均分：
              {averageScore.toFixed(2)}
            </p>
            <DataTable
              columns={columns}
              data={data}
              flowTypeId={parseInt(flowId)}
            />
          </>
        )
      ) : (
        <p className="text-muted-foreground">暂无招新流程</p>
      )}
    </>
  );
};

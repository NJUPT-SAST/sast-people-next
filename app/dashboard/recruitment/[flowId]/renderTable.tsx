import { calScore } from "@/action/user-flow/user-point/calScore";
import { columns } from "@/components/recruitment/columns";
import { DataTable } from "@/components/recruitment/table";
import React from "react";

export const RenderTable = async ({ flowId }: { flowId: string }) => {
  const data = await calScore(parseInt(flowId));
  const averageScore =
    data.length === 0
      ? 0
      : data.reduce(
          (acc, cur) => acc + parseInt(cur.totalScore ?? "0", 10),
          0,
        ) / data.length;
  console.log(data);
  return (
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
  );
};

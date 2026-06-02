import { FlowCard } from "@/components/userFlow/flowCard";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useMyFlowList as getMyFlowList } from "@/hooks/useMyFlowList";
import { Workflow } from "lucide-react";

export const FlowList = async () => {
  const myFlowList = await getMyFlowList();
  const safeFlowList = (Array.isArray(myFlowList) ? myFlowList : []).filter(
    (flow) => flow && typeof flow.id === "number",
  );

  if (safeFlowList.length === 0) {
    return (
      <Card className="w-full border-dashed">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="rounded-full bg-muted/50 p-4 mb-4">
            <Workflow className="h-12 w-12 text-muted-foreground/40" />
          </div>
          <h3 className="text-lg font-medium">暂无流程</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            你还没有报名任何流程，点击右上角「提交报名」按钮开始你的招新之旅。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {safeFlowList.map((flow) => (
        <FlowCard key={flow.id} flow={flow} />
      ))}
    </>
  );
};

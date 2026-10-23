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
      <Card className="w-full border-dashed border-border bg-card/50">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center sm:py-16">
          <span className="grid size-14 place-items-center rounded-2xl bg-muted text-primary ring-1 ring-border/60">
            <Workflow className="size-6" />
          </span>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold tracking-tight">暂无流程</h3>
            <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
              你还没有报名任何流程，点击右上角「提交报名」按钮开始你的招新之旅。
            </p>
          </div>
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

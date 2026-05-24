import { FlowCard } from "@/components/userFlow/flowCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyFlowList as getMyFlowList } from "@/hooks/useMyFlowList";
import { Suspense } from "react";
import { Workflow } from "lucide-react";

export const FlowList = async () => {
  const myFlowList = await getMyFlowList();

  if (myFlowList.length === 0) {
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
      {myFlowList.map((flow) => (
        <Suspense
          fallback={
            <Card className="h-[220px]">
              <CardHeader>
                <CardTitle hidden>Loading</CardTitle>
                <Skeleton className="w-[100px] h-[20px]" />
              </CardHeader>
              <CardContent>
                <Skeleton className="w-full h-[76px]" />
                <Skeleton className="w-full h-[40px] mt-3" />
              </CardContent>
            </Card>
          }
          key={flow.id}
        >
          <FlowCard key={flow.id} flow={flow} />
        </Suspense>
      ))}
    </>
  );
};

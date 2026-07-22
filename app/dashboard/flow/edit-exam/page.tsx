import { Loading } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EditProblemsServer } from "./editProblems";
import getFlowInfo from "@/hooks/useFlowInfo";
import { redirect } from "next/navigation";

export default async function EditExamPage({
  searchParams,
}: {
  searchParams: Promise<{ id: string }>;
}) {
  const awaitedSearchParams = await searchParams;
  const flowInfo = await getFlowInfo(Number(awaitedSearchParams.id));
  if (flowInfo.type !== "recruitment") {
    redirect("/dashboard/flow");
  }
  return (
    <>
      <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/dashboard/flow" className="min-w-0">
          <Button variant="ghost" className="h-10 px-2 sm:h-9">
            <h1 className="inline-flex items-center gap-2 text-lg font-semibold md:text-2xl">
              <ArrowLeftIcon className="size-5 shrink-0" /> 编辑考试
            </h1>
          </Button>
        </Link>
        <p className="truncate px-2 text-sm text-muted-foreground sm:max-w-[50%] sm:text-right">
          {flowInfo.title}
        </p>
      </div>
      <div>
        <Suspense fallback={<Loading />}>
          <EditProblemsServer id={awaitedSearchParams.id} />
        </Suspense>
      </div>
    </>
  );
}

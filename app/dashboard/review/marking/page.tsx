import React, { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";
import { MarkProblemTableServer } from "./markProblemTable";
import { Loading } from "@/components/loading";

const Marking = async ({
  searchParams,
}: {
  searchParams: Promise<{
    user: string;
  }>;
}) => {
  const awaitedSearchParams = await searchParams;
  return (
    <>
      <div className="flex items-center justify-between gap-3 pb-2">
        <Link href="/dashboard/review" className="min-w-0">
          <Button variant="ghost" className="h-10 px-2 sm:h-9">
            <h1 className="inline-flex items-center gap-2 text-lg font-semibold md:text-2xl">
              <ArrowLeftIcon className="size-5 shrink-0" /> 准备阅卷
            </h1>
          </Button>
        </Link>
      </div>
      <div>
        <Suspense fallback={<Loading />}>
          <MarkProblemTableServer user={awaitedSearchParams.user} />
        </Suspense>
      </div>
    </>
  );
};

export default Marking;

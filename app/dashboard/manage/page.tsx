import { PageTitle } from "@/components/route";
import { verifySession } from "@/lib/dal";
import React, { Suspense } from "react";
import { ManageTableServer } from "./manageTable";
import { Skeleton } from "@/components/ui/skeleton";

const Manage = async ({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string }>;
}) => {
  const awaitedSearchParams = await searchParams;
  const session = await verifySession();
  return (
    <>
      <div className="flex items-center justify-between">
        <PageTitle role={session.role} />
      </div>
      <div>
        <Suspense
          fallback={
            <div>
              <Skeleton className="w-[300px] h-[50px]" />
              <Skeleton className="w-full h-[220px] mt-3" />
            </div>
          }
        >
          <ManageTableServer {...awaitedSearchParams} />
        </Suspense>
      </div>
    </>
  );
};

export default Manage;

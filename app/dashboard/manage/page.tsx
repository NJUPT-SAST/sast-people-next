import { PageHeader, PageTitle } from "@/components/route";
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
      <PageHeader>
        <PageTitle role={session.role} />
      </PageHeader>
      <div>
        <Suspense
          fallback={
            <div>
              <Skeleton className="h-[50px] w-[300px]" />
              <Skeleton className="mt-3 h-[220px] w-full" />
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

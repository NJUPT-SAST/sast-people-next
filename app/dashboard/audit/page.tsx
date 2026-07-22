import { AuditLogTable } from "@/components/audit/audit-log-table";
import { PageHeader, PageTitle } from "@/components/route";
import { Skeleton } from "@/components/ui/skeleton";
import { verifyRole } from "@/lib/dal";
import { listOperationAudit } from "@/lib/operation-audit-list";
import { Suspense } from "react";

const AuditPage = async ({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    actor?: string;
    action?: string;
    actionGroup?: string;
    resourceType?: string;
    from?: string;
    to?: string;
  }>;
}) => {
  const awaitedSearchParams = await searchParams;
  const session = await verifyRole(3);

  return (
    <>
      <PageHeader>
        <PageTitle role={session.role} />
      </PageHeader>
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[74px] w-full" />
            <Skeleton className="h-[360px] w-full" />
          </div>
        }
      >
        <AuditLogContent {...awaitedSearchParams} />
      </Suspense>
    </>
  );
};

const AuditLogContent = async (
  props: Awaited<Parameters<typeof listOperationAudit>[0]>,
) => {
  const { logs, totalCount, filters } = await listOperationAudit(props);

  return (
    <AuditLogTable logs={logs} totalCount={totalCount} filters={filters} />
  );
};

export default AuditPage;

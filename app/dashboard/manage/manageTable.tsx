import { ManageTable } from "@/components/manage/manageTable";
import { LinkLogin } from "@/components/linkLogin";
import { useUserList as getUserList } from "@/hooks/useUserList";
import { verifySession } from "@/lib/dal";
import { MissingLinkAdminAccessTokenError } from "@/lib/link/session";

export const ManageTableServer = async (props: {
  page?: string;
  pageSize?: string;
  search?: string;
}) => {
  const session = await verifySession();
  const page = Number(props.page) || 1;
  const pageSize = Number(props.pageSize) || 10;
  const search = props.search || "";

  let userList: Awaited<ReturnType<typeof getUserList>> | null = null;
  let needsAdminAuthorization = false;
  try {
    userList = await getUserList({
      page,
      pageSize,
      search,
    });
  } catch (error) {
    if (error instanceof MissingLinkAdminAccessTokenError) {
      needsAdminAuthorization = true;
    } else {
      throw error;
    }
  }

  if (needsAdminAuthorization) {
    return (
      <div className="max-w-md space-y-4 rounded-md border bg-card p-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">需要 Link 管理授权</h2>
          <p className="text-sm text-muted-foreground">
            授权后才能读取用户列表和执行管理操作。
          </p>
        </div>
        <LinkLogin isBinding={false} purpose="admin" />
      </div>
    );
  }

  return (
    <ManageTable
      users={userList?.users ?? []}
      totalCount={userList?.totalCount ?? 0}
      totalPages={userList?.totalPages ?? 0}
      search={search}
      currentPage={page}
      role={session.role}
    />
  );
};

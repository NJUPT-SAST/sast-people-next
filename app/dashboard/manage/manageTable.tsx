import { ManageTable } from "@/components/manage/manageTable";
import { useUserList as getUserList } from "@/hooks/useUserList";
import { verifySession } from "@/lib/dal";

export const ManageTableServer = async (props: {
  page?: string;
  pageSize?: string;
  search?: string;
}) => {
  const session = await verifySession();
  const page = Number(props.page) || 1;
  const pageSize = Number(props.pageSize) || 10;
  const search = props.search || "";

  const userList = await getUserList({ page, pageSize, search });

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

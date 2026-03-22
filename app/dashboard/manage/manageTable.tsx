import { ManageTable } from "@/components/manage/manageTable";
import { useUserList as getUserList } from "@/hooks/useUserList";

export const ManageTableServer = async (props: {
  page?: string;
  pageSize?: string;
  search?: string;
}) => {
  const page = Number(props.page) || 1;
  const pageSize = Number(props.pageSize) || 10;
  const search = props.search || "";

  const { users, totalCount, totalPages } = await getUserList({
    page,
    pageSize,
    search,
  });

  return (
    <>
      <ManageTable
        users={users}
        totalCount={totalCount}
        totalPages={totalPages}
        search={search}
        currentPage={page}
      />
    </>
  );
};

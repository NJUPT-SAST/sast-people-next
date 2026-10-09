import CheckinConsole from "@/components/recruitment/checkin/checkinConsole";
import { getVenueSnapshot } from "@/action/user-flow/checkin";
import { verifySession } from "@/lib/dal";
import { isOfficeDepartmentKey } from "@/lib/authz";

/**
 * 办公部门共享的签到叫号台：一个签到台 + 各部门面试位与队列。
 * 访问权限由 `app/dashboard/checkin/layout.tsx` 收敛（所有部长）。
 */
export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string; dept?: string }>;
}) {
  const { round: roundParam, dept } = await searchParams;
  const round = Number(roundParam) === 2 ? 2 : 1;
  const venue = await getVenueSnapshot(round);

  /* 没显式指定部门时默认选中自己的部门（仅办公部门；管理员等用「全部」） */
  const session = await verifySession();
  const ownDept = isOfficeDepartmentKey(session.department) ? session.department : null;

  return (
    <CheckinConsole
      initial={venue}
      initialDept={dept && dept.length > 0 ? dept : ownDept}
    />
  );
}

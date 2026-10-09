import QueueBoard from "@/components/recruitment/checkin/queueBoard";
import { getVenueSnapshot } from "@/action/user-flow/checkin";

export const dynamic = "force-dynamic";

/**
 * 大屏叫号页：多部门同一个面试间，整屏展示各部门的面试位与等候队列。
 * 独立于 `/dashboard` 外壳，用办公部门部长/管理员会话打开并常驻；
 * 数据由页面初始渲染 + 客户端每 3s 轮询 `/api/interview/checkin`。
 */
export default async function CheckinBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ round?: string }>;
}) {
  const { round: roundParam } = await searchParams;
  const round = Number(roundParam) === 2 ? 2 : 1;
  const venue = await getVenueSnapshot(round);

  return <QueueBoard initial={venue} round={round} />;
}

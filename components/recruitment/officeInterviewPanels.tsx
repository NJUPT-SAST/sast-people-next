import { UserCheck } from "lucide-react";
import type {
  PendingSlotChangeRow,
  SecondChoiceCandidateRow,
} from "@/action/user-flow/office-interview";
import { PendingSlotChangePanel } from "@/components/recruitment/pendingSlotChangePanel";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { departmentLabel } from "@/const/department";
import dayjs from "@/lib/dayjs";

/* progress_status → 展示文案（与面试工作台的候选人状态口径一致） */
const PROGRESS_LABELS: Record<string, string> = {
  not_started: "未开始",
  ongoing: "进行中",
  passed: "已通过",
  failed: "未通过",
  withdrawn: "已退回",
};

/**
 * 办公类部门面试工作台的补充面板：
 * 1) 第二志愿填本部门的候选人（只读）；
 * 2) 本部门待审批的面试时段变更申请。
 * 两个列表为空时整块不渲染，非办公部门不会看到任何内容。
 */
export function OfficeInterviewPanels({
  secondChoiceRows,
  pendingSlotRows,
}: {
  secondChoiceRows: SecondChoiceCandidateRow[];
  pendingSlotRows: PendingSlotChangeRow[];
}) {
  if (secondChoiceRows.length === 0 && pendingSlotRows.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 space-y-4">
      {secondChoiceRows.length > 0 && (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <UserCheck
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="text-sm font-medium">第二志愿意向本部门的候选人</h2>
            <Badge variant="outline">{secondChoiceRows.length} 人</Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            这些候选人把本部门填为第二志愿，仅供面试参考，不在此处调整状态。
          </p>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>学号</TableHead>
                  <TableHead>第一志愿部门</TableHead>
                  <TableHead>阶段</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>面试时段</TableHead>
                  <TableHead>报名时间</TableHead>
                  <TableHead>流程名称</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secondChoiceRows.map((row) => (
                  <TableRow key={row.userFlowId}>
                    <TableCell className="font-medium">
                      {row.candidateName ?? "未知成员"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.candidateStudentId ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {departmentLabel(row.firstChoiceDepartment)}
                    </TableCell>
                    {/* user_flow.round 是候选人当前所处的面试阶段：1=一面，2=二面 */}
                    <TableCell>
                      {row.round === 1 ? "一面" : row.round === 2 ? "二面" : "-"}
                    </TableCell>
                    <TableCell>
                      {row.progressStatus
                        ? (PROGRESS_LABELS[row.progressStatus] ??
                          row.progressStatus)
                        : "-"}
                    </TableCell>
                    <TableCell>{row.interviewSlot ?? "未选择"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {dayjs(row.createdAt).format("YYYY-MM-DD HH:mm")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.flowTitle}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      <PendingSlotChangePanel rows={pendingSlotRows} />
    </div>
  );
}

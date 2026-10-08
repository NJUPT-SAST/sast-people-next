"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildOfficeRoundOneRoster,
  officeChoiceLabel,
  officeRoundOneAverageScore,
  type OfficeRoundOneRosterCandidate,
} from "@/lib/office-round-one-roster";

/**
 * 「查看一面名单」：确认一面后工作台不再提供「结束一面」，改为只读回看这份名单。
 * 结论在确认一面时确定；分数按当前记录展示（确认后仍可能补录），与导出的 CSV 同一份推导。
 */
export function OfficeRoundOneRosterDialog({
  open,
  onOpenChange,
  flowTitle,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowTitle: string;
  candidates: OfficeRoundOneRosterCandidate[];
}) {
  const rows = buildOfficeRoundOneRoster(candidates);
  const passed = rows.filter((row) => row.passed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>一面名单</DialogTitle>
          <DialogDescription>
            {flowTitle} · 结论在确认一面时确定，分数按当前记录展示。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>通过 {passed}</span>
          <span>不通过 {rows.length - passed}</span>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            该流程还没有一面名单（确认一面后生成）。
          </p>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>学号</TableHead>
                  <TableHead>志愿</TableHead>
                  <TableHead>一面得分</TableHead>
                  <TableHead>结论</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const average = officeRoundOneAverageScore(row.scores);
                  return (
                    <TableRow key={row.userFlowId}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.studentId ?? "—"}
                      </TableCell>
                      <TableCell>{officeChoiceLabel(row.choice) || "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {average === null ? "—" : average}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            row.passed ? "text-primary" : "text-destructive"
                          }
                        >
                          {row.passed ? "通过" : "不通过"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

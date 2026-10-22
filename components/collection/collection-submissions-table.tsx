"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCollectionSubmission } from "@/action/collection";
import type { CollectionExtraField } from "@/const/collection";
import { departmentLabel } from "@/const/department";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CollectionSubmissionRow = {
  id: number;
  name: string;
  studentId: string;
  category: string;
  clubName: string;
  birthMonth: string;
  politicalStatus: string;
  college: string;
  className: string;
  enrollmentYear: number;
  graduationYear: number;
  department: string | null;
  extraAnswers: Record<string, string>;
  updatedAtLabel: string;
};

export function CollectionSubmissionsTable({
  formId,
  rows,
  extraFields,
}: {
  formId: number;
  rows: CollectionSubmissionRow[];
  extraFields: CollectionExtraField[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<CollectionSubmissionRow | null>(null);

  const keyword = query.trim().toLowerCase();
  const filtered = keyword
    ? rows.filter((row) =>
        [
          row.name,
          row.studentId,
          row.category,
          row.clubName,
          row.birthMonth,
          row.politicalStatus,
          row.college,
          row.className,
          String(row.enrollmentYear),
          String(row.graduationYear),
          departmentLabel(row.department),
          ...Object.values(row.extraAnswers),
        ].some((value) => value.toLowerCase().includes(keyword)),
      )
    : rows;

  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      const result = await deleteCollectionSubmission(formId, deleting.id);
      if (!result.success) throw new Error(result.message);
      toast.success("填写记录已删除");
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索姓名、学号、学院、班级…"
            className="pl-8"
            aria-label="搜索填写记录"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          显示 {filtered.length} / {rows.length} 条
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          还没有人填写。
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          没有匹配的填写记录。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1240px]">
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>学号</TableHead>
                <TableHead>类别</TableHead>
                <TableHead>社团名称</TableHead>
                <TableHead>出生年月</TableHead>
                <TableHead>政治面貌</TableHead>
                <TableHead>所在学院</TableHead>
                <TableHead>所在班级</TableHead>
                <TableHead>入学年份</TableHead>
                <TableHead>预计毕业年份</TableHead>
                {extraFields.map((field) => (
                  <TableHead key={field.id}>{field.label}</TableHead>
                ))}
                <TableHead>填写人部门</TableHead>
                <TableHead>最后更新</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.studentId}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.clubName}</TableCell>
                  <TableCell>{row.birthMonth}</TableCell>
                  <TableCell>{row.politicalStatus}</TableCell>
                  <TableCell>{row.college}</TableCell>
                  <TableCell>{row.className}</TableCell>
                  <TableCell>{row.enrollmentYear}</TableCell>
                  <TableCell>{row.graduationYear}</TableCell>
                  {extraFields.map((field) => (
                    <TableCell key={field.id}>
                      {row.extraAnswers[field.id] ?? ""}
                    </TableCell>
                  ))}
                  <TableCell>{departmentLabel(row.department)}</TableCell>
                  <TableCell className="whitespace-nowrap">{row.updatedAtLabel}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      title="删除填写记录"
                      aria-label={`删除 ${row.name} 的填写记录`}
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这条填写记录？</DialogTitle>
            <DialogDescription>
              将删除 {deleting?.name ?? "该成员"} 的填写记录，删除后不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button type="button" variant="destructive" loading={pending} onClick={remove}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

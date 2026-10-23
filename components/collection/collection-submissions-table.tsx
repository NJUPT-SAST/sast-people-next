"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCollectionSubmission } from "@/action/collection";
import { returnCollectionSubmission } from "@/action/collection-return";
import {
  formatCollectionAnswer,
  type CollectionExtraAnswers,
  type CollectionExtraField,
} from "@/const/collection";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

export type CollectionSubmissionRow = {
  id: number;
  fkUserId: number;
  department: string | null;
  extraAnswers: CollectionExtraAnswers;
  returnedAt: Date | null;
  returnNote: string | null;
  updatedAtLabel: string;
  /** Link 姓名；没有姓名字段时用于标注填写人 */
  submitterName: string | null;
};

const fieldValueLabel = (
  field: CollectionExtraField,
  answers: CollectionExtraAnswers,
) => {
  if (field.fixedValue) return field.fixedValue;
  const value = formatCollectionAnswer(answers[field.id]) ?? "";
  return field.type === "rating" && value ? `${value} 星` : value;
};

const rowDisplayName = (
  row: CollectionSubmissionRow,
  nameField: CollectionExtraField | undefined,
) => {
  const name =
    nameField && typeof row.extraAnswers[nameField.id] === "string"
      ? String(row.extraAnswers[nameField.id])
      : "";
  return name || row.submitterName || `用户 #${row.fkUserId}`;
};

export function CollectionSubmissionsTable({
  formId,
  rows,
  fields,
  canReturn = true,
}: {
  formId: number;
  rows: CollectionSubmissionRow[];
  fields: CollectionExtraField[];
  canReturn?: boolean;
}) {
  const router = useRouter();
  const nameField = fields.find((field) => field.id === "name");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<CollectionSubmissionRow | null>(null);
  const [returning, setReturning] = useState<CollectionSubmissionRow | null>(null);
  const [returnNote, setReturnNote] = useState("");

  const keyword = query.trim().toLowerCase();
  const filtered = keyword
    ? rows.filter((row) =>
        [
          row.submitterName,
          row.returnNote,
          departmentLabel(row.department),
          ...fields.map((field) =>
            fieldValueLabel(field, row.extraAnswers),
          ),
        ].some((value) => (value ?? "").toLowerCase().includes(keyword)),
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

  async function submitReturn() {
    if (!returning) return;
    setPending(true);
    try {
      const result = await returnCollectionSubmission({
        formId,
        submissionId: returning.id,
        note: returnNote,
      });
      if (!result.success) throw new Error(result.message);
      toast.success(
        result.data?.emailed
          ? "已退回，并已通知填写人修改"
          : "已退回；该成员没有可用邮箱，未发送通知",
      );
      setReturning(null);
      setReturnNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退回失败，请稍后重试");
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
            placeholder="搜索填写人、部门、答案…"
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
          <Table className="min-w-max">
            <TableHeader>
              <TableRow>
                {!nameField && <TableHead>填写人</TableHead>}
                {fields.map((field) => (
                  <TableHead key={field.id}>{field.label}</TableHead>
                ))}
                <TableHead>填写人部门</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最后更新</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  {!nameField && (
                    <TableCell className="font-medium">
                      {rowDisplayName(row, nameField)}
                    </TableCell>
                  )}
                  {fields.map((field) => (
                    <TableCell key={field.id} className="whitespace-nowrap">
                      {fieldValueLabel(field, row.extraAnswers)}
                    </TableCell>
                  ))}
                  <TableCell>{departmentLabel(row.department)}</TableCell>
                  <TableCell>
                    {row.returnedAt ? (
                      <span
                        className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300"
                        title={row.returnNote ?? undefined}
                      >
                        已退回
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">正常</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.updatedAtLabel}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-foreground"
                        disabled={!canReturn}
                        title={
                          canReturn
                            ? "退回：通知填写人修改后重新提交"
                            : "仅在收集期间可以退回"
                        }
                        aria-label={`退回 ${rowDisplayName(row, nameField)} 的填写`}
                        onClick={() => {
                          if (!canReturn) return;
                          setReturning(row);
                          setReturnNote(row.returnNote ?? "");
                        }}
                      >
                        <Undo2 />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        title="删除填写记录"
                        aria-label={`删除 ${rowDisplayName(row, nameField)} 的填写记录`}
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={Boolean(returning)}
        onOpenChange={(open) => {
          if (!open) {
            setReturning(null);
            setReturnNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>退回这条填写？</DialogTitle>
            <DialogDescription>
              将通知 {returning ? rowDisplayName(returning, nameField) : "该成员"}
              修改后重新提交；退回标记会在重新提交后自动清除。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-return-note">退回说明（可选）</Label>
            <Textarea
              id="collection-return-note"
              value={returnNote}
              onChange={(event) => setReturnNote(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="例如：班级格式不对，请改为 B240101"
            />
            <p className="text-xs text-muted-foreground">
              说明会写进邮件；该成员没有邮箱时只记录退回标记。
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReturning(null)}>
              取消
            </Button>
            <Button type="button" loading={pending} onClick={submitReturn}>
              确认退回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除这条填写记录？</DialogTitle>
            <DialogDescription>
              将删除 {deleting ? rowDisplayName(deleting, nameField) : "该成员"} 的填写记录，删除后不可恢复。
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

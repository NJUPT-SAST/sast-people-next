"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { updateFeedbackReport, updateFeedbackResolutionNote } from "@/action/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Report = Awaited<ReturnType<typeof import("@/action/feedback").listFeedbackReports>>[number];

const statusLabel = { pending: "待处理", in_progress: "处理中", resolved: "已解决" } as const;
const categoryLabel = { bug: "问题反馈", suggestion: "功能建议", content: "内容纠错", other: "其他" } as const;

function formatDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toLocaleString("zh-CN") : "未提供";
}

function browserDetails(value: string | null | undefined) {
  if (!value) return [] as Array<[string, string]>;
  try {
    const info = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(info).map(([key, item]) => [key, Array.isArray(item) ? item.join(", ") : String(item ?? "未提供")] as [string, string]);
  } catch {
    return [["原始信息", value]] as Array<[string, string]>;
  }
}

export function FeedbackReports({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<"all" | "pending" | "in_progress" | "resolved">("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noteState, setNoteState] = useState<Record<number, "saving" | "saved" | "error">>({});
  const noteTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const visible = filter === "all" ? reports : reports.filter((item) => item.status === filter);

  async function saveNote(id: number, value: string) {
    setNoteState((current) => ({ ...current, [id]: "saving" }));
    try {
      await updateFeedbackResolutionNote(id, value);
      setReports((items) => items.map((item) => item.id === id ? { ...item, resolutionNote: value.trim() || null } : item));
      setNoteState((current) => ({ ...current, [id]: "saved" }));
    } catch {
      setNoteState((current) => ({ ...current, [id]: "error" }));
    }
  }

  function scheduleNoteSave(id: number, value: string) {
    const timer = noteTimers.current[id];
    if (timer) clearTimeout(timer);
    noteTimers.current[id] = setTimeout(() => void saveNote(id, value), 700);
  }

  function statusButtonClass(status: keyof typeof statusLabel, active: boolean) {
    if (status === "pending") return active ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "text-amber-700 hover:bg-amber-500/10 dark:text-amber-300";
    if (status === "in_progress") return active ? "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-sky-700 hover:bg-sky-500/10 dark:text-sky-300";
    return active ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300";
  }

  function statusBadgeClass(status: string) {
    if (status === "pending") return "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300";
    if (status === "in_progress") return "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300";
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }

  async function update(id: number, status: "pending" | "in_progress" | "resolved") {
    setSavingId(id);
    try {
      const updated = await updateFeedbackReport(id, status, notes[id]);
      setReports((items) => items.map((item) => item.id === id ? {
        ...item,
        status,
        resolutionNote: notes[id]?.trim() || null,
        resolvedBy: updated.resolvedBy,
        resolvedAt: updated.resolvedAt,
      } : item));
      toast.success(`已标记为${statusLabel[status]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新反馈状态失败");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "in_progress", "resolved"] as const).map((value) => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
            {value === "all" ? "全部" : statusLabel[value]}
          </Button>
        ))}
      </div>
      {visible.length === 0 ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">暂无反馈记录</CardContent></Card> : visible.map((report) => (
        <Card key={report.id}>
          <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0"><CardTitle className="text-base">#{report.id} {report.title}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{categoryLabel[report.category as keyof typeof categoryLabel] ?? report.category} · {report.userName ?? "未知用户"} · {report.studentId ?? "无学号"}</p></div>
            <Badge variant="outline" className={statusBadgeClass(report.status)}>{statusLabel[report.status as keyof typeof statusLabel] ?? report.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="whitespace-pre-wrap leading-6">{report.description}</p>
            <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground sm:grid-cols-2">
              <span>邮箱：{report.contact ?? "未提供"}</span><span>提交时间：{formatDate(report.createdAt)}</span>
              <span>学号：{report.studentId ?? "未提供"}</span><span>设备：{report.deviceName ?? "未提供"}</span>
              <span>环境：{report.environment ?? "未提供"}</span><span>视口：{report.viewport ?? "未提供"}</span>
              <span className="break-all sm:col-span-2">页面：{report.pageUrl ? <a className="text-primary underline-offset-4 hover:underline" href={report.pageUrl} target="_blank" rel="noreferrer">{report.pageUrl}</a> : "未提供"}</span>
            </div>
            <details className="rounded-md border border-border/70 px-3 py-2 text-xs">
              <summary className="cursor-pointer select-none font-medium text-muted-foreground">查看完整环境与来源信息</summary>
              <div className="mt-3 grid gap-x-4 gap-y-2 text-muted-foreground sm:grid-cols-2">
                <span className="break-all">IP：{report.ipAddress ?? "未提供"}</span>
                <span className="break-all">来源页：{report.referer ?? "未提供"}</span>
                <span className="break-all sm:col-span-2">User-Agent：{report.userAgent ?? "未提供"}</span>
                {browserDetails(report.browserInfo).map(([key, value]) => <span className="break-all" key={key}>{key}：{value}</span>)}
              </div>
            </details>
            {(report.resolvedAt || report.resolvedBy || report.resolutionNote) && <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground"><p>处理信息：{report.resolvedBy ? `管理员 UID ${report.resolvedBy}` : "未记录处理人"} · {formatDate(report.resolvedAt)}</p>{report.resolutionNote && <p className="mt-1 whitespace-pre-wrap">备注：{report.resolutionNote}</p>}</div>}
            <div className="relative">
              <Textarea value={notes[report.id] ?? report.resolutionNote ?? ""} onChange={(event) => { const value = event.target.value; setNotes((current) => ({ ...current, [report.id]: value })); scheduleNoteSave(report.id, value); }} onBlur={() => void saveNote(report.id, notes[report.id] ?? report.resolutionNote ?? "")} placeholder="处理备注（自动保存）" rows={2} />
              <span className="absolute bottom-2 right-2 text-[11px] text-muted-foreground">{noteState[report.id] === "saving" ? "保存中…" : noteState[report.id] === "error" ? "保存失败" : noteState[report.id] === "saved" ? "已保存" : "自动保存"}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" className={statusButtonClass("pending", report.status === "pending")} disabled={savingId === report.id} onClick={() => void update(report.id, "pending")}>待处理</Button>
              <Button size="sm" variant="outline" className={statusButtonClass("in_progress", report.status === "in_progress")} disabled={savingId === report.id} onClick={() => void update(report.id, "in_progress")}>处理中</Button>
              <Button size="sm" variant="outline" className={statusButtonClass("resolved", report.status === "resolved")} disabled={savingId === report.id} onClick={() => void update(report.id, "resolved")}>已解决</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

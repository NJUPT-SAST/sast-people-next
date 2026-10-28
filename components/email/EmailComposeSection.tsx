"use client";

import {
  CalendarClock,
  Check,
  ChevronLeft,
  Clock3,
  Eye,
  FileText,
  Inbox,
  Loader2,
  MailPlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  getCustomEmailMessageAction,
  previewCustomEmailDraftAction,
  saveCustomEmailAction,
  searchCustomEmailRecipientsAction,
  cancelCustomEmailScheduleAction,
  deleteCustomEmailMessageAction,
  retryCustomEmailAction,
} from "@/action/email/custom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatBeijingDateTime, parseBeijingDateTime } from "@/lib/timezone";
import {
  CUSTOM_EMAIL_STATUS_TEXT,
  type CustomEmailMessageSummary,
  type CustomEmailRecipient,
  type CustomEmailRecipientSearchUser,
  type CustomEmailStatus,
  type CustomEmailWorkspace,
} from "@/lib/email-center/custom-message-types";
import { EmailDevicePreview } from "./emailDevicePreview";
import { RichTextField } from "./RichTextField";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  return formatBeijingDateTime(value);
}



function statusBadgeVariant(status: CustomEmailStatus) {
  if (status === "failed") return "destructive" as const;
  if (status === "sent") return "default" as const;
  if (status === "sending") return "secondary" as const;
  return "outline" as const;
}

function recipientLabel(recipient: CustomEmailRecipient) {
  return recipient.name?.trim() || recipient.address || "未解析邮箱";
}

function recipientMeta(recipient: CustomEmailRecipient) {
  const parts = [recipient.studentId, recipient.department].filter(Boolean);
  return parts.join(" · ");
}

function MailboxList({
  title,
  icon: Icon,
  items,
  activeId,
  emptyText,
  onOpen,
  detail,
}: {
  title: string;
  icon: typeof Inbox;
  items: CustomEmailMessageSummary[];
  activeId: number | null;
  emptyText: string;
  onOpen: (id: number) => void;
  detail: "updatedAt" | "scheduledAt";
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className={cn(
                  "flex w-full min-w-0 flex-col gap-1 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
                  activeId === item.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-transparent bg-card",
                )}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">
                    {item.subject.trim() || "（无主题）"}
                  </span>
                  <Badge
                    variant={statusBadgeVariant(item.status)}
                    className="shrink-0 text-[10px]"
                  >
                    {CUSTOM_EMAIL_STATUS_TEXT[item.status]}
                  </Badge>
                </span>
                <span className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    {item.recipientCount} 位收件人
                    {item.lastError ? ` · ${item.lastError}` : ""}
                  </span>
                  <span className="shrink-0">
                    {detail === "scheduledAt"
                      ? formatDateTime(item.scheduledAt)
                      : formatDateTime(item.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function EmailComposeSection({
  workspace,
  initialMessageId,
}: {
  workspace: CustomEmailWorkspace;
  initialMessageId?: number;
}) {
  const router = useRouter();
  const [messageId, setMessageId] = useState<number | null>(null);
  const [status, setStatus] = useState<CustomEmailStatus>("draft");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipients, setRecipients] = useState<CustomEmailRecipient[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingMode, setSavingMode] = useState<
    "draft" | "schedule" | "send" | null
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<
    CustomEmailRecipientSearchUser[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [mailboxOpen, setMailboxOpen] = useState(false);
  /* 信封列表先本地更新：保存草稿 / 定时 / 删除后立刻可见，不等服务端整页刷新 */
  const [mailbox, setMailbox] = useState(workspace);
  const [syncedWorkspace, setSyncedWorkspace] = useState(workspace);
  const lastMutationAtRef = useRef(0);
  const searchRequestRef = useRef(0);

  /* 服务端刷新后同步信封列表；刚完成本地操作时短暂跳过，避免旧 RSC 响应覆盖乐观状态 */
  useEffect(() => {
    if (workspace === syncedWorkspace) return;
    setSyncedWorkspace(workspace);
    if (Date.now() - lastMutationAtRef.current > 5000) {
      setMailbox(workspace);
    }
  }, [syncedWorkspace, workspace]);

  const selectedUserIds = useMemo(
    () =>
      new Set(
        recipients
          .map((recipient) => recipient.userId)
          .filter((id): id is number => typeof id === "number"),
      ),
    [recipients],
  );
  const linkRecipientCount = recipients.filter(
    (recipient) => recipient.userId !== null,
  ).length;
  const manualRecipientCount = recipients.length - linkRecipientCount;

  const canEdit =
    status === "draft" || status === "scheduled" || status === "failed";
  const isBusy = loading || savingMode !== null;

  const syncComposeUrl = (id: number | null) => {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "compose");
    if (id) {
      params.set("messageId", String(id));
    } else {
      params.delete("messageId");
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  const resetForm = () => {
    setMessageId(null);
    setStatus("draft");
    setSubject("");
    setBodyHtml("");
    setRecipients([]);
    setScheduledAt("");
    setDirty(false);
    syncComposeUrl(null);
  };

  const confirmDiscard = () =>
    !dirty ||
    window.confirm("当前修改尚未保存，继续将丢失这些修改。确定继续吗？");

  const openMessage = async (id: number) => {
    if (!confirmDiscard()) return;
    setLoading(true);
    try {
      const result = await getCustomEmailMessageAction(id);
      if (!result.ok) {
        /* 深链加载失败时不能继续把空表单绑定到原 messageId，否则保存会覆盖原草稿 */
        resetForm();
        toast.error(result.message);
        return;
      }
      const { message, recipients: loadedRecipients } = result.data;
      setMessageId(message.id);
      setStatus(message.status);
      setSubject(message.subject);
      setBodyHtml(message.htmlBody);
      setRecipients(loadedRecipients);
      setScheduledAt(
        message.scheduledAt
          ? formatBeijingDateTime(message.scheduledAt)
              .slice(0, 16)
              .replace(" ", "T")
          : "",
      );
      setDirty(false);
      setMailboxOpen(false);
      syncComposeUrl(message.id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialMessageId) return;
    void openMessage(initialMessageId);
    // 只在首次进入时按 URL 打开；后续由用户点击列表切换。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessageId]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (!messageId) return;
    const shouldPollSending = status === "sending";
    /* 定时邮件始终低频轮询：打开时可能离发送时间还很远 */
    const shouldPollScheduled = status === "scheduled";
    if (!shouldPollSending && !shouldPollScheduled) return;

    let cancelled = false;
    const timer = window.setInterval(
      () => {
        void getCustomEmailMessageAction(messageId).then((result) => {
          if (cancelled || !result.ok) return;
          const message = result.data.message;
          setStatus(message.status);
          setMailbox((current) => {
            const without = (items: CustomEmailMessageSummary[]) =>
              items.filter((item) => item.id !== message.id);
            const summary: CustomEmailMessageSummary = {
              id: message.id,
              status: message.status,
              subject: message.subject,
              recipientCount: message.recipientCount,
              scheduledAt: message.scheduledAt,
              sentAt: message.sentAt,
              updatedAt: message.updatedAt,
              lastError: message.lastError,
            };
            return {
              drafts:
                message.status === "draft"
                  ? [summary, ...without(current.drafts)]
                  : without(current.drafts),
              scheduled:
                message.status === "scheduled"
                  ? [summary, ...without(current.scheduled)]
                  : without(current.scheduled),
              recent:
                message.status === "draft" || message.status === "scheduled"
                  ? without(current.recent)
                  : [summary, ...without(current.recent)],
            };
          });
        });
      },
      shouldPollSending ? 3000 : 60_000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [messageId, status]);

  useEffect(() => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchCustomEmailRecipientsAction({
        keyword: searchKeyword,
        page: 1,
      })
        .then((result) => {
          if (searchRequestRef.current !== requestId) return;
          if (result.ok) {
            setSearchResults(result.data.users);
          } else {
            setSearchResults([]);
            setSearchError(result.message);
          }
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setSearching(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchKeyword]);

  const addRecipient = (user: CustomEmailRecipientSearchUser) => {
    if (!user.email) {
      toast.error("这位 Link 用户没有邮箱，不能作为收件人");
      return;
    }
    if (selectedUserIds.has(user.id)) return;
    if (
      recipients.some(
        (recipient) =>
          recipient.address.toLowerCase() === user.email!.toLowerCase(),
      )
    ) {
      toast.error("这个邮箱已经在收件人里了");
      return;
    }
    setRecipients((current) => [
      ...current,
      {
        userId: user.id,
        address: user.email!,
        name: user.name,
        studentId: user.studentId,
        department: user.department,
      },
    ]);
    setDirty(true);
  };

  const addManualRecipient = () => {
    const address = manualAddress.trim();
    if (!EMAIL_PATTERN.test(address)) {
      toast.error("请输入有效的邮箱地址");
      return;
    }
    if (
      recipients.some(
        (recipient) => recipient.address.toLowerCase() === address.toLowerCase(),
      )
    ) {
      toast.error("这个邮箱已经在收件人里了");
      return;
    }
    setRecipients((current) => [
      ...current,
      {
        userId: null,
        address,
        name: null,
        studentId: null,
        department: null,
      },
    ]);
    setManualAddress("");
    setDirty(true);
  };

  const removeRecipient = (recipient: CustomEmailRecipient) => {
    setRecipients((current) =>
      current.filter(
        (item) =>
          !(
            item.userId === recipient.userId &&
            item.address.toLowerCase() === recipient.address.toLowerCase()
          ),
      ),
    );
    setDirty(true);
  };

  const validateForSend = () => {
    if (!subject.trim()) {
      toast.error("请填写邮件主题");
      return false;
    }
    const bodyText = bodyHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (bodyText.length === 0 && !/<img\b/i.test(bodyHtml)) {
      toast.error("请填写邮件正文");
      return false;
    }
    if (recipients.length === 0) {
      toast.error("请至少选择一位收件人");
      return false;
    }
    return true;
  };

  const save = async (mode: "draft" | "schedule" | "send") => {
    if (mode !== "draft" && !validateForSend()) return;
    if (mode === "schedule" && !scheduledAt) {
      toast.error("请选择定时发送时间");
      return;
    }
    const recipientUserIds = recipients
      .map((recipient) => recipient.userId)
      .filter((id): id is number => typeof id === "number");
    const manualAddresses = recipients
      .filter((recipient) => recipient.userId === null)
      .map((recipient) => recipient.address);

    setSavingMode(mode);
    try {
      const result = await saveCustomEmailAction({
        id: messageId,
        subject,
        bodyHtml,
        recipientUserIds,
        manualAddresses,
        scheduledAt: mode === "schedule" ? scheduledAt : null,
        mode,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      lastMutationAtRef.current = Date.now();
      const nextStatus = result.data.status as CustomEmailStatus;
      const nextScheduledAt =
        mode === "schedule"
          ? (parseBeijingDateTime(scheduledAt) ?? new Date())
          : null;
      const summary: CustomEmailMessageSummary = {
        id: result.data.id,
        status: nextStatus,
        subject: subject.trim(),
        recipientCount: recipients.length,
        scheduledAt: nextScheduledAt,
        sentAt: null,
        updatedAt: new Date(),
        lastError: null,
      };
      setMailbox((current) => {
        const without = (items: CustomEmailMessageSummary[]) =>
          items.filter((item) => item.id !== summary.id);
        if (mode === "draft") {
          return {
            drafts: [summary, ...without(current.drafts)],
            scheduled: without(current.scheduled),
            recent: without(current.recent),
          };
        }
        if (mode === "schedule") {
          return {
            drafts: without(current.drafts),
            scheduled: [summary, ...without(current.scheduled)],
            recent: without(current.recent),
          };
        }
        return {
          drafts: without(current.drafts),
          scheduled: without(current.scheduled),
          recent: [summary, ...without(current.recent)],
        };
      });
      setMessageId(result.data.id);
      setStatus(nextStatus);
      setDirty(false);
      syncComposeUrl(result.data.id);
      if (mode === "draft") {
        toast.success("草稿已保存");
      } else if (mode === "schedule") {
        toast.success(`已定时：${scheduledAt.replace("T", " ")}`);
      } else if (nextStatus === "failed") {
        toast.error("发送失败：没有有效的收件人邮箱，请检查后再试");
      } else {
        toast.success(
          result.data.queuedCount
            ? `已进入发送队列，共 ${result.data.queuedCount} 封`
            : "邮件已提交发送",
        );
      }
      router.refresh();
    } finally {
      setSavingMode(null);
    }
  };

  const preview = async () => {
    setPreviewLoading(true);
    try {
      const result = await previewCustomEmailDraftAction({
        subject,
        bodyHtml,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setPreviewHtml(result.data.html);
      setPreviewOpen(true);
    } finally {
      setPreviewLoading(false);
    }
  };

  const cancelSchedule = async () => {
    if (!messageId) return;
    if (!window.confirm("取消定时后邮件会回到草稿箱，确定取消吗？")) return;
    const result = await cancelCustomEmailScheduleAction(messageId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    lastMutationAtRef.current = Date.now();
    setStatus("draft");
    setScheduledAt("");
    setMailbox((current) => {
      const item = current.scheduled.find((entry) => entry.id === messageId);
      if (!item) return current;
      const draft: CustomEmailMessageSummary = {
        ...item,
        status: "draft",
        scheduledAt: null,
        updatedAt: new Date(),
      };
      return {
        drafts: [draft, ...current.drafts.filter((entry) => entry.id !== messageId)],
        scheduled: current.scheduled.filter((entry) => entry.id !== messageId),
        recent: current.recent,
      };
    });
    toast.success("已取消定时，邮件回到草稿箱");
    router.refresh();
  };

  const removeMessage = async () => {
    if (!messageId) {
      resetForm();
      return;
    }
    if (!window.confirm("确定删除这封邮件吗？")) return;
    const result = await deleteCustomEmailMessageAction(messageId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    lastMutationAtRef.current = Date.now();
    const deletedId = messageId;
    resetForm();
    setMailbox((current) => ({
      drafts: current.drafts.filter((entry) => entry.id !== deletedId),
      scheduled: current.scheduled.filter((entry) => entry.id !== deletedId),
      recent: current.recent.filter((entry) => entry.id !== deletedId),
    }));
    toast.success("邮件已删除");
    router.refresh();
  };

  const retry = async () => {
    if (!messageId) return;
    const result = await retryCustomEmailAction(messageId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    lastMutationAtRef.current = Date.now();
    setStatus("sending");
    setMailbox((current) => ({
      ...current,
      recent: current.recent.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              status: "sending",
              lastError: null,
              updatedAt: new Date(),
            }
          : entry,
      ),
    }));
    toast.success(
      result.data.queuedCount
        ? `已重新进入发送队列，共 ${result.data.queuedCount} 封`
        : "已重新提交发送",
    );
    router.refresh();
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside
        className={cn(
          "flex min-w-0 flex-col gap-4 rounded-xl border border-border/70 bg-card p-3 shadow-card",
          mailboxOpen ? "flex" : "hidden lg:flex",
        )}
      >
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            if (confirmDiscard()) {
              resetForm();
              setMailboxOpen(false);
            }
          }}
        >
          <MailPlus data-icon="inline-start" />
          写新邮件
        </Button>
        <MailboxList
          title="草稿箱"
          icon={FileText}
          items={mailbox.drafts}
          activeId={messageId}
          emptyText="还没有草稿"
          onOpen={(id) => void openMessage(id)}
          detail="updatedAt"
        />
        <MailboxList
          title="定时发送"
          icon={CalendarClock}
          items={mailbox.scheduled}
          activeId={messageId}
          emptyText="没有待发送的定时邮件"
          onOpen={(id) => void openMessage(id)}
          detail="scheduledAt"
        />
        <MailboxList
          title="最近发送"
          icon={Inbox}
          items={mailbox.recent}
          activeId={messageId}
          emptyText="还没有发送记录"
          onOpen={(id) => void openMessage(id)}
          detail="updatedAt"
        />
        <p className="mt-auto text-[11px] leading-5 text-muted-foreground">
          定时任务每分钟检查一次；大量收件人会按邮件中心的速率限制排队发送。
        </p>
      </aside>

      <section className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setMailboxOpen((open) => !open)}
            >
              <ChevronLeft
                data-icon="inline-start"
                className={cn("transition-transform", mailboxOpen && "rotate-180")}
              />
              邮件箱
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">
                {messageId ? "编辑邮件" : "写新邮件"}
              </h2>
              <p className="text-xs text-muted-foreground">
                从 recruitment@sast.fun 发出 · 部长及以上可用
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {dirty && (
              <span className="text-[11px] text-muted-foreground">未保存</span>
            )}
            <Badge variant={statusBadgeVariant(status)}>
              {CUSTOM_EMAIL_STATUS_TEXT[status]}
            </Badge>
          </div>
        </header>

        {!canEdit && (
          <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
            这封邮件已经发送或正在发送，当前为只读视图。
          </div>
        )}

        <div className="grid min-w-0 gap-4 p-4">
          <div className="grid min-w-0 gap-2 rounded-lg border bg-background/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <Users className="size-3.5" aria-hidden="true" />
                收件人
              </Label>
              <span className="text-[11px] text-muted-foreground">
                已选 {recipients.length} 人（Link {linkRecipientCount} · 手填{" "}
                {manualRecipientCount}）
              </span>
            </div>

            {recipients.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {recipients.map((recipient) => (
                  <li
                    key={`${recipient.userId ?? "manual"}:${recipient.address}`}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-medium">
                        {recipientLabel(recipient)}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {recipient.address || "Link 资料暂时没有邮箱"}
                        {recipientMeta(recipient)
                          ? ` · ${recipientMeta(recipient)}`
                          : ""}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`移除 ${recipientLabel(recipient)}`}
                      disabled={!canEdit || isBusy}
                      onClick={() => removeRecipient(recipient)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="搜索 Link 用户：姓名 / 学号 / 邮箱"
                    className="pl-8"
                    disabled={isBusy}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    value={manualAddress}
                    onChange={(event) => setManualAddress(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addManualRecipient();
                      }
                    }}
                    placeholder="或手填邮箱"
                    className="min-w-0"
                    disabled={isBusy}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="添加手填邮箱"
                    disabled={isBusy || !manualAddress.trim()}
                    onClick={addManualRecipient}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="max-h-56 overflow-y-auto rounded-md border bg-card">
                {searching ? (
                  <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    正在搜索 Link 用户…
                  </p>
                ) : searchError ? (
                  <p className="px-3 py-3 text-xs text-destructive">
                    {searchError}
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    没有匹配的 Link 用户
                  </p>
                ) : (
                  <ul className="divide-y">
                    {searchResults.map((user) => {
                      const selected = selectedUserIds.has(user.id);
                      return (
                        <li
                          key={user.id}
                          className="flex min-w-0 items-center justify-between gap-2 px-3 py-2"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-xs font-medium">
                              {user.name}
                              {user.studentId ? (
                                <span className="ml-1 font-normal text-muted-foreground">
                                  {user.studentId}
                                </span>
                              ) : null}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {user.email ?? "没有邮箱"}
                              {user.department ? ` · ${user.department}` : ""}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant={selected ? "secondary" : "outline"}
                            size="sm"
                            className="shrink-0"
                            disabled={selected || isBusy || !user.email}
                            onClick={() => addRecipient(user)}
                          >
                            {selected ? (
                              <Check data-icon="inline-start" />
                            ) : (
                              <Plus data-icon="inline-start" />
                            )}
                            {selected ? "已选" : "添加"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="custom-email-subject" className="text-xs">
              主题
            </Label>
            <Input
              id="custom-email-subject"
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value);
                setDirty(true);
              }}
              maxLength={255}
              placeholder="例如：关于本周面试安排的提醒"
              disabled={!canEdit || isBusy}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">正文</Label>
              <span className="text-[11px] text-muted-foreground">
                支持加粗、颜色、链接、列表与图片
              </span>
            </div>
            {canEdit ? (
              <RichTextField
                value={bodyHtml}
                onChange={(html) => {
                  setBodyHtml(html);
                  setDirty(true);
                }}
                placeholder="在这里写邮件正文…"
              />
            ) : (
              <div
                className="min-h-32 rounded-md border bg-background px-3 py-2 text-sm"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            )}
          </div>

          {status === "scheduled" && canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                定时发送：{scheduledAt.replace("T", " ")}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void cancelSchedule()}
                >
                  <X data-icon="inline-start" />
                  取消定时
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void save("send")}
                  disabled={isBusy}
                >
                  <Send data-icon="inline-start" />
                  立即发送
                </Button>
              </div>
            </div>
          )}

          {status === "failed" && messageId && (
            <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">
                上次发送有失败，修正收件人或网络后可以重试。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void retry()}
                  disabled={isBusy}
                >
                  <RefreshCw data-icon="inline-start" />
                  重试发送
                </Button>
                <Link
                  href="/dashboard/emails?tab=records&category=custom"
                  className="inline-flex items-center text-xs text-primary underline-offset-4 hover:underline"
                >
                  查看发送记录
                </Link>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t pt-3">
            {canEdit && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="grid gap-1">
                  <Label
                    htmlFor="custom-email-scheduled-at"
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    定时发送时间（北京时间）
                  </Label>
                  <Input
                    id="custom-email-scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => {
                      setScheduledAt(event.target.value);
                      setDirty(true);
                    }}
                    disabled={isBusy}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void save("schedule")}
                    disabled={isBusy || !scheduledAt}
                  >
                    {savingMode === "schedule" ? (
                      <Loader2
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <CalendarClock data-icon="inline-start" />
                    )}
                    定时发送
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void save("draft")}
                    disabled={isBusy}
                  >
                    {savingMode === "draft" ? (
                      <Loader2
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <Save data-icon="inline-start" />
                    )}
                    存草稿
                  </Button>
                )}
                {messageId && status !== "sent" && status !== "sending" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void removeMessage()}
                    disabled={isBusy}
                  >
                    <Trash2 data-icon="inline-start" />
                    删除
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void preview()}
                  disabled={isBusy || previewLoading}
                >
                  {previewLoading ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Eye data-icon="inline-start" />
                  )}
                  预览
                </Button>
              </div>

              {canEdit && (
                <Button
                  type="button"
                  onClick={() => void save("send")}
                  disabled={isBusy}
                >
                  {savingMode === "send" ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Send data-icon="inline-start" />
                  )}
                  立即发送
                </Button>
              )}
              {status === "sent" && (
                <span className="text-xs text-muted-foreground">
                  已发送，可在发送记录中查看逐封状态
                </span>
              )}
              {status === "sending" && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  正在发送…
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>邮件预览</DialogTitle>
            <DialogDescription>
              与真实发送同一条渲染链路；定时任务执行时仍会使用最新正文。
            </DialogDescription>
          </DialogHeader>
          {previewHtml ? (
            <EmailDevicePreview
              title={subject.trim() || "自定义邮件"}
              html={previewHtml}
            />
          ) : (
            <p className="text-sm text-muted-foreground">暂无预览内容</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
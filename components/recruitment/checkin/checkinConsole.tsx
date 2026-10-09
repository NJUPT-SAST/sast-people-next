"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  ClipboardPenLine,
  ExternalLink,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import {
  callNextAtStation,
  checkInCandidate,
  createCheckinStation,
  deleteCheckinStation,
  transitionCheckin,
  updateCheckinStation,
  type CheckinEntry,
  type CheckinStation,
  type VenueDepartmentSnapshot,
  type VenueSnapshot,
} from "@/action/user-flow/checkin";
import {
  checkinActionsFor,
  checkinBlockNote,
  checkinSkipNote,
  compareCheckinQueue,
  interviewCheckinStatusLabel,
  interviewCheckinStatusMeta,
  nextStationLabel,
  type InterviewCheckinStatusKey,
} from "@/lib/interview-checkin";
import { officeChoiceLabel } from "@/lib/office-round-one-roster";
import CheckinScanner from "@/components/recruitment/checkin/checkinScanner";
import OfficeRecordQuickDialog, {
  type OfficeRecordTarget,
} from "@/components/recruitment/checkin/officeRecordQuickDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, fetcher } from "@/lib/utils";

type VenueApiResponse = {
  success: boolean;
  venue?: VenueSnapshot;
  message?: string;
};

const POLL_INTERVAL_MS = 5000;

/* 等待态故意用弱色：绝大多数行都是等待，染色只会让整页花 */
const STATUS_TEXT_CLASS: Record<InterviewCheckinStatusKey, string> = {
  waiting: "text-muted-foreground",
  called: "text-sky-600 dark:text-sky-400",
  interviewing: "text-violet-600 dark:text-violet-400",
  done: "text-emerald-600 dark:text-emerald-400",
  skipped: "text-orange-600 dark:text-orange-400",
  cancelled: "text-muted-foreground/60",
};

/** 办公部门共享的签到叫号台：一个签到台 + 各部门的面试位与队列。 */
const CheckinConsole = ({
  initial,
  initialDept,
}: {
  initial: VenueSnapshot;
  initialDept?: string | null;
}) => {
  const router = useRouter();
  const [round, setRound] = useState(initial.round === 2 ? 2 : 1);
  /* 默认选中自己的部门（未指定且是办公部门时），也可以从 URL 带进来 */
  const [deptFilter, setDeptFilter] = useState(
    initialDept && initialDept.length > 0 ? initialDept : "all",
  );
  /* 手机上只放两段：现场（面试位 + 队列）与签到台 */
  const [tab, setTab] = useState<"field" | "desk">("field");

  const initialKey = `/api/interview/checkin?round=${initial.round}`;
  const key = `/api/interview/checkin?round=${round}`;
  const { data, mutate } = useSWR<VenueApiResponse>(key, fetcher, {
    fallback: { [initialKey]: { success: true, venue: initial } },
    refreshInterval: POLL_INTERVAL_MS,
  });

  const venue = data?.venue ?? null;
  const departments = useMemo(() => venue?.departments ?? [], [venue]);
  /* 部门筛选：部长只看自己部门；筛选值失效时回退到全部，避免出现空页 */
  const visibleDepartments = useMemo(() => {
    if (deptFilter === "all") return departments;
    const matched = departments.filter((item) => item.department === deptFilter);
    return matched.length > 0 ? matched : departments;
  }, [departments, deptFilter]);

  const [keyword, setKeyword] = useState("");
  const [pendingUserFlowId, setPendingUserFlowId] = useState<number | null>(null);
  const [pendingCheckinId, setPendingCheckinId] = useState<number | null>(null);
  const [pendingStationId, setPendingStationId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<CheckinStation | null>(null);
  /* 现场随手写面评：不离开本页（面试中/已完成都能写） */
  const [recordTarget, setRecordTarget] = useState<OfficeRecordTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStationFlowId, setNewStationFlowId] = useState<number | null>(null);
  const [newStationLabel, setNewStationLabel] = useState("");

  const totals = useMemo(
    () =>
      visibleDepartments.reduce(
        (acc, dept) => ({
          waiting: acc.waiting + dept.counts.waiting,
          called: acc.called + dept.counts.called,
          interviewing: acc.interviewing + dept.counts.interviewing,
          done: acc.done + dept.counts.done,
          skipped: acc.skipped + dept.counts.skipped,
          awaiting: acc.awaiting + dept.awaiting.length,
        }),
        { waiting: 0, called: 0, interviewing: 0, done: 0, skipped: 0, awaiting: 0 },
      ),
    [visibleDepartments],
  );

  const awaitingRows = useMemo(
    () =>
      visibleDepartments.flatMap((dept) =>
        dept.awaiting.map((candidate) => ({
          ...candidate,
          flowId: dept.flowId,
          departmentLabel: dept.departmentLabel,
        })),
      ),
    [visibleDepartments],
  );

  const filteredAwaiting = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return awaitingRows;
    return awaitingRows.filter(
      (candidate) =>
        candidate.name.toLowerCase().includes(normalized) ||
        (candidate.studentId ?? "").toLowerCase().includes(normalized) ||
        candidate.departmentLabel.toLowerCase().includes(normalized),
    );
  }, [awaitingRows, keyword]);

  const selectDepartment = (value: string) => {
    setDeptFilter(value);
    const query = new URLSearchParams({ round: String(round) });
    if (value !== "all") query.set("dept", value);
    router.replace(`/dashboard/checkin?${query.toString()}`, { scroll: false });
  };

  const handleManualSignIn = async (row: (typeof awaitingRows)[number]) => {
    setPendingUserFlowId(row.userFlowId);
    try {
      const result = await checkInCandidate(row.flowId, round, row.userFlowId, "manual");
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${row.departmentLabel} · ${row.name} 签到成功 · ${result.entry.queueNo}`);
      await mutate();
    } finally {
      setPendingUserFlowId(null);
    }
  };

  const handleTransition = async (
    entry: CheckinEntry,
    to: InterviewCheckinStatusKey,
    stationId?: number,
  ) => {
    setPendingCheckinId(entry.id);
    try {
      const result = await transitionCheckin(entry.id, to, { stationId });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${entry.queueNo} · ${interviewCheckinStatusLabel(to)}`);
      await mutate();
    } finally {
      setPendingCheckinId(null);
    }
  };

  const handleCallNext = async (station: CheckinStation) => {
    setPendingStationId(station.id);
    try {
      const result = await callNextAtStation(station.id, round);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${station.label} 叫号 ${result.entry.queueNo} · ${result.entry.name}`);
      await mutate();
    } finally {
      setPendingStationId(null);
    }
  };

  const handleOccupantAction = async (
    station: CheckinStation,
    to: InterviewCheckinStatusKey,
  ) => {
    const occupant = station.occupant;
    if (!occupant) return;
    setPendingCheckinId(occupant.checkinId);
    try {
      const result = await transitionCheckin(occupant.checkinId, to);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${occupant.queueNo} · ${interviewCheckinStatusLabel(to)}`);
      await mutate();
    } finally {
      setPendingCheckinId(null);
    }
  };

  const handleToggleStation = async (station: CheckinStation) => {
    const result = await updateCheckinStation(station.id, {
      status: station.status === "active" ? "paused" : "active",
    });
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`${station.label} 已${station.status === "active" ? "暂停" : "启用"}`);
    await mutate();
  };

  const handleDeleteStation = async (station: CheckinStation) => {
    const result = await deleteCheckinStation(station.id);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`已删除 ${station.label}`);
    await mutate();
  };

  const submitRename = async () => {
    if (!renaming) return;
    const result = await updateCheckinStation(renaming.id, { label: renameValue });
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success("面试位已改名");
    setRenaming(null);
    await mutate();
  };

  const openAddStation = () => {
    /* 已经筛到某个部门时，默认就是它 */
    const defaultFlow = visibleDepartments[0]?.flowId ?? departments[0]?.flowId ?? null;
    setNewStationFlowId(defaultFlow);
    const labels =
      departments.find((dept) => dept.flowId === defaultFlow)?.stations.map((s) => s.label) ??
      [];
    setNewStationLabel(nextStationLabel(labels));
    setShowAddStation(true);
  };

  const submitAddStation = async () => {
    if (!newStationFlowId) {
      toast.error("请选择部门");
      return;
    }
    const result = await createCheckinStation(newStationFlowId, newStationLabel);
    if (!result.success) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`已新增 ${result.station.departmentLabel} · ${result.station.label}`);
    setShowAddStation(false);
    await mutate();
  };

  if (!venue) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <RefreshCw className="size-4 animate-spin" />
        正在加载签到叫号…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-3 border-b pb-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold md:text-xl">签到叫号</h1>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border bg-muted/40 p-0.5">
              {[1, 2].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={value === round}
                  onClick={() => setRound(value)}
                  className={cn(
                    "h-8 touch-manipulation rounded-md px-3 text-xs font-medium transition-colors",
                    value === round
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === 2 ? "二面" : "一面"}
                </button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => mutate()}>
              <RefreshCw className="size-4" />
              刷新
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/checkin/board?round=${round}`} target="_blank">
                <ExternalLink className="size-4" />
                大屏
              </Link>
            </Button>
          </div>
        </div>

        {/* 部门筛选：单行横向滚动，不再换行占两排 */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {[
            { key: "all", label: "全部" },
            ...departments.map((item) => ({
              key: item.department ?? String(item.flowId),
              label: item.departmentLabel,
            })),
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={deptFilter === option.key}
              onClick={() => selectDepartment(option.key)}
              className={cn(
                "h-8 shrink-0 touch-manipulation rounded-full border px-3 text-xs font-medium transition-colors",
                deptFilter === option.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* 统计只留现场一眼要看的几项 */}
        <div className="-mx-1 flex items-center gap-4 overflow-x-auto px-1 text-xs text-muted-foreground">
          {[
            { label: "等待", value: totals.waiting, tone: "text-foreground" },
            {
              label: "面试中",
              value: totals.interviewing,
              tone: "text-violet-600 dark:text-violet-400",
            },
            {
              label: "完成",
              value: totals.done,
              tone: "text-emerald-600 dark:text-emerald-400",
            },
            { label: "未签到", value: totals.awaiting, tone: "text-foreground" },
          ].map((item) => (
            <span key={item.label} className="flex shrink-0 items-baseline gap-1">
              {item.label}
              <span className={cn("font-mono text-sm font-semibold tabular-nums", item.tone)}>
                {item.value}
              </span>
            </span>
          ))}
        </div>
      </header>

      {/* 手机：现场 / 签到 两段 */}
      <div className="grid grid-cols-2 gap-1 lg:hidden">
        {[
          { key: "field" as const, label: "现场（面试位 + 队列）" },
          { key: "desk" as const, label: "签到台" },
        ].map((option) => (
          <Button
            key={option.key}
            size="sm"
            variant={tab === option.key ? "default" : "outline"}
            onClick={() => setTab(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section
          className={cn("flex min-w-0 flex-col gap-3", tab !== "field" && "hidden lg:flex")}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">现场</p>
            <Button size="sm" variant="outline" onClick={openAddStation}>
              <Plus className="size-4" />
              新增面试位
            </Button>
          </div>

          {visibleDepartments.map((dept) => (
            <DepartmentBlock
              key={dept.flowId}
              department={dept}
              pendingStationId={pendingStationId}
              pendingCheckinId={pendingCheckinId}
              onCall={handleCallNext}
              onOccupantAction={handleOccupantAction}
              onOpenRecord={setRecordTarget}
              onRename={(station) => {
                setRenaming(station);
                setRenameValue(station.label);
              }}
              onToggle={handleToggleStation}
              onDelete={handleDeleteStation}
              onTransition={handleTransition}
            />
          ))}
        </section>

        <section
          className={cn("flex min-w-0 flex-col gap-3", tab !== "desk" && "hidden lg:flex")}
        >
          <p className="text-sm font-semibold">签到台</p>
          <div className="rounded-xl border bg-card p-3">
            <CheckinScanner round={round} onSignedIn={() => void mutate()} />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">未签到</p>
              <span className="text-xs text-muted-foreground">
                {awaitingRows.length} 人
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="按姓名 / 学号 / 部门筛选"
                className="h-9 pl-8"
              />
            </div>
            <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
              {filteredAwaiting.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {awaitingRows.length === 0 ? "本轮候选人都已签到" : "没有匹配的候选人"}
                </p>
              ) : (
                filteredAwaiting.map((row) => (
                  <div
                    key={`${row.flowId}-${row.userFlowId}`}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.name}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {row.departmentLabel} · {officeChoiceLabel(row.choice)}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.studentId || "无学号"} · {row.interviewSlot || "未选时段"}
                        {row.otherDepartments.length > 0
                          ? ` · 另有 ${row.otherDepartments.join("/")}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={pendingUserFlowId === row.userFlowId}
                      onClick={() => handleManualSignIn(row)}
                    >
                      <Check className="size-4" />
                      签到
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <OfficeRecordQuickDialog
        target={recordTarget}
        onClose={() => setRecordTarget(null)}
        onSaved={() => void mutate()}
      />

      {/* 新增面试位：选择部门 + 填名称 */}
      <Dialog open={showAddStation} onOpenChange={setShowAddStation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增面试位</DialogTitle>
            <DialogDescription>选择部门并填写名称（如「1 号位」或部长姓名）。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">部门</span>
              <Select
                value={newStationFlowId ? String(newStationFlowId) : undefined}
                onValueChange={(value) => {
                  const flowId = Number(value);
                  setNewStationFlowId(flowId);
                  const labels =
                    departments
                      .find((dept) => dept.flowId === flowId)
                      ?.stations.map((station) => station.label) ?? [];
                  setNewStationLabel(nextStationLabel(labels));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择部门" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.flowId} value={String(dept.flowId)}>
                      {dept.departmentLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">名称</span>
              <Input
                value={newStationLabel}
                onChange={(event) => setNewStationLabel(event.target.value)}
                placeholder="如 1 号位 / 张三"
                maxLength={32}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStation(false)}>
              取消
            </Button>
            <Button onClick={submitAddStation} disabled={!newStationLabel.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>面试位名称</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="如 1 号位 / 张三"
            maxLength={32}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button onClick={submitRename} disabled={!renameValue.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** 一个部门块：面试位在上、本部门队列紧接在下——不用在两个页签之间来回切。 */
const DepartmentBlock = ({
  department,
  pendingStationId,
  pendingCheckinId,
  onCall,
  onOccupantAction,
  onOpenRecord,
  onRename,
  onToggle,
  onDelete,
  onTransition,
}: {
  department: VenueDepartmentSnapshot;
  pendingStationId: number | null;
  pendingCheckinId: number | null;
  onCall: (station: CheckinStation) => void;
  onOccupantAction: (station: CheckinStation, to: InterviewCheckinStatusKey) => void;
  onOpenRecord: (target: OfficeRecordTarget) => void;
  onRename: (station: CheckinStation) => void;
  onToggle: (station: CheckinStation) => void;
  onDelete: (station: CheckinStation) => void;
  onTransition: (
    entry: CheckinEntry,
    to: InterviewCheckinStatusKey,
    stationId?: number,
  ) => void;
}) => {
  const entries = useMemo(
    () =>
      department.entries
        /* 正在面试位上的（已叫号/面试中）只在上面那张面试位卡片里出现，避免信息重复 */
        .filter(
          (entry) => entry.status !== "called" && entry.status !== "interviewing",
        )
        .sort(compareCheckinQueue),
    [department.entries],
  );
  const freeStations = department.stations.filter(
    (station) => station.status === "active" && station.occupant === null,
  );
  const waitingCount = department.counts.waiting + department.counts.skipped;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <p className="text-sm font-semibold">{department.departmentLabel}</p>
        <span className="text-xs text-muted-foreground">
          等待 {waitingCount} · 面试中 {department.counts.interviewing} · 完成{" "}
          {department.counts.done}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-2.5">
        {department.stations.length === 0 ? (
          <p className="rounded-lg border border-dashed py-3 text-center text-xs text-muted-foreground">
            还没有面试位（点右上角「新增面试位」）
          </p>
        ) : (
          department.stations.map((station) => (
            <StationRow
              key={station.id}
              station={station}
              pending={pendingStationId === station.id}
              canCall={waitingCount > 0}
              onCall={() => onCall(station)}
              onOccupantAction={(to) => onOccupantAction(station, to)}
              onOpenRecord={
                station.occupant
                  ? () =>
                      onOpenRecord({
                        userFlowId: station.occupant!.userFlowId,
                        queueNo: station.occupant!.queueNo,
                        name: station.occupant!.name,
                        round: station.occupant!.round,
                      })
                  : undefined
              }
              onRename={() => onRename(station)}
              onToggle={() => onToggle(station)}
              onDelete={() => onDelete(station)}
            />
          ))
        )}
      </div>

      <div className="border-t bg-muted/10 p-2.5">
        {entries.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">还没有人签到</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {entries.map((entry) => (
              <QueueRow
                key={entry.id}
                entry={entry}
                freeStations={freeStations}
                pending={pendingCheckinId === entry.id}
                onTransition={onTransition}
                onOpenRecord={() =>
                  onOpenRecord({
                    userFlowId: entry.userFlowId,
                    queueNo: entry.queueNo,
                    name: entry.name,
                    round: entry.round,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StationRow = ({
  station,
  pending,
  canCall,
  onCall,
  onOccupantAction,
  onOpenRecord,
  onRename,
  onToggle,
  onDelete,
}: {
  station: CheckinStation;
  pending: boolean;
  canCall: boolean;
  onCall: () => void;
  onOccupantAction: (to: InterviewCheckinStatusKey) => void;
  onOpenRecord?: () => void;
  onRename: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) => {
  const occupant = station.occupant;
  const paused = station.status !== "active";
  /* 位上有人时，主要动作变成推进这段面试（开始/结束），不用再去队列里找 */
  const occupantAction =
    occupant?.status === "called"
      ? ({ to: "interviewing", label: "开始面试" } as const)
      : occupant?.status === "interviewing"
        ? ({ to: "done", label: "结束面试" } as const)
        : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border-l-4 bg-muted/20 px-2.5 py-2",
        occupant?.status === "interviewing"
          ? "border-l-violet-500"
          : occupant?.status === "called"
            ? "border-l-primary"
            : "border-l-transparent",
        paused && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {station.label}
          {station.interviewerName ? ` · ${station.interviewerName}` : ""}
        </span>
        {paused ? <Badge variant="secondary">暂停</Badge> : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          {occupant ? (
            <>
              <span className="shrink-0 font-mono text-xl font-bold tabular-nums">
                {occupant.queueNo}
              </span>
              <span className="truncate text-sm font-medium">{occupant.name}</span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  STATUS_TEXT_CLASS[occupant.status],
                )}
              >
                {interviewCheckinStatusMeta[occupant.status].displayLabel}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">等待叫号</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {occupant && onOpenRecord ? (
            <Button size="sm" variant="secondary" onClick={onOpenRecord}>
              <ClipboardPenLine className="size-4" />
              写面评
            </Button>
          ) : null}
          {occupantAction ? (
            <Button
              size="sm"
              loading={pending}
              onClick={() => onOccupantAction(occupantAction.to)}
            >
              {occupantAction.label}
            </Button>
          ) : (
            <Button
              size="sm"
              loading={pending}
              disabled={paused || occupant !== null || !canCall}
              onClick={onCall}
            >
              叫下一位
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`${station.label} 更多操作`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {occupant?.status === "called" ? (
                <DropdownMenuItem onSelect={() => onOccupantAction("skipped")}>
                  过号
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={onRename}>改名</DropdownMenuItem>
              <DropdownMenuItem onSelect={onToggle}>
                {paused ? "启用" : "暂停"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

const QueueRow = ({
  entry,
  freeStations,
  pending,
  onTransition,
  onOpenRecord,
}: {
  entry: CheckinEntry;
  freeStations: CheckinStation[];
  pending: boolean;
  onTransition: (
    entry: CheckinEntry,
    to: InterviewCheckinStatusKey,
    stationId?: number,
  ) => void;
  onOpenRecord: () => void;
}) => {
  const meta = interviewCheckinStatusMeta[entry.status];
  const isWaiting = entry.status === "waiting" || entry.status === "skipped";
  const actions = checkinActionsFor(entry.status);
  /* 主推进动作（开始/结束面试）直接露出来，其余（过号/取消签到）收进 ⋯，避免挤掉姓名 */
  const inlineAction = actions.find((action) => action.variant === "default") ?? null;
  const menuActions = actions.filter((action) => action !== inlineAction);

  const notes = [
    officeChoiceLabel(entry.choice) || null,
    entry.interviewSlot || null,
    entry.callCount > 1 ? `已叫 ${entry.callCount} 次` : null,
    entry.otherDepartments.length > 0 ? `另有 ${entry.otherDepartments.join("/")}` : null,
    checkinSkipNote(entry.skipCount),
    checkinBlockNote(entry.block),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "shrink-0 font-mono text-base font-bold tabular-nums",
            STATUS_TEXT_CLASS[entry.status],
          )}
        >
          {entry.queueNo}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</span>
        {isWaiting ? null : (
          <Badge className={meta.badgeClassName}>{meta.label}</Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {notes}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {isWaiting && freeStations.length > 0 ? (
            <Select
              value=""
              onValueChange={(value) => onTransition(entry, "called", Number(value))}
            >
              <SelectTrigger size="sm" className="w-[92px] text-xs" disabled={pending}>
                <SelectValue placeholder="叫到…" />
              </SelectTrigger>
              <SelectContent>
                {freeStations.map((station) => (
                  <SelectItem key={station.id} value={String(station.id)}>
                    {station.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {inlineAction ? (
            <Button
              size="sm"
              variant={inlineAction.variant}
              disabled={pending}
              onClick={() => onTransition(entry, inlineAction.to)}
            >
              {inlineAction.label}
            </Button>
          ) : null}

          {entry.status === "done" ? (
            <Button size="sm" variant="secondary" onClick={onOpenRecord}>
              <ClipboardPenLine className="size-4" />
              写面评
            </Button>
          ) : null}

          {menuActions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${entry.queueNo} 更多操作`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menuActions.map((action) => (
                  <DropdownMenuItem
                    key={action.to}
                    variant={action.variant === "destructive" ? "destructive" : "default"}
                    onSelect={() => onTransition(entry, action.to)}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CheckinConsole;

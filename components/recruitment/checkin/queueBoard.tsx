"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Volume2, VolumeX } from "lucide-react";

import type {
  CheckinEntry,
  CheckinStation,
  VenueDepartmentSnapshot,
  VenueSnapshot,
} from "@/action/user-flow/checkin";
import {
  checkinBlockNote,
  checkinSkipNote,
  interviewCheckinStatusMeta,
  MAX_QUEUE_SKIPS,
} from "@/lib/interview-checkin";
import {
  ANNOUNCE_QUEUE_LIMIT,
  batchAnnouncementText,
  selectAnnouncements,
  type AnnounceState,
  type AnnounceTarget,
} from "@/lib/queue-announcer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, fetcher } from "@/lib/utils";

type VenueApiResponse = {
  success: boolean;
  venue?: VenueSnapshot;
  message?: string;
};

const POLL_INTERVAL_MS = 3000;

/** 每个部门最多列出的等待人数（超出只显示「还有 n 位」），保证一屏放得下。 */
const MAX_WAITING_ROWS = 12;

/** 部门数量 → 大屏列数（最多 4 个办公部门正好一屏平分）。 */
const COLUMN_CLASS = [
  "lg:grid-cols-1",
  "lg:grid-cols-2",
  "lg:grid-cols-3",
  "lg:grid-cols-4",
];

/** 大屏：整屏展示全部办公部门的面试位与等候队列，不滚动。 */
const QueueBoard = ({
  initial,
  round,
}: {
  initial: VenueSnapshot;
  round: number;
}) => {
  const { data } = useSWR<VenueApiResponse>(
    `/api/interview/checkin?round=${round}`,
    fetcher,
    {
      refreshInterval: POLL_INTERVAL_MS,
      fallbackData: { success: true, venue: initial },
    },
  );

  const venue = data?.venue ?? initial;
  const departments = venue.departments;

  const waitingByDepartment = useMemo(
    () =>
      new Map(
        departments.map((department) => [
          department.flowId,
          department.entries
            .filter(
              (entry) => entry.status === "waiting" || entry.status === "skipped",
            )
            .sort((a, b) => a.queueSeq - b.queueSeq),
        ]),
      ),
    [departments],
  );

  const totals = useMemo(() => {
    let waiting = 0;
    let interviewing = 0;
    let done = 0;
    for (const department of departments) {
      waiting += waitingByDepartment.get(department.flowId)?.length ?? 0;
      interviewing += department.counts.interviewing;
      done += department.counts.done;
    }
    return { waiting, interviewing, done };
  }, [departments, waitingByDepartment]);

  const [voiceOn, setVoiceOn] = useState(false);
  const announceState = useRef<AnnounceState>({});
  const speechQueue = useRef<string[]>([]);
  const speaking = useRef(false);

  /* 逐条念完再念下一条：多人同时叫号时不互相打断，也不会堆成过期队列 */
  const pumpSpeech = useCallback(function pump(): void {
    if (speaking.current) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const next = speechQueue.current.shift();
    if (!next) return;

    const utterance = new SpeechSynthesisUtterance(next);
    utterance.lang = "zh-CN";
    utterance.rate = 0.95;
    const finish = () => {
      speaking.current = false;
      pump();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    speaking.current = true;
    window.speechSynthesis.speak(utterance);
  }, []);

  const enqueueSpeech = useCallback(
    (text: string) => {
      speechQueue.current.push(text);
      if (speechQueue.current.length > ANNOUNCE_QUEUE_LIMIT) {
        speechQueue.current.splice(
          0,
          speechQueue.current.length - ANNOUNCE_QUEUE_LIMIT,
        );
      }
      pumpSpeech();
    },
    [pumpSpeech],
  );

  /* 新叫号 → 播报；未到场的号按间隔重复，最多 3 次 */
  useEffect(() => {
    if (!voiceOn) return;

    const targets: AnnounceTarget[] = [];
    for (const department of departments) {
      for (const station of department.stations) {
        const occupant = station.occupant;
        if (!occupant || occupant.status !== "called") continue;
        targets.push({
          key: `${occupant.checkinId}:${occupant.calledAt ?? ""}`,
          departmentLabel: department.departmentLabel,
          queueNo: occupant.queueNo,
          name: occupant.name,
          stationLabel: station.label,
          calledAt: occupant.calledAt ?? "",
        });
      }
    }

    const { batch, state } = selectAnnouncements(
      targets,
      announceState.current,
      Date.now(),
    );
    announceState.current = state;

    const text = batchAnnouncementText(batch);
    if (text) enqueueSpeech(text);
  }, [voiceOn, departments, enqueueSpeech]);

  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const columnClass =
    COLUMN_CLASS[Math.min(Math.max(departments.length, 1), 4) - 1];

  return (
    <div className="flex h-dvh flex-col gap-3 overflow-hidden bg-background p-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold lg:text-2xl">现场叫号</h1>
          <span className="text-sm text-muted-foreground">
            {round === 2 ? "二面" : "一面"} · 等候 {totals.waiting} · 面试中{" "}
            {totals.interviewing} · 已完成 {totals.done}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[1, 2].map((value) => (
              <Button
                key={value}
                asChild
                size="sm"
                variant={value === round ? "default" : "outline"}
              >
                <Link href={`/checkin/board?round=${value}`}>
                  {value === 2 ? "二面" : "一面"}
                </Link>
              </Button>
            ))}
          </div>
          <Button
            variant={voiceOn ? "default" : "outline"}
            size="sm"
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              if (next) {
                enqueueSpeech("语音播报已开启");
              } else {
                speechQueue.current.length = 0;
                speaking.current = false;
                if (
                  typeof window !== "undefined" &&
                  "speechSynthesis" in window
                ) {
                  window.speechSynthesis.cancel();
                }
              }
            }}
          >
            {voiceOn ? (
              <>
                <Volume2 className="size-4" />
                语音已开启
              </>
            ) : (
              <>
                <VolumeX className="size-4" />
                开启语音
              </>
            )}
          </Button>
          <span className="font-mono text-lg font-semibold tabular-nums lg:text-xl">
            {clock.toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
      </header>

      {departments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">暂无启用的办公部门</p>
        </div>
      ) : (
        <div className={cn("grid min-h-0 flex-1 gap-3", "grid-cols-1", columnClass)}>
          {departments.map((department) => (
            <DepartmentPanel
              key={department.flowId}
              department={department}
              waiting={waitingByDepartment.get(department.flowId) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DepartmentPanel = ({
  department,
  waiting,
}: {
  department: VenueDepartmentSnapshot;
  waiting: CheckinEntry[];
}) => {
  const shown = waiting.slice(0, MAX_WAITING_ROWS);

  return (
    <section className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border p-3">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <h2 className="text-lg font-bold lg:text-xl">{department.departmentLabel}</h2>
        <span className="text-xs text-muted-foreground">
          等候 {waiting.length} · 面试中 {department.counts.interviewing} · 已完成{" "}
          {department.counts.done}
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-1.5">
        {department.stations.length === 0 ? (
          <p className="rounded-lg border border-dashed py-3 text-center text-xs text-muted-foreground">
            未设置面试位
          </p>
        ) : (
          department.stations.map((station) => (
            <StationCard key={station.id} station={station} />
          ))
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        <p className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">
          等候队列
        </p>
        {waiting.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">暂无等待</p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-1 overflow-hidden">
            {shown.map((entry) => (
              <WaitingChip key={entry.id} entry={entry} />
            ))}
          </div>
        )}
        {waiting.length > MAX_WAITING_ROWS ? (
          <p className="shrink-0 text-right text-xs text-muted-foreground">
            还有 {waiting.length - MAX_WAITING_ROWS} 位…
          </p>
        ) : null}
      </div>
    </section>
  );
};

const StationCard = ({ station }: { station: CheckinStation }) => {
  const occupant = station.occupant;
  const paused = station.status !== "active";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border-2 px-2.5 py-1.5",
        occupant?.status === "interviewing"
          ? "border-violet-500/50 bg-violet-500/5"
          : occupant?.status === "called"
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-muted/20",
        paused && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold">
          {station.label}
          {station.interviewerName ? (
            <span className="ml-1 font-normal text-muted-foreground">
              {station.interviewerName}
            </span>
          ) : null}
        </span>
        {paused ? (
          <Badge variant="secondary">暂停</Badge>
        ) : occupant ? (
          <Badge className={interviewCheckinStatusMeta[occupant.status].badgeClassName}>
            {interviewCheckinStatusMeta[occupant.status].displayLabel}
          </Badge>
        ) : (
          <Badge variant="outline">空闲</Badge>
        )}
      </div>
      {occupant ? (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold tabular-nums text-primary lg:text-3xl">
            {occupant.queueNo}
          </span>
          <span className="min-w-0 truncate text-sm font-medium">
            {occupant.name}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">空闲</span>
      )}
    </div>
  );
};

const WaitingChip = ({ entry }: { entry: CheckinEntry }) => {
  const note = checkinBlockNote(entry.block);
  const skip = checkinSkipNote(entry.skipCount);
  const marker = skip ? (entry.skipCount > MAX_QUEUE_SKIPS ? "不再叫号" : `过号${entry.skipCount}`) : null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-hidden rounded border bg-muted/20 px-2 py-1",
        entry.status === "skipped" && "opacity-55",
      )}
      title={`${entry.queueNo} ${entry.name}${skip ? ` ${skip}` : ""}${note ? ` ${note}` : ""}`}
    >
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {entry.queueNo}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
      {marker ? (
        <span className="shrink-0 text-[10px] text-orange-600 dark:text-orange-400">
          {marker}
        </span>
      ) : note ? (
        <span className="shrink-0 text-[10px] text-sky-600 dark:text-sky-400">
          {entry.block?.reason === "busy" ? "面试中" : "待一志愿"}
        </span>
      ) : null}
    </div>
  );
};

export default QueueBoard;

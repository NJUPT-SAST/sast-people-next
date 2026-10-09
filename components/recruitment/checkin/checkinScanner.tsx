"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMediaDevices } from "react-media-devices";
import { useZxing } from "react-zxing";
import { Camera, Pause, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  checkInCandidate,
  resolveCheckinCandidates,
  type CheckinCandidateLookup,
  type CheckinCandidateMatch,
} from "@/action/user-flow/checkin";
import { checkinBlockNote, interviewCheckinStatusLabel } from "@/lib/interview-checkin";
import { officeChoiceLabel } from "@/lib/office-round-one-roster";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 共享签到台的扫码：扫候选人的「身份码」，命中其全部办公类报名
 * （可能同时有第一/第二志愿两条），逐条签到。
 */
const CheckinScanner = ({
  round,
  onSignedIn,
}: {
  round: number;
  onSignedIn?: () => void;
}) => {
  const { devices } = useMediaDevices({
    constraints: { video: true, audio: false },
  });
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [pendingUserFlowId, setPendingUserFlowId] = useState<number | null>(null);
  const [lookup, setLookup] = useState<CheckinCandidateLookup | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const filteredDevices = useMemo(
    () => devices?.filter((value) => value.deviceId) ?? [],
    [devices],
  );

  useEffect(() => {
    if (filteredDevices.length === 0) {
      setSelectedDevice(null);
      return;
    }
    if (
      !selectedDevice ||
      !filteredDevices.some((device) => device.deviceId === selectedDevice)
    ) {
      const rear =
        filteredDevices.find((d) =>
          /\b(back|environment|后置|后置摄像头)\b/i.test(d.label || ""),
        ) ?? filteredDevices[filteredDevices.length - 1];
      setSelectedDevice(rear.deviceId);
    }
  }, [filteredDevices, selectedDevice]);

  const handleDecodedUid = async (uid: number) => {
    const resolved = await resolveCheckinCandidates(round, uid).catch(() => null);

    if (!resolved) {
      toast.error("无法确认该同学在本轮的报名");
      return;
    }
    if (resolved.matches.length === 0) {
      toast.error("该同学本轮没有可面试的办公部门报名");
      return;
    }

    setLookup(resolved);
    setShowDialog(true);
  };

  const { ref } = useZxing({
    async onDecodeResult(result) {
      if (paused || isResolving) return;

      setPaused(true);
      setIsResolving(true);

      try {
        const payload = JSON.parse(atob(result.getText())) as { uid?: number };
        if (typeof payload?.uid !== "number") {
          throw new Error("bad payload");
        }
        await handleDecodedUid(payload.uid);
      } catch {
        toast.error("二维码内容无效，请重试");
      } finally {
        setIsResolving(false);
      }
    },
    paused,
    deviceId: selectedDevice || undefined,
  });

  const handleSignIn = async (match: CheckinCandidateMatch) => {
    if (!match.candidate) return;
    setPendingUserFlowId(match.candidate.userFlowId);
    try {
      const result = await checkInCandidate(
        match.flowId,
        round,
        match.candidate.userFlowId,
        "staff_scan",
      );
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`${match.departmentLabel} 签到成功 · 叫号 ${result.entry.queueNo}`);
      /* 重新解析：签完一个部门后，另一志愿往往还要接着签 */
      const refreshed = await resolveCheckinCandidates(round, match.candidate.uid);
      if (refreshed) setLookup(refreshed);
      onSignedIn?.();
    } finally {
      setPendingUserFlowId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          扫码签到
          <Badge variant={paused ? "secondary" : "default"}>
            {paused ? "待启动" : "扫描中"}
          </Badge>
        </p>
        <p className="text-xs text-muted-foreground">
          {filteredDevices.length > 0
            ? `${filteredDevices.length} 个可用摄像头`
            : "未识别到摄像头"}
        </p>
      </div>

      <div className="relative h-[280px] overflow-hidden rounded-lg border bg-muted/40 shadow-inner">
        {!paused && (
          <video
            ref={ref as React.RefObject<HTMLVideoElement>}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!paused && !isResolving && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center"
          >
            <div className="relative aspect-square w-[60%] max-w-[220px] border border-primary/70 shadow-[0_0_0_999px_rgb(0_0_0_/_0.14)]">
              <span className="absolute -left-px -top-px size-7 border-l-2 border-t-2 border-primary" />
              <span className="absolute -right-px -top-px size-7 border-r-2 border-t-2 border-primary" />
              <span className="absolute -bottom-px -left-px size-7 border-b-2 border-l-2 border-primary" />
              <span className="absolute -bottom-px -right-px size-7 border-b-2 border-r-2 border-primary" />
            </div>
          </div>
        )}
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex w-full max-w-sm flex-col gap-3">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                  <QrCode className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium text-foreground">准备扫描身份码</p>
                  <p className="text-xs text-muted-foreground">
                    对准候选人的「我的资料 · 身份码」
                  </p>
                </div>
              </div>
              <Select
                value={selectedDevice || undefined}
                onValueChange={setSelectedDevice}
              >
                <SelectTrigger
                  className="h-9 w-full text-xs"
                  disabled={filteredDevices.length === 0}
                >
                  <SelectValue placeholder="请选择摄像头" />
                </SelectTrigger>
                {filteredDevices.length > 0 && (
                  <SelectContent>
                    {filteredDevices.map((device) => (
                      <SelectItem
                        key={device.deviceId}
                        value={device.deviceId}
                        className="text-xs"
                      >
                        {device.label || "未命名设备"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                )}
              </Select>
              <Button
                size="sm"
                className="h-9 w-full"
                onClick={() => setPaused(false)}
                disabled={!selectedDevice || filteredDevices.length === 0}
              >
                <Camera data-icon="inline-start" />
                开启摄像头
              </Button>
            </div>
          </div>
        )}
        {!paused && (
          <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2">
            <div className="max-w-[70%] flex-1">
              <Select
                value={selectedDevice || undefined}
                onValueChange={setSelectedDevice}
              >
                <SelectTrigger className="w-full border bg-background/70 backdrop-blur">
                  <SelectValue placeholder="切换摄像头" />
                </SelectTrigger>
                {filteredDevices.length > 0 && (
                  <SelectContent>
                    {filteredDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        <span className="truncate">
                          {device.label || "未命名摄像头"}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                )}
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-9 shrink-0"
              onClick={() => setPaused(true)}
            >
              <Pause className="size-4" />
              停止
            </Button>
          </div>
        )}
        {isResolving && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm shadow-sm">
              <RefreshCw className="size-4 animate-spin" />
              正在读取候选人信息...
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) setLookup(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认签到</DialogTitle>
            <DialogDescription>
              该同学在本轮有以下办公部门报名，逐条确认签到。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {lookup?.matches.map((match) => (
              <div
                key={match.flowId}
                className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {match.departmentLabel}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {officeChoiceLabel(match.choice) || "—"}
                    </span>
                  </span>
                  {match.existing ? (
                    <Badge variant="outline">
                      已签到 · {match.existing.queueNo} ·{" "}
                      {interviewCheckinStatusLabel(match.existing.status)}
                    </Badge>
                  ) : match.candidate ? (
                    <Button
                      size="sm"
                      loading={pendingUserFlowId === match.candidate.userFlowId}
                      onClick={() => handleSignIn(match)}
                    >
                      签到
                    </Button>
                  ) : (
                    <Badge variant="secondary">报名已结束</Badge>
                  )}
                </div>
                {match.candidate ? (
                  <p className="text-xs text-muted-foreground">
                    时段：{match.candidate.interviewSlot || "未选择"}
                    {match.candidate.otherDepartments.length > 0
                      ? ` · 另有 ${match.candidate.otherDepartments.join("/")}`
                      : ""}
                    {checkinBlockNote(match.block)
                      ? ` · ${checkinBlockNote(match.block)}`
                      : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CheckinScanner;

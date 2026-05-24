'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMediaDevices } from 'react-media-devices';
import { useZxing } from 'react-zxing';
import { Camera, Pause, QrCode, RefreshCw } from 'lucide-react';

import { useUserInfoById as getUserInfoById } from '@/hooks/useUserInfoById';
import { cn } from '@/lib/utils';
import { userType } from '@/types/user';
import { toast } from 'sonner';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

const QRCodeScanner = () => {
  const { devices } = useMediaDevices({
    constraints: { video: true, audio: false },
  });
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [paused, setPaused] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [userInfo, setUserInfo] = useState<userType>();

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
      const rearDevice =
        filteredDevices.find((d) =>
          /\b(back|environment|后置|后置摄像头)\b/i.test(d.label || ""),
        ) ?? filteredDevices[filteredDevices.length - 1];
      setSelectedDevice(rearDevice.deviceId);
    }
  }, [filteredDevices, selectedDevice]);

  const handleProcessStudent = async (payload: { uid: number; time: number }) => {
    const userInfo = await getUserInfoById(payload.uid).catch(() => {
      toast.error('未找到该学生');
      return null;
    });

    if (!userInfo) {
      return;
    }

    setUserInfo(userInfo);
    setShowDialog(true);
  };

  const { ref } = useZxing({
    async onDecodeResult(result) {
      if (paused || isResolving) {
        return;
      }

      setPaused(true);
      setIsResolving(true);

      try {
        const parsedResult = JSON.parse(atob(result.getText()));
        await handleProcessStudent(parsedResult);
      } catch {
        toast.error('二维码内容无效，请重试');
      } finally {
        setIsResolving(false);
      }
    },
    paused,
    deviceId: selectedDevice || undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            摄像头扫码阅卷
            <Badge variant={paused ? 'secondary' : 'default'} className="scale-90 origin-left">
              {paused ? '待启动' : '扫描中'}
            </Badge>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {filteredDevices.length > 0
              ? `已识别 ${filteredDevices.length} 个可用设备，选择后开始扫描。`
              : '未识别到可用摄像头设备'}
          </p>
        </div>
      </div>
      <div className="relative min-h-[300px] overflow-hidden rounded-xl border bg-muted/40 shadow-inner">
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          className={cn(
            'h-full min-h-[300px] w-full object-cover transition-opacity duration-500',
            paused && 'opacity-20 blur-sm',
          )}
        />
        {/* Subtle camera finder frame */}
        <div className="pointer-events-none absolute inset-0 border-[2px] border-black/5 m-4 rounded-lg" />
        
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border/40 bg-background/80 p-5 shadow-lg backdrop-blur-md">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-primary/10 p-2.5 text-primary">
                  <QrCode className="size-5" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="font-medium text-sm text-foreground">准备扫描二维码</p>
                  <p className="text-xs text-muted-foreground">
                    对准考生身份码自动识别
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 mt-1">
                <Select
                  value={selectedDevice || undefined}
                  onValueChange={(value) => setSelectedDevice(value)}
                >
                  <SelectTrigger
                    className="w-full h-8 text-xs bg-background/50"
                    disabled={filteredDevices.length === 0}
                  >
                    <SelectValue placeholder="请选择摄像头" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs">
                        <div className="flex items-center gap-2 overflow-hidden w-full">
                          <span className="truncate block">{device.label || '未命名设备'}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="w-full font-medium h-8 text-xs"
                  onClick={() => setPaused(false)}
                  disabled={!selectedDevice || filteredDevices.length === 0}
                >
                  <Camera data-icon="inline-start" className="mr-1.5 size-3.5" />
                  开启摄像头
                </Button>
                {filteredDevices.length === 0 && (
                  <p className="text-[10px] text-center text-destructive/80 mt-1">
                    未找到可用摄像头权限
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {!paused && (
          <div className="absolute top-4 inset-x-4 flex items-start justify-between gap-3 pointer-events-none">
            <div className="rounded-full bg-black/60 backdrop-blur-md px-3.5 py-1.5 text-xs text-white/90 font-medium shadow-sm flex items-center gap-2 border border-white/10">
              <div className="size-2 rounded-full bg-green-500 animate-pulse" />
              请将二维码对准中心区域
            </div>
          </div>
        )}
        {!paused && (
          <div className="absolute bottom-4 inset-x-4 flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0 max-w-[160px]">
              <Select
                value={selectedDevice || undefined}
                onValueChange={(value) => setSelectedDevice(value)}
              >
                <SelectTrigger className="w-full bg-black/60 backdrop-blur border-white/10 text-white hover:bg-black/70 focus:ring-0">
                  <SelectValue placeholder="切换摄像头" />
                </SelectTrigger>
                <SelectContent>
                  {filteredDevices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      <div className="flex items-center gap-2 overflow-hidden w-full">
                        <Camera className="shrink-0 size-3.5 text-muted-foreground opacity-70" />
                        <span className="truncate block">{device.label || '未命名摄像头'}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="shadow-lg shrink-0"
              onClick={() => setPaused(true)}
            >
              <Pause className="size-4" />
              <span className="hidden sm:inline">停止</span>
            </Button>
          </div>
        )}
        {isResolving && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm shadow-sm">
              <RefreshCw className="size-4 animate-spin" />
              正在读取考生信息...
            </div>
          </div>
        )}
      </div>
      <Dialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) {
            setUserInfo(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认学生信息</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">学号</p>
              <p className="font-medium">{userInfo?.studentId}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">姓名</p>
              <p className="font-medium">{userInfo?.name}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">专业</p>
              <p className="font-medium">{userInfo?.major || '未填写'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              取消
            </Button>
            <Button asChild>
              <Link href={`/dashboard/review/marking?user=${userInfo?.studentId}`}>
                确认并开始阅卷
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QRCodeScanner;

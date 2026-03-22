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
      setSelectedDevice(filteredDevices[0].deviceId);
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
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={paused ? 'secondary' : 'default'}>
          {paused ? '待启动' : '扫描中'}
        </Badge>
        <Badge variant="outline">
          {filteredDevices.length > 0
            ? `已识别 ${filteredDevices.length} 个摄像头`
            : '未识别到摄像头'}
        </Badge>
        {selectedDevice && (
          <Badge variant="outline" className="max-w-full truncate">
            {filteredDevices.find((device) => device.deviceId === selectedDevice)
              ?.label || '当前摄像头'}
          </Badge>
        )}
      </div>
      <div className="relative min-h-80 overflow-hidden rounded-2xl border bg-muted/30">
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          className={cn(
            'h-full min-h-80 w-full object-cover transition-opacity',
            paused && 'opacity-40',
          )}
        />
        <div className="pointer-events-none absolute inset-0 border-[18px] border-black/10" />
        {paused && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/75 p-6 backdrop-blur-sm">
            <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border bg-background p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <QrCode className="size-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <p className="font-medium">摄像头扫码阅卷</p>
                  <p className="text-sm text-muted-foreground">
                    选择设备后开始扫描，识别到考生二维码后会先弹出确认框。
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Select
                  value={selectedDevice || undefined}
                  onValueChange={(value) => setSelectedDevice(value)}
                >
                  <SelectTrigger
                    className="w-full"
                    disabled={filteredDevices.length === 0}
                  >
                    <SelectValue placeholder="请选择摄像头" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDevices.map((device) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || '未命名摄像头'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setPaused(false)}
                  disabled={!selectedDevice || filteredDevices.length === 0}
                >
                  <Camera data-icon="inline-start" />
                  开始扫描
                </Button>
                {filteredDevices.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    请确认浏览器已授予摄像头权限，或重新插拔设备后刷新页面。
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {!paused && (
          <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-3">
            <div className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
              请将考生二维码放入取景框内
            </div>
            <Select
              value={selectedDevice || undefined}
              onValueChange={(value) => setSelectedDevice(value)}
            >
              <SelectTrigger className="w-56 bg-background/90">
                <SelectValue placeholder="请选择摄像头" />
              </SelectTrigger>
              <SelectContent>
                {filteredDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || '未命名摄像头'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {!paused && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="absolute bottom-3 right-3"
            onClick={() => setPaused(true)}
          >
            <Pause data-icon="inline-start" />
            暂停扫描
          </Button>
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

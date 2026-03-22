'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import React from 'react';
import { Button } from '../ui/button';
import { QrCode, ShieldCheck } from 'lucide-react';
import QRCode from 'react-qr-code';
import originalDayjs from '@/lib/dayjs';

export const ShowQrCode = ({ uid }: { uid: string }) => {
  const [qrValue] = React.useState(() =>
    btoa(
      JSON.stringify({
        uid,
        time: Date.now(),
      }),
    ),
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <QrCode data-icon="inline-start" />
          身份码
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <DialogTitle className="text-xl">我的身份码</DialogTitle>
          <DialogDescription className="text-center">
            请勿将此二维码分享给他人，请在批改试卷时展示给讲师
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-white p-4 shadow-sm">
            <QRCode value={qrValue} size={200} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-3xl font-mono font-semibold tracking-widest text-foreground">
              <CurrentTime />
            </p>
            <p className="text-xs text-muted-foreground">实时时间验证</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const CurrentTime = () => {
  const [currentTime, setCurrentTime] = React.useState(
    originalDayjs().format('HH:mm:ss'),
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(originalDayjs().format('HH:mm:ss'));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return currentTime;
};

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
import { QrCode } from 'lucide-react';
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>我的身份码</DialogTitle>
          <DialogDescription>
            请勿将此二维码分享给他人，请在批改试卷时展示给讲师
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col items-center gap-4">
          <div className="flex w-full justify-center">
            <QRCode value={qrValue} />
          </div>
          <p className="text-2xl text-foreground">
            <CurrentTime />
          </p>
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

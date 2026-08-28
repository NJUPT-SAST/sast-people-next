'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { register } from '@/action/user-flow/register';
import { toast } from 'sonner';
import { displayFlow } from '@/types/flow';
import originalDayjs from '@/lib/dayjs';
import { isValidExternalUrl } from '@/lib/link';

const isFlowActive = (flow: displayFlow, now: Date) =>
  now >= flow.startedAt && (!flow.endedAt || now <= flow.endedAt);

const SubmitRegister = ({
  flowList,
  uid,
}: { flowList: displayFlow[]; uid: number }) => {
  const safeFlowList = Array.isArray(flowList) ? flowList : [];
  const hasFlows = safeFlowList.length > 0;
  const now = new Date();
  const hasOpenFlows = safeFlowList.some((flow) => isFlowActive(flow, now));
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<number | null>(null);
  const [portfolioLink, setPortfolioLink] = useState("");
  const [portfolioDescription, setPortfolioDescription] = useState("");
  const [portfolioLinkError, setPortfolioLinkError] = useState<string | null>(null);
  const [applyGroup, setApplyGroup] = useState("");
  const [applyGroupError, setApplyGroupError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentFlow = safeFlowList.find((flow) => flow.id === selectedFlow);
  const needsPortfolioLink = currentFlow?.type !== "recruitment" && !!currentFlow;
  const flowGroupOptions = currentFlow?.groupOptions ?? [];
  const needsApplyGroup =
    needsPortfolioLink && flowGroupOptions.length > 0;

  const handleRegister = async () => {
    if (selectedFlow) {
      if (needsPortfolioLink && !isValidExternalUrl(portfolioLink)) {
        setPortfolioLinkError("作品链接格式不正确，请填写有效的 URL");
        return;
      }
      setPortfolioLinkError(null);
      if (needsApplyGroup && !applyGroup) {
        setApplyGroupError("请选择投递组别");
        return;
      }
      setApplyGroupError(null);
      setIsSubmitting(true);
      toast.promise(
        (async () => {
          try {
            const result = await register(
              selectedFlow,
              uid,
              needsPortfolioLink ? portfolioLink : undefined,
              needsPortfolioLink ? portfolioDescription : undefined,
              needsApplyGroup ? applyGroup : undefined,
            );
            if ((result?.success ?? false) === false) {
              throw Error(result?.error?.message ?? "服务器错误")
            }
            setOpen(false);
            setSelectedFlow(null);
            setPortfolioLink("");
            setPortfolioDescription("");
            setPortfolioLinkError(null);
            setApplyGroup("");
            setApplyGroupError(null);
            router.refresh();
          } catch (error) {
            if (error instanceof Error) {
              throw new Error(error.message);
            } else {
              throw new Error("报名失败，请稍后再试");
            }
          } finally {
            setIsSubmitting(false);
          }
        })(),
        {
          loading: '正在提交报名...',
          success: '报名成功',
          error: (error) => {
            // 这里我们可以根据错误信息来显示不同的提示
            return error instanceof Error ? error.message : "报名失败，请稍后再试";
          },
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10 w-full sm:h-8 sm:w-auto" disabled={!hasOpenFlows}>
          {hasFlows && !hasOpenFlows ? "暂无开放报名" : "提交报名"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>选择报名流程</DialogTitle>
          <DialogDescription>请选择您要报名的流程</DialogDescription>
        </DialogHeader>
        <Select
          disabled={!hasFlows}
          onValueChange={(value) => {
            setSelectedFlow(Number(value));
            setPortfolioLink("");
            setPortfolioDescription("");
            setPortfolioLinkError(null);
            setApplyGroup("");
            setApplyGroupError(null);
          }}
        >
          <SelectTrigger className="w-full text-left [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:justify-start [&_[data-slot=select-value]]:text-left">
            <SelectValue placeholder="选择流程" />
          </SelectTrigger>
          {hasFlows && (
            <SelectContent>
              {safeFlowList.map((flow) => {
                const isBeforeStart = now < flow.startedAt;
                const isAfterEnd = flow.endedAt ? now > flow.endedAt : false;
                const isActive = isFlowActive(flow, now);

                return (
                  <SelectItem
                    key={flow.id}
                    value={flow.id.toString()}
                    disabled={!isActive}
                    className="items-start text-left [&>span:last-child]:w-full"
                  >
                    <div className="flex w-full flex-col items-start text-left">
                      <span className={isActive ? '' : 'text-muted-foreground'}>
                        {flow.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {isBeforeStart && `未开始 (${originalDayjs(flow.startedAt).format('YYYY-MM-DD HH:mm')})`}
                        {isAfterEnd && `已结束 (${originalDayjs(flow.endedAt).format('YYYY-MM-DD HH:mm')})`}
                        {isActive && `进行中 (${originalDayjs(flow.endedAt).format('YYYY-MM-DD HH:mm')} 截止)`}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          )}
        </Select>
        {needsPortfolioLink && (
          <div className="space-y-3">
            {needsApplyGroup && (
              <div className="space-y-2">
                <Label htmlFor="apply-group">投递组别</Label>
                <Select
                  value={applyGroup}
                  onValueChange={(value) => {
                    setApplyGroup(value);
                    if (applyGroupError) setApplyGroupError(null);
                  }}
                >
                  <SelectTrigger
                    id="apply-group"
                    className="w-full text-left [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:justify-start [&_[data-slot=select-value]]:text-left"
                  >
                    <SelectValue placeholder="选择投递组别" />
                  </SelectTrigger>
                  <SelectContent>
                    {flowGroupOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {applyGroupError && (
                  <p role="alert" className="text-sm text-destructive">
                    {applyGroupError}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="portfolio-link">作品链接</Label>
              <Input
                id="portfolio-link"
                value={portfolioLink}
                onChange={(event) => {
                  setPortfolioLink(event.target.value);
                  if (portfolioLinkError) setPortfolioLinkError(null);
                }}
                placeholder="https://..."
                inputMode="url"
                aria-invalid={Boolean(portfolioLinkError)}
              />
              {portfolioLinkError && (
                <p role="alert" className="text-sm text-destructive">
                  {portfolioLinkError}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio-description">作品简介</Label>
              <Textarea
                id="portfolio-description"
                value={portfolioDescription}
                onChange={(event) => setPortfolioDescription(event.target.value)}
                placeholder="简单介绍作品内容、你的负责部分和使用技术"
                className="min-h-24 resize-y"
              />
              <p className="text-xs text-muted-foreground">
                让讲师快速了解这个仓库的用途和你的贡献。
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={handleRegister}
            disabled={!selectedFlow || isSubmitting}
            loading={isSubmitting}
          >
            确认报名
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SubmitRegister;

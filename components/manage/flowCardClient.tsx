'use client';
import React, { useMemo, useState, useEffect } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  CircleDashed,
  ArrowRight,
  ArrowLeft,
  X,
  LockOpen,
} from 'lucide-react';
import { displayUserFlow } from '@/types/userflow';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '../ui/hover-card';
import { Badge } from '../ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { backward, finish, forward, reject, reopen } from '@/action/user-flow/edit';
import { mutate } from 'swr';
import { toast } from 'sonner';

const statusIcons = {
  pending: CircleDashed,
  ongoing: Clock,
  passed: Clock,
  failed: Clock,
  accepted: CheckCircle,
  rejected: XCircle,
};

const statusName: Record<string, string> = {
  pending: '未开始',
  ongoing: '进行中',
  passed: '拟通过',
  failed: '拟不通过',
  accepted: '已通过',
  rejected: '未通过',
};

interface FlowCardProps {
  flow: displayUserFlow;
  role: number;
}

export const FlowCard = ({ flow: initialFlow, role }: FlowCardProps) => {
  const [flow, setFlow] = useState(initialFlow);

  // 当父组件传入新的 flow 时同步更新
  useEffect(() => {
    setFlow(initialFlow);
  }, [initialFlow]);

  const steps = useMemo(
    () => [...flow.steps].sort((a, b) => a.order - b.order),
    [flow.steps],
  );

  const currentStepIndex = useMemo(() => {
    const matchedIndex = steps.findIndex((step) => step.order === flow.currentStepOrder);
    return matchedIndex >= 0 ? matchedIndex : 0;
  }, [steps, flow.currentStepOrder]);

  const activeStep = steps[currentStepIndex];
  const activeStepOrder = activeStep?.order ?? 0;

  const isLastStep = useMemo(() => {
    return currentStepIndex === steps.length - 1;
  }, [currentStepIndex, steps.length]);

  const [loading, setLoading] = React.useState(false);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-primary';
      case 'rejected':
        return 'bg-destructive';
      case 'ongoing':
        return 'bg-blue-500';
      default:
        return 'bg-muted';
    }
  };

  const doAction = async (action: () => Promise<void>, optimisticUpdate: (f: displayUserFlow) => displayUserFlow) => {
    setLoading(true);
    // 立即乐观更新 UI
    setFlow((prev) => optimisticUpdate(prev));
    try {
      await action();
      // 后台重新验证，确保数据一致
      mutate(`/api/flow?uid=${flow.fkUserId}`);
      mutate(`/api/flow/${flow.id}`);
    } catch (e) {
      console.error('[FlowCard] operation failed:', e);
      toast.error('操作失败，请重试');
      // 恢复为 initialFlow
      setFlow(initialFlow);
    } finally {
      setLoading(false);
    }
  };

  const handleForward = () => doAction(
    () => forward(flow.id),
    (f) => ({ ...f, currentStepOrder: f.currentStepOrder + 1 }),
  );
  const handleBackward = () => doAction(
    () => backward(flow.id),
    (f) => ({ ...f, currentStepOrder: f.currentStepOrder - 1 }),
  );
  const handleLastStep = () => doAction(
    () => finish(flow.id),
    (f) => ({ ...f, status: 'accepted' as const }),
  );
  const handleReject = () => doAction(
    () => reject(flow.id),
    (f) => ({ ...f, status: 'rejected' as const }),
  );
  const handleReopen = () => doAction(
    () => reopen(flow.id),
    (f) => ({ ...f, status: 'ongoing' as const }),
  );

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {flow.title}
        </CardTitle>
        <Badge
          variant={
            flow.status === 'ongoing' || flow.status === 'pending' || flow.status === 'passed' || flow.status === 'failed'
              ? 'secondary'
              : flow.status === 'accepted'
                ? 'default'
                : 'destructive'
          }
        >
          {flow.status === 'ongoing' || flow.status === 'pending'
            ? '流程进行中'
            : flow.status === 'passed' || flow.status === 'failed'
              ? statusName[flow.status]
            : flow.status === 'accepted'
              ? '已通过考核'
              : '未通过考核'}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between relative my-5">
          {/* 背景横线 */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted z-10"></div>
          {steps.map((step, index) => {
            const stepStatus =
              flow.status === 'accepted'
                ? 'accepted'
                : flow.status === 'passed' || flow.status === 'failed'
                ? step.order <= activeStepOrder
                  ? 'ongoing'
                  : 'pending'
                : flow.status === 'rejected'
                ? step.order < activeStepOrder
                  ? 'accepted'
                  : step.order === activeStepOrder
                  ? 'rejected'
                  : 'pending'
                : step.order < activeStepOrder
                ? 'accepted'
                : step.order === activeStepOrder
                  ? 'ongoing'
                  : 'pending';
            const Icon =
              statusIcons[stepStatus as keyof typeof statusIcons] || AlertCircle;

            return (
              <React.Fragment key={`${flow.id}-${index}-step`}>
                <HoverCard openDelay={100}>
                  <HoverCardTrigger className="z-30">
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center text-sm
                        ${
                          index <= currentStepIndex
                            ? getStatusColor(stepStatus) + ' text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{step.title}</h4>
                      <p className="text-sm">{step.description}</p>
                      <p className="text-xs text-muted-foreground">
                        状态: {statusName[stepStatus] || stepStatus}
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
                {index < steps.length - 1 && (
                  <div
                    className={`absolute top-1/2 h-0.5 z-20 ${getStatusColor(
                      stepStatus,
                    )}`}
                    style={{
                      left: `calc(${
                        (index / (steps.length - 1)) * 100
                      }% + 7px)`,
                      width: `calc(${
                        100 / (steps.length - 1)
                      }% - 14px)`,
                    }}
                  ></div>
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex justify-between md:items-end md:flex-row flex-col items-start gap-3">
          <div>
            <p className="mt-4 text-sm text-muted-foreground">
                当前步骤: {activeStep?.title || '（流程未开始）'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {activeStep?.description ||
                '流程已结束'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {role >= 3 && (flow.status === 'accepted' || flow.status === 'rejected') ? (
              <Button
                disabled={loading}
                variant="secondary"
                size="icon-sm"
                onClick={handleReopen}
              >
                <LockOpen />
              </Button>
            ) : role >= 3 ? (
              <>
                {currentStepIndex > 0 && (
                  <Button
                    disabled={loading}
                    variant="secondary"
                    size="icon-sm"
                    onClick={handleBackward}
                  >
                    <ArrowLeft />
                  </Button>
                )}
                <Button
                  disabled={loading}
                  variant="destructive"
                  size="icon-sm"
                  onClick={handleReject}
                >
                  <X />
                </Button>
                <Button
                  disabled={loading}
                  variant="secondary"
                  size="icon-sm"
                  onClick={isLastStep ? handleLastStep : handleForward}
                >
                  <ArrowRight />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import {
  deliveryStatusText,
  formatDate,
  getDeliveryStatusBadgeClass,
  hiddenScrollbar,
} from "./emailDashboardConstants";
import type { EmailBatch } from "./emailDashboardTypes";

export function EmailBatchStatusDialog({ batch }: { batch: EmailBatch }) {
  const deliveries = Array.isArray(batch.deliveries) ? batch.deliveries : [];
  const failedCount = deliveries.filter(
    (delivery) => delivery.status === "failed" || delivery.status === "dead",
  ).length;
  const sentCount = deliveries.filter((delivery) => delivery.status === "sent").length;
  const renderDeliveryStatus = (status: string) => (
    <Badge variant="outline" className={getDeliveryStatusBadgeClass(status)}>
      {deliveryStatusText[status] ?? status}
    </Badge>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full min-[560px]:w-auto">
          明细
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[88dvh] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-5 sm:w-[min(960px,calc(100vw-2rem))] sm:max-w-none sm:p-6",
          hiddenScrollbar,
        )}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{batch.flowTitle} 发送明细</DialogTitle>
          <DialogDescription>
            每位收件人的发送状态和失败原因会保留在这里。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">总数</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{deliveries.length}</p>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">已发送</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-primary">{sentCount}</p>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">失败</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-destructive">{failedCount}</p>
          </div>
        </div>

        <div
          className={cn(
            "flex max-h-[68dvh] flex-col gap-2 overflow-y-auto pr-1 md:hidden",
            hiddenScrollbar,
          )}
        >
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="rounded-md border bg-card px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-5">
                    {delivery.userName}
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                    {delivery.toAddress}
                  </p>
                </div>
                <div className="shrink-0">
                  {renderDeliveryStatus(delivery.status)}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">尝试次数</span>
                <span className="text-right tabular-nums">
                  {delivery.attemptCount > 0
                    ? `${delivery.attemptCount} 次`
                    : "-"}
                </span>
                <span className="text-muted-foreground">发送时间</span>
                <span className="text-right tabular-nums">
                  {formatDate(delivery.sentAt)}
                </span>
                <span className="text-muted-foreground">失败原因</span>
                <div className="min-w-0 text-right">
                  <span
                    className={cn(
                      "break-words",
                      delivery.errorMessage && "text-destructive",
                    )}
                  >
                    {delivery.errorMessage ?? "-"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "hidden max-h-[56vh] overflow-y-auto rounded-md border md:block",
            hiddenScrollbar,
          )}
        >
          <Table className="table-fixed" containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[16%]">姓名</TableHead>
                <TableHead className="w-[28%]">收件地址</TableHead>
                <TableHead className="w-[10%]">状态</TableHead>
                <TableHead className="w-[9%]">尝试</TableHead>
                <TableHead className="w-[17%]">发送时间</TableHead>
                <TableHead className="w-[20%]">失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="truncate font-medium" title={delivery.userName}>
                    {delivery.userName}
                  </TableCell>
                  <TableCell className="truncate font-mono text-sm" title={delivery.toAddress}>
                    {delivery.toAddress}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {renderDeliveryStatus(delivery.status)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {delivery.attemptCount > 0
                      ? `${delivery.attemptCount} 次`
                      : "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(delivery.sentAt)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "truncate text-sm",
                      delivery.errorMessage
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                    title={delivery.errorMessage ?? "-"}
                  >
                    {delivery.errorMessage ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { PageTitle } from "@/components/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { verifyRole } from "@/lib/dal";
import { readServerErrorLog } from "@/lib/server-error-log";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SENTRY_ISSUES_URL =
  "https://sast-an.sentry.io/issues/?project=4511461071781888&statsPeriod=14d";

const formatTime = (timestamp: string | null) => {
  if (!timestamp) return "未知时间";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const contextItems = (context: NonNullable<ReturnType<typeof readServerErrorLog>["entries"][number]["context"]>) =>
  [
    ["路由", context.path],
    ["方法", context.method],
    ["操作", context.action],
    ["用户", context.userId],
    ["权限", context.role],
    ["流程", context.flowId],
    ["报名", context.userFlowId],
    ["学号", context.studentId],
    ["目标用户", context.targetUserId],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

const ErrorLogPage = async () => {
  await verifyRole(3);
  const { count, entries } = readServerErrorLog(30);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button asChild variant="outline" size="sm">
            <Link href={SENTRY_ISSUES_URL} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
              Sentry
            </Link>
          </Button>
          <Badge variant="outline">共 {count} 条</Badge>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            暂无错误日志
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {entries.map((entry) => (
            <Card key={entry.index}>
              <CardHeader className="gap-2 pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="break-words text-base">
                      {entry.source ?? "未知来源"}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTime(entry.timestamp)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="w-fit shrink-0">
                    #{entry.index}
                  </Badge>
                </div>
                {entry.message && (
                  <p className="break-words text-sm text-destructive">
                    {entry.message}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {entry.name && (
                    <Badge variant="outline" className="font-normal">
                      类型: {entry.name}
                    </Badge>
                  )}
                  {entry.digest && (
                    <Badge variant="outline" className="font-mono font-normal">
                      Digest: {entry.digest}
                    </Badge>
                  )}
                </div>
                {entry.context && (
                  <div className="flex flex-wrap gap-2">
                    {contextItems(entry.context).map(([label, value]) => (
                      <Badge key={label} variant="outline" className="font-normal">
                        {label}: {String(value)}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {entry.context?.metadata && (
                  <div className="mb-3 rounded-md border bg-muted/20 p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      业务上下文
                    </p>
                    <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                      {JSON.stringify(entry.context.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                <ScrollArea className="max-h-72 rounded-md border bg-muted/30">
                  <pre className="whitespace-pre-wrap break-words p-3 text-xs leading-relaxed">
                    {entry.raw}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};

export default ErrorLogPage;

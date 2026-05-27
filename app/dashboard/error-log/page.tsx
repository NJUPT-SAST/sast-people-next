import { PageTitle } from "@/components/route";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { verifyRole } from "@/lib/dal";
import { readServerErrorLog } from "@/lib/server-error-log";

export const dynamic = "force-dynamic";

const formatTime = (timestamp: string | null) => {
  if (!timestamp) return "未知时间";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("zh-CN", { hour12: false });
};

const ErrorLogPage = async () => {
  await verifyRole(3);
  const { count, entries } = readServerErrorLog(30);

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle />
        <Badge variant="outline">共 {count} 条</Badge>
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
              </CardHeader>
              <CardContent>
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

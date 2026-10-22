import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader, PageTitle } from "@/components/route";
import { CollectionFormDialog } from "@/components/collection/collection-form-dialog";
import { collectionFillRoleLabel } from "@/const/collection";
import { listVisibleCollectionForms } from "@/lib/collection";
import { canManageCollectionForm } from "@/lib/collection-access";
import { collectionFormPhase } from "@/lib/collection-status";
import { verifySession } from "@/lib/dal";
import { formatBeijingDate, formatBeijingDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const session = await verifySession();
  const forms = await listVisibleCollectionForms(session);
  const canManage = canManageCollectionForm(session);

  return (
    <>
      <PageHeader>
        <PageTitle />
        {canManage && <CollectionFormDialog />}
      </PageHeader>

      {forms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">暂无收集表</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "点击右上角「新建收集表」，设置填写身份和时间后即可分享。"
              : "部长发布收集表后会显示在这里。"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {forms.map((form) => {
            const phase = collectionFormPhase(form);
            const phaseLabel =
              phase === "open" ? "收集中" : phase === "upcoming" ? "未开始" : "已截止";
            return (
              <Card key={form.id} className="gap-4">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words">{form.title}</span>
                    <Badge variant={phase === "open" ? "default" : "secondary"}>
                      {phaseLabel}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    创建于 {formatBeijingDate(form.createdAt)}
                    {form.startsAt
                      ? ` · 开始 ${formatBeijingDateTime(form.startsAt)}`
                      : " · 立即开始"}
                    {form.deadline
                      ? ` · 截止 ${formatBeijingDateTime(form.deadline)}`
                      : " · 不设截止"}
                    {" · "}
                    {collectionFillRoleLabel(form.allowedRoles)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                    {form.instructions}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {form.submissionId ? "我已填写" : "我未填写"}
                      </Badge>
                      {canManage && (
                        <span className="text-xs text-muted-foreground">
                          共 {form.submissionCount} 人填写
                        </span>
                      )}
                    </div>
                    <Button asChild size="sm">
                      <Link href={`/dashboard/collection/${form.id}`}>
                        {canManage
                          ? "查看详情"
                          : phase === "open"
                            ? form.submissionId
                              ? "查看与修改"
                              : "去填写"
                            : "查看"}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

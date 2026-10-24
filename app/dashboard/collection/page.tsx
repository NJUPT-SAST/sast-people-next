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
import { collectionFillRoleLabel, collectionFlowScopeLabel } from "@/const/collection";
import { listCollectionFlowOptions, listVisibleCollectionForms } from "@/lib/collection";
import { listCollectionTemplateOptions } from "@/lib/collection-templates";
import { canManageCollectionForm } from "@/lib/collection-access";
import { collectionFormPhase } from "@/lib/collection-status";
import { verifySession } from "@/lib/dal";
import { formatBeijingDate, formatBeijingDateTime } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const session = await verifySession();
  const canManage = canManageCollectionForm(session);
  const [forms, flows, templates] = await Promise.all([
    listVisibleCollectionForms(session),
    listCollectionFlowOptions(),
    canManage ? listCollectionTemplateOptions() : Promise.resolve([]),
  ]);
  const activeForms = canManage
    ? forms
    : forms.filter((form) => collectionFormPhase(form) === "open");
  const historyForms = canManage
    ? []
    : forms.filter(
        (form) =>
          collectionFormPhase(form) !== "open" && form.submissionId !== null,
      );
  const hasAnyForms = activeForms.length > 0 || historyForms.length > 0;

  return (
    <>
      <PageHeader>
        <PageTitle />
        {canManage && <CollectionFormDialog flows={flows} templates={templates} />}
      </PageHeader>

      {!hasAnyForms ? (
        <div className="rounded-lg border border-dashed border-border/70 px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">暂无收集表</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage
              ? "点击右上角「新建收集表」，设置填写身份和时间后即可分享。"
              : "部长发布收集表后会显示在这里。"}
          </p>
        </div>
      ) : (
        <>
          {activeForms.length === 0 && historyForms.length > 0 && (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              当前没有进行中的收集表。
            </p>
          )}

          {activeForms.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {activeForms.map((form) => {
                const phase = collectionFormPhase(form);
                const phaseLabel =
                  phase === "open" ? "收集中" : phase === "upcoming" ? "未开始" : "已结束";
                return (
                  <Card key={form.id} className="flex h-full flex-col gap-0">
                    <CardHeader className="gap-2">
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words">{form.title}</span>
                        <Badge variant={phase === "open" ? "default" : "secondary"}>
                          {phaseLabel}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="space-y-1">
                        <span className="block">
                          {form.templateName && form.templateName !== form.title
                            ? `${form.templateName} · `
                            : ""}
                          创建于 {formatBeijingDate(form.createdAt)}
                        </span>
                        <span className="block">
                          {form.startsAt
                            ? `开始 ${formatBeijingDateTime(form.startsAt)}`
                            : "立即开始"}
                          {" · "}
                          {form.deadline
                            ? `截止 ${formatBeijingDateTime(form.deadline)}`
                            : "不设截止"}
                        </span>
                        <span className="block">
                          {collectionFillRoleLabel(form.allowedRoles)}
                          {form.allowedFlowIds.length > 0 && (
                            <>
                              {" · 仅限 "}
                              {collectionFlowScopeLabel(form.allowedFlowIds, flows)} 通过者
                            </>
                          )}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex flex-col gap-3">
                      <p className="line-clamp-2 min-h-10 whitespace-pre-line text-sm text-muted-foreground">
                        {form.instructions || "暂无填表说明。"}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">
                            {form.submissionId ? "我已填写" : "我未填写"}
                          </Badge>
                          {form.submissionReturnedAt && (
                            <Badge
                              variant="outline"
                              className="border-destructive/30 text-destructive"
                            >
                              已退回
                            </Badge>
                          )}
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
                              : form.submissionId
                                ? "查看与修改"
                                : "去填写"}
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {historyForms.length > 0 && (
            <section className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">我的填写记录</h2>
                <span className="text-xs text-muted-foreground">
                  仅自己可见 · 收集结束后仍可查看
                </span>
              </div>
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
                {historyForms.map((form) => {
                  const ended = collectionFormPhase(form) === "closed";
                  return (
                    <div
                      key={form.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {form.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {ended ? "已结束" : "未开始"}
                          {form.submissionReturnedAt
                            ? ` · 已退回${form.submissionUpdatedAt ? `（原填写于 ${formatBeijingDateTime(form.submissionUpdatedAt)}）` : ""}`
                            : form.submissionUpdatedAt
                              ? ` · 填写于 ${formatBeijingDateTime(form.submissionUpdatedAt)}`
                              : ""}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/collection/${form.id}`}>
                          查看记录
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

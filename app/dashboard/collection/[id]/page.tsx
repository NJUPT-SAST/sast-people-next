import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageTitle } from "@/components/route";
import {
  CollectionForm,
  type CollectionFormValues,
} from "@/components/collection/collection-form";
import { CollectionFormDialog } from "@/components/collection/collection-form-dialog";
import { CollectionManageActions } from "@/components/collection/collection-manage-actions";
import { CollectionSubmissionsTable } from "@/components/collection/collection-submissions-table";
import { collectionFillRoleLabel } from "@/const/collection";
import {
  getCollectionFormById,
  getCollectionSubmission,
  listCollectionSubmissions,
} from "@/lib/collection";
import {
  canFillCollectionForm,
  canManageCollectionForm,
  canViewCollectionForm,
} from "@/lib/collection-access";
import { collectionFormPhase } from "@/lib/collection-status";
import { verifySession } from "@/lib/dal";
import { formatBeijingDate, formatBeijingDateTime } from "@/lib/timezone";
import { useUserInfo as getUserInfo } from "@/hooks/useUserInfo";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const formId = Number(id);
  if (!Number.isInteger(formId) || formId <= 0) notFound();

  const session = await verifySession();
  const form = await getCollectionFormById(formId);
  if (!form) notFound();

  const ownSubmission = await getCollectionSubmission(formId, session.uid);
  if (!canViewCollectionForm(session, form, Boolean(ownSubmission))) notFound();

  const userInfo = await getUserInfo();
  const canManage = canManageCollectionForm(session);
  const canFill = canFillCollectionForm(session, form);
  const phase = collectionFormPhase(form);
  const submissions = canManage ? await listCollectionSubmissions(formId) : [];

  const initialValues: CollectionFormValues = {
    category: ownSubmission?.category ?? "",
    name: ownSubmission?.name ?? userInfo.name ?? "",
    birthMonth: ownSubmission?.birthMonth ?? "",
    politicalStatus: ownSubmission?.politicalStatus ?? "",
    college: ownSubmission?.college ?? userInfo.college ?? "",
    className: ownSubmission?.className ?? "",
    studentId: ownSubmission?.studentId ?? userInfo.studentId ?? "",
    enrollmentYear: ownSubmission?.enrollmentYear ?? null,
    graduationYear: ownSubmission?.graduationYear ?? null,
  };

  const linkProfile = {
    name: userInfo.name ?? "",
    studentId: userInfo.studentId ?? "",
    college: userInfo.college ?? "",
    major: userInfo.major ?? "",
    email: userInfo.email ?? "",
    qq: userInfo.qq ?? "",
  };

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/collection" aria-label="返回收集表列表">
              <ArrowLeft /> 返回
            </Link>
          </Button>
          <PageTitle />
          <Badge variant={phase === "open" ? "default" : "secondary"}>
            {phase === "open" ? "收集中" : phase === "upcoming" ? "未开始" : "已结束"}
          </Badge>
        </div>
        {canManage && (
          <CollectionFormDialog
            mode="edit"
            form={{
              id: form.id,
              title: form.title,
              instructions: form.instructions,
              extraFields: form.extraFields,
              allowedRoles: form.allowedRoles,
              startsAt: form.startsAt,
              deadline: form.deadline,
            }}
          />
        )}
      </PageHeader>

      <div
        className={
          canManage
            ? "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
            : "space-y-5"
        }
      >
        <div className="min-w-0 space-y-5">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="break-words">{form.title}</CardTitle>
              <CardDescription>
                创建于 {formatBeijingDate(form.createdAt)}
                {form.startsAt
                  ? ` · 开始 ${formatBeijingDateTime(form.startsAt)}`
                  : " · 立即开始"}
                {form.deadline
                  ? ` · 截止 ${formatBeijingDateTime(form.deadline)}`
                  : " · 不设截止"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {form.instructions || "暂无填表说明。"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>填写信息</CardTitle>
              <CardDescription>
                {ownSubmission
                  ? `最后更新：${formatBeijingDateTime(ownSubmission.updatedAt)}`
                  : "每人填写一份，收集结束前可随时修改。"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CollectionForm
                key={ownSubmission?.id ?? "new"}
                formId={form.id}
                editable={phase === "open" && canFill}
                initialValues={initialValues}
                hasSaved={Boolean(ownSubmission)}
                updatedAtLabel={
                  ownSubmission ? formatBeijingDateTime(ownSubmission.updatedAt) : null
                }
                extraFields={form.extraFields}
                initialExtraAnswers={ownSubmission?.extraAnswers ?? {}}
                linkProfile={linkProfile}
                readonlyNotice={
                  phase === "upcoming"
                    ? `收集将于 ${form.startsAt ? formatBeijingDateTime(form.startsAt) : "稍后"} 开始。`
                    : phase === "open" && !canFill
                      ? `此收集表仅面向：${collectionFillRoleLabel(form.allowedRoles)}。`
                      : undefined
                }
              />
            </CardContent>
          </Card>
        </div>

        {canManage && (
          <aside className="space-y-5 lg:sticky lg:top-4">
            <Card>
              <CardHeader>
                <CardTitle>收集设置</CardTitle>
                <CardDescription>
                  所有部长与管理员都可以管理、查看和导出。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
                  <dt className="text-muted-foreground">状态</dt>
                  <dd className="font-medium">
                    {phase === "open" ? "收集中" : phase === "upcoming" ? "未开始" : "已结束"}
                  </dd>
                  <dt className="text-muted-foreground">开始</dt>
                  <dd>{form.startsAt ? formatBeijingDateTime(form.startsAt) : "立即开始"}</dd>
                  <dt className="text-muted-foreground">截止</dt>
                  <dd>{form.deadline ? formatBeijingDateTime(form.deadline) : "不设截止"}</dd>
                  <dt className="text-muted-foreground">填写身份</dt>
                  <dd className="break-words">{collectionFillRoleLabel(form.allowedRoles)}</dd>
                  <dt className="text-muted-foreground">已填写</dt>
                  <dd>{submissions.length} 人</dd>
                </dl>

                <CollectionManageActions
                  formId={form.id}
                  status={form.status}
                  exportHref={`/api/collection/export?formId=${form.id}`}
                  shareToken={form.shareToken}
                />
              </CardContent>
            </Card>
          </aside>
        )}
      </div>

      {canManage && (
        <section className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">填写情况</h2>
            <span className="text-xs text-muted-foreground">
              共 {submissions.length} 条记录
            </span>
          </div>
          <CollectionSubmissionsTable
            formId={form.id}
            rows={submissions.map((row) => ({
              id: row.id,
              name: row.name,
              studentId: row.studentId,
              category: row.category,
              clubName: row.clubName,
              birthMonth: row.birthMonth,
              politicalStatus: row.politicalStatus,
              college: row.college,
              className: row.className,
              enrollmentYear: row.enrollmentYear,
              graduationYear: row.graduationYear,
              department: row.department,
              extraAnswers: row.extraAnswers,
              updatedAtLabel: formatBeijingDateTime(row.updatedAt),
            }))}
            extraFields={form.extraFields}
          />
        </section>
      )}
    </>
  );
}

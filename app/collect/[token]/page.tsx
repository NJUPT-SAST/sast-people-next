import { notFound, redirect } from "next/navigation";
import { getCollectionFormByShareToken, getCollectionSubmission } from "@/lib/collection";
import { canViewCollectionForm } from "@/lib/collection-access";
import { verifySession } from "@/lib/dal";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * 收集表分享链接：/collect/<token>。
 * 未登录先去登录页并带 next，登录后回到这里；登录完成后再跳到工作台内的表单页。
 */
export default async function CollectSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const form = await getCollectionFormByShareToken(token);
  if (!form) notFound();

  const session = await getSession();
  if (!session?.uid) {
    redirect(`/login?next=${encodeURIComponent(`/collect/${token}`)}`);
  }

  const verified = await verifySession();
  const ownSubmission = await getCollectionSubmission(form.id, verified.uid);
  if (!canViewCollectionForm(verified, form, Boolean(ownSubmission))) notFound();

  redirect(`/dashboard/collection/${form.id}`);
}

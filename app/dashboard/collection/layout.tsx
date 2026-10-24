import { verifySession } from "@/lib/dal";

/** 信息收集：所有登录用户都可以进入；每张表的填写身份由表单设置决定。 */
export default async function CollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await verifySession();
  return children;
}

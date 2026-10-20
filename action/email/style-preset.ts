"use server";

import { db } from "@/db/drizzle";
import { emailTemplateStylePreset } from "@/db/schema";
import { getDepartmentScope } from "@/lib/authz";
import { verifyRole } from "@/lib/dal";
import { canEditTemplateRow, resolveTemplateEditTarget } from "@/lib/email-center/template-access";
import { parseEmailBlocks, validateEmailBlocks, type EmailBlock } from "@/lib/email/blocks";
import { sanitizeEmailBlocks } from "@/lib/email/sanitize";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * 自定义样式预设：把一段自定义 HTML/CSS（通常是一个「自定义代码」区块）存成具名样式，
 * 之后可以在任意结果模板里「插入样式」复用。
 *
 * 可见范围与模板一致：管理员看全部，部门账号看全局预设 + 本部门预设；
 * 写权限按模板的同一套规则收敛（部门账号只能写本部门，全局预设只有管理员能写）。
 */

export type EmailStylePresetRow = {
  id: number;
  name: string;
  department: string | null;
  blocks: EmailBlock[];
  /** 当前账号能否改写/删除这条预设 */
  editable: boolean;
  updatedAt: Date;
};

export async function listEmailTemplateStylePresets(): Promise<EmailStylePresetRow[]> {
  await verifyRole(3);
  const scope = await getDepartmentScope();
  if (scope.kind === "none") return [];

  const visibility =
    scope.kind === "department"
      ? or(
          isNull(emailTemplateStylePreset.department),
          eq(emailTemplateStylePreset.department, scope.department),
        )
      : undefined;

  const rows = visibility
    ? await db
        .select()
        .from(emailTemplateStylePreset)
        .where(visibility)
        .orderBy(desc(emailTemplateStylePreset.updatedAt))
    : await db
        .select()
        .from(emailTemplateStylePreset)
        .orderBy(desc(emailTemplateStylePreset.updatedAt));

  return rows.flatMap((row) => {
    const blocks = parseEmailBlocks(row.blocks);
    if (!blocks) return [];
    return [
      {
        id: row.id,
        name: row.name,
        department: row.department,
        blocks,
        editable: canEditTemplateRow(scope, row.department),
        updatedAt: row.updatedAt,
      },
    ];
  });
}

export async function saveEmailTemplateStylePreset(input: {
  name: string;
  blocks: EmailBlock[];
  /** 写入目标：null = 全局预设（仅管理员） */
  department?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await verifyRole(3);
  const scope = await getDepartmentScope();
  const target = resolveTemplateEditTarget(scope, input.department);
  const targetDepartment = target.kind === "department" ? target.department : null;

  const name = input.name.trim();
  if (!name) return { ok: false, message: "请先给样式起个名字。" };
  if (name.length > 80) return { ok: false, message: "样式名称不能超过 80 字。" };

  const parsedBlocks = parseEmailBlocks(input.blocks);
  if (!parsedBlocks) return { ok: false, message: "样式内容不能为空。" };
  const blocksError = validateEmailBlocks(parsedBlocks);
  if (blocksError) return { ok: false, message: `${blocksError}。` };

  try {
    const existing = await db
      .select({ id: emailTemplateStylePreset.id })
      .from(emailTemplateStylePreset)
      .where(
        and(
          eq(emailTemplateStylePreset.name, name),
          targetDepartment === null
            ? isNull(emailTemplateStylePreset.department)
            : eq(emailTemplateStylePreset.department, targetDepartment),
        ),
      )
      .limit(1);

    const values = {
      name,
      department: targetDepartment,
      blocks: sanitizeEmailBlocks(parsedBlocks),
      createdById: session.uid,
    };

    let presetId = existing[0]?.id ?? null;
    if (presetId) {
      await db
        .update(emailTemplateStylePreset)
        .set(values)
        .where(eq(emailTemplateStylePreset.id, presetId));
    } else {
      const [created] = await db
        .insert(emailTemplateStylePreset)
        .values(values)
        .returning({ id: emailTemplateStylePreset.id });
      presetId = created?.id ?? null;
    }

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "email.style_preset.save",
      resourceType: "email_template_style_preset",
      resourceId: presetId,
      department: targetDepartment,
      metadata: {
        name,
        department: targetDepartment,
        mode: existing.length > 0 ? "update" : "create",
        blockCount: values.blocks.length,
      },
    });

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:saveStylePreset", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "save-email-style-preset",
      metadata: { name, department: targetDepartment },
    });
    return { ok: false, message: "样式保存失败，请查看错误日志。" };
  }
}

export async function deleteEmailTemplateStylePreset(
  presetId: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await verifyRole(3);
  const scope = await getDepartmentScope();

  const [row] = await db
    .select()
    .from(emailTemplateStylePreset)
    .where(eq(emailTemplateStylePreset.id, presetId))
    .limit(1);

  if (!row) return { ok: false, message: "样式不存在或已被删除。" };
  if (!canEditTemplateRow(scope, row.department)) {
    return { ok: false, message: "只能删除本部门或自己维护的样式。" };
  }

  try {
    await db
      .delete(emailTemplateStylePreset)
      .where(eq(emailTemplateStylePreset.id, presetId));

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "email.style_preset.delete",
      resourceType: "email_template_style_preset",
      resourceId: presetId,
      department: row.department,
      metadata: { name: row.name, department: row.department },
    });

    revalidatePath("/dashboard/emails");
    return { ok: true };
  } catch (error) {
    logServerError("email:deleteStylePreset", error, {
      path: "/dashboard/emails",
      userId: session.uid,
      role: session.role,
      action: "delete-email-style-preset",
      metadata: { presetId },
    });
    return { ok: false, message: "样式删除失败，请查看错误日志。" };
  }
}

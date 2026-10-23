"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/db/drizzle";
import { collectionTemplate } from "@/db/schema";
import { canManageCollectionForm } from "@/lib/collection-access";
import { verifySession } from "@/lib/dal";
import { collectionExtraFieldsSchema } from "@/lib/validation/collection";
import { writeOperationAudit } from "@/lib/operation-audit";

const saveInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请填写模板名称")
    .max(60, "模板名称不能超过 60 字"),
  description: z.string().trim().max(200, "模板说明不能超过 200 字").default(""),
  fields: collectionExtraFieldsSchema,
});

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string };

/**
 * 保存当前字段为模板；同名模板会被覆盖，便于直接编辑已有模板。
 */
export async function saveCollectionTemplate(input: {
  name: string;
  description?: string;
  fields: unknown;
}): Promise<ActionResult<{ id: number; name: string }>> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return { success: false, message: "仅部长及以上可保存模板" };
  }

  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "模板内容无效",
    };
  }

  const [saved] = await db
    .insert(collectionTemplate)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      fields: parsed.data.fields,
      createdBy: session.uid,
    })
    .onConflictDoUpdate({
      target: collectionTemplate.name,
      set: {
        description: parsed.data.description,
        fields: parsed.data.fields,
        updatedAt: new Date(),
      },
    })
    .returning({ id: collectionTemplate.id, name: collectionTemplate.name });

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.template.save",
    resourceType: "collection_template",
    resourceId: saved.id,
    metadata: {
      name: saved.name,
      fieldCount: parsed.data.fields.length,
    },
  });

  revalidatePath("/dashboard/collection");
  return { success: true, data: saved };
}

/** 删除自建模板；内置模板不在数据库里，无法删除。 */
export async function deleteCollectionTemplate(
  templateId: number,
): Promise<ActionResult> {
  const session = await verifySession();
  if (!canManageCollectionForm(session)) {
    return { success: false, message: "仅部长及以上可删除模板" };
  }

  const parsed = z.number().int().positive().safeParse(templateId);
  if (!parsed.success) {
    return { success: false, message: "模板不存在" };
  }

  const [deleted] = await db
    .delete(collectionTemplate)
    .where(eq(collectionTemplate.id, parsed.data))
    .returning({ id: collectionTemplate.id, name: collectionTemplate.name });
  if (!deleted) return { success: false, message: "模板不存在" };

  await writeOperationAudit({
    actorId: session.uid,
    actorRole: session.realRole,
    action: "collection.template.delete",
    resourceType: "collection_template",
    resourceId: deleted.id,
    metadata: { name: deleted.name },
  });

  revalidatePath("/dashboard/collection");
  return { success: true };
}

import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { emailTemplateContent } from "@/db/schema";
import {
  defaultCollectionInvitationTemplate,
  type CollectionInvitationTemplateValues,
} from "@/lib/collection/invitation-email";
import type { DepartmentScope } from "@/lib/authz";
import { canEditTemplateRow } from "@/lib/email-center/template-access";

export const COLLECTION_INVITATION_TEMPLATE_KEY = "collection.invitation";

export type CollectionInvitationTemplateSetting =
  CollectionInvitationTemplateValues & {
    templateKey: string;
    /** 收集表模板是全局模板，不按部门覆盖 */
    department: null;
    hasOverride: boolean;
    editable: boolean;
  };

export const getCollectionInvitationTemplateSetting = async (
  scope?: DepartmentScope,
): Promise<CollectionInvitationTemplateSetting> => {
  const [saved] = await db
    .select()
    .from(emailTemplateContent)
    .where(
      and(
        eq(emailTemplateContent.templateKey, COLLECTION_INVITATION_TEMPLATE_KEY),
        isNull(emailTemplateContent.department),
      ),
    )
    .limit(1);

  return {
    ...defaultCollectionInvitationTemplate,
    ...(saved
      ? {
          subjectTemplate: saved.subjectTemplate,
          titleTemplate: saved.titleTemplate,
          bodyTemplate: saved.bodyTemplate,
          footerText: saved.footerText,
        }
      : {}),
    templateKey: COLLECTION_INVITATION_TEMPLATE_KEY,
    department: null,
    hasOverride: Boolean(saved),
    editable: scope ? canEditTemplateRow(scope, null) : false,
  };
};

export const upsertCollectionInvitationTemplateSetting = async (
  values: CollectionInvitationTemplateValues,
) => {
  const [existing] = await db
    .select({ id: emailTemplateContent.id })
    .from(emailTemplateContent)
    .where(
      and(
        eq(emailTemplateContent.templateKey, COLLECTION_INVITATION_TEMPLATE_KEY),
        isNull(emailTemplateContent.department),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(emailTemplateContent)
      .set(values)
      .where(eq(emailTemplateContent.id, existing.id));
    return { id: existing.id, mode: "update" as const };
  }

  const [created] = await db
    .insert(emailTemplateContent)
    .values({
      templateKey: COLLECTION_INVITATION_TEMPLATE_KEY,
      department: null,
      ...values,
    })
    .returning({ id: emailTemplateContent.id });
  return { id: created?.id ?? null, mode: "create" as const };
};

export const deleteCollectionInvitationTemplateSetting = async () => {
  const deleted = await db
    .delete(emailTemplateContent)
    .where(
      and(
        eq(emailTemplateContent.templateKey, COLLECTION_INVITATION_TEMPLATE_KEY),
        isNull(emailTemplateContent.department),
      ),
    )
    .returning({ id: emailTemplateContent.id });
  return deleted.length > 0;
};

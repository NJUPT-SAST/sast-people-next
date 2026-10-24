import "server-only";

import { asc } from "drizzle-orm";
import { db } from "@/db/drizzle";
import { collectionTemplate } from "@/db/schema";
import {
  COLLECTION_BUILTIN_TEMPLATES,
  type CollectionTemplateOption,
} from "@/const/collection";

/** 内置模板 + 部长自建模板；自建模板按名称排序。 */
export const listCollectionTemplateOptions = async (): Promise<
  CollectionTemplateOption[]
> => {
  const rows = await db
    .select({
      id: collectionTemplate.id,
      name: collectionTemplate.name,
      description: collectionTemplate.description,
      fields: collectionTemplate.fields,
    })
    .from(collectionTemplate)
    .orderBy(asc(collectionTemplate.name));

  return [
    ...COLLECTION_BUILTIN_TEMPLATES,
    ...rows.map((row) => ({
      id: row.id,
      key: `db:${row.id}`,
      name: row.name,
      description: row.description,
      fields: row.fields,
    })),
  ];
};

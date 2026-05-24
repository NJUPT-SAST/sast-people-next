"use server";

import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const updateUserRole = async (uid: number, role: number) => {
  await verifyRole(3);

  if (![0, 1, 2, 3].includes(role)) {
    throw new Error("Invalid role");
  }

  await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.id, uid));

  revalidatePath("/dashboard/manage");
};

"use server";
import { basicInfoSchema } from "@/components/userInfo/basic";
import { experienceSchema } from "@/components/userInfo/experience";
import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function editBasicInfo(values: z.infer<typeof basicInfoSchema>) {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();

    await db
      .update(user)
      .set({
        name: values.name,
        phone: values.phone,
        email: values.email,
        college: values.college,
        major: values.major,
        qq: values.qq || null,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.uid));

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    logServerError("user:editBasicInfo", error, {
      path: "/dashboard",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "edit-basic-info",
    });
    throw error;
  }
}

export async function editBasicInfoByUid(
  uid: number,
  values: z.infer<typeof basicInfoSchema>
) {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    session = await verifySession();

    if (session.role < 2 && session.uid !== uid) {
      throw new Error("Permission denied");
    }

    await db
      .update(user)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(user.id, uid));
    revalidatePath("/dashboard/manage");
    return { success: true };
  } catch (error) {
    logServerError("user:editBasicInfoByUid", error, {
      path: "/dashboard/manage",
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "edit-basic-info-by-uid",
      targetUserId: uid,
    });
    throw error;
  }
}

export async function editExperience(values: z.infer<typeof experienceSchema>) {
	let session: Awaited<ReturnType<typeof verifySession>> | null = null;

	try {
		session = await verifySession();

		await db
			.update(user)
			.set({
				...values,
				updatedAt: new Date(),
			})
			.where(eq(user.id, session.uid));

		revalidatePath("/dashboard");
	} catch (error) {
		logServerError("user:editExperience", error, {
			path: "/dashboard",
			userId: session?.uid ?? null,
			role: session?.role ?? null,
			action: "edit-experience",
		});
		throw error;
	}
}

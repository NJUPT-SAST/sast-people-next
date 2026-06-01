"use server";
import { basicInfoSchema } from "@/components/userInfo/basic";
import { experienceSchema } from "@/components/userInfo/experience";
import { verifySession } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { z } from "zod";
import { z as z4 } from "zod/v4";

const readonlyProfileResult = {
  success: false,
  error: {
    message: "用户资料由 Link 管理，请前往 Link 修改。",
  },
};

export async function editBasicInfo(values: z4.infer<typeof basicInfoSchema>) {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    void values;
    session = await verifySession();
    return readonlyProfileResult;
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
  values: z4.infer<typeof basicInfoSchema>
) {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;

  try {
    void values;
    session = await verifySession();

    if (session.role < 2 && session.uid !== uid) {
      throw new Error("Permission denied");
    }

    return readonlyProfileResult;
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
		void values;
		session = await verifySession();

		return readonlyProfileResult;
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

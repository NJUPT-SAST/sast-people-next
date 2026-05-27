import "server-only";

import { cookies } from "next/headers";
import { decrypt } from "@/lib/session";
import { cache } from "react";
import { redirect } from "next/navigation";
import { SESSION } from "@/const/cookie";
import { db } from "@/db/drizzle";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isNextControlFlowError, logServerError } from "@/lib/server-error-log";

export const verifySession = cache(async () => {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION)?.value;
    const session = await decrypt(cookie);

    if (!session?.uid) {
      redirect("/login");
    }

    const uid = Number(session.uid);
    const [userRecord] = await db
      .select({ role: user.role, name: user.name })
      .from(user)
      .where(eq(user.id, uid))
      .limit(1);

    return {
      isAuth: true,
      uid,
      role: userRecord?.role ?? (session.role as number),
      name: userRecord?.name ?? (session.name as string),
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("verifySession error:", err);
    logServerError("verifySession", err, {
      action: "verify-session",
    });
    throw err;
  }
});

export const verifyRole = cache(async (role: number) => {
  const session = await verifySession();
  if (session.role < role) {
    throw new Error("Unauthorized operation");
  }
  return session;
});

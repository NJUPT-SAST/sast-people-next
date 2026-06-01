import "server-only";

import { cookies } from "next/headers";
import { decrypt } from "@/lib/session";
import { cache } from "react";
import { redirect } from "next/navigation";
import { SESSION } from "@/const/cookie";
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

    return {
      isAuth: true,
      uid,
      role: session.role as number,
      name: session.name as string,
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
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

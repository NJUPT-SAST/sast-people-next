import "server-only";

import { cookies } from "next/headers";
import { decrypt } from "@/lib/session";
import { cache } from "react";
import { redirect } from "next/navigation";
import { SESSION } from "@/const/cookie";
import fs from "node:fs";

function logError(source: string, err: unknown) {
  try {
    fs.appendFileSync(
      "/tmp/sast-error-log.txt",
      `[${new Date().toISOString()}] ${source}\n` +
      `name: ${err instanceof Error ? err.name : 'Unknown'}\n` +
      `message: ${err instanceof Error ? err.message : String(err)}\n` +
      `stack: ${err instanceof Error ? err.stack : 'none'}\n` +
      `---\n`
    );
  } catch {}
}

export const verifySession = cache(async () => {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION)?.value;
    const session = await decrypt(cookie);

    if (!session?.uid) {
      redirect("/login");
    }

    return {
      isAuth: true,
      uid: Number(session.uid),
      role: session.role as number,
      name: session.name as string,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    console.error("verifySession error:", err);
    logError("verifySession", err);
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

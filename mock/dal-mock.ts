/**
 * Mock DAL (Data Access Layer) - replaces @/lib/dal in mock mode.
 * No server-only dependency. Uses mock session state.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentMockSession } from "./session-mock";

export const verifySession = cache(async () => {
  const session = getCurrentMockSession();

  if (!session) {
    redirect("/login");
  }

  return {
    isAuth: true,
    uid: session.uid,
    role: session.role,
    name: session.name,
  };
});

export const verifyRole = cache(async (role: number) => {
  const session = await verifySession();
  if (session.role < role) {
    throw new Error("Unauthorized operation");
  }
  return session;
});

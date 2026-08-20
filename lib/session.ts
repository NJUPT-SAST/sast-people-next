import "server-only";

import { SESSION, SESSION_ID_PATTERN } from "@/const/cookie";
import { db } from "@/db/drizzle";
import { peopleSession } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import crypto from "node:crypto";

export type LinkSessionTokens = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

export type SessionData = {
  id: string;
  uid: number;
  name: string;
  role: number;
  expiresAt: Date;
  linkAccessToken?: string | null;
  linkRefreshToken?: string | null;
  linkAccessTokenExpiresAt?: Date | null;
  linkAdminAccessToken?: string | null;
  linkAdminRefreshToken?: string | null;
  linkAdminAccessTokenExpiresAt?: Date | null;
};

type SessionRecord = typeof peopleSession.$inferSelect;

const sessionLifetimeMs = (role: number) =>
  (role === 0 ? 12 : 7 * 24) * 60 * 60 * 1000;

const sessionCookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  expires: expiresAt,
  sameSite: "lax" as const,
  path: "/",
});

const decryptStoredToken = (value: string | null) => {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
};

const toSessionData = (
  record: SessionRecord,
  includeLinkTokens: boolean,
): SessionData => ({
  id: record.id,
  uid: record.uid,
  name: record.name,
  role: record.role,
  expiresAt: record.expiresAt,
  linkAccessToken: includeLinkTokens && record.linkAccessToken
    ? decryptStoredToken(record.linkAccessToken)
    : null,
  linkRefreshToken: includeLinkTokens && record.linkRefreshToken
    ? decryptStoredToken(record.linkRefreshToken)
    : null,
  linkAccessTokenExpiresAt: includeLinkTokens
    ? record.linkAccessTokenExpiresAt
    : null,
  linkAdminAccessToken: includeLinkTokens && record.linkAdminAccessToken
    ? decryptStoredToken(record.linkAdminAccessToken)
    : null,
  linkAdminRefreshToken: includeLinkTokens && record.linkAdminRefreshToken
    ? decryptStoredToken(record.linkAdminRefreshToken)
    : null,
  linkAdminAccessTokenExpiresAt: includeLinkTokens
    ? record.linkAdminAccessTokenExpiresAt
    : null,
});

const getSessionIdFromCookie = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION)?.value;
};

export const getSessionById = async (
  id: string | undefined,
  { includeLinkTokens = false }: { includeLinkTokens?: boolean } = {},
) => {
  if (!id || !SESSION_ID_PATTERN.test(id)) {
    return null;
  }

  const [record] = await db
    .select()
    .from(peopleSession)
    .where(and(eq(peopleSession.id, id), gt(peopleSession.expiresAt, new Date())))
    .limit(1);

  return record ? toSessionData(record, includeLinkTokens) : null;
};

export const getSession = async (
  options?: { includeLinkTokens?: boolean },
) => getSessionById(await getSessionIdFromCookie(), options);

export async function createSession(
  uid: number,
  name: string,
  role: number,
  linkTokens?: LinkSessionTokens,
  linkAdminTokenMarker?: Required<Pick<LinkSessionTokens, "accessToken" | "accessTokenExpiresAt">>,
) {
  const expiresAt = new Date(Date.now() + sessionLifetimeMs(role));
  const id = crypto.randomBytes(32).toString("base64url");

  const previousSessionId = await getSessionIdFromCookie();
  if (previousSessionId) {
    await db.delete(peopleSession).where(eq(peopleSession.id, previousSessionId));
  }

  await db.insert(peopleSession).values({
    id,
    uid,
    name,
    role,
    expiresAt,
    linkAccessToken: linkTokens?.accessToken
      ? encryptSecret(linkTokens.accessToken)
      : null,
    linkRefreshToken: linkTokens?.refreshToken
      ? encryptSecret(linkTokens.refreshToken)
      : null,
    linkAccessTokenExpiresAt: linkTokens?.accessTokenExpiresAt
      ? new Date(linkTokens.accessTokenExpiresAt)
      : null,
    linkAdminAccessToken: linkAdminTokenMarker?.accessToken
      ? encryptSecret(linkAdminTokenMarker.accessToken)
      : null,
    linkAdminRefreshToken: null,
    linkAdminAccessTokenExpiresAt: linkAdminTokenMarker?.accessTokenExpiresAt
      ? new Date(linkAdminTokenMarker.accessTokenExpiresAt)
      : null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION, id, sessionCookieOptions(expiresAt));
}

export async function updateLinkSessionTokens(
  sessionId: string,
  purpose: "session" | "admin",
  linkTokens: Required<Pick<LinkSessionTokens, "accessToken" | "accessTokenExpiresAt">> &
    Pick<LinkSessionTokens, "refreshToken">,
) {
  const adminValues = {
    linkAdminAccessToken: encryptSecret(linkTokens.accessToken),
    linkAdminAccessTokenExpiresAt: new Date(linkTokens.accessTokenExpiresAt),
    ...(linkTokens.refreshToken
      ? { linkAdminRefreshToken: encryptSecret(linkTokens.refreshToken) }
      : {}),
  };
  const sessionValues = {
    linkAccessToken: encryptSecret(linkTokens.accessToken),
    linkAccessTokenExpiresAt: new Date(linkTokens.accessTokenExpiresAt),
    ...(linkTokens.refreshToken
      ? { linkRefreshToken: encryptSecret(linkTokens.refreshToken) }
      : {}),
  };
  const values = purpose === "admin" ? adminValues : sessionValues;

  await db
    .update(peopleSession)
    .set(values)
    .where(eq(peopleSession.id, sessionId));
}

export async function deleteSession() {
  const id = await getSessionIdFromCookie();
  if (id) {
    await db.delete(peopleSession).where(eq(peopleSession.id, id));
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION);
}
export async function updateSession() {
  const session = await getSession();
  if (!session) return null;

  const expiresAt = new Date(Date.now() + sessionLifetimeMs(session.role));
  await db
    .update(peopleSession)
    .set({ expiresAt })
    .where(eq(peopleSession.id, session.id));

  const cookieStore = await cookies();
  cookieStore.set(SESSION, session.id, sessionCookieOptions(expiresAt));
  return { ...session, expiresAt };
}

export async function deleteExpiredSessions(now = new Date()) {
  const deletedRows = await db
    .delete(peopleSession)
    .where(lt(peopleSession.expiresAt, now))
    .returning({ id: peopleSession.id });
  return deletedRows.length;
}

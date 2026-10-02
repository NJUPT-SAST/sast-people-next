import "server-only";

import { ADMIN_ROLE } from "@/lib/link/role";
import { SESSION, SESSION_ID_PATTERN, VIEW_AS } from "@/const/cookie";
import { db } from "@/db/drizzle";
import { normalizeDepartmentKey, peopleSession } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { cookies } from "next/headers";
import crypto from "node:crypto";

export type LinkSessionTokens = {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
};

/** 管理员「切换身份查看」的临时视角；只影响读取，不改动会话本身 */
export type SessionViewAs = {
  role: number;
  department: string | null;
};

export type SessionData = {
  id: string;
  uid: number;
  name: string;
  /** 生效角色：切换身份查看时是「被查看的身份」 */
  role: number;
  /** 会话本身的真实角色（永远来自数据库），用于判定谁能切换/退出 */
  realRole: number;
  /* Link 部门标识；null 表示尚未同步或该用户没有部门 */
  department: string | null;
  /* 上次从 Link 回源同步角色/部门的时刻；null = 从未同步 */
  departmentSyncedAt: Date | null;
  /** 当前生效的临时视角；null = 未切换 */
  viewAs: SessionViewAs | null;
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
  viewAs: SessionViewAs | null = null,
): SessionData => ({
  id: record.id,
  uid: record.uid,
  name: record.name,
  /* 切换身份查看：只覆盖生效角色与部门，会话本身（uid / 真实角色 / Link token）不动 */
  role: viewAs ? viewAs.role : record.role,
  realRole: record.role,
  department: viewAs ? viewAs.department : record.department ?? null,
  departmentSyncedAt: record.departmentSyncedAt,
  viewAs,
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

/** 读取「切换身份查看」临时视角；只有管理员会话才认这个 cookie */
const readViewAsCookie = async (): Promise<SessionViewAs | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(VIEW_AS)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decryptSecret(raw)) as {
      role?: unknown;
      department?: unknown;
    };
    const role = Number(parsed.role);
    if (!Number.isInteger(role) || role < 0 || role > ADMIN_ROLE) return null;
    return {
      role,
      department: normalizeDepartmentKey(
        typeof parsed.department === "string" ? parsed.department : null,
      ),
    };
  } catch {
    /* 密文损坏 / 版本不符：当作没有切换，别让浏览卡住 */
    return null;
  }
};

export const viewAsCookieOptions = (expiresAt: Date) => ({
  ...sessionCookieOptions(expiresAt),
});

/** 写入临时视角；传 null 表示退出切换 */
export const writeViewAsCookie = async (viewAs: SessionViewAs | null) => {
  const cookieStore = await cookies();
  if (!viewAs) {
    cookieStore.delete(VIEW_AS);
    return;
  }
  cookieStore.set(
    VIEW_AS,
    encryptSecret(JSON.stringify(viewAs)),
    viewAsCookieOptions(new Date(Date.now() + 12 * 60 * 60 * 1000)),
  );
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

  if (!record) return null;

  /* 只有管理员会话能借用别人的视角：cookie 被伪造也不会提权 */
  const viewAs =
    record.role >= ADMIN_ROLE ? await readViewAsCookie() : null;

  return toSessionData(record, includeLinkTokens, viewAs);
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
  department?: string | null,
) {
  const expiresAt = new Date(Date.now() + sessionLifetimeMs(role));
  const id = crypto.randomBytes(32).toString("base64url");
  const normalizedDepartment = normalizeDepartmentKey(department ?? null);

  const previousSessionId = await getSessionIdFromCookie();
  if (previousSessionId) {
    await db.delete(peopleSession).where(eq(peopleSession.id, previousSessionId));
  }

  await db.insert(peopleSession).values({
    id,
    uid,
    name,
    role,
    department: normalizedDepartment,
    departmentSyncedAt: new Date(),
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

/* Link 资料（角色 + 部门）回源的最小间隔：5 分钟内不重复打 Link，角色变化则立即写入 */
const DEPARTMENT_SYNC_TTL_MS = 5 * 60 * 1000;

/* 会话身份（角色 + 部门）是否需要在本次请求里回源 Link */
export const isIdentitySyncStale = (syncedAt: Date | null) =>
  !syncedAt || syncedAt.getTime() < Date.now() - DEPARTMENT_SYNC_TTL_MS;

/* 拿到 Link profile 后调用（verifySession 的身份回源按 TTL 触发）；只在从未同步或超过最小间隔时回写（≤5 分钟跟上 Link 的角色/部门变化） */
export async function syncCurrentSessionIdentity(identity: {
  role: number;
  department: string | null;
}) {
  const id = await getSessionIdFromCookie();
  if (!id) return;

  const normalized = normalizeDepartmentKey(identity.department);
  await db
    .update(peopleSession)
    .set({
      role: identity.role,
      department: normalized,
      departmentSyncedAt: new Date(),
    })
    .where(
      and(
        eq(peopleSession.id, id),
        or(
          isNull(peopleSession.departmentSyncedAt),
          lt(
            peopleSession.departmentSyncedAt,
            new Date(Date.now() - DEPARTMENT_SYNC_TTL_MS),
          ),
        ),
      ),
    );
}

export async function deleteSession() {
  const id = await getSessionIdFromCookie();
  if (id) {
    await db.delete(peopleSession).where(eq(peopleSession.id, id));
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION);
  /* 临时视角 cookie 比会话活得久：退出登录时一并清掉，避免影响下一个登录者 */
  cookieStore.delete(VIEW_AS);
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

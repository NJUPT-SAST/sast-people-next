/**
 * Mock session module - replaces @/lib/session in mock mode.
 * No server-only, no cookies(), no jose dependency.
 * Uses globalThis to persist session state across HMR reloads.
 */
import { SESSION } from "@/const/cookie";

type MockSession = {
  uid: number;
  name: string;
  role: number;
  expiresAt: Date;
};

const GLOBAL_KEY = "__sast_mock_session__" as const;

// Use globalThis so session state survives HMR module re-evaluation
function getSession(): MockSession | null {
  if (!(GLOBAL_KEY in globalThis)) {
    // First load: default to logged-in admin
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = {
      uid: 1,
      name: "管理员",
      role: 2,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as MockSession | null;
}

function setSession(session: MockSession | null) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = session;
}

export async function encrypt(payload: {
  role: number;
  uid: number;
  name: string;
  expiresAt: Date;
}) {
  // Return a simple mock token
  return `mock_session_${payload.uid}_${payload.role}_${payload.name}`;
}

export async function decrypt(session: string | undefined = "") {
  // If it's a mock token, parse it
  if (session && session.startsWith("mock_session_")) {
    const parts = session.split("_");
    return {
      uid: Number(parts[2]),
      role: Number(parts[3]),
      name: parts.slice(4).join("_"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  // In mock mode, always return the current session (even without a cookie)
  return getSession();
}

export async function createSession(
  uid: number,
  name: string,
  role: number
) {
  const expiresAt =
    role === 0
      ? new Date(Date.now() + 12 * 60 * 60 * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  setSession({ uid, name, role, expiresAt });

  // In mock mode, also try to set a cookie if we're in a request context
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const token = await encrypt({ uid, name, role, expiresAt });
    cookieStore.set(SESSION, token, {
      httpOnly: false,
      secure: false,
      expires: expiresAt,
      sameSite: "lax",
      path: "/",
    });
  } catch {
    // Not in a request context (e.g., during initialization) - that's fine
  }

  console.log(`[Mock] Session created for user: ${name} (uid=${uid}, role=${role})`);
}

export async function deleteSession() {
  setSession(null);

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    cookieStore.delete(SESSION);
  } catch {
    // Not in a request context
  }

  console.log("[Mock] Session deleted");
}

export async function updateSession() {
  const current = getSession();
  if (!current) return null;
  current.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  setSession(current);
  console.log("[Mock] Session updated");
}

/**
 * Helper: get current mock session (used by dal-mock)
 */
export function getCurrentMockSession() {
  return getSession();
}

/**
 * Helper: set mock session directly (for testing/switching users)
 */
export function setMockSession(uid: number, name: string, role: number) {
  setSession({
    uid,
    name,
    role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

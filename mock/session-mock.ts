/**
 * Mock session module - replaces @/lib/session in mock mode.
 * No server-only, no cookies(), no jose dependency.
 * Uses module-level state to track the current session.
 */
import { SESSION } from "@/const/cookie";

// Module-level session state
let currentSession: {
  uid: number;
  name: string;
  role: number;
  expiresAt: Date;
} | null = {
  // Default: logged in as admin (user id=1, role=2)
  uid: 1,
  name: "管理员",
  role: 2,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
};

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
  return currentSession;
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

  currentSession = { uid, name, role, expiresAt };

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
  currentSession = null;

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
  if (!currentSession) return null;
  currentSession.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  console.log("[Mock] Session updated");
}

/**
 * Helper: get current mock session (used by dal-mock)
 */
export function getCurrentMockSession() {
  return currentSession;
}

/**
 * Helper: set mock session directly (for testing/switching users)
 */
export function setMockSession(uid: number, name: string, role: number) {
  currentSession = {
    uid,
    name,
    role,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

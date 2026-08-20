import { verifySession } from "../lib/dal";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isNextControlFlowError, logServerError } from "@/lib/server-error-log";
import { isLinkAuthorizationError } from "@/lib/link/client";
import { getCurrentUserProfile } from "@/lib/link/user";
import {
  getLinkAccessTokenFromSession,
  MissingLinkAccessTokenError,
} from "@/lib/link/session";
import { toPeopleUserFromLinkProfile } from "@/lib/link/people-user";
export const useUserInfo = cache(async () => {
  try {
    await verifySession();
    try {
      const accessToken = await getLinkAccessTokenFromSession();
      const userInfo = await getCurrentUserProfile(accessToken);
      if (!userInfo) {
        redirect('/login');
      }
      return toPeopleUserFromLinkProfile(userInfo, true);
    } catch (err) {
      if (err instanceof MissingLinkAccessTokenError) {
        redirect('/login');
      }
      if (isLinkAuthorizationError(err)) {
        redirect("/api/auth/logout?reason=link-authorization");
      }
      throw err;
    }
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("useUserInfo error:", err);
    logServerError('dashboard:useUserInfo', err, {
      path: '/dashboard',
      action: 'load-current-user',
    });
    throw err;
  }
});

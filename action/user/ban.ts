"use server"

import { verifyRole } from "@/lib/dal"
import { banLinkUser } from "@/lib/link/admin"
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session"
import { writeOperationAudit } from "@/lib/operation-audit"
import { logServerError } from "@/lib/server-error-log"

export const banUser = async (uid: number)=>{
    let session: Awaited<ReturnType<typeof verifyRole>> | null = null

    try {
        session = await verifyRole(3)
        const accessToken = await getLinkAdminAccessTokenFromSession()
        await banLinkUser(accessToken, uid)
        await writeOperationAudit({
            actorId: session.uid,
            action: "user.ban",
            resourceType: "link_user",
            resourceId: uid,
        })
        return true
    } catch (error) {
        logServerError("user:ban", error, {
            path: "/dashboard/manage",
            userId: session?.uid ?? null,
            role: session?.role ?? null,
            action: "ban-user",
            targetUserId: uid,
        })
        throw error
    }
}

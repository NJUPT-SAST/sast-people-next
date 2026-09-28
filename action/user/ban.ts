"use server"

import { verifyAdmin } from "@/lib/authz"
import { banLinkUser } from "@/lib/link/admin"
import { getLinkAdminAccessTokenFromSession } from "@/lib/link/session"
import { writeOperationAudit } from "@/lib/operation-audit"
import { logServerError } from "@/lib/server-error-log"

export const banUser = async (uid: number)=>{
    let actorId: number | null = null
    let actorRole: number | null = null

    try {
        const session = await verifyAdmin()
        actorId = session.uid
        actorRole = session.role
        const accessToken = await getLinkAdminAccessTokenFromSession()
        await banLinkUser(accessToken, uid)
        await writeOperationAudit({
            actorId: session.uid,
            actorRole: session.role,
            action: "user.ban",
            resourceType: "link_user",
            resourceId: uid,
        })
        return true
    } catch (error) {
        logServerError("user:ban", error, {
            path: "/dashboard/manage",
            userId: actorId,
            role: actorRole,
            action: "ban-user",
            targetUserId: uid,
        })
        throw error
    }
}

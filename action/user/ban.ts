"use server"

import { db } from "@/db/drizzle"
import { user } from "@/db/schema"
import { verifyRole } from "@/lib/dal"
import { logServerError } from "@/lib/server-error-log"
import { eq } from "drizzle-orm"

export const banUser = async (uid: number)=>{
    let session: Awaited<ReturnType<typeof verifyRole>> | null = null

    try {
        session = await verifyRole(3)
        // ban user
        await db.update(user).set({isDeleted: true}).where(eq(user.id, uid))
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

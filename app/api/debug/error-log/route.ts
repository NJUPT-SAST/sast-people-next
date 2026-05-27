import { NextResponse } from "next/server";
import { verifyRole } from "@/lib/dal";
import { readServerErrorLog } from "@/lib/server-error-log";

export async function GET() {
  try {
    await verifyRole(3);
  } catch {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const { count, entries } = readServerErrorLog(5);
    if (count === 0) {
      return NextResponse.json({ message: "No errors logged yet" });
    }
    return NextResponse.json({
      count,
      lastErrors: entries.map((entry) => entry.raw),
      entries,
    });
  } catch {
    return NextResponse.json({ message: "Failed to read error log" }, { status: 500 });
  }
}

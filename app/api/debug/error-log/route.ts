import { NextResponse } from "next/server";
import fs from "node:fs";

const ERROR_LOG_PATH = "/tmp/sast-error-log.txt";

export async function GET() {
  try {
    if (!fs.existsSync(ERROR_LOG_PATH)) {
      return NextResponse.json({ message: "No errors logged yet" });
    }
    const content = fs.readFileSync(ERROR_LOG_PATH, "utf-8");
    const lines = content.trim().split("---\n").filter(Boolean);
    const lastErrors = lines.slice(-5).map((entry) => entry.trim());
    return NextResponse.json({ count: lines.length, lastErrors });
  } catch {
    return NextResponse.json({ message: "Failed to read error log" }, { status: 500 });
  }
}

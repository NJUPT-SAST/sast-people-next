import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const rootDir = process.cwd();
const sourceRoots = ["action", "app", "components", "lib", "queue"];
const allowedFiles = new Set([
  path.normalize("lib/email-center/delivery.ts"),
  path.normalize("lib/email-center/provider.ts"),
  path.normalize("lib/email/result-email.tsx"),
  path.normalize("lib/email/interview-schedule.tsx"),
]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".worktrees",
  "coverage",
  "node_modules",
  "tmp",
]);

function listSourceFiles(directory: string): string[] {
  const absoluteDirectory = path.join(rootDir, directory);
  return readdirSync(absoluteDirectory).flatMap((entry) => {
    const absolutePath = path.join(absoluteDirectory, entry);
    const relativePath = path.relative(rootDir, absolutePath);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return ignoredDirectories.has(entry) ? [] : listSourceFiles(relativePath);
    }

    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
      return [];
    }

    return [relativePath];
  });
}

describe("email center source constraints", () => {
  it("keeps direct email sending and React Email render calls inside email center boundaries", () => {
    const violations = sourceRoots
      .flatMap(listSourceFiles)
      .filter((filePath) => !allowedFiles.has(path.normalize(filePath)))
      .flatMap((filePath) => {
        const content = readFileSync(path.join(rootDir, filePath), "utf8");
        return [
          content.includes("sendRawEmail(") ? "sendRawEmail(" : null,
          content.includes("createTransport(") ? "createTransport(" : null,
          content.includes("@react-email/render") ? "@react-email/render" : null,
        ]
          .filter((pattern): pattern is string => pattern !== null)
          .map((pattern) => `${filePath}: ${pattern}`);
      });

    expect(violations).toEqual([]);
  });

  it("keeps delivery filter indexes declared in schema and migration", () => {
    const schema = readFileSync(path.join(rootDir, "db/schema.ts"), "utf8");
    const migration = readFileSync(
      path.join(rootDir, "migrations/0023_email_delivery_flow_nullable_user.sql"),
      "utf8",
    );

    for (const indexName of [
      "email_delivery_created_at_idx",
      "email_delivery_filter_idx",
      "email_delivery_fk_flow_id_idx",
    ]) {
      expect(schema).toContain(indexName);
      expect(migration).toContain(indexName);
    }
  });

  it("keeps email delivery attempt tracking declared in schema and migration", () => {
    const schema = readFileSync(path.join(rootDir, "db/schema.ts"), "utf8");
    const migration = readFileSync(
      path.join(rootDir, "migrations/0024_email_delivery_attempt_tracking.sql"),
      "utf8",
    );

    for (const fieldName of ["attemptCount", "lastAttemptAt"]) {
      expect(schema).toContain(fieldName);
    }
    for (const columnName of ["attempt_count", "last_attempt_at"]) {
      expect(migration).toContain(columnName);
    }
    expect(schema).toContain("email_delivery_attempt_status_idx");
    expect(migration).toContain("email_delivery_attempt_status_idx");
  });
});

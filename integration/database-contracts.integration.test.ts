import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

function requireLocalTestDatabase(value: string | undefined): string {
  if (!value) {
    throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
  }

  const url = new URL(value);
  const databaseName = url.pathname.replace(/^\//, "");
  const isLocalHost = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  const isTestDatabase =
    databaseName.endsWith("_local") || databaseName.endsWith("_test");

  if (!isLocalHost || !isTestDatabase) {
    throw new Error(
      "PostgreSQL integration tests require a local database ending in _local or _test",
    );
  }

  return value;
}

const client = new Client({
  connectionString: requireLocalTestDatabase(databaseUrl),
});

async function createFlow() {
  const result = await client.query<{ id: number }>(
    `
      insert into flow (title, type, owner_id)
      values ($1, 'recruitment', 900001)
      returning id
    `,
    [`Integration flow ${crypto.randomUUID()}`],
  );
  return result.rows[0].id;
}

async function createUserFlow(
  flowId: number,
  userId = 900002,
  applyGroup: string | null = null,
) {
  const result = await client.query<{ id: number }>(
    `
      insert into user_flow (progress_status, fk_flow_id, fk_user_id, apply_group)
      values ('ongoing', $1, $2, $3)
      returning id
    `,
    [flowId, userId, applyGroup],
  );
  return result.rows[0].id;
}

describe("PostgreSQL migration contracts", () => {
  beforeAll(async () => {
    await client.connect();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  afterAll(async () => {
    await client.end();
  });

  it("enforces one registration per user and flow", async () => {
    const flowId = await createFlow();
    await createUserFlow(flowId);

    await expect(createUserFlow(flowId)).rejects.toMatchObject({
      code: "23505",
      constraint: "uq_user_flow_flow_user_no_group",
    });
  });

  it("allows separate registrations per apply group", async () => {
    const flowId = await createFlow();
    await createUserFlow(flowId, 900003, "前端组");
    await createUserFlow(flowId, 900003, "后端组");

    await expect(
      createUserFlow(flowId, 900003, "前端组"),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "uq_user_flow_flow_user_group",
    });
  });

  it("cascades flow deletion to registrations", async () => {
    const flowId = await createFlow();
    const userFlowId = await createUserFlow(flowId);

    await client.query("delete from flow where id = $1", [flowId]);
    const result = await client.query<{ count: string }>(
      "select count(*) from user_flow where id = $1",
      [userFlowId],
    );

    expect(result.rows[0].count).toBe("0");
  });

  it("allows historical schedules but only one active schedule", async () => {
    const flowId = await createFlow();
    const userFlowId = await createUserFlow(flowId);

    const insertSchedule = (status: "cancelled" | "created", eventId: string) =>
      client.query(
        `
          insert into interview_schedule (
            fk_user_flow_id,
            fk_organizer_id,
            provider,
            provider_event_id,
            meeting_link,
            summary,
            starts_at,
            ends_at,
            status
          ) values ($1, 900003, 'feishu', $2, $3, $4, now(), now() + interval '30 minutes', $5)
        `,
        [
          userFlowId,
          eventId,
          `https://meet.example.com/${eventId}`,
          `Integration schedule ${eventId}`,
          status,
        ],
      );

    await insertSchedule("cancelled", `cancelled-${crypto.randomUUID()}`);
    await insertSchedule("created", `active-${crypto.randomUUID()}`);

    await expect(
      insertSchedule("created", `duplicate-${crypto.randomUUID()}`),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "interview_schedule_active_user_flow_uidx",
    });
  });

  it("stores and updates a withdrawal reason", async () => {
    const flowId = await createFlow();
    const userFlowId = await createUserFlow(flowId);

    await client.query(
      "update user_flow set progress_status = 'withdrawn', withdraw_reason = $1 where id = $2",
      ["测试退回理由", userFlowId],
    );

    const result = await client.query<{ withdraw_reason: string }>(
      "select withdraw_reason from user_flow where id = $1",
      [userFlowId],
    );

    expect(result.rows[0]?.withdraw_reason).toBe("测试退回理由");
  });

  it("enforces email delivery idempotency keys", async () => {
    const idempotencyKey = `integration:${crypto.randomUUID()}`;
    const insertDelivery = () =>
      client.query(
        `
          insert into email_delivery (
            idempotency_key,
            to_address,
            subject,
            html_snapshot
          ) values ($1, 'integration@example.com', 'Integration', '<p>test</p>')
        `,
        [idempotencyKey],
      );

    await insertDelivery();
    await expect(insertDelivery()).rejects.toMatchObject({
      code: "23505",
      constraint: "email_delivery_idempotency_key_uidx",
    });
  });
});

jest.mock("@/db/drizzle", () => ({ db: { select: jest.fn() } }));
jest.mock("@/lib/dal", () => ({ verifySession: jest.fn() }));

import { db } from "@/db/drizzle";
import { verifySession } from "@/lib/dal";
import { useMyFlowList } from "./useMyFlowList";

const mockSelect = jest.mocked(db.select);
const mockVerifySession = jest.mocked(verifySession);

describe("useMyFlowList", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockVerifySession.mockReset();
  });

  it("includes the flow result publication status", async () => {
    mockVerifySession.mockResolvedValue({ uid: 42 } as never);

    const orderBy = jest.fn().mockResolvedValue([
      {
        user_flow: {
          id: 11,
          fkFlowId: 22,
          fkUserId: 42,
          progressStatus: "passed",
          fkCurrentStepId: null,
        },
        flow: {
          id: 22,
          title: "春招流程",
          type: "recruitment",
          groupOptions: null,
        },
        flow_result_publication: { status: "published" },
        flow_step: null,
      },
    ]);
    const where = jest.fn(() => ({ orderBy }));
    const stepJoin = jest.fn(() => ({ where }));
    const publicationJoin = jest.fn(() => ({ leftJoin: stepJoin }));
    const flowJoin = jest.fn(() => ({ leftJoin: publicationJoin }));
    const from = jest.fn(() => ({ innerJoin: flowJoin }));
    mockSelect.mockReturnValue({ from } as never);

    await expect(useMyFlowList()).resolves.toEqual([
      expect.objectContaining({
        id: 11,
        publicationStatus: "published",
        steps: [],
      }),
    ]);
  });
});

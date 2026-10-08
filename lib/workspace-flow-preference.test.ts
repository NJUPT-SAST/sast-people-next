import {
  parseWorkspaceFlowPreference,
  resolveWorkspaceFlowId,
  workspaceFlowPreferenceCookieName,
  writeWorkspaceFlowPreference,
} from "./workspace-flow-preference";

describe("workspace flow preference", () => {
  it("names the cookie per workspace so interview and written memory never mix", () => {
    expect(workspaceFlowPreferenceCookieName("interview")).toBe(
      "people_workspace_flow_interview",
    );
    expect(workspaceFlowPreferenceCookieName("written")).toBe(
      "people_workspace_flow_written",
    );
  });

  it("parses only positive integer flow ids", () => {
    expect(parseWorkspaceFlowPreference("42")).toBe(42);
    for (const rawValue of [
      null,
      undefined,
      "",
      "   ",
      "0",
      "-3",
      "4.2",
      "12abc",
      "abc",
    ]) {
      expect(parseWorkspaceFlowPreference(rawValue)).toBeNull();
    }
  });

  it("prefers the explicit link, then the remembered flow, then the newest", () => {
    const selectableFlowIds = [3, 2, 1];
    expect(
      resolveWorkspaceFlowId({
        requestedFlowId: 2,
        rememberedFlowId: 3,
        selectableFlowIds,
      }),
    ).toBe(2);
    expect(
      resolveWorkspaceFlowId({ rememberedFlowId: 3, selectableFlowIds }),
    ).toBe(3);
    expect(resolveWorkspaceFlowId({ selectableFlowIds })).toBe(3);
  });

  it("ignores remembered or requested flows that the session cannot see", () => {
    expect(
      resolveWorkspaceFlowId({
        requestedFlowId: 9,
        rememberedFlowId: 8,
        selectableFlowIds: [2, 1],
      }),
    ).toBe(2);
    expect(
      resolveWorkspaceFlowId({ rememberedFlowId: 8, selectableFlowIds: [] }),
    ).toBeUndefined();
  });

  it("writes the switched flow into the workspace cookie", () => {
    document.cookie = `${workspaceFlowPreferenceCookieName("interview")}=; path=/; max-age=0`;

    writeWorkspaceFlowPreference("interview", 7);

    expect(document.cookie).toContain("people_workspace_flow_interview=7");
  });

  it("never writes invalid flow ids", () => {
    document.cookie = `${workspaceFlowPreferenceCookieName("written")}=; path=/; max-age=0`;

    writeWorkspaceFlowPreference("written", Number("abc"));
    writeWorkspaceFlowPreference("written", 0);

    expect(document.cookie).not.toContain("people_workspace_flow_written=");
  });
});

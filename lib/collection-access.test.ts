/** @jest-environment node */

import {
  canFillCollectionForm,
  canManageCollectionForm,
  canViewCollectionForm,
} from "./collection-access";
import {
  ADMIN_ROLE,
  FRESHMAN_ROLE,
  LECTURER_ROLE,
  MANAGER_ROLE,
  MEMBER_ROLE,
} from "@/lib/link/role";

const openRule = { allowedRoles: [], allowedFlowIds: [] };

describe("collection permissions", () => {
  it("treats empty identity and flow lists as unrestricted", () => {
    expect(canFillCollectionForm({ role: FRESHMAN_ROLE }, openRule)).toBe(true);
    expect(canFillCollectionForm({ role: ADMIN_ROLE }, openRule)).toBe(true);
  });

  it("honors the selected identities exactly", () => {
    const onlyManagers = { allowedRoles: [MANAGER_ROLE, ADMIN_ROLE], allowedFlowIds: [] };
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, onlyManagers)).toBe(false);
    expect(canFillCollectionForm({ role: MANAGER_ROLE }, onlyManagers)).toBe(true);
    expect(canFillCollectionForm({ role: ADMIN_ROLE }, onlyManagers)).toBe(true);
  });

  it("requires a passed flow when flows are selected", () => {
    const flowRule = { allowedRoles: [], allowedFlowIds: [11, 12] };
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, flowRule, [])).toBe(false);
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, flowRule, [11])).toBe(true);
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, flowRule, [99])).toBe(false);
  });

  it("requires both identity and flow conditions", () => {
    const both = { allowedRoles: [MEMBER_ROLE], allowedFlowIds: [11] };
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, both, [11])).toBe(true);
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, both, [])).toBe(false);
    expect(canFillCollectionForm({ role: FRESHMAN_ROLE }, both, [11])).toBe(false);
  });

  it("lets managers and admins see every form and response", () => {
    expect(
      canViewCollectionForm(
        { role: MANAGER_ROLE },
        { allowedRoles: [ADMIN_ROLE], allowedFlowIds: [99] },
      ),
    ).toBe(true);
    expect(
      canViewCollectionForm(
        { role: ADMIN_ROLE },
        { allowedRoles: [ADMIN_ROLE], allowedFlowIds: [99] },
      ),
    ).toBe(true);
  });

  it("lets respondents view their own submission after the rule tightens", () => {
    expect(
      canViewCollectionForm(
        { role: MEMBER_ROLE },
        { allowedRoles: [ADMIN_ROLE], allowedFlowIds: [99] },
        true,
      ),
    ).toBe(true);
    expect(
      canViewCollectionForm(
        { role: MEMBER_ROLE },
        { allowedRoles: [ADMIN_ROLE], allowedFlowIds: [99] },
        false,
      ),
    ).toBe(false);
  });

  it("lets managers and admins manage any form", () => {
    expect(canManageCollectionForm({ role: MANAGER_ROLE })).toBe(true);
    expect(canManageCollectionForm({ role: ADMIN_ROLE })).toBe(true);
    expect(canManageCollectionForm({ role: LECTURER_ROLE })).toBe(false);
    expect(canManageCollectionForm({ role: MEMBER_ROLE })).toBe(false);
  });
});

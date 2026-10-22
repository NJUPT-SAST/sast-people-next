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

describe("collection permissions", () => {
  it("treats an empty identity list as unrestricted", () => {
    expect(
      canFillCollectionForm({ role: FRESHMAN_ROLE }, { allowedRoles: [] }),
    ).toBe(true);
    expect(canFillCollectionForm({ role: ADMIN_ROLE }, { allowedRoles: [] })).toBe(
      true,
    );
  });

  it("honors the selected identities exactly", () => {
    const onlyManagers = { allowedRoles: [MANAGER_ROLE, ADMIN_ROLE] };
    expect(canFillCollectionForm({ role: MEMBER_ROLE }, onlyManagers)).toBe(false);
    expect(canFillCollectionForm({ role: LECTURER_ROLE }, onlyManagers)).toBe(false);
    expect(canFillCollectionForm({ role: MANAGER_ROLE }, onlyManagers)).toBe(true);
    expect(canFillCollectionForm({ role: ADMIN_ROLE }, onlyManagers)).toBe(true);
  });

  it("lets managers and admins see every form and response", () => {
    expect(
      canViewCollectionForm({ role: MANAGER_ROLE }, { allowedRoles: [ADMIN_ROLE] }),
    ).toBe(true);
    expect(
      canViewCollectionForm({ role: ADMIN_ROLE }, { allowedRoles: [ADMIN_ROLE] }),
    ).toBe(true);
  });

  it("lets respondents view their own submission after the rule tightens", () => {
    expect(
      canViewCollectionForm({ role: MEMBER_ROLE }, { allowedRoles: [ADMIN_ROLE] }, true),
    ).toBe(true);
    expect(
      canViewCollectionForm({ role: MEMBER_ROLE }, { allowedRoles: [ADMIN_ROLE] }, false),
    ).toBe(false);
  });

  it("lets managers and admins manage any form", () => {
    expect(canManageCollectionForm({ role: MANAGER_ROLE })).toBe(true);
    expect(canManageCollectionForm({ role: ADMIN_ROLE })).toBe(true);
    expect(canManageCollectionForm({ role: LECTURER_ROLE })).toBe(false);
    expect(canManageCollectionForm({ role: MEMBER_ROLE })).toBe(false);
  });
});

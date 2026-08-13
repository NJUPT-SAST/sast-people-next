import "server-only";

import { linkFetch, shouldUseMockLink } from "@/lib/link/client";
import {
  banMockUser,
  getMockUserDetail,
  getMockUsersByIds,
  listMockUsers,
  updateMockUserRole,
  updateMockUserRoles,
} from "@/lib/link/mock";
import type {
  LinkBatchRoleUpdateResponse,
  LinkListUsersParams,
  LinkRole,
  LinkUserProfile,
  LinkUsersList,
} from "@/lib/link/types";

const LINK_BATCH_USER_READ_LIMIT = 100;
const LINK_BATCH_USER_ROLE_UPDATE_LIMIT = 500;

export const listLinkUsers = async (
  accessToken: string,
  params: LinkListUsersParams = {},
) => {
  if (shouldUseMockLink()) {
    return listMockUsers(params);
  }

  return linkFetch<LinkUsersList>("/admin/users", {
    accessToken,
    query: {
      page: params.page,
      page_size: params.pageSize,
      role: params.role,
      state: params.state,
      department: params.department,
      student_id: params.studentId,
      keyword: params.keyword,
    },
  });
};

export const getLinkUserDetail = async (accessToken: string, id: number) => {
  if (shouldUseMockLink()) {
    return getMockUserDetail(id);
  }

  return linkFetch<LinkUserProfile>(`/admin/users/${id}`, { accessToken });
};

export const getLinkUsersByIds = async (accessToken: string, ids: number[]) => {
  if (ids.length === 0) return [];
  if (ids.length > LINK_BATCH_USER_READ_LIMIT) {
    throw new Error(`Link batch user lookup accepts at most ${LINK_BATCH_USER_READ_LIMIT} IDs.`);
  }

  if (shouldUseMockLink()) {
    return getMockUsersByIds(ids);
  }

  const result = await linkFetch<{ users: LinkUserProfile[] }>("/admin/users/batch", {
    accessToken,
    query: { ids: ids.join(",") },
  });
  return result.users;
};

export const updateLinkUserRole = async (
  accessToken: string,
  id: number,
  role: LinkRole,
) => {
  if (shouldUseMockLink()) {
    await updateMockUserRole(id, role);
    return;
  }

  await linkFetch(`/admin/users/${id}`, {
    accessToken,
    method: "PUT",
    body: { role },
  });
};

export const updateLinkUserRoles = async (
  accessToken: string,
  ids: number[],
  role: LinkRole,
) => {
  if (ids.length === 0) return { results: [] } satisfies LinkBatchRoleUpdateResponse;
  if (ids.length > LINK_BATCH_USER_ROLE_UPDATE_LIMIT) {
    throw new Error(`Link batch role update accepts at most ${LINK_BATCH_USER_ROLE_UPDATE_LIMIT} IDs.`);
  }

  if (shouldUseMockLink()) {
    return updateMockUserRoles(ids, role);
  }

  return linkFetch<LinkBatchRoleUpdateResponse>("/admin/users", {
    accessToken,
    method: "PUT",
    body: { ids, role },
  });
};

export const banLinkUser = async (accessToken: string, id: number) => {
  if (shouldUseMockLink()) {
    await banMockUser(id);
    return;
  }

  await linkFetch(`/admin/users/${id}`, {
    accessToken,
    method: "DELETE",
  });
};

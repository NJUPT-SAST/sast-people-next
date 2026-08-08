import "server-only";

import { linkFetch, shouldUseMockLink } from "@/lib/link/client";
import {
  banMockUser,
  getMockUserDetail,
  listMockUsers,
  updateMockUserRole,
} from "@/lib/link/mock";
import type {
  LinkListUsersParams,
  LinkRole,
  LinkUserProfile,
  LinkUsersList,
} from "@/lib/link/types";

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

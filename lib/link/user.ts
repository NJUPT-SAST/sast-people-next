import "server-only";

import { linkFetch, shouldUseMockLink } from "@/lib/link/client";
import { getMockCurrentUserProfile } from "@/lib/link/mock";
import type { LinkUserProfile } from "@/lib/link/types";

export const getCurrentUserProfile = async (accessToken: string) => {
  if (shouldUseMockLink()) {
    return getMockCurrentUserProfile();
  }

  return linkFetch<LinkUserProfile>("/user/profile", { accessToken });
};


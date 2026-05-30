import type { LinkRole } from "@/lib/link/types";

export const peopleRoleToLinkRole = (role: number): LinkRole => {
  switch (role) {
    case 0:
      return "freshman";
    case 1:
      return "member";
    case 2:
      return "lecturer";
    case 3:
      return "admin";
    default:
      throw new Error(`Unknown People role: ${role}`);
  }
};

export const linkRoleToPeopleRole = (role: LinkRole): number => {
  switch (role) {
    case "freshman":
      return 0;
    case "member":
      return 1;
    case "lecturer":
      return 2;
    case "admin":
      return 3;
  }
};

export const isAssignablePeopleRole = (role: number) =>
  role === 0 || role === 1 || role === 2;


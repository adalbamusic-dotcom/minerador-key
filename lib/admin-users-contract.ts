import type { AuthUserSummary } from "@/lib/server/auth-users";

export type AdminGlobalRole = "admin" | "standard";
export type AdminMembershipSummary = {
  id: string;
  label: string;
  role: string;
  status: string;
};

export type AdminUserRecord = {
  identity: AuthUserSummary;
  globalRole: AdminGlobalRole;
  agencyMemberships: AdminMembershipSummary[];
  brandMemberships: AdminMembershipSummary[];
  accessState: "global_admin" | "brand_member" | "agency_member" | "no_association";
};

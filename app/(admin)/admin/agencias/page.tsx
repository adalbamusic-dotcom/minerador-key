import { redirect } from "next/navigation";
import { buildAdminPath } from "@/lib/admin-routing";

export default function AdminAgenciesRoute() {
  redirect(buildAdminPath("agencias"));
}

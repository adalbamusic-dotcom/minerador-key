import { redirect } from "next/navigation";
import { buildAdminPath } from "@/lib/admin-routing";

export default function LegacyAdminBrandsPage() {
  redirect(buildAdminPath("marcas"));
}

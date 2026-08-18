import { redirect } from "next/navigation";

/** Personal identity lives at /conta; this tenant-shaped URL is a single safe handoff. */
export default function LegacyBrandAccountPage() {
  redirect("/conta");
}

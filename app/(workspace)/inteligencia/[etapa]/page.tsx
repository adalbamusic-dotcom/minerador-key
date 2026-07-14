import { notFound, redirect } from "next/navigation";
import { LEGACY_REDIRECTS } from "@/lib/editorial/navigation";
export default async function Page({ params }: { params: Promise<{ etapa: string }> }) { const target = LEGACY_REDIRECTS[(await params).etapa]; if (!target) notFound(); redirect(target); }

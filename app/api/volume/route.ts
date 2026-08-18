import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Legacy endpoint retained only to make old clients fail safely during rollout. */
export async function POST() {
  return NextResponse.json({
    success: false,
    code: "VOLUME_MOVED_TO_GOOGLE_ADS",
    stage: "request_dispatch",
    message: "A medição de volume foi movida para a rota Google Ads do Minerador.",
    diagnostic: { apiRequestStarted: false },
  }, { status: 410 });
}

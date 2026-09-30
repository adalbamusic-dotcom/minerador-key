import { NextRequest } from "next/server";
import { handleGoogleAdsKeywordMetrics } from "@/lib/server/minerador-google-ads-metrics-http";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function POST(request: NextRequest, context: { params: Promise<{ brandId: string }> }) { return handleGoogleAdsKeywordMetrics(request, context); }

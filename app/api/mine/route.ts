import { NextResponse } from "next/server";

/**
 * The legacy Google Sheets exporter depended on an OAuth token kept in the
 * retired session. It is intentionally unavailable until a separate,
 * server-side connection contract is approved and implemented.
 */
export async function POST() {
  return NextResponse.json({ code: "DISABLED", message: "A exportação legada para Google Sheets está desativada nesta instalação." }, { status: 410 });
}

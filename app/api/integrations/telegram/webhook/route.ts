import { NextResponse } from "next/server";
import { processTelegramWebhook } from "@/lib/server/telegram/webhook";
import { TelegramCanonicalError } from "@/lib/server/telegram/canonical";

export async function POST(request: Request) {
  try {
    const result = await processTelegramWebhook(request);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof TelegramCanonicalError) {
      return NextResponse.json({ ok: false, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, code: "TELEGRAM_WEBHOOK_UNAVAILABLE" }, { status: 503 });
  }
}


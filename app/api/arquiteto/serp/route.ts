import { handleArchitectFormationSerp } from "@/lib/server/arquiteto-serp-http";
export async function POST(request: Request) { return handleArchitectFormationSerp(request); }

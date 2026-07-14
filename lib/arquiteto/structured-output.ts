import type { ZodType } from "zod";

export class StructuredOutputError extends Error {
  issues?: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = "StructuredOutputError";
    this.issues = issues;
  }
}

export function parseStructuredOutput<T>(content: string, schema: ZodType<T>): T {
  const normalized = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new StructuredOutputError("A IA retornou JSON invalido.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new StructuredOutputError("A IA retornou JSON fora do contrato esperado.", result.error.issues);
  return result.data;
}

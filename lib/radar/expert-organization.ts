import { z } from "zod";

export const RADAR_EXPERT_ORGANIZATION_CLASSIFICATIONS = [
  "experiência",
  "opinião",
  "critério",
  "processo",
  "ressalva",
  "limitação",
  "exemplo",
] as const;

export const RadarExpertOrganizationSchema = z.object({
  organizedText: z.string().trim().min(1).max(50_000),
  points: z.array(z.string().trim().min(1).max(2_000)).max(30),
  classifications: z.array(z.enum(RADAR_EXPERT_ORGANIZATION_CLASSIFICATIONS)).max(7),
  relatedQuestion: z.string().trim().max(1_000).nullable(),
  literalQuotes: z.array(z.string().trim().min(1).max(4_000)).max(10),
}).strict();

export type RadarExpertOrganization = z.infer<typeof RadarExpertOrganizationSchema>;

export function validateRadarExpertOrganization(input: { transcript: string; organization: RadarExpertOrganization }) {
  const transcript = input.transcript.trim();
  if (!transcript) throw new Error("EXPERT_TRANSCRIPT_EMPTY");
  for (const quote of input.organization.literalQuotes) {
    if (!transcript.includes(quote)) throw new Error("EXPERT_ORGANIZATION_QUOTE_NOT_FOUND_IN_TRANSCRIPT");
  }
  return input.organization;
}

export function buildRadarExpertOrganizationPrompt(input: {
  briefTitle: string;
  questions: unknown[];
  radarContext: Record<string, unknown>;
  transcript: string;
}) {
  return JSON.stringify({
    briefTitle: input.briefTitle,
    questions: input.questions,
    radarContext: input.radarContext,
    transcript: input.transcript,
  });
}

export const RADAR_EXPERT_ORGANIZATION_SYSTEM_PROMPT = `Voce organiza uma transcricao bruta de especialista para revisao humana no Radar.
Retorne somente JSON valido no formato {"organizedText":"...","points":["..."],"classifications":["..."],"relatedQuestion":null,"literalQuotes":[]}.
Use somente informacao presente na transcricao. Nao invente fala, experiencia, criterio, ressalva, termo tecnico, pessoa, numero ou conclusao.
organizedText e uma organizacao editorial provisoria, nunca uma reescrita aprovada. Preserve o sentido, a incerteza e as ressalvas.
points devem ser curtos e derivados da transcricao. classifications aceita somente: experiência, opinião, critério, processo, ressalva, limitação, exemplo.
relatedQuestion deve apontar para uma pergunta presente na pauta quando houver relacao; caso contrario, use null.
literalQuotes deve conter somente trechos literalmente presentes na transcricao. Nao invente timestamps; eles nao fazem parte deste contrato.
Toda saida exige revisao humana e nao vira ExpertEvidence automaticamente.`;

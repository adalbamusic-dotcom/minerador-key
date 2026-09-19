import { z } from "zod";

const SourceRefSchema = z.object({
  sourceId: z.string().min(1),
  evidenceRef: z.string().min(1).nullable(),
}).strict();

const VisualBriefSchema = z.object({
  objective: z.string().trim().min(1).max(2000),
  prompt: z.string().trim().min(1).max(12000),
  aspectRatio: z.string().trim().min(1).max(30),
  altText: z.string().max(1000),
  assetId: z.string().uuid().nullable(),
}).strict();

/**
 * ===== A CENA É A UNIDADE DE PRODUÇÃO DO ROTEIRO =====
 *
 * `title` e `onScreenText` entraram no Corte 6A. A auditoria mostrou que o
 * contrato representava narração, direção visual e instrução técnica, mas não
 * tinha como guardar COMO A CENA SE CHAMA nem O QUE APARECE ESCRITO NA TELA —
 * dois elementos que qualquer roteiro audiovisual precisa.
 *
 * Entraram com `.default("")`, e por isso são retrocompatíveis: payloads já
 * gravados sem as chaves continuam validando, e o parse preenche o vazio.
 *
 * Nenhuma migration foi necessária. O único CHECK sobre `payload` em
 * `writer_deliverables` e `writer_deliverable_versions` é
 * `jsonb_typeof(payload) = 'object'` — as chaves internas são contrato do Zod,
 * não do banco. Verificado no schema efetivo antes de escrever isto.
 *
 * `technicalDirection` foi REUSADO como "observação": é o campo livre da cena,
 * e criar um segundo campo de texto solto seria schema paralelo por preguiça de
 * ler o que já existia.
 */
const VideoSceneSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  /** Como a cena se chama para quem produz. Não é o texto que vai ao ar. */
  title: z.string().max(300).default(""),
  durationSeconds: z.number().int().nonnegative(),
  narration: z.string().max(12000),
  /** O que aparece ESCRITO na tela — legenda, lettering, card. */
  onScreenText: z.string().max(3000).default(""),
  visualDirection: z.string().max(6000),
  /** Observação livre da cena: instrução técnica, nota de gravação, lembrete. */
  technicalDirection: z.string().max(6000),
  storyboard: VisualBriefSchema.nullable(),
  sourceRefs: z.array(SourceRefSchema).max(40),
}).strict();

const CarouselSlideSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  heading: z.string().max(500),
  body: z.string().max(3000),
  visual: VisualBriefSchema.nullable(),
  sourceRefs: z.array(SourceRefSchema).max(40),
}).strict();

const SharedSchema = {
  documentId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  objective: z.string().max(4000),
  audience: z.string().max(2000),
  sourceDocumentHash: z.string().min(1),
  notes: z.array(z.string().max(2000)).max(50),
} as const;

export const VideoScriptPayloadSchema = z.object({
  ...SharedSchema,
  schemaVersion: z.literal(1),
  kind: z.literal("video_script"),
  channel: z.string().max(300),
  durationSeconds: z.number().int().nonnegative(),
  openingHook: z.string().max(3000),
  closingCta: z.string().max(3000),
  scenes: z.array(VideoSceneSchema).max(100),
}).strict();

export const CarouselPayloadSchema = z.object({
  ...SharedSchema,
  schemaVersion: z.literal(1),
  kind: z.literal("carousel"),
  channel: z.string().max(300),
  caption: z.string().max(12000),
  closingCta: z.string().max(3000),
  slides: z.array(CarouselSlideSchema).max(40),
}).strict();

export const WriterDeliverablePayloadSchema = z.discriminatedUnion("kind", [VideoScriptPayloadSchema, CarouselPayloadSchema]);
export type WriterDeliverablePayload = z.infer<typeof WriterDeliverablePayloadSchema>;

export const WriterMediaBriefSchema = z.object({
  brandId: z.string().uuid(),
  documentId: z.string().min(1),
  deliverableId: z.string().uuid().nullable(),
  /*
   * `article_block` entra para que uma imagem dentro de bloco do artigo tenha
   * briefing — sem ele, `anchor_kind = 'article_block'` seria inalcançável.
   * O CHECK do banco só aceita esse valor depois da M3; antes dela o INSERT é
   * recusado pelo banco, que é o comportamento correto para capacidade ausente.
   *
   * O briefing NÃO carrega âncora. `anchor_kind`/`anchor_ref` são atribuídos só
   * na troca atômica, depois do readback do Storage — ver `media-anchor.ts`.
   */
  role: z.enum(["cover", "breath", "storyboard", "slide", "article_block"]),
  objective: z.string().trim().min(1).max(2000),
  prompt: z.string().trim().min(1).max(12000),
  altText: z.string().max(1000),
  aspectRatio: z.string().trim().min(1).max(30),
}).strict();
export type WriterMediaBrief = z.infer<typeof WriterMediaBriefSchema>;

export function newWriterDeliverable(kind: WriterDeliverablePayload["kind"], input: { documentId: string; title: string; sourceDocumentHash: string }): WriterDeliverablePayload {
  const common = { schemaVersion: 1 as const, documentId: input.documentId, title: input.title,
    sourceDocumentHash: input.sourceDocumentHash, objective: "", audience: "", notes: [] as string[] };
  return kind === "video_script"
    ? VideoScriptPayloadSchema.parse({ ...common, kind, channel: "", durationSeconds: 0, openingHook: "", closingCta: "", scenes: [] })
    : CarouselPayloadSchema.parse({ ...common, kind, channel: "", caption: "", closingCta: "", slides: [] });
}

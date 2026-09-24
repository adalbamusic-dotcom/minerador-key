/**
 * ===== FASE 0 DO LEITOR DE EVIDÊNCIAS · LEITURAS ESTREITAS DO DOCUMENTO =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §8; regra R16 da SDD de egress. Sem mudança de contrato: quem chama recebe
 * o mesmo que recebia, só que o banco devolve menos.
 *
 * Medido em 2026-09-23 (agregados, R2/R3), documento GOOGLE: o payload tem
 * 4.502.936 B; blocos 1.093 B; metadados 232 B. O Guardião do MCP e a
 * semeadura da IA interna liam o payload inteiro para usar uma fração dele.
 *
 * Este módulo é puro: monta o `select` do PostgREST e remonta o que voltou,
 * validando pelos schemas do dono (`lib/arquiteto/contracts.ts`). A consulta
 * em si mora no servidor, sempre filtrada pela Marca.
 *
 * Mesma sintaxe da E1 (`lib/editorial/content-document-listing.ts`):
 * `apelido:payload->chave->chave`. `null` do PostgREST é chave ausente ou JSON
 * `null`; os dois viram ausência, e o padrão do schema decide — como no
 * documento completo lido por `parse`.
 */

import { z } from "zod";
import {
  ContentDocumentV1Schema,
  ContentDocumentV2Schema,
  ImportedRadarContextSchema,
  RadarWriterDossierSchema,
  VersionReferenceSchema,
  type RadarWriterDossier,
  type VersionReference,
} from "../arquiteto/contracts.ts";
import { RADAR_FOUNDATIONS_BUNDLE_PATHS } from "./radar-foundations.ts";

type Linha = Readonly<Record<string, unknown>>;

/** Os campos presentes na linha, sem o prefixo do apelido. */
function presentes(linha: Linha, prefixo: string, campos: readonly string[]): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const campo of campos) {
    const valor = linha[`${prefixo}${campo}`];
    if (valor !== null && valor !== undefined) saida[campo] = valor;
  }
  return saida;
}

/* ================================ Guardião ================================ */

const GUARDIAO = "g_";
const CAMPOS_DO_GUARDIAO = ["id", "blocks", "metadata"] as const;

/**
 * O Guardião usa só `id`, `blocks` e `metadata` (`lib/redator/guardian.ts`).
 * `id` e `marca_id` da linha resolvem a Marca contra o grant, como antes.
 * Medido: 1.812 B por chamada no documento GOOGLE, contra 4.502.936 B.
 *
 * SDD do Assunto, F4.2 · e a referência ao ArticleDNA fixado (~150 B), só para
 * achar o Assunto dele: o Guardião lê depois UM caminho do ArticleDNA
 * (`payload->subject`, < 1 kB) e avisa quando faltam a virada ou o link para o
 * destino. Nada do contexto importado.
 */
export const WRITER_GUARDIAN_SELECT = [
  "id", "marca_id", "content_hash",
  ...CAMPOS_DO_GUARDIAO.map(campo => `${GUARDIAO}${campo}:payload->${campo}`),
  `${GUARDIAO}articleDnaRef:payload->articleDnaRef`,
].join(",");

const GuardianViewSchema = ContentDocumentV2Schema.pick({ id: true, blocks: true, metadata: true });
export type WriterGuardianView = z.infer<typeof GuardianViewSchema>;

/** Lança `ZodError` fora do contrato, como o `parse` do documento completo lançava. */
export function writerGuardianViewFromRow(linha: Linha): WriterGuardianView {
  return GuardianViewSchema.parse(presentes(linha, GUARDIAO, CAMPOS_DO_GUARDIAO));
}

/**
 * A referência ao ArticleDNA fixado, para o Guardião achar o Assunto (F4.2).
 * `null` fora do contrato: aí o Guardião segue sem a conferência do Assunto,
 * como antes — a análise determinística não depende dela.
 */
export function writerGuardianArticleDnaRefFromRow(linha: Linha): VersionReference | null {
  const lida = VersionReferenceSchema.safeParse(linha[`${GUARDIAO}articleDnaRef`]);
  return lida.success ? lida.data : null;
}

/* =============================== Semeadura =============================== */

const DOCUMENTO = "d_";
const DOSSIE = "x_";
const BUNDLE = "b_";
const RAIZ_DO_DOSSIE = "payload->importedContext->dossier";

/** O que a rota de semeadura usa do documento, além dos fundamentos. */
const CAMPOS_DA_SEMENTE = ["id", "schemaVersion", "title", "status", "blocks"] as const;
/**
 * OS VÍNCULOS DO TEXTO COM OS DNAs E A ORIGEM.
 *
 * A semeadura não os usa, mas os valida: são eles que dizem de que BrandDNA,
 * ArticleDNA, SiloDNA, KeywordDNAs e pacote do Radar (v2) ou plano (v1) o
 * documento nasceu. Documento com vínculo fora do contrato não vira contexto
 * de IA, como a leitura inteira recusava. Medido em 2026-09-23 no documento
 * GOOGLE: 2.486 B a mais e ~60 ms a mais de banco na primeira consulta
 * (146 → 208 ms e 125 → 190 ms, médias de 3 execuções, duas ordens).
 * Os outros campos do documento (metadados, refs de SERP e evidência, linkMap,
 * editorContent, o resto do importedContext) não são relidos aqui.
 */
const CAMPOS_DE_VINCULO = ["brandDnaRef", "keywordDnaRefs", "siloDnaRef", "articleDnaRef", "radarOrigin", "contentPlanRef"] as const;
/** O dossiê sem o bundle, inteiro: é pequeno e é validado pelo contrato. */
const CAMPOS_DO_DOSSIE = Object.keys(RadarWriterDossierSchema.shape).filter(campo => campo !== "bundle");

/**
 * QUANTOS CAMINHOS DO BUNDLE POR CONSULTA.
 *
 * Cada seletor `payload->…` descomprime o payload de novo, e cada nível do
 * caminho copia o objeto intermediário (importedContext, dossier, bundle têm
 * ~4,5 MB cada). Medido em 2026-09-23 com EXPLAIN ANALYZE no documento GOOGLE:
 * 5 a 7 caminhos do bundle numa consulta custam 114-149 ms; 13 custam 833 ms;
 * os 26 da semeadura numa consulta só custaram 3.585 ms, perto do
 * `statement_timeout` de 8 s. Em fatias de 5, as quatro consultas custaram
 * 91-175 ms cada, ~0,55 s no total, e 74.877 B. A troca é consciente: o
 * payload inteiro custava ~78 ms de banco e 4,5 MB de egress. O custo cresce
 * com o tamanho do payload; só a Fase 2 (dossiê fora do payload) o remove.
 */
export const WRITER_SEED_BUNDLE_PATHS_PER_QUERY = 5;

const apelidoDoBundle = (caminho: readonly string[]) => `${BUNDLE}${caminho.join("_")}`;

/**
 * A primeira consulta: o documento que a rota usa e o dossiê sem o bundle.
 *
 * SDD do Assunto, F4.2 · e `importedContext.editorialContext`: as linhas
 * curtas que o envio grava com Assunto (`[]` sem ele, < 2 kB com ele), para
 * roteiro e carrossel lerem a virada pela mesma projeção do painel.
 */
export const WRITER_SEED_DOCUMENT_SELECT = [
  "id", "content_hash",
  ...[...CAMPOS_DA_SEMENTE, ...CAMPOS_DE_VINCULO].map(campo => `${DOCUMENTO}${campo}:payload->${campo}`),
  ...CAMPOS_DO_DOSSIE.map(campo => `${DOSSIE}${campo}:${RAIZ_DO_DOSSIE}->${campo}`),
  `${DOCUMENTO}editorialContext:payload->importedContext->editorialContext`,
].join(",");

const ContextoEditorialDaSementeSchema = ImportedRadarContextSchema.shape.editorialContext;

/**
 * As consultas do bundle, em fatias. Toda fatia traz de volta o `bundleHash`
 * do dossiê: é ele que prova que as partes vieram do MESMO pacote que o
 * cabeçalho — a mesma identidade que a E1 confere antes de completar um
 * documento com o bundle gravado.
 */
export const WRITER_SEED_BUNDLE_SELECTS: readonly string[] = Array.from(
  { length: Math.ceil(RADAR_FOUNDATIONS_BUNDLE_PATHS.length / WRITER_SEED_BUNDLE_PATHS_PER_QUERY) },
  (_, indice) => RADAR_FOUNDATIONS_BUNDLE_PATHS.slice(
    indice * WRITER_SEED_BUNDLE_PATHS_PER_QUERY, (indice + 1) * WRITER_SEED_BUNDLE_PATHS_PER_QUERY),
).map(fatia => [
  "id", `${DOSSIE}bundleHash:${RAIZ_DO_DOSSIE}->bundleHash`,
  ...fatia.map(caminho => `${apelidoDoBundle(caminho)}:${RAIZ_DO_DOSSIE}->bundle->${caminho.join("->")}`),
].join(","));

const WriterSeedDocumentSchema = ContentDocumentV2Schema
  .pick({ id: true, title: true, status: true, blocks: true })
  .extend({ schemaVersion: z.union([ContentDocumentV1Schema.shape.schemaVersion, ContentDocumentV2Schema.shape.schemaVersion]) })
  .strict();
export type WriterSeedDocument = z.infer<typeof WriterSeedDocumentSchema>;

const VINCULOS_COMUNS = { brandDnaRef: true, keywordDnaRefs: true, siloDnaRef: true, articleDnaRef: true } as const;
/** `.strict()`: v2 com plano, ou v1 com origem Radar, falham como no schema do documento inteiro. */
const WriterSeedLinksV1Schema = ContentDocumentV1Schema.pick({ ...VINCULOS_COMUNS, contentPlanRef: true }).strict();
const WriterSeedLinksV2Schema = ContentDocumentV2Schema.pick({ ...VINCULOS_COMUNS, radarOrigin: true }).strict();

const WriterSeedDossierHeadSchema = RadarWriterDossierSchema.omit({ bundle: true }).strict();
export type WriterSeedDossierHead = Omit<RadarWriterDossier, "bundle">;

export type WriterSeedHead = {
  document: WriterSeedDocument;
  /** `null` quando o documento não veio do Radar com dossiê (v1, ou v2 sem dossiê). */
  dossier: WriterSeedDossierHead | null;
  contentHash: string;
  /** As linhas do envio (F4.2). `[]` sem dossiê e sem Assunto. */
  editorialContext: string[];
};

/**
 * Remonta a primeira consulta. `null` = fora do contrato: a rota recusa como
 * recusava, com `document_incompatible`.
 *
 * O dossiê só existe na v2, como em `radarWriterDossierOfDocument`. Dossiê sem
 * nenhum campo é dossiê ausente; dossiê com campo faltando é incompatível.
 */
export function writerSeedHeadFromRow(linha: Linha): WriterSeedHead | null {
  const documento = WriterSeedDocumentSchema.safeParse(presentes(linha, DOCUMENTO, CAMPOS_DA_SEMENTE));
  if (!documento.success || typeof linha.content_hash !== "string") return null;
  const vinculos = presentes(linha, DOCUMENTO, CAMPOS_DE_VINCULO);
  const esquemaDosVinculos = documento.data.schemaVersion === 2 ? WriterSeedLinksV2Schema : WriterSeedLinksV1Schema;
  if (!esquemaDosVinculos.safeParse(vinculos).success) return null;
  const camposDoDossie = presentes(linha, DOSSIE, CAMPOS_DO_DOSSIE);
  if (documento.data.schemaVersion !== 2 || !Object.keys(camposDoDossie).length) {
    return { document: documento.data, dossier: null, contentHash: linha.content_hash, editorialContext: [] };
  }
  const dossie = WriterSeedDossierHeadSchema.safeParse(camposDoDossie);
  if (!dossie.success) return null;
  /* Fora do contrato (não é lista de textos): o documento inteiro também seria recusado. */
  const contextoEditorial = ContextoEditorialDaSementeSchema.safeParse(linha[`${DOCUMENTO}editorialContext`] ?? undefined);
  if (!contextoEditorial.success) return null;
  return { document: documento.data, dossier: dossie.data, contentHash: linha.content_hash, editorialContext: contextoEditorial.data };
}

function colocar(alvo: Record<string, unknown>, caminho: readonly string[], valor: unknown) {
  let atual = alvo;
  for (const chave of caminho.slice(0, -1)) {
    const proximo = atual[chave];
    if (proximo && typeof proximo === "object" && !Array.isArray(proximo)) atual = proximo as Record<string, unknown>;
    else { const novo: Record<string, unknown> = {}; atual[chave] = novo; atual = novo; }
  }
  atual[caminho[caminho.length - 1]] = valor;
}

/**
 * O dossiê que `radarFoundationsOfDossier` lê: o cabeçalho validado e um
 * bundle só com os caminhos de `RADAR_FOUNDATIONS_BUNDLE_PATHS`.
 *
 * Devolve `null` quando alguma fatia é de outro pacote (`bundleHash`
 * diferente do cabeçalho): juntar partes de pacotes diferentes produziria
 * fundamentos que nenhuma investigação sustenta.
 */
export function writerSeedDossierFromRows(head: WriterSeedDossierHead, linhas: readonly Linha[]): Record<string, unknown> | null {
  if (linhas.length !== WRITER_SEED_BUNDLE_SELECTS.length) return null;
  if (linhas.some(linha => linha[`${DOSSIE}bundleHash`] !== head.bundleHash)) return null;
  const bundle: Record<string, unknown> = {};
  for (const caminho of RADAR_FOUNDATIONS_BUNDLE_PATHS) {
    const apelido = apelidoDoBundle(caminho);
    const linha = linhas.find(item => apelido in item);
    const valor = linha ? linha[apelido] : null;
    if (valor !== null && valor !== undefined) colocar(bundle, caminho, valor);
  }
  return { ...head, bundle };
}

/* ================= MCP · documento e briefing sem o dossiê ================= */

/*
 * MUDANÇA DE CONTRATO ACEITA (adendo de decisões D4, 2026-09-23).
 *
 * `get_writer_document` devolvia o payload inteiro — 4,5 MB no documento
 * GOOGLE, 99% no dossiê — e `get_writer_brief` devolvia o dossiê de novo. As
 * duas passam a ler só caminhos do documento: a evidência é lida pelo
 * manifesto, pelos fundamentos e pelas fatias do leitor de evidências.
 */

const VISAO = "v_";
const CAMPOS_DA_VISAO = [
  "id", "schemaVersion", "title", "status", "blocks", "metadata",
  "brandDnaRef", "keywordDnaRefs", "siloDnaRef", "articleDnaRef", "radarOrigin", "contentPlanRef",
] as const;

/** Blocos, metadados, status, vínculos com os DNAs e a origem — nunca `importedContext` nem `editorContent`. */
export const WRITER_DOCUMENT_VIEW_SELECT = [
  "id", "marca_id", "article_id", "content_hash", "lock_version", "status", "updated_at",
  ...CAMPOS_DA_VISAO.map(campo => `${VISAO}${campo}:payload->${campo}`),
].join(",");

const CAMPOS_COMUNS_DA_VISAO = {
  id: true, schemaVersion: true, title: true, status: true, blocks: true, metadata: true,
  brandDnaRef: true, keywordDnaRefs: true, siloDnaRef: true, articleDnaRef: true,
} as const;
/** `.strict()`: v2 com plano, ou v1 com origem Radar, é documento fora do contrato — como no schema inteiro. */
const WriterDocumentViewV1Schema = ContentDocumentV1Schema.pick({ ...CAMPOS_COMUNS_DA_VISAO, contentPlanRef: true }).strict();
const WriterDocumentViewV2Schema = ContentDocumentV2Schema.pick({ ...CAMPOS_COMUNS_DA_VISAO, radarOrigin: true }).strict();
export type WriterDocumentView = z.infer<typeof WriterDocumentViewV1Schema> | z.infer<typeof WriterDocumentViewV2Schema>;

/** `null` = fora do contrato do dono; o MCP responde `document_incompatible`. */
export function writerDocumentViewFromRow(linha: Linha): WriterDocumentView | null {
  const campos = presentes(linha, VISAO, CAMPOS_DA_VISAO);
  const esquema = campos.schemaVersion === 1 ? WriterDocumentViewV1Schema : campos.schemaVersion === 2 ? WriterDocumentViewV2Schema : null;
  if (!esquema) return null;
  const lido = esquema.safeParse(campos);
  return lido.success ? lido.data : null;
}

const BRIEFING = "r_";
const CAMPOS_DO_BRIEFING = [
  "schemaVersion", "articleDnaRef", "keywordDnaRefs", "siloDnaRef", "instructions", "linkMap", "sourceIds", "evidenceRefs", "radarOrigin",
] as const;
const CABECALHO_DO_DOSSIE = ["bundleId", "bundleHash", "researchProfile", "keywordContext", "writerMayNot"] as const;

/**
 * O briefing: vínculos, instruções e pendências; do dossiê, só o cabeçalho (sem o bundle).
 *
 * SDD do Assunto, F4.1 · e `importedContext.editorialContext`: as linhas
 * curtas que o envio grava com Assunto (onde virar, seção da virada, direção
 * do H1, destino, alerta; `lib/redator/radar-subject-turn.ts`). Lista pequena
 * (< 2 kB com Assunto, `[]` sem ele), fora do dossiê.
 */
export const WRITER_BRIEF_SELECT = [
  "id", "marca_id", "content_hash",
  ...CAMPOS_DO_BRIEFING.map(campo => `${BRIEFING}${campo}:payload->${campo}`),
  `${BRIEFING}pendingDecisions:payload->importedContext->pendingDecisions`,
  `${BRIEFING}editorialContext:payload->importedContext->editorialContext`,
  ...CABECALHO_DO_DOSSIE.map(campo => `${DOSSIE}${campo}:${RAIZ_DO_DOSSIE}->${campo}`),
].join(",");

const CAMPOS_COMUNS_DO_BRIEFING = {
  articleDnaRef: true, keywordDnaRefs: true, siloDnaRef: true, instructions: true, linkMap: true, sourceIds: true, evidenceRefs: true,
} as const;
const WriterBriefV1Schema = ContentDocumentV1Schema.pick(CAMPOS_COMUNS_DO_BRIEFING).strict();
const WriterBriefV2Schema = ContentDocumentV2Schema.pick({ ...CAMPOS_COMUNS_DO_BRIEFING, radarOrigin: true }).strict();
const PendenciasDoBriefingSchema = ImportedRadarContextSchema.shape.pendingDecisions;
const ContextoEditorialDoBriefingSchema = ImportedRadarContextSchema.shape.editorialContext;
const CabecalhoDoDossieSchema = RadarWriterDossierSchema.omit({ bundle: true }).strict();

export type WriterBriefView = {
  schemaVersion: 1 | 2;
  fields: z.infer<typeof WriterBriefV1Schema> & { radarOrigin?: z.infer<typeof WriterBriefV2Schema>["radarOrigin"] };
  pendingDecisions: z.infer<typeof PendenciasDoBriefingSchema>;
  /** As linhas do envio (F4.1). `[]` na v1 e sem Assunto. */
  editorialContext: z.infer<typeof ContextoEditorialDoBriefingSchema>;
  /** `null`: v1, ou v2 sem dossiê (anterior ao gate). */
  dossier: z.infer<typeof CabecalhoDoDossieSchema> | null;
};

/** `null` = fora do contrato do dono. Dossiê com campo faltando é incompatível; sem nenhum campo, ausente. */
export function writerBriefFromRow(linha: Linha): WriterBriefView | null {
  const versao = linha[`${BRIEFING}schemaVersion`];
  if (versao !== 1 && versao !== 2) return null;
  const campos = presentes(linha, BRIEFING, CAMPOS_DO_BRIEFING.filter(campo => campo !== "schemaVersion"));
  const lido = (versao === 2 ? WriterBriefV2Schema : WriterBriefV1Schema).safeParse(campos);
  if (!lido.success) return null;
  const pendencias = versao === 2 ? PendenciasDoBriefingSchema.safeParse(linha[`${BRIEFING}pendingDecisions`] ?? undefined) : null;
  if (pendencias && !pendencias.success) return null;
  const contextoEditorial = versao === 2 ? ContextoEditorialDoBriefingSchema.safeParse(linha[`${BRIEFING}editorialContext`] ?? undefined) : null;
  if (contextoEditorial && !contextoEditorial.success) return null;
  const cabecalho = presentes(linha, DOSSIE, CABECALHO_DO_DOSSIE);
  let dossier: WriterBriefView["dossier"] = null;
  if (versao === 2 && Object.keys(cabecalho).length) {
    const dossie = CabecalhoDoDossieSchema.safeParse(cabecalho);
    if (!dossie.success) return null;
    dossier = dossie.data;
  }
  return { schemaVersion: versao, fields: lido.data, pendingDecisions: pendencias?.data ?? [], editorialContext: contextoEditorial?.data ?? [], dossier };
}

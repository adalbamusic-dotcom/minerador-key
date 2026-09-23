import { z } from "zod";
import {
  ContentDocumentSchema,
  ContentDocumentV1Schema,
  ContentDocumentV2Schema,
  ImportedRadarContextSchema,
  RadarWriterDossierSchema,
  type ContentDocument,
} from "../arquiteto/contracts.ts";

/**
 * ===== E1 · A LISTAGEM DA MESA NÃO CARREGA O PACOTE DO RADAR =====
 *
 * SDD de egress (docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md),
 * proposta E1 e regra R8 ("listagem não é detalhe").
 *
 * Medido em 2026-09-23 (agregados, R2/R3): os 2 documentos da marca somavam
 * 4.496.695 bytes de `payload`; 4.488.306 deles eram
 * `importedContext.dossier.bundle`. Sem o bundle, 8.365 bytes. O bundle só é
 * lido pelo Redator no documento aberto (`lib/redator/radar-foundations.ts`).
 *
 * A FORMA PARCIAL É EXPLÍCITA. O documento listado sem o bundle leva
 * `importedContext.dossier.bundleOmitted: true`. O schema do documento
 * completo (`ContentDocumentSchema`) é `.strict()` e exige `bundle`: a cópia
 * parcial NÃO passa nele, então nenhum caminho que valida o documento completo
 * a aceita por engano. O schema completo não foi afrouxado.
 *
 * Só o documento v2 com dossiê perde algo na listagem. O v1 e o v2 sem dossiê
 * saem inteiros — para eles a listagem É o documento completo.
 */

/** O dossiê como a listagem o entrega: tudo menos o bundle, com o marcador. */
export const RadarWriterDossierListingSchema = RadarWriterDossierSchema
  .omit({ bundle: true })
  .extend({ bundleOmitted: z.literal(true) })
  .strict();

const ImportedRadarContextListingSchema = ImportedRadarContextSchema
  .extend({ dossier: RadarWriterDossierListingSchema })
  .strict();

/** v2 com o dossiê sem bundle. Nunca é gravado como documento. */
export const PartialContentDocumentSchema = ContentDocumentV2Schema
  .extend({ importedContext: ImportedRadarContextListingSchema })
  .strict();
export type PartialContentDocument = z.infer<typeof PartialContentDocumentSchema>;

/**
 * O que a listagem pode devolver: o documento completo ou a forma parcial.
 *
 * A ordem importa: o completo é tentado primeiro, e um documento completo sai
 * exatamente como sairia de `ContentDocumentSchema`.
 */
export const ListedContentDocumentSchema = z.union([ContentDocumentSchema, PartialContentDocumentSchema]);
export type ListedContentDocument = ContentDocument | PartialContentDocument;

/** A cópia é parcial? Só a v2 com o marcador no dossiê. */
export function isPartialContentDocument(document: ListedContentDocument): document is PartialContentDocument {
  if (document.schemaVersion !== 2) return false;
  const dossie = document.importedContext.dossier as { bundleOmitted?: unknown } | null;
  return Boolean(dossie && dossie.bundleOmitted === true);
}

/** Um registro JSON de verdade — nem array, nem nulo. */
const ehRegistro = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

/**
 * A forma de LISTAGEM do documento: sem o bundle, com o marcador.
 *
 * Idempotente. Documento que não tem o que omitir volta como está. Serve à
 * cópia local de recuperação, que não guarda o pacote do Radar: o que o
 * Redator edita precisa vir do servidor (`AGENTS.md` §10).
 */
export function toListingForm(document: ListedContentDocument): ListedContentDocument {
  if (document.schemaVersion !== 2 || isPartialContentDocument(document)) return document;
  const dossie = document.importedContext.dossier;
  if (!dossie) return document;
  const semBundle = Object.fromEntries(Object.entries(dossie).filter(([chave]) => chave !== "bundle"));
  return PartialContentDocumentSchema.parse({
    ...document,
    importedContext: { ...document.importedContext, dossier: { ...semBundle, bundleOmitted: true } },
  });
}

export function toListingForms(documents: Readonly<Record<string, ListedContentDocument>>): Record<string, ListedContentDocument> {
  return Object.fromEntries(Object.entries(documents).map(([id, document]) => [id, toListingForm(document)]));
}

/**
 * O bundle gravado, lido VERBATIM da linha — com a identidade que a própria
 * linha declara ao lado dele.
 */
export type StoredRadarBundle = { bundleId: unknown; bundleHash: unknown; bundle: unknown };

/**
 * Completa a cópia parcial com o bundle que está GRAVADO.
 *
 * Só completa quando a linha declara o MESMO pacote (`bundleId` e
 * `bundleHash`) que a cópia parcial. Pacote diferente, ausente ou que não é
 * registro devolve `null`: juntar o dossiê de um pacote com o bundle de outro
 * gravaria um documento incoerente. O bundle volta intacto — nada é podado nem
 * reidratado (R10).
 */
export function completeWithStoredBundle(document: PartialContentDocument, stored: StoredRadarBundle): ContentDocument | null {
  const dossie = document.importedContext.dossier;
  if (stored.bundleId !== dossie.bundleId || stored.bundleHash !== dossie.bundleHash) return null;
  if (!ehRegistro(stored.bundle)) return null;
  const semMarcador = Object.fromEntries(Object.entries(dossie).filter(([chave]) => chave !== "bundleOmitted"));
  const completo = ContentDocumentSchema.safeParse({
    ...document,
    importedContext: { ...document.importedContext, dossier: { ...semMarcador, bundle: stored.bundle } },
  });
  return completo.success ? completo.data : null;
}

/**
 * O rascunho de recuperação POR DOCUMENTO (`minerador-pro:document-recovery:*`)
 * aplicado sobre o documento completo que VEIO DO SERVIDOR.
 *
 * O rascunho local leva o documento inteiro, bundle incluído. O pacote do
 * Radar e a procedência (`importedContext`, `radarOrigin`) não são editados
 * pelo Redator, então vêm SEMPRE do servidor: nenhum bundle do navegador vira
 * base de edição nem é regravado pelo autosave (`AGENTS.md` §10). Do rascunho
 * vem só o que o Redator edita.
 *
 * Devolve `null` — rascunho não aplicado, e mantido no navegador — quando ele
 * é de outro documento, de outra versão de schema ou de OUTRO pacote do Radar
 * (`bundleId`/`bundleHash` diferentes): o texto foi escrito sobre outra
 * investigação, e misturá-lo com o pacote do servidor seria incoerente.
 */
export function recoveryOverServerDocument(server: ContentDocument, recovered: ContentDocument): ContentDocument | null {
  if (recovered.id !== server.id || recovered.schemaVersion !== server.schemaVersion) return null;
  if (server.schemaVersion !== 2 || recovered.schemaVersion !== 2) return recovered;
  const doServidor = server.importedContext.dossier;
  const doRascunho = recovered.importedContext.dossier;
  if ((doServidor?.bundleId ?? null) !== (doRascunho?.bundleId ?? null) || (doServidor?.bundleHash ?? null) !== (doRascunho?.bundleHash ?? null)) return null;
  const aplicado = ContentDocumentSchema.safeParse({ ...recovered, radarOrigin: server.radarOrigin, importedContext: server.importedContext });
  return aplicado.success ? aplicado.data : null;
}

/**
 * Quando a listagem chega com a cópia parcial de um documento que a memória
 * JÁ tem completo, a memória empresta o bundle — desde que seja o mesmo pacote.
 *
 * Sem isto, cada releitura da mesa rebaixaria o documento aberto no Redator a
 * parcial: o editor seria desmontado e a edição não salva, perdida. O bundle é
 * imutável por documento (o handoff do Radar recusa pacote diferente para o
 * mesmo artigo), e a identidade é conferida antes de emprestar.
 *
 * A memória só tem documento completo vindo do servidor: a cópia local de
 * recuperação é gravada e restaurada na forma de listagem.
 */
export function mergeListedDocument(current: ListedContentDocument | undefined, incoming: ListedContentDocument): ListedContentDocument {
  if (!current || !isPartialContentDocument(incoming) || isPartialContentDocument(current)) return incoming;
  if (current.id !== incoming.id || current.schemaVersion !== 2 || !current.importedContext.dossier) return incoming;
  const dossie = current.importedContext.dossier;
  return completeWithStoredBundle(incoming, { bundleId: dossie.bundleId, bundleHash: dossie.bundleHash, bundle: dossie.bundle }) ?? incoming;
}

/** Aplica `mergeListedDocument` a cada documento do próximo mapa. */
export function keepLoadedBundles(
  next: Readonly<Record<string, ListedContentDocument>>,
  memory: Readonly<Record<string, ListedContentDocument>>,
): Record<string, ListedContentDocument> {
  return Object.fromEntries(Object.entries(next).map(([id, document]) => [id, mergeListedDocument(memory[id], document)]));
}

/* ======================= A PROJEÇÃO NO SERVIDOR ======================= */

/*
 * Os campos vêm do PRÓPRIO schema: um campo novo no documento entra na
 * listagem sem ninguém lembrar de acrescentá-lo aqui. Só o bundle fica de fora.
 */
const CAMPOS_DO_DOCUMENTO = [...new Set([
  ...Object.keys(ContentDocumentV1Schema.shape),
  ...Object.keys(ContentDocumentV2Schema.shape),
])].filter(campo => campo !== "importedContext");
const CAMPOS_DO_CONTEXTO = Object.keys(ImportedRadarContextSchema.shape).filter(campo => campo !== "dossier");
const CAMPOS_DO_DOSSIE = Object.keys(RadarWriterDossierSchema.shape).filter(campo => campo !== "bundle");

const APELIDO = { documento: "d_", contexto: "c_", dossie: "x_" } as const;

/**
 * O `select` da listagem: um seletor de caminho do PostgREST por campo, com
 * apelido — a mesma sintaxe de `lib/server/serp-cache-store.ts`. O
 * `postgrest-js` repassa a string sem reescrever (só tira espaços), e o parser
 * de tipos dele aceita `apelido:coluna->chave`. É isto que impede o bundle de
 * sair do banco, sem view nem migration.
 */
export const CONTENT_DOCUMENT_LISTING_SELECT = [
  ...CAMPOS_DO_DOCUMENTO.map(campo => `${APELIDO.documento}${campo}:payload->${campo}`),
  ...CAMPOS_DO_CONTEXTO.map(campo => `${APELIDO.contexto}${campo}:payload->importedContext->${campo}`),
  ...CAMPOS_DO_DOSSIE.map(campo => `${APELIDO.dossie}${campo}:payload->importedContext->dossier->${campo}`),
].join(",");

/**
 * Remonta o documento a partir da linha projetada.
 *
 * O PostgREST devolve `null` tanto para chave ausente quanto para JSON `null`.
 * `null` é tratado como AUSENTE: nos campos que aceitam `null` o padrão do
 * schema também é `null` (`editorContent`, `dossier`), e nos outros o padrão
 * ou a opcionalidade decidem — igual ao documento completo gravado a partir
 * de um `parse`. Os objetos internos (`metadata`, `radarOrigin`,
 * `keywordContext`…) vêm inteiros, com os próprios `null`.
 *
 * Dossiê presente vira a forma parcial, com o marcador. Dossiê ausente ou
 * `null` deixa o documento completo, porque não há o que omitir.
 */
export function listedContentDocumentFromRow(row: Readonly<Record<string, unknown>>): ListedContentDocument {
  const pegar = (prefixo: string, campos: readonly string[]) => {
    const saida: Record<string, unknown> = {};
    for (const campo of campos) {
      const valor = row[`${prefixo}${campo}`];
      if (valor !== null && valor !== undefined) saida[campo] = valor;
    }
    return saida;
  };
  const documento = pegar(APELIDO.documento, CAMPOS_DO_DOCUMENTO);
  const contexto = pegar(APELIDO.contexto, CAMPOS_DO_CONTEXTO);
  const dossie = pegar(APELIDO.dossie, CAMPOS_DO_DOSSIE);
  if (Object.keys(dossie).length) contexto.dossier = { ...dossie, bundleOmitted: true };
  if (Object.keys(contexto).length) documento.importedContext = contexto;
  return ListedContentDocumentSchema.parse(documento);
}

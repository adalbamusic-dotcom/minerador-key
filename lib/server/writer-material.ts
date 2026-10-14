import "server-only";

/**
 * ===== 2026-10-14 · F6 · O MATERIAL NOVO DO RADAR NO REDATOR, PELO MESMO NÚCLEO DO CSV =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §18.1
 * (F6, "Redator lê o material novo"; autorização do dono em 2026-10-14: "pode
 * sim"). O painel do Redator (GET /api/redator/article-blueprint?part=material)
 * e o MCP (get_writer_brief, get_writer_foundations, get_writer_document) leem
 * daqui a análise competitiva, o diferencial da marca, o fechamento em 4 tempos,
 * a malha e a trilha do Silo, as fontes de autoridade e as regras de título.
 *
 * Nenhuma montagem paralela: a MESMA montagem de get_article_for_writing
 * (`assembleRadarPortableExport` com o Silo da seleção e a página publicada lida
 * como o CSV a lê), a MESMA regra do artigo-modelo obrigatório, a MESMA linha
 * (`radarPortableWritingArticles` → `buildRadarWritingExportArticle`) e a leitura
 * pura dos blocos (`radarWritingMaterialOf`). A conferência do pacote é a da
 * semeadura (`writerAssembledArticleOf`): recongelado ou com outro ArticleDNA, o
 * material de hoje é de outro pacote e não é servido (invariante 30). A troca do
 * grafo de links adotada no Radar (sem recongelar) chega aqui: é a malha nova
 * sobre o mesmo pacote — o aviso "Links do Silo atualizados disponíveis".
 *
 * Só leitura (SELECT e o GET da página publicada, como o CSV): nada é gravado,
 * nenhuma IA, nenhum provider pago.
 */

import { radarPortableExportMissingBlueprints } from "@/lib/radar/portable-export-batch";
import { radarPortableWritingArticles } from "@/lib/radar/portable-writing-batch";
import { radarWritingMaterialOf } from "@/lib/radar/portable-writing-material";
import { WRITER_MATERIAL_NEEDS_BLUEPRINT_REASON, WRITER_MATERIAL_UNREADABLE_REASON, type WriterMaterialRead } from "@/lib/redator/writer-material";
import { getOperationalClient } from "@/lib/server/editorial-db";
import { RadarArticleBlueprintUnavailableError } from "@/lib/server/radar-article-blueprint-read";
import { assembleRadarPortableExport, radarReadPublishedStructure, type RadarPortableExportAssembly } from "@/lib/server/radar-portable-export-core";
import { readWriterEvidenceHead, type WriterEvidenceContext } from "@/lib/server/writer-evidence-document";
import { writerAssembledArticleOf } from "@/lib/server/writer-seed";

/** A montagem do export para UM artigo — injetável nos testes (fixtures, sem banco). */
export type WriterMaterialPorts = {
  assemble: (input: { brandId: string; articleId: string; actorUserId: string }) => Promise<RadarPortableExportAssembly>;
};

export const writerMaterialPorts: WriterMaterialPorts = {
  /* A mesma montagem de get_article_for_writing (radarMcpMaterialForArticle, modo "writing"). */
  assemble: ({ brandId, articleId, actorUserId }) => assembleRadarPortableExport({
    brandId, articleIds: [articleId], supabase: getOperationalClient(), actorUserId,
    readPublishedStructure: radarReadPublishedStructure, selectionSiloContext: true, videoLensDigests: false,
  }),
};

const NAO_MONTA = "O Radar não montou o material deste artigo agora: a linha do CSV \"Para escrever\" não saiu.";

/**
 * O MATERIAL SOBRE UMA MONTAGEM JÁ FEITA (puro sobre a montagem; o teste passa a
 * de fixture). A mesma sequência de get_article_for_writing: sem a planta
 * concluída, o estado explícito; com ela, a linha do artigo e o material dela.
 */
export function writerMaterialOfAssembly(montagem: RadarPortableExportAssembly, input: { articleId: string; bundleObservedAt: string | null; articleDnaVersionId: string | null }): WriterMaterialRead {
  const doDocumento = writerAssembledArticleOf(montagem, input);
  if (doDocumento.kind !== "ready") return { state: doDocumento.kind, articleId: input.articleId, reason: doDocumento.reason };
  if (radarPortableExportMissingBlueprints([doDocumento.montada], null, { mode: "writing" }).length) {
    return { state: "needs_article_blueprint", articleId: input.articleId, reason: WRITER_MATERIAL_NEEDS_BLUEPRINT_REASON };
  }
  let linhas: ReturnType<typeof radarPortableWritingArticles>;
  try {
    linhas = radarPortableWritingArticles({
      articles: [doDocumento.montada], lenses: montagem.lentes, plan: null, selectionPlan: montagem.planoDaSelecao,
      publications: montagem.publicacoes, today: montagem.exportedAt, brandVoice: montagem.brandVoice,
      ...(montagem.grupos?.size ? { groups: montagem.grupos } : {}),
    });
  } catch (erro) {
    const codigo = (erro as { code?: unknown } | null)?.code;
    if (codigo === "needs_article_blueprint") return { state: "needs_article_blueprint", articleId: input.articleId, reason: (erro as Error).message };
    throw erro;
  }
  const linha = linhas.find(item => item.articleId === input.articleId)?.article ?? null;
  const material = radarWritingMaterialOf(linha?.uncutRow ?? linha?.row ?? null);
  if (!material) return { state: "refused", articleId: input.articleId, reason: NAO_MONTA };
  return { state: "ready", articleId: input.articleId, material };
}

/**
 * O TEXTO DO DOCUMENTO PARA O CHECKLIST: os blocos e o conteúdo do editor (as
 * marcas de link guardam o endereço só ali). Dois caminhos do payload, nunca o
 * dossiê; a Marca sempre filtrada. Só leitura.
 */
export async function readWriterDocumentLinkContent(context: Pick<WriterEvidenceContext, "brandId" | "client">, documentId: string): Promise<{ blocks: unknown; editorContent: unknown } | null> {
  const cliente = context.client ?? getOperationalClient();
  const { data, error } = await cliente.from("content_documents")
    .select("bl:payload->blocks,ec:payload->editorContent")
    .eq("id", documentId).eq("marca_id", context.brandId).maybeSingle();
  if (error || !data) return null;
  const linha = data as unknown as { bl?: unknown; ec?: unknown };
  return { blocks: linha.bl ?? [], editorContent: linha.ec ?? null };
}

/** O MATERIAL DE UM DOCUMENTO DO REDATOR (Marca já autorizada por quem chama). */
export async function readWriterMaterial(
  context: WriterEvidenceContext,
  input: { documentId: string; actorUserId: string },
  portas: WriterMaterialPorts = writerMaterialPorts,
): Promise<WriterMaterialRead> {
  const head = await readWriterEvidenceHead(context, input.documentId);
  if (!head.dossier) return { state: "absent", articleId: head.radarOrigin?.articleId ?? null, reason: "Este documento não veio do Radar com dossiê: não há material do CSV a que ele se prenda." };
  const articleId = head.radarOrigin?.articleId ?? head.articleId;
  let montagem: RadarPortableExportAssembly;
  try {
    montagem = await portas.assemble({ brandId: context.brandId, articleId, actorUserId: input.actorUserId });
  } catch (erro) {
    if (erro instanceof RadarArticleBlueprintUnavailableError) return { state: "blueprint_unavailable", articleId, reason: erro.message };
    throw erro;
  }
  return writerMaterialOfAssembly(montagem, {
    articleId,
    bundleObservedAt: head.bundleObservedAt,
    articleDnaVersionId: head.radarOrigin?.articleDnaVersionId ?? null,
  });
}

/**
 * O material e o texto do documento, para o MCP: a falha da leitura não derruba
 * a ferramenta (o resto da resposta vale) — vira o estado "unreadable", dito.
 */
export async function readWriterMaterialForMcp(
  context: WriterEvidenceContext,
  input: { documentId: string; actorUserId: string; document?: { blocks?: unknown } | null },
  portas: WriterMaterialPorts = writerMaterialPorts,
): Promise<{ leitura: WriterMaterialRead; documento: { blocks: unknown; editorContent: unknown } | null }> {
  try {
    const [leitura, conteudo] = await Promise.all([
      readWriterMaterial(context, input, portas),
      readWriterDocumentLinkContent(context, input.documentId),
    ]);
    const documento = conteudo ? { blocks: input.document?.blocks ?? conteudo.blocks, editorContent: conteudo.editorContent } : null;
    return { leitura, documento };
  } catch {
    return { leitura: { state: "unreadable", articleId: null, reason: WRITER_MATERIAL_UNREADABLE_REASON }, documento: null };
  }
}

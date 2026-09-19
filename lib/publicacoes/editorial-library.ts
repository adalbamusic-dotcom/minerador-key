/**
 * ===== A BIBLIOTECA DE PUBLICAÇÕES PROJETA O DOCUMENTO — NÃO O COPIA =====
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * Publicações lia apenas `publication_records` e os briefings legados. Um
 * documento que existia no Redator, persistido e sobrevivendo ao F5, não
 * aparecia em lugar nenhum da biblioteca — porque nenhum registro de publicação
 * tinha nascido ainda.
 *
 * O resultado prático era uma BIBLIOTECA PARALELA IMPLÍCITA: a lista de
 * rascunhos do Redator era a única que conhecia o trabalho em andamento, e
 * Publicações via outro universo.
 *
 * ==================== A AUTORIDADE É UMA SÓ ====================
 *
 * `content_documents` é o documento editorial. Publicações PROJETA esse mesmo
 * documento; ela não guarda cópia, não cria rascunho próprio e não tem lista
 * de entrada paralela.
 *
 * `PublicationRecord` continua existindo para o que ele sempre foi: publicação,
 * agendamento e destino real. Ele ENRIQUECE a linha do documento — nunca a
 * substitui e nunca cria uma segunda.
 *
 * Por isso o `id` da linha é o `documentId`. Um documento com registro de
 * publicação continua sendo UMA linha; é estruturalmente impossível duplicar.
 *
 * ==================== FINALIZAR NÃO É ENTREGAR ====================
 *
 * Os eixos estão separados logo abaixo. A regra que eles sustentam:
 * `content_documents.status = 'aprovado'` diz que o humano FINALIZOU no
 * Redator — e não diz nada sobre Publicações ter recebido.
 */

import type { ContentDocument } from "../arquiteto/contracts.ts";
import type { OperationalPublication } from "../editorial/operational-flow.ts";

/**
 * ===== TRÊS EIXOS, E NÃO UM =====
 *
 * A primeira versão desta projeção colapsava tudo num estado só, e mapeava
 * `document.status = 'aprovado'` direto para `PRONTO`. Isso dizia que o artigo
 * estava pronto EM PUBLICAÇÕES — quando ele podia nunca ter sido entregue.
 *
 * Finalizar no Redator, ser recebido em Publicações e estar publicado fora são
 * três perguntas diferentes, com três autoridades diferentes:
 *
 *   writerStatus   ← `content_documents.status`
 *   deliveryStatus ← existe `publication_record` persistido e relido
 *   PUBLICADO      ← o registro chegou a `published`
 *
 * Um documento `aprovado` sem registro é `FINALIZADO` + `NAO_ENTREGUE`. Ele
 * aparece na biblioteca — a leitura é unificada — mas nunca se apresenta como
 * algo que Publicações já tem.
 */
export type WriterStatus = "RASCUNHO" | "FINALIZADO";
export type DeliveryStatus = "NAO_ENTREGUE" | "RECEBIDO" | "PUBLICADO";

export type EditorialLibraryRow = {
  /** É o `documentId`. Uma linha por documento — a garantia de não duplicar. */
  id: string;
  documentId: string;
  articleId: string;
  brandId: string;
  title: string;
  slug: string;
  /** Eixo do REDATOR. Nada aqui afirma coisa alguma sobre Publicações. */
  writerStatus: WriterStatus;
  /** Eixo de PUBLICAÇÕES. Só sai de NAO_ENTREGUE com registro persistido. */
  deliveryStatus: DeliveryStatus;
  /** O estado cru do documento, para quem precisa da distinção fina. */
  documentStatus: ContentDocument["status"];
  origin: "radar" | "planner";
  currentVersionId: string | null;
  updatedAt: string | null;
  /** Só existe quando há registro real de publicação. */
  publicationStatus: OperationalPublication["state"] | null;
  publicationId: string | null;
  destinationUrl: string | null;
};

/**
 * `PUBLICADO` vem do registro de publicação; os outros dois, do documento.
 *
 * A ordem importa: um documento `aprovado` cujo registro já foi publicado é
 * PUBLICADO, não PRONTO. Perguntar primeiro ao documento faria a biblioteca
 * mostrar como "pronto para publicar" algo que já está no ar.
 */
export function writerStatusOf(documentStatus: ContentDocument["status"]): WriterStatus {
  return documentStatus === "aprovado" ? "FINALIZADO" : "RASCUNHO";
}

/**
 * A ENTREGA É PROVADA PELO REGISTRO, NUNCA PELO DOCUMENTO.
 *
 * Sem `publication_record` não houve `sendWriterToPublications` com readback
 * confirmado — e sem isso o conteúdo não pertence operacionalmente a
 * Publicações, por mais finalizado que esteja no Redator.
 */
export function deliveryStatusOf(publicationState: OperationalPublication["state"] | null | undefined): DeliveryStatus {
  if (!publicationState) return "NAO_ENTREGUE";
  return publicationState === "published" ? "PUBLICADO" : "RECEBIDO";
}

/**
 * A PROJEÇÃO.
 *
 * Entra: os documentos da marca e os registros de publicação que existirem.
 * Sai: uma linha por DOCUMENTO, enriquecida quando houver publicação.
 *
 * Registro de publicação órfão — sem documento correspondente — é deliberadamente
 * ignorado aqui: ele não tem conteúdo para abrir no Redator, e inventá-lo como
 * linha da biblioteca editorial seria a mesma confusão que esta projeção veio
 * desfazer. As abas de fila e publicados continuam lendo os registros direto.
 */
export function projectEditorialLibrary(input: {
  brandId: string;
  documents: ContentDocument[];
  publications: OperationalPublication[];
  /** `updated_at` remoto por documento, quando a leitura o trouxer. */
  updatedAtByDocument?: Record<string, string | undefined>;
  currentVersionByDocument?: Record<string, string | null | undefined>;
}): EditorialLibraryRow[] {
  const porDocumento = new Map<string, OperationalPublication>();
  for (const publicacao of input.publications) {
    if (publicacao.brandId !== input.brandId || !publicacao.documentId) continue;
    /* Se houver mais de um registro para o mesmo documento, vale o mais recente. */
    const atual = porDocumento.get(publicacao.documentId);
    if (!atual || publicacao.updatedAt > atual.updatedAt) porDocumento.set(publicacao.documentId, publicacao);
  }

  return input.documents.map(document => {
    const publicacao = porDocumento.get(document.id) ?? null;
    return {
      id: document.id,
      documentId: document.id,
      articleId: document.articleDnaRef.entityId,
      brandId: input.brandId,
      title: document.title,
      slug: document.metadata.slug || publicacao?.slug || "",
      writerStatus: writerStatusOf(document.status),
      deliveryStatus: deliveryStatusOf(publicacao?.state),
      documentStatus: document.status,
      origin: (document.schemaVersion === 2 ? "radar" : "planner") as EditorialLibraryRow["origin"],
      currentVersionId: input.currentVersionByDocument?.[document.id] ?? null,
      updatedAt: input.updatedAtByDocument?.[document.id] ?? publicacao?.updatedAt ?? null,
      publicationStatus: publicacao?.state ?? null,
      publicationId: publicacao?.id ?? null,
      destinationUrl: publicacao?.destinationUrl ?? null,
    };
  }).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/**
 * Filtro por EIXO, e não por um estado colapsado.
 *
 * `ENTREGUES` é o escopo normal da biblioteca de Publicações: esconde tudo que
 * ainda não tem registro, sem precisar de uma segunda projeção nem de uma lista
 * paralela. `TODOS` continua existindo como a identidade do read model — é o
 * que a projeção devolve antes de qualquer recorte —, mas NÃO é oferecido como
 * visão da biblioteca; ver abaixo.
 */
export type EditorialLibraryFilter = "TODOS" | WriterStatus | DeliveryStatus | "ENTREGUES";

/**
 * ===== O ESCOPO DE PUBLICAÇÕES É A ENTREGA =====
 *
 * `ContentDocument` é conteúdo produzido. `PublicationRecord` é a prova de que
 * ele foi entregue. A biblioteca de Publicações lista o que Publicações TEM.
 *
 * O default anterior era `TODOS`, e a lista de filtros misturava os dois eixos
 * (`RASCUNHO` e `FINALIZADO` são estados do REDATOR). O efeito era que um
 * documento sem registro nenhum abria como linha normal da biblioteca, lado a
 * lado com o que já havia sido recebido — a mesma confusão entre finalizar e
 * entregar que esta projeção veio desfazer, agora pela porta do filtro.
 *
 * Então: o escopo padrão é `ENTREGUES`, e os recortes oferecidos são todos do
 * EIXO DE ENTREGA. `NAO_ENTREGUE` continua existindo no read model e continua
 * alcançável — mas por um recorte explicitamente nomeado, nunca como parte
 * normal da lista, e nunca apresentado como algo já recebido.
 *
 * O eixo do Redator não sumiu: ele continua em `writerStatus`, no selo de cada
 * linha. O que ele não faz mais é definir o que a biblioteca mostra.
 */
export const PUBLICATIONS_LIBRARY_DEFAULT_FILTER = "ENTREGUES" satisfies EditorialLibraryFilter;

/** Os recortes oferecidos na biblioteca — todos do eixo de entrega. */
export const PUBLICATIONS_LIBRARY_FILTERS = ["ENTREGUES", "RECEBIDO", "PUBLICADO", "NAO_ENTREGUE"] as const satisfies readonly EditorialLibraryFilter[];

/** O rótulo carrega o significado; estado nunca só por cor nem por sigla crua. */
export const PUBLICATIONS_LIBRARY_FILTER_LABELS: Record<(typeof PUBLICATIONS_LIBRARY_FILTERS)[number], string> = {
  ENTREGUES: "Entregues",
  RECEBIDO: "Recebidos",
  PUBLICADO: "Publicados",
  NAO_ENTREGUE: "Ainda no Redator",
};

/**
 * A linha pertence operacionalmente a Publicações?
 *
 * Uma pergunta só, com uma resposta só, para quem precisar decidir sem repetir
 * a comparação com `NAO_ENTREGUE` em cada tela.
 */
export function belongsToPublications(row: EditorialLibraryRow): boolean {
  return row.deliveryStatus !== "NAO_ENTREGUE";
}

export function filterEditorialLibrary(rows: EditorialLibraryRow[], filtro: EditorialLibraryFilter) {
  if (filtro === "TODOS") return rows;
  if (filtro === "ENTREGUES") return rows.filter(belongsToPublications);
  if (filtro === "RASCUNHO" || filtro === "FINALIZADO") return rows.filter(row => row.writerStatus === filtro);
  return rows.filter(row => row.deliveryStatus === filtro);
}

/** Onde a linha abre. Sempre o Redator, sempre o mesmo documento. */
export function writerHrefForRow(row: EditorialLibraryRow, brandRef: string | null | undefined) {
  const query = `?documentId=${encodeURIComponent(row.documentId)}`;
  return brandRef ? `/${brandRef}/redator${query}` : `/redator${query}`;
}

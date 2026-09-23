import type { ArticleDNA, SiloDNA, SiloPage, VersionEnvelope } from "../arquiteto/contracts.ts";

/**
 * ===== O EXPORT POR SILO — um CSV por silo, com o silo inteiro =====
 *
 * ==================== POR QUE POR SILO ====================
 *
 * O CSV do Radar é a saída final para quem vai escrever com outra ferramenta
 * ou outra IA. Um artigo de silo escrito sozinho não sabe quem é o Pilar, em
 * que ponto da ordem narrativa ele entra, o que os irmãos já cobrem e o que a
 * fronteira do silo proíbe. Exportado por silo, cada arquivo carrega os
 * artigos na ordem em que o silo se lê, e cada linha carrega o contexto do
 * silo inteiro — para "responder sozinha", como o resto do dossiê.
 *
 * ==================== A CHAVE DO AGRUPAMENTO ====================
 *
 * `RadarItem.siloId` e nada mais. Ele vem do contexto de envio já resolvido
 * (`operational-flow.ts`, na importação), inclusive para ArticleDNA antigo que
 * não declara silo e teve o silo deduzido pelo território.
 *
 * As duas alternativas óbvias estão erradas:
 * - `article.payload.siloId` é nulo justamente nesses artigos antigos;
 * - `hydration.silo.id` pode ter vindo de `lista_id` na reconciliação — uma
 *   lista do Minerador, não um silo.
 *
 * ==================== NOME, ORDEM E MEMBROS ====================
 *
 * Do SiloDNA de maior `versionNumber` da marca — a mesma regra do envio ao
 * Redator. Linha é só artigo FINALIZADO (o contrato atual do export). Membro
 * que não virou linha aparece no contexto do silo com a situação dele, e o
 * arquivo ganha "-parcial" no nome: um silo pela metade não pode parecer
 * inteiro para quem abre a pasta.
 *
 * A SiloPage não tem dossiê do Radar. Ela entra no contexto (slug, canonical,
 * status), nunca como linha.
 *
 * ==================== O QUE NUNCA SAI ====================
 *
 * Nenhum id: nem siloId, nem articleId, nem versionId, nem hash (invariante
 * 43). O `articleId` circula no PLANO — é como a rota casa o plano com as
 * linhas que montou —, mas não entra em `silo_context_md` nem em
 * `silo_context_json`. Silo sem nome vira "Silo sem nome N", nunca o id.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== a entrada ============================== */

export type RadarSiloExportItemStatus = "finalized" | "not_finalized";

/** O que a hidratação sabe da SiloPage (`hydration.silo.siloPage*`). */
export type RadarSiloExportSiloPageHint = {
  slug?: string | null;
  canonical?: string | null;
  publicationStatus?: string | null;
};

/**
 * Um artigo que está no Radar.
 *
 * O chamador passa TODOS os itens do Radar dos silos exportados — não só os
 * finalizados. É isso que separa "não finalizado" de "não enviado ao Radar":
 * membro do SiloDNA sem item aqui é tratado como não enviado.
 */
export type RadarSiloExportItem = {
  /** Endereço interno. Serve para casar plano e linha; nunca vai para o CSV. */
  articleId: string;
  /** `RadarItem.siloId`. Vazio → arquivo "sem silo". */
  siloId: string | null | undefined;
  /** "finalized" vira linha; "not_finalized" é o que o servidor recusou. */
  status: RadarSiloExportItemStatus;
  title?: string | null;
  slug?: string | null;
  principalKeyword?: string | null;
  /** Motivo legível da recusa, para o aviso. Não entra no contexto do silo. */
  reason?: string | null;
  /** `RadarItem.unitType`. A SiloPage não é linha nem membro. */
  unitType?: string | null;
  /** `hydration.silo.siloDnaVersionId` — só para avisar versão diferente. */
  importedSiloDnaVersionId?: string | null;
  siloPage?: RadarSiloExportSiloPageHint | null;
};

/** Como descrever um membro do SiloDNA que não está no Radar. */
export type RadarSiloExportMemberDescriptor = {
  articleId: string;
  title?: string | null;
  principalKeyword?: string | null;
  slug?: string | null;
};

export type RadarSiloExportInput = {
  /** Instante ISO do export; só a data (AAAA-MM-DD) entra no nome do arquivo. */
  today: string;
  /**
   * A marca do pedido. Quando vem, SiloDNA ou SiloPage que declaram OUTRA
   * marca são ignorados — um silo de outra marca com o mesmo id não empresta
   * nome nem membros.
   */
  brandId?: string | null;
  items: readonly RadarSiloExportItem[];
  /** Todas as versões conhecidas (a rota lê `artefatos.silos`; a tela, `Object.values(siloVersions)`). */
  siloVersions: readonly VersionEnvelope<SiloDNA>[];
  siloPageVersions?: readonly VersionEnvelope<SiloPage>[];
  memberDescriptors?: readonly RadarSiloExportMemberDescriptor[];
};

/* ============================== a saída ============================== */

export type RadarSiloExportMemberStatus = "finalized" | "not_finalized" | "other_silo" | "not_sent";

export const RADAR_SILO_MEMBER_STATUS_LABEL: Record<RadarSiloExportMemberStatus, string> = {
  finalized: "finalizado",
  not_finalized: "não finalizado",
  /* Está no Radar, mas o Radar o registra em outro silo: não sai neste arquivo. */
  other_silo: "no Radar sob outro silo",
  not_sent: "não enviado ao Radar",
};

export type RadarSiloExportMember = {
  /** Interno, para a tela casar o faltante com a linha. Nunca vai para o CSV. */
  articleId: string;
  position: number;
  title: string | null;
  principalKeyword: string | null;
  slug: string | null;
  /** Rótulo legível do papel: "Pilar", "Suporte", "Reforço narrativo"… */
  role: string;
  status: RadarSiloExportMemberStatus;
  statusLabel: string;
  /** Falso quando o Radar põe o artigo no silo e a versão do SiloDNA não o lista. */
  inSiloDna: boolean;
  /** Linha deste arquivo. */
  inThisFile: boolean;
  reason: string | null;
};

export type RadarSiloExportFile = {
  filename: string;
  kind: "silo" | "no_silo";
  /** "Skincare", "Silo sem nome 2" ou "Sem silo". */
  siloLabel: string;
  siloName: string | null;
  partial: boolean;
  /** As linhas deste arquivo, na ordem do silo. Interno. */
  articleIds: string[];
  exported: number;
  total: number;
  /** Membros que não viraram linha deste arquivo, na ordem do silo. */
  pending: RadarSiloExportMember[];
  warnings: string[];
};

export type RadarSiloExportRowContext = {
  silo_context_md: string;
  silo_context_json: string;
};

export type RadarSiloExportPlan = {
  files: RadarSiloExportFile[];
  /** Silos sem nenhum artigo finalizado: não geram arquivo, só aviso. */
  emptySilos: Array<{ siloLabel: string; pending: RadarSiloExportMember[] }>;
  /** Por `articleId` da linha: as duas colunas do contexto do silo. */
  contextByArticleId: Record<string, RadarSiloExportRowContext>;
  warnings: string[];
  /** Um arquivo → CSV direto. Dois ou mais → um zip. Nenhum → nada a baixar. */
  delivery: { kind: "csv" | "zip" | "none"; filename: string | null };
};

/* ============================== utilidades ============================== */

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const ouNulo = (valor: unknown): string | null => texto(valor) || null;
const unicos = (valores: readonly (string | null | undefined)[]): string[] => {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const valor of valores) {
    const limpo = texto(valor);
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    saida.push(limpo);
  }
  return saida;
};

/**
 * ===== A MESMA LIMPEZA DO NOME DO DOSSIÊ AVULSO =====
 *
 * Réplica da regra interna de `radarPortableExportFilename`
 * (`lib/radar/portable-export.ts`), que não é exportada. Esta tarefa não pode
 * editar aquele arquivo; a suíte deste módulo compara as duas saídas, e uma
 * divergência futura aparece como teste vermelho em vez de dois nomes de
 * arquivo diferentes para o mesmo título.
 */
export function radarSiloExportCleanName(valor: string): string {
  return valor
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** O nome do pacote quando há mais de um arquivo. */
export function radarSiloExportArchiveFilename(today: string): string {
  return `radar-silos-${today.slice(0, 10)}.zip`;
}

/** Artigo sem título, sem keyword e sem slug ainda é um artigo — nunca o id. */
const rotuloDoArtigo = (membro: { title: string | null; principalKeyword: string | null; slug: string | null }): string =>
  membro.title || membro.principalKeyword || membro.slug || "artigo sem título conhecido";

const entreAspas = (valor: string) => `"${valor}"`;

/* ===================== as versões mais recentes ===================== */

/**
 * A versão de maior `versionNumber` por silo, da marca do pedido.
 *
 * Empate de número desempata por `createdAt`; persistindo, fica a primeira.
 * O empate não deveria existir — mas escolher em silêncio pela ordem do banco
 * foi exatamente o defeito do `.find` sem ordem no ArticleDNA.
 */
function maisRecentes<T extends { siloId: string; brandId?: string }>(
  versoes: readonly VersionEnvelope<T>[],
  brandId: string | null,
): Map<string, VersionEnvelope<T>> {
  const escolhidas = new Map<string, VersionEnvelope<T>>();
  for (const versao of versoes) {
    const siloId = texto(versao?.payload?.siloId);
    if (!siloId) continue;
    if (brandId && versao.payload.brandId && versao.payload.brandId !== brandId) continue;
    const atual = escolhidas.get(siloId);
    if (!atual
      || versao.versionNumber > atual.versionNumber
      || (versao.versionNumber === atual.versionNumber && texto(versao.createdAt) > texto(atual.createdAt))) {
      escolhidas.set(siloId, versao);
    }
  }
  return escolhidas;
}

/**
 * Descritores a partir do ArticleDNA: só o slug, que é o que ele sabe.
 *
 * Título e keyword em texto não moram no ArticleDNA (a keyword é referência a
 * KeywordDNA). O slug publicado vence o sugerido, como na rota do export:
 * página no ar tem o endereço que está no ar.
 */
export function radarSiloMemberDescriptorsOfArticleDnas(
  versoes: readonly VersionEnvelope<ArticleDNA>[],
  brandId?: string | null,
): RadarSiloExportMemberDescriptor[] {
  const escolhidas = new Map<string, VersionEnvelope<ArticleDNA>>();
  for (const versao of versoes) {
    const articleId = texto(versao?.payload?.articleId);
    if (!articleId) continue;
    if (brandId && versao.payload.brandId !== brandId) continue;
    const atual = escolhidas.get(articleId);
    if (!atual || versao.versionNumber > atual.versionNumber) escolhidas.set(articleId, versao);
  }
  return [...escolhidas.values()].map(versao => ({
    articleId: versao.payload.articleId,
    slug: ouNulo(versao.payload.publishedIdentityRef?.slug) || ouNulo(versao.payload.suggestedSlug),
  }));
}

/* ============================== o papel ============================== */

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * O papel vem do `pillarArticleId` primeiro: ele é a decisão do Pilar.
 * `articleRoles` e `articleReferences` descrevem o resto. Um papel "Pilar"
 * declarado para outro artigo, quando o Pilar já é outro, não cria dois
 * Pilares — vira Suporte.
 */
function papelNoSilo(silo: SiloDNA, articleId: string): string {
  if (silo.pillarArticleId && silo.pillarArticleId === articleId) return "Pilar";
  const declarado = texto(silo.articleRoles.find(item => item.articleId === articleId)?.role)
    || texto(silo.articleReferences.find(item => item.articleId === articleId)?.role);
  const chave = semAcento(declarado);
  if (!chave) return "Suporte";
  if (chave === "pilar" || chave === "pillar") return silo.pillarArticleId ? "Suporte" : "Pilar";
  if (chave === "suporte" || chave === "support") return "Suporte";
  if (chave === "reforco narrativo" || chave === "reforco_narrativo") return "Reforço narrativo";
  return declarado;
}

/* ============================ a SiloPage ============================ */

type PaginaDoSilo = { slug: string | null; canonical: string | null; publishedUrl: string | null; status: string };

const STATUS_DA_PAGINA: Record<string, string> = {
  published: "publicada",
  new: "nova, ainda não publicada",
};

const statusDaPagina = (valor: string | null): string =>
  valor ? STATUS_DA_PAGINA[valor] || valor : "não informado";

/**
 * A SiloPage mais recente do Arquiteto vence a foto da hidratação: a foto é de
 * quando o artigo entrou no Radar, e a página pode ter sido publicada depois.
 */
function paginaDoSilo(
  siloId: string,
  paginas: Map<string, VersionEnvelope<SiloPage>>,
  itens: readonly RadarSiloExportItem[],
): PaginaDoSilo | null {
  const versao = paginas.get(siloId);
  if (versao) {
    const pagina = versao.payload;
    return {
      slug: ouNulo(pagina.slug),
      canonical: ouNulo(pagina.canonical),
      publishedUrl: pagina.publicationStatus === "published" ? ouNulo(pagina.publishedUrl) : null,
      status: pagina.formationStatus === "draft" ? "rascunho" : statusDaPagina(pagina.publicationStatus),
    };
  }
  for (const item of itens) {
    const dica = item.siloPage;
    if (!dica || !(texto(dica.slug) || texto(dica.canonical) || texto(dica.publicationStatus))) continue;
    return {
      slug: ouNulo(dica.slug),
      canonical: ouNulo(dica.canonical),
      publishedUrl: null,
      status: statusDaPagina(ouNulo(dica.publicationStatus)),
    };
  }
  return null;
}

/* ======================== o contexto por linha ======================== */

/* Um SiloDNA pode trazer dezenas de tópicos do território. A célula precisa caber no Excel. */
const TETO_DE_TOPICOS = 40;

const cortar = (itens: readonly string[]) => {
  const limpos = unicos(itens);
  return { listados: limpos.slice(0, TETO_DE_TOPICOS), omitidos: Math.max(0, limpos.length - TETO_DE_TOPICOS) };
};

const NAO_DECLARADO = "não declarado no SiloDNA";

type Grupo = {
  siloId: string;
  label: string;
  name: string | null;
  /** O trecho do nome do arquivo: o nome limpo, ou "sem-nome-N". */
  nomeDeArquivo: string;
  silo: VersionEnvelope<SiloDNA>;
  membros: RadarSiloExportMember[];
  pagina: PaginaDoSilo | null;
  parcial: boolean;
  exportados: number;
};

function contextoDoSiloMarkdown(grupo: Grupo, membro: RadarSiloExportMember): string {
  const dna = grupo.silo.payload;
  const total = grupo.membros.length;
  const incluidos = cortar(dna.includedTopics);
  const excluidos = cortar(dna.excludedTopics);
  const porQue = ouNulo(dna.territoryNarrative?.statement);
  const campo = (valor: string) => texto(valor) || NAO_DECLARADO;

  const situacao = grupo.parcial
    ? `parcial — ${grupo.exportados} de ${total} artigos do silo estão neste arquivo; os demais aparecem na ordem abaixo com a situação de cada um.`
    : `completo — os ${total} artigos do silo estão neste arquivo.`;

  const listaDeTopicos = (titulo: string, corte: { listados: string[]; omitidos: number }) => corte.listados.length
    ? ["", `${titulo}:`, ...corte.listados.map(item => `- ${item}`), ...(corte.omitidos ? [`- (+${corte.omitidos} não listados aqui)`] : [])]
    : ["", `${titulo}: ${NAO_DECLARADO}.`];

  const ordem = grupo.membros.map(item => {
    const partes = [
      item.role,
      entreAspas(rotuloDoArtigo(item)),
      `keyword: ${item.principalKeyword || "não informada"}`,
      `slug: ${item.slug || "não informado"}`,
      `${item.statusLabel}, ${item.inThisFile ? "neste arquivo" : "fora deste arquivo"}`,
    ];
    const marca = item.articleId === membro.articleId ? " ← este artigo" : "";
    return `${item.position}. ${partes.join(" · ")}${marca}`;
  });

  const pagina = grupo.pagina
    ? [
      `Slug: ${grupo.pagina.slug || "não informado"}`,
      `Canonical: ${grupo.pagina.canonical || "não informado"}`,
      ...(grupo.pagina.publishedUrl ? [`URL publicada: ${grupo.pagina.publishedUrl}`] : []),
      `Status: ${grupo.pagina.status}`,
      "A SiloPage não tem dossiê do Radar: ela entra aqui só como contexto do silo, sem linha própria neste arquivo.",
    ]
    : ["Nenhuma SiloPage registrada para este silo no momento da exportação."];

  return [
    "# Contexto do silo",
    "",
    `Silo: ${grupo.label}`,
    `Este artigo: ${membro.position} de ${total} na ordem do silo · papel: ${membro.role}`,
    `Situação do silo neste arquivo: ${situacao}`,
    ...(dna.formationStatus === "draft" ? ["Estado do SiloDNA: rascunho — a composição ainda pode mudar no Arquiteto."] : []),
    `Entidade central: ${campo(dna.centralEntity)}`,
    `Objetivo: ${campo(dna.objective)}`,
    `Público: ${campo(dna.audience)}`,
    `Problema central: ${campo(dna.macroProblem)}`,
    `Intenção dominante: ${campo(dna.dominantIntent)}`,
    ...(porQue ? [`Por que estes artigos pertencem juntos: ${porQue}`] : []),
    ...listaDeTopicos("Tópicos incluídos", incluidos),
    ...listaDeTopicos("Tópicos excluídos — não cubra neste silo", excluidos),
    "",
    `Fronteira: ${campo(dna.boundary)}`,
    "",
    "## Ordem narrativa",
    "",
    ...ordem,
    "",
    "## SiloPage",
    "",
    ...pagina,
  ].join("\n").trim();
}

function contextoDoSiloJson(grupo: Grupo, membro: RadarSiloExportMember): string {
  const dna = grupo.silo.payload;
  const incluidos = cortar(dna.includedTopics);
  const excluidos = cortar(dna.excludedTopics);
  return JSON.stringify({
    silo: grupo.label,
    siloDnaStatus: dna.formationStatus === "draft" ? "rascunho" : "formado",
    complete: !grupo.parcial,
    inThisFile: grupo.exportados,
    total: grupo.membros.length,
    thisArticle: { position: membro.position, total: grupo.membros.length, role: membro.role },
    centralEntity: ouNulo(dna.centralEntity),
    objective: ouNulo(dna.objective),
    audience: ouNulo(dna.audience),
    centralProblem: ouNulo(dna.macroProblem),
    dominantIntent: ouNulo(dna.dominantIntent),
    whyTogether: ouNulo(dna.territoryNarrative?.statement),
    includedTopics: incluidos.listados,
    ...(incluidos.omitidos ? { includedTopicsOmitted: incluidos.omitidos } : {}),
    excludedTopics: excluidos.listados,
    ...(excluidos.omitidos ? { excludedTopicsOmitted: excluidos.omitidos } : {}),
    boundary: ouNulo(dna.boundary),
    members: grupo.membros.map(item => ({
      position: item.position,
      title: item.title,
      keyword: item.principalKeyword,
      slug: item.slug,
      role: item.role,
      status: item.statusLabel,
      inThisFile: item.inThisFile,
      thisArticle: item.articleId === membro.articleId,
    })),
    siloPage: grupo.pagina
      ? {
        slug: grupo.pagina.slug,
        canonical: grupo.pagina.canonical,
        publishedUrl: grupo.pagina.publishedUrl,
        status: grupo.pagina.status,
        radarDossier: false,
      }
      : null,
  });
}

type MotivoSemSilo = "sem_silo" | "silo_dna_ausente";

const MOTIVO_SEM_SILO: Record<MotivoSemSilo, string> = {
  sem_silo: "o artigo não tem silo registrado no Radar.",
  silo_dna_ausente: "o silo registrado para este artigo no Radar não tem SiloDNA disponível nesta marca; nome, ordem e artigos irmãos não puderam ser lidos.",
};

/* Ausência dita, não escondida: sem silo, quem escreve precisa saber que não há ordem nem irmãos. */
const contextoSemSilo = (motivo: MotivoSemSilo): RadarSiloExportRowContext => ({
  silo_context_md: [
    "# Contexto do silo",
    "",
    `Sem silo: ${MOTIVO_SEM_SILO[motivo]}`,
    "Escreva este artigo sem pressupor ordem narrativa, papel no silo nem artigos irmãos: nada disso foi resolvido.",
  ].join("\n"),
  silo_context_json: JSON.stringify({ silo: null, complete: null, reason: MOTIVO_SEM_SILO[motivo] }),
});

/* ============================== o plano ============================== */

/**
 * ===== O PLANO DO EXPORT POR SILO =====
 *
 * Recebe os itens do Radar e as versões do Arquiteto; devolve quais arquivos
 * sair, em que ordem ficam as linhas de cada um, o contexto do silo de cada
 * linha e os avisos. Não monta CSV: as linhas continuam sendo montadas pela
 * rota, pela mesma cadeia do dossiê avulso — este plano só as ordena, agrupa
 * e acrescenta as duas colunas do silo.
 */
export function planRadarSiloExport(input: RadarSiloExportInput): RadarSiloExportPlan {
  const brandId = ouNulo(input.brandId);
  const data = texto(input.today).slice(0, 10);
  const silos = maisRecentes(input.siloVersions, brandId);
  const paginas = maisRecentes(input.siloPageVersions || [], brandId);
  const descritores = new Map<string, RadarSiloExportMemberDescriptor>();
  for (const descritor of input.memberDescriptors || []) {
    const id = texto(descritor?.articleId);
    if (id && !descritores.has(id)) descritores.set(id, descritor);
  }

  /*
   * O MESMO ARTIGO PEDIDO DUAS VEZES É UM ARTIGO — e finalizado vence.
   * A SiloPage não é linha nem membro: ela entra pelo contexto.
   */
  const itens = new Map<string, RadarSiloExportItem>();
  for (const item of input.items) {
    const id = texto(item?.articleId);
    if (!id || texto(item.unitType) === "silo_page") continue;
    const atual = itens.get(id);
    if (!atual) { itens.set(id, item); continue; }
    if (atual.status !== "finalized" && item.status === "finalized") {
      itens.set(id, { ...item, siloId: texto(atual.siloId) || item.siloId });
    }
  }

  /* ---------------------------- agrupamento ---------------------------- */

  const ordemDosGrupos: string[] = [];
  const porSilo = new Map<string, RadarSiloExportItem[]>();
  const semSilo: Array<{ item: RadarSiloExportItem; motivo: MotivoSemSilo }> = [];
  const siloDoItem = new Map<string, string | null>();

  for (const [id, item] of itens) {
    const siloId = texto(item.siloId);
    if (!siloId) { semSilo.push({ item, motivo: "sem_silo" }); siloDoItem.set(id, null); continue; }
    if (!silos.has(siloId)) { semSilo.push({ item, motivo: "silo_dna_ausente" }); siloDoItem.set(id, null); continue; }
    siloDoItem.set(id, siloId);
    if (!porSilo.has(siloId)) { porSilo.set(siloId, []); ordemDosGrupos.push(siloId); }
    porSilo.get(siloId)!.push(item);
  }

  const descrever = (articleId: string) => {
    const item = itens.get(articleId);
    const descritor = descritores.get(articleId);
    return {
      title: ouNulo(item?.title) || ouNulo(descritor?.title),
      principalKeyword: ouNulo(item?.principalKeyword) || ouNulo(descritor?.principalKeyword),
      slug: ouNulo(item?.slug) || ouNulo(descritor?.slug),
    };
  };

  /* ------------------------------ os silos ------------------------------ */

  let semNome = 0;
  const grupos: Grupo[] = ordemDosGrupos.map(siloId => {
    const silo = silos.get(siloId)!;
    const dna = silo.payload;
    const doGrupo = porSilo.get(siloId)!;
    const idsDoGrupo = new Set(doGrupo.map(item => texto(item.articleId)));

    /* Pilar, depois a ordem narrativa, depois quem o SiloDNA lista e a ordem esqueceu. */
    const composicao = unicos([
      dna.pillarArticleId,
      ...dna.narrativeOrder,
      ...dna.supportArticleIds,
      ...dna.articleReferences.map(referencia => referencia.articleId),
    ]);
    const naComposicao = new Set(composicao);
    const foraDaComposicao = doGrupo.map(item => texto(item.articleId)).filter(id => !naComposicao.has(id));

    const membros: RadarSiloExportMember[] = [...composicao, ...foraDaComposicao].map((articleId, indice) => {
      const item = itens.get(articleId);
      const status: RadarSiloExportMemberStatus = idsDoGrupo.has(articleId)
        ? item!.status
        : item ? "other_silo" : "not_sent";
      return {
        articleId,
        position: indice + 1,
        ...descrever(articleId),
        role: naComposicao.has(articleId) ? papelNoSilo(dna, articleId) : "fora da composição do SiloDNA",
        status,
        statusLabel: RADAR_SILO_MEMBER_STATUS_LABEL[status],
        inSiloDna: naComposicao.has(articleId),
        inThisFile: status === "finalized" && idsDoGrupo.has(articleId),
        reason: idsDoGrupo.has(articleId) && item?.status === "not_finalized" ? ouNulo(item.reason) : null,
      };
    });

    /*
     * SEM NOME, OU NOME QUE LIMPA PARA VAZIO ("!!!", só emoji): o arquivo usa
     * "sem-nome-N", nunca o id. O rótulo só troca quando o nome falta de fato —
     * "!!!" continua sendo o nome que alguém deu ao silo.
     */
    const name = ouNulo(dna.name);
    const nomeLimpo = name ? radarSiloExportCleanName(name).replace(/-+$/, "") : "";
    const numeroSemNome = nomeLimpo ? null : ++semNome;
    const label = name || `Silo sem nome ${numeroSemNome}`;
    const exportados = membros.filter(membro => membro.inThisFile).length;
    return {
      siloId,
      label,
      name,
      nomeDeArquivo: nomeLimpo || `sem-nome-${numeroSemNome}`,
      silo,
      membros,
      pagina: paginaDoSilo(siloId, paginas, doGrupo),
      parcial: membros.some(membro => !membro.inThisFile),
      exportados,
    };
  });

  /* --------------------------- nomes de arquivo --------------------------- */

  /*
   * COLISÃO SEM DIFERENCIAR MAIÚSCULAS: dois silos "Skincare" e "skincare!"
   * limpam para o mesmo nome, e no Windows o segundo download ou a segunda
   * entrada do zip sobrescreveria o primeiro.
   */
  const usados = new Set<string>();
  const reservar = (base: string, sufixo: string): string => {
    for (let numero = 1; ; numero += 1) {
      const candidato = `${base}${numero === 1 ? "" : `-${numero}`}${sufixo}`;
      if (!usados.has(candidato.toLowerCase())) {
        usados.add(candidato.toLowerCase());
        return candidato;
      }
    }
  };

  const files: RadarSiloExportFile[] = [];
  const emptySilos: RadarSiloExportPlan["emptySilos"] = [];
  const contextByArticleId: Record<string, RadarSiloExportRowContext> = {};
  const warnings: string[] = [];

  for (const grupo of grupos) {
    const pendentes = grupo.membros.filter(membro => !membro.inThisFile);
    const avisos: string[] = [];

    if (!grupo.exportados) {
      emptySilos.push({ siloLabel: grupo.label, pending: pendentes });
      warnings.push(`Silo ${entreAspas(grupo.label)}: nenhum artigo finalizado; nada foi exportado dele.`);
      continue;
    }

    if (grupo.parcial) {
      const faltas = pendentes.map(membro => `${entreAspas(rotuloDoArtigo(membro))} (${membro.statusLabel})`).join(", ");
      avisos.push(`Silo ${entreAspas(grupo.label)} saiu parcial: ${grupo.exportados} de ${grupo.membros.length} artigos finalizados. Faltam: ${faltas}.`);
    }

    const fora = grupo.membros.filter(membro => !membro.inSiloDna);
    if (fora.length) {
      avisos.push(`Silo ${entreAspas(grupo.label)}: ${fora.map(membro => entreAspas(rotuloDoArtigo(membro))).join(", ")} está(ão) no silo pelo Radar, mas não constam da versão ${grupo.silo.versionNumber} do SiloDNA; saíram no fim da ordem.`);
    }

    /* A versão que o artigo viu na importação pode ser anterior à que dá o contexto. */
    const doSilo = input.siloVersions.filter(versao => texto(versao?.payload?.siloId) === grupo.siloId);
    const antigos = (porSilo.get(grupo.siloId) || []).filter(item =>
      texto(item.importedSiloDnaVersionId) && texto(item.importedSiloDnaVersionId) !== grupo.silo.versionId);
    if (antigos.length) {
      const rotulos = antigos.map(item => {
        const vista = doSilo.find(versao => versao.versionId === texto(item.importedSiloDnaVersionId));
        const descricao = vista ? `versão ${vista.versionNumber}` : "uma versão que não está mais disponível";
        return `${entreAspas(rotuloDoArtigo({ ...descrever(texto(item.articleId)) }))} (${descricao})`;
      });
      avisos.push(`Silo ${entreAspas(grupo.label)}: o contexto usa a versão ${grupo.silo.versionNumber} do SiloDNA, mais recente que a vista na importação de ${rotulos.join(", ")}.`);
    }

    /* O corte em 60 caracteres pode terminar em hífen; sem o recorte, o nome teria "--" antes da data. */
    const filename = reservar(`radar-silo-${grupo.nomeDeArquivo}`, `-${data}${grupo.parcial ? "-parcial" : ""}.csv`);

    const linhas = grupo.membros.filter(membro => membro.inThisFile);
    for (const membro of linhas) {
      contextByArticleId[membro.articleId] = {
        silo_context_md: contextoDoSiloMarkdown(grupo, membro),
        silo_context_json: contextoDoSiloJson(grupo, membro),
      };
    }

    files.push({
      filename,
      kind: "silo",
      siloLabel: grupo.label,
      siloName: grupo.name,
      partial: grupo.parcial,
      articleIds: linhas.map(membro => membro.articleId),
      exported: linhas.length,
      total: grupo.membros.length,
      pending: pendentes,
      warnings: avisos,
    });
    warnings.push(...avisos);
  }

  /* ------------------------------ sem silo ------------------------------ */

  if (semSilo.length) {
    const finalizados = semSilo.filter(entrada => entrada.item.status === "finalized");
    const pendentes: RadarSiloExportMember[] = semSilo
      .filter(entrada => entrada.item.status !== "finalized")
      .map((entrada, indice) => {
        const articleId = texto(entrada.item.articleId);
        return {
          articleId,
          position: indice + 1,
          ...descrever(articleId),
          role: "sem silo",
          status: "not_finalized" as const,
          statusLabel: RADAR_SILO_MEMBER_STATUS_LABEL.not_finalized,
          inSiloDna: false,
          inThisFile: false,
          reason: ouNulo(entrada.item.reason),
        };
      });

    const semDna = semSilo.filter(entrada => entrada.motivo === "silo_dna_ausente");
    const avisos: string[] = [];
    if (semDna.length) {
      avisos.push(`O SiloDNA do silo de ${semDna.map(entrada => entreAspas(rotuloDoArtigo(descrever(texto(entrada.item.articleId))))).join(", ")} não foi encontrado nesta marca; ${semDna.length === 1 ? "o artigo foi" : "os artigos foram"} para o arquivo sem silo.`);
    }

    if (finalizados.length) {
      const filename = reservar("radar-sem-silo", `-${data}.csv`);
      for (const entrada of finalizados) contextByArticleId[texto(entrada.item.articleId)] = contextoSemSilo(entrada.motivo);
      avisos.unshift(`${finalizados.length} artigo(s) sem silo resolvido saíram em ${filename}.`);
      files.push({
        filename,
        kind: "no_silo",
        siloLabel: "Sem silo",
        siloName: null,
        partial: false,
        articleIds: finalizados.map(entrada => texto(entrada.item.articleId)),
        exported: finalizados.length,
        total: semSilo.length,
        pending: pendentes,
        warnings: avisos,
      });
    } else {
      avisos.push(`${pendentes.length} artigo(s) sem silo resolvido não estão finalizados; nada foi exportado deles.`);
    }
    warnings.push(...avisos);
  }

  return {
    files,
    emptySilos,
    contextByArticleId,
    warnings,
    delivery: files.length === 0
      ? { kind: "none", filename: null }
      : files.length === 1
        ? { kind: "csv", filename: files[0].filename }
        : { kind: "zip", filename: radarSiloExportArchiveFilename(data) },
  };
}

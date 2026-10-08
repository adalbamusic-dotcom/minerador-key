import type { SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import { radarSiloExportCleanName } from "./portable-silo-export.ts";

/**
 * ===== A IMPORTAÇÃO DO RADAR AGRUPADA POR SILO — 2026-10-07 =====
 *
 * ==================== POR QUE AGRUPAR ====================
 *
 * O diálogo "Importar do Arquiteto" listava os ArticleDNAs aprovados como uma
 * lista plana: não dava para distinguir quais pertencem a um determinado silo,
 * nem para importar um silo inteiro e trabalhar no grupo. Este módulo resolve
 * o grupo de cada linha ANTES do diálogo, para que a importação por silo seja
 * a outra ponta do export por silo (`lib/radar/portable-silo-export.ts`): o
 * grupo que a pessoa importa aqui é o mesmo arquivo que ela exporta lá.
 *
 * ==================== A CHAVE DO GRUPO ====================
 *
 * Na importação ainda NÃO existe `RadarItem.siloId` (a chave do export): o
 * artigo não entrou no Radar. A chave aqui segue a MESMA precedência da
 * resolução real da importação (`resolveCanonicalSiloForArticle`,
 * `lib/arquiteto/radar-handoff-context.ts`), 2026-10-07: PRIMEIRO o `siloId`
 * DECLARADO no ArticleDNA, quando existe SiloDNA correspondente — é o
 * declarado que vira `RadarItem.siloId` depois, e portanto a chave do CSV;
 * sem declaração válida, o SiloDNA cuja COMPOSIÇÃO (pilar, suportes,
 * referências, ordem narrativa) contém o `articleId`; na falta, o SiloDNA do
 * mesmo `territoryRef` do ArticleDNA — composição vence território, porque
 * composição é decisão consolidada e território é proveniência. Sem nenhum
 * dos três, o grupo é "Sem silo", sempre por último: ausência dita, não
 * escondida.
 *
 * ==================== NOME E ORDEM ====================
 *
 * Mesmas regras do export por silo, replicadas porque lá elas são internas ao
 * `planRadarSiloExport` (não exportadas) e este módulo não pode reordenar
 * aquele contrato:
 * - mais de uma versão do MESMO silo → vale a de maior `versionNumber`
 *   (empate por `createdAt`), como `maisRecentes` faz no export;
 * - rótulo: o `name` do SiloDNA; sem nome, "Silo sem nome N" na ordem de
 *   chegada — NUNCA o id cru na tela (invariante 43 do export). Quem CONSOME
 *   um N é o mesmo silo que consome lá (`radarSiloExportCleanName` vazio
 *   também anda o contador), para o N daqui ser o N do arquivo;
 * - dentro do grupo: Pilar primeiro, depois a ordem narrativa, depois o resto
 *   na ordem de chegada — a MESMA leitura de composição do export.
 *
 * Os grupos saem em ordem alfabética do rótulo (pt-BR), "Sem silo" por último.
 * O diálogo não reordena nada: quem ordena é o chamador, por `orderedRowIds`.
 *
 * Domínio puro: sem fetch, sem storage, sem React.
 */

export type RadarImportSiloGroupRow = {
  /** O id da LINHA do diálogo (no Radar, o versionId do ArticleDNA aprovado). */
  id: string;
  articleId: string;
  /**
   * `ArticleDNA.siloId`, quando declarado — o PRIMEIRO critério (2026-10-07),
   * como em `resolveCanonicalSiloForArticle`: é o declarado que a importação
   * grava em `RadarItem.siloId`, a chave do CSV por silo. Aditivo e opcional:
   * sem ele, a resolução é a de antes (composição → território).
   */
  siloId?: string | null;
  /** `ArticleDNA.territoryRef`, quando existe — o desempate quando a composição não contém o artigo. */
  territoryRef?: string | null;
};

export type RadarImportSiloGroup = {
  /** O `siloId` do grupo, ou "sem-silo". Interno: nunca vai para a tela. */
  key: string;
  /** O rótulo visível: nome do silo, "Silo sem nome N" ou "Sem silo". */
  label: string;
  rowIds: string[];
};

export type RadarImportSiloGroupsInput = {
  rows: readonly RadarImportSiloGroupRow[];
  /** As versões conhecidas (a tela lê `pipeline.siloVersions`). */
  siloVersions: Readonly<Record<string, VersionEnvelope<SiloDNA>>>;
};

export type RadarImportSiloGroupsResult = {
  groups: RadarImportSiloGroup[];
  /** Todas as linhas, na ordem dos grupos — a ordem que o chamador aplica antes do diálogo. */
  orderedRowIds: string[];
};

/*
 * O rótulo do grupo sem silo — sempre o último, com a MESMA grafia do arquivo
 * do export ("Sem silo", portable-silo-export.ts): as duas pontas do fluxo
 * mostram o mesmo texto para o mesmo conceito. 2026-10-07.
 */
export const RADAR_IMPORT_NO_SILO_LABEL = "Sem silo";
const CHAVE_SEM_SILO = "sem-silo";

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/* Pilar, depois a ordem narrativa, depois quem o SiloDNA lista — a mesma leitura do export. */
function composicaoDoSilo(dna: SiloDNA): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const valor of [
    dna.pillarArticleId,
    ...(dna.narrativeOrder || []),
    ...(dna.supportArticleIds || []),
    ...(dna.articleReferences || []).map(referencia => referencia.articleId),
  ]) {
    const limpo = texto(valor);
    if (!limpo || vistos.has(limpo)) continue;
    vistos.add(limpo);
    saida.push(limpo);
  }
  return saida;
}

/* A mais recente por silo: maior versionNumber, empate por createdAt — como `maisRecentes` do export. */
const maisRecente = (a: VersionEnvelope<SiloDNA>, b: VersionEnvelope<SiloDNA>): VersionEnvelope<SiloDNA> =>
  b.versionNumber > a.versionNumber
    || (b.versionNumber === a.versionNumber && texto(b.createdAt) > texto(a.createdAt))
    ? b : a;

export function radarImportSiloGroups(input: RadarImportSiloGroupsInput): RadarImportSiloGroupsResult {
  /* ------------------- uma versão por silo, a mais recente ------------------- */
  const porSiloId = new Map<string, VersionEnvelope<SiloDNA>>();
  for (const versao of Object.values(input.siloVersions)) {
    const siloId = texto(versao?.payload?.siloId);
    if (!siloId) continue;
    const atual = porSiloId.get(siloId);
    porSiloId.set(siloId, atual ? maisRecente(atual, versao) : versao);
  }

  const composicoes = new Map<string, string[]>();
  for (const [siloId, versao] of porSiloId) composicoes.set(siloId, composicaoDoSilo(versao.payload));

  /* ------------------------- o silo de cada linha ------------------------- */
  const resolverPorComposicao = (articleId: string): string | null => {
    /*
     * Mais de um silo contendo o mesmo artigo não deveria existir; quando
     * existir, vale o SiloDNA mais recente — a mesma régua do desempate de
     * versões, para a escolha nunca depender da ordem do registro.
     */
    let escolhido: VersionEnvelope<SiloDNA> | null = null;
    for (const [siloId, composicao] of composicoes) {
      if (!composicao.includes(articleId)) continue;
      const versao = porSiloId.get(siloId)!;
      escolhido = escolhido ? maisRecente(escolhido, versao) : versao;
    }
    return escolhido ? texto(escolhido.payload.siloId) : null;
  };

  const resolverPorTerritorio = (territoryRef: string): string | null => {
    let escolhido: VersionEnvelope<SiloDNA> | null = null;
    for (const versao of porSiloId.values()) {
      if (texto(versao.payload.territoryRef) !== territoryRef) continue;
      escolhido = escolhido ? maisRecente(escolhido, versao) : versao;
    }
    return escolhido ? texto(escolhido.payload.siloId) : null;
  };

  const linhasDoGrupo = new Map<string, RadarImportSiloGroupRow[]>();
  const chegadaDosGrupos: string[] = [];
  for (const linha of input.rows) {
    const articleId = texto(linha.articleId);
    const territorio = texto(linha.territoryRef);
    /*
     * 2026-10-07 · O DECLARADO vem primeiro, como na resolução real: é ele que
     * vira `RadarItem.siloId` — agrupar pela composição aqui mostraria o
     * artigo num grupo diferente do arquivo que o CSV por silo entrega
     * depois. Declaração sem SiloDNA correspondente cai para os critérios
     * seguintes, exatamente como `resolveCanonicalSiloForArticle` faz.
     */
    const declarado = texto(linha.siloId);
    const siloId = (declarado && porSiloId.has(declarado) ? declarado : null)
      || (articleId && resolverPorComposicao(articleId))
      || (territorio && resolverPorTerritorio(territorio))
      || CHAVE_SEM_SILO;
    if (!linhasDoGrupo.has(siloId)) { linhasDoGrupo.set(siloId, []); chegadaDosGrupos.push(siloId); }
    linhasDoGrupo.get(siloId)!.push(linha);
  }

  /* ------------------------------ os rótulos ------------------------------ */
  /*
   * "Silo sem nome N" numera na ordem de chegada, como o export numera na
   * ordem dos grupos. 2026-10-07 · Quem CONSOME um N é o MESMO silo que
   * consome lá (`numeroSemNome` em portable-silo-export.ts): nome ausente OU
   * nome que LIMPA para vazio ("!!!", só emoji) — neste último o rótulo
   * continua sendo o name que alguém deu, mas o contador anda; sem isso, o
   * dono importava "Silo sem nome 1" e o CSV entregava "Silo sem nome 2"
   * para o mesmo silo.
   */
  let semNome = 0;
  const rotulos = new Map<string, string>();
  for (const siloId of chegadaDosGrupos) {
    if (siloId === CHAVE_SEM_SILO) { rotulos.set(siloId, RADAR_IMPORT_NO_SILO_LABEL); continue; }
    const name = texto(porSiloId.get(siloId)?.payload.name);
    const nomeLimpo = name ? radarSiloExportCleanName(name).replace(/-+$/, "") : "";
    const numeroSemNome = nomeLimpo ? null : ++semNome;
    rotulos.set(siloId, name || `Silo sem nome ${numeroSemNome}`);
  }

  /* ------------------------ a ordem dentro do grupo ------------------------ */
  const ordenarLinhas = (siloId: string, linhas: RadarImportSiloGroupRow[]): RadarImportSiloGroupRow[] => {
    const composicao = composicoes.get(siloId);
    if (!composicao) return linhas;
    const posicao = new Map(composicao.map((articleId, indice) => [articleId, indice]));
    /* Ordenação estável por posição na composição; quem não está nela fica depois, na ordem de chegada. */
    return linhas
      .map((linha, chegada) => ({ linha, chegada, posicao: posicao.get(texto(linha.articleId)) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.posicao - b.posicao || a.chegada - b.chegada)
      .map(entrada => entrada.linha);
  };

  /* --------------------- a ordem dos grupos e a saída --------------------- */
  const groups: RadarImportSiloGroup[] = chegadaDosGrupos
    .map(siloId => ({
      key: siloId,
      label: rotulos.get(siloId)!,
      rowIds: ordenarLinhas(siloId, linhasDoGrupo.get(siloId)!).map(linha => linha.id),
    }))
    .sort((a, b) => {
      if (a.key === CHAVE_SEM_SILO) return 1;
      if (b.key === CHAVE_SEM_SILO) return -1;
      /* Empate de rótulo desempata pela chave: a ordem nunca depende da ordem do registro. */
      return a.label.localeCompare(b.label, "pt-BR") || a.key.localeCompare(b.key, "pt-BR");
    });

  return { groups, orderedRowIds: groups.flatMap(grupo => grupo.rowIds) };
}

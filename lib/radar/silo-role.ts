/**
 * 2026-10-08 · O PAPEL NO SILO, LIDO DE QUEM DECIDIU — uma régua só no Radar.
 *
 * ==================== O DEFEITO QUE ISTO FECHA ====================
 *
 * O dono abriu o Silo "Leads sem Tráfego Pago": no Arquiteto, "leads
 * qualificados" é o PILAR; no Radar, os oito artigos eram "Suporte". O Radar
 * lia `RadarItem.hierarchy`, cópia de `ArticleDNA.hierarchy` — e esse campo é
 * a SUGESTÃO da formação, gravada antes de o Silo existir (hoje todo caminho de
 * formação grava "Suporte" fixo). A decisão do Pilar é da fase Silos e mora no
 * SiloDNA (`pillarArticleId`, `supportArticleIds`, `narrativeOrder`). O
 * Arquiteto lê de lá (`resolveSiloHierarchyView`, LINK_HIERARCHY_AUTHORITY =
 * SILODNA); o Radar passa a ler do mesmo lugar.
 *
 * ==================== A ORDEM DAS FONTES ====================
 *
 *   1. o SiloDNA vigente do Silo do item (formado, mesma marca, mesmo Silo,
 *      com Pilar declarado) — é a decisão;
 *   2. a foto do envio, `hydration.silo.articleRole` — o SiloDNA no momento
 *      em que o Arquiteto mandou o artigo ao Radar;
 *   3. a sugestão da formação (`ArticleDNA.hierarchy`) — só quando o Silo não
 *      decidiu, e dita como formação, nunca como decisão.
 *
 * O Radar não escreve papel em lugar nenhum: nada daqui volta ao ArticleDNA,
 * ao SiloDNA nem ao grafo. Divergência entre a foto do envio e o SiloDNA
 * vigente é aviso; quem muda papel é o Arquiteto.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */

import { resolveSiloHierarchyView } from "../arquiteto/internal-link-projection.ts";

/** O SiloDNA como o Radar o recebe — estrutural, para aceitar payload inteiro ou parcial. */
export type RadarSiloDnaRoleSource = {
  siloId?: string | null;
  brandId?: string | null;
  formationStatus?: string | null;
  pillarArticleId?: string | null;
  supportArticleIds?: readonly string[] | null;
  articleReferences?: ReadonlyArray<{ articleId: string; role?: string | null }> | null;
  articleRoles?: ReadonlyArray<{ articleId: string; role?: string | null }> | null;
  narrativeOrder?: readonly string[] | null;
};

export type RadarSiloDnaVersionRoleSource = {
  versionId?: string | null;
  versionNumber?: number | null;
  payload: RadarSiloDnaRoleSource;
};

/*
 * 2026-10-08 (revisão) · `FORA_DA_COMPOSICAO`: o SiloDNA vigente decidiu o
 * Pilar e este artigo não está mais na composição dele. Não é papel nenhum —
 * nem a foto do envio nem a formação respondem por cima dessa decisão.
 */
export type RadarSiloRoleSource = "SILO_DNA" | "FORA_DA_COMPOSICAO" | "HIDRATACAO" | "FORMACAO" | "UNIDADE" | "NENHUMA";

export type RadarArticleSiloRole = {
  /** "Pilar" | "Suporte" | "Reforço narrativo" | "Sem papel declarado" | "SiloPage" | texto declarado | null. */
  role: string | null;
  /** O que as telas e os entregáveis mostram. A sugestão da formação vem marcada como tal. */
  label: string;
  source: RadarSiloRoleSource;
  /** Veio de uma decisão do Silo (SiloDNA vigente ou foto do envio), e não de sugestão. */
  decided: boolean;
  isPillar: boolean;
  isSupport: boolean;
  /** 1..n entre os Suportes, pela `narrativeOrder` do SiloDNA vigente. */
  supportPosition: number | null;
  pillarArticleId: string | null;
  /** A versão do SiloDNA que respondeu (vigente ou a do envio). */
  siloDnaVersionId: string | null;
  /** A versão do SiloDNA que o envio viu. */
  snapshotSiloDnaVersionId: string | null;
  /** O SiloDNA vigente é outro que o do envio: a foto ficou para trás. */
  staleSnapshot: boolean;
  /** A sugestão da formação (`ArticleDNA.hierarchy`), só informativa. */
  formationHint: string | null;
  /** Uma frase para o perfil: de onde veio, e o que diverge. */
  note: string | null;
};

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;

const chave = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s_-]+/g, " ").trim();

const PAPEIS: Record<string, string> = {
  pillar: "Pilar",
  pilar: "Pilar",
  support: "Suporte",
  suporte: "Suporte",
  "reforco narrativo": "Reforço narrativo",
  silopage: "SiloPage",
  "silo page": "SiloPage",
};

/** "pillar" → "Pilar", "SUPORTE" → "Suporte", "Reforco Narrativo" → "Reforço narrativo"; o resto como veio. */
export function radarSiloRoleText(valor: string | null | undefined): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  return PAPEIS[chave(bruto)] || bruto;
}

/* O rótulo da formação vem marcado ("Suporte (formação)"): a pergunta "é Suporte?" lê o papel sem a marca. */
const semMarca = (valor: string | null | undefined) => (valor || "").replace(/\s*\([^)]*\)\s*$/, "");
export const radarSiloRoleIsPillar = (valor: string | null | undefined): boolean => radarSiloRoleText(semMarca(valor)) === "Pilar";
export const radarSiloRoleIsSupport = (valor: string | null | undefined): boolean => radarSiloRoleText(semMarca(valor)) === "Suporte";

/** O que cada papel pede da planta — o mesmo texto do CSV "Para escrever". */
export const RADAR_SILO_ROLE_ASKS: Readonly<Record<string, string>> = {
  Pilar: "cobre o tema com amplitude e aprofunda por links para os suportes",
  Suporte: "aprofunda um recorte do tema e devolve o leitor ao Pilar",
  "Reforço narrativo": "sustenta a narrativa do Silo sem disputar a keyword do Pilar",
};

/** O SiloDNA decidiu a hierarquia? Rascunho não decide, e Silo sem Pilar também não. */
export const radarSiloDnaDecidedHierarchy = (silo: RadarSiloDnaRoleSource | null | undefined): boolean =>
  Boolean(silo && silo.formationStatus !== "draft" && texto(silo.pillarArticleId));

/**
 * O SiloDNA vigente de um Silo: o formado de maior versão, da marca. Rascunho
 * não responde por decisão nenhuma, e versão de outra marca não empresta papel.
 */
export function radarCurrentSiloDna<T extends RadarSiloDnaVersionRoleSource>(
  versoes: readonly T[] | Readonly<Record<string, T>> | null | undefined,
  siloId: string | null | undefined,
  brandId?: string | null,
): T | null {
  const alvo = texto(siloId);
  if (!alvo || !versoes) return null;
  const lista: readonly T[] = Array.isArray(versoes) ? versoes : Object.values(versoes as Record<string, T>);
  let melhor: T | null = null;
  for (const versao of lista) {
    const payload = versao?.payload;
    if (!payload || texto(payload.siloId) !== alvo) continue;
    if (payload.formationStatus === "draft") continue;
    if (brandId && texto(payload.brandId) && texto(payload.brandId) !== brandId) continue;
    if (!melhor || (versao.versionNumber ?? 0) > (melhor.versionNumber ?? 0)) melhor = versao;
  }
  return melhor;
}

/** O papel declarado nas listas legadas do SiloDNA (`articleRoles`, depois `articleReferences`). */
function papelDeclarado(silo: RadarSiloDnaRoleSource, articleId: string): string | null {
  return texto(silo.articleRoles?.find(item => item.articleId === articleId)?.role)
    || texto(silo.articleReferences?.find(item => item.articleId === articleId)?.role);
}

/** O artigo está na composição deste SiloDNA? */
export function radarSiloDnaHasArticle(silo: RadarSiloDnaRoleSource, articleId: string): boolean {
  return texto(silo.pillarArticleId) === articleId
    || Boolean(silo.supportArticleIds?.includes(articleId))
    || Boolean(silo.articleReferences?.some(item => item.articleId === articleId));
}

type PapelDoSilo = { role: string; isPillar: boolean; isSupport: boolean; supportPosition: number | null; pillarArticleId: string };

/**
 * A DECISÃO do SiloDNA para um artigo, pela régua do Arquiteto
 * (`resolveSiloHierarchyView`): Pilar, Suporte, ou da composição sem papel.
 * `null` quando o Silo não decidiu (rascunho, sem Pilar) ou o artigo não é dele.
 */
function papelDecididoNoSilo(silo: RadarSiloDnaRoleSource, articleId: string): PapelDoSilo | null {
  if (!radarSiloDnaDecidedHierarchy(silo) || !radarSiloDnaHasArticle(silo, articleId)) return null;
  const vista = resolveSiloHierarchyView({
    siloDna: {
      siloId: texto(silo.siloId) || "",
      pillarArticleId: silo.pillarArticleId ?? null,
      supportArticleIds: silo.supportArticleIds || [],
      articleReferences: silo.articleReferences || [],
      narrativeOrder: silo.narrativeOrder || [],
    },
    siloPage: null,
    articleIdentity: new Map(),
  });
  const pilar = texto(silo.pillarArticleId)!;
  const papel = vista.roleByArticleId.get(articleId);
  if (papel === "PILAR") return { role: "Pilar", isPillar: true, isSupport: false, supportPosition: null, pillarArticleId: pilar };
  if (papel === "SUPORTE") {
    const suportes = new Set(vista.supports.filter(item => item.role === "SUPORTE").map(item => item.id));
    const naOrdem = [...vista.narrativeOrder.filter(id => suportes.has(id)), ...[...suportes].filter(id => !vista.narrativeOrder.includes(id))];
    const indice = naOrdem.indexOf(articleId);
    return { role: "Suporte", isPillar: false, isSupport: true, supportPosition: indice >= 0 ? indice + 1 : null, pillarArticleId: pilar };
  }
  /* Da composição, sem papel: o legado só serve se diz Reforço narrativo (Pilar já é outro). */
  const declarado = radarSiloRoleText(papelDeclarado(silo, articleId));
  return {
    role: declarado === "Reforço narrativo" ? declarado : "Sem papel declarado",
    isPillar: false, isSupport: false, supportPosition: null, pillarArticleId: pilar,
  };
}

const ROTULO_SEM_DECISAO = "Papel não decidido no Silo";

/**
 * O papel que o SiloDNA dá a um artigo da composição — a regra que o export
 * por Silo usa para a ordem narrativa. Com Pilar decidido, é a decisão; sem
 * Pilar, é o papel declarado nas listas legadas (que vêm da formação).
 */
export function radarSiloDnaRoleOf(silo: RadarSiloDnaRoleSource, articleId: string): string {
  /* Descreve ESTE SiloDNA como ele está, inclusive rascunho: é a composição que o arquivo do Silo mostra. */
  const comoEsta = { ...silo, formationStatus: null };
  const decidido = papelDecididoNoSilo(comoEsta, articleId);
  if (decidido) return decidido.role;
  const declarado = radarSiloRoleText(papelDeclarado(silo, articleId));
  /*
   * 2026-10-08 (revisão) · SILO SEM PILAR NÃO DECIDIU PAPEL NENHUM.
   *
   * Sem `pillarArticleId`, as listas legadas (`articleRoles`) são cópia de
   * `ArticleDNA.hierarchy` — a sugestão da formação. O plano por Silo dizia
   * "Suporte" sem marca, e o CSV "Para escrever" e o artigo-modelo, que
   * preferem o papel do plano, entregavam "devolve o leitor ao Pilar" num Silo
   * sem Pilar. Agora o papel sai com o MESMO rótulo da régua: "(formação)", ou
   * "Papel não decidido no Silo" quando nem a formação declara.
   */
  if (!radarSiloDnaDecidedHierarchy(comoEsta)) return declarado ? `${declarado} (formação)` : ROTULO_SEM_DECISAO;
  return declarado || "Suporte";
}

/**
 * 2026-10-08 · A COLUNA "FORMATO" NÃO É PAPEL.
 *
 * A importação grava `RadarItem.format = ArticleDNA.hierarchy` (a sugestão da
 * formação): a coluna Formato mostrava "Suporte" para todo artigo, e o filtro
 * filtrava pelo papel errado. Hierarquia não é formato (spec do Radar). Sem
 * decisão do dono sobre o que a coluna deve mostrar, ela para de mostrar o
 * papel: a unidade (Artigo / SiloPage) no lugar dele. O campo gravado não muda.
 */
export function radarUnitFormatLabel(row: { unitType?: string | null; format?: string | null }): string {
  if (row.unitType === "silo_page" || texto(row.format) === "silo_page") return "SiloPage";
  const formato = texto(row.format);
  if (!formato) return "Artigo";
  const comoPapel = radarSiloRoleText(formato);
  return comoPapel === "Pilar" || comoPapel === "Suporte" || comoPapel === "Reforço narrativo" ? "Artigo" : formato;
}

/**
 * 2026-10-08 (revisão) · O FILTRO "FORMATO" GUARDADO COM O VALOR DE ANTES.
 *
 * A coluna Formato mostrava o papel copiado ("Suporte", "Pilar"); agora mostra
 * a unidade ("Artigo", "SiloPage"). A última vista da planilha é reaplicada
 * do navegador, e o filtro guardado com um papel escondia TODAS as linhas — com
 * o seletor mostrando "Formato: Todos", porque nenhuma opção casava. Papel
 * nunca é valor desta coluna: o filtro com papel é de antes e é descartado.
 */
export function radarFormatFilterIsLegacyRole(valor: string | null | undefined): boolean {
  const papel = radarSiloRoleText(valor);
  return papel === "Pilar" || papel === "Suporte" || papel === "Reforço narrativo";
}

/** O rótulo, ou `null` quando nenhuma fonte declara papel — para campo que já aceitava ausência. */
export const radarSiloRoleLabelOrNull = (papel: RadarArticleSiloRole): string | null =>
  papel.source === "NENHUMA" ? null : papel.label;

/**
 * A RÉGUA. Lê, nesta ordem, o SiloDNA vigente, a foto do envio e a sugestão
 * da formação — e diz de qual delas a resposta saiu.
 */
export function radarArticleSiloRole(input: {
  articleId: string;
  brandId?: string | null;
  /** `RadarItem.siloId`: o SiloDNA de outro Silo não responde por este item. */
  siloId?: string | null;
  unitType?: string | null;
  /** O SiloDNA vigente (envelope). `null` quando a tela/rota não o tem. */
  siloDna?: RadarSiloDnaVersionRoleSource | null;
  /** `RadarItem.hydration.silo`: a foto do SiloDNA no envio. */
  hydrationSilo?: { id?: string | null; siloDnaVersionId?: string | null; articleRole?: string | null } | null;
  /** `ArticleDNA.hierarchy` (ou `RadarItem.hierarchy`): sugestão da formação. */
  formationHint?: string | null;
}): RadarArticleSiloRole {
  const articleId = texto(input.articleId) || "";
  const formacao = radarSiloRoleText(input.formationHint);
  const foto = input.hydrationSilo || null;
  const fotoVersao = texto(foto?.siloDnaVersionId);
  const base = {
    pillarArticleId: null as string | null,
    supportPosition: null as number | null,
    snapshotSiloDnaVersionId: fotoVersao,
    staleSnapshot: false,
    formationHint: formacao,
  };

  /* A SiloPage é a raiz do Silo: o papel dela é a própria unidade. */
  if (input.unitType === "silo_page" || formacao === "SiloPage") {
    return { ...base, role: "SiloPage", label: "SiloPage", source: "UNIDADE", decided: true, isPillar: false, isSupport: false, siloDnaVersionId: null, note: null };
  }

  /* 1 · o SiloDNA vigente, quando é do Silo deste item e da mesma marca. */
  const versao = input.siloDna || null;
  const payload = versao?.payload || null;
  const doSilo = payload
    && (!texto(input.siloId) || texto(payload.siloId) === texto(input.siloId))
    && (!input.brandId || !texto(payload.brandId) || texto(payload.brandId) === input.brandId);
  const decidido = doSilo && payload ? papelDecididoNoSilo(payload, articleId) : null;
  if (decidido && payload) {
    const vigente = texto(versao?.versionId);
    const stale = Boolean(vigente && fotoVersao && vigente !== fotoVersao);
    const daFoto = radarSiloRoleText(foto?.articleRole);
    const avisos = [
      `Decidido no SiloDNA${versao?.versionNumber ? ` v${versao.versionNumber}` : ""} (fase Silos do Arquiteto).`,
      ...(formacao && formacao !== decidido.role ? [`A formação sugeria ${formacao}; a sugestão não é decisão.`] : []),
      ...(stale ? ["O SiloDNA mudou depois do envio ao Radar: a foto do envio ficou para trás."] : []),
      ...(!stale && daFoto && daFoto !== decidido.role ? [`A foto do envio dizia ${daFoto}.`] : []),
    ];
    return {
      ...base,
      role: decidido.role,
      label: decidido.role,
      source: "SILO_DNA",
      decided: true,
      isPillar: decidido.isPillar,
      isSupport: decidido.isSupport,
      supportPosition: decidido.supportPosition,
      pillarArticleId: decidido.pillarArticleId,
      siloDnaVersionId: vigente,
      staleSnapshot: stale,
      note: avisos.join(" "),
    };
  }

  /*
   * 2026-10-08 (revisão) · 1b · O SILODNA VIGENTE DECIDIU, E ESTE ARTIGO SAIU.
   *
   * O Pilar está decidido no vigente e o artigo não está mais na composição
   * dele. A foto do envio (que podia dizer "pillar") e a formação NÃO
   * respondem por cima dessa decisão: seria um segundo Pilar no mesmo Silo,
   * na tela, no CSV e no contexto KGR. Não é papel nenhum — resolve-se no
   * Arquiteto. O Pilar do Silo continua dito (`pillarArticleId`): é outro.
   */
  if (doSilo && payload && radarSiloDnaDecidedHierarchy(payload) && !radarSiloDnaHasArticle(payload, articleId)) {
    const vigente = texto(versao?.versionId);
    const daFotoAntiga = radarSiloRoleText(foto?.articleRole);
    return {
      ...base,
      role: null,
      label: "Fora da composição do SiloDNA vigente",
      source: "FORA_DA_COMPOSICAO",
      decided: false,
      isPillar: false,
      isSupport: false,
      pillarArticleId: texto(payload.pillarArticleId),
      siloDnaVersionId: vigente,
      staleSnapshot: Boolean(vigente && fotoVersao && vigente !== fotoVersao),
      note: [
        `O SiloDNA vigente${versao?.versionNumber ? ` (v${versao.versionNumber})` : ""} não tem este artigo na composição.`,
        ...(daFotoAntiga ? [`A foto do envio dizia ${daFotoAntiga}; ela ficou para trás.`] : []),
        "Resolva no Arquiteto: o Radar não escolhe papel.",
      ].join(" "),
    };
  }

  /*
   * 2 · a foto do envio. Ela vale quando não há SiloDNA vigente em mãos; com
   * SiloDNA vigente SEM Pilar, a foto ("support" para todos, porque o envio
   * é binário) não é decisão nenhuma, e quem responde é a formação.
   */
  const semPilarNoVigente = Boolean(doSilo && payload && !radarSiloDnaDecidedHierarchy(payload) && payload.formationStatus !== "draft");
  const daFoto = radarSiloRoleText(foto?.articleRole);
  if (daFoto && !semPilarNoVigente) {
    const vigente = doSilo ? texto(versao?.versionId) : null;
    const stale = Boolean(vigente && fotoVersao && vigente !== fotoVersao);
    /*
     * 2026-10-08 (revisão) · A FOTO "SUPPORT" NÃO CONFIRMA DECISÃO.
     *
     * O envio grava "pillar" só para o `pillarArticleId` e "support" para todo
     * o resto — inclusive quando o SiloDNA do envio ainda não tinha Pilar. Sem
     * o SiloDNA vigente para confirmar, o "Pilar" da foto é decisão; o
     * "Suporte" não: o rótulo continua, mas a linha Função fica pendente e diz
     * para confirmar no Arquiteto.
     */
    const confirmada = daFoto !== "Suporte";
    return {
      ...base,
      role: daFoto,
      label: daFoto,
      source: "HIDRATACAO",
      decided: confirmada,
      isPillar: daFoto === "Pilar",
      isSupport: daFoto === "Suporte",
      siloDnaVersionId: fotoVersao,
      staleSnapshot: stale,
      note: [
        "Papel do SiloDNA no envio ao Radar.",
        ...(!confirmada ? ["O envio diz Suporte também quando o Silo ainda não tinha Pilar: confirme no Arquiteto."] : []),
        ...(formacao && formacao !== daFoto ? [`A formação sugeria ${formacao}; a sugestão não é decisão.`] : []),
      ].join(" "),
    };
  }

  /* 3 · a sugestão da formação — dita como tal. */
  if (formacao) {
    return {
      ...base,
      role: formacao,
      label: `${formacao} (formação)`,
      source: "FORMACAO",
      decided: false,
      isPillar: formacao === "Pilar",
      isSupport: formacao === "Suporte",
      siloDnaVersionId: null,
      note: "O Silo ainda não decidiu o papel deste artigo: o valor é a sugestão da formação (ArticleDNA), não a decisão da fase Silos.",
    };
  }

  return {
    ...base,
    role: null,
    label: ROTULO_SEM_DECISAO,
    source: "NENHUMA",
    decided: false,
    isPillar: false,
    isSupport: false,
    siloDnaVersionId: null,
    note: "Nem o SiloDNA, nem o envio, nem a formação declaram o papel deste artigo.",
  };
}

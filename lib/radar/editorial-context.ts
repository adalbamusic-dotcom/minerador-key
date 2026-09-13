/**
 * O CONTEXTO EDITORIAL QUE A INVESTIGAÇÃO RECEBEU — e de quem é cada buraco.
 *
 * Duas coisas diferentes apareciam com a mesma cara na tela: a linha antiga,
 * importada antes do transporte atual existir, e a linha nova cujo Arquiteto
 * realmente não declarou tópicos nem perguntas. As duas liam
 * "CONTEXTO EDITORIAL INCOMPLETO" e ninguém sabia qual delas tinha conserto.
 *
 * Pior: o RadarItem já carregava referências de KeywordDNA, contexto de
 * estratégia, proveniência da SERP de formação e o grafo de links internos —
 * e a tela lia só o ArticleDNA. O buraco era de projeção, não de transporte.
 *
 * Este módulo separa as três perguntas:
 *
 *   1. a origem entregou?      (ArticleDNA aprovado no Arquiteto)
 *   2. o transporte preservou? (RadarItem + hydration)
 *   3. a tela projetou?        (os campos abaixo)
 *
 * Nada é preenchido por inferência: ausência continua ausência, e ganha um
 * dono. O Radar não edita identidade — quando o dono é o Arquiteto, o texto
 * diz isso em vez de oferecer um campo.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

import type { ArticleDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { RadarItem } from "../editorial/operational-flow.ts";

/**
 * De quem é a ausência.
 *
 * `SERVER_DISCARDED` existe no vocabulário mas NÃO é emitido aqui: provar que
 * um campo entrou na importação e sumiu depois do round-trip remoto exige
 * comparar o payload gravado com o payload importado, o que é leitura de
 * banco, não de contrato. Ele fica declarado para o dia em que essa leitura
 * existir — inventá-lo por dedução seria exatamente o que este módulo recusa.
 */
export type RadarEditorialFieldClass =
  | "AVAILABLE"
  | "LEGACY_SOURCE_MISSING"
  | "HANDOFF_DROPPED"
  | "SERVER_DISCARDED"
  | "HYDRATION_DROPPED"
  | "UI_NOT_RENDERED";

export type RadarEditorialFieldOwner = "ARQUITETO" | "SHARED_TRANSPORT" | "RADAR" | null;

export type RadarEditorialContextField = {
  key: string;
  label: string;
  /** O valor projetado na tela. `null` quando não chegou a lugar nenhum. */
  value: string | null;
  /** Onde o valor foi encontrado — a primeira fonte que o tinha. */
  source: "ARQUITETO" | "RADAR_ITEM" | "HYDRATION" | "NONE";
  classification: RadarEditorialFieldClass;
  owner: RadarEditorialFieldOwner;
  detail: string;
};

/**
 * A classe da LINHA, que é a pergunta que o smoke levantou.
 *
 * `LEGACY_INCOMPLETE` = entrou antes do transporte atual; as ausências vêm da
 * origem e não têm conserto nesta tela. `CURRENT_INCOMPLETE` = o transporte
 * atual funcionou e mesmo assim faltam campos — aí o Arquiteto tem trabalho a
 * fazer neste artigo.
 */
export type RadarEditorialContextClass = "NOT_LOADED" | "LEGACY_INCOMPLETE" | "CURRENT_INCOMPLETE" | "CURRENT_COMPLETE";

export type RadarEditorialContext = {
  state: RadarEditorialContextClass;
  headline: string;
  summary: string;
  fields: RadarEditorialContextField[];
  missing: string[];
  /** O que a investigação deixa de conseguir fazer. Uma frase por lacuna. */
  consequences: string[];
  /** Donos distintos das ausências, para o relatório e para a tela. */
  owners: RadarEditorialFieldOwner[];
  resolution: string;
};

/** A principal chega hidratada, ou chega como identificador técnico. */
export function radarPrincipalHydrated(keyword: string | null | undefined): boolean {
  const valor = (keyword || "").trim();
  if (!valor) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) return false;
  if (/^(kw|keyword|kwdna|pub-k)[-:]/i.test(valor)) return false;
  return !/^n(ã|a)o hidratada$/i.test(valor);
}

const texto = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const lista = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
const listaTexto = (value: unknown, sufixo = ""): string | null => {
  const itens = lista(value);
  return itens.length ? itens.join(" · ") + sufixo : null;
};

/**
 * A linha entrou pelo transporte atual?
 *
 * Os três blocos abaixo são `.optional()` no `RadarItemSchema` justamente
 * porque linha antiga não os tem. A ausência dos três junta é a assinatura do
 * import legado — e é o que separa "não conserta aqui" de "o Arquiteto deste
 * artigo ficou pela metade".
 */
export function radarRowIsLegacy(item: RadarItem | null): boolean {
  if (!item) return true;
  return !item.hydration || item.arquitetoKeywordDnaReferences === undefined || item.arquitetoStrategyContext === undefined;
}

type Definicao = {
  key: string;
  label: string;
  /** O valor como o ArticleDNA aprovado no Arquiteto o declara. */
  arquiteto: () => string | null;
  /** O valor como o RadarItem o transporta. */
  transporte: () => string | null;
  /** O valor como a hidratação o resolveu. */
  hidratado: () => string | null;
  /** O importador copia este campo? Se copia, ausência aqui é queda de transporte. */
  transportado: boolean;
  /** A hidratação tinha o que resolver e não resolveu? Então a queda é dela. */
  quedaDeHidratacao?: () => boolean;
  consequencia: string;
};

const CONSEQUENCIA_PADRAO = "Sem este campo, a investigação segue sem a contraparte editorial correspondente.";

export function buildRadarEditorialContext(input: {
  item: RadarItem | null;
  article: VersionEnvelope<ArticleDNA> | null;
  keyword: string | null | undefined;
}): RadarEditorialContext {
  const resolution = "O contexto editorial pertence ao Arquiteto. Complete o ArticleDNA lá e reimporte esta linha; o Radar não edita identidade.";

  if (!input.article && !input.item) {
    return {
      state: "NOT_LOADED",
      headline: "CONTEXTO EDITORIAL NÃO CARREGADO",
      summary: "Nem o ArticleDNA nem a linha do Radar estão disponíveis nesta leitura.",
      fields: [],
      missing: ["ArticleDNA"],
      consequences: ["Sem o ArticleDNA desta versão, nada do que a SERP mostra pode ser confrontado com o que o artigo promete cobrir."],
      owners: ["SHARED_TRANSPORT"],
      resolution,
    };
  }

  const item = input.item;
  const dna = (input.article?.payload || null) as (ArticleDNA & Record<string, unknown>) | null;
  const hydration = item?.hydration || null;
  const strategy = item?.arquitetoStrategyContext || null;
  const silo = hydration?.silo || null;
  const legado = radarRowIsLegacy(item);

  const principalTexto = radarPrincipalHydrated(input.keyword) ? String(input.keyword).trim() : null;
  const principalHidratado = texto(hydration?.principalKeyword?.keyword);
  const principalTransportado = texto(strategy?.primaryKeyword?.keyword) || texto(strategy?.primaryKeyword?.text);

  const referenciasDna = Array.isArray(dna?.keywordReferences) ? dna!.keywordReferences.length : 0;
  const referenciasItem = item?.arquitetoKeywordDnaReferences?.length || 0;
  const snapshots = hydration?.keywordSnapshots || [];
  const papel = (role: string) => snapshots.filter(snapshot => snapshot.role === role).map(snapshot => snapshot.keyword);
  /* A hidratação existe e não resolveu o que tinha para resolver. */
  const semSnapshots = () => referenciasDna > 0 && snapshots.length === 0;
  const semSilo = () => Boolean(hydration) && !silo;

  const definicoes: Definicao[] = [
    {
      key: "articleDnaVersionId", label: "Versão do ArticleDNA",
      arquiteto: () => texto(input.article?.versionId),
      transporte: () => texto(item?.articleDnaVersionId),
      hidratado: () => texto(hydration?.articleDnaVersionId),
      transportado: true,
      consequencia: "Sem a versão do ArticleDNA, nada do que a investigação produzir pode ser amarrado à identidade que a originou.",
    },
    {
      key: "principal", label: "Keyword principal",
      arquiteto: () => principalTexto,
      transporte: () => principalTransportado,
      hidratado: () => principalHidratado,
      transportado: true, quedaDeHidratacao: () => semSnapshots(),
      consequencia: "Sem a principal hidratada, a presença por localização (title, H1, H2, abertura) não é medida nas páginas da amostra.",
    },
    {
      key: "keywordReferences", label: "Referências de KeywordDNA",
      arquiteto: () => referenciasDna ? `${referenciasDna} referência(s) no ArticleDNA` : null,
      transporte: () => referenciasItem ? `${referenciasItem} referência(s) transportada(s)` : null,
      hidratado: () => snapshots.length ? `${snapshots.length} referência(s) hidratada(s)` : null,
      transportado: true, quedaDeHidratacao: () => semSnapshots(),
      consequencia: "Sem as referências de KeywordDNA, o Radar não sabe quais keywords o artigo carrega além da principal.",
    },
    {
      key: "secundarias", label: "Secundárias e reforços",
      arquiteto: () => {
        const secundarias = lista(dna?.secondaryKeywordIds).length;
        const reforcos = lista(dna?.narrativeReinforcementIds).length;
        return secundarias || reforcos ? `${secundarias} secundária(s) · ${reforcos} reforço(s)` : null;
      },
      transporte: () => {
        const declaradas = item?.arquitetoKeywordDnaReferences?.filter(reference => reference.role !== "principal").length || 0;
        return declaradas ? `${declaradas} referência(s) não principais` : null;
      },
      hidratado: () => {
        const secundarias = papel("secundaria");
        const reforcos = papel("reforco_narrativo");
        return secundarias.length || reforcos.length ? [...secundarias, ...reforcos].join(" · ") : null;
      },
      transportado: true, quedaDeHidratacao: () => semSnapshots(),
      consequencia: "Sem secundárias e reforços, a cobertura semântica observada na SERP não tem com o que ser comparada.",
    },
    {
      key: "mainIntent", label: "Intenção esperada",
      arquiteto: () => texto(dna?.mainIntent),
      transporte: () => texto(item?.intent),
      hidratado: () => null,
      transportado: true,
      consequencia: "Sem intenção esperada, a intenção observada na SERP não tem com o que ser comparada e a comparação aparece como não classificada.",
    },
    {
      key: "siloDna", label: "SiloDNA",
      arquiteto: () => texto(dna?.siloId),
      transporte: () => texto(item?.siloId),
      hidratado: () => texto(silo?.siloDnaVersionId) ? `${silo?.name || "Silo sem nome"} · versão hidratada` : texto(silo?.name),
      transportado: true, quedaDeHidratacao: () => semSilo(),
      consequencia: "Sem o SiloDNA, o Radar investiga um artigo solto: não sabe em que arquitetura ele mora.",
    },
    {
      key: "siloPage", label: "SiloPage (raiz do silo)",
      arquiteto: () => null,
      transporte: () => null,
      hidratado: () => {
        const identidade = texto(silo?.siloPageSlug) || texto(silo?.siloPageId);
        if (!identidade) return null;
        return silo?.siloPagePublicationStatus ? `${identidade} · ${silo.siloPagePublicationStatus}` : identidade;
      },
      transportado: false, quedaDeHidratacao: () => semSilo(),
      consequencia: "Sem a SiloPage, a investigação não sabe qual página é a raiz do silo deste artigo.",
    },
    {
      key: "funcao", label: "Função no silo",
      arquiteto: () => texto(dna?.hierarchy),
      transporte: () => texto(item?.hierarchy),
      hidratado: () => texto(silo?.articleRole),
      transportado: true,
      consequencia: "Sem a função no silo, pilar e suporte são investigados como se fossem a mesma coisa.",
    },
    {
      key: "requiredTopics", label: "Tópicos obrigatórios",
      arquiteto: () => listaTexto(dna?.requiredTopics),
      transporte: () => null,
      hidratado: () => null,
      transportado: false,
      consequencia: "Sem tópicos obrigatórios, as lacunas observadas nos concorrentes não podem ser cruzadas com o que o artigo já promete cobrir.",
    },
    {
      key: "questions", label: "Perguntas declaradas",
      arquiteto: () => listaTexto(dna?.questions),
      transporte: () => null,
      hidratado: () => null,
      transportado: false,
      consequencia: "Sem perguntas declaradas, PAA e pesquisas relacionadas ficam sem contraparte editorial.",
    },
    {
      key: "entities", label: "Entidades",
      arquiteto: () => listaTexto(dna?.entities),
      transporte: () => null,
      hidratado: () => null,
      transportado: false,
      consequencia: "Sem entidades, a leitura semântica da amostra não tem âncora editorial.",
    },
    {
      key: "publicationContext", label: "Contexto de publicação",
      arquiteto: () => texto(dna?.publishedIdentityRef) ? "Identidade publicada declarada" : null,
      transporte: () => texto(strategy?.publicationStatus),
      hidratado: () => null,
      transportado: true,
      consequencia: "Sem o contexto de publicação, a investigação não distingue artigo novo de artigo publicado e protegido.",
    },
    {
      key: "decisoesHumanas", label: "Decisões humanas da formação",
      arquiteto: () => null,
      transporte: () => {
        const resolucao = item?.arquitetoSerpProvenance?.humanResolution;
        return resolucao ? `${resolucao.decision} · ${resolucao.reason}` : null;
      },
      hidratado: () => null,
      transportado: true,
      consequencia: "Sem as decisões humanas da formação, o Radar recomeça a conversa do zero e pode redescobrir uma divergência que alguém já decidiu seguir assim.",
    },
    {
      key: "serpProvenance", label: "Proveniência da SERP de formação",
      arquiteto: () => null,
      transporte: () => {
        const provenance = item?.arquitetoSerpProvenance;
        return provenance ? `Parecer ${provenance.verdict}` : item?.arquitetoSerpAssessment ? "Parecer de formação disponível" : null;
      },
      hidratado: () => null,
      transportado: true,
      consequencia: "Sem a proveniência da SERP de formação, a investigação não sabe o que a SERP já disse quando o artigo foi criado.",
    },
    {
      key: "internalLinkGraph", label: "Grafo de links internos",
      arquiteto: () => null,
      transporte: () => {
        const links = item?.arquitetoInternalLinks;
        return links ? `${links.edges.length} relação(ões) aprovada(s)` : null;
      },
      hidratado: () => null,
      transportado: true,
      consequencia: "Sem o grafo de links internos, a investigação não conhece as relações já aprovadas que envolvem este artigo.",
    },
  ];

  const fields: RadarEditorialContextField[] = definicoes.map(definicao => {
    const naOrigem = definicao.arquiteto();
    const noTransporte = definicao.transporte();
    const naHidratacao = definicao.hidratado();
    const value = naHidratacao || noTransporte || naOrigem;
    const source: RadarEditorialContextField["source"] =
      naHidratacao ? "HYDRATION" : noTransporte ? "RADAR_ITEM" : naOrigem ? "ARQUITETO" : "NONE";

    if (value) {
      return { key: definicao.key, label: definicao.label, value, source, classification: "AVAILABLE" as const, owner: null, detail: value };
    }

    /*
     * A ordem das recusas importa.
     *
     * Queda de transporte só pode ser afirmada quando a origem TEM o valor: se
     * o Arquiteto não declarou, culpar o transporte seria inventar um defeito.
     */
    const classification: RadarEditorialFieldClass =
      naOrigem && definicao.transportado ? "HANDOFF_DROPPED"
        : definicao.quedaDeHidratacao?.() ? "HYDRATION_DROPPED"
          : "LEGACY_SOURCE_MISSING";

    const owner: RadarEditorialFieldOwner = classification === "LEGACY_SOURCE_MISSING" ? "ARQUITETO" : "SHARED_TRANSPORT";
    const detail = classification === "HANDOFF_DROPPED"
      ? "Declarado no ArticleDNA e ausente na linha do Radar."
      : classification === "HYDRATION_DROPPED"
        ? "O ArticleDNA declara referências, mas a hidratação não resolveu nenhuma."
        : legado
          ? "Não veio na origem desta linha, que é anterior ao transporte atual."
          : "Não foi declarado no ArticleDNA desta versão.";

    return { key: definicao.key, label: definicao.label, value: null, source: "NONE" as const, classification, owner, detail };
  });

  const ausentes = fields.filter(field => field.classification !== "AVAILABLE");
  const state: RadarEditorialContextClass = !ausentes.length ? "CURRENT_COMPLETE" : legado ? "LEGACY_INCOMPLETE" : "CURRENT_INCOMPLETE";

  const headline =
    state === "CURRENT_COMPLETE" ? "Contexto editorial completo"
      : state === "LEGACY_INCOMPLETE" ? "CONTEXTO EDITORIAL LEGADO"
        : "CONTEXTO EDITORIAL INCOMPLETO";

  const summary =
    state === "CURRENT_COMPLETE" ? "Todos os campos do contexto editorial chegaram e estão projetados nesta tela."
      : state === "LEGACY_INCOMPLETE" ? "Esta linha entrou no Radar antes do transporte atual. As ausências vêm da origem e não têm conserto nesta tela — reimportar do Arquiteto é o caminho."
        : "Esta linha usa o transporte atual e mesmo assim faltam campos. A ausência é do ArticleDNA deste artigo, não da investigação.";

  return {
    state,
    headline,
    summary,
    fields,
    missing: ausentes.map(field => field.label),
    consequences: ausentes.map(field => definicoes.find(definicao => definicao.key === field.key)?.consequencia || CONSEQUENCIA_PADRAO),
    owners: [...new Set(ausentes.map(field => field.owner))],
    resolution,
  };
}

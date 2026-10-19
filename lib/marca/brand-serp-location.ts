/**
 * ===== 2026-10-18 · A LOCALIDADE DA SERP POR MARCA — o catálogo e a régua de casamento (L1) =====
 *
 * SDD `docs/compartilhado/sdd-localidade-serp-por-marca-2026-10-18.md`, opção A
 * (decidida pelo dono em 2026-10-18): a localidade de mercado da marca mora no
 * campo de sempre, "Localização" (`marcas.localizacao`). O texto do campo só vale
 * como localidade da SERP Google orgânica quando casa com uma entrada ATIVA deste
 * catálogo; qualquer outro texto fica guardado na Marca e a SERP continua
 * nacional, com o aviso dito na tela.
 *
 * Regras:
 *   - vazio, "Brasil" e afins → nacional (os códigos do ambiente, 2076/"pt" por
 *     padrão) — o comportamento de antes, byte a byte;
 *   - rótulo do catálogo, não palavra solta: "São Paulo" sozinho é ambíguo
 *     (estado ou capital) e NÃO casa; a capital é "São Paulo (cidade)";
 *   - uma cidade por marca, por enquanto (dono, 2026-10-18);
 *   - entrada de cidade só vale com o código da DataForSEO CONFERIDO na lista
 *     pública de localidades (§4.10). Sem a conferência, a entrada fica no
 *     catálogo como "a confirmar": o campo diz isso e a SERP continua nacional;
 *   - mudar a localidade não coleta nada: muda só a chave das próximas coletas.
 *
 * Fica nacional por desenho (§4.6): o volume do Google Ads, o allintitle (KGR),
 * o DataForSEO Labs, o YouTube e a Amazon.
 *
 * Módulo puro: sem banco, sem rede, sem relógio. O resolvedor do servidor
 * (`lib/server/brand-serp-target.ts`) lê o campo pelo `brandId` e chama este.
 */

/** A versão do catálogo. Entrada nova, código conferido ou apelido novo: muda a data. */
export const BRAND_SERP_LOCATION_CATALOG_VERSION = "2026-10-18-br-sp" as const;

/**
 * O território que a régua D11 do Radar lê (`fora do território: outra localidade`):
 * a cidade e a UF da marca e os apelidos que contam como "a marca" num texto.
 */
export type BrandSerpTerritory = {
  /** O rótulo do catálogo ("São Paulo (cidade)"), dito no motivo. */
  label: string;
  city: string;
  uf: string;
  /** Formas que contam como a localidade da marca num título, trecho ou URL. */
  aliases: readonly string[];
};

export type BrandSerpLocationEntry = {
  id: string;
  /** O rótulo do catálogo: o que a pessoa escreve no campo e o que o snapshot grava. */
  label: string;
  scope: "national" | "city";
  /** `null` no nacional: valem os códigos do ambiente (2076 por padrão). */
  locationCode: number | null;
  /** Formas aceitas, já normalizadas (`normalizeBrandSerpLocationText`). */
  accepted: readonly string[];
  territory: BrandSerpTerritory | null;
  /**
   * A conferência do código na lista pública de localidades da DataForSEO.
   * `null` = a confirmar: a entrada não vale para a SERP.
   */
  codeConfirmation: { source: string; checkedAt: string } | null;
  /** De onde veio o código candidato (só para a entrada a confirmar). */
  candidateSource?: string;
};

/** A cidade de São Paulo — o mercado da WifiConecta e da AdalbaPro (dono, 2026-10-18). */
export const BRAND_SERP_SAO_PAULO_CITY: BrandSerpLocationEntry = {
  id: "br-sp-sao-paulo",
  label: "São Paulo (cidade)",
  scope: "city",
  locationCode: 1001773,
  accepted: ["sao paulo cidade", "cidade de sao paulo", "sao paulo capital", "capital paulista"],
  territory: { label: "São Paulo (cidade)", city: "São Paulo", uf: "SP", aliases: ["São Paulo", "Sampa", "capital paulista"] },
  /*
   * 2026-10-18 · NÃO CONFERIDO na lista da DataForSEO: o CSV público de localidades
   * da SERP Google (`cdn.dataforseo.com/v3/locations/locations_serp_google_2026_09_01.csv`)
   * passa de 10 MB e não foi lido, e a lista por país é a API (não chamada nesta
   * entrega). O candidato vem da lista oficial do Google Ads, que a DataForSEO usa
   * como `location_code` (2076 = Brasil nos dois). Ativa-se em L4, depois da
   * conferência: `codeConfirmation` preenchido, versão do catálogo nova e o teste
   * da entrada ativa.
   */
  /* 2026-10-18 (L4) · CONFERIDO no CSV público da DataForSEO, baixado com autorização do dono: linha `1001773,"Sao Paulo,State of Sao Paulo,Brazil",20106,BR,City`. */
  codeConfirmation: { source: "DataForSEO locations_serp_google_2026_09_01.csv: 1001773,\"Sao Paulo,State of Sao Paulo,Brazil\",20106,BR,City", checkedAt: "2026-10-18" },
  candidateSource: "Google Ads geotargets (2022-08-03): 1001773 \"Sao Paulo,State of Sao Paulo,Brazil\", City, pai 20106 (State of Sao Paulo)",
};

export const BRAND_SERP_NATIONAL: BrandSerpLocationEntry = {
  id: "br",
  label: "Brasil",
  scope: "national",
  locationCode: null,
  accepted: ["", "brasil", "br", "brazil", "nacional", "brasil nacional", "brasil inteiro", "todo o brasil"],
  territory: null,
  codeConfirmation: { source: "DATAFORSEO_DEFAULT_LOCATION_CODE = 2076 (lib/minerador/dataforseo-serp-core.ts); cache de SERP lido em 2026-10-18", checkedAt: "2026-10-18" },
};

/** O catálogo, na ordem em que a tela sugere. */
export const BRAND_SERP_LOCATIONS: readonly BrandSerpLocationEntry[] = [BRAND_SERP_NATIONAL, BRAND_SERP_SAO_PAULO_CITY];

/** Sem acento, minúsculo, só letras e números separados por um espaço. */
export function normalizeBrandSerpLocationText(value: unknown): string {
  return (typeof value === "string" ? value : "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Palavras soltas que não dizem se é o estado ou a capital. */
const AMBIGUAS = new Set(["sao paulo", "sp", "sao paulo sp", "sao paulo brasil"]);

export type BrandSerpLocationStatus =
  /** vazio: nacional, sem aviso */
  | "empty"
  /** "Brasil": nacional, sem aviso */
  | "national"
  /** uma entrada ativa de cidade */
  | "matched"
  /** a entrada existe, mas o código da DataForSEO ainda não foi conferido */
  | "pending_confirmation"
  /** "São Paulo" solto */
  | "ambiguous"
  /** texto que o catálogo não conhece */
  | "unmatched";

export type BrandSerpLocationResolution = {
  status: BrandSerpLocationStatus;
  /** O texto do campo, como está (guardado sempre). */
  rawValue: string;
  /** A entrada que vale para a SERP. */
  entry: BrandSerpLocationEntry;
  /** A entrada que o texto citou, quando ela não vale (a confirmar). */
  pendingEntry: BrandSerpLocationEntry | null;
  catalogVersion: string;
  /** O aviso da tela; `null` quando o campo vale como está. */
  warning: string | null;
};

const ativa = (entry: BrandSerpLocationEntry) => entry.scope === "national" || Boolean(entry.codeConfirmation && entry.locationCode);

/** Os rótulos que a SERP aceita agora (as entradas ativas). */
export function acceptedBrandSerpLocationLabels(catalog: readonly BrandSerpLocationEntry[] = BRAND_SERP_LOCATIONS): string[] {
  return catalog.filter(ativa).map(entry => entry.label);
}

/** Os rótulos no catálogo à espera da conferência do código. */
export function pendingBrandSerpLocationLabels(catalog: readonly BrandSerpLocationEntry[] = BRAND_SERP_LOCATIONS): string[] {
  return catalog.filter(entry => !ativa(entry)).map(entry => entry.label);
}

/**
 * O texto do campo "Localização" → a localidade que a SERP Google orgânica usa.
 * Nunca lança: texto que não casa vale nacional, com o aviso.
 */
export function resolveBrandSerpLocation(raw: unknown, catalog: readonly BrandSerpLocationEntry[] = BRAND_SERP_LOCATIONS): BrandSerpLocationResolution {
  const rawValue = typeof raw === "string" ? raw : "";
  const normalizado = normalizeBrandSerpLocationText(rawValue);
  const nacional = catalog.find(entry => entry.scope === "national") ?? BRAND_SERP_NATIONAL;
  const base = { rawValue, catalogVersion: BRAND_SERP_LOCATION_CATALOG_VERSION, pendingEntry: null };
  if (!normalizado) return { ...base, status: "empty", entry: nacional, warning: null };
  const achada = catalog.find(entry => entry.accepted.includes(normalizado) || normalizeBrandSerpLocationText(entry.label) === normalizado);
  if (achada?.scope === "national") return { ...base, status: "national", entry: nacional, warning: null };
  if (achada && ativa(achada)) return { ...base, status: "matched", entry: achada, warning: null };
  if (achada) {
    return {
      ...base, status: "pending_confirmation", entry: nacional, pendingEntry: achada,
      warning: `“${rawValue.trim()}” está no catálogo, mas o código de localidade da DataForSEO ainda não foi conferido: a SERP continua nacional até a confirmação.`,
    };
  }
  if (AMBIGUAS.has(normalizado)) {
    const capital = catalog.find(entry => entry.id === BRAND_SERP_SAO_PAULO_CITY.id)?.label ?? BRAND_SERP_SAO_PAULO_CITY.label;
    return {
      ...base, status: "ambiguous", entry: nacional,
      warning: `“${rawValue.trim()}” sozinho é ambíguo (estado ou cidade) e não é usado na SERP; o texto fica guardado. Para a capital, escreva “${capital}”.`,
    };
  }
  return {
    ...base, status: "unmatched", entry: nacional,
    warning: `“${rawValue.trim()}” não está no catálogo e não é usado na SERP; o texto fica guardado.`,
  };
}

/**
 * A frase debaixo do campo "Localização" da Marca: a localidade que a SERP usa,
 * os valores aceitos e, quando o texto não vale, o porquê. Sem botão nem painel novo.
 */
export function brandSerpLocationHelperText(raw: unknown, catalog: readonly BrandSerpLocationEntry[] = BRAND_SERP_LOCATIONS): string {
  const lida = resolveBrandSerpLocation(raw, catalog);
  const serp = lida.entry.scope === "national" ? `SERP: ${lida.entry.label} (nacional).` : `SERP: ${lida.entry.label}.`;
  const aceitos = `Valores aceitos: ${acceptedBrandSerpLocationLabels(catalog).join(", ")}.`;
  const pendentes = pendingBrandSerpLocationLabels(catalog);
  const aConfirmar = pendentes.length ? ` A confirmar: ${pendentes.join(", ")} (o código da DataForSEO ainda será conferido).` : "";
  const fica = " Volume do Google Ads, allintitle, Labs, YouTube e Amazon ficam nacionais. Mudar a localidade não coleta nada.";
  return `${serp}${lida.warning ? ` ${lida.warning}` : ""} ${aceitos}${aConfirmar}${fica}`;
}

/* ============================== o alvo da SERP da marca ============================== */

export type BrandSerpTargetCodes = { locationCode: number; languageCode: string };

/**
 * O que toda coleta e toda leitura da SERP Google orgânica da marca usa: os
 * códigos da chave do cache e do pedido ao provider, o rótulo gravado no
 * snapshot e o território da régua D11.
 */
export type BrandSerpTarget = {
  brandId: string;
  codes: BrandSerpTargetCodes;
  /** "Brasil" ou o rótulo do catálogo ("São Paulo (cidade)"): o `location` do snapshot. */
  label: string;
  /** `brand` = uma cidade do catálogo; `national` = os códigos do ambiente, como antes. */
  source: "brand" | "national";
  territory: BrandSerpTerritory | null;
  location: BrandSerpLocationResolution;
  /** A leitura da Marca falhou: valeu o nacional (dito, nunca escondido). */
  readFailed: boolean;
  /**
   * Os códigos NACIONAIS (os do ambiente). Só para LER a SERP antiga como
   * proveniência marcada (a mesa, decisão do dono); nunca para coletar.
   */
  national: BrandSerpTargetCodes;
};

/** O alvo a partir do campo já lido. `national` são os códigos do ambiente (`readDataForSeoTargetCodes`). */
export function brandSerpTargetOf(input: {
  brandId: string;
  localizacao: unknown;
  national: BrandSerpTargetCodes;
  readFailed?: boolean;
  catalog?: readonly BrandSerpLocationEntry[];
}): BrandSerpTarget {
  const location = resolveBrandSerpLocation(input.readFailed ? "" : input.localizacao, input.catalog);
  const languageCode = input.national.languageCode.trim().toLowerCase();
  const cidade = location.status === "matched" && location.entry.scope === "city" && location.entry.locationCode ? location.entry : null;
  return {
    brandId: input.brandId,
    codes: { locationCode: cidade ? cidade.locationCode! : input.national.locationCode, languageCode },
    label: cidade ? cidade.label : location.entry.label,
    source: cidade ? "brand" : "national",
    territory: cidade?.territory ?? null,
    location,
    readFailed: Boolean(input.readFailed),
    national: { locationCode: input.national.locationCode, languageCode },
  };
}

/**
 * A config da DataForSEO com a localidade da marca (SDD §4.3): o que vai ao
 * provider é o que a chave do cache diz. Marca nacional: a mesma config, intocada.
 * O idioma continua o da config.
 */
export function withBrandSerpLocation<T extends { locationCode: number }>(config: T, target: Pick<BrandSerpTarget, "codes" | "source">): T {
  if (target.source !== "brand" || config.locationCode === target.codes.locationCode) return config;
  return { ...config, locationCode: target.codes.locationCode };
}

/** A localidade dita na prévia de custo — só quando a marca tem cidade (marca nacional: a prévia de antes). */
export function brandSerpPlanLocation(target: Pick<BrandSerpTarget, "label" | "source">): { label: string; scope: "city" } | null {
  return target.source === "brand" ? { label: target.label, scope: "city" } : null;
}

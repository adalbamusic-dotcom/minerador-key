/**
 * ===== O IDIOMA DE CADA PROVIDER — AMAZON_SEARCH_1 · §13 =====
 *
 * ========================= TRÊS GRAFIAS, UM IDIOMA =========================
 *
 * O mesmo português do Brasil é escrito de três formas diferentes, e cada uma é
 * exigida por um lugar:
 *
 *   pt-br    como a configuração canônica do Radar guarda
 *   pt-BR    a SERP do YouTube (BCP-47, região em maiúscula)
 *   pt_BR    a Merchant API da Amazon (underscore)
 *
 * Isso não é preferência de estilo do provider: é recusa. A primeira chamada de
 * Amazon deste projeto voltou `40501 · Invalid Field: 'language_code'` por
 * mandar `pt-BR`. E o YouTube voltou vazio, no 2.1, por mandar `pt-br`.
 *
 * ==================== POR QUE UMA AUTORIDADE, E NÃO UM REPLACE ====================
 *
 * A correção "óbvia" seria um `.replace("-", "_")` dentro do adapter da Amazon.
 * Foi assim que o YouTube ganhou o dele, e o resultado é que a regra passou a
 * existir em dois lugares sem nenhum saber do outro: quando a Amazon chegou,
 * ninguém lembrou que já havia uma tradução — e o defeito custou uma chamada
 * recusada para reaparecer.
 *
 * Aqui a tradução é do PAR (idioma, provider). Um provider novo precisa
 * declarar a grafia dele; não há caminho silencioso para o padrão errado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export const RADAR_LOCALE_PROVIDERS = ["GOOGLE_SERP", "YOUTUBE_SERP", "MERCHANT_AMAZON"] as const;
export type RadarLocaleProvider = typeof RADAR_LOCALE_PROVIDERS[number];

export class RadarLocaleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RadarLocaleError";
    this.code = code;
  }
}

/**
 * A GRAFIA DE CADA UM — e o separador é a diferença que recusa a chamada.
 *
 * `GOOGLE_SERP` recebe minúsculo inteiro porque é o que a configuração canônica
 * já entrega e o que aquele endpoint aceita há gates. Mudá-lo aqui mexeria num
 * caminho homologado para arrumar simetria de tabela.
 */
const GRAFIA: Record<RadarLocaleProvider, { separador: "-" | "_" | null; regiaoMaiuscula: boolean }> = {
  GOOGLE_SERP: { separador: "-", regiaoMaiuscula: false },
  YOUTUBE_SERP: { separador: "-", regiaoMaiuscula: true },
  MERCHANT_AMAZON: { separador: "_", regiaoMaiuscula: true },
};

/**
 * TRADUZ O LOCALE CANÔNICO PARA O QUE O PROVIDER EXIGE.
 *
 * Aceita a entrada em qualquer uma das três grafias — a configuração pode
 * guardar `pt-br` hoje e `pt_BR` amanhã sem quebrar ninguém —, e a saída é
 * sempre a do provider pedido.
 */
export function radarProviderLocale(locale: string, provider: RadarLocaleProvider): string {
  const bruto = (locale || "").trim();
  if (!bruto) {
    throw new RadarLocaleError("locale_empty", "O idioma da coleta está vazio; nenhuma chamada pode ser montada sem ele.");
  }

  /* As três grafias entram; o separador é normalizado antes de sair. */
  const partes = bruto.split(/[-_]/).filter(Boolean);
  if (!partes.length || partes.length > 2) {
    throw new RadarLocaleError("locale_invalid", `O idioma "${bruto}" não tem forma de locale reconhecível.`);
  }

  const lingua = partes[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lingua)) {
    throw new RadarLocaleError("locale_invalid", `O idioma "${bruto}" não começa com um código de língua válido.`);
  }

  const grafia = GRAFIA[provider];
  const regiao = partes[1];
  if (!regiao) {
    /*
     * SEM REGIÃO, SEM SEPARADOR — e isso não é erro.
     *
     * `pt` é locale legítimo. Inventar `pt_BR` a partir dele escolheria um país
     * que ninguém pediu, e a SERP voltaria de outro mercado.
     */
    return lingua;
  }

  const regiaoFormatada = grafia.regiaoMaiuscula ? regiao.toUpperCase() : regiao.toLowerCase();
  return `${lingua}${grafia.separador}${regiaoFormatada}`;
}

/**
 * ============ A TRAVA CONTRA A GRAFIA DO PROVIDER ERRADO ============
 *
 * O erro que este módulo existe para impedir não é "esqueci de traduzir": é
 * traduzir para o provider errado. `pt-BR` chegando à Merchant API e `pt_BR`
 * chegando ao YouTube são as duas formas de o mesmo engano acontecer, e as duas
 * voltam como recusa que parece SERP vazia.
 *
 * Quem monta uma requisição chama isto com o valor que vai enviar.
 */
/**
 * ============ O QUE A PRIMEIRA CHAMADA REAL REVELOU — 2.1 · PARTE A ============
 *
 * O `40501 · Invalid Field: 'language_code'` voltou uma SEGUNDA vez, e desta vez
 * o separador não tinha nada a ver com ele.
 *
 * `DATAFORSEO_LANGUAGE_CODE` não está definida, e a configuração canônica cai no
 * padrão `"pt"` — sem região. A tradução acima fez exatamente o que documenta:
 * devolveu `"pt"`, porque inventar `pt_BR` a partir de `pt` escolheria um país
 * que ninguém pediu. O Google aceita `pt`; a SERP do YouTube aceita `pt`; a
 * Merchant API da Amazon EXIGE a região, e recusa a tarefa sem ela.
 *
 * ==================== A REGIÃO NÃO É PALPITE: É O MERCADO ====================
 *
 * Quem chama a Merchant API já declarou em que prateleira está procurando —
 * `location_code = 2076` é o Brasil, e é `amazon.com.br` que responde. A região
 * que falta no idioma está ali, declarada, ao lado. Lê-la de lá não é inventar
 * país nenhum: é usar o que o próprio pedido diz.
 *
 * O que continua proibido é o contrário — SOBRESCREVER uma região que o idioma
 * já traz. `pt-BR` num mercado espanhol é um pedido estranho, e responder a ele
 * com `es_ES` seria decidir sozinho o que a pessoa quis dizer.
 */
const REGIAO_DO_MERCADO_AMAZON: Record<number, string> = {
  2076: "BR", 2840: "US", 2124: "CA", 2484: "MX",
  2826: "GB", 2276: "DE", 2250: "FR", 2380: "IT", 2724: "ES",
  2528: "NL", 2752: "SE", 2616: "PL", 2792: "TR",
  2356: "IN", 2392: "JP", 2036: "AU", 2702: "SG", 2784: "AE", 2682: "SA",
};

/**
 * O IDIOMA DA MERCHANT API — traduzido, completado pelo mercado e conferido.
 *
 * Um mercado desconhecido ERRA aqui, antes da rede. Mandar `pt` e deixar o
 * provider recusar custaria uma ida à API para descobrir o que este módulo já
 * sabe — e a recusa chegaria como "SERP vazia" para quem estivesse olhando.
 */
export function radarMerchantAmazonLocale(locale: string, locationCode: number): string {
  const traduzido = radarProviderLocale(locale, "MERCHANT_AMAZON");
  if (traduzido.includes("_")) return traduzido;

  if (!Number.isSafeInteger(locationCode) || locationCode < 1) {
    throw new RadarLocaleError(
      "merchant_market_missing",
      `O idioma "${locale}" não declara região e nenhum mercado válido foi informado; a Merchant API da Amazon recusa a chamada sem região.`,
    );
  }

  const regiao = REGIAO_DO_MERCADO_AMAZON[locationCode];
  if (!regiao) {
    throw new RadarLocaleError(
      "merchant_market_unknown",
      `O idioma "${locale}" não declara região e o mercado ${locationCode} não está mapeado; declare a região do idioma antes de chamar a Merchant API da Amazon.`,
    );
  }

  const completo = `${traduzido}_${regiao}`;
  assertRadarProviderLocale(completo, "MERCHANT_AMAZON");
  return completo;
}

export function assertRadarProviderLocale(valor: string, provider: RadarLocaleProvider): void {
  const esperado = radarProviderLocale(valor, provider);
  if (valor !== esperado) {
    throw new RadarLocaleError(
      "locale_wrong_provider_spelling",
      `O idioma "${valor}" não é a grafia que ${provider} aceita. O correto é "${esperado}".`,
    );
  }
}

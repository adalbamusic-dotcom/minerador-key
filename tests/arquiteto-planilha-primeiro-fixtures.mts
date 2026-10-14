import { ATOR, VOLUME_VALIDADO, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";

/*
 * F5 · PLANILHA PRIMEIRO — fixture do CASO REAL (WifiConecta, grupo azul
 * "Wi-Fi e fibra óptica"): 7 keywords com Assunto cadastrado na própria
 * keyword (ordem 9–15), Pilar = "internet fibra óptica", 6 travadas pelo
 * volume medido e "diferença entre internet e Wi-Fi" livre (sem volume), mais
 * as sustentações da lista do Assunto livre, um Assunto do laranja, uma
 * keyword comum e um Assunto que não chegou ao Arquiteto. Dados puros.
 */

export const MARCA_WIFI = "d4fa133a-0000-4000-8000-000000000001";
export const AZUL = "aaaa0000-0000-4000-8000-00000000a201";
export const LARANJA = "aaaa0000-0000-4000-8000-00000000a202";
export const TERRITORIO = "territory:wifi-e-fibra";

type Semantic = Record<string, unknown>;
export function cadastro(id: string, keyword: string, titulo: string, order: number, role: "Pilar" | "Suporte", groupId = AZUL, extra: Semantic = {}): Semantic {
  return {
    dna_origem: "logico_deterministico",
    ...extra,
    keyword_subject: {
      declared: true, note: null, destinationUrl: null, destinationCheck: null,
      entry: { title: titulo, source: "cadastro" },
      plan: { groupId, planVersion: 1, order, role, scope: `Escopo do artigo ${order}.`, declaredPrincipal: { keywordId: id, phrase: keyword } },
    },
    keyword_subject_actor: ATOR,
    keyword_subject_at: "2026-10-13T10:00:00+00:00",
    keyword_subject_origin: "import",
    keyword_declared_principal: { subjectKeywordId: id, groupId, planVersion: 1 },
  };
}

export const AZUL_PLANO: Array<[string, string, string, number, "Pilar" | "Suporte", boolean]> = [
  ["k9", "internet fibra óptica", "Internet fibra óptica: o que é e como funciona", 9, "Pilar", true],
  ["k10", "diferença entre internet e wi-fi", "Diferença entre internet e Wi-Fi: o que muda na sua casa", 10, "Suporte", false],
  ["k11", "wi-fi lento", "Wi-Fi lento em casa: causas comuns e como melhorar", 11, "Suporte", true],
  ["k12", "como melhorar o sinal do wi-fi", "Como melhorar o sinal do Wi-Fi em todos os cômodos", 12, "Suporte", true],
  ["k13", "roteador wi-fi 6", "Roteador Wi-Fi 6 vale a pena?", 13, "Suporte", true],
  ["k14", "velocidade de internet ideal", "Qual a velocidade de internet ideal para cada casa", 14, "Suporte", true],
  ["k15", "repetidor de sinal wi-fi", "Repetidor de sinal Wi-Fi: quando usar", 15, "Suporte", true],
];

export function linha(id: string, keyword: string, semantic: Semantic, extra: Record<string, unknown> = {}) {
  return { ...linhaDaMesa({ id, keyword, brandId: MARCA_WIFI, semantic }), territoryRef: TERRITORIO, ...extra };
}

export function mesaWifi() {
  const plano = AZUL_PLANO.map(([id, keyword, titulo, order, role, comVolume]) => linha(id, keyword, cadastro(id, keyword, titulo, order, role, AZUL, comVolume ? VOLUME_VALIDADO : {}), comVolume ? { volume_search: 320, volume_source: "google_ads" } : {}));
  // Sustentações da lista do Assunto "diferença entre internet e Wi-Fi" (Pesquisa por Assunto).
  const apoio = linha("s1", "internet e wi-fi qual a diferença", { subject_discovery: { version: 1, searches: [], subjectKeywordIds: ["k10"] } }, { volume_search: 210, volume_source: "google_ads" });
  const apoioMaior = linha("s2", "wifi e internet são a mesma coisa", { subject_discovery: { version: 1, searches: [], subjectKeywordIds: ["k10"] } }, { volume_search: 480, volume_source: "google_ads" });
  const apoioSemVolume = linha("s3", "o que é wi-fi e o que é internet", { subject_discovery: { version: 1, searches: [], subjectKeywordIds: ["k10"] } });
  const apoioPublicado = linha("s4", "internet x wi-fi", { subject_discovery: { version: 1, searches: [], subjectKeywordIds: ["k10"] } }, { volume_search: 90, volume_source: "google_ads", isPublished: true });
  // Laranja: um Assunto do plano de outra cor (o recorte da etiqueta separa).
  const laranja = linha("l1", "plano de internet barato", cadastro("l1", "plano de internet barato", "Plano de internet barato: como escolher", 1, "Pilar", LARANJA, VOLUME_VALIDADO), { volume_search: 900, volume_source: "google_ads" });
  // Keyword comum, sem Assunto: não é linha do plano.
  const comum = linha("c1", "internet residencial", {}, { volume_search: 1000, volume_source: "google_ads" });
  // Assunto com plano, mas que NÃO chegou ao Arquiteto: não é linha.
  const naoRecebida = { ...linhaDaMesa({ id: "x1", keyword: "fibra x rádio", brandId: MARCA_WIFI, semantic: cadastro("x1", "fibra x rádio", "Fibra ou rádio?", 16, "Suporte"), received: false }) };
  return [...plano, apoio, apoioMaior, apoioSemVolume, apoioPublicado, laranja, comum, naoRecebida];
}

export const GRUPOS: Record<string, { color: string; name: string }> = { [AZUL]: { color: "azul", name: "Wi-Fi e fibra óptica" }, [LARANJA]: { color: "laranja", name: "Planos" } };
export const grupoDaKeyword = (id: string) => id.startsWith("k") || id.startsWith("s") ? AZUL : id.startsWith("l") ? LARANJA : null;

import { VOLUME_VALIDADO } from "./arquiteto-assunto-fixtures.mts";
import { AZUL, LARANJA, MARCA_WIFI, cadastro, linha } from "./arquiteto-planilha-primeiro-fixtures.mts";
import type { PlanSheetArticle } from "../lib/arquiteto/plan-article-sheet.ts";

/*
 * 2026-10-14 · CASO REAL WifiConecta (lido por SELECT em 14/10): cor azul
 * "Wi-Fi e fibra óptica", grupo 07fec332…, plano com 7 artigos (ordem 9–15).
 * As linhas 12, 13 e 14 (streaming, jogos, home office) estão presas no
 * ArticleDNA `9df07c7b…` (slug `melhor-para-jogos-online`, Assunto Mega/Giga do
 * LARANJA, Silo "planos de internet"), formado em 13/10 22:33 pela melhoria.
 * Os candidatos da cópia de trabalho das linhas 9, 10, 11 e 15 apareciam na
 * tabela antiga como "CANDIDATO · Sem Assunto · Fora do plano". Dados puros.
 */

export const INTRUSO_ID = "9df07c7b-16ae-414e-aadc-9f460c5f537b";
export const SILO_PLANOS = "territory:9c75c3a7-15e1-4655-b627-c08e394b4606";
export const ASSUNTO_MEGA_GIGA = "Internet de 300, 500, 600 Mega ou 1 Giga: qual velocidade contratar?";

/** [id, keyword, título do Assunto, ordem, papel, volume medido (null = sem volume, trava livre)] */
export const AZUL_REAL: Array<[string, string, string, number, "Pilar" | "Suporte", number | null]> = [
  ["k9", "internet fibra óptica", "Internet fibra óptica ou internet comum: qual a diferença e qual escolher?", 9, "Pilar", 5400],
  ["k10", "diferença entre internet e Wi-Fi", "Qual a diferença entre internet e Wi-Fi? Entenda antes de contratar", 10, "Suporte", null],
  ["k11", "Wi-Fi lento", "Wi-Fi lento em casa: 10 causas comuns e como melhorar a conexão", 11, "Suporte", 260],
  ["k12", "internet para streaming", "Quantos Mega de internet precisa para assistir Netflix, YouTube e streaming?", 12, "Suporte", 10],
  ["k13", "melhor internet para jogos online", "Qual a melhor internet para jogar online? Velocidade, ping e estabilidade", 13, "Suporte", 40],
  ["k14", "internet para home office", "Internet para home office: qual velocidade e conexão são ideais?", 14, "Suporte", 10],
  ["k15", "teste de velocidade da internet", "Teste de velocidade da internet: como saber se você recebe o que contratou?", 15, "Suporte", 135000],
];

export function mesaWifiReal() {
  const plano = AZUL_REAL.map(([id, keyword, titulo, order, role, volume]) =>
    linha(id, keyword, cadastro(id, keyword, titulo, order, role, AZUL, volume !== null ? VOLUME_VALIDADO : {}), volume !== null ? { volume_search: volume, volume_source: "google_ads" } : {}));
  // A linha-título do Assunto Mega/Giga do laranja (Assunto declarado, sem plano).
  const megaGiga = linha(INTRUSO_ID, ASSUNTO_MEGA_GIGA, { keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null } });
  // Um Assunto do plano do laranja (outra cor: o recorte azul não o mostra).
  const laranja = linha("l1", "plano de internet barato", cadastro("l1", "plano de internet barato", "Plano de internet barato: como escolher", 1, "Pilar", LARANJA, VOLUME_VALIDADO), { volume_search: 900, volume_source: "google_ads" });
  return [...plano, megaGiga, laranja];
}

export const grupoDaKeywordReal = (id: string) => id.startsWith("k") ? AZUL : id === "l1" || id === INTRUSO_ID ? LARANJA : null;

/** O ArticleDNA intruso, como a mesa o lê (versão vigente, aprovado). */
export const ARTIGO_INTRUSO: PlanSheetArticle = {
  articleId: INTRUSO_ID,
  versionNumber: 1,
  subjectKeywordId: INTRUSO_ID,
  principalKeywordId: "k13",
  keywordIds: ["k13", "k12", "k14"],
  slug: "melhor-para-jogos-online",
  siloRef: SILO_PLANOS,
  siloLabel: "planos de internet",
  subjectPhrase: ASSUNTO_MEGA_GIGA,
  subjectColorLabel: "Laranja",
  label: "melhor internet para jogos online",
};

export { AZUL, LARANJA, MARCA_WIFI };

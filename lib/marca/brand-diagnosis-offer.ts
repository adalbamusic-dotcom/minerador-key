/**
 * ===== 2026-10-14 · D8 · A OFERTA DE DIAGNÓSTICO DA MARCA (Skill de voz v2) =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §9.2 e
 * §16 (D8, decidida pelo dono em 2026-10-14 pela recomendação: "Skill v2 — a
 * proposta de texto fica no painel da Marca, não aplicada pelo agente").
 *
 * O fechamento do artigo tem um CTA só: o diagnóstico (D7). O que a marca
 * verifica nesse diagnóstico é DADO DA MARCA, escrito pelo dono na Skill de voz
 * (`brand_voice`), numa seção "Oferta de diagnóstico". Este módulo é a régua pura
 * dessa seção, para os dois lados:
 *   - o Radar lê a oferta (pedido do artigo-modelo e CSV "Para escrever");
 *   - o painel da Marca mostra a PROPOSTA de texto quando a seção não existe,
 *     para o dono aplicar (nada é escrito na Skill por código).
 *
 * Sem a seção, a planta usa o texto padrão neutro abaixo (o entregável sai
 * concluído, D10) e o painel da Marca diz o que falta.
 *
 * Módulo puro: sem fetch, sem banco, sem React.
 */

/** O título da seção da Skill que guarda a oferta (o que o painel propõe). */
export const BRAND_DIAGNOSIS_OFFER_HEADING = "Oferta de diagnóstico";

/** Os títulos aceitos como a seção da oferta (sem acento, minúsculos): "Oferta de diagnóstico", "Diagnóstico", "CTA de diagnóstico"… */
const TITULO_DA_OFERTA = /\bdiagnostic[oa]s?\b/;

const semAcento = (valor: string) => valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * O CTA ÚNICO QUANDO A SKILL NÃO TEM A OFERTA: neutro, sem preço, prazo,
 * garantia nem nome de serviço que a marca não declarou. Verbo de verificação e
 * uma chamada só (a régua de `lib/radar/brand-edge.ts`).
 */
export const BRAND_DIAGNOSIS_OFFER_DEFAULT =
  "Quer saber por onde começar? Peça um diagnóstico: olhamos como o seu negócio aparece hoje na busca e dizemos o que falta.";

/**
 * A PROPOSTA DE TEXTO PARA A SKILL v2 (o dono aplica na Marca; o agente não
 * aplica). Markdown pronto para colar como seção nova da Skill de voz.
 */
export const BRAND_DIAGNOSIS_OFFER_PROPOSAL = [
  `## ${BRAND_DIAGNOSIS_OFFER_HEADING}`,
  "",
  "O fechamento de todo artigo termina num CTA só: o diagnóstico. Diga aqui, com as palavras da marca:",
  "",
  "- o que a marca verifica (verbo + objeto): por exemplo, \"eu olho seu site, seu perfil no Google e as perguntas que mais chegam na recepção\";",
  "- o que a pessoa recebe: por exemplo, \"e te digo o que falta e por onde começar\";",
  "- como pedir (WhatsApp, formulário, agenda) e o que NÃO entra (preço, prazo ou garantia que a marca não oferece).",
  "",
  "Exemplo: \"Quer saber por onde começar? Eu olho seu site, seu perfil no Google e as perguntas que mais chegam na recepção, e te digo o que falta.\"",
].join("\n");

export type BrandDiagnosisOfferSection = { heading: string; body: string };

/**
 * A OFERTA DE DIAGNÓSTICO QUE A SKILL DECLARA: o corpo da seção cujo título fala
 * de diagnóstico, numa frase só (sem marcação de lista nem quebra), ou null.
 */
export function brandDiagnosisOfferOf(secoes: ReadonlyArray<BrandDiagnosisOfferSection> | null | undefined): string | null {
  const secao = (secoes || []).find(item => TITULO_DA_OFERTA.test(semAcento(String(item?.heading || ""))) && String(item?.body || "").trim());
  if (!secao) return null;
  const texto = secao.body
    .split(/\r?\n/)
    .map(linha => linha.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/^#+\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return texto ? (texto.length > 600 ? `${texto.slice(0, 599).trimEnd()}…` : texto) : null;
}

/** A mesma régua sobre os títulos de um Markdown (o painel da Marca lê o arquivo original). */
export function brandDiagnosisOfferInMarkdown(markdown: string | null | undefined): boolean {
  return String(markdown || "").split(/\r?\n/).some(linha => {
    const titulo = /^#{1,6}\s+(.*\S)\s*$/.exec(linha);
    return Boolean(titulo && TITULO_DA_OFERTA.test(semAcento(titulo[1])));
  });
}

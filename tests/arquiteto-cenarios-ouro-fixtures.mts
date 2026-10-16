import { readFileSync } from "node:fs";
import { ATOR, VOLUME_VALIDADO, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";
import { AZUL, LARANJA, MARCA_WIFI, cadastro } from "./arquiteto-planilha-primeiro-fixtures.mts";
import { AZUL_REAL } from "./arquiteto-uma-lista-so-fixtures.mts";

/*
 * F0 DA LINHA ÚNICA DO ARQUITETO — FIXTURES DOS CENÁRIOS-OURO (2026-10-16).
 * SDD `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md` §11.1.
 *
 * Três marcas, todas dados puros (nenhuma rede, nenhum banco, nenhum custo):
 *
 *  1. WifiConecta · azul "Wi-Fi e fibra óptica" — o CASO REAL que o dono
 *     homologa (SELECT de 14 e 15/10, `estado-atual.md`): 7 artigos do plano
 *     (ordem 9–15), plano v4 no grupo (as keywords guardam 4/3/2), Pilar
 *     "internet fibra óptica" (5.400), "diferença entre internet e Wi-Fi"
 *     Livre e SEM volume, "Wi-Fi lento" 260, `editorial_groups.silo_id` velho
 *     (`territory:09d9b92d…`, que não existe mais), o Silo real
 *     `territory:5e689f8c…` e a keyword do Silo ("Wi-Fi e fibra óptica",
 *     `34bd7c0f`) AUSENTE do Arquiteto (bruta, 0 volume, no Minerador).
 *  2. Marca sem plano (como a AdalbaPro): 8 keywords aprovadas com volume,
 *     sem Assunto, sem plano, sem publicado.
 *  3. Um publicado (a página da AdalbaPro "como captar clientes…"), usado nos
 *     cenários de publicado.
 */

export { AZUL, LARANJA, MARCA_WIFI, ATOR, VOLUME_VALIDADO };

/* ----------------------------------------------------- WifiConecta · azul */

/** O Silo real do plano (consolidado em 15/10). */
export const TERRITORIO_AZUL = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
/** O `editorial_groups.silo_id` velho do azul: aponta para um território que não existe mais. */
export const SILO_ID_VELHO = "territory:09d9b92d-0000-4000-8000-000000000000";
/** A keyword do Silo que ficou no Minerador (bruta, 0 volume, sem Assunto e sem grupo). */
export const CABECA_DO_SILO = "34bd7c0f-b543-4c0e-b83d-a71b0a819ce3";
export const PLANO_AZUL = { groupId: AZUL, siloName: "Wi-Fi e fibra óptica", siloSlug: "wifi-e-fibra", objective: "conquistar tráfego de pessoas que querem entender a tecnologia antes de contratar", articleCount: 7, planVersion: 4 } as const;
/** O grupo como a mesa o lê (`groupOf`): a versão vigente do plano é a do GRUPO. */
export const GRUPOS_WIFI: Record<string, { color: string; name: string; planVersion?: number }> = {
  [AZUL]: { color: "azul", name: "Wi-Fi e fibra óptica", planVersion: 4 },
  [LARANJA]: { color: "laranja", name: "Planos", planVersion: 1 },
};
/** As versões do plano em que cada keyword entrou (SELECT de 15/10: 4/3/2). */
const VERSAO_DA_KEYWORD: Record<string, number> = { k9: 4, k10: 4, k11: 3, k12: 2, k13: 2, k14: 2, k15: 4 };

export type LinhaAzul = { id: string; keyword: string; titulo: string; order: number; role: "Pilar" | "Suporte"; volume: number | null };
export const LINHAS_AZUL: LinhaAzul[] = AZUL_REAL.map(([id, keyword, titulo, order, role, volume]) => ({ id, keyword, titulo, order, role, volume }));
export const escopoDo = (order: number) => `Escopo do artigo ${order}.`;

/** O semântico da keyword do plano (cadastro único), com a versão em que ela entrou. */
export function semanticoDoPlano(linha: LinhaAzul): Record<string, unknown> {
  const base = cadastro(linha.id, linha.keyword, linha.titulo, linha.order, linha.role, AZUL, linha.volume !== null ? VOLUME_VALIDADO : {});
  const assunto = base.keyword_subject as Record<string, unknown>;
  const plano = assunto.plan as Record<string, unknown>;
  return { ...base, keyword_subject: { ...assunto, plan: { ...plano, planVersion: VERSAO_DA_KEYWORD[linha.id] ?? 4 } }, keyword_declared_principal: { subjectKeywordId: linha.id, groupId: AZUL, planVersion: VERSAO_DA_KEYWORD[linha.id] ?? 4 } };
}

/** A mesa do azul como o Arquiteto a recebe (linha da mesa com o pacote aprovado), no Silo real. */
export function mesaAzul(opcoes: { cabeca?: boolean; territoryRef?: string | null } = {}) {
  const territoryRef = opcoes.territoryRef === undefined ? TERRITORIO_AZUL : opcoes.territoryRef;
  const linhas = LINHAS_AZUL.map(linha => ({
    ...linhaDaMesa({ id: linha.id, keyword: linha.keyword, brandId: MARCA_WIFI, semantic: semanticoDoPlano(linha) }),
    territoryRef,
    ...(linha.volume !== null ? { volume_search: linha.volume, volume_source: "google_ads" } : {}),
  }));
  // A keyword do Silo, só na variante "presente": bruta, sem Assunto, sem grupo, 0 volume.
  const cabeca = opcoes.cabeca ? [{ ...linhaDaMesa({ id: CABECA_DO_SILO, keyword: "Wi-Fi e fibra óptica", brandId: MARCA_WIFI, semantic: {} }), territoryRef: null }] : [];
  return [...linhas, ...cabeca];
}
export const grupoDaKeywordAzul = (id: string) => id.startsWith("k") ? AZUL : null;

/* ------------------------------------------------- marca sem plano (8) */

export const MARCA_SEM_PLANO = "5a1b0000-0000-4000-8000-0000000000ad";
/** [id, keyword, volume] — o Silo "captação de pacientes" de uma marca sem plano. */
export const SEM_PLANO: Array<[string, string, number]> = [
  ["a1", "captação de pacientes", 1300],
  ["a2", "captação de pacientes para clínica", 480],
  ["a3", "captação de pacientes para clínica de estética", 320],
  ["a4", "estratégias de captação de pacientes", 210],
  ["a5", "marketing para clínica de estética", 880],
  ["a6", "marketing digital para clínica de estética", 390],
  ["a7", "como atrair pacientes para clínica de estética", 260],
  ["a8", "como atrair pacientes para clínica", 170],
];
export const SEMANTICO_SEM_PLANO = { entidade_central: "captação de pacientes", problema_percebido: "agenda vazia", publico: "donas de clínica de estética", resultado_desejado: "agenda cheia", intencao_principal: "Informativa", dna_origem: "logico_deterministico" };

/* ---------------------------------------------------- SERP por fixture */

/** As 4 lentes do contrato (a mesma ordem de `SERP_SUBJECT_LENS_LABELS`). */
export const LENTES = ["desktop-windows", "desktop-macos", "mobile-android", "mobile-ios"] as const;
/** Um "top 10" de fixture: as mesmas URLs = o Google junta; prefixos diferentes = outro assunto. */
export const top10 = (prefixo: string) => Array.from({ length: 10 }, (_, indice) => `https://${prefixo}.example.org/p${indice + 1}`);

/* ------------------------------------------------- código sem comentário */

const raiz = new URL("../", import.meta.url);
export const lerCodigo = (caminho: string) => readFileSync(new URL(caminho, raiz), "utf8");
/** O código SEM comentários: um comentário não pode passar nem reprovar um teste estrutural. */
export const semComentarios = (codigo: string) => codigo.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
export const codigoSemComentarios = (caminho: string) => semComentarios(lerCodigo(caminho));
export const contar = (texto: string, trecho: string) => texto.split(trecho).length - 1;

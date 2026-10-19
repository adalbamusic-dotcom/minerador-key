/**
 * ===== 2026-10-18 · O GAZETTEER DO D11 GEOGRÁFICO (L3) =====
 *
 * SDD `docs/compartilhado/sdd-localidade-serp-por-marca-2026-10-18.md` §4.5, decisão
 * do dono de 2026-10-18 (Q4): a régua D11 marca como "fora do território: outra
 * localidade" o resultado que cita OUTRA cidade ou UF, pela lista de capitais e
 * municípios grandes do IBGE. Nada inventado:
 *
 *   - as 27 UFs e as 27 capitais;
 *   - os municípios com 500 mil habitantes ou mais no Censo Demográfico 2022 do
 *     IBGE (população residente em 1º/08/2022): 41 municípios, de São Paulo
 *     (11.451.999) a Serra/ES (520.653). O primeiro abaixo do corte é Campos dos
 *     Goytacazes/RJ (483.540). O corte de 500 mil é a escolha desta entrega
 *     (o dono decidiu "capitais e municípios grandes"; o número fica registrado
 *     na SDD e muda só com a versão abaixo).
 *
 * Nome que também é palavra comum ou nome de rua e santo ("Natal", "Serra",
 * "Contagem", "Vitória", "Salvador", "Santo André"…) só conta com a UF ao lado
 * ("Natal RN", "Natal/RN", "Natal, Rio Grande do Norte") ou com "cidade de",
 * "prefeitura de", "município de" antes — senão "promoção de Natal" sairia da
 * amostra (R4 da SDD: falso positivo).
 *
 * Módulo puro: sem banco, sem rede, sem relógio.
 */
import type { BrandSerpTerritory } from "../marca/brand-serp-location.ts";

/** Mudou o corte, um nome ou a regra de ambiguidade: muda a versão. */
export const RADAR_TERRITORY_GAZETTEER_VERSION = "ibge-censo-2022-500mil-2026-10-18" as const;

export type RadarTerritoryUf = { sigla: string; nome: string; ambiguous?: true };
export type RadarTerritoryCity = { nome: string; uf: string; capital?: true; ambiguous?: true };

export const RADAR_TERRITORY_UFS: readonly RadarTerritoryUf[] = [
  { sigla: "AC", nome: "Acre", ambiguous: true },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo", ambiguous: true },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará", ambiguous: true },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina", ambiguous: true },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

/** Capitais e municípios com 500 mil habitantes ou mais (IBGE, Censo 2022), na ordem do Censo; depois, as capitais abaixo do corte. */
export const RADAR_TERRITORY_CITIES: readonly RadarTerritoryCity[] = [
  { nome: "São Paulo", uf: "SP", capital: true },
  { nome: "Rio de Janeiro", uf: "RJ", capital: true },
  { nome: "Brasília", uf: "DF", capital: true },
  { nome: "Fortaleza", uf: "CE", capital: true, ambiguous: true },
  { nome: "Salvador", uf: "BA", capital: true, ambiguous: true },
  { nome: "Belo Horizonte", uf: "MG", capital: true },
  { nome: "Manaus", uf: "AM", capital: true },
  { nome: "Curitiba", uf: "PR", capital: true },
  { nome: "Recife", uf: "PE", capital: true, ambiguous: true },
  { nome: "Goiânia", uf: "GO", capital: true },
  { nome: "Porto Alegre", uf: "RS", capital: true },
  { nome: "Belém", uf: "PA", capital: true, ambiguous: true },
  { nome: "Guarulhos", uf: "SP" },
  { nome: "Campinas", uf: "SP" },
  { nome: "São Luís", uf: "MA", capital: true, ambiguous: true },
  { nome: "Maceió", uf: "AL", capital: true },
  { nome: "Campo Grande", uf: "MS", capital: true, ambiguous: true },
  { nome: "São Gonçalo", uf: "RJ", ambiguous: true },
  { nome: "Teresina", uf: "PI", capital: true },
  { nome: "João Pessoa", uf: "PB", capital: true, ambiguous: true },
  { nome: "São Bernardo do Campo", uf: "SP" },
  { nome: "Duque de Caxias", uf: "RJ", ambiguous: true },
  { nome: "Nova Iguaçu", uf: "RJ" },
  { nome: "Natal", uf: "RN", capital: true, ambiguous: true },
  { nome: "Santo André", uf: "SP", ambiguous: true },
  { nome: "Osasco", uf: "SP" },
  { nome: "Sorocaba", uf: "SP" },
  { nome: "Uberlândia", uf: "MG" },
  { nome: "Ribeirão Preto", uf: "SP" },
  { nome: "São José dos Campos", uf: "SP" },
  { nome: "Cuiabá", uf: "MT", capital: true },
  { nome: "Jaboatão dos Guararapes", uf: "PE" },
  { nome: "Contagem", uf: "MG", ambiguous: true },
  { nome: "Joinville", uf: "SC" },
  { nome: "Feira de Santana", uf: "BA" },
  { nome: "Aracaju", uf: "SE", capital: true },
  { nome: "Londrina", uf: "PR" },
  { nome: "Juiz de Fora", uf: "MG" },
  { nome: "Florianópolis", uf: "SC", capital: true },
  { nome: "Aparecida de Goiânia", uf: "GO" },
  { nome: "Serra", uf: "ES", ambiguous: true },
  /* As capitais abaixo de 500 mil habitantes (Censo 2022). */
  { nome: "Porto Velho", uf: "RO", capital: true },
  { nome: "Macapá", uf: "AP", capital: true },
  { nome: "Boa Vista", uf: "RR", capital: true, ambiguous: true },
  { nome: "Rio Branco", uf: "AC", capital: true, ambiguous: true },
  { nome: "Vitória", uf: "ES", capital: true, ambiguous: true },
  { nome: "Palmas", uf: "TO", capital: true, ambiguous: true },
];

/** Sem acento, minúsculo, só letras e números separados por um espaço, com espaço nas pontas. */
const plano = (valor: string | null | undefined) => ` ${String(valor || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim()} `;

const ufPorSigla = new Map(RADAR_TERRITORY_UFS.map(uf => [uf.sigla, uf]));
const ANTES_DE_CIDADE = ["cidade de", "prefeitura de", "municipio de"];
const ANTES_DE_UF = ["estado do", "estado da", "estado de"];

type Lugar = { rotulo: string; formas: string[] };

/** As formas que contam para cada lugar do gazetteer (já normalizadas, com espaço nas pontas). */
function formasDaCidade(cidade: RadarTerritoryCity): string[] {
  const nome = plano(cidade.nome).trim();
  if (!cidade.ambiguous) return [` ${nome} `];
  const uf = ufPorSigla.get(cidade.uf);
  const nomeDaUf = uf ? plano(uf.nome).trim() : null;
  return [
    ` ${nome} ${cidade.uf.toLowerCase()} `,
    /* "Natal, Rio Grande do Norte", "Belém do Pará". */
    ...(nomeDaUf ? [` ${nome} ${nomeDaUf} `, ` ${nome} do ${nomeDaUf} `, ` ${nome} da ${nomeDaUf} `, ` ${nome} de ${nomeDaUf} `] : []),
    ...ANTES_DE_CIDADE.map(antes => ` ${antes} ${nome} `),
  ];
}

function formasDaUf(uf: RadarTerritoryUf): string[] {
  const nome = plano(uf.nome).trim();
  if (!uf.ambiguous) return [` ${nome} `];
  return [` ${nome} ${uf.sigla.toLowerCase()} `, ...ANTES_DE_UF.map(antes => ` ${antes} ${nome} `)];
}

const LUGARES: readonly Lugar[] = [
  ...RADAR_TERRITORY_CITIES.map(cidade => ({ rotulo: cidade.nome, formas: formasDaCidade(cidade) })),
  ...RADAR_TERRITORY_UFS.map(uf => ({ rotulo: uf.nome, formas: formasDaUf(uf) })),
].sort((a, b) => Math.max(...b.formas.map(forma => forma.length)) - Math.max(...a.formas.map(forma => forma.length)));

/** O host e o caminho de um endereço, como texto ("/internet-fibra-curitiba-pr" → "internet fibra curitiba pr"). */
function textoDaUrl(url: string | null | undefined): string {
  const bruto = String(url || "").trim();
  if (!bruto) return "";
  try {
    const endereco = new URL(bruto);
    let caminho = endereco.pathname;
    try { caminho = decodeURIComponent(caminho); } catch { /* caminho com % solto: o texto serve. */ }
    return `${endereco.hostname.replace(/^www\./, "")} ${caminho}`;
  } catch {
    return bruto;
  }
}

/** Os lugares do gazetteer que o texto cita (o nome mais longo primeiro: "Mato Grosso do Sul" não vira também "Mato Grosso"). */
function lugaresCitados(texto: string): string[] {
  let resto = plano(texto);
  const citados: string[] = [];
  for (const lugar of LUGARES) {
    const forma = lugar.formas.find(item => resto.includes(item));
    if (!forma) continue;
    if (!citados.includes(lugar.rotulo)) citados.push(lugar.rotulo);
    for (const item of lugar.formas) resto = resto.split(item).join(" ");
  }
  return citados;
}

/** O texto cita a localidade da marca (cidade ou apelido do catálogo)? */
function citaAMarca(texto: string, territorio: BrandSerpTerritory): boolean {
  const lido = plano(texto);
  return [territorio.city, ...territorio.aliases].map(item => plano(item)).filter(item => item.trim()).some(item => lido.includes(item));
}

/**
 * 2026-10-18 · D11 geográfico: a OUTRA localidade que o resultado cita (título,
 * trecho, cabeçalhos e o endereço), quando cita uma cidade ou UF do gazetteer
 * diferente da marca E não cita a da marca; `null` quando não é o caso. Página
 * nacional (sem cidade nem UF) continua relevante. Sem território, nada sai.
 */
export function radarTerritoryOtherLocality(texto: string | null | undefined, url: string | null | undefined, territorio: BrandSerpTerritory | null | undefined): string | null {
  if (!territorio) return null;
  const tudo = `${String(texto || "")} · ${textoDaUrl(url)}`;
  if (citaAMarca(tudo, territorio)) return null;
  const daMarca = new Set([plano(territorio.city).trim(), plano(ufPorSigla.get(territorio.uf)?.nome).trim()]);
  const outros = lugaresCitados(tudo).filter(rotulo => !daMarca.has(plano(rotulo).trim()));
  return outros.length ? outros.slice(0, 2).join(", ") : null;
}

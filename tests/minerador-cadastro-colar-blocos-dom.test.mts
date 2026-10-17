import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";
import { PLANO_EM_BLOCOS_DO_DONO, PLANO_EM_BLOCOS_ESPERADO } from "./minerador-plano-blocos-fixture.mts";
import { COLUNAS_IGNORADAS_DO_CSV, PLANEJAMENTO_CSV_BYTES, PLANEJAMENTO_CSV_DO_DONO, SILO_PLANOS_ESPERADO, SILO_WIFI_ESPERADO, TRECHOS_DAS_COLUNAS_IGNORADAS } from "./minerador-plano-csv-fixture.mts";

/*
 * 2026-10-16 · O CARD "CADASTRAR ASSUNTOS", RENDERIZADO (happy-dom), COM O TEXTO
 * DO DONO. O dono: "perdeu a capacidade de se adaptar e autopreencher". Colar o
 * plano em blocos (Silo/Pilar/Suporte sem número, título/keyword/slug/descrição
 * sem rótulo) em QUALQUER campo do card preenche o Silo e as 8 linhas — o MESMO
 * leitor (`parseDeclaredPlanText`) pelo MESMO detector. Nada é gravado: o card
 * só fala com o servidor na prévia. Sem rede, sem banco, sem custo.
 */

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

const { SubjectCadastroCard } = await import("../modules/minerador/subject-cadastro-card.tsx");

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => { tela = await montarRadar(); chamadasDeRede = 0; });
test.afterEach(() => { tela?.destroy(); tela = null; });

const BRAND = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";

async function abrirCard() {
  await tela!.render(React.createElement(SubjectCadastroCard, { brandId: BRAND, groups: [], onClose: () => undefined, onApplied: () => undefined, onUnavailable: () => undefined }));
}

/** O "colar" do navegador: o evento `paste` com o texto da área de transferência. */
async function colar(alvo: Element, texto: string) {
  const EventoGlobal = (globalThis as unknown as { Event: typeof Event }).Event;
  const evento = new EventoGlobal("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(evento, "clipboardData", { value: { getData: () => texto } });
  await React.act(async () => { alvo.dispatchEvent(evento); });
  return evento;
}

const campoDoRotulo = (texto: string) => {
  const rotulo = [...tela!.container.querySelectorAll("label")].find(label => label.textContent?.trim() === texto) as HTMLLabelElement | undefined;
  assert.ok(rotulo, `rótulo "${texto}"`);
  const campo = tela!.container.ownerDocument.getElementById(rotulo.htmlFor);
  assert.ok(campo, `campo de "${texto}"`);
  return campo as HTMLInputElement;
};
const daLinha = (rotulo: string, linha: number) => tela!.container.querySelector(`[aria-label="${rotulo} da linha ${linha}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
const linhas = () => tela!.container.querySelectorAll("[data-subject-cadastro-linhas] tbody tr");

function conferirAsOitoLinhas() {
  assert.equal(linhas().length, 8, "8 linhas");
  PLANO_EM_BLOCOS_ESPERADO.forEach((esperado, indice) => {
    const n = indice + 1;
    assert.equal(daLinha("Ordem", n)?.value, String(esperado.order), `ordem da linha ${n}`);
    assert.equal(daLinha("Papel", n)?.value, esperado.role, `papel da linha ${n}`);
    assert.equal(daLinha("Assunto", n)?.value, esperado.subject, `Assunto da linha ${n}`);
    assert.equal(daLinha("Keyword", n)?.value, esperado.principal, `keyword da linha ${n}`);
    assert.equal(daLinha("Slug", n)?.value, `/planos-de-internet/${esperado.slug}/`, `slug da linha ${n}`);
    assert.equal(daLinha("Detalhes", n)?.value, esperado.scope, `detalhes da linha ${n}`);
  });
}

test("colar os blocos do dono no \"Nome do Silo\" preenche Silo, slug e as 8 linhas (papel, ordem, Assunto, keyword, slug, detalhes) e diz o formato", async () => {
  await abrirCard();
  assert.equal(linhas().length, 1, "o Silo novo abre com uma linha vazia (Pilar)");
  const evento = await colar(campoDoRotulo("Nome do Silo"), PLANO_EM_BLOCOS_DO_DONO);
  assert.equal(evento.defaultPrevented, true, "o texto do plano não cai inteiro no campo de uma linha");
  assert.equal(campoDoRotulo("Nome do Silo").value, "Planos e contratação");
  assert.equal(campoDoRotulo("Slug").value, "/planos-de-internet/");
  conferirAsOitoLinhas();
  assert.match(tela!.text(), /8 artigo\(s\) lido\(s\) do texto \(formato: blocos \(Silo, Pilar, Suporte\)\); Silo: Planos e contratação/);
  assert.equal(chamadasDeRede, 0, "preencher não fala com o servidor");
});

test("colar na Keyword da linha também preenche tudo; colar uma keyword comum segue o colar normal do campo", async () => {
  await abrirCard();
  const comum = await colar(daLinha("Keyword", 1)!, "internet residencial barata");
  assert.equal(comum.defaultPrevented, false, "uma keyword não é plano");
  assert.equal(linhas().length, 1);
  await colar(daLinha("Keyword", 1)!, PLANO_EM_BLOCOS_DO_DONO);
  conferirAsOitoLinhas();
  assert.equal(chamadasDeRede, 0);
});

/* ===== 2026-10-16 · o CSV de planejamento do dono: 2 Silos, abrir/arrastar o .csv, escolher o Silo ===== */

type LinhaEsperada = { order: number; role: string; subject: string; principal: string; slug: string; scope: string };

function conferirLinhas(esperadas: readonly LinhaEsperada[], siloSlug: string) {
  assert.equal(linhas().length, esperadas.length, `${esperadas.length} linhas`);
  esperadas.forEach((esperado, indice) => {
    const n = indice + 1;
    assert.equal(daLinha("Ordem", n)?.value, String(esperado.order), `ordem da linha ${n}`);
    assert.equal(daLinha("Papel", n)?.value, esperado.role, `papel da linha ${n}`);
    assert.equal(daLinha("Assunto", n)?.value, esperado.subject, `Assunto da linha ${n}`);
    assert.equal(daLinha("Keyword", n)?.value, esperado.principal, `keyword da linha ${n}`);
    assert.equal(daLinha("Slug", n)?.value, `/${siloSlug}/${esperado.slug}/`, `slug da linha ${n}`);
    assert.equal(daLinha("Detalhes", n)?.value, esperado.scope, `detalhes da linha ${n}`);
  });
  const valores = [...tela!.container.querySelectorAll("[data-subject-cadastro-linhas] input, [data-subject-cadastro-linhas] textarea")].map(campo => (campo as HTMLInputElement).value).join(" ");
  for (const trecho of TRECHOS_DAS_COLUNAS_IGNORADAS) assert.ok(!valores.includes(trecho), `"${trecho}" (coluna ignorada) não entra nas linhas`);
}

const chipDoSilo = (nome: string) => tela!.container.querySelector(`[data-subject-cadastro-silo-do-texto="${nome}"] input`) as HTMLInputElement | null;
const campoDoColar = () => tela!.container.querySelector("[data-minerador-subject-cadastro-card] textarea") as HTMLTextAreaElement;

/** O arquivo como o navegador entrega no `input type=file` e no `drop` (nome, tamanho, bytes). */
const arquivo = (nome: string, bytes: Uint8Array) => ({ name: nome, size: bytes.length, type: "text/csv", arrayBuffer: async () => bytes.slice().buffer });

async function disparar(alvo: Element, tipo: string, extras: Record<string, unknown>) {
  const EventoGlobal = (globalThis as unknown as { Event: typeof Event }).Event;
  const evento = new EventoGlobal(tipo, { bubbles: true, cancelable: true });
  for (const [chave, valor] of Object.entries(extras)) Object.defineProperty(evento, chave, { value: valor });
  await React.act(async () => {
    alvo.dispatchEvent(evento);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return evento;
}

async function abrirPeloInput(nome: string, bytes: Uint8Array) {
  const input = tela!.container.querySelector("[data-subject-cadastro-arquivo]") as HTMLInputElement;
  assert.ok(input, "o input do arquivo existe (escondido)");
  Object.defineProperty(input, "files", { value: [arquivo(nome, bytes)], configurable: true });
  await disparar(input, "change", {});
}

/** Windows-1252 de um texto só com letras do Latin-1 (o "Salvar como CSV" do Excel em português). */
const emWindows1252 = (texto: string) => Uint8Array.from([...texto].map(letra => {
  const codigo = letra.charCodeAt(0);
  assert.ok(codigo < 256 && !(codigo >= 0x80 && codigo <= 0x9f), `"${letra}" cabe em um byte`);
  return codigo;
}));

test("colar o CSV de planejamento do dono: o card diz \"Este texto tem 2 Silos … — escolha qual cadastrar agora\" e não preenche; escolher o Silo preenche o topo e as linhas; trocar de Silo troca tudo; as colunas extras ficam numa linha", async () => {
  await abrirCard();
  const evento = await colar(campoDoRotulo("Nome do Silo"), PLANEJAMENTO_CSV_DO_DONO);
  assert.equal(evento.defaultPrevented, true, "o CSV é plano: não cai no campo de uma linha");
  assert.match(tela!.text(), /Este texto tem 2 Silos: Planos e contratação \(8\) · Wi-Fi e fibra óptica \(7\) — escolha qual cadastrar agora/);
  assert.equal(tela!.container.querySelector("[data-subject-cadastro-colunas-ignoradas]")?.textContent, `Colunas ignoradas: ${COLUNAS_IGNORADAS_DO_CSV.join(", ")}.`);
  assert.equal(linhas().length, 1, "nada é preenchido antes da escolha");
  assert.equal(campoDoRotulo("Nome do Silo").value, "");
  assert.ok(chipDoSilo("Planos e contratação") && chipDoSilo("Wi-Fi e fibra óptica"), "uma escolha por Silo do texto");

  await tela!.click(chipDoSilo("Planos e contratação")!);
  assert.equal(chipDoSilo("Planos e contratação")!.checked, true);
  assert.equal(campoDoRotulo("Nome do Silo").value, "Planos e contratação");
  assert.equal(campoDoRotulo("Slug").value, "/planos-de-internet/", "o slug do Silo sai do começo comum dos endereços");
  conferirLinhas(SILO_PLANOS_ESPERADO, "planos-de-internet");
  assert.match(tela!.text(), /8 artigo\(s\) lido\(s\) do texto \(formato: CSV com cabeçalho\); Silo: Planos e contratação/);

  await tela!.click(chipDoSilo("Wi-Fi e fibra óptica")!);
  assert.equal(campoDoRotulo("Nome do Silo").value, "Wi-Fi e fibra óptica");
  assert.equal(campoDoRotulo("Slug").value, "/wifi-e-fibra/");
  conferirLinhas(SILO_WIFI_ESPERADO, "wifi-e-fibra");
  assert.equal(daLinha("Papel", 1)?.value, "Pilar", "o Pilar do Silo 2 é o artigo 9");
  assert.ok(chipDoSilo("Planos e contratação"), "o outro Silo continua disponível no mesmo texto");
  assert.equal(chamadasDeRede, 0, "escolher e preencher não falam com o servidor");
});

test("\"ou abrir um arquivo .csv\" e arrastar o .csv: o arquivo vira o texto do MESMO campo e o MESMO leitor preenche — UTF-8 com BOM (a fixture) e Windows-1252 convertido; arquivo que não é .csv é recusado; nada é gravado", async () => {
  await abrirCard();
  const botao = tela!.container.querySelector("[data-subject-cadastro-abrir-arquivo]") as HTMLButtonElement;
  assert.equal(botao?.textContent, "ou abrir um arquivo .csv");
  const input = tela!.container.querySelector("[data-subject-cadastro-arquivo]") as HTMLInputElement;
  assert.equal(input.type, "file");
  let abriu = 0;
  input.click = () => { abriu += 1; };
  await tela!.click(botao);
  assert.equal(abriu, 1, "o link abre o seletor de arquivo do navegador");

  await abrirPeloInput("wificonecta_planejamento_editorial_15_artigos (1).csv", PLANEJAMENTO_CSV_BYTES);
  assert.equal(campoDoColar().value.replace(/\r\n/g, "\n"), PLANEJAMENTO_CSV_DO_DONO.slice(1).replace(/\r\n/g, "\n"), "o texto do arquivo (sem o BOM) vai para o campo de sempre");
  assert.match(tela!.text(), /Arquivo “wificonecta_planejamento_editorial_15_artigos \(1\)\.csv” aberto \(UTF-8\)\. Nada foi gravado\./);
  assert.match(tela!.text(), /Este texto tem 2 Silos: Planos e contratação \(8\) · Wi-Fi e fibra óptica \(7\)/);
  await tela!.click(chipDoSilo("Planos e contratação")!);
  conferirLinhas(SILO_PLANOS_ESPERADO, "planos-de-internet");

  // Arrastar um .csv salvo pelo Excel em Windows-1252 (um Silo só): preenche direto, com os acentos certos.
  const ansi = emWindows1252([
    "Nº;Hierarquia;Título H1;Palavra-chave;Slug proposto;Intenção;CTA",
    "1;Pilar;Instalação de internet: taxas e prazo;instalação de internet;/planos/instalacao/;Agendamento, cobrança e fidelidade;Confirmar prazo",
    "2;Suporte;Internet no meu CEP: como saber;internet no meu cep;/planos/no-meu-cep/;Viabilidade técnica;Consultar",
  ].join("\r\n"));
  const soltar = await disparar(campoDoColar(), "drop", { dataTransfer: { types: ["Files"], files: [arquivo("plano-excel.csv", ansi)] } });
  assert.equal(soltar.defaultPrevented, true, "o navegador não abre o arquivo por cima do card");
  assert.match(tela!.text(), /Arquivo “plano-excel\.csv” aberto \(Windows-1252, convertido\)\. Nada foi gravado\./);
  assert.equal(tela!.container.querySelector("[data-subject-cadastro-silos-do-texto]"), null, "um Silo só: nada a escolher");
  assert.equal(linhas().length, 2);
  assert.equal(daLinha("Assunto", 1)?.value, "Instalação de internet: taxas e prazo");
  assert.equal(daLinha("Keyword", 1)?.value, "instalação de internet");
  assert.equal(daLinha("Detalhes", 1)?.value, "Agendamento, cobrança e fidelidade");
  assert.equal(daLinha("Papel", 1)?.value, "Pilar");
  assert.equal(campoDoRotulo("Slug").value, "/planos/", "o slug do Silo sai do começo comum dos endereços");
  assert.equal(tela!.container.querySelector("[data-subject-cadastro-colunas-ignoradas]")?.textContent, "Colunas ignoradas: CTA.");

  await abrirPeloInput("plano.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]));
  assert.match(tela!.text(), /“plano\.pdf” não é um \.csv/);
  assert.equal(linhas().length, 2, "o arquivo recusado não mexe nas linhas");
  assert.equal(chamadasDeRede, 0, "abrir o arquivo não fala com o servidor");
});

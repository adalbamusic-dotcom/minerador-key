import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ======  VÍDEOS · GATE 3.1 — A PAUTA RECOLHEU  =========================
 *
 * O conteúdo estava certo; o espaço, não. "Pauta de apoio audiovisual" abria
 * no topo da área, empurrava biblioteca, seleção e casamento para baixo da
 * dobra — e logo abaixo repetia as mesmas quatro pautas como seletor.
 *
 * E as duas listas não liam a mesma coisa: a de cima vinha de
 * `model.deepResearch.blueprint.videoBriefs` (vivo) e a de baixo de
 * `videoSources.briefs` (congelado). Iguais até o primeiro congelamento,
 * divergentes depois — sem ninguém notar.
 *
 * Apresentação apenas. Matcher, transcript, banco, migration, frozen bundle,
 * SERP, providers e seleção de fontes não foram tocados.
 */

const tentativasDeRede: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    tentativasDeRede.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/*
 * A VARREDURA É SOBRE O QUE RENDERIZA, NÃO SOBRE O QUE EXPLICA.
 *
 * Os comentários deste gate NOMEIAM o que foi removido — "Pautas do Radar",
 * `blueprint.videoBriefs` — justamente para dizer por que saíram. Casar com
 * eles reprovaria o código correto, e o conserto óbvio (apagar o comentário)
 * tornaria o arquivo pior.
 */
const semComentarios = (fonte: string) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const workbench = () => readFileSync(new URL("../modules/radar/radar-r3-workbench.tsx", import.meta.url), "utf8");
const painel = () => readFileSync(new URL("../modules/radar/radar-r3-videos-panel.tsx", import.meta.url), "utf8");
const pagina = () => readFileSync(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");
const blueprint = () => readFileSync(new URL("../modules/radar/radar-r3-blueprint.tsx", import.meta.url), "utf8");

function trecho(fonte: string, de: string, ate: string): string {
  const inicio = fonte.indexOf(de);
  assert.notEqual(inicio, -1, `âncora inicial ausente: ${de}`);
  const fim = fonte.indexOf(ate, inicio + de.length);
  assert.notEqual(fim, -1, `âncora final ausente: ${ate}`);
  return fonte.slice(inicio, fim);
}

/* ==========  1 · O DISCLOSURE  ======================================= */

test("VÍDEOS 3.1 · 1 — a pauta virou expansível fechado, sem estado e sem efeito", () => {
  const area = trecho(workbench(), "const areaDeVideos = <div", "const copyDeVideos =");

  assert.match(area, /<details className="[^"]*" data-testid="radar-videos-brief-panel">/);
  assert.match(area, /Pautas audiovisuais da investigação · \{videoSources!\.briefs\.length\}/);

  /*
   * FECHADO POR CONSTRUÇÃO, NÃO POR ESTADO INICIAL.
   *
   * `<details>` sem `open` nasce fechado a cada montagem. Sem `useState`, sem
   * `useEffect`, sem storage: o F5 não tem o que restaurar, e abrir ou fechar
   * não grava nada em lugar nenhum. Um `open={...}` controlado reintroduziria
   * exatamente a pergunta "onde isso é guardado?".
   */
  const bloco = trecho(area, "<details className=", "</details>}");
  assert.equal(/\bopen\b/.test(bloco), false, "TOP_BRIEF_BLOCK_DEFAULT = COLLAPSED");
  assert.equal(/useState|useEffect|localStorage|onToggle|onClick/.test(bloco), false, "EXPAND_COLLAPSE_PROVIDER_CALLS = 0");

  /* §4 · a biblioteca vem antes: o expansível é consulta, não a ação do dia. */
  assert.ok(
    area.indexOf("<RadarR3VideosPanel") < area.indexOf("data-testid=\"radar-videos-brief-panel\""),
    "as fontes vêm antes da pauta recolhida",
  );
});

/* ==========  2 · UMA AUTORIDADE, UMA PROJEÇÃO  ====================== */

test("VÍDEOS 3.1 · 2 — a pauta vem do bundle congelado, e só dele", () => {
  const area = trecho(workbench(), "const areaDeVideos = <div", "const copyDeVideos =");

  /* O expansível lê a MESMA projeção que o painel de baixo consome. */
  assert.match(area, /<RadarVideoBriefList briefs=\{videoSources!\.briefs\} \/>/);
  assert.equal(/blueprint\.videoBriefs/.test(semComentarios(area)), false, "a leitura do blueprint vivo saiu da área");

  /* E a projeção nasce do snapshot congelado. */
  assert.match(pagina(), /const congelado = investigacao\?\.finalizedBundle\?\.blueprint\?\.videoBriefSnapshots \|\| \[\];/);
  assert.match(pagina(), /briefs: congelado\.map\(item => \(\{ briefId: item\.briefId/);

  /*
   * §2 · E ELA CARREGA O QUE O EXPANSÍVEL PRECISA MOSTRAR.
   *
   * Era reduzida — tópico, propósito, o que procurar — e por isso a tela
   * precisava de uma segunda leitura para o bloco relacionado e a evidência.
   * Foi essa segunda leitura que criou a divergência.
   */
  for (const campo of ["relatedSectionTitle: item.relatedSectionTitle", "evidenceNeeded: item.evidenceNeeded", "provenance: item.provenance.map"]) {
    assert.ok(pagina().includes(campo), `a projeção precisa carregar ${campo}`);
  }

  /* O componente preserva os cinco itens do §2. */
  const lista = trecho(blueprint(), "export function RadarVideoBriefList(", "\n}");
  assert.match(lista, /\{brief\.topic\}/);
  assert.match(lista, /Por que um vídeo pode ajudar/);
  assert.match(lista, /O que procurar no material/);
  assert.match(lista, /Complementa o bloco: \{brief\.relatedSectionTitle\}/);
  assert.match(lista, /\{brief\.evidenceNeeded\}/);
  assert.match(lista, /data-testid="radar-video-brief-provenance"/);
});

/* ==========  3 · A DUPLICAÇÃO SUMIU  ================================ */

test("VÍDEOS 3.1 · 3 — existe uma única projeção visível de pauta", () => {
  const fonte = semComentarios(painel());

  assert.equal(fonte.includes("Pautas do Radar"), false, "a segunda lista não sobreviveu");
  assert.equal(/data-testid="radar-videos-briefs"/.test(fonte), false);
  assert.equal(/data-testid="radar-videos-briefs-empty"/.test(fonte), false);
  assert.equal(/radar-videos-brief-\$\{pauta\.briefId\}/.test(fonte), false, "o seletor por pauta saiu junto");

  /* E o estado que só existia para ele foi embora — sem sobra. */
  assert.equal(/pautaAberta|setPautaAberta/.test(fonte), false, "BRIEF_PROJECTIONS_VISIBLE = 1");

  /* O painel de baixo não repete o briefing: ele mostra desfecho. */
  const resultado = trecho(fonte, "data-testid=\"radar-videos-brief-extracts\"", "</div>}");
  assert.equal(/narrativePurpose|whatToLookFor/.test(resultado), false, "§5 · nada de briefing no resultado");
});

/* ==========  4 · O RESULTADO, POR PAUTA  =========================== */

test("VÍDEOS 3.1 · 4 — depois do casamento, cada pauta diz o que deu", () => {
  const fonte = painel();
  const resultado = trecho(fonte, "{cobertura && <div className=\"mt-3 space-y-2\"", "</div>}");

  /* §5 · estado, fonte, trecho original, tempos e o que faltou. */
  assert.match(resultado, /data-testid=\{`radar-videos-result-\$\{pauta\.briefId\}`\}/);
  assert.match(resultado, /\{dela\?\.state \|\| "NOT_FOUND"\}/);
  assert.match(resultado, /data-testid=\{`radar-videos-brief-empty-\$\{pauta\.briefId\}`\}/);
  assert.match(resultado, /\{dela\?\.reason \|\| "Esta pauta não foi alcançada/);
  assert.match(fonte, /\{tempoLegivel\(trecho\.startMs\)\}–\{tempoLegivel\(trecho\.endMs\)\}/);
  assert.match(fonte, /\{trecho\.originalText\}/);

  /*
   * §6 · SEM CASAMENTO, SÓ ESTADO E CTA.
   *
   * O resultado inteiro está atrás de `cobertura`; a frase de prontidão é uma
   * só e carrega o mesmo estado que habilita o botão.
   */
  assert.match(fonte, /data-testid="radar-videos-coverage-summary" data-readiness=\{prontidao\.state\}/);
  assert.equal(/briefsUnavailableReason \|\| prontidao\.reason/.test(fonte), false);
});

/* ==========  5 · ZERO EFEITO COLATERAL  ============================ */

test("VÍDEOS 3.1 · 5 — nada além da apresentação mudou", () => {
  const fonte = painel();

  /*
   * O QUE ESTE GATE NÃO PODIA TOCAR.
   *
   * A varredura é sobre o PAINEL: ele não ganhou escrita, provider, nem
   * decisão de domínio. O casamento continua sendo ação humana, e a prontidão
   * continua vindo do domínio.
   */
  assert.match(fonte, /const prontidao = radarMatchingReadiness\(\{/);
  assert.match(fonte, /disabled=\{!onRunMatching \|\| ocupado \|\| vista\?\.matching \|\| !prontidao\.canRun\}/);
  assert.equal(/fetch\(|dataforseo|supabase/i.test(fonte), false, "o painel não fala com o servidor");
  assert.equal(/matchRadarVideoBriefs|anchorRadarExtract/.test(fonte), false, "MATCHER_CHANGED = NO");
  assert.equal(/transcript.*extrair|readRadarPublicTranscript/i.test(fonte), false, "TRANSCRIPT_CHANGED = NO");

  /* A ordem do §4 na área principal, com o expansível fechado. */
  const marcas = ["radar-videos-registered", "radar-videos-extracted", "radar-videos-run-matching", "radar-videos-brief-extracts"];
  let anterior = -1;
  for (const marca of marcas) {
    const posicao = fonte.indexOf(marca, anterior + 1);
    assert.notEqual(posicao, -1, `marca ausente depois da anterior: ${marca}`);
    assert.ok(posicao > anterior, `${marca} fora de ordem`);
    anterior = posicao;
  }
});

test("VÍDEOS 3.1 · nenhuma chamada de rede saiu desta suíte", () => {
  assert.deepEqual(tentativasDeRede, [], `PROVIDER_CALLS = 0 — ${tentativasDeRede.join(", ")}`);
});

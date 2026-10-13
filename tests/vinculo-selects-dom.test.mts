import assert from "node:assert/strict";
import test from "node:test";
import { montarRadar, React, type RadarDomScreen } from "./radar-dom-harness.mts";

/*
 * OS SELECTS DO VÍNCULO, RENDERIZADOS (pedido do dono, 2026-09-24).
 *
 * O componente real (`vinculo-selects.tsx`) no DOM:
 *
 *   1. Posto e Potencial com os rótulos e valores da Revisão Humana, e nenhum
 *      "Não mudar" (o Assunto saiu do Vínculo em 2026-10-13);
 *   2. em grupo, o marcador "Valores diferentes" aparece selecionado e
 *      desabilitado, e escolher um valor de verdade o substitui;
 *   3. só o select que o humano mudou vira ação; voltar ao valor comum desfaz.
 *
 * Roda em `pnpm run test:minerador:dom` (e dentro de `pnpm test`), com o
 * loader de runtime dos testes de DOM.
 *
 * Fixtures, sem rede.
 */

const { VinculoPageTypeSelect, VinculoPostSelect } = await import("../components/editorial/vinculo-selects.tsx");
const {
  EMPTY_VINCULO_BATCH_CHOICES,
  chooseVinculoBatchSelect,
  commonVinculoSelectValues,
  vinculoBatchActionsFromChoices,
  vinculoBatchSelectValue,
} = await import("../lib/minerador/vinculo-screen.ts");
const { setKeywordPageType } = await import("../lib/minerador/keyword-page-type.ts");
const { setKeywordSubject } = await import("../lib/minerador/keyword-subject.ts");

type Choices = typeof EMPTY_VINCULO_BATCH_CHOICES;

let chamadasDeRede = 0;
globalThis.fetch = (() => { chamadasDeRede += 1; return Promise.reject(new Error("REDE PROIBIDA NESTE TESTE")); }) as typeof fetch;

const ACTOR = "3f0c9a52-8b1e-4c7d-9f2a-5e6b7c8d9e0f";
const AT = "2026-09-24T12:00:00+00:00";
const nova = { status: "bruto", analise_semantica: { nicho: "Clínicas" } };
const siloDeclarado = { status: "bruto", analise_semantica: setKeywordPageType({ nicho: "Clínicas" }, { pageType: "silo", stance: "declared", actorId: ACTOR, changedAt: AT }).semantic };
const comAssunto = { status: "bruto", analise_semantica: (setKeywordSubject({ nicho: "Clínicas" }, { note: null, actorId: ACTOR, changedAt: AT, origin: "import" }) as { semantic: Record<string, unknown> }).semantic };

let tela: RadarDomScreen | null = null;
test.beforeEach(async () => { tela = await montarRadar(); });
test.afterEach(() => { tela?.destroy(); tela = null; });

/** O painel do rodapé em miniatura: o mesmo estado e as mesmas funções do workspace. */
function Painel({ items, onChoices }: { items: { status: string; analise_semantica: Record<string, unknown> }[]; onChoices: (choices: Choices) => void }) {
  const common = React.useMemo(() => commonVinculoSelectValues(items), [items]);
  const [choices, setChoices] = React.useState<Choices>({ ...EMPTY_VINCULO_BATCH_CHOICES });
  React.useEffect(() => { onChoices(choices); }, [choices, onChoices]);
  const choose = (key: "post" | "page_type", value: string) => setChoices(current => chooseVinculoBatchSelect(current, key, value, common));
  return React.createElement("div", null,
    React.createElement(VinculoPostSelect, { id: "post", value: vinculoBatchSelectValue("post", choices, common), onChange: (value: string) => choose("post", value) }),
    React.createElement(VinculoPageTypeSelect, { id: "page-type", value: vinculoBatchSelectValue("page_type", choices, common), published: common.publishedOnly, currentValue: common.page_type, onChange: (value: string) => choose("page_type", value) }),
  );
}

function select(id: string): HTMLSelectElement {
  const element = tela!.container.querySelector(`#${id}`);
  assert.ok(element, id);
  return element as HTMLSelectElement;
}

function optionTexts(element: HTMLSelectElement): string[] {
  return [...element.querySelectorAll("option")].map(option => option.textContent || "");
}

test("os rótulos e valores da Revisão Humana, sem Não mudar e, desde 2026-10-13, sem Assunto", async () => {
  let last: Choices | null = null;
  await tela!.render(React.createElement(Painel, { items: [nova, comAssunto], onChoices: (choices: Choices) => { last = choices; } }));
  assert.equal(tela!.container.querySelector("label[for=post]")?.textContent, "Posto de principal");
  assert.equal(tela!.container.querySelector("label[for=page-type]")?.textContent, "Potencial de página");
  assert.equal(tela!.container.querySelectorAll("select").length, 2, "só Posto e Potencial");
  assert.equal(tela!.container.querySelector("[data-vinculo-select=subject]"), null);
  assert.doesNotMatch(tela!.text(), /Assunto|Declarado$|Nota: o que é/);
  assert.deepEqual(optionTexts(select("post")), ["Livre", "Travado ao slug"]);
  assert.equal(optionTexts(select("page-type")).length, 8, "4 potenciais e 4 declarados");
  assert.doesNotMatch(tela!.text(), /Não mudar|Valores diferentes/, "a keyword com Assunto tem os mesmos valores das outras");
  assert.equal(select("post").value, "reviewable", "o default aparece como valor");
  assert.equal(select("post").disabled, false, "o Posto não se desliga por causa do Assunto");
  assert.equal(select("page-type").value, "potential:article");
  assert.deepEqual(vinculoBatchActionsFromChoices(last!), [], "nada a gravar sem mudança");
  assert.equal(chamadasDeRede, 0);
});

test("Valores diferentes aparece desabilitado e some quando o humano escolhe", async () => {
  let last: Choices | null = null;
  await tela!.render(React.createElement(Painel, { items: [nova, siloDeclarado], onChoices: (choices: Choices) => { last = choices; } }));
  const pageType = select("page-type");
  assert.equal(pageType.value, "__mixed__");
  const marker = pageType.querySelector("option[value=__mixed__]") as HTMLOptionElement | null;
  assert.ok(marker);
  assert.equal(marker.textContent, "Valores diferentes");
  assert.equal(marker.disabled, true, "o marcador não é escolha");
  assert.equal(select("post").value, "reviewable", "o que é comum aparece normalmente");

  await tela!.select(pageType, "declared:landing_page");
  assert.equal(select("page-type").value, "declared:landing_page");
  assert.equal(select("page-type").querySelector("option[value=__mixed__]"), null, "escolhido, o marcador sai");
  assert.deepEqual(vinculoBatchActionsFromChoices(last!), [{ kind: "page_type", pageType: "landing_page", stance: "declared" }], "só o select mudado grava");
});

test("voltar ao valor comum desfaz", async () => {
  let last: Choices | null = null;
  await tela!.render(React.createElement(Painel, { items: [nova, nova], onChoices: (choices: Choices) => { last = choices; } }));
  await tela!.select(select("post"), "locked");
  assert.equal(last!.post, "post:locked");
  await tela!.select(select("post"), "reviewable");
  assert.equal(last!.post, "", "o valor de todas não grava");
  await tela!.select(select("post"), "locked");
  assert.deepEqual(vinculoBatchActionsFromChoices(last!), [{ kind: "post", policy: "locked" }]);
  assert.equal(chamadasDeRede, 0);
});

test("publicada sem tipo determinado: o select mostra o valor da coluna, e a declarada é mudança", async () => {
  const site = "https://clinicaexemplo.com.br";
  const publicadaSemTipo = {
    status: "bruto",
    analise_semantica: {
      nicho: "Clínicas",
      site_origin: {
        sourceUrl: `${site}/marketing-para-clinicas`,
        resolvedUrl: `${site}/marketing-para-clinicas`,
        canonicalUrl: `${site}/marketing-para-clinicas`,
        urlSituation: "canonical_confirmed", publicationStatus: "published",
        lastCheckedAt: "2026-09-20T23:30:00+00:00",
        publicationConfirmedBy: ACTOR, publicationConfirmedAt: "2026-09-20T23:40:00+00:00",
      },
    },
  };
  let last: Choices | null = null;
  await tela!.render(React.createElement(Painel, { items: [publicadaSemTipo, publicadaSemTipo], onChoices: (choices: Choices) => { last = choices; } }));
  const pageType = select("page-type");
  assert.equal(tela!.container.querySelector("label[for=page-type]")?.textContent, "A página publicada é");
  assert.equal(pageType.value, "potential:article");
  assert.equal(pageType.selectedOptions[0]?.textContent, "Artigo · potencial", "o mesmo rótulo da coluna, não a primeira declarada");
  assert.deepEqual(optionTexts(pageType), ["Artigo · potencial", "Artigo · declarado", "Silo · declarado", "Landing page · declarado", "Página de serviço · declarado"]);

  await tela!.select(pageType, "declared:article");
  assert.deepEqual(vinculoBatchActionsFromChoices(last!), [{ kind: "page_type", pageType: "article", stance: "declared" }], "Artigo · declarado grava");
  assert.equal(optionTexts(select("page-type"))[0], "Artigo · potencial", "o valor atual continua na lista para desfazer");
  await tela!.select(select("page-type"), "potential:article");
  assert.deepEqual(vinculoBatchActionsFromChoices(last!), [], "voltar ao valor atual desfaz");
  assert.equal(chamadasDeRede, 0);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(new URL("../modules/minerador/minerador-workspace.tsx", import.meta.url), "utf8");
const discoverySearch = await readFile(new URL("../modules/minerador/discovery/discovery-search-row.tsx", import.meta.url), "utf8");
const discoveryFilters = await readFile(new URL("../modules/minerador/discovery/discovery-filter-row.tsx", import.meta.url), "utf8");
const discoveryTable = await readFile(new URL("../modules/minerador/discovery/discovery-table-placeholder.tsx", import.meta.url), "utf8");
const processAction = await readFile(new URL("../modules/minerador/minerador-process-action.tsx", import.meta.url), "utf8");
const dnaPanel = await readFile(new URL("../components/editorial/dna-panels.tsx", import.meta.url), "utf8");

test("Minerador aplica InfoHint aos conceitos do primeiro lote", () => {
  for (const marker of [
    'title="Relação com conteúdo publicado" description="Indica se a keyword está livre, possui uma página candidata, foi verificada ou já está vinculada a uma publicação como principal ou secundária."',
    'title="Concorrência encontrada para a busca" description="Mostra a quantidade medida pelo processo de concorrência orgânica usada, junto com o Volume, no cálculo e na avaliação da oportunidade."',
    'title="Relação entre demanda e concorrência" description="Compara Resultado e Volume para ajudar na triagem de oportunidades. É um indicador de apoio e não aprova ou reprova uma keyword automaticamente."',
    'title="Demanda mensal da keyword" description="Demanda mensal medida para a keyword no contexto configurado."',
    'title="Valor comercial do clique" description="Custo médio por clique informado pelo Google Ads; ajuda a perceber valor e competição comercial."',
    'title="Dificuldade orgânica estimada" description="Estimativa de dificuldade orgânica disponível para a keyword."',
    'title="Leitura de intenção da busca" description="Intenção canônica atual do KeywordDNA, considerando a lógica e as decisões humanas já consolidadas."',
    'title="Contexto de mercado" description="Contexto de mercado identificado para a keyword."',
    'title="Etapa provável da jornada" description="TOFU é o topo do funil: descoberta e buscas amplas. MOFU é o meio: consideração e comparação de alternativas. BOFU é o fundo: busca mais próxima de contratar, comprar, agendar ou realizar outra ação."',
    'title="Organização editorial" description="Organização editorial à qual a keyword está associada."',
    'title="Decisão editorial da keyword" description="Mostra o estado de decisão da keyword no Minerador. Não representa publicação: o vínculo com conteúdo publicado aparece separadamente em Vínculo."',
  ]) {
    assert.match(workspace, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(dnaPanel, /title="Perfil da keyword" description="Reúne os dados estratégicos consolidados desta keyword para apoiar a decisão editorial."/);
});

test("Descoberta explica os campos de intenção, funil e o filtro de volume", () => {
  assert.match(discoverySearch, /htmlFor="discovery-preliminary-intent"[\s\S]*?<InfoHint title="Intenção preliminar da descoberta"/);
  assert.match(discoverySearch, /htmlFor="discovery-funnel"[\s\S]*?<InfoHint title="Etapa preliminar da jornada"/);
  assert.match(discoveryFilters, /<InfoHint title="Filtro de volume" description="Filtra localmente pela média de pesquisas mensais já disponível; alterar o filtro não consulta o provedor."/);
});

test("InfoHint acompanha as ações sem substituir handlers nem pré-condições visíveis", () => {
  for (const [title, handler] of [
    ["Interpretar o significado da keyword", "handleQualifySelected"],
    ["Atualizar demanda de busca", "handleBatchQualify"],
    ["Medir concorrência orgânica", "handleBatchAllintitle"],
    ["Apresentação contextual da keyword", "handleBatchContextualPresentation"],
    ["Confirmar as decisões do KeywordDNA", "handleOpenHumanReview"],
  ] as const) {
    const start = workspace.indexOf(`title="${title}"`);
    assert.ok(start >= 0, `${title} precisa usar InfoHint`);
    assert.match(workspace.slice(start, start + 900), new RegExp(`onClick=.*${handler}`));
  }
  assert.match(processAction, /<InfoHint title=\{title\} description=\{description\}>[\s\S]*\{icon\}[\s\S]*<InlineLabelCluster[\s\S]*label=\{<span className=\{labelClassName\}>\{label\}<\/span>\}[\s\S]*info=\{<span[\s\S]*<InfoHintGlyph \/>/);
  assert.equal((processAction.match(/<button/g) || []).length, 1);
  assert.match(workspace, /architectHandoffGate\.reason/);
  assert.match(workspace, /id="minerador-architect-handoff-gate"/);
});

test("o lote não cria tooltips locais nem esconde navegação ou requisitos operacionais", () => {
  for (const source of [workspace, discoverySearch, discoveryFilters, discoveryTable, processAction, dnaPanel]) {
    assert.doesNotMatch(source, /querySelector|data-target|mouseover|@radix-ui\/react-tooltip/);
  }
  assert.match(workspace, /setMoreActionsOpen\(current => !current\)/);
  assert.match(discoverySearch, /discovery-mode-help/);
  assert.match(discoveryFilters, /Aplicado somente ao clicar em Descobrir Keywords/);
});

test("processos e Descobrir mantêm glyph independente e triggers textuais sem glyph", () => {
  assert.match(processAction, /<InlineLabelCluster[\s\S]*info=\{<span[\s\S]*<InfoHintGlyph \/>/);
  assert.doesNotMatch(processAction, /items-center gap-0\.5 rounded-md border border-divider/);
  assert.match(processAction, /<button[\s\S]*\{icon\}[\s\S]*<InlineLabelCluster/);
  assert.doesNotMatch(processAction, /<button[\s\S]*<button/);
  assert.match(workspace, /title="Verificar se a keyword já pertence ao site"[\s\S]*ariaLabel="Conferir site"/);
  assert.match(discoverySearch, /title="Descobrir buscas pela perspectiva do cliente"/);
  assert.match(discoverySearch, /title="Priorizar um comportamento de busca"/);
  assert.match(discoveryTable, /title: "Concorrência encontrada para a busca"/);
  assert.match(discoveryTable, /title: "Demanda mensal da candidata"/);
  assert.match(discoveryTable, /title: "Valor comercial do clique"/);
});

test("os seis botões de processo preservam os glyphs existentes no cluster do label", () => {
  for (const label of ["Conferir site", "Lógica", "Volume", "Resultados", "IA", "Revisar"]) {
    assert.match(workspace, new RegExp(`label="${label}"`));
  }
  assert.equal((processAction.match(/<InfoHint title=\{title\}/g) || []).length, 1);
  assert.match(processAction, /<InfoHint title=\{title\} description=\{description\}>/);
});

test("Funil exibe ajuda específica sem participar da ordenação", () => {
  const funnelHeaderStart = workspace.indexOf('label="Funil"');
  assert.ok(funnelHeaderStart >= 0);
  const funnelHeader = workspace.slice(funnelHeaderStart, funnelHeaderStart + 700);
  assert.match(funnelHeader, /<InfoHint title="Etapa provável da jornada"/);
  assert.match(funnelHeader, /TOFU é o topo do funil/);
  assert.match(funnelHeader, /MOFU é o meio/);
  assert.match(funnelHeader, /BOFU é o fundo/);
  assert.match(funnelHeader, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(funnelHeader, /onClick=\{\(\) => handleSort/);
});

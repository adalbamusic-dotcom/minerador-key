import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/*
 * ======  E2 · QUAIS ROTAS PEDEM A MESA EDITORIAL  ==========================
 *
 * Depois da E2 (SDD de egress 2026-09-23), `EditorialPipelineProvider` só lê
 * `/api/inteligencia` e `/api/editorial/workspace` quando um consumidor monta
 * (`useEditorialPipeline`, direto ou por `useReadyPipeline` e
 * `useOperationalRouter`). Logo, "quais rotas carregam a mesa" é "quais rotas
 * alcançam um consumidor". O comportamento do provider é provado no DOM em
 * `editorial-mesa-sob-demanda-dom.test.mts`; aqui fica fixado o mapa:
 *
 *   - o conjunto exato de arquivos consumidores (consumidor novo quebra este
 *     teste e obriga a revisar o mapa);
 *   - as rotas editoriais alcançam o consumidor do seu módulo;
 *   - as rotas sem mesa não alcançam nenhum consumidor. Dois arquivos
 *     compartilhados contêm consumidor e também peças neutras
 *     (`ModuleHeader`, `Field`, `KeywordDnaPanel`): as rotas sem mesa podem
 *     importá-los, mas nunca citar as peças que leem a mesa.
 *
 * Os fontes são lidos sem comentários (o teste não casa com a própria explicação).
 * Rodar: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/editorial-mesa-rotas.test.mts
 */

const RAIZ = process.cwd();
const PROVIDER = "components/editorial-pipeline-context.tsx";
const printer = ts.createPrinter({ removeComments: true });
const cacheCodigo = new Map<string, string>();

function codigo(rel: string): string {
  const cached = cacheCodigo.get(rel);
  if (cached !== undefined) return cached;
  const fonte = readFileSync(path.join(RAIZ, rel), "utf8");
  const arquivo = ts.createSourceFile(rel, fonte, ts.ScriptTarget.Latest, false, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const limpo = printer.printFile(arquivo);
  cacheCodigo.set(rel, limpo);
  return limpo;
}

/* O printer reformata: para casar trechos de código, espaço e quebra viram um espaço. */
const compacto = (rel: string) => codigo(rel).replace(/\s+/g, " ");

const normal = (absoluto: string) => path.relative(RAIZ, absoluto).split(path.sep).join("/");

function resolver(especificador: string, deArquivo: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = path.join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(path.join(RAIZ, deArquivo)), especificador);
  else return null;
  for (const sufixo of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidato = `${base}${sufixo}`;
    if (existsSync(candidato) && statSync(candidato).isFile()) return normal(candidato);
  }
  return null;
}

function fecho(entradas: string[]): Set<string> {
  const vistos = new Set<string>();
  const fila = [...entradas];
  while (fila.length) {
    const atual = fila.pop()!;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    if (!/\.(ts|tsx)$/.test(atual)) continue;
    const { importedFiles } = ts.preProcessFile(readFileSync(path.join(RAIZ, atual), "utf8"), true, true);
    for (const item of importedFiles) {
      const alvo = resolver(item.fileName, atual);
      if (alvo && !vistos.has(alvo)) fila.push(alvo);
    }
  }
  return vistos;
}

function listar(dir: string): string[] {
  const absoluto = path.join(RAIZ, dir);
  if (!existsSync(absoluto)) return [];
  return readdirSync(absoluto, { withFileTypes: true }).flatMap(item => {
    const rel = `${dir}/${item.name}`;
    if (item.isDirectory()) return item.name === "node_modules" ? [] : listar(rel);
    return /\.(ts|tsx)$/.test(item.name) && !item.name.endsWith(".d.ts") ? [rel] : [];
  });
}

/* Chamada, não definição: `useReadyPipeline()` conta, `function useReadyPipeline()` não. */
const CHAMADA_DA_MESA = /(?<!function\s)\b(useEditorialPipeline|useReadyPipeline|useOperationalRouter)\s*\(/;

const CONSUMIDORES = [
  "components/editorial/dna-panels.tsx",
  "components/editorial/operational-screen-shared.tsx",
  "components/editorial/professional-writer.tsx",
  "modules/arquiteto/arquiteto-workspace.tsx",
  "modules/marca/brand-page.tsx",
  "modules/planejador/planner-cockpit-workspace.tsx",
  "modules/planejador/planner-page.tsx",
  "modules/publicacoes/publications-page.tsx",
  "modules/publicacoes/publications-workspace.tsx",
  "modules/radar/radar-analysis-page.tsx",
  "modules/radar/radar-page.tsx",
  "modules/redator/writer-page.tsx",
];

/* Arquivo com consumidor E peças neutras. As peças que leem a mesa, por arquivo. */
const COMPARTILHADOS: Record<string, string[]> = {
  "components/editorial/operational-screen-shared.tsx": ["useReadyPipeline", "useOperationalRouter", "useEditorialPipeline"],
  "components/editorial/dna-panels.tsx": ["ArticleDnaSummary", "useEditorialPipeline"],
};

const LAYOUT_RAIZ = "app/layout.tsx";
const LAYOUT_MARCA = "app/(brand)/[brandRef]/layout.tsx";
const LAYOUT_ADMIN = "app/(admin)/layout.tsx";
const LAYOUT_AGENCIA = "app/(agency)/agencias/[agencyRef]/layout.tsx";

const ROTAS_SEM_MESA: Record<string, string[]> = {
  "/admin": [LAYOUT_ADMIN, "app/(admin)/admin/page.tsx"],
  "/admin/agencias": [LAYOUT_ADMIN, "app/(admin)/admin/agencias/page.tsx"],
  "/admin/marcas": [LAYOUT_ADMIN, "app/(admin)/admin/marcas/page.tsx"],
  "/admin/usuarios": [LAYOUT_ADMIN, "app/(admin)/admin/usuarios/page.tsx"],
  "/agencias/{ref}": [LAYOUT_AGENCIA, "app/(agency)/agencias/[agencyRef]/page.tsx"],
  "/agencias/{ref}/configuracoes": [LAYOUT_AGENCIA, "app/(agency)/agencias/[agencyRef]/configuracoes/page.tsx"],
  "/agencias/{ref}/integracoes": [LAYOUT_AGENCIA, "app/(agency)/agencias/[agencyRef]/integracoes/page.tsx"],
  "/agencias/{ref}/marcas": [LAYOUT_AGENCIA, "app/(agency)/agencias/[agencyRef]/marcas/page.tsx"],
  "/agencias/{ref}/membros": [LAYOUT_AGENCIA, "app/(agency)/agencias/[agencyRef]/membros/page.tsx"],
  "/conta": ["app/(personal)/conta/page.tsx"],
  "/{brandRef}/conta": [LAYOUT_MARCA, "app/(brand)/[brandRef]/conta/page.tsx"],
  "/{brandRef}/minerador": [LAYOUT_MARCA, "app/(brand)/[brandRef]/minerador/page.tsx"],
  "/{brandRef}/minerador/descobrir": [LAYOUT_MARCA, "app/(brand)/[brandRef]/minerador/descobrir/page.tsx"],
  "/cadastro": ["app/cadastro/page.tsx"],
  "/login": ["app/login/page.tsx"],
  "/": ["app/page.tsx"],
  "/selecionar-marca": ["app/selecionar-marca/page.tsx"],
  "/onboarding/agencia": ["app/onboarding/agencia/page.tsx"],
  "/recuperar-senha": ["app/recuperar-senha/page.tsx"],
  "/solicitar-acesso": ["app/solicitar-acesso/page.tsx"],
  "/oauth/consent": ["app/oauth/consent/page.tsx"],
};

const ROTAS_DA_MESA: Record<string, { arquivos: string[]; consumidor: string }> = {
  "/{brandRef}": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/page.tsx"], consumidor: "modules/marca/brand-page.tsx" },
  "/{brandRef}/arquiteto": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/arquiteto/page.tsx"], consumidor: "modules/arquiteto/arquiteto-workspace.tsx" },
  "/{brandRef}/radar": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/radar/page.tsx"], consumidor: "modules/radar/radar-page.tsx" },
  "/{brandRef}/radar/{articleId}": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/radar/[articleId]/page.tsx"], consumidor: "modules/radar/radar-analysis-page.tsx" },
  "/{brandRef}/planejador": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/planejador/page.tsx"], consumidor: "modules/planejador/planner-page.tsx" },
  "/{brandRef}/planejador/{contentPlanId}": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/planejador/[contentPlanId]/page.tsx"], consumidor: "modules/planejador/planner-cockpit-workspace.tsx" },
  "/{brandRef}/redator": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/redator/page.tsx"], consumidor: "modules/redator/writer-page.tsx" },
  "/{brandRef}/publicacoes": { arquivos: [LAYOUT_MARCA, "app/(brand)/[brandRef]/publicacoes/page.tsx"], consumidor: "modules/publicacoes/publications-workspace.tsx" },
};

test("01 · o provider continua no layout raiz: nenhuma tela fica sem contexto", () => {
  const providers = compacto("components/providers.tsx");
  assert.match(providers, /<EditorialPipelineProvider>\{children\}<\/EditorialPipelineProvider>/);
  assert.ok(fecho([LAYOUT_RAIZ]).has("components/providers.tsx"), "app/layout.tsx monta Providers");
  assert.ok(fecho([LAYOUT_RAIZ]).has(PROVIDER));
});

test("02 · a leitura da mesa só começa com consumidor montado", () => {
  const provider = compacto(PROVIDER);
  const efeitoDaCarga = provider.slice(provider.indexOf("if (!mesaDemandada || !selectedBrandId || !actorUserId || snapshots[workspaceKey]) return;"));
  assert.ok(efeitoDaCarga.length < provider.length, "o efeito da carga fria testa a demanda");
  assert.ok(efeitoDaCarga.indexOf("reload()") > 0 && efeitoDaCarga.indexOf("reload()") < efeitoDaCarga.indexOf("}, ["), "a leitura fica atrás da demanda");
  assert.match(provider, /if \(!mesaDemandada \|\| !selectedBrandId \|\| !actorUserId \|\| recoveredBrands\.current\.has\(workspaceKey\)\) return;/, "a cópia local também espera a demanda");
  assert.match(provider, /leituraAutomaticaEmVoo\.current\.get\(chaveDaLeitura\)/, "trava de leitura em voo (R13)");
  assert.match(provider, /Date\.now\(\) - trava\.desde < LEITURA_AUTOMATICA_PRAZO_MS/, "a trava vence: leitura pendurada não trava a chave para sempre");
  assert.match(provider, /if \(leituraAutomaticaEmVoo\.current\.get\(chaveDaLeitura\) === trava\) leituraAutomaticaEmVoo\.current\.delete\(chaveDaLeitura\)/, "a leitura vencida não solta a trava da leitura nova");
  /* A recuperação local não apaga o que a memória já tem (o bootstrap do Arquiteto pode chegar antes). */
  assert.match(provider, /articleVersions: \{ \.\.\.recovered\.articleVersions, \.\.\.current\.articleVersions \}/);
  assert.match(provider, /siloVersions: \{ \.\.\.recovered\.siloVersions, \.\.\.current\.siloVersions \}/);
  assert.match(provider, /siloPageVersions: \{ \.\.\.recovered\.siloPageVersions, \.\.\.current\.siloPageVersions \}/);
  const hook = provider.slice(provider.indexOf("export function useEditorialPipeline()"));
  assert.match(hook, /useEffect\(\(\) => registrarConsumidorDaMesa\?\.\(\), \[registrarConsumidorDaMesa\]\)/, "montar o hook registra a demanda");
  assert.match(hook, /useEditorialPipeline deve ser usado dentro de EditorialPipelineProvider\./, "fora do provider continua falhando");
  /* As duas rotas pesadas continuam com um único chamador no provider. */
  assert.equal(provider.split("/api/inteligencia?marcaId=").length - 1, 1);
  assert.equal(provider.split("/api/editorial/workspace?marcaId=").length - 1, 1);
});

test("03 · o conjunto de consumidores da mesa é exatamente o mapeado", () => {
  const encontrados = ["app", "components", "modules", "lib"].flatMap(listar)
    .filter(rel => rel !== PROVIDER && CHAMADA_DA_MESA.test(codigo(rel)))
    .sort();
  assert.deepEqual(encontrados, [...CONSUMIDORES].sort(), "consumidor novo: atualize o mapa de rotas deste teste e a SDD");
});

for (const [rota, arquivos] of Object.entries(ROTAS_SEM_MESA)) {
  test(`04 · ${rota} não alcança nenhum consumidor da mesa`, () => {
    for (const arquivo of arquivos) assert.ok(existsSync(path.join(RAIZ, arquivo)), `rota mapeada existe: ${arquivo}`);
    const alcancados = fecho([LAYOUT_RAIZ, ...arquivos]);
    const consumidores = CONSUMIDORES.filter(item => alcancados.has(item));
    const proibidos = consumidores.filter(item => !COMPARTILHADOS[item]);
    assert.deepEqual(proibidos, [], `${rota} importa tela que lê a mesa`);
    for (const compartilhado of consumidores) {
      const pecas = COMPARTILHADOS[compartilhado];
      for (const importador of alcancados) {
        if (importador === compartilhado || importador === PROVIDER || !/\.(ts|tsx)$/.test(importador)) continue;
        const fonte = codigo(importador);
        for (const peca of pecas) {
          assert.ok(!new RegExp(`\\b${peca}\\b`).test(fonte), `${rota}: ${importador} usa ${peca}, que lê a mesa`);
        }
      }
    }
  });
}

for (const [rota, { arquivos, consumidor }] of Object.entries(ROTAS_DA_MESA)) {
  test(`05 · ${rota} alcança ${consumidor} e continua sob o provider`, () => {
    const alcancados = fecho([LAYOUT_RAIZ, ...arquivos]);
    assert.ok(alcancados.has(consumidor), `${rota} deveria alcançar ${consumidor}`);
    assert.ok(alcancados.has(PROVIDER));
    assert.ok(CHAMADA_DA_MESA.test(codigo(consumidor)));
  });
}

test("06 · o Minerador importa só o painel neutro de dna-panels", () => {
  const minerador = codigo("modules/minerador/minerador-workspace.tsx");
  assert.match(minerador, /KeywordDnaPanel/);
  assert.doesNotMatch(minerador, /ArticleDnaSummary/);
  const paineis = codigo("components/editorial/dna-panels.tsx");
  const inicio = paineis.indexOf("export function KeywordDnaPanel(");
  const fim = paineis.indexOf("\nexport function ", inicio + 10);
  assert.ok(inicio >= 0 && fim > inicio);
  assert.doesNotMatch(paineis.slice(inicio, fim), CHAMADA_DA_MESA, "KeywordDnaPanel não lê a mesa");
});

# Relatório 1 — Estado real da suíte do Radar — 2026-09-05

Auditoria somente diagnóstica. Nenhum arquivo de teste, script ou fixture foi
alterado. `PROVIDER_CALLS = 0` · `REMOTE_WRITES = 0` · `CODE_FILES_CHANGED = 0`.

Checkout auditado: `b3a312b` (`docs(radar): parecer de condicoes de
desenvolvimento para o Planejador`), com as alterações não commitadas do
working tree preservadas.

---

## Respostas objetivas

### 1. Existe hoje `test:radar` no `package.json`?

**Não.** Os scripts de teste existentes são, na íntegra:

`test`, `test:authz`, `test:arquiteto`, `test:marca`, `test:editorial`,
`test:redator`, `test:operational`, `test:visual-system`,
`test:integrations-runtime`, `test:real-db`.

O `package.json` mudou nesta rodada (três scripts `audit:*` do Arquiteto foram
adicionados e `test:arquiteto` cresceu em 4 arquivos), mas **nenhum script de
Radar foi criado**.

### 2. Quais arquivos ele executa?

Não se aplica — o script não existe.

### 3. Quantos arquivos `tests/radar*.test.mts` ou equivalentes existem?

| Recorte | Quantidade |
| --- | ---: |
| `tests/*.test.mts` no repositório | **375** |
| `tests/radar-*.test.mts` (prefixo) | **36** |
| Arquivos que exercitam o Radar por conteúdo¹ | **48** |
| União dos dois recortes | **49** |

¹ Critério: o arquivo referencia `lib/radar`, `modules/radar`, `RadarItem`,
`RadarPlannerHandoff`, `RadarEvidencePackage`, `radar-analysis`,
`editorial/serp` ou `radar-handoff`.

O parecer anterior falou em **38**; o número correto depende do recorte. Por
prefixo são 36; somando os dois arquivos `arquiteto-radar-handoff-*` chega-se a
38 — que é, provavelmente, a contagem usada. Pelo critério de conteúdo são 49.

### 4. Quantos entram em alguma suíte real?

| Recorte | Executados por algum script | Detalhe |
| --- | ---: | --- |
| `tests/radar-*.test.mts` | **0** | nenhum arquivo de prefixo `radar-` é citado por script algum |
| União (49) | **9** | listados abaixo |

| Arquivo executado | Suíte |
| --- | --- |
| `tests/arquiteto-radar-handoff-context.test.mts` | `test:arquiteto` |
| `tests/arquiteto-radar-handoff-gate.test.mts` | `test:arquiteto` |
| `tests/arquiteto-article-approval-boundary.test.mts` | `test:arquiteto` |
| `tests/arquiteto-serp-formation.test.mts` | `test:arquiteto` |
| `tests/arquiteto-territory-record.test.mts` | `test:arquiteto` |
| `tests/arquiteto-workbench.test.mts` | `test:arquiteto` |
| `tests/editorial-pipeline.test.mts` | `test:editorial` |
| `tests/operational-flow.test.mts` | `test:operational` |
| `tests/identity-keyword-colors.test.mts` | `test:visual-system` |

**Nenhum deles é do módulo Radar.** Os dois primeiros são do Arquiteto e
testam o *lado emissor* do handoff; os demais tocam o Radar de raspão
(rotas, grade operacional, cores).

### 5. Quantos continuam órfãos?

| Recorte | Órfãos |
| --- | ---: |
| `tests/radar-*.test.mts` | **36 de 36** |
| União (49) | **40** |
| Repositório inteiro | **263 de 375** |

Contexto que o Planejador do Radar precisa levar adiante: **o problema não é do
Radar**. 113 dos 375 arquivos são citados por algum script; 263 nunca executam.
O Radar é o caso mais extremo em proporção (100% dos arquivos de prefixo
próprio órfãos), não um caso isolado.

### 6. As duas fixtures ainda falham?

**Sim, ambas, sem mudança.** Execução manual nesta auditoria:

```
node --test tests/radar-*.test.mts
ℹ tests 169 · pass 167 · fail 2
```

| Arquivo | Teste | Natureza da falha |
| --- | --- | --- |
| `tests/radar-hydration.test.mts:28` | `reconcilia item antigo do Radar sem duplicar nem alterar identidade` | **Fixture desatualizada.** O fixture monta um `ArticleDNA` com `as any` e sem `confidence`; `fallbackHierarchyStrategy` (`lib/arquiteto/strategic-context.ts:267-274`) usa `article.confidence` para `score` e para quatro `components`, todos exigidos por `ArticleHierarchyStrategySchema` (`lib/arquiteto/contracts.ts:277-289`). **Risco de produção baixo**: `ArticleDNASchema` exige `confidence`, então um payload real validado sempre a tem. |
| `tests/radar-persistence.test.mts` | arquivo inteiro não carrega | **Defeito de resolução de módulo.** `lib/server/serp-persistence-adapter.ts:1-3` usa três imports relativos **sem extensão**; o runner ESM do Node não resolve. `ERR_MODULE_NOT_FOUND: Cannot find module '…/lib/editorial/contracts'`. Não afeta build nem `tsc` (`moduleResolution: bundler`) — é defeito só sob `node --test`. |

A segunda é a mais grave em consequência: é justamente o arquivo que cobre o
adaptador de persistência de snapshot/revisão SERP — a camada no centro do
readback pós-F5 — e ele está **morto**, não vermelho.

### 7. Houve novas falhas?

**No recorte do Radar, não** — 169/167/2 é idêntico ao relatado antes.

**Fora dele, sim, e o quadro é pior do que o parecer anterior registrou.**
Rodando cada suíte agregada por `npm test` isoladamente:

| Suíte | tests | pass | fail |
| --- | ---: | ---: | ---: |
| `test:authz` | 25 | 23 | **2** |
| `test:arquiteto` | 1480 | 1479 | **1** |
| `test:editorial` | 20 | 16 | **4** |
| `test:redator` | 3 | 3 | 0 |
| `test:operational` | 50 | 41 | **9** |
| **soma** | **1578** | **1562** | **16** |

E há um agravante estrutural: **`npm test` encadeia com `&&` e a primeira
suíte da cadeia (`test:authz`) já falha.** Na prática `npm test` **aborta antes
de chegar em `test:arquiteto`**. O comando canônico do repositório não executa
hoje nem os 1480 testes do Arquiteto.

Classificação das 16 falhas (amostradas):

- `test:editorial` e `test:operational` — **asserções de varredura de código
  fonte** que quebraram em refatorações. Exemplos verificados:
  `editorial-pipeline.test.mts:114` espera `/modules\/conta/` num arquivo que
  hoje é um `redirect("/conta")` de 6 linhas; `operational-flow.test.mts:158`
  espera `/h-screen min-h-0/` num arquivo cuja classe mudou. São testes de
  forma de UI defasados, **não regressões de domínio**.
- `test:arquiteto` — 1 falha pré-existente do Minerador
  (`arquiteto-domain.test.mts:310`), já registrada nos commits do Arquiteto.
- `test:authz` — 2 falhas em `authenticated-tenant-access.test.mts`, também de
  varredura de fonte.

Nenhuma das 16 é do Radar.

### 8. O `1479/1480` incluiu os testes do Radar?

**Não. Categoricamente não.**

`1480 tests · 1479 pass · 1 fail` é exatamente o resultado de **`test:arquiteto`
sozinho** — reproduzido nesta auditoria. Essa suíte cita 100 arquivos, dos
quais **zero** têm prefixo `radar-`. Os únicos arquivos com "radar" no nome que
ela executa são `arquiteto-radar-handoff-context` e
`arquiteto-radar-handoff-gate`, ambos do Arquiteto, testando o emissor.

Portanto: **`1479/1480` é um resultado do Arquiteto e não autoriza nenhuma
afirmação sobre o Radar.** Os 169 testes do Radar não participaram.

### 9. Quais suítes precisam rodar para dizer `RADAR_TESTS=PASS`?

Nenhuma combinação de scripts existentes produz essa afirmação hoje. Para ela
ser honesta seria preciso, no mínimo:

1. **um script que execute os 36 arquivos `tests/radar-*.test.mts`** — hoje só
   alcançáveis por glob manual;
2. **`tests/radar-persistence.test.mts` efetivamente carregando** — enquanto o
   módulo não resolve, o arquivo não é um teste que falha: é um teste que não
   existe em tempo de execução;
3. **`tests/radar-hydration.test.mts` verde** — ou o fixture atualizado, ou a
   falha reclassificada explicitamente como dívida conhecida;
4. **os 6 arquivos do recorte por conteúdo que já rodam em `test:arquiteto` /
   `test:editorial` / `test:operational`** continuarem verdes — hoje
   `editorial-pipeline` e `operational-flow` estão vermelhos, e ambos tocam
   rotas e grade do Radar;
5. **`npm test` deixar de abortar em `test:authz`**, senão qualquer alegação de
   "suíte verde" descreve uma execução que ninguém faz.

Enquanto (1) e (2) não existirem, a frase honesta é: *"169 testes do Radar
passam quando executados manualmente por glob, com 2 falhas conhecidas, e
nenhum deles participa de suíte automatizada."*

---

## Flags

```text
RADAR_TEST_SCRIPT_EXISTS = NO
RADAR_TEST_FILES_TOTAL = 36 (prefixo radar-) | 49 (recorte por conteúdo)
RADAR_TEST_FILES_EXECUTED_BY_SCRIPT = 0 (prefixo) | 9 (recorte, nenhum do módulo Radar)
RADAR_TEST_FILES_ORPHAN = 36 (prefixo) | 40 (recorte)
RADAR_TESTS_CURRENT_PASS = 167
RADAR_TESTS_CURRENT_FAIL = 2
1479_RUN_INCLUDED_RADAR = NO
RADAR_TEST_HARNESS_READY = NO
```

Complementares, porque mudam a leitura das flags acima:

```text
REPO_TEST_FILES_TOTAL = 375
REPO_TEST_FILES_ORPHAN = 263
NPM_TEST_ABORTS_AT = test:authz (encadeamento &&)
NPM_TEST_REACHES_ARQUITETO = NO
AGGREGATE_FAIL_TOTAL = 16 (authz 2 · arquiteto 1 · editorial 4 · operational 9)
FAILURES_IN_RADAR_MODULE = 0
```

---

## Evidência e limitações

**Comandos executados:**

| Comando | Resultado |
| --- | --- |
| `node --test tests/radar-*.test.mts` | 169 / 167 pass / 2 fail |
| `node --test tests/radar-hydration.test.mts tests/radar-persistence.test.mts` | 3 / 1 pass / 2 fail — detalhe da causa capturado |
| `pnpm run test:authz` | 25 / 23 / 2 |
| `pnpm run test:arquiteto` | 1480 / 1479 / 1 |
| `pnpm run test:editorial` | 20 / 16 / 4 |
| `pnpm run test:redator` | 3 / 3 / 0 |
| `pnpm run test:operational` | 50 / 41 / 9 |
| Análise estática de cobertura de scripts | script próprio, em scratchpad fora do repositório |

**Limitações:**

1. A classificação das 16 falhas fora do Radar foi feita por amostragem (uma
   falha inspecionada em detalhe por suíte). O padrão observado — asserção de
   regex sobre conteúdo de arquivo — é consistente, mas não conferi as 16 uma a
   uma.
2. Não avaliei se os 36 arquivos órfãos do Radar **cobrem** o que dizem cobrir.
   "Passa" e "protege" são coisas diferentes; este relatório só responde a
   primeira.
3. Nenhuma fixture foi corrigida, nenhum script criado.

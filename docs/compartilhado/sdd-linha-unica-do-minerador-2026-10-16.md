# SDD — A linha única do Minerador — 2026-10-16

> **Status: APROVADA pelo dono em 2026-10-16 ("segue as recomendações").** Decisões: D1 regra de 14/10 (volume definido fixa a principal mesmo com Livre gravado); D2 Silo com menos de 4 artigos só avisa, em todo lugar; D3 o carregamento não grava o nicho (vira proposta confirmada); D4 remover withdrawKeywordSubject; D5 F0 com F1, depois uma fase por deploy; D6 o Minerador fica só com o allintitle do KGR opcional (custo antes, sem keyword sem volume, carrega a aprovação) e KD/SERP canônica/4 lentes/evidência SERP saem; D7 desfazer só para seleção/filtro/organização, nunca volta dado gravado sem o servidor; D8 o botão antigo Enviar ao Arquiteto sai e o MCP send_keywords_to_arquiteto passa ao modo parcial. Autoriza as fases na ordem, uma por vez, começando pela F0 (só testes). **Andamento:** F0 feita (2026-10-16); F1 feita (2026-10-16, §6 F1).
> Documento só de leitura do código: nenhuma linha de código, teste, migration,
> SQL ou chamada paga foi feita para escrevê-lo. Git só leitura. Commit, push,
> deploy, migration e SQL são do dono (`AGENTS.md` §15).
>
> Módulo proprietário: **Minerador** (KeywordDNA). Consumidor que não pode
> quebrar: **Arquiteto** (lê o pacote aprovado e o plano). Toca o catálogo MCP
> (`lib/agent/platform-catalog.ts`) e `lib/agent/silo-plan.ts` só nas fases
> autorizadas.
>
> Fontes: `AGENTS.md` §0 (0.1–0.5), `docs/00-produto/invariantes.md` (topo),
> `docs/03-minerador/spec.md`, `estado-atual.md`, `backlog.md`; SDDs
> `sdd-plano-declarado-e-grupos-2026-10-12.md`,
> `sdd-cadastro-assunto-na-keyword-2026-10-13.md`,
> `sdd-conversao-assunto-legado-2026-10-13.md`,
> `sdd-acelerar-fluxo-do-plano-2026-10-13.md`,
> `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`,
> `sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`,
> `sdd-cache-local-keywords-conferido-2026-09-23.md`,
> `regras-serp-e-assuntos-2026-09-26.md`.
>
> Legenda: **Verificado no código** (arquivo:linha lido em 2026-10-16),
> **Ainda não verificado** (a fechar na F0), **Planejado**.

## 0. Resumo para o dono

O Minerador já tem a linha certa na maior parte das etapas: o cadastro único
(`importDeclaredPlanWithCore`), a aprovação pelo servidor, o recibo da Pesquisa
por Assunto, a guarda do Assunto. O que sobra são **segundas portas e regras
velhas** que ainda executam ao lado:

1. **A trava da principal tem duas regras.** O Minerador diz "Livre à mão
   vale"; o Arquiteto diz "tem volume, está travada, mesmo Livre". E dois
   leitores calculam a trava sem olhar o volume. O dono vê "Livre" num lugar e
   "Travada" no outro para a mesma keyword.
2. **O tamanho do Silo tem três réguas.** O MCP recusa Silo com menos de 4
   artigos; o cadastro só avisa; o Arquiteto avisa na retirada. E o MCP ainda
   exige a keyword da página do Silo, que desde 15/10 é opcional.
3. **A Lógica e o Status têm dois gravadores.** O botão Lógica grava do
   navegador, sem conferência de concorrência; o MCP, o import e as sugestões
   gravam pelo núcleo do servidor, com conferência e releitura. A aprovação já
   passou para o servidor; rejeitar/bruto ainda é o navegador.
4. **Quase todo o KeywordDNA ainda é gravado pelo navegador** (Vínculo, KGR,
   Revisão Humana, posto, link de publicação, CSV, manual), contra a regra
   §0.4 "um gravador por artefato, no servidor, ao confirmar".
5. **Abrir a tela grava.** O carregamento escreve o nicho das listas, e o nicho
   entra na Lógica.
6. **Caminho morto ligado à rota aposentada.** A Pesquisa por Assunto e o
   colar/CSV ainda têm o código de "declarar a frase como Assunto" chamando a
   rota que responde 410, e a tela ainda mostra "declare-o antes, aqui ou no
   Processador" — portas que não existem desde 13/10.
7. **A spec do Minerador não tem nenhuma decisão de outubro** e ainda descreve
   como vigentes o Assunto no Vínculo, a RapidAPI, a Extensão Chrome, a SERP da
   frase e a aprovação gravada pelo navegador.

A proposta não cria nada: escolhe, para cada etapa, o gravador que **já existe**
e é o mais novo, faz os outros caminhos chamarem ele (ou saírem), e marca o
texto velho como SUBSTITUÍDO. Antes de mexer, a F0 grava os cenários-ouro do
fluxo de hoje.

## 1. Contexto e frases do dono

- 16/10: "revisa no Minerador, porque lá há de ter alguns processos em paralelo
  ou coisas antigas que podem causar bugs; ele também tem que ter uma linha de
  processos só e nele tem que estar implementado até as últimas melhorias.
  Todas as novas melhorias em todas as áreas têm que prevalecer por cima das
  antigas… e isso também tem que ser atualizado nos contratos e no SDD."
- 15/10 (origem do `AGENTS.md` §0): "toda arrumação tem que ser em cima dos
  processos e funcionalidades que já existem em cada área… nada pode ser criado
  outro em paralelo, nem para cada marca, nem para cada tipo de erro ou
  situação"; "vocês não podem ficar mudando as funcionalidades".
- 16/10 (§0.4): "tudo tem que ser formado pelo navegador, e só quando
  confirmar ou finalizar que vai aplicado no servidor".
- 14/10 (C10 R2, Arquiteto): "primeira coisa que tem que olhar é o volume: se
  já está definido, não pode trocar mesmo que só tenha 10 de volume; e depois
  tem que olhar se essa keyword é livre ou já está travada".

## 2. Os princípios do §0 aplicados ao Minerador

| Regra | No Minerador quer dizer |
|---|---|
| §0.1 uma linha | Cada etapa abaixo (§3) tem um botão na tela, uma ferramenta MCP no máximo, e **um núcleo de servidor** que os dois chamam. Plano declarado, publicado, keyword solta, Assunto do formato anterior e marca nova são **casos** da mesma etapa, nunca rota própria. |
| §0.2 SEO semântico | O Minerador qualifica: KeywordDNA (entidade, intenção, problema, resultado) pela Lógica; SERP, quando o dono roda, prevalece (4 lentes). Não agrupa. |
| §0.3 não regressão | Suíte `tests/minerador-linha-unica-cenarios.test.mts` (F0, §6) com os cenários-ouro e a guarda de forma (cada botão/porta uma vez). |
| §0.4 cópia de trabalho | A planilha, os seletores, a prévia do cadastro, a prévia do "Aprovar e enviar" e a lista da Pesquisa por Assunto são cópia de trabalho. Google Ads e SERP só **leem/calculam** no servidor. O KeywordDNA só é gravado pelo núcleo de servidor da etapa, ao confirmar, com revalidação e releitura. |
| §0.5 a nova prevalece | Onde duas regras decidem a mesma coisa, vale a mais recente com data; a velha sai do código ou passa a chamar a nova, e o texto vira SUBSTITUÍDO (§5). |

## 3. A linha única do Minerador (contrato proposto)

Ordem: **Entrada → Deduplicação → Lógica → Volume → (Resultados opcional) →
Revisão/Vínculo/KGR/Trava → Aprovação → Envio ao Arquiteto**, com as etapas
laterais **Grupos**, **Listas**, **Exclusão** e **Sugestões do Arquiteto**.

| Etapa | Cópia de trabalho (navegador) | Servidor só calcula | ÚNICO gravador ao confirmar | Casos da mesma etapa |
|---|---|---|---|---|
| E1 Entrada de keywords | colar/CSV/manual, candidatas da Descoberta e da Pesquisa por Assunto (IndexedDB), linhas do card | plano da pesquisa (hash, custo), recibo do Google Ads | `keyword-import-core.ts` (keyword comum) e `importSubjectDiscoveryWithCore` (sustentação com recibo) — **a confirmar na F0 se os dois já compartilham normalização e dedup** | Descoberta, CSV, manual, Pesquisa por Assunto, sugestão do Arquiteto |
| E2 Cadastro de Assuntos / plano | card "Cadastrar Assuntos" (linhas, trava, destino, append/replace) | prévia com `decisionHash`, quatro listas no replace | `importDeclaredPlanWithCore` (`lib/minerador/declared-plan-import-core.ts`) | Silo novo, Silo existente (append/replace), publicado, conversão do formato anterior (`conversions`), trava pelo Posto (`plans/lock`), MCP `declare_silo_plan`/`convert_legacy_subjects` |
| E3 Deduplicação | — | chave normalizada por marca | a mesma função de chave em E1 e E2 (**Ainda não verificado** quantas existem) | idempotência por `importRequestId`/`operationRequestId` |
| E4 Lógica | seleção | `deriveLogicalKeywordBatchItem` (`lib/minerador/logical-batch.ts:52`) | `runKeywordLogicWithCore` (`lib/server/minerador-keyword-decision-core.ts:123`) | botão Lógica, MCP `run_keyword_logic`, import, sugestões, reaprovar |
| E5 Volume | seleção, prévia de custo | Google Ads | o núcleo do botão Volume / `measure_keywords` (`lib/server/minerador-volume-measure.ts`) e o import com recibo (mesma forma de `volume_measurement`, `origin`) | medição, resposta sem média, recibo da Pesquisa por Assunto, medição guardada das sugestões (replay) |
| E6 Resultados (opcional, pago) | seleção, custo | DataForSEO (allintitle, KD, 4 lentes) | rota `dataforseo/allintitle` (Resultados) | nunca requisito (§78) |
| E7 Revisão / Vínculo / KGR / Trava | seletores da Revisão Humana e "Vínculo das selecionadas" | — | **um** núcleo de decisão no servidor (o do MCP `set_keyword_vinculo`/`set_kgr_applicability` — `persistSemanticDecision`), chamado também pela tela; a trava pelo núcleo do cadastro (`plans/lock`) | publicada (posto), não publicada do plano (trava), KGR aplicável/não, Potencial |
| E8 Aprovação | prévia do "Aprovar e enviar" | `resolveApprovalReadiness` (`lib/minerador/approved-package.ts:73`) | `applyKeywordDecisionEntries` (`minerador-keyword-decision-core.ts`) | uma, lote, D2 (Assunto anterior), D2-bis (principal do plano), Status rejeitado/bruto |
| E9 Envio ao Arquiteto | prévia (três grupos) | `resolveHandoffApprovalGate` | o handoff de sempre (`approve-and-send-core.ts` → `prepareCanonicalHandoff`), pacote por `contentHash` | keyword nova, já recebida (atualiza), grupo com plano (Silo do plano) |
| E10 Grupos | menu de cor | — | `keyword-group-core.ts` / `/api/editorial/groups` | mover, tirar, gerenciar |
| E11 Exclusão | seleção, prévia | impacto | RPCs do ciclo de vida (`keywords/delete`, `delete-group`) | não publicada (definitiva), publicada (24 h), por cor, sobras |
| E12 Sugestões do Arquiteto | caixa por cor | prévia | os núcleos E1/E4/E5 acima, no clique do dono | keyword nova, medir, rodar Lógica |

Regras transversais da linha:

- **Trava da principal = uma função.** `declaredPrincipalLock`
  (`lib/minerador/declared-plan.ts:158`) passa a ser a única, com a regra do
  dono de 14/10 (C10 R2) **se o dono confirmar a D1** (§8): volume definido
  fixa; sem volume, a trava gravada decide. Todo leitor passa o volume.
- **Tamanho do Silo = uma constante.** `SILO_ARTICLE_RANGE`
  (`lib/agent/silo-plan.ts:42`) com **uma** severidade em todo caminho (D2).
- **"Volume medido" = uma leitura.** A mesma função responde no Minerador
  (aprovação, trava, recibo) e no Arquiteto (planilha do plano).
- **Abrir a tela nunca grava.**

## 4. Hoje → linha única (achados)

Ordenado pelo que mais pode causar bug ou confundir o dono.

| # | Etapa | Caminhos hoje (arquivo:linha) | Quem chama | Diferença real | Proposta de linha única | Risco |
|---|---|---|---|---|---|---|
| A1 | Trava da principal | (a) `lib/minerador/declared-plan.ts:167-169` — `plan.lock` gravado vence; (b) `lib/arquiteto/plan-article-sheet.ts:176-178` (`lockView`) — volume > 0 → "Travada · volume definido" antes de olhar a trava; (c) `lib/arquiteto/declared-subject.ts:216` (`planLockOfStanding`) e `lib/minerador/subject-article-view.ts:207` chamam (a) com `volume: null` | (a) Posto/Revisão, card, MCP `declare_silo_plan`/`set_keyword_vinculo plan_lock`; (b) planilha do plano no Arquiteto; (c) selos do plano (`declared-plan-seals.ts:70`) e o bloco "Assunto deste artigo" | Keyword com volume e trava "Livre" gravada: Minerador mostra **Livre**, Arquiteto mostra **Travada**; selos e painel calculam "Livre · sem volume medido" mesmo com volume | Uma regra em `declaredPrincipalLock` (a do dono de 14/10, D1); (b) e (c) chamam ela com o volume lido pela mesma função de A7; o select do Posto diz o efeito antes de gravar | **Alto** — o Arquiteto troca ou recusa trocar a principal por regra diferente da que o dono gravou |
| A2 | Tamanho do Silo / plano | `lib/agent/silo-plan.ts:127-128` **bloqueia** fora de 4–30; `lib/minerador/declared-plan.ts:460` só **avisa** abaixo de 4; `lib/arquiteto/silo-article-withdrawal.ts:235-236` avisa; constantes duplicadas `declared-plan.ts:50,52` × `silo-plan.ts:42`; `silo-plan.ts:50` exige `siloPage.keyword` (min 2) e `platform-mcp-tools.ts:810` diz "página do silo com keyword e slug" | MCP `validate_silo_plan`; card e MCP `declare_silo_plan`; Arquiteto | A IA valida um plano de 3 artigos como bloqueado que o card aceita; e exige a keyword do Silo que o adendo de 15/10 (S2) tornou opcional | `declared-plan.ts` importa `SILO_ARTICLE_RANGE`; uma severidade (D2); `siloPage.keyword` opcional no `SiloPlanSchema`, como no plano gravado (`DeclaredSiloPlanSchema` não tem keyword) | **Alto** para o MCP (IA conduz o dono ao caminho errado); baixo para dados |
| A3 | Lógica | navegador: `modules/minerador/minerador-workspace.tsx:1234-1300` (`processLogicalKeywordDna`, `supabase.update` direto, "antes" = cópia da tela, sem compare-and-swap); servidor: `lib/server/minerador-keyword-decision-core.ts:123-160` (`runKeywordLogicWithCore`, `constrainKeywordSnapshot` + releitura do contrato) | botão Lógica × MCP `run_keyword_logic`, import da Pesquisa por Assunto, sugestões, reaprovar | Mesma derivação, dois gravadores: o do navegador pode sobrescrever uma escrita concorrente (última vence) e grava a partir de uma cópia que pode estar velha | O botão Lógica chama o núcleo do servidor (rota fina ou a rota já existente de decisão); o navegador só mostra a prévia | **Alto** — perda silenciosa de escrita concorrente (ex.: MCP e tela na mesma keyword) |
| A4 | Status | aprovar: servidor (`minerador-workspace.tsx:3245-3250`, `approveOneOnServer`/`openApproveAndSend`); bruto/rejeitado/em revisão: navegador (`:3256-3262`, `update({ status })` sem releitura) | rodapé, card do DNA | Duas portas para a mesma coluna; sem releitura nem trilha do ator no caso do navegador | `applyKeywordDecisionEntries` grava todo status | Médio |
| A5 | KeywordDNA gravado pelo navegador | `minerador-workspace.tsx`: Vínculo em lote `:1544`, `:1560`; link de publicação `:2328`; CSV `:2898`; manual `:2993`; criar lista `:3062`; KGR em lote `:3313`; concluir revisão em lote `:3384`; posto da publicada `:3479`; ação da Revisão Humana `:3552`, `:3688`. MCP: `platform-mcp-tools.ts:137` (`persistSemanticDecision`) | tela × MCP | Para Vínculo/KGR/posto há **dois gravadores** (tela e MCP), com guardas diferentes (o MCP confere hash e relê; a tela grava direto) | Fase por fase (F3–F5), a tela passa a chamar o núcleo do servidor que o MCP já usa; o navegador só monta a cópia de trabalho | Médio (cada um isolado); alto no conjunto (§0.4) |
| A6 | Abrir a tela grava | `minerador-workspace.tsx:1964-1978` — no carregamento, `autoDetectNiche` grava `minerador_keyword_lists.nicho`; o nicho entra na Lógica (`minerador-keyword-decision-core.ts:133-143`) | `fetchData` | Contra a spec ("o carregamento não preenche nem persiste") e o §0.4; a Lógica do servidor passa a dar outro nicho depois de alguém abrir a tela | Remover a escrita no carregamento; nicho da lista vira proposta na cópia de trabalho ou decisão explícita (D3) | Médio |
| A7 | "Volume medido" (duas leituras) | Minerador: `deriveProcessorRevalidation` → `isValidGoogleAdsDemandMeasurement` (`lib/minerador/google-ads-demand.ts:236-240`); Arquiteto: `readPlanRowVolume` (`lib/arquiteto/plan-article-sheet.ts:208-225`) aceita também `demandEvidence.googleAds` da linha remontada do ArticleDNA | aprovação, trava (Minerador) × planilha do plano (Arquiteto) | A mesma keyword pode ter "volume definido" num lado e não no outro (é a origem do "Volume de outra fonte" de 14/10) | Uma função exportada pelo Minerador (`keyword-dna.ts`/`processor-revalidation.ts`) que o Arquiteto chama; "ler o Minerador pelo resolver dele" | Médio |
| A8 | Pesquisa por Assunto: porta morta ligada a rota 410 | `modules/minerador/discovery/use-subject-search.ts:382-387` (`postSubjects` → `subjects/import`), `:397-407`, `:449-466`; `offered: false` fixo em `:421`; `discovery-source-controls.tsx:146,159,207,249` (`subjectEntry` sem chamador, fetch para `subjects/import`) | ninguém (inalcançável) | Código e diálogo do formato velho continuam montados; qualquer mudança no `offered` religa uma porta paralela que grava 410 | Remover o ramo de declaração, `postSubjects`, `subjectEntry`, `subjectPhraseDeclarationPlan`, `subjectIdFromApply`, `defaultDeclarePhraseAsSubject`, `declarePhraseAsSubjectLabel` (já pedido no backlog de 13/10) | Baixo (hoje); alto se religado |
| A9 | Textos que mandam pelo caminho que não existe | `modules/minerador/discovery/subject-search-model.ts:48` ("declare-o antes, aqui ou no Processador"), exibido em `subject-search-dialogs.tsx:218`; `:36` ("se você o declarar no envio"), exibido em `subject-search-fields.tsx:88` | dono, na tela | Manda declarar Assunto na Pesquisa e no Processador, portas fechadas em 13/10 | Texto: "Para ligar a um Assunto, cadastre-o em Cadastrar Assuntos." | Médio (confunde o dono) |
| A10 | Retirada do Assunto | `lib/minerador/keyword-subject.ts:538` `withdrawKeywordSubject` sem chamador | — | Função de retirada fora da lista fechada G4 continua exportada | Sai, ou passa a ser chamada só por "Tirar do plano" (D4) | Baixo |
| A11 | D2-bis pela marca | `lib/minerador/approved-package.ts:118` dispensa Volume pela marca `keyword_declared_principal`; a marca órfã (7 do azul, Assunto perdido) existe | aprovação, envio | **Ainda não verificado** se `resolveDeclaredPrincipal` ignora a marca órfã; se não, keyword sem plano aprova sem Volume | A dispensa exige a marca **e** o Assunto vivo com o plano do mesmo grupo | Médio |
| A12 | Catálogo descreve o formato anterior | `lib/agent/platform-catalog.ts:364-366` ("o Assunto continua declarado… a principal deixa de ser declarada"), que é o formato de duas linhas | IA pelo MCP | No cadastro único o Assunto e a principal são a mesma keyword | Reescrever a operação pelo formato novo, com o anterior como caso | Médio |
| A13 | Spec sem outubro | `docs/03-minerador/spec.md`: nenhuma linha de 2026-10-1x; §67.3 e §67.4.2 (`:871-912`) com o Assunto no Vínculo; §61 (`:713`) "a aprovação continua sendo gravada pelo navegador"; §16 (`:231`) "SERP da frase no cache"; §23–27, §40 RapidAPI; §28 (`:295`) decisão KGR única; §32–44 Extensão Chrome sem marca própria; §17 (`:236`) rotas `mine/volume/analyze/clusterize` | quem lê o contrato (agentes) | A fonte de verdade da área descreve como vigente o que saiu | Lista §5 | Alto para agentes (regressão por leitura) |

**Ainda não verificado nesta escrita (fecha na F0, antes de qualquer código):**
quantas funções de normalização/dedup de keyword existem e quem usa cada uma
(E3); quantos gravadores de volume existem além da rota do botão, do
`measure_keywords` e do import com recibo (E5); resto de SERP/KGR obrigatório
fora da trava já corrigida (`approval-blockers.ts`, `arquiteto-handoff-gates.ts`,
`dna-maturity.ts`); leitores diretos de `minerador_keywords` fora do resolver
(`list_platform_keywords` em `platform-mcp-tools.ts:782` é um deles); rotas de
`app/api/minerador/**` sem chamador; uso do IndexedDB/localStorage como fonte de
decisão; provider aposentado (Serper/RapidAPI) em código e `.env.example`.

## 5. Textos a marcar SUBSTITUÍDO (§0.5)

Cada marca leva a data e "vale agora: …". Nenhum texto é apagado.

| Documento | Trecho | Vale agora |
|---|---|---|
| `docs/03-minerador/spec.md` §67 (nota "três declarações"), §67.3, §67.4.2 | Assunto como 3ª declaração do Vínculo; "O Assunto anula o Posto e o KGR" | SDD cadastro único C7 (13/10): Vínculo só com Posto e Potencial; Assunto na keyword, entra só pelo card |
| spec §61, "Trava no envio" (`:713`) | "a aprovação continua sendo gravada pelo navegador" | SDD acelerar item 2 (13/10): aprovação pelo servidor |
| spec §61 "Exceção do Assunto (D2)" | D2 para todo Assunto | D2 só para o Assunto do formato anterior; D2-bis para a principal do plano (13/10) |
| spec §16 (`:231`) | "a SERP da frase no cache da marca" | SDD SERP/KGR (28/09): Pesquisa por Assunto só Google Ads; recibo do servidor (13/10) |
| spec §23–27, §40 | RapidAPI como provider de volume | Google Ads (§45.1); RapidAPI nunca (SDD 28/09) |
| spec §28 (`:295`) | "decisão KGR única (Aprovar como KGR…)" | §22 revisada e §78 |
| spec §32–44 | Extensão Chrome | Regra vigente de 2026-08-04 (topo da spec) — marcar cada seção, não só o topo |
| spec §17 (`:236`) | `app/api/mine`, `volume`, `analyze`, `clusterize` | rotas de `app/api/minerador/marcas/[brandId]/**` (§3 desta SDD) |
| spec §8–§10 | "analisar, calcular volume/KGR"; "APIs de análise" | linha única §3 |
| spec (novo §79) | — | resumo da linha única + ponteiros para as SDDs de 12–16/10 (plano, cadastro, trava, recibo, listas leves, sugestões, excluir cor) |
| `regras-serp-e-assuntos-2026-09-26.md` B2 | onde se declara (select "Esta lista é", Vínculo, rodapé, Pesquisa por Assunto) | só o card "Cadastrar Assuntos" / `declare_silo_plan` (13/10) |
| idem B3 | "O Assunto no Vínculo" (três declarações) | C7 (13/10) |
| idem B5 | "A principal do artigo é sempre uma keyword com busca"; "Assunto só pode ser a própria principal com Volume validado" | D1-ter (13/10): a keyword que carrega o Assunto pode ser principal sem volume; trava |
| idem B7 | "o volume oficial é medido depois no Processador" | recibo da Pesquisa por Assunto grava o Volume (13/10) |
| `sdd-cadastro-assunto-na-keyword-2026-10-13.md` §3.3 tabela, linha "`plan.lock` gravado → o valor gravado" | trava manual vence o volume | conforme D1 (C10 R2 de 14/10, se confirmado) |
| `sdd-plano-declarado-e-grupos-2026-10-12.md` D3 | "validação do plano, ferramenta MCP, catálogo, telas" com a mesma régua | a severidade única decidida na D2 |
| `lib/agent/platform-catalog.ts` `minerador.withdraw_from_declared_plan` (`:364-366`) | formato de duas linhas | formato do cadastro único, anterior como caso |
| catálogo / descrição de `validate_silo_plan` (`platform-mcp-tools.ts:810`) | "página do silo com keyword e slug" | keyword do Silo opcional (adendo 15/10, S2) |
| `docs/03-minerador/backlog.md` (13/10) | "Limpar o fluxo de Assunto morto…" e "withdrawKeywordSubject" | fechados pela F1 |

## 6. Fases

Cada fase é um deploy próprio, sem migration (nenhuma fase precisa de schema),
com a suíte da F0 verde antes e depois. O Arquiteto lê o Minerador pelo pacote
aprovado e pelo plano: nenhuma fase muda o formato do pacote, do
`keyword_subject` nem do `editorial_groups.plan`.

### F0 — cenários-ouro do fluxo atual (antes de mexer)

Arquivo novo de teste (só fixtures, sem rede, sem banco, sem custo):
`tests/minerador-linha-unica-cenarios.test.mts`, mais a guarda de forma (o
mesmo padrão de `tests/arquiteto-linha-de-processo-guarda.test.mts`: código sem
comentários; cada botão/rota uma vez; nenhuma porta aposentada chamada). A F0
também fecha a lista "Ainda não verificado" do §4 e acrescenta o que achar à
tabela, antes de qualquer correção.

| # | Cenário | Entrada | Passos | Conclusão esperada |
|---|---|---|---|---|
| G1 | Marca sem plano | 5 keywords coladas, marca A | colar → Lógica → Volume (fixture Google Ads, 1 sem média) → aprovar → enviar | 5 aprovadas (a sem média aprova: "Volume processado, sem média oficial"); pacote com `contentHash`; Arquiteto recebe 5; nada da marca B muda |
| G2 | Duplicata e idempotência | o mesmo CSV duas vezes + mesmo `importRequestId` | importar, repetir | zero linha nova na 2ª vez; caixa/acento normalizados iguais; marca B com a mesma keyword intacta |
| G3 | Plano declarado, Silo novo, com keyword do Silo | texto colado com 6 artigos, Pilar = 1, cor Azul | prévia → cadastrar → Lógica → aprovar (D2-bis) → enviar | 6 keywords com `keyword_subject.entry` e `plan`; aprovam só com a Lógica; trava "Livre · sem volume"; Silo do plano chega ao Arquiteto |
| G4 | Plano sem keyword do Silo | mesmo texto sem keyword da página do Silo | idem; `validate_silo_plan` com o mesmo plano | cadastro aceito; MCP **não** bloqueia pela falta da keyword (hoje bloqueia: cenário vermelho até a F2) |
| G5 | Plano com 3 artigos | texto com 3 artigos | prévia do card e `validate_silo_plan` | a **mesma** severidade nos dois (hoje: aviso × bloqueio — vermelho até a F2) |
| G6 | Trava × volume | keyword do plano com volume 10 e `plan.lock = free` | ler a trava no Posto (Minerador), na planilha do plano e nos selos (Arquiteto) | os três dizem o mesmo estado (hoje divergem — vermelho até a F2) |
| G7 | Recadastro append e replace | G3 gravado; colar plano com 1 muda, 1 entra, 1 sai | append; depois replace com `decisionHash` | append não tira nada; replace: quatro listas, a que sai liberada pelo marcador, nada apagado, aprovada que muda volta a "Em revisão" |
| G8 | Assunto nunca se perde | G3 gravado | Lógica, Vínculo, KGR, Revisão, Posto e Volume em cada keyword do plano | `keyword_subject` intacto em todas; só "Tirar do plano" libera |
| G9 | Pesquisa por Assunto com recibo | keyword do G1 + recibo fixture | pesquisar (plano → execute) → importar 3 sustentações | volume gravado com `origin: subject_search`, Lógica rodada, nenhuma declaração de Assunto, nenhuma chamada a `subjects/import` |
| G10 | Publicado | keyword publicada com `site_origin`, posto Travado | cadastro destino "Artigo publicado"; aprovar; enviar | URL/slug/canonical/principal intactos; Assunto na keyword publicada; posto da publicada não vira trava do plano |
| G11 | Keyword solta | keyword sem grupo e sem Assunto | Lógica → Volume → aprovar → enviar | caminho de G1; aparece no Arquiteto como solta (lista da marca) |
| G12 | Formato anterior | Assunto em linha própria + principal com marca | conversão (`conversions`) | Assunto passa para a principal; linha-título viva e arquivada; D2 só para a linha anterior |
| G13 | Concorrência | MCP `run_keyword_logic` e botão Lógica na mesma keyword | rodar os dois com fixtures | nenhum dos dois apaga o que o outro gravou (hoje o navegador não confere: vermelho até a F3) |
| G14 | Abrir não grava | carregar a tela com lista sem nicho | `fetchData` com porta falsa do banco | zero escrita (hoje grava nicho: vermelho até a F3) |
| G15 | Exclusão | keyword não publicada, publicada e do plano | prévia → excluir | não publicada some de vez; publicada vai à lixeira 24 h; do plano é recusada (`KEYWORD_DELETE_SUBJECT_PROTECTED`); lista excluída não apaga keyword |

Os cenários marcados "vermelho até a Fx" entram como `todo` documentado na F0
e viram exigência na fase que os corrige (§0.3: a suíte passa a exigir a regra
nova).

### F1 — tirar as portas mortas e os textos errados (A8, A9, A10, A12, A13 e §5)

> **Status: FEITA em 2026-10-16** (código, testes e documentos; sem deploy, que é do dono). Saíram o ramo que chamava `subjects/import` (a rota fica 410), `withdrawKeywordSubject`, os inserts mortos do navegador e "Criar lista" (E-1), `package-freshness.ts`, os normalizadores da RapidAPI e `seo-keyword-research8`, as sobras da Extensão em `allintitle.ts` e `allintitle-persistence.ts`, as decisões de exclusão do cliente em `keyword-lifecycle.ts` e o `kgrUse: "decisao_pendente"` (S-8/P-8). Textos A9 e catálogo A12 corrigidos; marcas SUBSTITUÍDO do §5 e o §79 da spec feitos. Ficou, por ter consumidor: o "· Assunto" de `keywordVinculoSummary` (Arquiteto, MCP, painel) e `resignApprovalRecord` (script de backfill). Os 7 `todo` da F1 viraram testes normais. Detalhe em `docs/03-minerador/estado-atual.md`. **Validado manualmente: não.**

- Código: remover o ramo de declaração da Pesquisa por Assunto e do
  colar/CSV (A8), a função sem chamador (A10, conforme D4); corrigir os textos
  (A9).
- Documentos: todas as marcas SUBSTITUÍDO do §5; novo §79 na spec; catálogo
  (A12).
- Consumidores: nenhum (código inalcançável). `npm run test:agent` pelo catálogo.
- Dados gravados: nenhum efeito.
- Rollback: reverter o commit.
- Testes: G9 passa a exigir zero chamada a `subjects/import`; guarda de forma.
- Validação do dono: abrir Pesquisa por Assunto → Enviar ao Processador e ler
  o texto; abrir Cadastrar Assuntos.

### F2 — uma régua para trava, tamanho do Silo e volume medido (A1, A2, A7)

- `declaredPrincipalLock` com a regra decidida na D1; `planLockOfStanding`,
  `subject-article-view` e `lockView` chamam ela passando o volume da leitura
  única; uma função de "volume medido" exportada pelo Minerador, que
  `readPlanRowVolume` chama.
- `declared-plan.ts` importa `SILO_ARTICLE_RANGE`; uma severidade (D2);
  `siloPage.keyword` opcional em `SiloPlanSchema`.
- Consumidores: Arquiteto (formação, melhoria, guarda `contradicts_declared`,
  selos, planilha do plano), MCP `validate_silo_plan`/`declare_silo_plan`,
  catálogo. Testes do Arquiteto (`test:arquiteto`, `:servidor`, `:lentes`) e
  `test:agent`.
- Dados gravados: `plan.lock` não muda; só a leitura muda. Com a D1 aceita, uma
  keyword com volume e `lock: free` passa a ler "Travada" também no Minerador; a
  tela diz por quê.
- Rollback: código anterior (leitura volta a ser a de hoje; nada gravado muda).
- Testes: G4, G5, G6 passam a exigir; G3, G7, G10 regressão.
- Validação do dono: WifiConecta azul — mesma keyword no Posto, na planilha do
  plano e no selo.

### F3 — Lógica, Status e abrir a tela pelo servidor (A3, A4, A6)

- O botão Lógica e o Status não-aprovado chamam os núcleos que o MCP já usa
  (`runKeywordLogicWithCore`, `applyKeywordDecisionEntries`), pela rota de
  decisão existente (sem rota nova se a de aprovação aceitar o caso; a F0
  confirma). A escrita do nicho no carregamento sai (D3).
- Consumidores: aprovação e envio (o contrato da Lógica não muda), MCP.
- Dados: nenhum regravado.
- Rollback: código anterior.
- Testes: G13, G14 passam a exigir; G1, G8, G11 regressão.
- Validação do dono: rodar a Lógica num lote de 20 e conferir a barra e a
  releitura; mudar Status para rejeitado.

### F4 — Vínculo, KGR, Revisão Humana e posto pelo núcleo do MCP (A5, parte 1)

- A tela monta a cópia de trabalho e chama o núcleo de `persistSemanticDecision`
  (o mesmo do MCP), com hash e releitura.
- Consumidores: pacote aprovado (as chaves assinadas não mudam).
- Rollback: código anterior. Testes: G8, G10 e os testes do Vínculo/KGR.
- Validação do dono: Revisão Humana individual e "Vínculo das selecionadas".

### F5 — entrada manual, CSV, lista e link de publicação pelo servidor (A5, parte 2)

- CSV/manual chamam o núcleo de import do servidor (o mesmo da Descoberta,
  conforme a F0 confirmar E1/E3); criar lista e o link de publicação pelo
  núcleo que já grava `site_origin` (`persistSiteSyncCandidates`).
- Testes: G1, G2, G15. Validação do dono: colar 10, importar CSV, conferir site.

### F6 — o que a F0 achar nas etapas "Ainda não verificado"

Uma fase por etapa achada (volume, SERP/KGR, leitores paralelos, rotas órfãs,
cache local), cada uma com o mesmo formato acima e o cenário correspondente.

### Complemento de 16/10 — auditoria da entrada (só leitura; entra na F0/F6)

Uma auditoria de apoio fechou parte do "Ainda não verificado" da entrada.
Situação: **Verificado no código** (arquivo:linha no relatório da sessão) e
**Confirmado no banco** (SELECT de 16/10): os dois gatilhos do Assunto estão
ATIVOS (`tgenabled = O`). O cabeçalho "ESTADO: NÃO APLICADA" da migration
`20261015120000` está desatualizado e vira SUBSTITUÍDO na F1. Hoje há 270
keywords vivas; a maior marca tem 183.

- **E-1 · Seis inserts em `minerador_keywords`, não um núcleo.** Quatro núcleos
  de servidor (`importKeywordsWithCore`, `importSubjectsWithCore`,
  `importSubjectDiscoveryWithCore`, `importDeclaredPlanWithCore`), a rota de
  importação do site (`app/api/marca/site/import/keywords/route.ts`) e dois
  inserts mortos do navegador (CSV/manual em `minerador-workspace.tsx`, sem
  deduplicação e com status livre, que pode ser "aprovado" sem registro). Linha
  única: um gravador de entrada com casos (Descoberta, Assunto, plano, site);
  remover os inserts mortos (F1).
- **E-2 · Deduplicação sem paginação (latente).** `importKeywordsWithCore` lê as
  existentes sem paginar (`max_rows = 1000`) e não há índice único: acima de
  1.000 keywords vivas numa marca, cria duplicata. O núcleo irmão já pagina.
  Também afeta a marcação "já existe" da Descoberta e a conversão de Assunto.
  Corrigir na F2 com o leitor paginado que já existe; o índice único fica como
  decisão do dono (migration).
- **E-3 · O import pelo site é caminho paralelo.** Deduplica só dentro da lista,
  usa outra normalização (tira pontuação) e grava evidência em keyword aprovada,
  o que muda a assinatura do pacote aprovado. Linha única: passa pelo gravador
  de entrada (E-1), com a mesma normalização e a regra de aprovação.
- **E-4 · Normalizações diferentes da mesma frase.** `normalizeKeyword` (base),
  cópias idênticas (`normalizeDeclaredPhraseKey` e outras), e três diferentes:
  `normalizeGoogleAdsKeyword` (mantém acento), `normalizeCandidateText` (site,
  tira pontuação) e `normalizeTopicText` (MCP). Linha única: uma função para a
  chave de deduplicação.
- **E-5 · MCP × tela na entrada.** `import_subject_keywords` gera `searchId` e
  `importRequestId` aleatórios quando faltam (uma nova tentativa vira outra
  busca, sem recibo de volume). `validate_silo_plan` diverge do cadastro em
  mínimo de artigos, nome, título, principal, escopo, funil, repetição e
  página do Silo. A checagem de URL publicada existe só nele: entra no núcleo
  do cadastro para valer na tela e no MCP. Rota com cliente RLS × MCP com
  cliente operacional: registrar e alinhar.
- **E-6 · Escritores de `analise_semantica` sem a guarda do Assunto** (vínculo
  de publicação, Revisão Humana, site, allintitle, métricas do Google Ads,
  evidência da importação). O gatilho do banco protege, mas a guarda de código
  tem que ser a mesma em todos (F4/F5).
- **E-7 · Trava.** Confirma A1: a ficha do Arquiteto trava por volume antes de
  olhar a trava manual, e o Minerador deixa a manual vencer. A prévia do
  cadastro conta volume validado igual a 0 como "com volume". Resolve-se na F2
  pela D1.

### Complemento de 16/10 (2) — volume, Lógica, SERP, KGR, Vínculo, providers e leitores

Segunda auditoria de apoio, só leitura (**Verificado no código**).

- **S-1 · SERP ainda dentro do Minerador (ALTA).** Desde 2026-09-28 a SERP
  deveria estar fora do Minerador. Mesmo assim, a rota
  `dataforseo/allintitle` paga, além do allintitle, KD, a SERP canônica e as 4
  lentes, e projeta `evidencia_serp` na keyword. Dois botões a chamam:
  - "Resultados", no Processador: pede confirmação de custo e filtra "sem
    volume" só no navegador;
  - "Medir resultados", na Descoberta: **sem confirmação de custo e sem filtro
    de volume**.

  Essa evidência decide intenção e funil acima da Lógica e do humano e pode
  **rebaixar uma aprovada** para Em revisão. A rota também troca allintitle e
  KGR sem carregar a aprovação, ao contrário do Volume, que carrega. Linha
  única: decisão D6.
- **S-2 · "Volume conhecido" com duas réguas (ALTA).**
  - `readKnownVolume` aceita a coluna com `volume_source = google_ads`.
  - A aprovação e o Processador exigem a medição validada
    (`volume_measurement`).
  - Efeito: a keyword da Descoberta aparece como medida no plano do MCP e no
    "Já temos" do Arquiteto, mas a aprovação recusa por falta de Volume.

  Linha única: uma função para "volume medido" (une com A7/E-7).
- **S-3 · Recibo da Pesquisa por Assunto como Volume (MÉDIA).** O recibo usa a
  média de ideias de keyword, sem série mensal e sem validade. Calcula o KGR
  com o allintitle importado (não validado). O botão Volume, ao contrário,
  grava em keyword publicada. Linha única: uma regra de "o que é medição
  válida" e de quem pode ser remedido.
- **S-4 · Volume 0 com três sentidos (MÉDIA).** Três leituras para o mesmo
  zero:
  - "Resultados": volume cru maior que 0, de qualquer fonte;
  - Pesquisa por Assunto: Ads maior que 0 **ou** estimativa DataForSEO maior
    que 0;
  - Processador: só a medição validada.
- **S-5 · "Lógica pronta" com três réguas (MÉDIA).**
  - A aprovação só confere a origem.
  - O processo exige versão, hash, local e nicho.
  - O portão de envio usa uma terceira variante.

  Efeito: a aprovação aceita uma Lógica que o processo marca como
  desatualizada.
- **S-6 · Status gravado pelo navegador (ALTA).** Rejeitar, bruto e em revisão
  vão direto do navegador, com uma trava de publicado mais fraca que a do
  servidor. "Corrigir marcação" pode gravar `aprovado` sem registro de
  aprovação. Linha única: tudo pelo núcleo de decisão do servidor (F3).
- **S-7 · Leitores paralelos no MCP (ALTA).**
  - `list_platform_keywords` lê o status cru: uma aprovada que divergiu
    aparece "aprovado" no MCP e "Em revisão" na tela. Lê também o volume sem
    validação e o posto sem a trava do plano (chama `resolveKeywordVinculo` sem
    `plan`).
  - `get_platform_state` conta aprovadas pelo status cru.
  - `/api/inteligencia` (Radar) lê `kgr_score`, `intent` e `volume_search`
    crus.

  Linha única: todo leitor passa por `resolveCanonicalKeywordSnapshot`.
- **S-8 · Sobras.** Código morto que sai na F1:
  - normalizadores da RapidAPI e o padrão `seo-keyword-research8` em
    `volume-provider.ts`;
  - `lib/minerador/allintitle.ts` da era da extensão do Chrome e
    `allintitle-persistence.ts` sem chamador;
  - `serper-provider*` sem chamador;
  - `provider: "serper"` ainda aceito no contrato do Radar e o rótulo "serper"
    para todo provider que não é DataForSEO, que mascara a proveniência;
  - `kgrUse: "decisao_pendente"` inalcançável;
  - `resolveKeywordVinculo` ainda injetando "· Assunto".

  O que fica no Radar é anotado aqui e decidido na auditoria do Radar.
- **Conferido sem divergência:** nenhum lugar exige KGR ou allintitle para
  aprovar ou enviar; a faixa 150–550 não bloqueia; o Vínculo recusa o Assunto
  na tela e no MCP; grupos e cores têm um gravador só.

### Complemento de 16/10 (3) — aprovação, envio, listas, exclusão, sugestões e cache

Terceira auditoria de apoio, só de leitura. Tudo abaixo foi **verificado no código**.

- **P-1 · "Enviar ao Arquiteto" antigo ao lado de "Aprovar e enviar" (ALTA).**
  - **Onde:** "Mais ações" chama `/api/arquiteto/handoff` sem envio parcial.
  - **Divergência:** o portão do navegador olha o status cru; o do servidor olha o status efetivo.
  - **Efeito:** uma keyword não aprovada some do lote em silêncio, e a tela mostra um sucesso falso ("já estavam no workspace"), contando só as criadas.
  - **MCP:** `send_keywords_to_arquiteto` também não é parcial e recusa o lote inteiro.
  - **Linha única:** um envio só, o de "Aprovar e enviar" (prévia, parcial, releitura). O botão antigo é duplicata e sai. O MCP passa a usar o modo parcial.
- **P-2 · Quatro formas de confirmar a aprovação (MÉDIA).**
  - **As quatro formas:** a prévia de "Aprovar e enviar"; a prévia própria do `decide_keywords` (MCP, sem envio, teto de 100 contra 500); o `plans/reapprove`, que aplica sem prévia nem hash; e "Tirar do plano" com encadeamento, que aplica a lista sem o dono ver item a item.
  - **Permissão:** a conversão pela rota não confere `arquiteto:create`; pelo MCP, confere.
  - **Hash:** a decisão tem três implementações.
  - **Linha única:** uma prévia, um hash e uma regra de permissão.
- **P-3 · Desfazer/refazer só no navegador (ALTA).**
  - **Defeito:** `useLocalHistory` volta o estado da tela sem gravar e sem reler, e mostra o resultado como sucesso.
  - **Efeito:** as gravações seguintes do navegador partem desse estado velho, sem compare-and-swap. Isso contraria a SDD do cache de 23/09: nada nasce "de um snapshot de desfazer".
  - **Linha única:** decisão D7.
- **P-4 · Exclusão comum sem hash e "Apagar Duplicadas" que apaga de vez (MÉDIA).**
  - **Contraste:** a exclusão por cor exige prévia com hash e digitar a cor. A exclusão comum, inclusive "Apagar Duplicadas", apaga de vez a não publicada com confirmação simples, sem teto.
  - **Palpite no navegador:** "Apagar Duplicadas" escolhe qual manter por um palpite feito no navegador.
  - **Garantias que já existem:** nenhum caminho apaga sem RPC, e o Assunto com plano é barrado pelo gatilho.
  - **Linha única:** a mesma confirmação forte e com hash nos dois casos.
- **P-5 · Listas.**
  - **Leituras repetidas:** três fontes de listagem e três leituras na primeira carga.
  - **Hidratação:** dois mecanismos para a linha aberta (o antigo `listing-payload` e o da F6).
  - **Escrita ao abrir:** a tela grava o nicho ao abrir (D3).
  - **Código inalcançável:** "Criar lista".
  - **Exclusão de lista:** não existe "excluir lista sem apagar keyword".
- **P-6 · Sugestões do Arquiteto.**
  - **Correto:** nada é gravado no Minerador sem o clique do dono.
  - **Efeito colateral:** o registro de sugestão nasce no PREPARAR da melhoria, antes de o dono aceitar (baixa).
- **P-7 · Cache local.**
  - **O que está conforme:** o veredito da aprovação em localStorage está amarrado ao `dna_hash` e o servidor relê.
  - **Leitura entre navegadores:** o Arquiteto lê o IndexedDB do Minerador para dizer "tema sem demanda", então a resposta muda de navegador para navegador.
  - **Contrato não implementado:** o `row_version` da SDD de 23/09.
  - **Ator divergente:** a tela grava o ator como e-mail, e o MCP como id.
- **P-8 · Código morto com decisão antiga.**
  - **Arquivos e funções:** `package-freshness.ts` inteiro; `keyword-lifecycle` (avaliação de exclusão no navegador); `resignApprovalRecord`; e outros exports sem uso.
  - **Rota sem chamador:** `keywords/purge`, que é administrativa por desenho.
  - **Linha única:** sai na F1, salvo `purge`, que fica registrada como administrativa.

## 7. Riscos

- **R1 · Mudar a leitura da trava muda o que o Arquiteto faz** (F2). Mitigação:
  nada gravado muda; a planilha já aplica a regra do dono de 14/10; a F2 só
  alinha o Minerador e os selos a ela (ou o contrário, pela D1).
- **R2 · Levar gravações para o servidor muda o tempo de resposta da tela**
  (F3–F5). Mitigação: os núcleos já existem e fazem lote; a barra progressiva
  continua.
- **R3 · Mutantes e suítes quebradas.** A F0 só vale com a suíte verde
  (memória do dono: "mutantes só valem com suíte verde"); hoje o Minerador por
  glob tem 28 falhas antigas conhecidas — a F0 as lista por nome antes.
- **R4 · Cenário estrutural casando com comentário.** A guarda lê o código sem
  comentários.
- **R5 · Agentes lendo a spec velha** até a F1. Mitigação: a F1 é a primeira.

- **R6 · Unificar a entrada (E-1/E-3) toca o caminho do site, que é da área
  Marca.** Mitigação: o gravador continua no Minerador (dono da ingestão,
  AGENTS §6); a Marca só chama. Teste de marca ativa, isolamento,
  idempotência e consumidor anterior (AGENTS §6).

## 8. Decisões pendentes do dono

- **D1 · A regra da trava.** Volume definido fixa a principal mesmo com a
  trava "Livre" gravada à mão (regra de 14/10, já no Arquiteto) — **ou** a
  trava gravada à mão vence o volume (regra de 13/10, hoje no Minerador)?
  Recomendação: a de 14/10 (mais recente e literal do dono), com o select do
  Posto avisando que "Livre" não destrava keyword com volume.
- **D2 · Silo com menos de 4 artigos.** Bloquear em todo lugar (MCP, card,
  Arquiteto) ou só avisar em todo lugar? Recomendação: avisar (o cadastro em
  acréscimo começa pequeno; a D3 de 12/10 fala em "de 4 a 30" sem dizer
  bloqueio no cadastro).
- **D3 · Nicho da lista.** Parar de gravar o nicho ao abrir a tela e deixar o
  nicho como proposta que o dono confirma? Recomendação: sim.
- **D4 · `withdrawKeywordSubject`.** Remover (a conversão já resolve o
  formato anterior) ou manter só para "Tirar do plano" aceitar o Assunto
  anterior solto (pendência do backlog de 13/10)? Recomendação: remover agora e,
  se preciso, tratar o Assunto solto como caso de "Tirar do plano".
- **D5 · Ordem das fases.** F1 → F2 → F3 → F4 → F5 → F6, um deploy cada?
  Recomendação: sim; F1 pode ir junto com a F0.
- **D6 · O que fica do "Resultados" no Minerador (S-1).** A SERP saiu do
  Minerador em 2026-09-28, mas a rota do allintitle ainda paga e grava SERP
  (KD, SERP canônica, 4 lentes, evidência que mexe em intenção e funil e
  rebaixa aprovada). Recomendação:
  - o Minerador fica só com o allintitle do KGR opcional, por pedido
    explícito, com o custo antes nos dois botões e sem keyword sem volume
    (recusada no servidor);
  - KD, SERP canônica, 4 lentes e evidência de SERP saem do Minerador. A
    primeira coleta da SERP é a do Arquiteto, que já é a linha (memória
    "SERP no artigo, KGR opcional");
  - a gravação passa a carregar a aprovação, como o Volume.

  Até a fase dela, o botão "Medir resultados" da Descoberta deve pedir a
  confirmação de custo. É conserto de bug, não muda função.
  **Feito em 16/10:** o botão pede confirmação, com teste em
  `tests/minerador-discovery-d1.test.mts`.
- **D7 · Desfazer/refazer do Minerador (P-3).** Recomendação: desfazer vale
  para seleção, filtro e organização da tela. Para dados gravados, desfazer
  vira uma nova gravação pelo núcleo do servidor, com prévia, ou o botão não
  aparece. Nunca volta só a tela.
- **D8 · "Enviar ao Arquiteto" antigo (P-1).** Recomendação: sai, porque é
  duplicata de "Aprovar e enviar" e mostra sucesso falso. O MCP
  `send_keywords_to_arquiteto` passa ao modo parcial.

## 9. Autorização

Esta SDD não autoriza código. Aprovada, autoriza só as fases do §6, na ordem,
sem migration, sem SQL remoto e sem chamada paga; cada fase atualiza na mesma
entrega `docs/03-minerador/estado-atual.md`, `backlog.md`, a spec (§5), o
catálogo e o cenário da F0.

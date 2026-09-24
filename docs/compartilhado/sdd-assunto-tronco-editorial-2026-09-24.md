# SDD — Assunto: o tronco editorial declarado — 2026-09-24

> **Estado: APROVADA pelo dono do produto em 2026-09-24 · implementação por fatias.**
> Autorização, nas palavras dele: "é justamente isto que vc descreveu, pode implementar ele começando com os SDD".
> D1 a D4, P1 a P10 e Q1 a Q9 estão fechadas (seções 3 e 9). A F1b entrou por decisão dele no mesmo dia.
> A aprovação autoriza o código das fatias F1, F1b, F2 (fases A e B), F3 e F4, nesta ordem.
> **Não** autoriza migration, SQL remoto nem chamada paga em teste: isso continua com o usuário (`AGENTS.md` §15).

Grau de cada afirmação, como pede `AGENTS.md` §1:

- **Verificado no código:** conferido nesta data, com `caminho:linha`, na cópia de trabalho do branch `resgate/trabalho-nao-commitado-2026-09-05`.
  `lib/radar/portable-writing-export.ts` tem alterações não commitadas, e as linhas citadas são as da cópia de trabalho.
- **Documentado:** está em spec, invariante, ADR ou SDD, mas o código não foi conferido para aquele ponto.
- **Proposto:** é desenho desta SDD. Não existe no código.
- **Não encontrado:** foi procurado e não existe.

Precedência: abaixo de invariantes e ADRs, acima de spec e código (`AGENTS.md` §1). Esta SDD obedece à SDD de egress (`docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md`, regras R1 a R16 e as propostas R17 a R19) e à SDD do cache de SERP (`docs/compartilhado/sdd-cache-serp-temporario-2026-09-23.md`).

---

## 1. Resumo para o dono do produto

**O que é o Assunto.** É uma frase que **você declara** como o tronco de um ou mais artigos. Ela pode não ter volume de busca nenhum. Exemplos: "SEO para clínicas" (o seu serviço) ou "estratégias tráfego pago clínica estética 2026 leads qualificados" (um tema já decidido). O público não procura por essas palavras, mas é disso que o artigo precisa tratar.

**O que são as keywords de sustentação.** São as buscas reais que trazem o leitor: "marketing para clínicas", "captar clientes", "como fazer tráfego pago para clínica". O artigo responde a elas de forma honesta e, em algum ponto, faz a **virada** para o Assunto. É ela que leva o leitor da busca dele até a sua oferta.

> Na conversa você chamou essas keywords de "suportes". No sistema, "Suporte" já nomeia outra coisa: o papel do artigo na hierarquia Pilar/Suporte (`docs/00-produto/glossario.md:12`; `lib/arquiteto/contracts.ts:296`). Por isso, nesta SDD elas se chamam **keywords de sustentação**, para os dois sentidos não se misturarem.

**O que muda em cada tela.**

| Onde | O que muda |
| --- | --- |
| Minerador · importar CSV ou colar lista | No **Processador**, novo seletor **Assunto / Keyword**, com padrão **Assunto**: a lista entra direto na tabela do Processador. Com Keyword, vai medir na Descoberta como hoje. O **select não entra no Descobrir**: lá continua sendo só keyword. Uma keyword que veio do Descobrir pode virar Assunto depois, pela Revisão Humana ou pelo rodapé. Uma frase que já existe na marca **não** é declarada sem você confirmar. |
| Minerador · Descobrir (F1b) | Novo tipo de descoberta, **Por Assunto**. Você escreve o Assunto (e, se quiser, a nota e a página de destino) ou escolhe um já declarado, e o Minerador busca keywords de sustentação no Google Ads e no DataForSEO Labs: pesquisas relacionadas, mesma categoria e o que as páginas do topo da SERP do Assunto já ranqueiam. Nada é pago antes de você confirmar o custo (cerca de US$ 0,15 por pesquisa, nunca mais de US$ 0,20). A lista fica só no navegador; o banco só recebe o que você importar ao Processador, sem volume, que o Processador mede. No envio, você pode também declarar a frase como Assunto, para as keywords chegarem ligadas a ele. |
| Minerador · Revisão Humana | O Vínculo ganha uma terceira declaração, **Assunto · declarado**, com uma nota curta (o que é, para quem) e a página de destino, se houver. Vale para qualquer keyword, inclusive as que vieram do Descobrir e as já publicadas. |
| Minerador · aprovar | Declarado o Assunto, a aprovação dispensa Volume, Resultados e KGR (a SERP já não é exigida para aprovar hoje). Só a **Lógica** continua exigida. Ela é local e não custa nada, e dá ao Arquiteto uma hipótese de intenção e funil. |
| Minerador · barra do rodapé | Entram as escolhas que hoje faltam: **Assunto, tipo de página e posto de principal**. KGR, concluir revisão e Status já estão lá. Esta SDD **propõe deixar fora** cinco escolhas, e cada uma é decisão sua (Q5): **reabrir a revisão** e **cancelar** (desfazem decisões de cada keyword, uma a uma), **conferir por link** e **confirmar publicada / desvincular** (cada keyword tem a própria URL, e a spec proíbe declarar publicação em massa) e **nota e página de destino do Assunto** (cada Assunto tem as suas). |
| Arquiteto | Cada artigo pode ter **um** Assunto como tronco. Vale para qualquer página que o Arquiteto forma: artigo, landing page, página de serviço. O mesmo Assunto pode sustentar vários artigos, landings ou um Silo inteiro. O Arquiteto sugere keywords de sustentação sem gastar nada, e você escolhe. A SERP das keywords escolhidas valida o artigo, como hoje. |
| Radar | Investiga em torno do Assunto: a estrutura do artigo passa a **exigir** uma parte que sustente o Assunto e faça a virada, mesmo que nenhuma página concorrente fale dele; a pauta do especialista pede para aprofundá-lo; vídeos, quando houver. Se as buscas não sustentarem o Assunto, o Radar **avisa** e devolve ao Arquiteto. Ele nunca troca o Assunto. Nesta primeira versão, o Radar procura o Assunto nas páginas pelas palavras, não pelo sentido (F3.1). |
| CSV "Para escrever" e Redator | Chegam com o tronco, a nota, a página de destino, a direção do H1 e a seção sugerida para a virada. A estrutura final é decisão do Redator. |

**O que NÃO muda.**

- A **principal** do artigo continua sendo uma keyword com busca. Ela é dona do slug, do KGR e do H1. O Assunto entra no H1 como complemento, ou num H2/H3, conforme a SERP (D1).
- **Slug e KGR** seguem a principal (`AGENTS.md` §13).
- **Publicados:** URL, slug, canonical e principal ficam protegidos. Declarar Assunto numa keyword publicada não mexe em nada disso (P5).
- **SERP nas 4 lentes** (desktop-windows, desktop-macos, mobile-android, mobile-ios), com cache de 30 dias por marca. Toda SERP nova segue essa regra, inclusive a SERP opcional da frase do Assunto (P7).
- **Hierarquia de autoridade:** SERP conclusiva, depois humano, depois Lógica (`docs/03-minerador/spec.md` §63, linha 684).
- **A IA nunca declara Assunto** (P4).
- **Pipeline:** `Marca → Minerador → Arquiteto → Radar → Redator → Publicações`. O Planejador não faz parte do fluxo desde 2026-09-18 (invariantes 47 a 49).
- **Custo:** nenhuma chamada paga por padrão. A Pesquisa por Assunto (F1b) só paga depois que você confirma o plano de custo. Migration: nenhuma nas fatias F1 a F4; a F1b traz uma pequena, de catálogo do ledger, que você executa.

---

## 2. Identificação

| Campo | Valor |
| --- | --- |
| Estado | **APROVADA** em 2026-09-24 · implementação por fatias (F1 → F1b → F2·A → F2·B → F3 → F4) |
| Data | 2026-09-24 |
| Aprovador | dono do produto |
| Módulo da entrada | **Minerador**: declaração, import, Vínculo, rodapé e trava de aprovação (F1); Pesquisa por Assunto no Descobrir (F1b) |
| Fatias em outros módulos | **Arquiteto** (F2), **Radar** (F3), **Redator e export** (F4). Cada fatia tem o módulo dono do arquivo como proprietário (`AGENTS.md` §3) |
| Só consultada | **Marca**: `marcas.site_url` e o catálogo do site, para conferir a página de destino. Nenhuma escrita |
| Classe | **Estrutural** (`AGENTS.md` §4): muda o workflow de aprovação, amplia o contrato do Vínculo e acrescenta campo novo ao `ArticleDNA`, que é `.strict()` e consumido por Radar e Redator |
| Migration | **Nenhuma** nas fatias F1 a F4. A **F1b** traz uma migration pequena de catálogo: amplia o CHECK de `integration_capabilities.operation_kind` e insere a capability `dataforseo.keyword_research`. O usuário a executa (F1b.8; seção 6) |

---

## 3. Decisões e premissas

### 3.1 Decididas pelo dono do produto (2026-09-24)

| # | Decisão |
| --- | --- |
| **D1 · Principal** | A keyword com busca continua dona do slug, do KGR e do H1. O Assunto fica num campo próprio, como fundamento, e entra no H1 como complemento ou num H2/H3, conforme a SERP. |
| **D2 · Aprovação** | Declarado Assunto, a aprovação dispensa Volume, Resultados, KGR e SERP. A Lógica (determinística, local, sem provider pago) continua exigida e dá ao Arquiteto uma hipótese de intenção e funil. *Nota de leitura:* a SERP já não é exigida para aprovar (`SERP_REQUIRED_FOR_APPROVAL = NO`, `docs/03-minerador/spec.md:648`, §61; `lib/minerador/approved-package.ts:72-76` exige só Lógica, Volume, Resultados e KGR). Não há gate de SERP a desligar: na prática, D2 dispensa Volume, Resultados e KGR. |
| **D3 · Alcance** | Um Assunto por artigo: um só tronco. Vários artigos, e até um Silo inteiro, podem girar em torno do mesmo Assunto. |
| **D4 · Virada** | O Assunto carrega a frase, uma nota curta do usuário (o que é, para quem) e, se existir, a página de serviço ou landing de destino. |

### 3.2 Premissas: confirmadas em 2026-09-24

As premissas foram apresentadas ao dono antes da aprovação. Ele autorizou a implementação sem vetar nenhuma (Q1). A P3 fica restrita ao Processador: o Descobrir não ganha o select.

| # | Premissa |
| --- | --- |
| **P1** | A declaração é **por keyword**, não por lista. O select do import só preenche todas as linhas. Sem migration. |
| **P2** | O Assunto é uma marca **ao lado** do tipo de página (terceira declaração do Vínculo), não um quinto tipo. "SEO para clínicas" pode ser Assunto e Página de serviço ao mesmo tempo. Na tela, aparece no Vínculo como **"Assunto · declarado"**. |
| **P3** | No Processador, o import com "Assunto" entra direto na tabela do Processador. Com "Keyword", segue como hoje e vai para o Descobrir medir. |
| **P4** | Só o humano declara. O select do import vale como declaração dele, com autor e data. A IA nunca declara Assunto. |
| **P5** | Uma keyword publicada pode ser declarada Assunto sem trocar a principal nem o slug daquela URL. |
| **P6** | No rodapé entra o Vínculo em grupo (Assunto, tipo de página e posto), ao lado do Status, que já está lá. |
| **P7** | Quem valida é a SERP das keywords de sustentação, nas 4 lentes. A SERP da própria frase do Assunto é opcional, só sob pedido. Se for coletada, segue a regra da plataforma: 4 lentes com cache. *Nota da F1b:* na Pesquisa por Assunto, cuja fonte 5 o dono escolheu, confirmar o plano de custo conta como o pedido (F1b.3). |
| **P8** | O Radar recebe o Assunto já fixado. Se as keywords não o sustentam, ele só alerta e devolve ao Arquiteto, para decisão humana. |
| **P9** | No CSV "Para escrever" e no Redator, o tronco e a virada vão em `promessa_e_leitor`, a direção do H1 em `titulo_e_seo` e a seção da virada em `estrutura`. |
| **P10** | A trava de aprovação passa a valer também no servidor, com a exceção do Assunto. Hoje `resolveApprovalReadiness` só é usado na tela, em `modules/minerador/minerador-workspace.tsx`. |

---

## 4. Contrato atual

### 4.1 Import do Processador

| Fato | Grau | Evidência |
| --- | --- | --- |
| "Importar CSV" e "Manual" do Processador abrem `DiscoverySourceControls` com intenção e funil preliminares fixos (Informativa/TOFU). As linhas viram **candidatas da Descoberta**, e o aviso diz "Abra Descobrir Keywords para revisar". | Verificado no código | `modules/minerador/minerador-workspace.tsx:716-719`, `:3006` |
| O mesmo componente é usado pelo Descobrir. | Verificado no código | `modules/minerador/discovery/discovery-keywords-page.tsx:209` |
| O modal tem um único select, "Lista padrão para linhas sem lista" ("Lista opcional" no manual). **Não existe** select Assunto/Keyword. | Verificado no código | `modules/minerador/discovery/discovery-source-controls.tsx:156-160`, `:177-181` |
| O parser reconhece keyword/termo/query, lista/silo/categoria, location, intent, funnel, volume, cpc, competition e results. Não há coluna de nota nem de página de destino. | Verificado no código | `lib/minerador/discovery-sources.ts:125-135` |
| `/discovery/sources` lê só `id,keyword` da marca, normaliza, deduplica e grava pela RPC `persist_minerador_discovery_source_run`. | Verificado no código | `app/api/minerador/marcas/[brandId]/discovery/sources/route.ts:112`, `:138` |
| A passagem ao Processador é `/discovery/import` → `importKeywordsWithCore`: normaliza, deduplica por marca, preserva a existente (só acrescenta `discovery_import`) e cria a nova como `bruto`. A idempotência é por `importRequestId` em `minerador_discovery_import_batches`, que exige `discovery_run_id` e `candidate_ids`. | Verificado no código | `lib/minerador/keyword-import-core.ts:148-255`; `app/api/minerador/marcas/[brandId]/discovery/import/route.ts:157-197` |
| `KeywordImportSource` aceita só `"discovery"`. | Verificado no código | `lib/minerador/keyword-import-core.ts:2` |
| **Egress atual:** o núcleo lê `analise_semantica` de **todas** as keywords vivas da marca a cada import. A listagem mede ~9,5 kB por linha (1 034 kB em 109 linhas, antes da poda). | Verificado no código · Documentado | `lib/minerador/keyword-import-core.ts:157-161`; `lib/minerador/listing-payload.ts:4-5` |
| O import antigo, com insert direto em `minerador_keywords`, está **órfão**: `handleImportCSV` só se liga a um input oculto que nada clica, `openManualModal` não tem chamador e o insert não deduplica. | Verificado no código | `modules/minerador/minerador-workspace.tsx:1778`, `:1916-1919`, `:1945`, `:3003` |
| O "select de nicho" do pedido é o radiogroup "Tipo de descoberta": "Palavra-chave" e "Como clientes me encontram". | Verificado no código | `modules/minerador/discovery/discovery-search-row.tsx:15-16`, `:59-66` |

### 4.2 Vínculo

| Fato | Grau | Evidência |
| --- | --- | --- |
| O Vínculo tem **duas** declarações, "e só elas": o posto de principal (`free · locked · reviewable`, com dois rótulos visíveis, Livre e Travado ao slug) e o tipo de página. | Documentado · Verificado no código | `docs/03-minerador/spec.md:758-760` (§67); `lib/minerador/keyword-vinculo.ts:21-43` |
| O tipo de página é um enum fechado de 4 valores, `article · silo · landing_page · service_page`, com padrão `article` (`source: default`, `determined: false`). | Verificado no código | `lib/minerador/keyword-page-type.ts:30`, `:93-106` |
| O tipo é gravado no JSONB `analise_semantica` pelas chaves `keyword_page_type`, `_actor`, `_at` e `_history`, com readback. **É o padrão a seguir.** | Verificado no código | `lib/minerador/keyword-page-type.ts:127-149`; `modules/minerador/minerador-workspace.tsx:2452-2481` |
| O posto é gravado por `setPrimaryKeywordPolicy`. A troca uma a uma só age com publicação declarada e **não faz readback**. | Verificado no código | `modules/minerador/minerador-workspace.tsx:2387-2411` |
| `resolveKeywordVinculo` é a leitura única. Coluna, cabeçalho, Revisão Humana e Arquiteto passam por ela. | Verificado no código | `lib/minerador/keyword-vinculo.ts:50-74`; `lib/arquiteto/editorial-unit-declaration.ts:89-106` |
| O Arquiteto lê o Vínculo do **pacote aprovado** (`approvedDna.analiseSemantica`), não da linha viva. | Verificado no código | `lib/arquiteto/editorial-unit-declaration.ts:57-62` |
| O Arquiteto traduz o tipo com `EditorialUnitDeclarationSchema`, um `z.enum` estrito. Valor fora do enum faz o `safeParse` falhar e a declaração vira `undefined` **em silêncio**. No Minerador, valor desconhecido em `keyword_page_type` volta ao padrão `article`, também em silêncio. | Verificado no código | `lib/arquiteto/contracts.ts:433-456`; `lib/arquiteto/editorial-unit-declaration.ts:127`, `:138`; `lib/minerador/keyword-page-type.ts:97-101` |
| A view de listagem **vigente** só remove as séries de medição de `analise_semantica` (quatro `#-`). **Uma chave nova aparece na tabela sem migration.** A migration `20260923140000_minerador_keywords_row_version.sql` repete os mesmos `#-` e acrescenta `row_version`, mas está **não aplicada** (`docs/03-minerador/estado-atual.md:21`): `row_version` ainda não existe no banco. | Verificado no código · Documentado | `supabase/migrations/20260921030000_listagem_sem_series_de_medicao.sql:102-105`; `lib/minerador/listing-payload.ts:23-28` |
| A trava de publicada congela `keyword`, `lista_id` e `location`, mas não `analise_semantica`. | Verificado no código | `supabase/migrations/20260921110000_status_nao_e_estrutural.sql:45-47` |

### 4.3 Aprovação

| Fato | Grau | Evidência |
| --- | --- | --- |
| `resolveApprovalReadiness` exige: Lógica completa (`dna_origem = logico_deterministico` e contrato de saída), Volume validado, Resultados validado e aplicabilidade do KGR decidida quando o KGR é calculável. | Verificado no código · Documentado | `lib/minerador/approved-package.ts:58-86`; `docs/03-minerador/spec.md:648` (§61) |
| **Só a tela usa a trava.** Fora os testes e o script de backfill, o único chamador é o workspace. A escrita do status sai direto do navegador pelo cliente autenticado (RLS), sem rota de servidor. | Verificado no código | `modules/minerador/minerador-workspace.tsx:2145-2172`, `:2201-2206`, `:364`; `scripts/minerador-backfill-aprovacao.mts:57` |
| O handoff no servidor (`POST /api/arquiteto/handoff` → `createMineradorArquitetoHandoff` → `prepareCanonicalHandoff`) só confere status `aprovado`/`publicado`, pacote não divergente e marca. Ele já lê `analise_semantica` das keywords pedidas. | Verificado no código | `app/api/arquiteto/handoff/route.ts:12-16`; `lib/server/arquiteto-workspace.ts:98`, `:278-297`, `:466` |
| O gate do lado do Minerador declara que o processo "nunca é veto" no envio: só restam Brand ativa e status. A spec diz o mesmo para o handoff. | Verificado no código · Documentado | `lib/minerador/arquiteto-handoff-gates.ts:44-56`, `:89-105`; `docs/03-minerador/spec.md:632` (§60) |
| **A trava não é retroativa, por decisão registrada.** O backfill do registro de aprovação preenche as aprovadas antigas sem julgá-las: "Desaprovar 29 keywords que o usuário já aprovou seria o Dev revogando decisão humana". O dry-run dele conta só as aprovadas **sem** registro (`pendentes`), não todas as aprovadas. | Verificado no código | `scripts/minerador-backfill-aprovacao.mts:13-14`, `:51`, `:57-63` |
| **Volume 0 versus null.** Com 0, o Google Ads grava a medição e o Volume conta como validado. O KGR não é calculado, mas fica "pronto", e o humano tem de decidir a aplicabilidade. Com `null` (sem dado, o caso típico de um Assunto), não se grava medição, só `volume_eligibility = unavailable`: o Volume nunca valida e **a keyword nunca pode ser aprovada**. | Verificado no código | `lib/minerador/google-ads-volume.ts:70-80`, `:114-128`; `lib/minerador/processor-revalidation.ts:218-221`; `lib/minerador/kgr-applicability.ts:64-66` |
| A Lógica é local: `processLogicalKeywordDna` monta o contrato e só grava no banco, sem provider. | Verificado no código | `modules/minerador/minerador-workspace.tsx:734`, `:805`, `:859`, `:939` |
| A assinatura do pacote cobre `analise_semantica` inteira, menos as séries, a SERP crua e o histórico de trava. **Qualquer chave nova muda o hash**, e a keyword aprovada vira `em_revisao`. | Verificado no código | `lib/minerador/approved-package.ts:221-229`; `lib/minerador/editorial-status.ts:83-98` |

### 4.4 Rodapé e inventário das escolhas humanas

O que o rodapé tem hoje: Conferir site, Lógica, Volume, Resultados, Revisar, select de KGR, Concluir revisão, select de Status e Excluir. "Mais ações" repete Status e KGR e traz Enviar ao Arquiteto (`modules/minerador/minerador-workspace.tsx:3776-3947`). **Verificado no código.**

O dono pediu **todas** as escolhas humanas no rodapé. O inventário da Revisão Humana (`components/editorial/dna-panels.tsx`) e do card DECISÃO:

| Escolha humana | Onde está hoje | No rodapé? | Proposta |
| --- | --- | --- | --- |
| Status editorial | DECISÃO, "Status final" (`dna-panels.tsx:1027-1035`) | **Sim** (`minerador-workspace.tsx:3857-3867`; Mais ações `:3890-3898`) | mantém |
| Aplicabilidade do KGR | Revisão (`dna-panels.tsx:510-517`) | **Sim** (`minerador-workspace.tsx:3833-3845`; `:3903-3913`) | mantém |
| Concluir revisão | Revisão (`dna-panels.tsx:584`) | **Sim** (`minerador-workspace.tsx:3848-3853`) | mantém |
| Reabrir ("Revisar novamente") / Cancelar revisão | Revisão (`dna-panels.tsx:583`, `:585`) | Não | **proposta: fora** (Q5): reabrir desfaz decisões de cada keyword; em grupo seria perda silenciosa |
| Posto de principal | Revisão (`dna-panels.tsx:527-543`) | **Não** | **entra** no select Vínculo do rodapé (F1) |
| Tipo de página | Revisão (`dna-panels.tsx:545-562`) | **Não** | **entra** no select Vínculo do rodapé (F1) |
| **Assunto** (novo) | não existe | **Não** | **entra** no select Vínculo do rodapé (F1) |
| Confirmar publicada / Desvincular | DECISÃO (`dna-panels.tsx:1074-1081`) | Não | **proposta: fora** (Q5): §68 proíbe declarar publicação em massa (`docs/03-minerador/spec.md:815`) |
| Conferir por link (URL manual) | DECISÃO (`dna-panels.tsx:1071`) | Não | **proposta: fora** (Q5): cada keyword tem a própria URL |
| Nota e página de destino do Assunto (novo) | Revisão, com a declaração (F1.4) | — | **proposta: fora** (Q5): cada Assunto tem os seus; em grupo, o Assunto é declarado sem eles |
| Decisão por campo (`keep_logic`, `edit`, `confirm_unknown`) | só no tipo (`lib/minerador/human-review.ts:15`, `:21`) | — | **Não encontrado** na interface (`components/`, `modules/`) |

O padrão de lote a seguir é `handleBatchKgrApplicability`: um plano, update por `id` + `brand_id`, readback canônico e progresso (`modules/minerador/minerador-workspace.tsx:2239-2290`). **Verificado no código.** Só que o readback, `readCanonicalKeywordRows`, faz `select("*")` da tabela cheia (`modules/minerador/minerador-workspace.tsx:551-563`), o que custa ~9,5 kB por linha.

### 4.5 ArticleDNA e SiloDNA

| Fato | Grau | Evidência |
| --- | --- | --- |
| `ArticleDNASchema` é `.strict()`. Tem `principalKeywordId`, até 5 secundárias, reforços e `keywordReferences` (de 1 a `MAX_KEYWORDS_PER_ARTICLE = 6`). O `superRefine` exige exatamente uma principal e referências que cubram **exatamente** as keywords resumidas, sem papel duplicado. | Verificado no código | `lib/arquiteto/contracts.ts:959-1045`; `lib/arquiteto/domain-rules.ts:2` |
| Os papéis são enums fechados: `principal · secundaria · reforco_narrativo` e `Pilar · Suporte · Reforco Narrativo`. | Verificado no código | `lib/arquiteto/contracts.ts:275`, `:296`, `:853` |
| O ArticleDNA **não tem H1**. H1 só existe na SiloPage e no ContentPlan (legado). | Verificado no código | `lib/arquiteto/contracts.ts:1223`, `:1668` |
| O slug do artigo novo sai da principal. | Verificado no código | `lib/arquiteto/article-formation.ts:391`, `:499` |
| A formação agrupa por afinidade lexical: piso de 0,5, e acima de 0,75 separar vira canibalização. "SEO para clínicas" e "tráfego pago clínica estética" não se juntariam. | Verificado no código | `lib/arquiteto/article-formation.ts:295`, `:304` |
| Trava de SERP: nenhum artigo conclui sem evidência vigente da composição. A SERP nunca move keyword nem troca a principal. | Verificado no código | `lib/arquiteto/article-serp-gate.ts:3-26` |
| Primária do Silo: a SERP **recusa** quando nenhuma candidata é forte. `electPrimaryByHuman` existe. | Verificado no código | `lib/arquiteto/silo-primary-keyword.ts:449-461`, `:487` |
| SiloDNA (`.strict()`): `centralEntity` é texto livre, com `centralEntitySource` e `centralKeywordDnaRef` opcionais. A SiloPage tira H1 e title de `centralEntity`. | Verificado no código | `lib/arquiteto/contracts.ts:1106-1108`, `:1150`; `lib/arquiteto/adapters.ts:393-394` |
| Padrão da promessa: "Cobrir com clareza o tema X", com a principal no lugar de X. | Verificado no código | `lib/arquiteto/adapters.ts:256` |
| Já existe SERP de um texto que não é keyword do acervo: a territorial consulta `centralEntity` sob o pseudo-id `territory:<ref>`. | Verificado no código | `lib/arquiteto/territorial-serp.ts:156-175` |
| Conservação: toda keyword importada fica num artigo ou em "Keywords não agrupadas". A elegibilidade no servidor conta como "incorporada" só quem está em `keywordReferences`. O cálculo **local** de não agrupadas usa outro critério: `clusterId` vazio. Há ainda partições próprias em cenário, formação, motor e território. | Documentado · Verificado no código | `AGENTS.md` §10; `docs/00-produto/pipeline-editorial-papeis-handoffs.md:47`; `lib/server/arquiteto-workspace.ts:267-271`; `modules/arquiteto/arquiteto-workspace.tsx:6200-6213`, `:14563`; `lib/arquiteto/architecture-scenario.ts:402-425`; `lib/arquiteto/article-formation.ts:720`; `lib/arquiteto/engine.ts:448`; `lib/arquiteto/territory-working-copy.ts:235`, `:268`; `lib/arquiteto/architecture-working-proposal.ts:247` |
| Uma keyword em dois artigos barra a conclusão: `NO_DUPLICATED_KEYWORD` ("Nenhuma busca aparece em dois artigos") e `DUPLICATE_KEYWORD` no cenário. | Verificado no código | `lib/arquiteto/article-formation-confirmation.ts:430-434`; `lib/arquiteto/architecture-scenario.ts:402-404` |
| O índice de keywords do Arquiteto lê todas as colunas **menos** `analise_semantica` (~96% dos bytes da linha, correção E8 da SDD de egress). A linha inteira só vem para as keywords recebidas pelo Arquiteto e as pedidas num handoff. | Verificado no código | `lib/server/arquiteto-workspace.ts:88-98` |
| **"Assunto" já existe em dois sentidos, e colide com o termo novo.** (1) `analise_semantica.assuntos_excluidos` vira `ArticleDNA.excludedSubjects`, os temas que o artigo **não** cobre. (2) A trava de conclusão diz ao usuário que dois artigos do mesmo Silo "disputam o mesmo assunto", no sentido de tema canibalizado. | Verificado no código | `lib/arquiteto/contracts.ts:1008`; `lib/arquiteto/adapters.ts:257`; `lib/arquiteto/article-dna-provider.ts:48`; `lib/arquiteto/article-formation-confirmation.ts:274`, `:475-476` |
| O detector de sobreposição entre candidatos compara **todos os membros**, não só as principais: afinidade lexical + 0,3 se algum membro conclusivo tem a mesma entidade central + 0,1 por modificadores em comum; risco a partir de 0,5. Quem resolve o par é a SERP, em "Processar artigos"; enquanto não resolve, `NO_UNRESOLVED_CANNIBALIZATION` bloqueia a conclusão. | Verificado no código | `lib/arquiteto/article-candidate-guards.ts:278-356`; `lib/arquiteto/article-formation-confirmation.ts:470-477` |
| `CANNIBAL_FLOOR = 0,75` é um piso da **afinidade de formação** (acima dele, separar vira canibalização), não uma medida "entre principais". | Verificado no código | `lib/arquiteto/article-formation.ts:295`, `:304` |

### 4.6 Radar

| Fato | Grau | Evidência |
| --- | --- | --- |
| Do ArticleDNA, o contexto de pesquisa lê `promise` (ou o título), `mainIntent`, `hierarchy`, `classification` e `editorialTopics` (`requiredTopics` + `coverage`). | Verificado no código | `lib/radar/article-research-context.ts:121-163`, `:338-341`, `:395-402` |
| Todo fundamento novo entra no `RADAR_FOUNDATION_USAGE_MAP`, senão o teste falha. | Verificado no código | `lib/radar/foundation-usage-map.ts:37-41` |
| As consultas SERP do Google saem só das keywords, na ordem principal > secundária > reforço. | Verificado no código | `lib/radar/research-query-plan.ts:139-148` |
| É proibido resolver a principal por título, slug, consulta, promessa ou hierarquia. | Documentado | `docs/05-radar/spec.md:189-191` |
| Consultas do YouTube: `PRIMARY_KEYWORD`, `AUDIOVISUAL_FRAMING`, `EDITORIAL_TOPIC` e `SECONDARY_KEYWORD`. | Verificado no código | `lib/radar/youtube-search-queries.ts:30-39`, `:224-233` |
| A pauta do especialista recebe `principal: article.promise`, audiência, problema, resultado desejado e `requiredTopics` + `coverage`. | Verificado no código | `lib/radar/r6-sequential.ts:198-209` |
| Promessa, abertura e CTA do Radar vêm da SERP. O CTA do export sai de `conclusion.callToAction`, não de `ArticleDNA.cta`. | Verificado no código | `lib/radar/portable-read-model.ts:256-257` |
| "Assunto declarado pelo DNA": um tópico declarado entra mesmo com recorrência baixa, e `MUST_COVER ≠ MUST_BE_H2`. No código, isso aparece como "O ArticleDNA declara este assunto: ele precisa ser coberto, e a arquitetura decide onde". | Documentado · Verificado no código | `docs/05-radar/backlog.md:2683-2685`, `:2764-2765`; `lib/radar/editorial-article-model.ts:1166-1167` |
| Como funciona: os tópicos exigidos saem de `editorialTopics`, sem as raízes da principal (`:230-259`). Um grupo de candidatos **observados na amostra** cujas raízes cobrem um tópico exigido ganha `dnaRequired` (`:440-455`), é promovido a seção mesmo com pouca evidência (`:1017`) e recebe `mustCoverReasons` e `evidenceStrength: "DNA_REQUIRED"` (`:1166-1171`). A seção exigida vira H3 de um anfitrião compatível ou ponto a cobrir, nunca H2 por decreto (`:812-840`). **Limite:** o mecanismo só marca o que a amostra trouxe; um tópico exigido sem nenhum candidato observado não gera seção. | Verificado no código | `lib/radar/editorial-article-model.ts` |
| O export marca a seção com `mustCoverReasons` como "Obrigatória pelo ArticleDNA", com os motivos próprios. | Verificado no código | `lib/radar/portable-writing-export.ts:938-947` |
| O YouTube tem teto compartilhado de 6 consultas (`RADAR_YOUTUBE_MAX_QUERIES`), preenchido na ordem das origens. | Verificado no código | `lib/radar/youtube-search-queries.ts:69`, `:159`, `:174` |
| O bundle congelado do FINALIZE tem schema próprio, `.strict()`, sem campo de artigo, e é relido dentro de `RadarAnalysisPayloadSchema` com `.parse`. | Verificado no código | `lib/radar/investigation-finalization.ts:380-409`; `lib/radar/analysis-contracts.ts:367`, `:632`, `:764`, `:824` |
| O FINALIZE congela o bundle amarrado à versão e ao hash do ArticleDNA. Há hashes dourados do dossiê. | Documentado · Verificado no código | `docs/00-produto/glossario.md:30`; `tests/radar-serp-standing-congelado.test.mts:337`; `tests/radar-serp-lentes-congeladas.test.mts:556` |

### 4.7 Redator e export "Para escrever"

| Fato | Grau | Evidência |
| --- | --- | --- |
| Os fundamentos do Redator projetam do ArticleDNA uma lista fechada de campos, com no máximo 872 B medidos. | Verificado no código | `lib/redator/writer-evidence-catalog.ts:985-993`; `lib/server/writer-evidence-sources.ts:235` |
| O MCP expõe `get_writer_foundations` (≤ 24 kB) e o manifesto. | Verificado no código | `app/api/mcp/redator/route.ts:85` |
| O guardião é `runGuardian`. As proibições `RADAR_WRITER_MAY_NOT` viajam no pacote. | Verificado no código | `lib/redator/guardian.ts:79`; `lib/redator/writer-handoff.ts` (importado em `lib/radar/portable-dossier-gaps.ts:1`) |
| O ContentDocument v2 leva `keywordContext` e `writerMayNot`. | Verificado no código | `lib/arquiteto/contracts.ts:1892`, `:1899` |
| O export "Para escrever" tem 13 colunas fixas. `promessa_e_leitor` traz Promessa, Leitor, Abertura, Direção, Fechamento, Chamada final e Próximo passo. `titulo_e_seo` traz H1 de trabalho, SEO e slug. `estrutura` marca "Obrigatória pelo ArticleDNA". O modo técnico tem saída dourada (J). | Verificado no código | `lib/radar/portable-writing-export.ts:80-94`, `:845-869`, `:891-912`, `:919`, `:947`; `tests/radar-portable-writing-export.test.mts:535` |
| O Redator planeja e escreve. Ele não troca a principal nem remove cobertura obrigatória. | Documentado | invariantes 48 e 49 (`docs/00-produto/invariantes.md:203-212`) |

### 4.8 Marca

| Fato | Grau | Evidência |
| --- | --- | --- |
| O BrandDNA **não tem** cadastro de ofertas nem de serviços. | Verificado no código | `lib/arquiteto/contracts.ts:775-785` |
| O mais próximo de uma oferta é o catálogo do site (`brand_site_catalog_entries`, com `page_type` `service`/`product` e identidade `(marca_id, normalized_url)`) e `marcas.site_url`. | Verificado no código | `supabase/migrations/0004_brand_site_catalog.sql:46-72`; `lib/marca/site-contracts.ts:7`; `lib/marca/site-canonical-url.ts:104`, `:119`, `:140` |

---

## 5. Proposta por fatia, na ordem do pipeline

Tudo nesta seção é **Proposto**, salvo quando a linha cita evidência.

### F1 · Minerador: declaração, import, Vínculo, rodapé e aprovação

**Dono:** Minerador. **Arquivos compartilhados tocados, de forma aditiva:** `lib/minerador/keyword-vinculo.ts` (lido pelo Arquiteto) e `lib/minerador/keyword-import-core.ts`.

#### F1.1 Dado: a declaração

Fica em `minerador_keywords.analise_semantica`, no padrão de `keyword_page_type`:

| Chave | Formato | Observação |
| --- | --- | --- |
| `keyword_subject` | `{ declared: true, note: string \| null, destinationUrl: string \| null, destinationCheck: DestinationCheck \| null }` ou `null` depois de retirada | `note` com até 280 caracteres, sem quebra de linha |
| `keyword_subject_actor` | `auth.users.id` | identidade do ator (`AGENTS.md` §5). **Nunca** e-mail nem `"local-user"`: o lote de KGR, que serve de padrão ao lote do Vínculo, faz `session?.user?.email \|\| session?.user?.id \|\| "local-user"` (`modules/minerador/minerador-workspace.tsx:2241`), e essa linha **não** é copiada. Sem `auth.users.id`, a declaração é recusada |
| `keyword_subject_at` | ISO 8601 | |
| `keyword_subject_origin` | `"import" \| "review" \| "batch"` | P4: o select do import vale como declaração humana |
| `keyword_subject_history` | `[{ previous, next, note, destinationUrl, actorId, changedAt, origin }]` | append-only; `previous`/`next` ∈ `none \| declared` |

`DestinationCheck = { hostMatchesBrand: boolean, catalogPageType: SitePageType | null, catalogTitle: string | null, checkedAt: string }`.

**Código novo:** `lib/minerador/keyword-subject.ts`, domínio puro, com `resolveKeywordSubject`, `setKeywordSubject` e `withdrawKeywordSubject`. O `setKeywordSubject` devolve `changed: false` quando nada mudou, como `setKeywordPageType` (`lib/minerador/keyword-page-type.ts:134-136`).

**Leitura única.** `resolveKeywordVinculo` ganha dois campos aditivos, `subject` e `subjectLabel` (`"Assunto · declarado"` ou `null`). `keywordVinculoSummary` só acrescenta ` · Assunto · declarado` quando há declaração. **Sem Assunto, a frase fica byte a byte igual**, e o Arquiteto recebe o dado pela mesma porta (`lib/arquiteto/editorial-unit-declaration.ts:89-106`). O enum `KEYWORD_PAGE_TYPES` e o `EditorialUnitDeclarationSchema` **não mudam**: o Assunto não é tipo de página (P2).

**KeywordDNA.** A vista derivada ganha um bloco opcional `subject`. Ela não é persistida (§62), então não há risco de rollback.

#### F1.2 Página de destino: como validar

1. **Obrigatório:** a URL é `https` e o host é o do site da marca, via `resolveBrandSiteOrigin(marcas.site_url)` e `isBrandSiteHost` (`lib/marca/site-canonical-url.ts:104`, `:119`). Fora do domínio, a URL é recusada com motivo. Se a marca não tiver `site_url`, o Assunto é aceito **sem** destino e a tela diz por quê.
2. **Informativo, nunca bloqueia:** o catálogo remoto. Busca por `(marca_id, normalized_url)` com `brandCanonicalSiteKey`, e colunas estreitas (`normalized_url,page_type,title,h1`). Se achar, grava `catalogPageType` e `catalogTitle`. Se não achar, fica `null` e aparece "fora do catálogo". Landing costuma não estar no sitemap, como a página de Silo (`docs/03-minerador/spec.md:708`).
3. **Sem busca na rede:** conferir se a página está no ar continua sendo ação da Marca ("Conferir por link"), não desta declaração.

#### F1.3 Import com o select Assunto/Keyword

- `DiscoverySourceControls` (compartilhado com o Descobrir, `discovery-keywords-page.tsx:209`) ganha a prop opcional `subjectEntry?: boolean`. Só o Processador a passa (`minerador-workspace.tsx:3006`), e só então aparece o select **"Esta lista é"**, acima do select de lista, com padrão **Assunto**. **No Descobrir o select não aparece** e tudo segue como keyword, como hoje: o dono disse que lá "trata-se de keywords". Uma keyword do Descobrir continua podendo ser declarada Assunto pela Revisão Humana (F1.4) e pelo rodapé (F1.6). **A escolha decide a rota, não a tela.**
  - **Keyword:** sem mudança. Vai para `/discovery/sources` e para a Descoberta medir.
  - **Assunto:** vai para uma rota nova, `POST /api/minerador/marcas/[brandId]/subjects/import`, com `requireTenantPermission(... module: "minerador", action: "edit")` como em `/discovery/sources`. O import órfão **não é ressuscitado**, porque não deduplica.
- **CSV:** colunas opcionais novas `nota` (aliases `nota`, `assunto nota`, `para quem`) e `pagina` (aliases `pagina`, `pagina destino`, `destino`, `landing`). O CSV de uma coluna, só títulos, continua válido.
- **Duas etapas na mesma rota:**
  - `mode: "preview"` não escreve nada. Classifica cada linha em: **nova**, **já existe sem Assunto**, **já existe como Assunto** (igual ou com nota/destino diferente), **publicada** ou **inválida**.
  - `mode: "apply"` cria as novas como `bruto`, com a declaração e `lista_id` (padrão ou coluna), e declara nas existentes **só os ids que o humano marcou** (`declareExistingIds`).
- **Frase que já existe na marca: nunca sobrescrever em silêncio.**

| Caso | O que acontece |
| --- | --- |
| Existe e não é Assunto | Aparece na prévia **desmarcada**, com status e origem. Só é declarada se o humano marcar. Se estiver aprovada, a tela avisa que vai para Em revisão (F1.5). |
| Existe e já é Assunto, com a mesma nota e o mesmo destino | `existing`, sem escrita (idempotente). |
| Existe como Assunto, com nota ou destino diferentes | **Mantém o que está gravado.** A prévia mostra as duas versões, e a troca se faz na Revisão Humana. |
| Publicada | Pode ser declarada, se marcada (P5). Nada estrutural muda. |
| Apagada e ainda na janela de restauração | Segue a regra atual do núcleo, que busca só as vivas (`.is("deleted_at", null)`, `lib/minerador/keyword-import-core.ts:157-161`): a frase é criada como nova. Para a prévia **avisar** que existe versão apagada, a rota faz uma leitura estreita **separada**: `id,keyword` da marca com `deleted_at is not null` e `purge_after` no futuro. Custo na tabela F1.9. |

- **Idempotência sem tabela nova, com limite declarado.** A deduplicação por keyword normalizada e por marca (`normalizeKeyword`, `lib/minerador/keyword-import-core.ts:64-68`) mais `changed: false` fazem a **reimportação** não criar nem regravar nada. **Mas não há garantia no banco:** não encontrei índice único em `minerador_keywords(brand_id, keyword)` nas migrations (**Não encontrado**), e o tratamento de corrida do núcleo (`:222-242`) é uma segunda busca depois do insert, não uma restrição. **Dois envios simultâneos do mesmo lote podem criar duplicata.** Mitigação nesta SDD, sem migration: o botão fica desabilitado enquanto o envio está em curso, e a rota recusa um `importRequestId` que já está em processamento na mesma instância. Isso reduz, mas não elimina, o risco entre instâncias. A garantia real exige um índice único parcial (`brand_id`, keyword normalizada, `deleted_at is null`), que é migration e fica como **dependência registrada**, fora desta SDD (Q8). A tabela de lotes da Descoberta não serve, porque exige `discovery_run_id`.
- **Núcleo compartilhado, com mudança aditiva:** uma função irmã, `importSubjectsWithCore`, no mesmo arquivo. Ela reusa `normalizeKeyword` e o tratamento de corrida (`:217-245`), e grava um bloco `subject_import` (origem, lote, instante) no lugar de `discovery_import`. `importKeywordsWithCore` e `KeywordImportSource = "discovery"` **não mudam**. Consumidor preservado: `/discovery/import`.
- **Intenção e funil preliminares não são gravados** para o Assunto. Quem os dá é a Lógica (D2).

#### F1.4 Vínculo na Revisão Humana e na coluna

- **Revisão Humana** (`components/editorial/dna-panels.tsx`, seção "Vínculo", `:519-575`): um terceiro controle, "Assunto" (Não / Declarado), com a nota e a página de destino quando está declarado. Grava com readback, como o tipo de página (`modules/minerador/minerador-workspace.tsx:2452-2481`), por uma ação nova `{ type: "subject" }` em `HumanReviewAction` (`lib/minerador/human-review.ts:20-37`). Os controles seguem `docs/compartilhado/sistema-visual.md`: selects compartilhados e texto ≥ 14px.
- **Coluna Vínculo e cabeçalho do Perfil:** só refletem, por `resolveKeywordVinculo`. Mostram o selo `Assunto · declarado` com o token `context-accent`, o mesmo de "tipo declarado" (`docs/03-minerador/spec.md:865`). Nenhuma cor nova.
- **O teste de contagem de `resolveKeywordVinculo`** (1 no workspace, 2 no card; `docs/03-minerador/spec.md:838`) continua valendo. Ninguém lê `keyword_subject` direto na tela.

#### F1.5 Retirar a declaração

- Grava `keyword_subject: null` e acrescenta uma entrada ao histórico. Não apaga o histórico.
- **Efeito no pacote aprovado.** A chave entra na assinatura (`lib/minerador/approved-package.ts:221-229`), então a keyword aprovada vira `em_revisao` (`lib/minerador/editorial-status.ts:83-98`). O Arquiteto continua no último pacote aprovado, que ainda diz Assunto, até haver nova aprovação (`docs/03-minerador/spec.md:654`). Sem Volume e Resultados, a reaprovação fica bloqueada pela trava normal. **A tela avisa antes de confirmar:** "Esta keyword foi aprovada como Assunto. Sem a declaração, aprovar exige Volume, Resultados e KGR, e o Arquiteto seguirá vendo o Assunto até lá."
- O mesmo vale ao **declarar** numa keyword já aprovada: ela vai para Em revisão, e a reaprovação só exige a Lógica.

#### F1.6 Rodapé com todas as escolhas humanas em grupo

- Um select **"Vínculo"** entra ao lado do select de KGR, com grupos: **Assunto** (Declarar · Retirar), **Tipo de página** (os 4 tipos) e **Posto** (Travado ao slug · Livre). O posto só se aplica a publicadas. As demais são **puladas e contadas** no aviso, como faz o handler individual (`modules/minerador/minerador-workspace.tsx:2388`). O item também aparece em "Mais ações", como Status e KGR.
- Em grupo, a declaração aceita **uma nota e uma página de destino opcionais, iguais para todas as selecionadas** (Q5 (e), decidida). É útil quando várias frases apontam para a mesma landing. Em branco, o grupo declara sem nota nem destino, e a coluna marca **"Assunto sem nota"** até o humano completar na Revisão Humana. O destino em grupo passa pela mesma validação da F1.2, uma vez para o lote. Recusado, nada é gravado e a tela diz por quê.
- **Mesmo padrão do lote de KGR:** plano puro (`planVinculoBatch`), update por `id` + `brand_id` + `deleted_at is null`, progresso e readback. Ordem sugerida na barra: Lógica → Volume → Resultados → Revisar → KGR → **Vínculo** → Concluir revisão → Status. O ator é `auth.users.id` (F1.1), não o `actorId` do lote de KGR.
- **Aviso de rebaixamento antes de confirmar.** Declarar ou retirar o Assunto, e trocar tipo ou posto, muda a assinatura do pacote, e toda aprovada da seleção vai para Em revisão (`lib/minerador/editorial-status.ts:83-98`). O plano conta essas keywords, e a confirmação diz o número: "12 aprovadas desta seleção vão para Em revisão". Sem aprovadas na seleção, não há aviso.
- **Readback estreito, um corte localizado de egress:** `select("id,brand_id,analise_semantica->keyword_subject,analise_semantica->keyword_page_type,analise_semantica->primary_keyword_policy")` no lugar de `select("*")`. Isso dá ~0,5 kB por linha, contra ~9,5 kB. O estado local recebe o `analise_semantica` escrito, e o readback só confirma.
- **Limite do readback estreito, declarado.** A escrita regrava o `analise_semantica` **inteiro**, a partir da cópia do navegador (`modules/minerador/minerador-workspace.tsx:2261-2266`, o mesmo do lote de KGR). Se outra aba ou uma rota do servidor (Resultados, Volume) gravou outra chave entre a leitura e a escrita, essa chave se perde, e o readback das três chaves não percebe. O risco já existe hoje no lote de KGR; esta SDD não o piora nem o resolve. Quando a migration `row_version` for aplicada, o update passa a exigir o `row_version` lido, e o readback o confere. Até lá, o risco fica registrado (seção 7).
- Status e KGR continuam onde estão (`:3833-3867`).

#### F1.7 Exceção de aprovação (D2), na tela e no servidor (P10)

- **Domínio:** `resolveApprovalReadiness` lê `resolveKeywordSubject(semantic).declared`. Quando há declaração, `missing` só pode conter `logic`. O motivo diz: "Assunto declarado: dispensa Volume, Resultados e KGR; a Lógica continua exigida." `ApprovalRequirement` não muda. (A SERP já não é exigida: §61, `approved-package.ts:72-76`.)
- **Tela:** nada muda. O workspace já chama a função (`modules/minerador/minerador-workspace.tsx:2148-2161`).
- **Servidor, onde:** em `prepareCanonicalHandoff` (`lib/server/arquiteto-workspace.ts:278`), ao lado do filtro de elegíveis (`:296-297`). A leitura já traz `analise_semantica` (`:98`), então o **custo extra de leitura é zero**.
- **Só para frente, nunca retroativa.** A trava do servidor vale só para aprovações registradas **depois** que ela for ligada: o código compara `aprovacao.approvedAt` (`lib/minerador/approved-package.ts:303-308`) com uma constante de ativação da fatia (`SERVER_APPROVAL_GATE_SINCE`). Aprovação anterior à constante passa como hoje, mesmo sem Volume, e aparece com um alerta informativo. Motivo: o próprio backfill registrou que a trava "NÃO é aplicada retroativamente" (`scripts/minerador-backfill-aprovacao.mts:13-14`), e revogar aprovação humana antiga seria decisão do Dev (`AGENTS.md` §9). Aplicar para trás só com decisão explícita do dono (**Q9**). Nenhum dado é regravado: a constante fica no código.
- **Efeito:** keyword aprovada depois da ativação, não recebida, que não passa na trava é recusada no envio, com o motivo de `resolveApprovalReadiness`. Keyword **já recebida** não sai do Arquiteto (§10) e só gera alerta.
- **Isso emenda duas regras vigentes**, que vão para a seção 8: o §60 da spec do Minerador, "no handoff ao Arquiteto ... permanecem apenas a Brand ativa e o status editorial" (`docs/03-minerador/spec.md:632`), e o gate do Minerador, "Estado de processo é informação, nunca veto" (`lib/minerador/arquiteto-handoff-gates.ts:44-56`). O gate do Minerador passa a repetir a mesma trava, para a tela e o servidor dizerem a mesma coisa.
- **Por que no handoff, e não numa rota nova de aprovação:** a escrita do status sai hoje direto do navegador (`:2201-2206`). Transformá-la em rota de servidor muda o workflow de toda aprovação e sai do escopo. O handoff é a porta por onde nada "chega pela metade" ao Arquiteto, que é o objetivo do §61. A rota de aprovação no servidor fica registrada como pendência (decisão aberta Q3).
- **Antes de ligar, dry-run correto.** O dry-run do backfill **não serve**: ele conta só as aprovadas sem registro de aprovação (`pendentes`, `scripts/minerador-backfill-aprovacao.mts:51`, `:57-63`). O dry-run desta fatia é um script novo, só leitura, que conta **todas** as aprovadas vivas **ainda não recebidas** pelo Arquiteto e, entre elas, quantas não passariam na trava, separando as aprovadas antes e depois da constante. Ele alimenta a Q9. Fica a cargo do usuário, porque lê o remoto; custo: `id,status,volume_search,results_allintitle,intent,analise_semantica` das aprovadas da marca (dezenas de linhas, ordem de centenas de kB).

#### F1.7b Lógica automática depois de declarar

O dono pediu que, declarado o Assunto, a keyword fique "já habilitada para ser aprovada". Como a Lógica continua exigida (D2), ela roda **sozinha** logo depois de cada declaração, nas keywords que ainda não a têm:

- depois de **aplicar o import** de Assuntos, nas criadas e nas existentes que foram declaradas;
- depois da **declaração em grupo** pelo rodapé;
- depois da **declaração na Revisão Humana**.

Regras:

- Usa a **mesma rotina do botão Lógica** (`processLogicalKeywordDna`, `modules/minerador/minerador-workspace.tsx:734`): local, determinística e sem provider. Não existe caminho paralelo.
- Mostra o mesmo progresso do botão. Uma falha em uma keyword não desfaz a declaração: a keyword fica sem Lógica, com o motivo, e o botão Lógica continua disponível.
- **Não aprova nada.** A aprovação continua sendo um ato humano pelo Status (`AGENTS.md` §9).
- Custo: o da Lógica de hoje. Nenhuma chamada paga.

#### F1.8 Consumidores afetados (F1)

| Consumidor | Efeito |
| --- | --- |
| Arquiteto (`editorial-unit-declaration.ts`, `identity-context.ts`, `territorial-workspace-rows.tsx:546-549`) | lê `subject` pela mesma porta; a frase só muda com Assunto |
| `/discovery/import` e `importKeywordsWithCore` | intactos |
| Assinatura do pacote | chave nova assinada: declarar ou retirar muda o hash (desejado) |
| `tests/minerador-aprovacao-versionada.test.mts` | os casos atuais continuam iguais; entram casos de Assunto |
| `lib/minerador/arquiteto-handoff-gates.ts` e `docs/03-minerador/spec.md` §60 | hoje "processo nunca é veto" no envio; passam a aplicar a trava às aprovações posteriores à ativação (F1.7). Mudança de regra, não aditiva: exige a aprovação desta SDD |
| `DiscoverySourceControls` no Descobrir | intacto: a prop nova é opcional e só o Processador a passa |

#### F1.9 Custo (F1)

| Gatilho | Leitura | Chamada paga |
| --- | --- | --- |
| Prévia do import | `id,keyword,status,lista_id` das vivas da marca: ~170 B por linha (dois UUIDs de 36 caracteres, a keyword, o status e as chaves do JSON), ~45 kB para as 267 vivas medidas na SDD de egress (ESTIMADO), mais `analise_semantica` **só** das que casaram | 0 |
| Aviso de versão apagada | `id,keyword` das apagadas ainda restauráveis da marca: ~110 B por linha; dezenas de linhas, poucos kB (ESTIMADO) | 0 |
| Aplicar o import | insert/update devolvendo `id` (R6) | 0 |
| Declarar ou editar na Revisão | 1 update, readback estreito de ~0,5 kB, 1 consulta ao catálogo de ~0,3 kB | 0 |
| Lote do Vínculo | ~0,5 kB × N | 0 |
| Listagem | +0,3 a 0,6 kB por keyword **declarada**; zero nas outras | 0 |
| Trava no handoff | 0 extra | 0 |
| Lógica do Assunto | a mesma de hoje | 0 |

O núcleo atual lê `analise_semantica` da marca inteira a cada import (`keyword-import-core.ts:157-161`). A rota do Assunto **não** repete isso. Estreitar o caminho da Descoberta fica como sugestão ao backlog de egress, fora desta SDD.

#### F1.10 Testes com fixtures (F1)

Todos são `node --test` sobre fixtures, sem rede nem provider. Timestamps com `+00:00`, não só `Z`. Testes estruturais removem comentários antes de casar.

- `keyword-subject`: declarar, retirar, idempotência, histórico append-only, nota > 280 recusada, ator obrigatório.
- `keyword-vinculo`: sem Assunto a frase e o objeto ficam iguais ao de hoje (snapshot); com Assunto, `subjectLabel`. O enum de tipos fica intacto.
- Aprovação: Assunto com Volume `null` e sem Resultados é aprovável depois da Lógica; sem Lógica, recusa; keyword comum continua exigindo tudo.
- Handoff no servidor: aprovada **depois** da ativação, sem processo, é recusada; aprovada **antes** da ativação passa com alerta; Assunto com Lógica passa; keyword já recebida gera alerta e não sai. O gate do Minerador e o do servidor dão o mesmo veredito para a mesma fixture.
- Ator: declaração sem `auth.users.id` é recusada; sessão só com e-mail não vira ator; `"local-user"` nunca é gravado.
- Lote: a confirmação conta as aprovadas que vão para Em revisão.
- Import: no Descobrir o select não aparece e o envio segue para `/discovery/sources`; prévia sem escrita; frase existente não declarada sem marcação; `importRequestId` em curso recusado; reimportação sem escrita; lista padrão; URL fora do domínio recusada; isolamento: a mesma frase em outra marca não casa.
- Lote: plano pula o posto em não publicadas; readback estreito confere as três chaves; isolamento por `brand_id`.
- Estrutural: `setKeywordSubject` só é importado pelo workspace e pela rota do import. Nenhum caminho de IA ou MCP o chama (P4).

---

### F1b · Minerador: Pesquisa por Assunto no Descobrir (Camada 1)

**Dono:** Minerador. **Pedido do dono (2026-09-24):** um tipo de pesquisa que, a partir de um assunto ou tema escrito, encontre "de forma automática" as keywords que o sustentam, para quando "não se sabe nada sobre como o público procura". **Escopo escolhido por ele: só a Camada 1.** Sem provider novo e sem IA. A leitura por sentido com IA fica para uma SDD futura.

**Arquivos compartilhados tocados, de forma aditiva:** `lib/server/integrations-runtime.ts`, `lib/server/platform-integrations-admin.ts` e `lib/server/dataforseo-canonical.ts` (catálogo do ledger, F1b.8), além de `lib/minerador/google-ads-discovery-usage.ts` (chave com sufixo). **Não toca:** `lib/minerador/keyword-import-core.ts`, `lib/minerador/approved-package.ts`, a rota `google-ads/descobrir-keywords` nem os arquivos da F1. A F1b corre em paralelo à F1 com arquivos próprios (seção 10). Ela **só usa** o que a F1 entrega, citado pelo nome porque as linhas se deslocam: `resolveKeywordSubject` e `normalizeKeywordSubjectNote` (`lib/minerador/keyword-subject.ts`, hoje em `:145` e `:171`), `validateSubjectDestination` (`lib/minerador/subject-destination.ts`, hoje em `:62`) e a rota `POST /api/minerador/marcas/[brandId]/subjects/import` da F1.3 (para a declaração opcional da frase, F1b.7). Esses arquivos existem na cópia de trabalho, em implementação pela F1, e ainda não foram homologados.

#### F1b.1 O que muda

| Ponto | Proposta | Grau e evidência |
| --- | --- | --- |
| Seletor | O radiogroup "Tipo de descoberta" ganha uma terceira opção, **"Por Assunto"**, ao lado de "Palavra-chave" e "Como clientes me encontram". | Hoje: Verificado no código (`modules/minerador/discovery/discovery-search-row.tsx:15-16`, `:59`) |
| Contrato do modo | O modo novo **não entra** em `DISCOVERY_MODES` (`modules/minerador/discovery/discovery-types.ts:16`). Esse enum alimenta o `z.enum` da rota do Google Ads (`app/api/minerador/marcas/[brandId]/google-ads/descobrir-keywords/route.ts:43`) e o `source_data` da run (`lib/minerador/discovery-context.ts:11-27`). A tela usa uma lista própria, `DISCOVERY_SEARCH_KINDS = [...DISCOVERY_MODES, "subject"]`. O modo "subject" nunca chega à rota antiga. | Proposto. Os usos do enum são Verificados no código |
| Campos | **Assunto** (obrigatório, de 1 a 200 caracteres, como a semente de hoje), **Nota** (opcional, até 280, com o normalizador da F1) e **Página de destino** (opcional, validada pela F1.2). Também há o select **"Usar um Assunto declarado"**, que preenche os três campos. Nesse caso o servidor relê a declaração pelo id no plan **e** no execute, sem confiar no texto da tela: `.eq("id").eq("brand_id", context.brandId).is("deleted_at", null)`, colunas `id,keyword,analise_semantica->keyword_subject`, e exige `resolveKeywordSubject(...).declared`. Id de outra marca ou inexistente vira o mesmo 404, sem distinguir os dois; Assunto retirado vira 409 com o motivo. | Proposto |
| Destino da Nota | **A Nota não é semente.** Os endpoints da Camada 1 recebem keywords, e usar uma descrição ("o que é, para quem") como semente seria inventar termo. A Nota serve a duas coisas: vai para a declaração da frase como Assunto, se o humano marcar essa opção no envio (F1b.7), e é um dos sinais da F2.4 (sobreposição de termos com a nota). Sem a opção marcada, ela fica só na lista local. A tela diz isso ao lado do campo: "A nota não muda a pesquisa; ela acompanha o Assunto, se você o declarar no envio." | Proposto |
| Disparo | Enter ou o botão **Pesquisar** montam o **plano**, que não paga nada. A execução só acontece depois de **"Confirmar e pesquisar"** no diálogo de custo (F1b.4). O campo tem a ajuda "Enter mostra o custo antes de pesquisar." | Proposto |
| Processador | O botão **"Buscar sustentação"** aparece na linha e na Revisão de uma keyword com Assunto declarado. Ele abre `/{brandRef}/minerador/descobrir?modo=assunto&assunto=<keywordId>`. A URL leva **só o UUID**, nunca a frase nem a nota. O botão entra depois que a F1 fechar os arquivos do Vínculo (F1.4). | Proposto |
| Rota da página | A página do Descobrir hoje recebe só `params` (`app/(brand)/[brandRef]/minerador/descobrir/page.tsx:6`). No Next.js 16, `searchParams` é uma `Promise` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:14`). A implementação consulta esse guia antes de ler o parâmetro. | Verificado no código · Documentado |
| Texto da regra | Neste modo, a ajuda diz: **"O Google Ads e o DataForSEO Labs devolvem as candidatas; o Minerador não fabrica termos."** O DataForSEO Labs é outro provider, com base própria, e não é atribuído ao Google. "Não fabrica" repete o verbo dos outros modos, para a regra ter uma só forma. Os outros modos mantêm o texto de hoje (`discovery-search-row.tsx:70`; `modules/minerador/context-help.ts:62`). Candidata continua vindo só de provider. | Texto atual: Verificado no código · Proposto |
| Outros modos | Sem mudança. Continuam só keyword, na rota de hoje, com a run gravada como hoje. | — |

#### F1b.2 Fontes e tetos

Cada fonte tem um teto próprio e uma origem registrada na candidata. Uma falha em uma fonte não derruba as outras. O resultado diz o estado de cada uma: ok, vazia, falhou ou não executada por orçamento (F1b.4). Não existe estado "não autorizada": o plano é autorizado inteiro, e o diálogo não desliga fonte (F1b.4).

| # | Fonte | Chamada | Teto | Custo | Origem |
| --- | --- | --- | --- | --- | --- |
| 1 | Google Ads, frase | `generateGoogleAdsKeywordIdeas` com `seed: { kind: "keyword", keywords: [frase] }` | `pageSize` 300 | grátis | `ads_keyword_seed` |
| 2 | Google Ads, frase + página | `seed: { kind: "keyword_and_url", keywords: [frase], url: destino }`. **Só** com `validateSubjectDestination(...).code === "ACCEPTED"` e `destinationUrl` preenchido. `ok: true` não basta: a função também devolve `ok: true` para `EMPTY` e `NO_BRAND_SITE`, sem destino (`lib/minerador/subject-destination.ts:64`, `:68`). Com um Assunto declarado, o destino gravado é revalidado no execute contra o `marcas.site_url` **atual**, porque a declaração o conferiu na data dela. O schema aceita qualquer `.url()` (`lib/google/ads/contracts.ts:28`), então a validação fica na rota. | `pageSize` 300 | grátis | `ads_url_seed` |
| 3 | Pesquisas relacionadas do Google | Labs `related_keywords/live`, `keyword` = frase, `depth` 2 | `limit` 100 | 1 task + itens | `labs_related` |
| 4 | Mesma categoria | Labs `keyword_ideas/live`, `keywords` = [frase] | `limit` 100 | 1 task + itens | `labs_category` |
| 5 | O que o topo da SERP já ranqueia | Labs `ranked_keywords/live`, `target` = URL, orgânico, filtro `rank_group <= 20` | até 5 URLs × `limit` 100 | até 5 tasks + itens | `labs_ranked`, com URL e posição como evidência |

- **Verificado no código:** o Google Ads já aceita `keyword_and_url` (`lib/google/ads/contracts.ts:28`), que vira `keywordAndUrlSeed` (`lib/google/ads/keyword-ideas.ts:13`). O único endpoint Labs em uso é o `keyword_overview` (`lib/minerador/dataforseo-keyword-overview-core.ts:3`), e o normalizador dele lê só `items[0]` (`:152-170`). **Não encontrado:** `related_keywords`, `keyword_ideas` e `ranked_keywords` não aparecem em nenhum ponto do código. Os três precisam de construtor de pedido e normalizador novos, num módulo puro próprio (`lib/minerador/dataforseo-labs-keyword-research-core.ts`, Proposto), no padrão de erros e de conferência de eco do `keyword_overview` (`:38-58`, `:162-166`).
- **Local e idioma:** Labs e SERP usam `location_code` 2076 e `language_code` `"pt"`, e o normalizador exige o mesmo eco. O DataForSEO recusa UF (`lib/minerador/dataforseo-targeting.ts:4`, `:34`). O Google Ads segue o targeting do Descobrir, com UF se o usuário escolher. A tela diz: "Pesquisas do DataForSEO e resultados do Google: Brasil inteiro. A UF vale só para o Google Ads." Verificado no código · Proposto.
- **Frase longa ou sem busca**, o caso da seção 1 ("estratégias tráfego pago clínica estética 2026 leads qualificados"): as fontes 3 e 4 partem da frase como keyword e dependem de ela existir na base do Labs, então podem voltar vazias e cobrar a task mesmo assim. Nesse caso, quem sustenta a pesquisa é a fonte 5 (o que o topo da SERP da frase ranqueia) e a fonte 2 (Google Ads com a página). A Camada 1 não garante resultado para esse tipo de frase; a homologação mede o que cada fonte devolve (F1b.12, passo 3). O diálogo avisa: "Frases longas ou sem busca podem não ter pesquisas relacionadas; cada fonte cobra a consulta mesmo sem resultado." Proposto; o comportamento do Labs com frase sem volume é **Ainda não verificado**.
- **Dedupe e origens:** a chave é `normalizeKeyword` (`lib/minerador/keyword-import-core.ts`, hoje em `:69`; o arquivo está em edição pela F1), a mesma do import, que é a autoridade. A rota do Google Ads usa `normalizeGoogleAdsKeyword` (`descobrir-keywords/route.ts:356`); a F1b não a usa, para "já existe" e import concordarem. Uma candidata que veio de várias fontes guarda **todas** as origens. Isso difere da `DiscoveryCandidate`, que tem uma só `source` (`lib/minerador/discovery-keywords.ts:5`), e por isso o modo tem tipo e tabela próprios. Os componentes de seleção e a barra continuam compartilhados, por composição (spec §47).
- **"Já existe":** lido na execução, como no Google Ads (`descobrir-keywords/route.ts:355-357`), com `id,keyword` das vivas da marca. A própria frase, se aparecer, recebe o selo "é o Assunto".
- **Teto total depois da dedupe:** 600 candidatas. A ordem é: mais origens primeiro, depois as que têm métrica do Google Ads e depois a melhor posição no `ranked_keywords`. Um corte aparece como "600 de N exibidas" e fica registrado na busca. Proposto.
- **Rótulo de origem:** a tabela de hoje rotula como "Google Ads" qualquer `source` desconhecida (`modules/minerador/discovery/discovery-table-placeholder.tsx:89`). No modo novo, cada origem tem rótulo próprio, e nenhuma cai no padrão em silêncio. Verificado no código · Proposto.

#### F1b.3 SERP da frase: cache primeiro, 4 lentes

- **Mesmos parâmetros do Resultados do Processador**, para o cache servir depois. A lente canônica usa `advanced` com profundidade 20 (`SEMANTIC_SERP_DEPTH`, `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts:169`, `:208-219`). As três extras usam `advanced` com profundidade 10 e digest (`lib/server/minerador-serp-lens-coverage.ts:71-73`, `planSerpLensCoverage` em `:152`), com `keywordId: null` (`:103`). Se a frase virar depois uma keyword Assunto e for medida no Resultados, as lentes já estão no cache e não são pagas de novo. Verificado no código · Proposto.
- **Plano:** `lookupSerpCache` (`lib/server/serp-cache.ts:63`) separa acertos e faltas antes de qualquer credencial. As lentes que faltam entram no plano pago. Pagas, vão para o cache da marca por `collectAndCacheSerp` (`:132`), com validade de 30 dias (`lib/editorial/serp-cache.ts:89`). É a regra do dono: SERP paga vai para o cache desde a primeira coleta, sempre nas 4 lentes.
- **URLs para a fonte 5:** a lente canônica guarda o corpo, e as URLs saem de `buildSerpOrganicDigest` (`lib/editorial/serp-cache.ts:526`), lido em modo `body` ou do corpo que acabou de ser pago. As extras guardam só o digest. Uma entrada extra antiga, sem digest, não tem URL e fica fora da união (`minerador-serp-lens-coverage.ts:66-69`). Verificado no código.
- **Escolha das até 5 URLs:** união das 4 lentes, só orgânicos, sem URL repetida. A ordem é a melhor posição entre as lentes; no empate, ganha quem aparece em mais lentes. Proposto.
- **A SERP da frase é uma unidade só:** as 4 lentes, ou nenhuma. Não há autorização lente a lente, e o plano não oferece pagar só uma parte (regra do dono: sempre 4 lentes). As lentes já em cache simplesmente não entram no plano pago.
- **Relação com a P7** ("SERP da própria frase ... só sob pedido"): na Pesquisa por Assunto, a fonte 5, escolhida pelo dono para esta fatia, depende da SERP da frase. Confirmar o plano, que mostra as lentes a pagar, conta como o pedido explícito. Fora deste modo, a P7 vale como está. Proposto.
- **Sem SERP, não há fonte 5:** a leitura do cache falhou, a coleta paga falhou ou o orçamento parou antes dela (F1b.4). As fontes 1 a 4 seguem. Nenhuma recoleta automática.

#### F1b.4 Plano, autorização e execução

- **Rota nova:** `POST /api/minerador/marcas/[brandId]/subject-discovery/search`, com `mode: "plan" | "execute"` e `requireTenantPermission(... module: "minerador", action: "edit")`, como a execução do Google Ads (`descobrir-keywords/route.ts:305`). O import fica ao lado, em `.../subject-discovery/import` (F1b.7). Verificado no código (2026-09-24; o desenho original dizia `/subject-discovery`, seção 11.4).
- **Plano genérico por fonte**, num módulo puro próprio (`lib/minerador/subject-discovery-plan.ts`, Proposto). O plano do Arquiteto é organizado por lente (`SerpPaidPlan`, `lib/arquiteto/serp-lens-plan.ts:184`) e não serve para 5 fontes. Cada linha traz fonte, endpoint, número de chamadas, preço por task, preço por item, itens máximos e custo máximo. O plano traz também o total máximo, um `planHash` e `ledgerRecording` (F1b.8). As chamadas grátis do Google Ads aparecem no plano com custo 0, mas **só rodam no execute**.
- **O modo plan não materializa credencial.** Ele lê o cache de SERP (`lookupSerpCache`, antes de qualquer credencial; `lib/server/serp-cache.ts:34-36`), a declaração do Assunto, se houver, e a capability do ledger por `repository.findCapability({ capabilityKey, operation, environment })` (a mesma chamada do runtime, `lib/server/integrations-runtime.ts:616`), sem Connection e sem Secret Store. O resolver completo (`lib/server/dataforseo-canonical.ts:101-135`, que resolve a Connection e chama `store.resolve(secret_ref)`) só roda no execute. Verificado no código · Proposto.
- **O que o `planHash` cobre:** `brandId`, frase normalizada (`normalizeKeyword`), `subjectKeywordId` (ou nulo), destino aceito (ou nulo), targeting do Google Ads (local, idioma, UFs), a lista de fontes com endpoint, contagem de chamadas, `limit` e `depth`, as lentes da SERP em falta, os preços unitários e os tetos. Mudar qualquer um muda o hash, e uma autorização não serve para outra frase, outra marca ou outro destino. Proposto.
- **Preços no módulo puro**, com a data da consulta: Labs a US$ 0,012 por task e US$ 0,00012 por item (dataforseo.com, consultado em 2026-09-24; Documentado, fonte externa). A SERP usa a constante que já existe, `SERP_PAID_QUERY_COST_USD` (`lib/arquiteto/serp-lens-plan.ts:100-104`), só lida, nunca alterada. O plano usa US$ 0,0035 por lente como teto.
- **Autorização, no padrão do Arquiteto** (`authorizeSerpPaidPlan`, `serp-lens-plan.ts:462-472`), mas pelo plano inteiro e não por contagem. O execute recebe `authorizedPlan: { planHash, maxCostUsd }` e recalcula o plano no servidor:
  - com chamada paga e sem autorização → `PAID_PLAN_REQUIRED`;
  - `planHash` diferente, ou custo máximo acima do autorizado → `PAID_PLAN_CHANGED`, com o plano novo;
  - nos dois casos, **nada é pago**.
- **Orçamento no servidor, em chamadas e em dólares.** Cada chamada paga consome a vaga reservada para ela, no padrão de `createPaidQueryBudget` (`lib/arquiteto/serp-lens-plan.ts:480-505`). Uma chamada fora do plano recusa com `SERP_PAID_NOT_AUTHORIZED` (`:509`). Como aquele orçamento conta unidades e não dólares, e os preços do Labs são fonte externa não medida, a F1b soma também o `cost` informado por cada task: **antes de cada chamada paga**, se o gasto acumulado mais o custo máximo da próxima chamada passar do `maxCostUsd` autorizado, ela não é feita, e as fontes restantes voltam como "não executada por orçamento". Verificado no código (o orçamento atual conta unidades) · Proposto.
- **Teto rígido por pesquisa:** `SUBJECT_DISCOVERY_MAX_COST_USD = 0,20`, o valor que o dono aceitou. Plano acima dele é recusado. Com os tetos da F1b.2, o plano máximo é US$ 0,182 (F1b.10). Mudar qualquer teto de fonte exige adendo com o custo novo (seção 7).
- **Repetição, pelo ledger antes de pagar.** O execute leva um `operationRequestId` UUID, e as chaves do ledger nascem dele (F1b.8). Hoje, repetir a mesma operação pagaria o provider de novo e, **depois** de pagar, bateria no índice único do ledger (`0024_integrations_resource_governance.sql:185`; `0042_google_ads_infrastructure_usage_ledger.sql:11-13`): o evento novo difere do antigo em `provider_request_ref` e `metadata` (`usageEquivalent`, `lib/server/integrations-runtime.ts:1001-1017`), e o runtime lança `INTEGRATION_IDEMPOTENCY_CONFLICT` 409 (`:1062-1067`; Google Ads em `:1110-1120`). Verificado no código. Regras propostas:
  1. antes de qualquer chamada paga, o execute lê no ledger as chaves de **todas** as chamadas DataForSEO planejadas (`findUsageByIdempotency(connectionId, key)`, ~0,3 kB cada, até 11, em paralelo). Se **qualquer uma** existir, recusa com `OPERATION_ALREADY_EXECUTED` e não paga nada; o navegador monta um plano novo, com outro `operationRequestId`. Conferir só a primeira chave deixaria pagar de novo o Labs inteiro quando ela não chegou a ser gravada (pedido que não saiu, ou falha do ledger que virou `ledgerWarning`). Como o ledger está no banco, isso vale também entre instâncias. Verificado no código (2026-09-24; seção 11.4);
  2. uma falha ou um conflito ao gravar o uso **depois** de pagar nunca descarta o resultado: a resposta volta com as candidatas, o custo informado e um `ledgerWarning`;
  3. continuam o botão desabilitado durante a execução, a recusa de `operationRequestId` em curso na mesma instância e o resultado guardado localmente com o id.
  - **Limites declarados:** dois executes simultâneos com o mesmo id, em instâncias diferentes, podem passar os dois pela leitura antes do primeiro evento existir. E, antes da migration, sem capability, nenhum evento é gravado (F1b.8), então a leitura do item 1 nunca acha nada, e só a trava da instância protege.
- **Diálogo:** mostra cada linha do plano, o total máximo, as lentes já no cache ("0 pagas"), o aviso de frase sem busca (F1b.2) e, se for o caso, o aviso do controle de gastos (F1b.8). O plano é confirmado **inteiro**: o diálogo não desliga fonte, para o total confirmado ser o total executado. **Nada roda sem o humano apertar Pesquisar e confirmar o custo.**

#### F1b.5 Lista local, fora do banco

- **O resultado volta ao navegador.** Não grava run, candidata, `current_metrics` nem histórico. A gravação da Descoberta hoje (`persist_minerador_discovery_run`, `descobrir-keywords/route.ts:366`) não é chamada. O esquema não aceitaria essas candidatas sem migration: `source IN ('google_ads','manual','csv')` (`supabase/migrations/0040_minerador_discovery_multi_source.sql:80-81`). Verificado no código · Proposto.
- **O que vai ao banco na pesquisa:** só o ledger (F1b.8) e a SERP da frase no cache da marca (F1b.3).
- **Recuperação em IndexedDB próprio:** o banco `minerador-pesquisa-assunto`, com a chave `actorUserId:brandId:searchId`, no padrão de `lib/minerador/semantic-qualification-version-cache.ts`: escopo por ator e marca (`:96-103`), prazo de 2 s por operação (`:39`) e adaptador que não toca `indexedDB` ao ser criado (`:293-300`). Busca de outro ator ou de outra marca é ignorada. Se o IndexedDB falhar, a lista fica só em memória, com o aviso de que não sobrevive ao recarregar.
- **O que guarda:** a configuração (frase, nota, destino, `subjectKeywordId`), o plano executado, o custo informado pelo provider, o estado de cada fonte, as candidatas com origens e evidências, as métricas do Google Ads, a estimativa do Labs e a marca "já existe / importada". Cerca de 0,6 kB por candidata; uma busca cheia, de 600, ocupa ~360 kB (ESTIMADO).
- **Natureza do dado:** é estado de apresentação e recuperação, nunca canônico (`AGENTS.md` §10). "Já existe" e "importada" são indicativos; a autoridade é o import.
- **Política:** validade de 30 dias e até 10 buscas por ator e marca. **A remoção automática de busca vencida ou excedente é limpeza de dado local e exige autorização (Q12).** Até lá, nada é apagado sozinho: a busca vencida aparece como "vencida", e o botão "Descartar esta busca" é ato humano, busca a busca.
- **Coerência com a SDD da Descoberta local** (`docs/03-minerador/propostas/sdd-descoberta-temporaria-local-2026-09-23.md`, proposta, D1 a D11 pendentes em `:425-437`). A F1b **não decide** nenhuma delas: usa banco local próprio, não assina recibo (Q11) e não mexe nas rotas nem nas tabelas da Descoberta. Se aquela SDD for aprovada, as duas listas podem convergir num adendo.
- **Texto da tela:** "Lista guardada só neste navegador. Só o envio ao Processador salva no banco. Limpar os dados do navegador apaga a lista. Os resultados do Google ficam guardados para a marca por 30 dias; os do DataForSEO Labs, não: repetir a pesquisa paga de novo."

#### F1b.6 Volume e métricas

- **Google Ads:** as ideias mostram volume, CPC e concorrência como hoje. O Google Ads Keyword Ideas é a fonte canônica de volume da Descoberta (`docs/03-minerador/spec.md:404`, §47).
- **Labs:** o `search_volume` do Labs aparece só numa coluna própria, **"Estimativa DataForSEO"**, com esse rótulo. Ele **nunca** vai para a coluna Volume nem para o filtro "Com volume", e nunca é importado (§47). Quando a mesma keyword veio também do Google Ads, vale a métrica do Google Ads.
- **Filtros** são locais e nunca disparam chamada paga.
- **No import, nenhuma métrica é carregada:** `volume_search` e `results_allintitle` ficam `null`, e `volume_source` usa o padrão do banco, como no núcleo (`buildNewDiscoveryKeywordPayload`, `keyword-import-core.ts`, hoje em `:113-132`). O volume do Google Ads que já apareceu na lista também não vai, e o diálogo de envio explica: "O volume será medido de novo no Processador, pelo Google Ads, sem custo." O Processador mede o volume pelo Google Ads, de graça, com `metricas-keywords` no modo keyword (`app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts:54-60`; chamado em `modules/minerador/minerador-workspace.tsx:2761`). Verificado no código.
- **Por que a proveniência não vai em `discovery_import`:** os leitores de KD e de CPC buscam métricas em `discovery_import.lastMeasurement` e no `sourceSnapshot` (`lib/minerador/dataforseo-keyword-overview-core.ts:232-240`; `lib/minerador/google-ads-demand.ts:127-133`). A proveniência da F1b fica numa chave própria, sem campo numérico, e nenhum desses leitores a enxerga. Verificado no código.

#### F1b.7 Import ao Processador e proveniência

- **Rota nova:** `POST /api/minerador/marcas/[brandId]/subject-discovery/import`, com `action: "create"`, como `/discovery/import` (`app/api/minerador/marcas/[brandId]/discovery/import/route.ts:273`). O código fica em arquivo próprio (`lib/minerador/subject-discovery-import.ts`), que importa `normalizeKeyword` do núcleo **sem alterar** `keyword-import-core.ts`, arquivo que a F1 está mudando. Proposto.
- **Corpo:** `{ importRequestId, searchId, subjectKeywordId?, items: [{ keyword, origins[], evidence[] }] }`, com no máximo 600 itens.
- **Keyword nova:** é criada como `bruto`, `lista_id` nulo e sem métrica, com o bloco `subject_discovery` (abaixo). O insert devolve só `id` (R6).
- **As candidatas nunca são declaradas Assunto:** as keywords importadas são candidatas a sustentação, não Assuntos (P4).
- **A frase pode ser declarada Assunto no mesmo envio, por ato humano.** Sem isso, no cenário principal do pedido (um tema novo, que ainda não é keyword da marca), `subjectKeywordId` ficaria nulo e a F2.4 perderia o sinal. Quando a pesquisa **não** partiu de um Assunto declarado, o diálogo de envio traz a opção "Declarar também "<frase>" como Assunto, com a nota e a página informadas". **Decisão do dono (2026-09-24):**
  - Se a frase **ainda não existe** na marca, a opção vem **marcada**, como o import de CSV do Processador, que vem com Assunto por padrão.
  - Se a frase **já existe**, a opção vem **desmarcada** (Q2), para que uma aprovada não vá para Em revisão sem o humano ver.
  - Em qualquer caso, a declaração só acontece quando o humano confirma o envio (P4).
  - Marcada, o navegador chama primeiro a rota da F1.3 (`subjects/import`, `preview` e depois `apply`) só com a frase, a nota e o destino. É o caminho de declaração da F1, com autor e data (P4); a F1b não importa `setKeywordSubject`, e o teste estrutural da F1.10 continua valendo. A prévia da F1.3 vale para a frase: se ela já existe na marca, o diálogo mostra o estado e o aviso de Em revisão da F1.5, e o humano confirma.
  - Com o id devolvido, o import da F1b segue com `subjectKeywordId` = esse id. A frase sai da lista de itens da F1b, para não ser importada duas vezes.
  - Se a declaração falhar, nada é importado pela F1b, e a tela diz por quê.
  - Desmarcada, a tela diz: "Para ligar estas keywords a um Assunto, declare-o antes, aqui ou no Processador." O `subjectPhrase` fica gravado no bloco e serve de sinal secundário à F2.4 se a frase for declarada depois.
- **O bloco `subject_discovery`** fica em `analise_semantica` e tem até ~1,3 kB:
  - `version: 1`;
  - `searches`: **janela das 5 buscas mais recentes** (a mais antiga sai quando entra a sexta). Cada uma com `searchId`, `importRequestId`, `importedAt`, `actorId` (`auth.users.id`), `subjectKeywordId | null`, `subjectPhrase`, `origins[]`, `evidence[]` (até 3 textos de até 160 caracteres, como "ranqueia em #7 em exemplo.com/pagina") e `provenanceVerified: false` (Q11);
  - `subjectKeywordIds`: os `subjectKeywordId` **distintos** já validados, numa lista à parte, com teto de 10 e sem sair pela janela de `searches`. É o que a F2.4 lê; assim, a saída de uma busca antiga não apaga o sinal. Acima de 10, o mais antigo sai, e essa perda fica declarada.
  - A mesma `searchId` não regrava: a gravação devolve `changed: false`.
- **`subjectKeywordId` é validado no servidor:** mesma marca, keyword viva e `resolveKeywordSubject(...).declared === true`. A leitura é estreita: `id,brand_id,analise_semantica->keyword_subject`. Se o Assunto foi retirado depois da busca, o campo fica `null` e a resposta diz por quê.
- **Keyword que já existe: o bloco entra na assinatura do pacote aprovado.**
  - Verificado no código: `signatureContent` (`lib/minerador/approved-package.ts:329-337`, na cópia de trabalho que a F1 está editando, então as linhas podem deslocar) exclui de `analise_semantica` só `aprovacao`, `evidencia_serp`, as séries de medição (`lib/minerador/listing-payload.ts:23-28`) e o histórico de trava. **Uma chave nova numa keyword aprovada muda a assinatura, e ela vira `em_revisao`** (`lib/minerador/editorial-status.ts:83-98`).
  - Isso também deixaria o pacote de uma publicada divergente, e o handoff confere pacote não divergente (seção 4.3).
  - As três opções, com o custo de cada uma:

| Opção | O que faz | Custo |
| --- | --- | --- |
| **(a)** Não escrever em nenhuma existente | a existente volta como "já existe", com o id | risco zero; as keywords do acervo, justamente as mais maduras, nunca recebem o sinal da F2.4 |
| **(b)** Excluir `subject_discovery` da assinatura | escreve em todas | muda uma função compartilhada, que a F1 está editando. A mudança é aditiva e não afeta nenhum registro atual, porque nenhum tem a chave. Mas abre exceção ao princípio "o Arquiteto não pode ignorar nada do DNA" (`approved-package.ts:207`). Além disso, o sinal **não chega** ao Arquiteto numa aprovada até nova aprovação, porque ele lê o pacote congelado (`lib/arquiteto/editorial-unit-declaration.ts:57-62`): a F2.4 teria de ler a linha viva |
| **(c) Recomendada** | escreve só em existente **sem registro de aprovação** (`analise_semantica.aprovacao` ausente). Nas que têm registro, sejam aprovadas, em revisão ou publicadas, não escreve e devolve "já existe · aprovada: a origem desta pesquisa não foi gravada para não tirar a aprovação" | aprovadas não ganham o sinal; a lista local guarda o vínculo busca → keyword só para exibição. Nenhuma função compartilhada muda, e o sinal sempre viaja **dentro** do pacote aprovado, porque entra antes da aprovação. Exige a escrita condicionada abaixo, e custa a leitura da coluna inteira das existentes que recebem o bloco |

- **Como a opção (c) escreve, sem rebaixar por corrida.** O PostgREST não faz merge de JSONB, e não há RPC de merge para `minerador_keywords.analise_semantica`: as RPCs sobre keywords são só as de ciclo de vida (`app/api/minerador/marcas/[brandId]/keywords/*`). Escrever o bloco exige regravar a coluna inteira, como o núcleo faz hoje: `findExistingByKeyword` e `importKeywordsWithCore` leem a coluna inteira e gravam `.update({ analise_semantica: semantic })` (`lib/minerador/keyword-import-core.ts`, hoje em `:141`, `:164` e `:199-204`; o arquivo está em edição pela F1). Verificado no código. Regras propostas:
  1. primeiro, `id,status,analise_semantica->aprovacao` das existentes que casaram (~0,3 kB cada), para separar as elegíveis (sem registro de aprovação);
  2. depois, `id,status,analise_semantica` **só das elegíveis**, com teto de 50 por envio. Acima disso, as excedentes voltam como "já existe · origem não gravada (limite de 50 por envio)";
  3. o update vem condicionado: `.eq("id").eq("brand_id").is("deleted_at", null).is("analise_semantica->aprovacao", null).eq("status", <status lido>)`, pedindo o `id` de volta para contar as linhas afetadas;
  4. com 0 linhas afetadas, a resposta é "já existe · aprovada ou alterada durante o envio: origem não gravada", sem nova tentativa automática.
  - **Limite declarado:** a condição impede apagar uma aprovação feita entre a leitura e a escrita. Mas uma chave gravada nesse intervalo por outra rota (Resultados, Volume, outra aba) ainda se perde, como no lote da F1.6. Fica registrado na seção 7 até `row_version` ser aplicada. O filtro por caminho JSON (`analise_semantica->aprovacao`) é **Ainda não verificado** no cliente Supabase do projeto; o teste da F1b.11 o cobre com o cliente falso, e a homologação o confirma.

- **Defeito que já existe, fora da F1b, para o backlog do Minerador:** o import da Descoberta regrava `discovery_import.lastSeenAt` em toda keyword existente (`buildDiscoverySemanticEvidence` e o update de `importKeywordsWithCore`, `keyword-import-core.ts`, hoje em `:98` e `:199-204`), inclusive aprovada. Pela mesma regra de assinatura, reimportar pela Descoberta uma keyword aprovada a rebaixa para Em revisão. Verificado no código nas duas pontas; não confirmado por teste. A F1b não repete isso.
- **Idempotência:** `normalizeKeyword` mais trava por `importRequestId` em curso na mesma instância, com o botão desabilitado durante o envio. Reimportar a mesma busca não escreve nada. **O limite da F1.3 continua valendo:** sem índice único, dois envios simultâneos em instâncias diferentes podem duplicar (Q8).
- **Texto vindo do navegador, contra a spec §48.** A §48 diz que o navegador envia só UUIDs de candidata e que texto e proveniência livres "não são aceitos como fonte" (`docs/03-minerador/spec.md:456`). Sem candidata no banco, não há UUID a enviar. A resposta está em **Q11**; a recomendação é:
  - aceitar a keyword como **entrada humana**, com a mesma confiança do CSV e da lista manual do Processador;
  - não aceitar métrica nenhuma;
  - gravar as origens com `provenanceVerified: false`.
  - O único dado usado como sinal pela F2.4, `subjectKeywordId`, é validado no servidor. O recibo assinado fica para quando a SDD da Descoberta local decidir a D3.

#### F1b.8 Ledger e migration

**Fatos (Verificado no código):**

- A capability é procurada por chave, operação e ambiente (`lib/server/integrations-runtime.ts:616`). Sem linha no catálogo, o uso é **pulado em silêncio**: `if (!input.resource.capability) return null;` (`:1034`).
- O CHECK de `integration_capabilities.operation_kind` tem 11 valores (`supabase/migrations/20260825150000_telegram_expert_contribution_platform_foundation.sql:32-45`). O `operation_kind` do evento de uso é outro: `module_operation` (`integrations-runtime.ts:68-73`).
- O bootstrap do Admin insere linhas `production` e **aborta** em qualquer erro de insert que não seja 23505 (`lib/server/platform-integrations-admin.ts:534-575`).
- A chave do ledger do Google Ads é fixa por operação: `google_ads:{op}:keyword_discovery` (`lib/minerador/google-ads-discovery-usage.ts:31-33`). A segunda chamada na mesma operação colide no índice único (`supabase/migrations/0042_google_ads_infrastructure_usage_ledger.sql:11-13`).

**Código (Proposto):**

- `operation_kind` novo, `keyword_research`, em `INTEGRATION_CAPABILITY_OPERATIONS` (`integrations-runtime.ts:13-25`) e em `INTEGRATION_RESOURCE_BY_OPERATION` (`:49-62`), apontando para `dataforseo`.
- Capability `dataforseo.keyword_research` em `INTEGRATION_CAPABILITY_PROVIDER_REQUIREMENTS` (`:32-43`) e em `PLATFORM_CAPABILITY_CATALOG` (`platform-integrations-admin.ts:49-60`).
- Resolver próprio em `lib/server/dataforseo-canonical.ts`, cujo tipo de operação hoje fecha em duas (`:52`).
- Os testes que fixam o catálogo são atualizados.
- **Uma capability só para todas as chamadas DataForSEO da pesquisa:** os 3 endpoints Labs e a SERP da frase. O endpoint vai em `metadata`, com um evento por chamada. A chave é `dataforseo:{op}:keyword_research:{endpoint}:{n}`, e `cost_amount` é o custo informado pela task. Reusar `allintitle` ou `serp_compatibility` rotularia o ledger errado; reusar `keyword_discovery` desviaria para o `google_ads`.
- **Google Ads:** `googleAdsDiscoveryUsageKey` ganha um sufixo opcional. Com ele: `google_ads:{op}:keyword_discovery:keyword_seed` e `…:url_seed`. Sem o sufixo, a string é idêntica, e o Descobrir de hoje fica preservado. Quem grava o uso é `recordGoogleAdsDiscoveryUsage`, que monta a chave por dentro, sem sufixo (`lib/minerador/google-ads-discovery-usage.ts:74`). Por isso ele ganha o mesmo parâmetro opcional, `usageKeySuffix`, repassado à chave; ausente, a chave é a de hoje. O metadata continua com `discoveryRunId`, que vai nulo, o que o tipo já aceita (`:43`, `:77`). Verificado no código · Proposto.

**Migration (Proposto; o usuário executa):**

- `supabase/migrations/<timestamp>_dataforseo_keyword_research_operation.sql`, no padrão de `20260824185700_dataforseo_serp_compatibility_operation.sql`.
- Recria o CHECK com os 11 valores de hoje mais `keyword_research`.
- Insere a linha `dataforseo.keyword_research` (`production`, `request`, `active`) com `ON CONFLICT (capability_key) DO NOTHING`, usando a unicidade de `0024_integrations_resource_governance.sql:45`.
- Aplicação pelo procedimento vigente do usuário, nunca `db push`.

**Antes da migration:**

- A chamada funciona, mas o uso **não é registrado**: o custo fica fora do ledger.
- **Regra proposta:** o plano lê a capability por `repository.findCapability` (F1b.4), sem resolver Connection nem segredo. Se ela vier nula, o plano marca `ledgerRecording: false`, e o diálogo diz **"Este custo não será registrado no controle de gastos até aplicar a atualização do banco `<nome>`."** O custo informado pelo provider continua na resposta e na lista local. Se a execução nesse estado é permitida, o dono decide (Q13).
- Nesse estado, a leitura do ledger que barra a repetição (F1b.4, item 1) nunca acha evento, e só a trava da instância protege.

**Ordem:**

- **A migration vem antes do deploy.** Se o deploy vier primeiro, o bootstrap do Admin tenta inserir a capability nova, o CHECK recusa com 23514 e o bootstrap aborta.
- Com a migration aplicada, o bootstrap encontra a linha como "já presente".

#### F1b.9 Consumidores afetados (F1b)

| Consumidor | Efeito |
| --- | --- |
| Rota `google-ads/descobrir-keywords`, `DISCOVERY_MODES`, `discovery-context.ts` e drafts gravados | intactos: o modo novo não entra no enum (F1b.1) |
| `DiscoveryTablePlaceholder` e rótulos de origem | modo com tipo e tabela próprios; a tabela do Google Ads não muda |
| `googleAdsDiscoveryUsageKey` e `recordGoogleAdsDiscoveryUsage` | parâmetro opcional de sufixo nos dois; sem ele, a mesma string e o mesmo evento |
| Rota `subjects/import` da F1.3 | só chamada pelo navegador, sem mudança, quando o humano marca a declaração da frase no envio (F1b.7) |
| Catálogo de integrações (runtime, Admin, resolver DataForSEO) e seus testes | entrada nova; as operações atuais não mudam |
| Cache de SERP (`lib/server/serp-cache.ts`, `minerador-serp-lens-coverage.ts`) | só consumido; ganha entradas da frase na marca |
| Processador: listagem e leitores de `discovery_import` | a chave nova passa pela view sem migration (seção 4.2); os leitores de KD e CPC não a enxergam (F1b.6) |
| Assinatura do pacote | função inalterada, porque a opção (c) nunca escreve em keyword com registro de aprovação, e a escrita condicionada da F1b.7 não apaga aprovação feita durante o envio |
| Arquiteto (F2.4, fase B) | lê `subject_discovery.subjectKeywordIds` do pacote aprovado |

#### F1b.10 Custo (F1b)

**Leitura (Supabase):**

| Gatilho | Leitura | Chamada paga |
| --- | --- | --- |
| Plano | canônica em modo `meta` (~0,5 kB) + 3 extras em `digest` (2,8 a 5,7 kB cada) + declaração do Assunto, se houver (~0,5 kB) + capability do ledger por `findCapability` (~0,3 kB): até ~18 kB. Nenhum segredo lido | 0 |
| Execução | leitura do ledger antes de pagar (~0,3 kB) + declaração do Assunto relida (~0,5 kB) + corpo da canônica em cache (26,5 a 33,9 KB, só se ela não foi paga agora) + digests (até ~17 kB) + `id,keyword` das vivas (~110 B por linha; ~29 kB para as 267 vivas medidas na SDD de egress, ESTIMADO): até ~80 kB | até o plano autorizado |
| Import | `id,keyword` das vivas (~29 kB) + `id,status,analise_semantica->aprovacao` só das que casaram (~0,3 kB cada) + `id,status,analise_semantica` só das elegíveis da opção (c), até 50 por envio: ~9,5 kB cada pela medida da listagem antes da poda, até ~475 kB (ESTIMADO; a coluna inteira pode ser maior, porque inclui as séries) + declaração do Assunto (~0,5 kB) + insert e update devolvendo `id`. Com a declaração da frase marcada, soma-se o custo da prévia e do apply da F1.3 (tabela F1.9) | 0 |
| Listagem | +~0,5 a 1 kB por keyword com o bloco; zero nas outras | 0 |
| Lista local | nenhuma leitura do banco ao abrir | 0 |

**Chamadas pagas** (Labs a US$ 0,012 por task mais US$ 0,00012 por item, consultado em 2026-09-24; SERP `advanced` com teto de US$ 0,0035 por lente):

| Fonte | Teto do plano | Pesquisa típica (ESTIMADO) |
| --- | --- | --- |
| Google Ads (2 chamadas) | US$ 0 | US$ 0 |
| SERP da frase, 4 lentes sem cache | 4 × 0,0035 = US$ 0,014 | US$ 0,0095 a 0,014 (as extras custam de 0,002 a 0,0035, `serp-lens-plan.ts:100-104`); US$ 0 com cache |
| `related_keywords`, profundidade 2 | 0,012 + 100 × 0,00012 = US$ 0,024 | ~70 itens: US$ 0,020 |
| `keyword_ideas` | US$ 0,024 | 100 itens: US$ 0,024 |
| `ranked_keywords`, 5 URLs | 5 × 0,024 = US$ 0,120 | ~60 itens por URL depois do filtro: 5 × 0,0192 = US$ 0,096 |
| **Total** | **US$ 0,182** | **~US$ 0,15** (~US$ 0,14 com a SERP em cache) |

- **Piso:** toda task Labs cobra mesmo sem nenhum item. São 2 tasks fixas (`related_keywords` e `keyword_ideas`, US$ 0,024) mais 1 task por URL do topo, de 0 a 5 (até US$ 0,060), mais a SERP que faltar: de US$ 0,024 (sem SERP ou sem URL) a US$ 0,084 mais a SERP.
- **Teto rígido do servidor:** US$ 0,20 por pesquisa, o valor aceito pelo dono (F1b.4). O plano máximo, US$ 0,182, fica abaixo dele.
- **Resposta ao navegador:** até ~360 kB por busca cheia. É tráfego da aplicação, não egress do Supabase.

#### F1b.11 Testes com fixtures (F1b)

Todos rodam com `node --test` sobre fixtures. O `fetch` é trocado por um que **falha o teste**, e o cliente do Google Ads é falso. Timestamps usam `+00:00`. Testes estruturais removem os comentários antes de casar.

- **Normalizadores dos 3 endpoints Labs:**
  - resposta válida vira lista de keywords com a estimativa rotulada;
  - task diferente de 20000 é recusada;
  - eco de local ou idioma diferente → `result_mismatch`;
  - `items` vazio vira lista vazia, não erro;
  - o custo da task é lido;
  - `ranked_keywords` aplica `rank_group <= 20` também na normalização.
- **Pedidos:** 2076 e `"pt"`, `depth` 2, `limit` de cada fonte, filtro do ranked. UF é recusada no Labs.
- **Plano:**
  - todas as lentes em cache → nenhuma linha de SERP;
  - sem destino, com destino fora do domínio, `EMPTY` ou `NO_BRAND_SITE` → sem `url_seed`, com o motivo; só `ACCEPTED` com URL gera `url_seed`;
  - destino de um Assunto declarado que deixou de casar com o `site_url` atual → sem `url_seed` no execute;
  - totais e tetos batem com a tabela da F1b.10, e o `planHash` é estável;
  - outra frase, outra marca, outro destino ou outra lente em falta geram outro `planHash`;
  - `PAID_PLAN_REQUIRED` e `PAID_PLAN_CHANGED` não pagam nada;
  - o orçamento nunca passa do autorizado, em chamadas e em dólares: com uma task que informa custo acima da tabela, a chamada seguinte que estouraria o `maxCostUsd` não é feita, e as fontes restantes voltam "não executada por orçamento";
  - plano acima de US$ 0,20 é recusado;
  - o modo plan não resolve Connection nem lê o Secret Store (store falso que falha o teste).
- **Assunto declarado no plan e no execute:** id de outra marca e id inexistente dão o mesmo 404; Assunto retirado dá 409; nenhum dos três paga.
- **Repetição:** execute repetido com o mesmo `operationRequestId`, com o evento já no ledger falso, recusa com `OPERATION_ALREADY_EXECUTED` e não chama o `fetch` falso; conflito do ledger **depois** do pagamento devolve as candidatas com `ledgerWarning`.
- **URLs do topo:** união das 4 lentes com no máximo 5; extra antiga sem digest é ignorada; sem SERP, não há fonte 5 e as outras seguem.
- **Dedupe e origens:**
  - `normalizeKeyword` junta variações de acento e caixa;
  - a candidata guarda todas as origens;
  - corte em 600 com o total informado;
  - a frase recebe o selo "é o Assunto";
  - "já existe" só casa com a marca ativa.
- **Volume:** a estimativa do Labs nunca preenche Volume nem o filtro "Com volume"; o corpo do import não aceita campo de métrica.
- **Import:**
  - nova vira `bruto`, com lista nula, sem métrica e com o bloco;
  - existente sem registro de aprovação recebe a busca no bloco;
  - existente com registro de aprovação não é escrita, e `approvedPackageSignature` fica idêntica;
  - aprovação simulada entre a leitura e a escrita: o update condicionado afeta 0 linhas, a aprovação não é apagada, a assinatura fica idêntica e a resposta diz "alterada durante o envio";
  - acima de 50 elegíveis, as excedentes voltam sem escrita e com o motivo;
  - a janela de `searches` guarda 5 e `subjectKeywordIds` preserva os ids distintos que saíram da janela, até 10;
  - com a declaração da frase marcada, o navegador chama a rota da F1.3 antes, a frase sai dos itens da F1b e as importadas recebem o id devolvido; com a declaração recusada, nada é importado; estrutural: a F1b não importa `setKeywordSubject`;
  - `subjectKeywordId` de outra marca, ou não declarado, vira `null`;
  - a mesma `searchId` não regrava;
  - `importRequestId` em curso é recusado.
- **Ledger:**
  - sem sufixo, a chave do Google Ads é a de hoje, em `googleAdsDiscoveryUsageKey` e no evento gravado por `recordGoogleAdsDiscoveryUsage`;
  - com sufixo, as duas chaves são distintas nos dois;
  - capability nula → `ledgerRecording: false` no plano;
  - uma chave de idempotência por chamada DataForSEO.
- **Lista local:** escopo por ator e marca; busca de outra marca é ignorada; nada é apagado sem a política aprovada; memória como plano B.
- **Tela:** o radiogroup tem 3 opções, o texto da regra aparece no modo novo, e nenhuma origem cai no rótulo "Google Ads" por padrão.
- **Estruturais:** as rotas novas não escrevem em `minerador_discovery_*` nem chamam as RPCs da Descoberta; nenhum caminho de IA monta candidata.

#### F1b.12 Homologação (usuário)

A chamada real e a migration são do usuário (`AGENTS.md` §15).

1. Aplicar a migration e conferir por readback que a capability existe e que o CHECK aceita `keyword_research`.
2. Pesquisar "SEO para clínicas", com nota e destino no site da marca. Conferir o plano no diálogo e confirmar.
3. Pesquisar um Assunto longo e sem busca, como o da seção 1 ("estratégias tráfego pago clínica estética 2026 leads qualificados"). Registrar o que cada fonte devolveu (quantas candidatas, vazia ou falhou) e quanto custou. Este passo mede se a Camada 1 serve ao caso que motivou o pedido; o resultado vai para o `estado-atual.md` do Minerador, seja ele qual for.
4. Conferir no ledger um evento por chamada, com as chaves distintas do Google Ads, e comparar o total com o painel do DataForSEO. Conferir que nenhuma pesquisa passou de US$ 0,20.
5. Recarregar a página: a lista volta do IndexedDB, sem leitura do banco.
6. Repetir a pesquisa: o plano mostra as 4 lentes da frase em cache, com 0 pagas.
7. Importar 5 candidatas da primeira pesquisa com a opção "Declarar também ... como Assunto" marcada: a frase vira Assunto pela rota da F1.3, e as candidatas entram como `bruto`, sem volume e com o bloco, com `subjectKeywordIds` apontando para ela. O Volume do Processador as mede. Uma existente aprovada **não** vai para Em revisão.
8. Abrir o Descobrir por **"Buscar sustentação"** a partir de um Assunto do Processador.

A homologação só vira PASS depois que o readback achar no banco os eventos e as keywords, e com o passo 3 registrado.

#### F1b.13 Decisões desta fatia: fechadas em 2026-09-24

| # | Decisão | Como foi fechada |
| --- | --- | --- |
| **Q10** | (c): o bloco só é escrito onde não há registro de aprovação. | Recomendação apresentada ao dono, sem veto. |
| **Q11** | O texto vindo do navegador entra como entrada humana, sem métrica, com `provenanceVerified: false`. | Recomendação apresentada, sem veto. |
| **Q12** | A lista local vale 30 dias, com no máximo 10 buscas por ator e marca. A vencida e a mais antiga saem sozinhas. | **Autorizada pelo dono**, como autorização de limpeza de dado local (`AGENTS.md` §10). |
| **Q13** | Pode executar antes da migration, com aviso de custo fora do ledger, só até a homologação. A migration vem **antes do deploy** da F1b, senão o bootstrap do Admin quebra (F1b.8). | Recomendação apresentada, sem veto. |
| **Q14** | "Declarar também como Assunto" vem marcada quando a frase é nova e desmarcada quando ela já existe (F1b.7). | **Respondida pelo dono.** |

Registro original das perguntas, mantido como histórico:

| # | Pergunta | Recomendação |
| --- | --- | --- |
| **Q10** | Proveniência em keyword existente: (a), (b) ou (c) da F1b.7? | **(c)**: escrever só onde não há registro de aprovação. Não rebaixa nada, não muda função compartilhada, e o sinal viaja dentro do pacote aprovado. |
| **Q11** | Texto vindo do navegador no import (spec §48): aceitar como entrada humana, com proveniência "não verificada", ou exigir recibo assinado? | **Aceitar como entrada humana**, sem métrica, com `provenanceVerified: false`. O recibo exige um segredo novo e decidiria a D3 da SDD da Descoberta local, que continua pendente. |
| **Q12** | Política da lista local: validade de 30 dias, até 10 buscas por ator e marca, remoção automática da vencida e da excedente? | **Aprovar.** É autorização de limpeza de dado local (`AGENTS.md` §10). Sem ela, nada sai sozinho. |
| **Q13** | Permitir executar antes da migration, com o custo fora do ledger? | **Permitir com o aviso**, só até a homologação. O gate de saída exige a migration aplicada. Nesse intervalo, a repetição da mesma operação só é barrada na mesma instância (F1b.4). |

Fechado nesta fatia sem pergunta nova, por já caber no que o dono decidiu: o teto rígido por pesquisa fica em **US$ 0,20**, o valor que ele aceitou, e o plano máximo com os tetos de fonte (300/100/5 URLs/600) é US$ 0,182. Subir qualquer teto exige adendo com o custo novo.

---

### F2 · Arquiteto: o Assunto no ArticleDNA e no SiloDNA

**Dono:** Arquiteto. **Arquivo compartilhado:** `lib/arquiteto/contracts.ts`, lido por Radar e Redator.

#### F2.1 Dado

Um campo **opcional** novo, `subject`, no `ArticleDNASchema` e no `SiloDNASchema`, os dois `.strict()`:

```ts
subject: z.object({
  keywordId: z.string().min(1),                 // a keyword declarada Assunto no Minerador
  approvedPackageRef: ApprovedPackageRefSchema, // versão e hash do pacote em que a declaração foi lida
  phrase: z.string().min(1),
  note: z.string().min(1).max(280).nullable(),
  destinationUrl: z.string().url().nullable(),
  attachedBy: z.string().min(1),                // humano; proposta de IA aceita vira ato humano
  attachedAt: z.string().min(1),
}).strict().optional()
```

- `ApprovedPackageRefSchema` já existe (`lib/arquiteto/contracts.ts:62-66`).
- **Snapshot da frase, da nota e do destino:** o Radar e o Redator não precisam hidratar outra keyword para saber o que é o tronco. Isso economiza leitura.
- **Não é referência.** O Assunto fica fora de `keywordReferences` e **fora do teto de 6**. O `superRefine` atual, que exige referências iguais às keywords resumidas (`:1036-1040`), não muda.
- **Vale para qualquer unidade do ArticleDNA.** Landing page e página de serviço são unidades do próprio ArticleDNA (`EditorialArticleUnitTypeSchema = z.enum(["article", "service_page", "landing_page", "category_page", "other"])`, `lib/arquiteto/contracts.ts:322`; `landingPagePurpose`, `:341`). O `subject` não depende do tipo: uma landing de "SEO para clínicas" pode ter o Assunto como tronco, como um artigo.
- **Regras novas no `superRefine`** (só olham o próprio ArticleDNA):
  - `subject.keywordId` **não pode** ser secundária nem reforço. É a mesma regra de "um papel por keyword" (`:1041-1045`).
  - `subject.phrase` **não pode** aparecer em `excludedSubjects` do mesmo artigo (`:1008`), comparando por keyword normalizada. O tronco não pode ser, ao mesmo tempo, um tema excluído.
- **`subject.keywordId` igual à principal** (tronco e âncora na mesma frase) **não** é decidido no `superRefine`, porque o ArticleDNA não carrega o Volume. Fica no gate de conclusão da formação (`lib/arquiteto/article-formation-confirmation.ts`): só é aceito quando o pacote aprovado da keyword tem **Volume validado**. Um Assunto aprovado pela exceção D2, sem Volume, nunca é principal (D1; Q7).
- **Não exclusivo (D3):** o mesmo `keywordId` pode estar em vários artigos.
- Não existe um "papel Assunto" em `role`, e **nenhum enum muda**.
- **SiloDNA:** o mesmo `subject`, opcional. `centralEntity` **não** recebe a frase do Assunto, porque a SiloPage tira H1 e title dali (`lib/arquiteto/adapters.ts:393-394`) e isso contrariaria D1. A primária do Silo continua eleita pelas origens atuais.

#### F2.2 Como o Assunto aparece nas listas

- O diálogo de importação (`WorkflowImportDialog`, `modules/arquiteto/arquiteto-workspace.tsx:16174`) e a linha "Vínculo:" da mesa territorial (`modules/arquiteto/territorial-workspace-rows.tsx:546-549`) mostram `Assunto · declarado`, lido por `readArchitectKeywordVinculo`.
- Um filtro **"Assuntos"** na mesa lista os declarados, cada um com a contagem de artigos que ele sustenta.

#### F2.3 Conservação (`AGENTS.md` §10)

**Representação na cópia de trabalho, separada de `clusterId`.** Hoje ser membro de um artigo é ter `clusterId` (`modules/arquiteto/arquiteto-workspace.tsx:6200-6203`). Se o tronco fosse ligado por `clusterId`, ele viraria **membro**, entraria no teto de 6 e bateria em `NO_DUPLICATED_KEYWORD` ao ser compartilhado entre artigos (D3; `lib/arquiteto/article-formation-confirmation.ts:430-434`). Por isso o vínculo é um campo próprio do **artigo** na cópia de trabalho, `subjectKeywordId`, e a keyword do Assunto **mantém `clusterId` vazio**, a menos que o humano a ponha explicitamente como principal (Q7).

**Os cálculos que precisam reconhecer o tronco** (todos com o mesmo predicado puro, `isAnchoredSubject(keywordId, articles)`):

| Cálculo | Onde | Regra nova |
| --- | --- | --- |
| Elegibilidade e "incorporada" no servidor | `lib/server/arquiteto-workspace.ts:267-271` | `articleDnaKeywordIds` inclui `subject.keywordId` |
| Não agrupadas, na mesa | `modules/arquiteto/arquiteto-workspace.tsx:6200-6213` | tronco ancorado sai de não agrupadas e aparece como "Assunto · tronco de N artigo(s)" |
| Partição do cenário | `lib/arquiteto/architecture-scenario.ts:402-425` | tronco conta como coberto; não gera `DUPLICATE_KEYWORD` nem `KEYWORD_MISSING_FROM_COMPLETE_SCENARIO` |
| Sobras da formação | `lib/arquiteto/article-formation.ts:720` | tronco ancorado não volta como sobra |
| Motor legado | `lib/arquiteto/engine.ts:448` | idem |
| Território e proposta | `lib/arquiteto/territory-working-copy.ts:235`, `:268`; `lib/arquiteto/architecture-working-proposal.ts:247` | tronco não é `unassigned` quando ancorado |
| Duplicidade e teto na conclusão | `lib/arquiteto/article-formation-confirmation.ts:430-434` e `KEYWORD_CEILING` | o tronco fica **fora** de `NO_DUPLICATED_KEYWORD` e do teto |

- Assunto ainda sem artigo fica em **"Keywords não agrupadas"** com o selo **"Assunto · aguardando sustentação"**. Não some.
- **Fora da formação automática.** Uma keyword com Assunto declarado e **sem Volume validado** (aprovada pela exceção D2) é tirada do conjunto que a formação agrupa (`disponiveis`, `lib/arquiteto/article-formation.ts:720`) e da eleição da principal e do slug. Sem isso, ela entraria na `masterList` como qualquer aprovada e poderia virar membro ou principal, contra D1 e o `AGENTS.md` §13, ou virar artigo de uma keyword só. Ela só entra num artigo como `subject`, ou como membro por ato humano explícito.

#### F2.4 Formação em torno do Assunto, sem chamada paga por padrão

A afinidade lexical não junta tronco e sustentação (`lib/arquiteto/article-formation.ts:295`). O caminho proposto:

1. **Sugestões determinísticas, só sobre o que o Arquiteto já tem carregado.** Para um Assunto escolhido, o Arquiteto ordena as keywords **já recebidas por ele** (handoff feito) e ainda sem artigo (ou em artigo, só como informação). Só essas têm a linha inteira e o pacote aprovado na mesa; as demais vêm pelo índice, **sem** `analise_semantica` (`lib/server/arquiteto-workspace.ts:88-98`, correção E8). Ler a Lógica do acervo inteiro para sugerir seria leitura nova pesada, e fica fora. Sinais, todos já no pacote:
   - **Primeiro sinal (emenda da F1b), a custo zero:** a keyword cujo pacote aprovado traz o `keywordId` do Assunto escolhido em `analise_semantica.subject_discovery.subjectKeywordIds` vem primeiro, com o selo "veio da Pesquisa por Assunto" e a evidência curta gravada (F1b.7). A lista à parte existe para o sinal não sair com a janela das 5 buscas.
     - O `subjectKeywordId` foi validado no servidor contra a marca e a declaração. Ele existe quando a pesquisa partiu de um Assunto declarado ou quando o humano declarou a frase no envio (F1b.7).
     - **Sinal secundário:** sem id, `normalizeKeyword(searches[].subjectPhrase)` igual à frase normalizada do Assunto escolhido (a frase foi declarada depois da pesquisa). É texto vindo do navegador, então só ordena depois do primeiro sinal, com o selo "pesquisa com a mesma frase", e nunca decide nada. Pela regra (c) da F1b.7, recomendada em Q10, o bloco só é gravado antes da aprovação, então sempre viaja **dentro** do pacote aprovado, que é o que o Arquiteto lê (`lib/arquiteto/editorial-unit-declaration.ts:57-62`).
     - As origens (`provenanceVerified: false`) são só informação e não pesam na ordem.
     - Nenhuma leitura nova e nenhum provider. Proposto.
   - mesmo nicho e mesma entidade central da Lógica (`logical.centralEntity`, `lib/minerador/keyword-dna.ts:71`);
   - mesma lista;
   - intenção e funil compatíveis com a hipótese da Lógica do Assunto;
   - sobreposição de termos com a **nota** do Assunto, e não só com a frase ("clínicas", "pacientes").
   - **Fora do padrão:** "domínios em comum" nas SERPs de sustentação. Exigiria ler corpos de SERP do cache nas 4 lentes (26,5 a 33,9 KB por entrada; `docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md:236`). Fica no backlog, e só com a observação podada (~0,9 KB por lente): 4 × 0,9 KB × N keywords.
   - Custo zero de provider e zero de leitura nova.
   - **Efeito colateral declarado:** ordenar por entidade central junta keywords da mesma entidade em artigos irmãos do mesmo Assunto. O detector de sobreposição soma 0,3 por entidade central comum entre **membros** (`lib/arquiteto/article-candidate-guards.ts:278-356`), então esses pares tendem a cair em `NO_UNRESOLVED_CANNIBALIZATION` (seção 7).
2. **Escolha humana.** O humano marca as keywords de sustentação e confirma. A principal sai **entre elas**, pela regra atual (publicada → centralidade → … → volume; `docs/04-arquiteto/spec.md` e `lib/arquiteto/article-formation.ts`). O slug segue a principal (D1).
3. **Validação pela SERP das keywords de sustentação**, nas 4 lentes, com cache. A trava atual (`lib/arquiteto/article-serp-gate.ts`) vale sem mudança para a composição de referências. O Assunto não entra na composição e não é consultado (P7).
4. **SERP da frase (opcional, sob pedido explícito), pela rota Resultados do Minerador.** O Assunto é uma linha de `minerador_keywords`, então a SERP dele sai pela mesma rota das outras keywords (`app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts`): mede Resultados e garante as 4 lentes no cache. Assim a SERP conclusiva chega a `analise_semantica.evidencia_serp` e passa a valer na leitura canônica, na ordem **SERP conclusiva → humano → Lógica** (`docs/03-minerador/spec.md` §63). A hipótese da Lógica deixa de ser a última palavra sobre intenção e funil do Assunto. **Não** se usa um pseudo-id no Arquiteto (como o `territory:<ref>` de `lib/arquiteto/territorial-serp.ts:156-175`): por ele, a SERP ficaria fora de `evidencia_serp`, e o Arquiteto continuaria com a Lógica. Efeito lateral, pela regra atual: SERP conclusiva que muda intenção ou funil de um Assunto aprovado o põe em Em revisão (§63); a reaprovação só exige a Lógica (D2). A SERP da frase não entra na trava de SERP do artigo.
5. **IA só como proposta explícita.** Um botão "Pedir proposta" usa a revisão de IA que já existe no Arquiteto e grava proposta, nunca `subject`. Aceitar é ato humano (`AGENTS.md` §9).
6. **Silo em torno do Assunto:** o humano liga o Assunto ao SiloDNA. Os artigos novos daquele Silo recebem a **sugestão** do mesmo Assunto, e cada artigo confirma.

#### F2.5 Consumidores afetados e custo (F2)

| Consumidor | Efeito |
| --- | --- |
| Toda leitura de ArticleDNA e SiloDNA (`lib/server/arquiteto-persistence.ts:216-231`, `lib/server/editorial-repositories.ts:96-100`, `app/api/editorial/serp/route.ts:81`, `lib/server/global-workflow-canonical.ts:79`) | passa a aceitar o campo; sem ele, parse igual ao de hoje |
| Radar e Redator | ignoram o campo até F3 e F4 |

- **Leitura:** cerca de 0,7 kB por **versão** de artigo com Assunto. O Arquiteto lê todas as versões (`listArquitetoArtifacts`): 50 artigos × 3 versões dão ~100 kB no pior caso, em carga fria.
- **Leitura das sugestões:** zero nova. Usam só as keywords recebidas, cuja linha inteira a mesa já carrega (`lib/server/arquiteto-workspace.ts:88-98`).
- **Chamadas pagas:** zero por padrão. A SERP opcional da frase, pela rota Resultados, custa o mesmo que o Resultados de qualquer keyword: a medição de Resultados mais as lentes que faltarem no cache, até 4 × ~US$ 0,0035 (~US$ 0,014), derivado de US$ 2,80 por 800 chamadas `advanced` (`docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md:237`). Cache de 30 dias por marca.
- **SERP para resolver canibalização:** pares de artigos no mesmo Assunto que caírem em `NO_UNRESOLVED_CANNIBALIZATION` só se resolvem com o confronto de SERP de "Processar artigos". O custo é o das lentes que faltarem no cache para as keywords dos dois artigos: até 4 × ~US$ 0,0035 por keyword sem cache. Zero quando as sustentações já foram coletadas nos últimos 30 dias.

#### F2.6 Testes (F2)

- Schema: ArticleDNA sem `subject` com parse igual ao de hoje; com `subject` válido, inclusive numa unidade `landing_page` e `service_page`; `subject.keywordId` como secundária recusado; `subject.phrase` em `excludedSubjects` recusado; `subject` com campo extra recusado (`.strict()`).
- Gate de conclusão: `subject` igual à principal aceito só com Volume validado no pacote; Assunto da exceção D2 como principal recusado.
- Conservação: Assunto sem artigo aparece em não agrupadas com o selo; preso a dois artigos conta como incorporado nos dois e **não** dispara `NO_DUPLICATED_KEYWORD`, `DUPLICATE_KEYWORD` nem o teto; cada cálculo da tabela da F2.3 com fixture própria; nenhuma keyword some.
- Formação automática: Assunto sem Volume validado nunca entra como membro nem como principal; keyword comum segue a formação de hoje byte a byte.
- Sugestões: fixture "SEO para clínicas" com três sustentações sem palavra em comum ordena pela entidade central e pela nota; keyword não recebida pelo Arquiteto não aparece. Nenhuma chamada de rede (fetch trocado por um que falha o teste).
- Slug: a principal eleita entre as sustentações dá o slug. O Assunto nunca dá slug.
- Isolamento: o Assunto de outra marca não aparece nem pode ser preso.

---

### F3 · Radar: investigar em torno do Assunto

**Dono:** Radar. **O Radar não troca, não promove e não rebaixa o Assunto** (`AGENTS.md` §7; P8).

#### F3.1 O que muda

- **Contexto de pesquisa.** `RadarArticleResearchContext.article` ganha `subject?: { phrase, note, destinationUrl }`, lido de `ArticleDNA.subject` (`lib/radar/article-research-context.ts:395-402`). Sem Assunto, o campo **não é emitido**: nem `null`, nem chave vazia.
- **Mapa de uso.** Uma linha `article.subject` entra no `RADAR_FOUNDATION_USAGE_MAP` (`lib/radar/foundation-usage-map.ts:41`), com os consumidores nomeados abaixo.
- **Consultas Google:** nenhuma muda. Continuam saindo das keywords (`lib/radar/research-query-plan.ts:139-148`).
- **Especialista.** O `RadarR6ExpertTopicContext` recebe `subject` e a pauta ganha o pedido "aprofundar o Assunto e a virada: o que o leitor desta busca precisa entender para chegar a <Assunto>" (`lib/radar/r6-sequential.ts:198-209`). O campo `principal` continua sendo a promessa.
- **YouTube, só quando há camada de vídeo:** uma origem nova, `DECLARED_SUBJECT`, entra em `RADAR_YOUTUBE_QUERY_ORIGINS` (`lib/radar/youtube-search-queries.ts:30-39`), com a frase do Assunto, logo depois de `PRIMARY_KEYWORD`. **O teto continua 6** (`RADAR_YOUTUBE_MAX_QUERIES`, `:69`), compartilhado e preenchido na ordem (`:159`, `:174`). Com Assunto, a consulta dele **toma o lugar da última da fila**, que em geral é uma `SECONDARY_KEYWORD` (ou um `EDITORIAL_TOPIC`, quando não há secundária). Nenhuma consulta a mais.
- **O Assunto entra no modelo editorial do Radar como cobertura exigida.** É esta a peça que faz a estrutura girar em torno do tronco (`lib/radar/editorial-article-model.ts`):
  - `territorioDoArtigo` (`:230-259`) passa a incluir a frase do Assunto em `exigidos`, com as raízes distintivas dela (sem as raízes da principal, como os demais tópicos).
  - Se a amostra trouxe candidatos que cobrem essas raízes, o grupo ganha `dnaRequired` pelo caminho atual (`:440-455`), e o `mustCoverReasons` recebe um motivo **próprio**: "O ArticleDNA declara este Assunto como tronco: a virada para ele precisa ser coberta, e a arquitetura decide onde."
  - **Se a amostra não trouxe nenhum candidato** (o caso típico de um Assunto que o público não procura), o mecanismo de hoje não gera seção (seção 4.6). **Proposto:** o modelo cria uma seção sintética "Virada para <Assunto>", com `evidenceStrength: "DNA_REQUIRED"`, `pages: 0`, o motivo próprio acima e `evidenceRefs` vazio. Ela passa pela mesma regra de lugar (`:812-840`): vira H3 de um anfitrião compatível ou ponto a cobrir, **nunca H2 por decreto** (`MUST_COVER ≠ MUST_BE_H2`).
  - É **essa seção** que o export mostra como "Obrigatória pelo ArticleDNA: …" (`lib/radar/portable-writing-export.ts:938-947`) e que alimenta a linha de `estrutura` da F4.3.
  - Custo de leitura zero: o ArticleDNA já é lido.
- **Onde o Assunto cabe na SERP das keywords de sustentação** (determinístico, sobre a amostra já coletada):
  - onde as **raízes** (`radarSemanticStems`, a mesma função do modelo editorial) da frase e da nota aparecem em títulos e H2/H3 das páginas;
  - **posição sugerida da virada:** depois da seção observada que mais toca essas raízes;
  - **complemento do H1:** sugerido quando as raízes aparecem em títulos do topo; sem sinal, a sugestão é "sem sinal na SERP: o Redator decide", e não "Assunto em H2/H3";
  - tudo com contagem ("aparece em 3 de 10 páginas").
  - **Limite declarado: o critério desta fatia é lexical (por raízes), não semântico.** "SEO para clínicas" contra a SERP de "marketing para clínicas" tende a não coincidir por palavra, embora o sentido esteja perto. O pedido do dono fala em "trabalho semântico". Esta fatia **não** o atende por inteiro; a leitura por sentido (entidades, perguntas observadas, proximidade entre temas, sem provider pago) fica registrada no backlog do Radar como melhoria da F3.
- **Alerta quando a sustentação não segura o Assunto.** Se nenhuma raiz do Assunto aparece em nenhuma página da amostra, o Radar registra: "Nenhuma coincidência de termos entre o Assunto e as páginas das buscas de sustentação (critério por palavras). A virada será inteiramente nossa; conferir a composição no Arquiteto." A frase diz o critério para não afirmar como fato que o tema está ausente. Vai para `limitations` e para o relatório. **Não bloqueia o FINALIZE** e não altera o ArticleDNA.
- **FINALIZE: o `subject` não é copiado para o bundle.** O bundle tem schema próprio, `.strict()` (`lib/radar/investigation-finalization.ts:380-409`), relido com `.parse` dentro do payload da análise (`lib/radar/analysis-contracts.ts:632`, `:764`, `:824`). Um campo novo ali obrigaria a F3 a ter fases A e B próprias, e um rollback abaixo delas deixaria a análise inteira do artigo ilegível. Não é preciso: o `binding.articleDnaContentHash` (`:391-396`) já amarra o bundle ao ArticleDNA que contém o Assunto, e trocar o Assunto gera versão nova e deixa o bundle stale pela regra atual (`:764-771`). O que o bundle leva do Assunto cabe nos campos que já existem: a seção da virada entra em `blueprint.sections` como qualquer seção (id, título, prioridade, lugar; `:272-280`), e o alerta em `limitations`. Nenhum schema do bundle muda.
- **Promessa e CTA.** A promessa do Radar continua vindo da SERP. Com `destinationUrl`, a chamada final recebe a direção "levar o leitor a <destino>" ao lado do CTA observado (`lib/radar/portable-read-model.ts:256-257`), sem substituí-lo.

#### F3.2 Custo (F3)

- **Leitura:** +~0,7 kB por artigo no contexto de pesquisa (em memória). O bundle cresce só com a seção da virada e o alerta, algumas centenas de bytes. Nenhuma leitura nova, porque o ArticleDNA já é lido.
- **Chamadas pagas:** zero a mais. No Google, nenhuma consulta muda. No YouTube, o teto de 6 continua: a consulta do Assunto toma o lugar da última da fila, só em artigo com Assunto **e** camada de vídeo ligada pelo usuário.

#### F3.3 Testes (F3)

- **Hashes dourados:** sem Assunto, o dossiê e o bundle ficam byte a byte iguais (`tests/radar-serp-standing-congelado.test.mts:337`, `tests/radar-serp-lentes-congeladas.test.mts:556`).
- O mapa de uso falha sem a linha nova.
- O plano de consultas Google fica idêntico com e sem Assunto.
- YouTube: `DECLARED_SUBJECT` só aparece com Assunto; o plano continua com no máximo 6 consultas, e a que sai é a última da fila.
- Modelo editorial: com Assunto e **0 páginas** na amostra, a seção exigida da virada existe, com `DNA_REQUIRED` e o motivo próprio, e não vira H2 por decreto; com candidatos que cobrem o Assunto, o grupo observado ganha `dnaRequired` e não nasce seção duplicada; sem Assunto, o modelo e os hashes dourados não mudam.
- Virada: fixture com amostra que toca as raízes do Assunto sugere a posição; fixture sem toque gera o alerta com o critério declarado e **não** mexe em principal nem em papéis.
- Bundle: `RadarFrozenEvidenceBundleSchema` sem mudança; bundle de artigo com Assunto passa no schema atual.
- Estrutural: nenhum caminho do Radar escreve `subject` no ArticleDNA.

---

### F4 · Redator e export

**Dono:** Radar (export) e Redator (fundamentos, MCP e guardião).

#### F4.1 Fundamentos do Redator e MCP

- `subject` entra em `WRITER_ARTICLE_DNA_FOUNDATION_FIELDS` (`lib/redator/writer-evidence-catalog.ts:989-993`). A projeção sobe de ≤ 872 B para ≤ ~1,6 kB, bem abaixo do teto de 24 kB do `get_writer_foundations`.
- A virada sugerida pelo Radar (seção e complemento do H1) chega pelo dossiê, que já é lido e não copiado (invariante 78).
- **O Redator decide a estrutura final** (invariante 48): usar ou não o complemento no H1, e em qual seção fazer a virada.
- `RADAR_WRITER_MAY_NOT` ganha, **só quando há Assunto**, a entrada "trocar ou remover o Assunto declarado". Sem Assunto, a lista fica igual e o hash também.

#### F4.2 Guardião

`runGuardian` (`lib/redator/guardian.ts:79`) ganha duas conferências, só com Assunto:

- a frase ou os termos do Assunto aparecem em algum H2/H3 ou parágrafo;
- se há `destinationUrl`, existe link para ela.

As duas geram **aviso, não bloqueio** (decisão aberta Q6). A estrutura é do Redator.

#### F4.3 CSV "Para escrever" (P9)

Todas as linhas abaixo só aparecem com Assunto. Sem ele, a célula é idêntica.

| Coluna | Linha nova | Ponto no código |
| --- | --- | --- |
| `promessa_e_leitor` | antes de "Abertura": `Tronco (Assunto): <frase> — <nota>.` e `Virada: depois de <seção sugerida>, levar o leitor de <principal> a <Assunto>; destino: <url>.` | `colunaPromessa`, `lib/radar/portable-writing-export.ts:845-869` |
| `titulo_e_seo` | `Direção do H1: <principal> + complemento "<Assunto>"` ou `Assunto em H2/H3 — o H1 é da principal.` | `colunaTitulo`, `:891-912` |
| `estrutura` | nenhuma linha inventada pelo export: a seção da virada **nasce no modelo editorial do Radar** (F3.1) e aparece pelo caminho atual, "Obrigatória pelo ArticleDNA: <motivo próprio do Assunto>" | `colunaEstrutura`, `:919-977`, marcação em `:938-947` |
| `artigo` | `Assunto (tronco): <frase>` junto de "Keyword principal" | `colunaArtigo`, `:766-795` |

O modo técnico (J) **não muda** (`tests/radar-portable-writing-export.test.mts:535`).

#### F4.4 Custo e testes (F4)

- **Custo:** +~1 kB por artigo com Assunto nos fundamentos e no CSV. Nenhuma leitura nova. Zero chamadas pagas.
- **Testes:**
  - export J idêntico;
  - as 13 colunas sem Assunto idênticas ao snapshot atual;
  - com Assunto, as linhas novas de `promessa_e_leitor`, `titulo_e_seo` e `artigo` nas colunas certas, a seção da virada marcada em `estrutura` pelo motivo vindo do modelo do Radar, tudo dentro dos limites de caracteres (`:1464`);
  - fundamentos com e sem Assunto;
  - `writerMayNot` igual sem Assunto;
  - guardião avisa sem frase e sem link, e não bloqueia.

---

## 6. Compatibilidade, rollback e migration

**Migration: nenhuma nas fatias F1, F2, F3 e F4. A F1b tem uma, pequena, de catálogo (abaixo).**

- O Minerador grava em `analise_semantica` (JSONB), que a view de listagem vigente já repassa (`supabase/migrations/20260921030000_listagem_sem_series_de_medicao.sql:102-105`). A migration `row_version` não é pré-requisito de nenhuma fatia; quando aplicada, só reforça o readback do lote (F1.6).
- A garantia de unicidade no import (índice único parcial) seria migration e **fica fora**: o limite está declarado em F1.3 (Q8).
- O ArticleDNA e o SiloDNA vivem em `editorial_artifact_versions.payload` (JSONB), como `territoryRef` (`lib/arquiteto/contracts.ts:974-977`).
- O import não usa a tabela de lotes da Descoberta.

**Migration e rollback da F1b (Proposto; o usuário executa):**

- **Arquivo:** `supabase/migrations/<timestamp>_dataforseo_keyword_research_operation.sql`, no padrão de `20260824185700_dataforseo_serp_compatibility_operation.sql`.
  - Recria o CHECK de `integration_capabilities.operation_kind` com os 11 valores vigentes (`20260825150000_telegram_expert_contribution_platform_foundation.sql:32-45`) mais `keyword_research`.
  - Insere `dataforseo.keyword_research` (`production`, `request`, `active`) com `ON CONFLICT (capability_key) DO NOTHING`.
  - Nenhuma tabela, coluna, RLS ou dado de keyword muda.
- **Ordem:** a migration vem antes do deploy do código da F1b. Com o código no ar e sem a migration, o bootstrap do Admin aborta na capability nova, porque o CHECK recusa com 23514 e o bootstrap só trata 23505 (`lib/server/platform-integrations-admin.ts:554-571`). Nesse intervalo, as chamadas pagas funcionam, mas ficam fora do ledger (F1b.8, Q13).
- **Rollback do código:** reverter. O bloco `subject_discovery` fica inerte em `analise_semantica`, porque nenhum leitor antigo o procura. As entradas da frase no cache de SERP seguem a validade de 30 dias. As listas locais ficam inertes no IndexedDB do navegador e não são apagadas sem autorização.
- **Rollback da migration:** a capability **não é apagada**, porque os eventos do ledger, append-only, apontam para ela por `capability_id`. Ela passa a `status = 'disabled'`, um dos três valores que o CHECK aceita (`'active', 'disabled', 'legacy'`, `supabase/migrations/0024_integrations_resource_governance.sql:42`; nenhuma migration posterior muda esse CHECK). O CHECK de `operation_kind` ampliado fica, e é inofensivo. Voltar esse CHECK exigiria que nenhuma linha usasse `keyword_research`. Verificado no código.
- **A capability `disabled` não para a chamada no modo homologação.** O DataForSEO resolve pelo modo homologação (`resolveHomologationResourceForActor`, `lib/server/integrations-runtime.ts:604`), que lê a capability sem conferir o status (`:616-622`); a projeção dela não carrega status (`capabilityProjection`, `:532-541`). Com o código da F1b no ar, os eventos continuam sendo gravados. Só o caminho com entitlement recusa capability não ativa (`:710`). Verificado no código. **Por isso, o rollback da migration só vem depois do rollback do código.**
- **Não há migration** para a lista da pesquisa nem para candidatas: elas não vão ao banco (F1b.5).

**Sem Assunto, tudo fica byte a byte igual. Os testes que provam:**

| Área | Guarda |
| --- | --- |
| Vínculo | snapshot de `resolveKeywordVinculo` e de `keywordVinculoSummary` |
| Aprovação | `tests/minerador-aprovacao-versionada.test.mts` sem mudança |
| Radar | hashes dourados (`tests/radar-serp-standing-congelado.test.mts:337`; `tests/radar-serp-lentes-congeladas.test.mts:556`) |
| Export | J (`tests/radar-portable-writing-export.test.mts:535`) e as 13 colunas |
| Redator | projeção dos fundamentos e `writerMayNot` |

**O ArticleDNA é gravado E lido com `.strict()`. Verificado no código:**

- `lib/server/arquiteto-persistence.ts:177` valida com `ArticleDNASchema.parse`.
- A leitura canônica do Arquiteto faz `safeParse` e, se falhar, **lança** `INVALID_ARTIFACT` 503 (`:216-231`, `:122-128`). **Um único artigo com campo desconhecido derruba o readback do Arquiteto da marca inteira.**
- A leitura do Radar (`lib/server/editorial-repositories.ts:96-100`) usa `safeParse` e manda o artigo para `incompatible`. O artigo **some** da lista do Radar.

**Risco de rollback.** Se o código voltar a uma versão sem `subject` no schema depois que algum artigo foi gravado com ele, o Arquiteto da marca para, com 503, e o artigo some do Radar. Versões consolidadas são imutáveis (invariante 9): não dá para "tirar o campo" dos registros.

**Mitigação, obrigatória:**

1. **F2 em duas fases.**
   - **Fase A:** só o schema aceita `subject` opcional. Nenhum caminho grava. Publicar e homologar.
   - **Fase B:** a interface e a formação passam a gravar.
   - **Rollback permitido até a fase A**, nunca abaixo dela. Fica registrado no `estado-atual.md` do Arquiteto.
2. O Radar (F3) e o Redator (F4) só são ligados depois da fase B homologada. Até lá, ignoram o campo, que o schema da fase A já aceita.
3. **F1 não tem esse risco.** Código antigo ignora `keyword_subject` no JSONB: o Vínculo antigo não o lê, e o KeywordDNA é uma vista não persistida. O efeito de voltar F1 é só que a keyword declarada perde a dispensa e volta a exigir Volume e Resultados. Os pacotes já no Arquiteto seguem válidos.

**Alternativa considerada e não recomendada:** guardar o Assunto num artefato à parte (`article_subject`) em vez de no ArticleDNA. Isso elimina o risco de parse, mas cria um segundo leitor do fundamento do artigo, fora do hash do ArticleDNA e do congelamento do Radar. O tronco poderia mudar sem que o dossiê ficasse stale.

**Rollback por fatia:**

| Fatia | Rollback | Dado gravado |
| --- | --- | --- |
| F1 | reverter o código | fica em `analise_semantica`, inerte |
| F1b | reverter o código e, só depois, pôr a capability em `disabled`; ela nunca é apagada | `subject_discovery` inerte; cache de SERP da frase até vencer; listas locais no navegador |
| F2 | reverter só até a fase A | fica nas versões, legível pela fase A |
| F3 | reverter o código. O bundle não ganha campo novo (F3.1): a seção da virada e o alerta ficam em campos que o schema atual já aceita, e a análise continua legível | seções e `limitations` do bundle, em campos existentes |
| F4 | reverter o código | nenhum |

---

## 7. Riscos

| Risco | Onde | Mitigação |
| --- | --- | --- |
| **Perda silenciosa pelo enum estrito.** Pôr "assunto" em `KEYWORD_PAGE_TYPES` faria o Arquiteto descartar o valor (`lib/arquiteto/editorial-unit-declaration.ts:127`, `:138`) e o Minerador cair no padrão `article` (`lib/minerador/keyword-page-type.ts:97-101`). | F1 | Declaração separada (P2). Teste que prova que o enum não mudou e que a declaração chega ao Arquiteto pelo pacote. |
| **Atalho de aprovação abusado:** marcar Assunto só para aprovar sem medir. | F1, F2 | Só humano, com autor e data (P4). A Lógica continua exigida. A trava vale no servidor (P10). Assunto sem Volume validado fica fora da formação automática e nunca é principal (F2.1, F2.3): o atalho não abre caminho para slug nem KGR. Um filtro "Assuntos aprovados sem sustentação" dá visibilidade. |
| **Assunto sem sustentação.** | F2, F3 | Fica em não agrupadas com o selo (F2.3). O Radar alerta quando a SERP não toca o Assunto (F3.1). |
| **Canibalização:** vários artigos no mesmo Assunto com principais distintas repetem a mesma virada, e as sugestões por entidade central juntam keywords parecidas em artigos irmãos. | F2, F4 | O detector compara **todos os membros** (`detectCandidateOverlap`, `lib/arquiteto/article-candidate-guards.ts:278-356`): entidade central comum soma 0,3. Pares no mesmo Silo caem em `NO_UNRESOLVED_CANNIBALIZATION` (`lib/arquiteto/article-formation-confirmation.ts:470-477`), que só o confronto de SERP resolve, com custo declarado em F2.5. O tronco não é membro, então ele sozinho não soma sobreposição. O Arquiteto mostra "N artigos neste Assunto" e as fronteiras (`antiCannibalizationBoundary`). O Redator recebe os irmãos do Assunto como contexto para variar o ângulo da virada. |
| **Colisão de nomes:** "assunto" já quer dizer tema excluído (`excludedSubjects`) e tema disputado na trava de canibalização ("disputam o mesmo assunto"). | F2 | Na tela, o termo novo aparece sempre como **"Assunto · declarado"** ou "Assunto (tronco)". `subject.phrase` não pode estar em `excludedSubjects` do mesmo artigo (F2.1). O texto da trava troca "o mesmo assunto" por "o mesmo tema" (seção 8). |
| **Duplicata no import de Assunto** por dois envios simultâneos. | F1 | Sem índice único no banco (F1.3). Botão desabilitado e `importRequestId` em curso recusado reduzem o risco; a garantia exige migration (Q8). |
| **Perda de chave por escrita concorrente** no lote do Vínculo, que regrava `analise_semantica` inteiro. | F1 | Já existe no lote de KGR. Fica registrado; `row_version` fecha quando aplicada (F1.6). |
| **Publicados.** | F1, F2 | P5: nenhuma mudança de principal, slug, canonical ou URL. A trava de publicada do banco segue (`20260921110000_status_nao_e_estrutural.sql:45-47`). Declarar numa publicada aprovada põe a keyword em revisão, e isso é o comportamento desejado. |
| **Egress.** | todas | Declarado por fatia (5.x). Import sem ler a marca inteira. Readback estreito no lote. Nenhuma leitura nova no Radar nem no Redator. |
| **Custo de SERP.** | F2, F3 | Zero por padrão. A SERP da frase só sob pedido, nas 4 lentes com cache. O YouTube só com camada de vídeo. |
| **Virada forçada demais:** texto que "puxa" o leitor sem ponte perde confiança e E-E-A-T. | F3, F4 | A virada nasce de evidência: posição sugerida pela SERP, pauta do especialista para aprofundar o Assunto, alerta quando a SERP não toca o tema. O Redator decide onde e como. O guardião só avisa. A nota do usuário ("o que é, para quem") orienta o tom. |
| **Rollback do ArticleDNA** (seção 6). | F2 | Duas fases, e rollback só até a fase A. |
| **Aprovações humanas antigas revogadas em silêncio pela trava no servidor.** | F1 | A trava só vale para aprovações posteriores à ativação (F1.7); as anteriores passam com alerta. Aplicar para trás é decisão do dono (Q9), com o dry-run que conta todas as aprovadas vivas não recebidas. A já recebida só gera alerta. |
| **Virada sugerida por palavra, não por sentido.** O critério lexical pode dizer "sem coincidência" para um Assunto próximo em sentido. | F3 | O alerta declara o critério e não bloqueia. A seção da virada é exigida mesmo sem coincidência. A leitura semântica fica no backlog do Radar. |
| **Custo fora do ledger.** Sem a linha de capability, o uso é pulado em silêncio (`lib/server/integrations-runtime.ts:1034`), e a quota de homologação é ilimitada. | F1b | Migration antes do deploy (seção 6). O plano detecta a capability nula e avisa "Custo fora do ledger até aplicar a migration" (Q13). O freio real é a autorização do plano, com orçamento em chamadas e em dólares e teto rígido de US$ 0,20 por pesquisa no servidor (F1b.4). |
| **Lista perdida** ao limpar os dados do navegador, em janela anônima, em outro dispositivo ou em outra origem. | F1b | Declarado na tela. A SERP paga continua no cache da marca por 30 dias; as chamadas do Labs, não, e repetir paga de novo. Importar ao Processador é o único jeito de guardar. Nada local é apagado sem autorização (Q12). |
| **SERP da frase quase nunca estará no cache.** Uma frase de Assunto raramente é keyword já medida. O levantamento da F1b relata 0 entradas dessas frases em 2026-09-23; o número não foi reconferido. | F1b | O plano mostra as lentes que faltam, com o custo, e a coleta usa os parâmetros do Resultados. A segunda pesquisa da mesma frase, ou o Resultados da frase importada, reaproveita as 4 lentes por 30 dias. |
| **Tetos cortam candidatas.** 300 por chamada do Google Ads, 100 por task Labs, 5 URLs no ranked e 600 no total. | F1b | O corte aparece como "600 de N" e fica registrado na busca. Os tetos são constantes do módulo puro, e mudar qualquer um exige adendo com o custo novo, sempre abaixo do teto rígido de US$ 0,20 que o dono aceitou. |
| **Frase longa ou sem busca rende pouco.** As fontes 3 e 4 partem da frase como keyword e podem voltar vazias, cobrando a task. É o caso que motivou o pedido (seção 1). | F1b | Quem sustenta o caso é a fonte 5 (o topo da SERP da frase) e a fonte 2 (Google Ads com a página). O diálogo avisa antes de pagar (F1b.2). A homologação mede com uma frase assim (F1b.12, passo 3); se a Camada 1 não servir, o resultado vai para a SDD da Camada 2. |
| **Repetição paga duas vezes ou erra depois de pagar.** A chave do ledger nasce do `operationRequestId`; repetir pagaria de novo e bateria em `INTEGRATION_IDEMPOTENCY_CONFLICT` 409 depois do pagamento (`lib/server/integrations-runtime.ts:1062-1067`), e o resultado, que não fica no banco, se perderia. | F1b | Leitura do ledger antes de pagar, com recusa `OPERATION_ALREADY_EXECUTED`; falha do ledger depois de pagar não descarta o resultado (`ledgerWarning`) (F1b.4). Limite: executes simultâneos em instâncias diferentes, e qualquer repetição antes da migration, só têm a trava da instância. |
| **Perda de chave por escrita concorrente no import da F1b.** Gravar o bloco numa existente regrava `analise_semantica` inteiro. | F1b | O update é condicionado a `aprovacao` ausente e ao status lido, então uma aprovação feita durante o envio não é apagada (F1b.7). Uma chave gravada por outra rota no intervalo ainda se perde, como no lote da F1.6, até `row_version`. |
| **Capability `disabled` não para a chamada.** O modo homologação não confere o status da capability (`lib/server/integrations-runtime.ts:616-622`). | F1b | O rollback da migration só vem depois do rollback do código (seção 6). |
| **Proveniência não verificada** no import, porque o texto vem do navegador (spec §48). | F1b | Nenhuma métrica é aceita, e as origens ficam com `provenanceVerified: false`. O único sinal usado pela F2.4, `subjectKeywordId`, é validado no servidor. O recibo assinado fica para a D3 da SDD da Descoberta local (Q11). |
| **Rebaixamento silencioso** de keyword aprovada por proveniência nova. | F1b | Regra (c): não escrever onde há registro de aprovação (F1b.7, Q10). O teste prova que a assinatura fica idêntica. |
| **Rebaixamento que já existe na Descoberta:** reimportar uma keyword aprovada regrava `discovery_import.lastSeenAt` (`buildDiscoverySemanticEvidence`, `lib/minerador/keyword-import-core.ts`, hoje em `:98`) e muda a assinatura. | Descoberta (fora da F1b) | Registrado no backlog do Minerador (seção 8), com teste de regressão a escrever. A F1b não usa esse caminho. |

---

## 8. Documentos canônicos a alterar DEPOIS da aprovação

Nada abaixo foi alterado agora.

| Documento | Alteração |
| --- | --- |
| `docs/00-produto/glossario.md` | **Assunto** (tronco declarado, sem exigência de demanda) e **keyword de sustentação** (termo novo, para não colidir com "Suporte"). Ajustar "Keyword principal" para "âncora de busca do artigo; dona do slug, do KGR e do H1". Registrar que `excludedSubjects` ("assuntos excluídos") é outra coisa: temas que o artigo não cobre. |
| `docs/04-arquiteto/spec.md` e texto da trava `NO_UNRESOLVED_CANNIBALIZATION` (`lib/arquiteto/article-formation-confirmation.ts:475-476`, na F2) | Trocar "disputam o mesmo assunto" por "disputam o mesmo tema", para não confundir com o Assunto declarado. |
| `docs/00-produto/invariantes.md` | Novos itens: a principal é a âncora de busca; o Assunto, quando declarado, é o tronco; só o humano declara; o Radar não troca o Assunto; o Assunto não conta no teto de 6. |
| `docs/03-minerador/spec.md` §60 | Emenda de "no handoff ... permanecem apenas a Brand ativa e o status editorial" (`:632`): a trava de aprovação passa a valer no envio, só para aprovações posteriores à ativação (F1.7). |
| `docs/03-minerador/spec.md` §61 | Exceção D2 e trava no servidor (P10), não retroativa. |
| `lib/minerador/arquiteto-handoff-gates.ts` (comentário de contrato, na implementação da F1) | "Estado de processo é informação, nunca veto" (`:44-48`) deixa de valer para a trava de aprovação. |
| `docs/03-minerador/spec.md` §67 | O Vínculo passa a ter três declarações. |
| `docs/03-minerador/spec.md` §49 | Import de Assunto por rota própria. |
| `docs/03-minerador/spec.md` §16 (`:225-229`) | Exceção da F1b: a Pesquisa por Assunto **não** persiste execução nem candidatas. A lista vive no navegador, e o banco recebe só o ledger, o cache de SERP da frase e o que for importado. Os outros modos seguem a §16 até a SDD da Descoberta local ser decidida. |
| `docs/03-minerador/spec.md` §47 (`:400-408`) | O modo Por Assunto e as suas fontes: Google Ads com frase e com página, e Labs `related_keywords`, `keyword_ideas` e `ranked_keywords`. A estimativa de volume do Labs é rotulada "estimativa DataForSEO" e nunca vira volume; o Google Ads continua a fonte canônica (`:404`). |
| `docs/03-minerador/spec.md` §48 (`:452-460`) | O import da Pesquisa por Assunto usa a rota própria. A keyword chega como entrada humana, sem métrica, com proveniência `subject_discovery` não verificada (conforme a resposta de Q11), e `subjectKeywordId` é validado no servidor. A frase só vira Assunto por marcação humana no envio, pela rota da F1.3. As outras regras da §48 continuam: ação humana explícita, marca ativa, idempotência e `bruto` sem lista. |
| Texto da regra "não fabrica" (`modules/minerador/discovery/discovery-search-row.tsx:70`; `modules/minerador/context-help.ts:62`, na implementação da F1b) | No modo Por Assunto: "O Google Ads e o DataForSEO Labs devolvem as candidatas; o Minerador não fabrica termos." Os outros modos mantêm o texto atual. A ajuda de contexto ganha a entrada do modo novo. |
| `docs/03-minerador/propostas/sdd-descoberta-temporaria-local-2026-09-23.md` | Nota de consumidor: a F1b já tem lista local própria (`minerador-pesquisa-assunto`) e depende das decisões D1, D3 e D4 para convergir. Nenhuma decisão daquela SDD é tomada aqui. |
| `docs/compartilhado/sdd-arquitetura-integracoes-plataforma-agencia-marca.md` (tabela de capabilities, `:121-122`) e `docs/01-admin/estado-atual.md` | Linha de `dataforseo.keyword_research` (platform, Minerador, Pesquisa por Assunto) e o `operation_kind` `keyword_research`. |
| `docs/04-arquiteto/spec.md` | `subject` no ArticleDNA e no SiloDNA, conservação, formação em torno do Assunto e duas fases. |
| `docs/05-radar/spec.md` | Assunto no contexto, seção exigida da virada no modelo editorial (inclusive sem candidato na amostra), YouTube dentro do teto, virada lexical, alerta e P8. |
| `docs/05-radar/backlog.md` | Leitura semântica (não só lexical) de onde o Assunto cabe na SERP. |
| `docs/03-minerador/backlog.md` | Índice único parcial em `minerador_keywords` para o import (se Q8 pedir); estreitar a leitura do núcleo da Descoberta; **o rebaixamento de aprovada pela regravação de `discovery_import.lastSeenAt`** (seção 7); a Camada 2 da Pesquisa por Assunto, com IA, em SDD própria. |
| `docs/07-redator/spec.md` | Fundamentos, guardião e `writerMayNot`. |
| `docs/00-produto/pipeline-editorial-papeis-handoffs.md` | Minerador (declara Assunto), Arquiteto (fixa o tronco) e Radar (não troca o tronco). A Marca continua sem cadastro de ofertas; o destino vem da declaração. |
| `docs/00-produto/decisoes/ADR-022-assunto-tronco-editorial.md` (novo) | D1 a D4 e o modelo "tronco + sustentação". Emenda o item 4 do ADR-020 (`docs/00-produto/decisoes/ADR-020-kgr-slug-e-formacao-de-artigos.md:21-22`): a principal continua definindo slug, KGR e volume, e o Assunto, quando existe, é o fundamento. |
| `estado-atual.md` e `backlog.md` de Minerador, Arquiteto, Radar e Redator | Ao fim de cada fatia (`AGENTS.md` §17). |

---

## 9. Decisões Q1 a Q9: fechadas em 2026-09-24

| # | Decisão | Como foi fechada |
| --- | --- | --- |
| **Q1** | P1 a P10 confirmadas. P3 só no Processador. | Recomendação apresentada ao dono, sem veto. |
| **Q2** | No import, a frase que já existe vem **desmarcada**. | Recomendação apresentada, sem veto. |
| **Q3** | A trava no servidor fica **só no envio** ao Arquiteto. A rota de aprovação no servidor fica para uma SDD própria. | Recomendação apresentada, sem veto. |
| **Q4** | Página de destino fora do domínio da marca é **recusada**. | Recomendação apresentada, sem veto. |
| **Q5** | **(a)** reabrir a revisão, **(c)** conferir por link e **(d)** confirmar publicada/desvincular ficam **fora** do rodapé; **(b)** cancelar não se aplica a grupo. **(e)** A declaração em grupo aceita **nota e destino opcionais iguais** para todas as selecionadas (F1.6). | **Respondida pelo dono** (as duas perguntas). |
| **Q6** | Virada ausente no texto gera **aviso** no guardião, não bloqueio. | Recomendação apresentada, sem veto. |
| **Q7** | O Assunto pode ser a própria principal **só com Volume validado**. Nunca secundária nem reforço. | Recomendação apresentada, sem veto. |
| **Q8** | Sem índice único nesta SDD: botão desabilitado e trava por `importRequestId`. O índice vai ao backlog do Minerador. | Recomendação apresentada, sem veto. |
| **Q9** | A trava do servidor vale **só para aprovações novas**. As antigas passam com alerta, e o dry-run da F1.7 informa a decisão futura. | Recomendação apresentada, sem veto. |

**Da F1b:** Q10 a Q14 foram fechadas em 2026-09-24 (F1b.13): proveniência em existentes, confiança no texto do navegador, política da lista local, execução antes da migration e declaração da frase no envio.

Registro original das perguntas, mantido como histórico:

| # | Pergunta | Recomendação |
| --- | --- | --- |
| **Q1** | Confirmar P1 a P10 como estão? | **Sim.** Cada premissa evita um risco verificado: P2 evita a perda pelo enum, P3 evita o import órfão, P10 fecha a trava. |
| **Q2** | No import, a frase que já existe na marca deve vir **marcada** ou **desmarcada** para declarar? | **Desmarcada.** Declarar é decisão sua, e a keyword pode estar aprovada: declarar a leva para Em revisão. |
| **Q3** | A trava de aprovação no servidor fica só no envio ao Arquiteto, ou a aprovação passa a ter rota de servidor própria? | **Só no envio**, nesta SDD. A rota de aprovação no servidor vira pendência, com SDD própria, porque muda toda aprovação. |
| **Q4** | Página de destino fora do domínio da marca: recusar ou aceitar com aviso? | **Recusar.** A virada aponta para a oferta da marca. Link externo seria outra coisa. |
| **Q5** | Você pediu **todas** as escolhas humanas no rodapé. Esta SDD põe lá Assunto, tipo de página e posto (KGR, concluir revisão e Status já estão). Propõe deixar **fora** estas, uma a uma: **(a) Reabrir revisão** ("Revisar novamente"): desfaz as decisões de cada keyword; em grupo, apagaria revisões inteiras sem você ver quais. **(b) Cancelar**: só existe durante a edição de uma revisão aberta, que é de uma keyword. **(c) Conferir por link**: cada keyword tem a própria URL, digitada à mão. **(d) Confirmar publicada / Desvincular**: a spec proíbe declarar publicação em massa (§68, `docs/03-minerador/spec.md:815`). **(e) Nota e página de destino do Assunto**: em grupo, o Assunto seria declarado sem elas, porque cada Assunto tem as suas. Concorda com cada exclusão? | **Sim para (a), (c) e (d); (b) não se aplica a grupo.** Para **(e)**, recomendo o grupo declarar sem nota e sem destino, e a tabela marcar "Assunto sem nota" até você completar na Revisão. Se preferir, o grupo pode aceitar **uma** nota e **um** destino iguais para todas as selecionadas (útil quando várias frases apontam para a mesma landing). |
| **Q6** | Virada ausente no texto deve ser **aviso** ou **bloqueio** no guardião? | **Aviso.** A estrutura é do Redator (invariante 48). |
| **Q7** | O Assunto pode ser a própria principal quando a frase tem busca e vence a formação? | **Sim, só com Volume validado** no pacote aprovado. Um Assunto aprovado pela exceção D2, sem Volume, nunca é principal. Nunca secundária nem reforço do mesmo artigo. |
| **Q8** | Aceitar o risco de duplicata no import de Assunto por dois envios simultâneos, ou criar um índice único no banco (é migration, fora desta SDD)? | **Aceitar nesta SDD**, com botão desabilitado e trava por `importRequestId`. O índice único vai ao backlog do Minerador com SDD própria, porque vale também para a Descoberta. |
| **Q9** | A trava de aprovação no servidor vale só para aprovações **novas** ou também para as antigas (aprovadas antes, sem Volume ou Resultados)? | **Só para as novas.** As antigas passam com alerta. Revogar aprovação humana antiga só com o número na mão: o dry-run da F1.7 conta quantas aprovadas não recebidas não passariam, e você decide depois. |

---

## 10. Autorização necessária e ordem de execução

**Autorização:**

1. **Dada em 2026-09-24:** o dono aprovou esta SDD, com Q1 a Q9 fechadas (seção 9), e autorizou a implementação de todas as fatias, na ordem abaixo. A aprovação autoriza só o escopo descrito (`AGENTS.md` §4). O que sair dele volta como adendo.
2. **Deploy da F2 em duas vezes (seção 6).** A fase A vai sozinha para o ar e é homologada antes da fase B. Depois do deploy da fase A, **nenhum rollback volta para antes dele**. O usuário faz os deploys.
3. **Não é necessário nas fatias F1 a F4:** migration, SQL remoto, instalação nem chamada paga. A SERP opcional da frase já é regra da plataforma (4 lentes, cache) e sai por ação explícita do usuário.
4. **F1b:** precisa de **uma migration de catálogo**, criada pelo agente e executada pelo usuário **antes** do deploy (F1b.8; seção 6). As chamadas pagas só acontecem por ação do usuário na tela, depois de confirmar o plano. Nos testes, nenhuma chamada paga.
5. **O usuário executa:** o dry-run da trava (F1.7), a migration da F1b, a primeira pesquisa real da F1b, a homologação manual de cada fatia, o commit, o push e o deploy.

**Ordem: F1 → F1b → F2 (fase A → fase B) → F3 → F4.** A F1b depende só da F1 (a frase e o destino do Assunto) e pode ser implementada em paralelo a ela, com arquivos separados.

| Fatia | Entrega | Gate de saída |
| --- | --- | --- |
| **F1** | declaração, import, Revisão, coluna, rodapé, trava D2 na tela e no handoff | testes F1.10 + TypeScript + lint + `git diff --check`; homologação do usuário: importar uma lista de Assuntos, declarar uma keyword do Descobrir, aplicar o Vínculo em grupo, aprovar com volume `null`, enviar ao Arquiteto |
| **F1b** | modo Por Assunto, 5 fontes com tetos, SERP da frase no cache, plano e autorização, lista local, import com `subject_discovery`, ledger e migration | testes F1b.11 + TypeScript + lint + `git diff --check`; Q10 a Q13 fechadas; migration aplicada pelo usuário e conferida por readback (capability presente, CHECK aceita `keyword_research`); homologação F1b.12, que só vira PASS depois de o readback achar no banco os eventos do ledger, as entradas da frase no cache e as keywords importadas sem volume, de conferir que nenhuma aprovada foi para Em revisão e nenhuma pesquisa passou de US$ 0,20, e com o resultado da frase sem busca (passo 3) registrado no `estado-atual.md` do Minerador |
| **F2 · A** | schema aceita `subject` | testes de schema; deploy; homologação: o Arquiteto e o Radar abrem normalmente |
| **F2 · B** | listas, conservação, sugestões, prender o Assunto em artigo e Silo | testes F2.6; homologação: formar dois artigos e uma landing page em torno de "SEO para clínicas", conferir slug e SERP das sustentações, o Assunto fora das não agrupadas quando ancorado e dentro delas, com o selo, quando sem artigo |
| **F3** | contexto, especialista, YouTube, virada, alerta, FINALIZE | testes F3.3 com hashes dourados; homologação: investigar um artigo com Assunto e um sem |
| **F4** | fundamentos, MCP, guardião, CSV | testes F4.4 com export J; homologação: exportar o CSV e abrir no Redator |

Cada fatia termina com o `estado-atual.md` e o `backlog.md` do módulo dono atualizados, separando o que foi **verificado no código**, **confirmado por teste** e **validado manualmente** (`AGENTS.md` §17). Nenhuma fatia é declarada concluída só porque os testes passaram.

---

## 11. Revisão de implementação — F1 e F2 fase A (2026-09-24)

> **Estado:** F1 e F2·A estão no código. **Verificado no código** e **confirmado por teste** nesta data. **Validado manualmente: não.** A homologação é do usuário e está pendente. As subseções 11.1 a 11.3 não cobrem a F1b; a revisão dela está na 11.4.
> Registro operacional: `docs/03-minerador/estado-atual.md` e `backlog.md` (2026-09-24).

A implementação passou por três revisões independentes: contrato e regras, uso e visual, segurança e dados. Houve uma rodada de correção depois. Os itens abaixo são o que ficou **diferente do desenho** das seções 5 a 7, ou o que o desenho não decidia.

### 11.1 Desvios da F1

| # | Desenho | Como ficou | Por quê |
| --- | --- | --- | --- |
| 1 | F1.7: "uma constante de ativação da fatia", sem valor | `SERVER_APPROVAL_GATE_SINCE = "2026-09-24T00:00:00-03:00"` (`lib/minerador/approved-package.ts`) | A tela aplica `resolveApprovalReadiness` desde o §61 (2026-09-18). Tudo o que a tela aprovou desde então já passou pela trava, então ligar o envio no dia da aprovação desta SDD não revoga decisão tomada sob outra regra |
| 2 | F1.7: aprovação anterior passa com alerta | O registro do backfill (`approvedBy` `"backfill:…"`) só é isento quando `approvedAt` é **anterior** à constante ou ilegível | Sem a data, o prefixo gravável pelo navegador desligaria a trava para sempre. Todo backfill legítimo rodou em 2026-09-18 |
| 3 | F1.2 só conferia o destino na declaração; F1.9: "trava no handoff: 0 extra" | `prepareCanonicalHandoff` **reconfere o destino** contra o `marcas.site_url` atual e ignora o `hostMatchesBrand` gravado. Os três casos de recusa dão 409 no lote: fora do domínio, sem `https`, ou marca sem site com destino. Já recebida gera alerta com `scope: "destination"` | A declaração sai do navegador por RLS, então o booleano gravado não é garantia. Custo: uma leitura de `marcas.site_url` (~100 B), **só** quando alguma elegível tem destino. A trava de aprovação continua sem leitura extra |
| 4 | F1.7: tela e servidor "dizem a mesma coisa" | **Parcial.** A trava de aprovação é a mesma função nos dois lados, mas há três diferenças. A tela não recebe `alreadyReceivedKeywordIds`. A tela não confere o destino: o 409 chega pela notificação de erro. E o `approvalAlerts` da resposta é descartado pelo `HandoffResponseSchema` (`lib/arquiteto/canonical-workspace.ts`), então a tela mostra só os alertas que ela mesma calcula | A tela não conhece as recebidas sem uma leitura nova, que esta SDD não prevê. O schema é arquivo do Arquiteto, fora da lista de quem implementou. As três ficam no backlog do Minerador |
| 5 | F1.10: "`setKeywordSubject` só é importado pelo workspace e pela rota do import" | Lista **fechada** por porta: `setKeywordSubject` em import-core, vinculo-batch e workspace; `withdrawKeywordSubject` em vinculo-batch e workspace; `planVinculoBatch` só no workspace; `importSubjectsWithCore` só na rota. A regex de IA inclui `deepseek` | A rota não grava direto; quem grava é o núcleo. A lista fechada obriga a mudar o teste de propósito para acrescentar um chamador |
| 6 | F1.9: prévia lê as vivas da marca | As vivas são lidas **paginadas** (`.order("id").range()`, 1000 por página), e `analise_semantica` só das que casaram, em blocos de 200 ids. A busca da corrida usa o mesmo caminho | O PostgREST corta em `max_rows = 1000`. Sem paginar, numa marca com mais de 1000 vivas, a existente virava "nova" e nascia duplicata |
| 7 | F1.3: aplicar numa existente | Se o `analise_semantica` da existente não foi lido, a linha termina como `failed`, e nada é gravado | Gravar a partir de `{}` apagaria o DNA inteiro da keyword |
| 8 | F1.9 não previa releitura depois do import | A tela relê as criadas e as declaradas pela **view de listagem**, sem as séries de medição, em blocos de 200 ids. Se a view faltar, cai para a tabela | É a releitura que alimenta a tabela e a Lógica automática. Pela view, deixa de trazer ~9,5 kB por existente declarada |
| 9 | F1.6: readback estreito | Readback em blocos de 200 ids, no lote do Vínculo e em `readCanonicalKeywordRows`. `vinculoBatchReadbackMatches` compara com `sortKeysDeep` | Os ids viajam na URL. O JSONB reordena as chaves de `keyword_subject`, e a comparação crua acusava toda gravação correta como divergente |
| 10 | F1.6: Declarar em grupo com nota e destino iguais | A keyword que **já é Assunto** é pulada (`already_declared`) e não recebe a nota nem o destino do lote | Escolha conservadora, alinhada à regra do import. A troca é feita na Revisão Humana |
| 11 | F1.7b: "mostra o mesmo progresso do botão" | Sem seleção, os alvos da Lógica automática passam a ser a seleção, para a barra de progresso aparecer. Uma seleção existente é mantida | A barra só existe com seleção |
| 12 | F1.3: CSV com `nota` e `pagina` | O cabeçalho "Assunto" **não** é alias da coluna da frase. Numa lista de uma coluna, a primeira linha "Assunto" ou "Assuntos" vem desmarcada, e a ajuda diz que a coluna se chama Keyword ou Termo | A SDD não lista esse alias. Aceitá-lo é decisão do dono |
| 13 | F1.4 e F1.6 não falavam de revisão concluída | Com a Revisão Humana concluída, o controle Assunto fica travado até "Revisar novamente", mas o rodapé declara sem reabrir | Decisão do dono, pendente: ou o Assunto fica editável sem reabrir, ou o rodapé respeita o bloqueio |
| 14 | F1.5: aviso ao retirar | Na retirada em grupo de aprovadas, a confirmação traz a frase da F1.5 no plural | O desenho só dava o texto individual |

**Limites que continuam como o desenho declarou:**

- A escrita regrava o `analise_semantica` inteiro na Revisão, no lote e no import sobre existentes. Só `row_version` fecha.
- A trava por `importRequestId` vale só na mesma instância (Q8).
- O `approvedAt` gravado pelo navegador pode ser forjado até existir a rota de aprovação no servidor (Q3).

**Riscos novos observados:**

- **Prontidão que muda sem mudar a assinatura.** A trava pode recusar uma aprovada nessa situação. Exemplo: a revalidação do Volume por série de medição, que fica fora da assinatura v3.
- **Troca do `site_url` na Marca.** Pode passar a bloquear o envio de Assuntos com destino antigo.
- **Lógica automática.** `processLogicalKeywordDna` aborta a rodada inteira se o contrato de saída de uma keyword não fechar.
- **Aviso do import.** O `approvalWarning` usa o status bruto `aprovado`, não o efetivo.
- **Corpo da rota do import.** Ele não é `.strict()`: um `brandId` no corpo é descartado em silêncio, não recusado. Isso é seguro, porque a marca vem do caminho.

### 11.2 Desvios da F2 fase A

- **Normalização.** O `superRefine` do ArticleDNA compara `subject.phrase` com `excludedSubjects` por uma **cópia local** da `normalizeKeyword` do Minerador, privada em `lib/arquiteto/contracts.ts`. Assim o contrato não fica ligado ao núcleo de import. Um teste confere que as duas dão o mesmo resultado, mas só nos casos cobertos.
- **SiloDNA.** Ganhou só o campo `subject`, sem regra contra `excludedTopics`, porque a F2.1 não pede. Se o dono quiser a mesma proteção do ArticleDNA, fica para adendo.
- **Principal igual ao Assunto.** O schema aceita, como a F2.1 prevê. A decisão fica no gate de conclusão da fase B.
- **`attachedAt`.** É `z.string().min(1)` e aceita `+00:00`, como a F2.1. O `createdAt` do envelope versionado continua exigindo `Z`, pela regra vigente.
- **Nenhum caminho grava `subject`.** Não há teste estrutural para isso, porque ele quebraria de propósito na fase B. Hoje o campo só aparece em `contracts.ts` e no teste.
- **Compatibilidade.** Hashes dourados de um ArticleDNA e de um SiloDNA, capturados antes da mudança, seguem iguais no payload cru, no lido e no envelope versionado. Os do Radar seguem verdes.
- **Rollback.** Depois do deploy da fase A, nenhum rollback volta para antes dela (seção 6, item 1). Registrado em `docs/04-arquiteto/estado-atual.md`, `docs/04-arquiteto/backlog.md` e `docs/04-arquiteto/spec.md` §33.3 (2026-09-24).
- **Fase B:** não implementada.

### 11.3 Números das suítes

Medidos no fim da rodada de correção e comparados por nome, sem a duração, com a base. Nenhuma falha nova apareceu, e nenhuma falha da base desapareceu.

| Suíte | Resultado |
| --- | --- |
| Minerador (`node --test "tests/minerador-*.test.mts"`) | 916 testes, 888 pass, 28 falhas, todas da base |
| `test:arquiteto` | 2274 testes, 2272 pass, 2 falhas da base |
| `test:arquiteto:servidor` | 29/29 (18 da base + 11 do Assunto) |
| `test:arquiteto:lentes` | 31/31 |
| `test:authz` | 33 testes, 31 pass, 2 falhas da base |
| `test:editorial` | 174 testes, 170 pass, 4 falhas da base |
| `test:operational` | 51 testes, 41 pass, 10 falhas da base |
| `test:visual-system` | 28 testes, 23 pass, 5 falhas da base |
| `test:marca` | 106/106 |
| `test:redator` | 335/335 |
| `test:serp-cache` | 34/34 |
| `test:radar` | 2616/2616, com os hashes dourados |

**Arquivos novos de teste:**

| Arquivo | Testes |
| --- | --- |
| `tests/minerador-assunto-dominio.test.mts` | 15 |
| `tests/minerador-assunto-vinculo.test.mts` | 5 |
| `tests/minerador-assunto-aprovacao.test.mts` | 12 |
| `tests/minerador-assunto-lote.test.mts` | 10 |
| `tests/minerador-assunto-import-parser.test.mts` | 5 |
| `tests/minerador-assunto-import-core.test.mts` | 15 |
| `tests/minerador-assunto-import-rota.test.mts` | 7 |
| `tests/minerador-assunto-tela-lote.test.mts` | 10 |
| `tests/minerador-assunto-tela-estrutura.test.mts` | 8 |
| `tests/arquiteto-assunto-trava-servidor.test.mts` | 11 |
| `tests/arquiteto-assunto-schema.test.mts` | 16 |

Rodados de novo nesta data, durante a atualização da documentação:

- os nove do Minerador mais o do schema: **103/103**;
- `npm run test:arquiteto:servidor`: **29/29**.

**Outras conferências:**

- `npx tsc --noEmit` limpo.
- ESLint sem erro novo. No `minerador-workspace.tsx`, os mesmos 18 problemas de antes.
- Guard visual estrito:
  - `dna-panels.tsx` e `minerador-workspace.tsx`: 186 violações antes e 186 depois, nenhuma nova;
  - `discovery-source-controls.tsx`: PASS.
- `git diff --check` limpo.
- Fim de linha preservado em todos os arquivos tocados.

**Nada disso é homologação.** O roteiro está no `estado-atual.md` do Minerador e no gate da F1 (seção 10). Deploy e homologação da fase A vêm antes de a fase B gravar `subject`.

### 11.4 Revisão de implementação — F1b (2026-09-24)

> **Estado:** a F1b está no código. **Verificado no código** e **confirmado por teste** nesta data. **Validado manualmente: não.** Nenhuma pesquisa real foi feita. A migration `20260924120000_dataforseo_keyword_research_operation.sql` está escrita e **não aplicada**. O gate da F1b (seção 10) continua aberto: migration aplicada e conferida, homologação F1b.12 com o passo 3 registrado.
> Registro operacional: `docs/03-minerador/estado-atual.md` e `backlog.md` (2026-09-24).

A implementação foi feita em três partes (servidor e provider, import, tela) e passou por três revisões independentes: contrato e custo, uso e visual, dados e segurança. A revisão de uso reprovou a primeira versão da tela, com três pontos obrigatórios (origens e evidência cortadas, foco dos diálogos, preço por item arredondado para baixo). Houve uma rodada de correção, que fechou esses três e mais onze recomendados. Os itens abaixo são o que ficou **diferente do desenho** da F1b, ou o que o desenho não decidia.

| # | Desenho | Como ficou | Por quê |
| --- | --- | --- | --- |
| 1 | F1b.4: rota `POST .../subject-discovery` | `POST .../subject-discovery/search`, ao lado de `.../subject-discovery/import` | Pedido da tarefa de implementação; servidor e tela concordam. F1b.4 alinhada nesta data |
| 2 | F1b.4, item 1: o ledger é lido só na chave da **primeira** chamada paga | O execute lê as chaves de **todas** as chamadas DataForSEO planejadas, até 11, em paralelo | Se a primeira não foi gravada (pedido que não saiu, ou falha do ledger que virou `ledgerWarning`), o mesmo `operationRequestId` pagaria o Labs inteiro de novo. Custo: ~0,3 kB por chave. F1b.4 alinhada nesta data |
| 3 | F1b.10: o plano lê as extras em modo `digest` | O plano lê as 4 lentes em modo `meta`. No execute, hit ou miss (e o `planHash`) também saem do `meta`; corpo e digest só são lidos **depois** de autorizar, travar a instância, abrir a execução e conferir o ledger, só nas lentes em cache e só com a fonte 5 no plano | Egress menor, e nenhum execute recusado lê corpo. O modo `body` descarta a canônica sem corpo, e o `meta` a conta como hit: decidir pelos dois modos daria `PAID_PLAN_CHANGED` em laço. Canônica em cache sem corpo conta como cache, sem URL e sem pagamento |
| 4 | Cabeçalho da F1b e F1b.7: "não toca `keyword-import-core.ts`" | O núcleo ganhou `hasKeywordApprovalRecord`. `importKeywordsWithCore` não escreve mais em existente com registro de aprovação (`approval_record_preserved`), e o update da existente sem aprovação é condicionado a `analise_semantica->aprovacao` nulo, com `.select("id")` (`changed_during_import` com 0 linhas). A assinatura pública não mudou | Conserto do defeito da F1b.7 ("rebaixamento pela regravação de `discovery_import.lastSeenAt`"), pedido na rodada. **Confirmado por teste** antes e depois (`tests/minerador-import-descoberta-aprovada-preservada.test.mts`). O filtro por caminho JSON no PostgREST real é **Ainda não verificado**; se falhar, a existente sem aprovação volta como `failed` na Descoberta, sem gravar nada |
| 5 | F1b.2: até 3 evidências por candidata | As evidências são guardadas todas, e a do `labs_ranked` vem primeiro, antes do corte em 3 | Com várias origens, a evidência que explica a sustentação ("ranqueia em #N em …") era cortada |
| 6 | F1b.7: releitura das vivas na corrida do insert | No máximo uma releitura por envio, e só com `23505`; outros códigos viram `failed` sem releitura | Com N falhas, a releitura por item faria N leituras completas da marca |
| 7 | F1.3 (11.1, item 12): o cabeçalho "Assunto" não é alias | Com `subjectColumns`, a coluna da frase também atende por `assunto`, `assuntos`, `tema`, `titulo` e `título`. `keyword`, `termo` e `query` têm prioridade. Sem a opção, saída idêntica | Pedido da rodada; substitui o limite registrado na 11.1 |
| 8 | F1b.1: a página lê `searchParams` (Promise no Next.js 16) | O Descobrir lê `?modo=assunto&assunto=<uuid>` no cliente, por `window.location`, depois de montar; `page.tsx` não mudou. Trocar de modo atualiza a URL com `replaceState` | Evita a exigência de Suspense do `useSearchParams` e não mexe na rota. A ordem entre `router.push` e a leitura no efeito é **Ainda não verificada** em runtime |
| 9 | F1b.1: "Buscar sustentação" na linha e na Revisão | Na linha do Processador e na Revisão Humana, no código. Na Revisão, `components/editorial/dna-panels.tsx` ganhou a prop opcional `onSubjectSearch` (aditiva; o botão só aparece com a prop e com o Assunto declarado; único consumidor, o workspace do Minerador, com o mesmo link da linha). **Confirmado por teste** (`tests/minerador-assunto-fechamento-f1b.test.mts`) | O arquivo estava fora da lista da parte da tela; foi fechado por uma frente paralela, conferida nesta data |
| 10 | F1b.2: texto de local "A UF vale só para o Google Ads" | O aviso do servidor ficou literal. A tela acrescenta que o idioma escolhido também vale só para o Google Ads | O Labs e a SERP usam sempre `"pt"`; quem escolhe Inglês podia achar que a pesquisa toda mudava. Se esta SDD adotar a frase nova, a troca no servidor é de uma linha |
| 11 | Não previsto | `includeAdultKeywords` vai sempre `false` no modo Por Assunto | O controle fica na linha de filtros da Descoberta, que não aparece neste modo; uma escolha herdada da última Descoberta entraria sem ninguém ver |
| 12 | Não previsto | Lentes com nome de aparelho ("Desktop · Windows", "Celular · iOS"); rótulos próprios para cada "origem não gravada"; preço por item com até 6 casas; diálogos com foco contido e retorno ao gatilho | Correções da revisão de uso |
| 13 | F1b.1: o select de Assuntos declarados | A leitura no navegador vai até 1000 linhas. Se falhar ou o id do link estiver além delas, a tela lê só esse id, na marca da rota | Marca com mais de 1000 Assuntos teria o select cortado; o servidor relê a declaração pelo id de qualquer forma |
| 14 | F1b.5: "até lá, nada é apagado sozinho" | A vencida e a excedente saem sozinhas, só no próprio escopo de ator e marca | A Q12 foi autorizada pelo dono (F1b.13) |
| 15 | F1b.8: capability no catálogo do Admin | Runtime, catálogo do Admin e resolver próprio no código. A lista de operações do painel manual (`modules/admin/platform-integrations-panel.tsx`) também tem `keyword_research`, no fim, igual às 12 de `INTEGRATION_CAPABILITY_OPERATIONS`. **Confirmado por teste** (`tests/minerador-assunto-fechamento-f1b.test.mts`) | O arquivo estava fora da lista da parte do servidor; o bootstrap já conhecia a capability. O painel foi fechado por uma frente paralela, conferida nesta data |

**Limites que continuam como o desenho declarou:**

- Dois executes simultâneos com o mesmo id, em instâncias diferentes, e qualquer repetição antes da migration só têm a trava da instância.
- No import sobre existentes, uma chave gravada por outra rota entre a leitura e a escrita ainda se perde, até existir `row_version`. Duplicata entre instâncias continua possível sem índice único (Q8).
- O comportamento do Labs com frase sem busca é **Ainda não verificado** (F1b.2).

**Riscos novos observados:**

- **Execução sequencial**, com até 11 chamadas pagas de até 30 s cada, e nenhuma rota define `maxDuration`. Numa hospedagem com limite curto, o resultado pago pode se perder; o ledger registra cada chamada. Paralelizar ou definir `maxDuration` exige decisão.
- **Eco do `seed_keyword`** compara sem acento e sem caixa, mas com pontuação. Se o Labs normalizar símbolos, a fonte cai em `result_mismatch`, e a task é cobrada mesmo assim. Observar no passo 3 da F1b.12.
- **`planHash`** cobre a frase normalizada; o provider recebe a frase crua. Uma troca só de caixa ou acento entre plan e execute passa com o mesmo hash, sem mudar o custo.
- **Orçamento** usa o `maxCostUsd` autorizado que o navegador envia, limitado a US$ 0,20. A tela envia o do plano, como a F1b.4 pede.
- **As duas rotas** fazem o parse do corpo antes de autenticar: sem sessão, a resposta é 400 do zod, não 401. Vaza só o schema.
- **Chave do ledger** sem a marca. O `op` é um UUID gerado pelo navegador, e a colisão entre marcas é só teórica.

**Fechamento da F1b (frente paralela), conferido nesta data:** a ajuda de contexto do modo (`descobrir-por-assunto` em `modules/minerador/context-help.ts`), o `aria-label` e o `title` do "Limpar seleção" em `discovery-table-placeholder.tsx` (dívida antiga) e os itens 9 e 15 estão no código. **Confirmado por teste:** `tests/minerador-assunto-fechamento-f1b.test.mts`, 5/5. **Validado manualmente: não.**

**Pendências, fora desta rodada:** re-export opcional do resolver em `lib/minerador/dataforseo-canonical.ts`; linha `dataforseo.keyword_research` na SDD de integrações e em `docs/01-admin/estado-atual.md` (seção 8); validação manual dos quatro itens do fechamento, junto com a F1b.12.

**Números das suítes**, no fim da rodada de correção, comparados por nome com a base. Nenhuma falha nova apareceu, e nenhuma falha da base desapareceu.

| Suíte | Resultado |
| --- | --- |
| Minerador (`node --test "tests/minerador-*.test.mts"`) | 1046 testes, 1018 pass, 28 falhas, todas da base |
| Integrações (`--experimental-loader ./tests/integrations-runtime-loader.mjs`, `tests/integrations-*` e `tests/platform-integrations-*`) | 68 pass, 1 falha da base ("DataForSEO probe makes one minimal mocked request and sanitizes failures") |
| `test:arquiteto` | 2274 testes, 2 falhas da base |
| `test:authz` | 33 testes, 2 falhas da base |
| `test:editorial` | 174 testes, 4 falhas da base |
| `test:operational` | 51 testes, 10 falhas da base |
| `test:visual-system` | 28 testes, 5 falhas da base |
| `test:marca`, `test:redator`, `test:serp-cache`, `test:arquiteto:servidor`, `test:arquiteto:lentes`, `test:radar` | 106, 335, 34, 29, 31 e 2616, todos verdes |

**Após o fechamento da F1b**, comparadas por nome com a base (os números acima ficam como histórico): Minerador com 1051 testes, 1023 pass e 28 falhas, os mesmos nomes da base; Integrações com 69 testes, 68 pass e 1 falha da base; `tsc --noEmit` sem erros.

**Arquivos novos de teste**, rodados de novo nesta data, arquivo a arquivo, sem rede: **130/130**.

| Arquivo | Testes |
| --- | --- |
| `tests/minerador-assunto-pesquisa-labs.test.mts` | 10 |
| `tests/minerador-assunto-pesquisa-plano.test.mts` | 12 |
| `tests/minerador-assunto-pesquisa-busca.test.mts` | 25 |
| `tests/minerador-assunto-pesquisa-catalogo.test.mts` | 10 |
| `tests/minerador-assunto-pesquisa-import.test.mts` | 20 |
| `tests/minerador-assunto-pesquisa-import-rota.test.mts` | 7 |
| `tests/minerador-assunto-pesquisa-import-csv-aliases.test.mts` | 6 |
| `tests/minerador-import-descoberta-aprovada-preservada.test.mts` | 7 |
| `tests/minerador-assunto-pesquisa-tela.test.mts` | 11 |
| `tests/minerador-assunto-pesquisa-tela-local.test.mts` | 22 |

Mais 2 testes em `tests/minerador-google-ads-discovery-usage.test.mts` e 2 em `tests/minerador-dataforseo-canonical.test.mts`, que rodam com o loader de integrações.

**Outras conferências:** `tsc --noEmit` sem erros; ESLint sem problemas nos 9 arquivos de código da correção; guard visual estrito PASS nas telas da F1b (o `minerador-workspace.tsx` segue com as mesmas violações do HEAD, nenhuma nas linhas novas); `git diff --check` limpo; fim de linha preservado por arquivo, sem arquivo misto: `minerador-workspace.tsx` e `dna-panels.tsx` em CRLF na cópia de trabalho, os demais em LF (o blob do HEAD é sempre LF, pela normalização com `core.autocrlf=true`).

**Nada disso é homologação.** Falta a validação visual em 360, 768, 1024 e 1440 px e no dark mode, e o roteiro F1b.12 inteiro, que é do usuário.

### 11.5 Revisão de implementação — F2 fase B, F3 e F4 (2026-09-24)

**Estado:** verificado no código e confirmado por teste. Não commitado quando este texto foi escrito; o commit segue o da F1/F1b/F2·A (`cf9735e`). **Validado manualmente: não.** Nenhum ArticleDNA real tem `subject` ainda, então Radar e Redator só mostram o Assunto depois que o Arquiteto gravar o primeiro.

**Ordem de deploy (seção 6):** este commit só vai ao ar depois que o `cf9735e` estiver no ar e o usuário conferir que o Arquiteto e o Radar abrem normalmente. Depois disso, o rollback nunca volta para antes da fase A.

#### F2 fase B (Arquiteto)

Entregue conforme a F2.1 a F2.6, com estes desvios e acréscimos:

| Ponto | O que foi feito |
| --- | --- |
| Domínio | `lib/arquiteto/declared-subject.ts`. `subject` montado a partir do pacote aprovado, pelo resolver do Minerador. Prender e soltar em artigo, landing, página de serviço e Silo. Silo só **sugere** o Assunto aos artigos. |
| Conservação (§10) | Predicado único `isAnchoredSubject` e uma lista só de troncos em todos os cálculos da F2.3. Vínculo da sessão só vale com candidato vivo. |
| Formação | Assunto sem Volume validado fica fora do automático e nunca é principal. Gate Q7 com o código `SUBJECT_PRINCIPAL_REQUIRES_VOLUME`. Trava de canibalização diz "o mesmo tema". |
| Troca silenciosa | `ANOTHER_SUBJECT_ATTACHED`: unidade que já tem outro Assunto recusa o novo. |
| **Guarda no servidor** (acréscimo, obrigatório pela invariante 81) | Em `appendArquitetoArtifact`, `persistSiloPairAtomic`, no PATCH da cópia de trabalho e no adaptador da consolidação do Silo. Quando o `subject` é novo ou mudou: `attachedBy` é o `auth.users.id` do ator, a keyword é viva, da marca, recebida e declarada no pacote aprovado, e os campos batem com o pacote. Q7 também vale para quem carrega o Assunto. Códigos: 403 (ator, outra marca) e 409 (resto), `SUBJECT_DROPPED` quando a consolidação some com o Assunto. Leitura estreita, só com Assunto. |
| Vínculo da formação | Campo opcional `articleSubjectAnchor` na cópia de trabalho, com readback. Sobrevive ao recarregar. |
| Silo consolidado | Carrega o `subject` da versão anterior. Silo com SiloPage recusa Assunto novo (`SUBJECT_SILO_PAGE_BOUND`), porque uma versão avulsa do SiloDNA desalinharia a página. |
| Diff de versão | `subject` em `EDITORIAL_DECISION_FIELDS`; `attachedAt`/`attachedBy` como carimbos. |
| Sugestões | Determinísticas, só sobre keywords recebidas: `subject_discovery.subjectKeywordIds` primeiro, depois frase, entidade central, lista, intenção/funil e termos da nota. Zero leitura nova. |

**Limites registrados no backlog do Arquiteto:** a restauração de backup confere o autor só pelo formato; as rotas de IA do Arquiteto criam versões sem `subject` (hoje só grupos novos); Silo com página ainda não recebe Assunto novo; "Pedir proposta" à IA não foi implementado; botões `min-h-8` herdados.

#### F3 (Radar)

Entregue conforme a F3.1, com estes ajustes:

- **YouTube:** o plano sai com o mesmo número de consultas que teria sem Assunto; a consulta do Assunto toma o lugar da última, e isso vai para as limitações.
- **Especialista:** o r7 garante uma pauta sobre o Assunto quando a IA não gera nenhuma. O especialista humano **vê** o Assunto no painel e no Telegram.
- **Texto ao especialista externo (adendo):** o pedido literal da F3.1 ("aprofundar o Assunto e a virada…") continua na pauta interna e no prompt. Para quem é de fora da plataforma, a mensagem usa linguagem simples: "Tema a aprofundar: <frase>" e "Pergunta: o que o leitor desta busca precisa entender para chegar a <frase>?", sem as palavras Assunto, tronco, virada ou ArticleDNA.
- **Telas:** a seção sintética aparece como "Exigida pelo Assunto" e não conta como bloco observado. A contagem na amostra diz "Palavras do Assunto aparecem em N de M página(s)".
- O bundle congelado não mudou de schema; a seção da virada congela em `blueprint.sections`.

#### F4 (Redator e CSV) e adendo técnico da entrega

**A virada e a direção do H1 não chegam pelo dossiê** (a F4.1 dizia isso). O bundle V3 não leva o artigo-modelo nem as seções do blueprint, e mudar o bundle quebraria o schema `.strict()` e o hash. O caminho adotado, dentro da invariante 78 (dossiê lido, nunca copiado):

1. No envio ao Redator, **só com Assunto**, o documento recebe linhas curtas em `importedContext.editorialContext`, que já existia e ia vazio: Tronco, Virada, Seção da virada, Direção do H1, Destino da chamada e Alerta (`lib/redator/radar-subject-turn.ts`). O texto é o mesmo do CSV "Para escrever". Sem Assunto, o documento é igual ao de antes (snapshot conferido).
2. Essas linhas chegam a quem redige pela **projeção única** `radarFoundationsOf`: painel do Redator (bloco no topo com o Assunto, a nota, onde virar, o H1, o destino e o alerta), semeadura de roteiro e carrossel, `get_writer_foundations`, `get_writer_brief` e o material por seção.
3. **Leituras novas, todas estreitas e só com Assunto** (a F4.4 dizia "nenhuma"): o caminho `editorialContext` do documento (< 2 kB) e, no guardião, `articleDnaRef` na mesma consulta mais `payload->subject` da versão fixada (< 1 kB).
4. **Guardião ligado** no MCP e no painel: avisa virada ausente e link ao destino ausente, nunca bloqueia pelo Assunto (Q6). Se a leitura falhar, diz "Não foi possível ler o Assunto". O painel passou a contar pelo relatório do servidor.
5. **`writerMayNot`**: com Assunto, "trocar ou remover o Assunto declarado" é gravado no envio e aparece igual em todas as ferramentas. Nos fundamentos, o `subject` sai reduzido a `{ phrase, note, destinationUrl }`.

**Pendências registradas:** o `get_writer_foundations` ainda soma `editorialContext` por um caminho próprio, fora de `radarFoundationsOfDossier`, e precisa ser unificado; a lista "Achados por seção" do guardião segue em 9 px (dívida do painel inteiro).

#### Suítes na conclusão (comparadas por nome com a base de 2026-09-24)

| Suíte | Testes | Falhas | Novas |
| --- | --- | --- | --- |
| Minerador (`tests/minerador-*`) | 1051 | 28 (base) | 0 |
| `test:arquiteto` | 2354 | 2 (base) | 0 |
| `test:arquiteto:servidor` | 52 | 0 | 0 |
| `test:arquiteto:lentes` | 31 | 0 | 0 |
| `test:arquiteto-backup-roundtrip` | 8 | 0 | 0 |
| `test:radar` | 2685 | 0 | 0 |
| `test:redator` | 358 | 0 | 0 |
| `test:redator:mcp` | 117 | 0 | 0 |
| `test:redator:dom` | 19 | 0 | 0 |
| `test:editorial` | 174 | 4 (base) | 0 |
| `test:editorial:dom` | 12 | 0 | 0 |
| Integrações | 69 | 1 (antiga) | 0 |
| `test:authz`, `test:operational`, `test:visual-system` | 33, 51, 28 | 2, 10, 5 (base) | 0 |
| `test:marca`, `test:serp-cache` | 106, 34 | 0 | 0 |

`tsc --noEmit` sem erros e `git diff --check` limpo.

**Nada disso é homologação.** O roteiro de validação na tela das fatias F2·B, F3 e F4 é do usuário, depois do deploy.

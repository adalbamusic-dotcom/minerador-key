# Spec — Minerador

## Contrato canônico atual — 2026-08-27

DeepSeek é o provider canônico de IA do Minerador para as operações que usam
R5/R6; o modelo, o modo de raciocínio e o orçamento continuam decisões da
capability/operação. JSON Output, `JSON.parse`, validação Zod, preservação do
estado anterior em erro e zero fallback OpenRouter são regras permanentes.

DataForSEO é a infraestrutura compartilhada para allintitle, KD e
compatibilidade SERP. OpenRouter e Serper permanecem somente como histórico,
fixtures ou provenance legível; não são provider ativo, fallback ou nova
chamada. O status remoto de Connections e a homologação real são estado
operacional e devem ser lidos em
[`estado-atual.md`](estado-atual.md), sem inferência a partir desta spec.

## Histórico de implementação local da Fase 2 — 2026-08-19

O cutover local do runtime de IA foi implementado: novas operações resolvem
somente DeepSeek por Connection de Plataforma, com `deepseek-v4-pro` como
modelo inicial, JSON mode e validação local independente do provider. R5
preserva suas três fases, métricas imutáveis, progresso, Usage e o estado
anterior em falha; o modo Thinking é uma decisão da operação/capability e não
uma política global.

OpenRouter não é provider ativo, fallback, alternativa de seleção ou health
check. Usage, Connections e diagnósticos históricos permanecem legíveis. A
Connection/secret remoto DeepSeek, o health check real e o smoke autenticado
continuam não configurados/não executados; portanto este estado é
`DEEPSEEK_LOCAL_CUTOVER = PASS`, não homologação real.

Na Fase 3A, a configuração operacional foi implementada localmente em
`/admin?tab=integracoes`: API Key password obrigatória, endpoint
`https://api.deepseek.com` e modelo `deepseek-v4-pro` somente leitura. O
writer administrativo reutiliza a Connection global equivalente, usa o Secret
Store/Vault e só confirma sucesso após readback sem segredo. Salvar não executa
health check; provider, Connection, segredo, health check e smoke reais ainda
aguardam ação manual autorizada.

## Regra permanente do R5 — leitura semântica independente antes da comparação — 2026-08-21

> **REVOGADA EM 2026-09-18.** O R5 não existe mais no Minerador. O
> orquestrador, as três fases, o cliente DeepSeek do R5, o aviso de execução
> e as rotas `/api/process-intent-niche`, `/api/analyze`, `/api/clusterize` e
> `/api/generate-briefing` foram removidos por estarem **sem chamador**: os
> handlers `handleBatchAnalyze` e `handleBatchSemanticReview` já não eram
> acionados por nenhum botão, o painel já forçava `aiReview = null` e nenhuma
> das 103 keywords do banco carregava payload `ai_review`. A ação `IA` da
> barra do Processador é, e já era, a Apresentação Contextual.
>
> O texto abaixo permanece como registro do contrato que vigorou até essa
> data. Não descreve comportamento atual.

O R5 deve formar uma interpretação independente da keyword original antes de
consultar a interpretação da Lógica. A keyword original é o objeto primário
(`R5_PRIMARY_OBJECT = RAW_KEYWORD`); os valores da Lógica são hipóteses
produzidas por outro processador, não verdades a repetir.

A ordem canônica é:
`rawKeyword → interpretação independente → sinais semânticos → comparação com Lógica → evidências externas → delta real → proposta/concordância → revisão humana`.

Na Phase 1, `rawKeyword` é recebido explicitamente. A revisão identifica,
quando aplicável, entidade, modificadores, ação, problema, necessidade,
localidade, comparação, sinal comercial, audiência, resultado desejado, tipo
de busca, interpretações possíveis e ambiguidade. Somente depois compara esses
sinais com `logicHypothesis`. Nomes de técnica/produto e linguagem de
possibilidade não promovem BOFU sem sinal explícito na keyword.

A evidência segue a prioridade `keyword → modificadores → estrutura semântica → evidência externa compatível → heurística`. Volume, Resultado, KGR e KD
não substituem significado semântico. A Phase 2 só registra evidência externa
quando ela altera, reforça ou enfraquece a interpretação; a Phase 3 sintetiza
leitura independente, Lógica e evidência externa sem apagar a primeira leitura.

Uma divergência só chega ao R6/R6.1 quando há mudança real, evidência
identificável, justificativa específica e interpretação semanticamente
superior. Se isso não puder ser demonstrado, a IA deve concordar ou manter a
ambiguidade. A IA propõe; o humano decide; somente depois de persistência e
readback existe novo snapshot canônico. Volume, Resultado, CPC, KD, KGR,
timestamps, targeting, URL, canonical e `brandId` permanecem fatos imutáveis.

Esta regra é permanente do contrato R5, não uma otimização temporária de
prompt. A leitura intermediária não cria campos de banco; mudanças permanentes
no comportamento do R5 devem atualizar esta seção da spec.

## Regra permanente do R6 — divergência real separada de decisão pendente — 2026-08-21

> **Adendo 2026-09-18.** Com o R5 removido, `CORREÇÕES PROPOSTAS` deixou de
> ter fonte: não existe mais sugestão de IA para divergir da Lógica. O que
> permanece vivo desta regra é a outra metade — campo estratégico sem leitura
> consolidada é `DECISÃO PENDENTE`, com ação humana explícita. O read-model
> que renderiza divergências ainda existe no código e sai no corte da
> Apresentação Contextual — **o que aconteceu em 2026-09-18**. Hoje a Revisão
> Humana tem só decisões pendentes e a aplicabilidade do KGR.
> Apresentação Contextual.

`CORREÇÕES PROPOSTAS` é reservado a uma divergência semântica acionável: valor
atual diferente de sugestão concreta, evidência suficiente e delta aceito pelo
Value Gate. Um campo estratégico ainda sem leitura consolidada (`Intenção`,
`Nicho` ou `Funil`) não é uma correção e não deve ser exibido como
`Valor lógico: Não informado → Sugestão IA: Não informado`.

Esses campos pertencem a `DECISÕES PENDENTES` ou `AMBIGUIDADES PENDENTES`, com
ação humana explícita para confirmar desconhecido ou editar. O mapeamento é
visual/read-model do R6; não inventa uma sugestão da IA, não altera o R5 e não
cria campo ou estado persistido novo. Concordâncias ficam compactadas e
recolhidas por padrão, preservando a comparação individual para auditoria.

Esta separação vale também para keywords em que a execução R5 concluiu sem
correções: zero divergências é um resultado válido, enquanto a confirmação
humana de um campo estratégico ausente continua sendo uma decisão pendente
independente.

## Histórico — adendo arquitetônico da Fase 1 — OpenRouter → DeepSeek — 2026-08-19

No snapshot da Fase 1, o provider canônico de IA previsto era a DeepSeek
Official API, em uma única Connection `platform`, com modelo explícito
`deepseek-v4-pro`, sem fallback, roteamento paralelo ou troca automática. Esse
target foi implementado localmente na Fase 2; o registro abaixo permanece como
evidência histórica da decisão, do mapa de consumidores e do escopo original.

## Histórico — diagnóstico sanitizado do R5 pré-cutover — 2026-08-19

Falhas de revisão semântica R5 devem devolver ao diagnóstico operacional,
quando a resposta do provider existir, o modelo solicitado/retornado, o motivo
de encerramento normalizado e nativo, o parâmetro/limite real de tokens,
usage, reasoning tokens, presença/tamanho de conteúdo, modo de saída resolvido
e metadados de roteamento sanitizados. O payload completo, prompt, reasoning,
headers e credencial nunca são expostos. O aviso do bulk deve preservar esse
diagnóstico no `copyPayload` para o smoke autenticado; ausência de diagnóstico
na resposta significa falha anterior ao envelope do provider.

O adapter não troca modelo/provider, não acrescenta retry/fallback e não
altera o orçamento antes da confirmação por provider real. A condição
`AI_PROVIDER_RESPONSE_TRUNCATED` só é válida para `finish_reason` ou
`native_finish_reason` que represente encerramento por limite/incompleto.

## Adendo vigente — KD como evidência DataForSEO — 2026-08-19

O Processador pode obter `keyword_difficulty` pelo DataForSEO Labs Keyword Overview durante a ação existente de Resultados. KD é métrica SEO complementar, somente leitura, sem thresholds, classificação editorial, aprovação automática ou alteração de KGR, decisão humana e status final. O valor deve permanecer separado da intenção canônica e das métricas Google Ads; a IA pode recebê-lo como evidência, mas não pode alterá-lo. Snapshots importados da Discovery permanecem não validados até uma medição oficial do Processador. A persistência é aditiva no JSONB e a proveniência do provider deve ser preservada. As passagens históricas abaixo que descrevem KD como futuro referem-se ao estado anterior a este adendo.

## Adendo vigente — filtros SEO da Descoberta — 2026-08-19

Na Descoberta, `Resultado` e `KD` são filtros locais de segunda etapa, aplicados somente depois que as candidatas Google Ads existem e sobre evidências DataForSEO já disponíveis no read-model. Cada filtro aceita mínimo/máximo numérico; zero é válido e ausência (`null`) não é convertida em zero. Quando um intervalo está ativo, candidatas sem a medição correspondente ficam fora. Alterar, limpar, abrir, ordenar ou selecionar filtros não inicia chamada paga. O enriquecimento continua sendo a ação explícita existente de `dataforseo/allintitle`, que também obtém Keyword Overview/KD; Google Ads continua sendo a fonte de descoberta, volume e CPC. Snapshots da Descoberta permanecem snapshots e o Processador continua responsável pela revalidação oficial.

## Arquitetura aprovada de providers — plataforma, agência e marca

`brand_id` permanece o único tenant de dados do Minerador. Agência é escopo operacional separado: pode administrar conexões de providers e consumo de várias marcas vinculadas, mas nunca autoriza leitura, escrita ou fallback entre seus dados. Google Ads evolui para conexão técnica global server-side; DataForSEO evolui para conexão operacional por agência; os dois contratos devem resolver marca, autorização, agência e provider no servidor antes de qualquer chamada externa.

O estado vigente de integração consolidado posteriormente é: Google Ads como
infraestrutura fixa da Plataforma, DataForSEO como capability compartilhada de
SERP/orgânico e DeepSeek como IA canônica. O Radar consome a infraestrutura SERP
compartilhada e não possui provider próprio; coleta autenticada, persistência e
prova de ausência do provider SERP legado continuam gates separados. Não há
fallback silencioso entre agência, provider ou marca.

## Regra vigente — Extensão Chrome removida — 2026-08-04

A Extensão Chrome não faz parte da aplicação. Não deve existir bridge, background, script injetado, fila em `chrome.storage`, listener `window.postMessage` exclusivo, notificação Chrome ou instrução de `chrome://extensions` como dependência produtiva.

As ações explícitas de medição allintitle em Descobrir Keywords e Processar Keywords usam o provider DataForSEO server-side. A consulta é `allintitle:"<keyword>"`; o total operacional é exclusivamente `se_results_count`. `items_count`, quantidade de itens e `organic.length` não são totais válidos; zero só é aceito quando explícito.

Sem credenciais DataForSEO, a ação retorna configuração ausente sem chamada paga. Colunas e valores allintitle já persistidos continuam visíveis; falhas de medição não apagam dados, não alteram `measured_at`, não alteram KGR e não substituem valores atuais.

Google Ads, DataForSEO, importação compartilhada, Descoberta, Processador,
métricas atuais, histórico e KGR permanecem ativos. DataForSEO allintitle e a
SERP compartilhada são operações distintas; o Radar não recebe autorização ou
quota própria. A falha de medição preserva integralmente o valor anterior e o
KGR é recalculado após métricas confirmadas. Referências antigas ao provider
SERP legado são históricas e não representam o contrato vigente.

As seções históricas que mencionam a Extensão descrevem decisões e implementações anteriores; esta regra tem precedência para o comportamento atual.

### Contrato vigente do allintitle DataForSEO

- Endpoint server-side: `POST /v3/serp/google/organic/live/regular`.
- Payload mínimo: consulta `allintitle:"<keyword>"`, localidade DataForSEO resolvida, idioma, `desktop`, `depth = 10` e `tag = operationRequestId`.
- Provider/version: `dataforseo` / `v3`; custo fica somente na auditoria server-side.
- Escopo operacional: Brasil e português no primeiro MVP. Resource names estaduais da Google Ads não são enviados diretamente à DataForSEO e não há soma automática de UFs.
- Keywords oficiais e candidatas usam a mesma integração; candidatas importadas refletem a keyword oficial vinculada.
- A ação é explícita, não roda ao abrir, selecionar, filtrar ou ordenar e bloqueia duplicação pelo `operationRequestId`.

O Minerador qualifica a keyword e fornece, quando disponíveis, classificação KGR/não KGR/candidata/desconhecida, score, volume, resultados, intenção, confiança, origem, publicação, URL, slug, canonical e evidências. O Arquiteto não recalcula esses dados nem os transforma automaticamente em tipo de unidade ou perfil SERP; usa-os como origem para decisões editoriais humanas.

## Regra compartilhada de qualificação

O Minerador é a autoridade para volume, resultados, intenção, KeywordDNA e KGR. Evidência recebida do Site é aditiva, brand-scoped e não confirmada; novas keywords entram como `bruto` até ação explícita de qualificação. O Minerador não forma ArticleDNA nem decide a hierarquia do silo.

### Funil na qualificação

O Funil é uma dimensão estratégica opcional da qualificação da keyword, com valores restritos a `TOFU`, `MOFU` e `BOFU`. A proposta explícita é persistida aditivamente em `analise_semantica.funnel`, acompanhada, quando disponível, por `funnel_source`, `funnel_confidence`, `funnel_review_required` e `funnel_evidence`; não há coluna dedicada nem migration nova.

`analise_semantica.extension_import.funnelHints` permanece evidência de origem da Extensão e nunca equivale a aprovação. A qualificação considera texto, intenção, sinais comerciais/informativos, etapa da jornada, nicho, localidade e hints, sem usar volume, resultados ou KGR como classificador isolado. Conflitos entre hint e proposta exigem revisão humana; decisões humanas identificadas no metadado são preservadas.

A qualificação de intenção, Funil, nicho, viés e KeywordDNA ocorre somente por ação explícita sobre keywords selecionadas. O carregamento da tela não preenche nem persiste Funil ou KeywordDNA.
## 1. Propósito
Importar, organizar e qualificar keywords de uma marca.
## 2. Responsabilidades
Listas/planilhas, filtros, KGR, status, seleção, histórico, exportação e visualizações. **Verificado no código.**
## 3. Fora de responsabilidade
Não aprova arquitetura editorial nem publica conteúdo.
## 4. Entidades
Lista KGR, keyword, briefing e KeywordDNA.
## 5. Jornada
Usuário abre `/minerador`, carrega listas e keywords, filtra/edita/importa e exporta seleção.
## 6. Regras de negócio
Keywords são escopadas por marca/lista; seleção é parcial e não decide renderização.
## 7. Estados
Carregando Supabase, lista ativa, filtros, seleção, edição, importação e erro.
## 8. Ações
Importar planilha/manual, criar lista, editar, analisar, calcular volume/KGR, exportar e excluir conforme UI.
## 9. Entradas
CSV/copiar-colar, lista, marca e APIs de análise/volume.
## 10. Saídas
Keywords persistidas, dados de KGR/status e exportações.
## 11. Contratos com outros módulos
Fornece keywords para Arquiteto; a transferência completa ainda requer confirmação ponta a ponta. Quando disponíveis, a carga pode trazer aditivamente relação keyword↔URL, evidência de URL/canonical/slug, situação arquitetural e designação/vínculo KGR. Esses campos são evidência de entrada; a decisão de agrupamento e confirmação arquitetural continua no Arquiteto.
## 12. Proteções
Escopo de marca, confirmação para ação destrutiva e guardas de publicado quando aplicáveis. Consultas browser exigem sessão NextAuth autenticada e um JWT Supabase atual, validado com margem de 60 segundos; o cliente usa `accessToken` dinâmico e nunca fallback anon ou `service_role`.
## 13. Casos de borda
Supabase indisponível, lista sem keywords, sessão ausente e importação duplicada. A sessão de dados usa resultado estruturado e códigos seguros (`NEXTAUTH_SESSION_MISSING`, `SUPABASE_GOOGLE_EXCHANGE_FAILED`, `SUPABASE_ACCESS_TOKEN_MISSING`, `SUPABASE_TOKEN_INVALID_CLAIMS`, `SUPABASE_TOKEN_EXPIRED`, `SUPABASE_TOKEN_REFRESH_FAILED`); somente expiração efetiva ou falha de refresh após vencimento pode ser apresentada como sessão expirada.
## 14. Arquitetura técnica atual aprovada
Wrapper de rota em `app/(brand)/[brandRef]/minerador/page.tsx` e implementação funcional em `modules/minerador/minerador-workspace.tsx`, com Supabase browser autenticado e APIs auxiliares.
## 15. Critérios de aceite
Importar, filtrar, selecionar e exportar não misturam marcas e retornam confirmação de persistência.
## 16. Descoberta persistente — Fase 4 aprovada

`/{brandRef}/minerador/descobrir` persiste cada execução concluída e todas as candidatas normalizadas em entidades próprias e tenantizadas de descoberta. A tabela da Descoberta mostra somente candidatas aprovadas pelos filtros; candidatas filtradas permanecem como histórico e não são inseridas em `keywords_kgr` automaticamente.

A mesma `brand_id + operation_request_id` é idempotente. Após recarregar a rota, a última execução concluída ou parcial pode ser restaurada sem nova chamada ao Google Ads; o rascunho da próxima pesquisa e a organização/seleção local continuam independentes do snapshot executado. Falhas de provider ou persistência preservam a última pesquisa válida e não transformam ausência em zero.

**Exceção da Pesquisa por Assunto — emenda de 2026-09-24** ([SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), F1b.5). O modo **Por Assunto** do Descobrir **não** persiste execução nem candidatas: não grava run, candidata, métrica atual nem histórico, e não chama as tabelas nem as RPCs da Descoberta. O resultado volta ao navegador e fica numa lista local própria (IndexedDB `minerador-pesquisa-assunto`, por ator e marca), que é estado de apresentação e recuperação, nunca canônico. A lista vale 30 dias, com no máximo 10 buscas por ator e marca; a vencida e a mais antiga saem sozinhas, só no próprio escopo (Q12, autorizada pelo dono). Na pesquisa, o banco recebe só o ledger de uso e a SERP da frase no cache da marca; no envio, só as keywords importadas. Os outros modos seguem esta seção até a [SDD da Descoberta temporária](propostas/sdd-descoberta-temporaria-local-2026-09-23.md) ser decidida.

## 17. Fora do escopo atual
Importação da Descoberta ao Processador, exclusão/retenção de histórico e execução remota da migration.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/minerador/page.tsx`, `app/api/mine`, `volume`, `analyze`, `clusterize`.
## 18. Arquivos compartilhados consumidos
`components/brand-context.tsx`, Supabase e contratos de Arquiteto.
## 19. Arquivos proibidos sem autorização
Migrations, pipeline editorial compartilhado e módulos seguintes.
## 20. Aplicabilidade KGR e KeywordDNA

## Tenant canonico de `keywords_kgr`

Depois da migration 0005, `keywords_kgr.brand_id` e obrigatorio e e a fonte de verdade do tenant, inclusive quando `lista_id` e nulo. Toda leitura do Minerador filtra a marca ativa; toda criacao envia o `brand_id` resolvido pelo contexto de marca; toda atualizacao ou exclusao restringe o registro ao mesmo tenant. Quando `lista_id` for informado ou alterado, a lista de destino deve pertencer a marca ativa por `listas_kgr.marca_id`. O consumidor nao possui fallback para schema pre-0005.

`lista_id` continua nullable e a FK canônica para `listas_kgr.id` é `ON DELETE RESTRICT`. A exclusão de uma lista não pode apagar keywords; a keyword deve ser movida ou permanecer em `Keywords não agrupadas`.

`kgr_aplicabilidade` possui tres estados explicitos: `applicable`, `not_applicable` e `pending`. A decisao e humana e fica registrada separadamente de `volume_search`, `results_allintitle` e `kgr_score`; nenhum desses valores, nem a intencao comercial, infere aplicabilidade.

`kgr_decisao` exibe `SIM`, `NAO` ou `PENDENTE`, com origem, ator, data, versao, justificativa opcional e historico das decisoes explicitas anteriores. O Minerador nao transforma essa decisao em `kgrIdentity` ou em confirmacao arquitetural do Arquiteto.

A medicao e classificada independentemente como `with_score`, `without_data` ou `invalid`. Filtros, ordenacao e exportacao mantem aplicabilidade e medicao em colunas distintas; `NAO` nunca e exportado como pontuacao numerica.

## 21. Site/Sitemap e briefing

A conferencia Site/Sitemap permanece preview-first e exige confirmacao explicita persistida. Depois da confirmacao, a evidencia consolida a URL de origem, URL resolvida, canonical declarado, situacao de publicacao e o silo existente escolhido pelo usuario (`lista_id`/`siloId`), sem criar silo, slug ou identidade publicada.

O Minerador nao gera nem edita briefing de silo. Briefings e suas tabelas/rotas permanecem sob os consumidores proprietarios existentes; o Minerador conserva apenas a associacao de silo e a qualificacao de keywords.
## 22. Apresentacao e estabilidade - Fase B.1

Intencao nao possui edicao por linha. A coluna KGR mostra o score tecnico (ou o estado da medicao quando nao ha score) e, abaixo, o seletor da decisao humana de aplicabilidade (`Pendente`, `Aplicavel`, `Nao aplicavel`), o mesmo da Revisao Humana e com o mesmo contrato de persistencia, readback e historico. A decisao tambem pode ser aplicada em lote sobre a selecao pela barra inferior, ao lado do Status; keywords ja na decisao alvo nao sao reescritas e keywords com revisao em edicao ficam de fora ate a edicao ser concluida ou cancelada. A decisao nunca altera score, Volume, Resultado nem status editorial, e a nao aplicabilidade preserva as metricas. A conclusao da Revisao Humana tambem esta disponivel em lote na barra inferior, entre o seletor de KGR e o Status, com o mesmo contrato da conclusao individual: defaults conservadores para itens sem decisao, Aplicabilidade do KGR obrigatoria quando o calculo e possivel, revisoes ja concluidas e em edicao ficam de fora. Concluir continua nao sendo gate de status, aprovacao ou handoff (adendo de 2026-08-29). Regra revisada em 2026-09-03; o texto anterior (tabela informativa, decisao KGR somente em massa por `Aprovar como KGR`/`Marcar nao aplicavel`) esta superado.

Os filtros ficam no painel recolhivel `Organizar`, com contador de filtros ativos e limpeza explicita. Mutations locais incorporam somente registros afetados e preservam busca, filtros, ordenacao, scroll, linha expandida e selecao quando ainda valida. `Conferir com o site` pertence a barra inferior da selecao e opera somente sobre keywords selecionadas.

A taxonomia apresentada e retrocompativel: Informativa, Comercial investigativa, Transacional, Navegacional, Local, Mista e Pendente/nao classificada. Valores legados sao normalizados na apresentacao sem reescrita em massa durante a hidratacao.

## 23. Qualificacao de volume sem perda de metadados - Fase B.2
A qualificacao somente persiste uma medicao de volume quando a resposta do provedor e valida e vinculada a uma keyword solicitada. Resposta invalida, erro do provedor ou keyword ausente nao grava `null`, nao altera `volume_source` e nao substitui `volume_search`, `results_allintitle` ou `kgr_score` existentes.
 `/api/volume` normaliza respostas para um contrato interno minimo (keyword + volume), rejeita endpoint RapidAPI de auditoria de site e permanece server-side. A integracao do provedor de volume e preparada por contrato e nao e considerada validada sem chamada externa autorizada.

## 24. Google Keyword Insight - Fase B.3
`/api/volume` usa `GET /keysuggest` com `keyword`, `location=BR` e `lang=pt`. A resposta real observada e um array de sugestoes; somente o item com `text` normalizado igual a keyword solicitada pode produzir medicao. Os campos de competencia, bids e trend sao metadados de resposta e nao substituem `results_allintitle`.
 Cada item retornado ao front possui status `success`, `not_found` ou `error`. O front persiste somente volume e `volume_source`, recalculando KGR quando houver resultado existente; nenhum erro ou ausencia persiste `null`.

## 25. Google Keyword Trending Insight - bloqueio de volume - Fase B.4
`/related-queries` retorna um envelope com `meta.keyword` e listas `data.top`/`data.rising` de consultas relacionadas. Os campos `query` e `value` representam consultas e indices de tendencia; nao sao medicao mensal da keyword e nunca podem preencher `volume_search`.
Quando `meta.keyword` nao corresponde a solicitacao, o normalizador retorna `not_found`. Quando a consulta existe mas nao ha campo de volume, retorna `error`, impedindo persistencia e recalculo de KGR.

## 26. Keyword Magic Tool - normalizacao pendente de contrato de requisicao - Fase B.5
O payload observado possui `keyword_ideas`, com a keyword em `keyword` e o volume mensal em `search volume`. Apenas uma correspondencia normalizada exata pode retornar `success`; ausencia da keyword retorna `not_found` e volume ausente, invalido ou negativo retorna `error`.

`Keyword Difficulty %`, `Keyword Difficulty Label`, `Low_CPC`, `High_CPC` e `Trend` sao metadados observados do provedor e nao alteram `results_allintitle`, KGR ou o contrato interno minimo nesta fase. O metodo e os parametros do endpoint `searchby-country-url` nao foram fornecidos no payload; portanto a rota `/api/volume` continua sem adotar essa configuracao ate que o contrato de requisicao seja confirmado.

## 27. SEO Keyword Research - provedor ativo de volume - Fase B.6
`/api/volume` usa `GET /keyword-research?keyword=<keyword>&country=br` no host `seo-keyword-research8.p.rapidapi.com`. O normalizador aceita somente `result[]` com `keyword` normalizada igual a solicitacao e usa `avg_monthly_searches` como volume; sugestoes relacionadas retornam `not_found`.

Os metadados de CPC, competencia, historico mensal, intencao e recomendacoes nao alteram o contrato interno minimo. O provedor foi confirmado uma vez para `country=br`; o payload nao devolve a localizacao, portanto a medicao e tratada como referente ao pais solicitado. Falhas, schema invalido e ausencia de match nao persistem `null`, nao alteram `results_allintitle` e nao recalculam KGR.

## 28. Hidratação e barra operacional - Fase B.3 complementar
`results_allintitle` continua sendo uma medicao historica ja persistida; esta fase nao cria rota, API ou provedor para coletar resultados. A qualificacao atualiza somente volume valido e recalcula KGR quando `results_allintitle` existente permitir o calculo.

A tabela deriva diretamente de `keywords`, listas, filtros e ordenacao por calculo puro memoizado. `Organizar` controla somente a visibilidade do painel: nunca participa da derivacao das linhas. Sem visualizacao salva valida, `Status` inicia em `Todos`; filtros e selecao nao alteram a colecao original nem decidem renderizacao.

Ha apenas uma barra operacional inferior para a selecao, com contador integrado e decisao KGR unica (`Aprovar como KGR` ou `Marcar nao aplicavel`).

## 29. Última organização local — Fase B.4

A última organização do Minerador usa a chave local existente `minerador-pro:last-view:<usuário>:<marca>:minerador` e é restaurada automaticamente depois de resolver usuário, marca e coleção local. A leitura é exclusiva do Minerador e não altera o componente compartilhado de visualizações.

Preferências legadas reconhecidas são normalizadas; JSON inválido, valores desconhecidos e silo inexistente são ignorados sem limpeza de armazenamento. A primeira gravação não pode sobrescrever uma preferência ainda não aplicada. O botão apresenta os nomes dos critérios ativos (por exemplo, `Publicados`), e `Organizar` permanece somente como controle de visibilidade do painel.

## 30. Métricas independentes da aplicabilidade KGR

Volume e `results_allintitle` são métricas próprias da keyword: são coletados, preservados, exportados pelo Minerador e mantidos no registro de origem, independentemente de `kgrApplicability`. A aplicabilidade controla somente uso estratégico da fórmula, exibição da pontuação e aprovação humana.

O estado de medição deriva apenas das duas métricas: `without_data` (Sem medição), `partial` (Parcial), `complete` (Completa) ou `invalid` (Inválida). Uma pontuação KGR válida pode coexistir com decisão pendente; para `not_applicable`, a pontuação não é usada como classificação e a interface exibe `Não utilizada`, sem ocultar volume, resultados ou pendências.

## 31. Política da keyword principal publicada

`primary_keyword_policy` é metadado estratégico independente de publicação, workflow e KGR: `free` para não publicados, `locked` para publicado legado sem política e `reviewable` apenas por decisão humana explícita. Publicado sempre mantém marca, URL, slug e canonical; a decisão nunca altera a keyword atual.

Uma troca entre `locked` e `reviewable` preserva `primary_keyword_published_original`, principal atual, ator, data, versão, motivo opcional e histórico. O contrato aditivo do Arquiteto recebe política e contexto para reconhecimento, sem autorizar seleção ou substituição automática nesta fase.

## 32. Coleta de `results_allintitle` pela extensão

`results_allintitle` é coletado somente por ação explícita, em lote pequeno, pela extensão Chrome conectada à aba do Minerador via `activeTab`. A extensão é uma coletora de evidência: não grava no Supabase. Ela usa uma aba Google reutilizável, uma consulta por vez, intervalo conservador, parser com fallback e estados terminais `success`, `zero_results`, `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled`.

O Minerador mostra prévia e só persiste `success` numérico ou `zero_results` explicitamente comprovado. Falha, ausência, CAPTCHA, bloqueio e cancelamento preservam resultado anterior e nunca enviam `null`. A confirmação atualiza somente a keyword real da marca/silo ativo, registra fonte/data/lote/consulta no metadado existente e recalcula KGR apenas quando houver volume válido e a aplicabilidade não for `not_applicable`. Volume e resultados permanecem independentes.

## 33. Contrato autenticado da extensão e handshake v2

A extensão Chrome autentica chamadas específicas do Minerador com `Authorization: Bearer <supabase_access_token>`. O servidor valida o token pelo Supabase Auth, obtém o `sub` validado e resolve perfil, owner, memberships, estado da marca e capacidade do módulo pelos helpers canônicos. O popup não concede acesso por papel, email, `brandId` ou `brandRef` enviados pelo cliente e não consulta diretamente `marcas`, `perfis` ou `listas_kgr` para listar opções.

`GET /api/extensao/marcas` retorna somente `{ brandId, brandRef, name, isActive, capabilities }`; `GET /api/extensao/marcas/{brandId}/listas` valida novamente o bearer e retorna somente listas com `listas_kgr.marca_id` igual ao tenant autorizado. `brandRef` é uma referência opaca de rota; o popup nunca o converte em ID técnico.

O handshake v2 da extensão é liberado somente quando a aba está em `/{brandRef}/minerador`, a página confirma usuário autenticado e acesso autorizado, e `selectedBrandId === activeBrandId` e `selectedBrandRef === activeBrandRef`. Mineração, allintitle e persistência pela extensão exigem essa sessão transitória v2 por aba/marca; falhas não iniciam Google nem alteram métricas.

Uma marca é selecionada automaticamente; várias marcas exigem dropdown somente com a resposta autorizada; zero marcas ou erro bloqueiam operação e oferecem estado/retry visível. A última preferência local é apenas uma sugestão e sempre é revalidada pelo endpoint.

## 34. Correlacao do allintitle pela extensao

Cada operacao de allintitle recebe um `requestId` uma unica vez no workspace. O mesmo identificador percorre bridge, background, aba Google, reader e retorno ao Minerador; a extensao nao cria substituto. `batchId` identifica o lote operacional e permanece separado de `requestId`; um fluxo individual pode ser um lote de um item. Eventos de progresso, resultado, pausa, cancelamento e `batch_completed` carregam a correlacao raiz, a marca e os IDs reais das keywords.

O workspace aceita um retorno somente quando `requestId`, `batchId` ativo, `keywordId` individual e `brandId` conferem. Resposta sem `requestId` recebe `response_missing_request_id`; divergencia recebe `request_mismatch`; resposta de uma operacao anterior e ignorada como `stale_response`. Nenhum desses casos altera metricas ou apaga resultado anterior.

## 35. Coerencia entre volume e KGR

Volume zero somente e aceito como medicao quando o provedor retorna numericamente `0` para a keyword exata, com fonte e data registradas. Esse estado e `zero_confirmed` e invalida a pontuacao KGR atual: divisao por zero nunca e score.

Ausencia, `null`, string vazia, schema invalido, keyword divergente, sugestao relacionada e erro do provedor nao gravam zero nem alteram volume ou KGR anteriores. Quando volume e resultados mudam, o KGR e recalculado somente com volume maior que zero e, se nao houver base valida, a pontuacao atual e invalidada; o valor anterior permanece apenas no historico.

Registros com volume zero e KGR numerico so sao detectados como incompatibilidade quando o zero estiver explicitamente confirmado; sem fonte, data e correspondencia exata, o estado e `zero_unconfirmed` e aparece na previa diagnostica somente leitura. Nenhuma correcao em massa ocorre durante hidratacao; qualquer nova medicao continua dependendo de acao humana explicita.
## 36. Diagnóstico independente de volume e KGR

O estado diagnóstico de volume/KGR não transforma ausência de métrica em incompatibilidade. `measurement_pending` significa que volume, resultados allintitle ou score ainda não permitem uma conclusão; `zero_unconfirmed` significa volume zero sem evidência semântica atual de confirmação; `not_applicable` representa somente a decisão estratégica da aplicabilidade; e `inconsistent` é reservado a incompatibilidade comprovada com métricas numéricas atuais, ou a zero explicitamente confirmado coexistindo com score numérico.

A prévia diagnóstica exibe contagens derivadas por categoria: `Medição pendente`, `Volume zero sem confirmação`, `KGR não aplicável` e `Incompatibilidade comprovada`. Ela é somente leitura e não altera volume, `results_allintitle`, KGR, histórico ou qualquer registro persistido.

## 37. Ciclo de vida reinjetável da bridge

A bridge da extensão é uma instância versionada e descartável. Após reload da extensão, a nova injeção chama `dispose` na instância anterior, remove listeners e invalida operações pendentes antes de registrar os handlers nomeados. O background exige `bridge_ready` com `bridgeVersion`, `protocolVersion`, `instanceId`, `extensionVersion` e timestamp antes de enviar o ping do handshake v2.

Falhas de `chrome.runtime.lastError`, exceções síncronas e contexto invalidado retornam códigos específicos (`bridge_context_invalidated`, `bridge_not_ready` ou `bridge_version_mismatch`) e permitem nova injeção sem recarregar a página. O ACK continua exigindo requestId, usuário, marca, rota e acesso confirmados.
## 38. Qualificação simplificada e cálculo KGR

A ação `Qualificar volume (KGR calculado)` consulta somente o provedor de volume e recalcula `kgr_score` quando volume e `results_allintitle` permitem o cálculo. KGR é uma pontuação derivada; não é uma métrica medida por provedor. A medição de `results_allintitle` é uma ação explícita separada pela extensão, com confirmação humana própria.

Erros do provedor devem preservar os metadados existentes e permanecer visíveis com a keyword, status HTTP ou mensagem segura retornada pelo provedor quando disponível. A interface principal não exibe a auditoria classificatória de volume/KGR; ela permanece em código/testes e documentação para investigação técnica.

## 39. ACK estável da página

O listener de `minerador:extension-handshake-ping` permanece independente do estado do lote allintitle. A página responde positivamente quando usuário, marca, rota e sessão coincidem e responde negativamente com código estruturado quando consegue identificar acesso ausente ou marca divergente. O background aguarda a reinjeção, `bridge_ready` e o ACK dentro de uma janela operacional compatível com o despertar do service worker, sem alterar autenticação ou tenant.
## 40. Decisão KGR e limite externo de volume

Volume e `results_allintitle` são métricas independentes. A decisão humana de aplicabilidade não inicia coleta externa; quando aplicável, o KGR é calculado localmente com as duas métricas persistidas. A decisão não aplicável preserva as métricas e apenas retira o score da estratégia.

Se a RapidAPI responder HTTP 429, o Minerador informa somente `Não foi possível coletar volume.`. A rota encerra a coleta, não faz retry automático, não transforma a falha em zero e não altera nenhum registro ou metadado existente.

## 41. Persistência server-side de `results_allintitle` — aprovada em 2026-07-29

O allintitle continua sendo uma ação explícita da Extensão, mas sua execução é background-owned: o workspace entrega o lote por relay declarado, o background executa consultas sequenciais e envia cada resultado terminal ao endpoint autenticado `POST /api/extensao/marcas/{brandId}/keywords/resultados-allintitle`. O popup, a página e o estado `connected` não são requisitos para a continuidade do lote.

O endpoint deriva o ator da sessão bearer da Extensão, valida acesso ativo ao tenant canônico e confere cada `keywordId` em `keywords_kgr.brand_id`. `success` com inteiro não negativo e `zero_results` com `0` atualizam somente `results_allintitle`; `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled` preservam o valor anterior. Nenhum estado grava `null`, altera volume/KGR ou usa o endpoint de importação.

O payload exige `operationRequestId`, `batchId` e de 1 a 10 itens com `requestId`, `keywordId`, status, valor confirmado quando aplicável e `measuredAt`. A resposta é individual por keyword (`persisted`, `preserved`, `rejected` ou `failed`) e repetir a mesma atualização na mesma linha é idempotente em efeito. Não há migration, tabela nova ou alteração de RLS.

## 42. Seleção complementar por intervalo e arraste — 2026-07-29

A seleção da tabela preserva clique individual, Ctrl/Cmd para alternância não contígua e Shift para intervalo pela ordem visual atual de `filteredKeywords`. Ctrl/Cmd+Shift adiciona o intervalo sem limpar a seleção existente. A âncora `lastSelectionAnchorId` é local, não persistida remotamente e é redefinida quando sai do conjunto visível.

O arraste é complementar e atua somente nos controles de seleção. O gesto começa no estado inicial do checkbox, exige tolerância mínima de movimento, visita cada linha uma vez e aplica selecionar ou desmarcar até o botão ser solto. O cabeçalho atua somente nas linhas visíveis, mantém selecionadas ocultas e expõe estado misto acessível. Filtros, busca e ordenação não limpam a seleção existente.

## 43. Extração localizada do contador allintitle no Google

O leitor da Extensão procura primeiro os seletores semânticos conhecidos, incluindo `#result-stats` e `role=status`. Quando a página concluída não apresenta um contador nesses pontos, ele localiza e abre uma única vez o controle localizado como `Ferramentas`, `Tools` ou `Herramientas`, aguarda a estabilização do painel e consulta seus textos visíveis. A extração não usa a quantidade de cards orgânicos nem números sem a palavra `resultado`, `resultados`, `result` ou `results`.

O parser aceita contagens localizadas com separadores de milhar e ignora o tempo entre parênteses. `success` exige contagem positiva, `zero_results` exige contador zero ou indicação explícita de ausência, e a página com resultados orgânicos sem contador retorna `unavailable`, código `result_count_not_found` e estágio `google_result_extraction`. Esse estado preserva a métrica anterior e exibe que a consulta foi concluída, mas o contador não pôde ser identificado.

## 44. Ciclo de vida e reconciliação do lote allintitle

O background mantém um ponteiro efêmero `allintitle:activeOperationByBrand:{brandId}` somente para estados `queued`, `running`, `paused` ou `captcha_required`. Estados `completed`, `cancelled`, `failed`, `interrupted` e `orphaned` permanecem no histórico com resultados e progresso, mas nunca bloqueiam uma nova operação.

Ao iniciar o service worker, registros ativos sem executor vivo são marcados como `orphaned`, o ponteiro da marca é removido e a retomada passa a ser explícita. Uma operação viva retorna `allintitle_operation_active` no estágio `operation_guard`; uma operação órfã retorna `allintitle_operation_orphaned` no estágio `operation_reconciliation`. Cancelamento grava o estado terminal e libera a marca sem remover resultados persistidos.

## 45.1 Medição de volume por Google Ads

A ação explícita `Atualizar métricas` envia somente IDs e `operationRequestId` para a rota autenticada tenantizada do Minerador. Conta, MCC, idioma, geolocalização, rede, moeda e timezone são resolvidos no servidor pela conexão da marca. A consulta Google Ads preserva média mensal, série mensal, concorrência Ads, lances/CPC em micros, proveniência e versão.

Cada resultado válido é persistido como medição versionada antes de atualizar `volume_search`. Falha parcial, ausência, quota ou OAuth preservam valores anteriores e nunca convertem `null` em zero. Lotes técnicos de até 10.000 são particionados internamente em sequência. A Extensão não mede volume; endpoints RapidAPI de volume estão congelados e não fazem fallback.

## 47. Áreas Descobrir Keywords e Processar Keywords — MVP da Descoberta concluído

O Minerador terá duas áreas: `/{brandRef}/minerador/descobrir` para descoberta, filtros, seleção e importação explícita; e `/{brandRef}/minerador` como Processar Keywords, preservando a planilha atual, métricas, qualificação, KGR, decisão humana e envio ao Arquiteto.

Descoberta não é qualificação editorial. Google Ads Keyword Ideas é sua fonte canônica para volume, histórico, CPC e concorrência Ads; concorrência Ads nunca é usada como KD. Resultados, KD e SERP permanecem futuros e não bloqueiam o MVP. Candidatas só entram no Processador por ação humana explícita, tenantizada e idempotente, como Bruto, Keyword livre, sem lista artificial ou Silo/Categoria, com proveniência `discoveryRunId` preservada.

`DiscoveryRun` e `DiscoveryCandidate` são entidades server-side tenantizadas no fluxo vigente. A seleção, tabela e barra inferior reutilizam componentes extraídos por composição, preservando clique, Ctrl/Cmd, Shift, pintura e selecionar visíveis. Foram validados manualmente a rota, pesquisa nacional, targeting com uma, duas e sete UFs, filtro de volume, persistência, reload, preservação da última pesquisa válida em falha e importação explícita de candidata nova até o Processador.

A Extensão não é mais necessária para descobrir ou importar keywords. Ela permanece como executor produtivo de allintitle, agora consumido pelo Processador para keywords oficiais e pela Descoberta para candidatas, incluindo background, bridge, CAPTCHA, pausa, retomada e notificações. Não duplicar esse executor nem remover a Extensão enquanto o Processador ou a Descoberta dependerem dele.

**Modo Por Assunto — emenda de 2026-09-24** ([SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), F1b.1 a F1b.6). A partir de um Assunto escrito, ou de um Assunto declarado, o Descobrir busca as keywords que o sustentam. As fontes são o Google Ads com a frase e com a frase mais a página de destino aceita, e o DataForSEO Labs `related_keywords`, `keyword_ideas` e `ranked_keywords` (o que o topo da SERP da frase já ranqueia). Cada candidata guarda todas as origens. Regras:

- **Candidata só vem de provider.** Neste modo, a regra aparece na tela como "O Google Ads e o DataForSEO Labs devolvem as candidatas; o Minerador não fabrica termos." O DataForSEO Labs é outro provider, com base própria, e não é atribuído ao Google. Nenhum caminho de IA monta candidata. Os outros modos mantêm o texto de antes.
- **O Google Ads continua a fonte canônica de volume.** O `search_volume` do Labs aparece só numa coluna própria, **"Estimativa DataForSEO"**, e nunca vira volume: não preenche a coluna Volume nem o filtro "Com volume", e nunca é importado.
- **Nada é pago sem confirmar.** A pesquisa monta primeiro um plano, sem custo, e só executa depois de o humano confirmar o plano inteiro no diálogo de custo. O servidor recalcula o plano, confere a autorização e mantém um teto rígido de US$ 0,20 por pesquisa.
- **A SERP da frase segue a regra da plataforma:** cache primeiro, sempre nas 4 lentes, e o que é pago vai para o cache da marca.
- Os outros modos continuam só com keyword, na rota de hoje.

## 50. Fase 8 — métricas atuais e allintitle nas duas áreas — implementação autorizada localmente

O contrato estrutural desta fase foi implementado no checkout local. `minerador_discovery_candidate_current_metrics` representa a projeção operacional atual da candidata e `minerador_discovery_candidate_metric_history` preserva o histórico append-only; o snapshot da DiscoveryRun não é sobrescrito. A migration aditiva `0013_minerador_discovery_candidate_current_metrics.sql` ainda não foi executada.

O protocolo allintitle existente aceita `keywordId` para keywords oficiais e `candidateId` para candidatas. A Extensão permanece como executor único. Confirmados substituem os valores atuais somente após persistência; falhas preservam valores, data medida e KGR. Candidatas importadas mantêm `keyword_id` vinculado para refletir a mesma medição no Processador.

A regra permanente de métricas é de substituição confirmada: uma medição nova de allintitle, volume, histórico mensal, CPC, concorrência Ads ou targeting substitui o valor operacional atual somente depois da persistência confirmada. Provider, versão e `measured_at` também são atualizados, e o KGR é recalculado com os valores atuais. O valor anterior fica somente em histórico técnico/auditoria.

Falha, ausência, quota, CAPTCHA ou resposta não confirmada preserva integralmente os valores atuais, `measured_at` e KGR. Não se usa `null` para apagar, zero para representar ausência ou média entre medições. Em lote parcial, somente itens confirmados são substituídos.

A integração da Descoberta usa a persistência tenantizada de allintitle para `DiscoveryCandidate` e o contrato aditivo que aceita `candidateId` sem exigir `keywordId` oficial. A Extensão continua sendo o executor técnico único; Descoberta e Processador consomem o mesmo protocolo, sem duplicar leitor, parser, fila, CAPTCHA, pausa ou retomada.

Quando uma candidata possuir `imported_keyword_id`, a keyword oficial será a fonte atual compartilhada pelas duas áreas. A importação transferirá a medição confirmada e sua proveniência sem criar medição concorrente ou repetir automaticamente a consulta. A migration aditiva 0013 foi criada para essa lacuna e permanece pendente de aplicação manual; não foi executada nesta tarefa.

## 51. Bulk bar da Descoberta — triagem opcional e envio sem gate de métricas — 2026-08-19

A bulk bar da Descoberta representa triagem, não consolidação do KeywordDNA. Sua ordem canônica é `Atualizar métricas → Medir resultados → Enviar selecionadas ao Processador`, com os contadores de seleção à esquerda e `Limpar seleção` separado à direita. `Exportar` não faz parte desta barra; qualquer exportação autorizada em outro ponto da aplicação permanece independente.

`Atualizar métricas` continua sendo a ação explícita de Google Ads para volume, histórico, CPC e concorrência Ads. `Medir resultados` continua sendo a ação explícita de DataForSEO para Resultado/allintitle, KD e demais evidências SEO já suportadas. Nenhuma das duas ações é disparada por seleção, filtro ou envio.

O envio ao Processador é a ação principal e aceita a candidata com os dados disponíveis, mesmo sem volume atualizado, Resultado ou KD. Quando presentes, métricas, provider, timestamps e snapshots acompanham a proveniência existente. O Processador continua responsável por revalidar suas etapas oficiais antes da decisão final.

## 49. Nucleo compartilhado de importacao

Extensao e Descoberta devem chamar o mesmo servico server-side de importacao do Minerador. O nucleo normaliza com uma unica funcao neutra, deduplica dentro do lote, procura keywords somente na marca validada, preserva keywords existentes, cria novas como `bruto` com `lista_id = null` e devolve o `keywordId` oficial com resultado por item.

A Extensao preserva seu payload e contrato de resposta. A Descoberta acrescenta lote idempotente, vinculo `DiscoveryRun`/`DiscoveryCandidate`, snapshot de targeting/metricas/proveniencia e atualizacao do estado da candidata. Nenhuma origem pode duplicar a regra de normalizacao ou criar keywords por RPC especifica.

Keywords existentes recebem apenas evidencia aditiva e vinculo de origem; status, lista, silo, publicacao, KGR e decisoes humanas permanecem preservados. A RPC historica da Descoberta e seus patches SQL permanecem legados ate eventual remocao autorizada, sem novos consumidores produtivos e sem migration nova nesta fase.

**Import de Assunto por rota própria — emenda de 2026-09-24** ([SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), F1.3). No Processador, a lista marcada como **Assunto** vai para `POST /api/minerador/marcas/[brandId]/subjects/import`, com `requireTenantPermission(minerador, edit)` e a marca do caminho. O corpo não aceita marca, ator nem métrica, e o ator é o `auth.users.id` da sessão. O núcleo é a função irmã `importSubjectsWithCore`, no mesmo arquivo, com a mesma normalização. `importKeywordsWithCore`, `KeywordImportSource` e `/discovery/import` não mudam. A rota trabalha em duas etapas:

- **`preview`** não escreve e classifica cada linha: nova, existente sem Assunto, já Assunto (igual ou diferente), publicada ou inválida. Avisa quando há versão apagada restaurável.
- **`apply`** cria as novas como `bruto`, já declaradas (origem `import`), com a lista padrão da marca ou a da coluna. Nas existentes, declara **só** os ids que o humano marcou (`declareExistingIds`).

Regras do import:

- Frase existente nunca é declarada em silêncio.
- Já-Assunto com nota ou destino diferentes mantém o que está gravado; a troca é feita na Revisão Humana.
- Se o DNA atual de uma existente não foi lido, nada é gravado nela.
- A leitura é estreita: `id,keyword,status,lista_id` das vivas, paginadas; `analise_semantica` só das que casaram.
- A idempotência vem da deduplicação por marca e de `changed: false`. A trava por `importRequestId` vale só na mesma instância.
- Sem índice único no banco, dois envios simultâneos em instâncias diferentes ainda podem duplicar (Q8, no backlog).
- No Descobrir não há select, e tudo segue como keyword.

## 46. Elegibilidade por volume oficial

Google Ads é o provider canônico da elegibilidade mínima de demanda para keywords novas. O limiar operacional é `120` buscas mensais confirmadas.

- média oficial `>= 120`: `eligible` e pode seguir para qualificação;
- média oficial entre `0` e `119`: `below_threshold` e sai da fila de produção;
- resposta exata sem média mensal: `unavailable` e sai da fila de produção;
- sem medição: `pending`;
- falha técnica: `measurement_failed`, preservando volume, KGR e metadados anteriores.

O estado é aditivo em `analise_semantica.volume_eligibility`, com provider, versão, data, limiar e média retornada. Ele não reutiliza status editorial, não converte ausência em zero e não apaga keywords. A visualização operacional padrão mostra somente `eligible`; keywords publicadas continuam visíveis e estruturalmente protegidas.

## 48. Envio explícito de candidatas ao Processador

Descoberta e Processador são áreas distintas. A pesquisa, o reload, filtros, ordenação e seleção não importam candidatas automaticamente. A importação só ocorre pela ação humana `Enviar selecionadas ao Processador`.

O navegador envia apenas UUIDs técnicos de `DiscoveryCandidate` e um `importRequestId` UUID. O servidor resolve novamente a marca por `brandId`, o ator autenticado e todos os dados da candidata; texto, targeting, métricas ou proveniência enviados livremente pelo navegador não são aceitos como fonte.

O envio é seletivo, tenantizado, idempotente e rastreável. As candidatas precisam pertencer à marca ativa, estar em uma execução concluída, normalizada e aprovadas pelo motor de filtros. A mesma seleção com o mesmo `importRequestId` retorna o resultado consolidado sem duplicar; o mesmo identificador com outra seleção é recusado.

Uma candidata nova cria uma keyword no Processador como `bruto`, `Keyword livre`, sem lista, Silo/Categoria, Principal, KGR, intenção/funil definitivos ou envio automático ao Arquiteto. A intenção e o funil preliminares, targeting, métricas oficiais, provider/version, seed, relação, execução e timestamps permanecem como proveniência. Keywords existentes da mesma marca não são duplicadas nem têm decisões, publicação, lista, silo, métricas ou classificação humana sobrescritas; recebem apenas vínculo adicional de origem.

O lote de importação e os vínculos de origem são entidades server-side com RLS, restrições de tenant e resultado individual por candidata. A RPC histórica e os objetos SQL de `0010`, `0011` e `0012` permanecem documentados sem consumidor produtivo; o fluxo vigente usa o núcleo compartilhado de importação. A validação manual de candidata nova, persistência remota, defaults `bruto`/sem lista e aparecimento no Processador foi concluída. O Processador continua sendo aberto por `/{brandRef}/minerador`, sem redirecionamento automático.

**Envio da Pesquisa por Assunto — emenda de 2026-09-24** ([SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), F1b.7; Q10, Q11 e Q14). O modo Por Assunto não tem candidata no banco, então não há UUID a enviar. O envio usa a rota própria `POST /api/minerador/marcas/[brandId]/subject-discovery/import`, com a mesma permissão de criação de `/discovery/import`:

- a keyword chega como **entrada humana**, com a mesma confiança do CSV e da lista manual do Processador, e **sem nenhuma métrica**: o corpo recusa volume, CPC, resultados, estimativa, marca e ator;
- a proveniência fica em `analise_semantica.subject_discovery` (origens e evidência curta) com `provenanceVerified: false`, isto é, **não verificada**; ela não entra em `discovery_import`, e nenhum leitor de métrica a enxerga;
- o `subjectKeywordId` é o único dado usado como sinal e é validado no servidor: mesma marca, keyword viva e Assunto declarado;
- numa keyword existente, a proveniência só é gravada se ela **não** tiver registro de aprovação, com escrita condicionada, para nenhuma aprovada ir para Em revisão;
- a frase pesquisada só vira Assunto por marcação humana no envio, pela rota de import de Assuntos da §49;
- continuam valendo a ação humana explícita, a marca ativa, a idempotência por `importRequestId` e a criação como `bruto` sem lista.

## 45. Seleção livre e fila contínua de allintitle

Clique comum, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, seleção de visíveis e pintura são complementares tanto na tabela do Minerador quanto na prévia da Extensão. A pintura só inicia após deslocamento de 4px e não troca o cursor normal do checkbox; um gesto de pintura suprime somente o clique sintético dele próprio.

A seleção total não tem limite funcional. O background cria uma operação única por `operationRequestId`, reparte internamente em sublotes sequenciais de até 10 keywords e preserva `brandId`, resultados confirmados, zero explícito, pausas, cancelamento e reconciliação. Cada evento carrega o identificador da operação, `batchId` técnico, índice geral e índice de sublote; a prévia acompanha a operação e mostra cada resultado persistido sem esperar a conclusão total. Durante a execução, o marcador informa progresso e orienta manter o Chrome aberto.

## 52. Ciclo de vida canônico de exclusão de keywords — 2026-08-20

Keyword não publicada pode ser excluída definitivamente após o usuário digitar o nome exato da keyword, mesmo quando possui medições, proveniência, análise, KeywordDNA ou histórico próprio. A exclusão usa uma única operação transacional server-side, limpa dependências próprias de forma explícita e preserva referências compartilhadas e artefatos editoriais append-only.

Keyword publicada é identificada no servidor por publicação formal em `analise_semantica.site_origin` ou por linhagem real até `PublicationRecord`, com evidência técnica e confirmação canônica pelo nome exato. `status = 'publicado'` ou `published` sem vínculo formal é somente sinal legado não verificado e não ativa a janela de recuperação. DNA, ArticleDNA, workflow, handoff, métricas, análise ou status editorial isolados nunca ativam a janela.

A primeira remoção de uma keyword publicada grava `deleted_at` e `purge_after = deleted_at + 24 hours`, retira a linha da operação normal e a exibe em recuperação com tempo aproximado. O usuário pode restaurá-la antes do vencimento. Depois do vencimento, somente a operação server-side de purge pode destruí-la; a publicação, URL, canonical, versões, hashes, anotações e eventos downstream preservados não são apagados.

O contrato global compartilhado está implementado em `lib/lifecycle/`, com UI comum de confirmação/impacto/recuperação. A migration sucessora `supabase/migrations/0047_global_lifecycle_delete_recovery_purge.sql` foi aplicada no projeto canônico após preflight e post-verifier; o rollback permanece local. O smoke autenticado da UI, restore/purge reais e o pipeline novo completo ainda são pendentes.

## 53. Integridade da leitura lógica e confirmação humana do KeywordDNA — 2026-08-20

O Processo Lógico continua sendo a leitura determinística inicial, não a verdade semântica final. A decomposição reconhece relações como `a domicílio`, preserva a entidade central sem incorporar o modificador e usa sinais de serviço como `manicure` e `pedicure` para detectar o nicho quando houver evidência textual. A intenção externa do DataForSEO permanece uma evidência independente e nunca substitui a intenção canônica.

O read-model canônico continua sendo a única projeção consumida pela tabela, Perfil da Keyword, Revisão e Decisão. A leitura usa a proposta lógica, decisões humanas e valores humanos confirmados na precedência definida; não promove valores externos nem fabrica valor para campo ausente.

**Superado pelo adendo de 2026-08-29 (seção final): a revisão humana deixou de ser gate de aprovação, status ou handoff.** O texto abaixo descreve o estado anterior. O gate de revisão humana exigia, antes de `dna_revisao_humana = aprovado` e da transição para decisão final: revisão IA concluída, aplicabilidade do KGR tratada quando o cálculo é possível, toda divergência resolvida, todo enriquecimento tratado e confirmação explícita dos campos estratégicos sem evidência (`Intenção`, `Nicho` e `Funil`). A confirmação explícita pode manter o campo desconhecido; isso registra a decisão humana sem inventar um valor. Um marcador legado de revisão concluída, isoladamente, não libera o status.

Essa regra é aditiva em `analise_semantica.human_review` e usa os campos JSONB existentes. Não cria coluna, migration, provider ou etapa nova.

## 54. Consistência canônica, completude e reabertura da revisão — 2026-08-20

Tabela, Perfil da Keyword, Revisão Humana e Decisão devem consumir o mesmo read-model de uma keyword. A fronteira local é `resolveCanonicalKeywordSnapshot`, que reúne fatos atuais revalidados no Processador, leitura lógica, decisões humanas, maturidade, status editorial e vínculo de publicação sem promover snapshots importados da Descoberta a etapas validadas.

O snapshot separa o score técnico do KGR de sua aplicabilidade. Quando Volume e Resultado atuais permitem o cálculo, o score permanece visível mesmo que a aplicabilidade seja `Não aplicável`; a aplicabilidade não apaga nem altera Resultado, Volume ou KGR. CPC e KD continuam evidências dos providers canônicos, e a intenção externa do DataForSEO permanece independente da intenção canônica.

Intenção, Nicho e Funil possuem estado de completude separado do valor exibido: `resolved`, `confirmed_unknown` ou `unresolved`. Ausência não é convertida em valor inventado. `confirmed_unknown` é uma decisão humana válida e aparece como `Indeterminado`; `unresolved` mantém o campo em aberto no read-model e **não** impede aprovar o status final (adendo de 2026-08-29). A maturidade do DNA mede completude/confiabilidade do processo, não qualidade editorial da keyword.

Uma revisão concluída pode ser reaberta por `Revisar novamente`/`Editar revisão`. A reabertura cria uma cópia de trabalho local, permite editar decisões humanas, enriquecimentos, campos estratégicos e aplicabilidade do KGR, e não executa provider nem altera Volume, Resultado, CPC, KD ou score KGR. Cancelar descarta a cópia e preserva a última consolidação. Sem mudança substantiva não há nova versão artificial; mudança confirmada segue o mecanismo de persistência/histórico já existente.

Este contrato não altera engine lógico, Google Ads, DataForSEO, KGR, IA, APIs, schema ou migrations.

## 55. Preset protegido das colunas Resultados e Volume — 2026-08-20

As tabelas de Descobrir e Processar usam um preset de largura legível para as
colunas operacionais. `Resultados` começa com `128px` e mínimo de `115px`;
`Volume` começa com `120px` e mínimo de `105px`. Ambas são colunas protegidas
na projeção responsiva: as colunas flexíveis e secundárias cedem espaço antes
delas. Quando o viewport não comportar o conjunto mínimo, o shell da tabela
mantém sua rolagem horizontal legítima em vez de comprimir esses headers.

KGR, CPC e KD também recebem presets compactos (`88px`, `96px` e `70px` no
Processador), enquanto Silo/Categoria reduz sua largura padrão para liberar
espaço. O header de `Resultados` e `Volume` permanece em uma linha com seu
InfoHint e ordenação. O redimensionamento manual existente continua ativo,
respeitando os mínimos por coluna.

Não existe persistência de largura no contrato atual
(`COLUMN_WIDTH_PERSISTENCE_EXISTS = NO`); após F5 o estado inicial volta ao
novo preset. Nenhum dado, handler, provider, API, schema ou migration é
alterado por este ajuste.

## 56. Contrato rígido de processamento e estados de execução — 2026-08-20

O Processador somente exibe a conclusão verde de Conferir site, Lógica,
Volume, Resultados, IA ou Revisar quando o artefato atual é válido para os
inputs da keyword. Quando a operação exige persistência, a promoção depende de
persistência e readback canônicos; o retorno normal de um handler, isoladamente,
não é evidência de conclusão.

`resolveMineradorProcessState()` é a projeção compartilhada entre barra,
tabela e Perfil. Ela separa `attemptState` (`not_run`, `running`, `success`,
`failed`) de `artifactState` (`missing`, `current_valid`, `stale`, `invalid`).
Falhas de provider não limpam o último artefato válido; durante a tentativa e
após uma falha a UI não o promove como uma nova validação. A implementação usa
os metadados, hashes e medições existentes e não cria schema ou migration.

Lógica exige metadados atuais do motor; Volume e Resultados exigem medição
válida do respectivo provider e aceitam zero real sem convertê-lo em ausência;
KGR é automático e só é atual quando Volume e Resultado atuais permitem o
cálculo; IA exige as três fases, parse, schema, persistência, readback e hash
compatível; Revisar exige a revisão humana persistida para o mesmo hash da IA;
Conferir site somente conclui após confirmação persistida. Uma nova IA torna a
revisão humana anterior incompatível até nova consolidação.

Na R5 em três fases, a Phase 1 e a Phase 2 são resumos compactos limitados a
no máximo três itens por categoria, sem thresholds editoriais ou alteração de
números. Os tetos locais são `1100` tokens de conclusão para Phase 1 e Phase
2, e `600` para Phase 3. As três fases usam o mesmo envelope de confiabilidade:
uma chamada inicial e no máximo uma recuperação da própria fase, somente em
ação DeepSeek explicitamente iniciada pelo usuário. Truncamento recupera a
mesma fase; schema inválido só pode usar o reparo estrutural único da Phase 3.
Fases válidas nunca são reexecutadas por falha posterior. Tentativas, tokens,
modelo, fase, status, custo e identificadores de execução são registrados na
Usage/progresso. Não há fallback de provider ou modelo.

## 57. Convergência do pipeline e contrato obrigatório de saída — 2026-08-20

O Processo Lógico é independente da revisão R5. Cada execução lógica persiste,
no JSONB semântico existente, `logical_output_contract` versão `r1`. O
contrato cobre Intenção, Nicho, Funil e os demais campos lógicos do KeywordDNA;
cada campo precisa ser `value`, `explicit_unknown`, `ambiguous` ou `pending`.
Ausência silenciosa, `undefined`, path perdido ou valor inventado não satisfaz
o contrato.

`Lógica ✓` só é promovida depois de engine, contrato completo, persistência,
readback e freshness do input atuais. Uma reexecução calcula uma nova proposta
antes de substituir a atual; falha preserva o artefato válido anterior e não
promove a tentativa a verde.

Cada clique de processo possui `executionRequestId`. Notices, progresso,
tentativas e Usage carregam a correlação; estados verdes derivam do último
readback/execução válida, nunca de um notice antigo. A IA não cria silenciosamente
Intenção, Nicho ou Funil ausentes da Lógica.

## 58. Consolidação semântica do KeywordDNA — regra canônica e rollout front-first — 2026-08-28

O Minerador continua proprietário da qualificação individual da keyword. A Leitura Lógica é a primeira interpretação determinística; Google Ads expressa demanda; e a Qualificação Semântica fecha as dimensões independentes de **Intenção** e **Funil** quando houver evidência adequada. A Revisão Humana resolve somente as decisões humanas cabíveis. A Decisão reúne demanda, competição, KGR, semântica, revisão, status e proveniência.

Intenção e Funil são e permanecem eixos independentes. Funil não é derivado de Intenção, nem a intenção `Local` promove automaticamente `BOFU`. Após Lógica concluída, uma ausência semântica final é apresentada como `Indefinido`, nunca como `Pendente`.

A IA é revisora e fonte de enriquecimento contextual: não define nem vota a Intenção/Funil canônicos. Uma futura camada de plano de apresentação da keyword por IA também é contextual e não recebe autoridade semântica, editorial ou de status.

A futura SERP semântica explícita do Minerador é uma evidência individual e externa. Quando sua coleta, targeting e evidência forem válidos e conclusivos, ela fecha a Intenção e/ou o Funil da keyword. A atuação humana nesse caso é validar ou invalidar a evidência — por exemplo, query, targeting, coleta ou qualidade inválidos — e requisitar nova coleta; não substituir arbitrariamente uma SERP válida e conclusiva. Uma SERP inconclusiva não inventa valor canônico.

`Resultados`/allintitle e Keyword Overview DataForSEO continuam evidências quantitativas e não são, por si, essa qualificação semântica. KGR permanece um processo independente, derivado somente de Volume e Resultado. O card DataForSEO ter sido removido do Perfil é composição visual, não remoção de fatos, proveniência ou processo.

As três utilizações de SERP permanecem separadas: qualificação individual no Minerador, compatibilidade de formação no Arquiteto e investigação do artigo no Radar. O mesmo snapshot não é evidência independente em dois consumidores; uma SERP materialmente nova no Arquiteto apenas sinaliza revisão upstream, sem alterar o KeywordDNA. O handoff futuro deve entregar uma versão consolidada, imutável e referenciável do KeywordDNA; o Arquiteto lê Intenção/Funil upstream e não os reclassifica silenciosamente.

O front aprovado nesta etapa é somente uma cópia de trabalho: preview local e layout não equivalem a SERP real, consolidação persistida, versão imutável ou handoff real. O contrato estrutural, a persistência e o rollout correspondente continuam sujeitos à SDD e ao adendo específico.

## 59. IA do Minerador — Apresentação Contextual da keyword para a Marca — 2026-08-28

> **REVOGADA EM 2026-09-18.** Não existe mais IA no Minerador. A Apresentação
> Contextual, o processo `ai` e a rota `ia/brief-apresentacao` foram
> removidos: a camada não alimentava decisão nenhuma — o texto gerado ia
> apenas para um painel somente-leitura do Arquiteto, nunca para prompt,
> ArticleDNA, SiloDNA ou Redator. `MINERADOR_PROCESSES = 6`.
>
> Os 252 artifacts `keyword_contextual_presentation` **permanecem no banco**:
> `editorial_artifact_versions` é append-only por trigger, e o CHECK de
> `artifact_type` continua aceitando o tipo. O texto abaixo é registro do
> contrato que vigorou até essa data.

A IA do Minerador é uma camada **opcional** de **Apresentação Contextual da keyword para a Marca**. A pergunta operacional que ela responde é "Como esta Marca deve apresentar este tema?", nunca "Qual é a intenção desta busca?". Nenhum processo do Minerador depende da sua execução.

A apresentação pode consumir a keyword/tema original, o contexto autorizado da Marca, a Voz da Marca disponível, o BrandDNA aprovado quando existir e outros contextos editoriais autorizados conforme seus contratos forem disponibilizados. Contexto ausente é declarado como lacuna e nunca inventado.

A Voz da Marca é resolvida exclusivamente dentro da própria `brandId`. Nome, slug isolado, owner ou qualquer outra Brand não são fallback. Disponibilidade de uma Skill e aprovação editorial são conceitos distintos: uma Skill disponível para uso não é, por isso, uma Skill aprovada, e o lifecycle real da versão consumida é preservado na proveniência da execução.

O BrandDNA aprovado acrescenta contexto quando disponível. Sua ausência é registrada como lacuna, não impede o uso de uma Voz da Marca disponível e não autoriza fallback para `marcas.dna_diretrizes`.

O output canônico é `ContextualPresentation { text }`: orientação editorial compacta. Não é ArticleDNA, ContentPlan, ContentDocument, artigo pronto, post pronto nem roteiro pronto.

A camada não possui autoridade canônica: `AI_CAN_DEFINE_INTENT = NO`, `AI_CAN_DEFINE_FUNNEL = NO`, `AI_CAN_CLASSIFY_SERP = NO`, `AI_CAN_DECIDE_KGR = NO`, `AI_CAN_CHANGE_STATUS = NO`, `AI_CAN_CHANGE_ARCHITECTURE = NO`. A Apresentação Contextual não altera o KeywordDNA.

Volume, Resultados, KD, KGR, Intenção, Funil, SERP e status editorial não são insumos de elaboração desta camada; permanecem nos seus contratos próprios do Minerador.

O semantic review R5 deixou de ser o papel operacional do processo IA. Artefatos históricos podem ser preservados, mas o fluxo corrente não produz concordâncias IA × Lógica, divergências R5, enriquecimentos R5 nem decisões de Intenção/Funil originadas pela IA.

A IA é acionada somente por ação explícita do usuário no processo IA da barra canônica. Não há execução automática em mount, abertura do Perfil, F5 ou testes automatizados, e o painel consumidor não possui gatilho próprio.

Executar ou reexecutar a IA não invalida Lógica, Volume, Resultados, Revisão ou qualquer outro processo: proveniência não implica stale cross-process.

A eventual persistência e versionamento da Apresentação Contextual exige contrato próprio e **não** pode reutilizar `ai_review` R5. O desenho definitivo pertence à SDD específica registrada no backlog.

## 60. Aprovação humana sem gates editoriais e independência dos processos — adendo de 2026-08-29

Aprovar é uma **decisão humana explícita sobre o estado atual da keyword**, não um certificado de que todos os processos deram verde. A aprovação exige apenas integridade técnica: keyword existente e não excluída, `brandId` correto, usuário autorizado e ação explícita. Nenhum gate editorial adicional.

É permitido aprovar com SERP conclusiva, mista, fraca ou ausente; com IA executada ou não; com revisão executada ou não; com KGR aplicável, não aplicável ou não decidido. Aprovar **não** converte SERP mista em conclusiva, não fecha Intenção ou Funil e não altera nenhum artefato de processo.

`APPROVAL_ALWAYS_AVAILABLE = YES` · `SERP_REQUIRED_FOR_APPROVAL = NO` · `REVIEW_REQUIRED_FOR_APPROVAL = NO` · `AI_REQUIRED_FOR_APPROVAL = NO` · `KGR_REQUIRED_FOR_APPROVAL = NO`. As mesmas negativas valem para status e para o handoff ao Arquiteto, onde permanecem apenas a Brand ativa e o status editorial.

Reexecutar um processo cria uma nova versão do artefato **daquele processo** e não invalida, apaga nem torna stale nenhum outro. A única dependência legítima é `RESULTS_OR_VOLUME_MAY_RECALCULATE_KGR = YES`. Aprovação, revisão, seleção e linha expandida sobrevivem a qualquer reexecução, e repetir teste **não** exige excluir a keyword: os artifacts são versionados e append-only.

A Revisão Humana deixa de ser gate e passa a existir apenas quando há decisão humana concreta disponível — hoje, a aplicabilidade do KGR. Sem decisão pendente, a UI declara ausência de pendência em vez de cobrar uma revisão inexistente.

O handoff transporta honestamente o que existe: quando a SERP não conclui, `intent` e `funnel` viajam nulos com `semanticState = non_conclusive`; quando conclui, viajam preenchidos com `semanticState = conclusive`. Nenhum valor é inventado para liberar o fluxo.

Restaurar qualquer um desses gates exige nova decisão explícita de produto.

> **Superado em parte pelo §61 (2026-09-18).** A decisão explícita de produto veio: aprovar passou a exigir Lógica, Volume, Resultados e aplicabilidade do KGR quando calculável. SERP e revisão continuam **não** exigidas.

> **Emendado pelo §61 em 2026-09-24 (trava no envio).** "No handoff ao Arquiteto permanecem apenas a Brand ativa e o status editorial" deixa de valer por inteiro: o envio passa a aplicar a trava de aprovação, **só** às aprovações registradas a partir de `SERVER_APPROVAL_GATE_SINCE` e com a exceção do Assunto (D2). As anteriores passam, com alerta. SERP e revisão continuam **não** exigidas. Detalhe no §61.

## 61. Aprovação versionada e pacote fechado para o Arquiteto — 2026-09-18

Decisão de produto: **quando o status é `aprovado`, a keyword está pronta para o Arquiteto, e chega lá fechada**. Nada pode chegar pela metade.

**Trava na aprovação** (`resolveApprovalReadiness`): Lógica processada, Volume processado (medição Google Ads com número ≥ 0 **ou** resposta do Google Ads sem média registrada; emenda de 2026-09-25, abaixo), Resultados validado e aplicabilidade do KGR decidida quando calculável. SERP não conclusiva **não** trava, e revisão humana **não** é gate. `APPROVAL_ALWAYS_AVAILABLE = NO` · `SERP_REQUIRED_FOR_APPROVAL = NO` · `REVIEW_REQUIRED_FOR_APPROVAL = NO` · `KGR_DECISION_REQUIRED_WHEN_CALCULABLE = YES`.

**Registro de aprovação** (`analise_semantica.aprovacao`): `contentHash` (SHA-256), `signature` (FNV-1a síncrona), `approvedAt`, `approvedBy`, `version` (incrementa a cada aprovação). O conteúdo assinado é o pacote inteiro — semântica completa, intenção, volume, resultados, KGR — menos `brandId`, `listaId` e o próprio registro.

**Status `em_revisao` é derivado, nunca gravado.** A coluna `status` guarda a proveniência da última escolha humana; `resolveEffectiveKeywordStatus` devolve `em_revisao` quando a assinatura atual diverge da aprovada. Mexer em keyword aprovada muda o status efetivo sozinho; reaprovar grava versão nova. `minerador_keywords.status` é `text` sem CHECK — sem migration.

**Pacote** (`ApprovedKeywordPackage`, `buildApprovedPackage`): o KeywordDNA inteiro congelado na aprovação, transportado em `payload.approvedDna` do item de workflow. Linha divergente **não produz pacote** — montar a partir dela devolveria conteúdo novo com carimbo antigo. O Arquiteto continua na última versão aprovada enquanto o Minerador prepara a próxima.

**Handoff sem fluxo explícito para reaprovação:** o envio explícito vale só para keyword nova. Keyword já recebida tem o item reescrito quando o `contentHash` aprovado muda (`plan.updates`). Frescor a jusante: `lib/minerador/package-freshness.ts` (`fresh | in_review | stale | never_approved | unknown`; só `stale` impede).

### Exceção do Assunto (D2) — 2026-09-24

Com o Assunto declarado (§67, declaração 3), `resolveApprovalReadiness` só exige a **Lógica**. Volume, Resultados e KGR são dispensados, com o motivo "Assunto declarado: dispensa Volume, Resultados e KGR; a Lógica continua exigida." `ApprovalRequirement` não muda. A dispensa só vale com a declaração: retirar o Assunto volta a exigir tudo. As chaves `keyword_subject*` são assinadas, então declarar ou retirar numa aprovada a leva para Em revisão. A Lógica roda sozinha depois de cada declaração, pela mesma rotina do botão, e nunca aprova.

### Trava no envio ao Arquiteto — 2026-09-24

A trava de aprovação passa a valer **também no envio**, na tela e no servidor, pela mesma função (`resolveHandoffApprovalGate`, `lib/minerador/approved-package.ts`). No servidor, ela fica em `prepareCanonicalHandoff`. A decisão Q3 manteve a trava **só no envio**: a aprovação continua sendo gravada pelo navegador, e a rota de aprovação no servidor fica para uma SDD própria.

**Só para frente.** A trava vale só para aprovações registradas a partir de `SERVER_APPROVAL_GATE_SINCE = "2026-09-24T00:00:00-03:00"` (Q9). Por que essa data: a tela aplica `resolveApprovalReadiness` desde este §61 (2026-09-18), então tudo o que a tela aprovou desde então já passou pela mesma trava. Ligar o envio no dia da aprovação da SDD não revoga nenhuma decisão tomada sob outra regra. A constante fica no código, e nenhum dado é regravado.

| Situação da keyword | No envio |
| --- | --- |
| Aprovada a partir da constante, sem prontidão | **recusada**: 409 `CONFLICT` no lote inteiro, sem gravar nada, com o motivo da trava |
| Aprovada antes da constante, sem registro ou com registro ilegível | passa, com alerta informativo |
| Registro do backfill (`approvedBy` `"backfill:…"`) anterior à constante | passa, com alerta. Com data igual ou posterior, o prefixo não isenta, e vale a regra normal |
| Já recebida pelo Arquiteto | só alerta; não sai de lá (`AGENTS.md` §10) |

Aplicar a trava para trás é decisão do dono, depois do dry-run das aprovadas vivas não recebidas (Q9). Forjar o `approvedAt` pelo navegador só se fecha com a rota de aprovação no servidor (Q3).

**Destino do Assunto conferido no envio.** O servidor confere de novo a página de destino do Assunto contra o `marcas.site_url` **atual** (§67, declaração 3), sem confiar no `destinationCheck` gravado pelo cliente. Nos três casos de recusa (fora do domínio, sem `https`, ou marca sem site com destino gravado), o envio dá 409 no lote. Keyword já recebida só gera alerta. Trocar o `site_url` na Marca pode passar a bloquear o envio de Assuntos com destino antigo, até o humano corrigir o destino.

### Volume como processo executado — 2026-09-25

Decisão do dono (2026-09-25): "O volume tem que ser medido toda vez que chamar ele, não pode ter erro, tem que atualizar e substituir os dados, porque ele não tem custos. Só a SERP tem que ser uma vez só." E sobre as publicadas: "precisam ser aprovadas para passar ao Arquiteto".

**O requisito Volume passa a valer como processo executado.** Cumpre o requisito: uma medição Google Ads com número ≥ 0 (`isValidGoogleAdsDemandMeasurement`), **ou** a resposta do Google Ads sem média registrada na linha (`volume_eligibility.status = "unavailable"`, `provider = "google_ads"`, `measuredAt` legível e `averageMonthlySearches` nulo; leitura única em `readGoogleAdsEmptyVolumeResponse`). Registro sem data, de outro provider, `pending` ou `measurement_failed` continua exigindo o Volume. `VOLUME_WITHOUT_AVERAGE_COUNTS_AS_PROCESSED = YES`.

- **O volume continua `null`** (ADR-020: ausência nunca vira zero). O KGR não é calculável, então a trava do KGR não se aplica.
- **Só com o volume de fato vazio** (revisão de 2026-09-25). Linha que carrega um número anterior **não validado** (planilha, legado, Descobrir) e recebe a resposta sem média **não** tem o Volume processado: a resposta não confirma o número, e ele não pode ir ao Arquiteto como se fosse medido. O número importado fica (resposta vazia não apaga dado), o Volume continua exigido e o motivo da recusa acrescenta "O Google Ads respondeu sem média oficial e o volume importado desta keyword não foi confirmado." (`VOLUME_IMPORTED_NOT_CONFIRMED_REASON`). O painel diz "Volume importado não confirmado pelo Google Ads". A leitura é única: `deriveProcessorRevalidation` só preenche `emptyResponse` sem número anterior, e expõe o outro caso em `emptyResponseOverUnconfirmedValue`. Deixar essas linhas passarem é decisão do dono, pendente.
- **Mesma função nos dois lados:** `resolveApprovalReadiness` na tela, e `resolveHandoffApprovalGate` no envio, na tela e em `prepareCanonicalHandoff`. A prontidão ganha `notes`, **aditivo**, que só aparece quando há o que dizer. O texto é "Volume processado, sem média oficial" (`VOLUME_PROCESSED_WITHOUT_AVERAGE_NOTE`), e a notificação da aprovação o repete.
- **Quem grava o registro:** a rota `metricas-keywords`, para toda keyword que o Google Ads respondeu sem média. Isso inclui a keyword que ele não devolveu no lote (`unmatchedKeywordIds`) e a linha com status legado `publicado`. A não devolvida não ganha linha em `minerador_keyword_metric_measurements`, que guarda as métricas recebidas. O request id vai no próprio registro, e `emptyResponseKind` diz o porquê: `returned_without_average` (devolvida sem média) ou `not_returned` (não devolvida no lote, o que também pode ser defeito de casamento do normalizador). Registros anteriores não têm o campo; a leitura e a aprovação não dependem dele.
- **Medir de novo é sempre permitido e atualiza.** Um número novo substitui o anterior. Uma resposta sem média **não apaga** número anterior: `volume_measurement`, `volume_search`, KGR e a elegibilidade sustentada pelo número ficam, e a data da resposta vazia vai para `volume_eligibility.lastEmptyResponse`. Sem número anterior, a resposta sem média nova substitui a data da anterior. Uma falha nova (rede, 4xx/5xx) não apaga resposta anterior: a marcação compensatória `measurement_failed` só vale para keyword que nunca teve resposta (`shouldMarkVolumeMeasurementFailed`).
- **Tela:** a resposta sem média é `empty` no lote, nunca `failed`. A célula de Volume e CPC mostra o "0" apagado "Processado, sem dado", lido do registro, então sobrevive ao recarregar sem gravação nova. O painel Google Ads diz "Medido · sem média oficial · data". A célula lê o `unavailable` pela mesma regra da aprovação (`readGoogleAdsEmptyVolumeResponse`): registro de outro provider continua "—". A notificação do lote conta as sem média como processadas ("X de Y keywords processadas no Google Ads; Z sem média oficial…") e não as chama mais de inelegíveis. Erro de verdade continua "Erro": rede, 4xx/5xx, releitura que falhou a leitura e releitura que não achou o registro desta resposta (`classifyVolumeReadback`).
- **Remedir sem mudança real não rebaixa a aprovada.** A assinatura v3 cobre `volume_measurement` e `volume_eligibility`, inclusive a data e o request id. Na prática, remedir e receber o mesmo resultado mandaria a aprovada para Em revisão. A rota aplica `carryApprovalAcrossRemeasurement`. Quando o registro batia com a linha antes da remedição, e antes e depois só diferem em proveniência, a rota re-assina o registro. Versão, autor, instante e `contentHash` ficam os mesmos, porque o pacote é o mesmo. Proveniência são estes campos: `measuredAt`, `googleAdsRequestId`, `providerVersion` e `previous*` de `volume_measurement`; e `measuredAt`, `googleAdsRequestId`, `providerVersion`, `lastEmptyResponse` e `emptyResponseKind` de `volume_eligibility`. Número, CPC, concorrência, targeting e elegibilidade continuam assinados, e mudar qualquer um deles manda a keyword para Em revisão. Isso vale também para sair de "sem média" para um número. Keyword que já estava em revisão continua em revisão. Como os lances e o CPC do Google Ads variam com frequência, na prática a aprovada só se mantém quando todos esses campos se repetem.
- **`contentHash` é identidade, não checksum.** Ao carregar a aprovação, o `analise_semantica` muda (data, request id) e o `contentHash` não, de propósito. Nenhum consumidor deve recalcular esse SHA-256 para conferir o pacote: a divergência se decide pela `signature`. Uma verificação por hash rebaixaria em massa toda aprovada remedida.
- **SERP sem mudança:** continua coletada uma vez só. Sem migration: JSONB aditivo (`lastEmptyResponse`) e `intent` no `select` da rota.

## 62. KeywordDNA fechado — contrato tipado exportado pelo Minerador — 2026-09-19

Até aqui o "KeywordDNA" era um saco de chaves soltas em `analise_semantica` mais quatro colunas. O Arquiteto lia treze chaves pelo nome interno (`intencao_principal`, `modificadores`, `dna_confianca`, `problema_percebido`…) com normalização própria: Minerador vazando por dentro de outro módulo. E a intenção tinha duas respostas: a tabela mostrava a Lógica; o Arquiteto preferia a SERP.

`lib/minerador/keyword-dna.ts` é a única fronteira. `KeywordDnaSchema` (zod, `strict`) define o formato; `keywordDnaFromRow` lê a linha viva; `keywordDnaFromPackage` lê o pacote aprovado que viaja no workflow. Ninguém fora do Minerador precisa conhecer nome de chave.

**Uma resposta por eixo, com a fonte declarada.** `axes.intent`, `axes.funnel` e `axes.niche` carregam `value`, `label`, `state` e `source ∈ {serp, human, logic, null}`. Ordem de autoridade (SDD consolidação, adendo A.2): SERP conclusiva fecha o eixo e **nem a decisão humana a substitui**; sem SERP conclusiva, decisão humana; sem decisão, Lógica como hipótese; sem nada, `value = null` com `state` honesto. Nicho não tem evidência SERP.

**Ausência declarada não vira dado.** `Pendente`, `Nenhum…`, `A confirmar` e `…não determinad…` no meio da frase viram `null` na origem — as mesmas regras que o Arquiteto aplicava por conta própria, e por isso pode parar de aplicar. `modificadores` (string separada por vírgula) vira array; `dna_confianca` (string) vira número 0..1.

**Blocos:** `identity`, `axes`, `serp` (estado, força por eixo, versão, hash, coleta), `logical` (os treze campos normalizados), `metrics` (volume, resultados, KGR com aplicabilidade), `humanReview`, `maturity`, `status` (efetivo + `divergedFromApproval`), `approval` (versão vigente).

**Equivalência garantida por teste** (`tests/minerador-keyword-dna-fechado.test.mts`): sobre a mesma fixture, `keywordDnaFromRow` devolve campo a campo o que `resolveKeywordDnaSignals` do Arquiteto lê hoje. O teste importa o módulo do Arquiteto; a lib do Minerador **não**. Pacote aprovado reconstrói o mesmo DNA e nunca se lê como `em_revisao`.

Nada mudou no formato do pacote nem no handoff: o DNA tipado é uma **vista derivada**, sem bump de schema. A troca de `resolveKeywordDnaSignals` por `keywordDnaFromPackage` é decisão do Arquiteto e está no backlog dele.

> **Complementado pelo §63 (2026-09-19):** a SERP conclusiva passou a morar na própria linha e a leitura canônica da tabela passou a respeitá-la. O item de backlog "tabela e Perfil ainda mostram a Lógica" foi resolvido por essa via.

## 63. SERP como evidência forte — a SERP conclusiva muda a Lógica na origem — 2026-09-19

Decisão de produto: **a SERP tem mais preferência e pode mudar os dados da Lógica; isso é evidência forte.** A autoridade já estava declarada (§58, adendo A.2) mas nunca chegava à linha da keyword: a tabela mostrava a hipótese da Lógica com a SERP concluída.

**Registro `analise_semantica.evidencia_serp`** (`lib/minerador/serp-evidence-record.ts`): projeção da versão vigente de `keyword_semantic_qualification`, gravada pela rota Resultados imediatamente após o write confirmado do artifact. Carrega `versionId`, `version`, `contentHash`, `collectedAt`, `derivationVersion`, `semanticState`, e por eixo `{ value, strength }` — **valor só quando conclusivo**; mista, fraca e insuficiente registram a força e nada mais. `peso: "forte"`. Só keyword oficial recebe.

**A hipótese da Lógica não é sobrescrita.** `intencao_principal`, `funnel` e `logical_output_contract` continuam como o motor gravou; a SERP muda a resposta canônica, e a proveniência de quem propôs o quê continua legível.

**Leitura canônica** (`readCanonicalKeywordDna`), por eixo: SERP conclusiva não invalidada → decisão humana → Lógica → `null` com estado honesto. O read model ganhou `intentSource`, `funnelSource`, `nicheSource` (`serp | human | logic | null`). Nicho não tem eixo SERP. `{ includeSerpEvidence: false }` devolve a hipótese pura — é o que a coluna "Lógica" do painel de consolidação mostra.

**Humano invalida, não substitui.** `HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO` continua. `invalidateSerpEvidence` exige motivo e devolve a leitura para humano > Lógica até nova coleta; a nova coleta substitui o registro inteiro, invalidação inclusive. A UI da invalidação ainda não existe.

**Assinatura v2 do pacote aprovado.** `evidencia_serp` sai da assinatura crua e entra a **leitura canônica** (`canonical: { intent, funnel, niche }`). Efeito: SERP conclusiva que muda a intenção ou o funil rebaixa para `em_revisao` e exige nova aprovação; SERP que não conclui nada, ou que confirma a Lógica, não gera ruído. Registros v1 (`fnv1a:`) continuam verificáveis e migram para v2 (`fnv1a-v2:`) sem mudar versão, autor ou instante — só os que ainda batem em v1; v1 divergente é revisão de verdade.

**Backfill** `npm run minerador:backfill-evidencia-serp` (dry-run; `--apply` grava): passo 0 re-assina v1→v2; depois projeta a versão vigente de cada Qualificação. Dry-run de 2026-09-19: 103 keywords com Qualificação, 60 com eixo conclusivo, **23 aprovadas cairão em revisão** porque a SERP discorda da Lógica.

```text
SERP_CONCLUSIVE_IS_STRONG_EVIDENCE = YES
SERP_EVIDENCE_LIVES_IN_KEYWORD_ROW = YES
SERP_OVERWRITES_LOGIC_HYPOTHESIS = NO
HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO
HUMAN_CAN_INVALIDATE_BAD_SERP_EVIDENCE = YES
NEW_CONCLUSIVE_SERP_AFTER_APPROVAL_REQUIRES_REAPPROVAL = YES
NON_CONCLUSIVE_SERP_DOWNGRADES_APPROVAL = NO
```

## 64. Conferir site contra o catálogo remoto e papel da página — 2026-09-20

**Defeito:** "Conferir site" lia o catálogo do **navegador** (`loadBrandSiteWorkspace` → IndexedDB) e só casava keyword com candidata **extraída** de texto igual. O catálogo do Site da Marca passou a viver no remoto (`brand_site_catalog_entries`), então a resposta era sempre "Nenhuma URL foi localizada no catálogo" — mesmo com a página lá, H1 idêntico à keyword.

**Contrato:** a fonte canônica é o catálogo remoto (`GET /api/marca/site/sitemap`, o mesmo que o Arquiteto lê). A cópia local é complemento e pode não existir. O casamento é pelo que a página **declara** (`lib/minerador/site-catalog-match.ts`): H1 igual (forte) → slug igual (forte) → título contendo a keyword inteira, só para keyword de duas palavras ou mais (fraco). Pedaço de palavra nunca casa. Entrada removida ou ignorada do catálogo não conta.

**Papel da página** (`deriveSitePageStructure`): derivado da posição no caminho, com as mesmas regras de `lib/arquiteto/published-site-architecture.ts` — home; institucional; profundidade ≥ 2 é **artigo** com `siloPath = /primeiro-segmento`; primeiro nível com páginas abaixo no catálogo é **Silo**; primeiro nível sem filhos fica `unresolved` (humano decide). A URL conferida **não precisa estar no catálogo**: a página do Silo do Care Glow não está no sitemap, mas os artigos abaixo dela estão — é isso que a torna Silo. Vale para a URL manual também.

**Evidência:** `site_origin` ganha `siteRole` e `siloPath` (aditivos, opcionais; contrato de importação da Marca estendido sem quebrar o existente). `readPublicationLink` expõe os dois. A prévia da conferência mostra o papel por item.

O que **não** mudou: verificação técnica (`/api/marca/site/page/verify`), persistência por `/api/marca/site/import/keywords`, confirmação humana antes de `published`, desvinculação. Keyword nova continua exigindo Silo/Categoria de destino para ser criada.

**Conferência por link é ação explícita, por keyword.** Ela existe no vínculo de cada keyword ainda não publicada, e não só como queda do catálogo. É o caminho normal do **Silo**: a página de Silo costuma não estar no sitemap, então nunca vai casar no catálogo. Abrir a conferência manual fecha a prévia aberta — antes o formulário era renderizado com `!siteSyncPlan`, de modo que uma prévia anterior escondia o campo e a mensagem apontava para um formulário invisível. A URL já conhecida da keyword vem preenchida; sem ela, o site da marca.

**A URL informada à mão grava a evidência na hora.** A prévia com "Salvar conferência" existe para o lote vindo do catálogo, onde há o que revisar. Para uma URL digitada para **uma** keyword ela era um passo invisível: a prévia fica no topo da tela, a linha continuava `Livre` e o resultado parecia não ter acontecido. O ato explícito é colar a URL e conferir; a partir daí o vínculo fica `Verificada`. **Publicar continua sendo outra ação** — `Confirmar publicada` na coluna Vínculo. Persistência num caminho só (`persistSiteSyncCandidates`), usado pelos dois.

**Origem declarada da candidata.** A candidata nascida de uma linha existente carrega `mineradorKeywordId`, e a evidência volta para **essa** linha. Antes, a conferência reencontrava a keyword por texto *dentro do Silo de destino*: uma keyword sem lista — o caso de todas as 38 do Care Glow — não era achada e virava "nova", criando linha duplicada em vez de atualizar a que o humano selecionou. O Silo de destino volta ao seu único papel: **criar** keyword nova. Sem origem declarada (importação a partir da aba Site da Marca), o casamento por texto continua valendo.

Consumo pelo Arquiteto: ele já reconstrói a árvore publicada pelo catálogo; `siteRole`/`siloPath` na evidência da keyword são o mesmo fato do lado da keyword, para o caso em que a página do Silo não está no sitemap. Ler isso em `adaptKeywordIdentityContext` é decisão do Arquiteto (backlog dele).

## 65. Dois eixos: status editorial e vínculo de publicação — 2026-09-20

**Status editorial** (`bruto · em_revisao · aprovado · rejeitado`) responde: *a keyword passou pelos processos do Minerador e foi aprovada?* **Vínculo** (`free · candidate · verified · published · legacy_unverified`) responde: *esta keyword tem uma página real publicada?* São independentes.

**Publicada no site e crua no Minerador é estado legítimo e comum** — toda keyword importada de um site existente nasce assim. Declarar publicação **não** aprova; aprovar **não** publica.

**Uma lista por eixo.** Havia **sete** seletores de status editorial escritos à mão — coluna da tabela, recuperação de marcação legada, filtro do topo, "Status final" na Decisão, lote na barra de ações, lote no menu compacto e "Status Inicial" da criação manual. Só a coluna tinha os quatro estados; as outras seis não tinham `em_revisao`, e duas ofereciam `publicado`. Todas passam a renderizar `MINERADOR_EDITORIAL_STATUS_OPTIONS`, derivada de `MINERADOR_EDITORIAL_STATUSES` com os rótulos oficiais. Divergência entre telas não se conserta conferindo as sete; conserta-se tendo uma — e um teste recusa qualquer `<option>` de status escrito à mão. Medido: `publicado` não existe em nenhuma linha do banco (80 `bruto` + 29 `aprovado`, e mais nada). Ele sai dos seletores; `isLegacyPublishedStatus` e `legacy_unverified` continuam reconhecendo o legado na leitura.

**Filtro lê o estado derivado, não o valor cru.** `deriveMineradorTableRows` filtrava status por `item.status` — a coluna crua com a última escolha humana — enquanto a tela mostra o efetivo. Filtrar por "Em revisão" nunca devolvia nada, e "Aprovado" trazia keyword que a própria tela mostrava em revisão. O mesmo valia para o vínculo: filtro em `publicationStatus` cru, coluna no derivado. Agora os dois filtram pelo que a coluna mostra, e o rótulo do filtro é **Vínculo**.

**A coluna Vínculo mostra o que sabe.** Além do estado (`Livre`, `Candidata`, `Verificada`, `Publicada`, `Publicação não verificada`), ela exibe o **papel da página** (Silo/Artigo, com o Silo no título) e o link — rotulado `Canônico` quando há canônico declarado, `Página` enquanto é só conferência. Os dois dados já saíam de `readPublicationLink`; faltava o render.

**Canônico declarado.** Confirmar a publicação congela `site_origin.canonicalUrl` com a URL declarada (`declaredCanonicalUrl` → `resolvedUrl` → `sourceUrl`). O canonical lido da página pode mudar depois; o que a marca declarou como endereço da keyword, não.

SDD: [sdd-dois-eixos-status-editorial-e-vinculo-2026-09-20](propostas/sdd-dois-eixos-status-editorial-e-vinculo-2026-09-20.md).

## 66. Três eixos e o papel de cada tela — 2026-09-20

Corrige o §65, que tratou o Vínculo como o eixo da publicação. Ele não é: **o Vínculo declara o posto desta keyword numa publicação** — se ela é livre para ser primária/secundária em qualquer lugar, ou se pertence a uma publicação e está atrelada ao slug/URL, podendo ou não perder essa vaga.

**A colisão que gerava a confusão:** "Livre" queria dizer duas coisas na mesma tela — `PublicationLinkState.free` ("não há URL conferida") e `PrimaryKeywordPolicy.free` ("não está presa a nenhuma publicação"). Duas perguntas, uma resposta na tela.

| eixo | pergunta | valores | quem escreve |
| --- | --- | --- | --- |
| Status editorial | passou pelos processos e foi aprovada? | `bruto` · `em_revisao` · `aprovado` · `rejeitado` | barra do rodapé (lote e uma a uma) e card do DNA |
| Publicação | existe página real no ar? | conferência técnica → declaração humana | Vínculo: "Conferir por link" → "Confirmar publicada" |
| Posto de principal | pode perder a vaga de primária? | `free` · `locked` · `reviewable` | **Revisão Humana**, junto da aplicabilidade do KGR |

**Papel de cada tela.** A barra do rodapé classifica em grupo e serve para uma a uma; o card do DNA classifica uma a uma — e as duas usam a mesma lista. A **coluna Status só informa**: deixou de ser `<select>`. Os filtros mostram e organizam por tipo de classificação.

**`Publicado` volta como marcador, não como valor do enum.** Era preciso ver na coluna que a keyword já está no ar — sem isso uma página publicada parece idêntica a uma recém-importada. Mas dizer que ela é "publicada" no eixo editorial seria afirmar que passou pelos processos. A coluna informativa mostra os dois fatos empilhados: a classificação (`Bruto`) e o selo `Publicado`. O enum que se escreve continua com quatro valores.

**Posto de principal é decisão da Revisão Humana.** `canCompleteHumanReview` ganha `pendingPrimaryPolicy`: havendo publicação declarada e posto ainda `free`, existe decisão humana concreta esperando escolha — contada junto da aplicabilidade do KGR. Sem publicação declarada a pergunta não existe: não há vaga a perder. O seletor duplicado saiu do card DECISÃO.

SDD: [sdd-tres-eixos-status-publicacao-posto-2026-09-20](propostas/sdd-tres-eixos-status-publicacao-posto-2026-09-20.md).

## 67. As duas declarações do Vínculo e o endereço na palavra-chave — 2026-09-20

Amplia o §66. O Vínculo passa a carregar **duas declarações humanas**, e só elas (três desde 2026-09-24; ver a nota abaixo).

> **Ampliado em 2026-09-24:** o Vínculo passa a ter **três** declarações. A terceira é o Assunto (seção "3. Assunto", abaixo; [SDD do Assunto](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), P2).

### 1. Posto de principal

`free` · `locked` · `reviewable` (`lib/minerador/primary-keyword-policy.ts`). Sem publicação declarada a keyword é **Livre** — livre para ser primária ou secundária de qualquer coisa. Com publicação, o humano declara se ela pode perder a vaga (`Revisável`) ou está presa ao slug/URL (`Travada`).

### 2. Tipo de página

`article` · `silo` · `landing_page` · `service_page` (`lib/minerador/keyword-page-type.ts`). **Um enum só, com sentido dependente do contexto:** sem publicação é *potencial* ("viria a ser um Silo"); com publicação é *fato* ("o que está no ar é uma Landing page"). Dois campos separados fariam a declaração se perder no dia da publicação.

**Padrão `article`**, porque é o que a maioria vira; declarar Silo é a exceção que o humano marca quando a keyword deve abrir um universo novo. A resolução tem três origens declaradas: `human` (alguém escolheu) > `site` (papel observado no catálogo) > `default`. **Nunca é obrigatório** — informa o Arquiteto, não entra no gate da revisão.

**Potencial só existe enquanto a keyword é nova.** Declarada a publicação, o tipo deixa de ser aposta e passa a ser **declaração**. O que muda é o peso da palavra, **não o direito de escolher**: a resolução devolve `determined` (há valor — declarado por alguém ou observado na página) e `declared` (`published && determined`), e `declared` governa o rótulo, nunca o `disabled`.

```text
nova         Artigo · potencial      seleção livre
publicada    Silo · declarado        seleção livre
```

**Nada trava a seleção.** Quem sabe o que a página é continua sendo o humano — inclusive para corrigir uma declaração errada sem precisar desfazer a publicação. Um `select` desabilitado transformaria um engano em trabalho de desvinculação.

> **Corrigido em 2026-09-24 (seção 4, abaixo):** o peso potencial ou declarado deixou de depender só da publicação. O humano escolhe o peso para qualquer keyword, e a publicada continua declarada pela publicação.

### 3. Assunto — 2026-09-24

O Assunto é a frase que o humano declara como **tronco** de um ou mais artigos, mesmo sem volume de busca. Ele é uma marca **ao lado** do tipo de página, não um quinto tipo: `KEYWORD_PAGE_TYPES` não muda, e uma keyword pode ser Assunto e Página de serviço ao mesmo tempo.

- **Onde vive:** em `analise_semantica`, nestas chaves:
  - `keyword_subject`: `{ declared, note, destinationUrl, destinationCheck }`, ou `null` depois de retirada;
  - `keyword_subject_actor`: `auth.users.id`;
  - `keyword_subject_at`;
  - `keyword_subject_origin`: `import`, `review` ou `batch`;
  - `keyword_subject_history`: só cresce, inclusive na retirada.

  O domínio fica em `lib/minerador/keyword-subject.ts`.
- **Só o humano declara** (P4). A declaração pode vir da Revisão Humana, do rodapé em grupo ou do select do import, que vale como declaração humana. O ator é sempre `auth.users.id`; e-mail e `"local-user"` são recusados. A IA e o MCP nunca declaram.
- **Nota:** até 280 caracteres, numa linha só. **Página de destino:** opcional, `https` e no host do site da marca. Fora do domínio, é recusada. Marca sem `site_url` aceita o Assunto sem destino. O catálogo do site é só informativo, e o envio ao Arquiteto confere o destino de novo (§61).
- **Leitura única** por `resolveKeywordVinculo`, que ganha `subject` e `subjectLabel` ("Assunto · declarado" ou "Assunto sem nota") **só** quando há declaração. Sem Assunto, o objeto e a frase do resumo ficam iguais aos de antes. Ninguém lê `keyword_subject` direto na tela.
- **Publicada:** pode ser declarada Assunto sem mudar principal, slug, canonical nem URL (P5).
- **Aprovação:** com Assunto, só a Lógica é exigida (§61). Declarar ou retirar muda a assinatura do pacote, e a aprovada vai para Em revisão; a tela avisa antes de confirmar.
- **Em grupo:** a declaração aceita uma nota e um destino iguais para o lote, conferidos uma vez. A keyword que já é Assunto é pulada e mantém o que tem.

### 4. Ajustes pedidos pelo dono — 2026-09-24

Pedido do dono de 2026-09-24, depois de testar na tela. O contrato completo e o motivo estão na [SDD do Assunto, seção 12](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md); o registro operacional, no `estado-atual.md` de 2026-09-24. **Verificado no código e confirmado por teste; validado manualmente: não.**

#### 4.1 Potencial x declarado, para qualquer keyword

**Corrige a seção 2** ("Potencial só existe enquanto a keyword é nova"). O tipo de página continua com os mesmos 4 valores (`KEYWORD_PAGE_TYPES` não muda), mas o humano escolhe também o **peso**:

```text
potencial    Artigo · potencial      "pode ser um Artigo"
declarado    Artigo · declarado      "vai ser um Artigo, travado"
```

- **Oito escolhas** (4 tipos × 2 pesos) na Revisão Humana e no rodapé, para **qualquer** keyword, publicada ou não (`keywordPageTypeChoices`).
- **Onde vive:** `analise_semantica.keyword_page_type_stance` = `"potential"` | `"declared"`, ao lado de `keyword_page_type`. É opcional: sem ela, a leitura é a de antes. Só `setKeywordPageType` grava; trocar só o peso entra no histórico, com `previousStance` e `nextStance`.
- **Leitura só pelo resolver** (`resolveKeywordPageType`): `humanDeclared` aparece quando o humano gravou o tipo **e** o peso `"declared"`. `declared` continua sendo só o fato da publicação.
- **Publicada:** a publicação continua declarando. A Revisão mostra os 4 declarados, como antes, e **não grava o peso**.
- **"Declarado" é peso, não trava de tela.** A regra "Nada trava a seleção" (seção 2) continua valendo: o humano pode trocar o tipo e o peso a qualquer momento.
- **O Arquiteto** lê a declaração humana como `source: "potential"`, com o motivo "tipo travado" (`pageTypeHumanDeclared`, aditivo). A primária segue provisória até a SERP confirmar.

#### 4.2 Rodapé: KGR, seletor Vínculo e o Assunto

- O rodapé tem o **KGR** e **um seletor "Vínculo"** (pedido do dono, 2026-09-24: os três selects separados poluíam o rodapé). O Vínculo abre um painel com os **mesmos três selects do card REVISÃO HUMANA** (componente comum `components/editorial/vinculo-selects.tsx`) — Posto de principal, Potencial de página e Assunto (Não · Declarado) —, com os mesmos rótulos e valores e **sem "Não mudar"** (pedido do dono, 2026-09-24, terceira rodada). Cada select mostra o valor comum das selecionadas ou o marcador desabilitado "Valores diferentes", que não é valor gravável; "Aplicar" grava só os selects que o humano mudou, de uma vez. Assunto Declarado (escolhido ou comum a todas) desliga o Posto. A coluna Vínculo mostra as três escolhas, default ou do usuário (ex.: "Livre · Artigo · potencial · Assunto: Não"). Os mesmos aparecem em "Mais ações". Nada é gravado antes da confirmação.
- **O rodapé só existe com seleção feita pelo humano.** Nenhum processo automático seleciona keywords.
- **O Assunto anula o Posto e o KGR.** São as keywords do artigo que definem posto e KGR. No lote, a keyword com Assunto é pulada e contada. Na Revisão, os dois selects ficam desligados. A conclusão da revisão não cobra o KGR de um Assunto.
- **O Potencial de página vale também para o Assunto** ("quero que este Assunto seja uma landing page").
- **Na publicada, o tipo já é declaração pela publicação.** Em grupo, escolher um valor "potencial" pula e conta a publicada (a confirmação diz quantas); o valor declarado vale para ela, como na Revisão individual.

#### 4.3 Filtros de visualização (painel Organizar)

- **Silo saiu** (coerente com o §76: a planilha não organiza silo).
- **KGR num seletor só**, com dois grupos: Aplicabilidade (Aplicável, Não aplicável, Pendente) e Cálculo. Escolher um lado zera o outro.
- **Vínculo inclui a Relação com URL**, em dois grupos: Vínculo (Livre, Candidata, Verificada, Publicada, Publicação não verificada) e Relação com URL. Escolher um lado zera o outro.
- **"Arquitetura" deu lugar a "Processo"**: *Com processo* = a keyword já passou pela Lógica, pelo Volume ou por Resultados no Processador, com dado, sem dado ou com erro. Valor só importado do Descobrir conta como *Sem processo*. O sentido "enviado ao Arquiteto" exigiria leitura nova do banco ou marcador novo no Minerador e está **pendente de decisão do dono**.
- **Preferência salva:** o formato continua o mesmo. Na restauração, Silo e Arquitetura voltam a "Todos". Se a preferência trazia os dois lados de um par, fica um lado só. Um valor de Vínculo que o seletor não oferece volta a "Todos". Nenhum filtro fica ativo sem aparecer na tela.

#### 4.4 O "0" processado sem dado (regra visual)

As células de métrica distinguem quatro situações: no Processador, Resultados, Volume, CPC e KD (`lib/minerador/processor-table-cells.ts`); no Descobrir, Resultados, Volume, CPC e Concorrência Ads (`lib/minerador/discovery-table-cells.ts`).

```text
—          nunca processada
0          processada, sem dado      cinza apagado, dica "Processado, sem dado"
Erro       o processo falhou         cor de alerta (text-warning), motivo na dica
Medindo…   processo em andamento
```

**O "0" é só visual.** No banco o dado continua vazio (null). O KGR, a elegibilidade de volume, os filtros e a ordenação tratam a célula como **ausente**, nunca como zero medido: **ADR-020**, "volume ausente é parcial/indisponível, nunca zero implícito". Nenhum escritor grava zero no lugar de um dado ausente.

**Limite:** a keyword que o Google Ads não devolve no Volume em grupo, e a candidata do Descobrir sem média, só mostram o "0" apagado **na sessão**. Depois de recarregar voltam a "—", porque a rota não grava marcador de "processado sem dado". Gravar esse marcador muda o contrato de escrita da rota e depende de SDD.

### Vocabulário das duas declarações

> **Nota de 2026-09-24:** este vocabulário cobre o posto e o tipo de página. O Assunto tem vocabulário próprio na seção "3. Assunto", acima, e, quando declarado, aparece também na coluna Vínculo (`data-keyword-subject-label`, lido por `resolveKeywordVinculo`).

A tela mostra exatamente três coisas, no mesmo lugar na coluna e no DNA:

```text
Livre  ·  ou  ·  Travado ao slug
Artigo   · potencial ou declarado
Silo     · potencial ou declarado
```

O posto tem **três valores internos e duas respostas visíveis**: `free` (sem publicação) e `reviewable` (com publicação, podendo perder a vaga) dizem a mesma coisa para quem olha — ela pode sair —, então os dois aparecem como **Livre**. Só `locked` prende a keyword ao endereço, e aparece como **Travado ao slug** (`primaryPostLabel`). **Não existe "posto a declarar":** o padrão é Livre, e o padrão é uma resposta.

### Onde cada coisa vive

| item | lugar | por quê |
| --- | --- | --- |
| Posto de principal | **Revisão Humana** | é decisão, como a aplicabilidade do KGR |
| Tipo de página | **Revisão Humana** | idem, e a origem da resolução fica escrita ali |
| Estado da conferência, link, "Conferir por link", "Confirmar publicada" | **card DECISÃO** | são **dados de confirmação**, não declarações |
| As duas declarações, resumidas | **coluna Vínculo** | a coluna informa o que foi declarado |
| **Endereço da página, inteiro** | **ao lado da palavra-chave** | é a identidade da página, não um detalhe do vínculo |

**O endereço** aparece na coluna da palavra-chave, completo, em `font-mono` com a cor `text-identity-published` — a mesma cor que marca publicação em toda a plataforma. Surge assim que há URL conferida, não só depois de declarada; o `title` distingue "canônico declarado" de "página conferida". Marcado com `data-keyword-page-url` para os guardas visuais.

A coluna Vínculo mostra o posto (com cor por estado) e o tipo (borda tracejada quando ainda é o padrão, sólida quando declarado ou observado). Desde 2026-09-24, mostra também o selo do Assunto quando ele foi declarado: "Assunto · declarado", ou "Assunto sem nota" (seção 3. Assunto, abaixo). Nada mais.

## 68. Declaração no ato do link e as cores do vínculo — 2026-09-20

### Colar o link declara

Colar a URL de uma página que está no ar e mandar conferir **é** a declaração de publicação. `handleManualSiteCheck` confere, persiste a evidência e declara, num ato só. Exigir um segundo clique em "Confirmar publicada" dentro do card DECISÃO pedia a mesma confirmação duas vezes, e deixava a linha em `Verificada` parecendo que faltava algo.

`handlePublicationLinkAction` ganhou `{ skipPrompt }` **exclusivamente** para esse caminho — um teste garante que nenhum outro o usa. O botão avulso continua no card DECISÃO, para a keyword conferida por outro caminho.

**A conferência em lote pelo catálogo continua sem declarar.** São muitas keywords de uma vez, e declarar publicação em massa não é decisão que se toma por engano num botão de prévia.

### A Revisão Humana decide; coluna e cabeçalho refletem

Os dois `select` mostram exatamente a frase que a coluna e o cabeçalho vão repetir, incluindo o peso:

| situação | posto | tipo |
| --- | --- | --- |
| keyword nova | `Livre` | `Artigo · potencial` |
| publicação declarada | `Travado ao slug` | `Artigo · declarado` |

O peso vem da **publicação**, não da opção escolhida: escolher Silo numa keyword nova dá `Silo · potencial`; na publicada, `Silo · declarado`. Oferecer só "Silo" no `select` escondia metade da frase que a própria tela mostrava uma linha abaixo.

`lib/minerador/keyword-vinculo.ts` resolve o Vínculo **uma vez** e devolve tudo pronto: `post`, `postLabel`, `postSelectValue`, `pageType`, `pageTypeLabel`, `publicationDeclared`, `url`, `canonicalUrl`.

As três telas chamam esse resolvedor e **nenhuma deriva nada por conta própria**:

| tela | papel |
| --- | --- |
| Revisão Humana (card DNA) | **decide** — é onde os dois `select` vivem, com os defaults |
| Coluna Vínculo | **reflete** |
| Cabeçalho do Perfil | **reflete** |

Antes cada uma calculava o seu par, e a divergência apareceu em tela: a Revisão dizia **Livre** para uma keyword publicada enquanto a coluna já dizia **Travado ao slug**. Um teste conta as chamadas de `resolveKeywordVinculo` (1 no workspace, 2 no card) e recusa qualquer `resolveKeywordPageType` ou `readPrimaryKeywordPolicy` nas telas.

### Default do posto segue o fato

| situação | default | por quê |
| --- | --- | --- |
| sem publicação | `Livre` | não há vaga a perder |
| **com publicação declarada** | **`Travado ao slug`** | ela já é a primária de um endereço que está no ar |

`readPrimaryKeywordPolicy` aceita `publicationDeclared` e devolve `locked` por padrão quando há publicação. Soltar continua sendo escolha humana (`Livre` → grava `reviewable`), e a escolha explícita sempre vence o default.

**O posto deixou de ser decisão pendente.** Ele sempre tem resposta dos dois lados; cobrar declaração de quem já tem uma seria inventar pendência. `pendingPrimaryPolicy` saiu de `canCompleteHumanReview`.

### Cabeçalho do perfil

O cabeçalho do PERFIL DA KEYWORD **só fala quando há publicação**. Havendo, mostra os três fatos na mesma ordem da coluna Vínculo: **Publicada** (tom `danger` — é alerta, não troféu: dali em diante exclusão e edição estrutural ficam bloqueadas), **Travado ao slug** ou **Livre**, e o tipo **declarado**.

Sem publicação o cabeçalho fica limpo. Keyword nova não tem URL nem vaga a perder, e dois selos acabavam dizendo "Livre" pela mesma ausência — repetir ausência não é informação. O par do Vínculo continua visível na coluna, sempre.

### Cores — `docs/compartilhado/sistema-visual.md`

| elemento | token | por quê |
| --- | --- | --- |
| endereço da página, publicada | `identity-published` | §5.0.1: link e URL de conteúdo declarado como publicado |
| endereço da página, apenas conferida | `identity-new` | mesma regra, pelo avesso: sem publicação é identidade nova |
| **slug e canonical** | `identity-slug` | §5.0.1: identidade SEO, papel próprio em qualquer estado |
| selo `PUBLICADO` na coluna Status | `danger` | §5.1: publicação **bloqueia** exclusão e edição estrutural |
| `Travado ao slug` / tipo `declarado` | `context-accent` | §5.1 `INFO`: informação de contexto, não resultado de operação |
| `Livre` / tipo `potencial` | `text-muted` + borda tracejada | ausência de declaração não é estado colorido |

Duas correções de contrato visual:

1. **A linha publicada deixou de ser vermelha.** `bg-danger-soft` na `<tr>` inteira pintava a linha toda; o sinal passou para o selo, que é onde o fato é dito. Menos ruído, mesma informação.
2. **`identity-published` saiu dos badges.** Eu a tinha usado no posto e no tipo — exatamente o uso que §5.0.1 proíbe, porque ela é reservada a slug, link e canonical. Um teste conta as ocorrências e recusa mais de uma.

## 69. Endereço e identidade SEO são papéis de cor diferentes — 2026-09-20

Diretriz da marca, registrada em `docs/compartilhado/sistema-visual.md` §5.0.1:

| papel | token | valor | onde |
| --- | --- | --- | --- |
| endereço publicado | `identity-published` | `#193cb8` | link e URL de conteúdo declarado como publicado |
| endereço novo | `identity-new` | `#10DDE0` | link e URL de conteúdo ainda não publicado |
| **identidade SEO** | `identity-slug` | `#12A1E0` | **slug e canonical**, em qualquer estado |

Antes `identity-new`/`identity-published` cobriam "slug, link e canonical" juntos, e o estado da publicação recolorava os três. **Slug e canonical não mudam de natureza quando o conteúdo é publicado** — mudam de imutabilidade, e isso se comunica por selo, não recolorindo o dado. Por isso ganharam papel próprio.

`identity-slug` é alias de `context-accent`: o hex já existia na paleta, o que faltava era o nome do papel. Nenhum valor bruto entrou em componente — um teste recusa os três hexes fora de `app/globals.css`, inclusive em comentário.

No Minerador: o card DECISÃO passou a mostrar **duas linhas** — o endereço, clicável, na cor do estado; e o canônico, abaixo, em `identity-slug`. Antes um elemento só fazia os dois papéis com uma cor só.

**Fora do Minerador ainda há consumidores da regra antiga** — `arquiteto-workspace` pinta o slug com `identity-new`/`identity-published`, e os painéis somente-leitura do Arquiteto mapeiam os dois papéis. Migrá-los é trabalho do Arquiteto, registrado no backlog dele.

## 70. A Lógica não serializa o que não é dela — 2026-09-21

**Defeito de integridade, medido.** `mergeLogicalKeywordSemantic` terminava com

```ts
typeof value === "string" ? value : JSON.stringify(value)
```

aplicado a **toda** chave de `analise_semantica`, não só aos campos do motor. Um clique em "Processar lógica" transformava `site_origin`, `site_origins`, `aprovacao`, `human_review`, `evidencia_serp`, as medições e os históricos em **string JSON**. Nenhum leitor reconhece isso — todos checam `typeof === "object"` e devolvem `null`.

O dado continuava no banco, intacto e ilegível. Na tela: a publicação declarada sumia, junto com a proteção contra exclusão, que depende da mesma leitura.

**Contrato:** o motor é dono dos campos de `LOGICAL_FIELD_KEYS` e só serializa esses. Todo o resto do jsonb pertence a outros donos e sai do merge como entrou. O retorno deixou de ser `KeywordSemanticRecord` (`Record<string, string>`) e passou a `Record<string, unknown>` — o tipo antigo prometia o que a função não podia cumprir sem destruir dado alheio.

**Duas chaves são string por desenho** e ficam de fora do reparo: `kgr_decisao_historico` e `primary_keyword_policy_history`, gravadas com `JSON.stringify` e relidas por `parseHistory` próprio.

**Alcance medido em 2026-09-21** (109 keywords vivas, duas marcas):

| chave | linhas |
| --- | --- |
| `discovery_import` | 104 |
| `allintitle_measurement` + histórico | 21 |
| `dataforseo_keyword_overview` + histórico | 21 |
| `site_origin` / `site_origins` | 1 |

Reparo: `npm run minerador:reparar-semantica` (dry-run; `--apply` grava, com readback).

## 71. Página publicada não é apagada — 2026-09-21

**Auditoria das três camadas, medida.** Nada foi apagado: `deleted_at` está nulo em todas as keywords das duas marcas. Mas a proteção não era o que o contrato pede.

| camada | o que fazia | veredito |
| --- | --- | --- |
| tela | filtrava a publicada fora da seleção (`keywordPublicationProtected`) | protegia — e só a tela |
| rota `keywords/delete` | repassava os ids à RPC, sem checar | **buraco**: chamada direta passava reto |
| RPC `lifecycle_delete_minerador_keywords` | publicada → **soft delete** de 24h; não publicada → DELETE físico em cascata | não recusa: adia |

E havia o agravante: a pergunta "está publicada?" era feita por `p_semantic #>> '{site_origin,publicationStatus}'`. Com `site_origin` serializado pela Lógica (§70), o caminho devolvia NULL, `is_published` virava `false` e a keyword publicada caía no ramo do **DELETE físico**. A trava se desligava sozinha porque o dado mudou de forma.

**Contrato:** nenhuma métrica é motivo. Volume baixo, KGR ausente, zero resultados — nada justifica apagar uma página que está no ar. Publicada percorre os mesmos processos que qualquer outra, sem que seus vínculos sejam alterados. Para desfazer existe ação própria: **Desvincular publicação**.

**Entregue:**

1. `readSiteOrigin` aceita objeto **e** string JSON. Uma trava que se desliga por mudança de formato não é trava; ler as duas formas não repara o banco, só se recusa a confundir "ilegível" com "não existe".
2. A rota recusa antes de qualquer escrita, com `KEYWORD_DELETE_PUBLICATION_PROTECTED` e HTTP 409, nomeando as keywords. **O lote inteiro é recusado** — apagar as outras e avisar depois deixaria o humano sem saber o que aconteceu com o quê.
3. Migration `20260921020000_publicada_nunca_e_apagada.sql`: leitura resiliente no banco e `lifecycle_assert_keywords_not_published`. **Não aplicada** — mudança de banco é decisão do usuário.

**Pendente:** ligar o assert dentro de `lifecycle_delete_minerador_keywords`. Exige substituir a função inteira, e a definição viva deve ser lida do banco antes — reconstruí-la a partir da migration 0047 seria supor que nada a alterou desde então.

## 72. Medição não assina significado — 2026-09-21

A listagem do Minerador baixava o `analise_semantica` inteiro de cada keyword
da marca. Medido em bytes de fio (`length(::text)`, que é o que o PostgREST
serializa): **1 034 kB por carregamento** em 109 linhas, com **98,3% do peso
numa coluna só**. Podar colunas não rende nada; o peso está todo no jsonb.

Dentro dele, quatro arrays somam **209 kB (20%)** e **nenhum é lido pela
tabela** — só o painel do DNA os abre, uma keyword por vez:

| caminho | peso |
| --- | --- |
| `discovery_import.sourceSnapshot.metrics.monthlySearchVolumes` | 69 kB |
| `volume_measurement.monthlySearchVolumes` | 64 kB |
| `dataforseo_keyword_overview_history` | 42 kB |
| `allintitle_measurement_history` | 34 kB |

### POR QUE NÃO BASTAVA PODAR

`approvedPackageContent` punha o `analise_semantica` INTEIRO no conteúdo
assinado. Uma listagem podada é um leitor que sabe menos, e o próprio
contrato já dizia o que aconteceria: *"um campo que a tabela não conhece
faria a keyword parecer divergente só porque quem perguntou sabia menos."*
As 29 aprovadas cairiam todas para `em_revisao` e `buildApprovedPackage`
passaria a devolver `null`, quebrando a entrega ao Arquiteto.

A saída não foi contornar a assinatura e sim corrigi-la.

### ESQUEMA v3

O conteúdo assinado passa a excluir as quatro séries. Isso **não afrouxa
nada**: `volumeSearch`, `resultsAllintitle` e `kgrScore` já são campos
próprios do conteúdo assinado, e a média dentro do bloco de medição continua
assinada. Uma medição que mude o que importa continua rebaixando a aprovação.
O que deixa de acontecer é uma remedição de rotina invalidar a aprovação do
SIGNIFICADO da keyword só porque chegou mais um mês na série.

v1 e v2 seguem verificáveis: cada registro é conferido no esquema que ele
mesmo declara, e `resignApprovalRecord` só re-assina o que ainda batia — um
registro divergente é revisão de verdade, e re-assiná-lo esconderia isso.

### A FONTE ÚNICA

`MEASUREMENT_SERIES_PATHS`, em `lib/minerador/listing-payload.ts`, é a lista
canônica dos quatro caminhos. Dela saem a assinatura v3, a view de listagem e
a hidratação ao expandir — e um teste recusa que a view pode mais caminhos do
que o módulo declara, porque uma trilha a mais devolveria a divergência que o
v3 resolveu.

### A TRAVA QUE TORNA A PODA SEGURA

Há ~20 caminhos de escrita de `analise_semantica` no workspace, vários no
formato `{...item.analise_semantica, ...}`. Gravar a partir de uma linha
podada apagaria a série do banco — a mesma classe de perda silenciosa que a
Lógica causou ao serializar `site_origin` (§70).

Em vez de auditar os vinte, o banco se recusa a perder: o gatilho
`minerador_keywords_preserva_series` **recoloca** a trilha que um UPDATE
omitir. Substituir continua permitido (uma remedição traz a série nova); só
omitir é revertido. Quando o bloco pai inteiro falta, nada é restaurado — a
folha não inventa estrutura que o escritor não mandou.

### LEITURA E HIDRATAÇÃO

A listagem lê `minerador_keywords_listagem`, view `security_invoker` com a
mesma forma de linha da tabela, montada a partir do catálogo para não ficar
para trás quando a tabela ganhar coluna. Se a view não existir — as
migrations são aplicadas à mão —, o cliente recua para a tabela completa e a
tela funciona sem a economia.

Expandir uma linha busca o `analise_semantica` completo daquela keyword e
mescla as séries de volta. A mesclagem é aditiva e o estado corrente da tela
é quem manda: hidratar não ressuscita decisão que mudou desde o carregamento.

## 73. A recusa no caminho real de exclusão — 2026-09-21

§71 estabeleceu que página publicada não se apaga, e criou
`lifecycle_assert_keywords_not_published` para recusar o lote. A função foi
aplicada no banco — e **nenhuma função a chamava**. A trava estava escrita,
correta, e morta.

O caminho real continuava como antes: `lifecycle_delete_minerador_keywords`
fazia SOFT DELETE de 24 horas na keyword publicada. Some da operação,
recuperável até `purge_after`, e depois some de vez.

A única proteção viva era a guarda na rota, que cobre os cliques da tela.
Uma chamada direta à RPC — outro caminho de código, um job, o painel do
Supabase — passava reto.

### DUAS BARREIRAS

1. `PERFORM lifecycle_assert_keywords_not_published(p_brand_id, target_ids)`
   antes de qualquer mutação, recusando o **lote inteiro**. Recusar o lote é
   deliberado: apagar "as outras" e falar da publicada depois deixaria o
   humano sem saber o que aconteceu com o quê.
2. O ramo do publicado deixa de soft-deletar e passa a **abortar**. Não pode
   virar `CONTINUE` nem cair adiante, porque logo abaixo começa o DELETE
   físico em cascata: se essa linha for alcançada, a primeira barreira
   falhou, e o certo é derrubar a transação.

Com a guarda de rota, são três camadas. A da rota continua respondendo
primeiro porque é dela que sai a mensagem com o **nome** das keywords
protegidas; a do banco é o que vale para quem não passa pela rota.

### O CÓDIGO PRECISA CHEGAR À TELA

`lifecycleErrorCode` casa o código por substring na mensagem do banco. Sem
registrar `KEYWORD_DELETE_PUBLICATION_PROTECTED` no mapa de status, a recusa
chegaria como `KEYWORD_DELETE_TRANSACTION_FAILED` 422 — falha genérica, sem
dizer que o motivo foi uma página no ar. Agora é 409, com mensagem própria.

O handler final da RPC reergue `raise_exception` (P0001) sem traduzir, então
a recusa atravessa intacta.

### A LEITURA QUE SUSTENTA TUDO

`lifecycle_keyword_is_published` chama `minerador_keyword_is_published`, que
usa `minerador_keyword_site_origin` — o leitor que tolera `site_origin` como
objeto E como string JSON (§70). Isso importa: uma trava que se desliga
porque o dado mudou de forma não é trava.

### O QUE FOI SUPERADO

A migration histórica 0046 afirma o soft delete de 24 horas para a
publicada. Continua verdadeira **sobre aquele arquivo** — história não muda —
mas não descreve mais o comportamento. O teste que a cobre foi anotado para
não induzir a leitura errada.

## 74. O endereço da publicada não se mexe — 2026-09-21

§71 e §73 trataram de apagar. Falta a outra metade do que o contrato diz
sobre a publicada: **não se mexe no slug**.

### A PROTEÇÃO QUE NÃO PEGAVA

`protect_published_keyword` já recusa, na keyword publicada, mudança de
`status`, `keyword`, `lista_id` e `location`. Ela tenta proteger slug e
canônico também:

```
OR (old_json ? 'slug'      AND new_json->>'slug'      IS DISTINCT FROM ...)
OR (old_json ? 'canonical' AND new_json->>'canonical' IS DISTINCT FROM ...)
```

Só que `minerador_keywords` **não tem coluna `slug` nem `canonical`**. A
guarda `old_json ? 'slug'` é sempre falsa: os dois ramos são código morto,
escritos para um esquema que não é este. O slug e o canônico moram dentro de
`analise_semantica`, que aquele gatilho não olha.

### CONGELAR E REGISTRAR, EM VEZ DE RECUSAR

Quem escreve `analise_semantica` é o Minerador, as rotas de medição e o
import de site da Marca. O Arquiteto só **lê** essa tabela — os
`slug_sugerido` que ele calcula vão para artefatos próprios.

É o import que decide o desenho. Se a página publicada mudar de endereço no
site, uma recusa derrubaria o import inteiro e o sistema **nunca aprenderia o
endereço novo**. Então o declarado permanece, a tentativa é registrada em
`publication_identity_lock_history`, e o humano decide. É o mesmo espírito do
`urlSituation = 'canonical_conflict'` que o código já usa: divergência entre
o declarado e o lido é sinal, não acidente.

Difere de propósito do gatilho de séries (§72), que restaura o que um UPDATE
**omite**. Aqui não é omissão, é sobrescrita ativa — por isso fica registro,
e não apenas a restauração silenciosa.

### O QUE CONGELA

| caminho |
| --- |
| `slug_sugerido` |
| `site_origin.canonicalUrl` |
| `site_origin.declaredCanonicalUrl` |
| `site_origin.resolvedUrl` |
| `site_origin.sourceUrl` |

As três URLs, não só o canônico: o endereço que a tela mostra sai de
`declaredCanonicalUrl || resolvedUrl || sourceUrl`, então mexer numa delas
moveria o endereço exibido com o `canonicalUrl` intacto — a trava pareceria
funcionar sem funcionar.

Desvincular e corrigir legado continuam livres: nenhuma das duas ações toca
esses campos. Depois de desvinculada, a keyword deixa de ser publicada e o
endereço volta a ser editável, que é o correto.

### A TENTATIVA BLOQUEADA NÃO REBAIXA A APROVAÇÃO

`publication_identity_lock_history` fica **fora** do conteúdo assinado. Numa
tentativa bloqueada nada mudou na keyword; deixá-la entrar na assinatura
faria uma rotina externa insistente derrubar a aprovação humana sem que nada
tivesse mudado de fato — exatamente o problema que o esquema v3 (§72) existe
para resolver. Mudança **real** do slug continua rebaixando.

O histórico tem teto de 50 entradas: é sinal para o humano, não arquivo, e a
linha inteira viaja na listagem.

## 75. Publicada sai por decisão declarada — corrige §71 e §73 — 2026-09-21

§71 e §73 afirmam que página publicada **não se apaga**. Está errado, e a
correção vem do dono do produto: o contrato prevê a exclusão de publicada —
ela sai da operação, fica **restaurável por 24 horas** e só então é purgada.

### O QUE A LEITURA ERRADA CUSTOU

Interpretei "não pode apagar de jeito nenhum qualquer keyword publicado" como
recusa total. Troquei o soft delete contratado por um `RAISE` na RPC
(`20260921040000`) e pus uma guarda 409 na rota.

O diálogo **"Remover keywords publicadas por 24 horas"** continuou na tela
oferecendo exatamente o que as duas camadas passaram a negar. Ninguém
esbarrou nisso porque nunca houve uma linha com `deleted_at` — a
funcionalidade estava quebrada e invisível.

O mecanismo de resgate **existe inteiro**: rotas `recoverable`, `restore` e
`purge`, RPCs correspondentes, e a tela chamando as duas primeiras.

### A DISTINÇÃO QUE RECONCILIA

As duas falas não se contradizem quando se separa intenção de acidente:

| caso | desfecho |
| --- | --- |
| apagar de propósito, com confirmação | permitido, janela de 24 h |
| sumir por dedupe, processamento, volume baixo | **recusado** |

A diferença é a **declaração**. O chamador precisa dizer que sabe que há
publicada no lote e que quer a janela; na tela, isso é o diálogo que exige
digitar o nome da keyword.

Esse desenho já existiu aqui: a migration histórica 0046 tinha
`p_allow_recoverable` e o código `KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW`.
Em algum momento o parâmetro sumiu e a RPC passou a soft-deletar sempre, sem
pedir declaração nenhuma — que é o que permitiu o susto original.

### COMO FICA

`p_allow_recoverable boolean DEFAULT false` na RPC. Sem ele, o lote inteiro é
recusado, nomeando as keywords. Com ele, a publicada entra na janela de 24 h.

O `DEFAULT` importa: acrescentar parâmetro cria **sobrecarga**, não
substituição, então a migration derruba a versão de três argumentos antes de
criar a de quatro — e a chamada antiga continua resolvendo enquanto o código
novo não sobe.

A rota **não repete a decisão**. Ter duas fontes de verdade foi o defeito:
a rota negava antes do banco, e a tela oferecia o que a rota negava. Ela
declara o fluxo e deixa o banco decidir.

### O QUE PERMANECE DE §71 E §73

Tudo o mais. A trava continua existindo, chamada quando não há declaração; o
endereço da publicada continua congelado (§74); e nenhuma métrica — volume,
KGR, resultados — entra na decisão de apagar.

## 76. A planilha não organiza silo — 2026-09-21

A coluna **Silo/Categoria** saiu da tabela de keywords.

Silo é decisão de **arquitetura**, tomada no Arquiteto sobre o conjunto
aprovado. Um editor por linha no Minerador competia com aquela etapa: a
pessoa escolhia silo antes de existir arquitetura, e a planilha ficava
sugerindo uma organização que o Arquiteto depois refaz.

### O QUE SAIU E O QUE FICOU

Saiu o **editor por linha**: cabeçalho, célula, alça de redimensionamento,
largura, e o handler `handleUpdateKeywordList`, que só ele chamava. A classe
`mineradorTableSelectClass` ficou órfã junto e saiu também.

`lista_id` **não saiu**, e não deveria: ele filtra o carregamento da marca, é
destino da importação e alimenta o movimento em lote (`handleBatchMove`) —
organização de trabalho, não arquitetura. O painel do DNA continua mostrando
"Lista/Silo atual" no contexto publicado.

### A LINHA EXPANDIDA ACOMPANHA

O Perfil atravessa a tabela inteira por `colSpan`. Uma coluna a menos exige
14 no lugar de 15, ou o painel desalinha. Um teste passa a comparar o
`colSpan` com a contagem real de células da linha, em vez de fixar o número.

### UMA ARMADILHA ENCONTRADA NO CAMINHO

Os testes de layout fatiavam o cabeçalho com `page.indexOf("</thead>")` — e a
tabela usa `<KeywordTableHeader>`, não `<thead>`. O `indexOf` devolvia `-1`, a
fatia virava o arquivo quase inteiro, e a asserção media outra coisa. Passava
por acaso. As fatias novas usam `</KeywordTableHeader>` e conferem que o
marcador foi mesmo encontrado.

### 76.1 O lote do rodapé saiu junto — 2026-09-21

"Mover para Silo" também foi removido da barra do rodapé, pela mesma razão:
*aqui não se mexe em silo, só se declara o tipo de página que a keyword é ou
pode vir a ser*.

Saíram o controle (rótulo, select e botão), o handler `handleBatchMove` e o
comentário que o anunciava. O menu secundário fica com o handoff ao Arquiteto
como única ação estrutural.

#### CONSEQUÊNCIA QUE PRECISA DE DECISÃO

Aquele select era o **único lugar onde um humano escolhia `targetListId`** — e
`targetListId` não serve só ao movimento: é o **destino da importação** (site
e CSV). Os outros escritores são programáticos: a primeira lista da marca no
carregamento, e a limpeza ao trocar de marca.

Com o controle removido, a importação passa a usar sempre a primeira lista,
sem como escolher outra. O modal continua **dizendo** qual é ("A lista de
destino é X"), então não é silencioso — mas deixou de ser selecionável.

O lugar certo para esse seletor é o próprio modal de importação, onde a
escolha tem contexto. Não foi feito aqui porque é UI nova, não remoção.

## 77. SERP nas 4 lentes e derivação v4 da intenção e do funil — 2026-09-23

Decisão do usuário: as 4 lentes (desktop-windows, desktop-macos, mobile-android, mobile-ios) valem em todo ponto de SERP orgânica, desde a primeira coleta, e a intenção e o funil passam a ser lidos nelas. Escopo e revisões no [adendo](propostas/adendo-derivacao-v4-quatro-lentes-2026-09-23.md).

**Coleta.** A rota de Resultados (Processador e "Medir resultados" da Descoberta) garante as 4 lentes no cache da marca. Paga só as que faltam, com quota parcial e lacuna sem derrubar o alvo.
- Canônica: corpo em depth 20.
- Extras: meta, observação e `payload.digest` (top 10 com os campos que o classificador lê) em depth 10, sem corpo.

**Classificador v4** (`serp-semantic-derivation-v4`, mesmos limiares):
- **R1:** palavra inteira, com plural simples (s/es); o termo que a v3 já escrevia exato segue exato.
- **R2:** placar por campo. O título pesa 2; descrição ou snippet, pre/extended snippet e o **rótulo humano** do breadcrumb pesam 1. **Tokens de URL e o `website_name` pesam 0**: a URL não decide intenção (invariante 13).
- **R4:** conteúdo em rede social não é perfil nem produto.
- **R5:** varejista do bloco de produtos da mesma SERP, por igualdade exata normalizada, só para resultado mudo.
- **R6:** título de lista numerada preenche Informativa/TOFU.
- **R7:** `short_videos`, `top_stories` e `scholarly_articles` reforçam Informativa/TOFU; avaliações, perspectivas e fóruns são registrados com peso 0.
- **R8:** URL distinta; em `/watch` o parâmetro `v` identifica a página.
- A amostra guarda os orgânicos distintos com o placar.

**Nas 4 lentes.**
- Cada URL distinta conta uma vez, com a máscara das lentes, e recebe o rótulo da maioria das lentes que a leram.
- Com duas ou mais lentes lidas, um bloco só reforça se aparecer em duas ou mais.
- Concordância e `deviceSplit` são registro, não reforço.
- Lente sem digest conta como faltante.
- Datas com mais de 7 dias de diferença são só marcadas; a recoleta é manual.
- A Qualificação ganha `lensEvidence`, e o `evidencia_serp` ganha `lentes` e, nos eixos mistos, os rótulos e a cobertura, com teto de 700 B.

**Tela.** Quando a Lógica diria "Ambíguo" e a SERP vigente está mista com cobertura ≥ 0,5, a tela mostra "Misto na SERP (A × B)". O valor canônico e a assinatura não mudam. O painel da Qualificação mostra "SERP · K de 4 lentes", a concordância e a divergência entre aparelhos.

**Continua valendo a §63.** SERP conclusiva prevalece sobre a Lógica e sobre a decisão humana; o humano invalida, não substitui. Leitura nova conclusiva que muda o canônico rebaixa a aprovada. As lentes também podem **tirar** conclusão: um bloco visto só na canônica deixa de reforçar.

```text
SERP_LENSES_EVERYWHERE = YES (decisão do usuário)
MINERADOR_INTENT_FUNNEL_FROM_4_LENSES = YES
LENS_AGREEMENT_IS_REINFORCEMENT = NO
URL_TOKENS_DECIDE_INTENT = NO
AUTOMATIC_RECOLLECTION = NO
```

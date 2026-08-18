# SDD — Migração do Minerador para Google Ads e retirada completa da Extensão

> **Status:** decisão arquitetural aprovada; não implementada.
> **Módulo proprietário:** Minerador.
> **Data:** 2026-08-02.
> **Limite desta tarefa:** auditoria e documentação. Não autoriza mudança de código, `.env`, dependências, banco, Extensão, RapidAPI, APIs externas, commit, push ou deploy.

## Problema e objetivo

Hoje o Minerador divide a operação entre APP e Extensão Chrome. A APP administra a planilha, qualificação e persistência; a Extensão mantém popup, service worker, bridge, relay, permissões Chrome, uma aba Google e CAPTCHA para extrair sugestões e medir `allintitle`. O objetivo aprovado é concentrar a inteligência de keywords na APP, com Google Ads server-side, e só retirar a Extensão/RapidAPI depois de paridade funcional validada.

Google Ads não oferece contador `allintitle` equivalente ao leitor atual. A migração não pode declarar que Ads substitui concorrência orgânica, nem inventar valores equivalentes. Serper permanece o provider canônico do Radar para análise da primeira página e evidências SERP: Google Ads não o substitui, não o altera e esta SDD não modifica contratos, provider ou fluxo do Radar.

## Estado confirmado e limites de evidência

| Item | Evidência | Estado nesta SDD |
| --- | --- | --- |
| Variáveis `GOOGLE_ADS_*` | Nomes verificados localmente, sem ler valores | Os cinco nomes informados existem; valores e escopo não são registrados. |
| OAuth, developer token e contas acessíveis | Relato e verificação controlada anterior | OAuth respondeu e havia duas contas acessíveis; não houve chamada nesta tarefa. |
| Conta anunciante por marca | Auditoria | Ainda não definida. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` é MCC/manager, não a conta alvo. |
| Cliente Google Ads no Minerador | Código | Não existe cliente, rota, persistência ou UI Google Ads implementados. |
| Dependências | Código | `googleapis` está instalado, mas não é usado pelo Minerador; não há biblioteca específica Google Ads. |
| Volume | Código | `/api/volume` e a rota legada da Extensão usam RapidAPI `seo-keyword-research-tool1/global-volume`. |
| Allintitle | Código e relato manual | A Extensão controla a aba Google e o endpoint server-side persiste resultados confirmados. |

Esta SDD não fez chamada Google Ads, RapidAPI, Google Search, Supabase ou qualquer serviço remoto.

## Inventário da Extensão e destino

| Área | Arquivos | Função atual | Destino |
| --- | --- | --- | --- |
| Popup | `popup.html`, `popup.js` | Login transitório, marca/lista, extração, filtros, seleção e importação | Painel interno do Minerador; remover só após paridade. |
| Service worker | `background.js` | Autocomplete, candidatas, lote allintitle, aba Google, alarmes, CAPTCHA, notificações, reconciliação e persistência | Ideias migram para Ads; lote/aba/CAPTCHA deixam de existir na alternativa A. |
| Bridge | `minerador-panel-bridge.js` | Transporte popup/página/runtime, probe e handshake | Remover ao encerrar operações Chrome. |
| Relay | `minerador-extension-relay.js` | Comandos/eventos allintitle por `postMessage` | Remover com bridge. |
| Leitor | `allintitle-google-reader.js` | Lê contador e classifica bloqueio/CAPTCHA | Remover na alternativa A; provider SERP separado somente se alternativa B for aprovada. |
| Página APP | `minerador-extension-handshake-responder.tsx`, página Minerador | ACK de ator/marca/tenant para handshake v2 | Remover com bridge/relay, preservando autorização normal da APP. |
| Manifest/config | `manifest.json`, `config.*.js`, `README.md` | Permissões, hosts e configuração pública da Extensão | Remover no fechamento da Extensão; nunca migrar credenciais Ads para cliente. |

Funções já existentes na APP: rota tenantizada, planilha, importação manual/CSV, seleção, filtros, histórico, exportação, qualificação, decisão humana de KGR, Site/Sitemap, atualização localizada de `keywords_kgr`, `/api/volume`, normalização/persistência de volume, exibição de volume/allintitle/KGR e endpoint server-side de `results_allintitle`.

## RapidAPI e consumidores

O provider atual é `seo-keyword-research-tool1.p.rapidapi.com/global-volume`, país `br`, com correspondência exata em `Keyword Overview.BR`.

| Consumidor | Papel | Migração prevista |
| --- | --- | --- |
| `app/api/volume/route.ts` | Volume da planilha | Trocar internamente por Google Ads depois de fixtures e smoke test; manter contrato de UI compatível durante rollout. |
| `app/api/extensao/marcas/[brandId]/volume/route.ts` | Volume do legado da Extensão | Congelar/remover junto da Extensão, após paridade. |
| `lib/minerador/volume-provider.ts` | Tipos, normalizadores e patch volume/KGR | Preservar partes neutras; adicionar adaptador Google Ads sem misturar contratos. Remover RapidAPI só na fase final. |
| `modules/minerador/minerador-workspace.tsx` | Chama `/api/volume`, persiste e atualiza tabela | Migrar para rota Ads preservando seleção e falha segura. |
| `minerador-extensao/*` | Estado/importação legada de volume | Remover somente no encerramento da Extensão. |
| `.env.example`, testes | Variáveis, fixtures e normalizadores | Atualizar/remover somente quando não houver consumidor. |

## Métricas, KGR e consumidores compartilhados

O registro atual contém `volume_search`, `results_allintitle`, `kgr_score`, `intent`, `status`, `lista_id` e `analise_semantica`. Volume e allintitle são independentes. KGR é calculado apenas com volume maior que zero, resultado confirmado e aplicabilidade diferente de `not_applicable`.

`volume_search` é usado por tabela, filtros, ordenação, exportação, decisão KGR e patch no Minerador; pelo Arquiteto em adaptadores, formação, contexto e ordenações; pelos contratos editoriais; e indiretamente pelo Radar via ArticleDNA/contexto. `results_allintitle` e `kgr_score` seguem pelos adaptadores/contexto para Arquiteto e Radar sem recálculo silencioso.

Invariantes de compatibilidade:

- não apagar/reinterpretar `results_allintitle`, `kgr_score` ou `volume_search` históricos;
- ausência de allintitle não vira zero, não-KGR ou aprovação;
- ausência de volume não vira zero;
- KGR não é aprovação editorial;
- Arquiteto e Radar não são alterados silenciosamente;
- origem da nova medição permanece rastreável na keyword.

## Google Ads: capacidades, conta e segmentação

### Capacidades confirmadas

`KeywordPlanIdeaService.GenerateKeywordIdeas` suporta keyword, URL, keyword + URL e site/domínio, com idioma, localização, rede, paginação e métricas históricas. `GenerateKeywordHistoricalMetrics` é o contrato para keywords já selecionadas e pode trazer média mensal, série mensal, concorrência/índice de Ads e lances de topo em micros. Quando CPC médio fizer parte da resposta esperada, o request deve enviar `historical_metrics_options.include_average_cpc = true`.

Normalização planejada:

- `avg_monthly_searches` → `volume_search`;
- `monthly_search_volumes` → série histórica;
- concorrência de Ads e índice permanecem distintos de concorrência orgânica;
- `low_top_of_page_bid_micros`, `high_top_of_page_bid_micros` e `average_cpc_micros` preservam micros até a camada de apresentação;
- origem, versão, targeting, data e `request-id` seguro acompanham a medição.

### Autenticação e conta por marca

O servidor renova token usando `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET` e `GOOGLE_ADS_REFRESH_TOKEN`; o developer token fica apenas no servidor. `GOOGLE_ADS_LOGIN_CUSTOMER_ID` identifica a MCC/manager quando aplicável, mas cada consulta exige uma conta anunciante (`customer_id`) alvo autorizada.

Antes de código real, definir a conta anunciante de cada marca. Não assumir a primeira conta acessível ou uma conta global. Uma conta compartilhada somente é válida com aprovação explícita; caso contrário, marca → conta é decisão estrutural posterior, com autorização, RLS e rollback. Nenhum segredo, token, MCC ou conta desnecessária vai ao browser.

O primeiro targeting deve ser explícito (Brasil, português e rede escolhida), usando constantes oficiais resolvidas no servidor. Métricas monetárias chegam em micros; `currencyCode` e `timeZone` são obtidos da conta anunciante alvo por `Customer` ou `CustomerClient`, nunca inferidos da resposta de métricas nem presumidos como BRL. A medição normalizada recebe a moeda da conta já validada. Contas ou moedas diferentes nunca são somadas ou comparadas silenciosamente.

## Decisão sobre allintitle

### Decisão aprovada — retirada de allintitle do núcleo de keywords novas

Retirar allintitle e KGR do núcleo obrigatório das keywords novas:

1. preservar `results_allintitle`, metadados e KGR históricos;
2. permitir importação/qualificação sem allintitle;
3. mostrar ausência de forma explícita, nunca como `0`;
4. usar Google Ads, intenção, coerência da marca, SERP do Radar quando aplicável e decisão humana na nova triagem;
5. só calcular KGR novo quando houver fonte allintitle explicitamente aprovada; caso contrário, fica indisponível;
6. eliminar aba Google, CAPTCHA, notificações e Extensão.

### Provider aproximado futuro — frente separada

Um provider SERP futuro pode dar aproximação de allintitle, mas exige SDD própria: ação explícita, custo/quota/cache documentados, origem `serp_provider_approximate`, smoke test, fixtures, falha sem zero e nenhuma chamada em testes. Não é requisito desta migração. Custom Search JSON API não é solução estrutural.

Serper continua canônico no Radar para primeira página e evidências SERP. Um provider aproximado de allintitle não substitui o Serper, não altera o Radar e não é pré-requisito da migração Google Ads.

## Arquitetura-alvo

```text
lib/google/
  oauth/google-ads-token.ts       # refresh server-side e cache curto
  ads/config.ts                   # GOOGLE_ADS_API_VERSION server-side e atualização controlada
  ads/client.ts                   # REST, headers e request-id seguro
  ads/accounts.ts                 # conta target autorizada por marca
  ads/ideas.ts                    # KeywordPlanIdeaService
  ads/historical-metrics.ts       # GenerateKeywordHistoricalMetrics
  ads/normalization.ts            # volume, série, micros e moeda
  ads/errors.ts                   # auth/quota/targeting sem segredos
  ads/fixtures/                   # testes sem rede
```

Não criar cliente genérico que misture Search Console, Business Profile, PageSpeed/CrUX ou Trends. Essas integrações são frentes futuras independentes.

Rotas propostas:

```text
POST /api/minerador/google-ads/ideas
POST /api/minerador/google-ads/historical-metrics
```

Ambas exigem: autenticação canônica vigente; `brandId` resolvido no servidor; owner/membership; coincidência entre tenant e input; conta Ads autorizada para a marca; ação explícita; Zod; `requestId`; e resposta sem segredo. Primeiro rollout usa `cache: "no-store"` ou cache server-side com chave `brandId + customer + targeting + input normalizado + versão`, TTL documentado e isolamento de tenant. Sem prefetch, polling ou chamada no carregamento.

Contratos mínimos:

```ts
type GoogleAdsTargeting = {
  country: "BR";
  language: "pt";
  geoTargetConstant: string;
  languageConstant: string;
  network: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
};

type GoogleAdsIdeaRequest = {
  brandId: string;
  mode: "keyword" | "url" | "keyword_and_url" | "site";
  keywords?: string[];
  url?: string;
  targeting: GoogleAdsTargeting;
  pageToken?: string;
};

type GoogleAdsHistoricalMetricsRequest = {
  brandId: string;
  keywords: string[];
  targeting: GoogleAdsTargeting;
};
```

A resposta normalizada contém keyword, média mensal, série mensal, concorrência/índice Ads, lances/CPC em micros, moeda, fonte `google_ads`, versão, data, targeting e `googleAdsRequestId`.

`GOOGLE_ADS_API_VERSION` ou constante server-side equivalente deve apontar somente para versão suportada, ficar fora do navegador e compor `providerVersion` na proveniência. Atualizações de versão são controladas e exigem regressão dos contratos antes de upgrade. `customerId` e MCC não fazem parte da resposta do browser.

## Persistência recomendada

### Aditiva, sem migration — recomendada na primeira paridade

Manter `volume_search = avg_monthly_searches` e acrescentar proveniência/histórico em `analise_semantica`, já usado por `volume_measurement` e histórico:

```text
google_ads_measurement = {
  source, providerVersion, measuredAt, targeting, currencyCode, accountRef,
  averageMonthlySearches, monthlySearchVolumes, competition, competitionIndex,
  lowTopOfPageBidMicros, highTopOfPageBidMicros, averageCpcMicros,
  googleAdsRequestId
}
google_ads_measurement_history = [ medições anteriores com a mesma proveniência ]
```

Uma mudança real move a medição anterior para o histórico. Falha, keyword ausente, quota, targeting inválido ou schema inesperado não alteram volume, allintitle, KGR ou evidência anterior. O patch é atômico por keyword, idempotente e marca a origem Ads sem esconder o `volume_measurement` retrocompatível.

Exige teste de tamanho do JSON e retenção não destrutiva. Uma entidade própria de medições seria melhor para histórico longo, mas requer migration, RLS, rollback e aprovação posterior; não é necessária nem autorizada agora.

## Interface-alvo planejada

Adicionar **Inteligência de Palavras-Chave** dentro do Minerador, sem redesenhar a planilha atual:

- modos: keyword semente, URL, keyword + URL e site/domínio apenas se limites oficiais forem aprovados;
- targeting visível; resultados com keyword, volume médio, histórico/tendência, CPC, Ads competition/índice, lances, moeda, origem, data, intenção, status e seleção;
- seleção independente da renderização e importação seletiva/idempotente para a marca ativa;
- paginação, vazio, loading, quota e erro seguro;
- detalhes em popover/painel acessível, sem tabela concorrente;
- nenhuma chamada ao abrir a tela.

Reutilizar tabela, controles, badges, foco, dark mode e responsividade de `docs/compartilhado/sistema-visual.md`; validar 360/768/1024/1440, hover, foco, disabled, loading e erro.

## Plano de migração

| Fase | Entrada | Saída/aceite | Risco, rollback e operação manual |
| --- | --- | --- | --- |
| 1. Inventário/allintitle | Esta SDD | Decisão aprovada registrada: histórico preservado e keywords novas sem allintitle/KGR | Sem código; manter estado atual. |
| 2. Contrato Ads | Conta alvo e targeting | Zod, erros, cache e vínculo marca/conta aprovados | Conta errada; nenhuma chamada antes da configuração. |
| 3. Provider/fixtures | Contrato | `lib/google/ads` e testes sem rede | Segredo/log/schema; código ainda não ligado à UI. |
| 4. Smoke de uma keyword | Provider | Resultado comparado ao UI Google Ads, sem lote | Quota/conta/targeting; autorização explícita e operação humana. |
| 5. Painel interno | Smoke aprovado | Ideias/métricas, paginação e estados | Regressão visual; feature flag/local. |
| 6. Importação seletiva | Painel | Keywords `bruto`, idempotentes e brand-scoped | Duplicidade; snapshot/rollback por lote, sem limpeza automática. |
| 7. Volume | Persistência aditiva | `Medir volume` usa Ads, preservando campos antigos em falha | KGR/Arquiteto; reativar provider anterior apenas enquanto existir. |
| 8. Paridade | Fases 4–7 validadas | Checklist sem popup para funções migradas | Fluxo incompleto; Extensão permanece. |
| 9. Congelar Extensão | Paridade assinada | Sem funções novas, só correção crítica | Usuários em operação; descongelamento registrado. |
| 10. Remover Extensão | Paridade aprovada + sem operação ativa | Popup, worker, bridge, relay, reader, handshake, rotas/docs/permissões exclusivas removidos | Perda de allintitle novo; restaurar artefato versionado, sem apagar histórico. |
| 11. Remover RapidAPI | Ads validado e busca de consumidores vazia | Env, rotas, normalizadores, fixtures e docs removidos | Provider falha; rollback só antes da remoção. |
| 12. Limpeza/documentação | Busca e testes | Exclusões pequenas e docs reais | Código morto; reversão de código, nunca dados. |
| 13. Minerador → Arquiteto | Dados controlados | Origem/volume chegam sem decisão editorial automática | Mistura/normalização; interromper rollout preservando dados. |

Nenhuma fase posterior é autorizada apenas por esta SDD.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Conta Ads errada ou compartilhada indevidamente | Vínculo marca → conta definido antes de chamadas; MCC separado do customer alvo. |
| Mistura entre marcas | `brandId` em rota/cache/persistência; autorização e conta resolvidas no servidor. |
| Ads confundido com SEO orgânico | Campos/origens distintos; allintitle histórico não é substituído. |
| KGR histórico perdido | Sem reprocessamento/apagamento em massa. |
| Quota/schema/provider | Falha segura, retry manual, fixtures e sem zero implícito. |
| JSON crescer | Medir limite/retenção não destrutiva; entidade própria só com SDD/migration. |
| Remover Extensão cedo | Paridade e checklist manual são gates. |
| Segredo em cliente/log | Server-only; sanitizar erro; expor apenas requestId seguro. |
| Regressão Arquiteto/Radar | Fixtures com/sem allintitle e validação ponta a ponta. |

## Testes e aceite futuros

Automatizados, sem API paga: OAuth mockado; headers MCC/customer; ideias nas quatro sementes; paginação/targeting/Zod; média/série/micros/moeda; `include_average_cpc`; versão Ads suportada e regressão de contrato antes de upgrade; quota/erro; patch/histórico/idempotência; owner/membership/tenant/cache; seleção/importação; KGR sem inferência; adaptadores Arquiteto/Radar; e busca de referências Extensão/RapidAPI vazia antes da remoção.

Validação manual: confirmar conta/targeting; comparar uma keyword ao Keyword Planner; conferir série/CPC/moeda; testar sementes; importar sem duplicar/misturar marcas; medir volume sem alterar allintitle/KGR históricos; qualificar keyword nova sem allintitle; validar Minerador → Arquiteto; revisar dark/light nos quatro widths; e só então retirar Extensão/RapidAPI.

## Documentação, fora de escopo e autorizações pendentes

Depois de cada fase aprovada, atualizar `spec.md`, `estado-atual.md` e `backlog.md`, distinguindo código, teste, validação manual e pendência. Uma ADR será necessária para vínculo permanente marca → conta Ads ou entidade estrutural de medições.

Fora de escopo: Search Console, Business Profile, PageSpeed/CrUX, Trends e SERP real do Radar. Cada um requer cliente, contrato, custo, origem e autorização próprios.

Decisões aprovadas: retirada completa da Extensão somente após paridade; preservação de allintitle e KGR históricos; keywords novas podem existir sem allintitle e KGR; ausência permanece `null`/indisponível, nunca zero; Serper permanece no Radar.

Autorizações necessárias: (1) conta anunciante por marca; (2) targeting/cache; (3) primeira chamada real/smoke; (4) código das fases 2–7; (5) migration, se escolhida; e (6) remoção final de Extensão/RapidAPI após paridade. Esta SDD não autoriza código automaticamente.

## Referências oficiais

- <https://developers.google.com/google-ads/api/rest/auth>
- <https://developers.google.com/google-ads/api/docs/keyword-planning/generate-keyword-ideas>
- <https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics>
- <https://developers.google.com/google-ads/api/reference/rpc/v21/KeywordPlanHistoricalMetrics>

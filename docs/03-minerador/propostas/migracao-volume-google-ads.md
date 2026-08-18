# SDD — Migração do provider de volume para Google Ads

Status: **Aprovada para implementação nesta solicitação.**

## Problema e contrato anterior

`/api/volume` recebia textos do navegador, consultava RapidAPI e devolvia uma lista para que a própria página atualizasse `keywords_kgr`. Esse caminho exigia `RAPIDAPI_KEY`, não versionava a métrica e não mantinha a conta Ads vinculada à marca.

## Contrato implementado

`POST /api/minerador/marcas/[brandId]/google-ads/metricas-keywords` recebe somente `keywordIds` e `operationRequestId`. O servidor resolve o ator autenticado, permissão `minerador:edit`, marca da rota, conexão da marca, targeting e conta Ads; o navegador nunca envia customerId, MCC, moeda, fuso ou segredo.

O vínculo é `brand_id → customer_id/login_customer_id/targeting/status/validated_at`. Não há conta global, fallback para Adalba ou resolução por slug, nome ou owner. A conta é novamente consultada por `Customer` para moeda e timezone.

## Persistência e compatibilidade

A migration local `0007_minerador_google_ads_volume.sql` cria:

- `minerador_google_ads_connections`: uma conexão validada por marca;
- `minerador_keyword_metric_measurements`: medições imutáveis por keyword e operação, incluindo série mensal, Ads competition, bids/CPC em micros, moeda, fuso, targeting, provider e versão.

O servidor grava a medição como `received`, atualiza a projeção compatível `keywords_kgr.volume_search` somente após a gravação e então finaliza como `persisted`. Falhas e itens não retornados mantêm projeção, KGR, allintitle e histórico anteriores. `null` nunca vira zero.

## Lotes, erros e segurança

O lote da interface é particionado internamente em grupos de até 10.000, processados em sequência. Respostas parciais retornam `GOOGLE_ADS_PARTIAL_RESULTS`; conexão ausente/inválida, keyword de outra marca e quota usam códigos estruturados. Diagnósticos carregam somente estágio, contagens, request IDs seguros e `apiRequestStarted`.

RLS usa `can_access_brand` e `tenant_actor_has_permission`; `anon` não recebe acesso. OAuth, developer token, refresh token e client secret ficam exclusivamente server-side.

## Cadastro e validação da conexão

`POST /api/minerador/marcas/[brandId]/google-ads/conexao` é separado da rota de métricas e só aceita owner, administrador da marca ou administrador global com permissão `minerador:manage`. Recebe customerId completo, MCC opcional e targeting; não recebe nem armazena segredos OAuth.

Antes de gravar, o servidor reutiliza `Customer` da fundação Google Ads. Somente depois de confirmar acesso via MCC, `currencyCode`, `timeZone` e a conta alvo, a conexão é gravada como `validated`. A rota devolve apenas referências mascaradas. `GET` na mesma rota mostra o estado e targeting da conexão, sem IDs completos. A rota de métricas continua aceitando apenas IDs de keywords, jamais customerId.

Operação manual após a migration: um owner/admin autenticado cadastra a conexão da Adalba pela rota com o customerId e MCC reais. Lindisse permanece sem registro até possuir uma conexão própria; não deve receber dados da Adalba.

## Consumidores e legado

A barra do Minerador chama a nova rota e reconcilia apenas projeções já persistidas. Arquiteto e Radar continuam lendo a projeção `volume_search`, sem mudança em allintitle ou KGR histórico. `/api/volume` e a rota de volume da Extensão agora respondem explicitamente que o fluxo mudou; não executam RapidAPI e não existe fallback silencioso. `lib/minerador/volume-provider.ts` permanece congelado enquanto os normalizadores/testes legados tiverem consumidores.

Rollback: não aplicar a migration; depois de aplicada, desabilitar a conexão da marca e retornar a interface à rota anterior somente por mudança de código aprovada. Nenhuma medição histórica é apagada.

## Testes e validação manual

Testes simulam Google Ads, lote, correspondência e projeção sem rede. A validação manual requer aplicar a migration, cadastrar e validar a conexão da Adalba, testar uma keyword, recarregar, confirmar histórico, testar lote maior que 10.000 e confirmar que Lindisse sem conexão recebe erro sem fallback.

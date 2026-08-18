# SDD — Métricas Google Ads no Arquiteto e KGR opcional

## Status

Proposta implementada como extensão aditiva e retrocompatível do contrato do Arquiteto. Esta decisão não autoriza migration, escrita remota, reprocessamento de registros existentes ou alteração do Minerador.

## Escopo e fronteiras

O Minerador permanece proprietário da integração Google Ads, da renovação das métricas e da normalização da resposta. O Arquiteto recebe somente evidências normalizadas já presentes na proveniência da KeywordDNA.

O Arquiteto não acessa API Google Ads, credenciais, customerId, MCC, resposta bruta, campanhas, grupos de anúncios ou lances. Serper continua sendo a fonte de validação orgânica/SERP.

Não há alteração de layout da planilha, persistência, filtros, ações editoriais ou contratos de outros módulos.

## Auditoria do contrato atual

O contrato atual do Arquiteto possui `volume_search`, `results_allintitle` e `kgr_score` opcionais e anuláveis em `ArchitectKeyword`/`KeywordDNA`. `ArticleKeywordReference` preserva volume, allintitle, KGR e snapshot integral da keyword. `ArticleDNA` exige uma principal e aceita no máximo cinco referências de apoio.

O Minerador já possui campos semânticos opcionais para medições e histórico de allintitle, volume e KGR. A proposta do contrato Ads prevê `google_ads_measurement` e `google_ads_measurement_history` dentro de `analise_semantica`, contendo média mensal, série mensal, competição Ads, índice, CPC/lances, origem, versão, data, targeting e referência segura da medição. O checkout também possui normalizadores Google Ads, mas a persistência/importação dessa medição no fluxo Minerador → Arquiteto não é alterada nesta tarefa.

## Contrato aditivo consumido pelo Arquiteto

O Arquiteto adiciona um `demandEvidence` opcional à keyword e às referências do ArticleDNA:

- `historicalKgr`: `resultsAllintitle` e `kgr` são `number | null`; o status distingue `available`, `historical`, `not_measured`, `not_applicable`, `unavailable`, `error` e `unknown`;
- `googleAds`: média mensal e série mensal são anuláveis; competição é explicitamente Ads; CPC/lances permanecem em micros; `source`, `providerVersion`, `measuredAt`, targeting e snapshot são proveniência;
- close variants são mantidas como proximidade textual, sem decisão de agrupamento;
- identificadores de conta e resposta bruta são descartados pelo adaptador do Arquiteto;
- a ausência do envelope não invalida a KeywordDNA.

`null` significa indisponível ou não medido. Nenhum adaptador converte ausência em zero. Zero numérico recebido continua sendo zero válido.

## Normalização e proveniência

O adaptador lê exclusivamente o envelope normalizado `google_ads_measurement` e, quando presente, seu histórico. Ele não interpreta payload bruto do provider. A keyword original, a referência de versão, o hash e `sourceKeywordSnapshot` continuam preservados.

Atualizações de métricas são evidências novas. Elas podem compor uma nova versão quando o pipeline proprietário do Minerador fornecer o envelope, mas não substituem decisões humanas, principal confirmada, URL, slug, canonical, marca ou política de publicação.

## Uso estratégico

- volume Ads pode contextualizar demanda e estratégia, mas não escolhe sozinho a principal;
- CPC e competição Ads não são dificuldade orgânica;
- tendência/sazonalidade são sinais de planejamento, não calendário aprovado;
- close variants não agrupam nem removem keywords;
- ausência de allintitle/KGR não bloqueia agrupamento, formação ou aprovação;
- KGR histórico é evidência auxiliar e nunca é recalculado pelo Arquiteto;
- a validação SERP continua independente e canônica no Radar.

## Consumidores e compatibilidade

O ArticleDNA transporta a evidência por `keywordReferences`, preservando o limite de uma principal e até cinco apoios. Radar e Planejador já recebem ArticleDNA/ArticleControlContext e ignoram campos opcionais desconhecidos; não há mudança no contrato deles nesta etapa. Registros legados sem `demandEvidence` continuam válidos.

## Versionamento, hash e rollback

O envelope KeywordDNA/ArticleDNA continua versionado e com hash do payload. Uma evidência nova altera o hash somente quando fizer parte de uma nova versão criada pelo fluxo autorizado; não há mutação da versão aprovada nem regravação automática. Rollback consiste em manter a versão anterior e não anexar a medição incompleta; não há migration para desfazer.

## Riscos e mitigação

- confundir Ads com orgânico: nomes e tipos separados e testes de não equivalência;
- transformar ausência em zero: normalizador retorna `null`;
- perder keywords originais: snapshot e IDs permanecem obrigatórios;
- sobrescrever decisão humana: adaptador somente transporta evidência;
- receber dados ainda não normalizados: envelope é opcional e é ignorado com segurança.

## Testes e validação

Testes locais cobrem KGR ausente/nulo, KGR histórico, média Ads nula versus zero, CPC/competição separados, close variants sem agrupamento, preservação do snapshot e formação com ArticleDNA sem KGR. Também devem permanecer verdes os testes existentes do Arquiteto, fluxo operacional, TypeScript e `git diff --check`.

Validação manual pendente: importar uma keyword enriquecida pelo Minerador em sessão autenticada, conferir que a planilha não muda de layout, que a evidência aparece somente no contexto autorizado, que uma medição não altera decisão humana e que Radar/Planejador recebem a mesma proveniência. Nenhuma chamada paga ou remota é feita pelos testes.

## Fora de escopo

Alterar Minerador, schema/persistência, migrations, UI da planilha, Google Ads, Serper, Radar, Planejador, publicação ou decisões humanas.

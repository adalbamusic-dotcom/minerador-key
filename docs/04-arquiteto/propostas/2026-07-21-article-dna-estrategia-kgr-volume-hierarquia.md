# SDD — ArticleDNA como contexto estratégico de KGR, volume e hierarquia

## Status

Proposta para implementação local, sem reprocessamento de dados existentes e sem alterações remotas.

## Contexto e problema

O Arquiteto já produz `ArticleDNA`, `ArticleIntentProfile`, referências de `KeywordDNA`, relações keyword–URL, estado arquitetural e identidade KGR. Esses dados, porém, ainda não formam uma visão estratégica única: intenção, contribuição individual, volume, hierarquia, propósito editorial e proteção de identidade permanecem parcialmente distribuídos entre campos existentes e heurísticas de consumo.

Isso permite interpretações divergentes. Volume não pode, sozinho, escolher a principal; um score KGR, slug parecido ou similaridade textual não confirma KGR; uma keyword secundária deve ampliar alcance sem criar uma nova intenção; e uma keyword de reforço deve completar a narrativa sem receber volume inventado. Conteúdo publicado deve manter sua identidade, mas uma principal ainda candidata não deve ser congelada sem confirmação humana.

## Objetivo

Tornar o `ArticleDNA` o contexto estratégico central do artigo, preservando os contratos existentes e expondo uma projeção determinística `ArticleControlContext` para IA, SERP e transferências operacionais.

O fluxo continua:

```text
Minerador → Arquiteto → Radar → Planejador → Redator → Publicações
```

Esta proposta não implementa telas, workflows ou regras proprietárias de Radar, Planejador, Redator ou Publicações. Consumidores receberão contexto opcional do Arquiteto, sem duplicar a fonte de verdade.

## Regras estratégicas

- KGR confirmado vincula a keyword principal ao slug.
- Em um artigo KGR novo, o slug nasce da principal e permanece candidato até a confirmação arquitetural humana; depois, o par principal–slug fica confirmado e protegido.
- Em KGR publicado e confirmado, principal e slug permanecem juntos.
- A intenção do artigo é herdada da principal; secundárias e reforços não substituem a intenção central.
- Secundárias ampliam alcance e volume compatível. Reforços completam entidades, subtemas e a narrativa sem volume artificial.
- Um artigo contém de 2 a 6 `KeywordDNA` quando houver material compatível; não há preenchimento artificial.
- A hierarquia combina volume, centralidade semântica, abrangência tópica, capacidade de ligação no silo e prioridade de negócio. Volume isolado não decide.
- Artigo publicado confirmado é melhorado ao redor da identidade existente.
- Artigo publicado com principal candidata protege URL, slug e canonical, mas mantém a principal corrigível até confirmação humana.

## Contratos afetados

As extensões abaixo são opcionais e aditivas. Campos já existentes continuam sendo aceitos e permanecem como compatibilidade de leitura.

### `ArticleIntentProfile`

O perfil atual continua sendo a representação canônica de intenção. Serão acrescentados, quando disponíveis, o status da confirmação, o propósito editorial derivado e a camada de conversão. Não será criada uma segunda lista equivalente de intenções: os sinais secundários existentes continuam expressando compatibilidade.

### `ArticleKgrIdentity`

O contrato existente continua usando `bindingStatus` como base compatível. Serão acrescentados apenas metadados estratégicos não redundantes, como a identidade de keyword do artigo, volume/result count quando fornecidos pelo Minerador e a finalidade da vinculação. Nenhum `kgr_score`, slug ou semelhança será promovido automaticamente a KGR confirmado.

### `ArticleKeywordReference`

Cada referência passa a poder carregar volume conhecido, volume incremental estimado apenas quando derivável de evidência existente, contribuição estratégica e justificativa. A referência continua sendo a unidade para preservar a origem, o papel (`principal`, `secundaria`, `reforco_narrativo`) e a associação com seu `KeywordDNA`.

### Estratégias do artigo

O `ArticleDNA` recebe projeções opcionais:

- `volumeStrategy`: volume da principal, soma bruta, soma ajustada quando calculável, risco de sobreposição e contribuição por keyword;
- `hierarchyStrategy`: Pilar/Suporte, score, posição e componentes/racional;
- `strategicPurpose`: objetivo principal, resumo, necessidade do público, necessidade de busca, escopo semântico e condições de sucesso.

Essas projeções são determinísticas, versionáveis e não são decisões autônomas de IA.

### `ArticleControlContext`

Será derivado do `ArticleDNA` e concentrará, para leitura dos consumidores:

- identidade de marca, artigo, principal, slug e canonical;
- intenção central e estado de confirmação;
- estado KGR e vínculo principal–slug;
- estratégia de volume, hierarquia e propósito;
- ações permitidas, protegidas e proibidas.

É uma projeção de controle, não uma nova persistência nem uma entidade concorrente. O `ArticleDNA` permanece a origem dos dados.

## Derivação determinística

O Arquiteto calculará as projeções a partir do grupo e das referências já existentes:

1. a principal será a referência com papel principal e sua intenção continuará definindo `mainIntent`;
2. o volume da principal, secundárias e reforços será tratado como desconhecido quando não houver evidência, nunca como zero implícito;
3. secundárias receberão contribuição de expansão de alcance/volume compatível; reforços receberão contribuição semântica ou de entidade;
4. o risco de sobreposição será explícito e não será usado para apagar keywords;
5. a hierarquia usará os componentes já calculados pelo Arquiteto e justificará o resultado;
6. o propósito será derivado do perfil de intenção, da cobertura e dos papéis, sem texto genérico;
7. a identidade KGR explícita será preservada. Se a principal candidata divergir do slug proposto, o estado será conflito; o sistema não corrigirá silenciosamente a identidade;
8. o contexto de controle será calculado após a guarda de identidade publicada.

## IA e SERP

IA receberá as estratégias como contexto de leitura e poderá melhorar a cópia de trabalho, mas não poderá substituir principal, intenção herdada, identidade publicada, estado KGR, volume factual, hierarquia confirmada ou ações protegidas. O servidor reaplicará os campos estratégicos determinísticos após normalizar a resposta do provider.

SERP continuará analisando o artigo já formado. O contexto permite distinguir intenção esperada, finalidade estratégica, principal, secundárias e reforços, sem deixar a SERP decidir a formação do artigo. Não haverá chamada real de Serper nem de IA nos testes.

## Transferência operacional

O contrato de item transferido para Radar receberá um campo opcional único, `arquitetoStrategyContext`, com o `ArticleControlContext`. Nenhuma tela ou workflow de Radar será alterado nesta tarefa. Os demais consumidores continuarão podendo hidratar o `ArticleDNA` por sua referência; não serão criados campos duplicados em cada módulo.

O campo é aditivo, ausente em artigos antigos e deve ser ignorado por consumidores que ainda não o conhecem. A importação mantém marca, artigo, versão/hash do `ArticleDNA` e identidade publicada.

## Proteções e confirmação

A guarda existente permanece responsável por URL, slug, canonical, marca e principal conforme o estado. Para artigo publicado candidato, URL/slug/canonical continuam protegidos e a principal permanece corrigível. Para KGR ou arquitetura confirmados, a vinculação principal–slug é protegida.

Na confirmação arquitetural humana, um vínculo KGR candidato só será confirmado quando a principal e o slug propostos coincidirem com a evidência candidata. Divergência produzirá conflito/pending e exigirá decisão humana; não haverá mutação silenciosa.

## Compatibilidade e rollback

- Todos os novos campos de contrato são opcionais.
- Fixtures antigas de `ArticleDNA`, itens de Radar e planos continuam válidas.
- A projeção pode ser desativada removendo o campo opcional do transferidor; o `ArticleDNA` anterior continua legível.
- Não haverá migração, escrita remota, reprocessamento, limpeza de storage, commit, push ou deploy.
- Em caso de regressão, o rollback é restrito aos arquivos desta proposta e mantém os artefatos publicados existentes intactos.

## Validação

Serão cobertos por fixtures determinísticas:

- principal, secundárias e reforços com volume conhecido/desconhecido;
- soma bruta, soma ajustada e risco de sobreposição;
- contribuição e propósito individual por referência;
- limite de 2–6 sem preenchimento artificial;
- hierarquia com score e justificativa que não dependam apenas do maior volume;
- KGR candidato derivado da principal, divergência em conflito e confirmação do par;
- publicado candidato protegendo identidade, mas permitindo correção da principal;
- contexto de controle e transferência para Radar preservando marca e versão do `ArticleDNA`.

Além dos testes focados do Arquiteto, serão executados TypeScript, lint de domínio, testes operacionais autorizados e build. Validação autenticada em navegador, provider real, SERP real e schema remoto permanecem explicitamente não verificados.

## Arquivos previstos

- `lib/arquiteto/contracts.ts`
- `lib/arquiteto/strategic-context.ts`
- `lib/arquiteto/adapters.ts`
- `lib/arquiteto/identity-context.ts`
- `lib/arquiteto/architecture-confirmation.ts`
- `app/api/arquiteto/article-dna/route.ts`
- `app/(brand)/[brandRef]/arquiteto/page.tsx`
- `lib/editorial/operational-flow.ts`
- fixtures/testes focados do Arquiteto
- `docs/04-arquiteto/estado-atual.md`
- `docs/04-arquiteto/backlog.md`

Qualquer necessidade de alterar um contrato proprietário de outro módulo, schema remoto ou workflow será interrompida e convertida em nova proposta antes da alteração.

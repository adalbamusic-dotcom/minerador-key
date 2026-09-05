# SDD — Estado inicial pareado de SiloDNA e SiloPage

## Status

**IMPLEMENTAÇÃO LOCAL AUTORIZADA — atomicidade transacional remota pendente.**

Esta proposta registra a correção da regra do criador manual de silo. Nenhum
código de outro módulo, migration, SQL remoto, commit, push ou deploy faz parte
desta etapa. A implementação local foi feita somente no Arquiteto, usando o
runtime canônico existente e escrita remota server-side já disponível. Nenhuma
migration, RPC nova ou operação manual no Supabase foi executada.

## Módulo proprietário

Arquiteto.

## Regra funcional desejada

O formulário solicita somente:

- nome do silo;
- slug.

Ao confirmar, a operação canônica deve criar, como uma unidade pareada:

1. um `SiloDNA` em estado `draft`/`em_formacao`, sem keywords, principal ou
   entidade central artificial;
2. uma `SiloPage` independente em `publicationStatus = "new"`, com o slug
   normalizado, `publishedUrl = null` e `canonical = null`.

A entidade central, a intenção, os artigos, Pilar/Suportes e a arquitetura
editorial permanecem pendentes para os processos posteriores do Arquiteto.
Nenhuma IA, SERP, DataForSEO, KeywordDNA ou publicação é executada nessa
operação.

## Auditoria do contrato atual

### SiloDNA

`lib/arquiteto/contracts.ts` define `SiloDNASchema` com `centralEntity` e os
campos estratégicos obrigatórios (`objective`, `audience`, `macroProblem`,
`dominantIntent`, `boundary` e outros). Não existe `formationStatus`, schema de
rascunho, variante parcial ou representação válida de entidade central ausente.

`lib/arquiteto/adapters.ts` confirma a incompatibilidade: 
`deterministicSiloDnaPayload()` usa o nome do silo como fallback de
`centralEntity`. Esse fallback não pode ser reutilizado, pois transforma o
nome em entidade artificial.

### SiloPage

`SiloPageSchema` exige uma referência versionada ao SiloDNA e também conteúdo
editorial (`h1`, `seoTitle`, `metaDescription`, `intro`, `cta`, breadcrumbs e
briefings). `deterministicSiloPagePayload()` deriva esse conteúdo de
`silo.centralEntity`; portanto não consegue formar uma SiloPage inicial sem
uma representação de formação válida do SiloDNA.

### Persistência canônica

`persistArquitetoArtifact()` e `POST /api/arquiteto/artifacts` validam os
schemas versionados estritos. No servidor, `appendArquitetoArtifact()` valida
Brand, `entityId` e, para SiloPage, a existência do SiloDNA canônico na mesma
marca. Os schemas agora aceitam explicitamente `formationStatus = "draft"`;
os campos formados continuam obrigatórios quando o artefato deixa a formação.

O handler atual grava somente `minerador_keyword_lists` e
`marcas.silos_existentes`. Esses registros são operacionais/legados e não
substituem os artefatos canônicos. Além disso, duas chamadas independentes
(`SiloDNA` e `SiloPage`) poderiam deixar um artefato órfão se a segunda falhar.

## Extensão implementada e limite conhecido

Foi implementada a extensão aditiva que:

1. represente explicitamente o estado `draft`/`em_formacao` do SiloDNA;
2. permita `centralEntity` ausente nesse estado sem enfraquecer o SiloDNA
   formado;
3. represente uma SiloPage inicial sem inventar conteúdo editorial, mantendo
   slug, Brand, referência ao SiloDNA, versão e `publicationStatus = "new"`;
4. mantenha schemas formados estritos e compatibilidade de leitura com
   versões atuais;
5. persista os dois artefatos em sequência guardada, emitindo sucesso somente
   após readback dos dois e do catálogo; a operação ainda não é uma transação
   atômica porque o runtime atual não expõe RPC/transaction boundary para o
   par;
6. preserve `brandId`, IDs reais, hashes, versionamento e a relação
   `SiloPage.siloDnaRef`;
7. defina o formato canônico do slug. A UX solicitada aceita `manicure` e
   `/manicure` e deve normalizar ambos para `/manicure`, rejeitando URL,
   protocolo, domínio, vazio, espaços inválidos e valores que produzam
   `//manicure`. O comparador de colisão deve continuar compatível com valores
   legados sem barra, se eles permanecerem no catálogo.

O envelope existente foi estendido com `formationStatus` e guards no próprio
schema. A criação usa `manualSiloDnaDraftPayload()` e
`manualSiloPageDraftPayload()`; não usa o nome do silo como entidade, não cria
keywords, principal, intenção, conteúdo ou publicação artificial. A conversão
para estado formado continua obrigatória antes de aprovação/transferência.

## Impacto e consumidores

- `lib/arquiteto/contracts.ts`: schema de formação e compatibilidade dos
  envelopes;
- `lib/arquiteto/adapters.ts`: formação de SiloDNA/SiloPage sem fallback de
  entidade pelo nome;
- `lib/arquiteto/canonical-persistence.ts` e
  `lib/server/arquiteto-persistence.ts`: persistência versionada e relação
  canônica;
- `app/api/arquiteto/silos/route.ts`: operação server-side pareada, com
  conflito de slug, readback dos artefatos e confirmação do catálogo;
- `modules/arquiteto/arquiteto-workspace.tsx`: handler mínimo e UI já
  reduzida a nome + slug;
- bootstrap, hidratação, Radar e Planejador: devem ignorar ou tratar o estado
  incompleto sem promovê-lo a formado/aprovado.

Não há autorização nesta proposta para alterar Minerador, Radar, Planejador,
DataForSEO, IA, migrations ou persistência remota.

## Rollback e falha parcial

O código mantém os artefatos formados e não limpa storage local. Como a
persistência pareada atual é sequencial, uma falha depois da primeira escrita
retorna `SILO_PAIR_INCOMPLETE` e não emite sucesso; ela pode deixar um registro
parcial remoto. Não há deleção automática nem rollback destrutivo. A solução
transacional/RPC continua pendente e exige gate próprio antes de ser adicionada.

## Testes obrigatórios após autorização

- nome + slug cria SiloDNA de formação;
- nome + slug cria SiloPage `new`;
- SiloDNA nasce sem keywords, entidade, principal e intenção artificial;
- nome nunca vira `centralEntity`;
- `manicure`, `/manicure` e ` /manicure ` normalizam para `/manicure`;
- URL completa, protocolo, domínio, vazio, espaços inválidos e slug inválido
  falham;
- relação SiloPage → SiloDNA, Brand e IDs reais são preservados;
- falha de qualquer artefato não emite sucesso; o readback identifica o par
  incompleto, sem mascarar uma escrita parcial;
- marca diferente não recebe o silo;
- reload recupera os dois artefatos pelo caminho canônico;
- regressão dos testes atuais de SiloDNA/SiloPage formados;
- `test:arquiteto`, teste direcionado de normalização DataForSEO, lint
  direcionado, TypeScript, build e `git diff --check`;
- validação manual em Chrome em light/dark, desktop e viewport estreita.

## Estado de validação

Os contratos, adaptadores, endpoint e UI estão implementados localmente. A
suíte do Arquiteto mantém as regressões existentes; o teste novo de
normalização DataForSEO passa. TypeScript ainda reproduz erros preexistentes
fora desta mudança. Chrome autenticado, readback Supabase real e a atomicidade
transacional permanecem não verificados nesta etapa.

Não preencher `centralEntity` com o nome, não usar `A confirmar` como entidade,
não gravar somente o catálogo da marca e não emitir sucesso antes do readback.

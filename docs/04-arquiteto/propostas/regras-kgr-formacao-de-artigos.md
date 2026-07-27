# SDD — Regra estrutural compartilhada de KGR e formação de artigos

## Status

Autorizada para implementação aditiva nesta solicitação, com o Arquiteto como
módulo proprietário da decisão de formação. A implementação não aplica
migration, não escreve no Supabase remoto, não reprocessa artigos existentes e
não altera o workflow de Planejador, Redator ou Publicações.

## Snapshot e rollback

O snapshot desta mudança é o checkout de 2026-07-21, preservado sem reset,
clean ou descarte das alterações já existentes. A linha de base relevante é:

- Site/Sitemap já possui `SiteKeywordCandidate`, catálogo local por `brandId` e
  importação explícita para `keywords_kgr` como `bruto`;
- Minerador continua tendo `keywords_kgr` como fonte de identidade, métricas,
  intenção, status e DNA lógico, com escopo remoto ainda não validado nesta
  etapa;
- Arquiteto já possui `ArticleDNA`, `KeywordDNA`, identidade KGR explícita,
  proteção de publicados e limite técnico de seis referências;
- Radar já recebe ArticleDNA e contexto estratégico opcional, em modo de
  leitura da estratégia recebida.

Rollback: remover somente os arquivos adicionados/modificados nesta proposta
e suas fixtures. Nenhum dado publicado, snapshot, storage local, registro
remoto ou versão histórica deve ser apagado ou reescrito.

## Problema

Site/Sitemap consegue observar URL, slug, H1, title e meta description, mas
essa observação não é qualificação SEO. O Minerador é o único lugar que pode
confirmar KGR, volume, resultados, intenção e KeywordDNA. O Arquiteto precisa
então formar um artigo a partir de evidências qualificadas, escolhendo uma
única principal e limitando as secundárias sem transformar similaridade,
volume ou slug em aprovação automática. O Radar deve analisar a SERP do artigo
já formado, sem reagrupar keywords ou substituir sua identidade.

## Objetivo

Estabelecer uma regra central, determinística e auditável para:

1. transportar sugestões do Site para o Minerador sem promovê-las a KGR;
2. qualificar cada keyword no Minerador e preservar sua proveniência;
3. formar no Arquiteto exatamente um artigo com uma principal e até cinco
   keywords de apoio, no máximo seis referências no total;
4. registrar intenção dominante, volume conhecido/ausente, KGR confirmado,
   coerência de slug, racional editorial e proteção de publicados;
5. entregar ao Radar somente o ArticleDNA formado.

## Regra de autoridade

- Site/Sitemap observa e sugere. Nunca define `isKgr`, KGR, volume, resultados,
  score, intenção confirmada, aprovação ou ArticleDNA.
- Minerador qualifica. Somente uma evidência real do Minerador pode produzir
  `KeywordDNA`, volume, resultados, intenção ou KGR confirmado.
- Arquiteto forma. Decide principal, apoios, intenção dominante, slug
  candidato, ArticleDNA, hierarquia sugerida e gates humanos.
- Radar valida. Recebe o ArticleDNA e pode produzir conflitos ou propostas
  sobre a SERP, mas não adiciona, remove, reagrupa, troca principal, slug,
  canonical ou aprovação.

## Regras de formação

### Principal, apoio e limite

- Cada artigo novo tem exatamente uma principal.
- Pode ter zero a cinco secundárias/keywords de apoio. O teto é seis
  referências; seis é limite, não meta.
- O artigo não pode ser aprovado sem principal, com duas principais, com mais
  de seis referências ou com IDs ausentes/misturados entre marcas.
- O limite considera todas as referências de keyword do ArticleDNA. Reforços
  narrativos existentes permanecem compatíveis, mas também ocupam o teto e não
  recebem volume artificial.
- A seleção de UI é apenas entrada para a decisão; nunca controla sozinha o
  que será renderizado ou persistido.

### Compatibilidade editorial

Uma keyword só pode entrar como secundária quando houver, em conjunto,
compatibilidade de intenção, coerência semântica, capacidade de resposta em
uma mesma página, ganho de volume realmente conhecido, narrativa natural e
ausência de canibalização relevante. Falha grave em qualquer gate gera
alerta/conflito e exige decisão humana; não remove silenciosamente a
keyword.

A principal define a intenção dominante, problema, promessa, audiência,
formato editorial, slug candidato, KGR, volume principal, silo e limites
tópicos do ArticleDNA. Secundárias reforçam alcance, cobertura semântica,
subtópicos e narrativa sem trocar a intenção dominante.

### KGR, volume e slug

- `kgr_score`, volume, contagem de resultados, slug parecido ou similaridade
  textual isolados nunca confirmam KGR.
- KGR só pode ser `qualified`/confirmado quando a qualificação do Minerador e
  o vínculo explícito principal–slug forem evidências compatíveis.
- Sem volume, o estado é `partial` ou `unavailable`; ausência não é zero.
- O slug de conteúdo novo é candidato derivado da principal e da convergência
  de evidências, sujeito à confirmação humana.
- Para publicados, slug, canonical, URL estrutural, marca e principal
  protegida permanecem imutáveis conforme os guards existentes. Propostas de
  reforço ou alerta não sobrescrevem identidade publicada.

### Hierarquia de silo

A sugestão Pilar/Suporte é uma projeção humana-revisável que considera volume
conhecido, comprimento de cauda, KGR, centralidade semântica, amplitude de
intenção, coerência semântica, cobertura do silo e papel narrativo. Nenhuma
decisão é tomada por score isolado. A ordem de suporte e o racional ficam
registrados; a decisão final é humana.

## Contratos afetados

### Site/Sitemap — candidata observada

`SiteKeywordCandidate` recebe campos aditivos compatíveis com o contrato real:

```ts
{
  id, brandId, catalogEntryId, sourceUrl,
  text, normalizedText,
  sourceField, sourceFields,
  suggestedRole: "possible_primary" | "possible_secondary" | "supporting_term",
  slugCoherence: "high" | "medium" | "low" | "unknown",
  confidence: "high" | "medium" | "low",
  qualificationStatus: "awaiting_minerador" | "sent" | "existing" | "ignored",
  isKgr: false
}
```

`sourceField` permanece para compatibilidade; `sourceFields` preserva a
convergência. Candidatas antigas recebem defaults. Nenhum caminho do Site
produz `isKgr: true`.

### Minerador — evidência de site

A importação mantém `keywords_kgr` como identidade e grava a evidência de
origem de forma aditiva em `analise_semantica.site_origin`. O registro novo
entra como `bruto`, com volume, resultados, KGR, intenção e DNA ausentes.
O Minerador pode projetar a evidência compacta na tela e qualificar a keyword
em ação explícita. A deduplicação preserva dados humanos e não sobrescreve
keyword existente.

`KeywordDNA` pode carregar `KeywordSiteEvidence` opcional, contendo marca,
URL de origem, catálogo, campos observados, coerência de slug e confiança.
Essa evidência é origem, não confirmação.

### Arquiteto — estratégia do artigo

`ArticleDNA` recebe, de modo opcional e aditivo, `ArticleKeywordStrategy`:

- IDs da principal e das secundárias;
- intenção dominante;
- volume da principal, das secundárias e combinado;
- `volumeCoverage`: `complete`, `partial` ou `unavailable`;
- `principalKgrStatus`: `qualified`, `not_qualified` ou `unknown`;
- score explicável, coerência de slug, racional de agrupamento e narrativa
  semântica;
- proteção de publicação.

`SiloDNA` recebe sinais opcionais de hierarquia por artigo, sem substituir
`articleRoles`, `pillarArticleId` ou `supportArticleIds` legados.

### Radar — consumo somente leitura

O contexto transferido pode exibir principal, secundárias, volume combinado,
condição KGR, coerência de slug, proteção de publicado e racional de
agrupamento. O Radar não deve chamar qualquer rotina de agrupamento nem
alterar o ArticleDNA recebido.

## Compatibilidade e migração

Todos os campos novos são opcionais ou possuem defaults para fixtures e
artefatos antigos. Não há migração de banco. Não há reprocessamento de
ArticleDNA existente. Artigos já formados e publicados continuam sendo lidos
pelos contratos anteriores e passam pelas guardas atuais.

Os contratos canônicos `docs/00-produto/contratos/unidades-editoriais.md`,
`importacoes.md` e `versionamento.md` não existem neste checkout; o README do
diretório confirma que contratos transversais ainda devem ser registrados. A
implementação usa os contratos reais em `lib/arquiteto/contracts.ts` e os
contratos locais de Marca, sem criar documentação fictícia para preencher essa
lacuna.

## Consumidores mapeados

| Consumidor | Uso permitido | Alteração nesta etapa |
| --- | --- | --- |
| Marca/Site/Sitemap | observar, sugerir, importar seletivamente | contrato aditivo e evidência |
| Minerador | qualificar e confirmar KGR/KeywordDNA | evidência compacta/adapter, sem reconstrução da tela |
| Arquiteto | formar ArticleDNA e sugerir SiloDNA | regra proprietária, guards e testes |
| Radar | ler ArticleDNA formado | consumo compatível, sem regrouping |
| Planejador/Redator/Publicações | receber artefatos existentes | nenhum workflow alterado |

## Riscos

- O Minerador é uma tela monolítica com acesso legado direto; qualquer
  refatoração de hidratação ou schema fica fora desta entrega.
- O schema remoto e RLS não foram verificados; não se assume que colunas novas
  existam.
- Artigos publicados podem não possuir todos os sinais novos; ausência gera
  estado desconhecido e revisão, nunca preenchimento por inferência.
- A soma de volumes pode ter sobreposição; o contrato sinaliza cobertura e
  não trata soma bruta como demanda incremental garantida.

## Testes e validação

Fixtures determinísticas devem cobrir: candidata Site sem KGR; importação como
`bruto`; deduplicação sem overwrite; uma principal; zero/cinco/seis apoios;
bloqueio de sete; intenção incompatível; marca divergente; volume completo,
parcial e indisponível; KGR confirmado apenas com evidência válida; slug
protegido em publicado; hierarquia sem score isolado; e Radar somente lendo o
ArticleDNA.

Não serão usados provider real, chamada paga de IA, coleta SERP real, escrita
remota ou migration em testes. A validação autenticada do fluxo Site → lista
real do Minerador permanece manual e separada dos testes locais.

## Arquivos previstos

- `lib/marca/site-contracts.ts`, parser/reconciliation e testes de Site;
- `lib/arquiteto/contracts.ts` e novo helper determinístico de formação;
- `lib/arquiteto`/rotas do ArticleDNA somente onde o contrato já é proprietário;
- `lib/editorial`/Radar apenas para compatibilidade de leitura, se necessário;
- `docs/00-produto/decisoes/ADR-020-kgr-slug-e-formacao-de-artigos.md`;
- `docs/00-produto/invariantes.md`, `glossario.md`, `fluxo-oficial.md` e docs de
  Marca, Minerador, Arquiteto e Radar;
- fixtures e testes focados.

## Critério de conclusão

Código local, contratos e testes demonstram a regra e seus gates. O relatório
final separará testes locais, TypeScript/lint/build, inspeção de código e
validação manual/remota ainda pendente. Build não será tratado como prova de
integração ponta a ponta.

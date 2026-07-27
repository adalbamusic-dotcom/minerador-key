# SDD — Contexto de URL, arquitetura publicada e identidade KGR

## Status

Proposta aditiva autorizada para execução no módulo Arquiteto em 2026-07-21.

## Contexto auditado

O Minerador atualmente fornece `keywords_kgr.kgr_score`, `status`, intenção,
`analise_semantica` e, quando disponível, slug/URL/canonical derivados de
keywords ou briefings. A carga semântica é extensível e a proposta de
sincronização do Minerador reserva nela a proveniência `site_origin`, relação
keyword↔URL e situação arquitetural. Não há, neste checkout, uma coluna
canônica ativa para confirmar o vínculo KGR ou a arquitetura.

O Arquiteto continuará aceitando os nomes canônicos aditivos e aliases
português/legados dentro da carga recebida. A ausência desses campos não
invalida registros antigos. `kgr_score`, slug e similaridade textual nunca
confirmam sozinhos uma identidade KGR.

## Decisão

O contrato do Arquiteto passa a preservar, quando recebido:

- `keywordUrlRelation`: `confirmed_primary`, `candidate_primary`,
  `likely_support`, `mentioned_in_content` ou `undefined`;
- `architectureStatus`: `unstructured`, `awaiting_architecture`, `in_review`,
  `architecture_confirmed`, `conflict` ou `structural_review_required`;
- `kgrIdentity`, com designação, origem, principal KeywordDNA, slug vinculado,
  estado de vínculo, evidências, valor/faixa, versão, hash e confirmação.

Esses campos são mantidos no `ArchitectKeyword`, em cada
`ArticleKeywordReference` e no `ArticleDNA`. A carga integral original
continua em `keywordDnaSnapshot.sourceKeywordSnapshot`.

## Resolução dos modos SERP

`assessmentMode` passa a aceitar:

- `formacao` para artigos não publicados;
- `arquitetura_publicado` para publicados sem principal/arquitetura
  consolidadas;
- `fortalecimento` para principal confirmada + arquitetura confirmada ou para
  vínculo KGR confirmado.

A resolução é determinística e independente do status de aprovação, publicação
ou transferência ao Radar. Um conflito em identidade confirmada conserva o
modo de fortalecimento e exige revisão humana.

## Proteções

Todo publicado preserva URL, slug, canonical e marca. A principal só é
protegida quando a relação é `confirmed_primary` e a arquitetura é
`architecture_confirmed`, ou quando existe `kgrIdentity` confirmado com
principal KeywordDNA e slug válidos. O KGR confirmado também protege o par
principal+slug em artigo não publicado. Candidatos, KGR candidatos e estados
indefinidos permanecem editáveis no trabalho, sem alteração automática da
identidade publicada.

## Consumidores e limites

- Arquiteto: `lib/arquiteto/contracts.ts`, `identity-context.ts`, adapters,
  `serp-formation.ts`, published guard, API e página.
- Transferência compartilhada: `RadarItem` recebe apenas campos opcionais e o
  ArticleDNA já enriquecido; nenhuma UI ou transição do Radar é alterada.
- Documentação: contratos, estado, backlog e ADR registram a regra; Minerador
  e Radar apenas documentam os campos de entrada/recebimento.

Não haverá regrouping automático, reprocessamento real, alteração de slug,
canonical ou URL, migration remota, limpeza de storage ou chamada real do
provider nos testes.

## Compatibilidade e rollback

Schemas novos são opcionais e assessments antigos sem modo continuam com
`formacao`. Registros publicados antigos sem evidência explícita são tratados
conservadoramente como `arquitetura_publicado`; somente a proteção estrutural
da URL/slug/canonical/marca permanece. Rollback: remover apenas sucessores e
artefatos locais desta evolução, preservando versões anteriores, snapshots,
identidades e decisões humanas.

## Testes

Fixtures cobrirão relações, estados arquiteturais, os três modos, KGR
confirmado/candidato/conflito, proteção do par principal+slug, preservação de
KeywordDNAs, reload lógico e transferência aditiva ao Radar. Nenhum teste
chamará Serper ou IA paga.

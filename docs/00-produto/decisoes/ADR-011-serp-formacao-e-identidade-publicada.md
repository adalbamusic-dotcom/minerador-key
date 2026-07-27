# ADR-011 — SERP explícita para formação e identidade publicada preservada

## Status

Aceita para o módulo Arquiteto em 2026-07-21.

## Contexto

O agrupamento de keywords precisava de evidência SERP antes da aprovação, mas o ArticleDNA não preservava a KeywordDNA integral nem tinha uma regra única para URL/canonical de origem. O sistema também precisava expor aprovação, publicação e verificação sem misturar seus estados.

## Decisão

O Arquiteto executa SERP somente por ação explícita, em uma consulta textual por keyword selecionada, reutilizando o provider Serper server-side já existente. O resultado é um assessment versionado, com snapshots, referências completas de KeywordDNA, hash, conflitos e recomendações humanas. Seguir altera somente a cópia de trabalho da keyword alvo; ignorar registra decisão; nenhuma opção aprova ou cria artigo automaticamente.

ArticleDNA recebe campos opcionais aditivos: snapshot/proveniência em cada referência, `serpAssessmentRef` e extensão da referência publicada já existente. URL coerente é preservada; URL divergente bloqueia confirmação; URL ausente permanece ausente. Verificação online usa a configuração/autorização do site da marca, proteção SSRF e evidência de sitemap separada, sem mutar versão publicada.

O workflow de aprovação permanece o existente e é exibido na coluna `APROVAÇÃO`; publicação, Radar e aprovação são independentes. A transferência para Radar leva evidência de formação de modo opcional e compatível, sem alterar sua UI/workflow.

Assessments passam a declarar `assessmentMode`: artigos novos usam `formacao`; publicados sem arquitetura/principal consolidadas usam `arquitetura_publicado`; publicados com principal confirmada e arquitetura confirmada, ou KGR confirmado, usam `fortalecimento`. Todo publicado protege slug, canonical, URL e marca. A principal só é protegida quando a arquitetura confirmou a relação ou quando o vínculo KGR principal+slug foi explicitamente confirmado. Conflitos em identidade confirmada mantêm o fortalecimento e exigem decisão humana.

O ArticleDNA preserva, de forma opcional e retrocompatível, a relação keyword↔URL, a situação arquitetural e `kgrIdentity`, incluindo origem, evidência, versão/hash e decisão humana quando fornecidos. `kgr_score` e semelhança textual não criam vínculo KGR. Radar recebe esses campos apenas de forma aditiva, sem mudança de UI ou workflow.

## Consequências

- Versões antigas continuam válidas porque todos os novos campos são opcionais.
- O custo do provider fica visível e controlado por ação humana.
- Assessments e verificações locais precisam de reload/isolamento por marca validados manualmente.
- O Radar pode aprofundar a SERP sem perder a decisão de formação do Arquiteto.

## Rollback

Descartar assessments/successors não aprovados do artefato local e manter versões aprovadas, publicadas e snapshots anteriores. Não apagar localStorage/IndexedDB nem executar migração automática.

## Evidência

`tests/arquiteto-serp-formation.test.mts`, `npm run test:arquiteto` (54/54), `npm run test:operational` (49/49), `npx tsc --noEmit` e `git diff --check`.

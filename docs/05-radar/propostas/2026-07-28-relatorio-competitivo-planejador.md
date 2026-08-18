# SDD — Relatório competitivo do Radar

## Escopo

Implementar, exclusivamente no Radar, um relatório competitivo versionado e rastreável a partir da SERP revisada e das extrações já selecionadas. O relatório será uma extensão aditiva do `RadarEvidencePackage` e do payload versionado da análise; não haverá nova tabela, migration, chamada paga em teste ou alteração no Arquiteto/Planejador.

## Contrato atual confirmado

- `RadarAnalysis` já é append-only por sucessoras e mantém `previousVersionId`, hash e aprovação humana.
- `RadarEvidencePackage` já transporta snapshot, curadoria SERP, benchmark comparável, semântica, competitividade e proveniência.
- A extração atual fornece título, meta, headings, contagens estruturais, tipos de dados estruturados e termos recorrentes de corpo. Ela não fornece, com precisão, posição de termo no título/intro nem inventa fontes de links, comentários ou autoridade.
- O Planejador consome Radar aprovado como evidência e decide outline, metas, CTA, links finais e demais decisões do `ContentPlan`.

## Proposta

Adicionar o contrato proprietário `RadarCompetitiveReport` com:

- referências de marca, RadarItem, ArticleDNA, SiloDNA, snapshot SERP e versão da análise;
- workflow explícito de conferência, curadoria, concorrentes, padrões, necessidades, aprovação e envio;
- respostas observadas e perguntas com síntese curta, fonte, posição, recorrência, compatibilidade, confiança, recomendação automática e decisão humana;
- classificação de concorrentes diretos, parciais e por formato, mantendo somente páginas editoriais completas no benchmark;
- perfil competitivo com métricas observadas e limitações de amostra;
- frequência observada somente onde a extração atual sustenta a afirmação, sem converter ocorrência em meta de densidade;
- semântica, entidades, tópicos, ruído, links e elementos visuais observados;
- necessidades competitivas como oportunidades/evidências/propostas sujeitas a decisão humana, sem gerar outline;
- resumo, limitações, confiança, hash e proveniência.

O relatório será incluído de forma opcional no payload da análise e no `RadarEvidencePackage`. Uma aprovação grava o relatório no mesmo envelope imutável; alterações posteriores criam sucessora. O hash do relatório participa do hash do pacote.

## Consumidores preservados

- versões antigas de análise continuam válidas porque o campo é opcional;
- o Planejador continua recebendo somente o pacote aditivo e não terá lógica interna alterada;
- a SERP e os snapshots continuam visualizáveis antes da análise;
- ArticleDNA, KeywordDNA, SiloDNA, slug, canonical, marca e identidade publicada continuam somente leitura no Radar;
- testes existentes continuam usando fixtures e não acionam Serper.

## Riscos e limites

- Sem uma extração específica por termo-alvo, o relatório não afirma posição de keyword em título, introdução ou heading; registra cobertura indisponível.
- Comentários e autoridade externa não são inventados quando não estão no snapshot/extraction payload.
- Páginas de vídeo, serviço, categoria, rede social, marketplace e parciais ficam visíveis, mas fora do benchmark editorial comparável.
- O relatório não substitui decisões do Arquiteto ou do Planejador e não cria FAQ, schema, CTA ou metas estruturais.

## Rollback

Rollback por arquivo das alterações do Radar e da documentação. Nenhum snapshot local/remoto, registro Supabase ou storage do navegador será apagado. O checkout já estava sujo antes desta tarefa; o snapshot abaixo cobre somente os arquivos críticos do Radar, não uma tentativa de limpar o estado existente.

## Snapshot pré-alteração

Gerado em 2026-07-28 antes da implementação:

- `lib/radar/analysis-contracts.ts`: `485406D09D8E7ACDE78FC87...`
- `lib/radar/evidence-package.ts`: `911C333712819C785B95B89...`
- `modules/radar/radar-analysis-page.tsx`: `9828CCD52DC1DA7C22BFE75...`
- `components/editorial-pipeline-context.tsx`: `8B05E6AD1D95C19F005A13E...`

## Validação prevista

Testes puros cobrirão artigo completo, amostra insuficiente, formatos parciais/vídeo, uma única página comparável, ausência de SERP e sucessora após aprovação. TypeScript, lint direcionado, build e `git diff --check` serão executados. A validação manual orientada deverá conferir 360, 768, 1024 e 1440px, light/dark e estados de foco, carregamento, bloqueio, vazio e aprovação.

## Status

Proposta em implementação no módulo proprietário Radar. A conclusão será registrada separando código verificado, testes confirmados e validação manual ainda não executada.

# Proposta — Radar como evidência observada e hidratação integral

## Status

Implementada nesta tarefa, com consumidores mapeados e regressões focadas.

## Decisão

O Radar usa `RadarItem.articleDnaVersionId` como chave canônica da página. `RadarItem.id`, `articleId`, aliases publicados e referências de hidratação permanecem apenas como aliases compatíveis quando a resolução for inequívoca.

Snapshots SERP são reconciliados por identidade do snapshot, versão, hash, artigo, query, provider e marca. Um payload remoto parcial não substitui um payload local completo. Hash conflitante na mesma versão bloqueia o merge e fica visível como conflito.

`RadarEvidencePackage` contém somente evidência observada, curadoria humana, proveniência e referências versionadas. Não contém metas finais de palavras, estrutura obrigatória, outline, CTA, requisitos do Guardião ou decisões de ContentPlan. O Planejador recebe o pacote e decide como convertê-lo em plano.

## Consumidores

- Radar: página própria, snapshot view, merge e análise versionada.
- Workspace editorial: recovery local, reconciliação remota e encaminhamento aditivo ao Planejador.
- Planejador: campo aditivo de evidência no bloco `radar` do ContentPlan; os campos antigos de requisitos permanecem vazios quando a origem é o RadarEvidencePackage.

## Rollback

Reverter os arquivos da tarefa preservando os snapshots locais; nenhum storage, snapshot ou migration remota foi alterado. O hash dos arquivos críticos foi registrado no terminal antes da mudança.

## Não objetivos

Não coletar Serper, não fazer scraping externo, não substituir ContentPlan existente, não alterar ArticleDNA/SiloDNA, não integrar Guardião diretamente e não criar novo artigo.

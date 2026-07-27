# SDD — Contexto KGR, volume e identidade estratégica no Radar

## Status

Proposta registrada para implementação nesta tarefa.

## Escopo proprietário

Radar. A mudança reutiliza os contratos já existentes do Arquiteto e atua somente na leitura, apresentação e empacotamento de evidências do Radar.

## Auditoria realizada

Os dados necessários já existem em `ArticleKgrIdentity`, `ArticleVolumeStrategy`, `ArticleHierarchyStrategy`, `ArticleControlContext` e em `ArticleDNA.keywordReferences`. O `RadarItem` já conserva `arquitetoStrategyContext`, `arquitetoKgrIdentity` e as referências de KeywordDNA.

O `RadarEvidencePackage` atual ainda não carrega o contexto estratégico. A página própria também usa volume/KGR apenas para sugerir o modo de análise e não mostra composição, papéis, hierarquia ou alinhamento principal/slug.

## Decisão

Adicionar ao contrato proprietário `RadarEvidencePackage` um bloco opcional e versionado `kgrStrategy`, derivado exclusivamente do contexto recebido. O Radar não recalcula KGR, não reagrupa keywords, não altera ArticleDNA/SiloDNA e não transforma volume bruto em previsão de tráfego.

O Resumo exibirá `Estratégia KGR recebida` somente quando houver classificação KGR, composição ou referências estratégicas suficientes. O bloco apresentará origem, classificação, principal, alinhamento com slug, composição, volumes, papéis, hierarquia, proteção de publicação e conflitos de limite.

Artigos publicados preservam os campos estruturais e tratam desalinhamento como identidade histórica protegida. Artigos novos podem receber o estado `Revisar identidade no Arquiteto`, sem edição automática. Referências acima de seis, quando presentes em recovery/fixture legado, permanecem visíveis e bloqueiam apenas a consolidação do pacote até revisão.

## Fronteiras

- Não alterar `lib/arquiteto/**`, `lib/planejador/**`, schemas de ArticleDNA/KeywordDNA/SiloDNA ou ContentPlan.
- Não coletar SERP, não fazer scraping, não escrever no remoto e não alterar storage.
- Não enviar outline, metas de palavras, H2/H3 obrigatórios, CTA, densidade ou alteração de DNA no pacote.
- `kgrStrategy` é contexto recebido/evidência de proveniência; o Planejador continua responsável pelo ContentPlan.

## Rollback

Reverter os arquivos da implementação e preservar snapshots locais. Nenhum dado de usuário ou registro remoto é removido. Snapshot SHA-256 prévio:

- `components/radar/radar-analysis-page.tsx`: `9B448302F6C9EC8AB145ABD013B08CF02F2265089D7D55F41DF8469A6A5C31F8`
- `lib/radar/analysis-contracts.ts`: `B4A4477AF671FA5611949AEF8EE99D70FC549636E332932EEBD705308E5EE56E`
- `lib/radar/evidence-package.ts`: `3B2F03F81A2D6460534D4CCCFBCA0EBCF5866A73B4D88166C1EC5B1C2E966A36`

## Validação

Fixtures cobrirão KGR confirmado, não-KGR, KGR ausente, slug alinhado/desalinhado, publicado protegido, até seis referências, overflow legado, volumes com aviso de sobreposição, papéis/hierarquia e presença do bloco no pacote. Nenhuma chamada Serper ou extração externa será usada.

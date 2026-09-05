# Visão geral

## Propósito

Minerador Key é um produto interno para transformar dados de marca e palavras-chave em uma cadeia editorial rastreável: descoberta, arquitetura, pesquisa, planejamento, redação e publicação. A evidência deste documento foi revisada no código em 2026-08-27.

## Público e problema

Atende equipes que planejam crescimento orgânico por marca. O problema tratado é manter contexto, intenção, silos, decisões e versões conectados sem misturar marcas ou confundir uma sugestão de IA com uma aprovação humana. A aplicação é um monólito modular Next.js: `app/` compõe rotas e APIs, `modules/` implementa as áreas e `lib/` concentra infraestrutura e contratos.

## Fluxo operacional

Marca fornece contexto; Minerador registra e qualifica keywords; Arquiteto organiza a arquitetura editorial e os links internos; Radar reúne evidências de SERP; Planejador cria o plano; Redator produz o documento; Publicações recebe o item aprovado. Cada transferência é seletiva e deve preservar marca, identidade e proveniência.

## Pipeline estratégico

`BrandDNA → KeywordDNA → ArticleDNA / SiloDNA / SiloPage / InternalLinkGraph → SERP → ContentPlan → ContentDocument → PublicationRecord`.

`InternalLinkGraph` pertence ao Arquiteto e registra relações persistentes por
Brand. Radar e Planejador podem receber uma referência versionada para leitura,
sem reagrupamento ou mutação do grafo; a próxima frente é a experiência
funcional de Links Internos.

O código possui contratos Zod e envelopes versionados para parte desse pipeline. Nem todas as etapas possuem integração externa real ou persistência completa; ver os estados de cada módulo.

## Fundação global pós-refresh

Em 2026-08-17, o Master Refresh foi encerrado com baseline remoto read-only e
zero drift bloqueador. Auth e o Admin global foram preservados; Agencies,
Brands e dados de homologação foram zerados; DataForSEO, DeepSeek, Vault e a
infraestrutura técnica Google Ads foram preservados; o legado Google Ads
dinâmico e `migration_backup` foram removidos. Banco, Auth, Agency/Brand e
integrações passam a ser infraestrutura congelada. Evoluções estruturais
futuras exigem evidência nova e gate próprio, sem reabrir o refresh concluído.

OpenRouter permanece somente como histórico/Usage legível do corte de provider;
não é provider ativo, fallback ou opção de configuração vigente.

Baseline: [Master Refresh Batch 7](auditorias/master-refresh-batch-7-canonical-baseline-2026-08-17.md).

```text
DATABASE_REFRESH = COMPLETE
GLOBAL_FOUNDATION = READY
READY_FOR_FRESH_AREA_DEVELOPMENT = YES
BASELINE_DATE = 2026-08-17
BASELINE_FINGERPRINT = f058b86b56e6d99ab24dac967241c221
0043 = CLOSED
0044 = CLOSED
```

Depois do reset, novas Agencies/Brands podem ser criadas novamente pela
interface. A recriação de AdalbaPro/Care Glow foi intencional e não é drift.
Esta informação é **Relatada pelo usuário** nesta consolidação; não foi
reexecutado smoke remoto nesta tarefa.

### Fase funcional vigente

`FUNCTIONAL_AREA_DEVELOPMENT`

`Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`

A fundação global está congelada. O backlog funcional não autoriza novas
migrations, limpeza ou reforma transversal sem um gate próprio.

### Smokes reais do Minerador

Os seguintes resultados foram registrados como **Relatados pelo usuário /
smoke real**, sem transformar as demais áreas em homologadas automaticamente:

- `GOOGLE_ADS_DISCOVERY = PASS`;
- `GOOGLE_ADS_HISTORICAL_METRICS = PASS`;
- `DATAFORSEO_ALLINTITLE = PASS`;
- `MANUAL_CSV_IMPORT = PASS`;
- `PROCESSOR_IMPORT = PASS`;
- `INTENT_NICHE = PASS`;
- `KEYWORD_PROFILE = PASS`.

A humanização preserva `technical canonical name != display label`: nomes como
`BrandDNA`, `KeywordDNA`, `ArticleDNA`, `SiloDNA`, `SiloPage`,
`InternalLinkGraph`, `ContentPlan`,
`ContentDocument` e `PublicationRecord` continuam canônicos internamente e
recebem labels compreensíveis na interface.

## Módulos

| Módulo | Situação resumida |
| --- | --- |
| Admin | visão e gestão de marcas existentes |
| Marca | contexto e acesso por marca |
| Minerador | importação, filtros, KGR e exportação no Supabase legado |
| Arquiteto | lógica editorial, ArticleDNA, SiloDNA, SiloPage, InternalLinkGraph e propostas de IA |
| Radar | possui rota tenantizada por artigo e contrato de evidência sobre a infraestrutura SERP compartilhada DataForSEO; coleta real autenticada e persistência remota ainda aguardam validação manual; `READY_FOR_RADAR_DEVELOPMENT = YES` |
| Planejador | criação e aprovação inicial de ContentPlan |
| Redator | editor Tiptap e abertura de documentos |
| Publicações | planilha/esqueleto de entrega |
| Conta | visão de conta |

## Princípios de IA e aprovação humana

IA pode produzir proposta ou alterar uma cópia de trabalho. Ela não aprova, não substitui gates de contrato e não deve ser usada em testes. Respostas simuladas são identificadas por `origin: "mock"`; respostas reais dependem de configuração de provedor e de ação explícita do usuário.

## Estado de evidência

Use as marcações nos documentos: **Verificado no código**, **Confirmado por teste**, **Relatado pelo usuário**, **Ainda não verificado** e **Planejado**. Os arquivos em `docs/_arquivo/` são histórico, não fonte de verdade.

Rotas globais: `/`, `/login`, `/cadastro`, `/selecionar-marca` e `/admin`. Rotas de marca: `/{brandRef}/...`, com `brandRef = slug-da-marca--brandId`; grupos `(admin)` e `(brand)` são somente organização do App Router. Para o detalhamento da árvore, autorização e Supabase, consulte [arquitetura](arquitetura.md) e [governança documental](relatorio-governanca-documental-2026-07-27.md).

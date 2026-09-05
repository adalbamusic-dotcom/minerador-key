# Consolidação documental canônica — 2026-08-27

## Escopo e decisão

Esta consolidação auditou a árvore documental ativa, comparou as fontes
preparadas com os documentos existentes e aplicou merge consciente. O objetivo
foi reduzir fontes concorrentes sem apagar evidência, decisões, migrations,
código, testes ou dados.

Precedência usada:

`invariantes/ADRs → SDDs aprovadas → specs permanentes → código e estado remoto validado → estado-atual → backlog/propostas → pareceres → histórico`.

O resultado é uma documentação ativa por assunto e um arquivo histórico
explicitamente não operacional.

## Inventário da consolidação

| Conjunto | Classificação | Resultado |
| --- | --- | --- |
| `pipeline-editorial-papeis-handoffs.md` | `MERGE_UPDATE` | Consolidado em `docs/00-produto/` como referência ativa de papéis, entradas, saídas, decisões e handoffs. |
| `mapa-estado-atual-plataforma.md` | `MERGE_UPDATE` | Consolidado em `docs/00-produto/` com estados separados e evidência do InternalLinkGraph. |
| `regras-de-trabalho-e-documentacao.md` | `MERGE_UPDATE` | Consolidado em `docs/compartilhado/` com precedência e critérios de evidência. |
| `sistema-visual.md` | `KEEP_CANONICAL` | A versão existente em `docs/compartilhado/` foi preservada por ser mais completa; o duplicado na raiz foi removido. |
| `links-internos-estado-e-contrato.md` | `MERGE_UPDATE` | Consolidado em `docs/04-arquiteto/` como contrato atual do InternalLinkGraph. |
| `agentes-mcp-backlog.md` | `KEEP_CANONICAL` | Consolidado em `docs/compartilhado/` como backlog futuro, fora do runtime. |
| Auditoria, plano e pedido estrutural do InternalLinkGraph de 2026-08-25 | `ARCHIVE_HISTORY` | Preservados em `docs/_arquivo/2026-08-documentacao-legada/`, com aviso histórico e ponte para as fontes atuais. |
| Adendo e auditoria OpenRouter → DeepSeek da Fase 1 | `ARCHIVE_HISTORY` | Preservados no arquivo histórico; a spec e o estado do Minerador registram o contrato atual DeepSeek/DataForSEO. |
| `AGENTS.md`, `README.md` e produto | `MERGE_UPDATE` | Papéis, ordem vigente, pipeline e navegação foram alinhados às fontes canônicas. |
| Estados e backlog de Arquiteto, Radar e Planejador | `MERGE_UPDATE` | A fundação remota do InternalLinkGraph foi separada das próximas frentes funcionais; snapshots anteriores permanecem identificáveis. |

Nenhuma migration, contrato de código, teste, provider, segredo, dado,
snapshot operacional ou arquivo histórico foi apagado nesta consolidação.

## Contrato ativo convergente

```text
Marca          → BrandDNA/contexto
Minerador      → KeywordDNA
Arquiteto      → ArticleDNA + SiloDNA + SiloPage + InternalLinkGraph
Radar          → investigação SERP/evidências/RadarApprovedPackage
Planejador     → ContentPlan
Redator        → ContentDocument
Publicações    → PublicationRecord
```

O Arquiteto é proprietário do agrupamento, ArticleDNA, SiloDNA, SiloPage,
Pilar/Suportes e InternalLinkGraph. O Radar investiga sem reagrupamento; o
Planejador compila sem refazer SERP; o Redator executa sem redefinir estratégia;
Publicações preserva a identidade publicada.

O `InternalLinkGraph` está documentado como fundação remota aplicada, com
readback, aprovação/versionamento, working copy persistente, guards e
isolamento cross-brand confirmados. A próxima frente é funcional/UI. React
Flow é projeção; localStorage, IndexedDB, mock e fallback não são autoridade.
O par SiloDNA/SiloPage permanece separado e o uso de `postgres` na fixture do
smoke fica registrado como nota operacional, sem concessão automática de grant.

## Limpeza de conceitos legados

- OpenRouter e Serper não são provider ativo nem fallback; referências em
  snapshots, auditorias e fixtures permanecem somente para proveniência.
- Histórico Serper válido continua legível como provenance; novas coletas SERP
  usam DataForSEO.
- A planilha é a superfície operacional; uma visualização React Flow não é
  persistência nem substitui a working copy canônica.
- `Evidence` não é `Source`; `RadarApprovedPackage` não é `ContentPlan`;
  `ContentDocument` não é `PublicationRecord`.
- Proposta de IA não é aprovação humana; estado remoto e readback não são
  inferidos de teste, build ou presença de arquivo de migration.

## Itens mantidos para revisão futura

Documentos de proposta, SDDs ainda não aprovadas e auditorias históricas de
outros módulos permanecem no lugar quando possuem conteúdo único. Eles devem
ser lidos como proposta, snapshot ou histórico conforme o cabeçalho e não
substituem o contrato ativo. A consolidação não promoveu nenhuma proposta a
decisão nem inventou estado remoto para fechar lacunas.

## Validação desta rodada

- Inventário atual: 221 documentos Markdown ativos e 27 documentos no arquivo
  histórico, excluindo `docs/scratch/`.
- Os seis documentos preparados na raiz não permanecem duplicados; suas fontes
  ativas estão nos caminhos canônicos indexados em `docs/README.md`.
- Links Markdown relativos da árvore ativa foram verificados sem destinos
  ausentes.
- Referências aos arquivos movidos foram atualizadas ou apontadas para o
  arquivo histórico.
- Busca direcionada por `InternalLinkGraph`, `OpenRouter`, `Serper`, React Flow,
  `localStorage`, `IndexedDB`, `ContentPlan` e `ContentDocument` foi usada para
  localizar linguagem histórica e fronteiras de contrato.
- `git diff --check = PASS` nesta rodada; nenhum build ou teste da aplicação
  faz parte desta tarefa documental.

## Estado final

`DOCUMENTATION_CANONICALIZATION = COMPLETE`

`IMPLEMENTATION_SCOPE = DOCUMENTATION_ONLY`

`REMOTE_OPERATION = NONE`

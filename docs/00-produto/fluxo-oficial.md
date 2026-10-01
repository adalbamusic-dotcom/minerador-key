# Fluxo oficial

O Minerador qualifica KGR/não KGR, métricas, intenção e publicação. O Arquiteto acrescenta, sem sobrescrever a origem, o tipo da unidade, propósito, ciclo editorial, estratégia competitiva e perfil SERP, além de consolidar SiloDNA, SiloPage e, quando aplicável, InternalLinkGraph. Essas três dimensões permanecem independentes; a intenção da principal continua sendo o centro do ArticleDNA. Landing de campanha não exige SERP automaticamente e SiloPage permanece separada de ArticleDNA.

`Marca → Minerador → Arquiteto → Radar → Redator → Publicações`

O **Planejador foi aposentado em 2026-10-01** (SDD `docs/compartilhado/sdd-aposentar-planejador-2026-10-01.md`), depois da remoção lógica de 2026-09-18. O Radar
entrega diretamente ao Redator, que planeja e escreve, e o Redator entrega
diretamente a Publicações. O que era a etapa de planejamento virou a fase
`planejado` do documento; `ContentPlan` não existe mais como artefato: o
Redator planeja dentro do `ContentDocument`. Nenhum artigo foi movido; o banco
tinha zero dados do Planejador. `/{brandRef}/planejador` redireciona para o
Radar; não há página, módulo, artefato nem permissão do Planejador.

O Planejador não volta como etapa. As funções úteis de planejamento serão
transferidas para uma aba da Marca, onde fazem sentido como planejamento inicial
de projeto, produto, serviço ou campanha.

## Árvore da plataforma

O número é **identificador do estágio**, não posição em lista. A posição 5 fica
declarada e não atribuída: nenhuma etapa foi criada para preenchê-la.

| Estágio | Módulo | Observação |
| --- | --- | --- |
| 1 | Marca | |
| 2 | Minerador | |
| 3 | Arquiteto | |
| 4 | Radar | |
| 5 | — | declarado e não atribuído |
| 6 | **Redator** | `REDACTOR_STAGE = 6` |
| 7 | **Publicações** | `PUBLICACOES_STAGE = 7` |
| 8 | **Conta** | `CONTA_STAGE = 8`; fora do pipeline editorial |
| — | ~~Planejador~~ | aposentado em 2026-10-01 |

A declaração vive em `MODULE_STAGE`, em `lib/editorial/navigation.ts`.
`PRODUCT_FLOW` continua sendo apenas o pipeline editorial e por isso não inclui
Conta.

| Etapa | Entrada | Saída esperada | Evidência atual |
| --- | --- | --- | --- |
| Marca | perfil, marca, nicho, localização e silos | contexto de marca / BrandDNA | Verificado no código: rota de marcas e `BrandProvider` |
| Minerador | listas e keywords | keywords qualificadas e KeywordDNA | Verificado no código: tela e tabelas legadas; a forma exata da transferência ainda não foi verificada ponta a ponta |
| Arquiteto | keywords da marca | ArticleDNA, SiloDNA, SiloPage e InternalLinkGraph | Verificado no código: contratos, rotas e fundação persistente; validação funcional da aba Links Internos ainda pendente |
| Radar | ArticleDNA aprovado | `RadarEvidenceBundle` → `RadarFrozenEvidenceBundle` → dossiê canônico entregue ao Redator, e o dossiê editorial portátil | Verificado no código; a Fase 1 do modo Google foi **homologada em runtime real** (2026-09-11). Os três perfis — Google, YouTube e Amazon — estão implementados e resolvem pelo mesmo dossiê canônico desde 2026-09-17; a aceitação manual de YouTube, Amazon e export é do USER. |
| ~~Planejador~~ | — | — | **Aposentado em 2026-10-01**: sem rota, módulo, artefato nem permissão. O banco confirmou **zero** dados do Planejador |
| Redator | dossiê canônico do Radar | plano interno + ContentDocument | Verificado no código: entrada direta do Radar, Tiptap e criação de documento; aprovação final é parcial |
| Publicações | documento aprovado do Redator | registro de publicação | Verificado no código: caminho direto do Redator (`/api/redator/publication-handoff`, `createWriterPublication`) a partir do documento v2 aprovado; não usa ContentPlan |

Transferências exigem marca compatível, seleção explícita, idempotência e o estado de aprovação exigido pelo módulo. A seleção de UI nunca pode decidir por si só o que é renderizado ou persistido.

As integrações externas são governadas acima do fluxo editorial: Plataforma/Admin
administra a infraestrutura; Agência recebe disponibilidade; Marca consome por
`brandId`; e cada módulo usa somente o contrato compartilhado necessário. A
Connection READY de um provider não equivale, sozinha, a smoke de uma operação
editorial nem a persistência remota confirmada.

O Radar investiga o artigo já formado em quatro áreas operacionais —
`Pesquisa`, `Vídeos`, `Especialista` e `Relatório` — e a `Pesquisa` tem três
perfis competitivos: `Google`, `YouTube` e `Amazon`, os três implementados.
Perfil de pesquisa não é área: `Pesquisa → YouTube` é motor de descoberta
competitiva com SERP própria, enquanto a área `Vídeos` é ingestão deliberada
de fontes que o USER escolhe, sem SERP.

Perfil de pesquisa também não é saída editorial. O perfil descreve COMO se
investigou; a saída descreve o que se produz: Google entrega blueprint
editorial e artigo-modelo, YouTube entrega blueprint audiovisual e
roteiro-modelo, Amazon entrega blueprint comercial.

O Radar não redefine o ArticleDNA: ele acrescenta evidência amarrada a
`articleId + articleDnaVersionId + articleDnaContentHash`. O dossiê de trabalho
é `ArticleDNA + RadarEvidenceBundle`; ao finalizar, o dossiê canônico é
entregue ao Redator por `sendRadarToWriter`, com a estrutura inteira — e não
apenas o markdown portátil.

Na formação compartilhada, o Site apenas sugere candidatas; a confirmação de KGR, volume, resultados, intenção e KeywordDNA pertence ao Minerador; o Arquiteto escolhe uma principal e até cinco apoios compatíveis, consolida a arquitetura de silo e os links internos quando aplicável; e o Radar analisa somente o artigo já formado, sem regrouping.

O `InternalLinkGraph` é persistente, tenantizado por Brand e proprietário do
Arquiteto. Radar e Redator podem receber sua referência versionada como
contexto de leitura, mas não reagrupam artigos nem reescrevem o grafo.

Antes da aprovação, o Arquiteto pode executar explicitamente `Validar agrupamento pela SERP` em modo `formacao`; a ação gera snapshots e recomendações por keyword, preserva a KeywordDNA integral e não cria artigos automaticamente. Para publicados sem arquitetura/principal confirmadas, usa `arquitetura_publicado`; para arquitetura confirmada ou vínculo KGR confirmado, usa `fortalecimento`. Em todo publicado, principal candidata não equivale a principal protegida: slug, canonical, URL e marca permanecem protegidos, enquanto a SERP pode propor revisão arquitetural quando permitido. Depois, o Radar continua responsável pela SERP profunda do artigo formado. URLs/canonicals divergentes viram conflito e ausências não são preenchidas por inferência.

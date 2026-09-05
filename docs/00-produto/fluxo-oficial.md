# Fluxo oficial

O Minerador qualifica KGR/não KGR, métricas, intenção e publicação. O Arquiteto acrescenta, sem sobrescrever a origem, o tipo da unidade, propósito, ciclo editorial, estratégia competitiva e perfil SERP, além de consolidar SiloDNA, SiloPage e, quando aplicável, InternalLinkGraph. Essas três dimensões permanecem independentes; a intenção da principal continua sendo o centro do ArticleDNA. Landing de campanha não exige SERP automaticamente e SiloPage permanece separada de ArticleDNA.

`Marca → Minerador → Arquiteto → Radar → Planejador → Redator → Publicações`

| Etapa | Entrada | Saída esperada | Evidência atual |
| --- | --- | --- | --- |
| Marca | perfil, marca, nicho, localização e silos | contexto de marca / BrandDNA | Verificado no código: rota de marcas e `BrandProvider` |
| Minerador | listas e keywords | keywords qualificadas e KeywordDNA | Verificado no código: tela e tabelas legadas; a forma exata da transferência ainda não foi verificada ponta a ponta |
| Arquiteto | keywords da marca | ArticleDNA, SiloDNA, SiloPage e InternalLinkGraph | Verificado no código: contratos, rotas e fundação persistente; validação funcional da aba Links Internos ainda pendente |
| Radar | ArticleDNA aprovado | item de pesquisa / evidência SERP | Verificado no código: rota tenantizada, contrato de evidência e fronteira server-side para a infraestrutura SERP compartilhada DataForSEO. Testes usam fixtures. Coleta real autenticada e persistência remota permanecem pendentes. |
| Planejador | Radar aprovado | ContentPlan | Verificado no código: contrato, comandos e persistência prevista |
| Redator | ContentPlan aprovado | ContentDocument | Verificado no código: Tiptap e criação de documento; aprovação final é parcial |
| Publicações | documento aprovado | registro de publicação | Verificado no código: estrutura e importação; destino externo não verificado |

Transferências exigem marca compatível, seleção explícita, idempotência e o estado de aprovação exigido pelo módulo. A seleção de UI nunca pode decidir por si só o que é renderizado ou persistido.

As integrações externas são governadas acima do fluxo editorial: Plataforma/Admin
administra a infraestrutura; Agência recebe disponibilidade; Marca consome por
`brandId`; e cada módulo usa somente o contrato compartilhado necessário. A
Connection READY de um provider não equivale, sozinha, a smoke de uma operação
editorial nem a persistência remota confirmada.

Na formação compartilhada, o Site apenas sugere candidatas; a confirmação de KGR, volume, resultados, intenção e KeywordDNA pertence ao Minerador; o Arquiteto escolhe uma principal e até cinco apoios compatíveis, consolida a arquitetura de silo e os links internos quando aplicável; e o Radar analisa somente o artigo já formado, sem regrouping.

O `InternalLinkGraph` é persistente, tenantizado por Brand e proprietário do
Arquiteto. Radar e Planejador podem receber sua referência versionada como
contexto de leitura, mas não reagrupam artigos nem reescrevem o grafo.

Antes da aprovação, o Arquiteto pode executar explicitamente `Validar agrupamento pela SERP` em modo `formacao`; a ação gera snapshots e recomendações por keyword, preserva a KeywordDNA integral e não cria artigos automaticamente. Para publicados sem arquitetura/principal confirmadas, usa `arquitetura_publicado`; para arquitetura confirmada ou vínculo KGR confirmado, usa `fortalecimento`. Em todo publicado, principal candidata não equivale a principal protegida: slug, canonical, URL e marca permanecem protegidos, enquanto a SERP pode propor revisão arquitetural quando permitido. Depois, o Radar continua responsável pela SERP profunda do artigo formado. URLs/canonicals divergentes viram conflito e ausências não são preenchidas por inferência.

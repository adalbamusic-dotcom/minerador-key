> **HISTÓRICO — NÃO OPERACIONAL — 2026-08-27**
>
> Registro preservado durante a consolidação documental. Não é fonte de verdade nem autoriza implementação; consulte as fontes canônicas ativas em `docs/README.md`.

# Relatório — consolidação canônica do Arquiteto (A1–A20)

**Data:** 2026-08-25
**Módulo proprietário:** Arquiteto
**Natureza:** auditoria documental e arquitetural, sem alteração estrutural ou
operação remota.

## 1. Escopo e método

A fila A1–A20 foi tratada como consolidação de produto antes de uma nova
rodada de implementação. Foram lidos os documentos canônicos do produto,
ADRs aceitos, documentação dos módulos vizinhos, contratos atuais, rotas,
repositórios de persistência, migrations locais, testes e a UI do Arquiteto.

A classificação usada neste relatório é:

- **IMPLEMENTADO:** existe no código/contrato ativo e atende ao recorte descrito;
- **PARCIAL:** há uma parte funcional, mas falta cobertura, gate, integração ou validação;
- **LEGADO:** permanece como histórico/compatibilidade e não é fonte vigente;
- **AUSENTE:** não foi localizado no contrato/código ativo;
- **BLOQUEADOR ESTRUTURAL:** não pode ser representado corretamente sem mudança compartilhada;
- **NÃO VERIFICADO:** depende de leitura remota, provider real ou validação manual;
- **DÍVIDA:** limitação conhecida que não bloqueia o recorte atual.

Nenhuma migration, SQL, alteração de schema/RLS/RPC, chamada paga, provider
real, escrita remota, limpeza de dados, commit, push ou deploy foi executado.

## 2. Visão consolidada

O Arquiteto é uma mesa editorial com três áreas conceituais:

1. **Artigos:** transforma KeywordDNA em hipótese de grupo, revisão e ArticleDNA.
2. **Silos:** transforma ArticleDNA em SiloDNA, SiloPage e hierarquia.
3. **Links Internos:** transforma SiloDNA + ArticleDNA em um
   InternalLinkGraph, com origem, destino, direção, relação, prioridade,
   justificativa semântica e conceitos de âncora.

O fluxo canônico é:

~~~text
Minerador
  → KeywordDNA completo
Arquiteto
  → lógica → SERP → IA opcional → humano → consolidação
  → ArticleDNA / SiloDNA / SiloPage / InternalLinkGraph
Radar
  → investigação da unidade formada
Planejador
  → ContentPlan e contexto de seção
Redator
  → ContentDocument e âncora natural
Publicações
  → URL, canonical, integridade e histórico
~~~

A unidade da arquitetura não é um wizard nem uma pasta. A planilha continua
sendo a mesa de operação. A cópia de trabalho recebe evidências e propostas;
somente uma ação humana de consolidação gera a versão apta ao próximo gate.

## 3. Regras consolidadas

### Artigos

- O KeywordDNA recebido é preservado individualmente, com texto, intenção,
  semântica, métricas, KGR, publicação, versionamento, hash e proveniência.
- Ausência de dado permanece ausência; null não vira zero.
- Volume é sinal prioritário, não decisão isolada da principal.
- KGR é oportunidade, não aprovação; sua ausência não bloqueia formação.
- CPC/competição Ads são contexto comercial, não dificuldade orgânica.
- Close variants são evidência de proximidade, não decisão de agrupamento.
- SERP testa a hipótese e produz evidência; não move keywords nem confirma
  ArticleDNA automaticamente.
- IA produz proposta reversível e pendente; nunca aprova.
- ArticleDNA tem exatamente uma principal, até cinco secundárias/reforços e
  máximo de seis KeywordDNAs.
- Novo e publicado seguem perguntas diferentes; publicação protege brandId,
  URL, slug e canonical.
- Conteúdo publicado revisável só muda com nova versão, decisão humana e
  identidade protegida.

### Silos

- Silo é SiloDNA + SiloPage + ArticleDNAs + InternalLinkGraph; não é pasta.
- SiloDNA é estratégia; SiloPage é página indexável/publicável.
- Cada Silo formado deve ter um Pilar e Suportes coerentes; KGR não escolhe
  Pilar automaticamente.
- Novo Silo exige profundidade, centralidade e conflito real com Silos
  existentes; volume sozinho não cria Silo.
- Poucos Silos profundos são preferíveis a muitos Silos rasos.
- SiloPage não é Pilar; colisão de intenção/slug exige revisão.
- Slugs publicados permanecem protegidos.
- Um futuro SlugArchitectureValidator é requisito de produto, não foi
  implementado nesta fila.

### Links Internos

- O Arquiteto define relação, origem, destino, direção, tipo, prioridade,
  motivo e conceitos de âncora.
- Planejador escolhe seção/contexto e quantidade planejada.
- Redator escreve frase e âncora natural.
- Publicações valida URL e integridade.
- Relações mínimas: Pilar → Suporte, Suporte → Pilar e Suporte → Suporte
  somente com motivo semântico.
- A âncora não é escolhida por split simples da keyword.
- React Flow, quando existir, será projeção do grafo persistido, nunca sua
  única fonte.

### Marca, processos e experiência

- Brand Context Pack é contexto selecionado, não despejo total da marca.
- Processos de lógica, SERP, IA e revisão são independentes e podem ficar
  stale apenas quando o próprio insumo mudar.
- A mesa permanece visível; não há wizard nem confirmação redundante de
  processo explícito.
- A interface não expõe provider, Connection, capability, quota, crédito ou
  API.
- O sistema visual compartilhado é obrigatório; não usar roxo/violeta/índigo.

## 4. Divergências encontradas

| Ponto | Evidência no código/documentação | Classificação | Consequência |
| --- | --- | --- | --- |
| Três áreas | A UI atual concentra a planilha de Artigos, com grupos e detalhes de Silo; não há área operacional de Links Internos nem três abas explícitas | PARCIAL | Conceito está documentado; a UI futura deve ser incremental |
| Candidate Silo | Existem sugestões de Silo e heurísticas, mas não há lifecycle explícito de reserva, retorno e promoção | PARCIAL | Não tratar sugestão como Silo persistido |
| Pilar | ArticleDNA possui hierarchy e SiloDNA possui pillarArticleId; o schema permite Pilar nulo em Silo formado | PARCIAL | Necessita gate local em lote próprio antes da consolidação |
| Slug | Há normalização/validação básica e proteção de publicados; não há SlugArchitectureValidator | PARCIAL | Validator é futuro, sem alteração nesta fila |
| Silo pair | Criação manual grava catálogo, SiloDNA draft e SiloPage draft sequencialmente com readback guardado | DÍVIDA | Não oferece atomicidade transacional; não bloqueia a representação atual |
| Links | ArticleDNA.internalLinks, SiloDNA.linkMap, ContentPlanInternalLink e ContentDocument.linkMap existem | PARCIAL | São projeções de fases diferentes, não um grafo canônico |
| InternalLinkGraph | Nenhum tipo, schema, repository ou artifact type canônico foi localizado | BLOQUEADOR ESTRUTURAL | Não implementar grafo persistente apenas no Arquiteto |
| Anchors | AnchorCandidate/InternalLinkAssignment existem no contrato operacional e ContentPlan; não há anchor concepts ligados a uma relação do grafo | PARCIAL | Só podem ser usados como proposta da etapa correspondente |
| Brand Context | O Arquiteto passa id/nome/nicho; tipos de BrandDNA/material/skill/prompt existem em contratos compartilhados e Planejador, mas o pack selecionado não é hidratado no workspace do Arquiteto | PARCIAL | Formato final depende de Marca/Planner Geral |
| DataForSEO | O consumidor ativo usa adapter compartilhado e executor de SERP orgânica. O resolver usado para Connection é o caminho existente de allintitle; o catálogo global também declara uma constante de compatibilidade SERP separada | PARCIAL / DIVERGÊNCIA DE FUNDAÇÃO | Não alterar Plataforma nesta fila; registrar para Planner Geral se houver contrato global a alinhar |
| Providers legados | Não há dependência ativa de Serper, RapidAPI ou OpenRouter nos caminhos ativos do Arquiteto; referências fora do módulo permanecem em histórico/testes | IMPLEMENTADO NO MÓDULO | Não reabrir legado |
| Processo independente | Há tarefas, avaliações, versões e estados operacionais separados, mas não um ledger completo para cada processo conceitual | PARCIAL | Fechar apenas onde o código local puder preservar proveniência |
| UI | Planilha, ações manuais, SERP e IA pendente existem; a organização visual em três áreas ainda não existe | PARCIAL | Não redesenhar nesta fila |
| Docs x backlog | O backlog contém entradas históricas sobre catálogo-only/sem pair; código atual cria pair draft e a spec atual descreve pair | DIVERGÊNCIA DOCUMENTAL | Entradas históricas não orientam comportamento atual |

## 5. Estado real por área

### 5.1 Artigos

| Capacidade | Estado | Evidência e limite |
| --- | --- | --- |
| Working copy | IMPLEMENTADO | bootstrap canônico, cópia de trabalho e persistência guardada |
| Grupos | IMPLEMENTADO | ProvisionalArticleGroup e projeção de grupos no workspace |
| Lógica | IMPLEMENTADO | adapters/estratégia determinística e propostas de agrupamento |
| SERP de formação | PARCIAL | rota de SERP e assessment via adapter DataForSEO compartilhado; smoke real não verificado |
| IA estrutural | PARCIAL | rotas Article/Silo/Page e revalidate-structure geram proposta pendente; diagnóstico real do DeepSeek não verificado |
| Principal | IMPLEMENTADO | ArticleDNA exige uma principal coerente com keywordReferences |
| Secundárias/reforços | IMPLEMENTADO | teto de cinco referências de apoio e papéis manuais |
| Candidata a Silo | PARCIAL | sugestão existe; reserva/promoção/retorno explícitos não existem como ciclo canônico |
| Publicados | PARCIAL | políticas, identity refs e guards existem; readback real e Chrome autenticado não foram verificados |
| Confirmação | IMPLEMENTADO NO CÓDIGO | articleApprovalIssues/effectiveVersionStatus aplicam gates de formação |
| ArticleDNA | IMPLEMENTADO NO CÓDIGO | schema, referências, hash, version envelope e rotas de artefato existem; catálogo remoto não foi lido |

### 5.2 Silos

| Capacidade | Estado | Evidência e limite |
| --- | --- | --- |
| Working copy | IMPLEMENTADO | atribuição de artigo, silo e página no workspace canônico |
| Candidatos | PARCIAL | sugestões e sinais existem sem lifecycle de reserva |
| SiloDNA draft | IMPLEMENTADO | adapters e criação manual geram draft com nome/brand |
| SiloPage | IMPLEMENTADO | schema distinto, referência SiloDNA e rota de persistência |
| Pilar | PARCIAL | campos, papéis e geração determinística existem; SiloDNA formado aceita Pilar nulo |
| Suportes | IMPLEMENTADO NO CÓDIGO | supportArticleIds e papéis existem, sujeitos à formação |
| Publicados | PARCIAL | proteção de identidade existe; validação remota/manual não verificada |
| Slug | PARCIAL | normalização, validação básica e proteção de publicado |
| Verticalidade | PARCIAL | hierarchySignals, centralidade e sinais existem; gate de profundidade não está consolidado |
| Confirmação/readback | IMPLEMENTADO NO CÓDIGO | pair manual usa readback guardado; não é atômico nem foi validado remotamente |

### 5.3 Links Internos

| Capacidade | Estado | Evidência e limite |
| --- | --- | --- |
| Grafo canônico | BLOQUEADOR ESTRUTURAL | não há InternalLinkGraph em contracts, repositories, artifact types ou route |
| Inbound/outbound | AUSENTE | não há adjacência/versionamento canônico de entrada e saída |
| Relações | PARCIAL | SiloDNA.linkMap e assignments representam relações parciais de fases distintas |
| Anchor concepts | PARCIAL | candidatos de âncora existem no operacional/ContentPlan; não estão vinculados a arestas do grafo |
| Visualização | AUSENTE/PLANEJADO | React Flow foi explicitamente adiado |
| Handoff Planner/Redator/Publicações | PARCIAL | ContentPlan/ContentDocument carregam links, mas não recebem um grafo canônico do Arquiteto |

### 5.4 Marca

| Capacidade | Estado | Evidência e limite |
| --- | --- | --- |
| Brand Context básico | PARCIAL | Arquiteto usa brandId, nome e nicho |
| BrandDNA referenciado | PARCIAL | contrato BrandDNA e contexto Planejador existem; hidratação selecionada no Arquiteto não foi localizada |
| Docs/skills da Marca | AUSENTE NO ARQUITETO | contratos compartilhados existem, mas o gabarito final é futuro |
| MCP | PLANEJADO | proibido nesta fila |

### 5.5 Persistência e evidência

| Camada | Estado | Evidência e limite |
| --- | --- | --- |
| Local recovery | IMPLEMENTADO | recuperação por actor/brand e proteção contra estado vazio |
| IndexedDB | NÃO VERIFICADO | há infraestrutura de browser artifact em outras áreas, mas não foi tratada como fonte do Arquiteto |
| Remota | PARCIAL/NÃO VERIFICADO | rotas, repositories e readback existem; não houve consulta remota nesta fila |
| Migrations locais | IMPLEMENTADO COMO CÓDIGO LOCAL | 0027–0029 descrevem artefatos/workflow/SERP/documentos/publicações |
| Grafo remoto | AUSENTE NO CÓDIGO LOCAL AUDITADO | nenhuma tabela/artefato/repository de grafo foi localizado |
| Mocks | IMPLEMENTADO | providers e skeleton operacional existem |
| Fixtures/testes | IMPLEMENTADO | suites do Arquiteto cobrem domínio, SERP, handoff, providers globais e workspace |
| Remote schema/RLS | NÃO VERIFICADO NESTA FILA | não foi executado SQL nem consulta remota; SDD anterior registra que relações downstream não estavam confirmadas |

## 6. Matriz de dependências estruturais

| Necessidade | Existe hoje? | Gap | Módulo proprietário | Tipo de mudança | Bloqueia qual fase? |
| --- | --- | --- | --- | --- | --- |
| Working Article architecture | Sim, local/código | cobertura de alguns estados de processo | Arquiteto | aditiva local, quando possível | nenhum gate estrutural atual |
| ArticleDNA versions | Código, schema e migrations locais | existência/readback remoto não verificados | Arquiteto | confirmação de fundação, não nova migration nesta fila | handoff consolidado |
| SiloDNA draft/formado | Código, schema e migrations locais | Pilar nulo ainda permitido em formado | Arquiteto | gate local ou decisão contratual | consolidação de Silo formado |
| SiloPage | Código, schema e rota | readback remoto/manual não verificado | Arquiteto | confirmação e testes | publicação de SiloPage |
| Article ↔ Silo | campos, assignments e referências | lifecycle de candidato não formal | Arquiteto | aditiva local | promoção de candidato |
| Candidate Silo | sugestões | ausência de reserva/promoção/retorno canônicos | Arquiteto | aditiva local se não persistida | formação de Silo |
| InternalLinkGraph | Não | identidade, nós, arestas, relações, âncoras, versão e aprovação | Plataforma/Planner Geral com Arquiteto | contrato compartilhado + persistência/RLS/readback; possível migration/RPC | área Links, handoff completo e React Flow |
| Link relations | parcial | lista canônica de tipos e semântica | Planner Geral/Arquiteto | extensão de contrato do grafo | grafo |
| Anchor concepts | parcial | vínculo semântico entre conceito e aresta | Arquiteto + Planner | parte do contrato do grafo/ContentPlan | grafo/handoff |
| IA proposals | Sim, local/código | provider real e smoke não verificados | Arquiteto | local/adapter, sem provider novo | nenhum estrutural |
| SERP refs | Sim, código | validação real e possível alinhamento global DataForSEO | Arquiteto/Plataforma | resolver apenas pelo contrato global existente | gate SERP |
| Brand Context refs | parcial | pack selecionado e formato final | Marca/Planner Geral | contrato compartilhado/contexto versionado | IA contextual |
| Approval/version history | Sim, código | catálogo remoto não verificado | Arquiteto/Plataforma | confirmação; extensão somente se evidenciada | consolidação |
| Atomic Silo pair | sequência guardada | falta de boundary transacional | Plataforma/Planner Geral | RPC/transação compartilhada se exigida | garantia de atomicidade, não draft atual |

Conclusão da matriz: o único bloqueador estrutural necessário para representar a
área conceitual de Links é o InternalLinkGraph. O Brand Context Pack é uma
dependência futura de contrato entre Marca/Planner Geral. A atomicidade do par
SiloDNA/SiloPage continua uma dívida já registrada; não foi inflada para
bloqueador da consolidação atual porque o código representa pair draft com
readback explícito.

## 7. Pedido estrutural para o Planner Geral

Foi criado um pacote separado para o único bloqueador estrutural confirmado:

[Pedido estrutural — InternalLinkGraph](./arquiteto-pedido-estrutural-internal-link-graph-2026-08-25.md)

Resumo: decidir o contrato canônico do grafo, sua persistência, tenant/RLS,
versionamento, aprovação, readback e handoffs. O pedido não contém SQL
executável e não foi implementado nesta fila.

Não foi criado pedido para React Flow: ele depende do grafo e é frontend
projetado para lote posterior. Não foi criado pedido para MCP. Não foram
alterados Radar, Planejador, Redator, Publicações ou fundação global.

## 8. O que pode ser implementado localmente

Sem esperar mudança estrutural, os próximos lotes locais podem:

- fechar o estado independente de lógica/SERP/IA/revisão sem misturar aprovação;
- preservar/hidratar melhor o KeywordDNA completo na cópia de trabalho e nos diagnósticos;
- representar explicitamente candidata a Silo na working copy, sem promovê-la automaticamente;
- reforçar o gate local de exatamente um Pilar antes de SiloDNA formado;
- criar regras locais de verticalidade e o futuro validator de slug quando o lote for autorizado, preservando publicados;
- melhorar a experiência das três áreas sem redesenhar a planilha nem criar wizard;
- manter IA como proposta, controles humanos e referências de proveniência;
- cobrir fixtures, contratos, regressões e testes de readback local;
- preparar adaptadores de handoff que aceitem um grafo futuro sem inventar persistência local.

## 9. O que está bloqueado

- **InternalLinkGraph canônico:** não há contrato/persistência compartilhada;
  arrays existentes não possuem semântica suficiente.
- **Handoff completo de Links:** Planner/Redator/Publicações não podem receber
  a fonte de verdade que ainda não existe.
- **React Flow como editor real:** depende do grafo canônico; só pode ser
  projeção depois da fundação.
- **Brand Context Pack formal:** depende da decisão de Marca/Planner Geral
  sobre seleção, versionamento e fontes.
- **Atomicidade transacional do par de Silo:** permanece dívida estrutural
  registrada no backlog; uma garantia forte exigirá boundary de Plataforma.

## 10. Checklist consolidado

### Artigos

- [x] contrato e working copy presentes no código;
- [x] preservação de referências KeywordDNA no ArticleDNA;
- [x] lógica e grupos presentes;
- [~] candidata a Silo com lifecycle explícito;
- [~] SERP de formação via adapter compartilhado;
- [~] IA como proposta pendente;
- [x] edição manual de principal/secundária/reforço;
- [~] publicados com readback/manual real;
- [x] gate de ArticleDNA no código;
- [~] confirmação remota e browser real;
- [x] cobertura de fixtures/testes existentes.

### Silos

- [x] working copy e assignments;
- [x] SiloDNA draft;
- [x] SiloPage distinta;
- [~] gate de exatamente um Pilar em Silo formado;
- [x] Suportes e hierarquia no contrato;
- [~] candidata/reserva/promoção;
- [~] slugs e proteção de publicados;
- [~] verticalidade e profundidade;
- [~] SERP/IA como evidência/proposta;
- [~] confirmação/readback real;
- [x] criação manual pair draft com readback guardado;
- [ ] atomicidade transacional, se aprovada como requisito.

### Links Internos

- [ ] modelo InternalLinkGraph;
- [ ] nós e arestas versionados;
- [ ] relações estruturais;
- [ ] inbound/outbound;
- [ ] anchor concepts por relação;
- [ ] proposta IA;
- [ ] revisão humana;
- [ ] handoff Planejador;
- [ ] handoff Redator;
- [ ] validação Publicações;
- [ ] React Flow como projeção.

### Marca e governança

- [~] Brand Context básico no Arquiteto;
- [ ] Brand Context Pack formal;
- [ ] requisitos finais de docs/skills;
- [ ] MCP;
- [x] UI sem provider/Connection/capability/quota/crédito/API nos caminhos ativos auditados;
- [x] nenhuma infraestrutura global alterada nesta fila.

Legenda: [x] código/documentação existente, [~] parcial ou não verificado,
[ ] ausente/planejado ou bloqueado.

## 11. Plano recomendado

O plano detalhado por lote está em
[arquiteto-plano-implementacao-canonica-2026-08-25.md](arquiteto-plano-implementacao-canonica-2026-08-25.md).
A ordem é:

1. baseline e regressões operacionais;
2. Artigos: working copy/proveniência e estados independentes;
3. Artigos: lógica, candidata a Silo e gate humano;
4. Artigos: SERP e IA pendentes;
5. Artigos: consolidação/readback;
6. Silos: working architecture, Pilar, Suportes, verticalidade e slug;
7. Silos: SERP/IA/revisão/consolidação;
8. InternalLinkGraph após decisão estrutural;
9. projeção React Flow;
10. handoffs e validações downstream.

## 12. Documentos alterados ou criados

Criados nesta fila:

- docs/04-arquiteto/visao-canonica-artigos-silos-links.md;
- docs/04-arquiteto/auditoria-consolidacao-canonica-2026-08-25.md;
- docs/04-arquiteto/plano-implementacao-canonica-2026-08-25.md;
- docs/04-arquiteto/propostas/2026-08-25-pedido-estrutural-internal-link-graph.md.

Atualizados nesta fila:

- docs/04-arquiteto/spec.md;
- docs/04-arquiteto/estado-atual.md;
- docs/04-arquiteto/backlog.md;
- docs/04-arquiteto/propostas/README.md.

Nenhum arquivo de código, migration, schema, RLS, provider, Connection ou
módulo vizinho foi alterado.

## 13. Testes e verificações

Verificações estáticas executadas nesta fila:

- leitura dos documentos canônicos e ADRs aplicáveis;
- inspeção de contratos ArticleDNA, SiloDNA, SiloPage, ContentPlan e
  InternalLinkAssignment;
- inspeção de workspace canônico, rotas de persistência, repositories,
  adapters e UI;
- busca ativa por InternalLinkGraph/linkGraph;
- busca de Serper/RapidAPI/OpenRouter nos caminhos ativos do Arquiteto;
- inspeção das migrations locais sucessoras 0027–0029;
- comparação entre spec, estado atual, backlog e implementação.

Resultado automatizado executado após a gravação documental:

- `pnpm run test:arquiteto`: 120/121 testes passaram.
- A única falha é a asserção estática legada em
  `tests/arquiteto-domain.test.mts` que procura a marcação antiga do botão
  `Processar lógica` no componente do Minerador. Ela não envolve os arquivos
  alterados nesta consolidação.

Não foram executados provider real, Supabase remoto, DataForSEO real, DeepSeek
real, Chrome autenticado, migration, SQL ou escrita remota nesta fila.

## 14. Decisões ainda necessárias do usuário/Planner Geral

1. Aprovar o pacote do InternalLinkGraph e definir se a propriedade da
   persistência será da fundação compartilhada ou de um artifact versionado
   consumido pelos módulos.
2. Decidir, em fila própria, o contrato do Brand Context Pack e o relacionamento
   com Marca/Planner Geral.
3. Decidir se atomicidade transacional do par SiloDNA/SiloPage é requisito
   obrigatório ou se o readback guardado é suficiente.
4. Aprovar o primeiro lote local, sem misturar o bloqueador estrutural.

## 15. Primeiro lote recomendado

Depois da aprovação desta documentação, o primeiro lote deve ser **Artigos —
working copy e proveniência**: garantir que cada KeywordDNA recebido continue
com todos os campos e refs disponíveis na cópia de trabalho, explicitar estados
independentes de lógica/SERP/IA/revisão e cobrir o gate de ArticleDNA com
fixtures. Esse lote é local, não requer grafo, migration ou alteração global e
reduz o risco de seguir para Silos com dados incompletos.


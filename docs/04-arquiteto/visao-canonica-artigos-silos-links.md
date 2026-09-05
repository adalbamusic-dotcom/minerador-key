# Arquiteto — visão canônica de Artigos, Silos e Links Internos

**Status:** conceito consolidado documentalmente em 2026-08-25. Este documento
não autoriza migration, SQL, mudança de schema, RLS, RPC, provider, contrato
compartilhado ou alteração de módulo vizinho.

**Módulo proprietário:** Arquiteto.

## 1. Papel do Arquiteto

O Arquiteto é a mesa de arquitetura editorial do produto. Ele recebe
KeywordDNAs qualificados pelo Minerador, forma unidades editoriais, organiza
Silos e define relações internas que serão usadas pelas etapas posteriores.
Não é um wizard linear e não é o executor de publicação.

As três áreas canônicas são:

~~~
[ ARTIGOS ]  [ SILOS ]  [ LINKS INTERNOS ]
~~~

O workspace continua sendo a planilha/mesa operacional. As áreas representam
responsabilidades e filtros de trabalho; não obrigam a criação imediata de
três telas nem autorizam uma reconstrução visual.

| Etapa | Responsabilidade | Saída recebida/entregue |
| --- | --- | --- |
| Marca | contexto, BrandDNA, identidade, restrições e materiais | contexto da marca |
| Minerador | ingestão, qualificação, intenção, métricas e KeywordDNA | KeywordDNA completo |
| Arquiteto | grupos, papéis, ArticleDNA, SiloDNA, SiloPage e grafo de links | arquitetura formada |
| Radar | investigação da unidade já formada | evidências SERP e competitivas |
| Planejador | transforma arquitetura e evidências em ContentPlan | plano editorial |
| Redator | materializa o plano em ContentDocument | documento editorial |
| Publicações | governa fila, URL, slug, canonical, publicação e histórico | PublicationRecord |

O Arquiteto não é o Radar, SERP não é decisão, IA não é aprovação e SiloDNA
não é SiloPage.

## 2. Estados de trabalho

O Arquiteto mantém uma cópia de trabalho editável. Ela pode conter evidência,
hipótese, proposta, decisão humana e versão consolidada, mas esses estados não
podem ser confundidos:

~~~
KeywordDNA recebido
  → hipótese de lógica/grupo
  → evidência SERP
  → proposta de IA (opcional)
  → ajuste humano
  → ArticleDNA/SiloDNA/SiloPage consolidado
~~~

Somente a consolidação produz uma versão apta para o próximo gate. A IA pode
ser aplicada à cópia de trabalho, mas não aprova nem substitui uma decisão
humana. A SERP pode confirmar, conflitar ou mostrar insuficiência, mas não
move keywords e não confirma ArticleDNA automaticamente.

Os processos abaixo são independentes e possuem seu próprio estado:

- lógica: não executado, processando, concluído, falhou, stale;
- SERP: os mesmos estados, com revisão pendente quando aplicável;
- IA: os mesmos estados, sempre como proposta;
- revisão humana: pendente, ajustada, rejeitada ou consolidada.

Executar SERP não torna lógica stale por si só. Executar IA não torna SERP
stale por si só. Um processo fica stale quando o próprio insumo que o gerou
muda. A decisão consolidada permanece até que exista mudança real e uma nova
versão.

## 3. Área Artigos — KeywordDNA → ArticleDNA

### Entrada e preservação

A entrada é o KeywordDNA completo entregue pelo Minerador. O Arquiteto pode
normalizar a forma de consumo, mas nunca pode apagar ou substituir a
proveniência original.

Quando existirem, devem permanecer rastreáveis:

- keywordId, texto original e texto normalizado;
- intenção lógica/canônica, entidade, modificadores, nicho, funil,
  confiança e ambiguidade;
- volume, tendência, histórico, targeting, resultados, KD, backlinks e
  referring domains;
- CPC, competição Ads, KGR, aplicabilidade do KGR e estado de medição;
- revisão humana, decisão, versão, hash, provider/measurement refs;
- publicação, URL, slug, canonical, principalPolicy e demais proteções.

Ausência de evidência permanece ausência. null não vira zero.

### Processo de formação

1. **Lógica:** pergunta quais keywords parecem representar a mesma unidade
   editorial. A ordem operacional dos sinais é demanda/volume,
   resultados/competitividade, intenção, entidade/semântica, KGR, sinais
   comerciais e demais evidências. Essa ordem não permite ignorar intenção ou
   semântica.
2. **SERP:** testa a hipótese e pode produzir compatibilidade, conflito,
   sobreposição, intenção observada, tipo de página, universo competitivo,
   possível canibalização, necessidade de separar/juntar, principal fraca ou
   evidência insuficiente. A SERP não reorganiza o grupo.
3. **IA opcional:** recebe KeywordDNAs, agrupamento, SERP, regras, contexto da
   marca selecionado, publicados/proteções e Silos relevantes. Pode propor
   manter, dividir, juntar, mover, trocar principal, definir papéis ou
   descartar grupo inviável. A proposta deve ser rastreável, reversível e
   comparável com o estado anterior.
4. **Humano:** pode mover, separar, juntar, trocar principal, definir
   secundária/reforço, rejeitar IA, manter a lógica ou desfazer.
5. **Consolidação:** cria ArticleDNA com exatamente uma principal, até cinco
   secundárias/reforços e no máximo seis KeywordDNAs. Um ArticleDNA com uma
   única keyword é válido; o teto não é uma meta.

### Papéis provisórios

Na cópia de trabalho uma keyword pode ser membro de artigo, candidata a
principal, reforço semântico, candidata a Silo, candidata a fortalecimento de
publicado ou revisão manual. Esses papéis provisórios não devem ser tratados
como enum de persistência sem contrato aprovado.

Uma candidata a Silo combina centralidade, amplitude, entidade abrangente,
demanda/competição relevantes, SERP compatível, capacidade de representar
diversos ArticleDNAs e profundidade vertical. Volume sozinho não promove uma
keyword. A candidata é reservada provisoriamente e não é consumida
automaticamente por um ArticleDNA. Se não houver profundidade, retorna ao
fluxo normal. Criar Silo é a última opção: primeiro verificar se existe Silo
semanticamente equivalente que possa ser fortalecido.

### KGR, demanda e intenção

Estas são regras do produto, não leis universais de SEO:

- KGR é oportunidade, não aprovação;
- KGR ausente não invalida keyword nem bloqueia agrupamento/formação;
- null não vira zero; zero medido continua zero;
- a oportunidade KGR considera o limiar operacional de volume >= 120 e,
  para o perfil desejado, resultados menores que o volume;
- KGR confirmado tende a Suporte, não escolhe Pilar automaticamente;
- volume é sinal prioritário, mas não escolhe sozinho a principal;
- resultados/competição ajudam a distinguir oportunidade, termo competitivo,
  universo estrutural e esforço;
- comercial/local/transacional tende a captura de demanda e conversão;
- informacional/TOFU tende a autoridade, cobertura semântica, referência e
  suporte editorial, sem ser tratado como conteúdo sem valor comercial.

CPC e competição Ads são contexto comercial. Não representam dificuldade
orgânica. Tendência e sazonalidade são sinais de planejamento, não calendário
aprovado. Close variants são evidência de proximidade, não decisão de
agrupamento.

### Novo e publicado

Para artigo novo, a pergunta é qual arquitetura é mais adequada. Para artigo
publicado, a pergunta é como fortalecer uma identidade existente.

Em conteúdo publicado:

- brandId, URL, slug e canonical permanecem protegidos;
- principal travada permanece protegida;
- principal revisável só muda com SERP, proposta de IA, decisão humana e
  ArticleDNA sucessor;
- política desconhecida preserva a principal atual até decisão humana;
- fortalecer, rebaixar/promover Pilar/Suporte, trocar Silo ou remover keyword
  fraca exige nova versão e não altera a identidade publicada silenciosamente;
- antes de criar nova página, deve-se verificar se uma página publicada pode
  absorver a oportunidade.

## 4. Área Silos — ArticleDNA → SiloDNA + SiloPage

Silo não é pasta. A unidade estratégica é composta por:

~~~
SiloDNA + SiloPage + ArticleDNAs + InternalLinkGraph
~~~

SiloDNA descreve arquitetura, fronteiras, centralidade, hierarquia,
ArticleDNAs e relações. SiloPage descreve uma página indexável/publicável,
com identidade, conteúdo-base, slug, metadados, aprovação e publicação
próprios. São entidades independentes, versionadas e com aprovações próprias.

### Formação

ArticleDNAs são agrupados por entidade, intenção, assunto, centralidade,
profundidade, relação pai/filho, proximidade semântica, arquitetura existente,
risco de canibalização e verticalidade. A SERP pode ser reaproveitada dos
ArticleDNAs; nova coleta só ocorre quando necessária para termo candidato,
candidato a Pilar, conflito SiloPage/artigo ou dúvida arquitetural. A SERP
produz diretrizes, não reorganiza.

A IA pode propor juntar/dividir Silo, mover ArticleDNA, eliminar Silo raso,
nome, slug, Pilar, Suportes e relações. O humano controla a cópia de trabalho.
A consolidação cria SiloDNA, SiloPage e hierarquia consolidada.

### Pilar, Suportes e verticalidade

Cada Silo possui exatamente um Pilar consolidado. A escolha deve combinar
volume, centralidade, amplitude, formulação, intenção compatível, competição
real e capacidade de sustentar Suportes. KGR não escolhe Pilar
automaticamente.

Poucos Silos profundos são preferíveis a muitos Silos rasos. Um novo Silo tem
custo arquitetural alto e exige arquitetura própria, conflito real com um Silo
existente e profundidade suficiente.

Nome de novo Silo deve ser curto, normalmente com no máximo duas palavras;
slug deve ser curto, coerente com a entidade e sem redundância.

Para novos conteúdos, a arquitetura deve evitar repetição inútil da entidade
do pai, como /manicure/manicure-perto-de-mim. Slugs publicados não são
alterados. Um futuro SlugArchitectureValidator deverá detectar colisão,
redundância, competição SiloPage/Pilar, competição Suporte/SiloPage e
arquitetura excessivamente horizontal. O validator não faz parte desta fila.

### SiloPage não é Pilar

SiloPage representa entidade, categoria ou universo. Pilar é a unidade
editorial principal daquele universo. Não se deve criar automaticamente
SiloPage /manicure e Pilar /manicure, nem duas páginas com a mesma intenção.
Antes de consolidar, comparar intenção, centralidade, slug, SERP e objetivo.
Conflito exige revisão. Em publicados, a arquitetura se adapta ao legado sem
alterar URL/slug/canonical.

## 5. Área Links Internos — InternalLinkGraph

O Arquiteto define o grafo editorial a partir de SiloDNA e ArticleDNAs. A
responsabilidade é definir:

1. se existe relação;
2. origem e destino;
3. direção;
4. tipo;
5. prioridade;
6. motivo semântico;
7. conceitos/candidatos de âncora.

O Arquiteto não escolhe o parágrafo final, a frase final, o número final de
ocorrências nem uma âncora literal obrigatória para cada inserção.

| Módulo | Responsabilidade |
| --- | --- |
| Arquiteto | quem conecta, por quê, direção, importância e conceitos de âncora |
| Radar | acrescenta evidências/oportunidades sem redesenhar silenciosamente |
| Planejador | escolhe seção/contexto e quantidade planejada |
| Redator | escreve frase e âncora final natural |
| Publicações | valida URL final e integridade |

Relações mínimas: Pilar → Suportes relevantes; Suporte → Pilar; Suporte →
Suporte apenas com relação semântica real. Não criar cadeia por numeração.
Tipos conceituais candidatos: parent, child, sibling, continuation, comparison,
prerequisite, semantic_support, commercial_next_step, pillar_to_support,
support_to_pillar, support_to_support e silopage_to_article. A lista é
conceitual; não vira enum definitivo sem auditar consumidores.

Anchor concepts devem ser derivados semanticamente de KeywordDNA,
ArticleDNA, entidade, intenção e relação source → target. Não devem ser
gerados por simples divisão do texto da keyword.

O InternalLinkGraph é a fonte de verdade. Uma futura visualização React
Flow será apenas projeção editável do grafo persistido; o estado interno do
React Flow nunca será a única persistência.

## 6. Brand Context Pack

O Arquiteto pode receber um contexto de marca selecionado, não um despejo de
toda a marca. O conceito inclui, quando disponível, BrandDNA, público,
serviços/produtos, geografia, diferenciais, voz, restrições, documentos
selecionados e skills da Marca.

As subtarefas conceituais são:

- Artigos: diagnóstico, repartição, papéis, canibalização e consolidação;
- Silos: agrupamento, Pilar/Suportes, verticalidade, nome/slug e consolidação;
- Links: relação, direção, anchor concepts e revisão.

Não há autorização nesta fila para MCP nem para definir o formato final de
documentos/skills. Uma especificação futura deverá permitir que cada fonte
declare tipo, título, assunto, entidades, finalidade, escopo, prioridade,
marca, versão, fonte, quando usar e quando não usar. A definição final depende
do módulo Marca/Planner Geral.

## 7. Direção de UX

A experiência segue a densidade operacional da planilha do Minerador:

- mesa visível durante os processos;
- sem wizard;
- processo explícito começa no clique, sem confirmação redundante;
- lógica, SERP, IA e revisão exibem estado sem esconder a mesa;
- controles manuais permanecem disponíveis;
- seleção é efêmera, instantânea e nunca dispara persistência editorial;
- a UI não expõe provider, Connection, capability, quota, créditos ou API;
- usa o sistema visual compartilhado, tipografia legível, superfícies graduais,
  divisores discretos e sem roxo/violeta/índigo.

Este documento orienta evolução incremental e não autoriza redesenhar a
planilha nesta rodada.

## 8. Invariantes de saída

Antes de qualquer handoff:

- cada keyword importada permanece localizada em artigo ou em estado explícito
  de não agrupada/revisão;
- ArticleDNA mantém a referência individual de cada KeywordDNA, versão, hash e
  proveniência;
- cada ArticleDNA tem uma principal e no máximo cinco apoios;
- SiloDNA e SiloPage permanecem distintos;
- decisão de IA permanece proposta até aprovação humana;
- SERP permanece evidência e não decisão editorial automática;
- conteúdo publicado preserva marca, URL, slug e canonical;
- nova versão só nasce quando há mudança real;
- estado vazio, localStorage ou IndexedDB nunca substitui silenciosamente o
  estado canônico remoto;
- contratos de plataforma e módulos vizinhos não são alterados pelo
  Arquiteto.

## 9. Referências de auditoria e execução

- [Estado e contrato vigente do InternalLinkGraph](links-internos-estado-e-contrato.md)
- [Arquivo histórico da auditoria, plano e pedido estrutural](../_arquivo/2026-08-documentacao-legada/README.md)
- [Estado atual](estado-atual.md)
- [Backlog](backlog.md)

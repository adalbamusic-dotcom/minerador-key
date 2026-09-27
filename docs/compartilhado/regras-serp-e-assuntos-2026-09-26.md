# Regras da SERP e dos Assuntos na plataforma — 2026-09-26

> **Estado:** regras do dono do produto, consolidadas a partir das decisões
> dele de 2026-09-20 a 2026-09-26. Redação pendente de confirmação dele.
> Este documento só escreve as regras: não descreve o código, não prova
> implementação e não autoriza mudança por si só. O que estiver diferente no
> código é desvio a corrigir.
>
> Fontes das decisões: SDD do cache de SERP (`sdd-cache-serp-temporario-2026-09-23.md`),
> SDD de egress (`sdd-uso-supabase-orcamento-egress-2026-09-23.md`), SDD do
> Assunto (`sdd-assunto-tronco-editorial-2026-09-24.md`), ADR-022 e invariantes
> 79 a 83.

---

## Parte A — SERP

### A1. O que é a SERP aqui

A SERP é a página de resultados do Google para uma busca, lida como dado real:
- orgânicos;
- AI Overview e suas citações;
- perguntas relacionadas;
- pesquisas relacionadas;
- vídeos, produtos e os demais blocos.

É a **evidência de maior autoridade** da plataforma.

### A2. Hierarquia de autoridade

Quando duas fontes discordam, vence, nesta ordem:

1. **SERP conclusiva**: dado real do Google;
2. **decisão humana**;
3. **Lógica determinística**: agrupamento, núcleos, slug, hierarquia;
4. **IA**: só apoio semântico, sempre com as diretrizes de SEO (LSI/PNL, BERT, E-E-A-T, YMYL, KGR).

- Ler o AI Overview da SERP não é "usar IA": é ler a resposta que o buscador publicou.
- A SERP inconclusiva (mista, dividida) **não** sobrescreve a decisão humana nem a hipótese da Lógica. Ela fica registrada como evidência, e a decisão continua com o humano.
- Nenhuma fonte dá duas respostas para a mesma pergunta. A hierarquia diz qual vence.

### A3. Quatro lentes, sempre

**Toda SERP orgânica do Google é coletada nas 4 lentes**, em qualquer área e processo:

| Lente | Aparelho | Sistema |
| --- | --- | --- |
| desktop-windows (canônica) | desktop | Windows |
| desktop-macos | desktop | macOS |
| mobile-android | celular | Android |
| mobile-ios | celular | iOS |

- Não existe "só a lente principal" como padrão. Uma SERP com lente faltando é **incompleta**, e a tela diz isso.
- A lente canônica guarda o corpo completo, com profundidade 20. As outras três guardam o resumo (top 10 com URL, domínio e título) e a observação, com profundidade 10.
- O pedido sai sempre em modo `advanced`, porque o `regular` anuncia blocos que não entrega. O sistema operacional vai no corpo do pedido: sem ele, as duas lentes de desktop viram a mesma consulta.
- **Divergência entre lentes é sinal, não defeito.** Não se agrupa por aparelho: o agrupamento é um só, nas 4 lentes. Resultado que aparece em mais de uma lente reforça. Resultado que aparece numa lente só é registrado como "apareceu em um aparelho só", e não reforça sozinho.
- YouTube e Amazon Merchant ficam com lente única, e o eco de aparelho e sistema vai para a proveniência.

### A4. Cache: a SERP paga é paga uma vez

- **A SERP vai para o cache no banco desde a primeira coleta**, em qualquer lugar onde ela for acionada: Descobrir, Pesquisa por Assunto, Processador, Arquiteto ou Radar. É a única exceção à regra de que o Descobrir não grava no banco, porque é dado pago.
- **Chave do cache:** marca × keyword × localidade × idioma × lente × endpoint.
- **Validade:** 30 dias, por marca.
- **Cache primeiro, sempre.** Antes de qualquer chamada paga, o sistema lê o cache e **só paga as lentes que faltam**. Uma SERP que o Minerador pagou serve ao Arquiteto e ao Radar, e o inverso também vale.
- **Recoleta automática não existe.** Recoletar dentro da validade só acontece com o botão "Recoletar agora (pago)" e confirmação.
- **Leitura mínima:** quem só precisa saber se existe lê o `meta`; quem precisa dos domínios lê a `observation`; quem precisa das URLs lê o `digest`; o corpo inteiro só é lido por quem de fato usa o corpo.
- **Proveniência:** o Radar, ao finalizar, congela as lentes que usou. O pacote entregue ao Redator não muda quando o cache muda depois.

### A5. Quando se paga

- **Toda chamada paga é explícita:**
  - antes de pagar, aparece o **plano**, com as chamadas, o preço de cada uma e o total;
  - o humano confirma uma vez;
  - o servidor nunca paga além do que foi autorizado.
- **Nada paga sozinho:** filtro, abertura de tela, recarregar ou importação nunca disparam SERP.
- **O Google Ads não custa nada:** volume, CPC e ideias podem ser pedidos quantas vezes o usuário quiser, e cada medição nova atualiza. Só a SERP e as chamadas DataForSEO são pagas.
- **Todo gasto entra no ledger** (`integration_usage_events`), com a capability certa. Chamada paga sem registro no ledger é desvio.
- **Em testes, chamada paga é proibida:** eles usam fixtures.
- **Serper e RapidAPI não voltam.**

### A6. A SERP em cada área

| Área | Quando a SERP entra | O que ela decide |
| --- | --- | --- |
| **Descobrir** | Só com o filtro de Resultado ou de KD ativado (os dois começam em "Sem medição"), e só pelo botão de medir. | Resultados (allintitle), KD e a SERP nas 4 lentes, que vai para o cache. |
| **Pesquisa por Assunto** | Só com o plano confirmado. A SERP da frase entra nas 4 lentes, como unidade. | Mostra quais páginas estão no topo, para a fonte "o que o topo ranqueia". |
| **Processador (Minerador)** | Botão Resultados. | Intenção e funil saem das **4 lentes** (classificador v4). A SERP conclusiva fecha intenção e funil acima da Lógica. Se a SERP diverge, vira "Misto na SERP (A × B)", nunca "Ambíguo" por falta de leitura. |
| **Arquiteto** | "Processar arquitetura" é **só Lógica, sem provider**. A SERP entra depois, por ação explícita: validar a formação dos artigos, eleger a primária de um Silo novo e responder à pergunta territorial. | Valida a composição de cada artigo; elege a primária entre candidatas de um Silo novo. Sem candidata forte, a eleição recusa. |
| **Radar** | Investigação do artigo, com cache primeiro. "Recoletar agora" é pago e pede confirmação. | Estrutura observada, concorrentes, perguntas, lacunas, onde o Assunto cabe. Congela tudo ao finalizar. |
| **Redator e CSV** | Nunca coletam. | Leem a SERP congelada pelo Radar, com as 4 lentes e a proveniência. |

### A6.1 Minerador e Radar: a mesma SERP, perguntas diferentes

Os dois usam **o mesmo cache**. O que muda é a pergunta que cada um faz à SERP.

| | **Minerador** | **Radar** |
| --- | --- | --- |
| **Pergunta** | "O que é esta busca?": uma keyword de cada vez. | "O que este artigo precisa ter para ganhar?": o artigo inteiro, com todas as keywords dele. |
| **Recebe** | A keyword, com a Lógica já feita. | O ArticleDNA: principal, secundárias, reforços e Assunto. |
| **Quando coleta** | Botão Resultados no Processador, ou "Medir resultados" no Descobrir com o filtro ativo. Numa ação só, vêm Resultados (allintitle), KD e a SERP nas 4 lentes. | Na investigação do artigo: SERP da principal e das secundárias nas 4 lentes. "Atualizar SERP" usa o cache; "Recoletar agora" é pago e pede confirmação. |
| **Paga** | Normalmente é quem paga primeiro. | Só as lentes que faltam: reaproveita o que o Minerador e o Arquiteto já pagaram. |
| **O que lê da SERP** | Os orgânicos e todos os blocos (vídeos, produtos, perguntas, AI Overview, local), nas 4 lentes, para classificar a busca; a concorrência (domínios fortes); a presença do site da marca. | Tudo o que ajuda a escrever: títulos e estrutura dos concorrentes, perguntas, AI Overview e citações, vídeos, produtos, lacunas, diferença de formato entre aparelhos e onde o Assunto aparece. |
| **O que decide** | **Intenção e funil** da keyword. Se a SERP for conclusiva, vale acima da Lógica. Se as lentes divergirem, "Misto na SERP (A × B)". Também o formato esperado. | O **modelo editorial**: seções, cobertura obrigatória (inclusive a seção da virada), posição sugerida da virada, complemento do H1, se a SERP sustenta o artigo (suficiente, parcial ou em conflito), alertas e lacunas. |
| **O que grava** | No KeywordDNA, só o **resumo** (`evidencia_serp`: intenção, funil, lentes lidas, acordo entre elas). O corpo fica no cache. | A investigação e, ao **finalizar**, o pacote **congelado**: lentes usadas, estado da SERP, estrutura. Depois de finalizado, não atualiza mais. |
| **Entrega** | KeywordDNA aprovado, para o Arquiteto. | Pacote congelado, para o Redator e o CSV. |
| **Nunca faz** | Agrupar keywords, formar artigo, recoletar sozinho, inventar intenção sem evidência. | Reagrupar keywords, trocar a principal, mudar papéis, slug, canonical ou o Assunto. O que ele acha que deveria mudar vira **alerta e proposta ao Arquiteto**. |

**Entre os dois fica o Arquiteto:**
- usa a SERP das keywords (a mesma do cache) para **validar a composição** de cada artigo;
- usa a mesma SERP para **eleger a primária** de um Silo novo;
- não investiga o conteúdo: isso é do Radar.

### A7. O que a SERP não faz

- **Não troca a principal publicada.** Ela pode **propor** a troca, que só é aplicada por decisão humana, conforme o estado da principal (travada ou revisável), com URL, slug e canonical protegidos.
- **Não move keyword de artigo** nem reagrupa em silêncio.
- **Não troca, promove nem rebaixa o Assunto.**
- **No Radar, não redefine papéis.** O Radar não reagrupa keywords, não troca a principal e não muda slug, canonical ou URL.
- **Nunca vira zero.** SERP ausente, lente faltando ou provider com erro nunca viram dado inventado: a célula mostra que falta, e o processo não "passa pela metade".

### A8. Falha

- **Erro do provider:** aparece como erro, em cor de alerta, e a SERP anterior válida do cache não é apagada.
- **Falha no meio de um lote:** o lote conta a falha e segue com os outros itens. O que já foi pago e gravado fica gravado.
- **Repetição:** repetir a mesma operação não paga duas vezes. O servidor confere o ledger antes de pagar.

---

## Parte B — Assuntos (temas)

### B1. O que é o Assunto

O Assunto é uma frase que **o humano declara** como o tronco de um ou mais artigos: o tema, a oferta ou o serviço da marca. Exemplo: "SEO para clínicas".

- **Ele não precisa ter volume de busca.** Muitas vezes o público não conhece o termo.
- **As keywords de sustentação** são as buscas reais que trazem o leitor até ele: "marketing para clínicas", "como atrair pacientes".
- **O artigo responde à keyword do jeito normal** e, num ponto escolhido pela semântica e pela SERP, faz a **virada** para o Assunto.

### B2. Quem declara, e como

- **Só o humano declara Assunto,** com autor (`auth.users.id`) e data. A IA nunca declara nem prende Assunto, e proposta de IA só vale depois de aceita.
- **Onde se declara:**
  - no **import do Processador**: o select "Esta lista é", com padrão Assunto, e as colunas opcionais `nota` e `página`;
  - na **Revisão Humana**, no bloco Vínculo;
  - no **rodapé em grupo**, pelo seletor Vínculo, que é o mesmo componente da Revisão Humana;
  - no **envio da Pesquisa por Assunto**: "Declarar também como Assunto", que vem marcada se a frase é nova e desmarcada se ela já existe.
- **Nota e página de destino:**
  - a nota é curta (até 280 caracteres) e diz o que é e para quem;
  - a página de destino só é aceita se for `https` no domínio do site da marca;
  - em grupo, a nota e o destino podem ser iguais para todas as keywords selecionadas.
- **Declarar numa keyword aprovada** manda ela para "Em revisão", com aviso antes. Retirar a declaração também.

### B3. O Assunto no Vínculo

O Vínculo tem **três declarações** independentes, iguais no card da Revisão Humana, no rodapé e na coluna:

1. **Posto de principal**: Livre ou Travado ao slug; só para publicadas.
2. **Potencial de página**: Artigo, Silo, Landing page ou Página de serviço, cada um como **potencial** ("pode ser") ou **declarado** ("vai ser").
3. **Assunto**: Não ou Declarado.

Regras entre elas:
- **Assunto declarado desliga o Posto e o KGR** para aquela keyword, porque os dois não se aplicam a Assunto.
- **O Potencial de página vale também para o Assunto:** "este Assunto vai ser uma landing page".
- **A coluna Vínculo mostra sempre as três**, com o valor padrão ou a escolha do usuário.

### B4. Aprovação do Assunto

- Com Assunto declarado, aprovar **dispensa Volume, Resultados e KGR**. Só a **Lógica** continua exigida. Ela é local, grátis, **roda sozinha** logo depois da declaração e dá ao Arquiteto uma hipótese de intenção e funil.
- **A aprovação continua sendo um ato humano** pelo Status: nada é aprovado sozinho.
- **Mesma regra na tela e no servidor:** a tela e a trava do envio ao Arquiteto usam a mesma regra.

### B5. Principal, slug e H1

- **A principal do artigo é sempre uma keyword com busca:** a âncora, dona do slug, do KGR e do H1.
- **O Assunto é o fundamento:** entra no H1 como complemento da principal ou num H2/H3, conforme a semântica e a SERP das keywords de sustentação.
- **O Assunto só pode ser a própria principal quando tem Volume validado.** Aprovado sem volume, ele nunca é principal nem dá slug. Nunca é secundária nem reforço do mesmo artigo.
- **Em keyword publicada, declarar Assunto não muda** URL, slug, canonical nem a principal.

### B6. Alcance

- Um artigo tem **um** Assunto: um tronco só.
- O mesmo Assunto pode sustentar **vários artigos, landings, páginas de serviço ou um Silo inteiro**.
- O Assunto **não conta** no teto de 6 keywords do artigo e não entra em `keywordReferences`.

### B7. Encontrar as keywords de sustentação (Pesquisa por Assunto)

- **No Descobrir,** o modo "Por Assunto" recebe a frase (e, opcionalmente, a nota e a página) ou um Assunto já declarado.
- **Fontes:**
  - Google Ads pela frase e pela página de destino, grátis;
  - pesquisas relacionadas do Google, mesma categoria e o que as páginas do topo da SERP da frase já ranqueiam, pagas pelo DataForSEO Labs;
  - a SERP da frase, nas 4 lentes, com cache primeiro.
- **Custo:** o custo aparece antes, e o teto é de **US$ 0,20 por pesquisa**.
- **Candidatas:**
  - cada uma mostra de onde veio e por quê;
  - a estimativa de volume do Labs aparece rotulada e **nunca vira volume**, porque o volume oficial é medido depois no Processador pelo Google Ads;
  - o Minerador não inventa keyword: toda candidata vem de um provider.
- **Onde fica a lista:**
  - a lista fica **no navegador**, por 30 dias, com no máximo 10 pesquisas por marca, e a vencida e a mais antiga saem sozinhas;
  - só o envio ao Processador grava no banco;
  - as keywords enviadas levam a proveniência com o id do Assunto, e o Arquiteto as sugere primeiro como sustentação dele.

### B8. No Arquiteto

- **Nas listas,** o Assunto aparece como "Assunto · declarado". O filtro "Assuntos" mostra quantos artigos cada um sustenta.
- **Silos e artigos formam-se em torno do Assunto:**
  - o Arquiteto **sugere** as keywords de sustentação, com o motivo de cada uma, e **o humano escolhe**;
  - a SERP das keywords de sustentação, nas 4 lentes, valida o artigo;
  - a principal sai entre as keywords escolhidas.
- **Conservação:** nenhuma keyword some.
  - Um Assunto sem artigo fica em "Keywords não agrupadas", com o selo "Assunto · aguardando sustentação".
  - Um Assunto preso em artigos aparece como "Assunto · tronco de N artigos".
- **Prender e soltar o Assunto é ato humano,** conferido no servidor: autor humano, keyword da marca, declarada no pacote aprovado.
- **O Silo sugere o Assunto aos artigos novos,** e cada artigo confirma.
- **Assunto sem volume nunca entra na formação automática** nem na eleição da principal.
- **Se o Minerador retirar a declaração depois,** o artigo segue com o último pacote aprovado e mostra um aviso. Nada troca sozinho.

### B9. No Radar

- **Toda a investigação gira em torno do Assunto:**
  - a estrutura do artigo **exige** a seção da virada, mesmo sem página concorrente que trate dele; ela entra como H3 ou ponto a cobrir, nunca H2 por decreto;
  - **o especialista aprofunda o Assunto**, com o pedido em linguagem simples para quem é de fora: "Tema a aprofundar" e a pergunta por extenso;
  - **o YouTube busca o Assunto** quando há camada de vídeo, dentro do limite de consultas.
- **Onde o Assunto cabe se decide pela semântica e pela SERP** das keywords de sustentação: posição sugerida da virada e complemento do H1. Sem sinal, a decisão fica com quem redige, e nada é inventado.
- **Se as buscas não sustentam o Assunto,** o Radar **avisa** e devolve ao Arquiteto para decisão humana. Não bloqueia a finalização.
- **O Radar nunca troca, promove ou rebaixa o Assunto.**
- **A chamada final leva o leitor à página de destino,** ao lado da chamada observada na SERP.

### B10. No Redator e no CSV

- **Quem redige recebe:**
  - o **Assunto** com a nota;
  - a **página de destino**;
  - **onde fazer a virada**;
  - a **direção do H1**;
  - o **alerta** do Radar.

  Vale no painel, no MCP, no roteiro, no carrossel e no CSV "Para escrever".
- **A estrutura final é decisão de quem redige.** O Redator não troca nem remove o Assunto: a proibição viaja no pacote.
- **O guardião avisa** quando falta a virada ou o link para a página de destino. Ele não bloqueia.

---

## Parte D — Regras do Arquiteto que não podem ser quebradas

Decididas pelo dono em 2026-09-26: "quem tem prioridade são os publicados e os assuntos, o resto depois". Nenhuma lógica, SERP ou IA passa por cima destas regras.

### D1. Ordem de precedência na formação

**O lote diz o objetivo.** Se o dono colocou publicados ou Assuntos no lote, é porque quer **melhorá-los**, não criar artigos novos.

Com publicados ou Assuntos no lote, a formação segue esta ordem:

1. **Publicados.** Silos e artigos que estão no ar, com URL. São âncoras fixas, já formadas e comprovadas. O Arquiteto **revalida, remonta e reforça**; não reinventa. Cada artigo publicado recebe as keywords livres que aprofundam o conteúdo dele, até o teto de 6 (D4).
2. **Assuntos declarados.** São troncos que precisam **virar artigos bons**. Cada Assunto recebe as keywords de sustentação compatíveis.
3. **Keywords livres.** Existem **para dar força, presença e profundidade** aos publicados e aos Assuntos. Elas são distribuídas por semântica e por **importância**:
   - o publicado vem antes do Assunto;
   - entre dois destinos compatíveis, a keyword vai para onde agrega mais: intenção igual, mesma entidade, maior relevância e volume.
4. **Sobras.** A livre sem encaixe semântico em publicado ou Assunto fica em "Keywords não agrupadas", com o motivo. **Ela não vira artigo novo sozinha.** Formar artigos novos com as sobras é uma ação explícita do dono ("Formar artigos novos com as sobras").

**Lote todo novo** (só Assuntos novos e keywords, sem publicado): as livres formam os artigos em torno dos Assuntos. Sem Assunto, formam artigos novos desde o início. As regras D4 a D8 continuam valendo.

### D2. Publicado nunca é penalizado

- O publicado é reconhecido pelo Vínculo (URL e canonical conferidos, posto, tipo declarado), mesmo com status "aprovado".
- Ele nunca aparece como "isolado", "candidato individual", "Não aplicável" ou "sem convergência" por estar sozinho. Um publicado sozinho é um artigo completo que aguarda reforço.
- A principal, a URL, o slug, o canonical e a marca **nunca mudam** (AGENTS §11).
- O Silo do artigo publicado sai da URL (caminho sob a URL do Silo publicado), não da semelhança de palavras.
- Ele recebe livres compatíveis até o teto de 6 (D4). Duas publicadas nunca se fundem.

### D2.1 Posto da principal publicada: travada ou livre para troca

O Posto da keyword publicada diz o que o dono quer do artigo:

- **Travado ao slug:** a principal fica. O artigo só **recebe reforço**.
- **Livre:** a principal está ali **para ser trocada**. O dono colocou o artigo no lote para melhorá-lo, e em geral a principal atual não tem volume. O Arquiteto **procura e propõe** a melhor substituta:
  - uma keyword com volume validado;
  - com a mesma intenção;
  - que **divida a SERP** com o artigo, com páginas em comum nas 4 lentes.
- **O que nunca muda na troca:**
  - URL, slug, canonical e marca;
  - a principal antiga vira secundária do mesmo artigo.
- **A troca só é aplicada por decisão humana,** com nova versão e histórico (AGENTS §11).

### D2.2 Medida de "mesmo assunto": a SERP primeiro

- **Duas keywords tratam do mesmo assunto quando a SERP diz isso:** páginas em comum no top 10, nas 4 lentes, lidas do cache já pago. Palavras em comum e a Lógica são sinais de apoio, nunca a medida principal (A2).
- **O reforço, a troca da principal, a sustentação de Assunto e as propostas entre Silos usam essa medida.**
- **Quando nenhuma keyword do lote divide a SERP com o publicado ou o Assunto,** o sistema diz isso claramente ("nenhuma keyword deste lote trata do mesmo assunto no Google"). Ele oferece **Buscar reforço**: a Pesquisa por Assunto com o tema e a URL do artigo. E não cola keyword de outro assunto.
- **Se nem a busca achar demanda,** o sistema informa "tema sem demanda no Google" e deixa a decisão com o dono.

### D2.3 Volume primeiro, e sugestão que o dono só confirma

Decidido pelo dono em 2026-09-27: "se não tem volume, não presta".

- **Keyword sem volume não reforça nada.** O Google Ads sem média e a estimativa do DataForSEO igual a zero ou vazia contam como sem volume.
  - Ela nunca é sugerida como reforço, sustentação ou nova principal.
  - Na Pesquisa por Assunto, fica **escondida por padrão**, com o total escondido à vista.
  - O Assunto é a única exceção, porque ele é o tronco.
- **O sistema faz o trabalho pesado; o dono só confirma.** Cada publicado e cada Assunto recebe uma lista de sugestões ordenada por volume, em dois níveis:
  - **Forte:** 3 ou mais páginas em comum no top 10 (D2.2). Vem marcada.
  - **Provável:** 2 páginas em comum, ou 3 ou mais domínios em comum, ou mesma entidade e mesmo problema no DNA. Vem desmarcada.

  Cada item mostra o volume e o motivo. O dono marca e aplica de uma vez, até o teto de 6.
- **A intenção que barra é a da SERP** (`evidencia_serp`). A intenção da Lógica, quando diverge, só gera aviso.
- **Sobras viram oportunidades:**
  - elas aparecem agrupadas por tema, pelo volume somado, com o nome da keyword principal do grupo;
  - cada grupo tem a ação "Criar artigo novo com este grupo", que nunca é automática;
  - sobra sem volume aparece recolhida, no fim.

### D3. Assunto nunca é penalizado

- O Assunto é tronco. Ele nunca aparece como "isolado", "Não aplicável" ou falha por não ter volume ou companhia.
- Sem keywords de sustentação, ele aparece como **"Assunto · aguardando sustentação"**, um estado normal e não um erro.
- As livres compatíveis são oferecidas primeiro a ele (D1), e o humano confirma a sustentação.

### D4. No máximo 6 keywords por artigo

- Cada artigo tem **uma principal e até 5 keywords de apoio: no total, 6**. Nenhum candidato automático passa disso.
- O excedente fica visível: forma outro artigo se tiver assunto próprio comprovado, ou fica em "Keywords não agrupadas". Nunca some.
- O Assunto fica fora desse teto e não dá slug.
- Uma revisão humana acima de 6 fica em conflito até ser resolvida. Nunca é aceita em silêncio.

### D5. O DNA das keywords vem primeiro

- **Todo processo do Arquiteto começa lendo os KeywordDNAs aprovados:**
  - intenção e funil tirados da SERP nas 4 lentes;
  - volume, KGR e Resultados;
  - entidade central e nicho;
  - Vínculo: posto, tipo de página, URL publicada e Assunto;
  - proveniência, como a Pesquisa por Assunto.
- O Arquiteto **não refaz** o que o Minerador já concluiu. A SERP que está no DNA e no cache é reaproveitada antes de qualquer coleta.
- Um agrupamento que contraria o DNA (intenção ou funil diferentes, SERP conclusiva divergente) não é proposto como automático.

### D6. SERP no Arquiteto e no Radar: cache primeiro, coleta quando precisa

- **Primeiro o cache,** do DNA e das 4 lentes. Artigo cuja evidência está completa no cache recebe parecer **sem custo**.
- **Coletar do provider é permitido,** sem proibição, quando a evidência não basta para aquele artigo: lente faltando, composição nova, SERP vencida ou insuficiente. A tela avisa o motivo e o custo antes, e o humano confirma.
- **O humano também pode pedir coleta nova** mesmo com cache ("Recoletar", com aviso e custo).
- **Se o cache não puder ser lido, a coleta não fica proibida.** A tela avisa que não dá para saber o que está no cache e oferece coletar com o custo máximo, ou tentar ler de novo.
- **Cancelar o pagamento não cancela a análise:** os artigos que já têm evidência no cache recebem parecer mesmo assim, e só os que dependem de coleta ficam pendentes, com o motivo.
- **Os contadores falam a verdade:** "coletada" e "reaproveitada" só depois de gravado e conferido. Artigo "bloqueado" diz exatamente o que falta.

### D7. Candidato de uma keyword só

- Uma livre sozinha não vira artigo automático se existir publicado ou Assunto compatível: ela vai reforçá-lo (D1).
- Sem encaixe, e com publicado ou Assunto no lote, fica em "Keywords não agrupadas", com o motivo. Em lote todo novo, pode virar candidato novo.

### D8. Conservação e decisão humana

- **Nenhuma keyword some.** Toda keyword recebida está num artigo, num tronco de Assunto ou em "Keywords não agrupadas".
- **Decisão humana confirmada não é alterada em silêncio.** A lógica, a SERP e a IA só propõem.
- **Nenhuma associação cruza Silo ou marca sem decisão humana.**

---

## Parte C — Onde conferir se está aplicado

Cada item abaixo é uma regra acima transformada em verificação. Um "não" é desvio a corrigir:

1. Alguma tela coleta SERP com menos de 4 lentes, ou oferece "só a principal" como padrão?
2. Alguma chamada paga sai sem plano e confirmação, ou sem registro no ledger?
3. Alguma área paga de novo uma lente que está no cache dentro dos 30 dias, sem o botão "Recoletar"?
4. A SERP coletada no Descobrir ou na Pesquisa por Assunto vai para o cache e serve ao Processador, ao Arquiteto e ao Radar?
5. A intenção e o funil do Processador saem das 4 lentes, com "Misto na SERP" quando a SERP diverge?
6. Algum filtro, abertura de tela ou importação dispara SERP?
7. O Radar congela as lentes que usou, e o Redator lê o que foi congelado?
8. A SERP trocou alguma principal publicada, ou moveu alguma keyword, sem decisão humana?
9. O Assunto aparece igual no card da Revisão Humana, no rodapé e na coluna?
10. Um Assunto aprovado sem volume virou principal ou deu slug em algum artigo?
11. O Radar exige a seção da virada, o especialista recebe o pedido e o Redator vê onde virar e a página de destino?
12. A posição da virada é decidida pelo sentido (semântica) e pela SERP, ou só por palavras em comum?

---

## Depois de confirmar

Estas regras viram fonte canônica. Três passos, cada um em entrega própria:

- **Atualizar os documentos** que as regras tocam: as specs de Minerador, Arquiteto, Radar e Redator, e as invariantes onde couber.
- **Atualizar o catálogo das IAs conectadas pelo MCP** (`lib/agent/platform-catalog.ts`, AGENTS.md §17.1).
- **Fazer a auditoria da Parte C**, uma área por vez.

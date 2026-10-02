# SDD — Reparo pontual do artigo (`ARTICLE_REPAIR_1`)

**2026-10-01** · módulo proprietário: **Arquiteto** · status: **autorizada e implementada (1ª entrega)**

> **Autorização do dono, 2026-10-01:** escopo *reexecutável + decisão humana*.
> A classe **custo de provider** fica para uma segunda entrega.

---

## 1. O problema, com o caso que o revelou

Em 2026-10-01 o artigo publicado *"como captar clientes para clínica de estética"*
(`24679c44-c15c-46b0-ba3a-39da0a7b265a`, marca AdalbaPro) ficou preso. Tudo nele
estava certo — ArticleDNA v2 aprovado, 2 de 2 decisões humanas resolvidas,
InternalLinkGraph aprovado, Silo canônico resolvido — e mesmo assim o envio ao
Radar respondia:

> *"O parecer da SERP ainda espera decisão editorial."*

A causa não era mérito editorial. Era **estado parcial**:

| Passo da operação "Reforçar publicados" | Resultado |
| --- | --- |
| gravar `articleFormationRef` + decisão humana na keyword | ✅ 28/09 22:51:59 |
| criar o ArticleDNA do publicado | ✅ 28/09 22:54:10 |
| resolver o parecer da SERP | ❌ nunca aconteceu |
| gravar a conclusão no marcador de formação | ❌ nunca aconteceu |

O artigo existia e estava aprovado; a **prova** de que fora aprovado, não. O
portão lê a prova, não o artigo.

E não havia saída pela interface: *Concluir formação* recusa publicados por
definição (URL, slug e canonical protegidos) e *Melhorar publicados* descarta
páginas sem keyword nova — o plano sai `unchanged`
([published-reinforcement.ts:450](../../lib/arquiteto/published-reinforcement.ts))
e a confirmação só processa `ready`
([arquiteto-published-reinforcement.ts:518](../../lib/server/arquiteto-published-reinforcement.ts)).

O desbloqueio exigiu uma chamada manual de API, feita por um agente, com o dono
autorizando. **Isso não escala e não deveria ser necessário.**

## 1.1 Por que não é caso isolado

Toda operação do Arquiteto que fecha um artigo escreve **vários artefatos em
sequência, sem atomicidade entre eles**: parecer, marcador, ArticleDNA, item de
workflow, grafo. Qualquer interrupção entre dois passos deixa o mesmo tipo de
rastro meio-escrito:

* o provider de IA ou de SERP responde 4xx/5xx no meio do lote;
* a rede cai entre a gravação e a releitura;
* o banco recusa uma escrita por lock e o resto do fluxo segue;
* a aba é fechada durante uma confirmação longa;
* um deploy entra no meio de uma operação em curso.

O dono relatou a expectativa correta: **vão existir muitas ocasiões assim.** O
sistema precisa de um mecanismo próprio para isso, em vez de um especialista
reconstruindo o estado à mão a cada vez.

---

## 2. Contrato atual

### 2.1 O portão já enumera tudo

`resolveRadarEligibility` ([radar-handoff-gate.ts:121](../../lib/arquiteto/radar-handoff-gate.ts))
avalia **doze** invariantes e devolve, para cada uma, `code`, `ok` e um `detail`
em português. Hoje esse resultado só alimenta uma recusa.

**Esta SDD não propõe inventar um catálogo de defeitos: propõe usar o que já
existe.** O portão é a lista de invariantes do artigo; falta a contrapartida —
o que fazer quando uma delas quebra.

### 2.2 As autoridades de escrita já existem

| Reparo | Autoridade canônica, já implementada |
| --- | --- |
| registrar decisão sobre o parecer | `POST /api/arquiteto/serp-resolution` (permissão `edit`, readback obrigatório) |
| gravar conclusão no marcador | `saveArticleFormationMarker` + `readbackArticleFormationMarker` |
| recoletar SERP | o mesmo núcleo de "Processar artigos" (cache primeiro) |
| reconfirmar ArticleDNA | `appendArquitetoArtifact` + releitura |

O reparo **não ganha caminho de escrita próprio**. Ele orquestra os que existem.

---

## 3. Proposta

Uma operação **por artigo**, disponível quando — e somente quando — o portão
acusa pelo menos um bloqueio: **Diagnosticar e reparar**.

Ela tem três tempos, sempre nesta ordem:

```
1. DIAGNÓSTICO (leitura pura, sem custo, sem escrita)
   lista cada invariante quebrada, com o motivo que o portão já sabe dizer
   e com o reparo que ela admite — ou a ausência dele

2. CONFIRMAÇÃO (humana, item a item)
   a pessoa escolhe o que reparar; o que exige decisão editorial é
   apresentado como decisão, não como botão de "consertar"
   custo de provider, quando houver, aparece ANTES com o motivo

3. REPARO (uma autoridade por vez, com readback)
   cada passo só é dado como feito quando o remoto o devolve
   um passo que falha não impede os outros, e é relatado como falhou
```

### 3.1 O que cada bloqueio admite

| Invariante | Classe | Reparo |
| --- | --- | --- |
| `ARTICLE_DNA_CURRENT` (readback não confirmado) | **reexecutável** | reconfirmar a gravação e reler |
| `SERP_RESOLVED` sem entrada no marcador | **reexecutável** | gravar a conclusão faltante, com readback |
| `SERP_RESOLVED` com parecer indeciso | **decisão humana** | mostrar o parecer e a recomendação; a pessoa decide pelas opções que já existem (`accept_current_composition`, `change_principal`, `split`, `merge`, `change_composition`) |
| `SERP_EXECUTED` não executada | **custo de provider** | recoletar as 4 lentes, cache primeiro, custo declarado antes |
| `SERP_CURRENT` `stale`/`failed` | **custo de provider** | idem |
| `CANONICAL_SILO_BINDING` | **outra fase** | não repara aqui; aponta a aba Silos |
| `INTERNAL_LINK_GRAPH_APPROVED` | **outra fase** | não repara aqui; aponta a fase Links internos |
| `NO_CROSS_SILO` | **outra fase** | não repara aqui; é decisão de Silo |
| `PRINCIPAL_DEFINED`, `COMPOSITION_VALID`, `MAX_KEYWORDS_RESPECTED`, `SLUG_STATE_VALID`, `ARTICLE_PARENT_EXPLICIT` | **composição** | nunca automático: são o conteúdo da decisão, não o registro dela |

A terceira coluna é o ponto inteiro. Um botão que "conserta tudo" apagaria a
diferença entre *o registro se perdeu* e *a decisão nunca foi tomada* — e a
segunda não é defeito, é trabalho pendente.

### 3.2 Regras duras

1. **Cirúrgico.** Opera sobre **um artigo**. Sem lote, sem "reparar todos".
   O defeito de um artigo não autoriza escrever em nenhum outro.
2. **Diagnóstico antes de qualquer escrita.** A leitura é gratuita e não muda
   nada. Nenhum reparo acontece sem a pessoa ver o que está quebrado.
3. **Nenhuma autoridade nova.** Todo reparo passa pelas rotas e stores que já
   existem, com as permissões e os readbacks que elas já exigem.
4. **Decisão humana continua humana.** O reparo registra decisões; não as toma.
   Parecer indeciso vira pergunta com as opções do contrato, nunca um default.
5. **Readback obrigatório.** Gravar não é sucesso. Cada passo relê e só então
   se declara feito — a mesma regra que o resto do módulo já segue.
6. **Idempotente.** Rodar duas vezes não duplica nada: um passo cuja invariante
   já está satisfeita é pulado e relatado como "já estava".
7. **Custo explícito e opt-in.** Recoleta de SERP diz antes o que vai custar e
   por quê, e só roda com aceite. Cache primeiro, sempre.
8. **Trilha.** Cada reparo grava o que estava quebrado, o que foi escrito, por
   quem e quando. Um artigo reparado não pode parecer um artigo normal.
9. **Falha parcial é relatada como parcial.** Três reparos, um falhou: diz
   qual, e os outros dois continuam valendo.

### 3.3 Onde mora

No painel do artigo, uma seção **"Diagnóstico e reparo"** que só aparece quando
há bloqueio. Fechada por padrão. Não é um modo de administrador escondido: é
parte da leitura do artigo, porque o diagnóstico é informação legítima mesmo
quando a pessoa não vai reparar nada.

---

## 4. O que NÃO entra nesta proposta

* Reparo em lote ou automático em segundo plano.
* Qualquer escrita que contorne a autoridade canônica correspondente.
* Mudar o portão para aceitar menos: o reparo faz o artigo **cumprir** a
  invariante, nunca a dispensa.
* Alterar lifecycle, M4–M6, Radar, mídia ou Publicações.
* DDL, migration ou coluna nova. Tudo cabe nos artefatos e payloads atuais.
* Publicação externa, exclusão ou purga.

---

## 5. Consumidores, riscos e compatibilidade

**Consumidores.** O portão (`resolveRadarEligibility`) passa a ter um segundo
leitor além da recusa; a forma do retorno não muda, então nada que o consome
hoje é afetado. As rotas de escrita ganham um chamador novo, com o mesmo
contrato.

**Risco principal: virar carimbo.** Um botão que resolve pareceres facilmente
transforma o portão em formalidade — exatamente o que o comentário da rota de
resolução já alerta. **Mitigação:** parecer indeciso nunca tem reparo de um
clique; aparece como decisão, com as opções do contrato e um motivo obrigatório,
e a trilha registra que veio do reparo.

**Risco: mascarar defeito recorrente.** Se a mesma operação quebra sempre no
mesmo passo, reparar caso a caso esconde a causa. **Mitigação:** a trilha
permite contar reparos por tipo; um mesmo `code` reparado várias vezes na mesma
marca é sinal para investigar a operação de origem, não para reparar de novo.

**Risco: custo de provider inesperado.** **Mitigação:** regra 7 — cache
primeiro, custo declarado antes, opt-in por item.

**Compatibilidade.** Aditiva. Nenhum contrato muda, nenhum artefato ganha campo
obrigatório, nenhuma leitura existente passa a enxergar coisa diferente.

**Rollback.** Remover a seção da interface. Nada do que ela grava é exclusivo
dela — tudo é o que as autoridades canônicas já gravariam pelos caminhos
normais, então um artigo reparado continua válido sem a funcionalidade.

---

## 6. Testes

**Comportamental, sem React e sem banco:** a tradução de cada um dos doze
`code` do portão para a classe de reparo e para a ação oferecida; a
idempotência (invariante satisfeita → passo pulado); a falha parcial (um de
três falha → relatório parcial, dois valendo).

**Estrutural:** o diagnóstico não escreve; nenhum reparo chama banco direto,
só as autoridades; parecer indeciso não tem caminho de um clique; a seção só
aparece com bloqueio.

**Regressão:** o portão continua recusando o que recusava — o reparo não
afrouxa nenhuma das doze checagens.

**Mutantes:** no mínimo um por regra dura.

**Fixture do caso real:** o estado exato de 01/10 — DNA aprovado, parecer
inconclusivo sem resolução, marcador sem a entrada — precisa ser diagnosticado
corretamente e reparado pelos dois passos certos.

---

## 7. Autorização necessária

Por `AGENTS.md` §4, isto é **mudança estrutural**: toca workflow e cria uma
operação nova sobre artefatos canônicos. Precisa de autorização do dono antes
do código.

Escopo que a autorização cobriria: o diagnóstico, a seção na interface, e os
reparos das classes **reexecutável** e **decisão humana**. A classe **custo de
provider** pode ficar para uma segunda entrega, se o dono preferir validar o
mecanismo antes de ligar recoleta.

```text
SDD_STATUS = AUTORIZADA · 1ª ENTREGA IMPLEMENTADA
AUTHORIZATION = reexecutável + decisão humana (dono, 2026-10-01)
MIGRATION_REQUIRED = NO
DDL_REQUIRED = NO
NEW_WRITE_AUTHORITY = NO
AFFECTS_OTHER_ARTICLES = NO
GATE_WEAKENED = NO
```

### 7.1 O que a 1ª entrega contém

| Arquivo | Papel |
| --- | --- |
| `lib/arquiteto/article-repair.ts` | puro: classifica os doze bloqueios, monta a entrada de conclusão e acrescenta ao marcador |
| `modules/arquiteto/article-repair-panel.tsx` | o painel: diagnóstico em leitura, ação só onde a classe permite |
| `modules/arquiteto/arquiteto-workspace.tsx` | o diagnóstico por artigo e os dois reparos, pelas rotas que já existem |
| `tests/arquiteto-reparo-pontual-artigo.test.mts` | 15 testes sobre a classificação e as guardas |

Reparos ligados: **marcador de formação** (`POST /api/arquiteto/article-formation-marker`)
e **decisão sobre o parecer** (`POST /api/arquiteto/serp-resolution`). Ambos com
releitura, e nenhum com autoridade própria.

**Fora desta entrega, e declarado na própria interface:** `ARTICLE_DNA_CURRENT`
com readback não confirmado é classificado como registro perdido — mas não ganha
botão, porque regravar ArticleDNA passa pelo versionamento. O painel diz a classe
e diz onde se resolve hoje. Botão que não faz nada seria pior que nenhum.

---

## 8. Pendência correlata, fora deste escopo

A mesma investigação encontrou **dois pareceres de SERP para a mesma keyword**,
com `candidateRef` e `formationBaseHash` diferentes: um
`article-candidate:territory:…:24679c44…` (inconclusivo, `serpbase:465916d5…`)
e um `24679c44…` puro (divergente, `serpbase:81a5848c…`, reescrito em 01/10
22:59). Duas autoridades respondendo à mesma pergunta é defeito por si só: se o
portão passar a ler o outro, o artigo trava de novo sem explicação visível.

Não entra nesta SDD. Fica registrado para investigação própria.

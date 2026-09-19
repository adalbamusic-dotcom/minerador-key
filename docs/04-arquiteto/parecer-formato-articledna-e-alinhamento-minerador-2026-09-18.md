# Parecer — formato do ArticleDNA e alinhamento com o pacote aprovado do Minerador

**Data:** 2026-09-18 · **Owner:** Arquiteto · **Origem:** contrato de aprovação versionada implementado no Minerador ([SDD](../03-minerador/propostas/sdd-aprovacao-versionada-e-pacote-fechado-2026-09-18.md)) · **Status:** parecer técnico, não autoriza implementação.

## Pergunta

O Minerador agora entrega um **pacote aprovado**: o KeywordDNA congelado no ato da aprovação, que só muda com nova aprovação. O que precisa acontecer do lado do Arquiteto para que esse pacote seja honrado do começo ao fim — considerando que lá o trabalho **começa pelo Silo** e só depois desce para os artigos?

## 1. A ordem de trabalho e a ordem dos dados são opostas

Esta é a observação que organiza todo o resto.

**A ordem de trabalho é Silo-first.** O humano cria ou escolhe um Território, distribui as keywords nele, fecha o Silo e só então forma artigos. É a ordem certa: sem saber do que o conjunto trata, escolher a cabeceira de um artigo é chutar.

**A ordem da cópia de dados é a inversa.** O número da keyword não sobe direto para o Silo: ele desce para o artigo e depois volta agregado para o Silo.

```
keyword (pacote aprovado)
  └─> ArticleDNA.keywordReferences[].volume | resultCount | kgrScore | normalizedIntent
        └─> ArticleDNA.keywordStrategy.principalVolume | combinedVolume | principalKgrStatus
              └─> SiloDNA.hierarchySignals[].principalVolume | combinedVolume | kgrScore
```

Consequência prática: **o Silo é o último elo da cópia, não o primeiro.** Corrigir só o ArticleDNA deixa o SiloDNA com números velhos, e é o SiloDNA que sustenta a decisão de pilar × apoio (`suggestedRole`, `supportOrder`). Um parecer que tratasse apenas do artigo estaria incompleto.

## 2. O que cada camada guarda hoje

| camada | o que guarda da keyword | é cópia ou referência? |
| --- | --- | --- |
| **Território** (Silo em trabalho) | só `keywordId`; `keywordRefs` é projeção derivada da associação | **referência pura** |
| **SiloDNA** (consolidado) | `centralKeywordDnaRef` (ref) e `hierarchySignals[]` com volume, KGR e centralidade | **misto** |
| **ArticleDNA** | `keywordReferences[]` com `volume`, `resultCount`, `kgrScore`, `normalizedIntent`, `originalIntentLabel`, mais `keywordStrategy` agregado | **cópia** |

O Território é a boa notícia: ele **não copia nada**. A formação lê o DNA vivo através de `dnaSignalsByKeyword`, que já foi repontado para o pacote aprovado. Então **a etapa em que o Arquiteto realmente começa a trabalhar já está alinhada** — sem mudança nenhuma de contrato.

O problema começa quando o trabalho **congela**: SiloDNA e ArticleDNA são versões em `editorial_artifact_versions`, append-only por trigger. O que entra ali não muda mais.

## 3. Por que isso é um problema real, e não teórico

Enquanto o Arquiteto lia a linha viva do Minerador, a cópia no artefato era "o retrato do dia em que fechei". Estava desalinhada, mas de forma invisível: as duas leituras vinham da mesma fonte mutável.

Com o pacote aprovado, a fonte passou a ter **versão**. A partir de agora dá para responder "este artigo foi formado sobre qual versão da keyword?" — e é justamente por isso que a divergência fica visível. `ArticleKeywordReference` já carrega `keywordDnaVersionId` e `keywordDnaContentHash`: os campos existem, mas hoje ninguém compara.

Ou seja: a peça que falta **não é armazenamento novo**. É comparação e propagação sobre campos que já estão no contrato.

## 4. O que precisa ser feito para aprovar e ficar alinhado

### 4.1 O Silo precisa declarar sobre qual pacote foi fechado

`SiloDNA` tem `territoryRef`, `workingCopyRef` e `workingCopyLockVersion` — proveniência do **processo**. Não tem proveniência do **insumo**: nada diz quais versões de keyword sustentavam o Silo no momento da consolidação.

Proposta: `SiloDNA.keywordPackageRefs[]`, com `{ keywordId, approvedVersion, contentHash }` para toda keyword do Território. Aditivo no payload jsonb, sem coluna e sem migration — o mesmo padrão que `territoryRef` usou na Fase 2C.

Sem isso não existe pergunta respondível no Silo. Com isso, "este Silo está desatualizado" vira uma comparação de hash, não uma opinião.

### 4.2 O gate de fechamento do Silo precisa de um blocker novo

`SILO_CLOSURE_BLOCKERS` tem hoje cinco códigos, todos sobre o estado interno do Silo: formação pendente, reconsideração, canibalização, formação bloqueada, já consolidado. **Nenhum olha para o insumo.**

Proposta: `KEYWORD_PACKAGE_STALE` — bloqueia fechar um Silo cujo Território contém keyword em revisão ou com pacote mais novo que o lido. Fechar um Silo sobre keyword que o humano está mexendo produz um artefato que nasce velho.

Esse é o ponto de maior retorno do parecer inteiro: **é mais barato impedir o Silo de fechar desalinhado do que propagar depois por três camadas.**

### 4.3 O ArticleDNA precisa comparar o que já carrega

`keywordDnaVersionId` e `keywordDnaContentHash` estão no schema desde sempre. Falta:

1. no momento da formação, gravá-los a partir do **pacote aprovado** (hoje a formação lê o DNA vivo);
2. na leitura, comparar com o pacote atual e marcar o artigo como `insumo atualizado` quando divergirem.

Só isso já dá visibilidade sem escrever nada — e visibilidade é pré-requisito para propagar com segurança.

### 4.4 A propagação, e o que ela custa

Decisão do usuário: propagação **automática**, sem fluxo explícito, inclusive para artigo já formado. O fluxo explícito vale só para keyword nova.

O custo é estrutural e vem do formato: como o `ArticleKeywordReference` **copia** em vez de referenciar, propagar significa **criar versão nova do ArticleDNA** — e, na sequência, do SiloDNA que agrega aqueles números. Uma reaprovação em lote de 20 keywords pode gerar duas levas de versões.

Duas formas de pagar esse custo:

**(a) Propagar a cópia.** Mantém o formato, gera versões. Simples de implementar, caro em volume de artefatos, e cada versão é auditável.

**(b) Estreitar o formato.** `ArticleKeywordReference` deixa de copiar `volume`, `resultCount` e `kgrScore`, e passa a resolver pelo `keywordDnaVersionId`. O artigo guarda o que é **decisão editorial** — papel, contribuição estratégica, tópicos exigidos e excluídos — e para de guardar o que é **medição do Minerador**.

**Recomendo (b) para o que nascer daqui em frente, com (a) para o acervo.** O motivo não é economia de versões: é de responsabilidade. Volume e KGR não são decisão do Arquiteto; são medição do Minerador. Um artefato que copia a medição de outro módulo assume a obrigação de mantê-la atualizada — obrigação que ele não tem como cumprir sozinho, e que é exatamente a dívida que este parecer está descrevendo.

O que **deve** continuar copiado no ArticleDNA: `role`, `strategicContribution`, `coveredIntentions`, `requiredTopics`, `excludedTopics`, `purpose`, `overlapRisk`. Isso é trabalho do Arquiteto e não existe no Minerador.

### 4.5 Artigo publicado é o único recorte separado

Um ArticleDNA publicado descreve **o que está no ar**. Reescrever os números dele para acompanhar a keyword faz o registro deixar de descrever a publicação — não é ficar atualizado, é perder o retrato.

Proposta: o pacote atualiza, o artigo publicado recebe marcador visível de insumo atualizado, e a reescrita fica sendo decisão caso a caso. Este é o único ponto do parecer em que recomendo **não** propagar sozinho, e está sinalizado como decisão em aberto.

## 5. Ordem recomendada

1. **Proveniência de insumo no SiloDNA** (§4.1) — aditivo, sem migration, destrava as perguntas seguintes.
2. **Blocker `KEYWORD_PACKAGE_STALE`** (§4.2) — impede criar desalinhamento novo. Maior retorno, menor risco.
3. **Comparação no ArticleDNA** (§4.3) — visibilidade antes de propagação.
4. **Propagação automática** (§4.4a) — para o acervo que já existe.
5. **Estreitar o `ArticleKeywordReference`** (§4.4b) — mudança de formato, exige SDD próprio.

Os passos 1 a 3 não mudam nada que o usuário vê; preparam o terreno. O passo 4 é o que ele pediu. O passo 5 é o que evita a dívida voltar.

## 6. O que este parecer não recomenda

- **Migration.** Nada aqui precisa de coluna nova: `SiloDNA` e `ArticleDNA` são payload jsonb em `editorial_artifact_versions`, e o padrão aditivo com campo opcional já foi usado na Fase 2C.
- **Segundo juiz semântico no Arquiteto.** Keyword aprovada entra; dimensão indeterminada viaja como informação. Isso continua valendo — o que muda é a **frescura** do insumo, não o direito de entrar.
- **Bloquear formação por keyword em revisão.** Bloquear o *fechamento* do Silo basta. Impedir o trabalho em andamento seria ruído.

---

# Adendo — versionamento do ArticleDNA e o que acontece na segunda versão

**Data:** 2026-09-19 · Escrito depois de uma auditoria do parecer original. Os quatro pontos factuais dela se confirmam; dois são mais duros do que ela afirma, e um **derruba a recomendação do §4.4b deste parecer**.

## A. O que acontece hoje quando se aprova a segunda versão

Fluxo real, em `arquiteto-workspace.tsx` na conclusão da formação:

1. A formação monta o `payload` do ArticleDNA.
2. `articleEditorialDiff` compara o candidato com a **canônica aprovada**, por lista de permissão: 15 campos de decisão mais `keywordReferences.role`.
3. **Não substantivo** → o artigo é descartado da leva, nada é gravado: *"O ArticleDNA aprovado já representa esta formação."*
4. **Substantivo** → `createVersionEnvelope` com `versionNumber + 1` e `previousVersionId` da vigente → `persistArquitetoArtifact` com `action: "edit"` e `status: "approved"`.
5. Hash idêntico no servidor → `UNCHANGED` → descartado.
6. `createStatusEvent(versionId, "approved")`.

Três consequências que precisam estar declaradas:

- **Não existe rascunho de artigo.** A segunda versão **nasce aprovada**; aprovar É salvar. O Minerador agora tem `em_revisao` entre trabalhar e aprovar; o Arquiteto vai da formação direto para aprovado. Os dois módulos têm granularidade de versão diferente, e isso é o desalinhamento de fundo.
- **A versão anterior permanece.** Append-only: v1 continua existindo e encadeada por `previousVersionId`.
- **Há duas portas no-op em série** — o diff editorial, que compara decisões, e o `UNCHANGED` do writer, que compara hash. A primeira existe porque a segunda não bastava: `confirmedArticlePayload` carimba data a cada chamada, então o hash sempre muda. Foi assim que um artigo foi de v10 a v16 sem nenhuma diferença editorial.

## B. A colisão com a propagação, confirmada

`EDITORIAL_DECISION_FIELDS` não contém `volume`, `resultCount`, `kgrScore`, `normalizedIntent` nem `keywordStrategy`. Então reaprovar uma keyword mudando só o volume produz um candidato que o diff considera **não substantivo** — a propagação do §4.4a seria **recusada pela porta que este projeto construiu de propósito**.

As saídas são as que a auditoria aponta: ou o diff aprende a ignorar campos de medição — o que é admitir que eles não pertencem ao artigo — ou a medição sai do payload. A segunda resolve na origem.

## C. O que derruba o §4.4b: ninguém produz aqueles campos

O parecer original listou `strategicContribution`, `coveredIntentions`, `purpose` e `overlapRisk` como "decisão editorial do Arquiteto, deve continuar copiada". **Está errado.** Em `articleKeywordReference` (`lib/arquiteto/adapters.ts:151`):

| campo | quem produz hoje |
| --- | --- |
| `strategicContribution` | string de template, função de `role` |
| `purpose`, `purposeRationale`, `contribution` | idem, template por `role` |
| `coveredIntentions` | `[keyword.intent]` — cópia do Minerador |
| `overlapRisk` | literal `"unknown"`, sempre |
| `requiredTopics`, `excludedTopics` | `[]`, sempre — nada preenche |
| `classificationOrigin` | `"system"` para 100% da base desde que a IA saiu |
| `confidence` | `dna_confianca` — medição do Minerador |

Ou seja: a `ArticleKeywordReference` **quase não guarda decisão**. Guarda `role` — que o diff já compara — três templates derivados de `role`, duas cópias do Minerador, um literal e dois arrays vazios.

Isso torna o §4.4b mais simples e mais defensável do que eu argumentei: não é "tirar a medição e preservar a decisão", é **tirar a medição e a derivação, e descobrir que o que sobra é `role` mais dois campos que ninguém nunca preencheu**. Se `requiredTopics`/`excludedTopics` devem virar decisão real, isso é trabalho novo de produto, não preservação do que existe.

## D. O mecanismo de invalidação já existe e está apagado

`canonicalRevisionState` separa as duas perguntas certas: *existe proposta em andamento?* e *a aprovada foi estruturalmente invalidada, com motivo declarado?* Expõe `canonicalIsStale`, `staleReasons`, `usableDownstream` e uma `headline` pronta para a mesa. O comentário do módulo diz que `staleReasons` vem "de quem sabe medir invalidação".

**Ninguém alimenta.** O único consumidor, na linha de artigo do workspace, chama sem `staleReasons`. Logo `canonicalIsStale` é sempre falso e `usableDownstream` é sempre verdadeiro.

"Pacote aprovado mais novo que o lido" é exatamente uma `staleReason`. O passo mais barato do alinhamento inteiro é **acender um mecanismo que já está construído e testado**, não escrever um novo.

## E. `centralKeywordDnaRef` × `keywordPackageRefs[]`

A auditoria está certa em exigir a decisão. Resposta: os dois respondem perguntas diferentes e **o singular passa a ser derivado do array**.

- `centralKeywordDnaRef` responde *qual keyword nomeia este Silo* — identidade, par com `centralEntitySource`.
- `keywordPackageRefs[]` responde *quais pacotes sustentam este Silo* — frescor.

Para não existirem duas respostas: o singular é a entrada do array cujo `keywordId` é o da entidade central, e deixa de ser escrito por conta própria.

## F. Ordem revisada

A auditoria propõe começar pelo §4.3 porque não depende de nada. Concordo, e junto com ele o §D — são o mesmo passo.

1. **Comparar no ArticleDNA e alimentar `staleReasons`.** Os dois campos já estão gravados e o mecanismo já existe. Dá visibilidade sobre o acervo e dimensiona o custo da propagação antes de decidir pagá-la.
2. **`KEYWORD_PACKAGE_STALE`, primeira metade:** "keyword em revisão", que é leitura viva do Território e não depende de proveniência no Silo.
3. **`SiloDNA.keywordPackageRefs[]`**, que destrava a segunda metade: "pacote mais novo que o lido".
4. **Propagação** — e ela depende da decisão do §B, senão nasce recusada pelo diff.
5. **Estreitar a `ArticleKeywordReference`**, agora com o escopo do §C.

## G. O desalinhamento de granularidade

Fechando com o que motivou este adendo: o Minerador passou a ter três estados de versão — trabalhando, `em_revisao`, aprovado — e um registro de aprovação com hash. O Arquiteto tem dois — proposta e aprovada — e a passagem de um para o outro é o mesmo clique.

Não proponho igualar. Proponho declarar a tradução: **uma keyword `em_revisao` no Minerador é uma `staleReason` no Arquiteto**, não um bloqueio de trabalho. É o que mantém o Arquiteto produzindo sobre a última versão aprovada enquanto o Minerador mexe na próxima — que foi exatamente o contrato que o usuário pediu.

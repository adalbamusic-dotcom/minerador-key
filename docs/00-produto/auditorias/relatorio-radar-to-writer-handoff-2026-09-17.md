# Relatório — Radar → Redator · o Planejador sai do pipeline — 2026-09-17

Registro datado do gate `RADAR_TO_WRITER_HANDOFF_1`.

Este arquivo é fotografia, não contrato. O que vale como regra permanente é
[docs/05-radar/spec.md](../../05-radar/spec.md).

## A decisão

```text
ANTES   Minerador → Arquiteto → Radar → Planejador → Redator
AGORA   Minerador → Arquiteto → Radar → Redator
```

O Planejador deixou de ser etapa operacional obrigatória. O que ele fazia —
transformar evidência em especificação executável — passou a ser a fase de
planejamento dentro do Redator.

**O Radar não mudou de papel.** A mudança é de destino e de responsabilidade,
não de pesquisa. Nenhum collector migrou, nenhuma lógica de SERP, Blueprint,
qualificação ou formação foi reaberta.

## §10 · o que era do Planejador, item a item

| Responsabilidade | Classificação |
| --- | --- |
| transformar Blueprint em plano executável | `MOVE_TO_WRITER` |
| decidir estrutura final de H2/H3 | `MOVE_TO_WRITER` |
| organizar a sequência narrativa | `MOVE_TO_WRITER` |
| aplicar a evidência por seção | `MOVE_TO_WRITER` |
| consolidar links internos e externos | `MOVE_TO_WRITER` |
| consolidar o plano de mídia | `MOVE_TO_WRITER` |
| decidir metadados de SEO finais | `MOVE_TO_WRITER` |
| resolver o CTA | `MOVE_TO_WRITER` |
| preparar instruções de redação | `MOVE_TO_WRITER` |
| gerar `ContentPlan` quando útil | `MOVE_TO_WRITER` — interno, nunca etapa |
| pesquisa competitiva | `ALREADY_IN_RADAR` |
| coleta SERP | `ALREADY_IN_RADAR` |
| Blueprint | `ALREADY_IN_RADAR` |
| autoridade evidencial | `ALREADY_IN_RADAR` |
| necessidades de fonte | `ALREADY_IN_RADAR` |
| especialista | `ALREADY_IN_RADAR` |
| biblioteca de vídeos | `ALREADY_IN_RADAR` |
| shortlist da Amazon | `ALREADY_IN_RADAR` |
| a etapa manual intermediária obrigatória | `OBSOLETE` |

## §20 · por que não houve migration

Auditoria antes de qualquer alteração de schema:

```text
editorial_workflow_items.stage        CHECK já inclui 'writer'
editorial_workflow_items.state        texto livre (1..80) — 'sent_writer' cabe
editorial_decision_events.event_type  texto livre (1..120) — 'import_writer' cabe
editorial_stage_module('writer')      já mapeia para o módulo 'redator'
content_documents.content_plan_version_id   NULLABLE (a 0028 prevaleceu sobre a 0002)
content_documents (marca_id, article_id)    UNIQUE — a idempotência já existia
```

Nenhuma constraint, enum ou FK exigia o Planejador. O que exigia plano era a
assinatura de `ContentDocumentRepository.create`, que é código, não schema.

A nulabilidade foi conferida contra o banco real, em leitura, e está registrada
no [SDD da entrada direta](../../07-redator/propostas/sdd-entrada-direta-radar-redator-2026-09-17.md):
a migration `0002` declarava `NOT NULL`, a `0028` recriou a tabela sem ele, e é
a `0028` que vale.

`MIGRATIONS = NO`, sem exceção e sem dívida escondida.

## O que foi construído

| Arquivo | Papel |
| --- | --- |
| `lib/server/radar-writer-send.ts` | `sendRadarToWriter` — a autoridade única |
| `lib/redator/writer-handoff.ts` | `RADAR_WRITER_MAY_NOT` e `MAY_DECIDE` |
| `app/api/editorial/radar-writer-handoff/route.ts` | a porta HTTP |
| `lib/radar/writer-handoff-client.ts` | o cliente — **movido**, não copiado |
| `tests/radar-to-writer-handoff-1.test.mts` | A–R |

`lib/redator/radar-import.ts` já existia e **não tinha nenhum chamador de
produção** desde que foi escrito. Este gate o ligou: era domínio pronto
esperando uma porta.

## O que foi aposentado

`lib/server/radar-planner-send.ts` está marcado `@deprecated`, sem rota, sem
botão e sem transição. A rota `radar-planner-handoff` foi removida.

Ele não foi apagado: artigos entregues ao Planejador antes deste gate têm
`plannerBundle` na análise e `sent_planner` no workflow, e apagar o serviço
apagaria a definição do que aqueles registros significam.

## Uma correção encontrada no caminho

O caminho do Planejador conferia a aprovação do Radar **depois** de gravar o
recibo. O efeito era uma versão de análise gravada para um artigo que a regra
seguinte ia recusar: lixo versionado por uma tentativa impossível. No caminho
do Redator a conferência acontece antes de qualquer escrita — e é reconferida
depois, porque entre uma e outra houve uma escrita e duas idas ao banco.

## Mutantes

Duas rodadas, 17 mutantes.

A rodada 1 matou 8 de 11. Os três sobreviventes apontavam para o MESMO buraco:
o que acontece quando a keyword principal não resolve. A bancada sempre
resolvia, e por isso nenhum teste exercitava o caso — justamente o caso em que
cair para a secundária, para o slug ou para o título seria mais cômodo.

O terceiro sobrevivente expôs um defeito do próprio teste: o guarda do
ArticleDNA comparava o "antes" com o "depois", o que não pega uma mutação
IDEMPOTENTE — um `toUpperCase()` aplicado por um teste anterior já teria
envelhecido o "antes". Ele passou a comparar contra o valor literal.

A rodada 2 repetiu os três e acrescentou três novos sobre a mesma fronteira:
**0 sobreviventes de 6**.

## Rodapé

```text
RADAR_TO_WRITER_HANDOFF_1 = PASS
MIGRATIONS = NO
PROVIDER_CALLS = 0
AI_CALLS = 0
ARTICLE_DNA_MUTATED = NO
PORTABLE_EXPORT_CHANGED = NO
MANUAL_UI_VALIDATED = N/A — homologação é do USER
```

---

## Adendo — `RADAR_TO_WRITER_READINESS_FIX_1` — 2026-09-17

O primeiro uso real do botão devolveu:

> "Somente investigação aprovada entra no Redator. Aprove o Radar antes de
> enviar."

...para artigos com a investigação **finalizada**.

### A causa

`sendRadarToWriter` exigia `editorial_workflow_items.state === "approved"`.
Essa condição veio copiada do caminho do Planejador, e estava errada nos dois.

```text
o que a esteira registra     importação, aprovação do relatório LEGADO, envio
o que a esteira NÃO registra START · ANALYZE · FINALIZE
```

Uma linha de Radar nasce `research_pending` e continua `research_pending`
depois de uma investigação inteira finalizada. `approved` só era produzido pelo
fluxo antigo por abas, com o botão "Aprovar SERP" — que a tela atual não tem.

O servidor mandava a pessoa aprovar um Radar já finalizado, apontando para um
botão inexistente.

### A autoridade correta

A prontidão canônica do dossiê, que já era conferida logo abaixo da recusa:
perfil resolvido a partir da fotografia congelada, bundle V3 íntegro e vínculo
com o ArticleDNA corrente. Não existe segunda aprovação, e a esteira passou a
**seguir** o fato — ela se move depois de o documento ser confirmado, a partir
de qualquer estado.

### O mesmo defeito num segundo lugar

A barra de lote decidia a elegibilidade por `reportApproved`, a aprovação do
relatório do fluxo antigo. Um artigo finalizado hoje aparecia bloqueado nela
enquanto o botão individual o aceitava — duas respostas para a mesma pergunta.
Passou a perguntar pela finalização canônica, pelo campo aditivo
`researchFinalized`.

### Por que 17 mutantes não pegaram

A bancada do gate anterior criava a linha da esteira com `state: "approved"` —
um mundo que o fluxo operacional nunca produz. A fixtura otimista escondeu a
recusa de todos eles.

O padrão da bancada passou a ser `research_pending`, e o teste percorre os seis
estados reais. **Lição registrada: fixtura que descreve um estado que o produto
não produz não protege nada.**

### Uma duplicata encontrada pela própria bateria

Um mutante que DESLIGAVA a prontidão canônica no serviço passou na suíte
inteira. Não era falha de teste: a prontidão era conferida **duas vezes** no
mesmo caminho — uma no serviço e outra dentro de
`resolveRadarImportEligibility` —, e a segunda respondia pela primeira.

Duas portas para o mesmo veredito não é redundância defensiva: é uma mascarando
a outra, e nenhum teste consegue dizer qual das duas protege o artigo. A do
serviço saiu; a decisão é do domínio, e o serviço transporta o veredito com a
prontidão junto, para a tela mostrar o motivo real.

### O que NÃO foi afrouxado

Prontidão canônica, integridade do bundle V3 e revalidação do ArticleDNA entre
montar e entregar continuam recusando — com teste próprio para cada um,
inclusive o caso em que o dossiê RESOLVE e mesmo assim não está pronto.

```text
RADAR_TO_WRITER_READINESS_FIX_1 = PASS
REFINALIZE_REQUIRED = NO
SECOND_APPROVAL_REQUIRED = NO
PLANNER_READINESS_DEPENDENCY = NO
RECOLLECTION = NO
MIGRATIONS = 0 · PROVIDER_CALLS = 0 · AI_CALLS = 0 · ARTICLE_DNA_MUTATED = NO
```

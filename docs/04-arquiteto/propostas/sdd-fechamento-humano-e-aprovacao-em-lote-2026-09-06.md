# SDD — Fechamento humano do Article e aprovação em lote

**Data:** 2026-09-06 · **Owner:** Arquiteto · **Status:** proposta. Etapa 1 (consistência de leitura) implementada; etapa 2 (fechamento unificado + seletor) pendente.

## Problema

A tela do Arquiteto funde **a versão aprovada** com **a revisão corrente**, e por isso não oferece ato nenhum para fechar a segunda.

Dois defeitos concretos, ambos de leitura:

1. **O checklist prioriza `approved`.** Em `article-review-checklist.ts`, `input.approved ? "APPROVED"` curto-circuita a contagem de pendências. Como o botão *Aprovar ArticleDNA* depende de `readyForApproval === (status === "READY_FOR_APPROVAL")`, ele **desaparece exatamente quando há pendências sobre uma versão já aprovada**. A tela exibe "Revisão humana · Aprovado" e "2 decisões pendentes" ao mesmo tempo, sem saída.

2. **O papel tem duas fontes.** A reconstrução da planilha lê `assignment.role`/`reviewRole` (legado) enquanto a formação resolve por `articleFormationDecision.role` (decisão humana). Observado no acervo:

   ```
   mantecorp skin care   assignment.role = "principal"
                         decision.role   = "secundaria"
                         ArticleDNA v5   = "secundaria"
   ```

   O artefato está íntegro; a divergência é de apresentação. O próprio contrato de `article-formation-decision.ts` alerta contra criar "uma segunda fonte capaz de divergir da primeira, sem regra de desempate".

Existe ainda `changeSelectedArticleStatus`, sem chamador na interface. Reconectá-lo seria insuficiente: o caminho dele **adiciona eventos locais** e não passa pelo fechamento com persistência e readback da aprovação individual.

## Decisão

**Etapa 1 — consistência de leitura.** O checklist passa a descrever duas coisas separadas: a versão aprovada (fato histórico, ligado à sua versão) e a revisão corrente (estado presente, com suas pendências). Aprovação anterior deixa de esconder o ato da revisão atual. Papéis da cópia de trabalho vêm da decisão humana vigente; papéis de uma versão histórica vêm do artefato daquela versão.

**Etapa 2 — fechamento unificado.** Um único serviço de fechamento atende aprovação individual e em lote, reaproveitando persistência e readback existentes. O seletor de status opera sobre a seleção da planilha e nunca aprova por troca de rótulo.

## Escopo

- `OWNER = Arquiteto` · `SCOPE = article-scoped` · `TENANT = brandId` · `ENTITY = articleId`.
- **Consumidores:** planilha do Arquiteto (abas que listam artigos), painel de revisão, gate de handoff ao Radar.
- **Não consumidores:** Radar, Planejador, Redator. Nenhum contrato cross-module muda.
- **Fora deste trabalho:** migration, e a restauração dos três vínculos territoriais divergentes. Eles precisam ser identificados e ter impacto demonstrado antes de qualquer restauração, e **não entram escondidos numa correção visual**.

## Estados e transições

```
IN_FORMATION          formação não concluída
AWAITING_HUMAN_REVIEW pendências abertas na revisão corrente
READY_FOR_APPROVAL    pendências resolvidas, formação salva
APPROVED              versão aprovada e confirmada por readback
```

Transições oferecidas pelo seletor:

| Ação | Exige |
|---|---|
| Enviar para aprovação | formação concluída **e salva** |
| Aprovar | principal única, composição coerente, decisões obrigatórias resolvidas, sem conflito impeditivo, SERP vigente pelos gates canônicos |
| Reabrir revisão | versão aprovada com revisão corrente pendente |

"Bloqueado/com conflitos" **não é transição**: é resultado calculado das pendências. `Enviar ao Radar` permanece ação à parte — transferência não é status editorial.

## Regras não negociáveis

- **A aprovação anterior fica ligada à sua versão.** Mudança material abre revisão corrente e só gera sucessora ao consolidar conteúdo alterado. A versão aprovada nunca é reescrita.
- **Revalidação no servidor**, contra o contexto autorizado da marca. Botão habilitado e evento enviado pelo cliente não bastam.
- **`serpAssessmentRef` preenchida não é prova de validade.** É preciso conferir a evidência, a base (`formationBaseHash`) e a decisão correspondente. Diferenciar: não coletada · desatualizada para esta composição · vigente.
- **Readback encerra.** A interface só se atualiza depois de versão, hash e status confirmados. Resposta incerta manda reler, nunca repetir a operação às cegas.
- **O lote é por artigo.** Cada um retorna `aprovado` · `já aprovado` · `bloqueado` · `falhou` · `confirmação pendente`, com motivo e identidade da versão. Uma falha não apaga o que já foi confirmado, e os bloqueados permanecem selecionados para resolução.
- **APIs atuais preservadas.** Qualquer extensão de resposta é aditiva e tipada.

## Aceite

Não há homologação por teste automatizado apenas. Para liberar o teste do Radar, os artigos escolhidos precisam reaparecer **aprovados após recarga e em outra sessão**, com a mesma versão e hash, além de passar pelos requisitos arquiteturais do handoff.

Casos obrigatórios: versão aprovada com pendências novas; papel legado divergente da decisão; lote misto com contagens exatas; bloqueio por duas principais, SERP desatualizada ou decisão pendente; reaprovação sem duplicar versão ou evento; alteração concorrente tratada com bloqueio e recarga; erro de gravação nunca apresentado como aprovação; isolamento por marca; preservação de todas as keywords.

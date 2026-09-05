# SDD — R6 Processador: artefatos independentes, freshness e revisão humana

Status: **DRAFT — READY_FOR_SDD_APPROVAL**  
Módulo proprietário: **Minerador**  
Data: **2026-08-24**  
Tipo: **auditoria estrutural + decisão de desenho**

## 1. Gate desta etapa

Este documento atende ao pedido de auditoria e SDD do R6. Não houve
implementação de runtime.

| Item | Estado desta etapa |
| --- | --- |
| Código de aplicação | não alterado por este SDD |
| Chamadas Google Ads | 0 |
| Chamadas DataForSEO | 0 |
| Chamadas IA/DeepSeek/OpenRouter | 0 |
| Banco remoto | não acessado para escrita |
| Schema/migration | não alterados |
| Outros módulos | não alterados |
| Aprovação para implementação | pendente |

O working tree já continha alterações de tarefas anteriores. Elas foram
preservadas e não são atribuídas a este SDD.

## 2. Escopo e não escopo

### Escopo

Definir o contrato canônico para que cada processo do Processador mantenha
seu próprio artefato, tentativa, versão, hash de entrada, readback e estado
de freshness, sem invalidar ou apagar silenciosamente artefatos de outros
processos.

Os processos considerados são:

1. Conferir site;
2. Lógica;
3. Volume;
4. Resultados;
5. KGR;
6. IA;
7. Revisão humana.

### Não escopo

Esta etapa não altera:

- prompts, adapter ou modelo da IA;
- Google Ads, DataForSEO ou qualquer provider;
- fórmula ou thresholds do KGR;
- handlers, APIs, ciclo de vida ou exclusão;
- tabela, KeywordDNA ou layout;
- schema, migration, RPC, RLS ou banco remoto;
- Arquiteto, Radar ou qualquer outro módulo;
- status editorial ou publicação.

## 3. Problema observado

O Processador já possui uma projeção de estado, mas o contrato não é
uniforme entre os processos. Lógica tem metadados e hash próprios; Volume e
Resultados dependem de measurements e timestamps; IA usa um hash composto;
Revisão depende do hash da IA; tentativas de execução ficam em estado React
local. Isso permite boa parte da leitura atual, mas não constitui ainda um
registro persistido e independente para cada processo.

A consequência é uma combinação de quatro comportamentos que precisam ser
separados no contrato:

1. um novo processamento pode deixar a IA ou a revisão **stale** porque suas
   entradas mudaram — isso é uma dependência legítima;
2. uma tentativa de provider pode falhar e manter o artefato anterior — isso
   é preservação correta, não sucesso;
3. a barra de processos usa o resultado do read-model e do estado local de
   tentativa — isso pode ocultar a diferença entre “artefato anterior
   preservado” e “artefato atual validado”;
4. o KGR é derivado de Volume + Resultado, mas hoje também é bloqueado por
   tentativa local de Volume/Resultados em execução ou falha, mesmo quando os
   fatos anteriores continuam preservados.

O contrato alvo não deve transformar uma keyword medida anteriormente em
“não processada”, nem pintar como atual um artefato cuja entrada deixou de
ser a versão corrente.

## 4. Evidência auditada no código

| Área | Evidência verificada | Conclusão |
| --- | --- | --- |
| Projeção de processos | `lib/minerador/process-state.ts`, `resolveMineradorProcessState` | Existe read-model único para `site`, `logic`, `volume`, `results`, `kgr`, `ai` e `review`. |
| Estado de tentativa | `MineradorProcessAttempt` e `processAttemptsByKeywordId` em `modules/minerador/minerador-workspace.tsx` | Tentativa é explicitamente local e não persistida. |
| Lógica | `lib/minerador/logical-processor.ts` | Existem `logicProcessorVersion`, `logicProcessedAt`, `logicInputHash` e `logical_output_contract` no JSONB existente. |
| Métricas | `lib/minerador/processor-revalidation.ts` | Discovery é classificado como importado; medição oficial depende de records válidos de Volume/Resultados. |
| Google Ads | `app/api/minerador/marcas/[brandId]/google-ads/metricas-keywords/route.ts` | A medição persistida tem `operation_request_id`, provider, versão, targeting, measuredAt, request ID e histórico; falha não promove dado. |
| DataForSEO | `app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts` e `lib/minerador/dataforseo-allintitle.ts` | Allintitle e Overview são persistidos com medição, erro por suboperação, request/operation e histórico; falha preserva o anterior. |
| IA | `lib/minerador/semantic-review.ts` e `app/api/process-intent-niche/route.ts` | `ai_review` registra schema/status, `inputHash`, geração, provider/model e request operacional; há readback do `ai_review`. |
| Revisão humana | `lib/minerador/human-review.ts` | `human_review` registra status, decisões, overrides, `aiInputHash`, pendências e conclusão; a conclusão ainda é bloqueada por pendências. |
| Read-model canônico | `lib/minerador/canonical-keyword-snapshot.ts` | Tabela, perfil e decisão já têm uma fronteira de leitura comum; a função é read-only e não chama provider. |
| Mutação lógica | `processLogicalKeywordDna` em `modules/minerador/minerador-workspace.tsx` | Atualiza `intent` e `analise_semantica`, preservando chaves de outros domínios, e faz readback por keyword. |
| Reprocessamentos | handlers de Lógica, Volume, Resultados, IA e Revisão no workspace | Cada ação possui tentativa/feedback próprio, mas os attempts não sobrevivem a reload. |
| Persistência de IA | `route.ts` de `process-intent-niche` | O request ID de execução é usado na resposta/telemetria; não é copiado para `ai_review` como campo de correlação de execução. |

## 5. Contrato atual por processo

### 5.1 Lógica

Artefato atual no registro `minerador_keywords`:

- `intent` como projeção canônica compatível;
- `analise_semantica.logicProcessorVersion`;
- `analise_semantica.logicProcessedAt`;
- `analise_semantica.logicInputHash`;
- `analise_semantica.logical_output_contract`;
- campos semânticos derivados e marcadores de origem.

O `logicInputHash` considera a identidade da keyword, texto normalizado,
localização e nicho usado pelo processador. A prontidão é resolvida por
`resolveLogicalProcessReadiness`. A leitura lógica é, portanto, o processo
com melhor suporte atual a versão/hash/freshness.

### 5.2 Volume

O artefato atual é distribuído entre as colunas/projeções de
`minerador_keywords`, o JSONB `analise_semantica.volume_measurement` e o
histórico de medições Google Ads. O contrato atual preserva, quando
disponível:

- volume, histórico mensal, CPC, concorrência, índice e lances;
- moeda, targeting, provider, versão e instante da medição;
- `operation_request_id`, request ID do Google Ads e resultado da medição;
- snapshot importado/Discovery como evidência anterior, sem promover sua
  presença a “Volume validado”.

Há timestamp e proveniência de medição, mas não há um `inputHash`/`artifactVersion`
comum para o processo Volume equivalente ao contrato da Lógica. O
`processor-revalidation` deriva `validated` a partir de records específicos.

### 5.3 Resultados

O artefato atual é distribuído entre `results_allintitle`,
`analise_semantica.allintitle_measurement`, histórico e dados complementares
do Keyword Overview. O contrato preserva:

- Resultado como projeção humana da medição allintitle;
- query, provider, versão, targeting, measuredAt e operation/request IDs;
- KD/Overview e erros de suboperação quando disponíveis;
- snapshot anterior da Discovery e histórico;
- resultado anterior quando uma tentativa falha ou não retorna medição
  confirmada.

Assim como Volume, o domínio tem evidência e freshness específica, mas não
um envelope uniforme de artefato com hash de entrada persistido.

### 5.4 KGR

KGR não é uma chamada independente. É uma derivação de Volume + Resultado.
`processor-revalidation` só considera o KGR atual quando as duas medições
oficiais estão válidas; `calculateKgrFromMetrics` é a fonte da fórmula.

O score anterior/histórico é preservado. O score atual não pode ser inferido
da mera presença de um valor importado. O KGR não deve ganhar uma tentativa de
provider própria: seu estado deve ser derivado dos artefatos correntes de
Volume e Resultado e de sua aplicabilidade humana, quando aplicável.

### 5.5 IA

`analise_semantica.ai_review` registra, entre outros:

- schema e status da revisão;
- veredito, concordâncias, divergências e enriquecimentos;
- referências de evidência;
- `inputHash` calculado sobre lógica e evidências quantitativas atuais;
- geração, provider, model e request operacional da revisão.

`resolveMineradorProcessState` considera IA atual somente quando a revisão
está concluída e seu `inputHash` coincide com o hash calculado a partir do
KeywordDNA atual. Quando existe uma revisão anterior, mas o hash não coincide,
o artefato deve permanecer preservado e ser apresentado como stale.

### 5.6 Revisão humana

`analise_semantica.human_review` registra schema R6, status, decisão,
decisões de campos, decisões de enriquecimento, overrides, tratamento do KGR,
`aiInputHash`, pendências, ator e instante de conclusão.

O read-model considera a revisão atual somente quando:

1. a IA está corrente;
2. a revisão humana está concluída;
3. `human_review.aiInputHash` coincide com o `ai_review.inputHash` atual.

Isso preserva a revisão anterior, mas ainda não existe um hash de entrada
independente para o próprio artefato humano. Além disso, `canCompleteHumanReview`
atualmente retorna bloqueio quando há divergências, enriquecimentos ou campos
estratégicos pendentes, o que não atende ao contrato R6 solicitado nesta SDD.

### 5.7 Conferir site

O domínio usa `analise_semantica.site_origin`, com situação e timestamps da
conferência. O `process-state` consegue distinguir uma conferência corrente
de uma origem anterior, mas não há um envelope comum com versão/hash de
entrada equivalente ao da Lógica.

### 5.8 Tentativa e readback

`processAttemptsByKeywordId` é estado React. Ele evita falso verde durante a
execução corrente e permite marcar falha na barra, mas se perde no reload.
Readbacks canônicos são feitos depois das mutações principais no workspace e
na rota de IA. Não existe hoje um ledger único persistido de tentativas de
cada processo no KeywordDNA.

## 6. Acoplamentos atuais que precisam ser tratados no próximo bloco

### 6.1 Invalidação legítima por dependência

O hash da IA inclui a leitura lógica e os fatos quantitativos. Portanto:

- reprocessar Lógica pode tornar IA e Revisão stale;
- reprocessar Volume ou Resultados pode tornar IA e Revisão stale;
- isso não é apagamento nem falha do processo reexecutado;
- o artefato anterior deve continuar disponível para inspeção e histórico.

Essa invalidação derivada é intencional, mas precisa aparecer como freshness
do consumidor dependente, não como limpeza do artefato.

### 6.2 Acoplamento indevido do KGR à tentativa local

Hoje `resolveMineradorProcessState` calcula `kgrInputsBlocked` a partir de
tentativas locais de Volume/Resultados com estado `running` ou `failed`.
Consequentemente, um erro de provider pode impedir o verde do KGR mesmo que
Volume e Resultado anteriores continuem preservados e válidos como última
versão conhecida.

O contrato proposto deve distinguir:

- KGR corrente calculável com os inputs correntes válidos;
- tentativa de atualização de um input que falhou;
- KGR anterior preservado, porém não corrente em relação a uma atualização
  confirmada.

Uma falha não deve apagar o KGR anterior nem inventar um KGR novo.

### 6.3 Gate da conclusão humana

O handler `handleHumanReviewAction` chama `canCompleteHumanReview` e retorna
antes de persistir quando há pendências. Isso conflita com o contrato desejado:
o humano deve poder concluir a revisão aberta usando defaults explícitos, sem
aceitar silenciosamente a IA.

O comportamento correto é aplicar defaults somente no comando explícito de
conclusão, registrar cada decisão derivada e fazer readback. O botão não deve
ser desabilitado apenas porque existem pendências decisórias.

### 6.4 Estado editorial

A projeção de stale de um artefato não deve alterar automaticamente `status`,
publicação, vínculo, silo ou envio ao Arquiteto. Freshness é estado de
confiabilidade do DNA, não uma decisão editorial.

## 7. Contrato proposto

### 7.1 Separar artefato, tentativa e freshness

Cada processo deve ser tratado conceitualmente como três objetos distintos:

```text
artifact       = última versão persistida e seu conteúdo/proveniência
attempt        = última tentativa de execução, sucesso ou falha
freshness      = relação entre artifact.inputHash e as entradas atuais
```

Uma tentativa falha não substitui o artefato anterior. Uma tentativa começa
de novo sem apagar outros artefatos. Um artefato stale continua recuperável,
mas não pode receber o indicador de etapa validada/corrente.

### 7.2 Envelope lógico por processo

Como proposta de implementação, o read-model deve conseguir resolver para
cada processo, sem quebrar os campos legados:

```text
process = {
  artifact: {
    status: missing | current_valid | stale | invalid,
    version: string | null,
    inputHash: string | null,
    processedAt: string | null,
    readbackAt: string | null
  },
  attempt: {
    status: not_run | running | success | failed,
    operationId: string | null,
    startedAt: string | null,
    finishedAt: string | null,
    errorCode: string | null
  },
  freshness: {
    current: boolean,
    reason: string
  }
}
```

Este bloco é um contrato de desenho, não uma autorização para criar campos,
migration ou tabela nesta etapa. A implementação deverá primeiro confirmar se
é possível derivá-lo/adicioná-lo no JSONB existente sem duplicar a verdade
canônica.

### 7.3 Hashes de entrada por processo

| Processo | Entrada mínima do hash | Artefato corrente |
| --- | --- | --- |
| Site | keyword, contexto do site e configuração da conferência | vínculo/situação e instante da conferência |
| Lógica | keyword, localização, nicho efetivo e versão do motor | output lógico + contrato R1 |
| Volume | keyword oficial, targeting efetivo e configuração/versão da medição Google Ads | measurement Google Ads |
| Resultados | keyword oficial, targeting/query e configuração/versão DataForSEO | allintitle + Overview disponíveis |
| KGR | hashes/versões correntes de Volume e Resultado + fórmula | score derivado |
| IA | identidade mínima + hash da Lógica + fatos correntes Ads/DataForSEO/KGR | revisão IA R5 |
| Revisão | hash da IA corrente + estado/decisões humanas | consolidação humana R6 |

`updated_at` da linha não é um hash de entrada e não deve ser usado como
invalidator global. Atualizar uma projeção ou metadado não relacionado não
deve deixar todas as etapas vermelhas.

## 8. Matriz formal de reprocessamento

| Ação | Artefato novo | Artefatos preservados | Artefatos que podem ficar stale | Não pode acontecer |
| --- | --- | --- | --- | --- |
| Reprocessar Lógica | Lógica | Volume, Resultados, KGR, IA anterior e Revisão anterior | IA e Revisão, se o hash de suas entradas mudar | apagar métricas, zerar KGR, marcar providers como não executados, desabilitar Volume/Resultados |
| Reprocessar Volume | Volume; KGR recalculado se inputs atuais completos | Lógica, Resultados, IA anterior e Revisão anterior | IA e Revisão quando dependem do fato de Volume alterado | apagar Resultado, apagar Lógica, forçar DataForSEO, aceitar IA automaticamente |
| Reprocessar Resultados | Resultados; KGR recalculado se inputs atuais completos | Lógica, Volume, IA anterior e Revisão anterior | IA e Revisão quando dependem do fato de Resultado alterado | apagar Volume, apagar Lógica, forçar Google Ads, aceitar IA automaticamente |
| Reprocessar IA | IA nova | Lógica, Volume, Resultados e KGR | Revisão anterior, que deve ficar revisável/stale em relação à IA nova | reexecutar provider de métricas, alterar fatos medidos, apagar revisão anterior |
| Reabrir/Reprocessar Revisão | revisão humana nova ou edição da existente | Lógica, Volume, Resultados, KGR e IA | nenhuma etapa anterior; somente o estado da revisão muda | chamar provider, alterar números, criar versão sem mudança material |

Reprocessar não significa executar automaticamente os demais processos.
Cada botão continua independente. Freshness de uma etapa dependente é uma
projeção explícita, não uma ordem para disparar provider.

## 9. Regras de estado e barra de processos

1. `✓` significa **artefato atual válido, readback confirmado e nenhum erro
   corrente não resolvido**.
2. `—` significa etapa ainda não validada nesta versão; pode haver snapshot
   importado ou artefato anterior preservado.
3. Artefato stale continua visível no Perfil/KeywordDNA e na proveniência.
4. Stale não pode ficar verde.
5. Stale não desabilita o botão que pode atualizá-lo.
6. Falha de tentativa preserva o último artefato válido e expõe a falha no
   feedback operacional; não transforma o valor anterior em zero ou null.
7. A faixa de processos deve resolver cada processo individualmente, sem
   depender de um status global da keyword.
8. O KGR mostra a condição dos inputs e não uma tentativa de provider própria.
9. Status editorial, publicação, vínculo e envio ao Arquiteto permanecem
   independentes da cor de freshness.

## 10. Conclusão da revisão humana

### 10.1 Pré-condições reais

O comando só deve ser executável para uma revisão aberta que tenha uma IA
concluída e uma decisão KGR tratada quando o KGR for aplicável ao caso. Essas
pré-condições são diferentes de exigir que todas as divergências já tenham
sido clicadas.

### 10.2 Defaults aplicados somente por comando explícito

Ao clicar em `Concluir revisão`, o sistema deve materializar e persistir as
decisões pendentes assim:

| Pendência | Default explícito |
| --- | --- |
| Divergência entre Lógica e IA | `keep_logic` |
| Enriquecimento sugerido pela IA | `ignore` |
| Campo estratégico desconhecido | `confirm_unknown` |

Esses defaults não significam “aceitar a IA”. Eles são decisões humanas
conservadoras registradas pelo comando de conclusão. O sistema não pode:

- aceitar sugestão de IA silenciosamente;
- inventar valor ausente;
- transformar fato medido em edição semântica;
- criar uma nova versão quando o conteúdo/decisão não mudou.

### 10.3 Reabertura

Reabrir a revisão não chama provider. O draft é local até salvar/concluir.
Concluir novamente sem mudança material preserva a versão existente e não
fabrica um novo `completedAt` como se houvesse nova decisão.

## 11. Persistência e compatibilidade

### Estado atual

O JSONB `analise_semantica` já transporta contratos específicos de Lógica,
medição, IA, revisão, site e proveniência. Colunas de projeção e tabelas de
histórico preservam os fatos quantitativos. Portanto não há evidência de que
uma migration seja necessária para **este SDD**.

### Lacuna

Não existe, no contrato atual, um envelope comum persistido para todas as
etapas nem um registro durável de tentativas de site/lógica/volume/resultados/
IA/revisão. A tentativa local pode desaparecer após reload. A implementação
deve decidir entre:

1. um adaptador read-model que derive o envelope usando os contratos atuais;
2. uma extensão aditiva de JSONB para metadados que não possam ser derivados
   com segurança;
3. somente em último caso, mudança estrutural com SDD/adendo específico.

Registros antigos devem ser tratados de forma conservadora:

- presença de snapshot Discovery = contexto anterior, não validação atual;
- ausência de hash = freshness desconhecida/stale, nunca green por fallback;
- artefato IA/revisão sem hash comparável = preservado, mas não confirmado
  como corrente;
- fatos quantitativos anteriores continuam audíveis e não são apagados.

### Decisão de schema desta etapa

`SCHEMA_CHANGE_REQUIRED = NO FOR THIS SDD`  
`MIGRATION_REQUIRED = NO FOR THIS SDD`

Isso significa apenas que nenhum schema/migration foi autorizado ou criado.
Não significa que a implementação futura esteja liberada para adicionar
campos sem uma decisão de compatibilidade. A próxima etapa deve provar se o
JSONB existente suporta o envelope aditivo; caso contrário, deve abrir um
adendo estrutural antes do código.

## 12. Consumidores preservados

O contrato futuro deve permanecer compatível com:

- tabela do Processador: somente read-model informativo para Lógica, Volume,
  Resultado, KGR, CPC, KD, Intenção, Nicho e Funil;
- Perfil/KeywordDNA: cards individuais e proveniência;
- faixa de processos e barra de progresso;
- Revisão Humana R6/R6.1;
- card Decisão;
- notificações operacionais e diagnóstico de falhas;
- handoff do Minerador para o Arquiteto;
- histórico/proveniência Discovery → Processador.

Nenhum consumidor deve limpar um artefato porque outro processo foi iniciado.
O read-model deve ser a única camada que decide “current”, “stale” ou
“missing” para a apresentação compartilhada.

## 13. Invariantes de segurança e tenant

- Toda leitura/mutação continua escopada por `brandId = public.marcas.id`.
- `operationRequestId` e request IDs continuam pertencendo à proveniência da
  execução, não à autorização do tenant.
- Um readback deve validar a mesma keyword e a mesma marca da operação.
- Falha de readback não pode ser apresentada como sucesso.
- Nenhum fallback local substitui a confirmação canônica persistida.
- Nenhum teste desta SDD usa provider pago ou grava banco remoto.

## 14. Riscos

| Risco | Mitigação proposta |
| --- | --- |
| Inferir freshness de campos legados sem hash | Estado `unknown/stale` conservador; nunca green por presença. |
| Misturar tentativa falha com artefato anterior | Envelope separado e read-model que preserve `last valid artifact`. |
| Reprocessar Lógica apagando decisão humana | Merge aditivo, versões/overrides preservados e teste de matriz. |
| IA atualizada sem revisão stale | Hash da Revisão ligado ao hash da IA corrente. |
| Defaults de conclusão confundidos com aceite da IA | Registrar `keep_logic`, `ignore` e `confirm_unknown` explicitamente. |
| Falso KGR após falha parcial | KGR derivado somente dos inputs correntes válidos; falha não vira zero. |
| `updated_at` causar cascata global | Hashes por processo; `updated_at` nunca é invalidator único. |
| Tentativa local desaparecer em reload | Planejar readback/registro durável somente após aprovação deste SDD. |
| Mudança estrutural acidental | Nenhum código, migration, provider ou API nesta etapa. |

## 15. Rollback

Como este documento não altera código nem dados, o rollback desta etapa é
administrativo: marcar o SDD como rejeitado/suspenso e não executar a etapa
de implementação. Nenhuma restauração de banco é necessária.

Se a implementação futura for aprovada, o rollback deverá ser aditivo e
reversível: desativar o read-model/envelope novo, manter os campos legados e
os históricos, e retornar a apresentação ao adaptador anterior. Nunca apagar
artefatos para desfazer a nova projeção.

## 16. Plano de testes para a implementação futura

Os testes abaixo são critérios de aceite do próximo bloco; não foram
executados como chamadas reais nesta SDD.

### Unitários/contrato

1. Reprocessar Lógica preserva Volume, Resultado, KGR, IA e Revisão anteriores.
2. Reprocessar Volume preserva Resultado e marca apenas dependentes cuja
   entrada mudou como stale.
3. Reprocessar Resultado preserva Volume e aplica a mesma regra.
4. Reprocessar IA não chama Google Ads/DataForSEO e deixa Revisão anterior
   stale/revisável.
5. Reabrir/concluir Revisão não chama provider nem altera fatos.
6. Falha de provider mantém o último artefato válido e registra a tentativa.
7. Snapshot Discovery nunca acende `Volume ✓` ou `Resultados ✓` sozinho.
8. Artefato stale nunca recebe estado verde.
9. Artefato stale não desabilita o botão de reprocessamento.
10. `updated_at` isolado não invalida todos os processos.
11. KGR usa somente Volume + Resultado atuais válidos.
12. Conclusão aplica os defaults somente no comando explícito.
13. Repetir conclusão sem mudança material não cria versão falsa.
14. Readback de cada operação valida marca, keyword, artifact e hash esperado.

### Smoke funcional autenticado após aprovação

Usar fixture controlada de uma keyword com Lógica, Volume, Resultado, KGR,
IA e Revisão. Executar, em ordens separadas:

```text
Lógica → Volume → Resultados → IA → Revisar → reabrir → concluir
```

Conferir a barra, Perfil/KeywordDNA, card Decisão, notificações, histórico e
readback após reload. Repetir cada processo isoladamente e simular falha
antes/depois do provider. Esse smoke deve registrar separadamente o que foi
validado localmente, no navegador autenticado e no banco remoto.

### Guardas desta etapa

- `PROVIDER_CALLS = 0`;
- nenhum teste pago;
- nenhum `fetch` para provider;
- nenhum Supabase write remoto;
- nenhum migration apply.

## 17. Entrega do módulo

```text
SDD_CREATED = YES
CURRENT_PROCESS_COUPLING = PARTIAL AND IDENTIFIED
ROOT_CAUSE_OF_CASCADE_INVALIDATION = READ-MODEL DEPENDENCIES PLUS LOCAL ATTEMPT GATES; NOT DATA DELETION

INDEPENDENT_PROCESS_ARTIFACTS_SUPPORTED_CURRENTLY = PARTIAL
PER_PROCESS_HASH_SUPPORTED_CURRENTLY = PARTIAL

LOGIC_RERUN_EFFECT_MATRIX = DEFINED
VOLUME_RERUN_EFFECT_MATRIX = DEFINED
RESULTS_RERUN_EFFECT_MATRIX = DEFINED
AI_RERUN_EFFECT_MATRIX = DEFINED
REVIEW_RERUN_EFFECT_MATRIX = DEFINED

STALE_ARTIFACT_PRESERVED = YES
STALE_BUTTON_DISABLED = NO
STALE_ARTIFACT_GREEN = NO

REVIEW_CONCLUDE_ALWAYS_ACTIONABLE = YES (PROPOSED CONTRACT; CURRENT CODE STILL BLOCKS PENDING ITEMS)
REVIEW_PENDING_DEFAULT_POLICY =
  divergence -> keep_logic
  enrichment -> ignore
  strategic_unknown -> confirm_unknown

FAKE_REVIEW_VERSION_ON_NO_CHANGE = NO

SCHEMA_CHANGE_REQUIRED = NO FOR THIS SDD; FUTURE JSONB-ADDITIVE ADAPTER REQUIRES APPROVAL
MIGRATION_REQUIRED = NO FOR THIS SDD

RISKS = DOCUMENTED
ROLLBACK = DOCUMENT-ONLY / NO DATA CHANGE
TEST_PLAN = DOCUMENTED; PROVIDER_CALLS 0

READY_FOR_SDD_APPROVAL = YES
```

## 18. Decisão solicitada

A aprovação necessária é somente para o desenho e para a abertura de uma
segunda etapa de implementação. Após a aprovação, a próxima tarefa deverá
voltar ao código, mapear o adaptador JSONB mínimo, definir os hashes faltantes
e alterar o gate da conclusão humana com testes de regressão. Nenhuma dessas
alterações está autorizada por este documento isoladamente.

# Adendo R1 — standing da SERP congelado, trava da SERP e ledger do Radar — 2026-09-23

- **Módulo proprietário:** Radar.
- **Base:** [SDD do Radar nas quatro lentes](./sdd-radar-quatro-lentes-cache-2026-09-23.md), etapas R1 e R1b.
- **Autorização:** falas do usuário de 2026-09-23 ("pode continuar em todas, Arquiteto, radar, e redator"), repassadas pelo coordenador para implementar R1.
- **Estado:** R1 e R1b **implementados no código e cobertos por teste**. Nada foi aplicado no banco. A capability do ledger (§4) continua **PROPOSTA**.

## 1. Decisões aplicadas (recomendação da SDD)

| Decisão | Aplicado | Onde |
| --- | --- | --- |
| D1 · `valid` | não rejeitada; `needs_review` é válida | `lib/radar/frozen-serp-standing.ts` |
| D2 · `sufficient` | SUFFICIENT, PARTIAL_BUT_USABLE e CONFLICTING_SEARCH_INTENT | idem |
| D3 · bundles antigos | padrão legado mantido, sem reescrever; nenhum aviso de tela nesta etapa | `lib/radar/evidence-bundle-runtime.ts` |

`current` fica verdadeiro por construção, como a SDD define. `valid` falha com motivo nomeado em `basis.invalidReasons`: `SNAPSHOT_NOT_BOUND`, `SNAPSHOT_NOT_FOUND`, `SNAPSHOT_NOT_REAL`, `SNAPSHOT_HASH_MISMATCH`, `ARTICLE_DNA_MISMATCH` ou `SNAPSHOT_REJECTED`. A revisão que vale é a última do snapshot, pela mesma regra da tela (`deriveRadarSerpReviewState`).

## 2. Desvios em relação ao texto da SDD

1. **O cálculo acontece no servidor, na escrita do FINALIZE, e não dentro de `freezeRadarEvidenceBundle`.**
   - O navegador não tem o estado gravado da SERP (revisões, snapshot remoto) e não deve declarar o próprio standing.
   - A tela que chama o congelamento (`modules/radar/radar-page.tsx`) está fora do escopo deste workflow.
   - A rota `/api/editorial/radar-analysis` identifica a transição (corrente aberta, sucessora congelada), lê `editorial_serp_snapshots` e `editorial_serp_reviews` uma vez, avalia, grava a chave e recalcula o `bundleHash` e o `contentHash` do envelope da versão nova.
   - Um standing enviado pelo navegador é descartado.
   - Um bundle cujo hash não confere é recusado com 409 `RADAR_FROZEN_BUNDLE_MUTATED`: recalcular o hash sobre conteúdo adulterado lavaria a adulteração.
   - Sem a leitura (banco indisponível), a escrita é recusada com 503 e nada é gravado.
   - **O standing é avaliado sobre o vínculo GRAVADO** (`serpSnapshotId` e `serpSnapshotHash` da versão corrente), não sobre o do pedido. Na transição a trava está aberta, então a mesma escrita poderia trocar o snapshot vinculado. Um congelamento que troque o id ou o hash é recusado com 409 `RADAR_FREEZE_SERP_LINK_CHANGED`, antes de ler a SERP gravada. O fluxo normal (`createRadarAnalysisSuccessor`) preserva o vínculo. Sem versão gravada, vale o vínculo do pedido.
2. **O dossiê lê a cópia no builder** (`buildRadarEvidenceBundleFromAnalysis`), por onde passam o envio ao Planejador, o envio ao Redator e o export. Só no perfil GOOGLE. Os cinco campos são copiados sem recalcular a frase. A `basis` fica no bundle congelado e não entra no dossiê.
3. **A trava passou a proteger a própria fotografia.** Com corrente e sucessora congeladas, uma `finalizedBundle` diferente (sem o standing, com outro standing, com outro hash) é recusada com `RADAR_GOOGLE_RESEARCH_FINALIZED` e `frozenBundleRewritten: true`. A comparação é por conteúdo, com chaves ordenadas. Sem isso, uma escrita posterior trocaria o standing sem reabrir. `finalizedBundle` continua fora de `RADAR_GOOGLE_COMPETITIVE_FIELDS`.
4. **O modelo observado não foi tocado.** `observed.authorityEvidence.serpStanding` continua com a regra viva anterior (comparáveis ≥ mínimo). Ver §5.

## 3. R1b — a rota da SERP consulta a trava

- `POST /api/editorial/serp` lê a análise corrente logo depois do ramo `review` e recusa `collect` e `collect_auxiliary` com 409 (`code: RADAR_GOOGLE_RESEARCH_FINALIZED`, `state: FINALIZED_LOCKED`).
- A recusa vem antes da autoridade de fonte, do envelope, da credencial, do provider e do registro de uso. Quando R2 trouxer o cache, a trava continua antes dele, e o teste estrutural já exige isso.
- **A leitura ficou menor.** A leitura da análise é a mesma que `resolveRadarResearchSource` já fazia; ela passou a acontecer uma vez e mais cedo, e a autoridade de fonte a reaproveita. Ela agora reidrata só a versão corrente (`readRadarCurrentAnalysisForSerp`, `lib/server/radar-serp-write-lock.ts`), a única que a trava e o plano de fonte leem. Antes, `findByArticle` reidratava todas: 8,22 MB por leitura no item mais pesado, dos quais 5,72 MB de corridas antigas descartadas (medição de 2026-09-23 registrada no repositório). Agora são até 2,5 MB.
- **A trava é relida na gravação.** Entre a coleta paga e o insert do snapshot, `radarGoogleSerpWriteLockAtSave` relê a parte leve da linha (0,9 MB, sem corridas; `finalizedBundle` não sai dela). Um FINALIZE gravado durante a coleta, por outra aba ou dispositivo, faz a rota responder 409 com `collected: true, persisted: false`: o gasto está no uso, e o snapshot não é gravado. A janela restante entre essa releitura e o insert é de milissegundos. Fechá-la exigiria guarda condicional no banco, que é mudança de esquema.
- `review` e o `GET` continuam livres. Reabrir destrava.

## 4. Ledger: por que o Radar não aparece em `integration_usage_events`

**Verificado no código e medido** (SQL agregado de leitura, 2026-09-23):

- O catálogo tem só `dataforseo.allintitle` (production, unidade `request`). O CHECK de `operation_kind` já aceita `serp_compatibility` (migration `20260824185700`), mas **nenhuma linha de catálogo foi inserida** para ela.
- Toda chamada DataForSEO do Radar resolve `dataforseo.serp_compatibility`: SERP canônica, auxiliar, apoio Amazon, YouTube e Amazon Merchant. `findCapability` devolve nulo e `capabilityProjection(null)` também.
- `recordIntegrationUsageForResource` sai em `if (!input.resource.capability) return null;` (`lib/server/integrations-runtime.ts`, ~linha 1034). O comentário do próprio código diz que isso é intencional.
- Eventos por módulo: arquiteto 307, minerador 924, radar 0.
- O Arquiteto aparece porque paga a SERP dele por `resolveDataForSeoCanonicalConfig`, ou seja, sob a capability `dataforseo.allintitle`. O rótulo está errado, e isso é do Arquiteto.
- **Quota, agora verificado:** as operações com resource provider (`allintitle`, `serp_compatibility`) seguem `resolveHomologationResourceForActor`, que devolve quota `UNLIMITED` sem consultar política. Isso vale para todo DataForSEO, não só para o Radar. A capability, portanto, só resolve o ledger.

**A correção não é localizada em código:** é uma linha de catálogo, na fundação de integrações congelada (D6). Proposta de SQL, **não aplicada**, para o usuário executar com gate próprio:

```sql
BEGIN;
INSERT INTO public.integration_capabilities (capability_key, operation_kind, environment, unit_name, status)
VALUES ('dataforseo.serp_compatibility', 'serp_compatibility', 'production', 'request', 'active')
ON CONFLICT (capability_key) DO NOTHING;
COMMIT;
```

- **Efeito esperado:** as próximas chamadas pagas do Radar gravam evento com `module = 'radar'`, sem mudar a quota.
- **Rollback, só enquanto nenhum evento a referencia (FK `ON DELETE RESTRICT`):**
  ```sql
  DELETE FROM public.integration_capabilities c
   WHERE c.capability_key = 'dataforseo.serp_compatibility'
     AND NOT EXISTS (SELECT 1 FROM public.integration_usage_events u WHERE u.capability_id = c.id);
  ```
- **Validação:** uma coleta autorizada e `SELECT module, count(*) FROM integration_usage_events GROUP BY module`.

## 5. Riscos e pendências

1. **Mensagem do FINALIZE.** `radar-page.tsx` mostra o `bundleHash` calculado no navegador. O hash gravado, com o standing, é outro. O readback substitui a versão local pela gravada, então só a frase fica defasada. Correção: a tela ler o hash do readback (dono: `modules/radar`).
2. **Duas leituras de standing no mesmo dossiê novo.** O topo (`serpStanding`) é o congelado. `observed.authorityEvidence.serpStanding` segue a regra viva de comparáveis. Elas podem divergir: por exemplo, PARTIAL_BUT_USABLE com poucas comparáveis. Alinhar exige decidir qual regra de suficiência vale no modelo observado.
3. **Apoio Amazon.** `collectRadarGoogleSupport` só grava snapshot quando não existe nenhum real. Com a investigação Google congelada, isso só aconteceria se o snapshot congelado não estivesse no remoto. O caminho não consulta a trava, e o dossiê não muda, porque o standing e o bundle são cópia. Fica para R4.
4. **Aviso de "standing não avaliado" nos bundles antigos** (D3): não foi feito nesta etapa. É só de tela.
5. **O FINALIZE lê todos os snapshots do artigo, com o payload inteiro,** para avaliar um só (`SerpSnapshotRepository.list`). Hoje são 10 snapshots remotos no total, ~10,8 KB cada, uma vez por congelamento. Com o lensSet do R2 (19,6 a 21 KB por versão) e cada "Atualizar SERP" o custo cresce. `findRemoteSnapshot` não resolve: ele também lê todos os payloads do artigo e filtra no processo. A correção é uma leitura filtrada por id em `lib/server/editorial-repositories.ts`, fora do escopo deste workflow.
6. **`serpSnapshotHash` fora de `RADAR_GOOGLE_COMPETITIVE_FIELDS`.** Depois do congelamento uma escrita pode trocar só o hash sem a trava recusar. O dossiê não muda, porque o standing é cópia. Incluir o campo mudaria a trava de todas as escritas congeladas e ficou sem decisão.

## 6. Testes

`tests/radar-serp-standing-congelado.test.mts` (20). `test:radar` foi de 2313/2313 para 2333/2333. 27 mutantes, aplicados em memória por um hook de carga (nenhum arquivo do repositório foi mutado), todos mortos. Cobre:

- a regra (D1, D2, cada motivo de invalidez, revisões com `+00:00`);
- o carimbo (hash, integridade, standing declarado descartado, adulteração recusada);
- **o valor dourado:** hash do bundle antigo `ada4b4b2` e do dossiê `bundle-hash:e32e330f`, medidos com o código anterior e iguais depois pelos dois caminhos;
- o dossiê novo lendo só a cópia, e o perfil YOUTUBE preservado;
- as travas (reescrita, reabrir, congelar, coleta);
- o servidor (só a transição lê, 503 e 409);
- as rotas contra o PostgREST simulado, com os módulos pagos em stub que conta chamadas, incluindo 409 e 503 do FINALIZE pela rota;
- a ordem na rota da SERP.

**Correções da revisão (7 testes a mais, 27 no arquivo; `test:radar` 2340/2340):** congelamento com vínculo trocado (servidor e rota, 409 sem ler nem gravar); revisão casada pelo id da linha e pelo da pesquisa; perfil AMAZON preservado; a leitura da trava reidrata só `in.(v3)` com três versões, aberta e congelada; a releitura na gravação usa só a parte leve e enxerga um FINALIZE feito no meio; e a rota relê a trava entre a coleta e o insert. 11 mutantes em memória: 9 mortos. `A3` (avaliar pelo vínculo do pedido) é equivalente, porque um vínculo diferente já é recusado antes. `A10` (ignorar a releitura na rota) só é morto pelo teste estrutural, que lê o arquivo do disco e não o módulo mutado em memória.

```text
SERP_STANDING_COMPUTED_AT = FINALIZE (servidor) · DOSSIE_LE_COPIA = SIM · LEGADO_BYTE_A_BYTE = SIM
FROZEN_BUNDLE_REWRITE = RECUSADO · SERP_COLLECT_AFTER_FINALIZE = RECUSADO (antes de cache/credencial/provider)
LEDGER_RADAR = descartado por falta de catálogo · CORRECAO = SQL proposto, NÃO aplicado (D6)
MIGRATIONS = 0 · ESCRITA_REMOTA = 0 · SQL_REMOTO = 2 leituras agregadas (catálogo + eventos por módulo; unidade + CHECK) · CHAMADAS_PAGAS = 0
```

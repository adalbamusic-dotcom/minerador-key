# Pós-M3 — a homologação não chegou ao servidor, e o desenho da purga

**Data:** 2026-09-18
**Não executado:** purge, DELETE de mídia, cron, rota de purga, DDL, deploy,
commit, push. Nenhum asset foi apagado — **não havia asset algum para apagar.**

---

## 1. O readback da homologação não tem sujeito

A primeira tarefa desta rodada era ler as linhas usadas na homologação. Elas não
existem.

```text
writer_media_assets                   0 linhas
storage.objects em 'writer-media'     0 objetos
objetos em QUALQUER bucket nas 24h    0
writer_deliverables                   0
content_document_versions             0
content_documents                     1   (o seu artigo)
```

Não é que a homologação tenha falhado parcialmente e deixado rastro. **Nada
chegou ao servidor**: nem briefing, nem arquivo, nem substituição. Os sete
pontos pedidos ficam todos sem resposta, porque não há linha para responder por
eles.

O documento foi atualizado às 01:03 — você esteve no Redator há pouco. O que não
houve foi criação de mídia.

## 2. Por que não poderia ter chegado — e a culpa é do que eu entreguei

O formulário de briefing e o campo de upload vivem **apenas** em
`modules/redator/writer-derived-environment.tsx`. E esse componente só renderiza
nos ambientes **Roteiro** e **Carrossel**:

```tsx
{writingFormat === "article" ? <>…artigo…</> : <WriterDerivedEnvironment …/>}
```

Contagem direta nos dois arquivos:

| Ambiente | Painel de âncora | Formulário de prompt | Campo de upload |
| --- | --- | --- | --- |
| **Artigo** | sim | **não** | **não** |
| Roteiro / Carrossel | **não** | sim | sim |

As duas metades do fluxo estão em ambientes diferentes, e nenhuma delas é
completa:

- no **Artigo** — onde moram `article_cover` e `article_block` — o meu painel diz
  *"Registre o prompt e anexe a imagem gerada"* apontando para controles que
  **não existem ali**;
- em **Roteiro/Carrossel** o formulário existe, mas não conhece âncora, e o
  painel de substituição não é renderizado.

Ou seja: **o fluxo de mídia é inalcançável ponta a ponta**, e era antes mesmo da
M3. Escrevi na rodada pré-M3 que estava "preparando o fluxo real de associação e
substituição" — preparei a associação e a substituição, e deixei a criação e o
upload fora do ambiente onde as âncoras novas vivem. O painel instrui uma ação
que a tela não oferece, o que é pior do que não instruir nada: manda procurar um
botão que não está lá.

Não corrigi isto nesta rodada porque a tarefa era purga, e porque as decisões de
composição do Redator têm sido suas a cada corte. A correção é pequena e está
proposta na §7.

**Nenhum asset da homologação foi apagado — não havia nenhum.** A instrução foi
respeitada por vacuidade, e é honesto dizer assim.

---

## 3. Auditoria das funções de purga já aplicadas

A M3 criou CLAIM e CONFIRM. Nenhuma rota as chama, `pg_cron` não está instalado,
e portanto nada apaga nada. Lidas do schema efetivo:

### 3.1 CLAIM

```sql
SELECT a.id, a.storage_path, a.purge_after
  FROM public.writer_media_assets a
 WHERE a.marca_id = p_brand_id
   AND a.purge_after IS NOT NULL
   AND a.purge_after <= now()
 ORDER BY a.purge_after
 LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
```

| Regra | Veredito |
| --- | --- |
| `PURGE_BY_AGE_ONLY = NO` | **PASS** — filtra por `purge_after`, que só nasce de substituição confirmada |
| `PURGE_REQUIRES_PURGE_AFTER_EXPIRED` | **PASS** — `purge_after <= now()` |
| `CURRENT_ASSET_CAN_BE_PURGED = NO` | **PASS** — corrente tem `superseded_at` nulo, logo `purge_after` nulo pelo CHECK |
| `PURGE_REQUIRES_SUPERSEDED` | **PASS por implicação, não por declaração** — ver abaixo |

`superseded_at IS NOT NULL` é garantido pelo `retention_check`, não pelo WHERE
da CLAIM. Hoje é equivalente; se algum dia o CHECK for relaxado, a CLAIM passa a
varrer mais do que deveria **sem nada acusar**. A rota compensa isso revalidando
cada linha em código (§4.2), e a §7 propõe declarar a condição também no SQL.

### 3.2 CONFIRM

Relê sob `FOR UPDATE`, e por isso a decisão que vale é a dela:

- linha ausente → `already_purged` (idempotente)
- `purge_after` nulo ou futuro → `not_eligible`
- payload de entregável ainda apontando para o ativo → `referenced`
- caso contrário → `DELETE` e `purged`

A rede contra vínculo órfão cobre `scenes[].storyboard.assetId` e
`slides[].visual.assetId`. Confirmei que o **artigo não tem referência por
assetId**: `ContentBlockSchema` não carrega o campo e `metadata.plannedImages` é
lista de strings. Para os contratos de hoje a rede está completa.

### 3.3 Um caso que a CONFIRM não trata

`replaced_by_asset_id` é `ON DELETE RESTRICT`. Numa cadeia A → B → C, apagar B
enquanto A existir é **23503**, que a CONFIRM não captura e devolveria como erro
cru.

A ordenação cronológica da CLAIM resolve o caso comum, porque A tem janela mais
antiga. Não resolve quando A é pulado — janela ainda aberta, ou `referenced`, ou
falha de Storage. A rota trata isso antes de chamar a CONFIRM (§4.3), e o
comportamento está coberto pelo teste 08.

---

## 4. O desenho da rota

### 4.1 Forma

```text
POST /api/redator/media-purge
  { brandId, mode: "preview" | "execute", limit?: 1..500 }
```

**`preview` é o padrão.** Sem `mode: "execute"` explícito nada é removido: a
rota chama a CLAIM, aplica as regras e devolve o que *seria* purgado. Quem quer
apagar precisa dizer que quer.

Autorização: `assertEditorialPermission(profile, brandId, "redator", "manage")`.
**`manage`, não `edit`** — quem escreve um artigo não deve poder apagar
histórico de mídia em definitivo. É a única das nove ações do contrato que
descreve administração, e hoje nenhuma rota a usa.

### 4.2 A ordem, e por que ela é essa

```text
CLAIM (marca, limite)
→ planPurgeQueue: revalida CADA linha em código
→ para cada elegível:
     storage.remove([path])
     → classifyStorageRemoval
       · removed        → segue
       · already_absent → segue   (objeto já não estava lá)
       · failed         → PARA nesta linha, a linha NÃO é apagada
     → CONFIRM (apaga a linha)
→ desfecho POR ATIVO
```

`DATABASE_DELETE_AFTER_STORAGE_CONFIRMATION = YES` é o eixo. Se a linha saísse
primeiro, uma falha no meio deixaria **objeto órfão no bucket** — sem dono, sem
rastro, sem ninguém para reclamá-lo. Na ordem correta a falha deixa linha sem
arquivo: recuperável, e a próxima execução resolve. Entre perder o rastro e
repetir trabalho, repete-se o trabalho.

A revalidação em código não duplica a CONFIRM por desconfiança: ela dá
diagnóstico **antes** de tocar no Storage. A CONFIRM continua sendo a autoridade,
sob lock.

### 4.3 O que a rota decide antes de chamar o banco

`planPurgeQueue` ordena por `purge_after` crescente e **adia** — não recusa — o
ativo que ainda é referenciado por alguma linha que vai sobrar. É o que impede o
23503 da §3.3 de aparecer como erro cru.

### 4.4 Desfecho por ativo, nunca um booleano

```text
purged · already_purged · not_eligible · referenced
skipped(refusal) · blocked_by_predecessor · storage_failed(reason)
```

Um lote com uma falha de rede numa linha não é "o lote falhou": são N−1 purgados
e 1 `storage_failed` nomeado. Resumo agregado vem junto, mas **depois** da lista.

### 4.5 Idempotência

Reexecutar é seguro por três razões independentes: `already_absent` no Storage
conta como sucesso; `already_purged` na CONFIRM para linha inexistente; e
`not_eligible` para janela não vencida. Nenhuma das três é erro.

### 4.6 A rota proposta

Não criei o arquivo. O código abaixo é proposta — enquanto ele não existir em
`app/api/`, **o repositório não tem caminho algum que remova arquivo ou linha**,
e é isso que o teste 14 trava.

```ts
// app/api/redator/media-purge/route.ts  — PROPOSTA, NÃO CRIADA
const BodySchema = z.object({
  brandId: z.string().uuid(),
  mode: z.enum(["preview", "execute"]).default("preview"),
  limit: z.number().int().min(1).max(500).default(50),
}).strict();

export async function POST(request: NextRequest) {
  const profile = await requireCanonicalSessionProfile();
  const body = BodySchema.parse(await request.json());
  await assertEditorialPermission(profile, body.brandId, "redator", "manage");

  const client = getOperationalClient();
  const { data: reivindicados, error } = await client
    .rpc("lifecycle_claim_writer_media_purge", { p_brand_id: body.brandId, p_limit: body.limit });
  if (error) return NextResponse.json({ code: "claim_failed" }, { status: 502 });

  const todas = await lerLinhasDaMarca(body.brandId);          // para resolver referências
  const decisoes = planPurgeQueue({ candidates: reivindicados, allRows: todas, now: new Date() });

  if (body.mode === "preview") return NextResponse.json({ mode: "preview", decisoes });

  const outcomes: PurgeOutcome[] = [];
  for (const d of decisoes) {
    if (!d.eligible) { outcomes.push({ assetId: d.assetId, result: "skipped", refusal: d.refusal }); continue; }

    let storage: StorageRemovalOutcome = "removed";
    if (d.storagePath) {
      const r = await client.storage.from("writer-media").remove([d.storagePath]);
      storage = classifyStorageRemoval({ error: r.error });
    }
    if (!canDeleteRowAfterStorage(storage)) {
      outcomes.push({ assetId: d.assetId, result: "storage_failed", reason: "storage_remove_failed" });
      continue;                                    // a linha FICA. O arquivo ainda está lá.
    }

    const { data: recibo } = await client.rpc("lifecycle_confirm_writer_media_purge",
      { p_brand_id: body.brandId, p_asset_id: d.assetId });
    outcomes.push(mapearRecibo(recibo, storage));
  }

  return NextResponse.json({ mode: "execute", outcomes, resumo: summarizePurge(outcomes) });
}
```

---

## 5. O que foi implementado nesta rodada

`lib/redator/media-purge-plan.ts` — **as regras, sem nenhuma capacidade de
apagar.** Não importa banco, não importa Storage, não tem `server-only`:

```text
planAssetPurge          as quatro condições de elegibilidade
planPurgeQueue          ordem cronológica + adiamento por vínculo
referencedByRemaining   quem ainda aponta para esta linha
classifyStorageRemoval  removed · already_absent · failed
canDeleteRowAfterStorage
summarizePurge          desfecho por ativo, agregado depois
```

`tests/redator-media-purge-plan.test.mts` — **14/14**, dentro de `test:redator`.

| Regra pedida | Teste |
| --- | --- |
| `PURGE_BY_AGE_ONLY = NO` | 01 |
| `CURRENT_ASSET_CAN_BE_PURGED = NO` | 02, 09 |
| `PURGE_REQUIRES_PURGE_AFTER_EXPIRED` | 03 |
| `PURGE_REQUIRES_SUPERSEDED` | 01, 02, 04 |
| objeto ausente conclui a limpeza | 10 |
| `STORAGE_DELETE_MUST_BE_IDEMPOTENT` | 10, 11 |
| `DATABASE_DELETE_AFTER_STORAGE_CONFIRMATION` | 11 |
| ordem e vínculo predecessor/sucessor | 06, 07, 08 |
| desfecho por ativo | 12 |
| nada no repositório apaga | 13, 14 |

O teste 13 lê o próprio módulo e prova a **ausência** de `server-only`,
`getOperationalClient`, `.storage.`, `.rpc(`, `.delete(` e `fetch(`. O 14 prova
que `app/api/redator/media-purge` não existe e que a M3 não criou cron nem
trigger. A garantia de que a purga não está ativa não é promessa de relatório: é
ausência verificada.

---

## 6. Rollback

`DELETE` é irreversível — não existe desfazer depois. O rollback deste desenho é
tudo o que vem **antes** dele:

| Camada | O que protege |
| --- | --- |
| `preview` como padrão | nada some sem alguém pedir `mode: "execute"` |
| janela de 48h | o arquivo fica recuperável dois dias após ser substituído |
| Storage antes do banco | falha deixa linha sem arquivo, nunca arquivo sem dono |
| `failed` não apaga linha | erro de rede não vira perda de rastro |
| `manage` | quem escreve não apaga |
| `limit` ≤ 500 | um erro de operação atinge um lote, não o acervo |
| rota inexistente | hoje, o caminho não existe |

**Para desativar depois de ativar:** apagar o arquivo de rota. As funções SQL
podem ficar — sem chamador elas são inertes, como são hoje.

**O que NÃO é rollback:** restaurar da janela de 48h depois do purge. Passado o
prazo, o arquivo se foi do bucket e a linha do banco. É por isso que a janela
existe, e é por isso que ela não é configurável para baixo.

---

## 7. Duas correções propostas, nenhuma executada

**7.1 · O fluxo de mídia precisa ser alcançável.** O painel de âncora do Artigo
precisa do formulário de briefing e do campo de upload que hoje só existem no
ambiente derivado — no mesmo bloco contextual, sem seção global e sem barra
nova. E o painel precisa aparecer também em Roteiro e Carrossel, para
`script_scene` e `carousel_slide`. Sem isso nada do que a M3 habilitou é
utilizável, e a homologação não tem como acontecer.

**7.2 · A CLAIM deveria declarar `superseded_at IS NOT NULL`.** Hoje é implicado
pelo CHECK; declarar no WHERE torna a regra visível no ponto de uso e sobrevive a
uma futura mudança do CHECK. É uma linha, e exige nova migration — não feita
aqui.

---

```text
HOMOLOGATION_ROWS_FOUND = 0
HOMOLOGATION_READBACK = NOT_APPLICABLE — nenhuma linha chegou ao servidor
MEDIA_FLOW_REACHABLE_END_TO_END = NO — briefing e upload ausentes no ambiente Artigo
ASSETS_DELETED = 0
PURGE_BY_AGE_ONLY = NO
PURGE_REQUIRES_SUPERSEDED = YES
PURGE_REQUIRES_PURGE_AFTER_EXPIRED = YES
CURRENT_ASSET_CAN_BE_PURGED = NO
STORAGE_DELETE_MUST_BE_IDEMPOTENT = YES
DATABASE_DELETE_AFTER_STORAGE_CONFIRMATION = YES
PURGE_ROUTE_CREATED = NO
PURGE_IMPLEMENTED = NO
CRON = NO
DELETE_MEDIA = NO
REGRESSIONS = NONE
```

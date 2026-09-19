# Corte 5 — o lifecycle de purga, em dry-run

**Data:** 2026-09-19
**Não executado:** DELETE real, cron, migration, DDL, deploy, commit, push.
**Nenhum dado real foi apagado.** Os nove ativos da homologação estão intactos.

---

## 1. Autoridade

A purga é server-side e só isso. `lib/server/writer-purge-service.ts` tem
`server-only`, e o teste 15 varre `components/` e `modules/` inteiros provando
que **nenhum componente React o importa**.

Nenhum DELETE sai do serviço. Quem apaga são as RPCs que já existiam:

```text
mídia    lifecycle_confirm_writer_media_purge   (M3)
versões  lifecycle_purge_editorial_history      (M2)
```

Ambas `SECURITY DEFINER`, com `GRANT EXECUTE` apenas para `service_role`, e
ambas revalidam a elegibilidade sob lock. **Não foi criado segundo mecanismo**:
o teste 12 conta as chamadas e exige exatamente uma de cada.

Uma ressalva honesta: a M2 só tem função de *apagar*; ela não tem contrapartida
de leitura. O dry-run de versões precisou de um SELECT com o mesmo predicado.
Isso é a leitura que faltava, não uma segunda autoridade — a de apagar continua
sendo a RPC, e nada no dry-run escreve.

---

## 2. Elegibilidade

`created_at` **não aparece em condição alguma** dos dois módulos de regra. Idade
sozinha nunca autoriza apagar: o que autoriza é ter sido substituído.

### 2.1 A base, comum aos dois tipos

```text
superseded_at IS NOT NULL
+ sucessor declarado e válido
+ purge_after <= now()
+ não é o corrente
```

### 2.2 As guardas extras da mídia

| Guarda | Recusa nomeada |
| --- | --- |
| `replaced_by_asset_id` resolve numa linha existente | `successor_missing` |
| sucessor na mesma marca, documento e âncora | `successor_scope_mismatch` |
| sucessor ainda é o **atual** daquela âncora | `successor_not_current` |
| predecessor não voltou a ser atual | `not_superseded` (a restauração limpa a marca) |
| ninguém mais aponta para esta linha | `referenced_by_remaining` |

O raciocínio: a janela de 48h existe para a imagem anterior poder voltar.
Apagá-la só faz sentido enquanto a que a substituiu continuar de pé. Se o
sucessor sumiu, foi substituído por sua vez ou perdeu a âncora, o predecessor
deixa de ser "histórico de uma troca" e vira a última cópia de alguma coisa —
e nesse estado ele fica.

### 2.3 Versões

`is_current` é conferido **por nome**, mesmo com a FK RESTRICT do banco já
impedindo o DELETE. O erro de FK chegaria como 23503 cru, tarde e sem dizer qual
regra foi violada.

**Autosave não entra** porque autosave nunca chega a ser linha de versão: salvar
rascunho grava estado corrente, e só finalizar cria versão. Não é filtro — é
consequência do desenho, registrada em `invariantes.md` §70 e conferida no
teste 16.

---

## 3. O dry-run

`planWriterPurge` lê, decide e devolve. **Não escreve.** O teste 11 fatia a
função e prova a ausência de `.update(`, `.insert(`, `.upsert(`, `.delete(`,
`.remove(` e `.rpc(` — inclusive nas funções de leitura que ela usa.

Devolve, por item: tipo, id, marca, documento, âncora, `superseded_at`,
`purge_after`, sucessor e — para mídia — `storage_path`. Mais a contagem de
**recusas por motivo**, que é o que permite entender por que a lista está vazia.

---

## 4. A execução, escrita e não disparada

```text
dry-run seleciona
→ remove o objeto do Storage
→ "não existe" conta como já removido, e a limpeza da linha continua
→ RECONFERE a elegibilidade contra o estado atual
→ CONFIRM da M3 apaga a linha, revalidando sob lock
→ desfecho por ativo
```

A reconferência no meio existe porque entre a seleção e a execução cabe uma
substituição, uma restauração ou outra passada. **Se qualquer guarda deixou de
valer, o item é pulado** — nunca forçado. Teste 13 confere a ordem dos três
marcos no código.

Falha de Storage que **não** seja ausência preserva a linha. Apagá-la deixaria o
objeto no bucket sem dono e sem rastro — irrecuperável. Na ordem correta, a
falha deixa linha sem arquivo: recuperável, e a próxima passada resolve.

---

## 5. Segurança da rota

`POST /api/internal/writer-purge`

| Decisão | Por quê |
| --- | --- |
| token operacional em header, **não** sessão de usuário | autorizar por sessão daria a qualquer login um caminho até o DELETE |
| `timingSafeEqual` | comparar com `===` vaza o prefixo correto |
| sem `WRITER_PURGE_TOKEN` → **503** | fecha por ausência de configuração, não por presença de erro |
| token errado → **404** | rota interna não confirma a própria existência |
| corpo `.strict()` sem `assetId`, `versionId` ou `updated_by` | aceitar ids deixaria o chamador escolher a vítima, fora das guardas |
| `mode` default `dry_run` | executar exige dizer em voz alta |

`brandId` chega no corpo porque a purga é por marca e o disparo é operacional —
mas quem envia o corpo é quem tem o token, não um navegador.

### 5.1 Conferido no navegador, de dentro de uma sessão autenticada

```text
sem token             → 503 purge_not_configured
token errado          → 503 purge_not_configured
pedindo mode=execute  → 503 purge_not_configured
```

A variável de ambiente **não está definida**, e enquanto não estiver a purga é
inalcançável por qualquer caminho.

**Nenhum cron.** `pg_cron` não está instalado e nenhum `vercel.json` foi criado —
o teste 15 verifica a ausência do arquivo.

---

## 6. Dry-run contra os nove ativos reais

Executado com as mesmas guardas do serviço, em 2026-09-19T02:05:07Z:

```text
total_assets          = 9
midia_elegivel_agora  = []          ← nada sairia
midia_recusas         = { not_superseded: 5, window_open: 4 }
versoes_documento     = { total: 0, elegiveis: 0 }
versoes_entregavel    = { total: 2, elegiveis: 0 }
```

As cinco recusas `not_superseded` são **as cinco imagens atuais** — capa, bloco,
cena e os dois slides. Elas não são "ainda não elegíveis": elas nunca serão,
enquanto forem as atuais.

As quatro `window_open` são **exatamente os quatro predecessores reais**, com o
tempo restante correto:

| `assetId` | `purge_after` | faltam |
| --- | --- | --- |
| `c4e69d77…` (bloco) | 2026-09-21T01:40:46 | 1d 23:35 |
| `216a832b…` (capa) | 2026-09-21T01:48:22 | 1d 23:43 |
| `74455e67…` (cena) | 2026-09-21T01:49:37 | 1d 23:44 |
| `6ba107e1…` (slide 1) | 2026-09-21T01:50:32 | 1d 23:45 |

É a evidência pedida: quando as 48h vencerem, estes quatro migram de
`window_open` para elegíveis **sozinhos**, sem nenhuma mudança de código. O
dry-run já os enxerga e já sabe a hora.

Os dois entregáveis de roteiro e carrossel ainda não têm versão substituída, por
isso `versoes_entregavel.elegiveis = 0`.

---

## 7. DNA e Radar fora do escopo

A lista de tabelas apagáveis é **fechada e declarada**:

```text
VERSION_PURGE_TABLES    content_document_versions · writer_deliverable_versions
PURGE_FORBIDDEN_TABLES  editorial_artifact_versions · editorial_decision_events
                        editorial_serp_reviews · editorial_serp_snapshots
                        editorial_version_status_events · writer_mcp_call_events
```

Existe para ser conferida por teste: acrescentar uma tabela à primeira lista a
torna apagável, e essa decisão não pode acontecer por descuido. O teste 10 exige
que as duas listas sejam disjuntas e que as intocáveis estejam nomeadas.

ArticleDNA, KeywordDNA, SiloDNA/SiloPage, SERP e evidências do Radar não têm
coluna de retenção e são protegidos por gatilho append-only — não é que "ainda
não" sejam purgados; é que não há caminho que os alcance.

---

## 8. Testes

`tests/redator-purge-dry-run.test.mts` — **16/16**, em `test:redator`.

| Cobertura pedida | Teste |
| --- | --- |
| item atual nunca aparece | 01 |
| superseded dentro de 48h não aparece | 02 |
| expirado aparece | 03 |
| predecessor sem sucessor válido não aparece | 05 |
| mídia de outra marca não aparece | 06 |
| dry-run não altera nada | 11 |
| Storage ausente é idempotente | 08 |
| falha de Storage preserva a linha | 08, 13 |
| perda de elegibilidade cancela o purge | 13 |
| repetição não gera erro nem efeito duplicado | 09 |
| DNA/Radar nunca entram na seleção | 10 |
| idade sozinha não basta | 04 |
| predecessor restaurado sai da seleção | 07 |

### 8.1 Baseline

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 120/120 | **136/136** | +16 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos novos | — | **0** | 0 |

---

## 9. Arquivos

**Criados:**
```
lib/redator/version-purge-plan.ts          elegibilidade de versões + listas fechadas
lib/server/writer-purge-service.ts         dry-run e execução, server-only
app/api/internal/writer-purge/route.ts     rota interna, fechada por padrão
tests/redator-purge-dry-run.test.mts       16 testes
```

**Alterados:** `lib/redator/media-purge-plan.ts` — guardas extras da mídia.

**Não tocados:** banco, migrations, Storage, DNA, Radar, SERP, Arquiteto,
Minerador, Publicações.

---

```text
PURGE_SERVICE_READY = YES
PURGE_DRY_RUN = PASS
MEDIA_CURRENT_PROTECTED = YES — 5 atuais recusados por not_superseded
VERSION_CURRENT_PROTECTED = YES — is_current conferido por nome, antes da FK
STORAGE_DELETE_IMPLEMENTED = YES — escrito e testado; nunca executado
REAL_DELETE_EXECUTED = NO
CRON_CONFIGURED = NO
DNA_RADAR_OUT_OF_SCOPE = YES
REGRESSIONS = NONE
PURGE_REACHABLE = NO — WRITER_PURGE_TOKEN não definido; rota responde 503
```

### O que falta para ligar

Definir `WRITER_PURGE_TOKEN` no ambiente do servidor. **Não a defini** — ligar a
purga é decisão sua, e a primeira execução real deveria ser um `dry_run` pela
rota, com os quatro predecessores já vencidos, antes de qualquer `execute`.

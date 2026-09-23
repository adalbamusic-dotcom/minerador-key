# SDD — Cache conferido das keywords vivas do Minerador — 2026-09-23

## Identificação

- **Módulo proprietário:** Minerador (`KeywordDNA`, ingestão e qualificação).
- **Origem:** opção O2 da seção E8 de `docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md`, que recomendou "keywords vivas no navegador, conferidas" como etapa 4, depois da correção do Arquiteto, da correção 3 do E7, de E2, de E1 e do cache de versões imutáveis.
- **Regras que esta SDD implementa:** R20 a R24 (propostas na seção E8), sobre R1–R16 vigentes.
- **Data:** 2026-09-23.
- **Responsável humano pela aprovação:** dono do produto.
- **Estado:** **proposta, aguardando autorização.** A migration `supabase/migrations/20260923140000_minerador_keywords_row_version.sql` está escrita e **não aplicada**. Nenhum código de cliente foi alterado por esta SDD.
- **Classe (`AGENTS.md` §4):** estrutural — muda schema (coluna e gatilho novos), a forma da gravação do Minerador (gravação condicional) e introduz estado persistido no navegador. Exige autorização antes do código.

Precedência: abaixo de invariantes, ADRs e da SDD de egress; acima de spec e código. Aprovar esta SDD autoriza só o escopo descrito aqui. Não autoriza aplicar a migration: o usuário aplica, manualmente, quando decidir.

Legenda de evidência: **MEDIDO** (consulta agregada ao banco em 2026-09-23), **VERIFICADO NO CÓDIGO** (leitura do arquivo em 2026-09-23), **ESTIMADO**, **AINDA NÃO VERIFICADO**.

---

## 1. Problema, medido

Toda abertura do Minerador baixa a listagem inteira da marca ativa, mesmo quando nada mudou desde a abertura anterior.

| Medida | Valor | Fonte |
| --- | --- | --- |
| Keywords vivas | 267 em 3 marcas; 39 a 158 por marca | MEDIDO, `count(*)` na view, `deleted_at is null` |
| Listagem por abertura, por marca | **380 a 607 kB** | MEDIDO, `sum(length(k::text))` em `minerador_keywords_listagem` |
| Linha média / maior linha da listagem | 7,4 kB / 16,4 kB | MEDIDO |
| Impressão digital (id + versão de cada viva), por marca | **2,6 a 10,6 kB** | MEDIDO, `length(json_build_object('id', id, 'row_version', 1)::text)`; limite superior, o PostgREST serializa sem espaços |
| Aberturas do Minerador por dia | 11 a 12 | MEDIDO na seção E8 (26 chamadas do app na view desde 21/09, agentes excluídos) |
| Custo atual da listagem | ~4,2 a 7,3 MB/dia | ESTIMADO: 11–12 aberturas × 380–607 kB |
| Custo com o cache conferido | ~0,03 a 0,13 MB/dia de impressão digital, mais 7,4 kB por keyword que mudou | ESTIMADO |

O ganho sozinho é pequeno frente à correção do Arquiteto (~12 a 19 MB/dia), e cresce com a marca: a listagem escala com keywords × tamanho do DNA; a impressão digital, só com o número de keywords. Somado ao cache de versões imutáveis, a SDD de egress estima ~6 a 10 MB/dia de economia.

**Por que não dá para fazer sem schema.** `minerador_keywords` não tem marcador de mudança: as 16 colunas são `id, keyword, location, results_allintitle, volume_search, kgr_score, intent, status, created_at, lista_id, analise_semantica, volume_source, brand_id, deleted_at, purge_after, deleted_by` (MEDIDO em `information_schema.columns`). Não há `updated_at`, versão nem hash. E o DNA muda por caminhos que não são o clique na tela (seção 5.3). Sem marcador, o cache teria de ser confiado sem conferência, e a E8 já rejeitou essa opção por ferir o `AGENTS.md` §10.

---

## 2. Contrato atual

### 2.1 Banco — MEDIDO no catálogo em 2026-09-23

- **Tabela** `public.minerador_keywords`, 16 colunas; `id uuid default gen_random_uuid()`. Nenhum escritor do código envia `id` explícito em `insert` (VERIFICADO NO CÓDIGO: grep em `app`, `lib`, `modules`).
- **Grants da tabela:** `authenticated` INSERT, SELECT, UPDATE; `service_role` INSERT, SELECT, UPDATE, REFERENCES, TRIGGER, TRUNCATE. Nem `authenticated` nem `service_role` têm DELETE: exclusão e purga passam pelas RPCs de ciclo de vida (`lifecycle_delete_minerador_keywords`, `lifecycle_restore_minerador_keywords`, `lifecycle_purge_minerador_keywords`).
- **Gatilhos**, todos `tgenabled = 'O'`, em ordem de disparo (alfabética):

  | Gatilho | Evento | Condição | Função | Definer |
  | --- | --- | --- | --- | --- |
  | `minerador_keywords_preserva_series` | BEFORE UPDATE | `old.analise_semantica IS DISTINCT FROM new.analise_semantica` | `minerador_keywords_preserva_series()` | sim |
  | `minerador_keywords_trava_identidade_publicada` | BEFORE UPDATE | idem | `minerador_keywords_trava_identidade_publicada()` | sim |
  | `trg_protect_published_keyword` | BEFORE DELETE OR UPDATE | — | `protect_published_keyword()` | sim |
  | `trg_tenant_0005_validate_keyword_brand` | BEFORE INSERT OR UPDATE OF brand_id, lista_id | — | `tenant_0005_validate_keyword_brand()` | não |

- **View** `public.minerador_keywords_listagem` (criada em `20260921030000_listagem_sem_series_de_medicao.sql`; nenhuma migration posterior a altera): `security_invoker=true`, dono `postgres`, SELECT para `authenticated` e `service_role`, nenhum objeto dependente. Mesmas 16 colunas da tabela, com `analise_semantica` podada das quatro séries de `MEASUREMENT_SERIES_PATHS` (`lib/minerador/listing-payload.ts`).
- PostgreSQL 17.6.

### 2.2 Tela do Minerador — VERIFICADO NO CÓDIGO

Arquivo `modules/minerador/minerador-workspace.tsx`. Os números de linha são da leitura de 2026-09-23 e mudam: outra sessão edita o arquivo em paralelo. A âncora estável é o nome da função.

- **Leitura da listagem:** `fetchData` (~1001), bloco ~1044–1071. Lê `select("*")` de `fonteDaListagem` (a view), com `.eq("brand_id")`, `.is("deleted_at", null)`, `.order("created_at", desc)` e o filtro `lista_id is null OR lista_id in (<listas carregadas da marca>)`.
- **Recuo para a tabela:** `fonteDaListagem` (~348) é variável de módulo; `viewDeListagemAusente` (~351) reconhece `42P01`, `PGRST205` ou mensagem com o nome da view. Com a view ausente, a tela passa a ler a tabela pelo resto da sessão da aba.
- **Hidratação das séries:** efeito sobre `expandedRowId` (~1453–1479) lê `id,analise_semantica` da tabela para uma keyword e mescla com `withMeasurementSeries`. Não roda quando a fonte já é a tabela.
- **Readback canônico:** `readCanonicalKeywordRows` (~542) lê `select("*")` da **tabela**, por marca, `deleted_at is null` e `in(ids)`, e falha se faltar alguma.
- **Nenhum cache local de keywords existe hoje.** O `useLocalHistory` (`components/editorial/use-local-history.ts`) guarda só o histórico de desfazer em memória, e `restoreKeywordSnapshot` (~494) só troca o estado da tela. O único IndexedDB do app é `minerador-pro-editorial` (`lib/editorial/browser-artifact-store.ts`), usado pela recuperação editorial.

---

## 3. Proposta

### 3.1 Marcador: `row_version`

Migration `20260923140000_minerador_keywords_row_version.sql`, **não aplicada**:

- coluna `row_version bigint NOT NULL DEFAULT 1`. Com default constante, o PostgreSQL 11+ só grava metadado, sem reescrever a tabela. Todas as linhas existentes nascem com 1;
- função `minerador_keywords_incrementa_row_version()`, `SECURITY DEFINER` e `search_path` fixo, como os gatilhos vizinhos. No INSERT grava 1; no UPDATE grava `OLD.row_version + 1`. **O valor enviado pelo escritor é sempre ignorado;**
- gatilho `zz_minerador_keywords_row_version`, BEFORE INSERT OR UPDATE, FOR EACH ROW. O prefixo `zz_` faz ele disparar **depois** dos quatro gatilhos BEFORE existentes. Assim ele só incrementa se nenhum deles abortou ou descartou a linha, e é a última palavra sobre `NEW`;
- view recriada com `CREATE OR REPLACE`, com `k.row_version` no fim, as 16 colunas exatamente como `pg_get_viewdef` as devolve hoje, `WITH (security_invoker = true)` repetido (o REPLACE substitui as opções da view) e `GRANT SELECT` idempotente. Dono, grants e OID são preservados. O comentário ganha uma frase;
- pré-condições em `DO`: a migration aborta se os gatilhos, as colunas da view, o `security_invoker` ou a poda das séries divergirem do conferido;
- pós-condições em `DO`: gatilho último e ligado, view com 17 colunas, `security_invoker`, grants, `anon` sem SELECT;
- tudo em `BEGIN … COMMIT`, com `NOTIFY pgrst, 'reload schema'`;
- rollback e SQL de verificação agregada em comentário, no fim do arquivo.

**Todo UPDATE conta, inclusive o que não muda nada.** Um falso positivo custa rebaixar uma linha de ~7 kB. Um falso negativo faria o cache mostrar dado velho como atual. Comparar a linha inteira para pular no-op custaria CPU em toda escrita e erraria em borda: `jsonb` compara `1.0` igual a `1`.

**Por que contador por linha basta, sem sequência global.** O risco seria um id purgado reaparecer com versão 1 e casar com uma entrada velha do cache (ABA). Os ids vêm de `gen_random_uuid()`, e nenhum escritor envia `id` (VERIFICADO NO CÓDIGO). Se algum escritor passar a enviar, a impressão digital deve incluir `created_at` (seção 8, risco 9).

### 3.2 Impressão digital e conferência

**Consulta da impressão digital**, na abertura do Minerador:

```
select id,row_version from minerador_keywords_listagem
 where brand_id = <marca ativa> and deleted_at is null
   and (lista_id is null or lista_id in (<listas carregadas da marca>))
```

É o **mesmo filtro** da listagem de `fetchData`, montado a partir das mesmas listas, e sempre com `brand_id` na consulta (R4). A impressão digital lê a view, e não a tabela, para que o recuo e o `security_invoker` sejam os mesmos da listagem.

**Fluxo da abertura:**

1. A tela mostra o que está no cache da marca, marcado como **"conferindo"**. Linhas do cache nunca aparecem como atuais antes da conferência terminar.
2. Pede a impressão digital ao banco.
3. Calcula o diff, numa função pura e testável:
   - **novos:** id na impressão digital e ausente do cache;
   - **mudados:** `row_version` do banco diferente da do cache, maior ou menor. Menor indica cache corrompido ou banco restaurado, e baixa do mesmo jeito;
   - **ausentes:** id no cache e ausente da impressão digital, ou seja, excluídos, purgados, restritos pela RLS ou movidos para fora das listas da marca.
4. Baixa **só novos e mudados**: `select *` da view com o mesmo filtro e `.in("id", <lote>)`, em lotes de até 100 ids para caber na URL.
5. Cada linha baixada só entra no cache se a `row_version` dela for **maior ou igual** à da impressão digital. Se for maior, alguém escreveu no meio; vale a mais nova.
6. **Descarta os ids ausentes** do cache da marca. Isso faz parte do contrato da conferência e fica autorizado com esta SDD (seção 10).
7. Monta a lista da tela **na ordem do banco**, `created_at desc`, como hoje. A ordem nunca vem do cache.
8. Só então a tela sai de "conferindo" e libera a gravação.

**Quando a conferência cai para a leitura remota de hoje** (R20):

- a consulta da impressão digital falha por qualquer motivo, inclusive `42703`/`PGRST204` (coluna `row_version` ausente: migration não aplicada ou revertida) e os códigos que `viewDeListagemAusente` já reconhece;
- o IndexedDB está indisponível ou lança erro (janela privada, site data bloqueado, cota);
- o cache está vazio ou foi despejado — nesse caso a conferência baixa todos os ids, o que custa o mesmo que hoje;
- o esquema do cache é de versão anterior.

Nesses casos a tela lê a listagem inteira como hoje, e o cache é reconstruído a partir dessa leitura.

**Impressão digital vazia com cache cheio.** Antes de descartar tudo, a tela faz a leitura remota completa, como hoje. Só descarta se ela também voltar vazia. O custo é mínimo, porque zero linhas pesam quase nada, e protege contra "cache vazio vira marca vazia" e contra o caminho oposto, "resposta vazia por falha vira limpeza do cache" (R22, `AGENTS.md` §10).

**Strict Mode (R13).** A conferência é deduplicada por chave (`actorUserId`, `brandId`, listas), como `fetchDataInFlightRef` já faz com a carga. Em `next dev`, a segunda montagem reaproveita a conferência em curso.

### 3.3 Gravação

**Bloqueada até a conferência terminar.** Enquanto a tela estiver em "conferindo", todas as ações que gravam em `minerador_keywords` ficam desabilitadas: botões `disabled`, com o motivo à vista, e guarda no início de cada handler. Se a conferência cair para a leitura remota, a gravação libera quando essa leitura termina, como hoje.

**Gravação condicional à versão lida.** Toda gravação de linha feita pelo cliente passa a ser:

```
update(<campos>)
  .eq("id", id).eq("brand_id", marca).is("deleted_at", null)
  .eq("row_version", <versão que a tela leu>)
  .select("id,row_version")
```

- **zero linhas devolvidas = conflito.** A tela não aplica nada e mostra: **"Esta keyword mudou no banco desde que a tela foi carregada. Recarregue para ver a versão atual."** Em seguida relê aquela linha pela view e atualiza a tela e o cache com o que veio. Não repete a gravação por conta própria: a decisão pode ter sido tomada sobre o estado antigo;
- o `select` devolve só `id,row_version` (R6), nunca a linha inteira;
- gravações em lote hoje feitas com `.in("id", …)` (o ramo sem aprovação de `handleUpdateStatus`) viram gravações por linha, cada uma com a própria versão, em blocos de 20 como `processLogicalKeywordDna` já faz. Uma RPC de lote condicional seria mudança de schema e ficaria para outra SDD;
- insert não precisa de condição. O `.select(…)` do insert já devolve a linha gravada, com `row_version = 1`.

**Readback em toda gravação.** Depois de gravar, a tela relê a linha **pela view**, com `.in("id", ids)`, marca, `deleted_at is null`, e confere que a `row_version` lida é maior ou igual à devolvida pelo `update`. Ler pela view dá ao cache a mesma forma da listagem, sem as séries (R8), e é mais barato que o `select("*")` da tabela de `readCanonicalKeywordRows`. Onde a validação de hoje precisar da linha completa, ela continua lendo a tabela. O cache, porém, recebe a projeção de listagem: a linha da view ou `withoutMeasurementSeries` aplicado à linha da tabela, com a mesma lista de caminhos.

**O cache recebe o readback, nunca o enviado (R21).** Os gatilhos reescrevem `analise_semantica`. `minerador_keywords_preserva_series` restaura séries omitidas e `minerador_keywords_trava_identidade_publicada` desfaz mudança de slug ou endereço da publicada e acrescenta `publication_identity_lock_history`. Então o gravado não é o enviado. Nenhum caminho escreve no cache a partir do payload montado no cliente, do estado da tela, de um rascunho de revisão ou de um snapshot de desfazer.

**Ações feitas pelo servidor a pedido da tela** — allintitle, métricas do Google Ads, conferência de site, exclusão e restauração — gravam sem condição. Depois de cada uma, a tela relê as linhas afetadas pela view e atualiza a tela e o cache. Sem isso, a próxima gravação condicional da tela falharia com "mudou no banco" logo depois de a própria tela ter mandado mudar.

### 3.4 Armazenamento no navegador

- **IndexedDB próprio**, separado de `minerador-pro-editorial`, por exemplo `minerador-key-cache-keywords`, ou uma object store própria no banco do cache de versões imutáveis, se aquele já existir quando esta SDD for implementada. **Não** usar o banco da recuperação editorial: `readBrowserStorageSnapshot` enumera tudo o que há nele, e dado de cache não é estado a recuperar.
- **Chave** `[actorUserId, brandId, keywordId]`, com `actorUserId = auth.users.id` da sessão, **nunca o e-mail**. **Valor:** a linha da view, com `brand_id` e `row_version`, mais `schemaVersion` e `storedAt` (R22).
- **Leitura confere o `brandId`.** Entrada cujo `brand_id` não é o da marca ativa é ignorada e descartada.
- **Put monotônico.** Nunca substituir uma entrada por outra de `row_version` menor. Assim duas abas escrevendo no mesmo IndexedDB não regridem uma à outra.
- **Sem hidratação no cache.** As séries de medição que o painel hidrata ao expandir não entram no cache. Continuam lidas sob demanda, uma keyword por vez.
- **Estado da tela continua o de hoje.** O cache só alimenta o primeiro desenho e a conferência. `setKeywords` continua recebendo readbacks. Nenhuma decisão de autorização, aprovação ou handoff lê o cache (`AGENTS.md` §10).

---

## 4. Consumidores

### 4.1 Leitura

| Consumidor | Lê | Efeito da coluna nova | Efeito do cache |
| --- | --- | --- | --- |
| Tela do Minerador, `fetchData` (~1044–1071) | `select("*")` da view | ganha `row_version` | passa a conferir antes de baixar |
| Recuo da view para a tabela (~1063–1068, `viewDeListagemAusente`) | `select("*")` da tabela | ganha `row_version` | a conferência também recua; sem a coluna, lê como hoje |
| Hidratação ao expandir (~1453–1479) | `id,analise_semantica` da tabela | nenhum | nenhum; fora do cache |
| `readCanonicalKeywordRows` (~542) | `select("*")` da tabela | ganha `row_version` | fonte do readback; projetar antes de pôr no cache |
| Arquiteto (`lib/server/arquiteto-workspace.ts`, `app/api/arquiteto/workspace/route.ts`) | colunas próprias; outra sessão está estreitando | +~17 bytes por linha se ainda usar `*` | nenhum |
| `/api/inteligencia`, `app/api/editorial/serp`, `recoverable`, `authz.ts`, prévia de importação de site | colunas próprias ou `*` | +~17 bytes por linha no pior caso | nenhum |
| `ArchitectKeywordSchema` (`lib/arquiteto/contracts.ts:479`) | `z.object` sem `.strict()` | a chave extra é descartada | nenhum |
| Assinatura do pacote aprovado (`approvedPackageSignature`, `lib/minerador/approved-package.ts:263`) | campos explícitos | **não entra na assinatura** | nenhum |

Nenhum consumidor que faça hash da linha inteira foi encontrado (VERIFICADO NO CÓDIGO: grep por hash ou `JSON.stringify` sobre a linha). Um escritor que devolva a linha lida em `update` ou `insert` com `row_version` dentro não causa dano: o gatilho ignora o valor.

### 4.2 Pontos de gravação da tela que enviam `analise_semantica`

Grep em `modules/minerador/minerador-workspace.tsx` em 2026-09-23. "Readback" significa reler do banco depois de gravar e pôr na tela o que voltou.

| Handler (~linha) | Grava | Readback hoje | A tela recebe | Ator | Mudança nesta SDD |
| --- | --- | --- | --- | --- | --- |
| `processLogicalKeywordDna` (~850) | `intent`, `analise_semantica`, em blocos de 20 | **sim**, `readCanonicalKeywordRows` com validação do contrato | readback | — | condicional por linha; cache recebe a projeção |
| `handleImportCSV` (~1903) | `insert` com `analise_semantica` | **sim**, `.select("*")` do insert | linha devolvida | — | cache recebe a projeção da devolvida |
| `handleManualImport` (~1998) | `insert` com `analise_semantica` | **sim**, `.select("*")` do insert | linha devolvida | — | idem |
| `handleUpdateStatus`, aprovação (~2186) | `status` + `analise_semantica` com pacote aprovado | **não** | **o enviado** (`semanticaPorId`) | `session.user.id` | condicional + readback; hoje a tela pode divergir do banco se a trava da publicada agir |
| `handleUpdateStatus`, só status (~2195) | `status`, `.in("id", …)` em lote | **não** | **o enviado** | — | vira gravação por linha, condicional + readback |
| `handleBatchKgrApplicability` (~2246) | `analise_semantica` | **sim**, `readCanonicalKeywordRows` | readback | **e-mail** ou id (~2225) | condicional |
| `handleBatchCompleteHumanReview` (~2303) | `analise_semantica` | **sim** | readback | **e-mail** ou id (~2283) | condicional |
| `handlePrimaryKeywordPolicyChange` (~2387) | `analise_semantica` | **não** | **o enviado** (`semantic`) | **só e-mail**, sem recuo para id (~2381) | condicional + readback |
| `handleHumanReviewAction`, `page_type` (~2452) | `analise_semantica` | **sim**, `id,brand_id,analise_semantica` da tabela | readback | `session.user.id` | condicional |
| `handleHumanReviewAction`, campo, KGR e conclusão (~2564) | `analise_semantica` (+ `intent`) | **sim**, `readCanonicalKeywordRows` | readback | **e-mail** ou id (~2496) | condicional |
| `handlePublicationLinkAction` (~1424) | `analise_semantica` (+ `status`) | **sim**, `id,brand_id,status,analise_semantica` | readback | `session.user.id` | condicional |
| `persistSiteSyncCandidates` (~1331), pelo servidor | rota `/api/marca/site/import/keywords` | **sim**, `select("*")` da tabela | readback | servidor | cache recebe a projeção |
| `handleBatchAllintitle` (~2611), pelo servidor | rota allintitle | **sim**, `readCanonicalKeywordRows` | readback | servidor | idem |
| `handleBatchQualify` (~2734), pelo servidor | rota de métricas do Google Ads | **sim**, `readCanonicalKeywordRows` | readback | servidor | idem |
| `handleBatchDelete` (~2808), pelo servidor | RPC de exclusão | não se aplica; remove ids da tela | — | servidor | ids somem da impressão digital e são descartados |
| `handleRestoreKeyword` (~1719), pelo servidor | RPC de restauração | **não** | **a linha da lista de recuperáveis**, anterior à restauração | servidor | readback pela view; a linha recuperável tem `row_version` velha |

Os três caminhos que hoje põem na tela o que foi enviado — aprovação, status em lote e política da principal — mais a restauração são os que a E8 apontou. Com a gravação condicional, qualquer um deles faria a gravação seguinte falhar com "mudou no banco". O readback deles é **pré-requisito** do cache, não melhoria.

### 4.3 Escritores fora da tela

Não mudam com esta SDD. Todos incrementam `row_version` pelo gatilho e aparecem na próxima conferência.

- rotas do servidor: `dataforseo/allintitle` (4 updates), `google-ads/metricas-keywords` (2), `marca/site/import/keywords` (update e insert), `lib/minerador/keyword-import-core.ts` (updates e insert);
- RPCs de ciclo de vida: exclusão e restauração fazem UPDATE; a purga faz DELETE;
- scripts com service role (`minerador:*`, `audit:*`, `reset:*`) — em 2026-09 regravaram 104 e 29 keywords (`docs/03-minerador/estado-atual.md`);
- o MCP pela Vercel, citado na E8 como escritor. AINDA NÃO VERIFICADO nesta leitura: o grep não achou `minerador_keywords` em `app/api/mcp`, e o caminho pode passar por uma função compartilhada.

---

## 5. Compatibilidade

1. **Migration sem código:** aditiva. A coluna nova aparece no `select("*")` de todos os leitores, e nenhum a interpreta. Nenhum dado muda. A tela funciona como hoje.
2. **Código sem migration:** a consulta da impressão digital falha com coluna ausente, e a tela cai para a leitura remota completa de hoje. A gravação condicional **só é ligada** quando a impressão digital funcionou nesta carga. Sem ela, grava como hoje. Nenhuma ordem de deploy quebra a tela.
3. **Duas abas, uma com código antigo:** a aba antiga grava sem condição e incrementa a versão. A nova detecta na próxima conferência ou falha a gravação condicional com a mensagem de recarregar. É o comportamento desejado.
4. **Contrato público:** nenhuma rota, tipo exportado ou artefato canônico muda. `KeywordItem` ganha um campo opcional `row_version?: number`.

---

## 6. Migração

| Quem | Passo |
| --- | --- |
| Dono do produto | Aprovar esta SDD (seção 10) |
| Usuário | `npx supabase db query --linked -f supabase/migrations/20260923140000_minerador_keywords_row_version.sql` |
| Usuário | `npx supabase migration repair --status applied 20260923140000 --linked` — **nunca** `supabase db push` |
| Usuário | Rodar o SQL de verificação 1 a 5 do fim da migration, só agregado. O 6 é um smoke que escreve dentro de uma transação sempre abortada e exige autorização própria |
| Agente | Readback nos quatro caminhos sem readback (4.2), com teste; ainda sem cache |
| Agente | Módulo do cache, com diff puro, IndexedDB e testes; conferência na abertura |
| Agente | Gravação condicional em todos os pontos de 4.2 |
| Usuário | Homologação manual (seção 9) |

---

## 7. Rollback

- **Código:** desligar o cache, voltando a `fetchData` de hoje, e a gravação condicional, voltando ao `update` sem `.eq("row_version")`. O cache no navegador fica órfão e inofensivo, porque nenhuma leitura o usa; removê-lo é limpeza e segue a política da seção 10.
- **Banco:** bloco `ROLLBACK` em comentário no fim da migration. Remove gatilho e função, recria a view com `DROP` + `CREATE`, com as 16 colunas, o comentário e os grants de hoje (`CREATE OR REPLACE` não remove coluna), e remove a coluna. Depois, `migration repair --status reverted 20260923140000`. Não se perde dado de negócio: `row_version` só conta escritas.
- **Ordem:** código antes do banco. Com o banco revertido e o código novo, a conferência cai para a leitura remota (seção 5, item 2), então a ordem inversa também não quebra a tela.

---

## 8. Riscos

1. **Gatilhos reescrevem `analise_semantica`.** `preserva_series` e `trava_identidade_publicada` mudam o que foi enviado. Mitigação: R21, porque o cache só recebe readback. O gatilho de versão roda por último e conta a escrita final.
2. **Exclusão definitiva pela purga.** A linha some do banco. Mitigação: o id some da impressão digital e é descartado. A exclusão recuperável (`deleted_at`) também some, pelo filtro. A lista de recuperáveis não é cacheada.
3. **Duas abas.** Compartilham o IndexedDB da origem e não se sincronizam. Mitigação: put monotônico por `row_version`, e gravação condicional que recusa a aba defasada com "mudou no banco, recarregue". `BroadcastChannel` fica fora do escopo.
4. **Origens diferentes.** `localhost`, `s-<slot>.localhost` e `minerador-key.vercel.app` têm armazenamento próprio. Cada uma confere sozinha. O custo é só duplicar a primeira carga por origem.
5. **Despejo do IndexedDB.** O navegador pode apagar o armazenamento sem aviso: armazenamento best-effort, pressão de disco, limpeza do usuário. Mitigação: cache vazio é tratado como "sem cache", e a conferência baixa tudo. Nunca como "marca vazia" (R22). Não pedir `navigator.storage.persist()` sem decisão própria.
6. **Dado de cliente em repouso depois do logout.** DNA de keywords de marca fica no disco do navegador. Mitigação proposta: apagar as entradas do `actorUserId` no logout explícito, na perda de acesso à marca (impressão digital vazia confirmada pela leitura remota) e na troca de `schemaVersion`. Isso é limpeza de IndexedDB e **precisa da autorização da seção 10** (`AGENTS.md` §10 e §15). Não resolve encerramento por fechar a aba nem PC compartilhado. Esse risco residual precisa ser aceito explicitamente.
7. **`actorId` gravado como e-mail.** `handlePrimaryKeywordPolicyChange` (~2381) usa `session.user.email || "local-user"`, sem recuo para o id. `handleBatchKgrApplicability` (~2225), `handleBatchCompleteHumanReview` (~2283) e `handleHumanReviewAction` (~2496) preferem o e-mail ao id. O e-mail fica em `analise_semantica` e, com esta SDD, também no cache em repouso. Diverge do `AGENTS.md` §5 (`actorUserId = auth.users.id`). **Fora do escopo desta SDD:** trocar muda o conteúdo dos registros de decisão humana e exige decisão própria. Registrado como pendência. O cache nunca usa e-mail como chave.
8. **Falso "mudou no banco".** Qualquer UPDATE incrementa, inclusive o `SET status = status` de scripts e as ações do próprio servidor. Mitigação: readback depois de toda ação de servidor pedida pela tela (3.3). Um conflito falso custa um recarregamento, nunca uma gravação perdida.
9. **Reuso de id (ABA).** Um id purgado e reinserido com versão 1 casaria com entrada velha. Hoje é impossível na prática: `gen_random_uuid()` e nenhum escritor envia `id`. Mitigação se mudar: incluir `created_at` na impressão digital (+~25 bytes por linha).
10. **Ordem dos gatilhos.** Um gatilho novo cujo nome ordene depois de `zz_minerador_keywords_row_version` rodaria depois do incremento. Mitigação: a pós-condição da migration e o teste estrutural proposto exigem que ele seja o último.
11. **Sintaxe da migration não executada.** Não há Postgres local (E5) nem parser SQL no projeto, e esta sessão não pode escrever no remoto. As pré e pós-condições abortam a transação inteira se algo divergir. AINDA NÃO VERIFICADO em execução.
12. **Egress da própria conferência.** Mais uma consulta por abertura (2,6 a 10,6 kB) e, no pior caso de cache frio, a listagem inteira, como hoje. Nunca pior que hoje por mais do que a impressão digital.

---

## 9. Testes

Todos com fixtures, sem rede, sem provider pago. Fixture de `timestamptz` usa `+00:00`. Teste estrutural remove comentários antes de casar.

**Migration, estrutural** (`tests/minerador-row-version-migration.test.mts`, novo):
- coluna `bigint NOT NULL DEFAULT 1`;
- nome do gatilho ordena, em ordem de bytes, depois de todo gatilho criado em `minerador_keywords` por qualquer migration;
- função `SECURITY DEFINER` com `SET search_path = pg_catalog, public, pg_temp` (entra na lista de `tests/minerador-gatilhos-security-definer.test.mts`);
- a view repete as 16 colunas na ordem de `20260921030000`, as quatro podas de `MEASUREMENT_SERIES_PATHS` (conferidas contra `lib/minerador/listing-payload.ts`), `security_invoker = true` e `row_version` por último;
- `BEGIN`/`COMMIT`, sem `pg_column_size`, sem `db push`, rollback presente.

**Diff da conferência, puro:** novos, mudados para cima e para baixo, ausentes, cache vazio, impressão digital vazia, id de outra marca no cache.

**Cache:**
- chave com `actorUserId` e `brandId`;
- leitura descarta `brand_id` alheio;
- put monotônico;
- cache vazio não vira lista vazia;
- IndexedDB que lança erro cai para a leitura remota;
- o cache nunca recebe o payload enviado. O oráculo é uma fixture em que o "banco" devolve `analise_semantica` diferente da enviada, como faz a trava da publicada.

**Tela:**
- gravação bloqueada durante "conferindo";
- gravação condicional com zero linhas mostra "mudou no banco, recarregue" e não aplica nada;
- readback nos quatro caminhos que hoje não o fazem;
- recuo com `42703`/`PGRST204`;
- filtro por marca em toda consulta nova (R4, R16).

**Regressão:** suíte do Minerador na linha de base de hoje (28 falhas), `test:arquiteto` (handoff), `test:editorial` (isolamento de `/api/inteligencia`), e assinatura v3 do pacote aprovado inalterada com `row_version` presente na linha.

**Homologação manual (usuário):**
- abrir o Minerador duas vezes e conferir no painel de rede que a segunda abertura baixa só a impressão digital;
- medir allintitle numa keyword e ver só ela baixada na próxima abertura;
- duas abas: gravar numa e ver a outra recusar;
- excluir e restaurar;
- logout.

**Readback no banco (R2/R3):** `max(row_version)` subindo depois das ações, sem ler payload.

---

## 10. Autorização pendente

- [ ] Aprovar esta SDD e as regras R20–R24 da seção E8.
- [ ] Aplicar a migration `20260923140000_minerador_keywords_row_version.sql`. É ato do usuário, com `db query -f` + `migration repair`.
- [ ] Autorizar o novo armazenamento persistente no navegador, em IndexedDB próprio, com dado de cliente em repouso.
- [ ] Autorizar a política de limpeza do cache, que é limpeza de IndexedDB (`AGENTS.md` §10/§15): descarte dos ids ausentes na conferência; apagar as entradas do ator no logout explícito, na perda de acesso à marca confirmada e na troca de `schemaVersion`. Nenhuma outra limpeza.
- [ ] Aceitar o risco residual 6: dado em repouso quando a aba é fechada sem logout.
- [ ] Decidir, em separado, sobre o `actorId` por e-mail (risco 7).
- [ ] Autorizar o smoke 6 da migration, opcional, que escreve dentro de transação abortada.

Decisão, data e aprovador:

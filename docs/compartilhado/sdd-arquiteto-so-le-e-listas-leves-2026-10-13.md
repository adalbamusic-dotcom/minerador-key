# SDD — O Arquiteto só lê, o recadastro substitui, as listas ficam leves — 2026-10-13

> **Status: APROVADA — autorização do dono para a SDD e para as sugestões (frase do §1); D1–D8 DECIDIDAS pela recomendação em 2026-10-13 ("pode seguir suas recomendações sim", §17). Andamento no §18: F1, F2, F3, F4, F5, F6 e F7 feitas no código (sem deploy; a F6 com a migration M-L e a F7 com a migration M-E escritas e NÃO aplicadas).**
> Escrita sem nenhuma linha de código de produção, sem escrita no banco, sem
> chamada paga. Leitura remota só por `SELECT` agregado
> (`npx supabase db query --linked -f`), em 2026-10-13. Commit, push, deploy,
> migration e SQL de escrita são do dono (`AGENTS.md` §15).
>
> Fontes que esta SDD respeita e não reescreve: `sdd-plano-declarado-e-grupos-2026-10-12.md`
> (§8 leitura por grupo), `sdd-cadastro-assunto-na-keyword-2026-10-13.md`,
> `sdd-conversao-assunto-legado-2026-10-13.md`, `sdd-acelerar-fluxo-do-plano-2026-10-13.md`
> (§2 entregáveis intocados, item 6) e `sdd-uso-supabase-orcamento-egress-2026-09-23.md`
> (regras R1–R24, que continuam vigentes e são a base do item 4).

## 0. Resumo para o dono

1. **Recadastrar substitui.** O card "Cadastrar Assuntos" ganha, no destino "Silo
   existente", a escolha **Acrescentar** (o de hoje) ou **Substituir o plano**. Na
   substituição a prévia mostra quatro listas — fica igual, muda, entra, sai — e
   uma confirmação faz tudo: o que sai passa por "Tirar do plano" (inclusive o
   Pilar, quando o plano novo traz outro), o Assunto pode mudar de keyword, e o
   plano novo é gravado. Nada é apagado: keyword que sai do plano continua no
   Minerador e no grupo; artigo que já existe no Arquiteto fica "Fora do plano"
   até você decidir lá; o que está no Radar, no Redator ou publicado não muda.
2. **O Arquiteto só lê keyword.** Hoje um clique de "Gravar melhorias" no Arquiteto
   mede volume, roda a Lógica, importa, aprova e envia keywords **no Minerador**
   (seis escritas). Passa a ser assim: o Arquiteto grava só os artefatos dele
   (ArticleDNA, SiloDNA/SiloPage, posições, cópia de trabalho). Keyword nova,
   medição ou aprovação vira **sugestão do Arquiteto**, que aparece no Minerador
   ("Sugestões do Arquiteto · cor X"); você decide lá pelo "Aprovar e enviar" de
   sempre, e o Arquiteto relê.
3. **Olhar o DNA antes de buscar.** Toda operação que chama IA, Google Ads ou
   DataForSEO passa a ter uma etapa obrigatória e grátis: lê o KeywordDNA, o
   volume já medido (inclusive "o Google Ads não tem média"), a SERP em cache, o
   Assunto/plano/trava e a lista da Pesquisa por Assunto; diz "já temos X, falta
   Y, custa Z"; e só então pergunta se paga. A IA recebe o resumo do DNA.
4. **Listas leves.** Planilha carrega só as colunas que você vê. O detalhe (DNA da
   keyword, DNA do artigo, parecer de SERP) é lido **só quando você abre o
   painel daquele item**, e fica em cache. Medido hoje: a lista de keywords da
   AdalbaPro traz **2,0 MB** para mostrar **~47 kB** de colunas; o ArticleDNA da
   mesa traz **7,2 MB** (todas as versões) para mostrar **~13 kB**.
5. **Planilha primeiro no Arquiteto.** Cada artigo do plano vira uma **linha** em
   "Artigos novos" assim que a keyword chega (cor, ordem, papel, Assunto,
   keyword, trava, volume). As ações ficam na linha e no lote: "Validar SERP"
   (custo antes), "Trocar principal" (só a livre), "Concluir formação". O painel
   de texto da melhoria fica só para publicados.
6. **Excluir tudo da cor X.** Uma operação por cor, numa área ou na cadeia
   inteira, com prévia (quantos itens, quais ficam fora e por quê), confirmação
   forte (nome da cor digitado e "apaga de vez" quando há exclusão definitiva),
   recusa por item, releitura e registro no histórico do grupo. O Assunto é
   liberado pelo caminho autorizado dentro da mesma operação. No fim, se nada
   ficou, a cor é liberada (o grupo é arquivado sem plano).

## 1. Identificação

- **Data e autorização:** 2026-10-13, dono do produto. Frase literal:
  > "eu vou recadastrar tudo para não dar o bug ou defeito, só que você tem que
  > viabilizar essa função no minerador, e substituir tudo, e falei sempre todas
  > essas keywords têm que receber o mesmo trato que qualquer uma, com todas
  > liberdades e contratos, e o arquiteto não pode mexer em nenhuma keyword que o
  > minerador mandou, ele só tem que ler e reacomodar, reposicionar tanto dentro
  > do artigo assim como no silo, e tem que primeiro sempre olhar os dados dos
  > DNAs de todas as keywords, e não passar direto a fazer outra busca sem mesmo
  > nem olhar o que já tem. E outra coisa com respeito às listas das
  > planilhas/tabelas: ele só tem que carregar os nomes, uma linha simples, e só
  > quando abrir o painel do DNA da keyword e/ou artigo pode carregar os dados só
  > desse que foi aberto; o resto só continua mostrando a lista leve, porque toda
  > hora ele fica carregando tudo e está ficando muito lento; não precisa chamar
  > todos os dados que estão dentro de cada artigo, só o nome, slug, assunto e as
  > demais coisas que já estão nas colunas, o resto nem precisa chamar… para
  > deixar tudo mais fluido e não causar penalidades na Supabase. E pode
  > implementar as suas sugestões sim."
  >
  > Sugestão aprovada na mesma data: os artigos do plano viram LINHAS direto na
  > planilha "Artigos novos" do Arquiteto, com ações na linha — validar SERP com
  > custo antes, trocar principal livre, concluir formação — e o painel de texto
  > da melhoria deixa de ser o caminho do plano, ficando só para publicados.
  >
  > Acréscimo do dono, mesma data (item 6): "também tem que ter a opção de poder
  > eliminar tudo que estiver dentro de uma tag, de acordo aos contratos que já
  > temos a nível global; se quero apagar toda a lista de uma tag tem que ter essa
  > opção; isso de apagar já está nas regras em qualquer área".
- **O que a frase autoriza:** esta SDD e a implementação das fases do §10, cada
  uma no seu deploy. **Não autoriza** aplicar migration (o dono aplica, com
  ensaio), SQL de escrita, chamada paga automática, mudança em arquivo de
  entregável (§2.1 da SDD acelerar), nem exclusão sem a confirmação por operação
  do item 6 (`AGENTS.md` §15: exclusão exige autorização explícita a cada vez).
- **Módulos proprietários, um por item** (`AGENTS.md` §3):

  | Item | Dono | Consumidores com mudança |
  |---|---|---|
  | 1 Recadastro que substitui | Minerador | Arquiteto (lê "Fora do plano"/"Atualização disponível"), MCP/catálogo |
  | 2 Arquiteto só lê keyword | Arquiteto | Minerador (recebe as sugestões; nenhuma regra dele muda), MCP/catálogo |
  | 3 Ler o DNA antes de buscar | Arquiteto | Minerador (Pesquisa por Assunto e Medir volume, mesma regra), MCP |
  | 4 Listas leves | Compartilhado/editorial (SDD egress) | Minerador, Arquiteto, Radar, Redator, Publicações |
  | 5 Planilha primeiro | Arquiteto | MCP/catálogo |
  | 6 Excluir tudo da cor | Compartilhado (cada área executa a sua parte pelo seu núcleo) | todas as áreas, MCP (continua sem exclusão) |

- **Tipo:** estrutural (fronteira entre módulos, workflow, persistência de
  leitura) → SDD (`AGENTS.md` §4).

## 2. Frentes em curso agora (2026-10-13) e como esta SDD se encaixa

| Frente em curso | Onde está | Encaixe |
|---|---|---|
| **Posto de principal = trava + Assunto no cabeçalho** | `lib/minerador/keyword-plan-lock.ts` (novo), `setKeywordPlanLockWithCore` em `lib/minerador/declared-plan-import-core.ts:1487`, rota `app/api/minerador/marcas/[brandId]/plans/lock/` | Item 1 grava a trava pelo MESMO núcleo; item 5 mostra a trava efetiva na linha (`declaredPrincipalLock`) e "Trocar principal" só aparece com trava livre. Nenhuma fase daqui mexe nesses arquivos antes da frente fechar. |
| **Modal de importar por cor / lista leve no Arquiteto** | `lib/arquiteto/minerador-import.ts`, `lib/server/arquiteto-minerador-import.ts`, `modules/arquiteto/minerador-import-dialog.tsx`, `app/api/arquiteto/import/route.ts` (novos) | É o primeiro caso do item 4 (lista só com `id, keyword, groupId, status, state, reason, detail` — `minerador-import.ts:39`). Porém o modal oferece **"aprovar e enviar"** a partir do Arquiteto (`ArquitetoImportState = "approve_and_send"`, `minerador-import.ts:25`): pelo item 2 isso passa a ser um **atalho que abre o Minerador** já filtrado na cor (ou exige que o diálogo diga, com o nome da área, "a aprovação é do Minerador; você decide aqui em nome dele", ver D2). |
| **"O Assunto nunca se perde" (gatilho)** | `supabase/migrations/20261015120000_assunto_nunca_se_perde.sql` (**não aplicada**), `lib/minerador/subject-recovery.ts`, `KEYWORD_SUBJECT_RELEASE_VIAS` em `lib/minerador/keyword-subject.ts:54` | Item 1: o que sai do plano na substituição usa o marcador `via: "tirar_do_plano"` (já aceito pelo gatilho, linha 191). Item 6: usa `via: "excluir_cor"`, já **reservado** pelo gatilho (linhas 43–66 e 280) para exatamente esta operação. Nenhuma fase daqui depende da migration estar aplicada; com ela aplicada, o caminho autorizado continua passando. |
| Acelerar o fluxo do plano (F1–F5) | SDD acelerar, §11 | Item 5 substitui a porta "Formar os artigos do plano · cor" (item 4 de lá) por linhas; item 4 desta SDD completa o item 6 de lá (a mesa do Arquiteto continua inteira hoje). |

## 3. Restrição: entregáveis intocados

Vale integralmente o §2 da SDD acelerar. Toda fase desta SDD:

1. roda `tests/entregaveis-intocados-2026-10-13.test.mts` (E0, 105 hashes, em
   `test:radar`) com os **mesmos** hashes de `tests/fixtures/entregaveis-2026-10-13.sha256.json`,
   que nenhuma fase pode atualizar;
2. registra `git diff --stat <base da fase> -- <lista do §2.1 da SDD acelerar>` vazio;
3. para o item 4, prova adicional: o leitor leve **não** é usado por nenhum
   caminho de entregável (CSV "Para escrever", artigo-modelo, Redator,
   `get_article_for_writing`, `get_video_material`, `get_writer_*`), que
   continuam lendo o objeto inteiro por id — teste estrutural que procura o nome
   do leitor leve nesses arquivos (com comentários removidos antes de casar).

## 4. Dados reais (SELECT agregado, 2026-10-13)

Marcas: AdalbaPro `61d2e019…`, WifiConecta `d4fa133a…`, Care Glow `09762023…`,
Somatec Blocking `bb23df49…`. Bytes de fio por `length(x::text)` (R2 da SDD
egress), nunca `pg_column_size`.

**WifiConecta, keywords vivas por cor** (`minerador_keywords` × `editorial_groups`):

| Cor | Status | Keywords | Já no Arquiteto (item `keyword/architect`) | Com Assunto declarado |
|---|---|---|---|---|
| azul ("Wi-Fi e fibra óptica", plano v1, `silo_id` nulo) | aprovado | 7 | 7 | **0** (as 7 perderam o Assunto — caso que motivou o gatilho) |
| laranja (plano v0, sem plano) | aprovado | 51 | 51 | 8 (linhas-título do formato anterior) |
| laranja | bruto | 5 | 0 | 0 |
| sem grupo | bruto | 1 | 0 | 0 |

ArticleDNA da WifiConecta: 9 entidades, 20 versões. É sobre esse estado que o
dono vai "recadastrar tudo".

## 5. Item 1 — Recadastro que substitui (dono: Minerador)

### 5.1 Contrato atual (verificado no código)

| # | Onde | Hoje |
|---|---|---|
| R1 | `modules/minerador/subject-cadastro-card.tsx:44`, `:63`, `:76` | Três destinos: Silo novo, Silo existente, Artigo publicado. Não há "substituir". |
| R2 | `subject-cadastro-card.tsx:53`, `:457` | No Silo existente, "as linhas já gravadas aparecem abaixo e não saem por aqui (para tirar um artigo do plano, use 'Tirar do plano')". |
| R3 | `lib/minerador/declared-plan-import-core.ts:743-754` | **Semântica de acréscimo:** os artigos gravados que a prévia não casou (`kept`) entram intactos no plano mesclado; nenhum sai. O plano mesclado é validado inteiro (`validateParsedDeclaredPlan`, `:750`) — ordem/Pilar duplicados com os gravados viram impedimento "(contando os N artigos já gravados no plano)" (`:752`). |
| R4 | `:577` | "Silo novo" numa cor cujo grupo já tem outro Silo é recusado ("escolha 'Silo existente'… ou outra cor"). |
| R5 | `:627-628` | O mesmo Assunto (título) já morando em OUTRA keyword do plano é recusado: "Para trocar a keyword, use 'Tirar do plano' e cadastre de novo." |
| R6 | `:654`, `:658` | Keyword cujo Assunto pertence ao plano de outro grupo: recusada ("tire-o daquele plano antes"). |
| R7 | `:659` | Keyword já publicada no formato do cadastro: recusada (destino certo é "Artigo publicado"; `AGENTS.md` §11). |
| R8 | `:722`, `:780` | Linha aprovada que muda volta para "Em revisão"; a reaprovação só pede a Lógica. |
| R9 | `:757-759` | Plano diferente → versão nova do grupo (`plan_version + 1`, `plan_hash`). |
| R10 | `:762-770` | Sobras de import (nome do Silo, rótulo colado) são listadas; excluir é decisão à parte (só não publicada e nunca enviada). |
| R11 | `lib/minerador/declared-plan-withdraw-core.ts:34-41`, `:179-188`, `:258` | "Tirar do plano": um artigo por vez; **recusa o Pilar** (`PILLAR_CANNOT_LEAVE`: "trocar o Pilar é reimportar o plano") e o último artigo; não muda `group_id`; não mexe em ArticleDNA/SiloDNA/SiloPage; não reescreve os outros Assuntos. |
| R12 | `lib/minerador/subject-recovery.ts:1-30` | Recuperar o Assunto perdido pelo histórico preenche a linha do card "Silo existente" (as 7 do azul). |

**O que impede "recadastrar tudo substituindo":** R3 (acréscimo puro), R5 (o
Assunto não muda de keyword sem duas operações), R11 (o Pilar nunca sai e a
retirada é uma por vez) e R2 (a tela não tem como dizer "o plano agora é só
isto"). R4, R6 e R7 continuam certos e ficam.

**Na WifiConecta, hoje (pelos dados do §4):** o azul tem plano v1 mas nenhum
artigo gravado (as 7 perderam o Assunto), então "Silo existente → Azul" já
acrescenta as 7 de novo (volta aprovada a "Em revisão"); o laranja não tem plano
(v0), então "Silo novo → Laranja" é aceito — porém cada título igual a uma das 8
linhas-título do formato anterior é **adotado como Assunto anterior** e continua
na linha dele (`declared-plan-import-core.ts:638-643`), a menos que a linha venha
com a conversão. O recadastro "limpo" do laranja exige a conversão por linha
(que já existe) ou o modo Substituir com a lista do item 5 da §5.2.

### 5.2 Proposta

**Modo do destino "Silo existente": Acrescentar (padrão, o de hoje) · Substituir o plano.**
Mesmo núcleo (`importDeclaredPlanWithCore`), parâmetro aditivo `mode: "append" | "replace"`
(ausente = `append`, contrato atual intacto). Pelo MCP, `declare_silo_plan` ganha
o mesmo campo; aplicar exige `platform.decide`, prévia com `decisionHash` e aceite
no chat (`AGENTS.md` §17.1).

Na substituição, a prévia classifica cada artigo do plano gravado e cada linha do
cadastro em **quatro listas**:

| Lista | Regra | O que acontece ao aplicar |
|---|---|---|
| **Fica igual** | casou (keyword; ou Assunto anterior; ou principal anterior — a mesma ordem de casamento de `:623-626`) e nada muda | nada é regravado; não volta a "Em revisão" |
| **Muda** | casou e muda ordem, papel, trava, detalhes ou título | gravado na versão nova; aprovada volta a "Em revisão" (R8) |
| **Entra** | linha nova | gravada como hoje (Assunto dentro da keyword, `entry.source = "cadastro"`) |
| **Sai** | artigo gravado que não casou com nenhuma linha | **retirado do plano pelo núcleo de "Tirar do plano"**, com o marcador `keyword_subject_release.via = "tirar_do_plano"` (o gatilho em curso aceita) |

Regras novas, só no modo `replace`:

1. **O Pilar pode sair** quando o plano novo traz um Pilar (o plano mesclado
   continua com exatamente um). A recusa `PILLAR_CANNOT_LEAVE` continua valendo
   para a retirada avulsa.
2. **O Assunto pode mudar de keyword** (relaxa R5): se o título T morava em A e
   a linha nova põe T em B, A entra em "Sai" (liberada com o marcador) e B em
   "Entra"; a prévia diz "o Assunto T passa de A para B". O histórico
   append-only de A guarda o que saiu.
3. **R4, R6 e R7 continuam recusando por linha**, com o caminho: Silo novo numa
   cor com outro Silo → use Substituir; keyword no plano de outra cor → "Tirar do
   plano" naquela cor (ou cadastre nela); keyword publicada → destino "Artigo
   publicado".
4. **O Silo do plano** (nome e objetivo) pode mudar na substituição; o **slug**
   só muda se o Silo do grupo (`editorial_groups.silo_id`) não estiver confirmado
   no Arquiteto — confirmado, a prévia recusa a troca do slug com o motivo (é do
   Arquiteto, e publicado nunca muda, §11).
5. **Linha-título do formato anterior** (laranja: 8) que não está no plano novo:
   aparece na lista "Assunto do formato anterior fora do plano novo" com duas
   ações opcionais, nunca marcadas: "Converter para a keyword X" (o núcleo da
   conversão de sempre, `conversions`) ou "Deixar como está". Nunca é excluída
   aqui (exclusão é o item 6).

**Uma decisão, duas versões** (o padrão D10 da SDD acelerar): um `decisionHash`
cobre as quatro listas; aplicar faz, nesta ordem e com releitura a cada passo,
(a) as retiradas ("Sai"), uma versão do plano (`v+1`), (b) o plano novo
(`v+2`). Reaplicar depois de falha no meio é seguro: o grupo com o hash do
plano restante não muda de novo, e cada retirada já feita é "sem mudança".
`importRequestId` por prévia, como hoje.

**O que acontece fora do Minerador (nada some, decisão humana):**

| Onde | Efeito | Por quê |
|---|---|---|
| Minerador | keyword que saiu do plano continua viva, no mesmo grupo (`group_id` não muda — R11), com o Assunto liberado e o histórico | `AGENTS.md` §10: nenhuma keyword desaparece |
| Arquiteto | o pacote aprovado muda → "Atualização disponível"; artigo cujo Assunto saiu do plano recebe o selo "Fora do plano" (`lib/arquiteto/declared-plan-seals.ts:86`); keyword continua em ArticleDNA ou "Não agrupadas". Reposicionar é "Aplicar o plano ao Silo" com a retirada na prévia (item 10 da SDD acelerar) | o Arquiteto só obedece ao pacote aprovado |
| Radar | item já no Radar segue na versão transportada; versão nova do ArticleDNA só entra pela adoção com clique (item 14 da SDD acelerar) | decisão humana |
| Redator | documento fica na versão dele (`content_documents.article_dna_version_id`) | entregável intocado |
| Publicações / publicado | URL, slug, canonical e principal protegidos; R7 recusa | `AGENTS.md` §11 |

**"Mesmo trato que qualquer uma":** nada nesta substituição cria linha especial;
a keyword que carrega o Assunto continua passando por Lógica, KGR, Volume, SERP,
aprovação e envio como qualquer keyword (C7 da SDD do cadastro). A única exceção
continua a D2-bis (aprova só com a Lógica para chegar ao Arquiteto).

### 5.3 Consumidores, compatibilidade, rollback, testes

- **Consumidores:** card (`subject-cadastro-card.tsx`), rota `POST …/plans/import`,
  MCP `declare_silo_plan`, catálogo (`lib/agent/platform-catalog.ts`: operação
  "Cadastrar Assuntos", playbook `artigo_sobre_tema`), Arquiteto (leitores do
  plano: `readArchitectSubjectStanding` em `lib/arquiteto/declared-subject.ts:247`,
  selos, "Aplicar o plano ao Silo") — só leem o plano como hoje.
- **Compatibilidade:** `mode` ausente = `append`. Nenhum campo novo no jsonb além
  do marcador de liberação, que já existe (`KEYWORD_SUBJECT_RELEASE_KEY`,
  `keyword-subject.ts:45`).
- **Migration:** nenhuma.
- **Rollback:** código anterior; o plano gravado pela substituição é um plano
  comum (leitores antigos o leem).
- **Testes (fixtures):** `tests/minerador-recadastro-substitui-2026-10-13.test.mts` —
  quatro listas; Pilar trocado; Assunto que muda de keyword (A liberada com
  marcador, B com `entry`); R4/R6/R7 recusando por linha; slug confirmado
  recusado; linha-título fora do plano não excluída; idempotência no meio
  (falha depois das retiradas e reaplicação); `mode` ausente = corpo idêntico ao
  de hoje; isolamento por marca. Mais `test:agent` (MCP), Minerador por glob,
  `test:arquiteto` (selos "Fora do plano"), E0.
- **Riscos:** substituir por engano um plano grande → a prévia mostra "Sai: N" em
  destaque e a confirmação pede o nome da cor; tudo é retomável e nada é
  excluído. Retirada parcial por falha → idempotência acima.

## 6. Item 2 — O Arquiteto só lê keyword (dono: Arquiteto)

### 6.1 Contrato atual — toda escrita que parte do Arquiteto em dados do Minerador

A tela do Arquiteto não escreve direto na Supabase em tabela do Minerador (o
único `.from("minerador_keywords")` de `modules/arquiteto` é leitura,
`arquiteto-workspace.tsx:12182`). As escritas acontecem no servidor, chamando
núcleos do Minerador por dentro de uma ação do Arquiteto:

| # | Gatilho no Arquiteto | Escrita (arquivo:linha) | O que muda no Minerador | Decisão humana hoje |
|---|---|---|---|---|
| W1 | Melhoria, "Confirmar e aplicar" (`modules/arquiteto/article-improvement-panel.tsx:263`; rota `app/api/arquiteto/article-improvement/route.ts`; MCP `improve_articles`, `lib/server/platform-mcp-tools.ts:1399-1412`) | `lib/server/arquiteto-article-improvement.ts:1039-1042` → `measureKeywordVolume` (`lib/server/minerador-volume-measure.ts:95-112`) | `minerador_keyword_metric_measurements` (insert); `volume_search`, `kgr_score`, `volume_source`, `analise_semantica.volume_measurement/volume_eligibility` | o aceite genérico; a confirmação não cita a medição |
| W2 | idem | `arquiteto-article-improvement.ts:1082-1087` → `runKeywordLogicWithCore` (`lib/server/minerador-keyword-decision-core.ts:123-155`) | `intent` e `analise_semantica` (intenção, nicho, funil) das keywords sem intenção | não citada na confirmação |
| W3 | idem, keywords novas — o painel **sempre** manda `approveNewKeywords: true` (`article-improvement-panel.tsx:99`); o servidor só confere a flag (`arquiteto-article-improvement.ts:685`) | `:1096` import (`lib/minerador/subject-discovery-import.ts:642-655` insert, `:592-600` update de existente); `:1103` Lógica; `:1105` métricas Google Ads; `:1106-1108` **aprovação**; `:1110` envio ao Arquiteto | insert `bruto` → `intent`, volume, `status = 'aprovado'` + `analise_semantica.aprovacao`; **`group_id`** (`stampSubjectGroup`, `subject-discovery-import.ts:724-746`) + `editorial_group_events`; itens `keyword/architect` | flag fixa no painel; no MCP, `userConfirmation` |
| W4 | Reforçar publicados, aplicar (`modules/arquiteto/published-reinforcement-panel.tsx:191`, `:200`; `app/api/arquiteto/published-reinforcement/route.ts:38-117`) | `lib/server/arquiteto-published-reinforcement.ts:550` import, `:566` Lógica, `:569` volume, `:577` aprovação, `:581` envio | os mesmos campos de W3 (sem `group_id`) | caixa "aprovo" explícita + `decisionHash` (`:515`, `:521`) |
| W5 | Diferenciação de publicados, "Enviar ao Minerador" (`modules/arquiteto/published-differentiation-panel.tsx:139`) | rota do Minerador `app/api/minerador/marcas/[brandId]/subject-discovery/import/route.ts:47-66` (`importSubjectDiscoveryWithCore` + recibo + Lógica) | insert `bruto` ou update de `analise_semantica`; volume do recibo; Lógica. Não aprova | só o clique |
| W6 | "Importar do Minerador" (frente em curso; `arquiteto-workspace.tsx:17919` → `modules/arquiteto/minerador-import-dialog.tsx:200`, `:445` → `app/api/arquiteto/import/route.ts:47-58`) | `lib/server/arquiteto-minerador-import.ts:154-160` → `lib/minerador/approve-and-send-core.ts:154-193` → `lib/server/minerador-approve-and-send.ts:61`, `:66` | `status = 'aprovado'` + `aprovacao`; itens `keyword/architect`; Silo do plano. **Com o cliente operacional (service role)** depois de conferir `minerador:approve` (`arquiteto-minerador-import.ts:85-87`) | prévia + `decisionHash` |
| W7 | "Excluir KeywordDNAs dos artigos" (`arquiteto-workspace.tsx:20821`, prévia `:8032-8053`, diálogos `:20913`/`:20918`) | rota do Minerador `app/api/minerador/marcas/[brandId]/keywords/delete/route.ts:47` → RPC `lifecycle_delete_minerador_keywords` (`supabase/migrations/20260921100000_exclusao_publicada_exige_declaracao.sql:43-143`) | **DELETE definitivo** da não publicada, das medições e dos itens de workflow sem evento. Defeito: o Arquiteto não manda `allowRecoverable`, então lote com publicada é recusado inteiro, mas a tela fala em "24 horas" (`:8083-8086`) | diálogo |
| W8 | Rota legada `POST app/api/arquiteto/silos/route.ts:32` (sem chamador na tela; `createCanonicalManualSilo` em `lib/arquiteto/canonical-workspace.ts:325`) | `silos/route.ts:56-60`, `:83-88` | **insert em `minerador_keyword_lists`** e `marcas.silos_existentes`, direto | nenhuma |
| W9 | "Tirar do plano" na barra de grupos global (componente compartilhado, visível no Arquiteto: `components/global-topbar.tsx:239,276` → `group-manage-dialogs.tsx:257,288` → `app/api/minerador/marcas/[brandId]/plans/withdraw/route.ts:80-90`) | `declared-plan-withdraw-core.ts:153` + reaprovar/enviar | Assunto/plano; `status`/`aprovacao` | prévia + confirmar |

Não escrevem no Minerador a partir do Arquiteto (conferido): a trava (só a tela do
Minerador e o MCP `set_keyword_vinculo`); `update_article_subject` e a conversão
(só ArticleDNA); mover artigo de grupo (grava `editorial_group_articles`, não
`minerador_keywords.group_id`); `apply_declared_plan_to_silo` (SiloDNA/SiloPage e
`editorial_groups.silo_id`); a Pesquisa por Assunto (no Arquiteto é um link que
abre a tela do Minerador, `modules/arquiteto/serp-subject-panels.tsx:151`, `:772`
— **é o modelo certo**).

### 6.2 Proposta — a fronteira

**Regra:** nenhuma ação do Arquiteto (tela, rota `app/api/arquiteto/**`, núcleo
`lib/server/arquiteto-*`, ferramenta MCP do Arquiteto) escreve em
`minerador_keywords`, `minerador_keyword_lists` ou
`minerador_keyword_metric_measurements`, nem chama núcleo do Minerador que
escreve. O Arquiteto grava só ArticleDNA, SiloDNA/SiloPage, InternalLinkGraph,
posições (`articleFormationDecision`, `territoryAssignment` no item
`keyword/architect`), `editorial_group_articles`, cópia de trabalho, pareceres e
o cache de SERP.

**Escolha: (A) sugestão enviada ao Minerador, decidida lá.** Rejeitada: (B)
"o Arquiteto chama o núcleo do Minerador quando o dono pede explicitamente".

Por quê (A):
1. É a frase do dono ("não pode mexer em nenhuma keyword que o minerador
   mandou, ele só tem que ler e reacomodar") e o `AGENTS.md` §6 (Minerador é
   dono da ingestão e da qualificação) e §2 (cada módulo acrescenta só o que é
   da sua fronteira).
2. Lógica, volume e aprovação mudam o KeywordDNA e o pacote aprovado: uma
   escrita "pelo Arquiteto" muda o insumo de outros artigos e de outros
   consumidores sem passar pela tela onde o dono vê a keyword.
3. Hoje (B) já existe e é exatamente o que o dono reclamou: W3 faz seis
   escritas no Minerador num clique, com a flag fixada pelo painel.
4. O custo de (A) é um passo — e esse passo já existe pronto: "Aprovar e enviar
   ao Arquiteto" (item 2 da SDD acelerar) e a Pesquisa por Assunto com recibo.

**Como fica cada escrita:**

| # | Passa a ser |
|---|---|
| W1 medição | O Arquiteto **lê** o volume do DNA (inclusive "Google Ads sem média", item 3). Falta volume → a linha diz "sem volume medido" e o botão **"Medir no Minerador (N)"** abre o Minerador filtrado nessas keywords, onde "Volume" mostra o custo antes. O prepare deixa de medir (hoje mede, `:577`, e nem grava; o apply mede de novo, `:1042`). |
| W2 Lógica | Keyword sem intenção no Arquiteto é recusada na gravação com "rode a Lógica no Minerador" e o link (keyword aprovada chega com Lógica; o caso real eram as brutas de W3, que deixam de existir). |
| W3 keywords novas | A proposta que precisa de keyword nova fica **"Precisa do Minerador"**. As ideias ficam na execução da melhoria (`editorial_workflow_items`, `article_improvement_run`, campo `keywords` com `external`, já gravado). O Minerador ganha a caixa **"Sugestões do Arquiteto · cor X (N)"**, que lê essas execuções em projeção leve (texto, volume do recibo/ideia, artigo de destino, motivo) e importa pelo **núcleo de import do Minerador**, com a cor, pelo clique do dono; depois "Aprovar e enviar". O Arquiteto relê ("Atualização disponível") e a melhoria reaproveita a execução pelo `inputsHash` (`arquiteto-article-improvement.ts:552-576`). `approveNewKeywords` passa a ser recusado com o caminho. |
| W4 Reforçar publicados | Igual a W3: as keywords novas viram sugestões; o reforço grava só o que usa keywords já recebidas. |
| W5 Diferenciação | O botão vira "Mandar como sugestão ao Minerador" (mesma caixa); o import acontece lá. |
| W6 Importar do Minerador | O modal mostra o estado (enviar · precisa aprovar · já no Arquiteto · fora). **"Enviar" fica** (é só o handoff, que é do Arquiteto receber). "Aprovar e enviar" vira **"Aprovar no Minerador (N)"**, que abre o diálogo "Aprovar e enviar" do Minerador já filtrado. Ver D2. |
| W7 Excluir KeywordDNAs | Sai do Arquiteto. No lugar: **"Tirar do artigo"** (a keyword vai para "Não agrupadas", gravando só o ArticleDNA, nova versão) e o link "Excluir no Minerador". Exclusão é do item 6 / do Minerador. |
| W8 Rota legada de Silo | Removida (sem chamador). Silo é SiloDNA, não lista do Minerador. |
| W9 "Tirar do plano" global | Fica: é ação do Minerador num componente compartilhado, com o nome da área no diálogo ("Minerador · Tirar do plano"). A cadeia do item 15 da SDD acelerar continua; a parte do Arquiteto (retirar do Silo) continua sendo só dele. |

**MCP:** `improve_articles` perde os passos do Minerador (o `apply` grava só o
ArticleDNA; proposta com keyword nova devolve `needsMinerador` com as ideias e as
ferramentas do Minerador a usar: `import_subject_keywords`, `measure_keywords`,
`decide_keywords`, `send_keywords_to_arquiteto`). Catálogo atualizado na mesma
entrega (`AGENTS.md` §17.1; `npm run test:agent`). Achado fora do escopo, para o
backlog do Minerador: `run_keyword_logic` e `import_subject_keywords` escrevem sem
`userConfirmation`.

### 6.3 Consumidores, compatibilidade, testes, riscos

- **Consumidores:** painel da melhoria, Reforçar e Diferenciar publicados, modal
  de import, MCP `improve_articles`, catálogo (playbooks `article_improvement`,
  `artigo_sobre_tema`), Minerador (caixa nova, só leitura de execuções).
- **Compatibilidade:** execuções de melhoria já gravadas continuam legíveis;
  uma execução `prepared` com keyword externa aceita antes do deploy é recusada
  na gravação com o caminho (nada parcial é escrito).
- **Migration:** nenhuma (a caixa lê `editorial_workflow_items`).
- **Testes:** `tests/arquiteto-so-le-keyword-2026-10-13.test.mts` — estrutural:
  nenhum arquivo `app/api/arquiteto/**`, `lib/server/arquiteto-*` ou
  `modules/arquiteto/**` importa `measureKeywordVolume`,
  `runKeywordLogicWithCore`, `importSubjectDiscoveryWithCore`,
  `applyKeywordDecisionEntries`, `handleGoogleAdsKeywordMetrics` nem faz
  `.update/.insert/.upsert/.delete` em tabela `minerador_*` (comentários
  removidos antes de casar); funcional com portas falsas: `apply` com proposta
  só de keywords recebidas grava o ArticleDNA e **zero** chamadas às portas do
  Minerador; proposta com keyword nova devolve "Precisa do Minerador"; a caixa do
  Minerador lista as sugestões por cor e importa pelo núcleo dele. Mais
  `test:arquiteto`, `test:arquiteto:servidor`, `test:agent`, Minerador por glob, E0.
- **Riscos:** (a) mais um passo para o dono — mitigado pelo link direto e pela
  caixa por cor; (b) a melhoria de um Assunto sem sustentações recebidas fica
  sem gravar até o Minerador decidir — é a regra pedida; (c) a frente do modal de
  import muda de "aprovar aqui" para "aprovar lá" (D2).

## 7. Item 3 — Olhar o DNA antes de buscar (dono: Arquiteto; a mesma regra vale no Minerador)

### 7.1 Contrato atual — o que cada operação lê antes de pagar

| Operação | Gatilho | Lê antes | Chamada externa e aviso |
|---|---|---|---|
| Processar arquitetura | `architecture-panel.tsx:263` → `processArchitecture` (`arquiteto-workspace.tsx:16401`) | proposta, territórios, intenção do DNA (`:16421`, `:16440`, `:16541-16547`) | **nenhuma** (`:16407-16420`) |
| Processar artigos · allintitle | `arquiteto-workspace.tsx:14450`, `:3365`, `:3370` | só "Aplicar KGR: Sim" e principal com volume (`:14510-14518`, `:3337`); a rota reaproveita `results_allintitle` de até 30 dias (`app/api/arquiteto/article-allintitle/route.ts:92-116`) | plano grátis, diálogo único; DataForSEO `:161` |
| Processar artigos · SERP do lote | `:14532` → `collectArticleBatchSerp` (`:10628`) | só keywords com volume **no navegador** (`lib/arquiteto/article-batch-serp.ts:85`); cache primeiro (`app/api/arquiteto/keyword-serp/route.ts:166`) | plano `:204-206`, confirmação `:10654`, coleta `:278` |
| Parecer SERP da formação | `confirmSerpValidation` (`arquiteto-workspace.tsx:3976`) → `/api/arquiteto/serp` | guarda de retrabalho (`lib/server/arquiteto-serp-http.ts:360`), cache das 4 lentes (`:460-462`), targeting, principal declarada (`:509-537`); **volume e KeywordDNA vêm do pedido do navegador** (`:407-408`, `:1035-1048`) | plano `:599-637`, opção grátis `cacheOnly` (`:638`), coleta `:788` |
| Melhoria · "Buscar keywords" (prepare) | `article-improvement-panel.tsx:249` (diz "grátis", sem confirmação), `:250`; MCP `:1399` | DNA (`arquiteto-article-improvement.ts:121-125`), Assunto/plano/trava (`:181-215`), lista da Pesquisa por Assunto (`:249-262`), execução anterior com o mesmo `inputsHash` em 24 h (`:552-576`), cache SERP (`:266-286`) | **Google Ads** `measureOldVolumes` (`:423-448`, chamada `:577`) e **IA** `readEditorialAi` (`:376-410`, chamada `:583`), **sem aviso na tela** |
| Melhoria · "Buscar keywords novas" | `:253`, `:261` (frase de custo) | pula Assunto com lista do Minerador (`:592-600`) | Ideas `:469`, médias `:501` |
| Melhoria · validar / gravar | `:254`, `:263` | plano do cache (`:744`), `sourceHash` (`:641`) | SERP `:666` (teto US$ 1); gravar mede de novo (`:1042`, `:1105`) |
| Reforçar publicados (busca) | `use-published-reinforcement.ts:297`, `:331` | keywords da marca e pegadas SERP (`arquiteto-published-reinforcement-search.ts:133-197`) | Ideas `published-differentiation-run.ts:1089`, médias `:1177`, SERP `:1244`; prévia só com a faixa máxima |
| Diferenciar publicados | `use-published-differentiation.ts:155`, `:203` | pegadas do cache (`arquiteto-differentiation.ts:161`, `:283-290`) | IA `:299` |
| Validar SERP dos Silos | `arquiteto-workspace.tsx:17174` → `:9482` | cache (`territorial-serp/route.ts:241-255`) | plano `:9523`, coleta `:332` |
| Revisar Silos com IA | `:17193` → `:9693` | só dúvidas com SERP (`:9664-9685`) | IA `territorial-ai/route.ts:147`, **sem confirmação** |
| Revisar com IA (Artigos) | `:4486` | `keywordDnaSnapshot` (`lib/arquiteto/ai-strategic-payload.ts:84-101`) | `/api/revalidate-structure:135`, **sem confirmação** |

**Onde pula direto para a busca/IA sem ler o que já tem:**

1. O prepare da melhoria chama IA e Google Ads com o botão dizendo "grátis".
2. A IA da melhoria não recebe o KeywordDNA (`lib/arquiteto/article-improvement-ai.ts:144-159`: só tema, nota, slug, principal, keywords, volume e vagas), embora os sinais estejam carregados.
3. O volume é medido de novo três vezes: o prepare só considera medido com `volume_source = google_ads` e volume > 0 (`:240-241`, `:427`), ignora `volume_eligibility.lastEmptyResponse` ("o Google Ads não tem média", `lib/minerador/google-ads-volume.ts:139-160`) e `minerador_keyword_metric_measurements`; não grava; o apply mede de novo (`:1042`); a keyword nova é medida em `:501` e de novo em `:1105`.
4. A busca nova no Google Ads só compara com o workspace do Arquiteto (`:455`); a ideia que já existe no Minerador com volume vira "externa" e é medida de novo; `brand.existingByNormalized` foi lido (`:163`) e não é usado.
5. Reforço e diferenciação medem de novo candidatas que já existem com volume (`arquiteto-differentiation-store.ts:95-114` guarda só o id).
6. `measure_keywords` mede todos os ids, sem olhar idade nem "sem média" (`minerador-volume-measure.ts:95-112`).
7. As rotas `/api/arquiteto/serp` e `keyword-serp` confiam no volume e no DNA mandados pelo navegador.
8. A SERP territorial paga consulta de texto de território e cabeceira sem conferir volume (`territorial-serp/route.ts:187-198`).
9. "Revisar Silos com IA" chama de novo, sem aviso e sem KeywordDNA no prompt (`:9721-9723`).
10. "Revisar com IA" não reaproveita (sem guarda de mesmos insumos) e não avisa custo.
11. A IA da diferenciação recebe DNA parcial (`published-differentiation.ts:562-575`).
12. A Pesquisa por Assunto não olha pesquisas anteriores do mesmo Assunto; "já existe" só depois da chamada (`subject-discovery-search.ts:693` → `:723`).
13. As rotas `article-dna`, `silo-dna`, `silo-page`, `silo-review` (sem botão hoje) chamam a IA sempre como versão 1, sem ler o DNA existente.

Já certo e mantido: SERP com cache primeiro, plano antes de pagar e `cacheOnly`;
allintitle de até 30 dias; Processar arquitetura sem provider; reaproveitamento
por `inputsHash`; busca nova só sob pedido; teto de US$ 1.

### 7.2 Proposta — ordem obrigatória "ler → decidir → custo → buscar"

Um leitor único no servidor, `readKnownBeforeSearch` (`lib/server/known-before-search.ts`,
domínio puro em `lib/editorial/known-before-search.ts`), usado por **toda**
entrada paga ou de IA do Arquiteto (e por Medir volume e Pesquisa por Assunto do
Minerador). Ele lê do banco, por id e em projeção estreita (nunca do pedido do
navegador):

- **por keyword:** volume validado (valor, `measuredAt`, provider), resposta
  vazia recente do Google Ads (`volume_eligibility.lastEmptyResponse`), allintitle
  (valor, data), as 4 lentes da SERP em cache (presentes/idade), intenção,
  entidade, funil, público, problema (KeywordDNA), Assunto/plano/trava, lista da
  Pesquisa por Assunto e recibos;
- **por artigo/Silo:** parecer SERP vigente (`formationBaseHash`), proposta de IA
  já gravada com os mesmos insumos, execução anterior com o mesmo `inputsHash`.

E devolve `{ known, missing, plan: { calls, costUsd: {min,max}, ai: {calls, costUsd} } }`.

Regras (testáveis):

1. **Nenhuma chamada a provider sem `readKnownBeforeSearch` no mesmo pedido**, e
   só para o que está em `missing`.
2. **Conhecido não se busca de novo:** volume medido (qualquer idade) não é
   remedido sem "Medir de novo" explícito; "sem média" há menos de 30 dias conta
   como medido; allintitle até 30 dias; SERP pela regra de cache vigente;
   proposta de IA com os mesmos insumos é reaproveitada.
3. **Custo antes, sempre, inclusive de IA:** o botão diz o que já temos, o que
   falta e o custo (Google Ads, DataForSEO, IA). "Grátis" só quando `plan` é
   zero. Vale para o prepare da melhoria, Revisar Silos com IA e Revisar com IA.
4. **A IA recebe o resumo do DNA** (intenção, entidade, funil, público,
   problema, volume, Assunto e trava) de cada keyword que ela vai ler.
5. **Busca nova deduplica contra a marca inteira** (Minerador): ideia que já
   existe vira "já temos" com o volume dela; só a nova é medida.
6. **O servidor decide volume e DNA**, nunca o pedido (fecha a lacuna 7).
7. **SERP territorial:** consultas de texto de território aparecem no plano como
   "consulta sem volume medido" e só são pagas marcadas uma a uma.
8. **Pesquisa por Assunto (Minerador):** a prévia mostra as pesquisas anteriores
   do mesmo Assunto (recibos) e oferece "usar o resultado anterior" antes de
   pagar de novo.

**Consumidores:** todas as entradas da tabela 7.1, MCP (`improve_articles`,
`measure_keywords`, `search_subject_keywords` devolvem o `known/missing/plan` na
prévia), catálogo. **Migration:** nenhuma. **Testes:**
`tests/ler-antes-de-buscar-2026-10-13.test.mts` — para cada entrada, com portas
falsas que contam chamadas: DNA completo → **zero** chamadas; um faltante → uma
chamada só para ele; prévia sempre antes; IA recebe o resumo do DNA; ideia
existente não é remedida; pedido do navegador com volume falso não muda o plano.
**Riscos:** volume antigo considerado "conhecido" quando o dono quer atualizar →
"Medir de novo" explícito, com a data da medição na linha.

## 8. Item 4 — Listas leves (dono: compartilhado/editorial; aplica as regras R5, R7, R8, R9, R11 da SDD egress)

### 8.1 Medido no banco (bytes de fio, `length(x::text)`, 2026-10-13)

| O que | AdalbaPro | WifiConecta | Care Glow | Somatec |
|---|---|---|---|---|
| `minerador_keywords_listagem` (o que o Processador baixa hoje, `select("*")`) | **2.015.724 B** / 183 linhas | 443.518 / 64 | 385.332 / 37 | 180.641 / 42 |
| Projeção leve das colunas visíveis + Assunto/ordem/papel/trava (id, keyword, status, volume, KGR, intenção, grupo, lista, título, ordem, papel, trava) | **46.695 B** | 18.532 | 9.215 | 10.548 |
| `analise_semantica` das vivas (total) | 2.116.480 | 425.969 | 420.975 | 178.202 |
| ArticleDNA, **todas** as versões (o que a mesa e o Arquiteto leem do banco) | **7.218.845** / 102 versões, 26 artigos | 1.095.125 / 20, 9 | 174.546 / 5, 5 | — |
| ArticleDNA, só a vigente por artigo | 2.130.214 | 549.307 | 174.546 | — |
| ArticleDNA vigente em projeção leve (id, Silo, slug, Assunto, status, principal, ids/papéis das keywords) | **12.750** | 4.630 | 1.731 | — |
| Pareceres de SERP da formação (`article_formation_serp_assessment`, todos devolvidos por `GET /api/arquiteto/workspace`) | **9.851.971** / 200 | 3.081.037 / 61 | 192.676 / 5 | — |
| Itens `keyword/architect` (payload com `approvedDna`) | 2.323.452 / 183 | 463.684 / 58 | 229.594 / 29 | — |
| Execuções da melhoria (`article_improvement_run`) | 9.810.657 / 27 (máx. 549 kB) | 1.314.294 / 11 | — | — |
| Itens do Radar (`subject_type = article`, `stage = radar`, payload) | 4.611.215 / 9 | 0 | 1.644.743 / 3 | — |
| `radar_analysis_runs` (lidos por item ao abrir) | 87.398.635 / 54 (máx. 4,5 MB) | — | 9.246.960 / 31 | — |
| `content_documents.payload` | 8.229.955 / 2 | — | 4.520.399 / 2 | — |

Dentro do ArticleDNA vigente, `keywordReferences` é **2,35 MB de 2,85 MB** (cópias
de KeywordDNA dentro do artigo). No `analise_semantica`, os maiores blocos são
`logical_output_contract` (573 kB), `discovery_import` (431 kB),
`volume_measurement` (390 kB), `dataforseo_keyword_overview` (215 kB),
`allintitle_measurement` (175 kB).

### 8.2 O que cada tela carrega hoje (contrato atual)

| Tela | Leitura | Problema |
|---|---|---|
| Mesa `GET /api/editorial/workspace` (`app/api/editorial/workspace/route.ts:46`; 8 seções `:86-95`) — consumida por Arquiteto, Radar, Redator, Publicações, painéis de DNA (`components/editorial-pipeline-context.tsx:561`) | Radar: payload inteiro da tabela, poda depois do download (`lib/server/editorial-repositories.ts:223-227`, `:274-285`); ArticleDNA/SiloDNA: **todas as versões** (`:112`); SERP: todos os snapshots e revisões (`:669`, `:735`); `views` e `invitations` | `detail=light` (`route.ts:114-133`) só poda **no Node depois de ler tudo do banco** — não reduz o egress da Supabase. Fora do Radar o cliente pede a leitura inteira e descarta o histórico (`latestVersionByKey`, `editorial-pipeline-context.tsx:162-170`, `:594-595`). `views` é lida e ignorada; `invitations` só serve à Marca. `GET …/workspace/versions` não tem consumidor. A mesa inteira é copiada para o `localStorage` a cada 900 ms (`:798-836`). |
| `/api/inteligencia` (vem junto com a mesa, `:686`) | `minerador_keywords` com `analise_semantica` de todas as keywords da marca (`app/api/inteligencia/route.ts:14-31`) | os consumidores usam id, keyword, `lista_id`, status (`lib/radar/hydration.ts:94-104`) |
| Minerador › Processador (`modules/minerador/minerador-workspace.tsx:1681-1857`, Supabase direto do navegador) | `select("*")` da view (`:1742-1747`, `analise_semantica` quase inteiro); `select("*")` de listas (`:1719`); readbacks por id com `select("*")` da tabela, com séries (`:710-737`) | filtros, ordenação, duplicados, rascunhos e **CSV com todas as chaves** rodam no cliente sobre o objeto inteiro (`:614-629`, `:2215+`, `:2319-2327`); o painel do DNA abre sem fetch (`:4781`) |
| Minerador › Descobrir (`discovery-keywords-page.tsx:189` → `google-ads/descobrir-keywords/route.ts:153-200`) | `select("*")` por `discovery_run_id` (~126 linhas por vez) | já recortado pela execução; fica |
| Arquiteto (`lib/arquiteto/canonical-workspace.ts:284-313` → `lib/server/arquiteto-workspace-http.ts:134-158`) | itens `keyword/architect` com payload inteiro; linha inteira com `analise_semantica` das recebidas (`lib/server/arquiteto-workspace.ts:175-183`); **todas** as versões de artefatos (`select("*")`, `lib/server/pipeline-repositories.ts:86-128`); **todos** os pareceres de SERP da formação (`arquiteto-workspace-http.ts:151`) | ~42 pontos relêem o workspace inteiro (`setCanonicalWorkspaceReload`) e ~21 readbacks diretos, muitas vezes os dois na mesma ação — **duas leituras completas por ação**; a melhoria relê **todos** os pareceres para achar um (`lib/server/arquiteto-article-improvement.ts:1126`) |
| Modal Importar do Minerador (frente em curso) | `id,keyword,status,group_id` (`lib/server/arquiteto-minerador-import.ts:52-53`) | já é lista leve — modelo |
| Radar (`modules/radar/radar-page.tsx`) | mesa por cor + `detail=light`; **por item** `GET /api/editorial/radar-analysis` (`findByArticleRaw select("*")` + `radar_analysis_runs`) e `GET /api/editorial/serp`; tique de 3 s/10 s sem Realtime (`lib/radar/area-live-read.ts:100-101`) | a grade combina snapshot, análise, revisão e versão por linha (`:1303-1328`) |
| Redator | mesa inteira; detalhe do documento ao selecionar | lista mostra Assunto, título, cor, status |
| Publicações | mesa inteira + `briefings` de `/api/inteligencia` | lista mostra Assunto, título, unidade, slug, Silo, status, URL |

**ESTIMADO (soma das seções medidas), abrir o Arquiteto da AdalbaPro:** mesa
~11 MB + workspace do Arquiteto ~16 MB no navegador (~21 MB lidos do banco) +
`/api/inteligencia` ~2 MB ≈ **29 MB**, e cada ação relê o workspace duas vezes
(~30 MB). WifiConecta: ≈ **6 MB** na abertura, ~9 MB por ação.

### 8.3 Proposta

**Regra (R8 reforçada): a lista lê só as colunas visíveis, do banco.** Projeção no
banco (view ou seletores de caminho), não poda no Node. O detalhe é lido por id
ao abrir o painel, e só dele.

| Tela | Lista leve (colunas) | Detalhe sob demanda (ao abrir) |
|---|---|---|
| Minerador › Processador | id, keyword, status, Vínculo, Resultados, Volume, KGR, CPC, KD, Intenção, Nicho, Funil, grupo/cor, lista, **Assunto (título), ordem, papel, trava**, estado da aprovação (calculado no servidor) | `analise_semantica` inteiro da keyword aberta (uma linha, ~10 kB) |
| Arquiteto › Artigos novos / mesa | por artigo: id, Assunto, keyword principal, slug, Silo, papel, ordem, cor, nº de keywords, status/aprovação, veredito SERP (só o veredito e a data), "sent_radar"; por keyword pendente: a linha do Minerador acima | ArticleDNA vigente (e a última aprovada) do artigo aberto; o parecer SERP inteiro daquele artigo; histórico por `GET …/workspace/versions` |
| Arquiteto › Silos | unidade, origem, slug, estado, decisão, status | SiloDNA/SiloPage vigentes do Silo aberto |
| Radar | Assunto, título, keyword, cor, pesquisa, conteúdo, relatório, próxima ação, formato, status (colunas de `radar-page.tsx:1726-1800`), do último snapshot só o resumo | análise e SERP do artigo ativo (já é por id — fica) |
| Redator | Assunto, título, cor, status, "em edição" | documento ao selecionar (já é assim) |
| Publicações | Assunto, título, unidade, slug, Silo, responsável, status, URL, atualizado | documento/registro ao exportar (já é assim) |

Mudanças concretas:

1. **Mesa sem histórico e sem gavetas mortas.** `detail=light` vira o padrão de
   todas as telas e passa a ser feito **no banco** (vigente + última aprovada por
   entidade, por view `editorial_article_dna_lista_leve`/consulta por
   `DISTINCT ON`, e não por poda no Node). `views` sai da mesa (ninguém usa);
   `invitations` sai da mesa e fica só na Marca. SERP: só o último snapshot por
   artigo na lista. `/api/inteligencia` deixa de ler `analise_semantica`.
2. **Arquiteto:** o `GET /api/arquiteto/workspace` devolve os pareceres de SERP em
   projeção (`candidateRef`, `formationBaseHash`, `verdict`, `state`,
   `updated_at`) e o parecer inteiro por id; as keywords recebidas em projeção
   leve + os sinais do DNA que a tela usa (intenção, entidade, funil, território),
   com o DNA inteiro por id; os artefatos só vigentes. A melhoria lê o parecer
   por `candidateRef`, não a lista inteira.
3. **Releitura por id, não da mesa inteira.** Depois de uma ação, a tela relê só
   os ids afetados e troca essas linhas (os ~63 pontos de recarga do Arquiteto
   passam por um único `refreshRows(ids)`); some a leitura dupla
   readback + bump.
4. **Operações de marca inteira rodam no servidor sobre projeções:** Processar
   arquitetura (hoje no cliente sobre `masterList` com DNA), canibalização e
   colisão de slug, "mesmo assunto", Reforçar publicados, links entre Silos,
   detecção de duplicados (só o texto basta) e o **CSV do Minerador com todas as
   chaves** (rota de servidor em stream, por marca). A tela deixa de precisar do
   objeto inteiro.
5. **Estado da aprovação calculado no servidor.** Hoje a assinatura do pacote
   aprovado é conferida com o `analise_semantica` (`lib/minerador/listing-payload.ts:1-22`);
   a lista leve recebe `approvalState` pronto (válida · divergente · sem
   aprovação), calculado pelo MESMO leitor.
6. **Cache:** versão imutável por `version_id` no IndexedDB (R23, já existe para a
   Qualificação); detalhe de keyword (mutável) relido ao abrir enquanto a coluna
   `row_version` (migration `20260923140000`, escrita e **não aplicada**) não
   existir; com ela, cache conferido (R20–R22). A cópia local da lista passa a
   ser a lista leve, com chave nova `${actor}:${brand}:${groupId|"todos"}:leve`;
   a chave antiga **não é limpa** (`AGENTS.md` §10).
7. **Paridade obrigatória com os leitores do Minerador** (memória: "ler o
   Minerador pelo resolver dele"): a projeção leve alimenta os MESMOS resolvers
   (`resolveCanonicalKeywordSnapshot`, `readGoogleAdsCpcEvidence`,
   `readDataForSeoKeywordDifficultyEvidence`, `readSiteOrigin`,
   `resolveKeywordSubject`, `declaredPrincipalLock`); teste de paridade
   coluna a coluna, `resolver(linha inteira) === resolver(projeção)`, sobre
   fixtures e sobre o formato das linhas reais.

**Ganho estimado (bytes MEDIDOS das seções; soma ESTIMADA):**

| Abertura | Hoje | Depois | Consultas |
|---|---|---|---|
| Processador AdalbaPro | 2,0 MB | ~50–100 kB (o número final sai do teste de paridade, que decide quanto de `logical_output_contract` a projeção precisa) | 5 → 5 |
| Arquiteto AdalbaPro | ~29 MB (~30 MB por ação) | < 1 MB na abertura; < 50 kB por ação (releitura por id) | ~10 → ~6; ação: 2 leituras completas → 1 por id |
| Arquiteto WifiConecta | ~6 MB (~9 MB por ação) | < 300 kB; < 20 kB por ação | idem |
| Mesa (Radar/Redator/Publicações) AdalbaPro | ~11 MB | < 1 MB (itens do Radar em projeção; ArticleDNA vigente leve ~13 kB) | 8 seções → 6 |

### 8.4 Riscos (operações que hoje dependem do objeto inteiro na tela)

- Minerador: filtros e ordenação por CPC/KD/nicho/funil/origem do site/KGR,
  rascunhos de revisão sobre `analise_semantica`, duplicados, CSV com todas as
  chaves, painel do DNA sem fetch (`minerador-workspace.tsx:606-629`, `:2215+`,
  `:2319-2327`, `:4781`) → colunas derivadas no servidor, CSV no servidor,
  painel com fetch por id e indicador de carregamento.
- Arquiteto: sinais de DNA para Processar arquitetura e formação
  (`arquiteto-workspace.tsx:778-797`), canibalização (`:11169+`, `:14321`),
  "mesmo assunto" (`:5728`), filtros (`:7172-7196`), "sent_radar" pelos itens do
  Radar (`:4836`), painel expandido sem fetch, ponto de recuperação com
  `keywordDetail=full` (`:1723`, `:7311-7389`) → servidor, ou leitura inteira
  pedida explicitamente antes de habilitar a operação, com aviso (o mesmo
  contrato do item 6 da SDD acelerar).
- Radar: `calcularDadosDaLinha` (`radar-page.tsx:1303-1328`), a grade e o CSV da
  grade → as colunas vêm prontas na projeção; o CSV "Para escrever" **não** muda
  (entregável, lê por id).
- Escrita: **nenhum caminho de escrita lê a lista leve** (R10: escrita lê
  verbatim). Teste estrutural.
- CPU no banco: cada seletor `payload->…` descomprime o jsonb inteiro (achado do
  E1 da SDD egress: ~0,8 s por documento grande, `statement_timeout` 8 s). Para
  os pareceres (até 193 kB) e o ArticleDNA (até 120 kB) a view lê a vigente só;
  medir o tempo da consulta no ensaio e, se passar de 2 s, preferir coluna
  gerada (migration à parte).

## 9. Item 5 — Planilha primeiro no Arquiteto (dono: Arquiteto)

### 9.1 Contrato atual

| # | Onde | Hoje |
|---|---|---|
| P1 | `modules/arquiteto/arquiteto-workspace.tsx:19203-19231` | "Artigos novos" é uma faixa com dois botões ("Processar artigos", "Concluir formação") sobre os artigos selecionados na mesa. |
| P2 | `lib/arquiteto/article-pipeline.ts:16-27`, `:92-131`; `arquiteto-workspace.tsx:9404-9416` | A keyword que ainda não é artigo aparece como linha de pipeline com os estados `eligible`, `awaiting_silo_confirmation`, `awaiting_silo`, `reserved_silo_head` — **sem Assunto, ordem, papel, trava nem cor**. "A keyword só vira linha de artigo depois que a formação a agrupou." |
| P3 | `arquiteto-workspace.tsx:11081-11102` (`declaredPlanGroupsForArchitecture`, `gruposDoPlanoNaMesa`), `:19197-19200`; `modules/arquiteto/article-improvement-panel.tsx:250` | O plano vira **botões "Formar os artigos do plano · cor"** no painel de texto da melhoria; o resultado é uma tabela de propostas dentro do painel. |
| P4 | `article-improvement-panel.tsx:249-265` | O mesmo painel serve publicados e plano: "Buscar keywords" (prepare), "Validar no Google" (collect), "Confirmar e aplicar" (apply). |
| P5 | `lib/arquiteto/declared-subject.ts:247` (`readArchitectSubjectStanding`), `lib/minerador/declared-plan.ts` (`declaredPrincipalLock`) | Os dados da linha (título, ordem, papel, trava efetiva, grupo) já são lidos do pacote aprovado. |

### 9.2 Proposta

**Cada keyword recebida que carrega Assunto com plano = uma linha em "Artigos
novos"**, assim que chega (estado novo de pipeline `plan_article`, antes de
`eligible`; nada de ArticleDNA é criado por isso — continua "linha de pipeline
não é Article", `article-pipeline.ts:1-14`). Ordenadas por cor e ordem.

Colunas: seleção · cor · **ordem** · **papel** (Pilar/Suporte) · **Assunto
(título)** · **keyword** · **trava** (Travada · Livre, com a origem: volume,
manual, declarada) · volume (do DNA, com a data) · SERP (veredito em cache e
data, ou "sem SERP") · sustentações (nº da lista da Pesquisa por Assunto, com
volume) · estado (aguardando formação · formado vN · no Radar · Fora do plano).

Ações **na linha e no lote** (seleção ou "toda a cor"):

| Ação | Regra |
|---|---|
| **Validar SERP** | passa pelo leitor do item 3: o que está em cache não é pago; o diálogo mostra o custo do que falta antes; só keywords com volume (do banco, não da tela). |
| **Trocar principal** | só com trava **Livre**; candidatas = a própria keyword e as sustentações com volume da lista do Assunto, ordenadas por SERP/volume; prévia com o motivo; decisão humana; nova versão (D1-ter). Travada → o botão não aparece; o selo diz "Principal travada · mude a trava no Minerador". |
| **Concluir formação** | grava o ArticleDNA pelo núcleo da formação/melhoria já recortado por grupo (item 4 da SDD acelerar), **sem nenhuma escrita no Minerador** (item 2): só com keywords já recebidas; se faltar sustentação, a linha diz "Precisa do Minerador" e o link abre "Sugestões do Arquiteto". |
| **Abrir DNA** | lê o detalhe só daquela linha (item 4). |
| **Ver no Silo** | leva ao cartão do Silo do plano. |

**O que sai do painel de texto da melhoria:** os botões "Formar os artigos do
plano · cor" e o caminho do plano dentro do painel (P3). O painel
`ArticleImprovementPanel` fica **só para publicados** ("Melhorar publicados",
"Reforçar publicados"). "Processar artigos" continua para keywords sem plano.

**Consumidores:** `article-pipeline.ts` (estado novo, aditivo), mesa do
Arquiteto, painel da melhoria (perde o plano), MCP `improve_articles` (com
`group` continua aceito, mas o catálogo passa a mandar o plano para as ações de
linha: ferramentas `form_plan_articles` — prévia/aplicar com `decisionHash`,
`platform.decide` — e `validate_plan_serp`, prévia de custo; aprovação continua
humana), catálogo. **Migration:** nenhuma. **Rollback:** código anterior (os
botões de cor voltam). **Testes:** `tests/arquiteto-planilha-primeiro-2026-10-13.test.mts`
— keyword com plano vira linha `plan_article` com título/ordem/papel/trava/cor;
sem plano continua como hoje; "Trocar principal" só com livre; "Concluir
formação" sem porta do Minerador; lote por cor; DOM da linha (dark mode,
360/768/1024/1440 px — validação manual do dono). **Riscos:** duas portas
convivendo na transição → o catálogo e a tela apontam só para a linha; a
"Formar os artigos do plano" sai na mesma entrega.

## 10. Item 6 — Excluir tudo da cor X (dono: compartilhado; cada área pelo seu núcleo)

### 10.1 Contratos de exclusão que já existem (verificados)

| Área / objeto | Como sai hoje | Confirmação | Recusas | Onde |
|---|---|---|---|---|
| Minerador · keyword **não publicada** | **DELETE definitivo** (medições, origens, métricas de descoberta, itens de workflow sem evento de decisão; candidatas desligadas) | prévia de impacto + nome digitado (uma: o nome; várias: "N keywords selecionadas", `minerador-workspace.tsx:2358-2360`) | descendente `content_documents` → `LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER`; sem `minerador:manage`; com a migration `20261015120000` aplicada: Assunto com plano → `KEYWORD_DELETE_SUBJECT_PROTECTED` | RPC `lifecycle_delete_minerador_keywords` (`supabase/migrations/20260921100000_exclusao_publicada_exige_declaracao.sql:43-143`, DELETE em `:117-133`); rotas `…/keywords/delete/preview` e `…/keywords/delete` (**máx. 100 ids**, `route.ts:10`); lote tudo-ou-nada |
| Minerador · keyword **publicada** | lixeira de 24 h (`deleted_at`, `purge_after`), restaurável; purga só por endpoint sem cron | a mesma + `allowRecoverable` declarado e nome digitado | sem a declaração, o lote inteiro é recusado (`:85-87`, `:150-176`) | idem; `…/keywords/restore`, `…/keywords/purge` |
| Minerador · lista (`minerador_keyword_lists`) | **não há exclusão** (FK `lista_id` `ON DELETE RESTRICT`; `AGENTS.md` §14) | — | — | — |
| Minerador · sobras do cadastro | o mesmo DELETE, opt-in | a confirmação de sempre | publicada; já enviada ao Arquiteto | `lib/minerador/declared-plan-leftovers.ts:21-61` |
| Minerador · "Tirar do plano" | nada é apagado; plano v+1; marcador `tirar_do_plano` | prévia + `decisionHash` | `PILLAR_CANNOT_LEAVE`, `LAST_ARTICLE` | `declared-plan-withdraw-core.ts:258`, `:288-298` |
| Arquiteto · ArticleDNA/SiloDNA/SiloPage | **nunca** (versões append-only por gatilho, `0027:155-157`) | — | — | — |
| Arquiteto · "Retirar artigo do Silo" | evento `rejected` + par SiloDNA/SiloPage novo | prévia + motivo | `ARTICLE_IS_PILLAR`, `ARTICLE_PUBLISHED`, `ARTICLE_IN_DOWNSTREAM`, `SILO_NOT_APPROVED`, `STALE_SILO` (`lib/arquiteto/silo-article-withdrawal.ts:44-56`) | `lib/server/arquiteto-silo-article-withdrawal.ts` |
| Arquiteto · "Desfazer Silo sugerido" | território `rejected`; keywords "sem Silo" | diálogo | Silo consolidado, publicado, com ArticleDNA aprovado | rota `/api/arquiteto/workspace` |
| Arquiteto · etiqueta do artigo | DELETE em `editorial_group_articles` | mover/tirar do grupo | — | `lib/editorial/article-groups-store.ts:309-323` |
| Radar | **sem exclusão** ("Zerar" cria versão vazia, `lib/radar/radar-reset.ts`) | — | — | — |
| Redator · `content_documents` | **sem exclusão** (versões substituídas: purga por retenção, `lifecycle_purge_editorial_history`) | — | — | — |
| Publicações · `publication_records` | **sem exclusão** | — | — | — |
| Grupo (cor) | arquivar ("Liberar a cor"); **nunca DELETE** | PATCH com trava otimista | `GROUP_NOT_EMPTY` com keyword viva, **na lixeira**, artigo etiquetado, **plano declarado** ou **Silo ligado** (`lib/editorial/editorial-group-manage.ts:89-98`, `:118-125`) | `PATCH /api/editorial/groups` |

Reuso da cor: só um grupo ativo por cor (regra do código); usar a cor de novo
**reativa o grupo arquivado** com o mesmo id e histórico
(`ensureEditorialGroupForColor`, `lib/editorial/editorial-groups-store.ts:189-238`).

Regras: `AGENTS.md` §10 (keyword enviada não desaparece **por efeito colateral**),
§11 (publicado protegido), §14 (lista RESTRICT), §15 (exclusão só com autorização
explícita da operação), §17.1 (exclusão fora do MCP); invariante 20
(`docs/00-produto/invariantes.md:24`: não publicada = DELETE transacional com
impacto, nome digitado e releitura; publicada = lixeira de 24 h).

Estado do banco conferido por SELECT: `editorial_groups` existe (a M1 está
aplicada, embora o cabeçalho do arquivo diga o contrário); os gatilhos de
`minerador_keywords` hoje são 4 (`minerador_keywords_preserva_series`,
`…_trava_identidade_publicada`, `trg_protect_published_keyword`,
`trg_tenant_0005_validate_keyword_brand`) — **o gatilho do Assunto ainda não
está aplicado**. No código, `KEYWORD_SUBJECT_RELEASE_VIAS` já inclui
`excluir_cor` (`lib/minerador/keyword-subject.ts:54`) e `keywordSubjectBlocksDeletion`
(`:437-446`) espelha o gatilho, mas nenhuma prévia de exclusão a chama.

### 10.2 Proposta — "Excluir tudo da cor X"

Na barra de grupos ("Gerenciar a cor") e no Minerador: **"Excluir tudo da cor X…"**.
Nada novo é inventado de poder de exclusão: cada área faz só o que o contrato
dela já permite; o que não tem contrato **fica fora, com o motivo**.

1. **Escopo:** "Só no Minerador", "Só no Arquiteto" ou "Cadeia inteira".
2. **Prévia (servidor, grátis), por área:**

   | Área | Entra | Fica fora (motivo na linha) |
   |---|---|---|
   | Minerador | keywords vivas da cor não publicadas → **apagar de vez**; publicadas → só se o dono marcar "incluir publicadas na lixeira de 24 h" (declaração `allowRecoverable`, lista dos nomes) | com documento no Redator (`blocked`), publicada sem a marcação, fora da cor |
   | Arquiteto | artigos etiquetados na cor: "Retirar do Silo" (não Pilar, não publicado, sem downstream); Silo sugerido não consolidado: "Desfazer"; etiquetas `editorial_group_articles` | Pilar de Silo consolidado, publicado, com item no Radar/Redator/Publicações, Silo consolidado (não há contrato de exclusão de Silo consolidado) |
   | Radar · Redator · Publicações | nada (sem contrato de exclusão) | **todos os itens da cor são listados** com "sem exclusão nesta área; continua" |
   | Grupo | arquivar e limpar o plano **se nada ficar** | qualquer item que ficou (inclusive publicada na lixeira de 24 h, que prende a cor até a purga) |

   A prévia diz também: Assuntos que serão liberados (título, ordem, papel), a
   versão nova do plano, e "as versões do ArticleDNA ficam como histórico".
3. **Confirmação forte:** digitar o nome da cor (ex.: `azul`) e, se houver
   qualquer DELETE, também `apaga de vez`; publicadas exigem a confirmação
   própria de sempre (nome de cada uma). Um `decisionHash` cobre a prévia.
   Essa confirmação é a **autorização explícita da operação** (`AGENTS.md` §15).
4. **Ordem da cadeia (de baixo para cima, para não deixar órfão):** (a) Arquiteto:
   retirar do Silo e desfazer Silo sugerido pelos núcleos de sempre, depois tirar
   as etiquetas; (b) Minerador: o plano do grupo passa para a versão sem os
   artigos excluídos (o núcleo do item 1 em modo `replace` com o plano restante);
   (c) Minerador: **liberar o Assunto e excluir na mesma transação** (RPC da M-E,
   §11.2): `UPDATE` que tira `keyword_subject.plan` e a marca de principal com
   `keyword_subject_release.via = "excluir_cor"` — o gatilho (a) aceita e o (b)
   deixa passar — e então a exclusão do ciclo de vida de sempre; (d) grupo.
5. **Recusa por item, lote em blocos:** a prévia separa o que pode do que não
   pode; o apply manda blocos de até 100 (o limite das rotas), cada bloco
   tudo-ou-nada como hoje; um bloco recusado não desfaz os anteriores e o
   relatório diz o que ficou. Retomável pelo mesmo `decisionHash`.
6. **Releitura** de cada área ao fim; sucesso só depois dela.
7. **Histórico do grupo:** eventos append-only já existentes —
   `keywords_unassigned` (payload: ids, textos, Assuntos liberados, `via:
   "excluir_cor"`, contagens por área, `decisionHash`), `plan_changed` e, no
   fim, `archived`. O histórico das keywords apagadas sobrevive no evento do
   grupo (a linha da keyword deixa de existir).
8. **A cor é liberada no fim?** **Sim, se nada ficou**: o plano do grupo é
   limpo (`plan = null`, `plan_version + 1`, evento `plan_changed` com
   `{ cleared: true, via: "excluir_cor" }`), o `silo_id` é desligado (só se o
   Silo foi desfeito) e o grupo é arquivado. Na próxima vez que a cor for usada,
   o grupo arquivado é reativado **sem plano** (começa limpo, com o histórico).
   Se algo ficou (publicada na lixeira, Silo consolidado, documento no Redator),
   o grupo continua ativo só com o que ficou, e a prévia diz isso antes.
9. **MCP:** continua sem exclusão (`AGENTS.md` §17.1); o catálogo registra a
   operação como `access: "ui"`, "A IA nunca exclui".

**Defeitos achados no caminho (entram na fase do item 6):** o Arquiteto exclui
sem mandar `allowRecoverable` e a tela fala em "24 horas"
(`arquiteto-workspace.tsx:8061-8068`, `:20915`; com o item 2 a exclusão sai do
Arquiteto); a tela do Minerador não fatia lotes acima de 100
(`minerador-workspace.tsx:3744-3786`); o catálogo diz "com janela de
restauração" para a exclusão da não publicada (`lib/agent/platform-catalog.ts:461`);
o catálogo diz que a retirada está fora do MCP (`:782`) mas
`apply_declared_plan_to_silo` com `withdrawNonPlan` retira
(`platform-mcp-tools.ts:1426-1448`) — corrigir o texto (a retirada não é
exclusão).

**Testes:** `tests/excluir-tudo-da-cor-2026-10-13.test.mts` — prévia por área e
motivos; confirmação errada recusa; publicada fora sem a marcação; Assunto
liberado com `excluir_cor` e só então excluído (fixture do gatilho em SQL no
ensaio da M-E); blocos de 100; retomada; grupo arquivado e plano limpo só sem
sobra; reativação da cor sem plano; MCP sem ferramenta de exclusão
(`test:agent`); isolamento por marca. **Riscos:** apagar de vez é irreversível →
prévia + dois textos digitados + a regra de autorização por operação; a
transação da RPC impede Assunto liberado sem exclusão.

## 11. Migrations (texto proposto; o dono aplica, com ensaio; nunca `supabase db push`)

| Migration | Fase | Obrigatória? |
|---|---|---|
| `20261015120000_assunto_nunca_se_perde.sql` (frente em curso, escrita, **não aplicada**) | pré-requisito da F7 | sim, antes da F7 |
| **M-L** `20261016120000_listas_leves.sql` | F6 | sim para a F6 (as fases F1–F5 não precisam de migration) |
| **M-E** `20261016130000_excluir_tudo_da_cor.sql` | F7 | sim para a F7 |
| `20260923140000_minerador_keywords_row_version.sql` (escrita em 2026-09-23, não aplicada) | opcional, melhora o cache do detalhe (item 4, regra 6) | não |

Aplicação de cada uma (o mesmo runbook das anteriores): (1) ensaio com o `COMMIT`
trocado por `DO $$ BEGIN RAISE EXCEPTION 'ENSAIO'; END $$;` e
`npx supabase db query --linked -f <cópia>`; (2) `db query -f` do arquivo; (3)
`npx supabase migration repair --status applied <versão> --linked`; (4) conferência
por SELECT.

### 11.1 M-L — `supabase/migrations/20261016120000_listas_leves.sql` (proposta)

```sql
-- LISTAS LEVES — SDD docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md, item 4.
-- Duas views NOVAS (não toca minerador_keywords_listagem nem editorial_workflow_items_listagem).
-- security_invoker: a RLS de quem lê continua valendo.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.minerador_keywords') IS NULL OR to_regclass('public.editorial_artifact_versions') IS NULL
     OR to_regclass('public.editorial_version_status_events') IS NULL THEN
    RAISE EXCEPTION 'LEVE_PRE: tabelas base ausentes.';
  END IF;
  IF to_regclass('public.minerador_keywords_lista_leve') IS NOT NULL OR to_regclass('public.editorial_article_dna_lista_leve') IS NOT NULL THEN
    RAISE EXCEPTION 'LEVE_PRE: as views já existem (migration aplicada?).';
  END IF;
END $$;

-- 1. Keywords: colunas da planilha + os blocos que os resolvers do Minerador leem.
--    A LISTA FINAL DE BLOCOS é fixada pelo teste de paridade da F6
--    (resolver(linha inteira) = resolver(projeção), coluna a coluna) antes da aplicação.
CREATE VIEW public.minerador_keywords_lista_leve WITH (security_invoker = true) AS
SELECT
  k.id, k.brand_id, k.keyword, k.status, k.intent, k.location,
  k.volume_search, k.volume_source, k.results_allintitle, k.kgr_score,
  k.lista_id, k.group_id, k.created_at,
  jsonb_strip_nulls(jsonb_build_object(
    'keyword_subject', CASE WHEN jsonb_typeof(k.analise_semantica -> 'keyword_subject') = 'object' THEN jsonb_build_object(
        'declared', k.analise_semantica #> '{keyword_subject,declared}',
        'entry',    k.analise_semantica #> '{keyword_subject,entry}',
        'plan',     k.analise_semantica #> '{keyword_subject,plan}') END,
    'keyword_declared_principal', k.analise_semantica -> 'keyword_declared_principal',
    'site_origin',                k.analise_semantica -> 'site_origin',
    'nicho_override',             k.analise_semantica -> 'nicho_override',
    'aprovacao',                  k.analise_semantica -> 'aprovacao'
    -- + os sub-blocos de logical_output_contract, dataforseo_keyword_overview,
    --   volume_measurement (sem séries) e allintitle_measurement que o teste de paridade exigir
  )) AS analise_leve
FROM public.minerador_keywords k
WHERE k.deleted_at IS NULL;

-- 2. ArticleDNA: a versão mais nova por artigo, em projeção, + a última aprovada.
CREATE VIEW public.editorial_article_dna_lista_leve WITH (security_invoker = true) AS
WITH vigente AS (
  SELECT DISTINCT ON (v.marca_id, v.entity_id) v.*
  FROM public.editorial_artifact_versions v
  WHERE v.artifact_type = 'article_dna'
  ORDER BY v.marca_id, v.entity_id, v.version_number DESC
)
SELECT
  v.marca_id, v.entity_id, v.version_id, v.version_number, v.content_hash, v.created_at,
  v.payload ->> 'articleId'            AS article_id,
  v.payload ->> 'siloId'               AS silo_id,
  v.payload ->> 'suggestedSlug'        AS slug,
  v.payload #>> '{subject,phrase}'     AS assunto,
  v.payload ->> 'principalKeywordId'   AS principal_keyword_id,
  v.payload ->> 'architectureStatus'   AS architecture_status,
  (SELECT jsonb_agg(jsonb_build_object('keywordId', r -> 'keywordId', 'role', r -> 'role'))
     FROM jsonb_array_elements(coalesce(v.payload -> 'keywordReferences', '[]'::jsonb)) r) AS keyword_refs,
  (SELECT e.status FROM public.editorial_version_status_events e
    WHERE e.version_id = v.version_id ORDER BY e.occurred_at DESC LIMIT 1) AS status_atual,
  (SELECT a.version_id FROM public.editorial_artifact_versions a
     JOIN public.editorial_version_status_events e ON e.version_id = a.version_id AND e.status = 'approved'
    WHERE a.marca_id = v.marca_id AND a.entity_id = v.entity_id AND a.artifact_type = 'article_dna'
    ORDER BY a.version_number DESC LIMIT 1) AS ultima_aprovada_version_id
FROM vigente v;

REVOKE ALL ON public.minerador_keywords_lista_leve, public.editorial_article_dna_lista_leve FROM PUBLIC, anon;
GRANT SELECT ON public.minerador_keywords_lista_leve TO authenticated, service_role;
GRANT SELECT ON public.editorial_article_dna_lista_leve TO service_role;

-- Pós-checagem (o ensaio também mede o tempo e o tamanho por marca).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.minerador_keywords_lista_leve) <> (SELECT count(*) FROM public.minerador_keywords WHERE deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LEVE_POS: a view de keywords não tem uma linha por keyword viva.';
  END IF;
END $$;

COMMIT;
```

Rollback (`supabase/rollback/20261016120000_listas_leves.rollback.sql`):
`BEGIN; DROP VIEW IF EXISTS public.editorial_article_dna_lista_leve; DROP VIEW IF EXISTS public.minerador_keywords_lista_leve; COMMIT;`
— o código da F6 cai para a leitura de antes quando a view não existe (`42P01`/`PGRST205`,
mesmo padrão do recuo da view em `minerador-workspace.tsx`).

### 11.2 M-E — `supabase/migrations/20261016130000_excluir_tudo_da_cor.sql` (proposta)

```sql
-- EXCLUIR TUDO DA COR — SDD docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md, item 6.
-- Libera o Assunto (via "excluir_cor", reservada em 20261015120000) e exclui pela RPC
-- de ciclo de vida de sempre, NUMA chamada (uma transação). Não cria poder novo de exclusão:
-- publicada só com a declaração; descendente bloqueia; mesma permissão (minerador:manage).
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: lifecycle_delete_minerador_keywords(uuid, uuid[], uuid, boolean) ausente.';
  END IF;
  IF to_regprocedure('public.minerador_keywords_recusa_exclusao_com_assunto()') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: aplique 20261015120000_assunto_nunca_se_perde antes.';
  END IF;
  IF to_regclass('public.editorial_groups') IS NULL THEN
    RAISE EXCEPTION 'COR_PRE: editorial_groups ausente.';
  END IF;
  IF to_regprocedure('public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'COR_PRE: a função já existe (migration aplicada?).';
  END IF;
END $$;

CREATE FUNCTION public.lifecycle_delete_group_keywords(
  p_brand_id uuid, p_group_id uuid, p_keyword_ids uuid[], p_actor_user_id uuid,
  p_request_id uuid, p_allow_recoverable boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  alvo uuid[];
  total integer;
  liberadas uuid[];
  resultado jsonb;
BEGIN
  alvo := ARRAY(SELECT DISTINCT v FROM unnest(coalesce(p_keyword_ids, '{}'::uuid[])) v WHERE v IS NOT NULL ORDER BY v);
  total := coalesce(cardinality(alvo), 0);
  IF p_brand_id IS NULL OR p_group_id IS NULL OR p_actor_user_id IS NULL OR p_request_id IS NULL OR total = 0 OR total > 100 THEN
    RAISE EXCEPTION 'GROUP_DELETE_INVALID';
  END IF;
  IF NOT public.canonical_actor_can_use_brand_action(p_brand_id, p_actor_user_id, 'minerador', 'manage') THEN
    RAISE EXCEPTION 'KEYWORD_DELETE_UNAUTHORIZED';
  END IF;
  -- Só keywords vivas DESTA cor (grupo) desta marca.
  IF (SELECT count(*) FROM public.minerador_keywords k
       WHERE k.brand_id = p_brand_id AND k.id = ANY(alvo) AND k.group_id = p_group_id AND k.deleted_at IS NULL) <> total THEN
    RAISE EXCEPTION 'GROUP_DELETE_OUTSIDE_GROUP';
  END IF;

  -- 1. Libera o Assunto como "Tirar do plano" faria, com o marcador NOVO via "excluir_cor".
  WITH liberacao AS (
    UPDATE public.minerador_keywords k
       SET analise_semantica =
             ((k.analise_semantica #- '{keyword_subject,plan}') - 'keyword_declared_principal')
             || jsonb_build_object('keyword_subject_release', jsonb_build_object(
                  'requestId', p_request_id::text,
                  'reason',    'Excluir tudo da cor',
                  'actorId',   p_actor_user_id::text,
                  'at',        to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                  'via',       'excluir_cor'))
     WHERE k.brand_id = p_brand_id AND k.id = ANY(alvo)
       AND (jsonb_typeof(k.analise_semantica #> '{keyword_subject,plan}') = 'object'
         OR jsonb_typeof(k.analise_semantica #> '{keyword_subject,entry}') = 'object'
         OR k.analise_semantica ? 'keyword_declared_principal')
    RETURNING k.id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO liberadas FROM liberacao;

  -- 2. A exclusão de sempre. Qualquer recusa (publicada sem declaração, descendente,
  --    Assunto ainda protegido) desfaz TAMBÉM a liberação acima (mesma transação).
  resultado := public.lifecycle_delete_minerador_keywords(p_brand_id, alvo, p_actor_user_id, p_allow_recoverable);
  RETURN resultado || jsonb_build_object('releasedSubjectIds', to_jsonb(liberadas), 'requestId', p_request_id);
END;
$function$;

COMMENT ON FUNCTION public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean) IS
  'Excluir tudo da cor (SDD 2026-10-13 item 6): libera o Assunto com via excluir_cor e chama lifecycle_delete_minerador_keywords na mesma transação. Até 100 ids, todos do grupo.';
REVOKE ALL ON FUNCTION public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean) TO service_role;

COMMIT;
```

O ensaio da M-E (com `RAISE 'ENSAIO'` no lugar do `COMMIT`) inclui um caso
funcional numa keyword de teste com Assunto de plano: chamar a função e conferir,
antes do `RAISE`, que a linha sumiu (não publicada) e que, sem a etapa 1, o
gatilho recusaria. A conferir no ensaio: se `minerador_keywords_trava_identidade_publicada`
recusa o `UPDATE` de `analise_semantica` de publicada (então a publicada sai do
escopo da M-E e continua pela lixeira de sempre).

Rollback (`supabase/rollback/20261016130000_excluir_tudo_da_cor.rollback.sql`):
`BEGIN; DROP FUNCTION IF EXISTS public.lifecycle_delete_group_keywords(uuid, uuid, uuid[], uuid, uuid, boolean); COMMIT;`
— a operação some da tela (a rota responde `409 GROUP_DELETE_NOT_AVAILABLE`); a
exclusão comum continua.

**Sem migration:** itens 1, 2, 3 e 5, e a parte sem view do item 4. O
`editorial_groups.plan` aceita `null` (`CHECK (plan IS NULL OR …)`), e os eventos
`plan_changed`, `keywords_unassigned` e `archived` já existem no `CHECK` de
`editorial_group_events.event_type`.

## 12. Consumidores consolidados

| Consumidor | Itens | Proteção |
|---|---|---|
| Card "Cadastrar Assuntos", rotas `plans/import`/`plans/withdraw`, MCP `declare_silo_plan` | 1, 6 | testes do item 1, `test:agent` |
| Melhoria (`lib/server/arquiteto-article-improvement.ts`), Reforçar/Diferenciar publicados, MCP `improve_articles` | 2, 3, 5 | teste estrutural "Arquiteto só lê", portas que contam chamadas |
| Modal Importar do Minerador (frente em curso) | 2, 4 | D2 |
| Minerador: caixa "Sugestões do Arquiteto" (nova, só leitura de execuções) | 2 | teste da caixa por cor |
| Rotas de SERP do Arquiteto, allintitle, territorial, IA territorial, `revalidate-structure`; Medir volume e Pesquisa por Assunto do Minerador | 3 | `tests/ler-antes-de-buscar-2026-10-13.test.mts` |
| Mesa `/api/editorial/workspace`, `components/editorial-pipeline-context.tsx`, `/api/inteligencia`, `GET /api/arquiteto/workspace`, Processador do Minerador, Radar, Redator, Publicações | 4 | paridade dos resolvers; "ler grupo não remove outro grupo"; E0 |
| `lib/arquiteto/article-pipeline.ts`, mesa do Arquiteto, painel da melhoria | 5 | testes do item 5 |
| Gerenciar a cor, ciclo de vida do Minerador, retirada do Silo, grupos | 6 | testes do item 6 |
| Catálogo `lib/agent/platform-catalog.ts` e ferramentas MCP | todos | `npm run test:agent` na mesma entrega (`AGENTS.md` §17.1) |
| Entregáveis (§2.1 da SDD acelerar) | nenhum | E0 com os mesmos hashes; `git diff --stat` vazio |

## 13. Rollback

Cada fase é um deploy e volta pelo código anterior: parâmetros novos são
opcionais (`mode`, projeções), as rotas antigas ficam até a fase seguinte, e
nenhum dado gravado muda de significado (o plano substituído é um plano comum;
as sugestões do Arquiteto são execuções da melhoria que já existem). M-L e M-E
têm rollback próprio (§11) e o código cai para a leitura/operação de antes sem
elas. Exclusão definitiva não tem rollback — por isso a prévia, a dupla
confirmação e a transação.

## 14. Testes (fixtures; sem chamada paga; sem banco remoto)

Arquivos novos: `tests/minerador-recadastro-substitui-2026-10-13.test.mts`,
`tests/arquiteto-so-le-keyword-2026-10-13.test.mts`,
`tests/ler-antes-de-buscar-2026-10-13.test.mts`,
`tests/listas-leves-paridade-2026-10-13.test.mts`,
`tests/arquiteto-planilha-primeiro-2026-10-13.test.mts`,
`tests/excluir-tudo-da-cor-2026-10-13.test.mts`. Em toda fase: E0
(`tests/entregaveis-intocados-2026-10-13.test.mts`, mesmos hashes), `test:arquiteto`,
`test:arquiteto:servidor`, `test:arquiteto:lentes`, `test:radar`, `test:redator`,
`test:redator:mcp`, `test:agent`, `test:editorial`, `test:editorial:dom`, Minerador
por glob (falhas comparadas por nome com a base da fase), `tsc`, eslint dos
arquivos tocados, `git diff --check`. Testes estruturais removem comentários antes
de casar (memória do projeto). Mutantes só com suíte verde. Validação visual e
smoke real são do dono.

## 15. Riscos gerais

- **Mais passos para o dono no item 2** (decidir no Minerador) — mitigado pela
  caixa por cor e pelos links diretos; é a regra pedida.
- **Lista leve sem um campo que alguma operação usava** — paridade dos
  resolvers + lista explícita de operações de marca inteira no servidor (§8.4).
- **Duas frentes mexendo nos mesmos arquivos** (`arquiteto-workspace.tsx`,
  `minerador-workspace.tsx`, `declared-plan-import-core.ts`, catálogo): cada fase
  começa depois de a frente em curso fechar o arquivo, com âncoras únicas
  verificadas (nunca recorte por faixa de linhas) e sem `git stash`.
- **Exclusão irreversível** — §10.2 itens 3, 4 e 5 e a transação da M-E.
- **Custo de CPU das projeções jsonb** — medido no ensaio da M-L (§8.4).

## 16. Fases (menor risco e maior ganho primeiro; cada uma é um deploy)

| Fase | Itens | Ganho | Risco | Migration | Encaixe nas frentes em curso |
|---|---|---|---|---|---|
| **E0** | já existe | prova dos entregáveis | — | não | rodar na base de cada fase |
| **F1 · Recadastrar substituindo** | 1 | o dono recadastra tudo sem o defeito (é o próximo passo dele) | baixo-médio (Minerador só; nada é apagado) | não | usa o marcador `tirar_do_plano` do gatilho em curso; a trava é a da frente "Posto de principal" (mesmo núcleo); começa depois de essa frente fechar `declared-plan-import-core.ts` |
| **F2 · Parar de carregar o que ninguém usa** | 4 (parte sem view): mesa leve por padrão no banco, `views`/`invitations` fora da mesa, `/api/inteligencia` sem `analise_semantica`, pareceres de SERP em projeção no `GET /api/arquiteto/workspace`, releitura por id em vez de leitura dupla | o maior ganho de velocidade e de egress (Arquiteto AdalbaPro ~29 MB → poucos MB) | baixo-médio | não | o modal de import da frente em curso já é leve; esta fase não toca nele |
| **F3 · Ler antes de buscar** | 3 | fim de pagamento repetido (volume medido 3×, IA sem aviso) | baixo | não | — |
| **F4 · O Arquiteto só lê** | 2 | a fronteira pedida; caixa "Sugestões do Arquiteto" no Minerador | médio (fronteira entre módulos) | não | o modal de import (frente em curso) troca "aprovar aqui" por "aprovar no Minerador" (D2), depois de a frente fechar |
| **F5 · Planilha primeiro** | 5 | o plano vira linhas com ações; painel de texto só para publicados | médio | não | depende de F3 e F4; mostra a trava e o Assunto no cabeçalho da frente "Posto de principal" |
| **F6 · Listas leves com view** | 4 (resto): Processador e mesa por view, detalhe por id, operações de marca inteira no servidor, CSV no servidor | Processador 2,0 MB → ~0,1 MB; mesa < 1 MB | médio | **sim, M-L** (antes do deploy) | — |
| **F7 · Excluir tudo da cor** | 6 | apagar uma cor inteira pelos contratos de sempre | alto (irreversível) | **sim, M-E**, e antes a `20261015120000` | é o uso reservado de `via: "excluir_cor"` do gatilho da frente "o Assunto nunca se perde" |

Cada fase prova: E0 verde com os mesmos hashes; `git diff --stat` dos arquivos
do §2.1 da SDD acelerar vazio; teste estrutural de que o leitor leve não é usado
por nenhum caminho de entregável (F2, F6); documentação do módulo dono
(`estado-atual.md`, `backlog.md`), catálogo do MCP e o andamento desta SDD (§18).

## 17. Decisões — DECIDIDAS pela recomendação (dono, 2026-10-13)

**D1–D8 estão DECIDIDAS** como a coluna "Recomendação" abaixo. Frase literal do
dono, 2026-10-13, respondendo à pergunta de confirmar as decisões antes das
fases:

> "pode seguir suas recomendações sim"

Cada decisão vale para a fase correspondente (§16); nenhuma autoriza migration,
SQL de escrita, chamada paga ou exclusão fora do que a própria fase descreve
(§1, "O que a frase autoriza").

| # | Decisão | Recomendação (= decisão do dono) |
|---|---|---|
| D1 | Item 1: na substituição, o Pilar pode sair e o Assunto pode mudar de keyword | sim, só no modo `replace`, numa decisão com duas versões (retirada v+1, plano v+2) |
| D2 | Item 2: o modal "Importar do Minerador" aprova? | **não** — "Aprovar no Minerador (N)" abre o diálogo do Minerador filtrado; alternativa, se o dono preferir manter no modal: o diálogo diz "Minerador · Aprovar", usa o cliente do usuário (não o service role) e só então envia |
| D3 | Item 2: keyword nova do Arquiteto | sugestão lida pelo Minerador a partir da execução da melhoria; importa só pelo clique do dono no Minerador |
| D4 | Item 3: volume medido é "conhecido" por quanto tempo | sempre, até "Medir de novo" explícito; "sem média" por 30 dias |
| D5 | Item 4: projeção por view (M-L) ou por seletores na rota | F2 por seletores (sem migration); F6 por view, depois do ensaio de tempo |
| D6 | Item 6: publicadas entram na exclusão da cor? | só com a marcação "incluir publicadas na lixeira de 24 h" e a confirmação por nome de cada uma |
| D7 | Item 6: a cor é liberada no fim | sim, se nada ficou: plano limpo, Silo desligado (só o desfeito), grupo arquivado; reativação começa sem plano |
| D8 | Item 6: Radar, Redator e Publicações ganham exclusão? | **não nesta SDD** (não há contrato; exigiria SDD própria); ficam fora com o motivo |

## 18. Autorização e andamento

- [x] SDD e implementação das fases autorizadas pelo dono em 2026-10-13 (frase do §1, incluindo "E pode implementar as suas sugestões sim" e o acréscimo do item 6).
- [x] Decisões D1–D8 **DECIDIDAS pela recomendação** (§17) — dono, 2026-10-13: "pode seguir suas recomendações sim".
- [ ] M-L e M-E aplicadas pelo dono, com ensaio, antes da F6 e da F7; `20261015120000` antes da F7 (o dono informou em 2026-10-13 que os gatilhos `minerador_keywords_preserva_assunto` e `minerador_keywords_recusa_exclusao_com_assunto` já estão aplicados no banco; a F1 grava o marcador `tirar_do_plano` que eles exigem). **Conferido por SELECT em 2026-10-14:** `20261015120000` aplicada e no histórico remoto (os seis gatilhos de `minerador_keywords` ligados); M-L e M-E ainda não.

| Fase | Estado em 2026-10-13 |
|---|---|
| E0 | existe (SDD acelerar); rodar na base de cada fase |
| **F1 · Recadastro que substitui** | **feita no código (2026-10-13), sem deploy, sem migration.** Ver §18.1. **Validado manualmente: não** (a homologação na tela é do dono). |
| **F2 · Parar de carregar o que ninguém usa** | **feita no código (2026-10-14), sem deploy, sem migration, sem view.** Ver §18.2. **Validado manualmente: não.** Metas da §8.2 **não atingidas** nesta fase (abertura < 1 MB; ação < 50 kB só nas ações de um item) — o que falta é F6. |
| **F3 · Ler antes de buscar** | **feita no código (2026-10-14), sem deploy, sem migration.** Ver §18.3. **Validado manualmente: não.** A fronteira de escrita do Arquiteto no Minerador não mudou (é a F4). |
| **F4 · O Arquiteto só lê** | **feita no código (2026-10-14), sem deploy, sem migration.** Ver §18.4. **Validado manualmente: não.** |
| **F5 · Planilha primeiro** | **feita no código (2026-10-14), sem deploy, sem migration.** Ver §18.5. **Validado manualmente: não.** |
| **F6 · Listas leves com view** | **feita no código (2026-10-14), sem deploy; migration M-L `20261016120000_listas_leves.sql` ESCRITA e NÃO aplicada** (o código funciona sem ela). Ver §18.6. **Validado manualmente: não.** Metas da §8.2 **atingidas em parte** (ver §18.6). |
| **F7 · Excluir tudo da cor** | **feita no código (2026-10-14), sem deploy; migration M-E `20261016130000_excluir_tudo_da_cor.sql` ESCRITA e NÃO aplicada** (sem ela a prévia aparece e o botão fica desabilitado com a explicação). Autorização: "pode concluir as pendências" (2026-10-14). Ver §18.7. **Validado manualmente: não.** Só o Minerador executa (D8); nenhuma ferramenta MCP. |

### 18.1 F1 — o que foi feito (2026-10-13)

**Verificado no código / confirmado por teste (fixtures):**

- **Núcleo único** `importDeclaredPlanWithCore` (`lib/minerador/declared-plan-import-core.ts`)
  ganhou o parâmetro aditivo **`planMode: "append" | "replace"`** (ausente =
  `append`, o corpo de sempre — teste de igualdade). Chama-se `planMode`, e não
  `mode` como no §5.2, porque `mode` já é `preview`/`apply` no núcleo, na rota e
  no MCP. Só vale no destino "Silo existente" (outro destino: impedimento).
- **Prévia `replace`**: as quatro listas (`same`, `changed`, `entering`,
  `leaving`), cada linha com o motivo (`reasons`), mais `legacyOutside`
  (linha-título do formato anterior fora do plano novo: fica como está, aponta
  para "Converter formato anterior"), `nextPlanVersions`, `effects` e o
  **`decisionHash`** que cobre as quatro listas. O casamento é o mesmo do
  acréscimo (keyword; Assunto anterior; principal anterior), feito antes da
  classificação para saber o que sai.
- **Regras só no `replace`** (§5.2): o Pilar pode sair quando o plano novo traz
  outro; o Assunto pode mudar de keyword (A em "Sai" com o motivo "o Assunto
  passa para B"; B em "Entra" com "vem de A"); a marca de principal deste grupo
  cujo Assunto sai não prende a keyword; o nome/objetivo do Silo podem mudar e o
  slug só muda sem `editorial_groups.silo_id` (confirmado: impedimento). R4, R6 e
  R7 continuam recusando por linha (R4 agora cita "Substituir o plano").
- **Aplicar** exige o MESMO `decisionHash` (`DECISION_REQUIRED`/`DECISION_STALE`)
  e faz: (a) **"Sai" pelo núcleo de "Tirar do plano"** — nova função
  `withdrawForPlanReplacementWithCore` em `lib/minerador/declared-plan-withdraw-core.ts`,
  que reaproveita as MESMAS escritas da retirada avulsa (extraídas para
  `rehearseArticleRelease`/`releaseArticleKeywords`): ensaio de todas, plano
  `v+1` com o que fica (quando sobra algum artigo; sem sobra não há versão
  intermediária — um plano sem artigos não existe), cada Assunto que sai com
  `keyword_subject_release.via = "tirar_do_plano"` (inclusive o Pilar), a
  principal sem a marca, releitura; (b) o plano novo pelo caminho de sempre
  (`v+2`), relido. Falha no meio = `WITHDRAWAL_FAILED`; prévia nova e confirmação
  terminam sem repetir nada.
- **Marca órfã** (o caso do azul: marca de principal deste grupo sem Assunto no
  plano) que fica fora do plano novo entra em "Sai" (`kind: "orphan_mark"`): a
  marca sai e, se o histórico a oferecia como "Recuperado do histórico", a
  liberação fica registrada no histórico (`recordKeywordSubjectRelease`, aditivo
  em `lib/minerador/keyword-subject.ts`) — não volta sozinha.
- **Card** (`modules/minerador/subject-cadastro-card.tsx`): em "Silo existente",
  a escolha **Acrescentar | Substituir o plano**; na substituição a linha gravada
  pode sair, mudar de ordem e de keyword; "Colar plano em texto" vira o plano
  novo inteiro (a linha gravada casada mantém a trava manual quando o texto não
  diz "Trava:"; o Silo do texto vai junto); a prévia mostra as quatro listas;
  com algo saindo, o botão "Substituir o plano" só habilita com o nome da cor
  digitado; o resultado mostra o que saiu e as marcas liberadas.
- **Rota** `POST …/plans/import`: `planMode` e `decisionHash` opcionais (schema
  `strict`); códigos novos `DECISION_REQUIRED` 400, `DECISION_STALE` 409,
  `WITHDRAWAL_FAILED` 409.
- **MCP** `declare_silo_plan`: `planMode` e `decisionHash`; aplicar a
  substituição sem `decisionHash` é recusado antes do invólucro
  (`decision_hash_required`) e pede os escopos `minerador.write` + `platform.decide`.
  Catálogo atualizado (`minerador.declare_silo_plan`, `minerador.withdraw_from_declared_plan`).
- **Nada é apagado**; `group_id` não muda; ArticleDNA/SiloDNA/SiloPage, Radar,
  Redator e Publicações não são tocados (o Arquiteto lê "Fora do plano" pelos
  selos de sempre).

**Testes:** `tests/minerador-recadastro-substitui-2026-10-13.test.mts` (10:
corpo de sempre sem `planMode`; quatro listas; aplicar com marcador, v2/v3 e
nada apagado; troca de Pilar; Assunto mudando de keyword; o caso real do azul —
7 keywords com a marca e sem Assunto voltam todas, e a que fica fora perde a
marca e não volta como recuperada; falha no meio e retomada; R4/R6/R7/slug,
destino e isolamento por marca; estrutural). Ajustes declarados:
`tests/agent-platform-mcp.test.mts` (o `declare_silo_plan` passa os escopos por
`escopos`) e `tests/minerador-plano-declarado-tela.test.mts` (o botão também
espera o nome da cor e diz "Substituir o plano" na substituição).
**Suítes (antes → depois):** Minerador por glob 1337 → 1347, as mesmas 25
falhas antigas (comparadas por nome, TAP); `test:arquiteto` 2912 → 2912/2912;
`test:agent` 90 → 90/90; `test:radar` 3544 → 3544 (1 pulado, 0 falha, E0 com os
mesmos hashes; `tests/fixtures/entregaveis-2026-10-13.sha256.json` intocado);
`tsc` 0 → 0; eslint dos arquivos tocados sem erro (1 aviso antigo em
`setKeywordPlanLockWithCore`); `git diff --check` limpo.

**Limites:** a confirmação por nome da cor é da tela (o MCP usa o aceite no chat
+ `decisionHash`); `nextPlanVersions` é a previsão (o hash do plano restante da
retirada e o do plano novo usam frases diferentes, então mesmo "só remover" gera
as duas versões); as ações "Converter para a keyword X" da linha-título fora do
plano não estão na prévia da substituição (ela aponta para "Converter formato
anterior", que já existe).

### 18.2 F2 — o que foi feito (2026-10-14)

**Verificado no código / confirmado por teste (fixtures). Validado manualmente: não.**
Sem migration, sem view, sem SQL de escrita, sem chamada paga, sem deploy. Leitura
remota só por SELECT agregado (medição). Entregáveis (§3) intocados: E0 com os
mesmos hashes, `git diff --stat` dos arquivos do §2.1 da SDD acelerar vazio e
teste estrutural de que nenhum deles usa o leitor leve.

1. **Mesa leve por padrão, recortada no banco** (`app/api/editorial/workspace/route.ts`,
   `ArtifactRepository.listLight` em `lib/server/editorial-repositories.ts`): sem
   `detail`, a mesa lê os METADADOS de todas as versões de ArticleDNA/SiloDNA
   (sem `payload`, a chave do artefato por caminho JSON) e os eventos, faz a MESMA
   escolha de sempre (`lightArtifactSelection`: vigente, última aprovada e as
   referenciadas por item do Radar ou documento) e só então lê o `payload` das
   escolhidas, por `version_id`. Escolhida que não passa no contrato: o artefato é
   relido inteiro e escolhido do jeito antigo. `detail=full` (leitura de todas as
   versões) só pedido explicitamente; nenhuma tela pede. O cliente
   (`components/editorial-pipeline-context.tsx`) trata leve e "inteira" como o
   mesmo estado (a memória já guardava só a versão mais nova por artigo): sair do
   Radar sem recorte por cor não relê mais a mesa.
2. **`views` e `invitations` saíram da mesa.** As grades já liam as visualizações
   por `/api/editorial/views`. Os convites: `GET /api/editorial/invitations` novo
   (permissão `marca:view`, a mesma da mesa), lido pela Marca ao abrir "Equipe";
   falha de leitura vira aviso ("Isto não quer dizer que não há convites"), nunca
   lista vazia, e a ausência na mesa não apaga a lista em memória. Achado: a
   tabela `brand_invitations` **não existe** no banco (SELECT de 2026-10-14) — a
   seção "invitations" da mesa falhava em toda leitura e aparecia como diagnóstico.
3. **`/api/inteligencia` sem `analise_semantica`** (o schema do snapshot o deixa
   opcional; os consumidores da mesa — hidratação do Radar, Marca, Publicações —
   leem id, keyword, lista, status, volume e KGR; conferido no código).
4. **Pareceres de SERP da formação em projeção no `GET /api/arquiteto/workspace`**
   (`lib/arquiteto/article-serp-projection.ts`): fora de `assessment`, tudo; de
   `assessment`, tudo menos a SERP bruta (das consultas, os campos escalares; dos
   orgânicos, só `url`, `domain`, `position`) e as cópias do KeywordDNA (identidade,
   versão e só `searchIntent`/`originalIntentLabel`). Registro com `detail: "list"`.
   Parecer sem `interpretation` (legado) vai inteiro. O parecer inteiro: `serpDetail=full`,
   pedido só pela exportação do Arquiteto. **Limite:** a projeção é feita no
   Node — o banco ainda devolve o parecer inteiro (o corte no banco precisa da
   view/coluna gerada da F6). A melhoria lê UM parecer pelo `candidateRef`
   (`findArticleFormationSerpAssessment`), não a lista da marca.
5. **O Arquiteto lê do banco só as versões vigentes** (`listArquitetoArtifactsVigentes`
   em `lib/server/arquiteto-persistence.ts`, opção `artifactRead: "vigente"` só na
   tela): metadados de todas as versões (ids das keywords do ArticleDNA por
   caminho: `principalKeywordId`, `secondaryKeywordIds`, `narrativeReinforcementIds`,
   `subject.keywordId`, que o contrato iguala a `keywordReferences`) e a linha
   inteira só da vigente, na mesma ordem da leitura inteira. A elegibilidade de
   importação continua olhando keyword de versão antiga (pelos caminhos). Os
   núcleos do servidor (melhoria, reforço, conversão, Silo do plano) continuam com
   a leitura inteira. **Diferença declarada:** versão ANTIGA inválida deixa de
   derrubar a mesa (antes, qualquer versão inválida recusava a leitura inteira).
6. **Releitura do que mudou, não da mesa inteira** (`lib/arquiteto/workspace-delta.ts`,
   `lib/server/arquiteto-workspace-sync.ts`, rota `POST /api/arquiteto/workspace/delta`,
   só leitura). A leitura inteira (a primeira de cada abertura do Arquiteto e de
   cada marca) devolve, junto, as MARCAS calculadas dos metadados (lock e
   `updated_at` de cada item; versão vigente de cada artefato; impressão de cada
   keyword — colunas da lista, grupo e os blocos pequenos do DNA que mudam numa
   decisão; hash das coleções pequenas, da elegibilidade, dos status e das
   ordens). `loadCanonicalArquitetoWorkspace` no cliente guarda essa base SÓ em
   memória e, nas releituras seguintes (as ~42 recargas e as ~21 releituras
   diretas, sem mudar nenhuma delas), manda as marcas e recebe só as linhas que
   mudaram, já na forma da leitura inteira (com a liberação por artigo rejeitado,
   a elegibilidade e a projeção do parecer aplicadas no servidor pelas MESMAS
   funções). A fusão monta o MESMO snapshot; fusão que não fecha, erro ou
   resposta sem marcas → leitura inteira. Releituras da mesma marca em fila.
   A "leitura dupla" (releitura direta + recarga) virou uma releitura com as
   mudanças + uma vazia (~1 kB). Execução que escreve no Minerador a partir do
   Arquiteto (melhoria, reforço, diferenciação) mudou → todas as recebidas são
   relidas. **Limite declarado:** mudança só dentro do DNA da keyword, fora dos
   campos da impressão, feita em OUTRA aba com o Arquiteto aberto, aparece ao
   reabrir a área (a 1ª leitura é a inteira); a coluna `row_version` (migration
   `20260923140000`, escrita e não aplicada) fecharia isso.
7. **Catálogo (§17.1):** `/api/arquiteto/workspace/delta` em "Formar artigos e
   silos" e a nota de leitura atualizada.

**Medição (SELECT agregado no banco remoto, bytes por `length(x::text)`, 2026-10-14):**

| AdalbaPro | Antes: banco | Antes: tela | Depois: banco | Depois: tela |
|---|---|---|---|---|
| Mesa (Arquiteto/Redator/Publicações) | ~12,0 MB (Radar 4,58 + ArticleDNA/SiloDNA todas as versões 7,23 + SERP 0,19) | ~11,6 MB | ~6,98 MB (Radar 4,58 + metadados 0,03 + escolhidas 2,18 + SERP 0,19) | ~6,5 MB |
| `/api/inteligencia` | 2,15 MB | 2,15 MB | 45 kB | 45 kB |
| `GET /api/arquiteto/workspace` | ~21,7 MB (itens 2,44 + recebidas 2,19 + índice 0,08 + todas as versões 7,25 + pareceres 9,76) | ~16,8 MB | ~15,0 MB (marcas 0,39 + itens 2,44 + recebidas 2,19 + vigentes 2,19 + pareceres 9,76) | ~9,5 MB (pareceres em projeção 2,43) |
| **Abertura do Arquiteto** | **~35,8 MB** | **~30,5 MB** | **~22,1 MB** | **~16,0 MB** |
| Por ação (1 item gravado) | ~21,7 MB (~43 MB com a leitura dupla) | ~16,8 MB (~33 MB) | ~0,42 MB | ~33 kB |
| Por ação (1 artigo com versão nova e seus itens) | idem | idem | ~0,5 MB | ~120–240 kB |
| Por ação (melhoria/reforço/diferenciação aplicados) | idem | idem | ~2,6 MB | ~2,2 MB |

| WifiConecta | Antes: banco | Antes: tela | Depois: banco | Depois: tela |
|---|---|---|---|---|
| Abertura do Arquiteto (mesa + inteligência + Arquiteto) | ~6,7 MB | ~6,2 MB | ~5,3 MB | ~3,0 MB |
| Por ação (1 item gravado) | ~5,1 MB | ~4,6 MB | ~0,15 MB | ~18 kB |

Consultas: mesa 9 → 8 (−convites, −visualizações, +metadados); Arquiteto na
abertura 14 → 19 (6 de marcas, todas sem `payload`); por ação 14 (28 na leitura
dupla) → 6 de marcas + 1 a 5 das linhas que mudaram. Tempo no banco das duas
leituras de marcas mais caras (`EXPLAIN ANALYZE`, só leitura, AdalbaPro):
impressões das keywords 223 ms e metadados das versões 315 ms (cada caminho JSON
descomprime o `payload`; dentro do limite de 8 s, mas é o próximo custo a cortar —
coluna gerada na F6). Fixture
(`tests/arquiteto-listas-leves-f2-servidor-2026-10-14.test.mts`): leitura inteira
83 kB de resposta / 135 kB do banco; releitura de 1 item 11 kB / 18 kB.

**Metas da §8.2:** abertura < 1 MB — **não atingida** (AdalbaPro ~16 MB na
tela); por ação < 50 kB — atingida nas ações de um item, não nas que trazem
ArticleDNA ou relêem as recebidas. O que segura os bytes é a F6: itens do Radar
na mesa (4,6 MB, poda ainda no Node), ArticleDNA vigente inteiro (2,2 MB, 2,35 MB
são `keywordReferences`), DNA inteiro das keywords recebidas (2,2 MB) e o pacote
aprovado nos itens (2,4 MB), mais o parecer cortado só no Node (9,8 MB do banco).
Projetar esses quatro exige a view/colunas da M-L, a paridade dos resolvers e as
operações de marca inteira no servidor (Processar arquitetura, canibalização,
links entre Silos, ponto de recuperação) — §8.3 itens 4 a 7.

**Operações que dependiam do objeto inteiro (preservadas, com teste):** veredito
SERP do artigo (prioridade da evidência, observações, intenção esperada), portão
SERP da formação (base, veredito, 4 lentes, decisão humana), canibalização (mesmas
URLs/domínios), composição do Reforçar publicados e da melhoria
(`serpAssessmentComposition`, `aliasPublishedFormationSerp`), parecer reconstruído
do registro legado, exportação/backup (parecer inteiro por `serpDetail=full`),
ponto de recuperação (`keywordDetail=full`, leitura inteira fora da base),
Processar arquitetura, links entre Silos e formação (o snapshot fundido é
idêntico ao da leitura inteira — teste de equivalência por tipo de ação).
Nenhum caminho de escrita lê a projeção: o servidor relê a linha gravada.

**Testes:** `tests/arquiteto-listas-leves-f2-2026-10-14.test.mts` (15, `test:arquiteto`),
`tests/arquiteto-listas-leves-f2-servidor-2026-10-14.test.mts` (15, `test:arquiteto:servidor`),
`tests/editorial-mesa-leve-no-banco-2026-10-14.test.mts` (3, `test:editorial`),
apoio `tests/listas-leves-fake-db.mts` e `tests/listas-leves-fixtures.mts`.
Ajustes declarados (o contrato mudou): `editorial-workspace-agregacao` (seis
seções, sem convites/visualizações), `editorial-acelerar-f2-leitura-por-cor`
(leve por padrão no banco; só o recorte por grupo pede releitura),
`arquiteto-leitura-da-marca-estreita` (índice reaproveitado; leitura das
vigentes), `arquiteto-silo-caller-migration` (o corpo do GET saiu para
`readArchitectWorkspaceBody`), `radar-grupos-f2` (a leitura dos artefatos do
recorte agora é metadados por `entity_id` + payload por `version_id`), e os dublês de `arquiteto-article-serp-store` em
`arquiteto-article-improvement-server`, `arquiteto-quatro-lentes-rota` e
`arquiteto-serp-no-artigo-rota` (`findArticleFormationSerpAssessment`).

### 18.3 F3 — o que foi feito (2026-10-14)

**Verificado no código / confirmado por teste (fixtures). Validado manualmente: não.**
Sem migration, sem SQL, sem escrita remota, sem chamada paga, sem deploy. Entregáveis
(§3) intocados: E0 com os mesmos hashes (`tests/fixtures/entregaveis-2026-10-13.sha256.json`
não foi tocado). A fronteira de escrita do Arquiteto no Minerador **não mudou** (é a F4):
o "Gravar melhorias" continua gravando medição, Lógica, import, aprovação e envio pelos
núcleos do Minerador; a F3 só tirou as medições e buscas à toa e pôs a leitura antes.

1. **Leitor único** (§7.2): domínio puro `lib/editorial/known-before-search.ts`
   (`readKnownVolume`, `buildKnownBeforeSearchPlan` → `{ known, missing, plan: { googleAds,
   ai, dataForSeo }, free, needsPaidReading, done }`, `knownBeforeSearchSentences`,
   `knownBeforeSearchAuthorizeLabel`, `keywordDnaSummary`) e o leitor do servidor
   `lib/server/known-before-search.ts` (`readKnownBeforeSearch`: por id, pela marca, colunas
   estreitas — coluna, fonte, data/média/provider da medição e a elegibilidade —, só leitura,
   `readFailed` em vez de pagar às cegas). **D4 no código:** medido no Google Ads vale em
   qualquer idade; "sem média" (`volume_eligibility` `unavailable` ou `lastEmptyResponse`)
   vale 30 dias; outro provider, nunca medida e medição que falhou = falta.
2. **Melhoria — os dois defeitos registrados no §7.1:**
   - "Buscar keywords (grátis)" chamava IA e Google Ads sem dizer (pontos 1 e 3): o prepare
     sem `authorizeReading` agora só lê (DNA, volume medido, "sem média" < 30 dias, SERP em
     cache, Assunto/plano/trava, lista da Pesquisa por Assunto, execução anterior) e grava em
     `reading` o plano e as frases "Já temos · Falta · Custa". A IA (`authorizeReading.ai`) e
     a medição (`authorizeReading.measure`) só rodam com o aceite desse plano, e só para o
     que falta. O botão manteve o nome, agora verdadeiro; o novo botão diz o custo ("Ler com
     IA e medir · 1 chamada de IA + N keyword(s) no Google Ads (cota)").
   - Volume medido até três vezes: a preparação autorizada mede uma vez pela consulta
     inteira (`readGoogleAdsHistoricalMetricsOnce`, a mesma do "Volume", com o CPC; conta
     mascarada) e guarda a medição na keyword da execução (fora da projeção do navegador e do
     MCP); o apply a grava pelo MESMO núcleo (`measureKeywordVolume` →
     `handleGoogleAdsKeywordMetrics` com a porta aditiva `replay`), sem consultar o Google
     Ads; a keyword nova é medida uma vez na busca e gravada por replay. Execução de antes
     desta versão (sem a medição guardada) segue o caminho antigo.
3. **A IA recebe o resumo do DNA** (ponto 2; regra 4): intenção, entidade, funil, público e
   problema de cada alvo e de cada keyword da lista, e `principalTravada`; regra 7 no
   sistema da IA. Sem id, sem texto longo.
4. **Busca nova deduplica contra a marca inteira** (pontos 4 e 5; regra 5): a ideia que já
   existe no Minerador com volume medido (ou "sem média" < 30 dias) usa o volume dele e não
   é medida nem remedida ao gravar; o mesmo em "Reforçar publicados" (busca em lote) e na
   diferenciação (`knownVolumeByNormalized` na leitura da marca).
5. **O servidor decide o volume** (ponto 7; regra 6): `/api/arquiteto/serp` relê no banco o
   volume de cada keyword antes do plano pago (diagnóstico `knownBeforeSearch { checked,
   corrected, readFailed }`; fora do acervo ou leitura que falha = o pedido, como antes);
   `/api/arquiteto/keyword-serp` com `onlyMeasuredVolume` (que as duas coletas do Arquiteto
   mandam) tira do plano e da coleta a keyword sem volume no banco (`excludedByVolume`) e
   recusa pagar às cegas (503). allintitle e Processar arquitetura já estavam certos (sem mudança).
6. **Minerador, mesma regra, aditivo** (ponto 6 e regra 8, parte): o plano de
   `measure_keywords` traz `alreadyKnown`/`toMeasureFirstTime` (medir de novo continua
   explícito); a prévia da Pesquisa por Assunto lê os recibos anteriores do mesmo Assunto
   (`listPreviousSubjectSearches`) e avisa "Já temos: este Assunto já foi pesquisado N
   vez(es)…" fora do hash do plano.
7. **MCP e catálogo (§17.1):** `improve_articles` com `authorizeReading` (leitura grátis pede
   `arquiteto.write`; IA, medição ou busca pedem `provider.spend`); descrição de
   `measure_keywords`; notas em `arquiteto.article_improvement`, `minerador.measure_keywords`,
   `minerador.search_subject_keywords`, `arquiteto.validate_serp`,
   `arquiteto.published_reinforcement_search` e no playbook `reforcar_publicado_pela_serp`.

**O que o dono deixa de gastar (por preparação da melhoria):** abrir/repetir "Buscar
keywords" não chama mais a IA nem o Google Ads (antes: 1 chamada de IA OpenRouter + 1
consulta de métricas por preparação nova, sem aviso); a IA e a medição só rodam quando ele
autoriza, e só para o que falta; cada keyword que entra no artigo é medida **uma** vez (antes:
até 3 consultas — prepare, apply e, na keyword nova, busca + gravar); "sem média" recente,
volume já medido e ideia que já existe no Minerador não vão ao Google Ads; SERP de keyword
sem volume no banco não é paga.

**Suites (antes → depois):** Minerador por glob 1316 → 1316, as mesmas 30 linhas `not ok` (25 testes + 5 arquivos), comparadas por nome (TAP); `test:arquiteto` 2927 → 2943 (+15 de `ler-antes-de-buscar`, +1 em `reforcar-publicados`); `test:arquiteto:servidor` 142 → 142; `test:arquiteto:lentes` 90 → 102 (+6 na melhoria, +3 nas rotas de SERP, +3 no leitor e no replay); `test:arquiteto:dom` 17 → 17; `test:agent` 90 → 90; `test:redator:mcp` 150 → 150; `test:radar` 3544 → 3544 (1 pulado, 0 falha; E0 com os mesmos hashes); `tsc` 0 → 0; eslint dos arquivos tocados sem erro nem aviso; `git diff --check` limpo. Mutantes (suíte verde): 10, 9 mortos; o vivo (tirar a marca de medido do `sem média` lido na linha) é equivalente — a mesma keyword fica fora pela data do `sem média`.

**Limites:** "Usar o resultado anterior" na Pesquisa por Assunto (reabrir as candidatas do
recibo sem consultar de novo) não foi feito — a prévia só avisa; o custo da IA aparece como
"1 chamada (OpenRouter, cobrada pelo uso)", sem valor em dólar (não há preço fixo no código);
"Revisar Silos com IA", "Revisar com IA" (Artigos), a SERP territorial (regra 7, ponto 8) e a
IA da diferenciação com DNA parcial (ponto 11) e as rotas de IA sem botão (ponto 13) seguem
como antes (backlog do Arquiteto); o "sem média" medido na preparação vale para a execução e
as preparações com os mesmos insumos (24 h), mas não é gravado no Minerador; o parecer da
formação confia no pedido para keyword fora do acervo da marca (só candidata montada pelo
próprio servidor) e quando a leitura falha.

### 18.4 F4 — o que foi feito (2026-10-14)

**Verificado no código / confirmado por teste (fixtures). Validado manualmente: não.**
Sem migration, sem SQL, sem escrita remota, sem chamada paga, sem deploy. Entregáveis (§3)
intocados: E0 com os mesmos hashes; dos arquivos do §2.1 da SDD acelerar, só
`lib/server/platform-mcp-tools.ts` foi tocado, e só nas ferramentas `improve_articles` e
`preview_published_reinforcement` (as de escrita — `get_article_for_writing`, `get_video_material`,
`get_writer_*` — não mudaram). Nada já
gravado é apagado ou muda de significado; nenhuma keyword sai do Arquiteto. Dono: Arquiteto;
consumidor: Minerador (caixa nova, só os núcleos dele).

**A regra no código:** nenhum arquivo de `app/api/arquiteto/**`, `modules/arquiteto/**` ou
`lib/server/arquiteto-*` importa ou chama núcleo do Minerador que escreve
(`measureKeywordVolume`, `runKeywordLogicWithCore`, `importSubjectDiscoveryWithCore`,
`applyKeywordDecisionEntries`, `handleGoogleAdsKeywordMetrics`, `approveAndSendDeps`,
`applyApproveAndSendOnServer`, `sendKeywordsToArquitetoOnServer`, `assignKeywordGroupWithCore`,
`setKeywordPlanLockWithCore`, `importDeclaredPlanWithCore`, exclusão do ciclo de vida, replay), nem
faz `.update/.insert/.upsert/.delete` em tabela `minerador_*`, nem RPC do Minerador, nem chama
`/api/minerador/*` — teste estrutural de lista fechada, comentários removidos, com amostras que
provam que o detector pega o que existia antes (`tests/arquiteto-so-le-keyword-2026-10-13.test.mts`).

**Inventário das escritas removidas ou redirecionadas** (linhas de antes → onde ficou):

| # | Antes (arquivo:linha) | O que escrevia no Minerador | Agora |
|---|---|---|---|
| W1 | `lib/server/arquiteto-article-improvement.ts:1187-1202` (`measureKeywordVolume` com replay, ator do Arquiteto) | medição em `minerador_keyword_metric_measurements`, `volume_search`/`volume_source`/`kgr_score`, `analise_semantica.volume_*` | a linha fica "Precisa do Minerador" (`measureKeywordIds`; `markImprovementMineradorNeeds` em `refreshPlan`, `:894`) e a gravação recusa (`:1202-1206`); a medição guardada vai na sugestão e o Minerador a grava pela caixa (`replayStoredMeasurements`, agora em `lib/server/minerador-architect-suggestions.ts`) |
| W2 | `:1226-1246` (`runKeywordLogicWithCore` nos membros sem intenção) | `intent` e `analise_semantica` (intenção, nicho, funil) | `logicKeywordIds` → "Precisa do Minerador"; Lógica sugerida |
| W3 | `:1247-1286` — import `:1252`, Lógica `:1259`, métricas `:1271-1275`, aprovação `:1276-1279`, envio `:1280`; aceite `:833` (`approveNewKeywords`); painel `modules/arquiteto/article-improvement-panel.tsx:100` (`approveNewKeywords: true` fixo) | insert `bruto`, `group_id` + evento do grupo, `intent`, volume, `status = 'aprovado'` + `aprovacao`, itens `keyword/architect` | `newKeywordIds` → "Precisa do Minerador"; sugestão `new_keyword` (com o Assunto de destino e a medição guardada); `approveNewKeywords: true` recusado (`:836`); o painel não manda mais a flag |
| W4 | `lib/server/arquiteto-published-reinforcement.ts:541-607` (import `:550`, Lógica `:566`, Volume `:569`, aprovação `:577`, envio `:581`); portas da rota `app/api/arquiteto/published-reinforcement/route.ts:69-117` (`importSubjectDiscoveryWithCore`, `runKeywordLogicWithCore`, POST em processo de `metricas-keywords`, `applyKeywordDecisionEntries`, `createMineradorArquitetoHandoff`); caixa "Eu aprovo…" no painel | os mesmos de W3 (sem `group_id`) | portas saíram; a keyword nova vira sugestão (`:547`, porta `recordMineradorSuggestions`, rota `:64`), fica "de fora" do artigo com o motivo (`:565`) e não ocupa vaga (`lib/arquiteto/published-reinforcement.ts`); `approveNewKeywords: true` → 422 `MINERADOR_DECIDES_NEW_KEYWORDS` (`:515`) |
| W5 | `modules/arquiteto/use-published-differentiation.ts:284-306` (POST pela tela em `/api/minerador/marcas/[brandId]/subject-discovery/import`); botão "Enviar ao Minerador" no painel | insert `bruto` / update de `analise_semantica`, volume do recibo, Lógica | o aceite grava a sugestão no servidor (`lib/server/arquiteto-differentiation.ts:655`, rota `cannibalization/apply:34`); o painel mostra "Abrir 'Sugestões do Arquiteto' no Minerador"; `differentiationIngestRequest` saiu do modelo |
| W6 | `lib/server/arquiteto-minerador-import.ts:85-103` (`approveAndSendDeps`: leitura e aprovação com o cliente operacional) e `:154-160` (aplicar com aprovação aberta quando havia `minerador:approve`) | `status = 'aprovado'` + `aprovacao` | portão com a aprovação SEMPRE fechada (`withoutArquitetoApproval`, `:100`), leitura com o cliente da sessão, envio pelo handoff do Arquiteto (`:117`); "precisa aprovar no Minerador" e "Aprovar no Minerador (N)" no modal (`modules/arquiteto/minerador-import-dialog.tsx:378`, `:460`) |
| W7 | `modules/arquiteto/arquiteto-workspace.tsx:8043-8119` (POST `/keywords/delete/preview` `:8055` e `/keywords/delete` `:8076`, sem `allowRecoverable`) e diálogos `:20923-20931` | DELETE do ciclo de vida (lixeira de publicada) | "Excluir no Minerador" (`:8050`, botão `:20789`) leva ao Minerador com as linhas marcadas (`?arquiteto=selecionar`); a exclusão é a do Minerador, com a prévia e a confirmação de sempre |
| W8 | `app/api/arquiteto/silos/route.ts:56-61` (insert em `minerador_keyword_lists`, rota sem chamador) | lista nova | id do Silo gerado na rota (`:63`); nada no Minerador |
| MCP | `lib/server/platform-mcp-tools.ts:1419-1420` (`improve_articles` apply com `minerador.write` e `minerador:approve`) | (o mesmo de W1–W3) | apply com `arquiteto.write` + `platform.decide` e só as permissões do Arquiteto (`:1420`); descrição com `needsMinerador` |

W9 ("Tirar do plano" na barra global) continua: é ação do Minerador num componente compartilhado
(§6.2). A Pesquisa por Assunto no Arquiteto já era um link para a tela do Minerador (conferido).

**D3 no código — "Sugestões do Arquiteto":** contrato `lib/arquiteto/minerador-suggestions.ts`
(`architect-minerador-suggestions@1`; tipos `new_keyword`, `measure`, `logic`; normalização igual
à do Minerador, com teste de paridade), escritor único `recordArquitetoMineradorSuggestions`
(`lib/server/arquiteto-minerador-suggestions.ts`): um item `editorial_workflow_items`
(`subject_type = "architect_minerador_suggestions"`, etapa `architect`, chave
`improvement:<runId>` | `reinforcement:<operationRequestId>` | `differentiation:<grupo>:<rodada>`),
a medição do Google Ads guardada só no servidor. Sem migration (`subject_type` é texto livre).
Escolhemos UM registro para as três origens (em vez de a caixa ler três artefatos diferentes): a
melhoria grava o dela a partir da execução (chave = `runId`), como D3 pede.

**A caixa do Minerador** ("Sugestões do Arquiteto · cor X"): botão na barra do Processador e link
do Arquiteto (`?arquiteto=sugestoes&cor=…`); `GET/POST /api/minerador/marcas/[brandId]/architect-suggestions`;
lista leve (`payload->items`, keywords em colunas estreitas), estado de agora por linha, cor = a
do artigo de destino, a sugestão mais nova vence, 30 dias. "Trazer para o Minerador" → prévia
(`decisionHash`) → aplicar SÓ pelos núcleos do Minerador com a permissão de quem clicou
(`importSubjectDiscoveryWithCore` + Lógica; `measureKeywordVolume` com replay, sem consulta nova;
`runKeywordLogicWithCore`) → releitura; aprovar e enviar é o "Aprovar e enviar" de sempre, aberto
com as keywords certas. O Minerador também lê `?arquiteto=aprovar|selecionar` (D2 e W7).

**Catálogo e MCP (§17.1):** operação nova `minerador.architect_suggestions` (rota nova, `access: "ui"`);
notas em `arquiteto.article_improvement`, `arquiteto.import_from_minerador`,
`arquiteto.published_reinforcement`, `arquiteto.published_differentiation`,
`minerador.send_to_arquiteto`, exclusão de keywords e no playbook da melhoria; descrições de
`improve_articles` e `preview_published_reinforcement`.

**Testes:** novo `tests/arquiteto-so-le-keyword-2026-10-13.test.mts` (12, `test:arquiteto`) e o caso
DOM "Precisa do Minerador" (`test:arquiteto:dom`). Comportamento com portas que contam chamadas: a
melhoria com keyword nova, medição pendente ou sem intenção fica "Precisa do Minerador", grava a
sugestão e o apply recusa com **zero** chamadas ao Minerador; a melhoria só com recebidas grava o
ArticleDNA; o ciclo completo da medição única (preparo mede uma vez → Arquiteto não grava →
Minerador grava pelo replay sem nova consulta → nova preparação lê e grava só o ArticleDNA); o
Reforçar grava a sugestão e o artigo só com as recebidas, sem escrita em tabela `minerador_*`; o
modal só envia as aprovadas e nunca chama a aprovação; a caixa lista por cor, a prévia não grava,
aplicar chama só os núcleos do Minerador e devolve o "Aprovar e enviar". Ajustes declarados (o
contrato mudou): `arquiteto-article-improvement-server` (6 casos reescritos e a fixture da lista
com a intenção), `arquiteto-reforcar-publicados` (domínio, tela e servidor), `arquiteto-diferenciacao-publicados-tela`,
`arquiteto-importar-do-minerador-2026-10-13`, `arquiteto-fechamento-por-aba`,
`arquiteto-selected-keyword-delete-lifecycle`, `arquiteto-plano-declarado-portaria`,
`ler-antes-de-buscar-2026-10-13` e `arquiteto-article-improvement-dom`.

**Suítes (antes → depois):** Minerador por glob 1325 → 1325, as mesmas 28 linhas `not ok`
(comparadas por nome, TAP; a base desta máquina difere da contagem do §18.3 por arquivos de outra
frente); `test:arquiteto` 2943 → 2955; `test:arquiteto:servidor` 142 → 142; `test:arquiteto:lentes`
102 → 102; `test:arquiteto:dom` 17 → 18; `test:agent` 90 → 90; `test:redator:mcp` 150 → 150;
`test:radar` 3577 (1 pulado, 0 falha; E0 com os mesmos hashes; o total cresceu com a frente do
Silo interligado); `test:editorial` com as mesmas 4 falhas antigas (rotas e páginas, não tocadas);
`tsc` 0; eslint dos arquivos tocados sem erro novo (os erros que restam em `arquiteto-workspace.tsx`
e `minerador-workspace.tsx` são antigos); `git diff --check` limpo.

**Limites:** keyword nova sugerida para um **publicado** é importada sem cor (o import do Minerador
só liga ao grupo quando o destino é Assunto); "Tirar do artigo" (W7 da §6.2) não foi feito — o
Arquiteto leva à exclusão do Minerador; a caixa não abre o diálogo do Volume (marca as linhas para
o botão); sugestões na caixa por 30 dias (até 60 registros); `run_keyword_logic` e
`import_subject_keywords` (MCP) seguem sem `userConfirmation` (backlog do Minerador). A tela não foi
validada manualmente.

### 18.5 F5 — o que foi feito (2026-10-14)

**Verificado no código / confirmado por teste (fixtures). Validado manualmente: não.**
Sem migration, sem SQL, sem escrita remota, sem chamada paga, sem deploy. Entregáveis (§3)
intocados: E0 com os mesmos hashes (`tests/fixtures/entregaveis-2026-10-13.sha256.json` não foi
tocado); dos arquivos do §2.1 da SDD acelerar, só `lib/server/platform-mcp-tools.ts` foi tocado, e
só no texto da descrição de `improve_articles` (as ferramentas de escrita não mudaram). Nada é
gravado no Minerador (F4 vale inteira). Dono: Arquiteto. O grafo de links internos e o Radar não
foram tocados (frente do Silo interligado em curso).

1. **A planilha "Artigos do plano"** (`modules/arquiteto/plan-article-sheet.tsx`; domínio puro
   `lib/arquiteto/plan-article-sheet.ts`), em Artigos novos, logo abaixo da faixa de "Processar
   artigos"/"Concluir formação": uma linha por keyword RECEBIDA que carrega Assunto com plano do
   pacote aprovado desta marca (`readArchitectSubjectStanding`: `declared`, `received`,
   `approvedPackageRef`, `plan`), assim que chega — sem ArticleDNA nascer por isso. Colunas: seleção ·
   cor (etiqueta, `EditorialGroupTag`) · ordem · papel · Assunto (título do cadastro) · keyword ·
   trava (rótulo da leitura única `declaredPrincipalLock` e o porquê) · volume (`readKnownVolume` da
   F3, com a data, "sem média", "sem volume medido", "de outra fonte") e as sustentações da lista do
   Assunto (quantas, quantas com volume) · SERP (lentes no cache, lidas de graça por
   `POST /api/arquiteto/serp-subject`; vencida conta como falta) · formação (Aguardando formação ·
   Formado · vN · No Radar · vN · Aguarda a principal declarada) e o resultado da última ação ·
   ações. Ordem: cor (ordem da paleta), grupo, ordem do plano. **Recorte:** a cor ativa da etiqueta
   (`arquitetoGroups.filter`, `editorialGroupFilterMatches`), com "Marcar toda a cor <cor>".
   O §9.2 chamava isto de "estado novo de pipeline `plan_article`": em vez de mexer no
   `article-pipeline.ts`, a linha do plano é a sua própria projeção (mesmo contrato: linha não é
   Article).
2. **Validar SERP (linha e lote)** — o caminho da mesa, sem paralelo: `runPaidSerpBlocks` sobre a rota
   `keyword-serp` com `onlyMeasuredVolume: true` (o servidor relê o volume no banco e tira do plano a
   keyword sem volume — recusa por item com o motivo), cache de 30 dias primeiro, blocos de 6, o plano
   somado em UMA confirmação ("Validar SERP · custo antes": "Até N chamada(s) paga(s)… ≈ US$ …"; "já
   temos as 4 lentes" = sem custo; "sem volume" = fora), cancelar não paga, execução com o autorizado
   de cada bloco, lacuna por lente na linha, a coluna SERP relida do cache.
3. **Trocar principal (só Livre)** — a linha travada não mostra o botão; mostra "Principal travada ·
   mude a trava no Minerador". Candidatas pela regra ÚNICA `planPrincipalSwapCandidates` (a mesma na
   tela e no servidor): a keyword do Assunto (quando não é a principal atual) e as sustentações com
   volume medido da lista do Assunto (`declaredPlanSubjectList(suggestSubjectSupport(…))`), não
   publicadas, recebidas, sem artigo de outro Assunto; ordem: mais lentes de SERP no cache, depois mais
   volume. Escolha (seletor por linha) → "Ver prévia da troca (grátis)" = `prepare` com
   `principalChoice` → "Confirmar a troca" = `apply` → nova versão do ArticleDNA
   (`primaryKeywordDecision`; D1-ter). No núcleo (`enforceChosenPrincipals`, depois da leitura da
   SERP/IA/lista e da principal declarada): a escolhida vira a principal; a anterior fica secundária,
   exceto a keyword que carrega o Assunto, que sai das keywords e continua como o Assunto (a regra de
   `attachSubjectToArticleDna`); nada mais entra pela troca; travada (`declaredPrincipalId`) nunca
   troca; escolha fora da regra = a linha fica `no_alternative` com o motivo. A SERP da composição
   continua decidindo pelo cache no `refreshPlan`.
4. **Concluir formação (linha e lote)** — a melhoria recortada pelo grupo da linha, um `prepare` por
   grupo (`group: <groupId>`, `targetIds`, `origin: "plan_sheet"`; grátis, só lê) → prévia por linha
   (`planSheetPreviewLines`: "Vai gravar: primeiro ArticleDNA (v1)" ou "nova versão (vN+1)" com a
   principal; "Já formado e adequado"; "Precisa do Minerador" com o link para "Sugestões do
   Arquiteto · cor"; "Falta SERP da composição: use Validar SERP"; recusa com o motivo útil do núcleo,
   ou a saída quando o motivo é o genérico) → "Concluir formação (N)" = `apply` só das prontas, um
   artigo por chamada, com o andamento → ArticleDNA, composição, parecer e marcador relidos pelo
   núcleo → `onApplied` relê a mesa. Antes do servidor, a tela recusa por item a linha sem Silo, sem
   grupo ou que aguarda a principal declarada.
5. **Núcleo, aditivo** (`lib/arquiteto/article-improvement-request.ts`, `lib/arquiteto/article-improvement.ts`,
   `lib/server/arquiteto-article-improvement.ts`): `origin: "plan_sheet"` — gravado na execução; o
   prepare devolve em `refusedTargets` (por item, com o motivo: aguarda a principal declarada ou a
   conversão; não recebida; fora do recorte) o alvo pedido que não é alvo, e o resto do lote segue (sem
   a origem, o lote inteiro recusa como antes); `principalChoice` (alvo → keyword, até 200);
   `excludePlanArticles` (o Assunto com plano sai dos alvos). Ausentes = o contrato de sempre (teste).
   Nenhum caminho novo de escrita: o apply é o de sempre.
6. **O painel de texto fica para publicados:** saíram de `modules/arquiteto/article-improvement-panel.tsx`
   o `planGroups` e os botões "Formar os artigos do plano · cor"; o prepare manda
   `excludePlanArticles: true`; o painel não retoma execução `origin: "plan_sheet"` (a planilha retoma
   a dela: "Continuar a gravação", sem novo aceite). O Assunto sem plano (formato anterior) continua
   no painel — não há linha de plano para ele. **As outras portas apontam para a planilha:** a recusa
   de "Processar artigos" com artigo do plano, o aviso de "Aplicar o plano ao Silo"
   (`lib/arquiteto/silo-declared-plan-application.ts`) e a mensagem da principal travada
   (`declaredPrincipalLockedMessage`).
7. **Catálogo e MCP (§17.1):** operação nova `arquiteto.plan_articles_sheet` (`access: "ui"`; rotas
   `article-improvement`, `keyword-serp`, `serp-subject`, as de sempre); textos de
   `arquiteto.article_improvement`, `arquiteto.form_architecture`, `arquiteto.apply_declared_plan_to_silo`,
   "Tirar do plano" e do playbook (que guarda o nome antigo como "antes"); `improve_articles` descreve
   `targetIds`, `principalChoice`, `origin` e `excludePlanArticles` (o schema da ferramenta é o da
   rota). **Não** foram criadas as ferramentas `form_plan_articles`/`validate_plan_serp` do §9.2: o chat
   segue por `improve_articles` com o grupo (mesma prévia, aceite e apply) — backlog.

**Testes:** novo `tests/arquiteto-planilha-primeiro-2026-10-14.test.mts` (12, `test:arquiteto`: o caso
real da WifiConecta — azul, 7 linhas, ordem 9–15, Pilar "internet fibra óptica", 6 travadas e
"diferença entre internet e Wi-Fi" livre — em `tests/arquiteto-planilha-primeiro-fixtures.mts`;
recorte por cor; estado da formação; SERP; cada ação com prévia, custo e recusa por item; candidatas;
núcleo da troca; contrato aditivo; estruturais com comentários removidos: a planilha só chama
`article-improvement`, `keyword-serp` e `serp-subject`, nada de `/api/minerador`), novo
`tests/arquiteto-planilha-primeiro-dom-2026-10-14.test.mts` (5, `test:arquiteto:dom`: 7 linhas e o botão
só na livre; Validar SERP com o custo, cancelar não paga, confirmar coleta, resultado e releitura;
Concluir formação com recusa por item, uma confirmação, só as prontas e releitura; Trocar principal
com a escolha e a prévia; lote só com travadas não vai ao servidor; zero pedido ao Minerador) e 4 casos
F5 em `tests/arquiteto-article-improvement-server.test.mts` (`test:arquiteto:lentes`, portas que contam
chamadas: troca da livre grava a nova principal com o Assunto preservado; travada e candidata de fora
recusam por linha; recusa por item com `origin` e o contrato de sempre sem ela, Concluir formação
grava e relê; `excludePlanArticles`; **zero** medição, Lógica, importação, replay ou consulta ao
Minerador). Ajuste declarado (o contrato mudou): `tests/arquiteto-acelerar-f4-plano-de-ponta-a-ponta.test.mts`
(a porta do plano saiu do painel e é a planilha).

**Suítes (antes → depois):** Minerador por glob 1347 → 1347, as mesmas 25 falhas antigas (comparadas
por nome, TAP); `test:arquiteto` 2955 → 2967; `test:arquiteto:servidor` 142 → 142;
`test:arquiteto:lentes` 102 → 106; `test:arquiteto:dom` 18 → 23; `test:agent` 90 → 90;
`test:redator:mcp` 150 → 150; `test:radar` 3592 (1 pulado, 0 falha; E0 com os mesmos hashes; o total
cresceu com a frente do Silo interligado); `test:editorial` com as mesmas 4 falhas antigas (rotas e
páginas, não tocadas); `tsc` 0; eslint dos arquivos novos e tocados sem erro novo (os de
`arquiteto-workspace.tsx` são antigos, nenhum nas linhas desta fase); `git diff --check` limpo; o
guarda visual não aponta nada nos arquivos novos.

**Limites:** "Abrir DNA" e "Ver no Silo" na linha não foram feitos; "Fora do plano" continua selo da
mesa, não linha; Validar SERP coleta as 4 lentes de cada keyword da linha (a composição é conferida
pelo cache no Concluir formação); a linha sem Silo é recusada (o Silo vem de "Processar arquitetura" +
confirmação); o Assunto sem plano (formato anterior) continua no painel de texto; sem ferramentas MCP
próprias da planilha; a tela não foi validada manualmente (dark mode e 360/768/1024/1440 px são da
homologação do dono).

### 18.6 F6 — o que foi feito (2026-10-14)

**Verificado no código / confirmado por teste (fixtures). Validado manualmente: não.** Autorização do
dono (2026-10-14): "pode concluir as pendências, vou testar depois". Migration **escrita e NÃO
aplicada**; sem SQL de escrita, sem escrita remota, sem chamada paga, sem deploy. Leitura remota só por
`SELECT` (medição, esquema, grants e o ensaio da projeção do parecer escrita como SQL em linha). Entregáveis
(§3) intocados: E0 com os mesmos hashes (`tests/fixtures/entregaveis-2026-10-13.sha256.json` não foi
tocado); nenhum arquivo do §2.1 da SDD acelerar foi editado; o teste estrutural dos entregáveis passou a
proibir também os leitores leves da F6.

1. **Migration M-L** `supabase/migrations/20261016120000_listas_leves.sql` (rollback em
   `supabase/rollback/20261016120000_listas_leves.rollback.sql`; conferência só leitura em
   `supabase/scripts/20261016120000-listas-leves-post-verifier-read-only.sql`). Cria, sem tocar tabela,
   gatilho nem dado: a função pura `minerador_jsonb_por_formato(jsonb, jsonb)` (recorte por árvore de
   formato); `minerador_keyword_analise_leve(jsonb)` (a árvore `KEYWORD_LIGHT_SHAPE`, literal igual ao
   TypeScript — teste); a view **`minerador_keywords_lista_leve`** (colunas da tabela + `analise_leve` +
   `dna_hash`, só vivas); as funções da projeção do parecer e a view **`arquiteto_formation_serp_lista_leve`**
   (a projeção da F2 feita NO BANCO; acréscimo desta fase ao §11.1, pedido pelo próprio §18.2: "o corte no
   banco precisa da view/coluna gerada da F6"); e a view **`editorial_article_dna_lista_leve`** do §11.1 (sem
   consumidor nesta fase — ver limites). As três views são `security_invoker = true`; grants iguais às
   tabelas base (SELECT para `authenticated` e `service_role`; nada para `anon`/PUBLIC). Guardas (tabelas,
   colunas, `group_id`, objetos já existentes), pós-checagem (uma linha por keyword viva; a projeção só tira
   chaves; identidade, base, veredito, interpretação, decisão humana e nº de consultas do parecer intactos;
   uma linha por ArticleDNA; `security_invoker`; `anon` sem SELECT) e ensaio por `RAISE EXCEPTION 'ENSAIO'`.
2. **A árvore da projeção das keywords** (`lib/minerador/keyword-light-list.ts`) não foi escolhida à mão:
   saiu do registro de leitura (Proxy que anota cada caminho lido) dos resolvers da planilha sobre as 326
   keywords vivas das 4 marcas e foi provada por paridade (abaixo). Raiz por lista de permissão (as 47
   chaves que a planilha lê ou sonda); blocos pesados recortados às sub-chaves lidas; fora: séries de
   medição, `dna_campos_logicos`, `evidencias_logicas`, `site_origins`, `subject_discovery`, `funnel_evidence`,
   proveniência (targeting, ids de requisição, histórico do vínculo, quem/quando concluiu a revisão).
3. **A aprovação na lista leve.** A assinatura do pacote aprovado cobre o DNA inteiro e não pode ser
   calculada sobre a projeção. A view devolve `dna_hash` (md5 de tudo o que a assinatura pode ler) e a tela
   guarda o VEREDITO (diverge · não diverge) calculado na linha inteira, por `id + dna_hash`, num cache de
   apresentação (`localStorage`, chave `minerador:lista-leve:v1:<ator>:<marca>:aprovacao`, nunca limpo, só
   acrescido). `approvedPackageDiverged` usa o veredito da marca; sem veredito, a assinatura da projeção não
   bate e a keyword aparece divergente (nunca "aprovada" por suposição); `buildApprovedPackage` recusa a
   linha leve. O veredito só é guardado quando o `dna_hash` lido antes é o mesmo lido depois da linha
   inteira (sanduíche). **1ª carga da marca no navegador:** a listagem de antes (DNA sem séries) + só
   `id,dna_hash` da view, e os vereditos são semeados — ler leve + inteira das aprovadas custaria mais
   (AdalbaPro: 183 de 183 aprovadas). **Da 2ª carga em diante:** a lista leve; a linha inteira só das
   aprovadas que mudaram.
4. **Processador** (`modules/minerador/minerador-workspace.tsx`): lê a view leve; sem ela (42P01/PGRST205)
   a sessão volta à listagem de antes, e qualquer outro erro derruba a carga (a lista não é trocada por uma
   parcial). **Detalhe por id:** o painel do DNA lê a linha inteira daquela keyword ao abrir; a seleção (que
   comanda as ações) lê as selecionadas (blocos de 200); cada ação de uma linha (Revisão Humana, KGR da
   linha, Potencial, posto, vínculo de publicação) lê a linha inteira na entrada; nenhuma linha já inteira
   (gravada depois) é trocada. **Nenhuma operação sobre a linha leve:** o portão comum dos lotes
   (`startBulkProgress`) recusa e pede o DNA; a marca `__lista_leve` viaja em qualquer spread e é recusada
   por `assertFullKeywordSemanticForWrite` e pela guarda de TODO escritor (`guardKeywordSemanticWrite`,
   código `LIGHT_ROW_WRITE`, que também vale no servidor e no MCP); o **CSV com todas as chaves** lê as
   selecionadas inteiras e não exporta nada se alguma ficou leve (decisão: inteiro por id na tela, em vez
   de rota em stream no servidor — o CSV depende das tentativas da sessão, que o servidor não tem). As
   operações de marca inteira do Minerador já iam ao servidor por id (Lógica em lote, Volume, Resultados,
   aprovação, envio, plano, trava) ou são só texto (duplicados).
5. **Arquiteto:** o `GET /api/arquiteto/workspace` e a releitura (`POST …/workspace/delta`) leem os
   pareceres da formação pela view (`listArticleFormationSerpForList`); sem a view, a projeção no Node de
   antes; outro erro lança. O corpo é IGUAL com e sem a view (teste). Exportação (`serpDetail=full`),
   melhoria (um parecer por `candidateRef`), Reforçar publicados, conversão, backup e as escritas continuam
   lendo o parecer inteiro da tabela. A projeção SQL foi conferida contra a do Node nas linhas reais da
   WifiConecta (SELECT só leitura com a mesma SQL em linha): **61 de 61 iguais**.
6. **Catálogo (§17.1):** nota da F6 na leitura por grupo/listas leves (nenhuma ferramenta MCP mudou: elas
   leem por id, inteiro).

**Medição (SELECT no banco remoto, bytes `length(x::text)`, 2026-10-14):**

| | AdalbaPro antes | AdalbaPro depois | WifiConecta antes | WifiConecta depois |
|---|---|---|---|---|
| Processador, banco (listagem `t::text`) | 2.015.724 B / 183 | 1ª carga no navegador: ~2,05 MB (listagem + `id,dna_hash` 2×); depois: ~1,02 MB (ESTIMADO) | 455.695 B / 64 | 1ª: ~0,47 MB; depois: ~0,27 MB (ESTIMADO) |
| Processador, resposta JSON (medido sobre as linhas reais) | 1.788.431 B (listagem) | **902.321 B** (−49,5%) | 409.819 B | **237.985 B** (−42%) |
| Pareceres da formação, banco | 9.764.117 B / 200 | **2.430.928 B** (−75%, medido: SQL da view em linha) | 3.059.002 B / 61 | **883.643 B** (−71%) |
| ArticleDNA (todas as versões / vigente leve) | 7.177.999 B / 102 | view leve sem consumidor (§11.1 estimava ~12,7 kB) | 1.089.092 B / 20 | idem |

O "depois" do Processador em bytes do banco é ESTIMADO (proporção listagem banco/JSON); o número
exato sai da conferência pós-aplicação (`supabase/scripts/20261016120000-listas-leves-post-verifier-read-only.sql`).
**Abertura do Arquiteto (AdalbaPro):** banco ~22,1 MB → **~14,8 MB** (−7,3 MB dos pareceres); tela
**~16,0 MB, igual** (a tela já recebia o parecer projetado no Node). **Meta "abertura < 1 MB": NÃO
atingida.** Meta do Processador (§8.3, "~50–100 kB"): **não atingida** — os resolvers do Minerador leem o
`logical_output_contract` inteiro (estado e valor de cada campo, para a completude da Lógica do filtro
"Com processo") e outros blocos pesados; chegar a ~50 kB exige colunas DERIVADAS no servidor (o veredito
e os rótulos calculados), não uma view de recorte.

**Testes:** `tests/listas-leves-paridade-2026-10-13.test.mts` (10, `test:arquiteto`: a árvore SQL = TS;
paridade de cada coluna e de todos os filtros/ordenações em 33 keywords reais das 4 marcas — uma por
combinação de estado — e em 6 sintéticas de borda; veredito; plano da carga; marca recusada na escrita;
estrutura da migration e do rollback; nenhum caminho de escrita/entregável lê a lista leve), apoio
`tests/listas-leves-f6-row-model.mts` e `tests/fixtures/listas-leves-f6-keywords.json`;
`tests/minerador-lista-leve-f6-2026-10-14.test.mts` (8, glob do Minerador: carga com recuo, 1ª carga,
veredito, detalhe por id, portão dos lotes, ações de uma linha, guardas de escrita, CSV, cache nunca
limpo); `tests/arquiteto-listas-leves-f6-servidor-2026-10-14.test.mts` (6, `test:arquiteto:servidor`: corpo
igual com e sem a view, bytes do banco, o que portão/veredito/canibalização leem sobrevive, recuo só com a
view ausente, releitura pela view, exportação inteira, operações de marca inteira sem leitor leve).
Mutantes em memória sobre a árvore (suíte verde): 18; 17 mortos; o vivo (`logicProcessorVersion`) é chave
sondada mantida por cautela. Ajustes declarados: `tests/arquiteto-listas-leves-f2-2026-10-14.test.mts` (a
projeção da lista foi para o banco; regex dos entregáveis ampliada), `tests/listas-leves-fake-db.mts`
(views `*_lista_leve` não registradas respondem PGRST205), os dublês da loja do parecer em
`arquiteto-quatro-lentes-rota` e `arquiteto-serp-no-artigo-rota`, e `minerador-assunto-nunca-se-perde`
(deixou de ser a ÚLTIMA migration: só as reservadas por esta SDD — M-L e M-E — vêm depois).

**Suítes (antes → depois):** Minerador por glob 1347 → 1355, as mesmas 25 falhas antigas (TAP, por
nome); `test:arquiteto` 2980 → 2990; `test:arquiteto:servidor` 142 → 148; `test:arquiteto:lentes` 106 →
106; `test:arquiteto:dom` 23 → 23; `test:agent` 90 → 90; `test:redator` 361 → 361; `test:redator:mcp`
150 → 150; `test:radar` 3671 (1 pulado, 0 falha; E0 com os mesmos hashes; o total cresceu com a outra
frente); `test:editorial` com as mesmas 4 falhas antigas; `test:editorial:dom` 12 (0 falha); `tsc` 0; eslint
dos arquivos tocados sem erro novo (os de `minerador-workspace.tsx` são antigos); `git diff --check` limpo.

**Limites (o que a F6 NÃO fez):** (a) a mesa (`/api/editorial/workspace`) e as planilhas do Radar,
Redator e Publicações continuam recebendo ArticleDNA e itens do Radar inteiros — o `ArticleDNASchema` é
`.strict()` com `superRefine` (projeção não passa no contrato da mesa nem da cópia local), a linha do Radar
é montada no cliente sobre a investigação inteira, e as planilhas do Radar/Redator estavam com outra frente
em curso; a view `editorial_article_dna_lista_leve` fica pronta para essa fatia (contrato leve próprio);
(b) o Arquiteto continua recebendo as keywords recebidas, o pacote aprovado dos itens e o ArticleDNA
vigente INTEIROS — a tela cria ArticleDNA a partir dessas linhas (cópia do KeywordDNA) e roda Processar
arquitetura, canibalização, "mesmo assunto", links entre Silos e o ponto de recuperação sobre elas; levá-los
à lista leve exige mover a criação do ArticleDNA e essas operações para o servidor (SDD própria); por isso
nenhuma dessas operações ficou parcial — elas leem exatamente o que liam; (c) Processador acima de
~50–100 kB (ver acima); (d) a 1ª carga de cada marca em cada navegador custa o mesmo de antes (+~2%); (e)
o painel do DNA mostra a linha leve por ~1 leitura até a linha inteira chegar; (f) a coluna `row_version`
(migration `20260923140000`, não aplicada) continua fora; (g) nada foi validado na tela (dark mode,
larguras, abrir painel, selecionar, CSV) — homologação do dono depois de aplicar a M-L.

### 18.7 F7 — o que foi feito (2026-10-14)

**Verificado no código / confirmado por teste (banco de mentira). Validado manualmente: não.** Autorização do
dono (2026-10-14): "pode concluir as pendências", incluindo o item 6 pedido em 2026-10-13. Migration M-E
**escrita e NÃO aplicada**; sem SQL de escrita, sem escrita remota, sem chamada paga, sem deploy; leitura
remota só por `SELECT` (assinaturas e grants das RPCs de ciclo de vida, gatilhos de `minerador_keywords`,
`CHECK` dos eventos do grupo, histórico de migrations). **Nenhuma exclusão foi chamada contra banco real**
(os testes usam `tests/excluir-cor-fake-db.mts`). Entregáveis (§3) intocados: E0 com os mesmos hashes
(`tests/fixtures/entregaveis-2026-10-13.sha256.json` não foi tocado); nenhum arquivo do §2.1 da SDD acelerar
foi editado. Dono: Minerador (D8: só ele executa nesta SDD).

1. **Migration M-E** `supabase/migrations/20261016130000_excluir_tudo_da_cor.sql` (rollback
   `supabase/rollback/20261016130000_excluir_tudo_da_cor.rollback.sql`; conferência só leitura
   `supabase/scripts/20261016130000-excluir-tudo-da-cor-post-verifier-read-only.sql`). O §11.2 com três
   acréscimos: (a) com JWT, o ator tem de ser quem chama (`auth.uid()`); a rota usa o `service_role` depois
   de `requireTenantPermission(minerador:manage)`, como as RPCs vizinhas (preview/restore/purge, só
   `service_role` — conferido); (b) o grupo tem de ser da marca e as linhas do bloco são travadas (`FOR UPDATE`)
   antes de conferir "todas vivas desta cor"; (c) a liberação acrescenta uma linha ao `keyword_subject_history`
   (plano e título que saíram, com o marcador). Mais a função só leitura
   `lifecycle_delete_group_keywords_contract()` (a rota habilita o botão quando ela responde). Guardas
   (exclusão comum, permissão, gatilhos do Assunto LIGADOS, `group_id`, funções já existentes), pós-checagem
   (SECURITY DEFINER, `anon`/`authenticated` sem EXECUTE, `service_role` com, a exclusão comum e os seis
   gatilhos intactos) e ensaio funcional numa keyword real, desfeito: (5.1) sem a liberação, a exclusão
   comum é recusada pelo gatilho (`KEYWORD_DELETE_SUBJECT_PROTECTED`); (5.2) a função libera e exclui na mesma
   chamada; grupo de fora recusa; (5.3) publicada com Assunto: recusada sem a declaração (e o Assunto NÃO fica
   liberado) e na lixeira de 24 h com ela. Conferido por SELECT antes de escrever:
   `minerador_keywords_trava_identidade_publicada` só repõe slug/endereço e `trg_protect_published_keyword`
   só recusa campos estruturais — a liberação do Assunto de uma publicada passa (a dúvida do §11.2).
2. **Domínio** `lib/minerador/group-delete-all.ts` (puro): prévia (`buildGroupDeleteAllPreview`), recusa por
   item — `blocked_descendant` (documento no Redator), `architect_reference` (ArticleDNA VIGENTE de artigo
   não retirado: o último evento da versão vigente não é `rejected`/`superseded`; caminho "Retirar artigo do
   Silo"/"Tirar do plano"), `published_not_included` (D6), `subject_of_other_color`,
   `principal_of_other_color`, `principal_outside_color`, `same_article` (o artigo do plano — Assunto +
   principal declarada — sai inteiro ou fica inteiro, para nunca sobrar marca apontando para Assunto
   apagado), `lifecycle_unread`; blocos de até 100 sem partir artigo; o plano depois (`unchanged`,
   `reduced`, `cleared`); a cor no fim (D7, com os motivos); as áreas (D8, com os itens); a confirmação forte
   (`checkGroupDeleteAllConfirmation`, a MESMA normalização do nome digitado da exclusão comum); o registro
   do histórico (`groupDeleteAllEventPayload`).
3. **Núcleo** `lib/minerador/group-delete-all-core.ts` e rota `POST /api/minerador/marcas/[brandId]/keywords/delete-group`
   (`minerador:manage`): prévia só leitura (colunas estreitas; impacto pelo `lifecycle_preview_minerador_keywords`
   de sempre; metadados do ArticleDNA por caminho JSON; eventos de status só das vigentes que citam a cor);
   apply só com o MESMO `decisionHash` e a confirmação conferida no servidor; blocos pela RPC; releitura de
   cada id; **(b) depois de (c)** — diferença declarada do §10.2 item 4: o plano do grupo é recalculado
   DEPOIS da exclusão, do que ficou vivo no plano (`syncDeclaredPlanAfterColorDeletionWithCore`, aditivo em
   `declared-plan-withdraw-core.ts`: v+1 com o restante pelo `declareEditorialGroupPlan` de sempre, ou plano
   limpo por `clearEditorialGroupPlan`), porque assim uma recusa da RPC nunca deixa o plano sem o artigo que
   ficou; evento `keywords_unassigned` (via, `decisionHash`, ids, textos, Assuntos liberados, contagens por
   bloco e por área); D7 com releitura da ocupação: Silo SEM SiloDNA desligado (`unlinkEditorialGroupSilo`;
   o registro vai no `archived`), grupo arquivado pelo `updateEditorialGroup` de sempre (`eventPayload`
   aditivo). **Retomada:** o que já saiu não volta à prévia; o resto pede prévia nova e confirmação nova
   (a confirmação é por operação, `AGENTS.md` §15) — não "o mesmo `decisionHash`" do §10.2 item 5.
4. **Plano limpo** = `plan`/`plan_hash` nulos, `plan_version + 1`, origem de volta a `manual` (o `CHECK`
   `plan IS NULL OR origin = 'declared_plan'` aceita); `ensureEditorialGroupForColor` reativa o grupo
   arquivado sem plano (teste). No "Gerenciar a cor", "tem plano" passou a ser só a origem `declared_plan`.
5. **Tela:** `components/editorial/group-delete-all-dialog.tsx` (novo); "Excluir tudo da cor X…" no menu da
   etiqueta (só no Minerador, com a cor escolhida) e no "Gerenciar a cor" (seção nova; nas outras áreas, só
   o link "Abrir no Minerador para excluir" → `?excluir_tudo_da_cor=<cor>`, lido uma vez pela etiqueta do
   Minerador); moldura comum extraída para `components/editorial/group-dialog-frame.tsx` (as mesmas classes;
   botão `danger` da exclusão comum); a planilha do Minerador tira as linhas confirmadas pelo servidor
   (evento `minerador:excluir-tudo-da-cor`). Histórico do grupo: as três linhas da operação têm detalhe
   próprio (`lib/editorial/group-history.ts`).
6. **Defeitos achados no caminho (§10.2):** a exclusão comum do Minerador não fatiava seleções acima de 100 — agora prévia e
   execução vão em blocos de 100 (a declaração da publicada só no bloco que tem publicada da prévia; o
   primeiro bloco recusado para a sequência e a tela diz quantas saíram); catálogo: a exclusão da não
   publicada não tem "janela de restauração"; a retirada não é exclusão (`apply_declared_plan_to_silo` com
   `withdrawNonPlan` retira, com aceite). O do Arquiteto (sem `allowRecoverable`) já tinha saído na F4.
7. **Catálogo e MCP (§17.1):** operação `minerador.delete_group_keywords` (`access: "ui"`, "A IA nunca exclui");
   nota em `minerador.keyword_lifecycle`. Nenhuma ferramenta MCP nova (teste estrutural).

**Ordem de aplicação (dono):** a M-E depende só da `20261015120000` (aplicada); a ordem com a M-L não importa
(uma não usa nada da outra). Ensaio → `npx supabase db query --linked -f supabase/migrations/20261016130000_excluir_tudo_da_cor.sql`
→ `npx supabase migration repair --status applied 20261016130000 --linked` → conferência pelo script só leitura.

**Testes:** novos `tests/minerador-excluir-tudo-da-cor-2026-10-14.test.mts` (12, glob do Minerador: prévia e
motivos sem escrever; D6 com o nome digitado; confirmação forte e decisão velha; Assunto liberado e excluído
na mesma chamada e, sem a liberação, a recusa do gatilho; D7 com plano limpo, Silo desligado, cor liberada e
reativação sem plano; Silo consolidado prende a cor; blocos de 100 com um recusado; artigo não partido;
outra cor/marca; sem a M-E; estrutura da migration, do rollback, da conferência, da rota, do MCP e da tela;
fatiamento da exclusão comum) e `tests/radar-grupos-excluir-tudo-da-cor-dom-2026-10-14.test.mts` (3, DOM no
runner do Radar: menu só no Minerador; sem a M-E o botão desabilitado com a explicação; confirmação forte e
o aviso à planilha; o link do Arquiteto e o parâmetro da URL). Ajuste declarado:
`tests/minerador-assunto-nunca-se-perde.test.mts` (a lista fechada do marcador `excluir_cor` passa a
incluir a constante do domínio da F7).

**Suítes (antes → depois):** Minerador por glob 1333 → 1345, as mesmas 28 linhas `not ok` (comparadas por
nome, TAP; a base desta máquina difere das contagens do §18.6 por arquivos de outras frentes);
`test:arquiteto` 2990 → 2990; `test:arquiteto:servidor` 148 → 148; `test:agent` 90 → 90; `test:radar` 3671 →
3674 (+3 DOM; 1 pulado, 0 falha; E0 com os mesmos hashes); `test:editorial` com as mesmas 4 falhas antigas;
`tsc` 0; eslint dos arquivos novos e tocados sem erro (os de `minerador-workspace.tsx` são antigos, nenhum
nas linhas desta fase); `git diff --check` limpo.

**Limites:** (a) keyword no ArticleDNA vigente de artigo que não pode sair do Silo (sem Silo consolidado,
Pilar, publicado ou com item no Radar) fica fora até o dono resolver no Arquiteto — a cadeia inteira
(retirar do Silo, desfazer Silo sugerido, tirar etiquetas) não foi feita: D8 e o pedido desta fase
limitaram a execução ao Minerador; (b) a mesa do Arquiteto usa `planVersion > 0` como "grupo com plano"
no recorte: depois de um plano limpo com a cor ainda ocupada, o grupo aparece como com plano, sem artigos
(backlog do Arquiteto); (c) a publicada na lixeira prende a cor até a purga (D7); (d) a SQL da M-E não foi
executada aqui (não há Postgres local; o ensaio é do dono); (e) nada validado na tela.

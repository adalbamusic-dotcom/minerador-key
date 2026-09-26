# SDD — A plataforma inteira para agentes, pelo MCP — 2026-09-26

> **Estado: AUTORIZADA pelo dono do produto em 2026-09-26.**
> Nas palavras dele: "quero que as IAs como o Claude através do MCP tenham acesso e
> permissões a todas as áreas e módulos […] Pode mexer nas coisas que precisar para
> implementar isto, e depois toda atualização e arrumações que ainda vamos fazer nos
> processos sejam atualizados também para as IAs."
> A autorização cobre o código desta SDD. **Não** cobre migration, SQL remoto, commit,
> deploy nem chamada paga em teste: isso continua com o usuário (`AGENTS.md` §15).

Grau das afirmações (`AGENTS.md` §1): **Verificado no código**, **Verificado no banco**
(leitura somente, `npx supabase db query --linked`), **Proposto**, **Não encontrado**.

---

## 1. Resumo para o dono do produto

Uma IA conectada pelo MCP (Claude, ChatGPT) passa a conseguir, na mesma conexão que
já existe:

1. **Saber por onde começar.** Um guia da plataforma, gerado de um catálogo único dos
   processos: etapas, o que cada uma exige, o que produz, quanto custa, quem decide e
   onde fica na tela.
2. **Entender a estrutura da marca antes de propor.** Quais silos existem, que artigos
   cada um tem, o que já está publicado, quais Assuntos estão declarados, em que etapa
   está cada coisa — e se um tema pedido no chat já existe em algum lugar.
3. **Planejar um silo novo.** Quando não há nada, a IA propõe um primeiro silo com 4 a 7
   artigos, com a keyword e o slug da página do silo, e a plataforma **valida** o plano
   pelas regras de SEO da casa (slug, colisão com publicados, pilar e suportes, funil,
   TOFU voltado a respostas de IA).
4. **Executar as etapas que já existem no servidor:** declarar Assuntos no Minerador,
   pesquisar keywords de sustentação (paga, só com custo confirmado), importar as
   escolhidas, enviar keywords aprovadas ao Arquiteto, enviar pacote do Radar ao
   Redator, e escrever no Redator (ferramentas que já existiam).
5. **Parar onde a decisão é humana,** com o link da tela exata, e retomar sozinha
   quando o estado mostrar que a decisão foi tomada.
6. **Escrever fora da plataforma** (WordPress, mini-WordPress) lendo o mesmo dossiê
   que o Redator lê.

**O que NÃO muda:**

- **Aprovação continua humana** (`AGENTS.md` §9: "decisão final é humana"; SDD do
  Assunto, P4: "a IA nunca declara Assunto" por conta própria). A IA prepara, mostra e
  pede; quem aprova é a pessoa, na tela. Declarar um Assunto pela IA só acontece com a
  frase escolhida pelo usuário no chat, repassada em `userConfirmation` e gravada na
  trilha.
- **Nenhuma chamada paga sem confirmação:** o plano de custo é gratuito; a execução exige
  o escopo `provider.spend`, o plano autorizado e a confirmação do usuário.
- **Publicados protegidos:** URL, slug, canonical e principal (`AGENTS.md` §11).
- **Sem FAQ** (`AGENTS.md` §13). **SERP nas 4 lentes.** **KGR < 0,25.**
- **Uma URL de MCP só** — quem já conectou não reconecta. Só precisa reconsentir para
  ganhar os escopos novos.

---

## 2. Contrato atual

- **Verificado no código:** o servidor MCP é `app/api/mcp/redator/route.ts`, com 14
  ferramentas do Redator. Autenticação por OAuth do Supabase ou bearer de diagnóstico
  (`lib/server/writer-mcp-principal.ts`). Marca e escopo vêm de `writer_mcp_grants`,
  decididos na tela de consentimento (`lib/server/writer-mcp-grants.ts`). Toda chamada é
  auditada em `writer_mcp_call_events` e reconfere agência e permissão editorial.
- **Verificado no código:** os escopos são `writer.read`, `writer.draft.write`,
  `writer.media.brief` (`lib/redator/mcp-consent-domain.ts:10`).
- **Verificado no banco:** `writer_mcp_grants_scopes_check` e
  `writer_mcp_delegations_scopes_check` limitam `scopes` a esses três.
- **Verificado no código:** o endpoint e o metadata OAuth estão amarrados a
  `/api/mcp/redator` (`lib/server/mcp-runtime-config.ts:46,52`; `next.config.ts:15`).
- **Verificado no código — operações chamáveis no servidor com um perfil:**
  `importSubjectsWithCore` (Assuntos), `runSubjectDiscoverySearch` (pesquisa por
  Assunto; portas montadas na rota), `importSubjectDiscoveryWithCore` (importar
  candidatas), `createMineradorArquitetoHandoff` (Minerador → Arquiteto),
  `sendRadarToWriter` (Radar → Redator).
- **Verificado no código — operações que só existem no navegador:** a Lógica, as
  medições, a revisão e a aprovação de keywords gravam direto do cliente
  (`modules/minerador/minerador-workspace.tsx:2100,3112,3191,3320`); a formação de
  artigos e silos e as aprovações do Arquiteto são conduzidas pelo workspace do
  Arquiteto. **Não há operação de servidor para a IA chamar.**

## 3. Proposta

### 3.1 Uma URL, um servidor, módulos de ferramentas

O servidor continua em `/api/mcp/redator` (renomear quebraria conexões e o metadata
OAuth). As ferramentas novas entram por `registerPlatformTools(server, principal, call)`
em `lib/server/platform-mcp-tools.ts`. O invólucro de chamada (`call`) passa a receber o
**módulo** da permissão editorial, em vez de fixar `redator`.

### 3.2 Catálogo único dos processos — `lib/agent/platform-catalog.ts`

Domínio puro. Declara, para cada operação da plataforma:

| Campo | Significado |
|---|---|
| `id` | identidade estável da operação |
| `stage` | Marca, Minerador, Arquiteto, Radar, Redator, Publicações |
| `purpose`, `requires`, `produces` | o que faz, pré-condições, o que entrega |
| `cost` | `free`, `paid_provider` |
| `decision` | `agent` (a IA pode executar) ou `human` (aprovação na tela) |
| `access` | `tool` (ferramenta MCP) ou `ui` (a IA orienta e manda o link) |
| `tool` | nome da ferramenta, quando `access = tool` |
| `screen` | caminho da tela, relativo ao `brandRef` |
| `routes` | rotas de API que implementam a operação |

Mais os **playbooks** (tema novo, silo do zero, artigo num silo existente, escrever
fora, trabalho em grupo × individual) e os **critérios de SEO** da casa.

**Tudo o que a IA lê sai daqui:** o guia (`get_platform_guide`), as instruções do
servidor e os próximos passos (`get_next_actions`). Mudou o processo, muda o catálogo,
e as IAs recebem a mudança na próxima chamada.

### 3.3 Leitor de estado da marca — `lib/server/agent-platform-state.ts`

Leitura estreita (SDD de egress: nada de payload inteiro):

- Minerador: contagem por status; Assuntos declarados (keyword, nota, destino, status).
- Arquiteto: ArticleDNA (última versão por artigo) por caminhos jsonb — promessa, slug,
  silo, hierarquia, etapa da jornada, intenção, keyword principal; SiloDNA (nome,
  pilar, suportes, formação); SiloPage (slug, H1, publicação).
- Publicados: `brand_site_catalog_entries` (URL, título, H1, tipo).
- Radar e Redator: itens por estado; documentos por status.

### 3.4 Ferramentas

| Ferramenta | Escopo | O que faz |
|---|---|---|
| `get_platform_guide` | qualquer grant | guia, playbook ou critérios de SEO |
| `get_platform_state` | `platform.read` | retrato da marca |
| `find_topic_in_platform` | `platform.read` | tema já existe? onde? |
| `list_platform_keywords` | `platform.read` | keywords filtradas, paginadas |
| `get_next_actions` | `platform.read` | o que fazer agora, e quem faz |
| `validate_silo_plan` | `platform.read` | valida um silo proposto (4–7 artigos) |
| `declare_subjects` | `minerador.write` | Assuntos: `preview` e `apply` |
| `search_subject_keywords` | `minerador.write` (+ `provider.spend` para executar) | plano grátis → execução paga |
| `import_subject_keywords` | `minerador.write` | candidatas escolhidas → Processador |
| `send_keywords_to_arquiteto` | `arquiteto.write` | keywords aprovadas → Arquiteto |
| `send_radar_to_writer` | `radar.write` | pacote finalizado → Redator |

### 3.5 Escopos novos

`platform.read`, `minerador.write`, `arquiteto.write`, `radar.write`, `provider.spend`.
Nenhum escopo de aprovação: aprovação é humana e fica na tela.

### 3.6 Sincronia obrigatória

Testes em `tests/agent-platform-catalog-sync.test.mts` falham quando:

1. uma rota de API de módulo existe e não está no catálogo nem na lista de exclusões
   com motivo;
2. uma ferramenta registrada no servidor não está no catálogo, ou o catálogo aponta
   ferramenta que não existe;
3. o guia não é gerado do catálogo.

E o `AGENTS.md` ganha a regra: **toda mudança de processo atualiza o catálogo do agente
na mesma entrega.**

## 4. Consumidores e compatibilidade

- Ferramentas do Redator: **inalteradas**. Mesmos nomes, escopos e respostas.
- Grants existentes: continuam válidos; só não ganham escopos novos sem reconsentir.
- Tela de consentimento e painéis da Conta: listam os escopos do domínio; os novos
  aparecem com título e descrição.
- Rota da pesquisa por Assunto: passa a montar as portas por uma função de
  `lib/server`; o contrato HTTP não muda.

## 5. Migration e ordem de execução (do usuário)

`supabase/migrations/20260926120000_m8_platform_mcp_scopes.sql` troca os dois `CHECK`
para aceitar os oito escopos. Rollback em `supabase/rollback/`. Aplicar por
`npx supabase db query --linked -f <arquivo>` e registrar com `migration repair`
(**nunca** `db push`).

**Ordem obrigatória:** migration → deploy. Com deploy antes, os grants existentes continuam
funcionando, mas **todo consentimento novo falha**: a tela pré-marca os escopos novos e o
`CHECK` antigo os recusa. Pré-marcados: todos menos `provider.spend`, que só entra marcado
pela pessoa.

## 5.1 Assunto e ADR-022

O ADR-022 diz: "Só o humano declara Assunto, com autor e data. A IA nunca declara; uma
proposta de IA só vale depois de aceita." `declare_subjects` é o caminho do **aceite**:

- `preview` não grava; a IA mostra ao usuário o que seria declarado.
- `apply` é recusado sem `userConfirmation` (as palavras do aceite), antes de qualquer
  leitura (`human_confirmation_required`).
- O autor gravado é o `auth.users.id` do dono do token — o humano —, pelo mesmo núcleo da
  tela (`importSubjectsWithCore`). O aceite fica em `writer_mcp_call_events.human_confirmation`.

O mesmo vale para a pesquisa paga: `execute` exige `userConfirmation` e o escopo
`provider.spend`, conferidos antes de qualquer leitura.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| IA age em nome do usuário além do pedido | Escopos por Marca, consentidos; aprovação fora do MCP; `userConfirmation` gravado nas escritas do Minerador |
| Gasto com provider | `provider.spend` separado; plano grátis obrigatório; `authorizedPlan` conferido no servidor |
| Egress | Leituras por caminho jsonb, limites e paginação |
| Catálogo desatualizado | Testes de sincronia; regra no `AGENTS.md` |
| Correspondência de tema por palavras | Declarado na resposta (`match: "lexical"`), como na F3.1 do Assunto |

## 7. Rollback

Remover `registerPlatformTools` da rota. Os escopos novos ficam sem uso; o rollback da
migration só pode rodar depois de revogar grants que os tenham.

## 8. Fora desta entrega — próximas fatias

Para a IA executar sozinha o que hoje é só do navegador, cada operação precisa virar
operação de servidor, com os mesmos testes da tela:

1. **P1 · Minerador no servidor:** Lógica, medição (Volume/Resultados/KGR, pagas) e
   revisão. A aprovação continua humana.
2. **P2 · Arquiteto no servidor:** propor formação de artigos e silos a partir das
   keywords recebidas, como proposta na cópia de trabalho. Aprovação humana.
3. **P3 · Radar no servidor:** iniciar e acompanhar a investigação (paga), e a
   exportação "Para escrever" como ferramenta.
4. **P4 · Links internos:** ler o InternalLinkGraph por artigo.

Até lá, essas etapas têm `access: "ui"` no catálogo: a IA sabe que existem, o que
exigem e onde ficam, e manda o link.

## 9. Verificação — 2026-09-26

- **Confirmado por teste:** `npm run test:agent` 40/40 (domínio puro e servidor MCP real, sem
  banco). `test:redator:mcp` 117/117 — as 14 ferramentas do Redator seguem iguais.
- **Mutantes:** rota nova sem catálogo derruba o teste 01; ferramenta tirada do catálogo
  derruba o 03. Os dois restaurados, 40/40.
- **Verificado no banco (só leitura):** `scripts/agent-platform-state-smoke.mts` rodou o leitor
  nas três marcas. Care Glow: 13,5 kB, 5 artigos, silo "skincare" com Pilar e 4 Suportes, 41
  publicadas; o tema "pele oleosa" achou o artigo existente e 4 páginas publicadas. AdalbaPro e
  Somatec (15 Assuntos) sem erro.
- **Achado no dado:** o Pilar do silo "skincare" tem `hierarchy: "Suporte"` no ArticleDNA. O
  retrato expõe os dois (`siloRole` e `hierarchy`) e a busca de tema mostra a divergência.
- **Sem regressão:** editorial, authz, operational, arquiteto e radar comparados com HEAD num
  worktree, falha por falha — nenhuma falha nova.
- **Não verificado:** cliente MCP real (Claude/ChatGPT) — depende da migration m8 e do deploy.

# Adendo à SDD da plataforma para agentes — decisão humana delegada pelo chat — 2026-09-26

> **Estado: primeira leva implementada localmente em 2026-09-26; migration M9, deploy e homologação remota pendentes.**
> Nas palavras dele: "quero ter a certeza de que […] o claude vai conseguir fazer as tarefas e ter
> sucesso, de que ele vai poder escolher assim como user, nas decisões humanas, de acordo as
> indicações que recebeu no chat, e também ele pode dar as sugestões".
> Complementa `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md`. Onde as duas
> divergem, vale este adendo. **Não** autoriza migration, SQL remoto, commit nem deploy: isso
> continua com o usuário (`AGENTS.md` §15).

---

## 1. O que muda

A SDD de 2026-09-26 dizia: "Nenhum escopo aprova: aprovação é humana e fica na tela."
A partir deste adendo:

**A decisão continua humana. Quem clica pode ser a IA, quando o usuário decidiu no chat.**

É o mesmo modelo que já vale para declarar Assuntos (ADR-022: "uma proposta de IA só vale depois de
aceita"): a IA mostra o que vai decidir, o usuário aceita com as próprias palavras, e a IA executa com
autor = o usuário e o aceite gravado na trilha.

## 2. As garantias de toda decisão delegada

1. **Escopo próprio, opt-in:** `platform.decide` ("Decidir quando eu pedir no chat"). **Nunca
   pré-marcado** — como `provider.spend`. Sem ele, toda ferramenta de decisão responde `scope_denied`
   com o link para reconsentir.
2. **Permissão do usuário no módulo:** a mesma ação que a tela exigiria (`approve` para aprovar,
   `edit` para Vínculo, KGR e Lógica), conferida a cada chamada, na Agência e na Marca.
3. **Prévia antes de aplicar:** `mode: "preview"` não grava nada e devolve, por item, o estado atual,
   a decisão proposta, o que falta e o que bloqueia, mais um `decisionHash`.
4. **Aplicar só o que foi mostrado:** `mode: "apply"` exige o mesmo `decisionHash` — o servidor refaz
   a prévia e recusa (`decision_stale`) se qualquer item mudou — e `userConfirmation` com as palavras
   do usuário. Sem aceite, recusa antes de qualquer leitura (`human_confirmation_required`).
5. **Autor humano:** o autor gravado é o `auth.users.id` dono do token. Nunca e-mail, nunca
   "local-user".
6. **Trilha:** `writer_mcp_call_events.human_confirmation` guarda o aceite; o `requestId` da chamada
   vai junto no registro de domínio onde o contrato aceita campo aditivo.
7. **Mesmas regras da tela:** nenhuma regra nasce na ferramenta. Onde a tela tem rota de servidor, a
   ferramenta chama o mesmo núcleo. Onde a tela grava direto do navegador (Minerador), o núcleo de
   servidor usa as **mesmas funções puras** da tela; levar a tela para esse núcleo é a fatia P1b.

## 3. Fora de alcance — sempre, mesmo com aceite

- Excluir, purgar ou restaurar keywords, documentos ou artefatos.
- Publicar, registrar URL publicada, mudar canonical.
- Trocar a principal de conteúdo publicado ou o posto (travado/revisável) — `AGENTS.md` §11.
- Gerir permissões, grants, membros ou conexões.
- Migration, SQL, deploy.

## 4. Primeira leva planejada

| Ferramenta | O que decide | Escopo | Permissão | Custo | Estado local |
|---|---|---|---|---|---|
| `run_keyword_logic` | nada — roda a Lógica determinística | `minerador.write` | minerador:edit | grátis | **implementado**; núcleo puro compartilhado com a tela, readback no MCP |
| `measure_keywords` | nada — mede Volume e Resultados | `minerador.write` + `provider.spend` (execute) | minerador:edit | pago | **pendente**; rotas existentes ainda não têm núcleo compartilhado com o MCP |
| `set_keyword_vinculo` | tipo de página (inclui `silo`), editar/retirar Assunto | `platform.decide` | minerador:edit | grátis | **implementado**; prévia, hash, aceite e readback |
| `set_kgr_applicability` | aplicabilidade do KGR (SIM/NÃO) | `platform.decide` | minerador:edit | grátis | **implementado** com `planKgrApplicabilityBatch` |
| `decide_keywords` | aprovar ou rejeitar keywords | `platform.decide` | minerador:approve | grátis | **implementado** com `resolveApprovalReadiness` + `applyApproval` |
| `finalize_writer_document` | finalizar o artigo | `platform.decide` | redator:approve | grátis | **implementado** pelo núcleo compartilhado com o PATCH de documentos |
| `send_writer_to_publications` | criar o registro interno em Publicações | `platform.decide` | redator:approve + publicacoes:create | grátis | **implementado** por `sendWriterToPublications`; não publica URL externa |

A Lógica e a medição não são decisões humanas — a tela as dispara com um clique —, mas sem elas nenhuma
keyword fica aprovável. A medição é paga e segue o mesmo padrão da pesquisa por Assunto: `plan`
grátis com custo, `execute` com `authorizedPlan` e aceite.

## 5. Próxima leva autorizada, ainda pendente

Precisam de extração de núcleos antes de virar ferramentas. Não duplicar lógica
dos componentes React nem simular conclusão:

- **Arquiteto:** processar arquitetura e artigos como proposta na cópia de trabalho; confirmar
  arquitetura; concluir formação; aprovar o InternalLinkGraph; marcar "Pronto para Radar"; enviar ao
  Radar.
- **Radar:** iniciar a pesquisa (paga) e finalizar a investigação.

Até lá o catálogo mantém essas etapas como tela, e `get_next_actions` manda o link.

## 6. Migration

`supabase/migrations/20260926140000_m9_platform_decide_scope.sql` acrescenta
`platform.decide` aos dois `CHECK`. M8 também precisa estar aplicada para a
coluna de auditoria `human_confirmation`. O usuário verifica o estado remoto,
aplica apenas migrations pendentes em ordem e então faz o deploy. Nenhuma
migration remota foi executada nesta revisão.

## 7. Estado de verificação desta entrega

- **Confirmado por teste local:** TypeScript, catálogo/ferramentas/rotas,
  recusa de `apply` sem aceite e testes da Lógica compartilhada.
- **Ainda não verificado:** consentimento real Claude, migration M9 remota,
  gravações na marca, medição paga, ferramentas completas de Arquiteto/Radar.
- A barra do Workbench do Arquiteto usa a rolagem global e um painel com altura
  delimitada; não ganhou estilo de scrollbar próprio.

## 8. Documentos alterados

`AGENTS.md` §9 e §17.1; SDD de 2026-09-26 §3.5 e §8; `docs/compartilhado/agentes-mcp-backlog.md`;
tela de consentimento (rótulo e descrição do escopo novo).

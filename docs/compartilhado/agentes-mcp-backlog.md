# Agentes operacionais e MCP — estado e backlog

**Estado em 2026-09-26:** em escopo. A plataforma inteira está exposta às IAs
pela mesma conexão MCP do Redator (`/api/mcp/redator`).
SDD: `docs/compartilhado/sdd-plataforma-para-agentes-mcp-2026-09-26.md`.

## Princípios (preservados da ideia original)

- Agentes são colaboradores delegados e limitados, usando **as mesmas operações de
  domínio dos botões**. Nenhuma regra de negócio nasce na ferramenta.
- Sem SQL livre, `service_role` no cliente, segredos, shell, filesystem ou credencial de
  provider.
- Modelo: Humano → consentimento (grant por Marca e escopo) → cliente MCP → ferramentas →
  operações de domínio.
- Sem `auth.users` falso para agente: o ator é o usuário dono do token, e o cliente fica
  registrado no grant e na trilha.
- **Sem aprovar, excluir, publicar, migrar ou gerir permissão.** Aprovação é humana e
  fica na tela; a IA manda o link e retoma pelo estado.

## Como a IA sabe o que fazer

`lib/agent/platform-catalog.ts` é a fonte única: etapas, pré-condições, custo, quem
decide, onde clicar, playbooks e critérios de SEO. O guia (`get_platform_guide`), as
instruções do servidor e os próximos passos (`get_next_actions`) são gerados dele.
`npm run test:agent` falha quando rota, ferramenta, guia ou escopo divergem.
**Toda mudança de processo atualiza o catálogo na mesma entrega** (`AGENTS.md` §17.1).

## Escopos

| Escopo | O que libera |
|---|---|
| `writer.read`, `writer.draft.write`, `writer.media.brief` | Redator (inalterado) |
| `platform.read` | retrato da marca, busca de tema, keywords, próximos passos, validar silo |
| `minerador.write` | declarar Assuntos aceitos, planejar pesquisa, importar candidatas |
| `arquiteto.write` | enviar ao Arquiteto keywords já aprovadas |
| `radar.write` | enviar ao Redator pacotes já finalizados |
| `provider.spend` | executar pesquisa paga depois do custo aceito — **nunca pré-marcado** |

## O que a IA ainda não executa sozinha (próximas fatias)

Cada item precisa virar operação de servidor antes de virar ferramenta:

1. **P1 · Minerador:** Lógica, medição (Volume, Resultados, KGR) e revisão. Hoje gravam
   direto do navegador (`modules/minerador/minerador-workspace.tsx`).
2. **P2 · Arquiteto:** propor formação de artigos e silos como proposta na cópia de
   trabalho, e validar SERP.
3. **P3 · Radar:** iniciar/acompanhar a investigação e a exportação "Para escrever".
4. **P4 · Links internos:** leitura do InternalLinkGraph por artigo.
5. **Autonomia** `AGENT_AUTOMATIC` (sem humano no chat): fora de escopo.

## Homologação (é do usuário)

1. Aplicar a migration, **antes** do deploy:
   `npx supabase db query --linked -f supabase/migrations/20260926120000_m8_platform_mcp_scopes.sql`
   e `npx supabase migration repair --status applied 20260926120000 --linked`.
2. Deploy.
3. Conta → Conexões de IA → reconsentir o cliente (Claude/ChatGPT) marcando os escopos
   novos. Conferir que **Gastar com provider** veio desmarcado.
4. No chat: "Use o get_platform_guide e me diga como você vai trabalhar." — a IA deve
   descrever o pipeline e dizer que aprovações são suas.
5. "O que a Care Glow já tem?" — `get_platform_state`: conferir silos, artigos e
   publicados contra a tela.
6. "Quero um artigo sobre pele oleosa." — `find_topic_in_platform`: deve achar o artigo
   existente e **não** propor outro.
7. "Proponha um silo novo sobre um tema que não temos." — `validate_silo_plan`: 4 a 7
   artigos, página do silo com keyword e slug, sem colisão com publicados.
8. Aceitar os Assuntos no chat → `declare_subjects` preview → apply. Conferir no
   Minerador "Assunto · declarado" e o autor como você.
9. Pedir a pesquisa: a IA deve mostrar o custo e **esperar** o seu aceite antes de pagar.
10. Conferir a trilha: `writer_mcp_call_events` com `human_confirmation` preenchido nas
    escritas.

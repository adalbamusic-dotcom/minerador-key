# SDD — Radar: Google sempre como base, YouTube e Amazon como acréscimo, e parecer direto do especialista

**Data:** 2026-09-30<br>
**Status:** APROVADA pelo dono em 2026-09-30:
D1 = Parte A aprovada; D2 = o parecer digitado passa pela mesma revisão; D3 = migration aprovada,
executada pelo dono.<br>
**Módulo proprietário:** Radar. O Redator e o export portátil são consumidores preservados.<br>
**Pedido do dono (2026-09-30):**

- “O Google tem que ser obrigatório; YouTube e Amazon opcionais, só quando quer converter o
  artigo em vídeo ou review. Não podem ser proibitivos como hoje: o seletor está em modo único, e
  YouTube e Amazon são para acrescentar depois de ter processado o Google.”
- “Um campo de texto simples na aba do Especialista. Hoje só funciona com Telegram, mas o
  especialista pode ter acesso à plataforma e escrever direto o parecer ou as diretrizes
  (fechamento, argumentação do CTA, resposta pedida pela SERP), e isso entra no contexto do
  artigo junto dos dados e da SERP.”

Valem as diretrizes do dono para todas as áreas: LSI, PNL, BERT, E-E-A-T e YMYL. O parecer do
especialista é justamente a evidência de experiência e autoridade (E-E-A-T) que o artigo leva.

---

## Parte A — Google base, YouTube e Amazon aditivos

### A1. Contrato atual (verificado no código)

- **Tela.** O seletor “Pesquisar em: Google | YouTube | Amazon” é um radiogroup de escolha única
  (`modules/radar/radar-r3-workbench.tsx:579-626`). Basta o Google começar para YouTube e Amazon
  ficarem desabilitados (“Zere para trocar”), e as áreas se excluem (`areaGoogle`, `:564`).
- **Guardas de tela** (`radar-page.tsx:615-626`, `:2298`, `:2823`, `:3026`):
  `radarPrimaryModeCommitment` recusa somar fontes (“use outro artigo”).
- **Servidor.** Já é aditivo: `radarDecideResearchSource` nunca recusa e grava a segunda fonte
  como apoio. `assertRadarPrimaryModeForRequest` não tem chamador em rota.
- **Payload.** Já guarda as três investigações lado a lado (`deepResearch` / `finalizedBundle`,
  `youtubeSearch` / `youtubeFrozenInvestigation`, `amazon*`).
- **Pacote.**
  - `research = { google, youtube, amazon }`, cada camada com `role` PRIMARY ou SUPPORT, e só uma
    PRIMARY. Ter YouTube ou Amazon como SUPPORT já é válido.
  - Porém a precedência do perfil primário é Amazon > YouTube > Google
    (`radarPrimaryProfileOfAnalysis`), e há um único `competitiveBlueprint`.
  - O blueprint de vídeo e o comercial só viajam quando são o perfil primário.
- **Regra documentada que esta parte revoga:** `docs/05-radar/spec.md:162-176`, “a seleção
  continua única por investigação”.

### A2. Proposta

1. **Google é a base, sempre.**
   - O bloco do Google aparece sempre e é o único que inicia uma investigação.
   - Artigo novo só vai ao Redator com o Google finalizado (`finalizedBundle`).
2. **YouTube e Amazon são acréscimos, fora do seletor.**
   - Viram duas caixas “Acrescentar YouTube (converter em vídeo)” e “Acrescentar Amazon (artigo
     review)”, liberadas depois de o Google ser finalizado.
   - Cada uma tem o seu custo mostrado antes (plano e confirmação, como hoje), a sua finalização e
     o seu “Remover acréscimo”, que não toca no Google.
   - Não travam nada e não apagam nada.
3. **O pacote tem sempre o Google como PRIMARY.**
   - YouTube e Amazon entram como camadas SUPPORT.
   - O blueprint de formato vai num campo novo e opcional do pacote: `formatBlueprints.video` e
     `formatBlueprints.review`.
   - A chave ausente não entra no hash, então os dossiês antigos mantêm o hash (mesma técnica de
     `keywordContext` e `serpLenses`).
4. **Acrescentar depois de enviar.** Acrescentar YouTube ou Amazon a um artigo já enviado gera
   pacote novo, e o documento no Redator mostra “Atualização disponível” (status de
   transferência). Nada é sobrescrito.
5. **Legado.**
   - Dossiês e documentos já entregues com YouTube ou Amazon como perfil primário continuam
     legíveis como estão; não são recalculados.
   - Investigação antiga que só tem YouTube ou Amazon aparece com o aviso “falta a base do
     Google”.
6. **Consumidores ajustados.** Os pontos que hoje leem `profile !== "GOOGLE"` como “sem
   fotografia do Google” passam a ler a presença da camada:
   - leitor do Redator (`writer-evidence-reader.ts`);
   - prontidão;
   - elegibilidade do envio;
   - ramos do export portátil.
   Isso fecha a pendência registrada em `estado-atual.md:49-54`.

### A3. Riscos e compatibilidade

- **Muitos pontos leem o perfil**, principalmente o export portátil (cerca de 10 arquivos).
  Mitigação: a regra passa a ser “tem a camada?”, com teste de equivalência nos dossiês Google
  (hash e CSV iguais aos de hoje).
- **Testes que prendem o modo único serão reescritos para a regra nova:**
  - `radar-youtube-search-12-autoridade-de-modo`
  - `radar-research-profiles-1`, `-11` e `-12`
  - `radar-multi-profile-handoff-1`
  - `radar-fase1-modos-e-roteamento`
  - `radar-gate14-ui-operacional`
- **Sem migration.** O payload já guarda as três investigações.
- **Rollback:** voltar a tela e a precedência. O campo `formatBlueprints` é opcional e ignorado
  por quem não o conhece.

---

## Parte B — Parecer direto do especialista na plataforma

### B1. Contrato atual (verificado no código)

- **Fluxo:** ponto preparado → pauta → pedido enviado pelo Telegram → resposta recebida → a
  revisar → evidência decidida (`lib/radar/specialist-flow.ts`).
- **Tabela `expert_contributions`:**
  - fixa `provider = 'telegram'` (CHECK);
  - exige `external_update_id` (índice único);
  - `expert_id` e `brief_id` são obrigatórios;
  - não tem coluna de autor.
  - Os contratos zod também fixam `provider: "telegram"`.
- **Não existe entrada manual.** “Ferramentas avançadas” tem só: escolher especialista, o estado
  do canal Telegram e “Criar pauta avulsa”.
- **A camada `bundle.specialist` só aceita item ligado a ponto de revisão**, e os pontos só
  existem com Google (`specialist-evidence.ts:101,149`).
  - Divergência encontrada: o `relatedRequirementId` escolhido na tela é ignorado no servidor. Uma
    resposta de pauta avulsa, mesmo associada e aceita, não entra no dossiê.
- **O que já serve sem mudança:** a decisão humana (rota de revisão), a extração, a camada, o
  hash do dossiê, o Redator (nível `QUALIFIED_SPECIALIST`) e o CSV
  (`specialist_context_md` / `specialist_context_json`).

### B2. Proposta

1. **Campo de texto na aba Especialista:** “Escrever o parecer aqui”.
   - Tipo do parecer:
     - Resposta a um ponto de revisão (lista dos pontos);
     - Fechamento do artigo;
     - Argumentação do CTA;
     - Diretriz geral de conteúdo.
   - Especialista: a lista da marca, ou “Eu mesmo”, que liga o usuário logado a um especialista
     da marca.
   - Botão “Enviar parecer”.
2. **Núcleo de servidor novo** `insertPlatformContribution`, irmão do `insertTelegramContribution`:
   - grava `provider: 'platform'`, `source_type: 'TEXT'`, o texto e o autor (`auth.users.id`);
   - chave de idempotência gerada no servidor;
   - releitura antes de dizer “enviado”;
   - rota nova com `radar:edit`.
3. **Mesma revisão de hoje.** O parecer entra como “Contribuição a revisar”, e quem cuida do
   artigo decide (aceitar como evidência, apoio, citação ou rejeitar). Nada entra no pacote sem
   essa decisão humana, como no Telegram. (Ver a decisão D2 abaixo.)
4. **O parecer livre também entra no dossiê:**
   - a camada passa a respeitar o `relatedRequirementId` (corrige a divergência);
   - aceita itens de tipo próprio sem ponto de revisão: `requirementKind` “FECHAMENTO”, “CTA” e
     “DIRETRIZ”.
   - Assim o fechamento e o CTA chegam ao Redator e ao CSV com o nível de especialista.
5. **Rótulos:** “Telegram” fixo na tela vira o canal real (Telegram ou Plataforma).

### B3. Migration necessária (o dono executa)

- `expert_contributions.provider`: o CHECK passa a aceitar `('telegram','platform')`.
- `external_update_id`: continua obrigatório. No canal da plataforma, recebe a chave de
  idempotência gerada no servidor, e o índice único continua valendo.
- Coluna nova `authored_by uuid null references auth.users(id)`, preenchida só no canal da
  plataforma.
- **Rollback:** a migration de volta só é aplicável se não houver linha `platform`. O documento de
  rollback diz isso.
- Nenhuma mudança de RLS: a escrita continua só pelo servidor.

### B4. Riscos

- **Parecer sem ponto de revisão** muda a invariante da camada. Mitigação: tipos explícitos, com
  teste; o item continua exigindo a decisão humana.
- **Especialista com login e permissão.** Quem digita precisa de `radar:edit`. O papel
  `specialist` já existe nos membros; dar a ele só este campo é uma evolução posterior, fora deste
  escopo.

---

## Decisões do dono antes do código

- **D1:** aprovar a Parte A (Google base; YouTube e Amazon como acréscimo).
- **D2:** o parecer digitado na plataforma passa pela mesma revisão (proposto), ou entra direto
  como evidência aceita quando quem digita é o próprio especialista?
- **D3:** aprovar a migration da Parte B (o dono executa o SQL; o código só entra depois da
  migration aplicada).

## Ordem de entrega

1. B sem migration: a camada respeita o `relatedRequirementId`. É correção isolada.
2. A (maior; sem migration).
3. B completa, depois de o dono aplicar a migration.

## Testes

- **Parte A:** equivalência de hash e CSV nos dossiês Google; acréscimo de YouTube e Amazon depois
  do Google; o legado continua legível; o Redator lê a camada Google com YouTube presente.
- **Parte B:**
  - rota com permissão;
  - idempotência;
  - readback;
  - a contribuição da plataforma segue a revisão até `bundle.specialist`, ao Redator e ao CSV;
  - os tipos sem ponto de revisão.
- Suítes `test:radar` e `test:redator`, `tsc`, lint e `test:agent` (o catálogo MCP é atualizado
  na mesma entrega).
- Validação na tela: do dono.

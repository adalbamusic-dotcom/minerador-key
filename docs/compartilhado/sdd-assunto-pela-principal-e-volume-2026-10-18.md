# SDD — O Assunto pela principal e pelo volume (reprocessar o modo antigo) — 2026-10-18

> **Status: APROVADA (dono, 2026-10-18).** Respostas do dono:
> - "Sem média" do Google Ads conta como volume 0.
> - O "volume 0 vira Assunto" acontece no "Aprovar e enviar", com prévia; o botão Volume só mede.
> - Publicado travado ao slug com volume 0: a principal fica livre sozinha. A troca continua sendo decisão do dono na prévia do Arquiteto, e URL, slug e canonical não mudam.
> - **Demais pontos: seguir as recomendações.**
>   - O título do Assunto nasce do texto da keyword e é editável no painel do DNA, mesmo com a revisão concluída.
>   - A página que já ranqueia pela principal antiga gera só aviso.
>   - Nas 16 trocadas, a principal atual fica se passar na régua nova, e a keyword da página vira o Assunto.
>   - Volume de 40 ou mais continua como hoje.
>   - A regra vale também para o amarelo da WifiConecta.
>   - As 158 keywords sem grupo ficam fora desta SDD.
>   - O WhatsApp duplicado fica para o dono decidir depois.
> Documento só de leitura do código e do banco: nenhuma linha de código, teste,
> migration ou escrita no banco foi feita para escrevê-lo; nenhuma chamada paga.
> O banco foi lido só por `SELECT` (`npx supabase db query --linked -f`, 2026-10-18).
> Commit, push, deploy, migration e SQL são do dono (`AGENTS.md` §15).
>
> **Módulo proprietário:** Minerador (dono do contrato do Assunto,
> `analise_semantica.keyword_subject`, e do KeywordDNA). **Consumidor com mudança
> obrigatória:** Arquiteto (régua da troca da principal, alvo publicado com
> Assunto, "Processar artigos" e "Melhorar publicados…"). Toca o catálogo MCP
> (`lib/agent/platform-catalog.ts`, `AGENTS.md` §17.1). Radar, Redator e
> Publicações só leem `ArticleDNA.subject` e a principal, como hoje.
>
> **Regra de trabalho (`AGENTS.md` §0):** nada de rota, etapa, barra, painel ou
> núcleo paralelo. Cada comportamento novo entra num botão e num núcleo que já
> existem (§6); a regra nova prevalece e o texto antigo vira SUBSTITUÍDO (§9);
> o teste é pelos botões que o humano usa (§14–§16).
>
> Legenda: **Verificado no código** (arquivo:linha lido em 2026-10-18) ·
> **Verificado no banco** (SELECT de 2026-10-18) · **Planejado** · **Decisão pendente**.

## 0. Resumo para o dono

A AdalbaPro foi processada no modo antigo: nenhuma keyword tem o Assunto no
formato de hoje, 21 artigos estão publicados e, em 16 deles, o Arquiteto antigo
trocou a principal da página por uma busca mais ampla e deixou a keyword do
slug como secundária. Várias dessas trocas erram o SEO semântico (perdem o
nicho "clínica de estética", a restrição "sem tráfego pago", mudam a intenção
para a do consumidor ou têm grafia quebrada).

A linha de hoje já tem quase tudo: o Assunto dentro da keyword (cadastro
único), a conversão do formato anterior, a trava pelo volume, a guarda "o
Assunto nunca se perde", a régua do núcleo do slug e o refazedor "Melhorar
publicados…". O que falta é **ligar o volume da principal ao Assunto** e deixar
o Assunto **editável** e **cadastrável em qualquer keyword**:

1. **Volume 0** (medido 0 ou "sem média no Google Ads"): a principal original
   (a do slug) vira o **Assunto fixo** do artigo, sozinha, no "Aprovar e enviar"
   de sempre; ela fica **livre** para troca; no Arquiteto o artigo recebe uma
   principal **com volume** que leva o núcleo do slug e não contradiz o Assunto,
   e as sustentações; título, slug e canonical não mudam; a troca é sua, na prévia.
2. **Volume baixo** (1 a 39 por mês — na prática 10, 20 ou 30): **opção** de
   virar o Assunto, no painel do KeywordDNA; escolhida, é obrigatória; a
   principal **fica fixa**; o Arquiteto só acrescenta reforço.
3. Vale para publicado e novo, Pilar e Suporte. **Substitui** a regra de
   17/10 "principal de identidade com volume zero fica (só o Pilar troca)".
4. Todos os campos do Assunto ficam **editáveis** no painel do KeywordDNA, com
   prévia, gravação pelo núcleo do cadastro e releitura.

Nada de migration: tudo é jsonb aditivo no que já existe.

## 1. Identificação

- **Tipo:** estrutural (`AGENTS.md` §4): muda a regra de formação/troca da
  principal em publicado e novo, o workflow do Assunto (quem o grava e quando)
  e o que uma versão nova de publicado pode tirar. Por isso SDD antes do código.
- **Fontes lidas:** `AGENTS.md` §0–§17.1; `docs/04-arquiteto/situacoes-resolvidas.md`
  (§3 T1–T13, §4 X1–X14, §8 U1–U17, §9 A1–A13); `docs/04-arquiteto/spec.md`
  §35, §41, §45; SDDs `sdd-cadastro-assunto-na-keyword-2026-10-13.md`,
  `sdd-conversao-assunto-legado-2026-10-13.md`, `sdd-linha-unica-do-minerador-2026-10-16.md`,
  `sdd-linha-unica-do-arquiteto-2026-10-16.md` (§15.2, §15.5, §15.9, §15.10),
  `sdd-assunto-tronco-editorial-2026-09-24.md` (ADR-022); a migration
  `supabase/migrations/20261015120000_assunto_nunca_se_perde.sql`.

## 2. Decisões do dono (2026-10-18) — resumo literal

| # | Decisão |
|---|---|
| D-A1 | A AdalbaPro foi processada no modo antigo, sem Assunto; muitas estão publicadas (slug e canonical fixos, principal travada), com erros de SEO semântico e principais que não batem com o slug. Reprocessar pela linha ATUAL (Minerador → Arquiteto → …). |
| D-A2 | Poder cadastrar o Assunto numa keyword livre ou em qualquer keyword sem Assunto no DNA. |
| D-A3 | A principal original (a do slug) pode virar o Assunto do artigo. **Volume 0** → vira o Assunto FIXO do artigo automaticamente (depois da Lógica + Volume do Minerador); a principal fica livre para troca; no Arquiteto o artigo ganha uma principal NOVA com volume (que leva o núcleo do slug) e sustentações que fortalecem o Assunto; slug, canonical e título não mudam; a troca é decisão do dono na prévia. **Volume baixo** (abaixo de 40/mês, isto é 10–30) → OPÇÃO de virar o Assunto (obrigatório depois de escolhido); a principal fica FIXA como principal; o Arquiteto só acrescenta reforço. Vale para publicado e novo, Pilar ou Suporte. |
| D-A4 | **Substitui** a regra de 2026-10-17 "principal de identidade com volume zero fica (só o Pilar troca)" (T12/T13 do registro; SDD da linha única do Arquiteto §15.5/§15.9 F). |
| D-A5 | O processo reconhece e resolve os conflitos: sem Assunto; principal sem relação com slug/canonical; publicado e travado; volume 0; volume baixo; artigo do modo antigo com keywords sem relação com o slug. |
| D-A6 | Todos os campos do Assunto editáveis no painel do KeywordDNA do Minerador (gramática e semântica). |
| D-A7 | Testar com a AdalbaPro, pelos botões. |

## 3. Contrato atual (verificado no código em 2026-10-18)

### 3.1 Minerador — o Assunto

| # | Onde | O que faz hoje |
|---|---|---|
| M1 | `lib/minerador/keyword-subject.ts:211` `resolveKeywordSubject`; `:234` `subjectPhraseOf`; `:460` `setKeywordSubject` | O Assunto mora em `keyword_subject = { declared, note, destinationUrl, destinationCheck, plan?, entry? }`; a frase é `entry.title` ou o texto da linha (formato anterior). `setKeywordSubject` é a função única de escrita (idempotente, histórico append-only). |
| M2 | `lib/minerador/declared-plan.ts:113` `SubjectEntrySchema` (`.strict()`, `source: "cadastro"`); `:74` `DeclaredArticlePlanSchema` (`lock?`, `slug?`) | O título (1–300, uma linha) e os detalhes (até 1.200) do cadastro; o plano do artigo (grupo, ordem, papel, escopo, principal declarada, trava, slug). |
| M3 | `lib/minerador/declared-plan.ts:150` `hasLockingVolume`; `:168` `declaredPrincipalLock` | Trava automática **só existe com plano**: travada com Volume validado > 0, livre sem. A trava manual ainda vence o volume (`:179`), apesar da D1 da linha única do Minerador (16/10) — a F2 dela ainda não entrou. |
| M4 | `lib/minerador/declared-plan-import-core.ts:131-133` | O núcleo do card "Cadastrar Assuntos" (`importDeclaredPlanWithCore`) só conhece três destinos: Silo novo, Silo existente e Artigo publicado (URL). **Não há destino para keyword solta, sem Silo e não publicada.** |
| M5 | idem `:1165` `classifyPublished`; `:1220`; `:1227` | No destino publicado o Assunto é declarado NA keyword da página; exige ao menos uma linha com "a keyword que reforça a página" (`:1227`) e recusa título diferente do já gravado ("um Assunto por artigo", `:1220`) — **não dá para a própria página virar o Assunto sem trazer reforço, nem corrigir o título**. |
| M6 | `lib/server/minerador-subject-conversion.ts:41`, `:70-71` (rota `plans/convert`) | A conversão do formato anterior ("Converter para o formato novo", `modules/minerador/subject-conversion-dialog.tsx`) exige `groupId`: **Assunto sem grupo de cor fica fora**. |
| M7 | `components/editorial/dna-panels.tsx:633` `SubjectArticleBlock` ("somente leitura", `:652`); `modules/minerador/minerador-workspace.tsx:1460-1464` | No painel do KeywordDNA o bloco "Assunto deste artigo" é **só leitura** (título, detalhes, papel e posição, grupo, trava, "Buscar sustentação"). Editáveis no painel hoje: KGR (`dna-panels.tsx:533`), Posto ou trava do plano (`:552-567`), tipo de página (`:571-578`) e Status (`:1205`). |
| M8 | `lib/minerador/subject-article-view.ts:136-140` | Assunto com `entry` e sem plano mostra "Protegida pela página publicada · a keyword da página publicada não é trocada" — rótulo errado para keyword não publicada e contrário à D-A3 no publicado de volume 0. |
| M9 | `lib/minerador/approved-package.ts:104-105` (D2) e D2-bis | Assunto do formato anterior (sem `entry`) aprova só com a Lógica; principal do plano idem. Qualquer mudança em `analise_semantica` muda o pacote e a linha volta a "Em revisão". |
| M10 | `lib/server/minerador-volume-measure.ts:86`, `:114`; `lib/editorial/known-before-search.ts:25`, `:53-70` | O Volume grava a medição; "sem média no Google Ads" vale **30 dias** como medida ("no_average"); depois vira "falta medir". Nada no Volume nem no "Aprovar e enviar" (`lib/minerador/approve-and-send-core.ts:107`, `:170`) toca o Assunto. |
| M11 | `supabase/migrations/20261015120000_assunto_nunca_se_perde.sql` (APLICADA, conferida em 16/10) | Gatilho repõe o `keyword_subject` declarado que uma escrita tentar tirar sem o marcador de liberação (`tirar_do_plano`, `conversao`, `excluir_cor`) e recusa excluir keyword com plano ou `entry` não liberado. Acrescentar `entry`, mudar o título ou os detalhes passa. |
| M12 | `lib/minerador/primary-keyword-policy.ts:16-29`; `lib/minerador/publication-link.ts:161-185` | Publicado = status legado ou publicação formal no Vínculo (URL conferida, `publicationConfirmedBy/At`); Posto padrão da publicada = **travado**; gravado: `locked`/`reviewable`/`free`. |

### 3.2 Arquiteto — a principal e o publicado

| # | Onde | O que faz hoje |
|---|---|---|
| A1 | `lib/arquiteto/article-improvement.ts:601` `principalIsIdentity`; `:615` `targetPrincipalIsIdentity` | Identidade = principal no título do Assunto (só alvo `subject`) ou no slug declarado/publicado. |
| A2 | idem `:628` `pilarTrocaPelaCabeca`; `:632` `identityHoldsPrincipal`; `:661-663` `subjectSlugCoreSwap`; `:1186-1193` (`identidadeBruta`, `pilarCabeca`, `needsPrimary`); `:1557` (`volumelessPrincipalSwap`) | **T12/T13:** identidade sem volume **fica**; só o Pilar do plano Livre sem volume troca pelo termo-cabeça; no publicado a identidade nunca troca. |
| A3 | idem `:180` `slugCoreWords`; `:198` `carriesSlugCore`; `:167` `BROAD_HEAD_MAX_VOLUME` | Núcleo do slug = as duas últimas palavras de conteúdo **antes** de "para/sem/vs/com" (+ entidade do DNA no plano). O nicho e a restrição que vêm depois **não contam**. |
| A4 | `lib/server/arquiteto-article-improvement.ts:204` `readInputs`; `:220` | O alvo publicado nasce com `theme: row.keyword`, `note: null`: **o Assunto da página é ignorado**; e o laço dos Assuntos pula a keyword que já é membro do publicado (`:226`). |
| A5 | idem `:282-287` (`livreComVolume`) | No plano, a Livre com volume medido fica fixa (regra do dono de 14/10). |
| A6 | `modules/arquiteto/serp-subject-model.ts:425` `buildPublishedSwapArticlePayload`; `lib/arquiteto/canonical-bootstrap.ts:52` `publishedPageKeywordIdOf`; registro X12 | Na troca do publicado, **a antiga vira secundária** e continua sendo a página. No plano (§15.2) a antiga sai e vira o Assunto (`article-improvement.ts:1400` `SUBJECT_KEYWORD_STAYS_SUBJECT_REASON`). |
| A7 | `lib/arquiteto/published-reinforcement.ts:715-731` `publishedReinforcementReadbackConfirms` (`nenhumaSumiu`, `:722`) | Versão nova de publicado **só acrescenta**: nenhuma keyword da versão anterior pode sumir (U12). |
| A8 | `lib/arquiteto/declared-subject.ts:247` `readArchitectSubjectStanding`; `:585` `planSubjectAttachment` (`:618` `PRINCIPAL_WITHOUT_VOLUME`); `:669` `attachSubjectToArticleDna` | O Assunto só entra no ArticleDNA pelo pacote aprovado, com ator humano; pode ser a própria principal com Volume validado ou quando mora na keyword. |
| A9 | `lib/arquiteto/contracts.ts:163` (`PrimaryKeywordPolicySchema`), `:1115-1118` (`superRefine`) | O Assunto nunca é secundária nem reforço do mesmo artigo. |
| A10 | `lib/server/arquiteto-differentiation-store.ts:106-160` `readDifferentiationBrandKeywords` | Lê os publicados da marca pela regra única (`readPublishedIdentity`); `volumeValidated` só com Google Ads > 0 (`:152`). |

## 4. Os dados da AdalbaPro (verificado no banco, SELECT de 2026-10-18)

Marca `61d2e019-f44f-4fa3-af2f-d86b95628ab3` ("AdalbaPro").

### 4.0 O grupo verde (o alvo do teste)

O dono agrupou as publicadas da AdalbaPro na cor **verde** (2026-10-18): grupo
`1cbdf7a1-ef42-4e6c-94d6-7a1ea5f55c5e` ("Verde", `active`, **sem plano**,
`plan_version = 0`, `silo_id` nulo). Releitura por SELECT depois do
agrupamento:

| Item | Verde |
|---|---|
| Keywords | **25** — exatamente as 25 publicadas da marca (as outras 158 seguem sem grupo, nenhuma publicada) |
| Evidência de publicação | 25 de 25 pelo Vínculo formal (`publicationStatus = published`, URL conferida, `publicationConfirmedAt`) |
| Páginas | **21 de artigo** + **4 de Silo** (`keyword_page_type = silo`: Captação de Pacientes 90, Crescimento de Clínicas sem média, Estratégia de Negócios 320, Leads sem Tráfego Pago sem média) |
| Volume da keyword da página (21 artigos) | 0 medido: 0 · **sem média: 17** · **10–30: 2** (10 e 10) · **≥ 40: 2** (70 e 90) · nunca medida: 0 |
| Assunto | **2** declarados, formato anterior, sem `entry` (`c937661d`, `b1e61059`); **23 sem Assunto**. A linha-título `8bcd8ff3` não está no verde (segue sem grupo) |
| Papel no ArticleDNA vigente | **16** são secundárias do próprio artigo (troca do modo antigo); **5** são a principal (`b324d9f6` sem média, `64e259d6` 10, `24679c44` 10, `f8d3a654` 70, `ecbca2b4` 90); as 4 de Silo não estão em ArticleDNA |
| Principal atual × núcleo do slug | 19 levam o núcleo pela régua de hoje; 2 não (`instagram-nao-traz-pacientes`, `plano-de-marketing-estetica-exemplos-e-templates`); 16 perdem o nicho/restrição (§4.1) |
| ArticleDNA vigentes | 21 (v2 a v7), todos aprovados, um por página |
| Posto | 21 `reviewable` (Livre); 1 `locked` (Captação de Pacientes, Silo); 3 Silos sem política (padrão travado) |

Os números do §4.2 são os do verde. As 5 keywords novas fora dele (4 artigos
novos e a linha-título) ficam como casos C10/C11, fora do lote de teste.

### 4.1 Panorama da marca

| Item | Medido |
|---|---|
| Keywords | **183** vivas, 0 na lixeira; todas `aprovado`; todas recebidas no Arquiteto (183 itens `keyword/architect/received`) |
| Grupos de cor e listas | 1 grupo (verde, §4.0, criado pelo dono depois da primeira leitura); **0** listas (`lista_id` nulo nas 183) |
| Com Assunto declarado | **3**, todos no formato anterior (sem `entry`, sem plano, sem grupo); **180 sem Assunto** |
| Publicadas (regra U1) | **25** = **21 páginas de artigo** + 4 páginas de Silo (Captação de Pacientes, Crescimento de Clínicas, Estratégia de Negócios, Leads sem Tráfego Pago); todas pelo Vínculo formal, 0 pelo status legado |
| Posto das publicadas | 21 `reviewable` (Livre) — as 21 de artigo; 1 `locked` (Captação de Pacientes, Silo); 3 sem política (Silos → padrão travado) |
| Volume (183) | Google Ads com número: 163 (1–39: **49**; ≥ 40: **114**); "sem média no Google Ads" (resposta de 2026-09-25, `volume_search` nulo): **20**; medido 0: **0**; nunca medida: 0 |
| Principal original das 21 páginas de artigo | sem média: **17**; 10: **2**; 70: 1; 90: 1 → pela D-A3: **17 no caminho "volume 0"**, **2 no "volume baixo"**, 2 com volume ≥ 40 |
| ArticleDNA | **26 artigos** (102 versões), todos `approved`, origem humana: 21 publicados + 5 novos (2 deles duplicados, §4.3 ex. 9); SiloDNA 4 + SiloPage 4, v1 aprovados |
| Principal ≠ keyword da página | **16 de 21** (troca do modo antigo confirmada em `primaryKeywordDecision`); nas 16 a keyword da página virou **secundária** |
| Núcleo do slug (régua de hoje, A3) | 2 das 21 principais atuais não o levam; mas **16 artigos** têm a principal ou secundárias com volume **sem o nicho/restrição do slug** (40 keywords) |
| Fora de qualquer ArticleDNA | **84** keywords (4 são as páginas de Silo): 55 com volume ≥ 40, 27 abaixo, 2 sem volume — muitas de intenção de consumidor, fora do tema da marca (ex.: "botox para rosto" 14.800, "limpeza de pele masculina" 1.000) |
| Depois do Arquiteto | 9 artigos no Radar (7 `research_pending`, 2 `sent_writer`), **2 ContentDocuments**, 0 PublicationRecords |
| Validade do "sem média" | 30 dias desde 2026-09-25 → **vence em 2026-10-25**; depois as 20 voltam a "falta medir" (Volume do Minerador, Google Ads) |

### 4.2 As 21 páginas de artigo

| Página (slug) | Vol. da página | Posto | Principal atual (vol.) | Tipo pela D-A3 |
|---|---|---|---|---|
| agencia-de-marketing-para-clinica-de-estetica | sem média | Livre | agencia marketing digital (1.300) | volume 0 · trocada |
| agencia-de-marketing-para-cosmeticos | sem média | Livre | agencia de marketing digital (6.600) | volume 0 · trocada |
| campanhas-de-marketing-para-clinica-de-estetica-sem-anuncios | sem média | Livre | campanhas de marketing (480) | volume 0 · trocada |
| captacao-de-pacientes-sem-trafego-pago | sem média | Livre | captação de pacientes dentista (10) | volume 0 · trocada |
| checklist-de-plano-de-marketing-para-clinica-de-estetica | sem média | Livre | plano de marketing digital (70) | volume 0 · trocada |
| como-atrair-clientes-para-consultorio | sem média | Livre | como atrair o cliente (720) | volume 0 · trocada |
| como-atrair-pacientes-para-clinica | sem média | Livre | como atrair pacientes para o consultório (20) | volume 0 · trocada · Assunto antigo |
| como-atrair-pacientes-para-clinica-de-estetica | sem média | Livre | a própria (sem média) | volume 0 · não trocada |
| como-atrair-pacientes-sem-redes-sociais | sem média | Livre | como atrair mais pacientes (10) | volume 0 · trocada · Assunto antigo |
| como-criar-um-plano-de-marketing-para-clinica-de-estetica | sem média | Livre | plano de e marketing (1.900) | volume 0 · trocada |
| instagram-nao-traz-pacientes | sem média | Livre | como atrair clientes pelo instagram (70) | volume 0 · trocada · no Redator |
| marketing-harmonizacao-facial | sem média | Livre | harmonização fácial preço (1.300) | volume 0 · trocada |
| modelos-de-campanha-para-clinica-de-estetica | sem média | Livre | modelos de campanha (70) | volume 0 · trocada |
| plano-de-marketing-estetica-exemplos-e-templates | sem média | Livre | plano de marketing clínica de estética pdf (10) | volume 0 · trocada |
| plano-de-marketing-para-clinica-de-estetica | sem média | Livre | plano de marketing (1.900) | volume 0 · trocada |
| promocoes-para-estetica | sem média | Livre | promoções estética (90) | volume 0 · trocada |
| trafego-pago-vs-organico-para-clinica-de-estetica | sem média | Livre | trafego organico e pago (140) | volume 0 · trocada |
| como-atrair-pacientes-para-consultorio-odontologico | 10 | Livre | a própria (10) | volume baixo |
| como-captar-clientes-para-clinica-de-estetica | 10 | Livre | a própria (10), **0 secundárias** | volume baixo |
| marketing-digital-para-dentistas | 70 | Livre | a própria (70) | ≥ 40 (como hoje) |
| marketing-para-clinica-de-estetica | 90 | Livre | a própria (90) | ≥ 40 (como hoje) |

### 4.3 Dez exemplos dos tipos de conflito

| # | Keyword / artigo | O que está errado | Tipo (§7) |
|---|---|---|---|
| 1 | `dfd6209e` agência de marketing para clínica de estética | Página sem média; principal trocada para "agencia marketing digital" (1.300), perdeu o nicho; secundária "agencia de marketing em são paulo" (390) é outra localidade | C3, C4, C6, C9 |
| 2 | `5a7ec0c7` marketing-harmonizacao-facial | Principal "harmonização fácial preço" (1.300) + "preço harmonização facial", "harmonização facial feminino": intenção do consumidor do procedimento, não marketing para a clínica | C4, C9 |
| 3 | `f05faad5` como-criar-um-plano-de-marketing-para-clinica-de-estetica | Principal "plano de e marketing" (1.900): grafia quebrada, sem o nicho | C4 |
| 4 | `92d3101c` captacao-de-pacientes-sem-trafego-pago | Principal "captação de pacientes dentista" (10): perdeu a restrição "sem tráfego pago" e trocou o público; está no Radar | C3, C4 |
| 5 | `8170a492` instagram-nao-traz-pacientes | Principal "como atrair clientes pelo instagram" (70) não leva o núcleo do slug; artigo já no Redator (ContentDocument) | C4, risco R5 |
| 6 | `64e259d6` como atrair pacientes para consultório odontológico (10) | Volume baixo; secundária "como conseguir clientes" (210) sem palavra do slug | C7, C9 |
| 7 | `24679c44` como captar clientes para clínica de estética (10) | Volume baixo; ArticleDNA v2 sem nenhuma secundária | C7 |
| 8 | `b1e61059` como atrair pacientes sem redes sociais | Assunto do formato anterior (a frase é a própria keyword, nota e URL gravadas), sem grupo: fora da conversão por grupo (M6); principal trocada para "como atrair mais pacientes" (10), perdeu a restrição | C2, C3, C4 |
| 9 | `8bcd8ff3` linha-título "Da primeira pesquisa ao agendamento: como organizar a captação…" | Assunto do formato anterior em linha própria, sem grupo; **dois** ArticleDNA com a mesma principal "como atrair clientes pelo whatsapp" e o mesmo Assunto (`8bcd8ff3` v3 e `article-formation:62ade5c4` v1) | C2, C10 |
| 10 | `article-formation:fd783043` leads qualificados (880), novo | Slug "qualificados": o slug não leva a principal | C11 |

## 5. Lacunas entre a linha de hoje e a decisão

| # | Lacuna | Onde (verificado) |
|---|---|---|
| G1 | Não há como cadastrar Assunto numa keyword solta, sem Silo e não publicada | M4 (`declared-plan-import-core.ts:131-133`) |
| G2 | A página publicada não pode virar o próprio Assunto sem uma linha de reforço; o título do Assunto não pode ser corrigido | M5 (`:1220`, `:1227`) |
| G3 | A conversão só lê linhas-título por grupo: os 2 Assuntos antigos do verde são a própria keyword (não linha-título) e a linha-título `8bcd8ff3` está sem grupo | M6 |
| G4 | Nada liga "volume 0" a "vira Assunto": nem o Volume nem o "Aprovar e enviar" | M10 |
| G5 | Bloco do Assunto só leitura no painel do KeywordDNA | M7 |
| G6 | O alvo publicado ignora o Assunto da página (identidade e motivo lidos da keyword, não do título) | A4 (`arquiteto-article-improvement.ts:220`), A1 (`article-improvement.ts:617`) |
| G7 | A régua de identidade segura a principal sem volume (só o Pilar troca) — contrário à D-A3 | A2 |
| G8 | Na troca do publicado, a antiga vira secundária (a decisão quer o Assunto) | A6 |
| G9 | O núcleo do slug ignora o nicho/restrição e a intenção: deixou passar as trocas dos exemplos 1–5 | A3 |
| G10 | Versão nova de publicado não pode tirar keyword: impede mover a página das secundárias para o Assunto e tirar as sem relação | A7 |
| G11 | Trava manual ainda vence o volume no Minerador (D1 de 16/10 fora do código) | M3 (`declared-plan.ts:179`) |
| G12 | Rótulo "Protegida pela página publicada" (não publicada; e publicado de volume 0 que agora pode trocar) | M8 |
| G13 | Catálogo descreve a régua da identidade (identidade fica; só o Pilar troca) | `lib/agent/platform-catalog.ts:94`, `:104` |

## 6. Proposta — dentro da linha que existe

### 6.1 A régua única: "Assunto pela principal" (Minerador, domínio puro)

Uma função só, no Minerador (dono do Assunto), lida por todos os caminhos:
`principalSubjectStanding(row)` em `lib/minerador/keyword-subject.ts` (aditiva),
que usa a MESMA leitura de "volume medido" do Minerador (a da A7 da linha única
do Minerador, hoje `readKnownVolume`, `lib/editorial/known-before-search.ts:53`):

| Estado do volume da principal | `principalSubjectStanding` | O que acontece |
|---|---|---|
| **zero** — medido 0, ou "sem média no Google Ads" ainda válido (30 dias) | `subject: "required"`, `principal: "free"` | vira o Assunto fixo no "Aprovar e enviar" (§6.2-b); o Arquiteto propõe principal nova com volume (§6.3) |
| **baixo** — medido de 1 a 39 (`SUBJECT_LOW_VOLUME_MAX = 39`) | `subject: "optional"`, `principal: "fixed"` | opção no painel (§6.2-c); escolhida, é obrigatória; o Arquiteto só reforça |
| **com volume** — medido ≥ 40 | `subject: "manual"`, `principal: "fixed"` | como hoje (T1); Assunto só se o dono cadastrar (D-A2) |
| **desconhecido** — nunca medida, outro provider, "sem média" vencida, falha | `subject: "unknown"` | nada se decide: "Meça no Minerador (Volume)" (T6/T8) |

Alcance: a keyword que é (a) a página publicada de **artigo** (Vínculo, tipo de
página ≠ Silo), (b) a keyword do plano que carrega o Assunto, ou (c) a keyword
solta que o dono cadastra. Página de Silo fica fora (S2). Publicado
"Travado ao slug" entra no Assunto, mas a troca espera o Posto (C5).

### 6.2 Minerador

| # | Comportamento | Botão / etapa que JÁ existe | Núcleo que grava (um só) |
|---|---|---|---|
| a | **Caso "Assunto na própria keyword (sem Silo)"** — keyword solta ou publicada recebe `entry` (título, detalhes), sem plano, sem trava | o card "Cadastrar Assuntos" ganha a opção de destino "Keyword (sem Silo)" no select de destino que já existe; o destino "Artigo publicado" passa a aceitar zero linhas de reforço quando o Assunto é a própria página, e a corrigir o título (prévia mostra antes → depois) | `importDeclaredPlanWithCore` → `setKeywordSubject` (o mesmo de hoje); rota `plans/import`; follow-up `plans/reapprove` (`modules/minerador/subject-cadastro-follow-up.ts`) |
| b | **Volume 0 → Assunto fixo, automático** — no "Aprovar e enviar", toda linha com `subject: "required"` e sem `entry` recebe o Assunto (título = o texto da keyword; nota antiga vira os detalhes quando houver) antes de aprovar; a prévia diz "vira o Assunto do artigo (volume 0)"; uma confirmação só | "Aprovar e enviar ao Arquiteto" (`approve-and-send-dialog.tsx`, rota `keywords/approve-and-send`) — a mudança do Volume já obriga reaprovar | o núcleo do cadastro (caso a), chamado pelo `applyApproveAndSend` **antes** da aprovação, com releitura; bloco aditivo `keyword_subject_basis = { kind: "principal_volume", volumeState: "zero", measuredAt, decidedBy, at }` |
| c | **Volume baixo → opção** "Usar esta keyword como o Assunto do artigo"; depois de gravada, a opção some (obrigatória; o gatilho M11 já impede retirar) | painel do KeywordDNA, bloco "Assunto deste artigo" (§8) | caso a; `keyword_subject_basis.volumeState = "low"` |
| d | **Assunto antigo sem grupo** entra na conversão | "Converter para o formato novo" ganha "Sem grupo" no seletor de grupo (o mesmo valor `sem-grupo` que a melhoria já aceita) | `plans/convert` → o mesmo núcleo; para o Assunto antigo que é a própria keyword (ex. 8), a conversão é o caso a (título = texto, nota → detalhes) |
| e | **Campos do Assunto editáveis** | painel do KeywordDNA (§8) — "Revisar mudança" → prévia → "Gravar" → releitura → "Reaprovar e enviar" (follow-up de sempre) | caso a / plano: `importDeclaredPlanWithCore` (Silo existente para linha de plano) |
| f | **Trava: volume definido fixa** (D1 de 16/10, G11) | select de trava do painel (`dna-panels.tsx:559-567`) diz o efeito antes de gravar | `declaredPrincipalLock` (`declared-plan.ts:168`) — a F2 da linha única do Minerador, adiantada só nesta regra |
| g | Rótulo M8 | — | `subject-article-view.ts:136-140`: "Página publicada · URL, slug e canonical ficam; a principal segue o volume" |

O Volume (E5) **não** grava Assunto: a linha do resultado só diz "volume 0 →
vira o Assunto ao aprovar e enviar". Assim o Assunto tem um gravador só.

### 6.3 Arquiteto

| # | Comportamento | Botão / núcleo que JÁ existe |
|---|---|---|
| a | **O alvo publicado lê o Assunto da página**: `theme` = título do Assunto, `note` = detalhes, `subjectKeywordId` = a página, `principalSubjectStanding` lido do pacote aprovado | `readInputs` (`lib/server/arquiteto-article-improvement.ts:204-221`) — "Melhorar publicados…" |
| b | **Régua da troca (substitui `identityHoldsPrincipal` + `pilarTrocaPelaCabeca`)**: Travada (T2/T10) nunca troca; volume ≥ 1 fixa (T1); **volume 0 com Assunto → propõe principal nova com volume** (Pilar: termo-cabeça do núcleo, cauda curta e mais volume; Suporte: a faceta dele, §15.10) — **publicado e novo, Pilar e Suporte**; desconhecido → nada | `planArticleImprovements` (`article-improvement.ts:1096`, `:1186-1193`), `subjectSlugCoreSwap` (`:661`), `volumelessPrincipalSwap` (`:1547`), `proposePublishedPrimarySwap` (`published-primary-swap.ts:171`), `editorialAiPrincipalBlock` (`:302`) — "Processar artigos" e "Melhorar publicados…" (o mesmo núcleo) |
| c | **A candidata precisa caber no Assunto**: leva o núcleo do slug **e** não contradiz o DNA do Assunto — público/nicho, restrição ("sem tráfego pago", "sem anúncios", "sem redes sociais"), localidade e intenção pela SERP (4 lentes); grafia quebrada (palavra solta de uma letra, "plano de e marketing") fica fora. ~~Ampla sem o nicho, mesma intenção, pode ser a principal (o nicho fica no Assunto, título e slug)~~ — SUBSTITUÍDO em 2026-10-19 (cobrança do dono): no publicado com o Assunto na página, a principal leva o núcleo com a entidade do DNA e o que define o artigo (restrição, negação, comparação, nicho); a ampla reforça como secundária (spec do Arquiteto §48) | `carriesSlugCore` (`:198`) + `improvementEditorialFit` (`:205`, que já confere público e restrição) + a SERP do cache |
| d | **A principal antiga vira o Assunto, não secundária** (§15.2 estendido ao publicado): sai das keywords, fica em `subject`; `publishedIdentityRef`, URL, slug, canonical e marca copiados | `buildPublishedSwapArticlePayload` (`serp-subject-model.ts:425`) e o payload do servidor da melhoria; `publishedPageKeywordIdOf` (`canonical-bootstrap.ts:52`) acha a página também pelo `subject` |
| e | **Os 16 já trocados no modo antigo**: a prévia propõe "a keyword da página passa a ser o Assunto (sai das secundárias)" e confere a principal atual pela régua c: passa → fica; não passa → proposta de troca; sem candidata → busca nova (Google Ads grátis) pela régua de sempre | "Melhorar publicados…" → "1 · Buscar keywords (grátis)" → "3 · Gravar melhorias" |
| f | **Volume baixo com Assunto**: `subject` = a própria principal (permitido, A8); principal fixa; só reforço | idem |
| g | **Versão nova de publicado pode tirar keyword** em dois casos, com decisão do dono na prévia: a página que vira o Assunto (continua no artigo) e a secundária que contradiz o Assunto (vai para "não agrupadas", nunca some, `AGENTS.md` §10) | `publishedReinforcementReadbackConfirms` (`published-reinforcement.ts:715`): "nenhuma sumiu" passa a contar o `subject` e as saídas confirmadas |
| h | Gravação | o gravador único do ArticleDNA (F1 da linha única do Arquiteto), guarda do Assunto (ator humano) e guarda de retrabalho de sempre |

### 6.4 MCP e catálogo (`AGENTS.md` §17.1)

Sem ferramenta nova. Na mesma entrega: `minerador.declare_silo_plan` (caso
"Keyword (sem Silo)" e publicado sem reforço, mesmo núcleo),
`minerador.convert_legacy_subjects` ("sem grupo"), `minerador.review_and_approve`
/ `minerador.send_to_arquiteto` (o Assunto pela principal no aprovar e enviar),
`arquiteto.article_improvement` (régua §6.3-b/c; texto de `:94` e `:104`
SUBSTITUÍDO), `arquiteto.update_article_subject`. `npm run test:agent` verde.

## 7. Tabela de conflitos

| # | Conflito | Como é reconhecido | Como se resolve | Quem decide | Onde, na tela |
|---|---|---|---|---|---|
| C1 | Sem Assunto | `keyword_subject.declared` falso numa principal de página/artigo ou keyword solta | pelo estado do volume (§6.1): zero → automático no aprovar; baixo → opção; com volume → cadastro manual; desconhecido → medir | regra (zero) · dono (demais) | Minerador → painel do KeywordDNA; "Aprovar e enviar"; card "Cadastrar Assuntos" |
| C2 | Assunto no formato anterior | declarado sem `entry` (frase = a keyword) ou linha-título | a própria keyword: ganha `entry` (título = texto, nota → detalhes) no aprovar; linha-título: "Converter para o formato novo" (com "Sem grupo") | dono confirma | Minerador |
| C3 | Principal ≠ página (troca do modo antigo) | `primaryKeywordDecision.status = confirmed` e a keyword da página entre as secundárias | página → Assunto; principal atual conferida pela régua c | dono, na prévia | Arquiteto → "Melhorar publicados…" |
| C4 | Principal sem relação com slug/canonical/Assunto | não leva o núcleo do slug, ou contradiz o DNA do Assunto (público, restrição, localidade, intenção da SERP), ou grafia quebrada | proposta de troca pela candidata que passa; sem candidata, busca nova (grátis); a SERP decide a intenção | dono, na prévia | idem |
| C5 | Publicado travado | Posto `locked` ("Travado ao slug") | o Assunto é gravado; a troca só depois de o dono mudar o Posto para Livre na Revisão Humana; a prévia diz isso | dono | Minerador (Posto) → Arquiteto |
| C6 | Volume 0 | `principalSubjectStanding = zero` | Assunto fixo; principal nova com volume (núcleo do slug + régua c) e sustentações | regra (Assunto) · dono (troca) | "Aprovar e enviar" → "Processar artigos" / "Melhorar publicados…" |
| C7 | Volume baixo | medido 1–39 | opção de Assunto; principal fixa; só reforço | dono | painel do KeywordDNA → Arquiteto |
| C8 | Volume desconhecido | nunca medida, "sem média" vencida (> 30 dias), outro provider | "Meça no Minerador (Volume)"; nada decidido | dono | Minerador → Volume |
| C9 | Keywords do modo antigo sem relação | secundária que contradiz o DNA do Assunto (régua c); a ampla de mesma intenção fica como contexto | proposta de saída (vai para "não agrupadas") ou troca por uma que sustenta | dono, na prévia | "Melhorar publicados…" |
| C10 | Artigo duplicado do mesmo Assunto | dois ArticleDNA vigentes com o mesmo `subject.keywordId` e a mesma principal | "Desfazer"/"Retirar artigo do Silo" de sempre no que sobra; nunca nasce outro | dono | Arquiteto → Artigos/Silos |
| C11 | Slug do artigo novo sem a principal | slug que não leva a principal (novo, não publicado) | a formação refaz o slug pela principal (só artigo novo) | dono | "Processar artigos" / "Melhorar publicados…" |
| C12 | Página de Silo | tipo de página `silo` | fora desta régua (S2) | — | — |

## 8. Campos do Assunto editáveis no painel do KeywordDNA

O bloco "Assunto deste artigo" (`dna-panels.tsx:633`) deixa de ser só leitura.
Cada campo com `InfoHint`; texto essencial ≥ 14px; variantes de botão do
sistema visual. Editar abre a prévia (antes → depois), grava pelo núcleo do
cadastro e relê; o sucesso só aparece depois da releitura; a keyword volta a
"Em revisão" pelo pacote e o follow-up "Reaprovar e enviar" de sempre resolve
(só a Lógica, D2/D2-bis).

| Campo | Onde mora | Editável quando | Regra |
|---|---|---|---|
| Título do Assunto | `entry.title` | sempre | 1–300, uma linha; gramática e semântica do dono |
| Detalhes | `entry.details` (sem plano) / `plan.scope` (plano) | sempre | até 1.200, uma linha |
| Papel (Pilar/Suporte) e ordem | `plan.role`, `plan.order` | keyword de plano | as recusas do card de sempre |
| Slug do plano | `plan.slug` | plano, artigo **não** publicado | publicado: URL/slug/canonical só leitura (`AGENTS.md` §11) |
| Trava | `plan.lock` | plano, não publicada | volume definido fixa (§6.2-f) |
| "Usar como Assunto do artigo" | cria `entry` | volume baixo ou com volume, sem Assunto | depois de gravado, obrigatório |
| Cadastrar Assunto | cria `entry` | keyword sem Assunto | caso §6.2-a |
| Nota antiga | `keyword_subject.note` | só leitura | "Copiar para Detalhes" |
| Origem (volume 0 / baixo / cadastro) | `keyword_subject_basis` | só leitura | — |

## 9. O que é SUBSTITUÍDO (§0.5), na fase que implementa

| Documento / código | Trecho | Vale agora |
|---|---|---|
| `docs/04-arquiteto/situacoes-resolvidas.md:101` **T12** | "Identidade **fica** (Travada ou Livre)… com pouco ou nenhum volume" | volume 0 → Assunto + troca proposta; volume ≥ 1 fixa (T1); esta SDD §6.1 |
| idem `:102` **T13** | "Pilar sem volume troca… os Suportes de identidade ficam" | Pilar e Suporte, publicado e novo |
| idem `:92` **T3**; `:110` **X3**; `:114` **X7**; `:117` **X10**; `:121` **X14** | "só fora da identidade" | a troca segue o volume e a régua c, não a identidade |
| idem `:119` **X12** | "A keyword original continua sendo a página e vira secundária" | vira o Assunto (continua sendo a página) |
| idem **U12** (§8) | "Versão nova do publicado só acrescenta" | dois casos de saída com decisão (§6.3-g) |
| `docs/04-arquiteto/spec.md` §41 itens 2, 3 e 5 (`:68-80`); §45 item 5 (`:22`); §35 item 3 (`:165`) | identidade fica; Suportes ficam; troca só fora da identidade | esta SDD |
| `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md` §15.2 (`:1033-1034`) | "No publicado (D2.1), a antiga continua secundária" | a antiga vira o Assunto |
| idem §15.5 (`:1095-1145`), "Identidade fica" e "Publicados" | — | esta SDD |
| idem §15.9, linha F (`:1351`) | "Travada e Suportes, como antes" | Suporte de volume 0 também troca |
| `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md` §3.4 (`:182`) | "Trava não se aplica (a principal do publicado é protegida)" | publicado de volume 0: principal livre para troca, com decisão |
| `lib/agent/platform-catalog.ts:94`, `:104` | régua da identidade; "só a principal com volume fica travada ao slug" | régua §6.3-b/c |
| `lib/arquiteto/article-improvement.ts:601-633` | `identityHoldsPrincipal`/`pilarTrocaPelaCabeca` como portão da troca | chamam a régua nova (ou saem); `principalIsIdentity` continua só para o motivo e a SERP de identidade (§42) |
| `lib/minerador/subject-article-view.ts:136-140` | "Protegida pela página publicada" | §6.2-g |
| Memória do coordenador "Principal de identidade se preserva" (17/10) | — | atualizar para esta regra (fora do repositório) |

Continua valendo: T1, T2, T10, T5–T8, X2, X4–X6, X8 (com a pergunta Q5), X9,
A2–A4, A12, U1–U2, `AGENTS.md` §11.

## 10. Consumidores

| Consumidor | Efeito | Proteção |
|---|---|---|
| Minerador: cadastro, conversão, aprovar e enviar, painel | caso novo, "sem grupo", Assunto pela principal, edição | testes do núcleo e DOM pelos botões |
| `KeywordDna.subject` (`.strict()`, vista) | sem campo novo no schema; `keyword_subject_basis` fica fora dele | teste com pacote antigo e novo |
| Gatilho "o Assunto nunca se perde" | só acréscimo e edição; nenhuma retirada | `minerador-assunto-nunca-se-perde` |
| Arquiteto: formação, melhoria, mesa D2.1, reforço, diferenciação, IA | régua nova; publicado com Assunto | cenários §14 |
| Guarda de retrabalho / Radar / Redator | versão nova de 9 artigos no Radar, 2 no Redator → "Atualização disponível"; o Radar se adapta | `editorial-rework-guard`, testes do Radar |
| Publicações | nada (0 registros na AdalbaPro) | — |
| MCP / catálogo | §6.4 | `test:agent`, `test:redator:mcp` |
| WifiConecta (amarelo, já formado) | o refazedor passa a propor troca também nos Suportes sem volume | cenário amarelo atualizado; decisão do dono na prévia (Q8) |

## 11. Riscos

- **R1 · Publicado travado** — o volume 0 não passa por cima do "Travado ao
  slug" (`AGENTS.md` §11): sem o Posto Livre, só o Assunto é gravado (C5).
- **R2 · Canonical, URL e slug** — copiados em toda versão; releitura confere;
  `PUBLISHED_IDENTITY_ASSIGNMENT_KEYS` intocado.
- **R3 · Achar a página depois da troca** — a página sai das keywords para o
  `subject`; `publishedPageKeywordIdOf` e `readDifferentiationArticleIndex`
  precisam achar pelo `subject` / `publishedIdentityRef` (cenário próprio).
- **R4 · Guarda de retrabalho** — 9 artigos no Radar e 2 ContentDocuments; a
  versão nova passa pela guarda de sempre e o Radar mostra a atualização.
- **R5 · Texto já escrito** — os 2 artigos no Redator foram escritos com a
  principal antiga; nada é reescrito sem o dono.
- **R6 · "Sem média" vence em 25/10** — depois disso as 17 páginas viram
  "desconhecido" (C8) até o dono medir de novo (Google Ads, sem custo de SERP).
- **R7 · Régua c mais estrita** pode deixar artigos sem candidata: ~~a página
  continua com a principal atual e a prévia diz o porquê (nunca troca às cegas)~~.
  SUBSTITUÍDO em 2026-10-19 (dono: a principal sem relação com o slug não fica):
  sem candidata, o Assunto (a página) fica como o foco e a principal do artigo, e a
  vaga da principal com volume fica aberta, dita na prévia (spec do Arquiteto §48).
- **R8 · Duas formas de Assunto convivendo** (anterior e cadastro) — leitura
  única (`resolveKeywordSubject`, `subjectPhraseOf`), cenários dos dois.
- **R9 · Catálogo MCP** desatualizado conduz a IA ao caminho velho — mesma entrega.
- **R10 · Gatilho do banco** — o Assunto automático fica para sempre (só sai por
  "Tirar do plano" no plano); uma página excluída depois cai na recusa
  `KEYWORD_DELETE_SUBJECT_PROTECTED` — é o comportamento pedido ("obrigatório").
- **R11 · Excluir em qualquer estado** — a plataforma agora tem "Excluir tudo
  da cor" no Minerador (desmonta as peças do Arquiteto) e "Desfazer Silo" em
  qualquer estado no Arquiteto. O verde é **exatamente** as 25 publicadas:
  "Excluir tudo da cor → verde" mandaria as 25 para a lixeira de 24 h e
  desmontaria os 21 ArticleDNA e os 4 Silos. No teste, nunca usar esses dois
  botões no verde nem nos 4 Silos publicados; a exclusão do Assunto com
  `entry` passa pelo marcador `via: "excluir_cor"` (M11), então o Assunto
  gravado por esta SDD não protege contra esse botão — protege só contra
  escrita que o tire sem liberação. C10 (artigo duplicado) usa o "Desfazer"/
  "Retirar artigo do Silo" de sempre só no artigo novo duplicado.
- **R12 · Localidade da SERP por marca** — a AdalbaPro passa a ter a SERP em
  São Paulo (cidade), ainda pendente de ativação. A régua c lê a SERP do cache;
  cache coletado na localidade anterior não vale como evidência da localidade
  nova, então a primeira leitura depois da ativação paga a coleta (4 lentes,
  até US$ 0,014 por keyword, custo dito antes). Recomendação: ativar a
  localidade **antes** do passo 5 do §16, para não pagar duas vezes; e a
  candidata com outra cidade ("agencia de marketing em são paulo" num artigo
  de nicho) é julgada pela intenção na SERP de São Paulo, não pela palavra.

## 12. Migration

**Nenhuma.** `keyword_subject.entry` já existe; `keyword_subject_basis` é chave
nova em `analise_semantica` (jsonb, aditiva, ignorada pelos leitores antigos);
`ArticleDNA.subject` já é opcional no contrato; nenhum enum `.strict()` muda.
O gatilho aplicado (M11) aceita acréscimo e edição. Se a fase F2 mostrar
necessidade de schema, ela para e volta ao dono com o SQL descrito ("o dono roda").

## 13. Rollback

Código abaixo desta entrega: o `entry` gravado continua lido como Assunto do
cadastro (sem plano); `keyword_subject_basis` é ignorado; ArticleDNA com
`subject` no publicado é lido pelo contrato de hoje. A régua velha voltaria a
segurar a principal — nada gravado muda de significado. Ordem de deploy (§15):
o Minerador que grava o Assunto automático (F4) e o Arquiteto que o lê (F5) vão
juntos.

## 14. Testes (fixtures, sem chamada paga)

**Cenários-ouro novos** (`tests/assunto-pela-principal-cenarios.test.mts`, com
fixture tirada desta leitura da AdalbaPro):

| # | Cenário | Conclusão esperada |
|---|---|---|
| Z1 | Página publicada sem média, nunca trocada (`como-atrair-pacientes-para-clinica-de-estetica`) | aprovar e enviar grava o Assunto; melhoria propõe principal nova com volume que leva o núcleo e o nicho; a página vira `subject`; URL/slug/canonical iguais |
| Z2 | Página sem média já trocada com principal que passa (`campanhas-de-marketing…`) | página sai das secundárias para o Assunto; a principal atual fica |
| Z3 | Página sem média trocada para principal que contradiz (`marketing-harmonizacao-facial`, `como-criar-um-plano…`, `captacao…sem-trafego-pago`) | proposta de troca; sem candidata, busca nova; nunca "harmonização fácial preço" |
| Z4 | Volume baixo (`…consultorio-odontologico`, 10) | opção no painel; escolhida → Assunto = a própria principal; principal fixa; só reforço |
| Z5 | Volume ≥ 40 (`marketing-para-clinica-de-estetica`, 90) | como hoje |
| Z6 | Publicado "Travado ao slug" de volume 0 | Assunto gravado; troca recusada até o Posto Livre |
| Z7 | "Sem média" vencida | "Meça no Minerador"; nada proposto |
| Z8 | Assunto antigo sem grupo (linha-título e própria keyword) | conversão "Sem grupo" e caso a |
| Z9 | Artigo duplicado do mesmo Assunto | apontado; nada nasce |
| Z10 | Keyword solta cadastrada como Assunto (caso a) | `entry` sem plano; rótulo certo (M8) |
| Z11 | Edição do título no painel | prévia → gravação → releitura → "Em revisão" → reaprovar só a Lógica |
| Z12 | Plano do amarelo (WifiConecta): Suporte Livre sem volume | agora recebe proposta (era "fica") — o cenário amarelo é atualizado na mesma entrega |

**DOM pelos botões** (os mesmos de sempre): painel do KeywordDNA (campos,
InfoHint, prévia, gravar), "Aprovar e enviar" (a linha "vira o Assunto"),
"Converter para o formato novo" ("Sem grupo"), card (destino "Keyword (sem
Silo)"), "Melhorar publicados…" (a linha "página → Assunto" e a troca).
**Guarda de forma:** cada botão uma vez; nenhuma rota nova; o Volume não grava
Assunto; um gravador do Assunto. Suítes: `npm run test:regressao` inteira
(Minerador, Arquiteto, servidor, lentes, Radar, Redator, MCP, agent, `tsc`).

## 15. Fases

| Fase | O que entra | Pronto quando |
|---|---|---|
| F0 | Só testes: Z1–Z12 vermelhos onde a regra muda, verdes no que já vale; guarda de forma | bateria roda; vermelhos documentados |
| F1 | `principalSubjectStanding` (domínio puro) e os leitores (painel mostra o estado; Arquiteto lê) — nada grava | Z5, Z7 verdes; nenhuma escrita nova |
| F2 | Minerador grava: caso "Keyword (sem Silo)", publicado sem reforço e com título corrigível, conversão "Sem grupo", trava pelo volume (G11), rótulo M8 — mesmo núcleo e rotas | Z8, Z10 verdes; MCP pelo mesmo núcleo |
| F3 | Painel do KeywordDNA editável + opção do volume baixo | Z4 (lado Minerador), Z11 verdes; DOM pelo botão |
| F4 | "Aprovar e enviar" grava o Assunto do volume 0 | Z1/Z6 (lado Minerador) verdes |
| F5 | Arquiteto: alvo publicado com Assunto, régua da troca, régua c, antiga → Assunto, saídas com decisão, achar a página pelo `subject` | Z1–Z3, Z6, Z9, Z12 verdes; R3 coberto |
| F6 | Catálogo, spec, SDDs e registro: SUBSTITUÍDO (§9), situações novas no `situacoes-resolvidas.md` | `test:agent` verde; textos marcados |
| F7 | Teste com a AdalbaPro pelos botões (§16) | readback por SELECT confere §16 |

Deploys: **A** = F0–F3 (o Minerador passa a editar; nada automático);
**B** = F4 + F5 + F6 juntos. Bateria verde no local antes de cada um.

## 16. Plano de teste com a AdalbaPro (pelos botões; o banco só é lido)

**Lote:** o grupo **verde** (§4.0) — 25 keywords, 21 páginas de artigo, 4 de
Silo. Fora do lote: as 158 sem grupo, os 4 artigos novos e a linha-título
`8bcd8ff3` (C10/C11, depois). **Quando:** antes de 2026-10-25 (validade do
"sem média"), ou depois de medir de novo o verde pelo Volume; e com a
localidade São Paulo já ativada (R12). **Nunca** "Excluir tudo da cor" no
verde nem "Desfazer Silo" nos 4 Silos publicados (R11).

Contagem esperada antes de começar (SELECT): verde = 25; 2 com Assunto (sem
`entry`); 17 páginas de artigo sem média; 2 com 10; 2 com ≥ 40; 16 páginas
como secundária do próprio artigo.

1. **Minerador → filtro pela cor verde** → selecionar as **17** páginas de
   artigo sem média → "Aprovar e enviar" → a prévia diz "17 viram o Assunto do
   artigo (volume 0)" (inclui `b1e61059` e `c937661d`, os Assuntos antigos, que
   ganham `entry` com a nota como detalhes) e não mostra as 4 de Silo →
   confirmar. **SELECT:** 17 com `keyword_subject.entry` e
   `keyword_subject_basis.volumeState = "zero"`; pacote novo; item recebido com
   o pacote novo; as 4 de Silo e as 4 de volume ≥ 10 sem mudança.
2. **Painel do KeywordDNA** de `64e259d6` e `24679c44` (10) → "Usar como Assunto
   do artigo" → prévia → gravar → reaprovar e enviar. **SELECT:** 2 com `entry`,
   `volumeState = "low"`; principal igual.
3. **Painel** de 2 das 17 → corrigir o título (gramática: "Captação de
   pacientes sem tráfego pago") → gravar. **SELECT:** título novo, histórico
   com o anterior; a keyword volta a "Em revisão" e o "Reaprovar e enviar" a
   devolve aprovada.
4. **Arquiteto → "Melhorar publicados…"** com o recorte da cor **verde** (o
   filtro por cor que a melhoria já aceita) → **"1 · Buscar keywords (grátis)"**
   → a prévia mostra, por página: "página → Assunto", principal fica ou
   proposta, saídas (C9). Esperado: as 16 trocadas com "página → Assunto";
   pelo menos `5a7ec0c7`, `f05faad5`, `92d3101c`, `8170a492` com proposta de
   troca (C4); `b324d9f6` com proposta de principal nova com volume (C6);
   `24679c44` e `64e259d6` só com reforço (C7); `f8d3a654` e `ecbca2b4` como
   hoje. Custo dito antes: SERP só das candidatas sem cache na localidade
   nova, até US$ 0,014 por keyword (teto da rodada ≤ US$ 0,50 para as 21;
   teto de teste US$ 5). Google Ads sem custo de SERP.
5. **"3 · Gravar melhorias"** nas que o dono aceitar. **SELECT:** ArticleDNA
   v+1 com `subject.keywordId` = a página; URL, slug, canonical, marca e
   `publishedIdentityRef` iguais à versão anterior; nenhuma keyword sumiu
   (as que saíram estão em "não agrupadas"); SiloDNA/SiloPage com "Atualização
   disponível" pelo caminho de sempre.
6. **Radar:** dos artigos do verde, 4 estão no Radar em `research_pending`
   (`9717d543`, `99ff3339`, `f8d3a654`, `92d3101c`) e 2 em
   `sent_writer` com ContentDocument (`1ac658dc`, `8170a492`): mostram
   "Atualização disponível"; nada é reescrito sozinho.

## 17. Perguntas ao dono

- **Q1.** "Volume 0" inclui o "sem média no Google Ads"? É o caso real das 17
  páginas (nenhuma keyword da AdalbaPro tem 0 medido). Recomendação: sim (T5/T7).
- **Q2.** "Automático" acontece no "Aprovar e enviar" (recomendado: é onde a
  mudança do Volume já obriga reaprovar, e o Assunto fica com um gravador só)
  ou já no clique do Volume?
- **Q3.** O título automático é o texto da keyword (recomendado, editável no
  painel) ou o H1 da página (exigiria ler o site)?
- **Q4.** Publicado "Travado ao slug" com volume 0: o dono muda o Posto antes
  (recomendado, `AGENTS.md` §11) ou o volume 0 libera a troca sozinho?
- **Q5.** Página que ranqueia no top 10 pela principal antiga (X8): continua
  bloqueando a troca, ou vira aviso, já que a antiga fica no título e no slug
  como Assunto? Recomendação: aviso.
- **Q6.** Nas 16 trocadas no modo antigo, a principal atual que passa na régua
  nova fica (recomendado) e só a página vira o Assunto?
- **Q7.** Volume ≥ 40: continua como hoje (principal fixa; Assunto só por
  cadastro manual)?
- **Q8.** A troca do Suporte sem volume vale também para o amarelo da WifiConecta
  já formado (o refazedor passaria a propor)?
- **Q9.** Editar o Assunto com a Revisão Humana concluída (backlog do Minerador,
  `docs/03-minerador/backlog.md:414`): recomendação: pode, porque é cadastro;
  a keyword só volta a "Em revisão" pelo pacote.
- **Q10.** As 84 keywords fora de artigo, muitas de consumidor (botox, limpeza
  de pele): ficam fora desta SDD (Lógica/Revisão do Minerador)? Recomendação: sim.
- **Q11.** No WhatsApp duplicado (`8bcd8ff3` v3 × `article-formation:62ade5c4` v1),
  qual artigo fica?

## 18. Andamento

- 2026-10-18 — PROPOSTA escrita (investigação no código e SELECT na AdalbaPro).
  Releitura depois do agrupamento do dono: o grupo verde = as 25 publicadas
  (§4.0); o plano de teste (§16) é o verde. Registradas as novidades da
  plataforma do mesmo dia: exclusão em qualquer estado (R11) e localidade da
  SERP por marca, AdalbaPro = São Paulo, pendente de ativação (R12).
  Nenhuma fase iniciada.
- 2026-10-18 (noite) — **F0–F6 implementadas** (F7 é do coordenador): a régua `principalSubjectStanding` (Minerador) e `principalSwapStanding`/`principalFitsSubject`/`enforcePageSubject` (Arquiteto); o destino "Keyword (sem Silo)", o publicado sem reforço e com título corrigível, a conversão "Sem grupo", a trava pelo volume e o rótulo M8; o painel do KeywordDNA editável ("Editar Assunto", "Usar como Assunto do artigo", "Cadastrar Assunto"); o "Aprovar e enviar" grava o Assunto do volume 0 (e re-assina a publicada aprovada); o Arquiteto lê o Assunto da página, propõe a principal com volume pela régua c, a página vira o `subject` e a secundária que contradiz sai com decisão. Nenhuma migration, rota, etapa ou botão de etapa novo. Textos SUBSTITUÍDOS conforme o §9 (registro T14, U18, A14, A15; spec do Arquiteto §47; spec do Minerador §80; catálogo; tutorial do "?"). Fora desta entrega (backlog): a mesa D2.1/"Reforçar publicados" ainda gravam a antiga como secundária; Z9 (`todo`). Testes: `tests/assunto-pela-principal-cenarios.test.mts`, `tests/minerador-assunto-pela-principal-dom.test.mts` e o caso novo de `tests/arquiteto-article-improvement-dom.test.mts`.
- 2026-10-19 (tarde) — **Cobrança do dono depois da prévia do verde** (principais do modo antigo que "não têm quase nada a ver com o original"; canibalização entre os artigos; "nova coleta da SERP quando refizer"). Correção DENTRO da linha (mesmo núcleo, mesmos botões; nenhuma rota, etapa, botão ou migration): a régua c ganha o que define o artigo (restrição, negação, comparação, nicho) e o núcleo com a entidade do DNA; a principal do modo antigo só fica se couber; sem candidata, o Assunto fica como o foco (a página é a principal; vaga aberta) — o Assunto que mora na keyword pode ser a principal sem volume (A5; a guarda `verifySubjectAsPrincipal` passa a usar `subjectMayBePrincipal`); o refazedor reorganiza o recorte antes de escolher (mesma linha do Google Ads, mesma busca em dois artigos, a keyword que serve a outro Assunto vai para ele, com as duas linhas gravadas juntas); com a marca numa cidade, a `evidencia_serp` nacional do Minerador não decide a intenção; ao refazer, a guarda de retrabalho não barra a recoleta e a coleta de uma keyword só não entra no registro da guarda; a mesa D2.1, o "Reforçar publicados" e a diferenciação passam a usar a mesma régua (`proposePublishedPrimarySwap` com `pageSubject`), e a mesa e o Reforçar prendem o Assunto da página na troca (o item do backlog de 18/10 "a mesa D2.1/Reforçar ainda gravam a antiga como secundária" está resolvido). SUBSTITUÍDOS: §6.3-c ("ampla sem o nicho pode ser a principal"), §11 R7 ("a página continua com a principal atual"), §6.3-e na leitura "a principal atual fica se passar na régua c" pelo núcleo só das palavras. Registro: `docs/04-arquiteto/situacoes-resolvidas.md` T15, U19, G21, Z11; spec do Arquiteto §48. Testes: `tests/arquiteto-cenarios-ouro-verde-2026-10-19.test.mts` (V6–V9, V11) e `tests/arquiteto-cenarios-ouro-servidor-2026-10-16.test.mts` (V5 atualizados, V10). Homologação pelos botões: do dono (roteiro no `estado-atual.md` do Arquiteto, 19/10, tarde).

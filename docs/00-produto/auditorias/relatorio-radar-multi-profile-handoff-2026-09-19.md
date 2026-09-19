# Relatório — RADAR_MULTI_PROFILE_HANDOFF_1 — 2026-09-19

## O que o USER viu

Três artigos, um por perfil: Google ("skincare para pele oleosa"), YouTube
("skin care noturno") e Amazon ("skin care nivea", TOP_BEST). Depois da
correção anterior, o YouTube foi entregue ("Pacote entregue ao Redator."), mas:

1. o segundo clique no mesmo artigo respondeu "Já existe documento deste artigo
   com pacote anterior. A base não é substituída aqui.";
2. o diálogo "Importar do Radar" do Redator listava só o Google;
3. a planilha do Radar mostrava YouTube e Amazon como "Não iniciado / Iniciar
   Pesquisa Google", ao lado de investigações finalizadas.

## Três causas, confirmadas no banco e por reprodução offline

A leitura foi somente-leitura (`supabase db query --linked`) e a reprodução
rodou `resolveRadarCanonicalDossier` + `resolveRadarImportEligibility` +
`buildRadarDocument` com os payloads reais dos três artigos: os três resolvem,
estão prontos e são elegíveis. O defeito não estava na investigação.

### 1. A hora do clique entrava no hash

`RadarEvidenceBundle.observedAt` faz parte da serialização canônica que gera
`bundleHash`. `sendRadarToWriter` resolvia o dossiê com `observedAt = sentAt`;
o export portátil, com `exportedAt`. Cada clique produzia um pacote "novo", e a
idempotência — `entregueAntes.evidenceBundleHash === bundle.bundleHash` —
nunca reconhecia o segundo envio: caía em `radar_handoff_document_exists`.

**Correção.** `radarFrozenObservedAtOfAnalysis(payload)` em
`lib/radar/evidence-bundle-runtime.ts`, na mesma precedência de
`radarPrimaryProfileOfAnalysis` (AMAZON > YOUTUBE > GOOGLE): devolve
`amazonFrozenInvestigation.finalizedAt`, `youtubeFrozenInvestigation.finalizedAt`
ou `finalizedBundle.frozenAt`. O envio e o export passam esse instante ao
resolver; o fallback para a hora do clique só existe quando não há
congelamento — e aí a resolução já recusa por `radar_research_not_finalized`.

### 2. O diálogo do Redator filtrava pela esteira

`availableRadarArticles` exigia `state ∈ {approved, sent_writer}`. A esteira
não se move com a finalização (invariante 55): YouTube e Amazon finalizados
ficam `research_pending` e sumiam da lista. O Google aparecia porque já tinha
sido enviado.

**Correção.** `radarWriterImportable(item, radarPrimaryProfileOfAnalysis)` em
`lib/redator/writer-handoff.ts`: importável é quem tem perfil finalizado na
análise CORRENTE, ou quem já está em `sent_writer` (listado como importado,
para que repetir não duplique).

### 3. A planilha caía no padrão Google

`searchModeByArticle` só existe para o artigo que a pessoa abriu na sessão;
toda outra linha lia `RADAR_DEFAULT_SEARCH_MODE` (WEB → GOOGLE) e perguntava
ao pipeline do Google sobre um artigo congelado no YouTube.

**Correção.** `modoEfetivoDe(row)` em `modules/radar/radar-page.tsx`:
escolha da sessão → alvo GRAVADO (`radarResearchPlanOfAnalysis(...).primaryTarget`,
que já resolve por alvo declarado ou fotografia congelada) → padrão. Os doze
pontos da página que liam o modo passam por ele; nenhum pula da sessão direto
para o padrão.

**Adendo (mesmo dia).** O painel do artigo (`searchMode` passado ao workbench)
era um décimo terceiro ponto, com `activeRadarItem` em vez de `row`/`target`, e
escapou da varredura: o artigo de YouTube abria na aba Google, com o seletor
destravado e "Iniciar Pesquisa YouTube" habilitado — e o clique recebia a recusa
correta do guard de modo. Passou por `modoEfetivoDe(activeRadarItem)`; o teste
estrutural agora recusa qualquer identificador (`w+`).

## O que NÃO mudou

- Nenhuma evidência congelada foi recriada; nenhum artigo precisa refinalizar.
- A ordem do handoff, a prontidão canônica, a integridade do bundle e a
  revalidação do ArticleDNA continuam iguais.
- `sentAt` continua sendo gravado no recibo (`writerBundle.sentAt`); ele só
  deixou de participar do hash.
- O export portátil resolve com o mesmo instante do envio: paridade mantida.

## Testes

Mutantes (todos código válido, todos mortos): precedência invertida do instante;
instante sempre nulo; envio com a hora do clique; export com a hora do clique;
`sent_writer` fora do diálogo; diálogo lendo a primeira análise; qualquer
análise vale; esteira `approved` decidindo; planilha pulando para o padrão.

- `tests/radar-multi-profile-handoff-1.test.mts` (10): precedência e ausência
  do instante congelado; paridade envio/export; regra do diálogo (perfil,
  análise corrente, `sent_writer`); modo efetivo da página; PROVIDER_CALLS = 0.
- `tests/radar-to-writer-handoff-1.test.mts` (+5, bloco S): segundo clique em
  outra hora reconhece o mesmo pacote (YouTube e Amazon, pela bancada de
  envio); Google provado na resolução do dossiê, com a contraprova de que a
  hora do clique mudaria o hash.
- Pinos atualizados: `planejador-fora-do-pipeline` (16),
  `radar-fase1-modos-e-roteamento` (B e C).

```text
tsc --noEmit                    limpo
eslint (arquivos tocados)       0 erros · 11 avisos pré-existentes
test:radar                      2250/2250
test:redator                    250/250
handoff (5 suítes)              75/75
test:editorial / operational    4 + 10 falhas PRÉ-EXISTENTES, sem referência a
                                nenhum arquivo tocado (Admin layout, /conta,
                                Arquiteto)
bateria de mutantes             verde antes: sim · 9/9 mortos · verde no fim: sim
                                (app fechado pelo USER; fontes restauradas)
```

## O que continua aberto — decisão do USER

1. **"Processado no Google" para YouTube e Amazon.** No banco, o artigo de
   YouTube tem `serpSnapshotId` mas nenhum `deepResearch`, extração ou
   `supportResearch`; o de Amazon não tem nada do Google. A tela não pode
   dizer "processado" sobre o que não foi coletado. O fluxo de apoio do Google
   precisa rodar para esses dois — providers autorizados, mas o clique no
   fluxo real é do USER.
2. **Amazon TOP_BEST com `productClass: "skincare"`.** A elegibilidade exige o
   termo literal no título; 0/48 candidatos passam ("O título não menciona
   'skincare'"). Defeito de desenho em `lib/radar/amazon-eligibility.ts`, fora
   deste gate.
3. **Botão "Enviar ao Redator" para o artigo focado.** A barra de lote só
   aparece com checkbox marcado; melhoria de interface, não de domínio.

```text
RADAR_MULTI_PROFILE_HANDOFF_1 = PASS · MUTANTES = 9/9
REFINALIZE_REQUIRED = NO · RECOLLECTION = NO
MIGRATIONS = 0 · PROVIDER_CALLS = 0 · AI_CALLS = 0 · ARTICLE_DNA_MUTATED = NO
MANUAL_UI_VALIDATED = pendente do USER
```

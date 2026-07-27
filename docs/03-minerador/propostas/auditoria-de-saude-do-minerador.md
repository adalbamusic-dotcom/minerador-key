# Auditoria de saúde do Minerador

> **Snapshot histórico — 2026-07-20:** os caminhos e evidências abaixo descrevem a árvore anterior à consolidação tenantizada. O estado atual usa `app/(brand)/[brandRef]` e `modules/minerador`; este documento é preservado para proveniência da auditoria, não como contrato atual.

- **Data:** 2026-07-20
- **Fase:** Fase 1 — auditoria e diagnóstico não destrutivos
- **Módulo proprietário:** Minerador
- **Resultado resumido:** o Minerador tem uma implementação funcional e compilável, mas a saúde real não pode ser classificada como íntegra. Foram encontrados riscos comprováveis de escopo por marca, mutação automática durante leitura, persistência parcial e transferência Minerador → Arquiteto dependente de estado local do navegador.

## 1. Objetivo e escopo

Esta auditoria confrontou a documentação canônica com o código atual, os contratos consumidos, as fontes de dados, a persistência, a interface, a extensão, os filtros, o KGR, o KeywordDNA e a entrada do Arquiteto.

Foram analisados:

- documentação em `docs/00-produto/`, `docs/03-minerador/`, `docs/04-arquiteto/`, `docs/compartilhado/` e decisões ADR relacionadas;
- `app/(workspace)/minerador/page.tsx`;
- APIs `mine`, `volume`, `analyze`, `clusterize`, `process-intent-niche` e `generate-briefing`;
- `minerador-extensao/`;
- `components/brand-context.tsx`, `components/editorial-pipeline-context.tsx` e componentes consumidos pelo Minerador;
- contratos e adaptadores do Arquiteto usados para KeywordDNA;
- testes de domínio, fluxo, pipeline e autorização;
- migrations e scripts locais somente para entender proteções e lacunas de schema.

Não foram executados banco remoto, Supabase, APIs externas, Google, IA paga, extensão carregada no Chrome, limpeza de dados, migration, deploy, commit ou push.

## 2. Legenda de evidência

- **Verificado no código:** comportamento observado diretamente nos arquivos atuais.
- **Confirmado por teste:** teste automatizado executado nesta auditoria.
- **Ainda não verificado:** depende de banco remoto, navegador autenticado, extensão carregada ou operação externa.
- **Planejado:** recomendação, sem implementação nesta fase.

## 3. Inventário técnico

### 3.1 Mapa principal

```text
Google Autocomplete / CSV / copiar-colar
  → normalização local
  → listas_kgr e keywords_kgr via Supabase cliente
  → fetchData e filtros locais
  → KeywordDNA lógico em analise_semantica + intent
  → status/seleção/KGR/exportação
  → Arquiteto lê keywords aprovadas/publicadas
  → índice architectImportedKeywordIds local por marca
  → masterList e ArticleDNA/SiloDNA no workspace do Arquiteto
```

### 3.2 Rota e tela

- `/minerador` é renderizada por `app/(workspace)/minerador/page.tsx`.
- A tela é um monólito de 2.745 linhas e concentra carregamento, importação, filtros, ordenação, edição, ações em massa, histórico, exportação, KeywordDNA e briefing.
- A dependência direta do motor `lib/arquiteto/keyword-dna-engine.ts` é **Verificada no código**. Isso funciona hoje, mas ultrapassa a fronteira documentada de consumo de contratos/API e deve ser tratado como proposta SDD antes de qualquer reorganização.

### 3.3 Componentes e estado

- `BrandProvider`: marca ativa, papel e lista de marcas; `selected_brand_id` usa `localStorage`.
- `useLocalHistory("minerador", ...)`: histórico em memória de navegação, isolado por marca, com limite de 30 entradas; não é persistência remota.
- `CompactSavedViews`: preferências de filtros em `localStorage`, isoladas por usuário, marca e módulo.
- `KeywordDnaPanel`: exibe o DNA dentro do Minerador e cria uma referência legada derivada do registro atual.
- `DangerApprovalDialog`: exige frase e confirmação explícita para a exclusão manual em lote.

### 3.4 Fontes e persistência

| Camada | Fonte | Estado observado |
| --- | --- | --- |
| Marca | `/api/marcas` via `BrandProvider` | fluxo de seleção presente; jornada autenticada ainda não validada manualmente |
| Listas/silos | `listas_kgr` via Supabase cliente | filtradas por `marca_id` quando há marca selecionada |
| Keywords | `keywords_kgr` via Supabase cliente | filtradas por `lista_id`; keywords sem lista entram globalmente |
| Briefings | `briefings_artigos` | leitura/edição e geração via API; schema remoto não verificado |
| Histórico | `Map` em memória | local e temporário à sessão de navegação |
| Visões | `localStorage` por usuário/marca/módulo | local; falha de parse remove a preferência daquela chave |
| KeywordDNA | `intent` + `analise_semantica` em JSONB | DNA lógico local/legado; não há envelope versionado próprio persistido no Minerador |
| Extensão | `chrome.storage.local` + REST Supabase | token e preferências locais; escrita direta no legado |

### 3.5 APIs e integrações

- `/api/mine`: requer sessão Google, consulta Google Autocomplete e cria Google Sheet; não é chamado pela página atual do Minerador.
- Extensão: consulta diretamente Google Autocomplete e REST Supabase, sem passar por `/api/mine`.
- `/api/volume`: protege a rota com sessão e chama RapidAPI ou Keywords Everywhere; a ação é externa e potencialmente paga.
- `/api/analyze` e `/api/process-intent-niche`: validam a propriedade da keyword no servidor, chamam IA externa e gravam em `keywords_kgr`.
- `/api/clusterize`: chama IA e aceita um array arbitrário; não há referência encontrada na página atual do Minerador.
- `/api/generate-briefing`: chama IA, valida somente o primeiro `lista_id` recebido e insere em `briefings_artigos`.

## 4. Funcionalidades verificadas no código

- **Importação CSV:** reconhece colunas de keyword, resultados, volume, intenção, status, silo e slug; exige silo resolvido e insere em lote.
- **Importação manual:** exige texto e lista de destino; calcula intenção/nicho heurísticos e DNA lógico antes do insert.
- **Extensão:** possui login Supabase, seleção de marca para admin, seleção de lista, localidades, deduplicação por lista e escrita em `keywords_kgr`.
- **Filtros:** status, intenção, silo, busca por keyword/localidade e ordenação por keyword, resultados, volume, KGR, nicho e lista.
- **Seleção e ações em massa:** seleção parcial, mover, aprovar, publicar, qualificar, análise semântica, nicho/intenção, briefing e exclusão.
- **KGR:** quando volume e allintitle são números positivos, calcula `results_allintitle / volume`; volume ausente ou API indisponível fica como `estimado` e KGR nulo.
- **Exportação:** CSV local com BOM UTF-8, separador `;`, colunas fixas e campos semânticos dinâmicos.
- **KeywordDNA lógico:** derivação determinística sem chamada de IA; preserva campos semânticos existentes por meio de `mergeLogicalKeywordSemantic`.
- **Proteção de publicados na UI:** bloqueia mover/rebaixar/excluir registros publicados e avisa sobre volume estimado antes de publicar.
- **Histórico e visões:** existem no código, mas com persistência local/in-memory, conforme tabela acima.

As afirmações acima são **Verificadas no código**. Não equivalem a funcionamento ponta a ponta.

## 5. Problemas encontrados

### M-01 — Escopo de marca incompleto e risco de mistura de dados

- **Classificação:** P1 — integridade e isolamento de marca.
- **Evidência:** `app/(workspace)/minerador/page.tsx:308-357` filtra listas por `selectedBrandId`, mas, havendo marca, carrega keywords por `lista_id` permitido **ou `lista_id.is.null`**. Keywords sem lista não possuem vínculo de marca nessa consulta e entram no workspace de qualquer marca.
- **Evidência adicional:** quando `selectedBrandId` está vazio, a mesma função carrega todas as listas e todas as keywords (`page.tsx:349-357`). O efeito de redirecionamento do admin ocorre separadamente (`page.tsx:452-457`), portanto a leitura ampla pode ocorrer antes da navegação.
- **Impacto:** keywords órfãs podem aparecer, receber DNA, serem selecionadas, aprovadas, publicadas ou exportadas no contexto errado. O risco é especialmente relevante para a invariante “dados de marcas diferentes nunca se misturam”.
- **Estado:** **Verificado no código; ainda não verificado com dados reais**.
- **Recomendação:** exigir marca resolvida antes de consultar/renderizar; definir contrato explícito para keywords sem lista; aplicar escopo server-side/RLS ou endpoint proprietário antes de qualquer correção estrutural.

### M-02 — Leitura da tela executa exclusão e alterações automáticas

- **Classificação:** P1 — risco de perda/alteração silenciosa de dados.
- **Evidência:** ao carregar `fetchData`, a página deduplica e apaga registros diretamente em `keywords_kgr` (`page.tsx:360-393`), atualiza nicho de listas sem nicho (`page.tsx:395-410`) e persiste o KeywordDNA lógico de todas as keywords elegíveis (`page.tsx:413-425`).
- **Impacto:** abrir ou recarregar `/minerador` não é uma operação somente leitura. A deduplicação escolhe registros sem snapshot, sem confirmação e sem rollback transacional; uma falha ou regra lexical inadequada pode eliminar a cópia errada. O nicho e o DNA também podem mudar sem uma ação explícita do usuário.
- **Divergência:** a documentação descreve carregamento, filtros e persistência, mas não declara que o carregamento executa essas mutações.
- **Estado:** **Verificado no código**.
- **Recomendação:** separar leitura de diagnóstico de ações explícitas; antes de alteração estrutural, criar snapshot, rollback e testes de regressão. Não aplicar a correção nesta fase.

### M-03 — Persistência em lote não é atômica nem sempre confirma erro

- **Classificação:** P1 — consistência.
- **Evidência:** a qualificação de volume atualiza cada keyword sem verificar o erro retornado (`page.tsx:1585-1593`) e depois executa `fetchData`; a deduplicação e a atualização automática de nicho também não inspecionam o erro do update/delete (`page.tsx:385-405`).
- **Impacto:** a interface pode comunicar conclusão embora parte do lote tenha falhado. Em combinação com `fetchData`, a próxima leitura pode realizar novas mutações e mascarar o estado parcial.
- **Estado:** **Verificado no código**.
- **Recomendação:** contrato de lote com resultado por item, erro explícito, idempotência e confirmação de salvamento; mudança estrutural exige SDD.

### M-04 — Status `publicado` pode ser criado sem passar pelo gate operacional

- **Classificação:** P1 — workflow/proveniência.
- **Evidência:** a importação manual oferece `publicado` como status inicial (`page.tsx:2649-2661`) e grava esse valor diretamente (`page.tsx:1091-1100`). A ação “Marcar Publicado” também atualiza todos os IDs selecionados sem exigir lista, KGR calculado ou estado `aprovado` (`page.tsx:1490-1521`).
- **Impacto:** uma keyword sem silo ou ainda bruta pode entrar como publicada e depois virar âncora no Arquiteto, embora o próximo estágio exija silo e revisão. A proteção de publicado impede alterações posteriores, mas não prova que a entrada publicada foi legítima.
- **Estado:** **Verificado no código**.
- **Recomendação:** confirmar a regra de produto para publicação de keyword; se publicado significar saída real, bloquear inserção direta e exigir estado anterior/estrutura mínima. Registrar a decisão em SDD/ADR antes de alterar.

### M-05 — Transferência Minerador → Arquiteto é índice local, não transferência persistida

- **Classificação:** P1 — continuidade e rastreabilidade.
- **Evidência:** o Arquiteto lê diretamente `listas_kgr`, `keywords_kgr` e `briefings_artigos` (`app/(workspace)/arquiteto/page.tsx:586-612`), filtra aprovadas/publicadas (`:629-642`) e o provider registra a importação em `architectImportedKeywordIds` no workspace local (`components/editorial-pipeline-context.tsx:411-417`). O recovery desse estado usa `localStorage` por marca (`components/editorial-pipeline-context.tsx:248-338`).
- **Impacto:** a origem dos dados é remota/legada, mas a decisão “já importado” e a seleção da transferência dependem do navegador. Não há registro remoto de transferência, versão de KeywordDNA ou evento de importação do Minerador. A idempotência atual existe para o índice local, não para uma entidade de transferência compartilhada.
- **Estado:** **Verificado no código; jornada ponta a ponta ainda não verificada**.
- **Recomendação:** em proposta SDD, definir unidade transferida, marca, versão/hash, status, idempotência, conflito, rollback e comportamento em outro navegador.

### M-06 — KeywordDNA é lógico/legado, não uma entidade versionada própria do Minerador

- **Classificação:** P2 — contrato/proveniência.
- **Evidência:** o Minerador grava campos derivados em `intent` e `analise_semantica`; `KeywordDnaPanel` gera uma referência `legacyVersionReference` a partir do registro atual; o Arquiteto adapta o registro para `legacyKeywordDnaPayload`/`legacyKeywordDnaReference` (`lib/arquiteto/adapters.ts:32-68`).
- **Impacto:** o painel pode apresentar versão/hash legados sem existir um envelope KeywordDNA persistido com sucessão, evento e imutabilidade no módulo Minerador. Alterar o JSON sem criar uma versão muda o conteúdo que a referência legada representa.
- **Estado:** **Verificado no código**.
- **Recomendação:** não criar nova persistência incidentalmente; formalizar primeiro o contrato compartilhado em SDD, com consumidores e migração somente após aprovação.

### M-07 — Extensão e painel web possuem fluxos de mineração diferentes

- **Classificação:** P2 — consistência de integração.
- **Evidência:** `/api/mine` consulta Autocomplete e cria uma Google Sheet (`app/api/mine/route.ts:40-155`), enquanto `minerador-extensao/background.js:84-180` consulta Autocomplete diretamente e grava REST em `keywords_kgr`. A extensão filtra termos com pelo menos três palavras e palavras negativas; `/api/mine` não aplica esses filtros.
- **Evidência adicional:** a extensão envia `marca_id` condicionalmente (`background.js:144-153`), mas o próprio README registra que a coluna `keywords_kgr.marca_id` permanece uma questão de schema (`minerador-extensao/README.md:25-31`).
- **Impacto:** “minerar” pela extensão e pela rota pode produzir conjuntos, destinos e requisitos de schema diferentes. Se `marca_id` não existir no remoto, a gravação da extensão falha; se existir, a página ainda não o usa para filtrar.
- **Estado:** **Verificado no código; schema remoto ainda não verificado**.
- **Recomendação:** executar a auditoria SQL somente leitura fornecida em `supabase/scripts/verify-structural-divergences.sql`; depois definir um contrato único ou documentar explicitamente os dois fluxos.

### M-08 — APIs de IA/volume aceitam entrada mais ampla que o escopo de marca

- **Classificação:** P2 — segurança operacional e custo.
- **Evidência:** `/api/volume` valida sessão, mas recebe qualquer array de keywords sem limite, IDs ou marca (`app/api/volume/route.ts:4-14`); `/api/clusterize` também recebe keywords arbitrárias (`app/api/clusterize/route.ts:4-15`); `/api/generate-briefing` valida ownership somente do primeiro `lista_id` (`app/api/generate-briefing/route.ts:56-62`) e envia os demais objetos recebidos ao provedor (`:87-123`).
- **Impacto:** um cliente autenticado pode solicitar processamento/custo para dados fora da seleção legítima, misturar listas no mesmo briefing ou exceder limites do provedor. As rotas de análise individual possuem uma checagem de propriedade melhor, mas ainda dependem do payload bruto para o texto enviado.
- **Estado:** **Verificado no código; exploração remota não executada**.
- **Recomendação:** contratos Zod server-side com limites, IDs como fonte de verdade e revalidação de todos os itens/listas; não fazer chamada paga em testes.

### M-09 — Cobertura automatizada do Minerador é indireta

- **Classificação:** P2 — qualidade de evidência.
- **Evidência:** não existe script `test:minerador` nem arquivo de teste dedicado ao fluxo do Minerador. Os testes existentes verificam o motor lógico, leem o texto da página para confirmar elementos e testam contratos do Arquiteto/fluxo (`tests/arquiteto-domain.test.mts`, `tests/operational-flow.test.mts`, `tests/editorial-pipeline.test.mts`).
- **O que os testes não provam:** filtro por marca com keywords sem lista, importação CSV real, escrita parcial do KGR, reload do histórico/visões, schema remoto, RLS da extensão, popup Chrome, seleção de marca e transferência completa para o Arquiteto.
- **Estado:** **Confirmado por teste quanto à cobertura limitada**.
- **Recomendação:** criar fixtures e testes proprietários somente após fixar o contrato de escopo; validação manual autenticada deve permanecer separada dos testes unitários.

## 6. O que está saudável ou parcialmente saudável

### Confirmado por teste

- `npm run test:arquiteto`: 48/48.
- `npm run test:operational`: 49/49.
- `npm run test:editorial`: 20/20.
- `npm run test:authz`: 4/4.
- `node --check minerador-extensao/background.js` e `node --check minerador-extensao/popup.js` passaram.
- `git diff --check` passou; os avisos exibidos são de conversão de final de linha do Git em arquivos já modificados.
- `npm run build` passou com TypeScript e geração das rotas/páginas.

Esses resultados demonstram compilação, contratos puros, motor KeywordDNA lógico e presença de algumas proteções. Não demonstram persistência remota ou uso real.

### Parcial ou ainda não verificável

- Importação, KGR, exportação e ações em massa existem na tela, mas persistência por item e proteção de escopo não foram testadas contra dados reais.
- Arquiteto reapresenta itens aprovados/publicados e tem lógica de recuperação, mas o vínculo de importação continua local e a jornada real não foi repetida.
- A extensão tem sintaxe válida e fluxo implementado, mas não foi carregada nem testada com sessão, RLS ou schema remoto.
- Proteções de publicados estão codificadas na migration local `0001_protect_publicado.sql`; instalação e comportamento remoto não foram confirmados.

## 7. Divergências documentais

- `docs/03-minerador/estado-atual.md` dizia que não havia bugs confirmados; esta auditoria confirma os achados M-01 a M-09 no código, embora nenhum tenha sido reproduzido em banco/navegador.
- `docs/03-minerador/propostas/` não existia antes desta auditoria; este relatório cria a pasta e o documento solicitado.
- `docs/00-produto/README.md` lista contratos em `docs/00-produto/contratos/`, mas a pasta contém apenas `README.md`; os arquivos de workflow, status, versionamento, importações e autorização não estão presentes.
- `docs/README.md` e `docs/compartilhado/README.md` apontam documentos compartilhados específicos que também não estão presentes; o código e ADRs atuais foram usados como referência disponível.
- `docs/03-minerador/spec.md` não precisa ser alterado nesta fase: nenhuma regra permanente foi aprovada.

## 8. Recomendações por ordem segura

### Agora — ainda sem corrigir código

1. Preservar o estado atual e obter um snapshot/contagem somente leitura por marca, lista, keyword, status e `lista_id`.
2. Executar manualmente o SQL estrutural local, sem mutação remota, para confirmar colunas, RLS, policies, triggers e órfãos.
3. Reproduzir manualmente, com dados não destrutivos, marca A → marca B, marca sem seleção, keyword sem lista, reload e extensão.
4. Não executar “deduplicação”, limpeza de storage ou nova IA durante a reconciliação.

### Depois — exige proposta SDD e autorização

- tornar o escopo de marca obrigatório e server-side;
- remover mutações automáticas de `fetchData` ou convertê-las em ações explícitas, auditáveis e reversíveis;
- definir publicação, silo obrigatório e pré-condições de aprovação;
- definir transferência persistida/idempotente Minerador → Arquiteto;
- separar o contrato KeywordDNA do módulo interno do Arquiteto;
- unificar ou documentar formalmente os fluxos da extensão e da rota `/api/mine`;
- adicionar contratos Zod, limites e revalidação de todos os itens nas APIs com custo.

## 9. Itens não verificados

- schema, RLS, policies, triggers e constraints efetivamente instalados no Supabase remoto;
- existência real de `keywords_kgr.marca_id`, `slug`, `canonical` e colunas de `briefings_artigos`;
- dados órfãos, duplicados e mistura entre marcas no banco atual;
- login/reload/seleção de marca no navegador;
- importação real no Arquiteto, snapshot, recuperação e isolamento entre marcas;
- extensão carregada no Chrome, token expirado, RLS e gravação REST;
- sucesso/erro parcial em chamadas reais de volume, IA e Google Sheets;
- comportamento visual responsivo e acessibilidade da planilha;
- tempo de execução e limites de lotes em produção.

## 10. Conclusão da Fase 1

O Minerador não deve ser reconstruído nem redesenhado. A auditoria confirma uma base funcional, com compilação e testes de domínio passando, mas não autoriza declarar saúde ponta a ponta. Os riscos M-01, M-02, M-03, M-04 e M-05 precisam ser resolvidos ou formalmente delimitados antes de qualquer mudança estrutural, nova migração ou reconciliação de dados.

**Fase 1 concluída. Nenhuma correção de código, migration, chamada externa, limpeza ou alteração em outro módulo foi executada.**

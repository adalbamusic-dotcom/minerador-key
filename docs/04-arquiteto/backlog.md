## Fechamento e ficha — 2026-10-01

## Links internos sobre a composição vigente — 2026-10-01

- [x] Sucessora e cópia existente rebaseadas para as versões atuais dos artigos.
- [x] "Processar links" segue as linhas marcadas (vários Silos, um por vez).
- [ ] Homologação do usuário: marcar os artigos de "Crescimento de Clínicas" e de "Leads sem
  Tráfego Pago" → Processar links → conferir os nós com as principais atuais → Confirmar links →
  o aviso "O grafo aprovado descreve versões anteriores" some e os artigos passam no portão do Radar.
- [ ] Coluna/indicador por artigo de "links internos aprovados" na planilha (hoje só o mapa mostra).

- [x] Ficha mostra a principal do DNA e a página como secundária.
- [x] Fechamento relê a versão vigente no servidor antes da sucessora.
- [x] Sem aviso de Silo já fechado quando o par cobre os artigos.
- [ ] SiloDNA sucessor automático quando um artigo novo entra num Silo já fechado (hoje: aviso com o nome; precisa SDD).

## Tabela do publicado e Concluir — 2026-10-01

- [x] Concluir tira o publicado e segue com os novos.
- [x] Keywords da mesa fora do DNA: candidatas do artigo; as que sobram vão para “Keywords não agrupadas”.
- [x] Principal com volume travada ao slug.
- [ ] **Homologar (dono):** “Buscar keywords (grátis)” → linhas de dentistas e atrair pacientes para clínica → “Gravar melhorias”.
- [ ] Adendo à SDD do MCP: providers pagos com orçamento por marca (aguarda o texto e a aprovação).

## Principal sem volume — 2026-10-01

- [x] Publicado Livre sem volume troca pela keyword do artigo mais próxima do slug (volume só desempata).
- [x] Tela mostra a principal do ArticleDNA nos publicados.
- [ ] **Homologar (dono):** “Buscar keywords (grátis)” → as 2 linhas de troca (instagram; atrair pacientes para clínica de estética) → “3 · Gravar melhorias” → Links internos.

## SERP com a última palavra — 2026-10-01

- [x] Intenção e funil pela SERP (4 lentes, porcentagem), na classificação e no ArticleDNA.
- [x] Portão do Radar pela SERP do ArticleDNA aprovado.
- [x] Publicado sem caminho: o Processar e o Concluir apontam o “Melhorar publicados”.
- [ ] **Homologar (dono):** depois de reiniciar o `next dev`, marcar “Pronto para Radar” em
  dentistas e cosméticos.
- [x] “tráfego pago vs orgânico”: linha “Atualizar o DNA com a SERP” no Melhorar publicados (grava classificação, intenção e funil da SERP sem mudar a composição).
- [ ] Mesa com mudança pendente do “Reforçar” (dentistas com duas principais na formação):
  decidir se a pendência é gravada ou descartada.
- [ ] Supabase: incidente e cota excedida (restrição em 20/10/2026, se continuar acima).

## Pendências fechadas — 2026-10-01

- [x] Coluna da keyword recebe toda a sobra de largura (Arquiteto e Radar); regra no contrato.
- [x] Keyword “Bruto” sem intenção: a Lógica do Minerador roda ao gravar a melhoria.
- [x] Reforçar publicados liga o parecer da SERP à formação e conclui no marcador.
- [x] Ficha “Silo · Estado” lê o Silo do território.
- [x] Melhoria recalcula classificação e intenções auxiliares.
- [ ] **Homologar (dono):** no “Gravar reforços” de um publicado, conferir que a ficha mostra a
  SERP executada e que o “Pronto para Radar” passa. Os artigos já aprovados antes desta correção
  precisam de um novo “Gravar reforços” para ganhar o vínculo.

## Seleção, link publicado e keyword inteira — 2026-10-01

- [x] Seleção das planilhas igual à do Minerador (clique, Ctrl, Shift), inclusive na aba Silos.
- [x] Link publicado em `blue-500` (`identity-published`), em toda a plataforma.
- [x] Keyword e slug nunca cortados: regra raiz em `globals.css` e no contrato visual.
- [ ] **Homologar (dono):** reiniciar o `next dev` se as cores não mudarem. Depois conferir na
  planilha:
  - clique troca a seleção;
  - Ctrl soma ou tira a linha;
  - Shift estende a seleção.
- [ ] `tests/arquiteto-selection.test.mts` (fora das suítes) tem duas âncoras estruturais velhas
  (“Mover selecionados para Silo”, `handleDeleteSelectedNonPublished`).
- [ ] O guard visual (`test:visual-system`) está acima da linha de base em arquivos de outras
  áreas: Redator, Publicações e `arquiteto-workbench`.

## Concluir grava tudo no DNA — 2026-10-01

- [x] Melhoria mede no Google Ads (grátis) o volume de outra era e grava no Minerador ao gravar.
- [x] Intenção pela taxonomia do Minerador (“Informativa”); “Pendente” não vira intenção.
- [x] Hash do parecer da melhoria igual ao da mesa (fim do “desatualizado” pós-melhoria).
- [x] Conclusão humana resolve o vínculo KGR (sem pendência) e confirma o tipo de unidade derivado.
- [ ] **Homologar (dono):** no “tráfego pago vs orgânico”, “Buscar keywords (grátis)” → a linha
  propõe a troca da principal → “Gravar melhorias” → a SERP do artigo não fica “desatualizada”.
- [ ] Reforçar publicados: gravar o parecer sob a `formationRef` nova, com `humanResolution` e
  marcador. Hoje o gate não acha o parecer: aparece “Não executada”.
- [ ] Ficha “Silo · Estado”: ler o `siloId` do ArticleDNA/território, não o da linha do
  Minerador. Hoje mostra “Pronto para Silos” com o Silo fechado.
- [ ] Melhoria com DNA existente: recalcular `classification` e `auxiliaryIntents` na sucessora.

## Recuperação dos Silos — 2026-09-30 (noite)

- [x] Reprocessar não duplica Silo consolidado nem recria Silo desfeito.
- [x] Reconcluir sucede o mesmo ArticleDNA; publicado não passa pelo Concluir.
- [x] Papel no Silo em Artigos e Links, pelo SiloDNA.
- [x] **Dono:** rodou `supabase/manual/20260930-recuperar-silos-adalbapro.sql` (releitura: 0 keywords nos duplicados; ativos: Captação, Crescimento, Estratégia consolidados, Leads e limpeza de pele confirmados; whatsapp → 8bcd8ff3) e conferir a releitura (`keywords_nos_duplicados = 0`, `whatsapp_aponta_para = 8bcd8ff3…`).
- [ ] Aposentar o ArticleDNA duplicado `article-formation:62ade5c4…`. Exige decisão: as versões são append-only e não existe status/jornada de “retirado”.
- [x] Leads sem Tráfego Pago fechado pelo dono com “Concluir formação” + “Concluir e manter” (leads qualificados = PILAR; os demais SUPORTE; todos Consolidado v1/Aprovado).
- [x] Links internos: Crescimento de Clínicas processado (14 relações, 6 páginas, 0 órfãs, GRAPH_READY_TO_CONFIRM = YES), aguardando “Confirmar links internos” do dono.
- [ ] Links internos: processar e confirmar Captação de Pacientes, Estratégia de Negócios e Leads sem Tráfego Pago.

## Fechamento destravado sem mexer em artigo — 2026-09-30 (tarde)

- [x] Ponteiro órfão não conta como formação pendente; publicado aprovado entra pelo próprio ArticleDNA.
- [x] Pilar gravado pelo `articleId`; consolidação barrada só pela contestação do próprio Silo.
- [x] “Manter composição” resolve o par (dois lados) e a fronteira do artigo mantido; a tela diz antes.
- [x] Continuação do Concluir relê a seleção (fim do “aguarda a releitura”).
- [ ] **Homologar (dono):** F5 no Arquiteto → Crescimento, Estratégia e Captação fecham (Pilar/Suporte em “Papel no Silo”) → Leads: abrir os 3 candidatos → “Manter composição” com motivo → “Concluir formação” → Leads fecha → Links internos → “Processar links”.
- [ ] Limpar os ponteiros órfãos na cópia de trabalho (hoje só são ignorados no fechamento; as 5 keywords seguem como não agrupadas).

## Fechamento dos Silos por Silo e “Tirar este artigo do Silo” — 2026-09-30

- [x] O que barra o fechamento é só do próprio Silo; par já concluído não barra.
- [x] “Fechamento dos Silos” em Links internos: o que falta em cada Silo.
- [x] “Tirar este artigo do Silo” para candidato não concluído (keywords para “sem Silo”).
- [ ] **Homologar (dono):** abrir o Arquiteto → conferir que Estratégia, Crescimento e Captação fecham (Pilar/Suporte na coluna “Papel no Silo”) → em Leads, tirar os três candidatos do Silo → Leads fecha → Links internos → Processar links.
- [ ] Keywords que voltaram para “sem Silo” podem ser propostas de novo para um Silo em “Confirmar propostas novas” (só se o dono confirmar).

## Concluir formação por artigo e Descartar sobras — 2026-09-30

- [x] Concluir formação pede a SERP que falta (cache primeiro, plano de pagamento) e continua sozinho.
- [x] Pendência de um artigo não trava os outros: fica de fora, nomeado, e continua candidato.
- [x] “Descartar sobras” (preferência de tela; nada apagado) e “Mostrar de novo”.
- [ ] **Homologar (dono):** aba Silos → “Desfazer os Silos sugeridos” (os 3 novos) → aba Artigos → “Descartar sobras” → “Concluir formação” → conferir quem concluiu e quem ficou de fora.
- [ ] Descartar em definitivo um candidato que a pessoa não quer (hoje ele fica de fora a cada conclusão). Exige decisão de produto: onde guardar “não usar” sem sumir com a keyword.

## Leitura da lista pelo código e composição menor — 2026-09-30

- [x] `list_core`: núcleo do slug com a palavra própria; par captar × atrair separado pelo verbo.
- [x] Composição que diverge encolhe uma vez pelo cache (par forte/parcial em 2+ lentes).
- [x] Sobras: caixinha não fica desmarcada sozinha.
- [ ] **Homologar (usuário):** “Buscar de novo” → conferir captar/atrair (Lista · núcleo do slug) e campanhas (composição menor) → passo 2 se pedir → “3 · Gravar melhorias”.
- [ ] Avaliar: dois publicados com o MESMO núcleo (“atrair pacientes para clínica” × “… de estética”) ainda dividem keywords do mesmo grupo da SERP entre si.
- [ ] **MCP ponta a ponta** (pedido do dono): hoje faltam ferramentas para medir Volume, criar/confirmar Silo, concluir formação de artigo novo, links internos, enviar ao Radar, investigar/finalizar no Radar e exportar “Para escrever”. Exige SDD (aprovações com `platform.decide`, custo com aceite).

## Divergência de SERP explicada e Ajuda do Arquiteto — 2026-09-30

- [x] Alerta em linguagem simples na divergência de SERP (o que houve, por que importa, o que cada botão faz).
- [x] Ajuda desta área do Arquiteto com todos os processos e botões.
- [ ] **Homologar (usuário):** abrir “marketing digital para dentistas” → Revisão → “Abrir a divergência na aba SERP” e conferir se o aviso se entende; abrir a Ajuda desta área no Arquiteto e buscar “divergência”, “custo”, “desfazer silo”.
- [ ] Avaliar: “Aplicar recomendação” só registra a decisão; tirar a keyword ainda é manual. Um botão que já tire ou troque (com prévia) simplificaria.
- [ ] **Decisão da divergência só no navegador** (`persistSerpState` → `writeBrowserArtifact`): levar ao banco exige rota própria (SDD curta), porque navegador não é fonte canônica.
- [ ] Textos da tela que prometem o que não existe: “Revisar com IA” (`arquiteto-workspace.tsx`, aba IA), “Confirmar arquitetura” (o botão é “Confirmar propostas novas”) e “Reforçar publicados” citado fora do bloco avançado.

## Melhorar publicados: aproveitar melhor a lista — 2026-09-30

- [x] Secundárias da lista aceitas quando levam o núcleo ou uma palavra do assunto; regras de principal isoladas.
- [x] IA lê primeiro os artigos com menos keywords.
- [x] Par canibalizado com principais próprias (não sinônimas) e sem keyword em comum passa, com exclusão recíproca.
- [ ] **Homologar (usuário):** "Buscar de novo" → conferir as linhas da IA (captar/atrair clínica de estética, marketing para clínica de estética, instagram não traz pacientes, campanhas sem anúncios) → "3 · Gravar melhorias".
- [ ] Avaliar: a IA ler mais de 12 alvos por rodada.

## Melhorar publicados: leitura da IA — correções da revisão (corretor) — 2026-09-30

- [x] Escolha malformada da IA recusada sozinha (envelope permissivo; papel com acento normalizado; motivo longo encurtado).
- [x] Até 12 alvos por chamada e teto de saída de 2.000 tokens.
- [x] Prazo de 90 s por requisição para começar a conferir composições; a que sobra fica "precisa validar"; pareceres lidos uma vez.
- [x] MCP, catálogo e cartão avisam que o prepare usa a Connection DeepSeek da marca.
- [x] Aviso de principal mais ampla que o slug também no caminho da IA; Assunto sem papel da IA fica com a escolha que leva o núcleo, com mais volume e menos palavras.
- [x] Núcleo do assunto exige as duas palavras.
- [x] Recusas da IA visíveis ("Sugestões da IA recusadas pelas regras"), origem por linha e sugestão da IA derrubada pela SERP com o motivo.
- [x] Falha da IA gravada como texto fixo, sem a mensagem crua do provider.
- [ ] **Homologar (usuário):** medir o tempo real do prepare com a DeepSeek e a lista da AdalbaPro; conferir se algum alvo cai em "Faltou tempo nesta etapa"; abrir "Sugestões da IA recusadas" e conferir se as ruins (tráfego pago, clínica de estética facial, veterinários, agência de marketing) aparecem lá ou nem foram sugeridas.
- [ ] Avaliar: alvo que a SERP deixa pronto e o parecer da composição rebaixa fica sem leitura da IA na mesma execução.
- [ ] Avaliar: composição adiada por prazo com custo 0 não tem passo 2; hoje o caminho é "Buscar de novo".
- [ ] Avaliar com dados de outras marcas as heurísticas de texto ("para …" como nicho; núcleo = duas últimas palavras antes de "para"/"sem"; sinônimos atrair/captar, paciente/cliente, consultório/clínica).
- [ ] Registrar/decidir formalmente a regra `broaderCore` do passo 1 (principal mais ampla com o núcleo do slug), que está no working tree com teste, mas sem seção própria.

## Melhorar publicados: leitura editorial da IA na lista existente — 2026-09-30

- [x] Ordem do prepare: pares da SERP → leitura da IA na lista → busca nova no Google Ads só para quem ficou sem nada.
- [x] Chamada única em lote (DeepSeek da marca, sem Thinking, limite de 40 s, apelidos curtos), guardada em `run.editorialAi` e nunca repetida no collect/apply.
- [x] Código acima da IA: apelido fora do pedido recusado, até 3 por alvo e 6 por artigo, uma keyword por alvo, barreiras (publicada, sem volume, outro artigo, slug, restrição, cabeça genérica, outro nicho, núcleo do assunto), principal nova só com Posto Livre, atual sem volume e página que não ranqueia.
- [x] Tela: "Leitura da IA — confira" com o motivo; "Precisa validar no Google (passo 2)" quando falta lente; gravação continua pelo parecer do cache e pelo clique do dono.
- [x] Catálogo MCP, adendo na SDD e testes (domínio, servidor com IA simulada, DOM).
- [ ] **Homologar (usuário) na AdalbaPro:** "1 · Buscar keywords" → conferir se "como atrair clientes para consultório" recebe "como atrair clientes"/"como atrair os clientes" e "como captar clientes para clínica de estética" recebe "como captar clientes", cada uma com o motivo; conferir que nenhuma das ruins aparece; medir o tempo do prepare; readback do run (`payload.editorialAi.status = answered`).
- [ ] Se a DeepSeek passar de 40 s com a lista real, reduzir alvos por chamada ou dividir em duas preparações (hoje: aviso e segue sem a IA).
- [ ] Avaliar se a linha "precisa validar" deve ter um botão próprio para validar só aquela composição (hoje: o passo 2 valida o plano inteiro).

## Desfazer Silo e aba Artigos: correções da revisão (corretor) — 2026-09-30

- [x] Cartão sem Sobras não manda para Sobras: leva a "Artigos novos" (Processar artigos).
- [x] Linhas prontas desmarcadas: cartão pede a marcação (estado `select`), não "nada a fazer".
- [x] Lease ativo: "Ver andamento" no lugar de "Continuar".
- [x] Fileira sem números; "Gravar sem validar (N)" no passo 2; três passos em "Como funciona".
- [x] Desfazer Silo: texto sem jargão, andamento "Desfazendo i de N…", Esc e foco no Cancelar, frase própria para "pela metade" sem keyword restante.
- [x] Servidor do desfazer lê o envelope legado `payload.payload` de ArticleDNA e SiloDNA/SiloPage.
- [x] Testes: recusa `KEYWORD_NOT_EDITABLE` sem escrita; envelope legado; tempo esgotado na validação; tabela dividida.
- [ ] Homologar (usuário) os novos estados do cartão ("Marque na tabela", "Ir para Artigos novos", "Ver andamento") e o andamento do diálogo de desfazer.

## Desfazer Silo sugerido e aba Artigos simples — 2026-09-30

- [x] "Desfazer Silo" por Silo sem endereço publicado, com confirmação (rejeitado, nada apagado, N keywords para sem Silo e na mesa).
- [x] "Desfazer os Silos sugeridos (N)" em lote, uma confirmação, um Silo por requisição e uma releitura.
- [x] Servidor: `territoryUndos` no PATCH canônico; recusas antes da escrita (endereço publicado, consolidado/SiloDNA existente, SiloDNA/SiloPage aprovado, ArticleDNA aprovado com keyword do Silo, keyword publicada, keyword fora da etapa, lock vencido, já desfeito); keywords pelo writer da decisão de Silo; território por último, com lock e ator.
- [x] Edição genérica do território não rejeita Silo.
- [x] Silo rejeitado e vazio fora da mesa e das contagens; rejeitado com keyword continua visível.
- [x] Catálogo MCP: ação de tela humana, sem ferramenta.
- [x] Aba Artigos: cartão "Próximo passo" (uma frase, um botão), painel de melhoria, "Artigos novos" (Processar/Concluir formação), mesa, Sobras; o resto em "Detalhes técnicos" fechado.
- [ ] **Homologar (usuário) no localhost/depois do deploy, na AdalbaPro:** (1) aba Silos: os 4 publicados sem "Desfazer Silo"; os 3 sugeridos com o botão; (2) "Desfazer os Silos sugeridos (3)" → confirmação com as contagens (3, 10 e 3 keywords, se nenhuma tiver ArticleDNA aprovado) → "Desfazer 3 Silos" → notificação só depois da releitura; (3) as 16 keywords aparecem em "Sem silo" e os 3 Silos somem da mesa e da contagem; (4) readback no banco: os 3 territórios com `state = rejected` e o motivo com o ator em `payload.territory.reasons`; nenhuma keyword com `payload.territoryRef` apontando para eles; (5) aba Artigos: o cartão diz o próximo passo certo e "Detalhes técnicos" abre com tudo o que havia antes.
- [ ] Se "Processar arquitetura" voltar a propor um Silo desfeito, decidir se a proposta deve lembrar a rejeição (hoje é só proposta, sem gravação).
- [ ] Voltar um Silo desfeito (`rejected → candidate`) não tem botão; a transição existe no domínio. Criar só se o dono pedir.

## Reforçar publicados: correções da revisão (corretor) — 2026-09-28

- [x] Régua da troca: slug = último segmento da URL; dois complementos no slug não recusam a mesma entidade.
- [x] Portaria do servidor: papéis, 4 lentes e parecer vigente conferidos; o motivo é dito ("outros papéis", "outra principal", "outra composição"…).
- [x] Troca confirmada que contradiz o slug: não alinhada na mesa, aviso na prévia e no cartão, nova troca para a que cabe no slug (opt-in); a página segue sendo o artigo.
- [x] Troca gravada na mesa com marcador próprio; reconhecida pela mesa; aplicada na confirmação seguinte; Revisão humana não vira troca implícita.
- [x] Teto de 6 para o ArticleDNA + composição gravada.
- [x] Tela: "Mesa gravada · falta o ArticleDNA"; releitura depois de qualquer gravação; total novo depois de gravar; "sem volume"; frases curtas; total do servidor na confirmação.
- [ ] **Homologar (usuário) depois do deploy, na AdalbaPro:** (1) a mesa mostra 21 publicados; (2) "como atrair pacientes para clínica": o cartão avisa que a principal atual troca a entidade do slug e oferece "como atrair pacientes"; marcar "Aceitar a troca" → "Gravar reforços" → a confirmação diz a troca e "fica para a próxima confirmação" → a linha mostra "Mesa gravada · falta o ArticleDNA"; (3) "Processar artigos" (cache, sem custo) em "como atrair pacientes para clínica", "como atrair pacientes sem redes sociais" e "tráfego pago vs orgânico para clínica de estética"; (4) "Gravar reforços" de novo grava as sucessoras; (5) readback no banco: `serpAssessmentRef` de cada DNA aponta para parecer com a mesma composição e os mesmos papéis; `primaryKeywordDecision.previousKeywordId` de c937661d continua c937661d.
- [ ] **Não aplicar a PARTE C de `reforco-reparo.sql`** (alinharia a mesa à troca que contradiz o slug).
- [ ] Botão "Processar artigos" na própria linha adiada (hoje o próximo passo é dito na linha).
- [ ] Uma confirmação só (mesa + ArticleDNA) exigiria rodar a SERP (cache) dentro do Reforçar com o hash de base da mesa: SDD própria, se o dono quiser.

## Reforçar publicados: a tabela única — 2026-09-28

- [x] Uma tabela (publicados e Assuntos × sugeridas com caixinha; principal atual com volume; volume somado antes → depois; estado), com a frase da regra no topo.
- [x] Forte de qualquer Silo marcada (fora de outro artigo, até as vagas); Provável desmarcada; cada keyword num publicado só (o de mais páginas), com a linha do outro dizendo onde ela está.
- [x] Um botão, "Gravar reforços (N)", com a confirmação por artigo (mudança de Silo e total depois); Assunto por "Aplicar no Assunto (N)".
- [x] Depois de gravar: "Gravado e relido agora" e o total novo (keywords e volume somado) do ArticleDNA relido.
- [x] Cartões viraram o detalhe da linha ("Ver a evidência"); Revisão do artigo mantém o cartão.
- [x] Mensagens, catálogo do agente e SDD (§14); testes de tela (modelo, estrutura e renderização).
- [ ] **Homologar (usuário) depois do deploy:** o alinhamento da troca de "como atrair pacientes para clínica" sai de "Gravar reforços" sem marcar nada (a confirmação diz "Alinha na mesa a troca já confirmada…"); a tabela lista os 21 publicados (sem os 6 membros); "como atrair pacientes para clínica" mostra a principal atual e as sugeridas marcadas; "Gravar reforços" → confirmação por artigo → "Gravar e reler"; a linha passa a "Gravado e relido agora" com o total novo; no celular, a tabela rola na horizontal sem rolar a página.
- [ ] Se o dono quiser, filtro "Só com algo a gravar" e ordenação por volume somado na tabela (hoje: o filtro de estados e a ordem "falta gravar → gravado agora → com sugestão → resto").

## Reforçar publicados: defeitos de produção — 2026-09-28

- [x] Membro de artigo publicado não é publicado (projeção da página; perfil do membro; merge com o Vínculo).
- [x] Troca pelo slug: cabe no slug primeiro; entidade trocada não é proposta; outro artigo recusado; sobra de outro Silo com SERP Forte entra.
- [x] Gate SERP: parecer da página para a formação humana (hash decide); DNA só com o parecer da composição; duas confirmações; alinhar a troca na mesa; sucessora só com o parecer.
- [x] Busca em lote: funil por página, motivo real, erro do Google Ads como erro (página e rodada).
- [ ] **Homologar (usuário) na AdalbaPro, depois do deploy:** a mesa mostra 21 publicados (sem os 6 membros); "como atrair pacientes para clínica" → "Gravar reforços" (tabela "Reforçar publicados") sem marcar nada alinha os papéis; "Processar artigos" (cache) nos dois artigos; nova confirmação grava v2 de c937661d e v3 de b1e61059 com o parecer certo; readback no banco: `serpAssessmentRef` de cada DNA aponta para parecer com a mesma composição.
- [ ] Investigar por que o Google Ads devolve só a própria frase desde 24/09 (acesso do Keyword Planner, conta sem gasto, frase de cauda longa); a amostra das ideias agora fica gravada na rodada.
- [x] UX pedida pelo dono: o reforço como UMA tabela (publicados × sugeridas com checkbox, volume antes → depois, Forte de qualquer Silo marcada, um botão "Gravar reforços"); os cartões viram "Ver a evidência". Entregue na seção "a tabela única" acima.
- [ ] `publishedIdentityRef.sourceKeywordDnaIds` ainda leva todos os membros (serp-formation → adapters); nenhum leitor usa; corrigir na próxima sucessora.
- [ ] A resolução humana do parecer (`accept_current_composition`) não acha o parecer emprestado da página pela chave da formação: responde erro e pede o Processar; decidir se a rota `serp-resolution` deve aceitar o empréstimo.

## Reforçar publicados: correções da revisão — 2026-09-28

- [x] ArticleDNA `approved` com arquitetura confirmada, evidência SERP do artigo e `articleApprovalRevalidationIssues` antes de gravar; sem parecer, recusa na prévia.
- [x] Papel humano de reforço preservado; sem regravar quem já está na formação; Silo muda só para quem entra.
- [x] Recusa: formação com outra principal decidida, keyword já no ArticleDNA de outro artigo, keyword em outro estado no Arquiteto.
- [x] Keyword marcada em dois publicados entra só no de mais páginas em comum; a confirmação não trava.
- [x] Desfecho: o que já ficou gravado na página que falhou, os não tentados pelo nome, keyword sem volume dita; sucessora igual não grava.
- [x] Permissões do Minerador só com keyword nova; cabeçalhos em processo só com a sessão; prévia MCP pelo mesmo schema e leituras.
- [x] Busca em lote: rodada paga interrompida não roda de novo com a mesma prévia.
- [x] Barra, filtro "Pedem decisão", cartão devolvido pela busca, "Aceitar em grupo" e Processar sem SUCCESS.
- [ ] **Homologar (usuário) na AdalbaPro:** rodar "Processar artigos" se algum publicado não tiver parecer de SERP; Reforçar "como atrair pacientes para clínica" (5 Forte) e conferir no banco o ArticleDNA v1 (`architecture_confirmed`, `serpAssessmentRef`) e a linha da tabela com 6 keywords.
- [ ] Conferir se `slug_sugerido` dos publicados bate com o último segmento da URL; se não, a rota `article-dna` (IA) trocaria o slug numa versão futura (SDD §12).
- [ ] Registrar o publicado reforçado em `concludedFormations` (fechamento do Silo).

## Reforçar publicados: tela e mensagens simples — 2026-09-28

- [x] Botão "Reforçar publicados" (painel) e "Reforçar este publicado" (cartão), com a confirmação única montada da prévia do servidor, o aceite das keywords novas amarrado ao hash e o desfecho por artigo.
- [x] "Aplicar troca" sem ArticleDNA abre o Reforçar com a troca marcada; fim do "conclua a formação e volte aqui" (troca, diferenciação e Revisão do artigo).
- [x] "Sem par no lote" numa linha só, com "Buscar keywords para os publicados sem par (até US$ 1,00)", prévia grátis, uma confirmação do custo, progresso e as sugestões nos cartões.
- [x] Mensagens simples do Processar/Reprocessar, do allintitle e da mudança de Silo (INFO quando nada foi gravado).
- [ ] **Homologar (usuário) na AdalbaPro:** a confirmação do Reforçar (prévia, aceite, "Gravar e reler") e o desfecho; a busca em lote (prévia até US$ 0,98, uma confirmação); conferir no banco o ArticleDNA v1 dos publicados e a tabela da mesa depois da releitura.
- [ ] Se a tabela da mesa continuar em "1 keyword" depois do Reforçar: a partição do cenário exige o mesmo conjunto do candidato; ler o ArticleDNA pela principal publicada também na tabela.
- [ ] Mostrar o readout técnico do §4 num "Detalhes" da notificação (hoje fica só no domínio e nos testes).

## Reforçar publicados e busca em lote (núcleo) — 2026-09-28

- [x] D2.3.1: 3+ páginas em comum vencem o rótulo de intenção observada (aviso); 2 páginas ou sem SERP continuam barrando.
- [x] `POST /api/arquiteto/published-reinforcement` (preview/apply): primeiro ArticleDNA do publicado, composição, troca aceita e keyword nova pelos núcleos do Minerador, com releitura e parada no primeiro erro.
- [x] Busca em lote `search/plan` e `search/run` com teto de US$ 1,00 no servidor, dois modos por grupo e o núcleo comum da diferenciação.
- [x] Núcleo da Lógica e da aprovação extraído do MCP (`lib/server/minerador-keyword-decision-core.ts`).
- [x] Catálogo e MCP: `preview_published_reinforcement`; operações do Reforçar e da busca; notas sem "Concluir formação" para publicado.
- [x] **Tela (entregue em 2026-09-28, seção acima):** botão "Reforçar publicados" com a confirmação (frases `lines`, `approvalText`), faixa "Sem par no lote" com "Buscar keywords para os publicados sem par (até US$ 1,00)" e `SerpPaidPlanDialog`, sugestões da busca no cartão, remover "conclua a formação e volte aqui" (`serp-subject-model.ts`, `published-differentiation-apply.ts`, `published-differentiation-panel.tsx`), mensagens simples do Processar.
- [ ] Registrar o publicado reforçado em `concludedFormations` do marcador (`materializedArticleId`) para o fechamento automático do Silo.
- [ ] Normalizar "Informativa"/"Informativo" em `intentComparisonKey` (hoje só geraria aviso falso).
- [ ] **Homologar (usuário) na AdalbaPro:** Reforçar "como atrair pacientes para clínica" (primeiro ArticleDNA + 3 Forte), a busca em lote dos sem par (prévia até US$ 0,98, uma confirmação) e uma keyword nova até o artigo.

## Correções do corretor (frentes de 2026-09-28) — 2026-09-28

- [x] Medir ou recalcular o allintitle sem "Aplicar KGR" não abre sucessora do ArticleDNA (diff pela guarda material).
- [x] Reformar mantém a identidade KGR da canônica quando a cópia de trabalho não traz decisão (`reconcileArticleKgrIdentityWithCanonical`).
- [x] Rota do allintitle: sem volume nunca mede (guarda no servidor); item fora da etapa vira lacuna.
- [x] Cabeça da SiloPage com volume entra na primeira coleta.
- [x] Diálogo do plano pago fala em "consulta" para o allintitle.
- [ ] **Dono decide** (antes do deploy, SDD §13): Principal sem volume no parecer — hoje continua consultada e paga se faltar.
- [ ] Guarda de volume no servidor de `/api/arquiteto/serp` e de `keyword-serp`; modo `cacheOnly` para a leitura automática da fase Silos.
- [ ] Encadear, no mesmo clique, a reformação e o parecer depois de a primeira coleta pagar algo (hoje pede um segundo clique).
- [ ] Oferecer a primeira coleta para artigos formados pela finalização automática do Assunto.
- [ ] **Dono confirma**: identidades automáticas antigas ("KGR pleno automático") continuam "Sim · regra antiga" no Arquiteto, enquanto o Minerador lê origem automática como "não aplicável".

## SERP no artigo e KGR opcional (fatias A1 a A5) — 2026-09-28

- [x] A1 · KGR do artigo com padrão "Não aplicável": matriz v2 (humano > vínculo confirmado > regra antiga gravada > padrão), `requiresHumanDecision` sempre falso, score e faixa 150–550 só informativos, fechamento convergente (`articleAppliesKgr`), PATCH aceitando "Aplicar KGR" Sim/Não sempre, contrato `article-kgr-decision-v2`, nenhum campo ou enum novo.
- [x] A1 · Guarda de versionamento (`articleKgrIdentityChangedMaterially`): a troca da regra não abre sucessora do ArticleDNA.
- [x] A2 · Primeira coleta da SERP do lote em Processar artigos, antes da formação: 4 lentes, só keywords com volume, cache primeiro, uma confirmação, núcleo de `keyword-serp`.
- [x] A3 · Secundária e reforço sem volume fora do plano e da coleta do parecer; saem como `notObserved` com motivo próprio e não travam as lentes.
- [x] A4 · Allintitle da Principal: rota `POST /api/arquiteto/article-allintitle` (plan/execute, `recollect`), cache primeiro (Arquiteto ou Minerador até 30 dias), medição em `kgrIdentity`, nunca escreve no Minerador; etapa 4 de Processar artigos e botão "Medir/Recalcular allintitle (pago)" na Revisão.
- [x] A5 · "Consultar nas 4 lentes" da fase Silos: manual, opcional e só com keywords com volume.
- [ ] **Integrador:** incluir `tests/arquiteto-serp-no-artigo.test.mts` em `test:arquiteto` e `tests/arquiteto-serp-no-artigo-rota.test.mts` em `test:arquiteto:lentes` (`package.json`); catálogo das IAs (`lib/agent/platform-catalog.ts`, Arquiteto `:298-345`, regras de SEO `:866-879`) e a rota nova em `lib/server/platform-mcp-tools.ts`, se virar ferramenta.
- [ ] **Adendo** na SDD de decisão KGR do artigo (`docs/04-arquiteto/propostas/2026-08-28-sdd-article-kgr-decision-keyword-contextual-presentation.md`, §5.1): padrão não aplicável, "Aplicar KGR", allintitle medido pelo Arquiteto e faixa 150–550.
- [ ] **Dono confirma:** artigo sem nenhuma keyword com volume (ex.: publicado com Posto Livre). Até lá, a Principal continua sempre consultada no parecer (SDD §13).
- [ ] Guarda de volume também no servidor de `keyword-serp` e modo `cacheOnly` para a leitura automática da fase Silos, depois da fatia R1 do Radar (mesma rota).
- [ ] Confirmar o preço do allintitle sozinho no primeiro evento real do ledger (`operationKind: article_allintitle`) e trocar a faixa estimada (US$ 0,002 a 0,0035).
- [ ] **Homologar (usuário):** Processar artigos com lote sem SERP do Minerador (plano da primeira coleta, uma confirmação, formação refeita); segundo clique com parecer pelo cache; allintitle das Principais; "Aplicar KGR" Sim sem allintitle bloqueando até medir; artigo antigo "KGR pleno" sem versão nova.

## Diferenciar publicados: keywords novas só do Google Ads (fatia D2) — 2026-09-28

- [x] Plano v2: `page.labs = []`, `page.ads` com a semente frase do ângulo e a URL como semente, targeting canônico no hash; custo só da SERP (par: US$ 0,00 a 0,14); sem o corte das relacionadas.
- [x] Rodada: ideias do Google Ads pelas portas da Pesquisa por Assunto, chave de uso por página no módulo `arquiteto`, métricas históricas como volume oficial e a média da ideia só como reserva; `adsFailures` aditivo.
- [x] Prévia v1 `planned` recusada antes de reservar (409 `DIFFERENTIATION_PLAN_OUTDATED`), sem pagar; rodadas v1 pagas continuam legíveis e aceitáveis.
- [x] Aceite: origem padrão `ads_keyword_seed`; escolhas antigas mantêm `labs_*`.
- [x] Tela: confirmação e avisos sem o Labs nas rodadas novas; mensagem do plano desatualizado.
- [ ] **Integrador**: `lib/agent/platform-catalog.ts` (diferenciação, `:360-399`) e `lib/agent/silo-plan.ts:209`.
- [ ] **Adendo** na `sdd-diferenciacao-publicados-canibalizados-2026-09-27.md` (§3.3–3.5: fontes e custo).
- [ ] **Acompanhar** a qualidade sem `ranked_keywords` (mais "Diferenciação fraca" esperada); se o dono quiser, avaliar outra fonte grátis para "o que o Google associa à URL".
- [ ] **Homologar (usuário) na AdalbaPro:** prévia do par atrair × captar com US$ 0,00 a 0,14; rodada trazendo candidatas do Google Ads.

## Diferenciar publicados que disputam o mesmo assunto — 2026-09-27

- [x] Núcleo: detecção grátis pelo cache, ângulos (slug, DNA, IA opcional), plano com teto de US$ 0,50 por grupo e hash, rodada paga pelo núcleo da Pesquisa por Assunto, avaliação (separação e encaixe), aplicar com readback, "Manter como está", rotas plan/run/apply, MCP de detecção e prévia, catálogo.
- [x] Tela: painel "Publicados que disputam o mesmo assunto" (linha por grupo com checkbox, "Planejar diferenciação (grátis)", "Buscar e validar (US$ x a y)" com uma confirmação e progresso por grupo, proposta por página com estado e motivo, antes → depois, "Aceitar grupo" com confirmação e releitura, "Manter como está") e os passos seguintes do aceite ("Enviar ao Minerador" e "Colocar no artigo"). Catálogo com os rótulos da tela.
- [x] Reler a avaliação gravada na proposta quando a resposta da rodada se perder: a mesma rodada devolve o resultado gravado; `resume` relê sem custo.
- [x] Teste de ponta a ponta do `editorialContext` com a nota `Diferenciação: ` em `lib/redator/radar-import.ts` (com e sem Assunto, limite de 4, sem nota byte a byte igual).
- [x] Revisão: a prévia vale UMA rodada (reserva por `lock_version` antes de pagar; outra rodada na mesma prévia recusada sem pagar).
- [x] Revisão: nova prévia não apaga avaliação paga nem desfaz "Manter como está" (também pelo MCP); "Planejar nova rodada" guarda a anterior no histórico.
- [x] Revisão: separação medida contra a principal que a irmã mantém; "fraca" só como evidência; aceite padrão só com as "Diferenciado" e "Incluir no aceite" por página.
- [x] Revisão: Q3 relido no aceite; rodada confere se os membros continuam publicados; sementes pagas com o tema; entidade de uma palavra exige mais uma palavra da página; IA com o cliente da sessão; "Manter como está" com confirmação; "Aceitar de novo".
- [ ] Mostrar na tela o histórico das rodadas substituídas (`payload.history`), hoje só no banco.
- [ ] Reabrir pela tela um grupo mantido antes de a SERP mudar (hoje ele volta sozinho quando a SERP muda).
- [ ] InternalLinkGraph: a sugestão de link entre as irmãs está no ArticleDNA (`internalLinks`) e no payload da proposta; gravar como proposta do grafo quando a Proposal IA de Links Internos existir.
- [ ] Radar: mostrar a nota `Diferenciação: ` do ArticleDNA na investigação (hoje chega ao Redator pelos fundamentos e pelo `editorialContext`).
- [ ] Aceitar de novo depois que as keywords novas forem aprovadas no Minerador completa a troca da principal; avaliar um aviso automático na tela quando isso ficar possível.
- [ ] **Homologar (usuário) na AdalbaPro:** detecção das 4 famílias; prévia do par atrair × captar (US$ 0,072 a 0,284); rodada com confirmação; "Buscar e validar" inativo depois da rodada e "Planejar diferenciação" reabrindo o resultado sem custo; aceite com readback (só as páginas marcadas); "Manter como está" com confirmação; conferir no ledger o módulo `arquiteto` e a operação `published_differentiation`, uma vez por rodada.

## D2.3 — volume primeiro e sugestões que o dono só confirma — 2026-09-27

- [x] Nível Forte (3+ páginas) e Provável (2 páginas, 3+ sites que distinguem, ou mesma entidade e problema no DNA), sem rede social nem portal genérico.
- [x] Sem volume não é sugestão, sustentação nem nova principal; com a SERP lida, não entra sozinha em artigo e fica recolhida nas sobras.
- [x] Intenção que barra é a da SERP; a da Lógica vira aviso quando a SERP mede o par.
- [x] Sugestões por publicado e por Assunto, por volume, Forte marcada e Provável desmarcada, par em outro Silo como proposta; "Aplicar selecionadas" com prévia, confirmação, teto de 6 e releitura.
- [x] Troca da principal Livre por Forte ou Provável de 2 páginas com palavras (com aviso e "(Provável)" no título), sempre com volume maior; sites em comum, DNA e SERP desconhecida nunca propõem troca (D2.1).
- [x] Sobras agrupadas por tema e volume somado, com "Criar artigo novo com este grupo" (confirmação e releitura) e sem volume recolhida no fim; motivos curtos sem o rótulo da Lógica.
- [x] Catálogo das IAs (§17.1) com a D2.3.
- [x] Revisão: a Provável pelo DNA só vale quando a SERP não mede o par.
- [x] Revisão: "Tema sem demanda no Google" conta também a estimativa maior que zero (mesma regra do Minerador).
- [x] Revisão: MCP diz `hasVolume` e `estimate` na candidata da Pesquisa por Assunto (aditivo).
- [x] Revisão: "Aplicar selecionadas" conta o confirmado, mostra o motivo do plano recusado e confere o vínculo do Assunto na releitura.
- [x] Revisão: "Keywords não agrupadas pela formação" recolhida com o painel de Sobras, por volume, sem volume no fim.
- [ ] Confirmar com o dono se a Provável por 3+ sites (0 página) deve continuar na lista de reforço (desmarcada) ou sair dela.
- [x] Troca por sites em comum (0 página) ou pelo DNA: corrigida na revisão, a troca exige páginas em comum.
- [ ] Par de outro Silo em um passo só (mudar de Silo e entrar no artigo na mesma confirmação), se o dono pedir.
- [ ] **Homologar (usuário) na AdalbaPro:** Arquiteto → Artigos: cartão de "como atrair pacientes para clínica" com "como atrair pacientes" no artigo e o aviso da Lógica; lista "Sugestões de reforço" com Forte marcada e Provável desmarcada; "Aplicar selecionadas" num publicado com vaga (confirmar a releitura e a composição); painel "Sobras · oportunidades de artigo novo" com "agência de marketing", "tráfego pago", "como atrair clientes", "leads qualificados"; "Criar artigo novo com este grupo" num grupo e conferir o artigo novo na mesa.

## Mesmo assunto pela SERP — correção dos dilemas — 2026-09-27

- [x] Estado "Par em outro artigo": o par real que já está em outro artigo do Silo nunca mais sai como "Sem par no lote"; o cartão abre o artigo que ficou com ele.
- [x] Volume primeiro entre os pares fortes (D1.3); a substituta do Posto Livre cabe no artigo; substituta fora de artigo cheio vira aviso com "Abrir este artigo para liberar uma vaga".
- [x] Posto Livre sem substituta no título; vizinhança do Google (2 páginas) dita como tal; Posto não declarado com o padrão do Minerador explicado e a troca hipotética.
- [x] SERP vencida separada de nunca coletada; Posto relido antes de gravar a troca; métricas da nova principal na nova versão; leitura do cache reaproveitada na sessão (20 min).
- [ ] Bloqueio no servidor: recusar gravação de ArticleDNA publicado que muda `principalKeywordId` sem `primaryKeywordDecision` confirmada e Posto Livre relido (persistência: exige SDD e autorização).
- [ ] Decidir onde persistir "Manter" (a decisão `rejected` que `decidePublishedPrimarySwap` já produz) para valer em outro aparelho, outro membro e no MCP.
- [ ] Conferir o egress real da primeira leitura (`approxBytes`) contra a estimativa de ~1,5 KB por keyword × lente.
- [ ] **Homologar (usuário) após deploy, na AdalbaPro:** com o Posto declarado "Livre": "como atrair clientes para consultório" → Troca proposta para "como atrair pacientes para o consultório"; "marketing digital para dentistas" → Troca proposta para "marketing para dentistas" (210), com "marketing para dentistas" dentro do artigo; "como atrair pacientes para clínica" → Troca proposta para "como atrair clientes para clinica medica" (Comercial, 4 páginas) — os pares Informativos de 7 páginas aparecem nos detalhes como barrados pelo DNA (não é defeito). "como atrair pacientes para consultório odontológico" e "como atrair pacientes sem redes sociais" → Par em outro artigo, com "Abrir o artigo". Sem declarar o Posto: nenhuma troca, cartão com "não declarado" e a troca hipotética. Depois de aplicar uma troca, conferir no readback que URL, slug e canonical não mudaram e que o volume da principal no ArticleDNA é o da nova.

## Mesmo assunto pela SERP — a tela dos dilemas — 2026-09-26

- [x] Mesa lê a SERP do cache (`/api/arquiteto/serp-subject`, lotes de até 600, egress no painel) e entrega o índice à formação, às propostas entre Silos e às sugestões de sustentação.
- [x] Painel "Mesmo assunto no Google" com resumo do lote, filtro por estado, cartão por publicado e Assunto, frase por dilema e evidência por lente ao expandir.
- [x] Aplicar troca como nova versão do ArticleDNA (em revisão), com decisão, histórico e releitura; Manter sem versão; aceitar em grupo com confirmação.
- [x] Minerador: `?modo=assunto&reforco=<id>` preenche tema e URL do artigo; "Tema sem demanda no Google" lido da lista local da Pesquisa por Assunto.
- [ ] Formação: honrar a troca confirmada (candidato com a nova principal e a publicada como secundária), para a mesa não mostrar a publicada como "P" depois da troca.
- [ ] Decidir se "Manter" deve ser persistido no servidor (hoje é estado de apresentação por navegador).
- [ ] ESLint do `arquiteto-workspace.tsx`: com o heap padrão do Node estoura memória; com 12 GB, 118 problemas antigos (41 erros), nenhum nas linhas da tela de mesmo assunto. Dividir o arquivo.
- [ ] **Homologar (usuário):** na AdalbaPro, abrir Arquiteto → Artigos, conferir o painel (reforçados, trocas, pares, sem par), "Ver a evidência", "Buscar reforço" (abre a Pesquisa por Assunto com tema e URL), e uma troca em artigo com Posto Livre e ArticleDNA existente — conferir no readback que URL, slug e canonical não mudaram.

## Mesmo assunto pela SERP: reforço, troca da principal Livre e dilemas — 2026-09-26

Domínio e servidor entregues com fixture da leitura real da AdalbaPro; sem escrita remota nem chamada paga.

- [x] Medida de páginas em comum no top 10 nas 4 lentes, com régua nomeada (3 forte, 2 apoio).
- [x] Leitura estreita e por lote do cache (`/api/arquiteto/serp-subject`), com custo de leitura declarado.
- [x] Reforço de publicado, sustentação de Assunto e propostas entre Silos pela SERP; palavras e DNA como apoio.
- [x] Troca da principal com Posto Livre (proposta + decisão humana pura), Travado só reforço.
- [x] Diagnóstico por publicado e por Assunto, com estado, frase e ação; catálogo MCP atualizado.
- [ ] Tela: chamar a rota, montar `buildSerpSubjectIndex`, passar `serpSubject` à formação e às propostas, mostrar o diagnóstico e a decisão da troca (outra parte da entrega).
- [ ] Persistir a troca aceita como nova versão do ArticleDNA com histórico, liberando `protectPrincipal` só com a decisão confirmada.
- [ ] Minerador: aceitar `?modo=assunto&reforco=<id>` (publicado) lendo frase e URL pelo Vínculo; `assunto=<id>` já existe.
- [ ] Registrar o desfecho de "Buscar reforço" por âncora para alimentar o estado "Tema sem demanda no Google".
- [ ] **Homologar (usuário) após deploy:** na AdalbaPro, conferir os pares da medida real (dentistas, captação, como atrair) e os ~17 publicados sem par.

## Formação automática de artigos a partir de Assuntos — 2026-09-26

Escopo autorizado e implementação: [SDD de automatização](sdd-automatizacao-assuntos-2026-09-26.md). O fluxo agora é iniciado pelo usuário uma vez; a seleção das keywords, a formação, SERP e materialização prosseguem sem confirmação artigo por artigo. Verificado: `test:arquiteto` 2.402/2.402, `test:agent` 44/44, `tsc --noEmit` e build Next.js 16; ESLint dos auxiliares alterados passou. ESLint do workspace monolítico ainda registra 124 erros em várias áreas. Não houve escrita remota nem chamada paga nesta entrega.

- [x] Reconhecer sobreposição direta entre frase do Assunto e keywords aprovadas e recebidas.
- [x] Agrupar todas as sugestões elegíveis por Silo confirmado e intenção; separar em grupos de até seis e exigir keyword de Volume validado para iniciar cada artigo.
- [x] Preservar candidatas existentes, Assuntos incompatíveis, keywords sem principal, conflitos, e identidades publicadas; não descartar membros não processáveis.
- [x] Encadear pelo readback existente: cópia de trabalho → SERP (quando sem cache) → gates → ArticleDNA e fechamento canônico elegíveis.
- [x] Atualizar guia/playbook do catálogo MCP e cobrir a segmentação, principal de volume, trilha `system` e fluxo automático com fixtures sem providers.
- [ ] **Homologar (usuário) após deploy:** iniciar um Assunto com keywords recebidas em mais de um Silo/intenção, conferir que grupos, principais, slugs, canonicals e vínculos seguem as associações lidas; autorizar custo se a SERP não estiver em cache; confirmar readback de ArticleDNA e os motivos individuais dos candidatos bloqueados.
- [ ] Quando houver keywords elegíveis sem Volume validado, conferir que seguem visíveis em `Keywords não agrupadas` e que não viram principal.

## Correção da revalidação dos publicados — 2026-09-25

Atualização de 2026-09-26: o publicado declarado não espera `Confirmar arquitetura`; `Processar arquitetura` efetiva Silo e memberships publicadas com readback. A confirmação manual abaixo aplica-se às propostas novas, às livres e a conflitos. Ainda falta homologação na AdalbaPro após deploy, inclusive candidatos legados, 21 artigos, papéis Pilar/Suporte e erros reais de persistência. Ver [SDD](sdd-efetivacao-publicados-no-processamento-2026-09-26.md) e [estado atual](estado-atual.md).

Estado em [estado-atual.md](estado-atual.md). Validado manualmente: NÃO.

- [x] Slug do Silo publicado = caminho da URL declarada; território nasce `protected` com `publishedSlug`/`publishedCanonical`; nenhum slug proposto.
- [x] Cabeça publicada casa com território existente pelo endereço ou pela primária (sem Silo duplicado).
- [x] Artigo publicado entra pelo endereço de Silo publicado que já é território, sem a cabeça no lote.
- [x] Conflito do endereço chega à linha com o motivo real.
- [x] Publicada em território, sem Silo na URL: membership vigente preservada no Confirmar.
- [x] Revisão humana com publicada não principal ou duas publicadas: conflito dito no candidato.
- [x] IA dos silos: os seis tetos por dúvida conferidos no cliente pela mesma régua da rota.
- [x] Teste estrutural do handler de IA delimitado por âncora.
- [x] Suítes por nome contra a base, sem falha nova: Minerador por glob 1134/1161 (27 da base), `test:arquiteto` 2390/2392 (2 da base), `test:arquiteto:servidor` 52/52, `test:arquiteto:lentes` 31/31, `test:arquiteto-backup-roundtrip` 8/8, `test:editorial` 170/174 (4 da base). `tsc --noEmit` limpo.
- [ ] **Homologar (usuário)** com o lote do dono: depois de Processar arquitetura, cada Silo publicado aparece com o endereço dele (`/cabelos`, não `/cuidados-com-cabelos`) e marcado publicado; os artigos novos das livres ganham slug sob essa raiz.
- [ ] **Território criado antes desta correção com o slug do texto.** É reaproveitado pela primária, mas continua `unpublished` e com o slug do texto. Corrigir exige decisão humana (adotar a identidade publicada nele) — não é reescrito em silêncio.
- [ ] Silo publicado declarado sem URL absoluta: o slug ainda sai do texto (o motivo diz). Declarar a URL no Minerador resolve.
- [ ] Validar 360/768/1024/1440 px e temas: só textos de motivo e de aviso mudaram.

## Publicados revalidados (partes 1 a 3) — 2026-09-25

Estado em [estado-atual.md](estado-atual.md). Homologação manual pendente, do usuário.

- [ ] **Homologar com o lote do dono** (4 Silos publicados, 21 artigos publicados, ~130 livres): Processar arquitetura, conferir por readback que cada artigo publicado aparece no Silo da URL dele ("Membro declarado pelo site"), que o de fora aparece em "Sem silo" com o motivo e que nenhum Silo novo nasce de publicada; sem clicar Confirmar para patrimônio publicado, entrar na aba Artigos e conferir que a publicada é a principal do próprio artigo. Keywords livres e novos Silos seguem confirmação própria; conferir que as livres semanticamente equivalentes entram no artigo publicado após essa revisão.
- [x] **Território do Silo publicado com a proteção do site.** Feito na correção de 2026-09-25: slug = caminho da URL declarada e `publishedSiloCandidateDraft` (`protected`, `publishedSlug`/`publishedCanonical`). A rota de criação aceita (mesmo schema da promoção de estrutura publicada).
- [x] **Silo publicado que só existe no acervo.** Feito em 2026-09-25: `territorySilos` em `resolvePublishedSiloMembership` (território `protected` com `publishedCanonical`). Território publicado antigo sem `publishedCanonical` continua sem atrair pela URL.
- [~] **Publicada posta por afinidade antes desta mudança.** Sem Silo na URL, a membership vigente agora é preservada ("já estava", sem falha). Com Silo na URL, o Confirmar a move para o Silo que o site declara. Falta a jornada humana explícita de "mover para o Silo da URL" fora do Confirmar.
- [ ] **Landing e página de serviço publicadas** sob a URL de um Silo: hoje não entram pela URL (só `article`). Decidir se entram como membros.

## Blocos em sequência e leitura paginada — 2026-09-25

- [x] Processar artigos / Validar SERP em blocos de até 20, plano de todos antes, confirmação única com a soma, autorização por bloco e falha de bloco sem parar os outros (`lib/arquiteto/serp-blocks.ts`).
- [x] SERP dos silos: todas as dúvidas em blocos de 10 (fim do `slice(0, 10)` silencioso).
- [x] IA dos silos: todas as dúvidas prontas em blocos de 6; `knownKeywordIds` só do escopo aberto; tetos por dúvida da rota subiram para 520/500/500.
- [x] Leitura de versões paginada em `ArtifactVersionRepository.list` (as acima de 1000 voltam).
- [x] Andamento "bloco N de M · faltam R" nos modos Artigos e Silos.
- [x] `tests/arquiteto-serp-em-blocos.test.mts` 14/14 com fixtures (4 Silos, 21 publicados, 130 livres).
- [ ] **Homologar (usuário):** importar as ~200 keywords, rodar Processar artigos e conferir: uma confirmação com a soma, "bloco N de M · faltam R" avançando, pareceres de todos os blocos relidos do acervo e o total pago igual ao confirmado. Repetir a SERP e a IA dos silos com mais de 10 e de 6 dúvidas.
- [ ] Botão "Parar depois do bloco atual" nas três ações (o helper já suporta `shouldStop`; a mesa ainda não oferece).
- [ ] Candidatas a Silo acima de 20 × número de artigos ficam para a próxima coleta (a mesa nomeia). Se virar caso real, a rota `/api/arquiteto/serp` precisa aceitar bloco só de candidatas.
- [ ] Dúvida da IA dos silos com mais de 500 keywords no escopo não é enviada (a mesa nomeia). Sem caso real hoje.

## Assunto declarado: fase B da F2 — 2026-09-24

SDD: [Assunto, o tronco editorial declarado](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md), F2.1 a F2.6 · [ADR-022](../00-produto/decisoes/ADR-022-assunto-tronco-editorial.md). Estado em [estado-atual.md](estado-atual.md). Validado manualmente: NÃO.

- [x] Gravar `subject` no ArticleDNA (qualquer unidade, inclusive landing e página de serviço) e no SiloDNA sem SiloPage, a partir do pacote aprovado lido pelo resolver do Minerador. Autor humano; recusas com código; `ANOTHER_SUBJECT_ATTACHED` impede troca silenciosa (`lib/arquiteto/declared-subject.ts`).
- [x] Conservação com `isAnchoredSubject` e uma lista só de troncos: servidor, não agrupadas, cenário, sobras da formação, motor legado, território, proposta, duplicidade e teto. O Assunto sem artigo fica em não agrupadas com o selo "Assunto · aguardando sustentação".
- [x] Assunto sem Volume validado fora da formação automática e da eleição da principal e do slug. Gate Q7 `SUBJECT_PRINCIPAL_REQUIRES_VOLUME` na conclusão.
- [x] "disputam o mesmo tema" na trava `NO_UNRESOLVED_CANNIBALIZATION`.
- [x] Sugestões determinísticas de sustentação só sobre as keywords recebidas, com `subject_discovery.subjectKeywordIds` como primeiro sinal. Sem leitura nova e sem provider.
- [x] Tela: "Assunto · declarado" na importação e na linha Vínculo; filtro "Assuntos" com a contagem; bloco "Assuntos como tronco"; Prender, Soltar e Confirmar Assunto do Silo; aviso de Assunto retirado ou desatualizado; diálogo de sustentação com o Silo de cada keyword; texto da SERP opcional da frase pela rota Resultados do Minerador.
- [x] **Guarda no servidor** (`lib/arquiteto/declared-subject-guard.ts` e `lib/server/arquiteto-subject-guard.ts`): em `appendArquitetoArtifact`, em `persistSiloPairAtomic` e na consolidação do Silo, só quando o `subject` é novo ou mudou em relação à versão vigente (7 campos). Confere ator da requisição, keyword viva, da marca, recebida e declarada, e snapshot igual ao pacote aprovado; Q7 também quando o Assunto carregado passa a ser a principal. Recusas `SUBJECT_*` com 403 ou 409 e `subjectCode` aditivo na resposta. Leituras estreitas; sem Assunto, nenhuma leitura nova no writer.
- [x] **Vínculo da formação persistido:** `articleSubjectAnchor` opcional no `AssignmentSchema` da PATCH `/api/arquiteto/workspace`, gravado no item da principal, com guarda de ator e marca e readback. Vai junto na escrita da formação pelas sugestões e na troca de ref do artigo. Sobrevive ao recarregar.
- [x] **Silo consolidado com Assunto:** `lib/arquiteto/silo-consolidation.ts` carrega o `subject` da versão anterior de forma explícita, sem mexer em `centralEntity` nem na SiloPage. A consolidação recusa perder o Assunto (`SUBJECT_DROPPED`) e confere Assunto novo pela mesma guarda. Sem Assunto, 40/40 fixtures idênticas ao HEAD.
- [x] **Diff de versão:** `subject` em `EDITORIAL_DECISION_FIELDS`; `attachedAt` e `attachedBy` como carimbos; `scripts/arquiteto-audit-version-diff.mts` usa a mesma lista. Sem Assunto, 36/36 casos idênticos ao HEAD.
- [x] Testes com fixtures e sem rede: `tests/arquiteto-assunto-fase-b.test.mts` 37/37, `tests/arquiteto-assunto-tela.test.mts` 24/24, `tests/arquiteto-assunto-guarda.test.mts` 19/19 e `tests/arquiteto-assunto-guarda-servidor.test.mts` 23/23. Sem Assunto, formação, plano, portaria e motor saem byte a byte iguais.
- [x] `package.json` (compartilhado): fase-b, tela e guarda no `test:arquiteto`; guarda-servidor no `test:arquiteto:servidor`.
- [ ] **Deploy da F2·B só depois da fase A no ar e conferida.** Depois que houver `subject` gravado, rollback só até a fase A, nunca abaixo.
- [ ] **Homologar (usuário):**
  - formar dois artigos e uma landing em torno de "SEO para clínicas", conferindo slug e SERP das sustentações;
  - verificar o tronco fora das não agrupadas e o "aguardando sustentação" dentro delas;
  - prender e soltar numa Definição real e fazer o readback da versão `proposed` com `subject`;
  - concluir a formação e conferir o `subject` no ArticleDNA aprovado;
  - prender numa formação sem Definição, recarregar e conferir `articleSubjectAnchor` no item da principal;
  - formar pelas sugestões e recarregar; trocar papel ou principal de um candidato com Assunto preso e conferir que o vínculo acompanha;
  - prender o Assunto num Silo sem página e ver a sugestão nos artigos dele; consolidar um Silo com Assunto e conferir o par;
  - gravar com `attachedBy` de outra pessoa (403 `SUBJECT_ACTOR_MISMATCH`) e prender num Silo com página (409 `SUBJECT_SILO_PAGE_BOUND`);
  - testar teclado e leitor de tela nos diálogos, em 360, 768, 1024 e 1440 px, nos temas claro e escuro.
- [ ] **Restauração: conferir o acesso do autor.** Com `subjectActor: "restored"`, `attachedBy` só é conferido pelo formato de `auth.users.id`, sem existência nem vínculo com a marca. Adendo antes do código: reusar o resolvedor de `lib/server/canonical-authorization.ts` (memberships, owner, agência e admin global).
- [ ] **Rotas de IA** (`app/api/arquiteto/article-dna` e `silo-dna`): montam a versão sem `subject` e, sobre entidade com Assunto, o perdem em silêncio. Hoje só criam a versão 1 de grupos novos. Recusar pede ler a versão vigente em toda gravação sem Assunto no writer.
- [ ] **Decidir o Assunto novo no Silo com página:** hoje é recusado (tela e servidor). Caminho sugerido: a consolidação aceitar um subject escolhido pelo humano e versionar o par junto. Soltar o Assunto de um Silo com página é recusado só na tela; o writer avulso não confere remoção.
- [ ] Restauração: conferir o Assunto no plano, antes de aplicar. Hoje a recusa acontece no meio da aplicação, e o que já foi aplicado fica.
- [ ] Vínculo órfão no payload: quando o ref muda por um caminho em que o item antigo não está no plano, o vínculo antigo fica sem efeito até um candidato com o mesmo ref reaparecer. Limpar sem `setState` em efeito.
- [ ] Remover o contorno `assuntoMudou`/`sameDeclaredSubject` da materialização, agora redundante com o diff, junto com a asserção que o fixa em `tests/arquiteto-assunto-tela.test.mts`.
- [ ] Verificar o rollback para a fase A com item de workflow que já tem `articleSubjectAnchor` (esperado: campo inerte; não testado).
- [ ] **F2.4 passo 5, "Pedir proposta" da IA:** pôr o Assunto no payload estratégico (`lib/arquiteto/ai-strategic-payload.ts`) muda `ARTICLE_AI_REVIEW_PROJECTION` e deixa as revisões antigas desatualizadas, além de pedir rota e tela. Adendo antes do código.
- [ ] Importação: "Assunto · declarado" só aparece nas recebidas ou com `keywordDetail=full`, porque o índice não lê `analise_semantica`. Mostrar em todas exige decidir o egress no servidor.
- [ ] Ligar `anchoredKeywordIds` quando `deriveTerritorialWorkingView` ganhar consumidor na tela.
- [ ] Dívida visual herdada: subir `min-h-8` para `min-h-9` em `ARCHITECT_UI.toolbarButton`, `primaryButton` e no filtro "Assuntos" (`modules/arquiteto/subject-panels.tsx`) de uma vez. `WorkflowImportDialog` (compartilhado) segue com texto de 9 a 10px.
- [ ] Dívida de lint: `react-hooks/preserve-manual-memoization` em `modules/arquiteto/arquiteto-workspace.tsx` foi de 54 (HEAD) para 65; a segunda rodada não mudou o perfil.
- [ ] Backlog da SDD F2.4: "domínios em comum" nas SERPs das sustentações, só com a observação podada.
- [ ] SDD, seção 11 (`docs/compartilhado/`, fora deste módulo): registrar a segunda rodada da F2·B e o limite da restauração.

## Assunto declarado: fase A da F2 — 2026-09-24

SDD: [Assunto, o tronco editorial declarado](../compartilhado/sdd-assunto-tronco-editorial-2026-09-24.md) · [ADR-022](../00-produto/decisoes/ADR-022-assunto-tronco-editorial.md). Estado em [estado-atual.md](estado-atual.md).

- [x] **Fase A:** `DeclaredSubjectSchema` `.strict()` como `subject` opcional no `ArticleDNASchema` e no `SiloDNASchema`, com as duas regras do `superRefine` do ArticleDNA (nem secundária nem reforço; fora de `excludedSubjects`). Nenhum caminho grava. Hashes de ArticleDNA e SiloDNA sem `subject` iguais aos de antes.
- [x] Trava de aprovação no envio (F1.7) e conferência do destino do Assunto contra `marcas.site_url` em `prepareCanonicalHandoff`, com 409 no lote e `approvalAlerts` aditivo.
- [ ] **Deploy da fase A sozinha e homologação (usuário):** o Arquiteto e o Radar das marcas abrem normalmente; enviar do Minerador uma aprovada depois da ativação sem processo (409), uma aprovada antes (passa) e um Assunto com destino fora do site (409).
- [ ] **Regra, até a fase B estar homologada:** depois do deploy da fase A, nenhum rollback volta para antes dela. Um artefato com `subject` lido por código anterior derruba o Arquiteto da marca com 503 e tira o artigo do Radar.
- [x] **Fase B:** no código em 2026-09-24. Itens feitos e pendências na seção da F2·B, acima. Homologação pendente.
- [ ] Radar (F3) e Redator (F4) só ligam o campo depois da fase B homologada.
- [ ] `approvalAlerts` opcional no `HandoffResponseSchema` (`lib/arquiteto/canonical-workspace.ts`), mudança aditiva: hoje o parse descarta os alertas do servidor (destino e já recebida), e a tela do Minerador não os mostra.
- [ ] **Decisão do dono:** o SiloDNA deve ter a mesma regra do ArticleDNA, recusando `subject.phrase` em `excludedTopics` do Silo? A SDD não pede, e a fase A não a criou. Se sim, adendo.
- [ ] A normalização do Assunto no contrato é cópia local da `normalizeKeyword` do Minerador. O teste de equivalência só cobre os casos dele: se o Minerador mudar a regra, rever as duas.

## 4 lentes no Arquiteto — 2026-09-23

- [x] A1 kgr_light; A2 canônica em depth 20; A3–A6 formação e territorial nas 4 lentes com plano antes de pagar; A7 SERP por keyword; A8 datas e targeting; A9 primária do Silo como proposta com aceite; A10 lentes na tela.
- [ ] **Homologar:**
  - "Validar SERP" mostra a prévia e só paga confirmada; cancelar não paga nada;
  - o parecer mostra a linha de lentes;
  - "Aceitar como primária do Silo" grava com readback.
- [ ] **Confirmar D4:** concordância em dobro só com pelo menos 3 lentes (voltar a 2 é trocar a constante).
- [ ] **Decidir D5:** `competitorDomains` só com orgânicos; depende do dono do cache e de recalibrar a afinidade.
- [ ] **Decidir D6:** [veredito de artigo de uma keyword](propostas/sdd-veredito-artigo-uma-keyword-2026-09-23.md); hoje 4 de 5 pareceres saem INCONCLUSIVE por construção.
- [ ] **D7:** 3 chamadas pagas para SERPs reais de mobile-android, mobile-ios e desktop-macos.
- [ ] Territorial: restringir a depth 20 às consultas com keyword do acervo (as consultas por texto pagam 20 sem reaproveitamento).
- [ ] Acerto que degrada entre o plano e a execução prende o artigo em `SERP_PAID_NOT_AUTHORIZED`: reabrir a prévia com as faltas novas.
- [ ] Levar a trava da primária e a checagem de membership para `lib/server/arquiteto-territory-store.ts`; recalcular no servidor a evidência do aceite pelo cache.
- [ ] Resolução humana do parecer de formação é preservada só pela `formationBaseHash` (`lib/server/arquiteto-article-serp-store.ts:136-139`).
- [ ] Pedido ao dono do normalizador: exportar `classifyResult`. Ao dono do cache: o digest com itens `video` e a mesma numeração da SERP completa.

## Leitura estreita das keywords — 2026-09-23

- [x] Montagem, handoff e PATCH sem ler a marca inteira com o DNA.
- [ ] **Homologar:** abrir o Arquiteto nas 3 marcas e ver o pool de importação e a mesa iguais; editar a cópia de trabalho; enviar do Minerador.
- [ ] A linha inteira das recebidas ainda pesa 311 kB por montagem na Care Glow (~96% `analise_semantica`) e se repete nas releituras. Mapear o que a mesa lê do DNA espalhado no item; candidata ao cache de versões ou a uma projeção.
- [ ] `lib/server/arquiteto-workspace.ts` engole o erro do store da Qualificação com `.catch(() => new Map())`: registrar ou propagar.
- [ ] A montagem faz um fetch próprio de `/api/editorial/workspace` além do provider (`modules/arquiteto/arquiteto-workspace.tsx` ~4543): a mesa é lida duas vezes (R13). O readback do handoff também baixa a mesa inteira.
- [ ] Quando a migration de `row_version` for aplicada, incluir a coluna na lista explícita de colunas (hoje o teste estrutural fixa as 16 colunas).
- [ ] **4 lentes em todos os pontos de SERP do Arquiteto** (diretriz do usuário, 2026-09-23): plano em elaboração.

## Cache de SERP — 2026-09-23

SDD: [cache temporário de SERP](../compartilhado/sdd-cache-serp-temporario-2026-09-23.md) (passos de homologação na §8.5).

- [x] Formação, territorial e SERP por keyword consultam o cache antes da quota e pagam só as faltas.
- [x] Registro por escopo `keyword_serp_observations` substituído pelo cache; store removido.
- [ ] **Homologar** com o Minerador primeiro (paga e grava) e o Arquiteto depois (reaproveita): conferir `serp_cache_entry` no banco, `cacheHits`/`paidQueries` na formação e a linha "do cache · coletada agora" no painel.
- [ ] **Decidir se a UI oferece recoleta forçada.** Hoje "Validar SERP" e "Consultar de novo" reaproveitam por até 30 dias, como pedido. Se precisar, é um parâmetro de pedido até `lookupSerpCache({ refresh })`.
- [ ] Mostrar a idade da lente reaproveitada na SERP por keyword (`meta.collectedAt` já existe).
- [ ] Rever pareceres de formação antigos (`regular`) à luz do `advanced`: `breadth` e vereditos podem mudar.
- [ ] Deduplicar faltas pela chave dentro da requisição (keyword em grupo e em candidatas a Silo paga duas vezes — já era assim).
- [ ] Na SERP por keyword, com quota recusada e acertos parciais, devolver os acertos e declarar as faltas como lacunas (hoje a rota inteira falha, como antes).
- [ ] Remover `collectDataForSeoCompatibilitySnapshot` (sem consumidor em `app/`) numa tarefa própria.
- [ ] Linhas remotas `keyword_serp_observations` inertes: limpeza é operação do usuário, se desejada.

## Aba Silos: lógica primeiro e listas de ~200 — 2026-09-23

Estado em [estado-atual.md](estado-atual.md). Homologação manual pendente, do usuário.

- [ ] **Homologar com o próximo lote**: keywords marcadas Silo/Artigo, posto livre/travado e publicadas declaradas. Conferir na mesa a linha `Vínculo:` de cada keyword, as cabeças de Silo e o que foi para "Sem silo".
- [ ] **Decidir o padrão do posto de publicada sem posto explícito.** O Minerador responde `locked` (travado ao slug); `adaptKeywordIdentityContext.primaryKeywordPolicy`, que a fase Artigos consome, responde `unknown`. Só divergem quando o posto não foi marcado. Não unifiquei porque mudaria o comportamento da fase Artigos, e o AGENTS.md §11 pede "desconhecido/conflito" nesse caso — a decisão é do produto.
- [ ] **Eleger a primária do Silo potencial pela SERP na UI.** A coleta e a leitura existem (`keyword-serp`, `readPublishedGroupFromSerp`); `electPrimaryFromSerp` ainda não tem chamador. Hoje a primária de Silo potencial fica provisória até isso.
- [x] **`siloPath`** do item 7 — pai do artigo publicado. Resolvido em 2026-09-25 pela URL canônica (`resolvePublishedSiloMembership`, ver "Publicados revalidados"), sem ler `siloPath`.
- [ ] `validateTerritorialSerp(dentroDoProcessamento)`: o parâmetro ficou sem quem passe `true`. Remover quando a etapa de SERP for redesenhada.
- [ ] Limiares de lente/afinidade/substituição medidos em só duas keywords reais (divergência 0,061 e 0,174 contra limiar 0,5). Recalibrar com o acervo.

## Alinhamento com o pacote aprovado do Minerador — 2026-09-18

Parecer completo em [parecer-formato-articledna-e-alinhamento-minerador-2026-09-18.md](parecer-formato-articledna-e-alinhamento-minerador-2026-09-18.md).

Ordem **revisada** no adendo de 2026-09-19, depois da auditoria:

- [ ] **1.** Comparar `keywordDnaVersionId`/`keywordDnaContentHash` **e alimentar `staleReasons`** de `canonicalRevisionState` — o mecanismo existe e está apagado: o único consumidor chama sem motivos.
  - [x] Metade do Minerador entregue em 2026-09-19: `lib/minerador/package-freshness.ts`
    devolve `fresh` / `in_review` / `stale` / `never_approved` / `unknown` e a
    lista de `staleReasons` pronta. Falta gravar a referência na formação e
    passar o resultado para `canonicalRevisionState`.
- [ ] **2.** `KEYWORD_PACKAGE_STALE`, metade "keyword em revisão" — leitura viva do Território, não depende do passo 3.
- [ ] **3.** `SiloDNA.keywordPackageRefs[]` — destrava a metade "pacote mais novo que o lido". `centralKeywordDnaRef` passa a ser derivado do array.
- [ ] **4.** Propagação automática — **depende** de resolver a colisão com `articleEditorialDiff`, que hoje recusaria mudança só de medição como no-op.
- [ ] **9.** Migrar o slug para `identity-slug` (2026-09-20). A diretriz da marca passou a separar endereço (`identity-published`/`identity-new`) de identidade SEO (`identity-slug`, `#12A1E0`). `modules/arquiteto/arquiteto-workspace.tsx` pinta o slug com os papéis antigos, e `keyword-dna-readonly-panel`/`article-dna-readonly-panel` mapeiam os dois. Ver `sistema-visual.md` §5.0.1.
- [x] **8.** Consumir `keyword_page_type` (2026-09-20). **Feito em 2026-09-23**: lido por `resolveKeywordVinculo` a partir do pacote aprovado — `analiseSemantica` já viaja integral, então não faltou transporte. A lógica da aba Silos usa o tipo para separar cabeça de Silo de artigo.
- [~] **7.** Ler `site_origin.siteRole`/`siloPath` em `adaptKeywordIdentityContext` (2026-09-20). **`siteRole` feito em 2026-09-23**, inclusive `site_origin` gravado como texto JSON. **`siloPath` ainda não**: `resolveKeywordVinculo` não o expõe, e é ele que diria sob qual Silo um artigo publicado está. **Resolvido de outro jeito em 2026-09-25**: o Silo do artigo publicado sai do prefixo da URL canônica que o Vínculo já expõe.
- [ ] **6.** Trocar `resolveKeywordDnaSignals` por `keywordDnaFromPackage` de `lib/minerador/keyword-dna.ts` (2026-09-19). O Minerador já entrega os treze campos normalizados e um valor por eixo com fonte declarada; `semPlaceholder`, `listaDeTexto` e `intentIsKnown` deixam de precisar existir aqui. Equivalência garantida por `tests/minerador-keyword-dna-fechado.test.mts`.
- [ ] **5.** Estreitar `ArticleKeywordReference`. Escopo maior do que o parecer dizia: `strategicContribution`, `purpose`, `contribution` e `purposeRationale` são template por `role`; `overlapRisk` é literal; `requiredTopics`/`excludedTopics` são sempre vazios.
- [ ] **Em aberto:** artigo publicado recebe marcador de insumo atualizado em vez de reescrita automática.


## Backup restaurável e export editorial — 2026-09-13

- [x] Auditar os artefatos do Arquiteto e suas dependências antes do restore
  (`docs/04-arquiteto/auditoria-backup-restauravel-2026-09-13.md`).
- [x] `BACKUP_RESTORABLE_V1`: arquivo autodeclarado, um registro por artefato,
  payload canônico inteiro em `payload_json`.
- [x] Preview/dry-run com validação de formato, integridade, hashes, Brand e
  conflitos; remapeamento de referências e idempotência.
- [x] `EDITORIAL_EXPORT_V1`: uma linha por ArticleDNA, links agregados, sem
  UUID, hash, lock version ou id de banco.
- [x] Importador exclusivo do backup; export editorial deliberadamente one-way.
- [x] Menu Exportar com os dois produtos e `Restaurar backup` separado de
  `Importar do Minerador`.
- [x] Auditoria corrigida: os writers canônicos por tipo já existiam, e a
  restauração os reutiliza em vez de criar rota genérica.
- [x] Autoridade de restauração server-side com preview classificado
  (`CREATE`/`NO_OP`/`REMAP`/`CONFLICT`/`BLOCKED`), mapa de identidade,
  idempotência e readback com comparação semântica.
- [x] Rota `/api/arquiteto/backup/restore` com `preview` e `apply`, e a
  fronteira do formato repetida no servidor.
- [x] Teste de ida e volta rodando a autoridade real sobre driver simulado:
  estado A → export → ambiente vazio → restore → estado B equivalente.
- [x] Troca de Brand como decisão explícita, com identidade de versão
  reemitida de forma determinística e referências religadas.
- [x] Fingerprint semântico por tipo de artefato e comparação A × B.
- [x] Runner de homologação remota (`npm run arquiteto:backup-homologation`),
  que não depende de DELETE e recusa Brand de destino não vazia.
- [ ] **Bloqueia `BACKUP_RESTORABLE_V1 = YES`:** executar o runner contra o
  banco real, com Brand descartável, e anexar a saída. Execução do usuário.
- [ ] Validação manual na UI depois do ciclo: F5, segundo navegador, Silos,
  Artigos e Links internos reconstruídos pelos loaders normais.
- [ ] Cobrir as duas stored procedures (`persist_internal_link_graph` e
  `persist_silo_working_copy_atomic`) — só o ciclo remoto as exercita.

## Exportação CSV das três fases — 2026-09-13

- [x] Corrigir o botão Exportar: o download real substitui o aviso de
  "Exportação iniciada..." que não entregava arquivo.
- [x] Exportar Silos, Artigos e Links internos a partir dos read-models
  canônicos, sempre o conjunto da Brand e nunca a seleção ou o HTML da tabela.
- [x] CSV de Links com uma linha por aresta, papel lido do SiloDNA e relação
  lida do InternalLinkGraph.
- [x] UTF-8 com BOM, escape completo, datas ISO 8601, ids/hashes inteiros e
  arrays em lista estável.
- [ ] Validar manualmente na UI com marca real: abertura no Excel PT-BR,
  Silo sem SiloPage, Silo sem grafo e grafo grande.

## Reset da homologação — 2026-09-08

- [x] Script de reset com ensaio por padrão e escopo por tipo de artefato.
- [x] Sonda de permissão antes de qualquer escrita, com os GRANT necessários.
- [x] Rodapé da fase 1 com contagem e Limpar seleção.
- [x] Controles manuais e Fresh fora do caminho básico, sem remoção de código.
- [ ] **Do proprietário do banco — bloqueia os PASSOS 1 e 2:**

  ```sql
  GRANT DELETE ON public.editorial_version_status_events TO service_role;
  GRANT DELETE ON public.editorial_artifact_versions TO service_role;
  GRANT DELETE ON public.editorial_workflow_items TO service_role;
  GRANT DELETE ON public.internal_link_graph_edges TO service_role;
  GRANT DELETE ON public.internal_link_graph_nodes TO service_role;
  GRANT DELETE ON public.internal_link_graph_proposals TO service_role;
  GRANT DELETE ON public.internal_link_graph_working_copies TO service_role;
  GRANT DELETE ON public.internal_link_graphs TO service_role;
  GRANT DELETE ON public.editorial_serp_reviews TO service_role;
  GRANT DELETE ON public.editorial_serp_snapshots TO service_role;
  ```

  Depois: `npm run reset:arquiteto -- 09762023-d0d4-4c24-b34e-d0fdfd43f891`
  (ensaio) e só então `--confirm`.
- [ ] Decidir o que fazer com os 4 itens `stage=radar` que ficarão órfãos.
- [ ] PASSO 3 em diante (§17): importar 6–10 keywords novas, 1 Silo, 2–3
  Articles — com 1 single-keyword e 1 multi-keyword — e rodar a cadeia até
  `READY_FOR_RADAR`.

## Fronteira da rodada — 2026-09-06

- [x] Marcador canônico da rodada ativa, sem migration.
- [x] Fronteira aplicada na entrada, para ArticleDNA, SiloDNA, SiloPage e grafos.
- [x] Rodada lida antes da carga, não só ao abrir o preview.
- [x] Regra de `canonical-version-authority` intocada; só o universo muda.
- [x] SERP e KeywordDNA atravessam rodada; estado canônico não.
- [x] `npm run audit:rodada` com a pergunta que libera a execução.
- [ ] **Do produto:** com `ARQUITETO_HOMOLOGATION_MODE=true` e
  `NEXT_PUBLIC_ARQUITETO_HOMOLOGATION_MODE=true`, rodar `audit:rodada` antes e
  depois do fresh. Esperado depois: `ACTIVE_ARTICLES = 0`, `ACTIVE_SILOS = 0`,
  `OLD_APPROVED_ARTIFACTS_VISIBLE_AS_CURRENT = NO` com o histórico intacto.
- [ ] §14 — importar 6–10 keywords de 1 Silo, com 1 Article single-keyword e 1
  multi-keyword, e rodar a cadeia inteira até `READY_FOR_RADAR`.
- [ ] Se a segunda passada de publicados precisar religar SiloDNA aprovado a
  território, isso é corte próprio: o fresh deixa o par no acervo sem
  território de trabalho correspondente.

## Reiniciar homologação — 2026-09-06

- [x] Autoridade pura com lista de permissão e motivo por tipo.
- [x] Rota com modo server-only, escopo por marca e frase ligada ao plano.
- [x] Preview de duas etapas mostrando o que some e o que fica.
- [x] Limpeza do estado local junto com o remoto.
- [x] Testes A–I do corte.
- [ ] **Do produto:** definir `ARQUITETO_HOMOLOGATION_MODE=true` e
  `NEXT_PUBLIC_ARQUITETO_HOMOLOGATION_MODE=true` no ambiente de homologação.
  Sem as duas, o botão não aparece e a rota recusa.
- [ ] Do produto (§9/§10): depois do fresh, importar 5–10 keywords de 1 Silo e
  rodar a cadeia inteira — arquitetura, artigos, SERP, conclusão, links.
- [ ] §12 — conferir na rodada nova que a SERP histórica é reaproveitada quando
  o `formationBaseHash` coincide e coletada quando não.
- [ ] Territórios entram na limpeza: o par SiloDNA/SiloPage aprovado permanece
  no acervo como histórico, mas passa a não ter território de trabalho
  correspondente. É o comportamento pedido em §4/§8; se a segunda passada de
  publicados precisar religar os dois, isso é corte próprio.

## Restauração e formação limpa — 2026-09-06

- [x] Autoridade pura de restauração com baseline no artefato aprovado.
- [x] Preview obrigatório e aplicação atômica com desfazer.
- [x] Controle na aba Silos, explicando por que Reprocessar não resolve.
- [x] Painel da fase Artigos lendo o escopo da autoridade única.
- [x] Resultado explicável do Reprocessar.
- [ ] **§9–§12 — `Reiniciar formação` (FRESH).** Não entrou neste corte: ele
  precisa decidir o que acontece com `humanFormationRef`/`humanRole` (a
  restauração os preserva; o fresh recomeça), e essa é uma decisão editorial
  que muda o que a pessoa perde. Fica para corte próprio, depois da
  restauração provar 8/8.
- [ ] Do produto: `Restaurar cópia de trabalho` (1º clique = preview, 2º
  aplica) e depois `npm run audit:drift` até `8/8`.
- [ ] §18 — homologar num conjunto limpo (1 Silo, 3–5 keywords) antes de voltar
  às 28.
- [ ] Links continua parado: `LINKS_READY = NO` enquanto os Articles não
  estiverem limpos.

## Processamento automático da fase Artigos — 2026-09-06

- [x] Auditar a contradição da SERP em `skin care rosto` antes de mexer na UI.
- [x] Uma autoridade visual de SERP: badge e parecer pela mesma chave.
- [x] Política de fase declarada para evidência vigente e indecisa.
- [x] Fallback `STRUCTURAL_BASELINE_PRESERVED` como resultado terminal.
- [x] Artigo de uma keyword: compatibilidade `NOT_APPLICABLE`.
- [x] Auditorias alinhadas à política da fase.
- [ ] Do produto (§16): smoke com `skin care rosto` — Reprocessar artigos →
  conferir `FORMATION_DECISIONS_PENDING = 0` → Concluir formação, sem abrir
  Ajustes avançados. Depois (§17), um Article multi-keyword.
- [ ] §7 — incorporar ajuste determinístico seguro na divergência dentro do
  mesmo Silo, com proveniência. Hoje a divergência vigente preserva baseline;
  o ajuste automático ainda não existe.
- [ ] Registrar `UPSTREAM_SILO_REVIEW_SUGGESTED` quando a SERP apontar outro
  Silo. A constante existe; falta o ponto que a emite.

## Simplificação da fase 1 — 2026-09-06

- [x] Uma autoridade de seleção para o rodapé e as duas ações.
- [x] Recusa que nomeia a linha fora do cenário em vez de repetir "selecione".
- [x] Remover a etapa "Enviar para aprovação" do fluxo.
- [x] Rótulo de fase coerente com o estado real do artefato.
- [x] Controles manuais sob "Ajustes avançados".
- [ ] §3/§4/§5 — fazer `Reprocessar artigos` fechar sozinho intenção, funil,
  KGR, aplicabilidade e compatibilidade, com `STRUCTURAL_BASELINE_PRESERVED`
  quando a SERP não sustentar mudança. Hoje a resolução terminal já existe
  (`article-classification-closure`), mas 1 candidato do lote está em
  `CURRENT_INCONCLUSIVE_UNRESOLVED` e ainda pede decisão.
- [ ] §10 — auditar `SERP_DISPLAY_SOURCE` × `SERP_STATE_SOURCE`: não renderizar
  "Parecer da SERP" quando não há assessment; rotular fallback lógico como tal.
- [ ] §11 — Article de uma keyword: compatibilidade `NOT_APPLICABLE` e Principal
  automática, sem decisão manual.
- [ ] Do produto: smoke do §16 com um Article realmente incompleto.

## Fechamento da fase Silos — 2026-09-06

- [x] Preview obrigatório antes de qualquer escrita de `Confirmar arquitetura`.
- [x] Confirmação amarrada à assinatura do plano previsto.
- [x] Preview mostra Silos, atribuições, SiloPage, canonical e publicação.
- [x] Recusa de quebra e de restauração parcial preservadas.
- [x] Verificado que a restauração parte de `humanFormationRef`/`humanRole`.
- [x] Verificado que `audit:drift` ignora proposta no-op.
- [ ] **Do produto:** clicar `Confirmar arquitetura` (1º clique = preview,
  2º = aplica) e rodar `npm run audit:silopage` para o readback.
- [ ] **Do produto:** restaurar as 3 atribuições locais e rodar `audit:drift`
  até `8/8`. Se o plano da confirmação não trouxer as três, é isso que o
  preview vai mostrar — e aí falta um caminho de restauração dirigido.
- [ ] `territory:17a6da12` (Anti-idade e Retinol candidate) deve terminar com
  `ACTIVE_ASSIGNMENTS = 0`; `superseded` fica para corte próprio, sem bloquear.
- [ ] Continua parado: SERP, Concluir formação, Processar links, Radar.

## Guarda de no-op na conclusão — 2026-09-06

- [x] Comparador editorial normalizado contra a canônica aprovada.
- [x] `Concluir formação` recusa criar sucessora sem diff substantivo.
- [x] No-op vira mensagem, não silêncio.
- [x] Auditoria e mesa compartilham a mesma autoridade de diff.
- [ ] Do produto: escolher para o smoke um Article que REALMENTE precise de
  formação/revisão. `skin care principia` já está formado e canônico em v10 —
  usá-lo só produziria `NO_NEW_VERSION`.
- [ ] Restaurar o drift LOCAL para 8/8 ANTES de processar links: o grafo é do
  Silo/conjunto, e com Article em drift estrutural `LINK_GRAPH_REBASE_SAFE = NO`.
- [ ] Limpeza das propostas no-op de `principia` (v11–v17) fica para quando
  existir mecanismo de abandono/supersessão de proposta. Não promover nem
  deletar para limpar tela.

## Passada planejada e reconciliação de publicados — 2026-09-06

- [x] Declarar o cenário de publicação em um lugar só, com o porquê.
- [x] `publishedVerificationRequired` com padrão `true` na portaria da SiloPage.
- [x] Aplicar a bandeira no servidor, nunca pelo corpo da requisição.
- [x] Manter `canonical_mismatch` bloqueando mesmo no cenário planejado.
- [x] Corrigir a seleção da canônica na auditoria (`audit:arquiteto`).
- [ ] **PUBLISHED_STRUCTURE_RECONCILIATION** — segunda passada: conteúdo
  publicado vs planejado, sitemap, canonical, redirects, slug protegido,
  keyword principal publicada, SiloPage publicada, catálogo do site, duplicatas
  de raiz publicada e `publishedStructureRef`. Quando entrar, virar
  `CURRENT_SCENARIO_REQUIRES_PUBLISHED_VERIFICATION = true`.
- [ ] Do produto (smoke ponta a ponta com `skin care principia`): Confirmar
  arquitetura → Reprocessar artigos → Concluir formação → Processar links →
  Confirmar links internos → conferir `READY_FOR_RADAR`. Sem importar ao Radar.
- [ ] Continua parado: as 3 assignments do drift LOCAL e o rebase dos 6 grafos.

## Preflight da SiloPage — 2026-09-06

- [x] Auditar a autoridade de identidade/publicação e confirmar o consumo pela
  consolidação (`CONFIRM_ARCHITECTURE_USES_IT = YES`).
- [x] Preflight read-only por SiloPage (`npm run audit:silopage`).
- [x] `siloPageApprovalPreflight` reusando a portaria existente.
- [x] Preflight visível na aba Silos antes de `Confirmar arquitetura`.
- [x] Testes A–G do corte.
- [ ] Do produto: rodar `Confirmar arquitetura` para as três — a identidade já
  resolvida entra no payload e a portaria libera 3/3. Conferir no readback
  `SILO_PAGE_APPROVED = 3/3` com entityId, versionId, slug, canonical e
  `published`.
- [ ] Continua parado de propósito: SERP/formação, rebase dos 6 grafos
  (`baseStale`, reaproveitáveis) e as 3 assignments do drift LOCAL.

## Canônica × proposta e SiloPage — 2026-09-06

- [x] Separar `canonical` (última aprovada) de `workingProposal` na leitura.
- [x] Proposta em edição deixa de rebaixar a versão aprovada.
- [x] Invalidação estrutural exige motivo declarado, nunca "há versão mais nova".
- [x] Grade mostra a versão aprovada e a revisão em andamento separadas.
- [x] Links consome a canônica aprovada, não a proposta.
- [x] Tipo de unidade vira fato derivado; some a pendência artificial.
- [x] Auditoria read-only de diff entre canônica e proposta (`audit:versoes`).
- [x] Classificar SiloPage 0/3: NEVER_APPROVED nas três.
- [ ] Mostrar na aba Silos os bloqueios de aprovação da SiloPage ANTES do
  clique — hoje a recusa só existe no servidor.
- [ ] Do produto: verificar identidade das duas SiloPages publicadas e planejar
  o canonical da nova, para `Confirmar arquitetura` fechar 3/3.
- [ ] Do produto: a proposta v16 de `principia` é no-op; ela fica no histórico
  até existir mecanismo de abandono de proposta. Não promover para limpar tela.

## Ownership das fases e autoridade única — 2026-09-06

- [x] Remover o fallback provisório da leitura de conflito do artigo.
- [x] Manter o conflito de fronteira de Silo na fase Silos.
- [x] Remover a segunda autoridade de aprovação do ArticleDNA.
- [x] Recusar por escrito a ação `approve` na porta de persistência do fechamento.
- [x] Fase Links nomeia a dependência de Artigos antes do estado da tela.
- [x] Liberar o latch de `linksSaveState` ao sair de `processarLinks`.
- [ ] Decisão do Planejador: registrar "Tipo de unidade" deve reabrir a
  aprovação do ArticleDNA? Hoje ela rebaixa para `proposed` sem dizer.
- [ ] Decisão do Planejador: qualificar os rótulos das colunas Aprovação e
  Status. O badge é compartilhado com outros módulos.
- [ ] Do produto: reprocessar `skin care principia` com SERP e concluir a
  formação, conferindo que os dois conflitos não reaparecem.

## Fechamento humano e ações por aba — 2026-09-06

- [x] Separar, na leitura, a versão aprovada da revisão corrente.
- [x] Papel do artigo com fonte única (decisão humana vigente).
- [x] Serviço único de fechamento para aprovação individual e em lote.
- [x] Seletor "Alterar status" com enviar para aprovação, aprovar e reabrir
  revisão, com contagem de elegíveis e bloqueados antes do clique.
- [x] Bloqueio que nomeia o problema e o controle que o resolve.
- [x] Remover `changeSelectedArticleStatus` em vez de reconectá-lo.
- [x] Revalidação da aprovação no servidor, aditiva na rota de artefatos.
- [x] Reabertura como sucessora em `proposed`, sem rebaixar a versão aprovada.
- [x] Corrigir a fronteira das ações por aba (Silo em Artigos, Radar em Links).
- [x] Marcar a revisão de links como desatualizada quando o artigo ganha
  sucessora, preservando o grafo aprovado.
- [ ] Do produto: aprovar artigos na tela, recarregar e conferir em outra sessão
  que voltam aprovados com a mesma versão e hash.
- [ ] Do produto: provocar gravação sem readback e conferir que a tela manda
  recarregar em vez de repetir.
- [ ] Restaurar os três vínculos territoriais divergentes — fora deste corte,
  precisa de impacto demonstrado antes de qualquer restauração.

## Persistência canônica da revisão IA — 2026-08-29

- [x] Reutilizar `editorial_artifact_versions` com `article_architecture_ai_review`.
- [x] Persistir NO_OP como resultado válido.
- [x] Persistir propostas materiais com `proposalId` estável.
- [x] Registrar decisão humana como sucessora do artefato.
- [x] Incluir a base revisada no `contentHash` e aplicar a política de STALE.
- [x] Readback obrigatório antes do SUCCESS.
- [x] Hidratar a revisão vigente por Article no carregamento e no F5.
- [x] Migration versionada ampliando apenas o CHECK de `artifact_type`.
- [ ] Do produto: aplicar o SQL no remoto e rodar o smoke A–F.

## IA por Article e durabilidade da revisão — 2026-08-29

- [x] Tornar o Article a unidade de execução da IA, com concurrency = 1.
- [x] Substituir o registro cru da keyword por projeção estratégica no payload.
- [x] Enviar a SERP como veredito e observações, sem snapshots crus.
- [x] Enviar o Silo como fronteira, sem grafo completo de artigos e links.
- [x] Medir o payload antes da chamada e falhar só o Article que excede.
- [x] Isolar falha por Article e reportar execução parcial.
- [x] Contar propostas materiais na bancada e na aba do artigo pelo mesmo
  classificador.
- [x] Auditar a durabilidade da revisão e emitir o pedido estrutural em vez de
  criar fallback local.
- [ ] Bloqueado por decisão estrutural: persistir execução, NO_OP, propostas,
  `contentHash`, proveniência e decisão humana para sobreviver ao F5.
- [ ] Validação manual: selecionar cinco artigos, confirmar cinco execuções,
  provocar falha em um e conferir que os outros quatro mantêm as propostas.

## Fronteira de aprovação do Article — 2026-08-29

- [x] Desacoplar a aprovação do ArticleDNA do handoff automático ao Radar.
- [x] Reverter `siloId: nullable` nos contratos downstream e impedir projeção
  de unidade incompleta.
- [x] Separar `READY_FOR_SILOS` de `READY_FOR_RADAR` com derivadores próprios.
- [x] Exigir Silo aprovado e InternalLinkGraph aprovado no gate do Radar.
- [x] Transformar "Ver definição completa do artigo" em ficha vertical
  somente leitura no padrão do KeywordDNA.
- [x] Manter CTA/promessa como nota não bloqueante.
- [ ] Validação manual: aprovar um artigo sem Silo, confirmar que nada vai ao
  Radar e que a ficha abre completa.

## Fechamento funcional da fase Artigos — 2026-08-29

- [x] Transformar o perfil completo da keyword em ficha vertical por tópicos.
- [x] Tirar `Revisão Minerador` do resumo e tratá-la como proveniência.
- [x] Classificar a SERP em compatível, inconclusiva e divergente, sem conflito
  bloqueante quando a evidência é insuficiente.
- [x] Mostrar objeto, evidência, motivo, impacto e ações na divergência real.
- [x] Impedir conflito de agrupamento em artigo com uma única keyword.
- [x] Explicitar a função da IA do Arquiteto na própria aba.
- [x] Centralizar as decisões humanas do artigo em um checklist com o que
  falta, por quê e como resolver.
- [x] Criar a aprovação explícita `[Aprovar ArticleDNA]` e o fluxo de status.
- [x] Remover `Página de categoria` da fase Artigos.
- [ ] Validação manual do ciclo completo: Importação → Lógica → SERP → IA →
  Revisão → Aprovar ArticleDNA → Pronto para Silos.

## Perfil completo da KeywordDNA no Arquiteto — 2026-08-29

- [x] Restaurar o resumo horizontal denso da keyword no painel do artigo.
- [x] Levar todo o KeywordDNA recebido para dentro do accordion, em seções.
- [x] Garantir projeção lossless com subaccordion de proveniência técnica.
- [x] Restaurar a Apresentação Contextual com texto integral e proveniência,
  transportando-a no snapshot canônico do Arquiteto.
- [x] Empilhar Principal, Secundárias e Reforços no mesmo componente readonly.
- [x] Manter zero controles de mutation e o KGR do artigo separado.
- [ ] Validação manual: abrir o artigo, conferir densidade das duas linhas,
  abrir o perfil completo e conferir seções, apresentação e proveniência.

## Gates de entrada e saída da fase Artigos — 2026-08-29

- [x] Exigir KeywordDNA consolidada (Qualificação Semântica conclusiva) para a
  importação normal, com motivo legível e recusa no writer canônico.
- [x] Manter intenção, funil e KGR como fatos upstream: o Arquiteto não
  completa a qualificação do Minerador.
- [x] Remover Silo e hierarquia Pilar/Suporte do gate de aprovação do Article.
- [x] Criar derivador único de `READY_FOR_SILOS` e aplicá-lo nos três pontos
  da interface, eliminando o estado incoerente.
- [x] Classificar proposta de IA sem mutação como execução concluída sem
  alteração estrutural, sem pendência humana artificial.
- [x] Tirar promessa, CTA e enriquecimento editorial do gate estrutural,
  preservando-os como alerta.
- [ ] Repetir o teste operacional com uma KeywordDNA realmente consolidada e
  validar manualmente a interface (importação recusada, artigo fechando sem
  Silo, "Pronto para Silos" só após o fechamento).
- [ ] Depende do pedido estrutural da decisão KGR: enquanto não houver campo
  canônico, artigo não pleno com Principal aplicável não fica pronto para
  Silos.

## Regra final de KGR do artigo — 2026-08-28

- [x] Ler score e aplicabilidade reais da KeywordDNA Principal sem recalcular
  nem sobrescrever.
- [x] Classificar KGR pleno com `kgr >= 0` e `kgr < 0.25` (0.25 exato fora),
  exibindo `Sim · KGR pleno` em token verde e sem pedir decisão humana.
- [x] Encaminhar `>= 0.25` + `Aplicável` para decisão humana; `>= 0.25` +
  `Não aplicável` para `Não`; `>= 0.25` + pendente para `Pendente`; score
  ausente permanece `—`.
- [x] Preservar score e aplicabilidade individuais de secundárias e reforços,
  sem média, maioria ou contagem definindo o artigo.
- [x] Exibir na aba SERP, apenas para artigo não pleno com Principal aplicável,
  KGR da Principal, aplicabilidade upstream, competição observada, força da
  evidência e recomendação para estratégia KGR.
- [x] Manter o select do Article separado do select de aplicabilidade do
  KeywordDNA e distinguir `KEYWORD_KGR_SCORE`, `KEYWORD_KGR_APPLICABILITY`,
  `ARTICLE_KGR_DECISION` e `ARTICLE_KGR_DECISION_SOURCE`.
- [x] **APROVADO E IMPLEMENTADO LOCALMENTE:** local canônico da
  decisão KGR do artigo (estados, autoria, data, justificativa e histórico),
  conforme `propostas/2026-08-28-pedido-estrutural-decisao-kgr-do-artigo.md`.
- [x] Habilitar o registro humano `Sim/Não` na Revisão,
  propagar a decisão ao Radar e ao Planejador sem substituir o KGR de cada
  KeywordDNA e usar `KGR = Sim` como insumo (não automático) do slug
  exact/near-exact.
- [ ] Executar smoke autenticado de Article KGR com casos FULL, limite 0.25,
  Sim, Não, troca de Principal, stale `lock_version`, F5 e handoff ao Radar.
- [ ] Só marcar `ARTICLE_KGR_REMOTE_HOMOLOGATION = PASS` após readback real de
  decisão/source/ator/data, sucessora de ArticleDNA e bloqueio de pendência.

## SERP prioritária e retorno estrutural downstream — 2026-08-27

- [x] Apresentar precedência de recomendação para assessment SERP ativo,
  completo e observável, mantendo Lógica/IA como hipótese/proposta e humano
  como consolidador.
- [x] Manter explícita a insuficiência/desatualização sem desempate automático
  e sem mutação da working copy.
- [x] Registrar o slug atual/provisório sem gerar recomendação de slug por
  heurística ausente.
- [ ] **PEDIDO ESTRUTURAL PARA O PLANNER GERAL:** aprovar persistência
  versionada da recomendação SERP de slug e de
  `STRUCTURAL_REVIEW_REQUIRED`, conforme
  `propostas/2026-08-27-pedido-estrutural-serp-slug-structural-review.md`.
- [ ] Após a fundação aprovada, implementar nos módulos proprietários a emissão
  downstream sem mutação e o retorno humano ao Arquiteto; não iniciar nesta
  tarefa.
# Backlog — Arquiteto

## Purga administrativa de Arquiteto e Radar — Care Glow — 2026-09-08

- [x] Consolidar um único script administrativo, substituindo os dois anteriores.
- [x] Fixar o alvo e validar a identidade da marca antes de remover.
- [x] Lista explícita dos registros, com condições positivas para `architect` e
  `radar` no lugar de `stage <> 'architect'`.
- [x] Mapear dependências por FK **e dentro dos payloads**; Planejador, Redator,
  Publicações ou outra marca abortam mostrando os identificadores.
- [x] Exportação prévia somente-leitura com manifesto de ids, contagens, hashes
  do preservado e procedimento de restauração.
- [x] Uma transação, dependentes antes das origens, sem anular referência.
- [x] Gatilhos append-only nomeados, suspensos e restaurados no mesmo escopo,
  com verificação — sem remover função, FK ou validação.
- [x] Verificação de conjunto zerado, preservação por hash de ids e ausência de
  órfãos, com rollback integral em qualquer divergência.
- [x] Modo `:simular` para ensaio e para provar idempotência sobre estado vazio.

### Abertas — execução

- [ ] Rodar com `v_simular := true` e conferir o manifesto impresso.
- [ ] Rodar com `:simular = true` e conferir o manifesto.
- [ ] Executar a purga e registrar o resultado por tabela.
- [ ] Conferir Arquiteto e Radar vazios **nas duas sessões**, pelo servidor.
- [ ] Confirmar que recuperação local não repovoou o servidor.
- [ ] Reexecutar em simulação sobre o estado vazio (idempotência).
- [ ] Validar o script em ambiente isolado: dependência externa, falha
  intermediária e execução repetida.

### Correção funcional separada

- [ ] **Aba Silos sem seleção e sem exclusão.** Registrado como defeito próprio;
  não é motivo desta purga nem é resolvido por ela.

## Fundação estrutural de Links Internos — 2026-08-26

- [x] Auditar o versionamento atual de ArticleDNA, SiloDNA, SiloPage,
  versionamento, hashes, readback, autorização canônica e consumidor Radar →
  Planejador.
- [x] Implementar localmente os contratos determinísticos de
  `InternalLinkGraph`, nós ArticleDNA/SiloPage, arestas dirigidas, propostas,
  stale, sucessora e aprovação humana separada.
- [x] Criar a migration local
  `20260826225145_internal_link_graph_foundation.sql` com quatro tabelas,
  FKs/constraints, guards append-only, RLS/policies e RPC server-side.
- [x] Implementar localmente a persistência transacional pareada
  `persist_silo_pair_atomic(...)` e adaptar a consolidação humana sem fundir
  SiloDNA/SiloPage.
- [x] Criar rollback local explícito, sem `CASCADE`, e preflights remotos
  catalog-only.
- [x] Cobrir domínio e estrutura local: `10/10 PASS`.
- [x] Executar os preflights remotos read-only e registrar catálogo,
  pré-condições e ausência dos alvos antes de qualquer apply manual.
- [x] Aplicar manualmente a fundação do InternalLinkGraph e a atomicidade do
  par; confirmar preflight, readback e integridade dos guards.
- [x] Executar post-readback e smoke transacional/cross-brand sem dados reais;
  confirmar RLS, isolamento, append-only, versões, hashes e rollback técnico.
- [ ] Implementar a experiência funcional da aba Links Internos sobre o
  contrato remoto confirmado; React Flow continua sendo projeção e não fonte
  de verdade.

**Limite:** catálogo de listas/workflow permanece fora da transação do par;
Radar/Planejador receberam apenas referência opcional e não podem reescrever o
grafo. As migrations foram aplicadas manualmente e o próximo gate é funcional,
não uma nova alteração estrutural.

## Fechamento do fluxo mínimo até o Radar — 2026-08-24

- [x] Implementar criação manual pareada `minerador_keyword_lists` +
  `SiloDNA draft` + `SiloPage new`, com somente nome/slug na UI, slug
  normalizado, referência canônica e readback guardado.
- [x] Preservar a cópia de trabalho no workflow canônico para agrupamento,
  silo, desanexação, slug, hierarquia, revisão IA, recomendação SERP e
  undo/redo, sem alterar identidade publicada.
- [x] Liberar edição manual de papel em artigos novos (`Principal`,
  `Secundária`, `Reforço`), com demotion automático da principal anterior e
  persistência/readback pelo mesmo workflow canônico.
- [x] Entregar o snapshot enriquecido de cada KeywordDNA à revisão DeepSeek,
  junto com assessments SERP disponíveis, silos e proteções dos publicados.
- [x] Fechar a barra contextual no fluxo `Validar SERP` → `Revisar com IA`
  opcional → `Confirmar arquitetura` → `Enviar ao Radar`.
- [x] Manter DataForSEO como único provider da compatibilidade SERP e conectar
  o consumidor à Connection global READY já disponível, sem usar allintitle,
  Serper, RapidAPI ou OpenRouter. O consumidor não exige capability,
  grants/bindings ou quota específica; readback e smoke real permanecem gates
  manuais.
- [x] Evitar recarga duplicada do catálogo de silos ao entrar no Arquiteto;
  troca de Brand e criação explícita continuam atualizando o dado necessário.
- [x] Alinhar o gate de confirmação para 1–6 keywords: uma principal
  obrigatória, até cinco apoios e seis como teto, sem preenchimento artificial.
- [x] Substituir a sequência guardada da criação pareada por boundary
  transacional/RPC aprovado, sem migration automática nesta etapa.
- [ ] Validar manualmente no Chrome autenticado: criação, F5/nova aba/logout,
  isolamento por Brand, seleção, mouse/touchpad, SERP DataForSEO, revisão
  DeepSeek, confirmação e handoff ao Radar.

> Nota: as entradas históricas abaixo que descrevem o criador manual como
> catálogo-only ou o provider como Serper estão superseded pela seção acima;
> permanecem apenas como trilha de decisão.

## Ciclo GlobalTopbar e interface semântica — 2026-08-14

- [x] Auditar o ciclo de registro Arquiteto ↔ GlobalTopbar e confirmar a origem da identidade instável dos controles.
- [x] Separar registro, atualização e cleanup: callbacks estáveis, guarda de identidade, `updateControls` por módulo, refs estáveis para handlers e cleanup protegido contra módulo obsoleto.
- [x] Preservar operações da topbar e do Arquiteto sem alterar contratos, dados, workflow, persistência ou layout da planilha.
- [x] Aplicar tokens semânticos no conteúdo ativo do Arquiteto e variante visual opt-in no popup de histórico; ancorar o popup no botão global e manter fechamento externo/Escape.
- [x] Criar regressão para registro idempotente, atualização de busca, cleanup por módulo, ciclo, seleção por pintura e guard visual.
- [x] Validar localmente `30/30` testes direcionados, `test:arquiteto 101/101`, guard visual, busca/filtros/popups/ações no Chrome e capturas do estado vazio/popover.
- [ ] Repetir validação autenticada com workspace canônico populado: linhas carregadas, seleção individual/Ctrl/Cmd/Shift, pintura com mouse/touchpad, expansão, conflitos, revisável, ArticleDNA/SiloDNA e ações em lote.
- [ ] Revalidar responsividade em 360/768/1024/1440px e light mode quando disponível.
- [ ] Corrigir separadamente os três `TS1501` de `tests/agency-adalba-platform-internal.test.mts` e atualizar as quatro asserções obsoletas de `tests/operational-flow.test.mts`; não misturar essa dívida ao reparo do Arquiteto.

## Fase 2 — preflight da limpeza estrutural — 2026-08-12

- [x] Auditar localmente os objetos exclusivos de 0030 e `tenant_0016_agency_role_rollback`, sem remover migrations aplicadas.
- [x] Confirmar zero consumidor runtime local para as duas tabelas 0030, o helper `canonical_actor_can_execute_brand_exceptional_operation(...)` e a tabela de rollback 0016.
- [x] Preparar `supabase/scripts/structural-cleanup-preflight-read-only.sql` com um único result set catalog-only, contagens, dependências, FKs, RLS, policies, ACL, owner, índices, constraints, views, funções/procedures e triggers.
- [x] Registrar que `pipeline_editorial_protect_append_only()` é compartilhada por consumidores canônicos 0027/0028 e não pode ser removida com 0030.
- [x] Confirmar localmente que a próxima migration existente é `0030`; `0031` permanece reservada/abandonada e `0032` é somente o próximo número elegível, sem arquivo criado.
- [ ] Executar manualmente o preflight remoto e classificar cada objeto como `DROP_SAFE`, `BLOCKED` ou `INVESTIGATE`.
- [ ] Somente após `DROP_SAFE`, gerar snapshot/fingerprint remoto aprovado e propor uma única migration sucessora; não criar migration nesta fase.

**Estado:** `STRUCTURAL_CLEANUP_PREFLIGHT = READY`; `REMOTE_OPERATION = NONE`.

## Fase 1 — remoção do runtime histórico abandonado — 2026-08-12

- [x] Auditar imports diretos, referências dinâmicas, route handlers, testes e documentação operacional de recovery/rebaseline.
- [x] Remover `lib/arquiteto/legacy-handoff-reconciliation.ts`, as rotas `/api/arquiteto/handoff/preview` e `/api/arquiteto/handoff/rebaseline`, além dos tipos/schemas/testes exclusivos.
- [x] Separar o handoff normal do fluxo histórico: `prepareCanonicalHandoff()` só cria `keyword/architect/received` para `aprovado`/`publicado` e rejeita workflow remoto incompatível.
- [x] Confirmar que `resolvePipelineContext()`, repositories canônicos, workspace/artifacts, `/api/editorial/*`, `briefings_artigos`, adapters atuais, browser artifact store e recovery local ativo continuam preservados.
- [x] Confirmar que `lib/legacy-routing.ts` permanece ativo por `proxy.ts` e testes de tenant/routing; não é zero-consumidor.
- [x] Não alterar banco, migrations, 0030, rollback 0016, Google Ads legado ou storage do navegador.

O item anterior de recuperação/rebaseline histórico fica **ABANDONADO PARA O
RUNTIME**. SDDs, migrations e scripts read-only permanecem como histórico
`ARCHIVE_ONLY`; não há writer, backfill ou operação remota autorizada.

Pendente separado: migrar os consumidores legados ainda ativos (`briefings_artigos`,
`/api/editorial/workspace`, adapters/operational-flow, recovery local e Google
Ads) antes de qualquer nova limpeza estrutural.

## Smoke pendente — handoff canônico Minerador → Arquiteto após correção do read-model (2026-08-12)

- [x] Preservar no read-model a keyword com workflow remoto `keyword/architect/received` quando ainda não existir ArticleDNA equivalente.
- [x] Manter ArticleDNA canônico como precedência sobre o handoff equivalente por `keywordId`, sem fallback por texto, slug, owner ou storage.
- [x] Preparar `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql` para contagens sanitizadas por `brandId` canônico.
- [x] Smoke autenticado validado pelo usuário em dois navegadores: keyword nova aprovada, workflow remoto, ArticleDNA, F5, reinício da aplicação e leitura pela outra origem. Nenhum recovery histórico, backfill ou SQL mutável foi executado.
- [ ] Validar manualmente a igualdade de elegibilidade no modal `Importar do Minerador` nos navegadores A e B (mesma conta e Brand), inclusive após logout/login. Marcadores legados de `localStorage`/IndexedDB não podem alterar a decisão recebida do servidor.

## Histórico arquivado — recuperação canônica de guards históricos (não executar)

- Validar na UI que `received`, guard remoto e publicado possuem bloqueios e mensagens canônicos distintos; marcador local transitório não pode bloquear a importação.
- [x] Fundação local 0030 de grants/eventos e helper preparada; não inclui writer, rota ou guard remoto.
- [ ] Executar o preflight remoto e obter autorização específica antes de aplicar a 0030; `POST /api/arquiteto/handoff` continua exclusivo de novas keywords e deve rejeitar guard histórico.

## Entregue localmente — padrão visual da planilha do Minerador (2026-07-31)

- Referência extraída de `modules/minerador/minerador-workspace.tsx`: grade fixa e compacta, cabeçalho/fundo escuros, bordas discretas, linha selecionada índigo, hover neutro, controles compactos e barra inferior operacional.
- Aplicação exclusiva em `modules/arquiteto/arquiteto-workspace.tsx`; não houve alteração no Minerador nem em componente compartilhado.
- Colunas e comportamentos do Arquiteto foram preservados; a keyword principal ficou como a única coluna textual elástica e a seleção por pintura não foi modificada.
- Pendente: validação visual manual autenticada lado a lado, em dark mode e nas larguras 360/768/1024/1440px; conferir também clique, Ctrl/Cmd, Shift, pintura, foco, filtros e ordenação.

## Entregue localmente — histórico ancorado (2026-07-31)

- O histórico do Arquiteto usa o popover existente, ancorado abaixo do botão Histórico e fechado por clique externo, Escape ou fechar.
- Ajuste compartilhado retrocompatível em `components/editorial/history-controls.tsx`: o modo popover alinha-se à borda esquerda do disparador e permanece contido na viewport. Consumidor preservado: Minerador.
- Pendente: validação manual autenticada no Arquiteto e no Minerador.

## Entregue localmente — entrada sem recarga duplicada (2026-07-31)

- Removida a segunda chamada automática de `fetchMasterList` na sincronização de sessão do Arquiteto.
- A planilha continua carregando pela assinatura de importação e atualiza somente após mudança efetiva ou ação explícita do usuário.

## Entregue localmente — superfície operacional limpa (2026-07-31)

- Removidos da planilha o painel de recuperação segura, `Resetar não-publicados` e o contador passivo de conflitos lógicos.
- Atualizações de silos não escondem mais uma planilha já recuperada/carregada; o primeiro carregamento vazio continua com feedback de carregamento.

## Regra compartilhada KGR/formação — concluído localmente em 2026-07-21

- SDD e ADR registrados.
- Contratos e gate determinísticos adicionados sem reprocessamento ou migration.
- Fixtures cobrem limite de seis, intenção incompatível, cobertura de volume e KGR não confirmado.
- Pendente: aprovação/validação humana autenticada e confirmação remota do Minerador.

## Entregue nesta etapa — correção semântica do avaliador SERP (2026-07-21)

- SDD: `docs/04-arquiteto/propostas/2026-07-21-correcao-avaliador-serp-intencao-kgr.md`; ADR: `docs/00-produto/decisoes/ADR-012-avaliador-serp-intencao-e-kgr-leve.md`.
- `ArticleIntentProfile` ancorado na principal, labels equivalentes normalizadas e sinais de secundárias preservados sem sobrescrever a intenção central.
- Hierarquia separada de formato; snippets tratados como evidência parcial; confiança explícita e gating de recomendações destrutivas.
- Perfil `kgr_light` reduz consultas e mantém todas as referências KeywordDNA; assessment v1 permanece e pode ser marcado desatualizado antes da v2.
- Proveniência Minerador→Arquiteto corrigida para URL publicada, canonical, slug e status.
- **Verificado:** `test:arquiteto` 70/70; testes de provider somente com fixtures. **Pendente:** `test:operational`, TypeScript, lint/build finais e validação browser autenticada.
- **Andamento 2026-07-20:** reparada a regressão que deixava keywords aprovadas recém-importadas fora da `masterList`; a seleção agora é reconciliada com o workspace existente sem reagrupar durante a leitura.
  - **Arquivos alterados nesta etapa:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `modules/arquiteto`, `tests/operational-flow.test.mts`, `docs/04-arquiteto/estado-atual.md`, `docs/04-arquiteto/backlog.md`
  - **Evidências:** `test:arquiteto` 48/48, `test:operational` 49/49, `npm run build` e `git diff --check` passaram.
  - **Pendente:** validação manual com snapshot exportado e leitura real por marca; `tsc` completo e lint permanecem bloqueados por problemas fora/anteriores ao reparo.
## Agora
- **Objetivo:** restaurar a integridade de importação e hidratação sem executar IA nova.
  - **Módulo proprietário:** Arquiteto
  - **Arquivos permitidos:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `modules/arquiteto`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`, testes e docs do módulo
  - **Arquivos proibidos:** migrations, Minerador e módulos consumidores sem SDD
  - **Dependências:** snapshot completo, dados de diagnóstico e autorização para leitura
  - **Riscos:** perder recovery válido ou promover índice inconsistente
  - **Critério de aceite:** cada keyword importada tem localização; grupos/artigos recuperáveis reaparecem; nenhuma origem é apagada
  - **Testes obrigatórios:** `test:arquiteto`, `test:operational`, validação manual com snapshot
## Próximo
- **Objetivo:** formalizar proposta de persistência/hidratação de SiloPage, se necessária.
  - **Módulo proprietário:** Arquiteto
  - **Arquivos permitidos:** `docs/04-arquiteto/propostas/**`
  - **Arquivos proibidos:** código e migrations antes de aprovação
  - **Dependências:** resultado da reconciliação
  - **Riscos:** mudar contrato compartilhado
  - **Critério de aceite:** SDD com consumidores, rollback e testes
  - **Testes obrigatórios:** revisão de contrato
## Depois
Nenhuma tarefa aprovada.

## Entregue nesta etapa — política da principal do Minerador (2026-07-22)

- SDD: `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md`; decisão: `docs/00-produto/decisoes/ADR-016-politica-principal-minerador-arquiteto.md`.
- Consumo determinístico de `primary_keyword_policy` (`locked`, `reviewable`, `free`) com efetivos `locked`, `revisable`, `free`, `conflict` e `unknown`; publicado sozinho não trava a principal.
- ArticleDNA preserva política original/efetiva, contexto humano, métricas da principal, candidatas, decisão, URL, slug, canonical, publicação, relação e snapshots KeywordDNA.
- `ArticleControlContext` separa política/proteção da principal de URL/slug/canonical/marca e expõe o motivo da proteção.
- `kgr_decisao=NAO`/`not_applicable` explícito vira `competitive`; KGR confirmado continua `kgr_light`; ausência não vira não-KGR.
- Confirmação humana permite substituir candidata, cria sucessora versionada, trava a nova principal e conduz a SERP seguinte para `fortalecimento`.
- **Validação:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e build passaram; lint completo da página mantém dívida legada. Browser autenticado, reload real, Supabase/RLS e provider real ainda pendentes.
## Bloqueado
Novas operações de IA até confirmação da integridade.
## Descartado
Limpar localStorage/IndexedDB para "resolver" inconsistência.

## Entregue nesta etapa — SERP de formação e identidade publicada (2026-07-21)

- SDD e ADR registrados.
- Preservação integral da KeywordDNA nos `ArticleKeywordReference` e na transferência aprovada ao Radar.
- Assessment SERP por artigo/keyword, snapshots, hash, recomendações e decisões humanas persistidas por marca.
- Proteção de publicados, identidade sem URL inventada, link seguro e verificação server-side de URL/canonical/sitemap quando fornecido.
- Coluna independente `APROVAÇÃO`, sem criar estado novo.
- **Pendente:** validação manual autenticada; nenhum provider real foi chamado. O build compilou, mas a geração estática falhou em `/admin/marcas` com erro de invariável do Next fora do escopo.
## Concluídos recentes
Auditoria documental inicial em 2026-07-20.

## Entregue nesta correção — visibilidade SERP por keyword (2026-07-21)

- Indicador de estado SERP na linha do artigo, com versão e estados de erro/conflito/desatualização.
- Fechamento do preview somente após persistência; expansão automática, aba de suporte e foco na linha sem reload.
- Recomendação renderizada junto à keyword principal ou de suporte, com justificativa, status, data, conflitos e ações `Seguir recomendação`/`Ignorar`.
- Associação determinística por `articleId + keywordId + keywordDnaVersionId`; ordem da lista, texto e índice não participam do vínculo.
- Resultado incompleto ou não hidratado é visível como `Recomendação SERP não associada`, com IDs de KeywordDNA e ArticleDNA.
- **Pendente:** validação manual autenticada do fluxo completo, sem executar chamada paga automaticamente.

## Entregue nesta correção — modos SERP (2026-07-21)

- `assessmentMode: formacao` para artigos novos e `assessmentMode: fortalecimento` para publicados.
- Principal publicada exibida como protegida; conflitos viram oportunidades de fortalecimento, não troca de identidade.
- Ações estruturais antigas permanecem bloqueadas no domínio, inclusive remoção da principal.
- Recomendações de atualização e artigo complementar são registradas como decisão humana sem criar artigo automaticamente.
- Textos corrompidos da UI corrigidos e cobertos por teste de fonte UTF-8.
- **Pendente:** validação manual autenticada dos dois modos e confirmação visual de reload/persistência.

## Entregue nesta etapa — contexto URL/arquitetura/KGR (2026-07-21)

- Contratos aditivos e retrocompatíveis para relação keyword↔URL, situação arquitetural e identidade KGR.
- Três modos SERP resolvidos pelo contexto recebido, com `arquitetura_publicado` para publicado ainda não consolidado.
- Proteção independente de URL/slug/canonical/marca, principal confirmada e vínculo KGR confirmado.
- Confirmação arquitetural cria sucessora real do ArticleDNA e preserva a identidade publicada.
- Radar recebe os campos sem alteração de UI/workflow.
- **Verificado:** `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram.
- **Pendente:** validação manual autenticada de candidato publicado, confirmação, KGR confirmado/candidato, reload, troca de marca e envio ao Radar; nenhuma chamada real foi executada.

## Entregue nesta etapa — ArticleDNA estratégico (2026-07-21)

- SDD: `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md`; decisão registrada em `docs/00-produto/decisoes/ADR-013-article-dna-contexto-estrategico.md`.
- ArticleDNA agora entrega estratégias determinísticas de intenção, KGR, volume, hierarquia, propósito e contribuição individual, sem duplicar a origem KeywordDNA.
- `ArticleControlContext` é a projeção compartilhada e retrocompatível; o Radar recebe apenas um campo opcional, sem alteração de UI/workflow.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, TypeScript, lint focado e `npm run build`.
- **Pendente:** validação manual autenticada, provider/SERP reais e confirmação do schema remoto/RLS.

## Entregue nesta etapa — perfis de unidades KGR/não KGR e SERP (2026-07-22)

- Classificação aditiva de artigo, serviço, landing, categoria e outro, com evidências e confirmação humana.
- Propósito editorial com objetivo, necessidade de busca, conversão e indexação.
- Estratégia SERP combinando ciclo editorial, competição e perfil da unidade sem enumeração única.
- KGR confirmado em `kgr_light`, não KGR explícito em `competitive`, ausência/candidato/conflito em `unknown`.
- Proteção de publicados, histórico de assessments e sucessor versionado para decisões humanas.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript.
- **Pendente:** `test:operational`, build, validação manual autenticada, providers reais e schema remoto/RLS.

## Entregue nesta etapa — criador manual de SiloDNA/SiloPage (2026-07-21)

> Registro histórico supersedido pela criação manual de silo simplificada em 2026-08-24.

- Modal não solicita mais `Nicho`; exige nome e keyword/entidade central.
- Criação somente de SiloDNA funciona mesmo sem artigos e não inventa KeywordDNA.
- Criação opcional de SiloPage preserva slug, situação, URL publicada e verificação inicial em contratos separados.
- `published` exige URL no domínio da marca ativa, mas inicia como `not_checked`; URL, slug e canonical não são sobrescritos automaticamente.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build.
- **Pendente:** roteiro manual autenticado, conferência online explícita e confirmação do schema remoto/RLS.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/arquiteto; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Acesso autenticado a listas_kgr — 2026-07-24

- Causa compartilhada diagnosticada: o cliente browser não propagava corretamente o token Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção local: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também restringe keywords por `brand_id` antes de aceitar keywords sem `lista_id`.
- O log de falha de `listas_kgr` preserva código, tabela, operação, status e mensagem, sem expor tokens.
- Sem alteração de RLS, grants, migration, keywords, `lista_id`, `brand_id`, owner ou memberships.
- Pendente: smoke test manual autenticado e confirmação online; nenhum SQL remoto foi executado nesta correção.

## Ciclo JWT NextAuth → Supabase — concluído localmente — 2026-07-24

- Implementado refresh server-side do JWT Supabase com margem de 60 segundos e lock por refresh token.
- Cliente compartilhado usa callback `accessToken` dinâmico; SELECT do ecossistema possui no máximo um retry após JWT expirado.
- Google OAuth foi separado do JWT Supabase; erros registram somente código, tabela, operação, status e `tokenExpired`.
- Pendente: reiniciar o servidor, sair/entrar novamente e executar smoke test manual autenticado no Arquiteto. Migrations 0005/0006 não devem ser reexecutadas.

## Diagnóstico final da sessão NextAuth → Supabase — concluído localmente — 2026-07-24

- Concluído: Arquiteto e Minerador compartilham resultado estruturado e diagnóstico seguro da sessão Supabase.
- Concluído: erro de sessão expirada é reservado para `SUPABASE_TOKEN_EXPIRED`; falha de refresh possui mensagem própria.
- Pendente: login Google real e confirmação da configuração remota do provider; nenhuma operação remota foi executada.

## Fechamento da sessão incompleta Google → Supabase Auth — concluído localmente — 2026-07-24

- Concluído: o Arquiteto não é alcançado com `supabaseAuth.status = error`; o callback falho retorna reason seguro e exige novo login.
- Concluído: Credentials continua validando access/refresh token real do Supabase.
- Pendente: smoke test Google real e confirmação da configuração remota do provider.

## Entregue nesta etapa — refinamento visual do Arquiteto (2026-07-27)

- Barra superior agrupada por função sem remover ações; tabela e expansão preservam a densidade operacional, mas elevam hierarquia, legibilidade e foco.
- Política da principal, intenção, KGR, aprovação, publicação, ArticleDNA, SERP e recomendações receberam agrupamento visual mais claro; URL publicada continua clicável e protegida.
- `WorkflowStatusBadge` e `HistoryControls` receberam apenas opções aditivas de densidade; consumidores existentes preservam o estilo compacto.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, `npm run build` com 47 páginas e `git diff --check`.
- **Pendente:** validação manual real no navegador autenticado em dark/light, 360/768/1024/1366/1440px e estados de interação. Lint integral da página continua com dívida legada.

## Entregue nesta etapa — correção da regressão visual e densidade operacional (2026-07-27)

- Corrigidos somente os trechos visuais responsáveis pela regressão: topo alto, badges grandes nas linhas, tabela sem scroll horizontal interno, célula da keyword sobrecarregada, recuperação pesada e rodapé com ações pequenas.
- A tela retorna a um cockpit compacto em 100%: topo de 48px, controles compactos, tabela com min-width reduzido e scroll horizontal interno, keyword em duas linhas e rodapé com ações legíveis.
- Scrollbar discreta foi aplicada somente aos containers do Arquiteto; nenhum estilo global ou módulo vizinho foi alterado.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, `npm run build` com 47 páginas e `git diff --check`.
- **Pendente:** validação visual manual autenticada em 1366×768, 1440×900 e 1920×1080, zoom 100%, light/dark, responsividade e estados interativos. ESLint mantém dívida legada da página consolidada.

## Entregue nesta etapa - seleção livre, intervalos e arraste (2026-07-29)

- Controlador local aditivo em `lib/arquiteto/article-selection.ts`: clique comum, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, cabeçalho visível e arraste idempotente.
- A ordem do intervalo vem de `groupedArticles` após busca, filtros, ordenação e agrupamento; cabeçalhos de silo e itens ocultos não entram. Seleção oculta permanece no conjunto e o contador informa total/visíveis.
- A âncora é reiniciada com segurança ao trocar `brandId`, remover artigo ou limpar seleção. Nenhuma seleção é persistida remotamente e nenhuma ação editorial é executada pelo gesto.
- **Verificado:** `tests/arquiteto-selection.test.mts` 8/8, `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, lint dos arquivos novos, build e `git diff --check`.
- **Pendente:** roteiro manual no navegador autenticado em zoom 100%, incluindo arraste para marcar/desmarcar, pointercancel, foco/Space, estado mixed, filtros/ordenação, contador total/visível e isolamento ao trocar de marca. O arraste não é declarado validado sem esse teste.

## Correção do arraste que selecionava texto (2026-07-29)

- Removida a dependência de `pointerenter` entre checkboxes. O gesto captura o ponteiro no checkbox inicial e resolve a linha atravessada por coordenadas e `getBoundingClientRect()` das linhas visíveis.
- Ao ultrapassar 5px, o controlador impede seleção nativa de texto, aplica a ação aos IDs intermediários, evita a duplicação do clique final e restaura `user-select`/captura ao encerrar.
- **Verificado:** teste direcionado atualizado para 8/8, TypeScript e lint dos arquivos novos. Build, suítes completas e validação manual no Chrome permanecem no roteiro final desta correção.

## Pintura imediata por snapshot (2026-07-30)

- Implementada `applySelectionPaint({ initialSelectedIds, visibleIds, anchorId, currentId, mode })`, sem conjunto de IDs visitados.
- O `pointermove` localiza a checkbox sob o ponteiro por `elementFromPoint` e recalcula a seleção inteira do gesto imediatamente; voltar desfaz visualmente as linhas que saíram do intervalo.
- Clique, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, cabeçalho, foco, teclado, dark mode e ações em lote permanecem fora da alteração.
- **Verificado parcialmente:** Chrome autenticado validado com caminho de mouse para avanço, retorno, modo desmarcar e ausência de seleção nativa de texto. **Pendente:** repetir com touchpad físico, além de clique sem movimento e preservação de seleção filtrada.
## Entregue nesta etapa — métricas Ads e KGR opcional (2026-08-03)

- SDD: `docs/04-arquiteto/propostas/metricas-google-ads-kgr-opcional.md`.
- Extensão aditiva do contrato do Arquiteto para consumir somente o envelope normalizado do Minerador, preservando proveniência e decisões humanas.
- KGR/allintitle opcionais; ausência não vira zero nem bloqueia agrupamento, formação ou aprovação.
- Volume deixou de ser critério exclusivo de seleção da principal; CPC e competição Ads não são dificuldade orgânica.
- **Verificado:** teste específico, `test:arquiteto` 89/89, `test:operational` 49/49 e TypeScript.
- **Pendente:** smoke autenticado com dados Ads persistidos pelo Minerador; sem alteração do Minerador, migration ou chamada remota nesta etapa.

## Entregue nesta etapa — reconciliação do KeywordDNA enriquecido (2026-08-24)

- [x] Corrigir a divergência de envelopes: `volume_measurement` atual tem precedência e `google_ads_measurement` é aceito somente como compatibilidade legada.
- [x] Preservar null como indisponível, zero como medição válida e transportar os campos ricos já existentes sem usá-los para substituir decisões humanas ou validar SERP.
- [x] Hidratar `demandEvidence` no read-model do bootstrap canônico sem alterar layout, persistência, provider ou módulos vizinhos.
- [x] Cobrir precedência, aliases do contrato Google Ads, evidência temporal e preservação da proveniência em testes direcionados.
- [ ] Validar manualmente no workspace autenticado uma keyword enriquecida pelo Minerador e confirmar readback remoto; nenhuma operação remota foi executada pelo agente.
- [x] Migrar o primeiro consumidor: ArticleDNA, SiloDNA e SiloPage usam o runtime canônico server-side e `editorial_artifact_versions` append-only.
- [x] Cobrir Brand explícita, actor Supabase SSR, `PERSISTED`/`UNCHANGED`, no overwrite e referência canônica de SiloDNA para SiloPage.
- [x] Preservar recuperação local como compatibilidade sem apresentá-la como persistência canônica.
- [ ] Executar smoke remoto autenticado do Arquiteto e confirmar leitura/persistência no schema já aplicado; nenhum SQL, migration, provider ou deploy foi executado nesta etapa.

## Fechamento do contrato de retorno canônico — 2026-08-11

- [x] Corrigir o retorno `UNCHANGED` para validar a linha canônica completa, preservando o comportamento idempotente sem criar versão duplicada.
- [x] Alinhar o contrato HTTP da rota (`persistence`) com o parser client-side e cobrir `PERSISTED`, `UNCHANGED`, campo ausente e `artifact_type` incompatível.
- [x] Registrar diagnóstico estrutural sanitizado para divergência de forma sem expor payload ou identificadores sensíveis.
- [ ] Separar/fechar a composição `MIXED` da tela e executar smoke autenticado de readback remoto; não confundir teste local com prova do schema remoto.

## Fresh-origin readback — 2026-08-12

- [x] Diagnosticar por linha o GET canônico: `article_dna`, versão 1, payload objeto e falha em `createdAt` por formato de timestamp remoto incompatível com o parser estrito.
- [x] Normalizar timestamps de banco no mapper e preservar erro explícito para timestamp realmente inválido.
- [x] Confirmar no readback as invariantes de Brand e entidade e reproduzir reload autenticado em `s-smoke` sem a mensagem de artifact inválido.
- [x] Corrigir a hidratação visual da lista editorial quando a origem fresh não possui o bootstrap legado; não criar ArticleDNA, não usar recovery como prova e não chamar IA/SERP.

## Bootstrap canônico em fresh origin — 2026-08-11

- [x] Auditar a precedência real: `masterList`/`fetchMasterList` legado criava as linhas; o GET canônico preenchia somente mapas de versões.
- [x] Adicionar adapter/read-model local para materializar ArticleDNA remoto válido sem `localStorage`/IndexedDB, preservando `CANONICAL_REMOTE`, `LEGACY_REMOTE` e `LOCAL_RECOVERY`.
- [x] Fazer o remoto prevalecer sobre cópia equivalente por IDs/entidade e preservar recovery local-only sem duplicação ou fallback por nome/slug.
- [x] Diferenciar `NO_DATA`, `QUERY_FAILURE`, `SCHEMA_MISSING`, `NOT_AUTHORIZED` e `INVALID_ARTIFACT`; falha canônica não vira empty state.
- [x] Cobrir fresh origin, fonte, Brand, lacuna contratual, precedência, recovery-only, não duplicação e erro sanitizado.
- [x] Repetir o smoke visual autenticado após a correção do ciclo de bootstrap; a falha legada não bloqueou a exibição canônica e não foi confundida com falha do adapter.
- [ ] Implementar posteriormente o handoff Minerador → Arquiteto; esta etapa não altera produtor, IA, SERP, schema, migration ou storage.

## Handoff canonico Minerador -> Arquiteto - implementado localmente - 2026-08-11

- [x] Criar read model remoto do workspace por `editorial_workflow_items` + keywords referenciadas + artefatos relacionados.
- [x] Migrar o comando de importacao para POST protegido e idempotente, com confirmacao `PERSISTED`/`UNCHANGED`.
- [x] Preservar ArticleDNA como overlay; keywords sem ArticleDNA aparecem como nao agrupadas.
- [x] Manter recovery local e rota legacy sem promove-los a fonte operacional.
- [ ] Executar smoke remoto com a mesma Brand em dois navegadores/sessoes, incluindo reload e repeticao da importacao. O agente nao executou operacao remota.

## Divergencia do marcador de importacao - 2026-08-12

- [x] Identificar que o bloqueio `Ja importado no Arquiteto` pode usar `architectImportedKeywordIds` persistido localmente, sem consultar o workflow canônico.
- [x] Preparar diagnostico remoto somente leitura para correlacionar keyword, workflow e metadados de ArticleDNA sem expor conteudo editorial.
- [ ] Executar manualmente o diagnostico por Brand e decidir separadamente qualquer repair/backfill idempotente. Nenhuma limpeza local ou alteracao remota esta autorizada neste gate.

## Histórico arquivado — rebase canônico do patrimônio Minerador → Arquiteto — 2026-08-12

O runtime de rebaseline foi abandonado na Fase 1. Os itens abaixo preservam a
decisão histórica e não autorizam preflight, writer, backfill ou operação
remota.

- [x] Remover marcador local e `historical_import_protected` como autoridade permanente da elegibilidade do novo fluxo.
- [x] Permitir entrada de keyword publicada preservando integralmente o status e as proteções editoriais.
- [x] Preparar bootstrap server-side idempotente e preflight sanitizado por Brand, sem migration e sem criação de ArticleDNA.
- [x] Preparar inventário read-only do downstream, classificando patrimônio Minerador como `PRESERVAR` e PublicationRecord como `INVESTIGAR` obrigatório.
- [ ] Executar manualmente o preflight da Adalba; revisar `INVESTIGATE_REMOTE_WORKFLOW = 0`, as contagens e as amostras sanitizadas antes de autorizar o POST de bootstrap.
- [ ] Após aprovação humana, executar uma única vez o bootstrap autenticado, repetir o preflight e realizar o smoke manual de keywords antigas aprovadas, previamente importadas e publicadas em dois navegadores, seguido de F5 e logout/login.
- [ ] Usar o inventário remoto para propor, em tarefa separada, o reset seletivo de Arquiteto → Publicações. Não há DELETE, TRUNCATE ou CASCADE autorizado nesta fase.

## Inventário/reset downstream da Adalba — 2026-08-12

- [x] Preparar inventário remoto sanitizado, com uma única saída, para a Brand Adalba e para a fronteira Arquiteto → Publicações.
- [x] Preparar SQL de reset apenas como proposta transacional bloqueada por manifesto e por proteção de publicado/URL/canonical.
- [ ] Executar manualmente o inventário read-only e revisar cada classificação `PRESERVAR`, `RESETAR_CANDIDATE` e `INVESTIGAR`; nenhuma contagem local prova o estado remoto.
- [ ] Decidir separadamente se existe autorização estrutural para qualquer objeto append-only. As triggers de 0027/0028 impedem apagar ou alterar artifacts, versões de documento, snapshots e reviews; 0031 continua congelada.
- [ ] Somente depois de snapshot, manifesto com IDs aprovados e autorização humana específica, revisar o reset parcial possível. Dados do Minerador e publicações reais permanecem fora do escopo.

## Nova época canônica por reset de desenvolvimento — 2026-08-12

- [x] Preparar reset transacional local de dados de homologação, com preflight, contagens before/after, proteção do único Admin e restauração obrigatória das triggers append-only.
- [x] Preparar verifier read-only para dados zerados, estrutura/RLS/funções preservadas, triggers reativadas e Admin autenticável.
- [x] Incluir `tenant_0016_agency_role_rollback` e gate de catálogo para todas as FKs de entrada do manifesto, com ordem topológica e falha agregada para dependências não classificadas.
- [ ] Executar manualmente somente o dry-run v6; confirmar manifesto com 60 entradas, gates de FK/dependência/ordem/self-FK/mutação de triggers/proteções/Admin aprovados, `VERDICT_FINAL = PASS` e zero `FAIL`; não repetir o reset real enquanto qualquer gate falhar.
- [x] Abandonar a implementação com TEMP TABLEs: reescrever o dry-run em CTEs/`VALUES` read-only e o reset real com arrays/records/variáveis locais, sem `pg_temp` ou objetos auxiliares persistentes.
- [ ] Executar backup final, confirmar manualmente o projeto de desenvolvimento, revisar a contagem de usuários Auth não-Admin e autorizar a confirmação literal do script.
- [ ] Executar reset e verifier manualmente; remover usuários Auth de teste apenas pelo Dashboard, preservando o Admin.
- [ ] Executar reconstrução manual após reset: recriar listas/grupos, importar cada CSV para o destino selecionado e rodar novamente a confirmação Site/Sitemap para as keywords `publicado`, sem restaurar `brand_id`, IDs técnicos ou marcadores legados de Arquiteto; depois executar o smoke completo do pipeline antes de remover recovery/fallbacks legados.

## Limpeza estrutural sucessora 0032 — 2026-08-12

- [x] Registrar em SDD a remoção pós-reset dos objetos mortos exclusivos de 0016/0030, preservando a função append-only compartilhada e os contratos editoriais canônicos.
- [x] Preparar `supabase/migrations/0032_structural_legacy_cleanup.sql` com ordem explícita, sem `CASCADE`, sem editar migrations históricas e sem reutilizar 0031.
- [x] Preparar preflight e post-verifier read-only específicos, incluindo fingerprint pré-aplicação das estruturas não-alvo.
- [x] Preparar rollback local/documental que recria somente estruturas vazias e exige nova decisão humana.
- [x] Executar manualmente o preflight 0032 e revisar o fingerprint e os gates antes da aplicação.
- [x] Aplicar manualmente 0032 após autorização específica e executar o post-verifier; o fingerprint pré-aplicação não foi capturado.

## Fechamento remoto da 0032 — 2026-08-12

- [x] Registrar a aplicação remota da migration 0032 conforme relato do usuário.
- [x] Confirmar remoção do helper, três tabelas alvo e trigger exclusiva.
- [x] Confirmar 12/12 estruturas preservadas, função append-only compartilhada e quatro triggers editoriais canônicas.
- [x] Classificar `TARGET_REMOVAL = PASS`, `PRESERVED_OBJECT_CHECKS = PASS` e `SHARED_APPEND_ONLY = PASS`.
- [x] Registrar `PRE_APPLY_FINGERPRINT = NOT_CAPTURED`; não usar o hash pós-aplicação como baseline retroativo.
- [x] Corrigir o post-verifier v2 para retornar `EVIDENCE_GAP` no placeholder e não produzir falso FAIL estrutural.
- [x] Preparar o post-verifier v3 sem referências executáveis às relações/função removidas; ausência é verificada somente por catálogo.
- [ ] Executar, se necessário, somente o post-verifier v3 read-only e arquivar seu resultado; nenhuma reaplicação ou correção de schema é necessária para esta lacuna.

## Entregue nesta etapa — criação manual de silo simplificada (2026-08-24)

- [x] Reduzir o modal a `NOME DO SILO` e `SLUG`, mantendo placeholders legíveis e validação de slug existente.
- [x] Remover keyword/entidade central, criação manual de SiloPage, situação de publicação e URL publicada do fluxo básico.
- [x] Persistir somente o registro operacional vazio e o slug normalizado; não criar KeywordDNA, entidade sintética, SiloDNA ou SiloPage.
- [x] Preservar formação posterior de SiloDNA/SiloPage e o contrato estratégico que exige entidade central quando essa etapa for executada.
- [x] Cobrir no teste direcionado a ausência dos campos removidos, a obrigatoriedade de nome/slug e a ausência de criação artificial de artefatos.
- [ ] Validar manualmente no Chrome criação, cancelamento, reload, readback remoto e isolamento entre marcas.

## Bloqueado — criação pareada de SiloDNA/SiloPage (2026-08-24)

- [ ] Aprovar extensão contratual para representar `SiloDNA` `draft`/`em_formacao` sem entidade artificial.
- [ ] Aprovar esqueleto inicial de `SiloPage` `Novo` sem conteúdo/canonical/URL inventados.
- [ ] Implementar persistência canônica pareada com readback dos dois artefatos e falha sem sucesso parcial.
- [ ] Ajustar normalização para aceitar `manicure` e `/manicure`, com formato canônico `/manicure`.
- [ ] Executar testes de relação, Brand, reload, falha de persistência, lint, TypeScript/build e Chrome.
- **Bloqueio:** `SiloDNASchema`/`SiloPageSchema` atuais não representam esse estado. Ver SDD `docs/04-arquiteto/propostas/2026-08-24-silo-draft-pareado-silopage-novo.md`.

## Providers globais — DataForSEO SERP compartilhada (corrigido em 2026-08-25)

- [x] Auditar o contrato global efetivo de DataForSEO e identificar que
  `allintitle` não é uma operação SERP geral.
- [x] Corrigir o resolvedor server-side para reutilizar a Connection global
  DataForSEO sem criar recurso específico do Arquiteto nem bloquear a coleta
  por uma capability específica de SERP do Arquiteto.
- [x] Conectar `Validar SERP` ao executor compartilhado, normalizador de
  fixtures e ledger `integration_usage_events`, com falha fechada e sem
  alteração parcial do estado.
- [x] Adaptar `Revisar com IA` ao resolver DeepSeek global, JSON mode, thinking
  da Connection, limite explícito de tokens e erro sanitizado.
- [x] Cobrir a fronteira com fixtures/testes sem chamadas reais.
- [ ] Executar smoke autenticado real de `Validar SERP`, registrar o readback
  sanitizado e liberar a homologação operacional. Não há migration,
  capability, grant, binding ou quota específica de SERP para configurar neste
  consumidor.

## Entregue nesta etapa — experiência funcional sem infraestrutura (2026-08-24)

- [x] Remover do preview SERP as referências visíveis a DataForSEO, créditos,
  retries e consulta técnica; manter `Validar SERP` como ação funcional.
- [x] Remover do botão IA a referência a provider/Connection e manter somente
  `Revisar com IA`.
- [x] Traduzir falhas de SERP e IA para mensagens funcionais sem apagar o
  detalhe técnico mantido nas rotas internas.
- [x] Preservar controles manuais, contratos, ações em lote e layout da
  planilha.
- [ ] Validar manualmente no Chrome os estados de sucesso, indisponibilidade,
  fechamento do modal e continuidade da edição manual; nenhum provider real
  foi chamado nesta etapa.

## Entregue nesta etapa — seleção individual e silos canônicos (2026-08-25)

- [x] Restaurar a projeção de keywords sem `clusterId` como linhas individuais,
  sem compartilhar selection ID entre artigos.
- [x] Preservar clique simples, Ctrl/Cmd, Shift, pintura por arraste, seleção
  de cabeçalho, indeterminate, filtros e seleção oculta.
- [x] Separar semanticamente os checkboxes de artigo, grupo de silo e Página
  do Silo, com atributos `data-*` e acessibilidade explícita.
- [x] Manter `Sem Silo` como `siloId = null`, sem entidade, slug ou artefato
  canônico artificial.
- [x] Reidratar opções pelo par SiloDNA/SiloPage persistido, com etiqueta
  canônica de breadcrumb/H1/slug quando o nome legado estiver ausente.
- [x] Cobrir seleção, identidade, readback de silo e isolamento por membro em
  testes com fixtures, sem chamadas externas.
- [ ] Validar manualmente no Chrome autenticado: clique A/B/C, cabeçalho do
  silo, pintura, troca individual para silo real, F5 e isolamento entre Brands.

## Correção de seleção e revisão DeepSeek — 2026-08-25

- [x] Trocar a identidade de seleção derivada de `clusterId`/keywords por
  `workingArticleId`, `articleId` ou ID persistente do workflow, preservando o
  campo na cópia de trabalho sem migration.
- [x] Separar handlers `row` e `group`, interromper propagação do checkbox da
  linha e manter o cabeçalho de silo independente.
- [x] Reconhecer pintura somente após 6px, capturar o ponteiro depois do
  threshold, bloquear texto nativo somente no modo pintura e encerrar também
  em `pointercancel`/`blur`.
- [x] Recalcular a faixa imediatamente ao mudar de linha, preservando o
  snapshot inicial e evitando `setState` para a mesma linha ou o mesmo Set.
- [x] Adaptar `Revisar com IA` ao override por chamada `thinking: disabled`,
  reduzir o orçamento de saída e manter o diagnóstico sanitizado de
  `finishReason`, content, JSON e Zod.
- [x] Manter a resposta da IA como proposta pendente; aplicação na cópia de
  trabalho exige ação humana explícita.
- [x] Cobrir identidade, F5/readback do ID, cliques, intervalos, pintura,
  silos, propagação, diagnóstico e proposta com fixtures locais.
- [ ] Validar manualmente no Chrome autenticado com mouse e touchpad,
  incluindo clique A/C, retorno no arraste, header indeterminate, troca de
  silo, F5 e execução da revisão após SERP válida.
- [ ] Registrar os valores reais do diagnóstico do endpoint em uma execução
  autenticada; nenhum log/provider real foi acessado pelo agente nesta etapa.

## Histórico — Consolidação canônica A1–A20 — 2026-08-25

### Lotes locais

- [x] Consolidar documentalmente Artigos, Silos e Links Internos.
- [x] Auditar contratos ArticleDNA, SiloDNA, SiloPage, ContentPlan e links
  operacionais.
- [x] Auditar workspace, routes, repositories, adapters, migrations locais,
  testes e UI em modo somente leitura.
- [x] Registrar divergências entre docs históricos e implementação vigente.
- [x] Registrar que a seleção é efêmera e não persiste arquitetura.
- [~] Fechar working copy/proveniência completa de todos os campos do
  KeywordDNA.
- [~] Separar estados de lógica, SERP, IA e revisão até o nível necessário.
- [~] Formalizar candidata a Silo sem promoção automática.
- [~] Reforçar gate local de exatamente um Pilar antes de Silo formado.
- [~] Fechar verticalidade e validator local de slug, preservando publicados.
- [~] Confirmar manualmente SERP/IA/readback/Chrome quando houver gate e
  autorização específicos.

### Bloqueador estrutural

- [ ] Levar ao Planner Geral o
  InternalLinkGraph: contrato canônico, nós, arestas, relações, anchor
  concepts, versionamento, tenant/RLS, readback e handoffs.
- [ ] Não implementar React Flow antes do contrato e persistência do grafo.
- [ ] Não implementar MCP nesta fila.
- [ ] Não promover SiloDNA.linkMap, ArticleDNA.internalLinks ou
  InternalLinkAssignment a grafo por conveniência.
- [ ] Decidir em fila própria se a atomicidade do pair SiloDNA/SiloPage exige
  boundary transacional/RPC.
- [ ] Definir em fila própria o Brand Context Pack e o gabarito de docs/skills
  com Marca/Planner Geral.

### Links Internos — dependentes do pedido estrutural

- [ ] Modelo canônico do grafo.
- [ ] Inbound/outbound e relações direcionadas.
- [ ] Anchor concepts e candidatos por aresta.
- [ ] Proposta IA, revisão e aprovação humana.
- [ ] Handoff ao Planejador.
- [ ] Handoff ao Redator.
- [ ] Validação de URL/integridade em Publicações.
- [ ] React Flow como projeção.

### Ordem recomendada

1. [ ] Fase 0 — baseline e regressões.
2. [ ] Fase 1 — working copy/proveniência de Artigos.
3. [ ] Fase 2 — lógica e candidata a Silo.
4. [ ] Fase 3 — SERP como evidência.
5. [ ] Fase 4 — IA como proposta.
6. [ ] Fase 5 — ArticleDNA e readback.
7. [ ] Fase 6 — working architecture de Silos.
8. [ ] Fase 7 — lógica/SERP/IA de Silos.
9. [ ] Fase 8 — consolidação de Silos.
10. [ ] Fase 9 — InternalLinkGraph após aprovação estrutural.
11. [ ] Fase 10 — React Flow.
12. [ ] Fase 11 — handoffs.

O plano, a auditoria e o pedido estrutural estão preservados em
`docs/_arquivo/2026-08-documentacao-legada/`; o contrato vigente está em
`docs/04-arquiteto/links-internos-estado-e-contrato.md`.



## Correção localizada de latência da seleção — 2026-08-25

- [x] Auditar o caminho de `selectedArticleIds` e confirmar que o toggle é
  estado efêmero, sem efeito de persistência, fetch, readback ou refresh.
- [x] Memoizar linha, célula de seleção e subárvores pesadas; props de seleção
  carregam apenas o booleano da linha afetada.
- [x] Manter dados derivados, agrupamento e ordenação independentes do `Set`
  de seleção; preservar contadores, indeterminate, grupos e filtros.
- [x] Preservar clique simples, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift e pintura
  imediata com comparação semântica do resultado.
- [x] Adicionar regressão estática da fronteira de renderização e ausência de
  persistência no handler do clique; teste focado atual `15/15`.
- [ ] Coletar no Chrome autenticado os tempos A/B/C/D com `performance.now()`
  e comparar antes/depois; esta sessão não disponibilizou backend Chrome.
- [ ] Validar manualmente com mouse e touchpad e registrar a quantidade de
  linhas/células que efetivamente rerenderizam.

### Verificação final registrada

- [x] Suite focada da correção: `24/24`.
- [x] Suite oficial `test:arquiteto`: `120/121`; o único erro permanece no
  teste estático legado que inspeciona a marcação do botão do Minerador.
- [x] Typecheck sem erros novos do Arquiteto; quatro erros preexistentes fora
  do escopo continuam documentados no estado atual.

## Lote 1 — proveniência KeywordDNA → ArticleDNA — 2026-08-25

- [x] Preservar o registro bruto do KeywordDNA dentro da working copy, com
  snapshot e referência individual.
- [x] Preservar identidade, métricas, KGR, publicação, decisão humana,
  histórico e refs sem converter `null` em zero ou inventar campos ausentes.
- [x] Reprojetar snapshot/ref no bootstrap e preservar versão/hash explícitos
  no handoff Minerador → Arquiteto.
- [x] Cobrir import, F5/readback local, ArticleDNA individual, brand isolation,
  KGR, publicação, decisão humana, demanda, competição e proveniência.
- [x] Registrar a suíte focada `19/19`, a evidência complementar `21/21` e
  `test:arquiteto` `122/123` com uma falha estática legada do Minerador.
- [ ] Confirmar readback remoto/autenticado e provider real em fila autorizada.
- [ ] Resolver no Planner Geral a ausência de artifact/repository versionado
  de KeywordDNA quando a origem não fornece versão/hash canônicos.

### Próximo lote

- [x] Lote 2 — baseline operacional da working copy, sem alterar regras de
  agrupamento, SERP, IA ou providers.

## Lote 2 — baseline operacional da working copy — 2026-08-25

- [x] Medir temporariamente o intervalo click → setState → commit visual com
  `architect.selection.click-to-commit` em ambiente de desenvolvimento.
- [x] Corrigir a causa visual da seleção: remover `preventDefault()` do clique
  normal, preservando o bloqueio nativo somente após pintura por arraste.
- [x] Preservar clique individual, Ctrl/Cmd, Shift, Ctrl/Cmd+Shift, pintura,
  grupos, indeterminate, filtros e seleção oculta.
- [x] Provar por regressão que a seleção não chama persistência, fetch,
  readback, SERP, IA, rebuild de DNA ou recovery.
- [x] Remover o modal intermediário de `Validar SERP` e iniciar o processo
  diretamente, mantendo status inline na planilha.
- [x] Validar no Chrome dez ciclos mouse, Shift, Ctrl/Cmd, pintura/arraste e
  larguras responsivas `360/768/1024/1440`.
- [~] Validar hardware de touchpad separadamente; o gesto contínuo de ponteiro
  foi validado, mas não houve touchpad físico disponível nesta sessão.
- [~] Concluir provider real, persistência remota e readback SERP; a ação
  manual permaneceu em `SERP processando` e não autoriza declarar homologação.
- [x] Registrar `20/20` nos testes focados, `122/123` em `test:arquiteto` com
  uma falha estática legada do Minerador e `git diff --check` aprovado.

### Próximo lote

- [x] O pacote operacional do Lote 3 foi recebido e implementado na seção
  seguinte.
- [x] O pacote operacional do Lote 4 foi recebido e implementado após a seção
  do Lote 3.

## Lote 3 — lógica canônica de artigos e candidata a Silo — 2026-08-25

- [x] Priorizar volume/demanda, resultados/competitividade, intenção,
  entidade/coerência, KGR, sinais comerciais secundários e demais evidências.
- [x] Não criar candidata com volume alto isolado; bloquear termo específico
  que só tenha volume como argumento.
- [x] Marcar oportunidade KGR somente com volume `>= 120` e resultados menores
  que o volume; preservar KGR como evidência, não aprovação ou Pilar.
- [x] Produzir razões determinísticas de agrupamento e manter grupos como
  hipótese provisória da pergunta “devem competir na mesma página?”.
- [x] Reservar candidatas a Silo fora dos grupos de artigo e sem criar
  ArticleDNA, SiloDNA ou SiloPage.
- [x] Preservar cada keyword, ref individual, `null`, zero real e decisão
  humana; ausência de métrica não descarta a keyword.
- [x] Expor na working copy os controles `Usar em artigo`, `Remover marcação`
  e `Reservar como candidata`, com decisão humana protegida contra reprocesso.
- [x] Preservar a marcação no payload da working copy, readback canônico e
  recovery local sem migration, schema SQL, RLS, RPC ou provider.
- [x] Teste específico: `9/9`; `test:arquiteto`: `122/123` com falha estática
  legada do Minerador.
- [~] Executar manualmente `Processar lógica` no workspace autenticado e
  confirmar readback remoto da candidata; requer ação explícita do usuário
  porque grava a working copy remota.

### Próximo lote

- [x] O pacote operacional do Lote 4 foi recebido e implementado na seção
  seguinte.
- [ ] Lote 5 — IA e revisão — aguarda pacote operacional próprio, evidência da
  hipótese e autorização do fluxo de revisão humana.

## Lote 4 — SERP de formação dos artigos — 2026-08-25

- [x] Produzir evidência observacional por keyword e versão, sem mover,
  dividir, juntar, trocar principal ou consolidar ArticleDNA.
- [x] Persistir compatibilidade, sobreposição por URLs/domínios, intenção
  observada, tipo de página, competição, conflito, canibalização provável,
  separação/junção, principal possivelmente inadequada e insuficiência.
- [x] Vincular evidências por IDs estáveis e preservar os snapshots integrais
  do KeywordDNA, sem reconstruir por texto.
- [x] Tratar ausência de resultados como insuficiência e não como conflito.
- [x] Acrescentar assessment separado para candidata a Silo, com evidência de
  hub/amplitude/múltiplas necessidades, sem criar SiloDNA, SiloPage ou artigo.
- [x] Manter `Validar SERP` direto e resultados inline na planilha.
- [x] Preservar assessment/snapshot anterior quando uma nova consulta falha e
  validar o readback local por hash e IDs.
- [x] Testes focados: `31/31`; `test:arquiteto`: `126/127`, com falha estática
  legada do Minerador.
- [ ] Executar provider real, readback remoto e reload autenticado; dependem de
  autorização explícita e não foram executados neste lote.

### Próximo lote

- [x] O pacote do Lote 5 foi recebido e implementado na seção seguinte.

## Lote 5 — IA de arquitetura dos artigos — 2026-08-25

- [x] Dividir internamente a revisão em diagnóstico de grupos, pertencimento,
  papéis, canibalização e consolidação, mantendo a UI com apenas `Revisar com IA`.
- [x] Enviar KeywordDNA integral como fato, SERP como evidência, working copy
  como hipótese e Brand Context pertinente já existente.
- [x] Limitar Brand Context ao contexto disponível na Marca; não criar
  persistência nova nem inventar campos ausentes.
- [x] Retornar proposta compacta por IDs, com `proposalId`, rastreio A–E,
  `approvalStatus: pending_human` e diff sem repetir KeywordDNA.
- [x] Manter a proposta sem alterar versão consolidada, ArticleDNA, SiloDNA ou
  aprovação automaticamente.
- [x] Marcar aplicação como IA, preservar undo, permitir rejeição parcial e
  aguardar confirmação do salvamento antes do sucesso visual.
- [x] Preservar proteção de publicados e URL, slug, canonical e política.
- [x] Cobrir subtarefas, IDs, contexto, proposta pendente e contrato local.
- [x] `test:arquiteto`: `127/128`; falha única estática legada do Minerador.
- [x] ESLint focado e `git diff --check` aprovados.
- [~] Chrome autenticado, DeepSeek real, persistência/readback remoto e reload
  não verificados; provider real não foi executado.

### Próximo lote

- [x] Lote 6 — pacote recebido e implementado na seção seguinte.

## Lote 6 — consolidação ArticleDNA e publicados — 2026-08-25

- [x] Exigir principal, 1–6 KeywordDNAs, papéis válidos, refs exatas, SERP
  referenciada, conflitos explícitos e revisão humana das decisões IA.
- [x] Criar somente sucessora versionada humana com status `approved` após a
  confirmação; manter versões anteriores imutáveis.
- [x] Proteger `brandId`, URL, slug e canonical publicados; distinguir
  `locked`, `reviewable/revisable` e `unknown` no gate da principal.
- [x] Executar readback canônico pós-persistência por versão, hash, identidade
  e status antes do handoff.
- [x] Repassar ao Radar as refs individuais e contexto já existente, com smoke
  local de versão/hash/ref; não exigir `InternalLinkGraph`.
- [x] Cobrir gate, políticas publicadas, readback e handoff com fixtures sem
  provider real.
- [x] Nenhuma mudança estrutural foi necessária; nenhum pedido foi aberto ao
  Planner Geral.
- [~] Executar confirmação, F5 autenticado, readback remoto e smoke real
  ArticleDNA → Radar no Chrome; depende de sessão/autorização operacional e
  permanece não verificado nesta rodada.

### Próximo lote

- [x] Lote 7 — formar working copy determinística de Silos a partir de
  ArticleDNAs, sem consolidar SiloDNA/SiloPage.
- [x] Considerar equivalência semântica de Silo existente antes de propor novo
  agrupamento; manter candidatos sem arquitetura suficiente visíveis.
- [x] Manter um único Pilar provisório, Suportes explícitos, refs individuais,
  proteção de publicados e separação SiloPage/Pilar.
- [x] Cobrir volume sem promoção isolada, KGR não automático, `null`, refs,
  equivalência, colisão de slug, proteção publicada, escolha humana de Pilar
  e isolamento por Brand.
- [~] Validar manualmente a ação Formar Silos em Chrome e testar reload/
  readback remoto; a ação local desta etapa não substitui a homologação
  autenticada.

### Próximo lote

- [x] Lote 8 — validar e consolidar Silos a partir de ArticleDNAs, com
  reaproveitamento de evidências SERP, revisão IA reversível, decisão humana,
  proteção de publicados e geração independente de SiloDNA/SiloPage.
- [x] Usar a persistência canônica existente com readback após SiloDNA e após
  SiloPage; registrar par parcial sem simular atomicidade.
- [x] Cobrir Pilar único, Suportes, refs ArticleDNA, Brand, conflitos, SERP,
  rejeição parcial da IA, desfazer, publicados e readback.
- [~] Persistência remota autenticada, reload Chrome e provider DeepSeek real
  não verificados nesta rodada; nenhuma chamada paga foi executada.
- [ ] Lote 9 — bloqueado operacionalmente até InternalLinkGraph estrutural
  disponível e autorizado pelo Planner Geral.

## Homologação dos Lotes 1–8 — 2026-08-25

- [x] H1 executado no Chrome: clique individual, Ctrl/Cmd, Shift, pintura,
  seleção oculta e telemetria de latência verificados; touchpad físico permanece
  não verificável neste ambiente.
- [ ] H2 não homologado: F5 preservou keywords, papéis, slugs e ArticleDNA v2,
  mas perdeu os assessments SERP exibidos antes do reload e voltou a `SERP não
  analisada`. Diagnóstico de hidratação/readback pendente; proprietário:
  Arquiteto.
- [ ] H3 não homologado: estado real sem sequência completa pronta para nova
  confirmação humana; não foram disparadas IA nem provider.
- [ ] H4 parcialmente verificado: handoff `marketing online` apareceu no Radar
  com ArticleDNA v2 antes do reload; depois do F5 o Radar exibiu `Marca sem
  dados`, sem readback remoto autenticado comprovado.
- [ ] H5 bloqueado: não havia SiloDNA/SiloPage elegível; todos os artigos
  estavam `Sem silo`.
- [x] Não iniciar InternalLinkGraph; pedido estrutural continua proposto e
  aguardando Planner Geral.
- [x] Registrar sem correção automática, schema, migration, RLS, RPC, provider
  real ou alteração de outro módulo.

## Próxima fila — integridade de F5 e workspace único — 2026-08-26

- [x] Corrigir a corrida de identidade no readback local do Arquiteto:
  assessment SERP, ArticleDNA, SiloDNA e revisão só usam sessão autenticada e
  `brandId`; fallback `anonymous` removido.
- [x] Corrigir o estado transitório do Radar que apresentava `Marca sem dados`
  antes do snapshot canônico chegar.
- [x] Entregar uma página única com tabs contextuais `[ARTIGOS] [SILOS]
  [LINKS INTERNOS]`, sem duplicar GlobalTopbar, busca, undo ou histórico.
- [x] Entregar planilha contextual de Silos com IDs `silo-page:` distintos,
  busca compartilhada, expansão de identidade/proveniência e bloqueio visual
  do InternalLinkGraph.
- [x] Preservar `null` como desconhecido nas projeções de demanda/KGR.
- [x] Executar testes focados, `test:visual-system`, guard visual, TypeScript,
  ESLint direcionado e `git diff --check`, registrando limitações reais.
- [x] Homologar no Chrome o F5 do Arquiteto e do Radar, sem provider real ou
  escrita remota.
- [~] Teste Radar hidratation: fixture legado precisa preencher os campos
  numéricos exigidos pelo contexto estratégico.
- [~] Persistência/readback remoto continua não verificado.
- [ ] Lote 9 — InternalLinkGraph: bloqueado até fundação estrutural do Planner
  Geral.

## Workbench de processos + tabs na GlobalTopbar — 2026-08-26

- [x] Mover `Artigos`, `Silos` e `Links internos` para a `GlobalTopbar`, sem
  duplicar página, busca, histórico ou working copy.
- [x] Transformar `Lógica`, `SERP`, `IA` e `Revisão` em controles com estados
  semânticos e handlers já existentes.
- [x] Manter área contextual recolhível, compacta e limitada, sem ocultar ou
  reconstruir a planilha.
- [x] Remover duplicação das ações de processo no rodapé e preservar somente
  seleção e envio final ao Radar.
- [x] Cobrir composição e não duplicação com teste focado do workbench.
- [~] Validação manual Chrome e confirmação visual de todos os estados ainda
  pendentes nesta rodada.
- [ ] Fila/job/worker para progresso persistente: dependência estrutural,
  fora deste lote; registrar para o Planner Geral se for necessário.
- [ ] Lote 9 — InternalLinkGraph: permanece bloqueado pelo gate estrutural.

## Mapa comparativo de arquitetura — 2026-08-26

- [x] Adicionar uma única projeção comparativa no Workbench expandido,
  preservando a planilha e o limite contextual aproximado de `33vh`.
- [x] Expor cenários `Atual`, `Lógica`, `SERP` e `IA` sem efeitos colaterais;
  SERP permanece observacional e IA permanece proposta não consolidada.
- [x] Mapear Artigos com grupos/KeywordDNA resumidos e Silos com a hierarquia
  SiloPage → Pilar → Suportes, incluindo conflitos e publicados protegidos.
- [x] Comparar mudanças com ganhos/perdas explicáveis pelas dimensões já
  existentes, sem score SEO global ou nova regra editorial.
- [x] Delegar foco e movimentação manual aos handlers canônicos; o canvas não
  é fonte de verdade e não persiste estado próprio. Comparativo, detalhes e
  ações humanas ficam na coluna esquerda; destinos ficam limitados à working
  copy, incluindo Não agrupadas/Novo grupo provisório quando aplicável.
- [x] Manter o mapa enxuto: Artigos exibem keywords e papéis; Silos exibem
  SiloPage/Pilar/Suportes com principais e secundárias resumidas, sem métricas,
  hashes, versões ou proveniência extensa.
- [x] Preservar fotografias de Lógica, SERP e IA em memória para comparação,
  sem recalculá-las após edição humana da working copy.
- [x] Manter Links internos bloqueado; nenhum grafo falso foi criado.
- [x] Integrar `@xyflow/react` `12.11.5` como projeção visual, com nodes
  não arrastáveis/não conectáveis, controles de exploração somente no modo
  expandido e cenários controlados pelo snapshot.
- [~] Validação manual do usuário, F5 manual completo e readback remoto ainda
  pendentes; o Chrome do agente já confirmou o comportamento local básico.
- [ ] Lote 9 — InternalLinkGraph: bloqueado pelo gate estrutural do Planner
  Geral.

## Links Internos funcional / working copy real — 2026-08-27

- [x] Consumir o gate estrutural homologado sem reabrir schema, migration,
  RLS, grants, repositories ou provider.
- [x] Remover o bloqueio visual da aba e manter somente `IA`/`Revisão`, com IA
  desabilitada neste lote.
- [x] Carregar Graph aprovado e working copy pela Brand/Silo atual usando as
  rotas canônicas existentes.
- [x] Projetar `SILO_PAGE` e `ARTICLE_DNA` no React Flow horizontal, com edges
  dirigidas e posição/viewport/seleção fora do domínio.
- [x] Criar, editar e remover edges na working copy; validar self-link,

## Passos 2 e 3 — pendências de homologação — 2026-08-27

- [x] Reusar os fluxos canônicos de criação manual, candidata reservada e
  fortalecimento de Silo sem reconstruir ArticleDNA.
- [x] Manter SiloPage distinta do Pilar e exibir sua identidade/slug no
  read-model existente.
- [x] Exibir identificação derivada de slug/canonical em nodes de Links sem
  colocá-la no contrato do grafo.
- [x] Trocar o preenchimento automático da principal exata por sugestões de
  `anchorConcepts` do contexto editorial do destino.
- [x] Cobrir o helper e regressões de Silo/Graph/Workbench localmente.
- [ ] Homologar no Chrome: criar Silo manual, formar a partir de candidata
  reservada, reutilizar Silo publicado e confirmar estados de slug/canonical.
- [ ] Homologar no Chrome/F5: criar, salvar, editar e aprovar um Graph;
  conferir outbound/inbound, sugestões de âncora e mapa horizontal.
- [ ] Executar readback remoto autorizado para os objetos SiloDNA, SiloPage e
  InternalLinkGraph antes do handoff ao Radar.
  duplicata, conceitos de âncora, motivo e prioridade.
- [x] Salvar via `PATCH` com `lock_version`, confirmar readback, mostrar
  conflito de versão e preservar Graph aprovado/versões sucessoras.
- [x] Preservar `InternalLinkGraphRef` no retorno canônico downstream sem
  alterar o Radar ou criar bypass.
- [x] Manter uma única planilha nos três modos.
- [x] Testes focados `28/28`, visual `20/20`, guard visual PASS; erros globais
  preexistentes documentados.
- [~] Gate manual Chrome autenticado, F5/readback remoto, aprovação real,
  sucessora e handoff Radar ainda pendentes; não chamar o lote de homologado.
- [ ] Próximo lote: `IA → InternalLinkGraphProposal → comparação → revisão
  humana → aplicação parcial`; não iniciar automaticamente nesta entrega.

## Ajuste horizontal do mapa do Arquiteto — 2026-08-26

- [x] Orientar Artigos horizontalmente: Principal à esquerda, relacionadas à
  direita e edges sempre diretas a partir da Principal.
- [x] Calcular faixas por grupo, centralizar a Principal na altura das
  relacionadas, empilhar grupos na ordem da planilha e manter texto integral.
- [x] Compactar grupos unitários sem edge, coluna vazia ou container gigante;
  suportar até seis keywords sem sobreposição prevista.
- [x] Orientar Silos em três colunas `SiloPage → Pilar → Suportes`, preservando
  a distinção visual e as edges de membership/hierarquia.
- [x] Manter React Flow como projeção derivada, sem conexão/arraste, sem
  alteração da planilha única, working copy, contratos ou persistência.
- [x] Cobrir o ajuste em `tests/arquiteto-workbench.test.mts` e lint
  direcionado.
- [~] Repetir validação manual no Chrome, responsividade, temas e F5/readback
  após o ajuste; provider real e remoto continuam fora desta fila.
- [ ] Lote 9 — InternalLinkGraph: permanece bloqueado pelo gate estrutural do
  Planner Geral.

## Planilha única nos três modos — 2026-08-26

- [x] Remover a substituição da planilha por `ArchitectSiloModeTable` e pelo
  placeholder de `InternalLinkGraph` no render principal.
- [x] Manter a mesma planilha de artigos em `Artigos`, `Silos` e `Links
  internos`, com `Sem silo`/detalhes de Silo na própria superfície quando
  aplicável.
- [x] Preservar seleção, expansão, working copy e ArticleDNA no workspace;
  tabs não criam seleção ou dataset paralelo.
- [x] Manter o bloqueio de Links internos apenas no Workbench, sem grafo fake,
  alteração do `InternalLinkGraph` ou mudança estrutural.
- [x] Adicionar regressão focada para a composição única e a troca de modo.
- [~] Validação manual obrigatória no Chrome ainda pendente; não homologar
  antes de confirmar seleção/expansão nos três modos.

## Refinamento visual do Workbench e React Flow — 2026-08-26

- [x] Dividir o Workbench desktop em decisão/comparação à esquerda e mapa à
  direita, com aproximadamente metade da largura útil para cada lado.
- [x] Manter o mapa visível no estado normal e limitar a expansão a
  aproximadamente `33vh`, liberando Controls/MiniMap somente para exploração
  expandida.
- [x] Empilhar `Atual`, `Lógica`, `SERP` e `IA` na borda direita do canvas;
  mover `Comparar com Atual` para a coluna esquerda.
- [x] Integrar o `@xyflow/react` já instalado como projeção derivada dos
  snapshots, sem arrastar/conectar nodes e sem alterar domínio.
- [x] Mostrar Artigos de forma compacta, com principal e keywords relacionadas;
  mostrar Silos como SiloPage → Pilar → Suportes; não exibir métricas ou DNA
  extenso dentro do mapa.
- [x] Retirar `Mostrar/Ocultar contexto`; o contexto permanece disponível na
  coluna esquerda sem toggle concorrente.
- [x] Preservar a planilha única e o bloqueio de Links internos sem grafo fake.
- [x] Cobrir o lote com `9/9` testes focados e guard visual aprovado.
- [~] Chrome do agente validou layout desktop, cenários, expansão, vazio de
  Silos e bloqueio de Links; usuário ainda precisa homologar interação visual,
  responsividade e temas claro/escuro.
- [ ] Lote 9 — InternalLinkGraph: continua bloqueado pelo gate estrutural.

## Correção semântica do mapa de Artigos — 2026-08-26

- [x] Remover o node de ArticleDNA do mapa de Artigos e representar cada
  KeywordDNA como node dentro do grupo visual correspondente.
- [x] Destacar uma única Principal por grupo e criar edges visuais da Principal
  para Secundárias/Reforços; grupos não compartilham edges.
- [x] Aplicar a ordem atual da planilha filtrada ao canvas e manter todos os
  grupos visíveis; seleção deixa artigos não selecionados em estado fantasma,
  sem alterar working copy, snapshots ou handlers canônicos.
- [x] Remover truncamento/line-clamp dos nomes de keyword e usar rótulos
  determinísticos de Principal, Secundária N e Reforço N.
- [x] Empilhar grupos verticalmente, com posições e espaçamentos previsíveis,
  sem edges cruzando grupos; manter a área interna navegável e sem `fitView`
  automático em Artigos para preservar escala legível no canvas compacto.
- [x] Fazer o clique no mapa apenas focar/selecionar artigo; expansão do DNA
  permanece na planilha e o mapa possui chevron explícito para expandir/recolher.
- [x] Remover padding estrutural externo e manter Controls/MiniMap somente no
  canvas expandido, sem persistir viewport ou criar estado paralelo.
- [x] Manter o builder de Silos separado: ArticleDNA como node, com
  SiloPage → Pilar → Suportes, sem reaproveitar semântica de keywords.
- [x] Recompor o Workbench em duas colunas desde o topo, com decisões à
  esquerda e canvas enxuto à direita, sem alterar a planilha única.
- [~] Chrome manual do usuário, responsividade, temas, F5 completo e readback
  remoto ainda pendentes; a validação local do agente não substitui esses
  gates.
- [ ] Referência futura: interação de Context Menu do React Flow para Links
  internos somente depois da fundação homologada do `InternalLinkGraph`; não
  implementar menu, nodes, edges ou estado substituto neste lote.
- [ ] Lote 9 — InternalLinkGraph: bloqueado pelo gate estrutural do Planner
  Geral.

## Atualização de implementação — Links Internos — 2026-08-27

- [x] A fundação homologada foi conectada à aba Links Internos sem nova
  migration, schema, RLS, grant, provider ou alteração estrutural no Radar.
- [x] Working copy real, edição humana de edges, `lock_version`, readback,
  conflito stale, aprovação versionada e sucessora foram ligados às rotas
  canônicas existentes.
- [x] React Flow agora é projeção horizontal de `SILO_PAGE` e `ARTICLE_DNA`,
  com seta dirigida; approved é somente leitura e arraste/conexão ficam apenas
  na working copy; posição, viewport e seleção permanecem fora do hash.
- [x] A planilha continua única e a IA permanece desabilitada neste lote.
- [x] Testes focados `28/28`, testes visuais `20/20`, guard visual PASS e lint
  direcionado passaram.
- [~] Chrome autenticado, F5/readback remoto, aprovação real e conferência do
  handoff do Radar continuam pendentes; a implementação local não foi
  homologada sem essas evidências.
- [ ] Próximo lote: IA → Proposal → revisão humana → aplicação parcial.

## Integridade da fase Artigos — 2026-08-27

- [x] Separar a projeção plana de Artigos da projeção agrupada de Silos na
  planilha única.
- [x] Impedir que a fase Artigos crie SiloDNA, SiloPage, slug, Pilar, Suporte
  ou o fallback operacional `Silo sem nome`.
- [x] Preservar proteção de Silo já existente em conteúdo publicado sem usar
  lista de origem como Silo para keywords novas.
- [x] Manter SERP como evidência/diagnóstico e IA como proposta reversível;
  nenhuma delas movimenta ou aprova ArticleDNA automaticamente.
- [x] Separar estados de execução, diagnóstico, revisão, consolidação e gate do
  Radar.
- [x] Ocultar o painel legado de briefing da experiência ArticleDNA sem apagar
  dados ou alterar schema.
- [ ] Executar homologação manual H3 → H5 no Chrome, incluindo F5 e readback.
- [ ] Executar readback remoto autorizado para distinguir projeção local de
  eventual `Silo sem nome` persistido.
- [x] Validar localmente a fronteira com 24/24 testes focados (article-phase/
  logic: 17/17) e 39/39 incluindo regressões relacionadas de seleção, além de
  20/20 testes visuais, guard visual PASS, lint direcionado PASS e `git diff
  --check` PASS.
- [~] `test:arquiteto` ficou em 181/182 por uma asserção preexistente do
  Minerador que espera o rótulo antigo de `Processar lógica`; correção deve ser
  tratada pelo módulo proprietário do Minerador.
- [ ] Iniciar InternalLinkGraph somente quando o gate estrutural estiver
  comprovadamente homologado; esta correção não o inicia.

## Painel expandido da linha do artigo — 2026-08-27

- [x] Reorganizar exclusivamente o detalhe aberto pelo chevron, sem alterar a
  planilha única nem os contratos de persistência.
- [x] Mostrar resumo superior com métricas reais da principal e agregados
  derivados rotulados; `null` permanece ausente e zero permanece zero.
- [x] Mostrar definição/fatos à esquerda e processo ativo à direita, com
  Lógica, SERP, IA e Revisão em abas compactas.
- [x] Reutilizar `KeywordDnaPanel`, `ArticleDnaSummary` e `InfoHint`; perfis
  completos continuam acessíveis sem duplicar o DNA no node/painel.
- [x] Exibir contexto de Silo e Links Internos somente quando referências reais
  existirem; não criar entidades por desenho.
- [x] Cobrir helper e composição com 10/10 regressões focadas.
- [ ] Homologar manualmente o painel em Chrome nos tamanhos 360/768/1024/1440
  e em tema claro/escuro; testar hover, foco, disabled e detalhes expansíveis.
- [ ] Confirmar ownership dos campos legados de briefing com Planejador/Redator
  antes de removê-los ou promovê-los para qualquer contrato canônico.

## Planilha principal de Artigos — 2026-08-27

- [x] Reordenar a planilha única para as colunas canônicas e manter o prefixo `#`, checkbox e chevron.
- [x] Separar visualmente seleção e expansão; a expansão recebe destaque de linha completa e preserva o painel inline.
- [x] Remover da projeção de Artigos o cabeçalho precoce de Silo, sem limpar dados ou criar hierarquia.
- [x] Registrar `Silo sem nome` como fallback de read model em Silos/Links, não como evidência de persistência remota.
- [ ] Homologar no Chrome, lado a lado com o Minerador, em 360/768/1024/1440 e tema claro/escuro; confirmar checkbox, chevron, hover e linha expandida.

## Correção final de Artigos — escopo, tabs e legibilidade — 2026-08-27

- [x] Restringir Lógica a artigos selecionados e preservar não selecionados.
- [x] Impedir seleção vazia de executar Lógica global.
- [x] Restringir resumo do Workbench ao escopo selecionado e alinhar estado IA por artigo.
- [x] Corrigir navegação das tabs internas sem executar processo.
- [x] Separar execução, evidência e conflito na leitura SERP; manter slug SERP ausente sem dado inventado.
- [x] Destacar keyword/slug e conectar visualmente cada expansão à sua row.
- [ ] Homologar manualmente no Chrome o cenário A/B/C, tabs, SERP/IA e rail em dark mode; nenhuma homologação foi declarada nesta entrega.

## Bug crítico — processos fora da seleção + IA rastreável — 2026-08-27

- [x] Limitar write/payload de Lógica e aplicação de IA ao mutation scope capturado no botão real.
- [x] Separar mensagem de itens processados e total do workspace; regressão A/B/C/D cobre imutabilidade de não selecionados e múltipla seleção.
- [x] Preservar diagnóstico sanitizado de falha de IA no cliente.
- [ ] Executar roteiro manual: selecionar somente um artigo, Lógica, F5, SERP selecionada e IA manual; registrar `failureStage`, HTTP e code se falhar.

## Pendência estrutural — proposta de IA pendente de revisão

- [ ] **PEDIDO ESTRUTURAL PARA O PLANNER GERAL:** definir persistência e readback canônicos para proposta de repartição da IA antes da aplicação humana, caso a proposta precise sobreviver a F5. Não criar tabela, RPC, schema ou fallback local no Arquiteto sem aprovação.

## Homologação pendente — painel de processos do Artigo — 2026-08-27

- [ ] Validar manualmente no Chrome: abrir cada aba sem disparar processo; IA com três propostas; aplicar à working copy; confirmar que a Revisão mantém as três alterações até o pente-fino humano.
- [ ] Reproduzir com inspeção de rede o erro de workflow para classificar `lock_version` obsoleto versus item de outra Brand. Esta correção não mascara nem altera o caminho de persistência.
- [ ] Confirmar visualmente em 360/768/1024/1440 e tema claro/escuro; nenhuma chamada de provider deve ocorrer durante a navegação das abas.

## Homologação pendente — resumo canônico do painel expandido — 2026-08-27

- [ ] Validar no Chrome, em tema claro/escuro e 360/768/1024/1440, que intenção/funil da Principal aparecem sem atraso e que a compatibilidade de uma secundária divergente não substitui o resumo.
- [ ] Confirmar com KeywordDNA real os estados KGR `Sim`, `Não`, `—` e o perfil completo com decimal, sem chamar provider nem alterar persistência.

## Homologação pendente — tabs internas com contexto editorial real — 2026-08-27

- [ ] Repetir no Chrome o ciclo Lógica → SERP → IA → Revisão → Lógica com o mesmo Article em que SERP 3/3, propostas IA aplicadas e revisão pendente estejam reidratados; confirmar somente navegação local, sem provider ou mutação de working copy.
## Exclusao selecionada pelo lifecycle canonico - 2026-08-28

- [x] Restaurar Excluir no rodape de Artigos para a selecao explicita, resolvendo somente os IDs Principal/secundarias de cada artigo selecionado.
- [x] Reutilizar `DeleteConfirmation`, `PublishedDeleteConfirmation` e os endpoints canonicos do lifecycle de KeywordDNA; nenhuma exclusao client-side de `minerador_keywords`.
- [x] Exigir preview exato, resultado sem partial delete e readback remoto do workspace antes de remover a projecao local e limpar a selecao.
- [ ] Homologar manualmente no Chrome: nao publicada, publicada, mista, cancelar, falha de rede, F5/readback e reimportacao posterior. Nenhuma exclusao remota foi executada nesta entrega.

## Identidade estrutural da revisão IA — 2026-09-02

- [x] Tirar `reviewRole` transitório do `baseArticleContentHash`.
- [x] `principalKeywordId` como única autoridade da Principal no hash.
- [x] Preservar Secundária × Reforço como papel estrutural do hash.
- [x] Tornar STALE explícito no read-model, sem colapsar em `NOT_RUN`.
- [x] Tirar `siloId` da identidade estrutural: Silo é etapa posterior.
- [x] Cobrir Artigos → Silos: atribuir Silo não desatualiza a revisão.
- [ ] Do produto: reexecutar a IA nos Articles cujas revisões usam a fórmula
      anterior, para que voltem a ser vigentes.

## Revisão Humana operacional — 2026-09-02

- [x] Mutações canônicas: Principal, Secundária × Reforço, mover, retirar, separar.
- [x] Invariante de uma única Principal efetiva por Article em todos os caminhos.
- [x] Teto de 6 keywords respeitado na entrada de qualquer artigo.
- [x] Retirar keyword devolve para Keywords não agrupadas sem apagar registro.
- [x] Confirmação curta com antes, depois e impacto nas ações de maior impacto.
- [x] Proteções de publicado preservadas em todas as ações manuais.
- [x] Persistência pelo contrato canônico da working copy, sem storage novo.
- [ ] Unificar a aplicação de proposta da IA (`applyKeywordArticleReview`) com as
      mutações manuais: hoje são dois caminhos com as mesmas garantias, mas
      código separado.
- [ ] Ações estruturais diretas a partir de uma divergência da SERP.
- [ ] Controle de tipo de unidade para Article ainda em formação: o contrato
      existente (`applyHumanEditorialUnitDecision`) opera sobre ArticleDNA
      consolidado.
- [ ] Origem do estado transitório com duas Principais: o invariante cobre os
      caminhos humanos; a formação Lógica/IA ainda não foi auditada.

## Fiação da Revisão Humana — 2026-09-02

- [x] Corrigir a memoização que impedia a confirmação de aparecer.
- [x] Extrair intenção/execução/commit para módulo exercitável sem navegador.
- [x] Recusar destino cheio, publicado e Principal sem sucessora antes de confirmar.
- [x] Só anunciar sucesso depois da persistência canônica confirmar.
- [ ] Do produto: smoke manual das cinco ações no navegador.
- [ ] Teste de DOM real: o repositório não tem renderer de componentes; a camada
      de evento continua coberta só pelo smoke manual.

## Cenários arquiteturais completos — 2026-09-02

- [ ] **SDD proposta, aguardando aprovação do Planner:**
      `docs/04-arquiteto/propostas/2026-09-02-sdd-cenarios-arquiteturais-completos.md`
- [ ] Bloqueio confirmado: `SerpFormationAssessment` é por Article e não expressa
      destino, merge nem membership de artigo novo; `KeywordArticleDecision` não
      expressa retirar para não agrupadas.
- [ ] Comprovado que os cenários SERP e IA do mapa são snapshots da arquitetura
      vigente no instante da execução, não projeções das recomendações.
- [ ] Nada implementado nesta frente até a aprovação.

## Cenários arquiteturais — fases — 2026-09-02

- [x] SDD aprovada com emendas: escopo global do cenário SERP, universe hash,
      sourceRefs múltiplas, overlap sem provider, ganhos/perdas derivados,
      artifact de CURRENT não autorizado, ordem das fases.
- [x] **Fase 1** — contrato comum, invariantes, universo, validador,
      normalizador e diff. Domínio puro.
- [ ] **Fase 2** — materialização do cenário Lógica.
- [ ] Fase 3 — cenário Humano e adoção de candidato.
- [ ] Fase 4 — cenário IA derivado + enum `retirar_do_artigo`.
- [ ] Fase 5 — `serp_architecture_scenario` + overlap cross-Article + CHECK remoto.
- [ ] Fase 6 — mapa, trilho, ganhos/perdas e confirmação de CURRENT.
- [ ] Pré-requisito da Fase 6: auditar `confirmArticleArchitecture` + ArticleDNA
      aprovado antes de decidir se CURRENT precisa de artifact próprio.

## Rearquitetura Silo-first — auditoria e SDD — 2026-09-02

- [x] **Fase 0 concluída:** auditoria de código + SDD proposta em
      `docs/04-arquiteto/propostas/2026-09-02-sdd-arquitetura-silo-first.md`.
- [ ] **Aguardando aprovação explícita do usuário.** Nada implementado.
- [x] Confirmado no código que o fluxo é Article-first:
      `buildDeterministicArticleArchitecture` recebe todas as keywords da Brand;
      `formSiloWorkingCopies` recebe `articleVersions`;
      `normalizeArticleWorkingCopyKeyword` zera `siloId` de keyword não publicada;
      `resolveArticleSiloReadiness` devolve `not_started` sem ArticleDNA.
- [x] Confirmado que a working copy de Silos **não é persistida** (React state em
      `arquiteto-workspace.tsx:510`) e que a proposta de IA de Silos também não é.
- [x] Confirmado que `editorial_workflow_items.subject_type` não tem enum
      (`CHECK char_length BETWEEN 1 AND 80`): território cabe sem DDL.
- [x] Confirmado que `editorial_architect_work_copy`, citada na SDD anterior, não existe.
- [ ] **Decisões pendentes do Planner Geral (§4 e §21 da SDD):**
      C1 extensão aditiva do `ArchitectureScenario` já entregue;
      C2 destino do criador manual de Silo, que hoje cria SiloPage e linha em
      `minerador_keyword_lists`;
      C3 remoção da porta por contagem (`relatedKeywordCount >= 2`) na Lógica territorial;
      C4 separação definitiva entre `territoryRef` e `siloId = lista_id`.
- [ ] Fases 1–13 da SDD, na ordem, uma por vez, com parada em cada mudança estrutural.
- [ ] Única DDL prevista: ampliação do CHECK de `artifact_type` para
      `silo_architecture_scenario`, diferida até a Fase 6, com leitura do CHECK
      remoto material antes de escrever a migration.

## Silo-first — SDD revisão 2 (decisões C1–C4 incorporadas) — 2026-09-02

- [x] `FASE_0_AUDIT = PASS` pelo Planner Geral.
- [x] SDD revisão 2 com C1–C4 resolvidos e as duas seções obrigatórias novas:
      `KEYWORD_TERRITORY_MEMBERSHIP_CONSISTENCY` (§11) e
      `TERRITORY_IDENTITY_LIFECYCLE` (§12).
- [x] C1 `EXTEND_ADDITIVELY`: `level` explícito no contrato novo; default `article`
      só numa borda de compatibilidade isolada; SiloScenario nunca usa
      `articles[] + ungroupedKeywordIds[]`.
- [x] C2 `LEGACY_CREATION_PATH`: `POST /api/arquiteto/silos` congelado e preservado;
      novo `MANUAL_STRATEGIC` não cria lista, SiloDNA, SiloPage, publicação nem URL.
      Route marcado `DEPRECATED` só na Fase 13; deleção é decisão separada.
- [x] C3 `relatedKeywordCount >= 2` reclassificado como `LEGACY_SIGNAL`;
      `TERRITORY_MINIMUM_KEYWORD_COUNT = NENHUM`. Código legado intacto.
- [x] C4 separação definitiva `territoryRef` × `siloId` × `lista_id`, com ponte
      explícita na consolidação (§12.6).
- [x] `MEMBERSHIP_SOURCE_OF_TRUTH = keyword workflow item`; `territory.keywordRefs`
      não é persistido — a segunda fonte mutável foi eliminada, não sincronizada.
- [x] `DDL = 0` nesta rodada. `silo_architecture_scenario` **retirado** da proposta;
      volta a ser hipótese, a provar só na fase da SERP territorial.
- [x] Working storage provado contra o contrato atual (§8.1): isolamento por marca,
      unique key, `lock_version` com trigger, leitura current, conflito 409.
- [ ] **Aguardando `SDD_APPROVED = YES` do Planner Geral. Fase 1 não iniciada.**

## Silo-first — Fase 1 concluída, Fase 2 aguardando autorização — 2026-09-02

- [x] `SDD_APPROVED = YES`; emendas E1, E2 e E3 incorporadas na SDD (revisão 3).
- [x] **Fase 1** — `lib/arquiteto/territory.ts` + extensão aditiva de
      `lib/arquiteto/architecture-scenario.ts` com `level`. Domínio puro.
- [x] E1 `pendingOperation` + `PARTIAL_MEMBERSHIP_OPERATION` bloqueando
      confirmação e formação de Article.
- [x] E2 `continuingPartId` obrigatório no split; E3 `survivingTerritoryRef`
      obrigatório no merge. Ambos recusam em vez de inferir.
- [x] `EMPTY_TERRITORY` documentado: diagnóstico em `candidate`, bloqueador na
      porta `candidate → confirmed`.
- [x] 26 testes novos; `test:arquiteto` 439/438 com a falha pré-existente do
      Minerador; TypeScript sem erro novo; lint limpo.
- [ ] **Fase 2** — read-model `TerritorialLandscape` somente leitura, com
      `CONSISTENCY_CHECK` e `LEGACY_NEEDS_RECONCILIATION`. **Não iniciada:
      aguarda autorização do Planner Geral.**
- [ ] Fases 3 a 13 conforme §17 da SDD, uma por vez.
- [ ] `silo_architecture_scenario` permanece diferido; nenhuma DDL prevista até
      a Fase 6 provar necessidade.

## Silo-first — Etapa 0 contratada; Fase 2 bloqueada pela aba Site — 2026-09-02

- [x] Adendo Etapa 0 incorporado à SDD (§4.2), com todos os marcadores exigidos.
- [x] `lib/arquiteto/territorial-base.ts` + `narrative`/`discovery` em
      `lib/arquiteto/territory.ts`. 14 testes novos; suíte 453/452.
- [ ] **BLOQUEIO — Fase 2 (fonte site/sitemap).** A aba Site persiste o catálogo
      apenas em IndexedDB/localStorage por ator (`lib/marca/site-store.ts`);
      `brand_site_*` não é referenciada por nenhum código; a migration 0004 nunca
      foi aplicada e cita `listas_kgr` (renomeada pela 0036). O único caminho
      server-side é `crawlAuthorizedSitemap`, que é coleta externa — vetada.
      Regra §41 acionada: reportado ao Planner Geral, sem improviso.
- [ ] Decisão pedida ao Planner: (a) Fase 2 parcial sem site/sitemap, sobre as
      fontes já canônicas; (b) frente própria da Marca para persistir o catálogo;
      ou (c) aguardar.
- [ ] Fases 3 a 13 conforme §17 da SDD.

## Silo-first — Delta Etapa 0 PASS; Fase 2 permanece bloqueada — 2026-09-02

- [x] SDD revisão 4 com os cinco eixos ortogonais da Base (§4.2.4).
- [x] `observationState` × `decisionState` com interseção vazia, travado por teste.
- [x] `StrategicDeclaration` com zero keyword como estado legítimo.
- [x] Guards de ausência: `site_only` sem `publicationRef`, `database_only` sem
      `url`/`sitemapRef`.
- [x] 21 testes na Base + 26 no território; suíte 460/459.
- [ ] **Fase 2 bloqueada (inalterado):** a aba Site persiste o catálogo apenas em
      IndexedDB/localStorage por ator; `brand_site_*` não é referenciada por
      nenhum código; a migration 0004 nunca foi aplicada. O único caminho
      server-side é `crawlAuthorizedSitemap` — coleta externa, vetada.
- [ ] Decisão pedida ao Planner: (a) Fase 2 parcial sobre as fontes já canônicas
      com a fonte site declarada ausente; (b) frente própria da Marca para
      persistir o catálogo; (c) aguardar.
- [ ] Rastrear no Git os módulos novos do Arquiteto (ação do usuário).

## Silo-first — Fase 2A concluída; 2B aguardando — 2026-09-02

- [x] Auditoria da membership atual: `AssignmentSchema` não tinha `territoryRef`;
      membership paralela vivia só em React state.
- [x] `lib/arquiteto/territory-working-copy.ts` — operações, projeção derivada,
      gate de operação parcial, legado.
- [x] Readiness de confirmação estendida com entidade, intenção, fronteira e
      narrativa; `DEFERRED_EXTERNAL_EVIDENCE` para o que depende da Etapa 0.
- [x] `AssignmentSchema` estendido com `territoryRef` e `territoryAssignment` —
      aditivo no payload jsonb, sem DDL.
- [x] 15 testes novos; `test:arquiteto` 475/474 com a falha pré-existente.
- [ ] **Fase 2B** — Lógica territorial e cenários de nível Silo. Não iniciada.
- [ ] UI territorial: só depois de 2B, sem redesenho, planilha única.
- [ ] HOLD externo: a A1 da Marca está APPLIED (materialização remota PASS).
      `readBrandSiteSnapshot` ainda depende de A2, repositories, runtime real de
      sync e leitura remota — Fases 3 a 6 daquela frente.
- [ ] Blocker herdado: duas execuções `running` no mesmo sitemap continuam
      possíveis — gate de `createRunningSyncRun` na frente da Marca.


## Fase 2A.1 — persistência e autoridade territorial — 2026-09-02

- [x] `territoryAssignment` sem segunda referência (`KeywordTerritoryDecisionSchema`).
- [x] `unassigned` x `unaddressed` como projeção derivada, com recusa de incoerência.
- [x] Registro canônico remoto do território sobre `editorial_workflow_items`, sem DDL.
- [x] `territoryRef` emitido pelo servidor; criação com ref declarada é recusada.
- [x] Retrocompatibilidade do payload legado provada em teste.
- [x] 13 testes novos; `test:arquiteto` 488/487 com a falha pré-existente.
- [ ] **Fase 2B** — Lógica territorial e cenários de nível Silo. Não iniciada.
- [ ] Escrita territorial pela UI: só depois de 2B.

## Fase 2A.2 — gate de contrato do registro territorial — 2026-09-02

- [x] `state`, `subject_type`, `source_entity_id`, `subject_id` e `marca_id`
      auditados no DDL e em todos os consumers.
- [x] `source_entity_id` corrigido para `territoryRef` (colisão com o predicado
      de purga de keyword em 0047, que não filtra subject_type).
- [x] 7 testes de gate; `test:arquiteto` 495/494 com a falha pré-existente.
- [ ] **SMOKE REMOTO — do USUÁRIO.** create → GET → comparação → `lock_version`.
      Até lá `TERRITORY_REMOTE_PERSISTENCE = UNPROVEN`.
- [ ] **Fase 2B** — Lógica territorial e cenários de nível Silo. Não iniciada.

## Fase 2A.3 — smoke remoto preparado, aguardando o usuário — 2026-09-02

- [x] Roteiro completo em `docs/04-arquiteto/smoke-territory-record-2a3.md`
      (CREATE · GET · UPDATE com lock · stale lock · identidade imutável ·
      sonda SQL read-only · cross-brand).
- [x] Payloads validados localmente contra `TerritoryCandidateSchema`.
- [ ] **USUÁRIO executa o smoke.** Até voltar:
      `TERRITORY_REMOTE_PERSISTENCE = UNPROVEN_UNTIL_USER_SMOKE`.
- [ ] `CROSS_BRAND_REMOTE_SMOKE` depende de uma segunda Brand de teste.
- [ ] `pendingOperation` parcial fora deste smoke: exigiria ids de keyword
      inventados. Fica para o smoke de integração com keywords reais.
- [ ] **Fase 2B** — bloqueada até o smoke voltar.

### RISCO REGISTRADO — purge por source_entity_id sem subject_type

A migration `0047_global_lifecycle_delete_recovery_purge.sql` apaga itens de
workflow com `source_entity_id = current_keyword.id::text` **sem filtrar por**
`subject_type` — nas duas ramificações, delete e purge. A `0046` tem o filtro;
a `0047` não. O contrato atual do Território evita a colisão por construção:
`source_entity_id = territory:<uuid>`, que nunca é igual a um UUID cru.

**Não corrigir a 0047 agora** (migration histórica). Mas qualquer
`subject_type` futuro que grave UUID cru em `source_entity_id` será apagado
junto com uma keyword sem relação com ele. Reavaliar ao criar o próximo
subject_type.

## Fase 2B — formação de Article em território confirmado — 2026-09-02

- [x] Auditoria do modelo de Article (working copy, DNA canônico, consumers).
- [x] `territoryRef` aditivo e opcional em ArticleDNA e ProvisionalArticleGroup.
- [x] Primitivo `territory-ref.ts` extraído para quebrar ciclo de import.
- [x] `planArticleFormationForTerritory` + `resolveArticleConfirmationReadiness`
      + `confirmArticleStructure`.
- [x] 22 testes novos; `test:arquiteto` 517/516 com a falha pré-existente.
- [ ] **Territory remote smoke** — PENDING FUTURE INTEGRATION VALIDATION.
- [ ] UI territorial e de formação: planilha única, depois do domínio.
- [ ] **Fase 2C** — consolidação de ArticleDNA e sucessão de versões.
- [ ] Lógica/SERP/IA territoriais: a estrutura aceita cenário, os produtores
      ainda não existem. `PROVIDER_CALLS = 0` nesta fase.

## Fase 2B.1 — fechamento de invariantes — 2026-09-02

- [x] Diff cross-level decide por nível sem tocar no universo.
- [x] Coerência de papéis no ArticleDNA (mesma keyword em dois papéis recusada).
- [x] Gate de consolidação: território obrigatório no Article novo, opcional na
      leitura legada.
- [x] Território de versão consolidada exige sucessora para mudar.
- [x] Proteção unknown exige decisão humana explícita (4 estados).
- [x] Working membership x composição validadas nos dois sentidos.
- [x] 15 testes novos; `test:arquiteto` 532/531 com a falha pré-existente.
- [ ] **Fase 2C** — consolidação de SiloDNA/SiloPage. Não iniciada.
- [ ] Article territorial novo ainda não persistido remotamente.
- [ ] `.git/index.lock` obsoleto (0 bytes, 20/ago) impede escrita de índice pelo git.

## Fase 2C.2 — contratos e invariantes de Silo — 2026-09-02

- [x] territoryRef aditivo em SiloDNASchema e SiloPageSchema.
- [x] Invariantes Pilar/Suporte para nova consolidacao (Pilar unico, >=1 Article,
      papeis disjuntos, sem duplicatas, referencias versionadas e coerentes).
- [x] Modelo de cobertura com exclusao explicita por decisao humana.
- [x] `resolveSiloConsolidationReadiness` + `confirmSiloConsolidation`.
- [x] 30 testes novos; `test:arquiteto` 562/561 com a falha pre-existente.
- [ ] **SiloWorkingCopy sem autoridade persistida.** Contrato sobre
      `editorial_workflow_items` (`subject_type=silo_working_copy`) PROPOSTO,
      aguardando aprovacao antes de implementar.
- [ ] RPC 2C.1 NAO integrada ao adapter: falta working copy duravel.
- [ ] 2C.1 behavioral smoke PENDING · Territory remote smoke PENDING ·
      Article territorial remote smoke PENDING · Marca Site/Sitemap HOLD.

## Fase 2C.3 — working copy remota de Silo — 2026-09-02

- [x] Adendo 2C.3 na SDD Silo-first.
- [x] Registro remoto `silo_working_copy` sobre editorial_workflow_items, sem DDL.
- [x] Ref proprio server-side `silo-working-copy:<uuid>`.
- [x] Guards de territorio: ausente, incoerente, brand, consolidated, nao-editavel.
- [x] Pilar automatico removido do caminho de IA; sugestao separada de selecao.
- [x] Decisao humana de Pilar com ator, momento, motivo e composicao.
- [x] 30 testes novos; `test:arquiteto` 592/591 com a falha pre-existente.
- [ ] **UI ainda le a working copy legada em memoria.** Migrar para o remoto e a
      2C.4; ate la existem duas representacoes, sendo a remota a autoridade.
- [ ] `silo-formation.ts` `buildCopy` ainda sugere Pilar por `scores[0]`.
      E sugestao por contrato, mas convem remover a inferencia na 2C.4.
- [ ] RPC 2C.1 continua NAO integrada: falta a UI ler o remoto e a readiness PASS.
- [ ] 2C.1 behavioral smoke PENDING · Territory smoke PENDING · Article smoke
      PENDING · Marca Site/Sitemap HOLD.

## Fase 2C.3A — identidade e idempotencia — 2026-09-02

- [x] `workingCopyRef` deterministico derivado do territoryRef.
- [x] Create idempotente com SELECT-antes-do-INSERT e re-leitura na corrida.
- [x] Deteccao restrita a UNIQUE canonica; erro generico propaga.
- [x] 12 testes novos; `test:arquiteto` 604/603 com a falha pre-existente.
- [ ] **LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY = OPEN.** `silo-formation.ts`
      `buildCopy` usa `scores[0]?.articleId` como atribuicao estrutural de Pilar.
      Nao pode sobreviver no fluxo final. Escopo da 2C.4.
- [ ] UI ainda le a working copy legada em memoria — 2C.4.
- [ ] RPC 2C.1 continua NAO integrada.

## Fase 2C.4.1 — adendo de concorrencia da SiloWorkingCopy — 2026-09-02

- [x] Adendo 2C.4.1 na SDD: duas corridas provadas, alternativas rejeitadas,
      duas RPCs, ordem global de locks, proveniencia, replay, entrypoint canonico.
- [x] Assinaturas desenhadas: `persist_silo_from_working_copy_atomic` (A) e
      `persist_silo_working_copy_atomic` (B).
- [ ] **SQL NAO escrito.** Aguardando autorizacao para a migration unica com as
      duas funcoes.
- [ ] Proveniencia `workingCopyRef` + `workingCopyLockVersion` no SiloDNASchema:
      desenhada, NAO aplicada — entra junto com as RPCs e seus testes.
- [ ] Migrar a UI e o adapter para o entrypoint canonico. Enquanto o caminho
      antigo existir em paralelo, as duas corridas continuam abertas nele.
- [ ] LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY = OPEN_FOR_2C_4_FUNCTIONAL.

## Fase 2C.4.2 — writers transacionais escritos — 2026-09-02

- [x] Proveniencia `workingCopyRef` + `workingCopyLockVersion` no SiloDNASchema,
      com coerencia de par.
- [x] Migration `20260902150000` com as duas funcoes; storage DDL = 0.
- [x] Espelho de dominio testado comportamentalmente + 18 testes novos.
- [ ] **USUARIO executa a migration.** Nao executada.
- [ ] **Migrar os callers para as RPCs.** Enquanto o writer antigo existir em
      paralelo, as duas corridas continuam abertas no runtime.
- [ ] Smoke comportamental das duas RPCs contra o banco.
- [ ] LEGACY_AUTOMATIC_PILLAR_IN_BUILD_COPY = OPEN_FOR_2C_4_FUNCTIONAL.

## Fase 2C.4 funcional — migracao dos callers — 2026-09-02

- [x] Writers da working copy migrados para `persist_silo_working_copy_atomic`.
- [x] Writer PostgREST antigo REMOVIDO do arquivo (dead-code eliminado).
- [x] Adapter e rota de consolidacao usando `persist_silo_from_working_copy_atomic`.
- [x] Pilar automatico removido de `buildCopy`, com as consequencias corrigidas.
- [x] 14 codigos de erro preservados individualmente.
- [x] 36 testes novos; `test:arquiteto` 658/657 com a falha pre-existente.
- [ ] **Smoke comportamental das RPCs** — roteiro a preparar quando autorizado.
- [ ] UI ainda nao consome a working copy remota nem a rota de consolidacao.
      Enquanto isso, o fluxo existe no servidor mas nao e exercido pela tela.
- [ ] Territory smoke PENDING · Article territorial smoke PENDING · Marca HOLD.

## Fase 2C.4.6 — binding semantico + bypass fechado — 2026-09-02

- [x] Working copy remota carregada INTEIRA; ArticleDNA versionados conferidos.
- [x] Readiness e confirmacao humana executadas no servidor sobre o snapshot remoto.
- [x] `assertSiloDnaMatchesConfirmedWorkingCopy` e binding da SiloPage.
- [x] Identidade publicada protegida; conflito exige decisao humana.
- [x] `/silo-pair` fechado em draft-only na rota E no helper.
- [x] 30 testes novos; `test:arquiteto` 688/687 com a falha pre-existente.
- [ ] **SILO_PAGE_APPROVAL_SERVER_GATE = MISSING.** `approved` e fail-closed aqui.
      Gate proprio de aprovacao da SiloPage ainda precisa ser desenhado.
- [ ] Smoke comportamental das RPCs: roteiro a preparar quando autorizado.
- [ ] UI nao consome a working copy remota nem a rota de consolidacao.
- [ ] UI_REPLAY_ENVELOPE_OWNER = PENDING DESIGN.
- [ ] Marca Site/Sitemap = HOLD.

## Fase 2C.4.6A — binding territorial — 2026-09-02

- [x] `assertSiloDnaMatchesConfirmedTerritory` com as quatro equivalencias reais.
- [x] Gate territorial antes do de composicao, ambos antes da RPC A.
- [x] 11 testes novos; `test:arquiteto` 699/698 com a falha pre-existente.
- [ ] **FULL_PHASE_2C_COMPLETION_BLOCKER = YES** — aprovacao propria da SiloPage.
- [ ] Smoke de consolidacao: pode ser preparado quando autorizado, com SiloPage
      em status nao-final.
- [ ] UI nao consome a working copy remota nem a rota de consolidacao.
- [ ] Marca Site/Sitemap = HOLD.


## Descarte administrativo executado — 2026-09-08

Proprietário da operação: Arquiteto; participação do Radar explicitamente autorizada.
Projeto hjjlntdpdgvpnazdztqw; marca Care Glow (09762023-d0d4-4c24-b34e-d0fdfd43f891).
Descarte definitivo de testes autorizado pelo usuário, com backup dispensado.
Executado via Supabase CLI 2.111.0, db query --linked, em transação única.

- Confirmado no banco: removidos 21 workflows do Arquiteto e 4 do Radar; 115 ArticleDNA; 9 article_architecture_ai_review; 114 eventos de status; 10 eventos de decisão; 9 snapshots e 6 revisões SERP. Silos e tabelas do grafo já estavam vazios.
- Preservados: 29 keywords, 3 listas, 83 qualificações semânticas, 66 apresentações contextuais e 1 brand_skill. Comparação de conteúdo integral dos registros preservados nas 17 tabelas do script passou.
- Cinco triggers append-only restaurados exatamente ao estado O; nenhuma função, FK ou migration removida/aplicada.
- Primeiro ensaio detectou text versus uuid em version_id e desfez a transação. Script corrigido para text[], inclusão das revisões IA, exclusão por folhas de previous_version_id/source_version_id e previous_snapshot_id, locks e comparação de conteúdo preservado.
- Ensaio corrigido: PASS com rollback intencional. Execução definitiva: PASS. Readback SQL independente: PASS. Reexecução em simulação sobre vazio: PASS com rollback intencional. O erro P0001 SIMULACAO CONCLUIDA é deliberado, não falha da purga.
- Validação nas duas sessões da interface: AINDA NÃO VERIFICADA nesta execução. Cache local não foi apagado. Não declarar sincronização visual homologada com base apenas neste SQL.
- Script: supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql. Mantido em simulação por padrão. Ele aborta se grafos reaparecerem: não é reset universal para qualquer acervo futuro.
- Nenhum commit, push ou deploy executado nesta entrega.

## Egress — pendências do Arquiteto — 2026-09-23

Ver SDD de [uso da Supabase](../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md).
Todas confirmadas pela lente de gatilho; a correção proposta de cada uma foi
**recusada** pelo revisor, então precisam de desenho antes de código.

1. **Handoff prepara duas vezes** (~3,3 MB por importação de keywords).
2. **Recarga do workspace inteiro para atualizar uma fatia** (~1,9 MB por
   `updateArticleSilo` e similares, 24 pontos de recarga).
3. **Patch de keywords relê a marca inteira** (~420 kB por edição da working
   copy).
4. **`/api/arquiteto/workspace` lê `minerador_keywords` da tabela**, com
   `analise_semantica` completa (~430 kB). Poderia ler
   `minerador_keywords_listagem` — a assinatura v3 foi verificada idêntica em
   linha podada e completa —, mas o revisor classificou como estrutural.
## Incidente da formação de publicados — 2026-09-26

- [x] Reservar cabeças declaradas como Silo no Vínculo antes de projetar a aba Artigos; verificado localmente: 21 artigos publicados, não 25.
- [x] Considerar memberships da mesma confirmação para `EMPTY_TERRITORY`, com conferência do lote gravado antes de confirmar cada Silo; teste focado sem chamada paga.
- [ ] Homologação do usuário depois do deploy: processar a arquitetura e conferir por readback que os quatro Silos e 21 artigos declarados como publicados foram efetivados sem segunda confirmação; confirmar manualmente somente Silos novos/potenciais que ainda aguardem decisão. Recarregar e conferir os sete estados/154 memberships; na aba Artigos, verificar as livres agrupadas sob os publicados e as quatro SiloPages fora da lista de Articles.
- [ ] Validar os conflitos semânticos e de SERP do lote real, especialmente artigos publicados com principal revisável e keywords livres de maior volume; nenhum ajuste de principal/slug/canonical deve ocorrer sem decisão humana específica.

### Ação de identidade publicada — 2026-09-26

- [x] Remover a segunda verificação manual da coluna Ações dos artigos publicados; deixar explícito que a publicação, URL, slug, canonical e vínculo do Silo já estão preservados.
- [x] Corrigir a incompatibilidade entre a resposta de `/api/arquiteto/publication/verify` e o schema estrito do Arquiteto (`entityType`, `siloPageId`, `siloPageVersionId`).
- [ ] Conferir após deploy que a linha publicada não pede verificação e que o fluxo de palavras livres/principal continua disponível; smoke visual no navegador real.

### Seleção de artigos publicados na fase Artigos — 2026-09-26

- [x] Explicar que artigos publicados são âncoras preservadas e não candidatos à criação de novos Articles; indicar a seleção das linhas de candidatos para processar keywords livres.
- [ ] Após deploy, validar que as linhas de candidatos cobrem as keywords livres associadas aos artigos publicados e que a identidade publicada permanece preservada.

### Validação local atual — 2026-09-26

- [x] `test:arquiteto` 2.396/2.396, incluindo a separação entre Silos e Artigos e a rolagem do Workbench.
- [ ] Homologar após deploy com os sete Silos/21 artigos da marca e conferir associações por readback.
- [ ] A investigação SERP e a formação/finalização MCP continuam fora das ferramentas executáveis; ver `docs/compartilhado/agentes-mcp-backlog.md`.
## Precedência da formação — 2026-09-26

- [x] Ler os sinais do KeywordDNA aprovado e reservar cada artigo publicado antes dos Assuntos e dos candidatos novos no mesmo Silo.
- [x] Reservar sustentações automáticas de Assuntos com Principal de Volume validado, sem transformar o tronco em keyword do artigo; disputa ambígua fica visível sem destino inventado.
- [x] Aplicar limite de seis em grupos automáticos, manter o excedente em `Keywords não agrupadas` e enviar apenas membros efetivos à SERP.
- [x] Projetar as sustentações no artigo publicado da mesa; tratar `Não aplicável` de artigo unitário como informação neutra.
- [x] Contar SERP concluída somente com assessment confirmado por readback; atualizar catálogo MCP e regressões.
- [ ] **Homologar após deploy (usuário):** na AdalbaPro, conferir os 21 artigos publicados, Assuntos, keywords não agrupadas, ausência de candidato acima de seis, plano de custo antes de qualquer coleta e readback dos assessments. Separar divergência real da SERP de falta de evidência no cache.
- [ ] Avaliar, com fixture de KeywordDNA e snapshot real sanitizado, se o cache compartilhado de cada keyword cobre as quatro lentes do assessment do artigo. Quando não cobrir, manter o plano explícito de custo; não afirmar que a SERP do artigo já foi executada apenas porque uma keyword tem resultados próprios.
- [x] Formação: detalhar as lentes faltantes no plano e permitir gerar pareceres dos artigos atendidos somente com cache, orçamento zero, sem chamadas pagas. Testes locais de cache parcial e de blocos.
- [ ] Homologar após deploy na marca AdalbaPro: abrir o plano dos 55 artigos, conferir nomes e motivos das faltas (a contagem pode mudar porque os unitários passaram a exigir quatro lentes), escolher **Cancelar pagamento · analisar com o cache (US$ 0)** e verificar por readback os pareceres completos e incompletos. Não autorizar chamada paga nesta verificação.
- [ ] Investigar as faltas reais mostradas no plano por targeting, idioma, lente, endpoint, profundidade e validade de 30 dias. A captura antiga, agregada, não revela qual desses motivos se aplica às seis faltas daquele momento.
- [x] Alinhar a formação de artigos de keyword única à regra de quatro lentes: plano, leitura do cache, marcador e gate de conclusão com regressões locais.
- [ ] Homologar após deploy o plano dos unitários e o estado `incompleta · faltam lentes` quando alguma lente não estiver no cache. Verificar os registros legados sem marcador antes de qualquer revalidação em lote.
## O lote diz o objetivo (D1) e reforço entre Silos (D8) — 2026-09-26

- [x] Com publicado ou Assunto no lote recebido, a sobra sem encaixe fica em Keywords não agrupadas com motivo; artigo novo só pela ação explícita "Formar artigos novos com as sobras". Lote todo novo forma artigos.
- [x] Assunto sem Volume recebe livres convergentes do Silo, com principal de Volume validado.
- [x] Propostas "Reforçar publicado ou Assunto de outro Silo", aplicadas só por decisão humana de Silo com releitura.
- [x] Fronteira gravada como lista dos membros fora do tema do Silo; publicada atrai a livre na hipótese territorial.
- [x] D6: sem opção gratuita com cache ilegível; legenda dos contadores; `lookup?.subjectId` no plano. SDDs, spec e catálogo MCP atualizados.
- [ ] **Homologar após deploy (usuário), AdalbaPro:** conferir "21 artigo(s) publicado(s) reconhecido(s)" (leitura remota de 2026-09-26: 21 artigos publicados e 4 cabeças de Silo; o total de 25 inclui as cabeças), nenhum candidato novo automático, nenhum candidato acima de seis, publicados e Assuntos sem "Não aplicável", as propostas de reforço de "Leads sem Tráfego Pago" para Captação e Crescimento e, depois de aceitá-las, o readback do `territoryRef` e o reforço na formação. Na SERP, escolher "Cancelar pagamento · analisar com o cache (US$ 0)" e conferir os pareceres gravados e os pendentes com motivo. Não autorizar chamada paga nesta verificação.
- [ ] Validar na tela (navegador) o bloco "Objetivo do lote", o botão da ação explícita e a lista de propostas em largura de celular; não foi aberto nesta entrega.
- [ ] Similaridade semântica real: a convergência continua lexical (tokens); propostas entre Silos podem deixar de fora reforços por sinônimo ("captar" × "atrair"). Avaliar o DNA (entidade e problema) ou embeddings com fixture real sanitizada.
- [x] Assunto com artigo sugerido pela formação ganhou selo próprio, "Assunto · artigo sugerido na formação, aguarda confirmação"; a formação e a mesa dão a mesma resposta (ver a entrada seguinte).
- [ ] `react-hooks/set-state-in-effect` no efeito `readoutPendente` (trabalho local anterior) segue o padrão já existente no arquivo; revisar com a dívida de lint do workspace.

## Um artigo por Assunto e nenhuma penalidade — 2026-09-26

- [x] Um artigo por Assunto: a sustentação que não coube volta a ser livre, é oferecida às âncoras e, sem encaixe, fica com motivo e nas propostas; nunca um segundo artigo concorrente (sondas Z e H).
- [x] Artigo do Assunto com Principal livre: tronco, nunca "Sem convergência" nem "Não aplicável" (sonda C), nas quatro leituras da classificação.
- [x] Publicado sozinho: "artigo publicado · aguarda reforço" na conclusão da revisão, nunca "busca isolada".
- [x] Sustentação que esperava Principal: entra no artigo do próprio Assunto, senão é oferecida às âncoras e às propostas.
- [x] Motivo para toda keyword fora de artigo, inclusive o grupo humano sem Principal elegível.
- [x] Plano de custo avisa que as quatro lentes valem para artigo unitário e que o parecer antigo "sem par" bloqueia até as extras.
- [ ] **Antes da homologação, dizer ao dono o que esperar na AdalbaPro:** 21 artigos publicados reconhecidos. Em "Leads sem Tráfego Pago", no máximo 25 das 101 livres reforçam os 5 publicados, e pelo menos 76 ficam em Keywords não agrupadas, com motivo, ou viram propostas para outros Silos. Os artigos unitários com parecer antigo ficam "incompleta · faltam lentes" até as extras serem coletadas, e cada um soma até 3 chamadas no plano.
- [ ] Homologar após deploy (usuário): nenhum Assunto com mais de um artigo, nenhum candidato de uma keyword com o mesmo Assunto sugerido, o selo "Assunto · artigo sugerido na formação, aguarda confirmação" e a compatibilidade dos artigos de Assunto sem "Não aplicável".
- [ ] A convergência continua lexical: avaliar o DNA (entidade e problema) antes de declarar a D1 atendida na AdalbaPro.

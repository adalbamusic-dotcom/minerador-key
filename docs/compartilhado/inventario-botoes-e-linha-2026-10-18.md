# Inventário de botões por área e a linha central — 2026-10-18

> **Status: PARA DECISÃO DO DONO.** Nenhum botão foi tirado por este documento.
> **Decisão do dono (2026-10-18): "Só os defeitos agora".** Os defeitos da seção abaixo são corrigidos dentro da linha. A limpeza dos botões soltos, duplicados e mortos espera o fim dos testes do amarelo e do azul.
> - Origem: regra do dono de 18/10 (AGENTS.md §0.1): nada de botão para tarefa específica fora do lugar dos botões da etapa; os temporários ficam só na barra de etapas; InfoHint em tudo; tutorial no "?" global.
> - Levantamento: lido no código (arquivo da área), sem clique.
> - O tutorial do "?" já está escrito para as 6 áreas e é guardado pela bateria (`npm run test:regressao`, suíte "ajuda (tutorial)").

**Como ler**
- **Classes:**
  - **(1)** passo da linha central;
  - **(2)** botão temporário: confirmar ou cancelar de uma prévia, escolher, seguinte;
  - **(3)** botão solto para tarefa específica, candidato a entrar na linha;
  - **(4)** duplicata, a mesma ação em dois lugares.
- **Morto** = existe no código mas nunca aparece na tela. O §0.1 proíbe função escondida: ou volta para a linha, ou sai.

## Defeitos achados no levantamento (corrigir dentro da linha)

1. **Publicações:** não existe caminho para a Fila.
   - "Enviar a Publicações" cria o registro como rascunho, e nada o leva a "pronto para exportar".
   - `importApproved` não é chamada por ninguém.
   - "Colocar na fila" nunca aparece para artigo novo.
   - O texto "Importe pelo seletor" aponta para um seletor que não existe mais.
2. **Redator:**
   - Cancelar a caixa de instrução não cancela a chamada paga à IA (`window.prompt(...) ?? ""`).
   - Finalizar o roteiro ou o carrossel pode perder o que não foi salvo.
   - Desfazer e refazer, nas abas derivadas, mexem no artigo escondido.
   - "Propor escrita para esta seção", "Melhorar trecho" e "criar a partir do contexto" usam IA paga sem dizer o custo.
3. **Marca:**
   - Cancelar, suspender e revogar convite só mudam a tela; não gravam no servidor.
   - "Ver keywords" não mostra nada.
   - "Renomear" não renomeia.
   - Duas mensagens aparecem em inglês.
4. **Arquiteto:**
   - "Enviar ao Radar" do rodapé envia sem prévia.
   - "Remover do Grupo" e "Mudar de Silo" mudam o Silo sem confirmação, inclusive na aba Links internos.
   - O seletor de hierarquia parece editável mas nunca salva.
   - A prévia de "Marcar Pronto para Radar e enviar" diz "Nada é pago", mas pode abrir a coleta paga quando a SERP do artigo venceu.
5. **Minerador:**
   - Volume gasta cota sem prévia de custo.
   - Lógica, Status (fora "aprovado"), KGR e "Concluir revisão" ainda gravam pelo navegador (fases F3–F5 da SDD da linha única).
   - "Desfazer" e "Refazer" do topo mexem nos dados sem salvar.
6. **Radar:**
   - "Zerar investigação", "Zerar pesquisa YouTube/Amazon" e "Limpar lista" agem sem confirmação.
   - Os inícios pagos (Google, YouTube, Amazon) não pedem confirmação.
   - "Localizar produto na Amazon" é consulta paga sem aviso no botão.
   - **A rota de detalhe `/radar/{articleId}` é uma segunda linha antiga, paralela.** Ela tem Resumo, SERP, Referências e "Aprovar relatório…", e não tem artigo-modelo. O link "Organizar o artigo-modelo no Radar" do Redator cai nela, sem saída.

## Marca (as abas são os passos; não há barra de etapas)

- **(1):**
  - As 7 abas.
  - Site: "Salvar site", "Adicionar sitemap", "Testar", "Sincronizar", "Verificar selecionadas", "Extrair dados", "Preparar importação", "Ignorar selecionadas".
  - Identidade: "Salvar versão" e "Aprovar".
  - Skills: "Adicionar Skill", "Abrir", "Substituir arquivo", "Enviar para aprovação", "Ativar", "Arquivar".
  - Equipe: "Adicionar", Telegram, convites.
  - Configurações: "Salvar configuração".
- **(3):**
  - "Ver URLs" → filtro do Catálogo.
  - "Ver keywords" (defeito) → passo Keywords.
  - "Repetir falhas" → importação.
  - "Renomear" (não renomeia) → "Substituir arquivo".
  - "Materiais · em breve" → tirar.
  - Convite: cancelar, suspender e revogar → gravar no servidor ou sair.
- **(4):**
  - Abas implementadas duas vezes (`brand-page` e `marca-page-entry`, com dois salvamentos do site).
  - "Reextrair" = "Extrair dados"; "Verificar" = "Verificar selecionadas".
  - "Enviar para revisão" e "Preparar lote (N)" = "Preparar importação".
  - "Desmarcar duplicadas" = "Remover duplicadas da seleção".
  - "Registrar N conteúdos como legados" = "Confirmar registro legado".
  - Os dois "Substituir arquivo"; os dois "Abrir no Minerador".
- **Morto:** o painel de conexão do Google Ads.
- **Sem InfoHint:** todos.

## Minerador

- **(1):**
  - Barra das selecionadas: "Conferir site", "Lógica", "Volume", "Revisar", "Resultados (opcional · pago)", KGR, "Vínculo", "Grupo", "Concluir revisão", "Aprovar e enviar", Status, "Excluir".
  - Descobrir: os modos e a busca.
  - "Cadastrar Assuntos", "Converter formato anterior", "Sugestões do Arquiteto".
- **(3):**
  - "Exportar" do topo → barra das selecionadas.
  - "Apagar Duplicadas" → Excluir; perde o palpite de qual cópia manter.
  - "Corrigir marcação" → Status.
  - "Confirmar publicada" e "Desvincular publicação" (painel) → Conferir site/Vínculo. Desvincular só existe ali.
  - "Buscar sustentação" (painel) → Trazer keywords; perde o Assunto já escolhido.
  - "Restaurar" → Excluir (é a única porta da lixeira).
  - "Desfazer" e "Refazer" do topo → sair.
- **(4):**
  - "Aprovar e enviar" no topo = o do rodapé.
  - "Enviar ao Arquiteto" (Mais ações) = "Aprovar e enviar".
  - Status "aprovado" = "Aprovar e enviar".
  - KGR, "Concluir revisão", posto e potencial no painel e na linha = os do rodapé.
  - "Conferir por link" = o URL manual do "Conferir site".
  - "Reaprovar as N…" e "Reaprovar e reenviar" = "Aprovar e enviar".
  - "Excluir tudo da cor…" tem duas portas.
  - No Descobrir, "Atualizar métricas" e "Medir resultados" = Volume e Resultados.
- **Sem InfoHint:** quase tudo. Hoje só os 7 botões principais da barra, "Conferir site", "Enviar ao Arquiteto" e parte do Descobrir têm.

## Arquiteto

- **(1):**
  - As abas Silos, Artigos e Links internos; "Importar do Minerador".
  - "Processar/Reprocessar arquitetura", "Confirmar propostas novas".
  - "Processar artigos", "Concluir formação", "Melhorar publicados…".
  - "Processar links", "Completar a malha do Silo", "Confirmar links internos", "Marcar Pronto para Radar e enviar os N artigos deste Silo".
- **(3):**
  - "Continuar para Artigos" → "seguinte" da barra.
  - "+ Silo" → Processar arquitetura; perde o Silo manual sem semente.
  - "Recriar o Silo do plano" (aviso em todas as abas) → barra dos Silos.
  - "Usar como Silo", "Reservar como candidata", "Usar em artigo" → Silos ou Processar.
  - "Conversões pendentes do Assunto", "Aplicar o plano declarado ao Silo", "Retirar artigo do Silo" → Silos ou Concluir.
  - "Prender/Soltar Assunto", "Confirmar Assunto do Silo", "Criar artigo novo com este grupo" → Processar artigos.
  - "Formar artigos novos com as sobras", "Mover para…" e "Mover todas…" (gravam sem confirmação) → prévia do Processar ou do Confirmar.
  - "Análise por keyword (avançado)", "Diferenciar publicados (avançado)" e "Buscar keywords para os publicados sem par" → "Melhorar publicados…", mantendo o teto de custo e "Manter como está".
  - "Diagnosticar e reparar" → prévia do envio.
  - Edição e remoção de aresta no mapa → revisão dos links, com confirmação.
- **(4):**
  - "Atualizar do Minerador" = "Importar do Minerador".
  - "Desfazer os Silos sugeridos" = lote do "Desfazer Silo".
  - "Tornar principal", "Separar", "Mover para…" e "Juntar" estão no Candidato e na Revisão (deixar só na Revisão).
  - "Aplicar troca", "Aceitar a troca", "Aplicar escolhidas", "Reforçar este publicado" e "Gravar reforços" = "Melhorar publicados…".
  - "Formar artigos automaticamente" = Processar + Concluir.
  - "Manter composição" = "Registrar decisão" = "Concluir e manter".
  - "Enviar ao Radar" (rodapé, sem prévia) e "Aplicar status" = "Marcar Pronto para Radar e enviar".
  - "Processar links de novo" = "Processar links".
  - "Remover do Grupo" = "Tirar este artigo do Silo" = "Mudar de Silo".
- **Morto (~30):**
  - revisão territorial;
  - propostas da IA;
  - "Formar cópias de trabalho", "Consolidar Silos", "Confirmar Silo", "Definir contexto", "Reiniciar homologação";
  - o trecho com "Aplicar KGR", "Medir allintitle", "Atualizar SERP" e "Concluir pente-fino humano";
  - `ArticlePipelineRows`.
- **Sem InfoHint:** nenhum botão nem etapa tem.

## Radar

- **(1):**
  - "Importar do Arquiteto", "Ver e adotar"; os cartões Pesquisa, Vídeos, Especialista e Relatório.
  - "Iniciar / Completar / Refazer Pesquisa Google", "Analisar concorrência · e finaliza", "Organizar o artigo-modelo da SERP (IA)" / "Organizar de novo (IA)".
  - "Enviar ao Redator"; barra de lote "Pesquisar e finalizar (N)" e "Enviar ao Redator (N)".
  - YouTube e Amazon; Especialista; Vídeos.
- **(3):**
  - "Exportar", "Exportar CSV" e "CSV para vídeo e redes sociais" → um passo "Entregar".
  - "Conferir links do Silo" e os downloads -links.csv → exportar.
  - "Reparar congelamento" → atrás do "Zerar".
  - "Gerar relatório competitivo" → finalizar.
  - "Criar pauta avulsa" → editor de pauta.
  - A rota de detalhe antiga → tirar ou apontar para a área do artigo.
- **(4):**
  - "Organizar o artigo-modelo (N)" e "… do Silo (N)" → **em andamento: absorvidos por "Pesquisar e finalizar"**.
  - Organizar o artigo-modelo tem 5 portas.
  - "Enviar ao Redator" em 3 lugares.
  - "Planilha atual" = "Exportar selecionados".
  - Pares de pauta e especialista com handlers diferentes.
- **Morto:** o painel antigo de SERP, o painel antigo da Amazon, a bancada "Legacy…" e "Ver pendentes".
- **Sem InfoHint:** quase todos.

## Redator

- **(1):**
  - As abas Artigo, Roteiro e storyboard, Carrossel.
  - "Importar do Radar", "Salvar rascunho", "Finalizar artigo", "Enviar a Publicações".
  - Imagens; "Analisar documento".
  - Derivados: começar, finalizar, reabrir.
- **(3):**
  - "Propor escrita para esta seção" e "Melhorar trecho" (IA paga) → passo Escrever, com o custo dito.
  - "Atualizar base após revisão" → "Salvar rascunho".
  - "Gerenciar a cor" → Minerador/Arquiteto.
- **(4):**
  - "Enviar artigo a Publicações" = "Enviar a Publicações".
  - "Briefing de imagem" = "Registrar briefing".
  - Desfazer e refazer = "Restaurar".
- **Morto:** a tela antiga (`LegacyWriterPrototype`).
- **Sem InfoHint:** todos.

## Publicações

- **(1):** as abas Biblioteca, Fila, Publicados, Atualizações; "Colocar na fila"; "Markdown" e "JSON"; "Registrar URL"; "Solicitar atualização"; "Reeditar"; "Exportar atualização"; "Registrar atualização"; "Abrir no Redator".
- **(3):**
  - "CSV" (manifesto) → um "Exportar" só.
  - Desfazer, refazer e "Restaurar" só voltam a tela, então podem contradizer o servidor.
- **(4):**
  - O filtro "Publicados" repete a aba "Publicados".
  - "Reeditar" quase repete "Solicitar atualização".
- **Morto:** o texto "Importe pelo seletor".
- **Sem InfoHint:** todos.

## Divergências entre o catálogo do MCP e a tela (seguir a tela; corrigir o catálogo junto com cada limpeza)

- **Marca:** o catálogo só tem Identidade e Site.
- **Minerador:**
  - o botão da tela é "Aprovar e enviar";
  - Volume sem prévia de custo, apesar do que dizem o catálogo e a SDD;
  - "Resultados" ainda fala em "SERP nas 4 lentes".
- **Arquiteto:**
  - os nomes do passo pago de SERP divergem;
  - "Validar SERP" ainda aparece em títulos;
  - botões do catálogo que não existem na tela;
  - Links internos aparecem como grátis, mas a prévia cita IA;
  - Reforçar publicados: a keyword nova já é incorporada, não vira sugestão.
- **Radar:**
  - o caminho do Exportar é outro;
  - o Especialista usa IA ("Sugestões por IA");
  - os inícios pagos não pedem confirmação.
- **Redator:**
  - "Aprovar para Publicações" não existe;
  - a escrita com IA é paga, apesar do que diz o catálogo.
- **Publicações:**
  - o envio não registra o destino nem a URL;
  - Fila, exportação e atualização não estão no catálogo.

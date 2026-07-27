# Documento de Requisitos do Produto (PRD) - Minerador Key

---

## 📅 Visão Geral & Histórico

O **Minerador Key** é um ecossistema inteligente de triagem de palavras-chave, focado em SEO Local e KGR (*Keyword Golden Ratio*), projetado para otimizar fluxos de tráfego orgânico no mercado brasileiro sem dependência contínua de ferramentas caras. 

O projeto está dividido em duas etapas de desenvolvimento. Este documento consolida a **Etapa 1** (totalmente entregue, testada e em funcionamento) e serve como base para o planejamento das próximas fases.

---

## 🏆 Etapa 1: Funcionalidades Desenvolvidas e Prontas para Uso

### 1. Planilha de Triagem & Interface do Usuário (Dashboard)
* **Visual Premium e Confortável**: Layout escuro premium desenvolvido em Next.js com foco em acessibilidade e conforto visual. Tipografia sans-serif de `12.5px font-sans` e baixos contrastes (`slate-300` e cinzas suaves) para evitar a fadiga ocular durante longas sessões de análise.
* **Numeração de Linhas no Canto Esquerdo**: Coluna de índice (`#`) posicionada no lado esquerdo da tabela para fornecer numeração sequencial (1, 2, 3...) de todas as palavras exibidas.
* **Status Interativo**: Dropdown interativo na tabela com opções de status: `Bruto`, `Aprovado`, `Rejeitado` e `Publicado`.
* **Alerta Vermelho para Palavras "Publicadas"**: Termos marcados como `Publicado` recebem destaque visual vermelho (`bg-rose-955/10 border-l-2 border-l-rose-500`), texto em destaque vermelho (`text-rose-455`) e um selo de aviso `🔒 ⚠️`. O tooltip informa: *"Indexado & Publicado em Produção - Slug e Canonical NÃO PODEM ser removidos/alterados!"*, prevenindo deleções acidentais.
* **Edição de Intenção e Nicho na Célula**:
  * **Intenção**: Menu de seleção nativo na tabela com opções puras (*Informativo*, *Comercial*, *Vendas*).
  * **Nicho**: Menu dropdown interativo nativo na tabela com opções explícitas (*Odontologia*, *Advocacia*, *Saúde*, *Estética*, *Fitness*, *Serviços*, *Marketing*, *Geral*). 
* **Edição em Massa (Bulk Update)**: Ao selecionar múltiplos checkboxes, alterar o status, intenção, nicho ou silo de qualquer palavra selecionada na linha replica a modificação instantaneamente para todo o grupo no Supabase e no estado local.
* **Ordenação Dinâmica por Coluna**: Cabeçalhos clicáveis para ordenar palavras de forma bidirecional (Crescente/Decrescente ou A-Z/Z-A) com indicadores de setas reativos (`ArrowUpDown`).
* **Linhas Expansíveis (Acordeom de Análise)**: Clique na palavra-chave expande uma sublinha ocupando a largura total (`colSpan={10}`) que renderiza dados comportamentais complexos em formato de cartões estilizados de 3 a 6 chaves (ex: *Urgência/Tempo*, *Intenção Local*, *Perfil B2B*, *Consciência*, *Poder Aquisitivo*).

---

### 2. Mineração, Importação & Deduplicação de Dados
* **Extensão do Chrome (Minerador Extensão)**:
  * Desenvolvida com suporte ao Supabase para salvar palavras mineradas do Google Autocomplete diretamente na lista/silo selecionado.
  * O script de background realiza uma deduplicação prévia, consultando os termos já salvos e enviando apenas as palavras inéditas para o banco de dados.
* **Alerta e Banner de Palavras Duplicadas**:
  * O dashboard verifica palavras duplicadas na visualização atual e exibe um banner de alerta no topo caso existam repetições (mesmo que estejam em silos diferentes).
  * O banner apresenta o botão **"Apagar Duplicadas (Manter apenas 1)"** que limpa ocorrências repetidas no banco em lote ou a opção de ignorar o alerta.
* **Importação Manual (Copiar/Colar)**:
  * Modal que permite colar listas livres de termos (uma palavra por linha).
  * Inclui opções de `Intenção Inicial` e `Nicho Inicial` definidos como **"Automático"**. O sistema roda as heurísticas no frontend e salva as palavras com as intenções e nichos resolvidos em strings puras no banco de dados.
* **Importador CSV tolerante**:
  * Parser com biblioteca PapaParse que realiza o mapeamento inteligente dos cabeçalhos (`Keyword`/`Palavra`, `Resultados`, `Volume`, `Status` e `Intent`) independente de caixa (case-insensitive) e faz insert em lote (bulk insert).

---

### 3. Cérebro e Integração com Inteligência Artificial (DeepSeek)
* **Processador de Nicho & Intenção Reais (`/api/process-intent-niche`)**:
  * Botão de ação em lote no rodapé que aciona a API do DeepSeek configurada especificamente com engenharia de busca voltada para a psicologia do mercado brasileiro (Google Brasil).
  * A IA classifica a real intenção e nicho de mercado das palavras selecionadas e salva os valores definitivos correspondentes no banco de dados.
* **Análise Semântica Comportamental (`/api/analyze`)**:
  * Fila de processamento em lote com barra de progresso no rodapé que envia os termos sequencialmente para extração das dimensões sintáticas e emocionais da palavra.
* **Mesclagem de Campos JSONB (JSON Merge)**:
  * O backend realiza o merge (mesclagem) das análises de IA com o objeto JSONB `analise_semantica` do Supabase em vez de substituí-lo. Isso resolve em definitivo o bug em que o nicho manual sumia após a execução da análise semântica.
* **Fallback Inteligente de API**:
  * Se a chave de API oficial `DEEPSEEK_API_KEY` não for configurada no servidor (.env.local), a rota faz o fallback para o gateway `OPENROUTER_API_KEY` com o modelo `deepseek/deepseek-v4-pro`.

---

### 4. Exportação Local Premium
* **Renomear Planilha na Exportação**:
  * Clicar em "Exportar Planilha" abre um modal perguntando o nome do arquivo a ser salvo, sugerindo o padrão `kgr-export-YYYY-MM-DD`.
* **Achatamento Dinâmico de Colunas**:
  * A exportação local varre todas as chaves dinâmicas exclusivas geradas pela IA dentro de `analise_semantica` dos itens selecionados e as achata como colunas adicionais formatadas no arquivo.
* **Compatibilidade com Excel Brasileiro**:
  * Gravação do arquivo CSV utilizando o caractere delimitador de ponto e vírgula (`;`) e prefixando com a marcação BOM do UTF-8 (`\uFEFF`) para que acentos e cedilhas sejam lidos perfeitamente no Excel sem erros de encoding.

---

## 🛠️ Banco de Dados (Supabase Schema)

* **Tabela `listas_kgr` (Silos/Projetos)**:
  * `id` (uuid, primary key)
  * `nome` (text)
  * `nicho` (text)
  * `created_at` (timestamp)
* **Tabela `keywords_kgr` (Palavras-Chave)**:
  * `id` (uuid, primary key)
  * `keyword` (text)
  * `location` (text)
  * `results_allintitle` (integer)
  * `volume_search` (integer)
  * `kgr_score` (numeric)
  * `intent` (text)
  * `status` (text)
  * `lista_id` (uuid, foreign key apontando para `listas_kgr.id`)
  * `analise_semantica` (jsonb - contendo chaves dinâmicas como `nicho_override` e cartões comportamentais)
  * `created_at` (timestamp)

---

## 🚀 Próxima Etapa (Etapa 2)

Com as bases e a triagem robusta concluídas na Etapa 1, os desenvolvimentos futuros deverão focar em automação e geração de conteúdo SEO:
1. **Automação de Conteúdo**: Sugestão de títulos otimizados, pautas, tópicos (outlines) e slugs inteligentes diretamente baseados nos cartões de psicologia de busca do acordeom da palavra.
2. **Integração Externa de Resultados**: Automatizar consultas em lote de APIs de SEO parceiras (ou crawlers locais) para o preenchimento de `allintitle` e volume de buscas de forma programada.
3. **Módulo de Relatórios**: Exportação visual das métricas de KGR e potencial de tráfego estimado de cada silo.

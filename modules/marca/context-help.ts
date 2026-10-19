import type { ContextHelpAreaDefinition, ContextHelpTopic } from "@/lib/context-help";

/*
 * TUTORIAL DA MARCA no "?" global (dono, 2026-10-18: "escreve toda a
 * usabilidade no ícone de informações no ícone do global, como se fosse um
 * tutorial da usabilidade em cada área ou etapa").
 *
 * "Como funciona esta área" e um tópico por etapa, na ordem das abas da tela.
 * Todo botão entre aspas curvas duplas é o rótulo exato da tela, conferido por
 * `tests/context-help.test.mts`; exemplo e botão de outra área usam aspas
 * simples. Mudou um botão ou uma etapa, muda na mesma entrega o InfoHint,
 * este tutorial e o catálogo `lib/agent/platform-catalog.ts`.
 */

const TUTORIAL_TOPICS: readonly ContextHelpTopic[] = [
  {
    id: "como-funciona",
    title: "Como funciona esta área",
    summary: "A Marca guarda quem a marca é e o que ela já publicou. Tudo o que as outras áreas fazem herda daqui: o site, a identidade, a voz e a equipe.",
    description: "A Marca é o começo da linha: Marca → Minerador → Arquiteto → Radar → Redator → Publicações. Aqui você conecta o site (para a plataforma saber o que já está publicado), descreve a identidade da marca, envia a Skill de voz e cadastra especialistas e colaboradores. Nada aqui custa dinheiro.",
    sections: [
      { heading: "As abas do topo", body: "“Visão geral” resume a marca. “Site e Sitemap”, “Identidade da marca”, “Skills e prompts”, “Equipe” e “Configurações” são as etapas abaixo. “Materiais” ainda não tem função própria." },
      { heading: "O que é gravado e quando", body: "Cada etapa grava no clique do botão de salvar dela. A identidade da marca só vale depois de “Aprovar”; a Skill de voz só vale depois de “Ativar”." },
    ],
    howToUse: [
      "Em “Site e Sitemap”, salve o site e sincronize o sitemap.",
      "Em “Identidade da marca”, preencha, salve a versão e aprove.",
      "Em “Skills e prompts”, envie a Skill de voz e ative.",
      "Em “Equipe”, cadastre os especialistas e convide colaboradores.",
      "Em “Configurações”, confira nome, nicho e localização.",
    ],
    keywords: ["marca", "tutorial", "como funciona", "passo a passo", "começar", "nova marca", "ordem"],
  },
  {
    id: "etapa-site",
    title: "1 · Site e Sitemap",
    summary: "Conecta o site da marca para a plataforma saber o que já está publicado: URL, título e H1 de cada página.",
    description: "Sem o sitemap sincronizado, o Minerador e o Arquiteto não sabem quais páginas já existem. Faça isto antes de planejar Silos. Na mesma aba, as keywords das páginas publicadas podem ser levadas ao Minerador.",
    sections: [
      { heading: "Quando usar", body: "Na marca nova, e de novo quando o site ganhar páginas." },
      { heading: "O que acontece", body: "“Salvar site” grava o endereço principal. “Sincronizar” lê o sitemap e grava o catálogo de páginas. “Verificar selecionadas” confere cada página. “Ver keywords”, na linha de um conteúdo, abre o modo “Keywords” com as candidatas daquela página. Em “Importação e lotes”, o botão que leva as keywords ao Minerador primeiro mostra a prévia: só “Confirmar importação” grava as keywords no Minerador." },
      { heading: "Custo", body: "Grátis. A plataforma só lê o próprio site da marca." },
      { heading: "Quem decide", body: "Você escolhe o que sincronizar, verificar e importar." },
      { heading: "Depois", body: "Preencha a identidade da marca (etapa 2). As keywords importadas aparecem no Minerador para seguir a linha de lá." },
      { heading: "Situações comuns", body: "O sitemap precisa ser do mesmo domínio do site principal. “Testar” confere o sitemap sem gravar nada. Página publicada nunca muda de URL por aqui." },
    ],
    howToUse: [
      "Informe o site principal e clique em “Salvar site”.",
      "Clique em “Adicionar sitemap”, depois em “Sincronizar”.",
      "No “Catálogo de conteúdos”, marque as páginas e clique em “Verificar selecionadas”.",
      "Para levar as keywords ao Minerador: “Preparar importação”, confira a prévia em “Importação e lotes” e clique em “Confirmar importação” (ou “Voltar e revisar”).",
    ],
    keywords: ["site", "sitemap", "sincronizar", "publicado", "catálogo", "páginas", "verificar", "importar keywords"],
  },
  {
    id: "etapa-identidade",
    title: "2 · Identidade da marca",
    summary: "Descreve quem a marca é: posicionamento, público, voz, objetivos, diferenciais e as fontes de autoridade que o Radar pode citar.",
    description: "A identidade orienta todas as áreas: o Arquiteto, o Radar e o Redator leem daqui o público, a voz e o que a marca não pode afirmar.",
    sections: [
      { heading: "Quando usar", body: "Na marca nova e sempre que o posicionamento mudar." },
      { heading: "O que acontece", body: "“Salvar versão” grava uma versão nova, ainda em rascunho. “Aprovar” faz essa versão valer. Posicionamento, público, voz e objetivos são obrigatórios para salvar." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você aprova a versão. A IA nunca aprova." },
      { heading: "Depois", body: "Envie a Skill de voz (etapa 3)." },
      { heading: "Situações comuns", body: "Em “Fontes de autoridade”, um domínio por linha; vazio vale a lista sugerida (“Usar a lista sugerida” preenche)." },
    ],
    howToUse: [
      "Preencha os campos da identidade.",
      "Clique em “Salvar versão”.",
      "Confira e clique em “Aprovar”.",
    ],
    keywords: ["identidade", "dna da marca", "posicionamento", "público", "voz", "objetivos", "diferenciais", "fontes de autoridade", "aprovar"],
  },
  {
    id: "etapa-skills",
    title: "3 · Skills e prompts (a voz da marca)",
    summary: "Guarda a Skill de voz da marca: como ela escreve, o nicho, o fechamento e o CTA. O Radar e o Redator seguem essa voz.",
    description: "A Skill é um arquivo de texto (.md) com as orientações de escrita da marca. A diretriz geral da plataforma vale para todas as marcas; a Skill traz o que é só desta.",
    sections: [
      { heading: "Quando usar", body: "Na marca nova e quando a voz mudar." },
      { heading: "O que acontece", body: "“Adicionar Skill” abre o formulário; “Salvar Skill” grava. A Skill passa por “Enviar para aprovação” e só vale depois de “Ativar”. “Substituir arquivo” cria uma versão nova; “Arquivar” tira a Skill de uso. Em “Abrir”, “Renomear” troca só o nome: grava uma versão nova em rascunho com o mesmo arquivo, que vale depois de “Enviar para aprovação” e “Ativar”." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "Você ativa a Skill." },
      { heading: "Depois", body: "Cadastre a equipe e os especialistas (etapa 4)." },
    ],
    howToUse: [
      "Clique em “Adicionar Skill”, escolha o arquivo e clique em “Salvar Skill”.",
      "Na linha da Skill, clique em “Enviar para aprovação”.",
      "Clique em “Ativar”.",
    ],
    keywords: ["skill", "voz", "prompts", "escrita", "cta", "fechamento", "nicho", "ativar", "arquivo md"],
  },
  {
    id: "etapa-equipe",
    title: "4 · Equipe: especialistas e colaboradores",
    summary: "Cadastra os especialistas que dão autoridade aos artigos e convida as pessoas que trabalham na marca.",
    description: "O especialista responde às pautas do Radar (pelo Telegram ou escrevendo direto na plataforma) e assina o fechamento do artigo. O colaborador acessa a marca pelo convite.",
    sections: [
      { heading: "Quando usar", body: "Antes de investigar no Radar, para o especialista receber as pautas." },
      { heading: "O que acontece", body: "Em “Especialistas externos”, “Adicionar” grava o especialista e “Conectar Telegram” gera o link de conexão; “Revogar Telegram” desliga. Em “Equipe e acessos”, “Convidar colaborador” abre o formulário e “Criar convite pendente” grava o convite. O convite só dá acesso depois de aceito." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "O dono da marca convida e cadastra." },
      { heading: "Depois", body: "Confira as configurações (etapa 5)." },
      { heading: "Situações comuns", body: "Desde 18/10, “Cancelar” grava no servidor e a linha do convite muda depois da confirmação; só convite pendente pode ser cancelado. “Suspender” e “Revogar” ficam desligados: o servidor ainda não guarda esses estados. Para impedir o uso de um convite pendente, use “Cancelar”." },
    ],
    howToUse: [
      "Em “Especialistas externos”, preencha e clique em “Adicionar”.",
      "Clique em “Conectar Telegram” e envie o link ao especialista.",
      "Em “Equipe e acessos”, clique em “Convidar colaborador” e depois em “Criar convite pendente”.",
    ],
    keywords: ["equipe", "especialista", "telegram", "convite", "colaborador", "acesso", "e-e-a-t"],
  },
  {
    id: "etapa-configuracoes",
    title: "5 · Configurações",
    summary: "Nome, nicho e localização da marca. A localização diz onde fica o mercado da marca, e a SERP passa a ser lida nesse lugar.",
    description: "Os dados operacionais da marca. O endereço do site fica na aba “Site e Sitemap”.",
    sections: [
      { heading: "Quando usar", body: "Na marca nova, e quando o nicho ou o mercado mudar." },
      { heading: "O que acontece", body: "“Salvar configuração” grava nome, nicho e “Localização”. A coleta da SERP no Arquiteto e no Radar usa a localização do mercado da marca (entrando nesta versão)." },
      { heading: "Custo", body: "Grátis." },
      { heading: "Quem decide", body: "O dono da marca." },
      { heading: "Depois", body: "Siga para o Minerador e comece pelas keywords." },
    ],
    howToUse: [
      "Confira nome, nicho e “Localização”.",
      "Clique em “Salvar configuração”.",
    ],
    keywords: ["configurações", "nome", "nicho", "localização", "mercado", "serp", "cidade", "país"],
  },
];

export const MARCA_CONTEXT_HELP: ContextHelpAreaDefinition = {
  area: "marca",
  title: "Marca",
  topics: TUTORIAL_TOPICS,
};

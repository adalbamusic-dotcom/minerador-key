import Link from "next/link";

/*
 * Página pública. Não há sessão aqui: nada do que aparece depende de marca,
 * agência ou dado remoto. O texto do diferencial é o do dono da plataforma,
 * reproduzido na íntegra (2026-10-07).
 */

const ESTACOES = [
  { nome: "Marca", papel: "Contexto, voz e site da marca viram a base de tudo que vem depois." },
  { nome: "Minerador", papel: "Descoberta e qualificação de palavras-chave com métricas reais de demanda." },
  { nome: "Arquiteto", papel: "Artigos, silos e links internos formam a arquitetura editorial." },
  { nome: "Radar", papel: "Investigação da SERP, dos concorrentes e das evidências do artigo." },
  { nome: "Redator", papel: "Planejamento e escrita do conteúdo a partir do dossiê congelado." },
  { nome: "Publicações", papel: "Registro do que foi publicado, com URL, slug e canonical protegidos." },
] as const;

const DIFERENCIAL = [
  "Crie agrupamentos semânticos de palavras-chave, descubra nichos de mercado inexplorados entre mais de 1.000 categorias e realize análises abrangentes da concorrência. Examine as estratégias de SEO dos rivais analisando seus portfólios de palavras-chave, perfis de backlinks, páginas de melhor desempenho e dinâmicas de ranqueamento. Monitore o posicionamento de domínios em diferentes regiões, audite problemas técnicos do site, identifique lacunas de conteúdo e avalie oportunidades de palavras-chave com base em métricas de volume e dificuldade.",
  "No Minerador Key você navega por essas funcionalidades de forma natural — combinando dados de múltiplas fontes, validando hipóteses de SEO em tempo real e elaborando estratégias abrangentes por meio de um diálogo interativo.",
] as const;

const botaoSecundario = "inline-flex min-h-10 items-center rounded-md border border-foreground/20 px-4 py-2 text-sm font-semibold transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const botaoPrimario = "inline-flex min-h-10 items-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";

export default function HomePage() {
  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
    <div className="mx-auto flex max-w-5xl flex-col gap-16 sm:gap-20">
      <header className="flex items-center justify-between gap-4">
        <p className="text-base font-semibold text-accent">Minerador Key</p>
        <Link href="/login" className={botaoSecundario}>Entrar</Link>
      </header>

      <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start" aria-labelledby="home-titulo">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-accent">Plataforma para agências</p>
          <h1 id="home-titulo" className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Estruture o trabalho editorial de cada marca com contexto e método.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-foreground/70">O Minerador Key organiza o fluxo entre estratégia, conteúdo e publicação sem transformar a plataforma em mais um painel disperso.</p>
        </div>
        <div className="max-w-sm rounded-xl border border-foreground/15 bg-foreground/5 p-6 lg:justify-self-end">
          <div className="flex items-baseline justify-between gap-4"><h2 className="text-xl font-semibold">Free</h2><p className="text-lg font-semibold">R$ 0</p></div>
          <p className="mt-3 text-sm leading-6 text-foreground/70">Acesso mediante aprovação administrativa. Sem cartão, cobrança, checkout ou assinatura nesta fase.</p>
          <Link href="/solicitar-acesso" className={`${botaoPrimario} mt-6`}>Solicitar acesso</Link>
        </div>
      </section>

      <section className="max-w-3xl" aria-labelledby="home-diferencial">
        <p className="text-sm font-medium text-accent">Nosso diferencial</p>
        <h2 id="home-diferencial" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Da palavra-chave à estratégia, em um só diálogo.</h2>
        <div className="mt-6 space-y-5">
          {DIFERENCIAL.map((paragrafo) => <p key={paragrafo.slice(0, 24)} className="text-base leading-7 text-foreground/80">{paragrafo}</p>)}
        </div>
      </section>

      <section aria-labelledby="home-fluxo">
        <p className="text-sm font-medium text-accent">Como o trabalho flui</p>
        <h2 id="home-fluxo" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Seis estações, uma cadeia rastreável.</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/70">Cada estação recebe o trabalho consolidado da anterior, acrescenta só a inteligência que lhe pertence e entrega contexto suficiente para que a próxima não precise refazer nada. Versões são imutáveis, decisões são humanas e marcas nunca se misturam.</p>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ESTACOES.map((estacao, indice) => <li key={estacao.nome} className="rounded-md border border-divider bg-surface-subtle p-5">
            <p className="text-sm font-medium text-text-muted">{indice + 1}</p>
            <h3 className="mt-1 text-lg font-semibold">{estacao.nome}</h3>
            <p className="mt-2 text-sm leading-6 text-foreground/70">{estacao.papel}</p>
          </li>)}
        </ol>
      </section>

      <section className="rounded-xl border border-divider bg-surface p-6 sm:p-8" aria-labelledby="home-chat">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-context-accent">Trabalhe também pelo chat</p>
            <h2 id="home-chat" className="mt-3 text-2xl font-semibold tracking-tight">ChatGPT, Claude e outros assistentes operam a plataforma com a sua conta.</h2>
            <p className="mt-4 text-base leading-7 text-foreground/70">Você conecta o assistente que já usa, entra com o seu login e escolhe quais marcas ele pode ler e rascunhar. Ele lê o briefing, pesquisa, escreve e salva rascunhos. Aprovar, publicar e excluir continuam sendo decisões suas, dentro da plataforma.</p>
          </div>
          <Link href="/solicitar-acesso" className={botaoPrimario}>Solicitar acesso</Link>
        </div>
      </section>

      <footer className="border-t border-divider py-6 text-sm text-foreground/60">A solicitação não cria uma agência nem uma conta.</footer>
    </div>
  </main>;
}

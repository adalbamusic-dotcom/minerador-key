"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ListOrdered, Loader2, Plus, Trash2, X } from "lucide-react";
import { GLOBAL_TOPBAR_ACTION_CONTROL } from "@/components/global-topbar-control";
import { internalButton, internalButtonPrimary, internalField } from "@/components/editorial/internal-page-visual";
import { EditorialGroupDot, EditorialGroupTag } from "@/components/editorial/group-tag";
import {
  EDITORIAL_GROUP_COLORS,
  EDITORIAL_GROUP_COLOR_CLASSES,
  EDITORIAL_GROUP_COLOR_LABELS,
  editorialGroupCountLabel,
  type EditorialGroupColor,
  type EditorialGroupSummary,
} from "@/lib/editorial/editorial-groups";
import { DECLARED_PLAN_SCOPE_MAX, SUBJECT_ENTRY_TITLE_MAX, decodeDeclaredPlanFile, normalizeDeclaredPhraseKey, parseDeclaredPlanText, type DeclaredPlanFileEncoding, type DeclaredPlanLockChoice, type DeclaredPlanRole, type DeclaredPlanTextFormat, type DeclaredPlanTextSilo } from "@/lib/minerador/declared-plan";
import { looksLikeSiloPlanText } from "@/lib/minerador/plan-text-detector";
import type { DeclaredPlanApplyArticle, DeclaredPlanCardRow, DeclaredPlanMode, DeclaredPlanPreview, DeclaredPlanReplaceApplied, DeclaredPlanReplaceItem, DeclaredPlanReplacePreview } from "@/lib/minerador/declared-plan-import-core";
import { SubjectConversionDialog } from "./subject-conversion-dialog";
import { SubjectSearchBatchPanel } from "./discovery/subject-search-batch-panel";
import { subjectSearchBatchLines } from "./discovery/subject-search-batch-model";
import { CADASTRO_FOLLOW_UP_TEXTS, cadastroLeftoversToDelete, cadastroReapprovalIds, requestCadastroReapproval, type CadastroReapprovalResult } from "./subject-cadastro-follow-up";

/**
 * CADASTRAR ASSUNTOS — O CARD ÚNICO (SDD
 * `docs/compartilhado/sdd-cadastro-assunto-na-keyword-2026-10-13.md` §3.1).
 *
 * Substitui "Colar Assuntos" do Processador e "Importar plano do Silo": é a
 * única porta para o Assunto. No topo, a COR e o DESTINO (Silo novo, Silo
 * existente ou artigo publicado); em cada linha, o Assunto (título), a
 * keyword que o carrega, os detalhes, o papel/posição e a trava. O Assunto
 * mora DENTRO da keyword: nenhuma linha "Assunto" solta nasce.
 *
 * A tela não grava nada sozinha: fala só com
 * `/api/minerador/marcas/[brandId]/plans/import` (o mesmo núcleo do MCP
 * `declare_silo_plan`). "Gerar prévia" não escreve; "Cadastrar" manda o MESMO
 * pedido da prévia com o `importRequestId` dela e só fica habilitado com
 * `canApply`; qualquer mudança descarta a prévia; o resultado só aparece depois
 * da resposta relida. `409 GROUPS_NOT_AVAILABLE` esconde o recurso.
 *
 * 2026-10-13 · "Silo existente" ganha a escolha Acrescentar | Substituir o plano
 * (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md` §5.2, F1). Na
 * substituição as linhas SÃO o plano novo inteiro (a gravada pode sair, mudar
 * de ordem e de keyword), a prévia mostra as quatro listas com o motivo, e
 * "Substituir o plano" manda o `decisionHash` dela — com algo saindo, só depois
 * do nome da cor digitado. O MESMO núcleo e a MESMA rota do cadastro.
 *
 * 2026-10-16 · o CSV de planejamento (pedido do dono: "reconhecer este tipo de
 * CSV também, reconhecer os campos e preencher"): em "Colar plano em texto", o
 * .csv pode ser aberto ("ou abrir um arquivo .csv") ou arrastado — vira o
 * texto do MESMO campo, lido pelo MESMO leitor. Com vários Silos no texto, o
 * card pede a escolha ("Este texto tem 2 Silos: … — escolha qual cadastrar
 * agora") e preenche o escolhido; um cadastro = um Silo, e o outro continua no
 * mesmo texto. Do CSV entram Silo, papel, ordem, Assunto, keyword, slug e
 * detalhes; as outras colunas são ditas numa linha ("Colunas ignoradas").
 */

const CADASTRO_ROUTE = (brandId: string) => `/api/minerador/marcas/${encodeURIComponent(brandId)}/plans/import`;

type Destino = "new_silo" | "existing_silo" | "published";
type Linha = {
  key: string;
  order: number;
  role: DeclaredPlanRole;
  title: string;
  keyword: string;
  /** 2026-10-16 · o slug do artigo como o dono escreveu ("/silo/artigo/", URL ou "artigo"); vazio = o Arquiteto forma pela keyword. */
  slug: string;
  details: string;
  lock: DeclaredPlanLockChoice;
  /** Já gravada no plano do Silo existente: não sai pelo card ("Tirar do plano" é o caminho). */
  stored: boolean;
  storedLockLabel: string | null;
  /** 2026-10-13 · linha recuperada do histórico (o Assunto saiu da keyword sem liberação): o selo a mostrar. */
  recovered?: string | null;
};
type GroupChoice = { mode: "existing"; groupId: string } | { mode: "new"; name: null; color: EditorialGroupColor };
type SiloDoPlano = { name: string; slug: string | null; objective: string | null };
type CadastroRequest = {
  plan: { silo: SiloDoPlano | null; articles: Array<{ order: number; subject: string; principal: string | null; role: DeclaredPlanRole; scope: string; lock: DeclaredPlanLockChoice; slug?: string | null }> };
  group: GroupChoice;
  destination: { kind: "new_silo" } | { kind: "existing_silo"; groupId: string } | { kind: "published"; url: string };
  /** 2026-10-13 · só no Silo existente com "Substituir o plano" (ausente = acréscimo, o pedido de sempre). */
  planMode?: "replace";
};
type ApplyResult = { groupId: string; planVersion: number; articles: DeclaredPlanApplyArticle[]; createdSubjectIds: string[]; createdPrincipalIds: string[]; reciprocityConfirmed: number; failed: number; notices: string[]; replaced: DeclaredPlanReplaceApplied | null };
type Refusal = { code: string; message: string; blockers: string[] };

/** Os ids que a tela relê depois do `apply`. */
export type DeclaredPlanAppliedIds = {
  subjectIds: string[];
  createdSubjectIds: string[];
  principalIds: string[];
};

const LOCK_LABELS: Record<DeclaredPlanLockChoice, string> = { auto: "Automática (pelo volume)", locked: "Travada", free: "Livre" };
const DESTINO_LABELS: Record<Destino, string> = { new_silo: "Silo novo", existing_silo: "Silo existente", published: "Artigo publicado" };
/** 2026-10-13 · Silo existente (SDD `sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md` §5.2, F1): o mesmo texto do núcleo (`DECLARED_PLAN_MODE_LABELS`). */
const MODO_PLANO_LABELS: Record<DeclaredPlanMode, string> = { append: "Acrescentar", replace: "Substituir o plano" };
const MODO_PLANO_AJUDA: Record<DeclaredPlanMode, string> = {
  append: "As linhas já gravadas aparecem abaixo e não saem por aqui (para tirar um artigo do plano, use “Tirar do plano”). Acrescente as novas; as que não mudarem ficam como estão.",
  replace: "As linhas abaixo SÃO o plano novo inteiro: a linha que você tirar sai do plano pelo “Tirar do plano” (inclusive o Pilar, se o plano novo trouxer outro), e o Assunto pode mudar de keyword. Nada é apagado; a prévia mostra o que fica igual, muda, entra e sai.",
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
let sequencia = 0;
const novaChave = () => `linha-${Date.now()}-${(sequencia += 1)}`;
const linhaVazia = (order: number, role: DeclaredPlanRole): Linha => ({ key: novaChave(), order, role, title: "", keyword: "", slug: "", details: "", lock: "auto", stored: false, storedLockLabel: null });
/** 2026-10-16 · o formato que o leitor único reconheceu no texto colado (o aviso da colagem diz). */
const FORMATO_LABELS: Record<DeclaredPlanTextFormat, string> = {
  lista: "lista numerada",
  blocos: "blocos (Silo, Pilar, Suporte)",
  tabela: "tabela",
  planilha: "planilha (TAB)",
  csv: "CSV com cabeçalho",
};
const groupOfColor = (groups: readonly EditorialGroupSummary[], color: EditorialGroupColor) => groups.find(group => group.status === "active" && group.color === color) ?? null;
/** 2026-10-16 · o .csv aberto ou arrastado em "Colar plano em texto": o mesmo campo, o mesmo leitor; nada é gravado. */
const ARQUIVO_DO_PLANO = /\.(?:csv|tsv|txt)$/i;
const ARQUIVO_DO_PLANO_MAX_BYTES = 2_000_000;
const COLADO_MAX = 60000;
const CODIFICACAO_LABELS: Record<DeclaredPlanFileEncoding, string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8",
  "utf-16le": "UTF-16",
  "utf-16be": "UTF-16",
  "windows-1252": "Windows-1252, convertido",
};
type ArquivoDoPlano = { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> };

async function callCadastro(brandId: string, init: { method: "POST"; body: Record<string, unknown> } | { method: "GET"; groupId: string }): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; refusal: Refusal }> {
  const url = init.method === "GET" ? `${CADASTRO_ROUTE(brandId)}?groupId=${encodeURIComponent(init.groupId)}` : CADASTRO_ROUTE(brandId);
  const response = await fetch(url, init.method === "GET"
    ? { method: "GET", cache: "no-store" }
    : { method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(init.body) }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) as Record<string, unknown> : {};
  if (!response || !response.ok || data.success !== true) {
    const diagnostic = data.diagnostic && typeof data.diagnostic === "object" ? data.diagnostic as Record<string, unknown> : {};
    return {
      ok: false,
      refusal: {
        code: typeof data.code === "string" ? data.code : response ? `HTTP_${response.status}` : "NETWORK_ERROR",
        message: typeof data.message === "string" ? data.message : response ? "O cadastro não pôde ser feito agora." : "Sem conexão com o servidor. Nada foi gravado.",
        blockers: strings(diagnostic.blockers),
      },
    };
  }
  return { ok: true, body: data };
}

/** O botão ao lado de "Colar keywords" e "Importar CSV" (mesma geometria compacta). */
export function SubjectCadastroButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={GLOBAL_TOPBAR_ACTION_CONTROL} onClick={onClick} aria-label="Cadastrar Assuntos" title="Cadastrar Assuntos" data-minerador-subject-cadastro>
      <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Cadastrar Assuntos</span>
    </button>
  );
}

export function SubjectCadastroCard({
  brandId,
  groups,
  onClose,
  onApplied,
  onUnavailable,
  initialText = "",
  onDeleteLeftovers,
  onViewInSheet,
  onKeywordsChanged,
}: {
  brandId: string;
  /** 2026-10-13 · plano colado na porta errada ("Colar keywords"/CSV): o card abre com ele e preenche as linhas. */
  initialText?: string;
  /** Os grupos ATIVOS da marca (a cor que já tem grupo leva o cadastro para ele). */
  groups: readonly EditorialGroupSummary[];
  onClose: () => void;
  /** Pode devolver a promessa da releitura: a reaprovação (item 9) espera por ela. */
  onApplied: (applied: DeclaredPlanAppliedIds) => void | Promise<void>;
  onUnavailable: () => void;
  /**
   * Item 9 (SDD acelerar-fluxo 2026-10-13): abre a MESMA confirmação de exclusão
   * do Minerador (prévia do servidor + nome digitado) para as sobras marcadas.
   * Keyword não publicada sai de vez: a planilha não tem lixeira recuperável para ela.
   */
  onDeleteLeftovers?: (keywordIds: string[]) => void;
  /** Item 9: filtra a planilha pela cor do cadastro e seleciona as linhas. */
  onViewInSheet?: (input: { color: EditorialGroupColor; keywordIds: string[] }) => void;
  /** Itens 7 e 9: keywords que mudaram depois do cadastro (sustentações enviadas, reaprovadas), para a planilha reler. */
  onKeywordsChanged?: (keywordIds: string[]) => void;
}) {
  const silosExistentes = groups.filter(group => group.status === "active" && group.origin === "declared_plan" && group.planVersion > 0);
  const [destino, setDestino] = useState<Destino>("new_silo");
  const [color, setColor] = useState<EditorialGroupColor>(EDITORIAL_GROUP_COLORS[0]);
  const [siloName, setSiloName] = useState("");
  const [siloSlug, setSiloSlug] = useState("");
  const [siloObjective, setSiloObjective] = useState("");
  const [existingGroupId, setExistingGroupId] = useState("");
  /** 2026-10-13 · Silo existente: "Acrescentar" (padrão) ou "Substituir o plano". */
  const [modoPlano, setModoPlano] = useState<DeclaredPlanMode>("append");
  /** Na substituição, o Silo (nome, slug, objetivo) que veio do texto colado; sem ele, fica o gravado. */
  const [siloDoTexto, setSiloDoTexto] = useState<SiloDoPlano | null>(null);
  /** A confirmação da substituição quando algo sai: o nome da cor digitado. */
  const [corDigitada, setCorDigitada] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() => [linhaVazia(1, "Pilar")]);
  const [colado, setColado] = useState(initialText);
  const [colagemAviso, setColagemAviso] = useState<string | null>(null);
  /** 2026-10-16 · o texto traz mais de um Silo (o CSV de planejamento): a escolha de qual cadastrar agora. */
  const [silosDoTexto, setSilosDoTexto] = useState<DeclaredPlanTextSilo[]>([]);
  const [siloDoTextoEscolhido, setSiloDoTextoEscolhido] = useState<string | null>(null);
  /** Os Silos do texto já cadastrados nesta abertura do card (o outro continua disponível no mesmo texto). */
  const [silosCadastrados, setSilosCadastrados] = useState<string[]>([]);
  /** 2026-10-16 · as colunas do cabeçalho que o plano não usa (uma linha informativa). */
  const [colunasIgnoradas, setColunasIgnoradas] = useState<string[]>([]);
  const [arquivoAviso, setArquivoAviso] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const arquivoRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "previewing" | "applying">("idle");
  const [preview, setPreview] = useState<{ request: CadastroRequest; importRequestId: string; result: DeclaredPlanPreview } | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  /** Item 9 (SDD acelerar-fluxo 2026-10-13): decisões do dono na prévia; NUNCA marcadas por padrão. */
  const [excluirSobras, setExcluirSobras] = useState(false);
  const [reaprovar, setReaprovar] = useState(false);
  const [reaprovacao, setReaprovacao] = useState<CadastroReapprovalResult | "running" | null>(null);
  const [exclusaoPedida, setExclusaoPedida] = useState(0);
  /** 2026-10-13 · "Converter formato anterior" (SDD `sdd-conversao-assunto-legado-2026-10-13.md`). */
  const [conversaoAberta, setConversaoAberta] = useState(false);
  const conversaoAbertaRef = useRef(false);
  useEffect(() => { conversaoAbertaRef.current = conversaoAberta; }, [conversaoAberta]);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const ids = { title: useId(), paste: useId(), name: useId(), slug: useId(), objective: useId(), url: useId(), existing: useId(), confirm: useId() };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current && !conversaoAbertaRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Qualquer mudança: a prévia anterior não vale mais. */
  const invalidate = () => {
    setPreview(null);
    setApplied(null);
    setRefusal(null);
    setExcluirSobras(false);
    setReaprovar(false);
    setReaprovacao(null);
    setExclusaoPedida(0);
    setCorDigitada("");
  };
  const substituir = destino === "existing_silo" && modoPlano === "replace";
  const mudarLinha = (key: string, patch: Partial<Linha>) => {
    setLinhas(current => current.map(linha => linha.key === key ? { ...linha, ...patch } : linha));
    invalidate();
  };
  const acrescentarLinha = () => {
    setLinhas(current => [...current, linhaVazia(Math.max(0, ...current.map(linha => linha.order)) + 1, destino === "new_silo" && !current.length ? "Pilar" : "Suporte")]);
    invalidate();
  };
  const tirarLinha = (key: string) => {
    // Na substituição, a linha gravada também sai (ela vai para a lista "Sai" da prévia).
    setLinhas(current => current.filter(linha => linha.key !== key || (linha.stored && !substituir)));
    invalidate();
  };

  /**
   * "Colar plano em texto": o parser de sempre preenche o topo e as linhas.
   * 2026-10-16 · texto com vários Silos (o CSV de planejamento): nada é
   * preenchido até o dono escolher o Silo (`siloName`); escolhido, o MESMO
   * leitor devolve só aquele Silo e o card preenche como sempre.
   */
  const preencherDoTexto = (texto: string = colado, siloName: string | null = null) => {
    if (!texto.trim()) return;
    const todos = parseDeclaredPlanText(texto);
    const silosLidos = todos.silos ?? [];
    setSilosDoTexto(silosLidos);
    setColunasIgnoradas(todos.ignoredColumns ?? []);
    const escolhido = silosLidos.length > 1 ? silosLidos.find(silo => siloName !== null && silo.name === siloName)?.name ?? null : null;
    setSiloDoTextoEscolhido(escolhido);
    if (silosLidos.length > 1 && !escolhido) {
      setColagemAviso(`Formato: ${todos.format ? FORMATO_LABELS[todos.format] : "texto"}. Escolha abaixo qual Silo cadastrar agora; as linhas são preenchidas com ele.`);
      invalidate();
      return;
    }
    const lido = escolhido ? parseDeclaredPlanText(texto, { siloName: escolhido }) : todos;
    if (destino === "new_silo") {
      if (escolhido) {
        // Trocar de Silo do texto troca o topo inteiro (nada do Silo anterior fica).
        setSiloName(lido.silo.name ?? "");
        setSiloSlug(lido.silo.rawSlug ?? "");
        setSiloObjective(lido.silo.objective ?? "");
      } else {
        if (lido.silo.name) setSiloName(lido.silo.name);
        if (lido.silo.rawSlug) setSiloSlug(lido.silo.rawSlug);
        if (lido.silo.objective) setSiloObjective(lido.silo.objective);
      }
    }
    const lidas = lido.articles.map(article => ({ ...linhaVazia(article.order, article.role), title: article.subject, keyword: article.principal ?? "", slug: article.rawSlug ?? "", details: article.scope, lock: article.lock ?? "auto" as const }));
    const formato = lido.format ? ` (formato: ${FORMATO_LABELS[lido.format]})` : "";
    // No Silo existente, o artigo colado que já está gravado (mesma keyword ou mesmo título) fica como está.
    const chave = (value: string) => value.trim().toLocaleLowerCase("pt-BR");
    const gravadas = linhas.filter(linha => linha.stored);
    const casa = (alvo: Linha, linha: Linha) => Boolean((alvo.keyword && linha.keyword && chave(alvo.keyword) === chave(linha.keyword)) || (alvo.title && chave(alvo.title) === chave(linha.title)));
    const jaGravada = (linha: Linha) => gravadas.some(gravada => casa(gravada, linha));
    /*
     * 2026-10-13 · "Substituir o plano": o texto colado vira o plano novo INTEIRO.
     * A linha gravada (ou recuperada do histórico) que o texto traz de novo, pela
     * keyword ou pelo título, guarda a trava manual quando o texto não diz
     * "Trava:" e completa só o título/detalhes vazios; a que o texto não traz vai
     * para "Sai" na prévia.
     */
    if (substituir) {
      const atuais = linhas.filter(linha => linha.stored || linha.recovered);
      const plano = lido.articles.map((article, index) => {
        const lida = lidas[index];
        const atual = atuais.find(linha => casa(linha, lida)) ?? null;
        if (!atual) return lida;
        return { ...lida, key: atual.key, stored: atual.stored, storedLockLabel: atual.storedLockLabel, recovered: atual.recovered ?? null, lock: article.lock ?? atual.lock, title: lida.title.trim() ? lida.title : atual.title, slug: lida.slug.trim() ? lida.slug : atual.slug, details: lida.details.trim() ? lida.details : atual.details };
      });
      setLinhas(plano);
      // 2026-10-16 · o slug tirado dos endereços dos artigos não é pedido de troca: o Silo gravado fica com o dele.
      setSiloDoTexto(lido.silo.name ? { name: lido.silo.name, slug: lido.silo.slugDerived ? null : lido.silo.rawSlug ?? null, objective: lido.silo.objective ?? null } : null);
      const casadas = plano.filter(linha => linha.stored || linha.recovered).length;
      const foraDoTexto = atuais.length - casadas;
      setColagemAviso(`O texto vira o plano novo inteiro${formato}: ${plano.length} artigo(s)${casadas ? `, ${casadas} casado(s) com as linhas gravadas ou recuperadas` : ""}${foraDoTexto > 0 ? `; ${foraDoTexto} linha(s) gravada(s) fora do texto vão para “Sai” na prévia` : ""}${lido.silo.name ? `; Silo do texto: ${lido.silo.name}` : ""}${lido.unparsed.length ? `; ${lido.unparsed.length} linha(s) não entendida(s) ficaram de fora` : ""}. Confira as linhas antes da prévia.`);
      invalidate();
      return;
    }
    // 2026-10-13 · a linha recuperada do histórico casa pela keyword (ou pelo título) e só ganha o que FALTA.
    const recuperadas = linhas.filter(linha => !linha.stored && linha.recovered);
    let completadas = 0;
    const recuperadasAgora = recuperadas.map(recuperada => {
      const lida = lidas.find(linha => casa(recuperada, linha));
      if (!lida) return recuperada;
      const proxima = { ...recuperada, details: recuperada.details.trim() ? recuperada.details : lida.details, title: recuperada.title.trim() ? recuperada.title : lida.title, slug: recuperada.slug.trim() ? recuperada.slug : lida.slug };
      if (proxima.details !== recuperada.details || proxima.title !== recuperada.title || proxima.slug !== recuperada.slug) completadas += 1;
      return proxima;
    });
    const novas = lidas.filter(linha => !jaGravada(linha) && !recuperadas.some(recuperada => casa(recuperada, linha)));
    setLinhas([...gravadas, ...recuperadasAgora, ...novas]);
    const repetidas = lidas.length - novas.length - recuperadas.filter(recuperada => lidas.some(linha => casa(recuperada, linha))).length;
    setColagemAviso(`${novas.length} artigo(s) lido(s) do texto${formato}${lido.silo.name && destino === "new_silo" ? `; Silo: ${lido.silo.name}` : ""}${repetidas ? `; ${repetidas} já gravado(s) no Silo ficam como estão` : ""}${recuperadas.length ? `; ${completadas} linha(s) recuperada(s) do histórico completada(s) só no que faltava` : ""}${lido.unparsed.length ? `; ${lido.unparsed.length} linha(s) não entendida(s) ficaram de fora` : ""}. Confira as linhas antes da prévia.`);
    invalidate();
  };

  // O texto trazido de outra porta preenche as linhas uma vez, ao abrir (nada é gravado: a prévia continua sendo do dono).
  const preencheuInicial = useRef(false);
  useEffect(() => {
    if (preencheuInicial.current || !initialText.trim()) return;
    preencheuInicial.current = true;
    preencherDoTexto();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 2026-10-13 · colar o plano em QUALQUER campo do card preenche tudo: o dono
   * colou o plano no "Nome do Silo" (campo de uma linha juntou o texto) e as
   * linhas ficaram vazias, à espera de "Preencher as linhas".
   */
  const colarPlano = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const texto = event.clipboardData.getData("text");
    if (!looksLikeSiloPlanText(texto)) return;
    event.preventDefault();
    setColado(texto);
    setArquivoAviso(null);
    preencherDoTexto(texto);
  };

  /** 2026-10-16 · escolher, entre os Silos do texto, o que cadastrar agora: o MESMO texto, o MESMO leitor. */
  const escolherSiloDoTexto = (nome: string | null) => {
    if (busyRef.current || nome === null) return;
    preencherDoTexto(colado, nome);
  };

  /**
   * 2026-10-16 · "ou abrir um arquivo .csv" / arrastar o .csv: lê o arquivo
   * (UTF-8, com ou sem BOM, ou Windows-1252) para o MESMO campo de texto e
   * preenche pelo MESMO leitor. Não é etapa nova e nada é gravado.
   */
  const abrirArquivo = async (arquivo: ArquivoDoPlano | null | undefined) => {
    if (!arquivo || busyRef.current) return;
    if (!ARQUIVO_DO_PLANO.test(arquivo.name)) { setArquivoAviso(`“${arquivo.name}” não é um .csv: abra o .csv do plano (ou cole o texto).`); return; }
    if (arquivo.size > ARQUIVO_DO_PLANO_MAX_BYTES) { setArquivoAviso(`“${arquivo.name}” passa de 2 MB: um plano de Silo cabe em bem menos. Nada foi lido.`); return; }
    let lido: ReturnType<typeof decodeDeclaredPlanFile>;
    try {
      lido = decodeDeclaredPlanFile(await arquivo.arrayBuffer());
    } catch {
      if (mountedRef.current) setArquivoAviso(`Não foi possível ler “${arquivo.name}”. Nada foi gravado.`);
      return;
    }
    if (!mountedRef.current) return;
    if (lido.text.length > COLADO_MAX) { setArquivoAviso(`“${arquivo.name}” passa de ${COLADO_MAX.toLocaleString("pt-BR")} caracteres. Nada foi lido.`); return; }
    setColado(lido.text);
    setArquivoAviso(`Arquivo “${arquivo.name}” aberto (${CODIFICACAO_LABELS[lido.encoding]}${lido.repaired ? ", acentos corrigidos" : ""}). Nada foi gravado.`);
    preencherDoTexto(lido.text);
  };
  const escolherArquivo = (event: ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0] ?? null;
    event.target.value = "";
    void abrirArquivo(arquivo);
  };
  const temArquivo = (event: DragEvent<HTMLElement>) => [...(event.dataTransfer?.types ?? [])].includes("Files");
  const arrastarSobre = (event: DragEvent<HTMLElement>) => {
    if (!temArquivo(event)) return;
    event.preventDefault();
    if (!arrastando) setArrastando(true);
  };
  const soltarArquivo = (event: DragEvent<HTMLElement>) => {
    if (!temArquivo(event)) return;
    event.preventDefault();
    setArrastando(false);
    void abrirArquivo(event.dataTransfer.files?.[0] ?? null);
  };

  /** Silo existente: as linhas gravadas aparecem no formato do card (leitura compatível). */
  const escolherSiloExistente = async (groupId: string) => {
    setExistingGroupId(groupId);
    invalidate();
    setLinhas([]);
    setSiloDoTexto(null);
    // 2026-10-16 · as linhas passam a ser as gravadas: a escolha do Silo do texto volta a ser feita (o clique preenche).
    setSiloDoTextoEscolhido(null);
    if (!groupId || busyRef.current) return;
    busyRef.current = true;
    setPhase("loading");
    try {
      const answer = await callCadastro(brandId, { method: "GET", groupId });
      if (!mountedRef.current) return;
      if (!answer.ok) {
        if (answer.refusal.code === "GROUPS_NOT_AVAILABLE") { onUnavailable(); onClose(); return; }
        setRefusal(answer.refusal);
        return;
      }
      const rows = (Array.isArray(answer.body.rows) ? answer.body.rows : []) as DeclaredPlanCardRow[];
      // 2026-10-13 · a linha recuperada do histórico NÃO está no plano gravado: entra como nova, com o selo (o dono confere e cadastra).
      setLinhas(rows.map(row => ({ key: novaChave(), order: row.order, role: row.role, title: row.title, keyword: row.keyword ?? "", slug: row.slug ?? "", details: row.details, lock: row.lock, stored: !row.recovered, storedLockLabel: row.lockLabel, recovered: row.recovered?.label ?? null })));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase("idle");
    }
  };

  /**
   * 2026-10-13 · trocar entre "Acrescentar" e "Substituir o plano". Voltar a
   * acrescentar relê o plano gravado (as linhas tiradas na substituição voltam).
   */
  const escolherModoPlano = (modo: DeclaredPlanMode) => {
    if (modo === modoPlano || busyRef.current) return;
    setModoPlano(modo);
    setSiloDoTexto(null);
    setSiloDoTextoEscolhido(null);
    invalidate();
    if (modo === "append" && existingGroupId) void escolherSiloExistente(existingGroupId);
  };

  const grupoExistente = silosExistentes.find(group => group.id === existingGroupId) ?? null;
  /** 2026-10-16 · o Silo escolhido no texto já tem grupo com o mesmo nome (o caminho é "Silo existente", com a prévia de sempre). */
  const grupoDoSiloDoTexto = siloDoTextoEscolhido ? silosExistentes.find(group => normalizeDeclaredPhraseKey(group.name) === normalizeDeclaredPhraseKey(siloDoTextoEscolhido)) ?? null : null;
  const corEfetiva: EditorialGroupColor = destino === "existing_silo" && grupoExistente ? grupoExistente.color : color;
  /** 2026-10-13 · substituir com algo saindo pede o nome da cor digitado (SDD §5.3, riscos); sem saída, a confirmação é o clique. */
  const saidasDaPrevia = preview?.result.replace?.leaving.length ?? 0;
  const nomeDaCorDoPlano = EDITORIAL_GROUP_COLOR_LABELS[preview?.result.group.color ?? corEfetiva];
  const confirmacaoSubstituicaoOk = !preview?.result.replace || saidasDaPrevia === 0 || corDigitada.trim().toLocaleLowerCase("pt-BR") === nomeDaCorDoPlano.toLocaleLowerCase("pt-BR");

  const currentRequest = (): CadastroRequest | null => {
    const preenchidas = linhas.filter(linha => linha.title.trim() || linha.keyword.trim() || linha.details.trim() || linha.slug.trim());
    if (!preenchidas.length) return null;
    // 2026-10-16 · o slug da linha vai para o Silo (novo ou existente); no publicado, URL/slug/canonical são da página.
    const articles = preenchidas.map(linha => ({ order: linha.order, subject: linha.title.trim(), principal: linha.keyword.trim() || null, role: destino === "published" ? "Suporte" as const : linha.role, scope: linha.details.trim(), lock: linha.lock, ...(destino === "published" ? {} : { slug: linha.slug.trim() || null }) }));
    if (destino === "existing_silo") {
      if (!existingGroupId) return null;
      if (substituir) return { plan: { silo: siloDoTexto, articles }, group: { mode: "existing", groupId: existingGroupId }, destination: { kind: "existing_silo", groupId: existingGroupId }, planMode: "replace" };
      return { plan: { silo: null, articles }, group: { mode: "existing", groupId: existingGroupId }, destination: { kind: "existing_silo", groupId: existingGroupId } };
    }
    const existente = groupOfColor(groups, color);
    const group: GroupChoice = existente ? { mode: "existing", groupId: existente.id } : { mode: "new", name: null, color };
    if (destino === "published") {
      if (!publishedUrl.trim()) return null;
      return { plan: { silo: null, articles }, group, destination: { kind: "published", url: publishedUrl.trim() } };
    }
    if (!siloName.trim()) return null;
    return { plan: { silo: { name: siloName.trim(), slug: siloSlug.trim() || null, objective: siloObjective.trim() || null }, articles }, group, destination: { kind: "new_silo" } };
  };

  const handlePreview = async (event?: FormEvent) => {
    event?.preventDefault();
    const request = currentRequest();
    if (!request || busyRef.current) return;
    busyRef.current = true;
    setPhase("previewing");
    setRefusal(null);
    setApplied(null);
    setPreview(null);
    setExcluirSobras(false);
    setReaprovar(false);
    setReaprovacao(null);
    setExclusaoPedida(0);
    try {
      const answer = await callCadastro(brandId, { method: "POST", body: { mode: "preview", plan: request.plan, group: request.group, destination: request.destination, ...(request.planMode ? { planMode: request.planMode } : {}) } });
      if (!mountedRef.current) return;
      if (!answer.ok) {
        if (answer.refusal.code === "GROUPS_NOT_AVAILABLE") { onUnavailable(); onClose(); return; }
        setRefusal(answer.refusal);
        return;
      }
      const result = answer.body as unknown as DeclaredPlanPreview & { mode?: unknown };
      if (result.mode !== "preview" || !Array.isArray(result.articles)) {
        setRefusal({ code: "UNEXPECTED_RESPONSE", message: "A prévia voltou num formato inesperado. Nada foi gravado.", blockers: [] });
        return;
      }
      setPreview({ request, importRequestId: crypto.randomUUID(), result });
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase("idle");
    }
  };

  const handleApply = async () => {
    if (!preview || !preview.result.canApply || applied || busyRef.current) return;
    if (preview.request.planMode === "replace" && !confirmacaoSubstituicaoOk) return;
    busyRef.current = true;
    setPhase("applying");
    setRefusal(null);
    try {
      const answer = await callCadastro(brandId, { method: "POST", body: {
        mode: "apply",
        plan: preview.request.plan,
        group: preview.request.group,
        destination: preview.request.destination,
        importRequestId: preview.importRequestId,
        // 2026-10-13 · "Substituir o plano": a decisão é sobre a prévia das quatro listas.
        ...(preview.request.planMode ? { planMode: preview.request.planMode, decisionHash: preview.result.replace?.decisionHash } : {}),
      } });
      if (!mountedRef.current) return;
      if (!answer.ok) {
        if (answer.refusal.code === "GROUPS_NOT_AVAILABLE") { onUnavailable(); onClose(); return; }
        setRefusal(answer.refusal);
        return;
      }
      const body = answer.body;
      if (body.mode !== "apply" || !Array.isArray(body.articles)) {
        setRefusal({ code: "UNEXPECTED_RESPONSE", message: "A resposta da gravação veio num formato inesperado. Confira a planilha antes de repetir.", blockers: [] });
        return;
      }
      const result: ApplyResult = {
        groupId: typeof body.groupId === "string" ? body.groupId : "",
        planVersion: count(body.planVersion),
        articles: body.articles as DeclaredPlanApplyArticle[],
        createdSubjectIds: strings(body.createdSubjectIds),
        createdPrincipalIds: strings(body.createdPrincipalIds),
        reciprocityConfirmed: count(body.reciprocityConfirmed),
        failed: count(body.failed),
        notices: strings(body.notices),
        replaced: body.replaced && typeof body.replaced === "object" ? body.replaced as DeclaredPlanReplaceApplied : null,
      };
      setApplied(result);
      // 2026-10-16 · o Silo do texto cadastrado agora; o outro continua disponível no mesmo texto.
      const siloCadastrado = siloDoTextoEscolhido;
      if (siloCadastrado && result.failed === 0) setSilosCadastrados(atuais => atuais.includes(siloCadastrado) ? atuais : [...atuais, siloCadastrado]);
      const subjectIds =[...new Set(result.articles.map(article => article.subjectKeywordId).filter((id): id is string => Boolean(id)))];
      const principalIds = [...new Set(result.articles.map(article => article.principalKeywordId).filter((id): id is string => Boolean(id)))];
      // A planilha relê (e roda a Lógica automática do Assunto) antes da reaprovação: um passo de cada vez.
      await Promise.resolve(onApplied({ subjectIds, createdSubjectIds: result.createdSubjectIds, principalIds })).catch(() => undefined);
      // Item 9: só depois do cadastro gravado e relido, e só o que o dono marcou na prévia.
      const reaprovaveis = reaprovar ? cadastroReapprovalIds(preview.result) : [];
      if (reaprovaveis.length) {
        setReaprovacao("running");
        const reapproval = await requestCadastroReapproval(brandId, reaprovaveis);
        if (mountedRef.current) setReaprovacao(reapproval);
        if (reapproval.ok) onKeywordsChanged?.(reaprovaveis);
      }
      const sobras = excluirSobras ? cadastroLeftoversToDelete(preview.result).deletable.map(item => item.keywordId) : [];
      if (sobras.length && onDeleteLeftovers && mountedRef.current) {
        setExclusaoPedida(sobras.length);
        onDeleteLeftovers(sobras);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const canPreview = !busy && Boolean(currentRequest());
  const result = preview?.result ?? null;
  const declaredCount = applied ? applied.articles.filter(article => article.outcome === "declared").length : 0;
  const unchangedCount = applied ? applied.articles.filter(article => article.outcome === "unchanged").length : 0;
  const failures = applied ? applied.articles.filter(article => article.outcome === "failed") : [];
  const publicado = destino === "published";
  // Item 9: o que a prévia já sabe (sobras que podem sair e aprovadas que voltam a "Em revisão").
  const sobrasOferecidas = result ? cadastroLeftoversToDelete(result) : { deletable: [], blocked: [] };
  const reaprovaveisPrevia = result ? cadastroReapprovalIds(result) : [];
  const corDoCadastro: EditorialGroupColor = preview?.result.group.color ?? corEfetiva;
  const idsDoCadastro = applied ? [...new Set(applied.articles.flatMap(article => [article.subjectKeywordId, article.principalKeywordId]).filter((id): id is string => Boolean(id)))] : [];
  // Item 7: uma linha do lote por Assunto gravado; título e keyword vêm da prévia (mesma ordem).
  const linhasDoLote = applied ? subjectSearchBatchLines(applied.articles.map(article => {
    const daPrevia = preview?.result.articles.find(item => item.order === article.order) ?? null;
    return { ...article, title: article.title || daPrevia?.title || "", keyword: daPrevia?.principal.phrase ?? null };
  })) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 font-sans" role="dialog" aria-modal="true" aria-labelledby={ids.title} data-minerador-subject-cadastro-card>
      <div className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-divider bg-surface-elevated shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="min-w-0">
            <h2 id={ids.title} className="text-base font-semibold text-foreground">Cadastrar Assuntos</h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">O Assunto mora na keyword: cada linha é um artigo, com o título, a keyword que o carrega e os detalhes. Keyword com volume medido entra travada; sem volume, livre. A prévia não grava nada; nada é pago.</p>
          </div>
          <button type="button" onClick={() => setConversaoAberta(true)} disabled={busy} className={internalButton} data-subject-cadastro-converter title="Assuntos cadastrados como linha própria (o título) passam a morar na keyword do artigo">
            Converter formato anterior
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Fechar" title="Fechar">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <form onSubmit={event => void handlePreview(event)} className="flex flex-col gap-4" aria-label="Cadastro de Assuntos">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Destino</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Destino do cadastro">
                {(Object.keys(DESTINO_LABELS) as Destino[]).map(option => (
                  <label key={option} data-subject-cadastro-destino={option} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${destino === option ? "border-module-accent/50 bg-surface" : "border-divider hover:bg-surface-subtle"}`}>
                    <input type="radio" name="subject-cadastro-destino" value={option} checked={destino === option} disabled={busy || (option === "existing_silo" && !silosExistentes.length)} onChange={() => { setDestino(option); setLinhas(option === "existing_silo" ? [] : [linhaVazia(option === "new_silo" ? 1 : 1, option === "new_silo" ? "Pilar" : "Suporte")]); setExistingGroupId(""); setModoPlano("append"); setSiloDoTexto(null); setSiloDoTextoEscolhido(null); invalidate(); }} className="sr-only" />
                    {DESTINO_LABELS[option]}
                  </label>
                ))}
              </div>
              {!silosExistentes.length ? <p className="text-sm text-text-muted">Ainda não há Silo cadastrado nesta marca: “Silo existente” aparece depois do primeiro cadastro.</p> : null}
            </fieldset>

            {destino === "existing_silo" ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.existing} className="text-sm font-medium text-foreground">Silo existente</label>
                <select id={ids.existing} value={existingGroupId} onChange={event => void escolherSiloExistente(event.target.value)} disabled={busy} className={internalField}>
                  <option value="">Escolha o Silo…</option>
                  {silosExistentes.map(group => <option key={group.id} value={group.id}>{EDITORIAL_GROUP_COLOR_LABELS[group.color]} · {group.name} · plano v{group.planVersion}</option>)}
                </select>
                <fieldset className="mt-2 flex flex-col gap-2" data-subject-cadastro-modo-plano>
                  <legend className="mb-1 text-sm font-medium text-foreground">O que fazer com o plano gravado</legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Acrescentar ou substituir o plano">
                    {(Object.keys(MODO_PLANO_LABELS) as DeclaredPlanMode[]).map(option => (
                      <label key={option} data-subject-cadastro-modo={option} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${modoPlano === option ? "border-module-accent/50 bg-surface" : "border-divider hover:bg-surface-subtle"}`}>
                        <input type="radio" name="subject-cadastro-modo-plano" value={option} checked={modoPlano === option} disabled={busy} onChange={() => escolherModoPlano(option)} className="sr-only" />
                        {MODO_PLANO_LABELS[option]}
                      </label>
                    ))}
                  </div>
                  <p className={`text-sm ${substituir ? "text-warning" : "text-text-muted"}`}>{MODO_PLANO_AJUDA[modoPlano]}</p>
                  {substituir && siloDoTexto ? <p className="text-sm text-text-muted" data-subject-cadastro-silo-do-texto>Silo do texto colado: <span className="font-semibold text-foreground">{siloDoTexto.name}</span>{siloDoTexto.slug ? <span className="text-identity-slug"> · {siloDoTexto.slug}</span> : null} (o slug só muda se o Silo ainda não estiver confirmado no Arquiteto).</p> : null}
                </fieldset>
              </div>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-foreground">Cor do grupo</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do grupo">
                  {EDITORIAL_GROUP_COLORS.map(option => {
                    const existente = groupOfColor(groups, option);
                    return (
                      <label key={option} data-subject-cadastro-color={option} title={existente ? `grupo existente: ${existente.name} · ${editorialGroupCountLabel(existente)}` : "grupo novo"} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${color === option ? EDITORIAL_GROUP_COLOR_CLASSES[option].chip : "border-divider hover:bg-surface-subtle"}`}>
                        <input type="radio" name="subject-cadastro-color" value={option} checked={color === option} onChange={() => { setColor(option); invalidate(); }} className="sr-only" />
                        <EditorialGroupDot color={option} />
                        <span className="font-medium">{EDITORIAL_GROUP_COLOR_LABELS[option]}</span>
                        {existente ? <span className="text-text-muted">· {existente.name}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {destino === "new_silo" ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={ids.name} className="text-sm font-medium text-foreground">Nome do Silo</label>
                  <input id={ids.name} value={siloName} maxLength={120} onPaste={colarPlano} onChange={event => { setSiloName(event.target.value); invalidate(); }} className={internalField} placeholder="Wi-Fi e fibra óptica" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={ids.slug} className="text-sm font-medium text-foreground">Slug</label>
                  <input id={ids.slug} value={siloSlug} maxLength={200} onPaste={colarPlano} onChange={event => { setSiloSlug(event.target.value); invalidate(); }} className={internalField} placeholder="/wifi-e-fibra/" />
                </div>
                <div className="flex flex-col gap-1 md:col-span-1">
                  <label htmlFor={ids.objective} className="text-sm font-medium text-foreground">Objetivo</label>
                  <input id={ids.objective} value={siloObjective} maxLength={1200} onPaste={colarPlano} onChange={event => { setSiloObjective(event.target.value); invalidate(); }} className={internalField} />
                </div>
              </div>
            ) : null}

            {publicado ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.url} className="text-sm font-medium text-foreground">URL do artigo publicado</label>
                <input id={ids.url} value={publishedUrl} maxLength={2048} onChange={event => { setPublishedUrl(event.target.value); invalidate(); }} className={internalField} placeholder="https://…" inputMode="url" />
                <p className="text-sm text-text-muted">URL, slug, canonical e a keyword da página não mudam. O Assunto (título e detalhes, na primeira linha) vai para a página; as keywords das linhas entram como reforço dela pelo caminho de “Melhorar publicados”.</p>
              </div>
            ) : null}

            {/* 2026-10-13 · também no Silo existente: colar o texto acrescenta as linhas
                novas às gravadas (o cabeçalho do Silo colado é ignorado ali). */}
            {destino !== "existing_silo" || existingGroupId ? (
              <details className="rounded-md border border-divider px-3 py-2" open={destino !== "existing_silo"}>
                <summary className="cursor-pointer text-sm font-medium text-foreground">Colar plano em texto</summary>
                <div className="mt-2 flex flex-col gap-2" onDragOver={arrastarSobre} onDragLeave={() => setArrastando(false)} onDrop={soltarArquivo} data-subject-cadastro-soltar-arquivo={arrastando ? "ativo" : undefined}>
                  {substituir ? <p className="text-sm text-warning" data-subject-cadastro-colar-substitui>Substituir o plano: o texto colado vira o plano novo INTEIRO (as linhas gravadas que ele não trouxer vão para “Sai” na prévia).</p> : null}
                  <label htmlFor={ids.paste} className="text-sm text-text-muted">Aceita a lista (“Silo 2 — …”, “Nome:”, “Slug:”, “Objetivo:” e, por artigo, “9. Título”, “Palavra-chave: …”, com “Artigo pilar •” no Pilar), blocos separados por linha em branco com o papel na primeira linha (“Silo”, “Pilar”, “Suporte”) e, no bloco, título, keyword, slug (/silo/artigo/) e descrição, com ou sem rótulo, a tabela com “|” e a planilha colada ou CSV com cabeçalho (Papel ou hierarquia, Assunto ou título, Keyword, Slug, Descrição ou intenção, Silo, número). “Trava: travada” ou “Trava: livre” também valem. O .csv também pode ser arrastado para cá.</label>
                  <textarea id={ids.paste} value={colado} onPaste={colarPlano} onChange={event => setColado(event.target.value)} rows={6} maxLength={COLADO_MAX} spellCheck={false} className={`${internalField} min-h-32 resize-y leading-6 ${arrastando ? "ring-2 ring-module-accent/30" : ""}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => preencherDoTexto(colado, siloDoTextoEscolhido)} disabled={busy || !colado.trim()} className={internalButton}>Preencher as linhas</button>
                    <button type="button" onClick={() => arquivoRef.current?.click()} disabled={busy} className="inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" data-subject-cadastro-abrir-arquivo>ou abrir um arquivo .csv</button>
                    <input ref={arquivoRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={escolherArquivo} className="sr-only" tabIndex={-1} aria-label="Arquivo .csv do plano" data-subject-cadastro-arquivo />
                  </div>
                  {arquivoAviso ? <p className="text-sm text-text-muted" role="status" data-subject-cadastro-arquivo-aviso>{arquivoAviso}</p> : null}
                  {colagemAviso ? <p className="text-sm text-text-muted" role="status">{colagemAviso}</p> : null}
                  {colunasIgnoradas.length ? <p className="text-sm text-text-muted" data-subject-cadastro-colunas-ignoradas>Colunas ignoradas: {colunasIgnoradas.join(", ")}.</p> : null}
                </div>
              </details>
            ) : null}

            {silosDoTexto.length > 1 ? (
              <fieldset className="flex flex-col gap-2 rounded-md border border-divider px-3 py-2" data-subject-cadastro-silos-do-texto>
                <legend className="px-1 text-sm font-medium text-foreground">Este texto tem {silosDoTexto.length} Silos: {silosDoTexto.map(silo => `${silo.name || "Silo sem nome"} (${silo.articleCount})`).join(" · ")} — escolha qual cadastrar agora</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Silo do texto a cadastrar agora">
                  {silosDoTexto.map(silo => (
                    <label key={`${silo.name ?? ""}:${silo.rawSlug ?? ""}`} data-subject-cadastro-silo-do-texto={silo.name ?? ""} className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors focus-within:ring-2 focus-within:ring-module-accent/30 ${siloDoTextoEscolhido !== null && siloDoTextoEscolhido === silo.name ? "border-module-accent/50 bg-surface" : "border-divider hover:bg-surface-subtle"}`}>
                      <input type="radio" name="subject-cadastro-silo-do-texto" value={silo.name ?? ""} checked={siloDoTextoEscolhido !== null && siloDoTextoEscolhido === silo.name} disabled={busy || !silo.name} onChange={() => escolherSiloDoTexto(silo.name)} className="sr-only" />
                      <span className="font-medium">{silo.name || "Silo sem nome"}</span>
                      {silo.name && silosCadastrados.includes(silo.name) ? <span className="text-success">· cadastrado agora</span> : null}
                    </label>
                  ))}
                </div>
                {silosExistentes.length > 0 && destino !== "existing_silo" ? (
                  <p className={`text-sm ${grupoDoSiloDoTexto ? "text-warning" : "text-text-muted"}`} data-subject-cadastro-silo-ja-existe>
                    {grupoDoSiloDoTexto
                      ? `“${siloDoTextoEscolhido}” já é o Silo da cor ${EDITORIAL_GROUP_COLOR_LABELS[grupoDoSiloDoTexto.color]} (plano v${grupoDoSiloDoTexto.planVersion}): para mexer nele, escolha “Silo existente” e Acrescentar ou Substituir o plano. A prévia mostra o que entra, muda e sai; nada muda sem a sua confirmação.`
                      : "Se um destes Silos já está cadastrado numa cor, escolha “Silo existente” e Acrescentar ou Substituir o plano: a prévia mostra o que entra, muda e sai, e nada muda sem a sua confirmação."}
                  </p>
                ) : null}
              </fieldset>
            ) : null}

            <div className="overflow-x-auto rounded-md border border-divider">
              <table className="w-full min-w-[1120px] text-left text-sm" data-subject-cadastro-linhas>
                <thead className="bg-surface text-text-muted">
                  <tr>
                    <th scope="col" className="w-16 px-2 py-2 font-semibold">#</th>
                    {!publicado ? <th scope="col" className="w-28 px-2 py-2 font-semibold">Papel</th> : null}
                    <th scope="col" className="px-2 py-2 font-semibold">Assunto (título)</th>
                    <th scope="col" className="px-2 py-2 font-semibold">Keyword</th>
                    {!publicado ? <th scope="col" className="px-2 py-2 font-semibold">Slug</th> : null}
                    <th scope="col" className="px-2 py-2 font-semibold">Detalhes</th>
                    {!publicado ? <th scope="col" className="w-44 px-2 py-2 font-semibold">Trava</th> : null}
                    <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {linhas.map((linha, index) => (
                    <tr key={linha.key} className="align-top" data-subject-cadastro-linha={linha.stored ? "gravada" : linha.recovered ? "recuperada" : "nova"}>
                      <td className="px-2 py-2"><input aria-label={`Ordem da linha ${index + 1}`} type="number" min={1} max={30} value={linha.order} disabled={busy || (linha.stored && !substituir)} onChange={event => mudarLinha(linha.key, { order: Number(event.target.value) || 0 })} className={`${internalField} w-14`} /></td>
                      {!publicado ? (
                        <td className="px-2 py-2">
                          <select aria-label={`Papel da linha ${index + 1}`} value={linha.role} disabled={busy} onChange={event => mudarLinha(linha.key, { role: event.target.value === "Pilar" ? "Pilar" : "Suporte" })} className={internalField}>
                            <option value="Pilar">Pilar</option>
                            <option value="Suporte">Suporte</option>
                          </select>
                        </td>
                      ) : null}
                      <td className="px-2 py-2">
                        <input aria-label={`Assunto da linha ${index + 1}`} onPaste={colarPlano} value={linha.title} maxLength={SUBJECT_ENTRY_TITLE_MAX} disabled={busy} onChange={event => mudarLinha(linha.key, { title: event.target.value })} className={internalField} placeholder={publicado && index > 0 ? "(o da primeira linha)" : "Título do artigo"} />
                        {linha.recovered ? (
                          <span className="mt-1 flex items-center gap-1 text-sm text-warning" data-subject-cadastro-recuperada>
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {linha.recovered}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2"><input aria-label={`Keyword da linha ${index + 1}`} onPaste={colarPlano} value={linha.keyword} maxLength={400} disabled={busy || (!substituir && (linha.stored || Boolean(linha.recovered)) && Boolean(linha.keyword))} onChange={event => mudarLinha(linha.key, { keyword: event.target.value })} className={`${internalField} text-keyword`} placeholder="keyword" /></td>
                      {!publicado ? (
                        <td className="px-2 py-2"><input aria-label={`Slug da linha ${index + 1}`} onPaste={colarPlano} value={linha.slug} maxLength={400} disabled={busy} spellCheck={false} onChange={event => mudarLinha(linha.key, { slug: event.target.value })} className={`${internalField} text-identity-slug`} placeholder="/silo/artigo/ (opcional)" /></td>
                      ) : null}
                      <td className="px-2 py-2"><textarea aria-label={`Detalhes da linha ${index + 1}`} onPaste={colarPlano} value={linha.details} maxLength={DECLARED_PLAN_SCOPE_MAX} rows={2} disabled={busy} onChange={event => mudarLinha(linha.key, { details: event.target.value.replace(/[\r\n]+/g, " ") })} className={`${internalField} resize-y leading-6`} placeholder={publicado && index > 0 ? "(os da primeira linha)" : "O que o artigo cobre (até 1.200)"} /></td>
                      {!publicado ? (
                        <td className="px-2 py-2">
                          <select aria-label={`Trava da linha ${index + 1}`} value={linha.lock} disabled={busy} onChange={event => mudarLinha(linha.key, { lock: event.target.value === "locked" ? "locked" : event.target.value === "free" ? "free" : "auto" })} className={internalField}>
                            {(Object.keys(LOCK_LABELS) as DeclaredPlanLockChoice[]).map(option => <option key={option} value={option}>{option === "auto" && linha.stored && linha.storedLockLabel?.includes("declarada antes") ? "Como foi declarada (travada)" : LOCK_LABELS[option]}</option>)}
                          </select>
                          {linha.storedLockLabel ? <span className="mt-1 block text-sm text-text-muted">Hoje: {linha.storedLockLabel}</span> : null}
                        </td>
                      ) : null}
                      <td className="px-2 py-2">
                        {!linha.stored || substituir ? (
                          <button type="button" onClick={() => tirarLinha(linha.key)} disabled={busy} className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 disabled:cursor-not-allowed disabled:opacity-50" aria-label={linha.stored ? `Tirar a linha ${index + 1} do plano novo` : `Tirar a linha ${index + 1}`} title={linha.stored ? "Tirar do plano novo (vai para “Sai” na prévia; nada é apagado)" : "Tirar a linha"}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={acrescentarLinha} disabled={busy || (destino === "existing_silo" && !existingGroupId)} className={internalButton}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Acrescentar linha
              </button>
              <button type="submit" disabled={!canPreview} className={internalButton}>
                {phase === "previewing" || phase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Gerar prévia
              </button>
              <span className="text-sm text-text-muted">Cor do cadastro: {EDITORIAL_GROUP_COLOR_LABELS[corEfetiva]}.</span>
            </div>
          </form>

          {refusal ? (
            <div role="alert" className="mt-4 rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-subject-cadastro-refusal>
              <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />Nada foi gravado: {refusal.message}</p>
              {refusal.blockers.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                  {refusal.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          {result ? <CadastroPreview result={result} /> : null}

          {result?.replace && result.canApply && !applied && saidasDaPrevia > 0 ? (
            <div className="mt-4 flex flex-col gap-1 rounded-md border border-warning/40 px-3 py-3 text-sm leading-6" data-subject-cadastro-confirmar-substituicao>
              <label htmlFor={ids.confirm} className="font-semibold text-foreground">Para substituir, digite o nome da cor: {nomeDaCorDoPlano}</label>
              <p className="text-text-muted">{saidasDaPrevia} item(ns) saem do plano pelo “Tirar do plano”. Nada é apagado; a decisão vale para esta prévia (qualquer mudança pede outra).</p>
              <input id={ids.confirm} value={corDigitada} onChange={event => setCorDigitada(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false} className={`${internalField} max-w-xs`} placeholder={nomeDaCorDoPlano} />
            </div>
          ) : null}

          {result && result.canApply && !applied && (sobrasOferecidas.deletable.length > 0 || sobrasOferecidas.blocked.length > 0 || reaprovaveisPrevia.length > 0) ? (
            <fieldset className="mt-4 flex flex-col gap-3 rounded-md border border-divider px-3 py-3 text-sm leading-6" data-subject-cadastro-follow-up>
              <legend className="px-1 font-semibold text-foreground">{CADASTRO_FOLLOW_UP_TEXTS.title}</legend>
              {sobrasOferecidas.deletable.length > 0 && onDeleteLeftovers ? (
                <label className="flex items-start gap-2" data-subject-cadastro-excluir-sobras>
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={excluirSobras} disabled={busy} onChange={event => setExcluirSobras(event.target.checked)} />
                  <span>
                    <span className="font-semibold text-danger">{CADASTRO_FOLLOW_UP_TEXTS.deleteLabel(sobrasOferecidas.deletable.length)}</span>
                    <span className="block text-text-muted">{CADASTRO_FOLLOW_UP_TEXTS.deleteHelp}</span>
                    <span className="block text-foreground">{sobrasOferecidas.deletable.map(item => item.keyword).join(" · ")}</span>
                  </span>
                </label>
              ) : null}
              {sobrasOferecidas.blocked.length > 0 ? (
                <div className="text-text-muted">
                  <p>{CADASTRO_FOLLOW_UP_TEXTS.deleteBlocked(sobrasOferecidas.blocked.length)}</p>
                  <ul className="list-disc pl-5">
                    {sobrasOferecidas.blocked.map(item => <li key={item.keywordId}><span className="text-keyword">{item.keyword}</span> — {item.blockedReason || "não conferida"}</li>)}
                  </ul>
                </div>
              ) : null}
              {reaprovaveisPrevia.length > 0 ? (
                <label className="flex items-start gap-2" data-subject-cadastro-reaprovar>
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={reaprovar} disabled={busy} onChange={event => setReaprovar(event.target.checked)} />
                  <span>
                    <span className="font-semibold text-foreground">{CADASTRO_FOLLOW_UP_TEXTS.reapproveLabel(reaprovaveisPrevia.length)}</span>
                    <span className="block text-text-muted">{CADASTRO_FOLLOW_UP_TEXTS.reapproveHelp}</span>
                  </span>
                </label>
              ) : null}
            </fieldset>
          ) : null}

          {applied ? (
            <div role="status" className={`mt-4 rounded-md border px-3 py-2 text-sm leading-6 ${applied.failed > 0 ? "border-warning/40" : "border-success/40"}`} data-subject-cadastro-applied>
              <p className={`flex items-center gap-2 font-semibold ${applied.failed > 0 ? "text-warning" : "text-success"}`}>
                {applied.failed > 0 ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {declaredCount} linha(s) cadastrada(s){unchangedCount > 0 ? `, ${unchangedCount} sem mudança` : ""}, conferidas na releitura: {applied.reciprocityConfirmed}; falhas: {applied.failed}.
              </p>
              <p className="text-foreground">{applied.planVersion > 0 ? `Plano do Silo gravado (v${applied.planVersion}). ` : ""}{applied.createdSubjectIds.length + applied.createdPrincipalIds.length} keyword(s) nova(s) criada(s) como Bruto. A Lógica roda sozinha (grátis); depois, aprove e envie ao Arquiteto como sempre.</p>
              {applied.replaced ? (
                <p className="text-foreground" data-subject-cadastro-substituido>
                  Substituição: {applied.replaced.withdrawn.length} artigo(s) saíram do plano pelo “Tirar do plano”{applied.replaced.withdrawalPlanVersion ? ` (v${applied.replaced.withdrawalPlanVersion})` : ""}{applied.replaced.orphanMarksCleared.length ? `; ${applied.replaced.orphanMarksCleared.length} marca(s) de principal sem Assunto liberada(s)` : ""}. Nada foi apagado: as keywords continuam no Minerador e no grupo. No Arquiteto, o artigo de um Assunto que saiu fica “Fora do plano” até você decidir lá.
                </p>
              ) : null}
              {failures.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
                  {failures.map(article => <li key={`${article.order}:${article.principalKeywordId}`}>Linha {article.order}: {article.reason || "falhou sem motivo informado."}</li>)}
                </ul>
              ) : null}
              {applied.notices.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-text-muted">
                  {applied.notices.map(notice => <li key={notice}>{notice}</li>)}
                </ul>
              ) : null}
              {reaprovacao === "running" ? <p className="mt-1 flex items-center gap-2 text-foreground" data-subject-cadastro-reaprovacao><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Reaprovando (Lógica e aprovação)…</p> : null}
              {reaprovacao && reaprovacao !== "running" ? (
                <div className="mt-1" data-subject-cadastro-reaprovacao>
                  {reaprovacao.ok ? (
                    <p className={reaprovacao.refused.length ? "text-warning" : "text-success"}>Reaprovação: {reaprovacao.approved} aprovada(s){reaprovacao.unchanged ? `, ${reaprovacao.unchanged} já estavam aprovadas` : ""}{reaprovacao.refused.length ? `, ${reaprovacao.refused.length} não puderam ser aprovadas` : ""}.</p>
                  ) : <p className="text-danger">{reaprovacao.message}</p>}
                  {reaprovacao.ok && reaprovacao.refused.length ? (
                    <ul className="list-disc space-y-1 pl-5 text-foreground">
                      {reaprovacao.refused.map(item => <li key={item.id}><span className="text-keyword">{item.keyword || item.id}</span> — {item.reason}</li>)}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {exclusaoPedida > 0 ? <p className="mt-1 text-foreground" data-subject-cadastro-exclusao>A confirmação de exclusão das {exclusaoPedida} sobra(s) foi aberta: nada é apagado sem o nome digitado nela.</p> : null}
              {onViewInSheet && idsDoCadastro.length ? (
                <div className="mt-2">
                  <button type="button" onClick={() => onViewInSheet({ color: corDoCadastro, keywordIds: idsDoCadastro })} className={internalButton} data-subject-cadastro-ver-na-planilha>
                    <EditorialGroupDot color={corDoCadastro} />
                    Ver na planilha (cor {EDITORIAL_GROUP_COLOR_LABELS[corDoCadastro]})
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {applied ? <SubjectSearchBatchPanel brandId={brandId} lines={linhasDoLote} onImported={onKeywordsChanged} /> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-divider px-4 py-3">
          {result && !result.canApply && !applied ? <span className="mr-auto text-sm text-danger">Corrija os impedimentos e gere a prévia de novo.</span> : null}
          <button type="button" onClick={onClose} disabled={busy} className={internalButton}>{applied ? "Fechar" : "Cancelar"}</button>
          <button type="button" onClick={() => void handleApply()} disabled={busy || !result?.canApply || Boolean(applied) || !confirmacaoSubstituicaoOk} className={internalButtonPrimary} data-subject-cadastro-apply>
            {phase === "applying" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {result?.replace ? MODO_PLANO_LABELS.replace : "Cadastrar"}
          </button>
        </div>
      </div>
      {conversaoAberta ? <SubjectConversionDialog brandId={brandId} groups={groups} onClose={() => setConversaoAberta(false)} onApplied={onApplied} /> : null}
    </div>
  );
}

/** A prévia do cadastro (também usada pela conversão do formato anterior, que passa pelo mesmo núcleo). */
export function CadastroPreview({ result }: { result: DeclaredPlanPreview }) {
  const silo = result.silo;
  return (
    <section className="mt-4 flex flex-col gap-4 border-t border-divider pt-4" aria-label="Prévia do cadastro" data-subject-cadastro-preview>
      {result.blockers.length ? (
        <div role="alert" className="rounded-md border border-danger/40 px-3 py-2 text-sm leading-6" data-subject-cadastro-blockers>
          <p className="flex items-center gap-2 font-semibold text-danger"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />{result.blockers.length} impedimento(s): o cadastro não pode ser gravado assim</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-foreground">
            {result.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
          </ul>
        </div>
      ) : null}

      {result.replace ? <ReplaceLists replace={result.replace} /> : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {result.destination.kind === "published" ? (
          <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Página publicada</dt><dd className="text-foreground">{result.destination.publishedKeyword ? <span className="text-keyword">{result.destination.publishedKeyword.keyword}</span> : "não encontrada"}{result.destination.url ? <span className="text-text-muted"> · {result.destination.url}</span> : null}</dd></div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Silo</dt><dd className="font-semibold text-foreground">{silo.name || "sem nome"}{silo.slug ? <span className="font-normal text-identity-slug"> · {silo.slug}</span> : null}</dd></div>
            <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Artigos no plano</dt><dd className="text-foreground">{result.siloPlan?.articleCount ?? result.articles.length}{result.keptArticles.length ? ` (${result.keptArticles.length} já gravados não mudam)` : ""}</dd></div>
          </>
        )}
        <div className="flex flex-wrap items-center gap-x-2">
          <dt className="text-text-muted">Grupo</dt>
          <dd className="flex flex-wrap items-center gap-2">{result.group.color && result.group.name ? <EditorialGroupTag name={result.group.name} color={result.group.color} /> : <span className="text-text-muted">{result.group.name || "novo"}</span>}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2"><dt className="text-text-muted">Voltam a “Em revisão”</dt><dd className={result.approvedToReview > 0 ? "text-pending" : "text-foreground"}>{result.approvedToReview} item(ns) aprovado(s)</dd></div>
      </dl>

      <div className="overflow-x-auto rounded-md border border-divider">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              <th scope="col" className="w-12 px-2 py-2 font-semibold">#</th>
              <th scope="col" className="w-20 px-2 py-2 font-semibold">Papel</th>
              <th scope="col" className="px-2 py-2 font-semibold">Assunto</th>
              <th scope="col" className="px-2 py-2 font-semibold">Keyword</th>
              {result.destination.kind !== "published" ? <th scope="col" className="px-2 py-2 font-semibold">Slug</th> : null}
              <th scope="col" className="w-48 px-2 py-2 font-semibold">Trava</th>
              <th scope="col" className="px-2 py-2 font-semibold">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {result.articles.map(article => (
              <tr key={`${article.order}:${article.line}:${article.principal.phrase}`} className="align-top" data-subject-cadastro-mudanca={article.change}>
                <td className="px-2 py-2 text-foreground">{article.order}</td>
                <td className={`px-2 py-2 ${article.role === "Pilar" ? "font-semibold text-foreground" : "text-foreground"}`}>{article.role}</td>
                <td className="px-2 py-2">
                  <span className="text-foreground">{article.title || <span className="text-text-muted">sem título</span>}</span>
                  <span className="block text-text-muted">{article.change === "unchanged" ? "sem mudança" : article.change === "new" ? "novo no plano" : "muda"} · {article.subject.label}</span>
                </td>
                <td className="px-2 py-2">
                  {article.principal.phrase ? <span className="text-keyword">{article.principal.phrase}</span> : null}
                  <span className="block text-text-muted">{article.principal.label}{article.principal.volumeValidated && typeof article.principal.volume === "number" ? ` · volume ${article.principal.volume}` : ""}</span>
                  {article.problems.length ? (
                    <ul className="mt-1 space-y-1 text-danger">
                      {article.problems.map(problem => <li key={problem}>{problem}</li>)}
                    </ul>
                  ) : null}
                </td>
                {result.destination.kind !== "published" ? (
                  <td className="px-2 py-2" data-subject-cadastro-slug>
                    {article.slug ? <span className="break-all text-identity-slug">/{silo.slug ? `${silo.slug}/` : ""}{article.slug}/</span> : <span className="text-text-muted">sem slug: o Arquiteto forma pela keyword</span>}
                  </td>
                ) : null}
                <td className={`px-2 py-2 ${article.lock?.state === "free" ? "text-pending" : "text-foreground"}`}>{article.lock ? article.lock.label : <span className="text-text-muted">protegida pelo publicado</span>}</td>
                <td className="px-2 py-2 text-foreground">{article.scope || <span className="text-text-muted">sem detalhes</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.unparsed.length ? (
        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">Linhas não entendidas ({result.unparsed.length}) — ficaram de fora, nada foi adivinhado</p>
          <ul className="mt-1 space-y-1">
            {result.unparsed.map(item => <li key={`${item.line}:${item.text}`} className="text-foreground"><span className="text-text-muted">Linha {item.line}:</span> {item.text} <span className="text-text-muted">— {item.reason}</span></li>)}
          </ul>
        </div>
      ) : null}

      {result.leftovers.length ? (
        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">Sobras de imports anteriores ({result.leftovers.length})</p>
          <ul className="mt-1 space-y-1">
            {result.leftovers.map(item => <li key={item.keywordId}><span className="text-keyword">{item.keyword}</span> <span className="text-text-muted">— não faz parte do plano ({item.label})</span></li>)}
          </ul>
        </div>
      ) : null}

      {result.notices.length ? (
        <div className="text-sm leading-6">
          <p className="font-semibold text-foreground">Avisos</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-text-muted">
            {result.notices.map(notice => <li key={notice}>{notice}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const LISTAS_DA_SUBSTITUICAO: Array<{ key: "same" | "changed" | "entering" | "leaving"; label: string; tone: string }> = [
  { key: "same", label: "Fica igual", tone: "text-foreground" },
  { key: "changed", label: "Muda", tone: "text-pending" },
  { key: "entering", label: "Entra", tone: "text-foreground" },
  { key: "leaving", label: "Sai (pelo “Tirar do plano”)", tone: "text-warning" },
];

/** 2026-10-13 · "Substituir o plano": as quatro listas da prévia, com o motivo de cada linha (SDD §5.2). */
function ReplaceLists({ replace }: { replace: DeclaredPlanReplacePreview }) {
  const contagem = (key: (typeof LISTAS_DA_SUBSTITUICAO)[number]["key"]) => (replace[key] as DeclaredPlanReplaceItem[]).length;
  return (
    <section aria-label="Substituir o plano: as quatro listas" className="flex flex-col gap-3 rounded-md border border-divider px-3 py-3 text-sm leading-6" data-subject-cadastro-quatro-listas>
      <p className="font-semibold text-foreground">
        Substituir o plano: Fica igual {contagem("same")} · Muda {contagem("changed")} · Entra {contagem("entering")} · <span className={contagem("leaving") ? "text-warning" : "text-foreground"}>Sai {contagem("leaving")}</span>
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {LISTAS_DA_SUBSTITUICAO.map(lista => {
          const itens = replace[lista.key] as DeclaredPlanReplaceItem[];
          return (
            <div key={lista.key} className="min-w-0" data-subject-cadastro-lista={lista.key}>
              <p className={`font-semibold ${lista.tone}`}>{lista.label} ({itens.length})</p>
              {itens.length ? (
                <ul className="mt-1 space-y-1">
                  {itens.map(item => (
                    <li key={`${lista.key}:${item.keywordId ?? ""}:${item.order}:${item.title}`} className="break-words">
                      <span className="text-foreground">{item.order ? `${item.order}. ` : ""}{item.title || "sem título"}</span>
                      {item.keyword ? <span className="text-keyword"> · {item.keyword}</span> : null}
                      <span className="text-text-muted"> ({item.role})</span>
                      <span className="block text-text-muted">{item.reasons.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-text-muted">nenhum</p>}
            </div>
          );
        })}
      </div>
      {replace.legacyOutside.length ? (
        <div>
          <p className="font-semibold text-foreground">Assunto do formato anterior fora do plano novo ({replace.legacyOutside.length}) — fica como está</p>
          <p className="text-text-muted">Nada é excluído aqui. Para levar o Assunto para uma keyword, use “Converter formato anterior”.</p>
          <p className="text-keyword">{replace.legacyOutside.map(item => item.keyword).join(" · ")}</p>
        </div>
      ) : null}
      <ul className="list-disc space-y-1 pl-5 text-text-muted">
        {replace.effects.map(efeito => <li key={efeito}>{efeito}</li>)}
      </ul>
    </section>
  );
}

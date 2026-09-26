/**
 * Domínio puro do consentimento OAuth do MCP do Redator.
 *
 * O Supabase só emite os escopos OIDC (`openid`, `email`, `profile`, `phone`).
 * Os escopos de produto abaixo NÃO vão no token: vivem em `writer_mcp_grants`,
 * decididos na tela de consentimento e conferidos a cada chamada. Este módulo
 * não toca banco, sessão nem rede, e pode ser importado por componentes client.
 */

/*
 * OS ESCOPOS DA PLATAFORMA INTEIRA — SDD `sdd-plataforma-para-agentes-mcp-2026-09-26.md`.
 *
 * Os três primeiros são do Redator e não mudam. Os novos abrem as outras
 * áreas. `platform.decide` só delega decisões que o usuário aceitou no chat,
 * com prévia, hash de decisão e trilha; fica opt-in.
 *
 * A ordem é a do pipeline, e é a ordem em que a tela de consentimento lista.
 * O banco confere a mesma lista (`writer_mcp_grants_scopes_check`, migration m8).
 */
export const WRITER_MCP_SCOPES = [
  "writer.read", "writer.draft.write", "writer.media.brief",
  "platform.read", "minerador.write", "arquiteto.write", "radar.write", "platform.decide", "provider.spend",
] as const;
export type WriterMcpScope = typeof WRITER_MCP_SCOPES[number];

/**
 * O QUE VEM MARCADO NA TELA DE CONSENTIMENTO.
 *
 * Tudo, menos gastar com provider. A tela marcava a lista inteira por padrão;
 * com `provider.spend` nela, um clique rápido em "Autorizar" daria à IA
 * permissão de pagar. Gastar precisa ser escolha marcada pela pessoa.
 */
export const WRITER_MCP_DEFAULT_SCOPES: readonly WriterMcpScope[] = WRITER_MCP_SCOPES.filter((scope) => scope !== "provider.spend" && scope !== "platform.decide");

/** Escopos OIDC anunciados ao cliente. Os de produto ficam fora do token de propósito. */
export const WRITER_MCP_OIDC_SCOPES = ["openid", "email", "profile"] as const;

export const WRITER_MCP_SCOPE_LABELS: Record<WriterMcpScope, { title: string; description: string }> = {
  "writer.read": { title: "Ler", description: "Listar documentos, ler briefing do Radar, rascunhos, entregáveis e análise do Guardião." },
  "writer.draft.write": { title: "Salvar rascunhos", description: "Salvar blocos do artigo, roteiros e carrosséis como rascunho, sempre com lock e readback. Nunca aprova." },
  "writer.media.brief": { title: "Registrar mídia", description: "Registrar prompts visuais e anexar imagens geradas ao briefing existente." },
  "platform.read": { title: "Ler a plataforma", description: "Ver o que a marca tem: Assuntos, keywords, silos, artigos, páginas publicadas e em que etapa está cada coisa." },
  "minerador.write": { title: "Trabalhar no Minerador", description: "Declarar os Assuntos que você aceitar, planejar a pesquisa de keywords e importar as escolhidas. Não aprova nem exclui keywords." },
  "arquiteto.write": { title: "Enviar ao Arquiteto", description: "Enviar ao Arquiteto as keywords que você já aprovou. Não forma nem aprova artigos e silos." },
  "radar.write": { title: "Enviar ao Redator", description: "Enviar ao Redator os artigos cuja investigação você já finalizou no Radar." },
  "platform.decide": { title: "Delegar decisões aceitas no chat", description: "Aplicar decisões específicas que você aceitou no chat, sempre depois de prévia, hash vigente e registro do aceite. Não publica nem exclui." },
  "provider.spend": { title: "Gastar com provider", description: "Executar pesquisas pagas (DataForSEO, Google Ads) depois de mostrar o custo e você aceitar. Desmarcado por padrão." },
};

export class WriterMcpConsentError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "WriterMcpConsentError";
    this.code = code;
    this.status = status;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** `client_id` do Supabase é UUID; outros servidores podem usar URL (CIMD). Sem espaços, sem vazio. */
export function isOAuthClientId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 1 && value.trim().length <= 200 && !/\s/.test(value.trim());
}

export function normalizeWriterMcpScopes(input: unknown): WriterMcpScope[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,]+/) : [];
  const unique = [...new Set(raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))];
  if (!unique.length) throw new WriterMcpConsentError("scopes_required", "Escolha pelo menos uma permissão.");
  const invalid = unique.filter((item) => !(WRITER_MCP_SCOPES as readonly string[]).includes(item));
  if (invalid.length) throw new WriterMcpConsentError("invalid_scope", `Permissão desconhecida: ${invalid.join(", ")}.`);
  return WRITER_MCP_SCOPES.filter((scope) => unique.includes(scope));
}

export function writerMcpScopesRequireEdit(scopes: readonly WriterMcpScope[]): boolean {
  return scopes.includes("writer.draft.write") || scopes.includes("writer.media.brief");
}

/** Escopo que escreve em algum módulo — o consentimento avisa a pessoa. */
export const WRITER_MCP_WRITE_SCOPES: readonly WriterMcpScope[] = ["writer.draft.write", "writer.media.brief", "minerador.write", "arquiteto.write", "radar.write", "platform.decide", "provider.spend"];

export function normalizeClientName(input: unknown, fallback = "Cliente MCP"): string {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  if (!name) return fallback;
  return name.slice(0, 120);
}

export type ConsentBrandOption = { brandId: string; brandName: string; agencyId: string };

/**
 * A seleção do usuário só vale se cada Marca estiver na lista elegível calculada
 * no servidor. Nada é escolhido por padrão: sem Marca, sem grant.
 */
export function normalizeConsentBrandSelection(input: unknown, eligible: readonly ConsentBrandOption[]): ConsentBrandOption[] {
  const raw = Array.isArray(input) ? input : [];
  const ids = [...new Set(raw.filter(isUuid))];
  if (!ids.length) throw new WriterMcpConsentError("brands_required", "Escolha pelo menos uma Marca.");
  const byId = new Map(eligible.map((option) => [option.brandId, option]));
  const selected: ConsentBrandOption[] = [];
  for (const id of ids) {
    const option = byId.get(id);
    if (!option) throw new WriterMcpConsentError("brand_not_eligible", "Uma das Marcas escolhidas não está disponível para esta conta.", 403);
    selected.push(option);
  }
  return selected;
}

/** Para onde o cliente manda o usuário quando o token é válido mas não há grant. */
export function writerMcpConsentUrl(baseUrl: string | null | undefined, oauthClientId: string): string {
  const path = `/conta?mcp_client=${encodeURIComponent(oauthClientId)}#conexoes-ia`;
  const base = baseUrl?.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

export type WriterMcpGrantRow = {
  id: string;
  consentId: string;
  agencyId: string;
  brandId: string;
  brandName: string;
  actorUserId: string;
  oauthClientId: string;
  clientName: string;
  scopes: WriterMcpScope[];
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

export type WriterMcpClientSummary = {
  oauthClientId: string;
  clientName: string;
  lastUsedAt: string | null;
  grants: WriterMcpGrantRow[];
};

/** Agrupa por cliente OAuth para a listagem em `/conta`; ativos primeiro, mais recente primeiro. */
export function groupWriterMcpGrantsByClient(rows: readonly WriterMcpGrantRow[]): WriterMcpClientSummary[] {
  const byClient = new Map<string, WriterMcpClientSummary>();
  const ordered = [...rows].sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return right.createdAt.localeCompare(left.createdAt);
  });
  for (const row of ordered) {
    const summary = byClient.get(row.oauthClientId) || { oauthClientId: row.oauthClientId, clientName: row.clientName, lastUsedAt: null, grants: [] };
    summary.grants.push(row);
    if (row.lastUsedAt && (!summary.lastUsedAt || row.lastUsedAt > summary.lastUsedAt)) summary.lastUsedAt = row.lastUsedAt;
    if (row.status === "active") summary.clientName = row.clientName;
    byClient.set(row.oauthClientId, summary);
  }
  return [...byClient.values()];
}

/**
 * ===== O QUE O REDATOR NÃO PODE REDEFINIR — RADAR_TO_WRITER_HANDOFF_1 · §12 =====
 *
 * ==================== POR QUE ESTA LISTA EXISTE ====================
 *
 * O Redator deixou de ser executor textual: ele planeja e escreve. Ampliar o
 * que alguém decide sem escrever o que ele NÃO decide é como entregar o volante
 * sem dizer onde ficam as faixas.
 *
 * A fronteira não é de esforço, é de propriedade. O Arquiteto formou o artigo;
 * o Minerador qualificou a keyword; o Radar investigou a realidade externa.
 * Nenhuma dessas decisões pertence a quem escreve — nem quando escrever ficaria
 * mais fácil com outra principal.
 *
 * ==================== COMO ELA VIAJA ====================
 *
 * Junto do dossiê, dentro do recibo da entrega. Governança que mora só num
 * documento é governança que ninguém lê na hora de decidir: ela precisa estar
 * no mesmo pacote que a evidência, ou o primeiro conflito a resolve por
 * omissão.
 */
export const RADAR_WRITER_MAY_NOT = [
  "trocar a keyword principal",
  "reconfigurar o Silo",
  "remover uma cobertura obrigatória",
  "alterar a intenção declarada do artigo",
  "alterar slug protegido",
  "alterar canonical protegido",
  "substituir a composição de secundárias por decisão própria",
] as const;

/**
 * ==================== O QUE ELE PODE DECIDIR ====================
 *
 * A contraparte da lista acima, escrita porque "não pode" sem "pode" produz
 * paralisia: quem recebe a proibição sozinha devolve a decisão para cima.
 *
 * §10 do gate: estas são as responsabilidades que vieram do Planejador, e
 * §14/§15 acrescentam metadados e plano visual — campos que o Radar deixa
 * declaradamente não definidos.
 */
export const RADAR_WRITER_MAY_DECIDE = [
  "transformar o Blueprint em plano executável",
  "decidir a estrutura final de H2 e H3",
  "organizar a sequência narrativa",
  "aplicar a evidência de cada seção",
  "consolidar os links internos e externos",
  "consolidar o plano de mídia",
  "decidir os metadados de SEO finais",
  "resolver o CTA",
  "preparar as instruções de redação",
] as const;

/**
 * O PLANO EXISTE DENTRO DO REDATOR — §11.
 *
 * `ContentPlan` não foi abolido: deixou de ser ETAPA. O Redator pode montar um
 * plano antes de escrever, e ele é artefato interno de quem escreve. O que não
 * existe mais é uma área obrigatória entre o Radar e o Redator.
 */
export const RADAR_WRITER_PHASES = ["planning", "writing"] as const;
export type RadarWriterPhase = (typeof RADAR_WRITER_PHASES)[number];

/**
 * A FASE, LIDA DO ESTADO REAL DO DOCUMENTO.
 *
 * §18 pede estados de planejamento e escrita, e pede para NÃO inventar nomes
 * onde já existe enum canônico. `ContentDocument.status` já é esse enum:
 * `planejado` é o planejamento, e tudo depois dele é escrita.
 */
export const radarWriterPhaseOfStatus = (status: string): RadarWriterPhase =>
  status === "planejado" ? "planning" : "writing";

/**
 * ===== QUEM APARECE EM "IMPORTAR DO RADAR" — RADAR_MULTI_PROFILE_HANDOFF_1 =====
 *
 * O diálogo filtrava por `state ∈ {approved, sent_writer}` — o estado da
 * ESTEIRA, que START/ANALYZE/FINALIZE nunca movem. Um artigo de YouTube ou de
 * Amazon finalizado fica em `research_pending` para sempre, e por isso só o
 * Google aparecia na lista: ele já tinha sido enviado.
 *
 * A autoridade é a finalização canônica, lida da análise corrente. Quem já foi
 * entregue continua listado, marcado como importado, para que repetir não
 * duplique.
 */
export function radarWriterImportable(item: {
  state: string;
  analysisVersions?: ReadonlyArray<{ versionNumber: number; payload: unknown }>;
}, primaryProfileOf: (payload: unknown) => string | null): boolean {
  if (item.state === "sent_writer") return true;
  const corrente = (item.analysisVersions || []).slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return Boolean(corrente && primaryProfileOf(corrente.payload));
}

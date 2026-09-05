/**
 * Fixture representativa do arquivo real observado na validação manual
 * (`CareGlow_SKILL.md`): Markdown válido, rico e com estrutura própria, sem os
 * headings literais do gabarito `brand_voice`.
 *
 * O documento é preservado integralmente; ele existe aqui para provar que uma
 * estrutura própria não bloqueia o envio.
 */
export const careGlowSkillMarkdown = [
  "# Care Glow — Skill de Marca",
  "",
  "## 1. Perfil de Voz aprovado",
  "A Care Glow fala como uma clínica que explica antes de indicar.",
  "Ritmo calmo, frases curtas e zero sensacionalismo.",
  "",
  "## 2. Vocabulário e terminologia",
  "- protocolo, avaliação, indicação",
  "- pele madura em vez de pele velha",
  "- procedimento em vez de tratamento milagroso",
  "",
  "## 3. Atalhos e claims proibidos",
  "- resultado garantido",
  "- cura definitiva",
  "- comparações diretas com concorrentes nominais",
  "",
  "## 4. Ajuste de tom",
  "Conteúdo clínico recebe tom mais técnico; conteúdo de captação aceita tom mais próximo,",
  "sem perder a responsabilidade sanitária.",
  "",
  "## 5. Adaptação por canal",
  "### Blog",
  "Explicação completa, com contexto e fontes.",
  "### Redes",
  "Recorte curto, mesma terminologia, sem promessa.",
  "",
  "## 6. Quality gate",
  "Antes de publicar, verificar: terminologia, ausência de claim proibido e coerência de tom.",
].join("\n");

export const careGlowSkillFile = {
  filename: "CareGlow_SKILL.md",
  content: careGlowSkillMarkdown,
  byteSize: Buffer.byteLength(careGlowSkillMarkdown, "utf8"),
  mimeType: "text/markdown",
};

import { z } from "zod";

/**
 * Gabaritos de Skill pertencem ao código da Plataforma. A Marca apenas fornece
 * conteúdo para um gabarito existente; consumidores e estrutura esperada não
 * são dados persistidos da Marca.
 */
export const SkillDefinitionModuleSchema = z.enum(["minerador", "arquiteto", "radar", "planejador", "redator", "publicacoes"]);

export const SkillDefinitionSectionImportanceSchema = z.enum(["recommended", "optional"]);

export const SkillDefinitionExpectedSectionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  importance: SkillDefinitionSectionImportanceSchema,
  aliases: z.array(z.string().trim().min(1)).default([]),
});

export const SkillDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  ownerModule: SkillDefinitionModuleSchema,
  consumerModules: z.array(SkillDefinitionModuleSchema).min(1),
  acceptedExtensions: z.array(z.string().regex(/^\.[a-z0-9]+$/i)).min(1),
  acceptedMimeTypes: z.array(z.string().trim().min(1)).min(1),
  maxFileSizeBytes: z.number().int().positive(),
  expectedSections: z.array(SkillDefinitionExpectedSectionSchema).min(1),
  suggestedOutline: z.string().min(1),
});

export type SkillDefinitionModule = z.infer<typeof SkillDefinitionModuleSchema>;
export type SkillDefinitionSectionImportance = z.infer<typeof SkillDefinitionSectionImportanceSchema>;
export type SkillDefinitionExpectedSection = z.infer<typeof SkillDefinitionExpectedSectionSchema>;
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

const brandVoice: SkillDefinition = SkillDefinitionSchema.parse({
  key: "brand_voice",
  label: "Voz da Marca",
  description: "Orienta como a Marca deve se expressar na produção editorial.",
  ownerModule: "planejador",
  consumerModules: ["minerador", "planejador", "redator"],
  acceptedExtensions: [".md"],
  acceptedMimeTypes: ["text/markdown", "text/x-markdown", "text/plain"],
  maxFileSizeBytes: 512 * 1024,
  expectedSections: [
    { key: "tone", label: "Tom", description: "Como a Marca soa ao leitor.", importance: "recommended", aliases: ["Perfil de voz", "Perfil de voz aprovado", "Ajuste de tom", "Tom e estilo", "Tom de voz", "Voz e tom"] },
    { key: "vocabulary_preferred", label: "Vocabulário preferido", description: "Termos e construções que representam a Marca.", importance: "recommended", aliases: ["Vocabulário", "Vocabulary", "Terminologia", "Vocabulário e terminologia", "Termos preferidos", "Glossário"] },
    { key: "avoid", label: "Evitar", description: "Termos, promessas e construções que não devem aparecer.", importance: "recommended", aliases: ["Atalhos", "Claims", "Claims proibidos", "Atalhos e claims proibidos", "Termos proibidos", "Restrições", "O que evitar", "Proibições"] },
    { key: "reader_address", label: "Forma de tratar o leitor", description: "Pessoa, proximidade e tratamento adotados.", importance: "optional", aliases: ["Tratamento do leitor", "Como tratar o leitor", "Pessoa e tratamento", "Endereçamento"] },
    { key: "examples", label: "Exemplos", description: "Trechos que demonstram a aplicação correta.", importance: "optional", aliases: ["Exemplo", "Exemplos de aplicação", "Antes e depois", "Amostras"] },
  ],
  suggestedOutline: ["# Voz da Marca", "", "## Tom", "", "## Vocabulário preferido", "", "## Evitar", "", "## Forma de tratar o leitor", "", "## Exemplos"].join("\n"),
});

const registry: SkillDefinition[] = [brandVoice];

export function listSkillDefinitions(): SkillDefinition[] { return registry; }
export function findSkillDefinition(key: string): SkillDefinition | null { return registry.find(definition => definition.key === key) || null; }
export function requireSkillDefinition(key: string): SkillDefinition {
  const definition = findSkillDefinition(key);
  if (!definition) throw new Error(`Gabarito de Skill desconhecido: ${key}.`);
  return definition;
}

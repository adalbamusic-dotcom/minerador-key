import { createHash } from "node:crypto";
import { PLATFORM_GUIDE_TOPICS, renderPlatformGuide } from "./platform-catalog";

/** Detecta mudanças no guia entregue ao cliente MCP entre chamadas. */
export const PLATFORM_CATALOG_HASH = createHash("sha256")
  .update(PLATFORM_GUIDE_TOPICS.map(topic => renderPlatformGuide(topic)).join("\n\n"))
  .digest("hex");

import "server-only";

import { GoogleCloudMediaError } from "./contracts";

export type YouTubeThumbnail = { url: string; width?: number; height?: number };

export type YouTubeVideoMetadata = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  description: string;
  publishedAt: string | null;
  duration: string | null;
  thumbnails: Record<string, YouTubeThumbnail>;
};

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function normalizeYouTubeVideoId(input: string) {
  const value = input.trim();
  if (VIDEO_ID_PATTERN.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new GoogleCloudMediaError("YOUTUBE_VIDEO_ID_INVALID", "A URL ou videoId do YouTube é inválido."); }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let candidate = hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || "";
  if (!candidate && ["youtube.com", "m.youtube.com"].includes(hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") candidate = parts[1] || "";
  }
  if (!VIDEO_ID_PATTERN.test(candidate)) throw new GoogleCloudMediaError("YOUTUBE_VIDEO_ID_INVALID", "A URL ou videoId do YouTube é inválido.");
  return candidate;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function thumbnailRecord(value: unknown) {
  const result: Record<string, YouTubeThumbnail> = {};
  const source = record(value);
  for (const [key, item] of Object.entries(source)) {
    const itemRecord = record(item);
    if (typeof itemRecord.url !== "string" || !itemRecord.url.trim()) continue;
    result[key] = {
      url: itemRecord.url.trim(),
      ...(typeof itemRecord.width === "number" ? { width: itemRecord.width } : {}),
      ...(typeof itemRecord.height === "number" ? { height: itemRecord.height } : {}),
    };
  }
  return result;
}

export async function fetchYouTubeVideoMetadata(input: {
  apiKey: string;
  videoUrlOrId: string;
  fetchImpl?: typeof fetch;
  healthCheck?: boolean;
}): Promise<YouTubeVideoMetadata> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new GoogleCloudMediaError("YOUTUBE_SECRET_INVALID", "A API key do YouTube não foi resolvida.");
  const videoId = normalizeYouTubeVideoId(input.videoUrlOrId);
  const fetchImpl = input.fetchImpl || fetch;
  const params = new URLSearchParams({ part: "snippet,contentDetails", id: videoId, key: apiKey });
  let response: Response;
  try {
    response = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new GoogleCloudMediaError("YOUTUBE_PROVIDER_FAILED", "O YouTube Data API está indisponível.");
  }
  let body: unknown = null;
  try { body = await response.json(); } catch { /* mapped below */ }
  if (!response.ok) throw new GoogleCloudMediaError("YOUTUBE_PROVIDER_FAILED", "O YouTube Data API rejeitou a consulta.");
  const items = record(body).items;
  if (!Array.isArray(items) || !items.length) throw new GoogleCloudMediaError("YOUTUBE_PROVIDER_FAILED", "O vídeo do YouTube não foi encontrado.");
  const item = record(items[0]);
  const snippet = record(item.snippet);
  const contentDetails = record(item.contentDetails);
  return {
    videoId,
    title: typeof snippet.title === "string" ? snippet.title : "",
    channelId: typeof snippet.channelId === "string" ? snippet.channelId : "",
    channelTitle: typeof snippet.channelTitle === "string" ? snippet.channelTitle : "",
    description: typeof snippet.description === "string" ? snippet.description : "",
    publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
    duration: typeof contentDetails.duration === "string" ? contentDetails.duration : null,
    thumbnails: thumbnailRecord(snippet.thumbnails),
  };
}

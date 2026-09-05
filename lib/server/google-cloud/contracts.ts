export const GOOGLE_CLOUD_PROVIDER_KEY = "google_cloud" as const;
export const YOUTUBE_DATA_PROVIDER_KEY = "youtube_data" as const;

export const GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_NAME = "google_cloud_service_account" as const;
export const GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_FIELD = "GOOGLE_CLOUD_SERVICE_ACCOUNT" as const;
export const GOOGLE_CLOUD_SERVICE_ACCOUNT_SECRET_DESCRIPTION = "Google Cloud Service Account para operações compartilhadas de Speech e Storage" as const;
export const GOOGLE_CLOUD_MEDIA_METADATA_KEY = "google_cloud_media" as const;
export const GOOGLE_CLOUD_MEDIA_BUCKET_METADATA_KEY = "bucket_name" as const;
export const GOOGLE_CLOUD_MEDIA_BUCKET_CONFIG_KEY = "google_cloud_media.bucket_name" as const;
export const YOUTUBE_DATA_API_KEY_SECRET_NAME = "youtube_data_api_key" as const;
export const YOUTUBE_DATA_API_KEY_SECRET_FIELD = "YOUTUBE_DATA_API_KEY" as const;
export const YOUTUBE_DATA_API_KEY_SECRET_DESCRIPTION = "API key restrita para metadados públicos do YouTube Data API" as const;

export type GoogleCloudServiceAccountCredentials = {
  type: "service_account";
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
  universe_domain?: string;
};

export type GoogleCloudMediaErrorCode =
  | "GOOGLE_CLOUD_SECRET_INVALID"
  | "GOOGLE_CLOUD_DEPENDENCY_MISSING"
  | "GOOGLE_CLOUD_CONFIGURATION_MISSING"
  | "GOOGLE_CLOUD_PROVIDER_FAILED"
  | "MEDIA_BUCKET_NOT_CONFIGURED"
  | "CREDENTIAL_INVALID"
  | "BUCKET_NOT_FOUND"
  | "BUCKET_ACCESS_DENIED"
  | "STORAGE_API_DISABLED"
  | "PROVIDER_ERROR"
  | "YOUTUBE_SECRET_INVALID"
  | "YOUTUBE_VIDEO_ID_INVALID"
  | "YOUTUBE_PROVIDER_FAILED";

export class GoogleCloudMediaError extends Error {
  public readonly code: GoogleCloudMediaErrorCode;

  constructor(code: GoogleCloudMediaErrorCode, message: string) {
    super(message);
    this.name = "GoogleCloudMediaError";
    this.code = code;
  }
}

const SERVICE_ACCOUNT_FIELDS = new Set([
  "type",
  "project_id",
  "private_key_id",
  "private_key",
  "client_email",
  "client_id",
  "auth_uri",
  "token_uri",
  "auth_provider_x509_cert_url",
  "client_x509_cert_url",
  "universe_domain",
]);

function requiredString(record: Record<string, unknown>, field: string, max = 16_000) {
  const value = record[field];
  if (typeof value !== "string" || !value.trim() || value.length > max) return null;
  return value.trim();
}

function optionalString(record: Record<string, unknown>, field: string, max = 16_000) {
  const value = record[field];
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) return null;
  return value.trim();
}

export function parseGoogleCloudServiceAccountSecret(payload: string): GoogleCloudServiceAccountCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_SECRET_INVALID", "A credencial Google Cloud possui formato inválido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_SECRET_INVALID", "A credencial Google Cloud possui formato inválido.");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).some((field) => !SERVICE_ACCOUNT_FIELDS.has(field))) {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_SECRET_INVALID", "A credencial Google Cloud contém campos não permitidos.");
  }
  if (record.type !== "service_account") {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_SECRET_INVALID", "A credencial Google Cloud não é uma Service Account.");
  }

  const projectId = requiredString(record, "project_id", 256);
  const privateKey = requiredString(record, "private_key", 16_000);
  const clientEmail = requiredString(record, "client_email", 512);
  const tokenUri = requiredString(record, "token_uri", 2_000);
  if (!projectId || !privateKey || !clientEmail || !tokenUri || !privateKey.includes("PRIVATE KEY")) {
    throw new GoogleCloudMediaError("GOOGLE_CLOUD_SECRET_INVALID", "A credencial Google Cloud está incompleta.");
  }

  const optionalFields = [
    "private_key_id",
    "client_id",
    "auth_uri",
    "auth_provider_x509_cert_url",
    "client_x509_cert_url",
    "universe_domain",
  ] as const;
  const values: Record<string, string> = {};
  for (const field of optionalFields) {
    const value = optionalString(record, field);
    if (value === null) throw new GoogleCloudMediaError("GOOGLE_CLOUD_SECRET_INVALID", "A credencial Google Cloud possui metadados inválidos.");
    if (value) values[field] = value;
  }

  return {
    type: "service_account",
    project_id: projectId,
    private_key: privateKey,
    client_email: clientEmail,
    token_uri: tokenUri,
    ...(values.private_key_id ? { private_key_id: values.private_key_id } : {}),
    ...(values.client_id ? { client_id: values.client_id } : {}),
    ...(values.auth_uri ? { auth_uri: values.auth_uri } : {}),
    ...(values.auth_provider_x509_cert_url ? { auth_provider_x509_cert_url: values.auth_provider_x509_cert_url } : {}),
    ...(values.client_x509_cert_url ? { client_x509_cert_url: values.client_x509_cert_url } : {}),
    ...(values.universe_domain ? { universe_domain: values.universe_domain } : {}),
  };
}

export function normalizeGoogleCloudServiceAccountSecret(payload: string) {
  return JSON.stringify(parseGoogleCloudServiceAccountSecret(payload));
}

export function parseYouTubeDataApiKeySecret(payload: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new GoogleCloudMediaError("YOUTUBE_SECRET_INVALID", "A credencial YouTube Data possui formato inválido.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GoogleCloudMediaError("YOUTUBE_SECRET_INVALID", "A credencial YouTube Data possui formato inválido.");
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || Object.keys(record)[0] !== YOUTUBE_DATA_API_KEY_SECRET_FIELD) {
    throw new GoogleCloudMediaError("YOUTUBE_SECRET_INVALID", "A credencial YouTube Data contém campos não permitidos.");
  }
  const apiKey = record[YOUTUBE_DATA_API_KEY_SECRET_FIELD];
  if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 512) {
    throw new GoogleCloudMediaError("YOUTUBE_SECRET_INVALID", "A credencial YouTube Data está incompleta.");
  }
  return apiKey.trim();
}

export function normalizeYouTubeDataApiSecret(payload: string) {
  return JSON.stringify({ [YOUTUBE_DATA_API_KEY_SECRET_FIELD]: parseYouTubeDataApiKeySecret(payload) });
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readGoogleCloudMediaBucketName(metadata: unknown) {
  const record = metadataRecord(metadata);
  const media = metadataRecord(record[GOOGLE_CLOUD_MEDIA_METADATA_KEY]);
  const value = media[GOOGLE_CLOUD_MEDIA_BUCKET_METADATA_KEY] ?? record.google_cloud_media_bucket;
  return normalizeMediaBucketName(value);
}

export function sanitizeGoogleCloudConfiguration(input: { projectId: string; bucketName?: string | null }) {
  return {
    projectId: input.projectId,
    bucketConfigured: Boolean(input.bucketName?.trim()),
  } as const;
}

export function normalizeMediaBucketName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(normalized) ? normalized : null;
}

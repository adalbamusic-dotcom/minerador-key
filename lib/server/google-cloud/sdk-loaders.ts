import "server-only";

import { GoogleCloudMediaError, type GoogleCloudServiceAccountCredentials } from "./contracts";
import type { SpeechClientLike } from "./speech-operation";
import type { StorageClientLike } from "./storage-operation";

type SpeechSdk = typeof import("@google-cloud/speech");
type StorageSdk = typeof import("@google-cloud/storage");

function isMissingPackageError(error: unknown, packageName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  if (code !== "MODULE_NOT_FOUND" && code !== "ERR_MODULE_NOT_FOUND") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return !message || message.includes(packageName);
}

async function loadSpeechSdk(): Promise<SpeechSdk> {
  try {
    return await import("@google-cloud/speech");
  } catch (error) {
    if (isMissingPackageError(error, "@google-cloud/speech")) {
      throw new GoogleCloudMediaError("GOOGLE_CLOUD_DEPENDENCY_MISSING", "A dependência @google-cloud/speech não está instalada no runtime.");
    }
    throw error;
  }
}

async function loadStorageSdk(): Promise<StorageSdk> {
  try {
    return await import("@google-cloud/storage");
  } catch (error) {
    if (isMissingPackageError(error, "@google-cloud/storage")) {
      throw new GoogleCloudMediaError("GOOGLE_CLOUD_DEPENDENCY_MISSING", "A dependência @google-cloud/storage não está instalada no runtime.");
    }
    throw error;
  }
}

export async function loadGoogleCloudSpeechClient(credentials: GoogleCloudServiceAccountCredentials): Promise<SpeechClientLike> {
  const { SpeechClient: Client } = await loadSpeechSdk();
  if (!Client) throw new GoogleCloudMediaError("GOOGLE_CLOUD_DEPENDENCY_MISSING", "O client oficial do Speech-to-Text não está disponível.");
  return new Client({ projectId: credentials.project_id, credentials }) as unknown as SpeechClientLike;
}

export async function loadGoogleCloudStorageClient(credentials: GoogleCloudServiceAccountCredentials): Promise<StorageClientLike> {
  const { Storage: Client } = await loadStorageSdk();
  if (!Client) throw new GoogleCloudMediaError("GOOGLE_CLOUD_DEPENDENCY_MISSING", "O client oficial do Cloud Storage não está disponível.");
  return new Client({ projectId: credentials.project_id, credentials }) as unknown as StorageClientLike;
}

"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Camera, Check, LoaderCircle, X, ZoomIn } from "lucide-react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { useNoticeCenter } from "@/components/global-notice-center";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

const PROFILE_NAME_MAX_LENGTH = 120;
const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
const AVATAR_OUTPUT_SIZE = 256;
const AVATAR_OUTPUT_QUALITY = 0.82;
const AVATAR_BUCKET = "profile-avatars";
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ProfileIdentity = {
  name: string | null;
  email: string | null;
  image?: string | null;
};

type InlineStatus = {
  tone: "success" | "info" | "error";
  message: string;
} | null;

type AvatarDraft = {
  sourceUrl: string;
  image: HTMLImageElement;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type CropMetrics = {
  width: number;
  height: number;
  left: number;
  top: number;
};

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = (name || email || "U").trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cropMetrics(draft: Pick<AvatarDraft, "image" | "zoom" | "offsetX" | "offsetY">): CropMetrics {
  const naturalWidth = draft.image.naturalWidth || draft.image.width;
  const naturalHeight = draft.image.naturalHeight || draft.image.height;
  const fitScale = Math.max(AVATAR_OUTPUT_SIZE / naturalWidth, AVATAR_OUTPUT_SIZE / naturalHeight);
  const width = naturalWidth * fitScale * draft.zoom;
  const height = naturalHeight * fitScale * draft.zoom;
  return {
    width,
    height,
    left: (AVATAR_OUTPUT_SIZE - width) / 2 + draft.offsetX,
    top: (AVATAR_OUTPUT_SIZE - height) / 2 + draft.offsetY,
  };
}

function readMetadataName(user: { user_metadata?: unknown }) {
  const metadata = user.user_metadata && typeof user.user_metadata === "object"
    ? user.user_metadata as Record<string, unknown>
    : {};
  return ["full_name", "name", "display_name"]
    .map((key) => metadata[key])
    .find((value): value is string => typeof value === "string" && Boolean(value.trim())) || "";
}

export function ProfileIdentityEditor({ identity, initialImage, isPlatformAdmin }: { identity: ProfileIdentity; initialImage?: string | null; isPlatformAdmin: boolean }) {
  const { data: session, setPresentationOverride } = useSupabaseSession();
  const { publishNotice } = useNoticeCenter();
  const [name, setName] = useState(identity.name || "");
  const [nameDirty, setNameDirty] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<InlineStatus>(null);
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<InlineStatus>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const avatarLoadGenerationRef = useRef(0);

  const currentName = session?.user?.name || identity.name || "";
  const currentEmail = session?.user?.email || identity.email;
  const currentImage = session?.user?.image || initialImage || identity.image || null;

  useEffect(() => {
    if (nameDirty) return;
    // Auth metadata is the canonical persisted name; hydrate it when the
    // browser session becomes available after the server-rendered shell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(currentName);
  }, [currentName, nameDirty]);

  const publishProfileNotice = (severity: "SUCCESS" | "INFO" | "ERROR", title: string, message: string, code: string) => {
    publishNotice({
      severity,
      title,
      message,
      source: severity === "SUCCESS" ? "persistence" : severity === "ERROR" ? "validation" : "system",
      confirmed: severity === "SUCCESS",
      module: "perfil",
      area: "identidade",
      showToast: false,
      copyPayload: { code },
    });
  };

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
      setNameStatus({ tone: "error", message: "Informe um nome para a identidade." });
      publishProfileNotice("ERROR", "Perfil", "O nome não foi salvo porque está vazio.", "PROFILE_NAME_REQUIRED");
      return;
    }
    if (normalizedName.length > PROFILE_NAME_MAX_LENGTH) {
      setNameStatus({ tone: "error", message: `Use no máximo ${PROFILE_NAME_MAX_LENGTH} caracteres.` });
      publishProfileNotice("ERROR", "Perfil", "O nome excede o limite permitido.", "PROFILE_NAME_TOO_LONG");
      return;
    }

    setSavingName(true);
    setNameStatus(null);
    try {
      const client = getBrowserSupabaseClient();
      const { data: updated, error: updateError } = await client.auth.updateUser({ data: { full_name: normalizedName } });
      if (updateError || !updated.user) throw new Error("PROFILE_NAME_UPDATE_ERROR");

      const { data: readback, error: readbackError } = await client.auth.getUser();
      if (readbackError || !readback.user || readback.user.id !== updated.user.id || readMetadataName(readback.user) !== normalizedName) {
        throw new Error("PROFILE_NAME_READBACK_ERROR");
      }

      setName(normalizedName);
      setNameDirty(false);
      setPresentationOverride({ name: normalizedName });
      setNameStatus({ tone: "success", message: "Nome salvo e confirmado na identidade Auth." });
      publishProfileNotice("SUCCESS", "Perfil atualizado", "O nome foi salvo e confirmado.", "PROFILE_NAME_PERSISTED");
    } catch {
      setNameStatus({ tone: "error", message: "Não foi possível confirmar o salvamento do nome." });
      publishProfileNotice("ERROR", "Perfil", "O nome não foi confirmado pela autenticação.", "PROFILE_NAME_UPDATE_ERROR");
    } finally {
      setSavingName(false);
    }
  }

  function setAvatarError(message: string, code: string) {
    setAvatarStatus({ tone: "error", message });
    publishProfileNotice("ERROR", "Avatar", message, code);
  }

  function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!AVATAR_TYPES.has(file.type)) {
      setAvatarError("Use uma imagem JPEG, PNG ou WEBP. SVG não é aceito.", "PROFILE_AVATAR_TYPE_INVALID");
      return;
    }
    if (file.size > AVATAR_MAX_INPUT_BYTES) {
      setAvatarError("A imagem deve ter no máximo 5 MB.", "PROFILE_AVATAR_SIZE_INVALID");
      return;
    }

    const sourceUrl = URL.createObjectURL(file);
    const generation = avatarLoadGenerationRef.current + 1;
    avatarLoadGenerationRef.current = generation;
    const image = new Image();
    image.onload = () => {
      if (avatarLoadGenerationRef.current !== generation) {
        URL.revokeObjectURL(sourceUrl);
        return;
      }
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = sourceUrl;
      setAvatarStatus(null);
      setAvatarDraft({ sourceUrl, image, zoom: 1, offsetX: 0, offsetY: 0 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      setAvatarError("Não foi possível ler essa imagem.", "PROFILE_AVATAR_READ_ERROR");
    };
    image.src = sourceUrl;
  }

  function closeAvatarEditor() {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = null;
    setAvatarDraft(null);
    setAvatarBusy(false);
    dragRef.current = null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!avatarDraft) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: avatarDraft.offsetX,
      offsetY: avatarDraft.offsetY,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!avatarDraft || !drag || drag.pointerId !== event.pointerId) return;
    setAvatarDraft((current) => current ? {
      ...current,
      offsetX: drag.offsetX + event.clientX - drag.startX,
      offsetY: drag.offsetY + event.clientY - drag.startY,
    } : current);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function confirmAvatar() {
    if (!avatarDraft) return;
    setAvatarBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_OUTPUT_SIZE;
      canvas.height = AVATAR_OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PROFILE_AVATAR_CANVAS_ERROR");
      const metrics = cropMetrics(avatarDraft);
      context.drawImage(avatarDraft.image, metrics.left, metrics.top, metrics.width, metrics.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", AVATAR_OUTPUT_QUALITY));
      if (!blob) throw new Error("PROFILE_AVATAR_COMPRESSION_ERROR");

      const actorUserId = session?.user?.id;
      if (!actorUserId) throw new Error("PROFILE_AVATAR_AUTH_REQUIRED");
      const client = getBrowserSupabaseClient();
      const objectPath = `${actorUserId}/avatar.webp`;
      const { error: uploadError } = await client.storage.from(AVATAR_BUCKET).upload(objectPath, blob, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: true,
      });
      if (uploadError) throw new Error("PROFILE_AVATAR_UPLOAD_ERROR");

      const { data: publicData } = client.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
      const avatarUrl = `${publicData.publicUrl}?v=${Date.now()}`;
      const { data: updated, error: updateError } = await client.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (updateError || !updated.user) throw new Error("PROFILE_AVATAR_REFERENCE_UPDATE_ERROR");

      const { data: storedAvatar, error: storageReadbackError } = await client.storage.from(AVATAR_BUCKET).download(objectPath);
      if (storageReadbackError || !storedAvatar || storedAvatar.size <= 0) throw new Error("PROFILE_AVATAR_STORAGE_READBACK_ERROR");
      const { data: authReadback, error: authReadbackError } = await client.auth.getUser();
      const readbackUrl = authReadback.user?.user_metadata?.avatar_url;
      if (authReadbackError || !authReadback.user || authReadback.user.id !== actorUserId || readbackUrl !== avatarUrl) {
        throw new Error("PROFILE_AVATAR_REFERENCE_READBACK_ERROR");
      }

      setPresentationOverride({ image: avatarUrl });
      setAvatarStatus({ tone: "success", message: "Foto salva e confirmada na identidade." });
      publishProfileNotice("SUCCESS", "Perfil atualizado", "A foto foi salva e confirmada.", "PROFILE_AVATAR_PERSISTED");
      closeAvatarEditor();
    } catch {
      setAvatarError("Não foi possível confirmar o salvamento do avatar.", "PROFILE_AVATAR_PERSISTENCE_ERROR");
      setAvatarBusy(false);
    }
  }

  const avatarLabel = currentImage ? "Alterar foto do perfil" : "Adicionar foto do perfil";

  return <>
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-foreground/15 bg-foreground/10 text-xl font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label={avatarLabel} title={avatarLabel}>
          {currentImage ? <img src={currentImage} alt="Avatar pessoal" className="h-full w-full object-cover" /> : initials(currentName, currentEmail)}
          <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-context-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="h-5 w-5" aria-hidden="true" /></span>
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-context-accent hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">
          <Camera className="h-4 w-4" aria-hidden="true" /> Alterar foto
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarFile} className="sr-only" aria-label="Selecionar foto do perfil" />
      </div>

      <div className="min-w-0 flex-1">
        <form onSubmit={saveName} className="max-w-xl">
          <label htmlFor="profile-name" className="text-sm font-medium text-foreground/70">Nome</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <input id="profile-name" value={name} onChange={(event) => { setName(event.target.value); setNameDirty(true); setNameStatus(null); }} maxLength={PROFILE_NAME_MAX_LENGTH} autoComplete="name" className="min-h-10 min-w-0 flex-1 rounded-md border border-divider bg-surface-subtle px-3 text-sm text-foreground outline-none placeholder:text-text-muted focus:border-context-accent focus:ring-2 focus:ring-context-accent/25" />
            <button type="submit" disabled={savingName || !nameDirty} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-context-accent/35 px-3 text-sm font-semibold text-context-accent hover:bg-context-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-not-allowed disabled:opacity-50">
              {savingName ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Salvar nome
            </button>
          </div>
          {nameStatus ? <p className={`mt-2 text-sm leading-6 ${nameStatus.tone === "success" ? "text-success" : nameStatus.tone === "error" ? "text-danger" : "text-context-accent"}`} role="status" aria-live="polite">{nameStatus.message}</p> : null}
        </form>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm text-foreground/60">E-mail de acesso</dt><dd className="mt-1 break-words font-medium">{currentEmail || "E-mail não informado"}</dd></div>
          <div><dt className="text-sm text-foreground/60">Papel global</dt><dd className="mt-1 font-medium">{isPlatformAdmin ? "Admin global" : "Usuário autenticado"}</dd></div>
        </dl>
        {avatarStatus ? <p className={`mt-4 text-sm leading-6 ${avatarStatus.tone === "error" ? "text-danger" : avatarStatus.tone === "success" ? "text-success" : "text-context-accent"}`} role="status" aria-live="polite">{avatarStatus.message}</p> : null}
      </div>
    </div>

    {avatarDraft ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="profile-avatar-dialog-title">
      <div className="w-[min(28rem,calc(100vw-1rem))] rounded-xl border border-divider bg-surface-elevated p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="profile-avatar-dialog-title" className="text-base font-semibold">Ajustar foto</h2><p className="mt-1 text-sm leading-6 text-text-muted">Mova a imagem e ajuste o zoom. Nada é enviado antes de confirmar.</p></div>
          <button type="button" onClick={closeAvatarEditor} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-foreground/60 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label="Cancelar ajuste da foto"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <div className="mt-4 flex justify-center">
          <div className="relative h-64 w-64 max-w-full touch-none overflow-hidden rounded-full border-2 border-context-accent bg-surface-subtle" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} aria-label="Prévia quadrada da foto, arraste para reposicionar">
            <img src={avatarDraft.sourceUrl} alt="Prévia da foto" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={cropMetrics(avatarDraft)} />
          </div>
        </div>
        <label htmlFor="profile-avatar-zoom" className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground/70"><ZoomIn className="h-4 w-4 text-context-accent" aria-hidden="true" /> Zoom <span className="ml-auto tabular-nums text-text-muted">{avatarDraft.zoom.toFixed(1)}×</span></label>
        <input id="profile-avatar-zoom" type="range" min="1" max="3" step="0.1" value={avatarDraft.zoom} onChange={(event) => setAvatarDraft((current) => current ? { ...current, zoom: Number(event.target.value) } : current)} className="mt-2 w-full accent-[var(--context-accent)]" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={closeAvatarEditor} className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-foreground/70 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">Cancelar</button>
          <button type="button" onClick={() => void confirmAvatar()} disabled={avatarBusy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-context-accent/35 px-3 text-sm font-semibold text-context-accent hover:bg-context-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent disabled:cursor-not-allowed disabled:opacity-50">
            {avatarBusy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />} Usar prévia
          </button>
        </div>
      </div>
    </div> : null}
  </>;
}

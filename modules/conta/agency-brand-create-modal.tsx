"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { internalButton, internalButtonPrimary, internalField, internalNoticeError } from "@/components/editorial/internal-page-visual";
import { useNoticeBridge } from "@/components/global-notice-center";

const button = `${internalButton} min-h-11 px-4`;
const input = `${internalField} min-h-11`;
const emptyForm = { name: "", siteUrl: "", nicho: "", localizacao: "" };

type FormState = typeof emptyForm;

function Result({ message }: { message: string }) {
  return <p role="alert" className={internalNoticeError}>{message}</p>;
}

export function AgencyBrandCreateModal({ agencyRef, canManage, open, onClose }: { agencyRef: string; canManage: boolean; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useNoticeBridge({ notice: error, module: "conta", area: "Cadastro de marca", title: "Conta · Marca", fallbackSeverity: "ERROR" });

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) { setForm(emptyForm); setError(""); onClose(); }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open, saving]);

  if (!open || !canManage) return null;

  const close = () => {
    if (saving) return;
    setForm(emptyForm);
    setError("");
    onClose();
  };

  const update = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function create() {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/agencies/${agencyRef}/brands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setError(body.error || "Não foi possível cadastrar a Marca.");
      return;
    }
    const createdName = body.brandName || form.name.trim();
    setForm(emptyForm);
    onClose();
    router.push(`/agencias/${agencyRef}/marcas?created=${encodeURIComponent(createdName)}`);
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/75 p-4 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
     <section className="max-h-[min(720px,calc(100vh-2rem))] w-full max-w-2xl overflow-y-auto rounded-lg border border-divider bg-surface-elevated p-5 shadow-md sm:p-6" role="dialog" aria-modal="true" aria-labelledby="agency-brand-create-title">
      <div className="flex items-start justify-between gap-4">
        <div>
           <p className="text-sm font-medium text-text-muted">Nova Marca</p>
          <h2 id="agency-brand-create-title" className="mt-1 text-xl font-semibold">Cadastrar Marca</h2>
           <p className="mt-2 max-w-xl text-sm leading-6 text-text-muted">Cadastre os dados básicos da Marca atendida pela sua Agência. Estratégia e identidade da marca são configuradas depois, nas áreas próprias.</p>
        </div>
         <button type="button" className={`${internalButton} min-h-11 min-w-11 p-0`} onClick={close} disabled={saving} aria-label="Fechar cadastro de Marca"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold" htmlFor="new-brand-name">Nome da Marca<input id="new-brand-name" className={`${input} mt-2`} value={form.name} onChange={(event) => update("name", event.target.value)} disabled={saving} autoFocus /></label>
        <label className="text-sm font-semibold" htmlFor="new-brand-site">Website <span className="font-normal text-foreground/60">(opcional)</span><input id="new-brand-site" type="url" className={`${input} mt-2`} value={form.siteUrl} onChange={(event) => update("siteUrl", event.target.value)} disabled={saving} placeholder="https://exemplo.com" /></label>
        <label className="text-sm font-semibold" htmlFor="new-brand-niche">Nicho operacional <span className="font-normal text-foreground/60">(opcional)</span><input id="new-brand-niche" className={`${input} mt-2`} value={form.nicho} onChange={(event) => update("nicho", event.target.value)} disabled={saving} /></label>
        <label className="text-sm font-semibold" htmlFor="new-brand-location">Localização / área de atuação <span className="font-normal text-foreground/60">(opcional)</span><input id="new-brand-location" className={`${input} mt-2`} value={form.localizacao} onChange={(event) => update("localizacao", event.target.value)} disabled={saving} /></label>
      </div>

      {error ? <div className="mt-4"><Result message={error} /></div> : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" className={button} onClick={close} disabled={saving}>Cancelar</button>
        <button type="button" className={`${internalButtonPrimary} min-h-11 px-4`} onClick={() => void create()} disabled={saving || !form.name.trim()}>{saving ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Cadastrando…</> : "Cadastrar Marca"}</button>
      </div>
    </section>
  </div>;
}

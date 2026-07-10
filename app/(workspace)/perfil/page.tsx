"use client";

import React, { useState, useEffect } from "react";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { 
  Building2, 
  Globe, 
  MapPin, 
  Tag, 
  FileText, 
  UploadCloud, 
  Loader2, 
  Check, 
  AlertTriangle 
} from "lucide-react";

export default function BrandProfilePage() {
  const { activeBrand, refreshBrands, profileLoading } = useBrand();

  // Form states
  const [nome, setNome] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [nicho, setNicho] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [dna, setDna] = useState("");
  
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Load active brand details into form states on load/change
  useEffect(() => {
    if (activeBrand) {
      setNome(activeBrand.nome || "");
      setSiteUrl(activeBrand.site_url || "");
      setNicho(activeBrand.nicho || "");
      setLocalizacao(activeBrand.localizacao || "");
      setDna(activeBrand.dna_diretrizes || "");
    }
  }, [activeBrand]);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // File parsing logic for txt/md/docx
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    
    if (fileExtension === "txt" || fileExtension === "md") {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          setDna(text);
          showNotification("success", `Diretrizes do arquivo "${file.name}" carregadas com sucesso.`);
        }
      };
      reader.onerror = () => {
        showNotification("error", "Erro ao ler o arquivo de texto.");
      };
      reader.readAsText(file);
    } else if (fileExtension === "docx") {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result;
        if (arrayBuffer instanceof ArrayBuffer) {
          try {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            if (result.value) {
              setDna(result.value);
              showNotification("success", `Diretrizes do arquivo Word "${file.name}" extraídas com sucesso.`);
            } else {
              showNotification("error", "Nenhum texto extraído do arquivo DOCX.");
            }
          } catch (err) {
            console.error("Erro ao processar DOCX com mammoth:", err);
            showNotification("error", "Erro ao processar o arquivo DOCX.");
          }
        }
      };
      reader.onerror = () => {
        showNotification("error", "Erro ao ler o arquivo DOCX.");
      };
      reader.readAsArrayBuffer(file);
    } else {
      showNotification("error", "Formato de arquivo não suportado. Use .txt, .md ou .docx.");
    }
    
    e.target.value = "";
  };

  // Submit/Update changes to API
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBrand) return;

    if (!nome.trim()) {
      showNotification("error", "O nome da marca é obrigatório.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: activeBrand.id,
        nome: nome.trim(),
        site_url: siteUrl.trim(),
        nicho: nicho.trim(),
        dna_diretrizes: dna.trim(),
        localizacao: localizacao.trim(),
        silos_existentes: activeBrand.silos_existentes // Keep original silos
      };

      const response = await fetch("/api/marcas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erro ao salvar perfil");
      }

      showNotification("success", "Perfil da marca atualizado com sucesso!");
      await refreshBrands();
    } catch (err: any) {
      console.error(err);
      showNotification("error", err.message || "Erro ao salvar alterações no banco");
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#06070a] text-slate-200 font-mono">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
        <span>Buscando dados do perfil...</span>
      </div>
    );
  }

  if (!activeBrand) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#06070a] text-slate-200 p-6 text-center font-mono relative">
        <div className="absolute top-3 right-3">
          <AppMenu active="perfil" />
        </div>
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-3" />
        <h1 className="text-sm font-bold text-white uppercase tracking-wider">Nenhuma Marca Ativa</h1>
        <p className="text-xs text-slate-500 mt-2 max-w-sm leading-relaxed">
          Nenhuma marca ativa foi selecionada ou associada à sua conta. Se você é administrador, crie uma marca no Painel Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#06070a] p-6 overflow-y-auto select-none font-mono">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded border shadow-xl text-xs ${
          notification.type === "success" 
            ? "bg-emerald-950 border-emerald-800 text-emerald-400" 
            : "bg-rose-955 border-rose-800 text-rose-400"
        }`}>
          <Check className="w-3.5 h-3.5" />
          <span>{notification.message}</span>
        </div>
      )}

      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="border-b border-slate-900 pb-4 flex items-start justify-between gap-4">
          <div>
          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block mb-0.5">Configurações DNA</span>
          <h1 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <span>Perfil da Marca: {activeBrand.nome}</span>
          </h1>
          <p className="text-[10px] text-slate-500 mt-1">
            Defina o DNA da marca, nicho e as diretrizes do dossiê (PRD) de SEO para orientar a geração inteligente de briefings.
          </p>
          </div>
          <AppMenu active="perfil" />
        </div>

        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* Left Column: Brand Details Fields (2/5 size) */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className="bg-[#0b0c10] border border-slate-900 rounded-lg p-5 flex flex-col gap-4 shadow-xl">
              <h2 className="text-xs font-bold text-slate-200 uppercase border-b border-slate-900 pb-2 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span>Identidade Comercial</span>
              </h2>

              {/* Brand Name (Admin only edit) */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome da Marca</label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 pl-8 py-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-650"
                    placeholder="Ex: Clinica Adalba"
                  />
                </div>
              </div>

              {/* Site URL */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">URL do Site</label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 pl-8 py-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-650"
                    placeholder="https://exemplo.com.br"
                  />
                </div>
              </div>

              {/* Nicho */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho / Segmento</label>
                <div className="relative">
                  <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 pl-8 py-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-650"
                    placeholder="Ex: Implantes Odontológicos, Estética"
                  />
                </div>
              </div>

              {/* Localizacao */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Localização Foco</label>
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={localizacao}
                    onChange={(e) => setLocalizacao(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 pl-8 py-1.5 text-slate-200 text-xs font-semibold focus:outline-none focus:border-indigo-650"
                    placeholder="Ex: Curitiba - PR"
                  />
                </div>
              </div>
            </div>

            {/* Read-only Silos layout widget */}
            <div className="bg-[#0b0c10] border border-slate-900 rounded-lg p-5 flex flex-col gap-3 shadow-xl">
              <span className="text-[9px] font-bold text-slate-550 uppercase tracking-wider">Silos / Categorias Ativas ({activeBrand.silos_existentes?.length || 0})</span>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {(!activeBrand.silos_existentes || activeBrand.silos_existentes.length === 0) ? (
                  <span className="text-[10px] text-slate-600 italic">Nenhum Silo associado.</span>
                ) : (
                  activeBrand.silos_existentes.map((silo: any, idx: number) => (
                    <div key={idx} className="bg-[#06070a] border border-slate-900 rounded px-2.5 py-1.5 flex items-center justify-between text-[10.5px]">
                      <span className="text-slate-300 font-bold">📁 {silo.nome}</span>
                      <span className="text-[9px] text-slate-600 font-mono">/{silo.slug}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: DNA PRD Guidelines Text Area & File Dropzone (3/5 size) */}
          <div className="lg:col-span-3 flex flex-col gap-5">
            <div className="bg-[#0b0c10] border border-slate-900 rounded-lg p-5 flex flex-col gap-4 shadow-xl">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <h2 className="text-xs font-bold text-slate-200 uppercase flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>Diretrizes de DNA & PRD</span>
                </h2>
                
                {/* Upload Trigger */}
                <label className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1 cursor-pointer bg-[#06070a] hover:bg-slate-900 border border-indigo-950/40 rounded px-2.5 py-1">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Subir Arquivo (DOCX / TXT / MD)</span>
                  <input
                    type="file"
                    accept=".txt,.md,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[9px] text-slate-550 uppercase font-bold tracking-wider">
                  <span>Corpo do DNA da Marca</span>
                  <span>{dna.length} caracteres</span>
                </div>
                <textarea
                  rows={15}
                  value={dna}
                  onChange={(e) => setDna(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-850 rounded p-3 text-slate-300 text-xs font-semibold leading-relaxed focus:outline-none focus:border-indigo-650 resize-none font-sans"
                  placeholder="Cole aqui o DNA da marca, diretrizes de escrita, público-alvo, personas, regras de SEO específicas do cliente ou PRD estratégico..."
                />
              </div>

              <div className="flex items-center justify-end gap-2 text-xs pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-2 px-6 rounded transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-950/40"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

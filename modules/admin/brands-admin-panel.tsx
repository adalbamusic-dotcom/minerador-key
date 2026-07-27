"use client";

import { useState, useEffect } from "react";
import { 
  Building2, 
  Globe, 
  Tag, 
  ChevronLeft, 
  Plus, 
  X, 
  Loader2, 
  BookOpen, 
  Folders, 
  Check, 
  Trash2,
  UploadCloud,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import Link from "next/link";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { useRouter } from "next/navigation";
import { buildTenantPath } from "@/lib/tenant-routing";

// Helper para formatar em slug
const toSlug = (text: string) => {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

type OwnerOption = {
  id: string;
  email: string;
  name: string | null;
  emailConfirmed: boolean;
  confirmedAt: string | null;
};

export default function MarcasPage() {
  const { refreshBrands, setSelectedBrandId, selectedBrandId, userRole, profileLoading } = useBrand();
  const router = useRouter();

  // Estados locais
  const [marcas, setMarcas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Campos do formulário
  const [nome, setNome] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [nicho, setNicho] = useState("");
  const [dna, setDna] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [ownerSearchText, setOwnerSearchText] = useState("");
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<OwnerOption | null>(null);
  const [ownerSearchStatus, setOwnerSearchStatus] = useState<"idle" | "searching" | "success" | "empty" | "error">("idle");
  const [ownerSearchError, setOwnerSearchError] = useState("");
  const [formError, setFormError] = useState("");
  const [silosInputs, setSilosInputs] = useState<{ nome: string; slug: string; isExisting?: boolean }[]>([{ nome: "", slug: "" }]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBrandId(null);
    setNome("");
    setSiteUrl("");
    setNicho("");
    setDna("");
    setLocalizacao("");
    setOwnerSearchText("");
    setOwnerOptions([]);
    setSelectedOwner(null);
    setOwnerSearchStatus("idle");
    setOwnerSearchError("");
    setFormError("");
    setSilosInputs([{ nome: "", slug: "" }]);
  };

  const handleEditBrandClick = (marca: any) => {
    setEditingBrandId(marca.id);
    setNome(marca.nome || "");
    setSiteUrl(marca.site_url || "");
    setNicho(marca.nicho || "");
    setDna(marca.dna_diretrizes || "");
    setLocalizacao(marca.localizacao || "");
    
    if (marca.silos_existentes && Array.isArray(marca.silos_existentes)) {
      const mapped = marca.silos_existentes.map((s: any) => {
        const nome = typeof s === "object" ? s.nome : s;
        const slug = typeof s === "object" ? s.slug : toSlug(s);
        return { nome, slug, isExisting: true };
      });
      setSilosInputs(mapped.length > 0 ? mapped : [{ nome: "", slug: "" }]);
    } else {
      setSilosInputs([{ nome: "", slug: "" }]);
    }
    
    setIsModalOpen(true);
  };



  // Carregar marcas
  const loadMarcas = async () => {
    if (userRole !== "admin") return;
    setLoading(true);
    try {
      const response = await fetch("/api/marcas");
      if (!response.ok) throw new Error("Erro ao buscar marcas");
      const data = await response.json();
      setMarcas(data.brands || []);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao carregar marcas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarcas();
  }, [userRole]);

  useEffect(() => {
    if (editingBrandId || selectedOwner || ownerSearchText.trim().length < 2) {
      setOwnerOptions([]);
      setOwnerSearchStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setOwnerSearchStatus("searching");
      setOwnerSearchError("");
      try {
        const response = await fetch(`/api/admin/owners?q=${encodeURIComponent(ownerSearchText.trim())}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Não foi possível buscar usuários.");
        setOwnerOptions(body.users || []);
        setOwnerSearchStatus(body.users?.length ? "success" : "empty");
      } catch (error) {
        if (!controller.signal.aborted) {
          setOwnerOptions([]);
          setOwnerSearchStatus("error");
          setOwnerSearchError(error instanceof Error ? error.message : "Não foi possível buscar usuários.");
        }
      } finally {
        if (controller.signal.aborted) setOwnerSearchStatus("idle");
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editingBrandId, ownerSearchText, selectedOwner]);

  // Notificações
  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Controle de linhas dinâmicas de silos
  const handleAddSiloRow = () => {
    setSilosInputs(prev => [...prev, { nome: "", slug: "" }]);
  };

  const handleRemoveSiloRow = (index: number) => {
    setSilosInputs(prev => prev.filter((_, i) => i !== index));
  };

  const handleSiloRowChange = (index: number, field: "nome" | "slug", value: string) => {
    setSilosInputs(prev => prev.map((s, idx) => {
      if (idx === index) {
        if (s.isExisting) return s; // Silos existentes não podem ser editados
        
        if (field === "nome") {
          const oldAutoSlug = toSlug(s.nome);
          const shouldUpdateSlug = s.slug === "" || s.slug === oldAutoSlug;
          return { 
            nome: value, 
            slug: shouldUpdateSlug ? toSlug(value) : s.slug 
          };
        }
        
        // Limpa apenas caracteres inválidos de slug, mas deixa o usuário digitar
        const sanitizedSlug = value.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-]+/g, "");
        return { ...s, slug: sanitizedSlug };
      }
      return s;
    }));
  };

  // Upload e extração de texto do arquivo de DNA (PRD)
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
    
    // Reseta o input de arquivo
    e.target.value = "";
  };

  // Salvar ou Atualizar marca no Supabase
  const handleSaveMarca = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!nome.trim()) {
      showNotification("error", "O nome da marca é obrigatório.");
      return;
    }
    if (!editingBrandId && !selectedOwner?.id) {
      setFormError("Selecione o proprietário da marca.");
      return;
    }
    if (!editingBrandId && ownerSearchStatus === "searching") {
      setFormError("Aguarde a conclusão da busca do proprietário.");
      return;
    }
    const activeSilos = silosInputs
      .map(s => ({ nome: s.nome.trim(), slug: s.slug.trim(), isExisting: s.isExisting }))
      .filter(s => s.nome.length > 0)
      .map(s => ({ nome: s.nome, slug: s.slug })); // Limpa prop isExisting para manter o JSONB limpo

    setSaving(true);
    try {
      const url = "/api/marcas";
      const method = editingBrandId ? "PUT" : "POST";
      
      const payload: any = {
        nome: nome.trim(),
        site_url: siteUrl.trim(),
        nicho: nicho.trim(),
        dna_diretrizes: dna.trim(),
        silos_existentes: activeSilos,
        localizacao: localizacao.trim()
      };
      if (!editingBrandId) {
        payload.ownerUserId = selectedOwner!.id;
      }
      
      if (editingBrandId) {
        payload.id = editingBrandId;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        setFormError(errData.error || `Erro ao ${editingBrandId ? "atualizar" : "cadastrar"} marca`);
        return;
      }

      const updatedBrand = await response.json();

      showNotification("success", `Marca ${editingBrandId ? "atualizada" : "cadastrada"} com sucesso!`);
      
      handleCloseModal();
      
      // Recarrega as marcas localmente e no BrandProvider global
      await loadMarcas();
      await refreshBrands();
      
      // Se não havia nenhuma marca selecionada, seleciona a recém-criada/editada
      if (!selectedBrandId && !editingBrandId) {
        setSelectedBrandId(updatedBrand.id);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar a marca.");
    } finally {
      setSaving(false);
    }
  };

  // Excluir marca (com prompt de segurança)
  const handleDeleteMarca = async (id: string, name: string) => {
    const promptName = prompt(
      `ATENÇÃO: A exclusão da marca "${name}" é permanente e apagará todos os silos de conteúdo associados.\n\nPara confirmar a exclusão, digite o nome exato da marca:`
    );
    
    if (promptName !== name) {
      alert("Confirmação incorreta. A marca não foi deletada.");
      return;
    }

    try {
      const response = await fetch(`/api/marcas?id=${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Erro ao excluir marca");
      }

      showNotification("success", `Marca "${name}" excluída.`);
      
      // Se a marca excluída era a selecionada, seleciona outra
      if (selectedBrandId === id) {
        localStorage.removeItem("selected_brand_id");
      }
      
      await loadMarcas();
      await refreshBrands();
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao excluir marca.");
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (userRole !== "admin") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500 mb-3" />
        <h1 className="text-lg font-bold text-white uppercase tracking-wider">Acesso Negado</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-md leading-relaxed">
          Você não tem permissão de administrador para visualizar ou gerenciar marcas. 
          Entre em contato com o administrador do sistema.
        </p>
        <Link href="/minerador" className="mt-4 bg-indigo-650 hover:bg-indigo-600 text-white rounded px-4 py-2 font-bold text-xs transition-colors">
          Voltar para Planilha
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col font-sans select-none p-6">
      
      {/* Notificação pop-up */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded border shadow-xl text-xs font-mono ${
          notification.type === "success" 
            ? "bg-emerald-950 border-emerald-800 text-emerald-400" 
            : "bg-rose-955 border-rose-800 text-rose-400"
        }`}>
          <Check className="w-3.5 h-3.5" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Cabeçalho de Navegação */}
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <Link 
            href="/minerador"
            className="flex items-center gap-1.5 text-slate-400 hover:text-white font-semibold text-xs bg-[#0b0c10] border border-slate-800 rounded px-2.5 py-1.5 transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Voltar Planilha
          </Link>
          <div>
            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block">Painel Administrativo</span>
            <h1 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" /> Gerenciador de Marcas (Clientes)
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 bg-indigo-650 hover:bg-indigo-600 text-white rounded px-4 py-2 font-semibold text-xs transition-all shadow-lg hover:scale-[1.01]"
          >
            <Plus className="w-4 h-4" /> Cadastrar Marca
          </button>
          <AppMenu active="admin" />
        </div>
      </header>

      {/* Grid de Marcas */}
      <main className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
            <span className="text-xs text-slate-500 font-mono">Buscando marcas no banco...</span>
          </div>
        ) : marcas.length === 0 ? (
          <div className="bg-[#0b0c10] border border-slate-850 rounded p-12 text-center max-w-md mx-auto mt-12">
            <Building2 className="w-8 h-8 text-slate-650 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-slate-300">Nenhuma Marca Cadastrada</h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Para começar a organizar silos de conteúdo e briefings KGR, cadastre a primeira marca ou cliente.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 bg-indigo-655 hover:bg-indigo-600 text-white rounded px-3.5 py-1.5 font-bold text-[11px] transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Cadastrar Agora
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {marcas.map(marca => (
              <div 
                key={marca.id}
                className="bg-[#0b0c10] border border-slate-900 rounded-lg overflow-hidden flex flex-col hover:border-slate-800 transition-all shadow-xl group relative"
              >
                {/* Linha topo estética */}
                <div className="h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600"></div>

                {/* Conteúdo */}
                <div className="p-5 flex-1 flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-200 text-sm group-hover:text-white transition-colors">{marca.nome}</h3>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <span className="text-[9.5px] font-bold text-indigo-400 uppercase tracking-wider block">
                          📍 {marca.localizacao || "Brasil (Nacional)"}
                        </span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                          {marca.nicho || "Nicho não informado"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Botão de Editar */}
                      <button
                        onClick={() => handleEditBrandClick(marca)}
                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-indigo-400 rounded transition-all"
                        title="Editar Marca"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                      </button>

                      {/* Botão de Excluir */}
                      <button
                        onClick={() => handleDeleteMarca(marca.id, marca.nome)}
                        className="p-1 hover:bg-red-950/20 text-slate-650 hover:text-red-400 rounded transition-all"
                        title="Excluir Marca"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1 border-y border-slate-900/60 py-2 text-[9px]">
                    <span className="text-slate-500">Status: <strong className="text-emerald-400">{marca.status || "active"}</strong></span>
                    <span className="text-slate-500 break-all">Owner: <strong className="text-slate-300">{marca.owner_user_id || "não definido"}</strong></span>
                    <span className="text-slate-500">Memberships: <strong className="text-slate-300">{typeof marca.membershipCount === "number" ? marca.membershipCount : "—"}</strong></span>
                  </div>

                  {/* URL */}
                  {marca.site_url && (
                    <a 
                      href={marca.site_url.startsWith("http") ? marca.site_url : `https://${marca.site_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-indigo-400 hover:underline text-[11px] font-semibold"
                    >
                      <Globe className="w-3.5 h-3.5 text-slate-550" /> {marca.site_url}
                    </a>
                  )}

                  {/* Silos Cadastrados */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8.5px] font-bold text-slate-550 uppercase tracking-widest flex items-center gap-1">
                      <Folders className="w-3 h-3 text-slate-550" /> Silos / Categorias de Conteúdo
                    </span>
                    {marca.silos_existentes && Array.isArray(marca.silos_existentes) && marca.silos_existentes.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                        {marca.silos_existentes.map((silo: any, idx: number) => {
                          const sNome = typeof silo === "object" ? silo.nome : silo;
                          const sSlug = typeof silo === "object" ? silo.slug : toSlug(silo);
                          return (
                            <span key={idx} className="bg-indigo-950/25 border border-indigo-950/40 text-indigo-300 text-[9px] px-2 py-0.5 rounded" title={`Slug: ${sSlug}`}>
                              {sNome} <span className="text-slate-500 font-mono text-[8px]">/{sSlug}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[9.5px] text-slate-600 italic">Nenhum silo cadastrado.</span>
                    )}
                  </div>

                  {/* DNA e Tom de Voz */}
                  {marca.dna_diretrizes && (
                    <div className="border-t border-slate-900/60 pt-3 flex flex-col gap-1 mb-2">
                      <span className="text-[8.5px] font-bold text-slate-550 uppercase tracking-widest flex items-center gap-1">
                        <BookOpen className="w-3 h-3 text-slate-550" /> DNA e Diretrizes (Voz)
                      </span>
                      <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                        {marca.dna_diretrizes}
                      </p>
                    </div>
                  )}

                  {/* Botão Entrar na Marca */}
                  <button
                    onClick={() => {
                      setSelectedBrandId(marca.id);
                      router.push(buildTenantPath({ brandId: marca.id, brandName: marca.nome, module: "marca" }));
                    }}
                    className="mt-auto bg-indigo-650 hover:bg-indigo-600 text-white font-bold py-2 rounded text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full cursor-pointer hover:scale-[1.01]"
                  >
                    <span>Entrar na Marca</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal Nova Marca */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-lg rounded-lg overflow-hidden relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600"></div>
            
            {/* Header Modal */}
            <div className="px-5 py-4 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-400" /> {editingBrandId ? "Editar Marca" : "Cadastrar Nova Marca"}
              </span>
              <button 
                onClick={handleCloseModal} 
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveMarca} className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
              {formError ? <p className="text-[10px] text-rose-400">{formError}</p> : null}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nome */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome da Marca *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Clinica OdontoCamp"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
                  />
                </div>

                {/* Nicho */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho / Setor</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Odontologia, Advocacia"
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-655 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
                  />
                </div>
              </div>

              {!editingBrandId && (
                <fieldset className="rounded border border-indigo-950/60 bg-indigo-950/10 p-3">
                  <legend className="px-1 text-[9px] font-bold uppercase tracking-wider text-indigo-300">Proprietário *</legend>
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Busque por nome ou e-mail</label>
                  <input
                    type="text"
                    required
                    value={ownerSearchText}
                    onChange={(e) => {
                      setOwnerSearchText(e.target.value);
                      setSelectedOwner(null);
                      setOwnerSearchError("");
                      setOwnerSearchStatus("idle");
                      setFormError("");
                    }}
                    placeholder="Digite o nome ou e-mail do usuário cadastrado"
                    autoComplete="off"
                    className="mt-1 w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
                  />
                  {ownerSearchStatus === "searching" ? <p className="mt-2 text-[10px] text-slate-500">Buscando usuários Auth...</p> : null}
                  {ownerSearchError ? <p className="mt-2 text-[10px] text-rose-400">{ownerSearchError}</p> : null}
                  {!selectedOwner && ownerSearchText.trim().length >= 2 && ownerSearchStatus !== "searching" && !ownerSearchError && ownerOptions.length === 0 ? <p className="mt-2 text-[10px] text-amber-300">{ownerSearchText.includes("@") ? "Não encontramos um usuário cadastrado com esse e-mail. Cadastre o usuário primeiro." : "Nenhum usuário encontrado com esse nome ou e-mail."}</p> : null}
                  {ownerOptions.length > 0 ? (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-800 bg-[#06070a]">
                      {ownerOptions.map(owner => (
                        <button key={owner.id} type="button" onClick={() => { setSelectedOwner(owner); setOwnerSearchText(owner.email); setOwnerOptions([]); setOwnerSearchError(""); setOwnerSearchStatus("success"); setFormError(""); }} className="block w-full border-b border-slate-900 px-3 py-2 text-left last:border-b-0 hover:bg-slate-900">
                          <span className="block text-xs font-semibold text-slate-200">{owner.name || owner.email}</span>
                          <span className="block text-[10px] text-slate-400">{owner.email} · {owner.emailConfirmed ? "E-mail confirmado" : "E-mail ainda não confirmado."}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {selectedOwner ? (
                    <div className="mt-2 rounded border border-emerald-900/60 bg-emerald-950/10 px-3 py-2 text-[10px]">
                      <p className="font-semibold text-emerald-300">Proprietário selecionado: {selectedOwner.name || selectedOwner.email}</p>
                      <p className="text-slate-400">{selectedOwner.email} · {selectedOwner.emailConfirmed ? "E-mail confirmado" : "E-mail ainda não confirmado."}</p>
                      <p className="break-all font-mono text-slate-600">UUID Auth: {selectedOwner.id}</p>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[10px] text-slate-500">O servidor confirma o usuário no Supabase Auth. O UUID é apenas informativo e não precisa ser digitado.</p>
                </fieldset>
              )}

              {/* Site URL e Localização */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Site URL (Principal)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: www.odontocamp.com.br"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-655 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Localização / Área de Atuação *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Ex: Brasil (Nacional) ou São Paulo/SP"
                    value={localizacao}
                    onChange={(e) => setLocalizacao(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-655 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* DNA e Tom de Voz */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">DNA e Diretrizes (Tom de Voz / Persona)</label>
                  <label className="flex items-center gap-1 cursor-pointer text-[9px] text-indigo-400 hover:text-indigo-350 font-bold uppercase transition-colors" title="Carregar PRD de arquivo .md, .txt ou .docx">
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload PRD (.md, .txt, .docx)</span>
                    <input 
                      type="file" 
                      accept=".md,.txt,.docx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea 
                  rows={4}
                  placeholder="Cole as diretrizes da marca ou faça o upload de um arquivo de texto (.txt, .md, .docx) acima..."
                  value={dna}
                  onChange={(e) => setDna(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-655 focus:outline-none focus:border-indigo-650 text-xs font-semibold resize-none"
                />
              </div>

              {/* Cadastrar Silos Existentes */}
              <div className="flex flex-col gap-2 border-t border-slate-900 pt-3">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Silos / Categorias Iniciais</label>
                  <button
                    type="button"
                    onClick={handleAddSiloRow}
                    className="flex items-center gap-1 text-[9px] text-indigo-400 hover:text-indigo-350 font-bold uppercase transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Adicionar mais Silos
                  </button>
                </div>
                
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                  {silosInputs.map((silo, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#06070a] p-2 rounded border border-slate-900/60 relative">
                      {/* Inputs */}
                      <input 
                        type="text" 
                        placeholder="Nome do Silo (ex: Blog Implantes)"
                        value={silo.nome}
                        disabled={silo.isExisting}
                        onChange={(e) => handleSiloRowChange(index, "nome", e.target.value)}
                        className="w-full bg-[#0b0c10] border border-slate-850 rounded px-2.5 py-1 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <div className="flex gap-2 items-center">
                        <input 
                          type="text" 
                          placeholder="Slug (ex: blog-implantes)"
                          value={silo.slug}
                          disabled={silo.isExisting}
                          onChange={(e) => handleSiloRowChange(index, "slug", e.target.value)}
                          className="flex-1 bg-[#0b0c10] border border-slate-850 rounded px-2.5 py-1 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        {silosInputs.length > 1 && !silo.isExisting && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSiloRow(index)}
                            className="text-slate-550 hover:text-red-400 font-bold transition-colors p-1"
                            title="Remover linha de silo"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex items-center justify-end gap-2 mt-4 text-xs">
                <button 
                  type="button" 
                  onClick={handleCloseModal} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-2 px-4 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={saving || (!editingBrandId && (!selectedOwner?.id || ownerSearchStatus === "searching" || Boolean(formError)))}
                  className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-2 px-5 rounded transition-all flex items-center gap-1.5"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Salvar Marca</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

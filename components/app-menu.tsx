"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Building2, Key, LogOut, Menu, PenTool, User } from "lucide-react";
import { useBrand } from "./brand-context";

type AppSection = "perfil" | "minerador" | "arquiteto" | "admin";

interface AppMenuProps {
  active?: AppSection;
  countLabel?: string;
}

export function AppMenu({ active, countLabel }: AppMenuProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { brands, selectedBrandId, setSelectedBrandId, userRole } = useBrand();
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 44, right: 12 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeBrandName = brands.find(b => b.id === selectedBrandId)?.nome || "Sem Marca";
  const activeSection =
    active ||
    (pathname?.startsWith("/admin")
      ? "admin"
      : pathname?.startsWith("/arquiteto")
        ? "arquiteto"
        : pathname?.startsWith("/minerador")
          ? "minerador"
          : "perfil");

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    setMenuPosition({
      top: Math.round(rect.bottom + 6),
      right: Math.max(12, Math.round(window.innerWidth - rect.right)),
    });
  };

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleReposition = () => updateMenuPosition();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open]);

  const linkClass = (section: AppSection) =>
    `w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] hover:bg-slate-900 transition-colors cursor-pointer ${
      activeSection === section
        ? "text-indigo-400 font-bold bg-slate-900/30"
        : "text-slate-350"
    }`;

  const iconClass = (section: AppSection) =>
    activeSection === section ? "w-3.5 h-3.5 text-indigo-400" : "w-3.5 h-3.5 text-slate-500";

  return (
    <div className="flex items-center gap-2 shrink-0">
      {countLabel && (
        <span className="text-slate-700 text-[10px] font-semibold tabular-nums shrink-0 mr-1 hidden sm:inline">
          {countLabel}
        </span>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          updateMenuPosition();
          setOpen(value => !value);
        }}
        className="flex items-center justify-center bg-transparent hover:bg-slate-900 border border-slate-800 hover:border-slate-600 rounded p-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        title="Menu Principal"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Menu className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed w-56 bg-[#0e1015] border border-slate-800 rounded shadow-2xl z-[80] overflow-hidden font-mono"
          style={{ top: menuPosition.top, right: menuPosition.right }}
        >
          <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/40">
            <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block">Conta Ativa</span>
            <span className="text-slate-400 text-[10px] truncate block font-sans" title={session?.user?.email || ""}>
              {session?.user?.email}
            </span>
          </div>

          <div className="p-2 border-b border-slate-800">
            <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block mb-1">Cliente / Marca</span>
            {userRole === "admin" ? (
              <select
                value={selectedBrandId}
                onChange={event => {
                  setSelectedBrandId(event.target.value);
                  setOpen(false);
                }}
                className="w-full bg-[#06070a] border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 font-bold focus:outline-none cursor-pointer"
              >
                {brands.length === 0 ? (
                  <option value="" disabled>Sem Marcas</option>
                ) : (
                  brands.map(brand => (
                    <option key={brand.id} value={brand.id} className="bg-[#0b0c10]">{brand.nome}</option>
                  ))
                )}
              </select>
            ) : (
              <span className="text-[11px] text-slate-400 font-bold px-1.5 block">
                {activeBrandName}
              </span>
            )}
          </div>

          <div className="py-1" role="menu">
            <Link href="/perfil" onClick={() => setOpen(false)} className={linkClass("perfil")}>
              <User className={iconClass("perfil")} />
              <span>Perfil da Marca</span>
            </Link>

            <Link href="/minerador" onClick={() => setOpen(false)} className={linkClass("minerador")}>
              <Key className={iconClass("minerador")} />
              <span>Minerador Key</span>
            </Link>

            <Link href="/arquiteto" onClick={() => setOpen(false)} className={linkClass("arquiteto")}>
              <PenTool className={iconClass("arquiteto")} />
              <span>Arquiteto de Conteudo</span>
            </Link>

            {userRole === "admin" && (
              <Link href="/admin/marcas" onClick={() => setOpen(false)} className={linkClass("admin")}>
                <Building2 className={iconClass("admin")} />
                <span>Painel Admin</span>
              </Link>
            )}
          </div>

          <div className="border-t border-slate-800 py-1 bg-slate-950/20">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] text-rose-455 hover:bg-rose-950/15 transition-colors cursor-pointer font-bold"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              <span>Sair da Conta</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

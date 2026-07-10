"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useBrand } from "./brand-context";
import { Key, Building2, User, PenTool, LogOut, Loader2 } from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { brands, selectedBrandId, setSelectedBrandId, userRole, profileLoading } = useBrand();

  const activeBrandName = brands.find(b => b.id === selectedBrandId)?.nome || "Sem Marca";

  const navLinks = [
    { href: "/perfil",    label: "Perfil",     icon: User },
    { href: "/minerador", label: "Minerador",  icon: Key },
    { href: "/arquiteto", label: "Arquiteto",  icon: PenTool },
  ];

  return (
    <nav className="bg-[#0b0c10] border-b border-slate-900 px-3 h-10 flex items-center justify-between sticky top-0 z-50 shrink-0">
      {/* Esquerda: logo + nav links */}
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-1 text-white font-black uppercase tracking-wider text-[11px] hover:text-slate-200 transition-colors">
          <Key className="w-3.5 h-3.5 text-indigo-400" />
          <span>Pro</span>
        </Link>

        <div className="flex items-center gap-0.5">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-2.5 py-1 text-[10px] font-bold rounded uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                  isActive
                    ? "bg-indigo-600/80 text-white"
                    : "text-slate-500 hover:text-slate-200"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Direita: marca + admin + logout */}
      <div className="flex items-center gap-2">
        {profileLoading ? (
          <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
        ) : (
          <>
            {/* Seletor de Marca */}
            {userRole === "admin" ? (
              <div className="flex items-center gap-1 bg-[#06070a] border border-slate-800 rounded px-2 py-0.5">
                <Building2 className="w-3 h-3 text-indigo-400 shrink-0" />
                <select
                  value={selectedBrandId}
                  onChange={e => setSelectedBrandId(e.target.value)}
                  className="bg-transparent text-slate-300 font-bold focus:outline-none cursor-pointer text-[10px] max-w-[110px] truncate"
                >
                  {brands.length === 0 ? (
                    <option value="" disabled className="bg-[#0b0c10]">Sem Marcas</option>
                  ) : (
                    brands.map(brand => (
                      <option key={brand.id} value={brand.id} className="bg-[#0b0c10]">{brand.nome}</option>
                    ))
                  )}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold">
                <Building2 className="w-3 h-3 text-indigo-500/60" />
                <span className="max-w-[80px] truncate">{activeBrandName}</span>
              </div>
            )}

            {/* Painel Admin */}
            {userRole === "admin" && (
              <Link
                href="/admin/marcas"
                className={`text-[10px] font-bold px-2 py-0.5 border rounded transition-all cursor-pointer ${
                  pathname?.startsWith("/admin")
                    ? "bg-slate-900 border-indigo-900 text-indigo-400"
                    : "bg-[#06070a] border-slate-800 text-slate-500 hover:text-slate-200"
                }`}
              >
                Admin
              </Link>
            )}

            {/* Logout */}
            <button
              onClick={() => signOut()}
              className="text-slate-600 hover:text-rose-400 transition-colors cursor-pointer p-1"
              title={`Sair (${session?.user?.email})`}
            >
              <LogOut className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

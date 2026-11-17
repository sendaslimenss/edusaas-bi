import { useState } from "react";
import {
  LayoutDashboard, DollarSign, BookOpen, Clock, ShieldAlert,
  Users, CreditCard, MessageSquare, PlusSquare, LogOut,
  GraduationCap, ChevronLeft, Menu, X, Building2, Sparkles
} from "lucide-react";
import Login from "./pages/Login";
import BiDashboards from "./components/BiDashboards";
import SaasWorkspace from "./components/SaasWorkspace";

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("aceda_user");
    return saved ? JSON.parse(saved) : null;
  });

  const getDefaultTab = (role) => {
    if (role === "director" || role === "admin") return { mode: "bi", key: "general" };
    if (role === "accountant") return { mode: "bi", key: "financial" };
    if (role === "teacher") return { mode: "saas", key: "teacher" };
    return { mode: "saas", key: "students" };
  };

  const [nav, setNav] = useState(() =>
    user ? getDefaultTab(user.role) : { mode: "bi", key: "general" }
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const handleLogin = (loggedUser) => {
    setUser(loggedUser);
    setNav(getDefaultTab(loggedUser.role));
  };

  const handleLogout = () => {
    localStorage.removeItem("aceda_token");
    localStorage.removeItem("aceda_user");
    setUser(null);
  };

  const handleSelectNav = (mode, key) => {
    setNav({ mode, key });
    setMobileOpen(false);
  };

  if (!user) return <Login onLoginSuccess={handleLogin} />;

  const biMenu = [
    { key: "general", label: "Vue Globale & Capacité", icon: LayoutDashboard, roles: ["director", "admin"] },
    { key: "financial", label: "BI Financier & Prévisions", icon: DollarSign, roles: ["director", "admin", "accountant"] },
    { key: "pedagogical", label: "BI Pédagogique", icon: BookOpen, roles: ["director", "admin"] },
    { key: "attendance", label: "BI Absences & Corrélation", icon: Clock, roles: ["director", "admin"] },
    { key: "early-warning", label: "Early Warning System", icon: ShieldAlert, badge: "IA", roles: ["director", "admin"] },
  ].filter((item) => item.roles.includes(user.role));

  const saasMenu = [
    {
      key: "students",
      label: user.role === "student" || user.role === "parent" ? "Mon Bulletin & Suivi" : "Élèves & Bulletins",
      icon: Users,
      roles: ["admin", "director", "teacher", "parent", "student"],
    },
    { key: "teacher", label: "Saisie Notes & Appel", icon: PlusSquare, roles: ["teacher", "admin"] },
    { key: "payments", label: "Gestion Encaissements", icon: CreditCard, roles: ["accountant", "admin"] },
    { key: "messages", label: "Messagerie Parents", icon: MessageSquare, roles: ["admin", "director", "teacher", "accountant", "parent"] },
  ].filter((item) => item.roles.includes(user.role));

  return (
    <div className="relative min-h-screen flex flex-col md:flex-row bg-[radial-gradient(circle_at_10%_10%,#0b356e_0%,#041E42_45%,#020c1b_100%)] overflow-x-hidden">
      {/* Halos lumineux d'arrière-plan (Or & Bleu Marine) */}
      <div className="pointer-events-none fixed -top-24 -left-24 w-96 h-96 rounded-full bg-amber-400/20 blur-[110px]" />
      <div className="pointer-events-none fixed bottom-0 left-32 w-80 h-80 rounded-full bg-sky-400/15 blur-[100px]" />

      {/* Barre supérieure Mobile Glassmorphism */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#041E42]/80 backdrop-blur-xl border-b border-amber-400/25">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/25 transition"
          aria-label="Ouvrir le menu"
        >
          <Menu size={22} />
        </button>

        <div className="flex items-center gap-2.5 bg-white/95 px-3 py-1.5 rounded-xl border border-amber-400 shadow">
          {!logoError ? (
            <img
              src="/aceda-logo.png"
              alt="ACEDA"
              onError={() => setLogoError(true)}
              className="h-7 w-auto object-contain"
            />
          ) : (
            <span className="font-extrabold text-[#041E42] text-sm">ACEDA</span>
          )}
        </div>
      </header>

      {/* Fond flouté Mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-[#020c1b]/65 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* SIDEBAR GLASSMORPHISM AVEC ONGLETS INCURVÉS (OUTSIDE-IN) */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen flex flex-col justify-between py-5
          bg-[#041E42]/65 backdrop-blur-2xl border-r border-white/10 shadow-[12px_0_40px_rgba(2,12,27,0.5)]
          transition-all duration-300 ease-out shrink-0
          ${collapsed ? "md:w-[88px]" : "md:w-[276px]"}
          w-[276px] ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* Haut de la Sidebar : Logo + Établissement + Menus */}
        <div className="flex flex-col flex-1 min-h-0">
          {/* Médaillon Logo ACEDA */}
          <div className="flex items-center justify-between gap-2 px-4 pb-4">
            <div
              className={`flex items-center gap-2.5 bg-white/95 rounded-2xl border-2 border-amber-400 shadow-[0_8px_22px_rgba(255,183,3,0.2)] transition-all duration-300 hover:scale-[1.02] overflow-hidden ${
                collapsed ? "p-1.5 mx-auto" : "px-3 py-2"
              }`}
            >
              {!logoError ? (
                <img
                  src="/aceda-logo.png"
                  alt="ACEDA - Academic Excellence + Data"
                  onError={() => setLogoError(true)}
                  className={`${collapsed ? "h-9" : "h-11"} w-auto object-contain shrink-0`}
                />
              ) : (
                <div className="p-2 bg-amber-400 rounded-xl text-[#041E42]">
                  <GraduationCap size={22} />
                </div>
              )}

              {!collapsed && (
                <div className="leading-tight pr-1">
                  <div className="font-extrabold text-[#041E42] text-sm tracking-tight">ACEDA</div>
                  <div className="text-[10px] font-bold text-amber-700 whitespace-nowrap">
                    Academic Excellence + Data
                  </div>
                </div>
              )}
            </div>

            {/* Bouton réduire/agrandir (Desktop) */}
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              title={collapsed ? "Développer le menu" : "Réduire le menu"}
              className="hidden md:grid place-items-center w-8 h-8 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/30 transition-transform duration-300 shrink-0 cursor-pointer"
            >
              <ChevronLeft
                size={16}
                className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
              />
            </button>

            {/* Bouton fermer (Mobile) */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-300 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Pilule Établissement Actif */}
          <div
            className={`mx-4 mb-5 px-3 py-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2.5 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_#fbbf24] shrink-0 animate-pulse" />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-amber-300/90 font-semibold">
                  Établissement actif
                </div>
                <div className="text-xs font-bold text-white truncate">{user.school_name}</div>
              </div>
            )}
          </div>

          {/* Navigation avec Onglets Incurvés Outside-In */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 aceda-no-scrollbar">
            {biMenu.length > 0 && (
              <div className="mb-5">
                {!collapsed && (
                  <div className="px-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
                    Business Intelligence
                  </div>
                )}
                <nav className="space-y-1.5">
                  {biMenu.map((item) => {
                    const Icon = item.icon;
                    const isActive = nav.mode === "bi" && nav.key === item.key;
                    return (
                      <div
                        key={item.key}
                        className={`relative ml-3 rounded-l-[22px] transition-all duration-300 ${
                          isActive ? "aceda-curved-active bg-[#f1f5f9]" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectNav("bi", item.key)}
                          title={collapsed ? item.label : undefined}
                          className={`w-full flex items-center gap-3.5 px-4 py-3 text-sm rounded-l-[22px] transition-all duration-300 cursor-pointer group ${
                            isActive
                              ? "text-[#041E42] font-bold"
                              : "text-slate-200/80 hover:text-white hover:translate-x-1.5 font-medium"
                          }`}
                        >
                          <Icon
                            size={19}
                            className={`shrink-0 transition-transform duration-300 ${
                              isActive
                                ? "text-amber-500 scale-110"
                                : "text-amber-300/80 group-hover:text-amber-400 group-hover:scale-110 group-hover:-rotate-6"
                            }`}
                          />
                          {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                          {!collapsed && item.badge && (
                            <span
                              className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full ${
                                isActive
                                  ? "bg-[#041E42] text-amber-400"
                                  : "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </nav>
              </div>
            )}

            <div>
              {!collapsed && (
                <div className="px-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
                  Gestion Scolaire (SaaS)
                </div>
              )}
              <nav className="space-y-1.5">
                {saasMenu.map((item) => {
                  const Icon = item.icon;
                  const isActive = nav.mode === "saas" && nav.key === item.key;
                  return (
                    <div
                      key={item.key}
                      className={`relative ml-3 rounded-l-[22px] transition-all duration-300 ${
                        isActive ? "aceda-curved-active bg-[#f1f5f9]" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectNav("saas", item.key)}
                        title={collapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-3.5 px-4 py-3 text-sm rounded-l-[22px] transition-all duration-300 cursor-pointer group ${
                          isActive
                            ? "text-[#041E42] font-bold"
                            : "text-slate-200/80 hover:text-white hover:translate-x-1.5 font-medium"
                        }`}
                      >
                        <Icon
                          size={19}
                          className={`shrink-0 transition-transform duration-300 ${
                            isActive
                              ? "text-amber-500 scale-110"
                              : "text-amber-300/80 group-hover:text-amber-400 group-hover:scale-110 group-hover:-rotate-6"
                          }`}
                        />
                        {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                      </button>
                    </div>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Pied de Sidebar : Carte Profil & Déconnexion */}
        <div className="px-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-[#041E42] font-extrabold text-sm grid place-items-center shrink-0 shadow">
              {(user.full_name || "U")[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-white truncate">{user.full_name}</div>
                <div className="text-[10px] text-amber-300 uppercase font-bold tracking-wider">
                  {user.role}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              title="Déconnexion"
              className="p-2 rounded-xl bg-rose-500/15 border border-rose-400/30 text-rose-300 hover:bg-rose-500/30 hover:scale-105 transition cursor-pointer shrink-0"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ZONE PRINCIPALE FROSTED GLASS (S'EMBOÎTE AVEC L'ONGLET INCURVÉ) */}
      <main className="relative z-10 flex-1 min-w-0 bg-[#f1f5f9]/95 backdrop-blur-2xl md:my-3 md:mr-3 md:rounded-3xl shadow-[0_20px_50px_rgba(2,12,27,0.45)] border border-white/60 p-5 sm:p-8 overflow-y-auto">
        {/* En-tête Glassmorphism */}
        <header className="mb-6 p-5 rounded-2xl bg-white/75 backdrop-blur-xl border border-amber-400/30 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#041E42] text-amber-400 text-[11px] font-bold mb-1.5">
              <Sparkles size={12} />
              <span>{nav.mode === "bi" ? "Module Business Intelligence" : "Plateforme SaaS Scolaire"}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#041E42]">
              {nav.mode === "bi"
                ? "Tableau de Bord & Aide à la Décision"
                : "Espace Opérationnel de Gestion"}
            </h2>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#041E42]/5 border border-[#041E42]/15 text-xs text-[#041E42]">
            <Building2 size={16} className="text-amber-600 shrink-0" />
            <span>
              Établissement : <strong>{user.school_name}</strong> ({user.school_city})
            </span>
          </div>
        </header>

        {/* Contenu dynamique BI ou SaaS */}
        <div className="transition-all duration-300">
          {nav.mode === "bi" ? (
            <BiDashboards activeTab={nav.key} />
          ) : (
            <SaasWorkspace section={nav.key} user={user} />
          )}
        </div>
      </main>
    </div>
  );
}
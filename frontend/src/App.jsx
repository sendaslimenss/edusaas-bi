import { useState } from "react";
import {
  LayoutDashboard, DollarSign, BookOpen, Clock, ShieldAlert,
  Users, CreditCard, MessageSquare, PlusSquare, LogOut,
  ChevronLeft, Menu, X, Building2, Sparkles, MapPin, UserCheck,
  Wallet, MessageCircle, BrainCircuit, Calendar, Layers, UserCog
} from "lucide-react";
import Login from "./pages/Login";
import BiDashboards from "./components/BiDashboards";
import SaasWorkspace from "./components/SaasWorkspace";

function AcedaBrandMark({ size = 40 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative grid place-items-center rounded-2xl bg-gradient-to-br from-[#0e3f80] via-[#041E42] to-[#020c1b] border border-amber-400/60 shadow-[0_8px_22px_rgba(255,183,3,0.28),inset_0_1px_0_rgba(255,255,255,0.25)] shrink-0"
    >
      <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id="acedaMarkGold" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffd166" />
            <stop offset="55%" stopColor="#ffb703" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path
          d="M24 7L10 39H16.4L24 21.2L31.6 39H38L24 7Z"
          fill="#ffffff"
        />
        <path
          d="M13.5 32.5C18.8 29.6 29.2 29.6 34.5 32.5"
          stroke="url(#acedaMarkGold)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <rect x="34.5" y="16" width="3" height="8" rx="1.5" fill="url(#acedaMarkGold)" />
        <rect x="39.5" y="11.5" width="3" height="12.5" rx="1.5" fill="#ffd166" />
      </svg>
    </div>
  );
}

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
    { key: "general", label: "#1 Vue Globale & Capacité", icon: LayoutDashboard, roles: ["director", "admin"] },
    { key: "financial", label: "#2 BI Financier & Prévisions", icon: DollarSign, roles: ["director", "admin", "accountant"] },
    { key: "pedagogical", label: "#3 BI Pédagogique", icon: BookOpen, roles: ["director", "admin"] },
    { key: "attendance", label: "#4 Absences & Corrélation", icon: Clock, roles: ["director", "admin"] },
    { key: "demographics", label: "#5 Démographie & Rétention", icon: MapPin, roles: ["director", "admin"] },
    { key: "teachers", label: "#6 Corps Enseignant & RH", icon: UserCheck, roles: ["director", "admin"] },
    { key: "recovery", label: "#7 Recouvrement & Crédit", icon: Wallet, roles: ["director", "admin", "accountant"] },
    { key: "engagement", label: "#8 Engagement Parents", icon: MessageCircle, roles: ["director", "admin"] },
    { key: "early-warning", label: "#9 Early Warning System", icon: ShieldAlert, badge: "IA", roles: ["director", "admin"] },
    { key: "strategic", label: "#10 Stratégie & Simulateur", icon: BrainCircuit, badge: "ML", roles: ["director", "admin"] },
  ].filter((item) => item.roles.includes(user.role));

  const saasMenu = [
    {
      key: "students",
      label: user.role === "student" || user.role === "parent" ? "Mon Bulletin & Suivi" : "Élèves & Bulletins",
      icon: Users,
      roles: ["admin", "director", "teacher", "parent", "student"],
    },
    { key: "schedules", label: "Emplois du Temps", icon: Calendar, roles: ["admin", "director", "teacher", "parent", "student"] },
    { key: "teacher", label: "Saisie Notes & Appel", icon: PlusSquare, roles: ["teacher", "admin"] },
    { key: "academics", label: "Classes, Matières & RH", icon: Layers, roles: ["admin", "director"] },
    { key: "users", label: "Administration Comptes", icon: UserCog, roles: ["admin", "director"] },
    { key: "payments", label: "Gestion Encaissements", icon: CreditCard, roles: ["accountant", "admin", "director"] },
    { key: "messages", label: "Messagerie Parents", icon: MessageSquare, roles: ["admin", "director", "teacher", "accountant", "parent"] },
  ].filter((item) => item.roles.includes(user.role));

  return (
    <div className="relative min-h-screen flex flex-col md:flex-row bg-[radial-gradient(circle_at_10%_10%,#0b356e_0%,#041E42_45%,#020c1b_100%)] overflow-x-hidden">
      {/* Halos lumineux d'arrière-plan */}
      <div className="pointer-events-none fixed -top-24 -left-24 w-96 h-96 rounded-full bg-amber-400/20 blur-[110px]" />
      <div className="pointer-events-none fixed bottom-0 left-32 w-80 h-80 rounded-full bg-sky-400/15 blur-[100px]" />

      {/* Barre supérieure Mobile Glassmorphism */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-[#041E42]/85 backdrop-blur-xl border-b border-amber-400/25">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 hover:bg-amber-400/25 transition"
          aria-label="Ouvrir le menu"
        >
          <Menu size={22} />
        </button>

        <div className="flex items-center gap-2.5">
          <AcedaBrandMark size={34} />
          <div className="leading-tight">
            <div className="font-extrabold text-white text-sm tracking-wide">ACEDA</div>
            <div className="text-[10px] font-semibold text-amber-300">Excellence + Data</div>
          </div>
        </div>
      </header>

      {/* Fond flouté Mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-[#020c1b]/65 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* SIDEBAR GLASSMORPHISM ÉLARGIE (320px) */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen flex flex-col justify-between py-5
          bg-[#041E42]/70 backdrop-blur-2xl border-r border-white/10 shadow-[14px_0_44px_rgba(2,12,27,0.55)]
          transition-all duration-300 ease-out shrink-0
          ${collapsed ? "md:w-[96px]" : "md:w-[320px]"}
          w-[320px] ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* En-tête Logo Moderne */}
          <div className="flex items-center justify-between gap-2.5 px-4 pb-5">
            <div
              className={`flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/15 backdrop-blur-xl shadow-[0_8px_24px_rgba(2,12,27,0.3)] transition-all duration-300 hover:border-amber-400/45 ${
                collapsed ? "p-2 mx-auto" : "px-3.5 py-2.5 flex-1 min-w-0"
              }`}
            >
              <AcedaBrandMark size={collapsed ? 42 : 44} />

              {!collapsed && (
                <div className="leading-tight min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-white text-base tracking-wider">ACEDA</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[9px] font-extrabold uppercase tracking-wider">
                      BI
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-amber-300/90 truncate mt-0.5">
                    Academic Excellence + Data
                  </div>
                </div>
              )}
            </div>

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
            className={`mx-4 mb-5 px-3.5 py-2.5 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center gap-3 ${
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
                        className={`relative ml-3.5 rounded-l-[22px] transition-all duration-300 ${
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
                              : "text-slate-200/85 hover:text-white hover:translate-x-1.5 font-medium"
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
                      className={`relative ml-3.5 rounded-l-[22px] transition-all duration-300 ${
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
                            : "text-slate-200/85 hover:text-white hover:translate-x-1.5 font-medium"
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

        {/* Pied de Sidebar */}
        <div className="px-4 pt-3 border-t border-white/10">
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.06] border border-white/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-[#041E42] font-extrabold text-sm grid place-items-center shrink-0 shadow">
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

      {/* ZONE PRINCIPALE FROSTED GLASS */}
      <main className="relative z-10 flex-1 min-w-0 bg-[#f1f5f9]/92 backdrop-blur-2xl md:my-3 md:mr-3 md:rounded-3xl shadow-[0_20px_50px_rgba(2,12,27,0.45)] border border-white/70 p-5 sm:p-8 overflow-y-auto">
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
import { useState } from "react";
import {
  LayoutDashboard, DollarSign, BookOpen, Clock, ShieldAlert,
  Users, CreditCard, MessageSquare, PlusSquare, LogOut, GraduationCap
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

  const [nav, setNav] = useState(() => (user ? getDefaultTab(user.role) : { mode: "bi", key: "general" }));

  const handleLogin = (loggedUser) => {
    setUser(loggedUser);
    setNav(getDefaultTab(loggedUser.role));
  };

  const handleLogout = () => {
    localStorage.removeItem("aceda_token");
    localStorage.removeItem("aceda_user");
    setUser(null);
  };

  if (!user) return <Login onLoginSuccess={handleLogin} />;

  const biMenu = [
    { key: "general", label: "Vue Globale & Capacité", icon: <LayoutDashboard size={18} />, roles: ["director", "admin"] },
    { key: "financial", label: "BI Financier & Prévisions", icon: <DollarSign size={18} />, roles: ["director", "admin", "accountant"] },
    { key: "pedagogical", label: "BI Pédagogique", icon: <BookOpen size={18} />, roles: ["director", "admin"] },
    { key: "attendance", label: "BI Absences & Corrélation", icon: <Clock size={18} />, roles: ["director", "admin"] },
    { key: "early-warning", label: "Early Warning System", icon: <ShieldAlert size={18} />, roles: ["director", "admin"] },
  ].filter((item) => item.roles.includes(user.role));

  const saasMenu = [
    { key: "students", label: user.role === "student" || user.role === "parent" ? "Mon Bulletin & Suivi" : "Élèves & Bulletins", icon: <Users size={18} />, roles: ["admin", "director", "teacher", "parent", "student"] },
    { key: "teacher", label: "Saisie Notes & Appel", icon: <PlusSquare size={18} />, roles: ["teacher", "admin"] },
    { key: "payments", label: "Gestion Encaissements", icon: <CreditCard size={18} />, roles: ["accountant", "admin"] },
    { key: "messages", label: "Messagerie Parents", icon: <MessageSquare size={18} />, roles: ["admin", "director", "teacher", "accountant", "parent"] },
  ].filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col justify-between p-4 shrink-0">
        <div>
          <div className="flex items-center gap-3 px-2 py-3 border-b border-slate-800">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <GraduationCap size={22} />
            </div>
            <div>
              <div className="font-bold text-white tracking-wide">ACEDA SaaS</div>
              <div className="text-[11px] text-indigo-300 truncate max-w-[150px]">{user.school_name}</div>
            </div>
          </div>

          {biMenu.length > 0 && (
            <div className="mt-6">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Business Intelligence
              </div>
              <nav className="space-y-1">
                {biMenu.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setNav({ mode: "bi", key: item.key })}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                      nav.mode === "bi" && nav.key === item.key
                        ? "bg-indigo-600 text-white font-medium"
                        : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          )}

          <div className="mt-6">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Gestion Scolaire (SaaS)
            </div>
            <nav className="space-y-1">
              {saasMenu.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setNav({ mode: "saas", key: item.key })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                    nav.mode === "saas" && nav.key === item.key
                      ? "bg-indigo-600 text-white font-medium"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <div className="px-2 mb-3">
            <div className="text-sm font-semibold text-white">{user.full_name}</div>
            <div className="text-xs text-indigo-400 uppercase font-bold">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-lg transition"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {nav.mode === "bi" ? "Module Business Intelligence & Aide à la Décision" : "Espace Opérationnel Scolaire"}
            </h2>
            <p className="text-sm text-slate-500">
              Établissement actif : <strong>{user.school_name}</strong> ({user.school_city})
            </p>
          </div>
        </header>

        {nav.mode === "bi" ? <BiDashboards activeTab={nav.key} /> : <SaasWorkspace section={nav.key} user={user} />}
      </main>
    </div>
  );
}
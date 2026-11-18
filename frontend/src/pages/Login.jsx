import { useState } from "react";
import { GraduationCap, Lock, Mail, Building2, Sparkles, CheckCircle2 } from "lucide-react";
import api from "../api";

const DEMO_ACCOUNTS = [
  // Campus Tunis (6 profils)
  { role: "Directeur (BI & Stratégie)", email: "directeur@tunis.aceda.tn", school: "Tunis" },
  { role: "Administrateur École", email: "admin@tunis.aceda.tn", school: "Tunis" },
  { role: "Enseignant", email: "prof@tunis.aceda.tn", school: "Tunis" },
  { role: "Comptable", email: "comptable@tunis.aceda.tn", school: "Tunis" },
  { role: "Parent (Multi-enfants)", email: "parent@tunis.aceda.tn", school: "Tunis" },
  { role: "Élève", email: "eleve@tunis.aceda.tn", school: "Tunis" },
  // Campus Nabeul (6 profils)
  { role: "Directeur (BI & Stratégie)", email: "directeur@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Administrateur École", email: "admin@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Enseignant", email: "prof@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Comptable", email: "comptable@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Parent (Multi-enfants)", email: "parent@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Élève", email: "eleve@nabeul.aceda.tn", school: "Nabeul" },
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("directeur@tunis.aceda.tn");
  const [password, setPassword] = useState("Aceda2026!");
  const [campusFilter, setCampusFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const filteredAccounts = DEMO_ACCOUNTS.filter(
    (acc) => campusFilter === "ALL" || acc.school === campusFilter
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("aceda_token", data.access_token);
      localStorage.setItem("aceda_user", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_15%_15%,#0b356e_0%,#041E42_48%,#020c1b_100%)] p-4 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-amber-400/20 blur-[110px] animate-pulse" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 w-[440px] h-[440px] rounded-full bg-[#0f3f7d]/50 blur-[120px]" />

      <div className="relative z-10 max-w-4xl w-full grid md:grid-cols-2 rounded-3xl bg-[#041E42]/55 backdrop-blur-2xl border border-amber-400/25 shadow-[0_24px_60px_rgba(2,12,27,0.75)] overflow-hidden">
        {/* Colonne Gauche : Authentification */}
        <div className="p-8 sm:p-10 flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-7">
            {!logoError ? (
              <div className="bg-white/95 px-3.5 py-2.5 rounded-2xl border-2 border-amber-400 shadow-[0_8px_24px_rgba(255,183,3,0.22)] transition-transform duration-300 hover:scale-105">
                <img
                  src="/aceda-logo.png"
                  alt="ACEDA - Academic Excellence + Data"
                  onError={() => setLogoError(true)}
                  className="h-14 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="p-3.5 bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl text-[#020c1b] shadow-lg">
                <GraduationCap size={30} />
              </div>
            )}

            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">
                ACEDA <span className="text-amber-400">Cloud</span>
              </h1>
              <p className="text-xs font-medium text-amber-300/90 flex items-center gap-1 mt-0.5">
                <Sparkles size={12} /> Academic Excellence + Data
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-400/40 text-rose-200 text-sm backdrop-blur-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Email professionnel
              </label>
              <div className="relative group">
                <Mail
                  className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                  size={18}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[#020c1b]/55 border border-white/15 text-white placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Mot de passe
              </label>
              <div className="relative group">
                <Lock
                  className="absolute left-3.5 top-3 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                  size={18}
                />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-[#020c1b]/55 border border-white/15 text-white placeholder-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25 outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#020c1b] font-bold text-sm tracking-wide shadow-[0_10px_25px_rgba(245,158,11,0.35)] hover:shadow-[0_14px_30px_rgba(255,183,3,0.5)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Connexion en cours..." : "Accéder à la plateforme"}
            </button>
          </form>
        </div>

        {/* Colonne Droite : 12 Comptes de démonstration RBAC */}
        <div className="bg-[#020c1b]/45 backdrop-blur-xl p-8 border-t md:border-t-0 md:border-l border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Building2 size={18} />
                <span>12 Comptes de Test (RBAC)</span>
              </div>
            </div>
            <p className="text-xs text-slate-300/80 mb-3">
              Cliquez sur un profil (Mot de passe : <strong className="text-amber-300">Aceda2026!</strong>) :
            </p>

            {/* Filtre par campus */}
            <div className="flex gap-1.5 mb-3">
              {[
                { id: "ALL", label: "Tous (12)" },
                { id: "Tunis", label: "Campus Tunis (6)" },
                { id: "Nabeul", label: "Campus Nabeul (6)" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCampusFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    campusFilter === tab.id
                      ? "bg-amber-400 text-[#041E42]"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {filteredAccounts.map((acc) => {
                const isSelected = email === acc.email;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword("Aceda2026!");
                    }}
                    className={`flex items-center justify-between p-2.5 text-left rounded-xl border transition-all duration-200 text-xs cursor-pointer ${
                      isSelected
                        ? "bg-amber-400/15 border-amber-400/60 translate-x-1 shadow-[0_4px_15px_rgba(255,183,3,0.15)]"
                        : "bg-white/5 hover:bg-white/10 border-white/10 hover:border-amber-400/35 hover:translate-x-1"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isSelected && <CheckCircle2 size={15} className="text-amber-400 shrink-0" />}
                      <div className="truncate">
                        <div className="font-semibold text-white">{acc.role}</div>
                        <div className="text-slate-400 truncate">{acc.email}</div>
                      </div>
                    </div>
                    <span className="ml-2 shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                      {acc.school}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-slate-400/80 mt-4 pt-3 border-t border-white/10">
            Architecture Multi-Tenant isolée par <code className="text-amber-300">school_id</code> sur PostgreSQL Neon.
          </p>
        </div>
      </div>
    </div>
  );
}
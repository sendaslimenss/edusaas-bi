import { useState } from "react";
import { GraduationCap, Lock, Mail, Building2 } from "lucide-react";
import api from "../api";

const DEMO_ACCOUNTS = [
  { role: "Directeur (BI)", email: "directeur@tunis.aceda.tn", school: "Tunis" },
  { role: "Admin École", email: "admin@tunis.aceda.tn", school: "Tunis" },
  { role: "Enseignant", email: "prof@tunis.aceda.tn", school: "Tunis" },
  { role: "Comptable", email: "comptable@tunis.aceda.tn", school: "Tunis" },
  { role: "Parent", email: "parent@tunis.aceda.tn", school: "Tunis" },
  { role: "Élève", email: "eleve@tunis.aceda.tn", school: "Tunis" },
  { role: "Directeur Nabeul", email: "directeur@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Comptable Nabeul", email: "comptable@nabeul.aceda.tn", school: "Nabeul" },
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState("directeur@tunis.aceda.tn");
  const [password, setPassword] = useState("Aceda2026!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <div className="max-w-4xl w-full grid md:grid-cols-2 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Formulaire */}
        <div className="p-8 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-indigo-600 rounded-xl text-white">
              <GraduationCap size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">ACEDA Cloud</h1>
              <p className="text-xs text-slate-500">SaaS Scolaire & Business Intelligence</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email professionnel</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Connexion..." : "Accéder à la plateforme"}
            </button>
          </form>
        </div>

        {/* Comptes de démonstration */}
        <div className="bg-slate-50 p-8 border-l border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-700 font-semibold mb-2">
              <Building2 size={18} />
              <span>Comptes de démonstration (Multi-Écoles)</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Cliquez sur un profil pour pré-remplir les identifiants (Mot de passe : <strong>Aceda2026!</strong>) :
            </p>
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    setPassword("Aceda2026!");
                  }}
                  className="flex items-center justify-between p-2.5 text-left bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg transition text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{acc.role}</div>
                    <div className="text-slate-500">{acc.email}</div>
                  </div>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">
                    {acc.school}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-4">
            Isolation stricte des données par établissement (Multi-Tenant Cloud).
          </p>
        </div>
      </div>
    </div>
  );
}
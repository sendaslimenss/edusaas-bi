import { useState, useMemo } from "react";
import {
  Lock, Mail, Building2, Sparkles, CheckCircle2, ShieldCheck,
  ArrowRight, Eye, EyeOff, BarChart3, Layers, KeyRound, ArrowLeft, Check, Circle
} from "lucide-react";
import api from "../api";

const DEMO_ACCOUNTS = [
  { role: "Directeur (BI & Stratégie)", email: "directeur@tunis.aceda.tn", school: "Tunis" },
  { role: "Administrateur École", email: "admin@tunis.aceda.tn", school: "Tunis" },
  { role: "Enseignant", email: "prof@tunis.aceda.tn", school: "Tunis" },
  { role: "Comptable", email: "comptable@tunis.aceda.tn", school: "Tunis" },
  { role: "Parent (Multi-enfants)", email: "parent@tunis.aceda.tn", school: "Tunis" },
  { role: "Élève", email: "eleve@tunis.aceda.tn", school: "Tunis" },
  { role: "Directeur (BI & Stratégie)", email: "directeur@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Administrateur École", email: "admin@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Enseignant", email: "prof@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Comptable", email: "comptable@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Parent (Multi-enfants)", email: "parent@nabeul.aceda.tn", school: "Nabeul" },
  { role: "Élève", email: "eleve@nabeul.aceda.tn", school: "Nabeul" },
];

export default function Login({ onLoginSuccess, activationToken = "", onCancelActivation }) {
  const isActivationMode = Boolean(activationToken);

  // États Connexion standard
  const [email, setEmail] = useState("directeur@tunis.aceda.tn");
  const [password, setPassword] = useState("Aceda2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [campusFilter, setCampusFilter] = useState("ALL");

  // États Activation de compte (?activate_token=...)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // États communs
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredAccounts = DEMO_ACCOUNTS.filter(
    (acc) => campusFilter === "ALL" || acc.school === campusFilter
  );

  // Règles alignées avec _validate_strong_password() dans onboarding.py
  const passwordChecks = useMemo(() => {
    return [
      { id: "len", label: "Au moins 10 caractères", ok: newPassword.length >= 10 },
      { id: "upper", label: "Une lettre majuscule (A-Z)", ok: /[A-Z]/.test(newPassword) },
      { id: "lower", label: "Une lettre minuscule (a-z)", ok: /[a-z]/.test(newPassword) },
      { id: "digit", label: "Un chiffre (0-9)", ok: /[0-9]/.test(newPassword) },
      { id: "symbol", label: "Un caractère spécial (!@#$%...)", ok: /[^A-Za-z0-9]/.test(newPassword) },
    ];
  }, [newPassword]);

  const isStrongPassword = passwordChecks.every((rule) => rule.ok);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("aceda_token", data.access_token);
      localStorage.setItem("aceda_user", JSON.stringify(data.user));
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Identifiants invalides ou serveur indisponible.");
    } finally {
      setLoading(false);
    }
  };

  const handleActivateSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!isStrongPassword) {
      setError("Veuillez respecter tous les critères de sécurité du mot de passe.");
      return;
    }
    if (!passwordsMatch) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/activate-account", {
        token: activationToken,
        new_password: newPassword,
      });
      localStorage.setItem("aceda_token", data.access_token);
      localStorage.setItem("aceda_user", JSON.stringify(data.user));
      setSuccessMsg(`Compte activé pour ${data.user.school_name || "votre établissement"}. Redirection...`);
      setTimeout(() => {
        onLoginSuccess(data.user);
      }, 700);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Lien d'activation invalide, expiré ou déjà utilisé."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#020c1b] p-4 sm:p-8 overflow-hidden selection:bg-amber-400 selection:text-[#041E42]">
      {/* Dégradé profond & grille architecturale subtile */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at 14% 18%, rgba(14, 63, 128, 0.55) 0%, transparent 45%),
            radial-gradient(circle at 86% 82%, rgba(245, 158, 11, 0.16) 0%, transparent 48%),
            linear-gradient(rgba(255, 255, 255, 0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.028) 1px, transparent 1px)
          `,
          backgroundSize: "100% 100%, 100% 100%, 44px 44px, 44px 44px",
        }}
      />

      {/* Halos lumineux ambiants */}
      <div className="pointer-events-none absolute -top-28 -left-24 w-[440px] h-[440px] rounded-full bg-amber-400/15 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[500px] h-[500px] rounded-full bg-sky-500/15 blur-[140px]" />

      {/* Conteneur principal Vitre Haute Couture */}
      <div className="relative z-10 max-w-5xl w-full grid lg:grid-cols-12 rounded-[32px] bg-gradient-to-br from-[#06234b]/80 via-[#041E42]/75 to-[#020c1b]/88 backdrop-blur-3xl border border-white/15 shadow-[0_32px_90px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.18)] overflow-hidden">
        {/* Liseré doré supérieur */}
        <div className="lg:col-span-12 h-[2px] w-full bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />

        {/* COLONNE GAUCHE (7 cols) : Identité & Formulaire (Activation ou Connexion) */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col justify-between">
          <div>
            {/* En-tête de marque moderne */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#0e3f80] via-[#041E42] to-[#020c1b] border border-amber-400/65 shadow-[0_12px_30px_rgba(255,183,3,0.25),inset_0_1px_0_rgba(255,255,255,0.28)] grid place-items-center shrink-0">
                <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
                  <path d="M24 7L10 39H16.4L24 21.2L31.6 39H38L24 7Z" fill="#ffffff" />
                  <path
                    d="M13.5 32.5C18.8 29.6 29.2 29.6 34.5 32.5"
                    stroke="#ffb703"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                  <rect x="34.5" y="16" width="3" height="8" rx="1.5" fill="#ffb703" />
                  <rect x="39.5" y="11.5" width="3" height="12.5" rx="1.5" fill="#ffd166" />
                </svg>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    ACEDA{" "}
                    <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent">
                      Enterprise
                    </span>
                  </h1>
                </div>
                <p className="text-xs font-semibold tracking-widest uppercase text-amber-300/85 flex items-center gap-1.5 mt-1">
                  <Sparkles size={12} className="text-amber-400" />
                  Academic Excellence &amp; Decision Intelligence
                </p>
              </div>
            </div>

            {isActivationMode ? (
              <>
                <div className="mb-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[11px] font-bold uppercase tracking-wider mb-3">
                    <KeyRound size={13} />
                    <span>Activation de votre espace établissement</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Définissez votre mot de passe personnel
                  </h2>
                  <p className="text-sm text-slate-300/80 mt-1.5 leading-relaxed">
                    Ce lien sécurisé à usage unique active définitivement votre compte administrateur et ouvre immédiatement votre portail dédié.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs font-medium backdrop-blur-md">
                    {error}
                  </div>
                )}

                {successMsg && (
                  <div className="mb-5 p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 text-xs font-semibold backdrop-blur-md flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <form onSubmit={handleActivateSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-amber-300/90 mb-2">
                      Nouveau mot de passe
                    </label>
                    <div className="relative group">
                      <Lock
                        className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                        size={18}
                      />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Ex. MonEcole2026!"
                        className="w-full pl-12 pr-12 py-3 rounded-2xl bg-[#020c1b]/65 border border-white/15 text-white text-sm placeholder-slate-500 focus:border-amber-400 focus:bg-[#020c1b]/85 focus:ring-4 focus:ring-amber-400/15 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-3.5 top-3 p-1 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                        aria-label="Afficher ou masquer le nouveau mot de passe"
                      >
                        {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-amber-300/90 mb-2">
                      Confirmer le mot de passe
                    </label>
                    <div className="relative group">
                      <Lock
                        className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                        size={18}
                      />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Répétez le mot de passe"
                        className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#020c1b]/65 border border-white/15 text-white text-sm placeholder-slate-500 focus:border-amber-400 focus:bg-[#020c1b]/85 focus:ring-4 focus:ring-amber-400/15 outline-none transition-all"
                      />
                    </div>
                    {confirmPassword.length > 0 && !passwordsMatch && (
                      <p className="text-[11px] text-rose-300 mt-1.5">
                        Les mots de passe ne sont pas identiques.
                      </p>
                    )}
                  </div>

                  {/* Checklist de complexité temps réel */}
                  <div className="p-3.5 rounded-2xl bg-[#020c1b]/55 border border-white/10 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Exigences de sécurité :
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {passwordChecks.map((rule) => (
                        <div
                          key={rule.id}
                          className={`flex items-center gap-2 text-xs ${
                            rule.ok ? "text-emerald-300" : "text-slate-400"
                          }`}
                        >
                          {rule.ok ? (
                            <Check size={14} className="text-emerald-400 shrink-0" />
                          ) : (
                            <Circle size={12} className="text-slate-500 shrink-0" />
                          )}
                          <span>{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !isStrongPassword || !passwordsMatch}
                    className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-[#020c1b] font-extrabold text-sm tracking-wide shadow-[0_14px_34px_rgba(245,158,11,0.38)] hover:shadow-[0_18px_40px_rgba(255,183,3,0.52)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>
                      {loading
                        ? "Activation du compte en cours..."
                        : "Activer mon compte & Accéder au portail"}
                    </span>
                    {!loading && <ArrowRight size={17} />}
                  </button>

                  {onCancelActivation && (
                    <button
                      type="button"
                      onClick={onCancelActivation}
                      className="w-full py-2 text-xs font-semibold text-slate-300 hover:text-amber-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                      <span>Retour à la connexion standard</span>
                    </button>
                  )}
                </form>
              </>
            ) : (
              <>
                <div className="mb-7">
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Bienvenue sur votre portail exécutif
                  </h2>
                  <p className="text-sm text-slate-300/80 mt-1.5 leading-relaxed">
                    Pilotez vos campus, vos indicateurs financiers et la réussite académique dans un espace unifié et sécurisé.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-400/40 text-rose-200 text-xs font-medium backdrop-blur-md">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-amber-300/90 mb-2">
                      Identifiant Professionnel
                    </label>
                    <div className="relative group">
                      <Mail
                        className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                        size={18}
                      />
                      <input
                        type="text"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email ou nom d'utilisateur"
                        className="w-full pl-12 pr-4 py-3 rounded-2xl bg-[#020c1b]/65 border border-white/15 text-white text-sm placeholder-slate-500 focus:border-amber-400 focus:bg-[#020c1b]/85 focus:ring-4 focus:ring-amber-400/15 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-amber-300/90">
                        Mot de passe
                      </label>
                      <span className="text-[11px] text-slate-400">Chiffrement TLS &amp; JWT</span>
                    </div>
                    <div className="relative group">
                      <Lock
                        className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-amber-400 transition-colors"
                        size={18}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-3 rounded-2xl bg-[#020c1b]/65 border border-white/15 text-white text-sm placeholder-slate-500 focus:border-amber-400 focus:bg-[#020c1b]/85 focus:ring-4 focus:ring-amber-400/15 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3.5 top-3 p-1 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                        aria-label="Afficher ou masquer le mot de passe"
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-[#020c1b] font-extrabold text-sm tracking-wide shadow-[0_14px_34px_rgba(245,158,11,0.38)] hover:shadow-[0_18px_40px_rgba(255,183,3,0.52)] transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{loading ? "Authentification sécurisée..." : "Accéder à l'espace ACEDA"}</span>
                    {!loading && <ArrowRight size={17} />}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Bandeau de garanties en bas à gauche */}
          <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-3 gap-3 text-[11px] text-slate-300/80">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-amber-400 shrink-0" />
              <span>Isolation Multi-Tenant</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-amber-400 shrink-0" />
              <span>10 Dashboards BI &amp; IA</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-amber-400 shrink-0" />
              <span>Contrôle d'accès RBAC</span>
            </div>
          </div>
        </div>

        {/* COLONNE DROITE (5 cols) : Sélecteur Rapide de Profils RBAC */}
        <div className="lg:col-span-5 bg-[#020c1b]/55 backdrop-blur-2xl p-7 sm:p-9 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Building2 size={16} />
                <span>Accès Rapide Démo (RBAC)</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-slate-200">
                12 Profils
              </span>
            </div>

            <p className="text-xs text-slate-300/75 mb-4">
              Sélectionnez un rôle pour pré-remplir la session (<code className="text-amber-300 font-semibold">Aceda2026!</code>) :
            </p>

            {/* Onglets Campus vitrés */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/[0.05] border border-white/10 mb-4">
              {[
                { id: "ALL", label: "Tous (12)" },
                { id: "Tunis", label: "Tunis (6)" },
                { id: "Nabeul", label: "Nabeul (6)" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCampusFilter(tab.id)}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    campusFilter === tab.id
                      ? "bg-gradient-to-r from-amber-400 to-amber-500 text-[#041E42] shadow"
                      : "text-slate-300 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Liste vitrée des comptes */}
            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {filteredAccounts.map((acc) => {
                const isSelected = !isActivationMode && email === acc.email;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      if (isActivationMode && onCancelActivation) onCancelActivation();
                      setEmail(acc.email);
                      setPassword("Aceda2026!");
                    }}
                    className={`w-full flex items-center justify-between p-3 text-left rounded-2xl border backdrop-blur-md transition-all duration-200 text-xs cursor-pointer ${
                      isSelected
                        ? "bg-gradient-to-r from-amber-400/20 to-amber-500/10 border-amber-400/70 shadow-[0_6px_20px_rgba(255,183,3,0.18)]"
                        : "bg-white/[0.04] hover:bg-white/[0.09] border-white/10 hover:border-amber-400/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 ${
                          isSelected
                            ? "bg-amber-400 text-[#041E42]"
                            : "bg-white/10 text-slate-300"
                        }`}
                      >
                        <CheckCircle2 size={14} />
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-white">{acc.role}</div>
                        <div className="text-slate-400 text-[11px] truncate">{acc.email}</div>
                      </div>
                    </div>
                    <span
                      className={`ml-2 shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide ${
                        acc.school === "Tunis"
                          ? "bg-sky-400/15 text-sky-200 border border-sky-400/30"
                          : "bg-amber-400/20 text-amber-300 border border-amber-400/35"
                      }`}
                    >
                      {acc.school}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span>Architecture Multi-Campus</span>
            <code className="text-amber-300/90 font-semibold">school_id • PostgreSQL</code>
          </div>
        </div>
      </div>
    </div>
  );
}
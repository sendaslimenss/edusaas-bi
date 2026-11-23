import React, { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  ArrowLeft,
  PlusCircle,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "https://edusaas-bi.onrender.com").replace(/\/$/, "");

const INITIAL_REGISTRATION_FORM = {
  school_name: "",
  school_email: "",
  school_phone: "",
  country: "Tunisie",
  city: "",
  address: "",
  admin_full_name: "",
  admin_email: "",
  admin_phone: "",
  requested_username: "",
};

const PASSWORD_RULES = [
  { id: "length", label: "Au moins 10 caractères", test: (pwd) => pwd.length >= 10 },
  { id: "uppercase", label: "Au moins une majuscule (A-Z)", test: (pwd) => /[A-Z]/.test(pwd) },
  { id: "lowercase", label: "Au moins une minuscule (a-z)", test: (pwd) => /[a-z]/.test(pwd) },
  { id: "digit", label: "Au moins un chiffre (0-9)", test: (pwd) => /[0-9]/.test(pwd) },
  { id: "special", label: "Au moins un caractère spécial (!@#$%...)", test: (pwd) => /[^A-Za-z0-9\s]/.test(pwd) },
];

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{4,40}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((err) => `${err.loc?.slice(-1)[0] || "Champ"} : ${err.msg}`)
      .join(" | ");
  }
  return data.message || fallback;
}

export default function Login({
  onLoginSuccess,
  activationToken: propActivationToken = "",
  onCancelActivation,
  forcePasswordChangeUser: propForceUser = null,
  onLogoutForceChange,
}) {
  const [mode, setMode] = useState(() => {
    if (propActivationToken) return "activate";
    if (propForceUser) return "force_password_change";
    return "login";
  });

  const [activateToken, setActivateToken] = useState(propActivationToken || "");
  const [forceUser, setForceUser] = useState(propForceUser);
  const [pendingTempToken, setPendingTempToken] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Mode 1 : Connexion
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Mode 2 : Création d'établissement
  const [regForm, setRegForm] = useState(INITIAL_REGISTRATION_FORM);
  const [registrationResult, setRegistrationResult] = useState(null);

  // Mode 3 : Activation & Changement mot de passe initial
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    if (propActivationToken) {
      setActivateToken(propActivationToken);
      setMode("activate");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("activate_token");
    if (urlToken && urlToken.trim()) {
      setActivateToken(urlToken.trim());
      setMode("activate");
    }
  }, [propActivationToken]);

  useEffect(() => {
    if (propForceUser) {
      setForceUser(propForceUser);
      setMode("force_password_change");
    }
  }, [propForceUser]);

  const passwordValidation = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, valid: rule.test(newPassword) })),
    [newPassword]
  );
  const isNewPasswordValid = useMemo(
    () => passwordValidation.every((r) => r.valid),
    [passwordValidation]
  );

  const switchMode = (nextMode) => {
    setError("");
    setSuccessMessage("");
    setRegistrationResult(null);
    setMode(nextMode);
  };

  const finalizeSession = (token, userObj) => {
    if (token) localStorage.setItem("aceda_token", token);
    if (userObj) localStorage.setItem("aceda_user", JSON.stringify(userObj));
    if (typeof onLoginSuccess === "function") {
      onLoginSuccess(userObj);
    }
  };

  // ---------------------------------------------------------------------------
  // 1. CONNEXION (Super Admin + 6 Profils Établissements)
  // ---------------------------------------------------------------------------
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Identifiants invalides ou compte désactivé."));
      }

      const mustChange = Boolean(data.must_change_password || data.user?.must_change_password);
      if (mustChange) {
        setPendingTempToken(data.access_token || "");
        setForceUser(data.user || { username: identifier.trim() });
        setCurrentPassword(password);
        setNewPassword("");
        setConfirmPassword("");
        setMode("force_password_change");
        return;
      }

      finalizeSession(data.access_token, data.user);
    } catch (err) {
      setError(err.message || "Erreur réseau lors de la connexion.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. DEMANDE DE CRÉATION D'ÉTABLISSEMENT (Statut PENDING)
  // ---------------------------------------------------------------------------
  const handleRegChange = (field) => (e) => {
    setRegForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const validateRegistrationForm = () => {
    if (regForm.school_name.trim().length < 3) return "Le nom de l'établissement doit contenir au moins 3 caractères.";
    if (!EMAIL_REGEX.test(regForm.school_email.trim())) return "L'email professionnel de l'établissement est invalide.";
    if (regForm.school_phone.trim().length < 7) return "Le téléphone de l'établissement est invalide.";
    if (regForm.country.trim().length < 2 || regForm.city.trim().length < 2) return "Pays et ville requis.";
    if (regForm.address.trim().length < 5) return "L'adresse complète doit contenir au moins 5 caractères.";
    if (regForm.admin_full_name.trim().length < 3) return "Le nom complet du responsable est requis.";
    if (!EMAIL_REGEX.test(regForm.admin_email.trim())) return "L'email du responsable est invalide.";
    if (regForm.admin_phone.trim().length < 7) return "Le téléphone du responsable est invalide.";
    if (!USERNAME_REGEX.test(regForm.requested_username.trim())) {
      return "Le nom d'utilisateur doit contenir 4 à 40 caractères (lettres, chiffres, ., _, -).";
    }
    return null;
  };

  const handleRegisterSchoolSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccessMessage("");

    const validationError = validateRegistrationForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        school_name: regForm.school_name.trim(),
        school_email: regForm.school_email.trim().toLowerCase(),
        school_phone: regForm.school_phone.trim(),
        country: regForm.country.trim(),
        city: regForm.city.trim(),
        address: regForm.address.trim(),
        admin_full_name: regForm.admin_full_name.trim(),
        admin_email: regForm.admin_email.trim().toLowerCase(),
        admin_phone: regForm.admin_phone.trim(),
        requested_username: regForm.requested_username.trim().toLowerCase(),
      };

      const response = await fetch(`${API_BASE}/api/public/school-registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Impossible d'enregistrer la demande."));
      }

      setRegistrationResult({
        ...data,
        school_name: payload.school_name,
        admin_email: payload.admin_email,
        requested_username: payload.requested_username,
      });
      setRegForm(INITIAL_REGISTRATION_FORM);
    } catch (err) {
      setError(err.message || "Erreur réseau lors de l'envoi de la demande.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3A. ACTIVATION PAR TOKEN UNIQUE 24H (?activate_token=...)
  // ---------------------------------------------------------------------------
  const handleActivateWithTokenSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");

    if (!isNewPasswordValid) {
      setError("Votre nouveau mot de passe doit respecter les 5 critères de sécurité.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/activate-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: activateToken,
          new_password: newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Lien d'activation invalide, expiré ou déjà utilisé."));
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      finalizeSession(data.access_token, data.user);
    } catch (err) {
      setError(err.message || "Échec de l'activation du compte.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3B. CHANGEMENT OBLIGATOIRE DU MOT DE PASSE TEMPORAIRE
  // ---------------------------------------------------------------------------
  const handleForcePasswordChangeSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");

    if (!currentPassword) {
      setError("Veuillez saisir le mot de passe temporaire reçu par email.");
      return;
    }
    if (!isNewPasswordValid) {
      setError("Votre nouveau mot de passe doit respecter les 5 critères de sécurité.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmation du mot de passe ne correspond pas.");
      return;
    }

    setLoading(true);
    try {
      const bearer = pendingTempToken || localStorage.getItem("aceda_token");
      const response = await fetch(`${API_BASE}/api/auth/change-initial-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Échec de la mise à jour du mot de passe."));
      }

      if (bearer && forceUser) {
        const updatedUser = { ...forceUser, must_change_password: false };
        finalizeSession(bearer, updatedUser);
        return;
      }

      setForceUser(null);
      setPendingTempToken("");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
      setSuccessMessage("Mot de passe modifié avec succès. Connectez-vous avec votre nouveau mot de passe.");
    } catch (err) {
      setError(err.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelFlow = () => {
    setError("");
    setSuccessMessage("");
    if (mode === "activate") {
      window.history.replaceState({}, document.title, window.location.pathname);
      setActivateToken("");
      if (typeof onCancelActivation === "function") onCancelActivation();
    }
    if (mode === "force_password_change" && typeof onLogoutForceChange === "function") {
      onLogoutForceChange();
    }
    setForceUser(null);
    setPendingTempToken("");
    setMode("login");
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(circle_at_15%_15%,#0b356e_0%,#041E42_48%,#020c1b_100%)] text-white overflow-x-hidden">
      {/* Halos Bleu Nuit & Or */}
      <div className="pointer-events-none fixed -top-24 -left-24 w-96 h-96 rounded-full bg-amber-400/20 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-0 right-10 w-96 h-96 rounded-full bg-sky-400/15 blur-[120px]" />

      <div className={`relative z-10 mx-auto w-full transition-all duration-300 ${mode === "register_school" ? "max-w-3xl" : "max-w-md"}`}>
        {/* En-tête identitaire ACEDA Enterprise */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-white/10 border border-amber-400/30 shadow-[0_0_30px_rgba(251,191,36,0.2)] mb-4">
            <img src="/gemini-svg.svg" alt="ACEDA Enterprise" className="w-12 h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-2xl font-extrabold tracking-tight">
            <span className="text-white">ACEDA</span>
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">
              Enterprise
            </span>
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-300/90">
            <Sparkles size={12} className="text-amber-400" />
            <span>Academic Excellence &amp; Decision Intelligence</span>
          </div>
        </div>

        {/* Carte Glassmorphism */}
        <div className="rounded-3xl bg-[#082D5E]/80 backdrop-blur-2xl border border-white/15 shadow-[0_25px_60px_rgba(2,12,27,0.65)] p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-extrabold text-white">
              {mode === "login" && "Connexion à la plateforme SaaS & BI"}
              {mode === "register_school" && "Créer un espace établissement"}
              {mode === "activate" && "Activation de votre compte Administrateur"}
              {mode === "force_password_change" && "Sécurisation obligatoire du compte"}
            </h1>
            <p className="mt-1 text-xs text-slate-300">
              {mode === "login" && "Accédez à votre établissement ou au portail Super Administrateur."}
              {mode === "register_school" && "Demandez la création d'un espace Multi-Tenant isolé pour votre établissement."}
              {mode === "activate" && "Définissez votre mot de passe personnel pour activer votre espace scolaire."}
              {mode === "force_password_change" &&
                `Première connexion (${forceUser?.email || forceUser?.username || "Administrateur"}) : remplacez le mot de passe temporaire.`}
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl bg-rose-500/15 border border-rose-400/40 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 px-4 py-3 text-xs text-emerald-200">
              {successMessage}
            </div>
          )}

          {/* ================================================================= */}
          {/* MODE 1 : CONNEXION                                                */}
          {/* ================================================================= */}
          {mode === "login" && (
            <>
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-amber-200 mb-1.5">
                    Email ou nom d&apos;utilisateur
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="ex. directeur@tunis.aceda.tn"
                      className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-200 mb-1.5">
                    Mot de passe
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-10 pr-11 py-2.5 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-extrabold text-[#041E42] shadow-[0_10px_25px_rgba(251,191,36,0.3)] hover:from-amber-300 hover:to-amber-400 disabled:opacity-60 transition cursor-pointer"
                >
                  {loading ? "Authentification en cours..." : "Se connecter"}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-center text-xs text-slate-300 mb-3">
                  Vous dirigez un établissement scolaire et souhaitez rejoindre ACEDA ?
                </p>
                <button
                  type="button"
                  onClick={() => switchMode("register_school")}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-amber-400/20 border border-amber-400/40 px-4 py-3 text-sm font-bold text-amber-300 transition cursor-pointer"
                >
                  <PlusCircle size={18} />
                  <span>Créer un établissement</span>
                </button>
              </div>
            </>
          )}

          {/* ================================================================= */}
          {/* MODE 2 : FORMULAIRE CRÉATION ÉTABLISSEMENT                        */}
          {/* ================================================================= */}
          {mode === "register_school" && (
            <>
              {registrationResult ? (
                <div className="py-4 text-center space-y-4">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center">
                    <CheckCircle2 size={30} />
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-xs font-bold">
                    Statut de la demande : {registrationResult.status || "PENDING"}
                  </div>
                  <h2 className="text-lg font-extrabold text-white">
                    Demande enregistrée pour « {registrationResult.school_name} »
                  </h2>
                  <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                    Votre dossier (#{registrationResult.request_id}) a été transmis au Super Administrateur.
                    Dès approbation, un email contenant votre identifiant Tenant unique, votre mot de passe temporaire
                    et votre lien d&apos;activation sera envoyé à <strong className="text-amber-300">{registrationResult.admin_email}</strong>.
                  </p>
                  {registrationResult.email_warning && (
                    <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-xl p-3">
                      Note : votre demande est bien sauvegardée en base, mais la notification email a signalé : {registrationResult.email_warning}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-extrabold text-[#041E42] hover:from-amber-300 hover:to-amber-400 transition cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Retour à la page de connexion</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegisterSchoolSubmit} className="space-y-6">
                  {/* Section 1 : Établissement */}
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300 mb-3">
                      <Building2 size={15} />
                      <span>1. Informations de l&apos;établissement</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-200 mb-1">Nom de l&apos;établissement *</label>
                        <input
                          type="text"
                          required
                          value={regForm.school_name}
                          onChange={handleRegChange("school_name")}
                          placeholder="ex. Lycée International Carthage"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Email professionnel *</label>
                        <div className="relative">
                          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            required
                            value={regForm.school_email}
                            onChange={handleRegChange("school_email")}
                            placeholder="contact@etablissement.tn"
                            className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Téléphone *</label>
                        <div className="relative">
                          <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="tel"
                            required
                            value={regForm.school_phone}
                            onChange={handleRegChange("school_phone")}
                            placeholder="+216 71 000 000"
                            className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Pays *</label>
                        <input
                          type="text"
                          required
                          value={regForm.country}
                          onChange={handleRegChange("country")}
                          placeholder="Tunisie"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Ville *</label>
                        <div className="relative">
                          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            required
                            value={regForm.city}
                            onChange={handleRegChange("city")}
                            placeholder="Tunis, Sousse, Sfax..."
                            className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-9 pr-3 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-200 mb-1">Adresse complète *</label>
                        <input
                          type="text"
                          required
                          value={regForm.address}
                          onChange={handleRegChange("address")}
                          placeholder="15 Avenue Habib Bourguiba"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 2 : Responsable / Futur Administrateur */}
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300 mb-3">
                      <ShieldCheck size={15} />
                      <span>2. Informations du responsable (Administrateur du Tenant)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Nom complet *</label>
                        <input
                          type="text"
                          required
                          value={regForm.admin_full_name}
                          onChange={handleRegChange("admin_full_name")}
                          placeholder="ex. Dr. Amine Trabelsi"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Nom d&apos;utilisateur souhaité *</label>
                        <input
                          type="text"
                          required
                          value={regForm.requested_username}
                          onChange={handleRegChange("requested_username")}
                          placeholder="ex. admin.carthage"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Email du responsable *</label>
                        <input
                          type="email"
                          required
                          value={regForm.admin_email}
                          onChange={handleRegChange("admin_email")}
                          placeholder="amine.trabelsi@etablissement.tn"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-200 mb-1">Téléphone du responsable *</label>
                        <input
                          type="tel"
                          required
                          value={regForm.admin_phone}
                          onChange={handleRegChange("admin_phone")}
                          placeholder="+216 98 000 000"
                          className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                      <span>Retour à la connexion</span>
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-extrabold text-[#041E42] shadow-lg hover:from-amber-300 hover:to-amber-400 disabled:opacity-60 transition cursor-pointer"
                    >
                      {loading ? "Enregistrement en cours..." : "Soumettre la demande d'inscription"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ================================================================= */}
          {/* MODE 3 : ACTIVATION 24H OU CHANGEMENT MOT DE PASSE INITIAL        */}
          {/* ================================================================= */}
          {(mode === "activate" || mode === "force_password_change") && (
            <form
              onSubmit={mode === "activate" ? handleActivateWithTokenSubmit : handleForcePasswordChangeSubmit}
              className="space-y-4"
            >
              {mode === "force_password_change" && (
                <div>
                  <label className="block text-xs font-semibold text-amber-200 mb-1.5">
                    Mot de passe temporaire actuel *
                  </label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Mot de passe temporaire reçu par email"
                      className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1.5">
                  Nouveau mot de passe personnel *
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 10 caractères sécurisés"
                    className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 pl-10 pr-11 py-2.5 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-[#041E42]/70 border border-white/10 p-3">
                <p className="text-[11px] font-bold text-amber-300 mb-1.5">Politique de sécurité ACEDA :</p>
                <ul className="space-y-1">
                  {passwordValidation.map((rule) => (
                    <li
                      key={rule.id}
                      className={`flex items-center gap-2 text-xs ${rule.valid ? "text-emerald-300 font-semibold" : "text-slate-400"}`}
                    >
                      <span>{rule.valid ? "✓" : "○"}</span>
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-200 mb-1.5">
                  Confirmer le nouveau mot de passe *
                </label>
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le nouveau mot de passe"
                  className="w-full rounded-xl bg-[#041E42]/80 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder-slate-400 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !isNewPasswordValid}
                className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-extrabold text-[#041E42] hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 transition cursor-pointer"
              >
                {loading
                  ? "Validation en cours..."
                  : mode === "activate"
                  ? "Activer mon espace établissement"
                  : "Enregistrer et accéder à la plateforme"}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleCancelFlow}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Annuler et revenir à la connexion
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
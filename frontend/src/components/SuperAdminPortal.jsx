import { useEffect, useState } from "react";
import {
  Building2, CheckCircle, AlertCircle, Clock, Users, Layers,
  Search, Send, FileText, X, MapPin
} from "lucide-react";
import api from "../api";

export default function SuperAdminPortal({ section, highlightRequestUuid }) {
  const [stats, setStats] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [schools, setSchools] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const [feedback, setFeedback] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, regsRes, schoolsRes, logsRes] = await Promise.all([
        api.get("/api/super-admin/stats"),
        api.get("/api/super-admin/registrations"),
        api.get("/api/super-admin/schools"),
        api.get("/api/super-admin/email-logs"),
      ]);
      setStats(statsRes.data);
      setRegistrations(regsRes.data || []);
      setSchools(schoolsRes.data || []);
      setEmailLogs(logsRes.data || []);
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || "Impossible de charger les données Super Admin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFeedback("");
    setErrorMsg("");
    loadAllData();
  }, [section]);

  const handleApprove = async (reg) => {
    setFeedback("");
    setErrorMsg("");
    setActionId(reg.id);
    try {
      const res = await api.post(`/api/super-admin/registrations/${reg.id}/approve`);
      const data = res.data;
      const emailNote = data.email_sent
        ? `Email d'activation envoyé à ${reg.admin_email}.`
        : `Établissement créé, mais alerte email : ${data.email_warning || "vérifiez Resend"}.`;
      setFeedback(`${data.message} (Tenant UUID : ${data.tenant_uuid}) — ${emailNote}`);
      await loadAllData();
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || "Erreur lors de l'approbation de l'établissement.");
    } finally {
      setActionId(null);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 5) {
      setErrorMsg("Veuillez saisir un motif de rejet d'au moins 5 caractères.");
      return;
    }
    setFeedback("");
    setErrorMsg("");
    setActionId(rejectTarget.id);
    try {
      const res = await api.post(`/api/super-admin/registrations/${rejectTarget.id}/reject`, {
        reason: rejectReason.trim(),
      });
      setFeedback(res.data?.message || "Demande rejetée.");
      setRejectTarget(null);
      setRejectReason("");
      await loadAllData();
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || "Erreur lors du rejet de la demande.");
    } finally {
      setActionId(null);
    }
  };

const handleResendEmail = async (reg) => {
    setFeedback("");
    setErrorMsg("");
    setActionId(reg.id);
    try {
      const res = await api.post(`/api/super-admin/registrations/${reg.id}/resend-welcome-email`);
      setFeedback(res.data?.message || `Email d'activation renvoyé à ${reg.admin_email}.`);
      await loadAllData();
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || "Erreur lors du renvoi de l'email d'activation.");
    } finally {
      setActionId(null);
    }
  };

  const filteredRegistrations = registrations.filter((r) => {
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      (r.school_name || "").toLowerCase().includes(q) ||
      (r.city || "").toLowerCase().includes(q) ||
      (r.admin_full_name || "").toLowerCase().includes(q) ||
      (r.admin_email || "").toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const filteredSchools = schools.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    return (
      !q ||
      (s.name || "").toLowerCase().includes(q) ||
      (s.city || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.tenant_uuid || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-medium flex items-start gap-2.5">
          <CheckCircle size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-sm font-medium flex items-start gap-2.5">
          <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-500">
              <span>Établissements Actifs</span>
              <Building2 size={16} className="text-[#041E42]" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-[#041E42]">{stats.total_schools}</div>
            <div className="mt-1 text-xs text-slate-500">Tenants isolés en production</div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-amber-300 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-amber-700">
              <span>Demandes en Attente</span>
              <Clock size={16} className="text-amber-500" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-amber-600">{stats.pending_requests}</div>
            <div className="mt-1 text-xs text-slate-500">Sur {stats.total_requests} demande(s) reçue(s)</div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-500">
              <span>Écoles Approuvées</span>
              <CheckCircle size={16} className="text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-emerald-700">{stats.approved_requests}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.rejected_requests} demande(s) rejetée(s)</div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-500">
              <span>Emails Resend</span>
              <Send size={16} className="text-sky-600" />
            </div>
            <div className="mt-2 text-2xl font-extrabold text-[#041E42]">{stats.emails_sent}</div>
            <div className="mt-1 text-xs text-slate-500">{stats.emails_failed} échec(s) d'envoi</div>
          </div>
        </div>
      )}

      {section === "super_admin_registrations" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#041E42]">
                  Demandes d'Ouverture d'Établissements
                </h3>
                <p className="text-xs text-slate-500">
                  Validez les demandes pour provisionner un tenant isolé et envoyer les accès administrateur via Resend.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {["ALL", "PENDING", "APPROVED", "REJECTED"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      statusFilter === st
                        ? "bg-[#041E42] text-amber-400"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {st === "ALL" ? "Toutes" : st === "PENDING" ? "En attente" : st === "APPROVED" ? "Approuvées" : "Rejetées"}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par établissement, ville, administrateur ou email..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#041E42]"
              />
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-slate-500">Chargement des demandes...</div>
            ) : filteredRegistrations.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                Aucune demande d'inscription trouvée pour ce filtre.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                      <th className="p-3">Établissement</th>
                      <th className="p-3">Administrateur</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRegistrations.map((reg) => {
                      const isHighlighted = highlightRequestUuid && reg.request_uuid === highlightRequestUuid;
                      return (
                        <tr
                          key={reg.id}
                          className={isHighlighted ? "bg-amber-50/90" : "hover:bg-slate-50/80"}
                        >
                          <td className="p-3">
                            <div className="font-bold text-sm text-[#041E42] flex items-center gap-1.5">
                              <span>{reg.school_name}</span>
                              {isHighlighted && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-400 text-[#041E42] text-[10px] font-extrabold">
                                  À examiner
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin size={12} /> {reg.city}, {reg.country} • {reg.school_email}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{reg.admin_full_name}</div>
                            <div className="text-slate-500">{reg.admin_email} ({reg.requested_username})</div>
                          </td>
                          <td className="p-3">
                            {reg.status === "PENDING" && (
                              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
                                EN ATTENTE
                              </span>
                            )}
                            {reg.status === "APPROVED" && (
                              <div>
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                                  APPROUVÉE
                                </span>
                                {reg.tenant_uuid && (
                                  <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                    UUID: {reg.tenant_uuid.slice(0, 8)}...
                                  </div>
                                )}
                              </div>
                            )}
                            {reg.status === "REJECTED" && (
                              <div>
                                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold">
                                  REJETÉE
                                </span>
                                {reg.rejection_reason && (
                                  <div className="text-[11px] text-rose-600 mt-1 max-w-xs">
                                    {reg.rejection_reason}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {reg.status === "PENDING" ? (
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={actionId === reg.id}
                                  onClick={() => handleApprove(reg)}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer disabled:opacity-50"
                                >
                                  {actionId === reg.id ? "Traitement..." : "Approuver"}
                                </button>
                                <button
                                  type="button"
                                  disabled={actionId === reg.id}
                                  onClick={() => {
                                    setRejectTarget(reg);
                                    setRejectReason("");
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold transition cursor-pointer disabled:opacity-50"
                                >
                                  Rejeter
                                </button>
                              </div>
                          ) : reg.status === "APPROVED" ? (
                              <button
                                type="button"
                                disabled={actionId === reg.id}
                                onClick={() => handleResendEmail(reg)}
                                title="Générer un nouveau lien d'activation 24h et renvoyer l'email"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold transition cursor-pointer disabled:opacity-50"
                              >
                                <Send size={13} />
                                <span>{actionId === reg.id ? "Envoi..." : "Renvoyer"}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">Traitée</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-[#041E42]" />
              <h4 className="text-base font-extrabold text-[#041E42]">
                Journal des Envois Emails (Resend)
              </h4>
            </div>
            {emailLogs.length === 0 ? (
              <p className="text-xs text-slate-500">Aucun log d'envoi enregistré pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                      <th className="p-2.5">Destinataire</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Statut</th>
                      <th className="p-2.5">ID Resend / Détail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {emailLogs.slice(0, 15).map((log) => (
                      <tr key={log.id}>
                        <td className="p-2.5 font-medium text-slate-800">{log.recipient_email}</td>
                        <td className="p-2.5 text-slate-500">{log.email_type}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold ${
                              log.status === "SENT"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-[11px] text-slate-500">
                          {log.provider_message_id || log.error_message || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {section === "super_admin_tenants" && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div>
            <h3 className="text-lg font-extrabold text-[#041E42] flex items-center gap-2">
              <Layers size={20} className="text-amber-500" />
              <span>Établissements Provisionnés (Multi-Tenant)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Chaque établissement dispose d'une isolation stricte par school_id et tenant_uuid.
            </p>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrer les établissements par nom, ville ou UUID..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#041E42]"
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Chargement des établissements...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase">
                    <th className="p-3">ID / Établissement</th>
                    <th className="p-3">Tenant UUID</th>
                    <th className="p-3">Localisation</th>
                    <th className="p-3">Effectifs</th>
                    <th className="p-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSchools.map((sc) => (
                    <tr key={sc.id} className="hover:bg-slate-50/80">
                      <td className="p-3">
                        <div className="font-bold text-sm text-[#041E42]">
                          #{sc.id} — {sc.name}
                        </div>
                        <div className="text-slate-500">{sc.email || "Email non renseigné"}</div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-600">{sc.tenant_uuid}</td>
                      <td className="p-3 text-slate-700">
                        {sc.city}, {sc.country}
                      </td>
                      <td className="p-3">
                        <div className="inline-flex items-center gap-3 font-bold text-slate-700">
                          <span className="inline-flex items-center gap-1">
                            <Users size={13} className="text-amber-600" /> {sc.students_count} élèves
                          </span>
                          <span>• {sc.classes_count} classes</span>
                          <span>• {sc.users_count} comptes</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase">
                          {sc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm grid place-items-center p-4">
          <form
            onSubmit={handleRejectSubmit}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-base font-extrabold text-[#041E42]">
                Rejeter : {rejectTarget.school_name}
              </h4>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Indiquez le motif du rejet (minimum 5 caractères) :
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex. Informations d'identification de l'établissement incomplètes..."
              className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#041E42]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={actionId === rejectTarget.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Confirmer le rejet
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState } from "react";
import {
  CheckCircle, Send, FileText, PlusCircle, Search, Award,
  Clock, CreditCard, UserCheck
} from "lucide-react";
import api from "../api";

export default function SaasWorkspace({ section, user }) {
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [referentials, setReferentials] = useState({ classes: [], subjects: [] });
  const [selectedBulletin, setSelectedBulletin] = useState(null);
  const [bulletinYear, setBulletinYear] = useState("2025-2026");
  const [payments, setPayments] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [messages, setMessages] = useState([]);
  const [feedback, setFeedback] = useState("");

  const [gradeForm, setGradeForm] = useState({ student_id: "", subject_id: "", trimester: 1, score: 14 });
  const [attForm, setAttForm] = useState({ student_id: "", type: "absence", hours_missed: 2, justified: false });
  const [msgForm, setMsgForm] = useState({ receiver_parent_id: "", subject: "", content: "" });

  useEffect(() => {
    setFeedback("");
    setSearchQuery("");
    if (section === "students" || section === "teacher") {
      api.get("/api/saas/students").then((r) => {
        setStudents(r.data);
        if (r.data.length > 0) {
          setGradeForm((f) => ({ ...f, student_id: r.data[0].id }));
          setAttForm((f) => ({ ...f, student_id: r.data[0].id }));
          if (user.role === "student" || user.role === "parent") {
            loadBulletin(r.data[0]);
          }
        }
      });
      api.get("/api/saas/referentials").then((r) => {
        setReferentials(r.data);
        if (r.data.subjects.length > 0) {
          setGradeForm((f) => ({ ...f, subject_id: r.data.subjects[0].id }));
        }
      });
    } else if (section === "payments") {
      loadPayments();
    } else if (section === "messages") {
      loadMessages();
      api.get("/api/saas/students").then((r) => {
        setStudents(r.data);
        const withParent = r.data.find((s) => s.parent_id);
        if (withParent) setMsgForm((m) => ({ ...m, receiver_parent_id: withParent.parent_id }));
      });
    }
  }, [section, user.role]);

  const loadBulletin = async (st) => {
    const { data } = await api.get(`/api/saas/students/${st.id}/bulletin`);
    setSelectedBulletin({ student: st, ...data });
    setBulletinYear("2025-2026");
  };

  const loadPayments = async () => {
    const { data } = await api.get("/api/saas/payments");
    setPayments(data);
  };

  const loadMessages = async () => {
    const { data } = await api.get("/api/saas/messages");
    setMessages(data);
  };

  const handleAddGrade = async (e) => {
    e.preventDefault();
    await api.post("/api/saas/grades", {
      ...gradeForm,
      student_id: Number(gradeForm.student_id),
      subject_id: Number(gradeForm.subject_id),
      trimester: Number(gradeForm.trimester),
      score: Number(gradeForm.score),
    });
    setFeedback("Note enregistrée au bulletin avec succès !");
  };

  const handleAddAttendance = async (e) => {
    e.preventDefault();
    await api.post("/api/saas/attendance", {
      ...attForm,
      student_id: Number(attForm.student_id),
      hours_missed: Number(attForm.hours_missed),
    });
    setFeedback("Absence / retard enregistré dans le dossier de l'élève !");
  };

  const handleSettlePayment = async (id) => {
    await api.patch(`/api/saas/payments/${id}/settle`);
    setFeedback("Tranche de scolarité soldée avec succès !");
    loadPayments();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    await api.post("/api/saas/messages", {
      ...msgForm,
      receiver_parent_id: Number(msgForm.receiver_parent_id),
    });
    setMsgForm({ ...msgForm, subject: "", content: "" });
    setFeedback("Notification envoyée au parent !");
    loadMessages();
  };

  const handleReadMessage = async (id) => {
    await api.patch(`/api/saas/messages/${id}/read`);
    loadMessages();
  };

  const filteredStudents = students.filter(
    (st) =>
      st.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (st.class_name || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculs dynamiques sur le bulletin sélectionné
  const yearGrades = selectedBulletin
    ? selectedBulletin.grades.filter((g) => (g.school_year || "2025-2026") === bulletinYear)
    : [];

  const weightedAvg =
    yearGrades.length > 0
      ? (
          yearGrades.reduce((acc, g) => acc + g.score * g.coefficient, 0) /
          yearGrades.reduce((acc, g) => acc + g.coefficient, 0)
        ).toFixed(2)
      : null;

  const getMention = (avg) => {
    const val = Number(avg);
    if (val >= 16) return { label: "Très Bien", style: "bg-emerald-100 text-emerald-800" };
    if (val >= 14) return { label: "Bien", style: "bg-sky-100 text-sky-800" };
    if (val >= 12) return { label: "Assez Bien", style: "bg-amber-100 text-amber-800" };
    if (val >= 10) return { label: "Passable", style: "bg-slate-200 text-slate-800" };
    return { label: "Insuffisant", style: "bg-rose-100 text-rose-800" };
  };

  // Liste dédoublonnée des parents pour la messagerie
  const uniqueParents = Array.from(
    new Map(
      students
        .filter((s) => s.parent_id)
        .map((s) => [s.parent_id, { parent_id: s.parent_id, parent_name: s.parent_name, student_name: s.student_name }])
    ).values()
  );

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-sm">
          <CheckCircle size={18} className="text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 1 : ÉLÈVES & BULLETINS (TOUS PROFILS SELON RBAC)               */}
      {/* ====================================================================== */}
      {section === "students" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-3">
              {user.role === "student" || user.role === "parent"
                ? `Dossier(s) Scolaire(s) (${students.length})`
                : `Répertoire Élèves (${filteredStudents.length})`}
            </h3>

            {students.length > 3 && (
              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher un élève ou une classe..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-amber-400 outline-none"
                />
              </div>
            )}

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredStudents.map((st) => {
                const isSelected = selectedBulletin?.student?.id === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => loadBulletin(st)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-[#041E42] text-white border-amber-400 shadow"
                        : "bg-white border-slate-200 hover:border-amber-400 hover:bg-amber-50/40 text-slate-900"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm">{st.student_name}</div>
                      <div className={`text-xs ${isSelected ? "text-amber-300" : "text-slate-500"}`}>
                        {st.class_name} • {st.city}
                      </div>
                    </div>
                    <FileText size={16} className={isSelected ? "text-amber-400" : "text-[#041E42]"} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            {!selectedBulletin ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 text-sm">
                <FileText size={36} className="text-amber-500 mb-2" />
                <p>Sélectionnez un élève à gauche pour consulter son bulletin pondéré, son assiduité et ses paiements.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-[#041E42]">{selectedBulletin.student.student_name}</h3>
                    <p className="text-xs text-slate-500">
                      Classe : <strong>{selectedBulletin.student.class_name}</strong> • Parent :{" "}
                      <strong>{selectedBulletin.student.parent_name}</strong>
                    </p>
                  </div>

                  {/* Sélecteur d'année scolaire + Moyenne pondérée */}
                  <div className="flex items-center gap-3">
                    <div className="flex rounded-xl bg-slate-100 p-1">
                      {["2025-2026", "2024-2025"].map((yr) => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => setBulletinYear(yr)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            bulletinYear === yr ? "bg-[#041E42] text-amber-400" : "text-slate-600"
                          }`}
                        >
                          {yr}
                        </button>
                      ))}
                    </div>

                    {weightedAvg && (
                      <div className="px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400/50 text-right">
                        <div className="text-[10px] font-bold uppercase text-[#041E42]">Moyenne Pondérée</div>
                        <div className="text-sm font-extrabold text-[#041E42] flex items-center gap-1.5">
                          <Award size={14} className="text-amber-600" />
                          <span>{weightedAvg}/20</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${getMention(weightedAvg).style}`}>
                            {getMention(weightedAvg).label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-[#041E42] mb-2">
                    Relevé de Notes ({bulletinYear}) — {yearGrades.length} évaluations
                  </h4>
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#041E42] text-amber-300 sticky top-0">
                        <tr>
                          <th className="p-2.5">Trimestre</th>
                          <th className="p-2.5">Matière</th>
                          <th className="p-2.5">Coeff</th>
                          <th className="p-2.5">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {yearGrades.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-400">
                              Aucune note enregistrée pour l'année {bulletinYear}.
                            </td>
                          </tr>
                        ) : (
                          yearGrades.map((g) => (
                            <tr key={g.id} className="hover:bg-amber-50/40">
                              <td className="p-2.5 font-semibold">Trimestre {g.trimester}</td>
                              <td className="p-2.5 font-medium text-[#041E42]">{g.subject_name}</td>
                              <td className="p-2.5">{g.coefficient}</td>
                              <td className={`p-2.5 font-extrabold ${g.score < 10 ? "text-rose-600" : "text-emerald-700"}`}>
                                {g.score}/20
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-[#041E42] mb-2 flex items-center gap-1.5">
                      <Clock size={15} className="text-amber-600" /> Assiduité ({selectedBulletin.attendance.length})
                    </h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs pr-1">
                      {selectedBulletin.attendance.length === 0 ? (
                        <p className="text-slate-400 p-2">Aucune absence enregistrée.</p>
                      ) : (
                        selectedBulletin.attendance.map((a) => (
                          <div key={a.id} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl flex justify-between">
                            <span>
                              {a.date} • <strong>{a.type === "late" ? "Retard" : "Absence"}</strong> ({a.hours_missed}h)
                            </span>
                            <span className={`font-bold ${a.justified ? "text-emerald-600" : "text-rose-600"}`}>
                              {a.justified ? "Justifiée" : "Non justifiée"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-[#041E42] mb-2 flex items-center gap-1.5">
                      <CreditCard size={15} className="text-amber-600" /> Situation Financière
                    </h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs pr-1">
                      {selectedBulletin.payments.map((p) => (
                        <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl flex justify-between items-center">
                          <span className="truncate pr-2">{p.title}</span>
                          <span
                            className={`font-bold shrink-0 ${
                              p.status === "paid" ? "text-emerald-700" : "text-rose-600"
                            }`}
                          >
                            {p.amount_paid}/{p.amount_due} TND
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 2 : ENSEIGNANT – SAISIE DES NOTES & APPEL                      */}
      {/* ====================================================================== */}
      {section === "teacher" && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={handleAddGrade} className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="font-bold text-[#041E42] flex items-center gap-2">
              <PlusCircle size={18} className="text-amber-500" /> Saisir une Note d'Évaluation
            </h3>
            <div>
              <label className="block text-xs font-bold text-[#041E42] mb-1">Élève</label>
              <select
                value={gradeForm.student_id}
                onChange={(e) => setGradeForm({ ...gradeForm, student_id: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.student_name} ({s.class_name})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Matière</label>
                <select
                  value={gradeForm.subject_id}
                  onChange={(e) => setGradeForm({ ...gradeForm, subject_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
                >
                  {referentials.subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name} (Coeff {sub.coefficient})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Trimestre</label>
                <select
                  value={gradeForm.trimester}
                  onChange={(e) => setGradeForm({ ...gradeForm, trimester: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
                >
                  <option value={1}>Trimestre 1</option>
                  <option value={2}>Trimestre 2</option>
                  <option value={3}>Trimestre 3</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#041E42] mb-1">Note (/20)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="20"
                required
                value={gradeForm.score}
                onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
              />
            </div>
            <button className="w-full py-2.5 bg-[#041E42] text-amber-400 rounded-xl text-sm font-bold hover:bg-[#082d5e] transition cursor-pointer shadow">
              Enregistrer la note au bulletin
            </button>
          </form>

          <form onSubmit={handleAddAttendance} className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="font-bold text-[#041E42] flex items-center gap-2">
              <UserCheck size={18} className="text-rose-600" /> Signaler une Absence ou un Retard
            </h3>
            <div>
              <label className="block text-xs font-bold text-[#041E42] mb-1">Élève</label>
              <select
                value={attForm.student_id}
                onChange={(e) => setAttForm({ ...attForm, student_id: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.student_name} ({s.class_name})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Type d'incident</label>
                <select
                  value={attForm.type}
                  onChange={(e) => setAttForm({ ...attForm, type: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
                >
                  <option value="absence">Absence</option>
                  <option value="late">Retard</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Heures manquées</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={attForm.hours_missed}
                  onChange={(e) => setAttForm({ ...attForm, hours_missed: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#041E42] font-medium pt-1">
              <input
                type="checkbox"
                checked={attForm.justified}
                onChange={(e) => setAttForm({ ...attForm, justified: e.target.checked })}
                className="accent-[#041E42]"
              />
              Absence justifiée (certificat / mot parental)
            </label>
            <button className="w-full py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-[#041E42] rounded-xl text-sm font-extrabold hover:from-amber-300 hover:to-amber-400 transition cursor-pointer shadow">
              Enregistrer l'événement d'assiduité
            </button>
          </form>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 3 : COMPTABLE – SUIVI & ENCAISSEMENTS                          */}
      {/* ====================================================================== */}
      {section === "payments" && (
        <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-[#041E42]">Suivi & Encaissement des Frais Scolaires</h3>
            <div className="flex gap-1.5">
              {[
                { id: "ALL", label: "Toutes" },
                { id: "overdue", label: "Impayées" },
                { id: "partial", label: "Partielles" },
                { id: "paid", label: "Soldées" },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setPaymentFilter(st.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    paymentFilter === st.id
                      ? "bg-[#041E42] text-amber-400"
                      : "bg-slate-100 text-slate-700 hover:bg-amber-100"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="bg-[#041E42] text-amber-300 text-xs uppercase">
              <tr>
                <th className="p-3 rounded-tl-xl">Élève & Parent</th>
                <th className="p-3">Tranche</th>
                <th className="p-3">Échéance</th>
                <th className="p-3">Payé / Dû</th>
                <th className="p-3">Statut</th>
                <th className="p-3 rounded-tr-xl">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {payments
                .filter((p) => paymentFilter === "ALL" || p.status === paymentFilter)
                .map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/40">
                    <td className="p-3 font-semibold text-[#041E42]">
                      {p.student_name}
                      <div className="text-xs text-slate-400 font-normal">Parent : {p.parent_name}</div>
                    </td>
                    <td className="p-3">{p.title}</td>
                    <td className="p-3 text-xs text-slate-500">{p.due_date}</td>
                    <td className="p-3 font-bold">
                      {p.amount_paid} / {p.amount_due} TND
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          p.status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : p.status === "partial"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {p.status === "paid" ? "Soldé" : p.status === "partial" ? "Partiel" : "Impayé"}
                      </span>
                    </td>
                    <td className="p-3">
                      {p.status !== "paid" && (user.role === "accountant" || user.role === "admin") && (
                        <button
                          type="button"
                          onClick={() => handleSettlePayment(p.id)}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition cursor-pointer"
                        >
                          Solder
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 4 : MESSAGERIE & NOTIFICATIONS PARENTS                         */}
      {/* ====================================================================== */}
      {section === "messages" && (
        <div className="grid md:grid-cols-3 gap-6">
          {user.role !== "parent" && (
            <form onSubmit={handleSendMessage} className="bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
              <h3 className="font-bold text-[#041E42] flex items-center gap-2">
                <Send size={16} className="text-amber-500" /> Envoyer une Notification
              </h3>
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Parent destinataire</label>
                <select
                  value={msgForm.receiver_parent_id}
                  onChange={(e) => setMsgForm({ ...msgForm, receiver_parent_id: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
                >
                  {uniqueParents.map((p) => (
                    <option key={p.parent_id} value={p.parent_id}>
                      {p.parent_name} (Famille {p.student_name})
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                required
                placeholder="Objet du message"
                value={msgForm.subject}
                onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
              />
              <textarea
                required
                rows={4}
                placeholder="Contenu de la notification..."
                value={msgForm.content}
                onChange={(e) => setMsgForm({ ...msgForm, content: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:border-amber-400 outline-none"
              />
              <button className="w-full py-2.5 bg-[#041E42] text-amber-400 rounded-xl text-sm font-bold hover:bg-[#082d5e] transition cursor-pointer">
                Envoyer la notification
              </button>
            </form>
          )}

          <div
            className={`${
              user.role === "parent" ? "md:col-span-3" : "md:col-span-2"
            } bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3`}
          >
            <h3 className="font-bold text-[#041E42]">Historique des Notifications Parents ({messages.length})</h3>
            {messages.map((m) => (
              <div key={m.id} className="p-4 border border-slate-200 rounded-xl flex items-start justify-between gap-4 hover:border-amber-400/60 transition">
                <div>
                  <div className="font-bold text-sm text-[#041E42]">{m.subject}</div>
                  <p className="text-xs text-slate-600 mt-1">{m.content}</p>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {m.sender_name ? `De : ${m.sender_name}` : `À : ${m.receiver_name}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {m.is_read ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-700 font-bold">
                      <CheckCircle size={14} /> Lu
                    </span>
                  ) : user.role === "parent" ? (
                    <button
                      type="button"
                      onClick={() => handleReadMessage(m.id)}
                      className="px-3 py-1.5 bg-[#041E42] text-amber-400 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Marquer comme lu
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">Non lu</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
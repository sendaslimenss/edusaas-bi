import { useEffect, useState } from "react";
import { CheckCircle, Send, FileText, PlusCircle } from "lucide-react";
import api from "../api";

export default function SaasWorkspace({ section, user }) {
  const [students, setStudents] = useState([]);
  const [referentials, setReferentials] = useState({ classes: [], subjects: [] });
  const [selectedBulletin, setSelectedBulletin] = useState(null);
  const [payments, setPayments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [feedback, setFeedback] = useState("");

  // Formulaires Enseignant & Communication
  const [gradeForm, setGradeForm] = useState({ student_id: "", subject_id: "", trimester: 1, score: 14 });
  const [attForm, setAttForm] = useState({ student_id: "", type: "absence", hours_missed: 2, justified: false });
  const [msgForm, setMsgForm] = useState({ receiver_parent_id: "", subject: "", content: "" });

  useEffect(() => {
    setFeedback("");
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
  }, [section]);

  const loadBulletin = async (st) => {
    const { data } = await api.get(`/api/saas/students/${st.id}/bulletin`);
    setSelectedBulletin({ student: st, ...data });
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
    setFeedback("Note ajoutée au bulletin avec succès !");
  };

  const handleAddAttendance = async (e) => {
    e.preventDefault();
    await api.post("/api/saas/attendance", {
      ...attForm,
      student_id: Number(attForm.student_id),
      hours_missed: Number(attForm.hours_missed),
    });
    setFeedback("Absence/Retard enregistré !");
  };

  const handleSettlePayment = async (id) => {
    await api.patch(`/api/saas/payments/${id}/settle`);
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

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium">
          {feedback}
        </div>
      )}

      {/* SECTION ÉLÈVES & BULLETINS */}
      {section === "students" && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-3">
              {user.role === "student" || user.role === "parent" ? "Dossier Scolaire" : "Liste des Élèves"}
            </h3>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {students.map((st) => (
                <button
                  key={st.id}
                  onClick={() => loadBulletin(st)}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-indigo-50 transition flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{st.student_name}</div>
                    <div className="text-xs text-slate-500">{st.class_name} • {st.city}</div>
                  </div>
                  <FileText size={16} className="text-indigo-600" />
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            {!selectedBulletin ? (
              <p className="text-slate-500 text-sm">Sélectionnez un élève à gauche pour afficher son bulletin, ses absences et ses paiements.</p>
            ) : (
              <div className="space-y-6">
                <div className="border-b pb-3">
                  <h3 className="text-lg font-bold text-slate-900">{selectedBulletin.student.student_name}</h3>
                  <p className="text-xs text-slate-500">
                    Classe : {selectedBulletin.student.class_name} | Parent : {selectedBulletin.student.parent_name}
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-sm text-slate-700 mb-2">Notes & Évaluations</h4>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="p-2">Trimestre</th>
                          <th className="p-2">Matière</th>
                          <th className="p-2">Coeff</th>
                          <th className="p-2">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedBulletin.grades.map((g) => (
                          <tr key={g.id}>
                            <td className="p-2">T{g.trimester}</td>
                            <td className="p-2 font-medium">{g.subject_name}</td>
                            <td className="p-2">{g.coefficient}</td>
                            <td className={`p-2 font-bold ${g.score < 10 ? "text-red-600" : "text-emerald-600"}`}>
                              {g.score}/20
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-slate-700 mb-2">Absences ({selectedBulletin.attendance.length})</h4>
                    <div className="space-y-1 max-h-36 overflow-y-auto text-xs">
                      {selectedBulletin.attendance.map((a) => (
                        <div key={a.id} className="p-2 bg-slate-50 rounded flex justify-between">
                          <span>{a.date} ({a.hours_missed}h)</span>
                          <span className={a.justified ? "text-emerald-600" : "text-red-600"}>
                            {a.justified ? "Justifiée" : "Non justifiée"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-700 mb-2">Situation Financière</h4>
                    <div className="space-y-1 text-xs">
                      {selectedBulletin.payments.map((p) => (
                        <div key={p.id} className="p-2 bg-slate-50 rounded flex justify-between">
                          <span>{p.title}</span>
                          <span className="font-bold">{p.amount_paid}/{p.amount_due} TND</span>
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

      {/* SECTION ENSEIGNANT : SAISIE NOTES & APPEL */}
      {section === "teacher" && (
        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={handleAddGrade} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <PlusCircle size={18} className="text-indigo-600" /> Saisir une note d'évaluation
            </h3>
            <div>
              <label className="block text-xs font-medium mb-1">Élève</label>
              <select
                value={gradeForm.student_id}
                onChange={(e) => setGradeForm({ ...gradeForm, student_id: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.student_name} ({s.class_name})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Matière</label>
                <select
                  value={gradeForm.subject_id}
                  onChange={(e) => setGradeForm({ ...gradeForm, subject_id: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  {referentials.subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Trimestre</label>
                <select
                  value={gradeForm.trimester}
                  onChange={(e) => setGradeForm({ ...gradeForm, trimester: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value={1}>Trimestre 1</option>
                  <option value={2}>Trimestre 2</option>
                  <option value={3}>Trimestre 3</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Note (/20)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="20"
                value={gradeForm.score}
                onChange={(e) => setGradeForm({ ...gradeForm, score: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm"
              />
            </div>
            <button className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
              Enregistrer la note
            </button>
          </form>

          <form onSubmit={handleAddAttendance} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <PlusCircle size={18} className="text-red-600" /> Signaler une absence ou un retard
            </h3>
            <div>
              <label className="block text-xs font-medium mb-1">Élève</label>
              <select
                value={attForm.student_id}
                onChange={(e) => setAttForm({ ...attForm, student_id: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.student_name} ({s.class_name})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Type</label>
                <select
                  value={attForm.type}
                  onChange={(e) => setAttForm({ ...attForm, type: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value="absence">Absence</option>
                  <option value="late">Retard</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Heures manquées</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={attForm.hours_missed}
                  onChange={(e) => setAttForm({ ...attForm, hours_missed: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={attForm.justified}
                onChange={(e) => setAttForm({ ...attForm, justified: e.target.checked })}
              />
              Absence justifiée
            </label>
            <button className="w-full py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">
              Enregistrer l'absence
            </button>
          </form>
        </div>
      )}

      {/* SECTION COMPTABLE : GESTION DES PAIEMENTS */}
      {section === "payments" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <h3 className="font-bold text-slate-800 mb-4">Suivi & Encaissement des Frais Scolaires</h3>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="p-3">Élève</th>
                <th className="p-3">Tranche</th>
                <th className="p-3">Payé / Dû</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="p-3 font-medium">{p.student_name}<div className="text-xs text-slate-400">Parent: {p.parent_name}</div></td>
                  <td className="p-3">{p.title}</td>
                  <td className="p-3">{p.amount_paid} / {p.amount_due} TND</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      p.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.status !== "paid" && (
                      <button
                        onClick={() => handleSettlePayment(p.id)}
                        className="px-3 py-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-700"
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

      {/* SECTION COMMUNICATION PARENTS */}
      {section === "messages" && (
        <div className="grid md:grid-cols-3 gap-6">
          {user.role !== "parent" && (
            <form onSubmit={handleSendMessage} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Send size={16} className="text-indigo-600" /> Envoyer une notification
              </h3>
              <div>
                <label className="block text-xs font-medium mb-1">Parent destinataire (via Élève)</label>
                <select
                  value={msgForm.receiver_parent_id}
                  onChange={(e) => setMsgForm({ ...msgForm, receiver_parent_id: e.target.value })}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  {students.filter((s) => s.parent_id).map((s) => (
                    <option key={s.id} value={s.parent_id}>{s.parent_name} (Élève: {s.student_name})</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                required
                placeholder="Objet du message"
                value={msgForm.subject}
                onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm"
              />
              <textarea
                required
                rows={4}
                placeholder="Contenu de la notification..."
                value={msgForm.content}
                onChange={(e) => setMsgForm({ ...msgForm, content: e.target.value })}
                className="w-full p-2 border rounded-lg text-sm"
              />
              <button className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">
                Envoyer
              </button>
            </form>
          )}

          <div className={`${user.role === "parent" ? "md:col-span-3" : "md:col-span-2"} bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3`}>
            <h3 className="font-bold text-slate-800">Historique des Notifications Parents</h3>
            {messages.map((m) => (
              <div key={m.id} className="p-4 border rounded-lg flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-sm text-slate-900">{m.subject}</div>
                  <p className="text-xs text-slate-600 mt-1">{m.content}</p>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {m.sender_name ? `De : ${m.sender_name}` : `À : ${m.receiver_name}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_read ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle size={14} /> Lu
                    </span>
                  ) : user.role === "parent" ? (
                    <button
                      onClick={() => handleReadMessage(m.id)}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-xs"
                    >
                      Marquer comme lu
                    </button>
                  ) : (
                    <span className="text-xs text-amber-600">Non lu</span>
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
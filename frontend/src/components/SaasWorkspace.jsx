import { useEffect, useState } from "react";
import {
  CheckCircle, AlertCircle, Send, FileText, PlusCircle, Search, Award,
  Clock, CreditCard, UserCheck, Printer, Trash2, Calendar, Layers,
  UserCog, UserPlus, Edit3
} from "lucide-react";
import api from "../api";

const DAYS_OF_WEEK = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const ROLE_LABELS = {
  director: "Directeur",
  admin: "Administrateur",
  teacher: "Enseignant",
  accountant: "Comptable",
  parent: "Parent",
  student: "Élève",
};

export default function SaasWorkspace({ section, user }) {
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [referentials, setReferentials] = useState({ classes: [], subjects: [] });
  const [selectedBulletin, setSelectedBulletin] = useState(null);
  const [bulletinYear, setBulletinYear] = useState("2025-2026");

  // États Paiements & Messages
  const [payments, setPayments] = useState([]);
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ student_id: "", title: "Scolarité Complémentaire", amount_due: 450, due_date: "2026-12-15" });
  const [messages, setMessages] = useState([]);

  // États CRUD Élèves
  const [showNewStudent, setShowNewStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({
    full_name: "",
    email: "",
    class_id: "",
    city: user.school_city || "Tunis",
    parent_id: "",
    parent_name: "",
    parent_email: "",
  });

  // États Emplois du temps
  const [schedules, setSchedules] = useState([]);
  const [scheduleClassFilter, setScheduleClassFilter] = useState("");
  const [scheduleForm, setScheduleForm] = useState({
    class_id: "",
    subject_id: "",
    teacher_id: "",
    day_of_week: "Lundi",
    start_time: "08:30",
    end_time: "10:30",
    room_name: "Salle B101",
  });

  // États Classes, Matières & Enseignants
  const [academicTab, setAcademicTab] = useState("classes");
  const [teachersData, setTeachersData] = useState({ teachers: [], assignments: [] });
  const [classForm, setClassForm] = useState({ name: "", level: "1ère Année", max_capacity: 30, room_name: "" });
  const [subjectForm, setSubjectForm] = useState({ name: "", coefficient: 2.0 });
  const [assignForm, setAssignForm] = useState({ teacher_id: "", class_id: "", subject_id: "", weekly_hours: 3 });

  // États Administration Utilisateurs
  const [usersList, setUsersList] = useState([]);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [userSearch, setUserSearch] = useState("");
  const [userForm, setUserForm] = useState({ full_name: "", email: "", password: "", role: "teacher" });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ full_name: "", role: "teacher", password: "" });

  // États Notes, Assiduité & Messagerie
  const [gradeForm, setGradeForm] = useState({ student_id: "", subject_id: "", trimester: 1, score: 14 });
  const [attForm, setAttForm] = useState({ student_id: "", type: "absence", hours_missed: 2, justified: false });
  const [msgForm, setMsgForm] = useState({ receiver_parent_id: "", subject: "", content: "" });

  // Bandeaux de retour utilisateur
  const [feedback, setFeedback] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const notifySuccess = (msg) => {
    setErrorMsg("");
    setFeedback(msg);
  };

  const notifyError = (err, fallback = "Une erreur est survenue lors de l'opération.") => {
    setFeedback("");
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
      setErrorMsg(detail.map((d) => d.msg).join(" • "));
    } else {
      setErrorMsg(detail || fallback);
    }
  };

  const canManageAdmin = user.role === "admin" || user.role === "director";

  useEffect(() => {
    setFeedback("");
    setErrorMsg("");
    setSearchQuery("");

    if (section === "students" || section === "teacher") {
      loadStudentsAndRefs();
    } else if (section === "schedules") {
      loadSchedulesSection();
    } else if (section === "academics") {
      loadAcademicsSection();
    } else if (section === "users") {
      loadUsers();
    } else if (section === "payments") {
      loadPayments();
      api.get("/api/saas/students").then((r) => {
        setStudents(r.data);
        if (r.data.length > 0) setPaymentForm((f) => ({ ...f, student_id: r.data[0].id }));
      }).catch(() => {});
    } else if (section === "messages") {
      loadMessages();
      api.get("/api/saas/students").then((r) => {
        setStudents(r.data);
        const withParent = r.data.find((s) => s.parent_id);
        if (withParent) setMsgForm((m) => ({ ...m, receiver_parent_id: withParent.parent_id }));
      }).catch(() => {});
    }
  }, [section, user.role]);

  const loadStudentsAndRefs = async () => {
    try {
      const [stRes, refRes] = await Promise.all([
        api.get("/api/saas/students"),
        api.get("/api/saas/referentials"),
      ]);
      setStudents(stRes.data);
      setReferentials(refRes.data);

      if (stRes.data.length > 0) {
        setGradeForm((f) => ({ ...f, student_id: stRes.data[0].id }));
        setAttForm((f) => ({ ...f, student_id: stRes.data[0].id }));
        if (user.role === "student" || user.role === "parent") {
          loadBulletin(stRes.data[0]);
        }
      }
      if (refRes.data.classes.length > 0) {
        setStudentForm((f) => ({ ...f, class_id: refRes.data.classes[0].id }));
      }
      if (refRes.data.subjects.length > 0) {
        setGradeForm((f) => ({ ...f, subject_id: refRes.data.subjects[0].id }));
      }
    } catch (err) {
      notifyError(err, "Impossible de charger les dossiers élèves.");
    }
  };

  const loadSchedulesSection = async (cid = "") => {
    try {
      const refRes = await api.get("/api/saas/referentials");
      setReferentials(refRes.data);

      let defaultCid = cid;
      if (!defaultCid && canManageAdmin && refRes.data.classes.length > 0) {
        defaultCid = String(refRes.data.classes[0].id);
        setScheduleClassFilter(defaultCid);
      }

      const url = defaultCid ? `/api/saas/schedules?class_id=${defaultCid}` : "/api/saas/schedules";
      const scRes = await api.get(url);
      setSchedules(scRes.data);

      if (canManageAdmin) {
        const tchRes = await api.get("/api/saas/teachers");
        setTeachersData(tchRes.data);
        if (refRes.data.classes.length > 0 && refRes.data.subjects.length > 0 && tchRes.data.teachers.length > 0) {
          const firstCls = refRes.data.classes[0];
          setScheduleForm((f) => ({
            ...f,
            class_id: defaultCid || firstCls.id,
            subject_id: refRes.data.subjects[0].id,
            teacher_id: tchRes.data.teachers[0].id,
            room_name: firstCls.room_name || "Salle B101",
          }));
        }
      }
    } catch (err) {
      notifyError(err, "Erreur lors du chargement de l'emploi du temps.");
    }
  };

  const loadAcademicsSection = async () => {
    try {
      const [refRes, tchRes] = await Promise.all([
        api.get("/api/saas/referentials"),
        api.get("/api/saas/teachers"),
      ]);
      setReferentials(refRes.data);
      setTeachersData(tchRes.data);
      if (tchRes.data.teachers.length > 0 && refRes.data.classes.length > 0 && refRes.data.subjects.length > 0) {
        setAssignForm((f) => ({
          ...f,
          teacher_id: tchRes.data.teachers[0].id,
          class_id: refRes.data.classes[0].id,
          subject_id: refRes.data.subjects[0].id,
        }));
      }
    } catch (err) {
      notifyError(err, "Erreur lors du chargement des référentiels académiques.");
    }
  };

  const loadUsers = async () => {
    try {
      const { data } = await api.get("/api/saas/users");
      setUsersList(data);
    } catch (err) {
      notifyError(err, "Impossible de charger la liste des utilisateurs.");
    }
  };

  const loadBulletin = async (st) => {
    try {
      const { data } = await api.get(`/api/saas/students/${st.id}/bulletin`);
      setSelectedBulletin({ student: st, ...data });
      setBulletinYear("2025-2026");
    } catch (err) {
      notifyError(err, "Impossible de charger le bulletin scolaire.");
    }
  };

  const loadPayments = async () => {
    try {
      const { data } = await api.get("/api/saas/payments");
      setPayments(data);
    } catch (err) {
      notifyError(err, "Impossible de charger les échéances.");
    }
  };

  const loadMessages = async () => {
    try {
      const { data } = await api.get("/api/saas/messages");
      setMessages(data);
    } catch (err) {
      notifyError(err, "Impossible de charger la messagerie.");
    }
  };

  // --- Handlers Élèves ---
  const handleCreateStudent = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        full_name: studentForm.full_name,
        email: studentForm.email,
        class_id: Number(studentForm.class_id),
        city: studentForm.city,
        parent_id: studentForm.parent_id ? Number(studentForm.parent_id) : null,
        parent_name: studentForm.parent_id ? null : studentForm.parent_name || null,
        parent_email: studentForm.parent_id ? null : studentForm.parent_email || null,
      };
      await api.post("/api/saas/students", payload);
      notifySuccess("Nouvel élève inscrit avec succès !");
      setShowNewStudent(false);
      setStudentForm({ ...studentForm, full_name: "", email: "", parent_name: "", parent_email: "" });
      loadStudentsAndRefs();
    } catch (err) {
      notifyError(err, "Échec de l'inscription de l'élève.");
    }
  };

  const handleUpdateStudentStatus = async (studentId, updates) => {
    try {
      await api.patch(`/api/saas/students/${studentId}`, updates);
      notifySuccess("Dossier élève mis à jour !");
      await loadStudentsAndRefs();
      if (selectedBulletin?.student?.id === studentId) {
        const updated = { ...selectedBulletin.student, ...updates };
        if (updates.class_id) {
          const cls = referentials.classes.find((c) => c.id === Number(updates.class_id));
          if (cls) updated.class_name = cls.name;
        }
        setSelectedBulletin({ ...selectedBulletin, student: updated });
      }
    } catch (err) {
      notifyError(err, "Impossible de mettre à jour l'élève.");
    }
  };

  // --- Handlers Notes & Absences ---
  const handleAddGrade = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/grades", {
        ...gradeForm,
        student_id: Number(gradeForm.student_id),
        subject_id: Number(gradeForm.subject_id),
        trimester: Number(gradeForm.trimester),
        score: Number(gradeForm.score),
      });
      notifySuccess("Note enregistrée au bulletin avec succès !");
    } catch (err) {
      notifyError(err, "Erreur lors de l'enregistrement de la note.");
    }
  };

  const handleDeleteGrade = async (gradeId) => {
    try {
      await api.delete(`/api/saas/grades/${gradeId}`);
      notifySuccess("Note supprimée du bulletin.");
      if (selectedBulletin?.student) loadBulletin(selectedBulletin.student);
    } catch (err) {
      notifyError(err, "Suppression de la note refusée.");
    }
  };

  const handleAddAttendance = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/attendance", {
        ...attForm,
        student_id: Number(attForm.student_id),
        hours_missed: Number(attForm.hours_missed),
      });
      notifySuccess("Absence / retard enregistré dans le dossier de l'élève !");
    } catch (err) {
      notifyError(err, "Erreur lors de l'enregistrement de l'absence.");
    }
  };

  // --- Handlers Emplois du temps ---
  const handleFilterScheduleClass = async (cid) => {
    setScheduleClassFilter(cid);
    try {
      const url = cid ? `/api/saas/schedules?class_id=${cid}` : "/api/saas/schedules";
      const { data } = await api.get(url);
      setSchedules(data);
    } catch (err) {
      notifyError(err);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/schedules", {
        ...scheduleForm,
        class_id: Number(scheduleForm.class_id),
        subject_id: Number(scheduleForm.subject_id),
        teacher_id: Number(scheduleForm.teacher_id),
      });
      notifySuccess("Créneau ajouté à l'emploi du temps !");
      handleFilterScheduleClass(scheduleClassFilter);
    } catch (err) {
      notifyError(err, "Conflit ou erreur lors de l'ajout du créneau.");
    }
  };

  const handleDeleteSchedule = async (scId) => {
    try {
      await api.delete(`/api/saas/schedules/${scId}`);
      notifySuccess("Créneau supprimé.");
      handleFilterScheduleClass(scheduleClassFilter);
    } catch (err) {
      notifyError(err);
    }
  };

  // --- Handlers Classes, Matières & Enseignants ---
  const handleCreateClass = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/classes", { ...classForm, max_capacity: Number(classForm.max_capacity) });
      notifySuccess("Classe et salle créées avec succès !");
      setClassForm({ name: "", level: "1ère Année", max_capacity: 30, room_name: "" });
      loadAcademicsSection();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleDeleteClass = async (cid) => {
    try {
      await api.delete(`/api/saas/classes/${cid}`);
      notifySuccess("Classe supprimée.");
      loadAcademicsSection();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/subjects", { ...subjectForm, coefficient: Number(subjectForm.coefficient) });
      notifySuccess("Matière ajoutée avec succès !");
      setSubjectForm({ name: "", coefficient: 2.0 });
      loadAcademicsSection();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleDeleteSubject = async (subId) => {
    try {
      await api.delete(`/api/saas/subjects/${subId}`);
      notifySuccess("Matière supprimée.");
      loadAcademicsSection();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/teacher-assignments", {
        teacher_id: Number(assignForm.teacher_id),
        class_id: Number(assignForm.class_id),
        subject_id: Number(assignForm.subject_id),
        weekly_hours: Number(assignForm.weekly_hours),
      });
      notifySuccess("Affectation enseignant enregistrée !");
      loadAcademicsSection();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleDeleteAssignment = async (aid) => {
    try {
      await api.delete(`/api/saas/teacher-assignments/${aid}`);
      notifySuccess("Affectation supprimée.");
      loadAcademicsSection();
    } catch (err) {
      notifyError(err);
    }
  };

  // --- Handlers Utilisateurs ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/users", userForm);
      notifySuccess("Compte utilisateur créé avec succès !");
      setUserForm({ full_name: "", email: "", password: "", role: "teacher" });
      loadUsers();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleSaveUserEdit = async (uid) => {
    try {
      const payload = { full_name: editUserForm.full_name, role: editUserForm.role };
      if (editUserForm.password.trim()) payload.password = editUserForm.password;
      await api.patch(`/api/saas/users/${uid}`, payload);
      notifySuccess("Compte utilisateur mis à jour !");
      setEditingUserId(null);
      loadUsers();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleDeleteUser = async (uid) => {
    try {
      await api.delete(`/api/saas/users/${uid}`);
      notifySuccess("Utilisateur supprimé.");
      loadUsers();
    } catch (err) {
      notifyError(err);
    }
  };

  // --- Handlers Paiements & Messages ---
  const handleCreatePayment = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/payments", {
        student_id: Number(paymentForm.student_id),
        title: paymentForm.title,
        amount_due: Number(paymentForm.amount_due),
        due_date: paymentForm.due_date,
      });
      notifySuccess("Nouvelle échéance créée !");
      setShowNewPayment(false);
      loadPayments();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleSettlePayment = async (id) => {
    try {
      await api.patch(`/api/saas/payments/${id}/settle`);
      notifySuccess("Tranche de scolarité soldée avec succès !");
      loadPayments();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/saas/messages", {
        ...msgForm,
        receiver_parent_id: Number(msgForm.receiver_parent_id),
      });
      setMsgForm({ ...msgForm, subject: "", content: "" });
      notifySuccess("Notification envoyée au parent !");
      loadMessages();
    } catch (err) {
      notifyError(err);
    }
  };

  const handleReadMessage = async (id) => {
    try {
      await api.patch(`/api/saas/messages/${id}/read`);
      loadMessages();
    } catch (err) {
      notifyError(err);
    }
  };

  // Filtrage des élèves
  const filteredStudents = students.filter((st) => {
    const matchesSearch =
      st.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (st.class_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || st.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculs dynamiques du bulletin
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

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 text-rose-800 rounded-2xl text-sm font-semibold flex items-center gap-2 shadow-sm">
          <AlertCircle size={18} className="text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 1 : ÉLÈVES, CRUD INSCRIPTION & BULLETINS                       */}
      {/* ====================================================================== */}
      {section === "students" && (
        <div className="space-y-4">
          {canManageAdmin && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewStudent((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#041E42] text-amber-400 text-xs font-extrabold hover:bg-[#082d5e] transition cursor-pointer shadow"
              >
                <UserPlus size={16} />
                <span>{showNewStudent ? "Fermer le formulaire" : "+ Inscrire un Nouvel Élève"}</span>
              </button>
            </div>
          )}

          {showNewStudent && canManageAdmin && (
            <form onSubmit={handleCreateStudent} className="bg-white/95 p-5 rounded-2xl border border-amber-400/50 shadow-md grid md:grid-cols-3 gap-4">
              <div className="md:col-span-3 font-bold text-sm text-[#041E42]">Inscription d'un Nouvel Élève ({user.school_name})</div>
              <input
                type="text"
                required
                placeholder="Nom complet de l'élève"
                value={studentForm.full_name}
                onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
              />
              <input
                type="email"
                required
                placeholder="Email élève (ex: prenom@aceda.tn)"
                value={studentForm.email}
                onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
              />
              <select
                value={studentForm.class_id}
                onChange={(e) => setStudentForm({ ...studentForm, class_id: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
              >
                {referentials.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.level})</option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="Quartier / Ville"
                value={studentForm.city}
                onChange={(e) => setStudentForm({ ...studentForm, city: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
              />
              <select
                value={studentForm.parent_id}
                onChange={(e) => setStudentForm({ ...studentForm, parent_id: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
              >
                <option value="">-- Créer un nouveau compte parent --</option>
                {uniqueParents.map((p) => (
                  <option key={p.parent_id} value={p.parent_id}>Parent existant : {p.parent_name}</option>
                ))}
              </select>
              {!studentForm.parent_id && (
                <>
                  <input
                    type="text"
                    required
                    placeholder="Nom complet du parent"
                    value={studentForm.parent_name}
                    onChange={(e) => setStudentForm({ ...studentForm, parent_name: e.target.value })}
                    className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email du parent"
                    value={studentForm.parent_email}
                    onChange={(e) => setStudentForm({ ...studentForm, parent_email: e.target.value })}
                    className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400"
                  />
                </>
              )}
              <button className="md:col-span-3 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 text-[#041E42] rounded-xl text-sm font-extrabold cursor-pointer">
                Valider l'inscription (Mot de passe initial : Aceda2026!)
              </button>
            </form>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm">
              <h3 className="font-bold text-[#041E42] mb-3">
                {user.role === "student" || user.role === "parent"
                  ? `Dossier(s) Scolaire(s) (${students.length})`
                  : `Répertoire Élèves (${filteredStudents.length})`}
              </h3>

              {students.length > 3 && (
                <div className="space-y-2 mb-3">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Rechercher un élève ou une classe..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-amber-400 outline-none"
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { id: "ALL", label: "Tous" },
                      { id: "active", label: "Actifs" },
                      { id: "dropped", label: "Abandons" },
                      { id: "graduated", label: "Alumni" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                          statusFilter === f.id ? "bg-[#041E42] text-amber-400" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
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
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          <span>{st.student_name}</span>
                          {st.status !== "active" && (
                            <span className="px-1.5 py-0.5 text-[9px] uppercase rounded bg-rose-500/20 text-rose-500 font-extrabold">
                              {st.status}
                            </span>
                          )}
                        </div>
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
                        <strong>{selectedBulletin.student.parent_name || "Non rattaché"}</strong>
                      </p>
                      {canManageAdmin && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <select
                            value={selectedBulletin.student.class_id || ""}
                            onChange={(e) => handleUpdateStudentStatus(selectedBulletin.student.id, { class_id: Number(e.target.value) })}
                            className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                          >
                            {referentials.classes.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <select
                            value={selectedBulletin.student.status}
                            onChange={(e) => handleUpdateStudentStatus(selectedBulletin.student.id, { status: e.target.value })}
                            className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-slate-50 font-semibold"
                          >
                            <option value="active">Statut : Actif</option>
                            <option value="dropped">Statut : Abandon</option>
                            <option value="graduated">Statut : Diplômé</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
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

                      <button
                        type="button"
                        onClick={() => window.print()}
                        title="Imprimer / Exporter en PDF"
                        className="p-2.5 rounded-xl bg-[#041E42] text-amber-400 hover:bg-[#082d5e] transition cursor-pointer"
                      >
                        <Printer size={16} />
                      </button>
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
                            {(user.role === "teacher" || user.role === "admin") && <th className="p-2.5">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {yearGrades.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-slate-400">
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
                                {(user.role === "teacher" || user.role === "admin") && (
                                  <td className="p-2.5">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteGrade(g.id)}
                                      className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                      title="Supprimer cette note"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                )}
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

                    {selectedBulletin.payments.length > 0 && (
                      <div>
                        <h4 className="font-bold text-sm text-[#041E42] mb-2 flex items-center gap-1.5">
                          <CreditCard size={15} className="text-amber-600" /> Situation Financière
                        </h4>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs pr-1">
                          {selectedBulletin.payments.map((p) => (
                            <div key={p.id} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl flex justify-between items-center">
                              <span className="truncate pr-2">{p.title}</span>
                              <span className={`font-bold shrink-0 ${p.status === "paid" ? "text-emerald-700" : "text-rose-600"}`}>
                                {p.amount_paid}/{p.amount_due} TND
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 2 : EMPLOIS DU TEMPS                                           */}
      {/* ====================================================================== */}
      {section === "schedules" && (
        <div className="space-y-6">
          {canManageAdmin && (
            <form onSubmit={handleCreateSchedule} className="bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm grid md:grid-cols-4 gap-3">
              <div className="md:col-span-4 font-bold text-sm text-[#041E42] flex items-center gap-2">
                <Calendar size={17} className="text-amber-500" /> Ajouter un Créneau à l'Emploi du Temps
              </div>
              <select
                value={scheduleForm.class_id}
                onChange={(e) => {
                  const cid = e.target.value;
                  const cls = referentials.classes.find((c) => String(c.id) === cid);
                  setScheduleForm({ ...scheduleForm, class_id: cid, room_name: cls?.room_name || scheduleForm.room_name });
                }}
                className="p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
              >
                {referentials.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={scheduleForm.subject_id}
                onChange={(e) => setScheduleForm({ ...scheduleForm, subject_id: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
              >
                {referentials.subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={scheduleForm.teacher_id}
                onChange={(e) => setScheduleForm({ ...scheduleForm, teacher_id: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
              >
                {teachersData.teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
              <select
                value={scheduleForm.day_of_week}
                onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <input
                type="time"
                value={scheduleForm.start_time}
                onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none"
              />
              <input
                type="time"
                value={scheduleForm.end_time}
                onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none"
              />
              <input
                type="text"
                required
                placeholder="Salle (ex: Salle B101)"
                value={scheduleForm.room_name}
                onChange={(e) => setScheduleForm({ ...scheduleForm, room_name: e.target.value })}
                className="p-2.5 border border-slate-200 rounded-xl text-xs outline-none"
              />
              <button className="py-2.5 bg-[#041E42] text-amber-400 rounded-xl text-xs font-extrabold hover:bg-[#082d5e] cursor-pointer">
                + Planifier ce créneau
              </button>
            </form>
          )}

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-[#041E42]">Planning Hebdomadaire ({schedules.length} séances)</h3>
              {canManageAdmin && (
                <select
                  value={scheduleClassFilter}
                  onChange={(e) => handleFilterScheduleClass(e.target.value)}
                  className="p-2 border border-slate-200 rounded-xl text-xs font-bold text-[#041E42] outline-none"
                >
                  <option value="">Toutes les classes</option>
                  {referentials.classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {DAYS_OF_WEEK.map((day) => {
                const daySlots = schedules.filter((s) => s.day_of_week === day);
                return (
                  <div key={day} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="font-extrabold text-sm text-[#041E42] border-b border-slate-200 pb-1.5 flex justify-between">
                      <span>{day}</span>
                      <span className="text-xs text-amber-600">{daySlots.length} cours</span>
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-400 py-3">Aucun cours programmé.</p>
                    ) : (
                      daySlots.map((slot) => (
                        <div key={slot.id} className="p-3 rounded-xl bg-white border border-slate-200 shadow-xs text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-[#041E42]">
                            <span className="px-2 py-0.5 rounded bg-amber-400/25 text-[#041E42]">
                              {slot.start_time} – {slot.end_time}
                            </span>
                            {canManageAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteSchedule(slot.id)}
                                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                          <div className="font-extrabold text-sm text-[#041E42]">{slot.subject_name}</div>
                          <div className="text-slate-600">{slot.teacher_name}</div>
                          <div className="text-[11px] text-slate-400 font-semibold">
                            {slot.class_name} • {slot.room_name}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 3 : ENSEIGNANT – SAISIE DES NOTES & APPEL                      */}
      {/* ====================================================================== */}
      {section === "teacher" && (
        <div className="space-y-5">
          {user.role === "teacher" && (
            <div className="p-4 rounded-2xl bg-white/90 border border-amber-400/40 text-xs text-[#041E42] flex flex-wrap gap-4 items-center">
              <span className="font-extrabold">Périmètre autorisé :</span>
              <span>
                Classes : <strong>{referentials.classes.map((c) => c.name).join(", ") || "Aucune"}</strong>
              </span>
              <span>
                Matières : <strong>{referentials.subjects.map((s) => s.name).join(", ") || "Aucune"}</strong>
              </span>
            </div>
          )}

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
                  {students.filter((s) => s.status === "active").map((s) => (
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
                  {students.filter((s) => s.status === "active").map((s) => (
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
                    max="12"
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
        </div>
      )}
      {/* ====================================================================== */}
      {/* SECTION 4 : CLASSES, SALLES, MATIÈRES & ENSEIGNANTS (CRUD)             */}
      {/* ====================================================================== */}
      {section === "academic" && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* CRUD Classes & Salles */}
            <div className="bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-[#041E42] flex items-center gap-2">
                <Layers size={18} className="text-amber-500" /> Classes & Salles ({referentials.classes.length})
              </h3>
              <form onSubmit={handleCreateClass} className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <input
                  type="text"
                  required
                  placeholder="Nom (ex: 1ère Année C)"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
                />
                <select
                  value={classForm.level}
                  onChange={(e) => setClassForm({ ...classForm, level: e.target.value })}
                  className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
                >
                  <option value="1ère Année">1ère Année</option>
                  <option value="2ème Année">2ème Année</option>
                  <option value="3ème Année">3ème Année</option>
                  <option value="Baccalauréat">Baccalauréat</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Salle (ex: Salle B105)"
                  value={classForm.room_name}
                  onChange={(e) => setClassForm({ ...classForm, room_name: e.target.value })}
                  className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="5"
                    max="100"
                    required
                    value={classForm.max_capacity}
                    onChange={(e) => setClassForm({ ...classForm, max_capacity: e.target.value })}
                    className="w-20 p-2 border border-slate-200 rounded-lg text-xs bg-white"
                  />
                  <button className="flex-1 bg-[#041E42] text-amber-400 rounded-lg text-xs font-bold cursor-pointer">
                    + Ajouter
                  </button>
                </div>
              </form>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 text-xs">
                {referentials.classes.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-[#041E42]">{c.name}</span>{" "}
                      <span className="text-slate-500">({c.level} • {c.room_name})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-amber-700">
                        {c.student_count}/{c.max_capacity} élèves
                      </span>
                      {user.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteClass(c.id)}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          title="Supprimer si vide"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CRUD Matières */}
            <div className="bg-white/90 p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
              <h3 className="font-bold text-[#041E42] flex items-center gap-2">
                <BookOpen size={18} className="text-amber-500" /> Matières & Coefficients ({referentials.subjects.length})
              </h3>
              <form onSubmit={handleCreateSubject} className="flex gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <input
                  type="text"
                  required
                  placeholder="Nom de la matière (ex: Philosophie)"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="flex-1 p-2 border border-slate-200 rounded-lg text-xs bg-white"
                />
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  required
                  value={subjectForm.coefficient}
                  onChange={(e) => setSubjectForm({ ...subjectForm, coefficient: e.target.value })}
                  className="w-20 p-2 border border-slate-200 rounded-lg text-xs bg-white"
                />
                <button className="px-4 bg-[#041E42] text-amber-400 rounded-lg text-xs font-bold cursor-pointer">
                  + Ajouter
                </button>
              </form>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 text-xs">
                {referentials.subjects.map((sub) => (
                  <div key={sub.id} className="py-2.5 flex items-center justify-between">
                    <span className="font-bold text-[#041E42]">{sub.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                        Coeff {sub.coefficient}
                      </span>
                      {user.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSubject(sub.id)}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer"
                          title="Supprimer si aucune note"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Affectations Pédagogiques Enseignants */}
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <h3 className="font-bold text-[#041E42]">
              Affectations Corps Enseignant ({teachersData.teachers.length} professeurs • {teachersData.assignments.length} attributions)
            </h3>

            <form onSubmit={handleCreateAssignment} className="grid sm:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <select
                value={assignForm.teacher_id}
                onChange={(e) => setAssignForm({ ...assignForm, teacher_id: e.target.value })}
                className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
              >
                {teachersData.teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.full_name} ({t.total_hours}h)</option>
                ))}
              </select>
              <select
                value={assignForm.class_id}
                onChange={(e) => setAssignForm({ ...assignForm, class_id: e.target.value })}
                className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
              >
                {referentials.classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={assignForm.subject_id}
                onChange={(e) => setAssignForm({ ...assignForm, subject_id: e.target.value })}
                className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
              >
                {referentials.subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                max="30"
                required
                value={assignForm.weekly_hours}
                onChange={(e) => setAssignForm({ ...assignForm, weekly_hours: e.target.value })}
                className="p-2 border border-slate-200 rounded-lg text-xs bg-white"
                placeholder="Heures/sem"
              />
              <button className="bg-[#041E42] text-amber-400 rounded-lg text-xs font-extrabold cursor-pointer">
                Affecter
              </button>
            </form>

            <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#041E42] text-amber-300 sticky top-0">
                  <tr>
                    <th className="p-2.5">Enseignant</th>
                    <th className="p-2.5">Classe</th>
                    <th className="p-2.5">Matière</th>
                    <th className="p-2.5">Volume / Semaine</th>
                    <th className="p-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {teachersData.assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-amber-50/40">
                      <td className="p-2.5 font-bold text-[#041E42]">{a.teacher_name}</td>
                      <td className="p-2.5">{a.class_name}</td>
                      <td className="p-2.5">{a.subject_name}</td>
                      <td className="p-2.5 font-bold">{a.weekly_hours}h</td>
                      <td className="p-2.5">
                        <button
                          type="button"
                          onClick={() => handleDeleteAssignment(a.id)}
                          className="text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 5 : COMPTABLE – SUIVI, CRÉATION & ENCAISSEMENTS                */}
      {/* ====================================================================== */}
      {section === "payments" && (
        <div className="space-y-6">
          <form onSubmit={handleCreatePayment} className="bg-white/95 p-5 rounded-2xl border border-amber-400/40 shadow-sm grid sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-[#041E42] mb-1">Élève</label>
              <select
                value={paymentForm.student_id}
                onChange={(e) => setPaymentForm({ ...paymentForm, student_id: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.student_name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#041E42] mb-1">Libellé de la facture / tranche</label>
              <input
                type="text"
                required
                value={paymentForm.title}
                onChange={(e) => setPaymentForm({ ...paymentForm, title: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#041E42] mb-1">Montant (TND)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                required
                value={paymentForm.amount_due}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount_due: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <button className="py-2 px-4 bg-[#041E42] text-amber-400 rounded-xl text-xs font-extrabold cursor-pointer">
              + Émettre Échéance
            </button>
          </form>

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
        </div>
      )}

      {/* ====================================================================== */}
      {/* SECTION 6 : MESSAGERIE & NOTIFICATIONS PARENTS                         */}
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

      {/* ====================================================================== */}
      {/* SECTION 7 : ADMINISTRATION DES 6 PROFILS UTILISATEURS (RBAC)           */}
      {/* ====================================================================== */}
      {section === "users" && (
        <div className="space-y-6">
          {user.role === "admin" && (
            <form onSubmit={handleCreateUser} className="bg-white/95 p-5 rounded-2xl border border-amber-400/40 shadow-sm grid sm:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Nom complet</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Prof. Sami Gharbi"
                  value={userForm.full_name}
                  onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="sami@tunis.aceda.tn"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Mot de passe initial</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#041E42] mb-1">Profil RBAC</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full p-2 border border-slate-200 rounded-xl text-xs"
                >
                  <option value="teacher">Enseignant (teacher)</option>
                  <option value="accountant">Comptable (accountant)</option>
                  <option value="director">Directeur (director)</option>
                  <option value="admin">Administrateur (admin)</option>
                  <option value="parent">Parent (parent)</option>
                  <option value="student">Élève (student)</option>
                </select>
              </div>
              <button className="py-2 px-4 bg-[#041E42] text-amber-400 rounded-xl text-xs font-extrabold cursor-pointer">
                + Créer le Compte
              </button>
            </form>
          )}

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-[#041E42] flex items-center gap-2">
                <UserCog size={18} className="text-amber-500" /> Comptes Utilisateurs ({user.school_name})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {["ALL", "director", "admin", "teacher", "accountant", "parent", "student"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                      roleFilter === r ? "bg-[#041E42] text-amber-400" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {r === "ALL" ? "Tous" : r}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#041E42] text-amber-300 sticky top-0">
                  <tr>
                    <th className="p-3">Nom complet</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Profil RBAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {usersList
                    .filter((u) => roleFilter === "ALL" || u.role === roleFilter)
                    .map((u) => (
                      <tr key={u.id} className="hover:bg-amber-50/40">
                        <td className="p-3 font-bold text-[#041E42]">{u.full_name}</td>
                        <td className="p-3 text-slate-600">{u.email}</td>
                        <td className="p-3">
                          {user.role === "admin" ? (
                            <select
                              value={u.role}
                              onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                              className="p-1.5 border border-slate-300 rounded-lg font-bold text-[#041E42] bg-white"
                            >
                              <option value="director">director</option>
                              <option value="admin">admin</option>
                              <option value="teacher">teacher</option>
                              <option value="accountant">accountant</option>
                              <option value="parent">parent</option>
                              <option value="student">student</option>
                            </select>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                              {u.role}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
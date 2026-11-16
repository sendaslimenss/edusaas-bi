import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line, ScatterChart, Scatter, ZAxis
} from "recharts";
import { AlertTriangle, TrendingUp, Users, DollarSign, ShieldAlert, BookOpen } from "lucide-react";
import api from "../api";

export default function BiDashboards({ activeTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    api.get(`/api/bi/${activeTab}`)
      .then((res) => setData(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [activeTab]);

  if (loading) return <div className="p-8 text-slate-500">Chargement des indicateurs analytiques...</div>;
  if (!data) return <div className="p-8 text-red-500">Impossible de charger les données BI.</div>;

  // 1. DASHBOARD GÉNÉRAL
  if (activeTab === "general") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Élèves Actifs" value={data.kpis.total_students} icon={<Users className="text-indigo-600" />} />
          <KpiCard title="Enseignants" value={data.kpis.total_teachers} icon={<BookOpen className="text-emerald-600" />} />
          <KpiCard title="Classes" value={data.kpis.total_classes} icon={<Users className="text-amber-600" />} />
          <KpiCard title="Taux d'occupation" value={`${data.kpis.global_occupancy_rate}%`} icon={<TrendingUp className="text-blue-600" />} />
        </div>

        {data.alerts.length > 0 && (
          <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm space-y-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={20} /> Alertes de Capacité Détectées
            </h3>
            {data.alerts.map((al, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-sm font-medium ${
                  al.type === "danger" ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                <strong>{al.class_name} :</strong> {al.message}
              </div>
            ))}
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Effectifs actuels vs Capacité d'accueil par classe</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.classes_occupancy}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="current_students" name="Effectif actuel" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="max_capacity" name="Capacité max" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // 2. DASHBOARD FINANCIER
  if (activeTab === "financial") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Frais Attendus" value={`${data.kpis.total_expected.toLocaleString()} TND`} icon={<DollarSign className="text-slate-600" />} />
          <KpiCard title="Total Encaissé" value={`${data.kpis.total_collected.toLocaleString()} TND`} icon={<DollarSign className="text-emerald-600" />} />
          <KpiCard title="Reste à Payer" value={`${data.kpis.total_remaining.toLocaleString()} TND`} icon={<AlertTriangle className="text-red-600" />} />
          <KpiCard title="Taux Recouvrement" value={`${data.kpis.recovery_rate}%`} icon={<TrendingUp className="text-indigo-600" />} />
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-1">Évolution mensuelle des recettes & Prévisions (Régression Linéaire)</h3>
          <p className="text-xs text-slate-500 mb-4">Projection automatique des encaissements sur les 3 prochains mois.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenue_series}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Recettes (TND)" stroke="#059669" strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <h3 className="font-bold text-slate-800 mb-4">Parents en retard de paiement (Top Impayés)</h3>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3">Parent</th>
                <th className="p-3">Élève</th>
                <th className="p-3">Classe</th>
                <th className="p-3">Tranches</th>
                <th className="p-3">Reste dû</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.overdue_parents.map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-3 font-medium">{p.parent_name}<div className="text-xs text-slate-400">{p.parent_email}</div></td>
                  <td className="p-3">{p.student_name}</td>
                  <td className="p-3">{p.class_name}</td>
                  <td className="p-3">{p.unpaid_installments}</td>
                  <td className="p-3 font-bold text-red-600">{p.unpaid_amount} TND</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 3. DASHBOARD PÉDAGOGIQUE
  if (activeTab === "pedagogical") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Moyenne Établissement" value={`${data.kpis.school_average}/20`} icon={<BookOpen className="text-indigo-600" />} />
          <KpiCard title="Taux de Réussite" value={`${data.kpis.pass_rate}%`} icon={<TrendingUp className="text-emerald-600" />} />
          <KpiCard title="Taux d'Échec" value={`${data.kpis.fail_rate}%`} icon={<AlertTriangle className="text-red-600" />} />
          <KpiCard title="Élèves en Difficulté" value={data.kpis.struggling_students_count} icon={<Users className="text-amber-600" />} />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Moyenne Générale par Classe</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_class} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 20]} />
                  <YAxis dataKey="class_name" type="category" width={110} />
                  <Tooltip />
                  <Bar dataKey="average_score" name="Moyenne /20" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Évolution des Résultats par Trimestre</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.by_trimester}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis domain={[0, 20]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="average_score" name="Moyenne globale" stroke="#2563eb" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Classement des Matières selon les Performances</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_subject}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="subject_name" />
                <YAxis domain={[0, 20]} />
                <Tooltip />
                <Bar dataKey="average_score" name="Moyenne matière" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // 4. DASHBOARD ABSENCES & CORRÉLATION
  if (activeTab === "attendance") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Heures Manquées Total" value={`${data.kpis.total_hours}h`} icon={<AlertTriangle className="text-slate-600" />} />
          <KpiCard title="Absences Justifiées" value={`${data.kpis.justified_hours}h`} icon={<Users className="text-emerald-600" />} />
          <KpiCard title="Non Justifiées" value={`${data.kpis.unjustified_hours}h`} icon={<AlertTriangle className="text-red-600" />} />
          <KpiCard title="Corrélation (Pearson r)" value={data.kpis.pearson_correlation} icon={<TrendingUp className="text-indigo-600" />} />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-1">Corrélation Absentéisme vs Moyenne Scolaire</h3>
            <p className="text-xs text-slate-500 mb-4">Chaque point représente un élève (plus les absences augmentent, plus la moyenne chute).</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="absence_hours" name="Heures d'absence" unit="h" />
                  <YAxis type="number" dataKey="avg_grade" name="Moyenne" unit="/20" domain={[0, 20]} />
                  <ZAxis range={[50, 50]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="Élèves" data={data.correlation_scatter} fill="#e11d48" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Évolution Mensuelle des Absences & Retards</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="absences" name="Heures d'absence" fill="#ef4444" />
                  <Bar dataKey="lates" name="Heures de retard" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. DASHBOARD EARLY WARNING SYSTEM
  if (activeTab === "early-warning") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Élèves à Risque Détectés" value={data.kpis.total_at_risk} icon={<ShieldAlert className="text-amber-600" />} />
          <KpiCard title="Risque Critique (Score ≥ 70)" value={data.kpis.critical_risk} icon={<AlertTriangle className="text-red-600" />} />
          <KpiCard title="Risque Élevé (45 - 69)" value={data.kpis.high_risk} icon={<AlertTriangle className="text-orange-500" />} />
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <h3 className="font-bold text-slate-800 mb-1">Système d'Alerte Précoce (Early Warning System)</h3>
          <p className="text-xs text-slate-500 mb-4">
            Scoring multi-critères combinant chute des notes, absences non justifiées et impayés avec recommandations automatiques.
          </p>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="p-3">Score</th>
                <th className="p-3">Élève & Classe</th>
                <th className="p-3">Facteurs Déclencheurs</th>
                <th className="p-3">Action Recommandée (Aide à la Décision)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.students.map((st) => (
                <tr key={st.student_id} className="hover:bg-slate-50">
                  <td className="p-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        st.risk_level === "CRITIQUE" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {st.risk_score}/100 ({st.risk_level})
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{st.student_name}</div>
                    <div className="text-xs text-slate-500">{st.class_name} • Parent: {st.parent_name}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {st.factors.map((f, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-indigo-700 font-medium text-xs">{st.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}

function KpiCard({ title, value, icon }) {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      </div>
      <div className="p-3 bg-slate-50 rounded-xl">{icon}</div>
    </div>
  );
}
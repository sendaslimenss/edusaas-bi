import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line, ScatterChart, Scatter, ZAxis, PieChart, Pie, Cell, AreaChart, Area,
  ComposedChart
} from "recharts";
import {
  AlertTriangle, TrendingUp, Users, DollarSign, ShieldAlert, BookOpen,
  MapPin, UserCheck, Wallet, MessageCircle, BrainCircuit, Sliders, CheckCircle2,
  Sparkles, Filter, RotateCcw, Download
} from "lucide-react";
import api from "../api";

const NAVY = "#041E42";
const NAVY_MID = "#0f3f7d";
const GOLD = "#FFB703";
const EMERALD = "#059669";
const ROSE = "#e11d48";
const PIE_COLORS = ["#041E42", "#FFB703", "#0f3f7d", "#059669", "#e11d48", "#64748b"];

const YEAR_FILTER_TABS = ["financial", "pedagogical", "attendance", "recovery"];
const LEVEL_FILTER_TABS = ["general", "financial", "pedagogical", "attendance", "early-warning"];

export default function BiDashboards({ activeTab }) {
  const [data, setData] = useState(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);

  // Filtres temporels et structurels BI
  const [schoolYear, setSchoolYear] = useState("ALL");
  const [trimester, setTrimester] = useState(0);
  const [levelFilter, setLevelFilter] = useState("ALL");

  // Filtre interactif pour #9 Early Warning System
  const [ewsFilter, setEwsFilter] = useState("ALL");

  // Curseurs interactifs What-If pour #10 Dashboard Stratégique
  const [simStudentsPct, setSimStudentsPct] = useState(8);
  const [simTuitionPct, setSimTuitionPct] = useState(5);
  const [simRecoveryPct, setSimRecoveryPct] = useState(60);
  const [simAbsenteeismDropPct, setSimAbsenteeismDropPct] = useState(25);

  const effectiveYear =
    activeTab === "pedagogical" && schoolYear === "ALL" ? "2025-2026" : schoolYear;

  const queryKey = `${activeTab}|${effectiveYear}|${trimester}|${levelFilter}`;

  useEffect(() => {
    setEwsFilter("ALL");
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = {};
    if (YEAR_FILTER_TABS.includes(activeTab)) {
      params.school_year = effectiveYear;
    }
    if (activeTab === "pedagogical") {
      params.trimester = trimester;
    }
    if (LEVEL_FILTER_TABS.includes(activeTab)) {
      params.level = levelFilter;
    }

    api
      .get(`/api/bi/${activeTab}`, { params })
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setLoadedKey(queryKey);
        }
      })
      .catch((err) => {
        console.error("Erreur BI:", err);
        if (!cancelled) {
          setData(null);
          setLoadedKey(queryKey);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, effectiveYear, trimester, levelFilter, queryKey]);

  const showYearFilter = YEAR_FILTER_TABS.includes(activeTab);
  const showTrimesterFilter = activeTab === "pedagogical";
  const showLevelFilter = LEVEL_FILTER_TABS.includes(activeTab);
  const hasFilters = showYearFilter || showTrimesterFilter || showLevelFilter;

  const handleResetFilters = () => {
    setSchoolYear("ALL");
    setTrimester(0);
    setLevelFilter("ALL");
  };

  const handleExportEwsCsv = (rows) => {
    const header = [
      "Eleve",
      "Classe",
      "Score_Risque",
      "Niveau",
      "Prob_Abandon_IA_Pct",
      "Moyenne_Ponderee",
      "Absences_Non_Justifiees_H",
      "Impayes_TND",
      "Recommandation",
    ];
    const csvLines = [
      header.join(";"),
      ...rows.map((st) =>
        [
          `"${st.student_name}"`,
          `"${st.class_name || ""}"`,
          st.risk_score,
          st.risk_level,
          st.dropout_probability,
          st.avg_grade,
          st.unjustified_hours,
          st.unpaid_balance,
          `"${st.recommendation}"`,
        ].join(";")
      ),
    ];
    const blob = new Blob(["\uFEFF" + csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alerte_precoce_ews_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderFilterBar = () => {
    if (!hasFilters) return null;
    return (
      <div className="bg-white/90 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#041E42] uppercase tracking-wider">
          <Filter size={15} className="text-amber-500" />
          <span>Filtres Analytiques</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {showYearFilter && (
            <select
              value={effectiveYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-[#041E42] outline-none focus:border-amber-400 cursor-pointer"
            >
              {activeTab !== "pedagogical" && (
                <option value="ALL">Toutes les années (2024–2026)</option>
              )}
              <option value="2025-2026">Année 2025-2026 (Actuelle)</option>
              <option value="2024-2025">Année 2024-2025 (N-1)</option>
            </select>
          )}

          {showTrimesterFilter && (
            <select
              value={trimester}
              onChange={(e) => setTrimester(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-[#041E42] outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value={0}>Tous les trimestres</option>
              <option value={1}>Trimestre 1</option>
              <option value={2}>Trimestre 2</option>
              <option value={3}>Trimestre 3</option>
            </select>
          )}

          {showLevelFilter && (
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-[#041E42] outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="ALL">Tous les niveaux</option>
              <option value="1ère Année">1ère Année</option>
              <option value="2ème Année">2ème Année</option>
              <option value="3ème Année">3ème Année</option>
              <option value="Baccalauréat">Baccalauréat</option>
            </select>
          )}

          {(schoolYear !== "ALL" || trimester !== 0 || levelFilter !== "ALL") && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-100 text-amber-900 hover:bg-amber-200 text-xs font-bold transition cursor-pointer"
            >
              <RotateCcw size={13} /> Réinitialiser
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading || loadedKey !== queryKey) {
    return (
      <div className="space-y-4">
        {renderFilterBar()}
        <div className="p-10 rounded-2xl bg-white/80 border border-amber-400/30 flex items-center gap-3 text-[#041E42] font-semibold">
          <div className="w-5 h-5 border-2 border-[#041E42] border-t-amber-400 rounded-full animate-spin" />
          <span>Calcul des indicateurs analytiques & modèles IA en cours...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {renderFilterBar()}
        <div className="p-8 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-medium">
          Impossible de charger les données de ce tableau de bord BI.
        </div>
      </div>
    );
  }

  // ============================================================================
  // #1. VUE GLOBALE & CAPACITÉ D'ACCUEIL
  // ============================================================================
  if (activeTab === "general") {
    return (
      <div className="space-y-6">
        {renderFilterBar()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Élèves Actifs"
            value={data.kpis.total_students}
            subtitle={`Ratio ${data.kpis.student_teacher_ratio} élèves/prof`}
            icon={<Users className="text-[#041E42]" />}
          />
          <KpiCard
            title="Corps Enseignant"
            value={data.kpis.total_teachers}
            subtitle="Actifs sur le campus"
            icon={<BookOpen className="text-amber-600" />}
          />
          <KpiCard
            title="Classes Ouvertes"
            value={data.kpis.total_classes}
            subtitle={`Capacité : ${data.kpis.total_capacity} places`}
            icon={<Users className="text-[#0f3f7d]" />}
          />
          <KpiCard
            title="Taux d'Occupation"
            value={`${data.kpis.global_occupancy_rate}%`}
            subtitle="Seuil optimal : 75% - 95%"
            icon={<TrendingUp className="text-emerald-600" />}
          />
        </div>

        {data.alerts.length > 0 && (
          <div className="bg-white/90 p-5 rounded-2xl border border-amber-400/40 shadow-sm space-y-2.5">
            <h3 className="font-bold text-[#041E42] flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={20} /> Alertes Automatiques de Capacité
            </h3>
            {data.alerts.map((al, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl text-sm font-medium ${
                  al.type === "danger"
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : "bg-amber-50 text-amber-900 border border-amber-300"
                }`}
              >
                <strong>{al.class_name} :</strong> {al.message}
              </div>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">
              Effectifs Actuels vs Capacité Maximale par Classe
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.classes_occupancy}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="current_students"
                    name="Effectif actuel"
                    fill={NAVY}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="max_capacity"
                    name="Capacité max"
                    fill={GOLD}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Répartition par Niveau</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.level_distribution}
                    dataKey="count"
                    nameKey="level"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label
                  >
                    {data.level_distribution.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #2. BI FINANCIER & PRÉVISIONS ML (RIDGE REGRESSION + IC 95%)
  // ============================================================================
  if (activeTab === "financial") {
    const kpis = data?.kpis ?? {};
    const debtors = data?.overdue_parents ?? data?.top_debtors ?? [];

    return (
      <div className="space-y-6">
        {renderFilterBar()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Frais Attendus"
            value={`${(kpis.total_expected ?? 0).toLocaleString()} TND`}
            subtitle={effectiveYear === "ALL" ? "Cumul 2024–2026" : `Année ${effectiveYear}`}
            icon={<DollarSign className="text-[#041E42]" />}
          />
          <KpiCard
            title="Total Encaissé"
            value={`${(kpis.total_collected ?? 0).toLocaleString()} TND`}
            subtitle="Recettes validées"
            icon={<DollarSign className="text-emerald-600" />}
          />
          <KpiCard
            title="Reste à Recouvrer"
            value={`${(kpis.total_remaining ?? 0).toLocaleString()} TND`}
            subtitle="Échéances impayées/partielles"
            icon={<AlertTriangle className="text-rose-600" />}
          />
          <KpiCard
            title="Taux Recouvrement"
            value={`${kpis.recovery_rate ?? 0}%`}
            subtitle={`Ajustement Ridge R² = ${kpis.model_r2 ?? 0}`}
            icon={<TrendingUp className="text-amber-600" />}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-1">
              Évolution Mensuelle des Recettes & Prévisions ML (IC 95%)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Série historique et projection Ridge Regression sur 3 mois avec intervalle de confiance à 95 %.
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.revenue_series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="forecast_high"
                    name="Borne haute IC 95%"
                    stroke="none"
                    fill={GOLD}
                    fillOpacity={0.18}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Recettes Réelles (TND)"
                    stroke={NAVY}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Prévision ML (TND)"
                    stroke={GOLD}
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    dot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Comparaison Inter-Annuelle</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.yearly_comparison}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="school_year" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="expected" name="Attendu" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="collected" name="Encaissé" fill={EMERALD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
          <h3 className="font-bold text-[#041E42] mb-4">
            Top Familles en Retard de Paiement ({debtors.length})
          </h3>
          <table className="w-full text-sm text-left">
            <thead className="bg-[#041E42] text-amber-300 uppercase text-xs">
              <tr>
                <th className="p-3 rounded-tl-xl">Parent</th>
                <th className="p-3">Élève</th>
                <th className="p-3">Classe</th>
                <th className="p-3">Tranches</th>
                <th className="p-3 rounded-tr-xl">Reste dû</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {debtors.map((row, idx) => (
                <tr key={idx} className="hover:bg-amber-50/40">
                  <td className="p-3 font-semibold text-[#041E42]">
                    {row.parent_name}
                    {row.parent_email && (
                      <div className="text-[11px] text-slate-400 font-normal">{row.parent_email}</div>
                    )}
                  </td>
                  <td className="p-3">{row.student_name}</td>
                  <td className="p-3">{row.class_name}</td>
                  <td className="p-3">{row.unpaid_installments ?? row.installments ?? 1}</td>
                  <td className="p-3 font-bold text-rose-600">
                    {(row.unpaid_amount ?? row.remaining ?? 0).toLocaleString()} TND
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
// ============================================================================
  // #3. BI PÉDAGOGIQUE & RÉSULTATS (MOYENNES PONDÉRÉES & DISPERSION)
  // ============================================================================
  if (activeTab === "pedagogical") {
    return (
      <div className="space-y-6">
        {renderFilterBar()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Moyenne Pondérée"
            value={`${data.kpis.school_average}/20`}
            subtitle={`Écart-type σ = ${data.kpis.std_dev ?? 0} pts`}
            icon={<BookOpen className="text-[#041E42]" />}
          />
          <KpiCard
            title="Taux de Réussite"
            value={`${data.kpis.pass_rate}%`}
            subtitle="Moyenne pondérée ≥ 10/20"
            icon={<TrendingUp className="text-emerald-600" />}
          />
          <KpiCard
            title="Taux d'Échec (<10)"
            value={`${data.kpis.fail_rate}%`}
            subtitle="Sous le seuil d'admission"
            icon={<AlertTriangle className="text-rose-600" />}
          />
          <KpiCard
            title="Élèves en Difficulté"
            value={data.kpis.struggling_students_count}
            subtitle="Accompagnement prioritaire"
            icon={<Users className="text-amber-600" />}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Moyenne Pondérée par Classe</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_class} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 20]} />
                  <YAxis dataKey="class_name" type="category" width={115} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="average_score" name="Moyenne pondérée /20" fill={NAVY} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">
              Trajectoire Longitudinale par Trimestre (2024–2026)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.by_trimester}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[8, 16]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="average_score"
                    name="Moyenne pondérée"
                    stroke={GOLD}
                    strokeWidth={3}
                    dot={{ fill: NAVY, r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Performance Moyenne par Matière</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_subject}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="subject_name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 20]} />
                  <Tooltip />
                  <Bar dataKey="average_score" name="Moyenne matière /20" fill={NAVY_MID} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Répartition des Mentions</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.mentions_distribution}
                    dataKey="count"
                    nameKey="mention"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                  >
                    {data.mentions_distribution.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #4. ABSENCES & CORRÉLATION AVEC LES RÉSULTATS
  // ============================================================================
  if (activeTab === "attendance") {
    return (
      <div className="space-y-6">
        {renderFilterBar()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Heures Manquées Total"
            value={`${data.kpis.total_hours}h`}
            icon={<AlertTriangle className="text-[#041E42]" />}
          />
          <KpiCard
            title="Absences Justifiées"
            value={`${data.kpis.justified_hours}h`}
            icon={<Users className="text-emerald-600" />}
          />
          <KpiCard
            title="Non Justifiées"
            value={`${data.kpis.unjustified_hours}h`}
            icon={<AlertTriangle className="text-rose-600" />}
          />
          <KpiCard
            title="Corrélation Pearson (r)"
            value={data.kpis.pearson_correlation}
            subtitle={`R² = ${data.kpis.r_squared ?? 0} • ${data.kpis.impact_per_10h} pts/10h`}
            icon={<TrendingUp className="text-amber-600" />}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-1">
              Corrélation Absentéisme vs Moyenne Pondérée
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Régression linéaire montrant l'impact statistique des heures d'absence sur la moyenne.
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid />
                  <XAxis type="number" dataKey="absence_hours" name="Heures d'absence" unit="h" />
                  <YAxis type="number" dataKey="avg_grade" name="Moyenne" unit="/20" domain={[0, 20]} />
                  <ZAxis range={[45, 45]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter name="Élèves" data={data.correlation_scatter} fill={ROSE} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">
              Évolution Mensuelle des Absences & Retards
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly_trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="absences" name="Heures d'absence" fill={ROSE} />
                  <Bar dataKey="lates" name="Heures de retard" fill={GOLD} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #5. DÉMOGRAPHIE & RÉTENTION DES COHORTES
  // ============================================================================
  if (activeTab === "demographics") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Effectif Actif" value={data.kpis.active_students} icon={<Users className="text-[#041E42]" />} />
          <KpiCard title="Diplômés Bac (N-1)" value={data.kpis.graduated_alumni} icon={<CheckCircle2 className="text-emerald-600" />} />
          <KpiCard title="Abandons Enregistrés" value={data.kpis.dropped_students} icon={<AlertTriangle className="text-rose-600" />} />
          <KpiCard title="Taux de Rétention" value={`${data.kpis.retention_rate}%`} icon={<MapPin className="text-amber-600" />} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">
              Répartition Géographique des Élèves (Bassin de Recrutement)
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_zone}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="students_count" name="Nombre d'élèves" fill={NAVY} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Statut Global des Cohortes</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.status_breakdown}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label
                  >
                    {data.status_breakdown.map((_, idx) => (
                      <Cell key={idx} fill={[NAVY, EMERALD, ROSE][idx % 3]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #6. CORPS ENSEIGNANT & CHARGE HORAIRE
  // ============================================================================
  if (activeTab === "teachers") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Effectif Enseignants" value={data.kpis.total_teachers} icon={<UserCheck className="text-[#041E42]" />} />
          <KpiCard title="Charge Moyenne" value={`${data.kpis.avg_weekly_hours}h/sem`} icon={<BookOpen className="text-amber-600" />} />
          <KpiCard title="En Surcharge (>20h)" value={data.kpis.overloaded_count} icon={<AlertTriangle className="text-rose-600" />} />
          <KpiCard title="En Sous-Charge (<12h)" value={data.kpis.underloaded_count} icon={<Users className="text-[#0f3f7d]" />} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">
              Volume Horaire Hebdomadaire par Enseignant
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.teachers_workload} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" unit="h" />
                  <YAxis dataKey="teacher_name" type="category" width={135} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="total_hours" name="Heures / semaine" fill={NAVY} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
            <h3 className="font-bold text-[#041E42] mb-4">Affectations & Équilibre des Services</h3>
            <table className="w-full text-xs text-left">
              <thead className="bg-[#041E42] text-amber-300 uppercase">
                <tr>
                  <th className="p-2.5 rounded-tl-xl">Enseignant</th>
                  <th className="p-2.5">Matières</th>
                  <th className="p-2.5">Heures</th>
                  <th className="p-2.5 rounded-tr-xl">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.teachers_workload.map((t) => (
                  <tr key={t.teacher_id} className="hover:bg-amber-50/40">
                    <td className="p-2.5 font-semibold text-[#041E42]">{t.teacher_name}</td>
                    <td className="p-2.5 text-slate-600">{t.subjects}</td>
                    <td className="p-2.5 font-bold">{t.total_hours}h</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          t.load_status === "SURCHARGE"
                            ? "bg-rose-100 text-rose-700"
                            : t.load_status === "SOUS-CHARGE"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {t.load_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #7. RECOUVREMENT & ANALYSE DU RISQUE CRÉDIT
  // ============================================================================
  if (activeTab === "recovery") {
    return (
      <div className="space-y-6">
        {renderFilterBar()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Créances Échues (Overdue)"
            value={`${(data.kpis.overdue_balance ?? 0).toLocaleString()} TND`}
            icon={<AlertTriangle className="text-rose-600" />}
          />
          <KpiCard
            title="Reliquats Partiels"
            value={`${(data.kpis.partial_balance ?? 0).toLocaleString()} TND`}
            icon={<Wallet className="text-amber-600" />}
          />
          <KpiCard
            title="Tranches Soldées"
            value={data.kpis.paid_installments}
            icon={<CheckCircle2 className="text-emerald-600" />}
          />
          <KpiCard
            title="Tranches en Souffrance"
            value={data.kpis.unpaid_installments}
            icon={<DollarSign className="text-[#041E42]" />}
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Encaissements vs Reste Dû par Niveau</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_level}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="level" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="collected" name="Encaissé (TND)" fill={EMERALD} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="remaining" name="Reste à payer (TND)" fill={ROSE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">Ventilation des Échéances par Statut</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.status_distribution}
                    dataKey="amount"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label
                  >
                    {data.status_distribution.map((_, idx) => (
                      <Cell key={idx} fill={[EMERALD, GOLD, ROSE][idx % 3]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #8. ENGAGEMENT PARENTS & COMMUNICATION
  // ============================================================================
  if (activeTab === "engagement") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Notifications Envoyées" value={data.kpis.total_messages} icon={<MessageCircle className="text-[#041E42]" />} />
          <KpiCard title="Messages Lus" value={data.kpis.read_messages} icon={<CheckCircle2 className="text-emerald-600" />} />
          <KpiCard title="En Attente de Lecture" value={data.kpis.unread_messages} icon={<AlertTriangle className="text-amber-600" />} />
          <KpiCard title="Taux d'Ouverture Parents" value={`${data.kpis.read_rate}%`} icon={<TrendingUp className="text-[#0f3f7d]" />} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-4">
              Volume & Lecture par Thématique de Notification
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_category}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="sent" name="Envoyés" fill={NAVY} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="read_count" name="Lus par les parents" fill={GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-1">
              Impact de l'Engagement Parental sur la Moyenne
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Comparaison des moyennes pondérées selon le suivi actif des notifications par les parents.
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.engagement_impact}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="segment" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 20]} />
                  <Tooltip />
                  <Bar dataKey="avg_grade" name="Moyenne élève /20" fill={EMERALD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #9. EARLY WARNING SYSTEM (TRIPLE DÉTECTION IA : ÉCHEC, ABANDON, IMPAYÉS)
  // ============================================================================
  if (activeTab === "early-warning") {
    const filteredStudents = data.students.filter((st) => {
      if (ewsFilter === "CRITIQUE") return st.risk_level === "CRITIQUE";
      if (ewsFilter === "IMPAYE") return st.unpaid_balance > 0;
      if (ewsFilter === "ABANDON") return st.dropout_probability >= 55;
      return true;
    });

    return (
      <div className="space-y-6">
        {renderFilterBar()}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Élèves sous Surveillance"
            value={data.kpis.total_at_risk}
            subtitle={data.model_used}
            icon={<ShieldAlert className="text-amber-600" />}
          />
          <KpiCard
            title="Risque Critique (≥68)"
            value={data.kpis.critical_risk}
            subtitle="Action immédiate requise"
            icon={<AlertTriangle className="text-rose-600" />}
          />
          <KpiCard
            title="Risque Abandon IA"
            value={data.kpis.dropout_risk}
            subtitle="Prédiction RandomForest"
            icon={<BrainCircuit className="text-[#041E42]" />}
          />
          <KpiCard
            title="Risque Impayés Associé"
            value={data.kpis.financial_risk}
            subtitle="Dossiers en souffrance"
            icon={<DollarSign className="text-orange-600" />}
          />
        </div>

        <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-[#041E42] mb-3">Répartition des Alertes par Axe de Risque</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.risk_axes} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="axis" type="category" width={175} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Élèves détectés" fill={NAVY} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-[#041E42]">
                Matrice Prédictive Early Warning System (EWS)
              </h3>
              <p className="text-xs text-slate-500">
                Détection croisée : chute académique pondérée, probabilité d'abandon ({data.model_used}) et défaut de paiement.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "ALL", label: `Tous (${data.students.length})` },
                { id: "CRITIQUE", label: "Critiques (≥68)" },
                { id: "ABANDON", label: "Risque Abandon IA" },
                { id: "IMPAYE", label: "Avec Impayés" },
              ].map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setEwsFilter(btn.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    ewsFilter === btn.id
                      ? "bg-[#041E42] text-amber-400 shadow"
                      : "bg-slate-100 text-slate-700 hover:bg-amber-100"
                  }`}
                >
                  {btn.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => handleExportEwsCsv(filteredStudents)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition cursor-pointer"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="bg-[#041E42] text-amber-300 uppercase text-xs">
              <tr>
                <th className="p-3 rounded-tl-xl">Score & IA</th>
                <th className="p-3">Élève & Classe</th>
                <th className="p-3">Axes Détectés</th>
                <th className="p-3">Facteurs Déclencheurs</th>
                <th className="p-3 rounded-tr-xl">Recommandation Automatique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredStudents.map((st) => (
                <tr key={st.student_id} className="hover:bg-amber-50/40">
                  <td className="p-3">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-extrabold ${
                        st.risk_level === "CRITIQUE"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {st.risk_score}/100 ({st.risk_level})
                    </span>
                    <div className="text-[11px] font-semibold text-[#041E42] mt-1">
                      Prob. Abandon IA : {st.dropout_probability}%
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-[#041E42]">{st.student_name}</div>
                    <div className="text-xs text-slate-500">
                      {st.class_name} • Parent : {st.parent_name}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      {st.risk_types.map((rt, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-[#041E42]/10 text-[#041E42] font-bold text-[11px] w-fit"
                        >
                          {rt}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {st.factors.map((f, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-emerald-800 font-semibold text-xs">
                    {st.recommendation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ============================================================================
  // #10. DASHBOARD STRATÉGIQUE – PRÉVISIONS SCIKIT-LEARN & SIMULATEUR WHAT-IF
  // ============================================================================
  if (activeTab === "strategic") {
    const base = data.simulator_baseline;
    const simStudents = Math.round(base.current_students * (1 + simStudentsPct / 100));
    const simTuition = base.avg_tuition_per_student * (1 + simTuitionPct / 100);
    const simRecoveredUnpaid = base.current_unpaid * (simRecoveryPct / 100);
    const simRevenue = Math.round(simStudents * simTuition + simRecoveredUnpaid);
    const revenueDelta = simRevenue - Math.round(base.current_collected);
    const simOccupancy = ((simStudents / Math.max(1, base.total_capacity)) * 100).toFixed(1);
    const simPassRate = Math.min(99.0, base.current_pass_rate + simAbsenteeismDropPct * 0.14).toFixed(1);

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Effectif Projeté 2026-27"
            value={`${data.kpis.projected_students_2026} élèves`}
            subtitle="Régression Linéaire ML"
            icon={<Users className="text-[#041E42]" />}
          />
          <KpiCard
            title="Recettes Projetées 2026-27"
            value={`${(data.kpis.projected_revenue_2026 ?? 0).toLocaleString()} TND`}
            subtitle={`Croissance : +${data.kpis.revenue_growth_rate}%`}
            icon={<DollarSign className="text-emerald-600" />}
          />
          <KpiCard
            title="Taux Réussite Projeté"
            value={`${data.kpis.projected_pass_rate_2026}%`}
            subtitle="Tendance 2024–2027"
            icon={<TrendingUp className="text-amber-600" />}
          />
          <KpiCard
            title="Moteur Prédictif"
            value="scikit-learn"
            subtitle={data.ml_engine}
            icon={<BrainCircuit className="text-[#0f3f7d]" />}
          />
        </div>

        {/* Trajectoire Multi-Annuelle + Importance des Facteurs RandomForest */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-1">
              Trajectoire Financière Multi-Annuelle (2024–2027)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Projection prédictive calculée via LinearRegression sur l'historique Neon.
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.multi_year_trajectory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Chiffre d'affaires (TND)"
                    stroke={NAVY}
                    fill={GOLD}
                    fillOpacity={0.35}
                    strokeWidth={3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h3 className="font-bold text-[#041E42] mb-1">
              Poids des Facteurs Prédictifs (RandomForest Feature Importance)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Variables ayant le plus fort impact sur le décrochage et la réussite.
            </p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.feature_importances} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" unit="%" domain={[0, 60]} />
                  <YAxis dataKey="feature" type="category" width={155} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="importance"
                    name="Importance IA (%)"
                    fill={NAVY_MID}
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* SIMULATEUR INTERACTIF WHAT-IF (RENTRÉE 2026-2027) */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-[#041E42] via-[#082d5e] to-[#020c1b] text-white border border-amber-400/40 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold mb-1">
                <Sliders size={13} /> Simulateur Stratégique Interactif (What-If)
              </span>
              <h3 className="text-lg font-extrabold text-white">
                Modélisation Budgétaire & Capacitaire — Rentrée 2026-2027
              </h3>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/10">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Variation des effectifs inscrits</span>
                  <span className="text-amber-300 font-bold">
                    {simStudentsPct >= 0 ? `+${simStudentsPct}%` : `${simStudentsPct}%`} ({simStudents} élèves)
                  </span>
                </div>
                <input
                  type="range"
                  min="-15"
                  max="25"
                  value={simStudentsPct}
                  onChange={(e) => setSimStudentsPct(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Révision annuelle des frais de scolarité</span>
                  <span className="text-amber-300 font-bold">+{simTuitionPct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={simTuitionPct}
                  onChange={(e) => setSimTuitionPct(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Taux de recouvrement des impayés existants</span>
                  <span className="text-amber-300 font-bold">
                    {simRecoveryPct}% (+{(Math.round(simRecoveredUnpaid) ?? 0).toLocaleString()} TND)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={simRecoveryPct}
                  onChange={(e) => setSimRecoveryPct(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Réduction de l'absentéisme (plan tutorat & alertes SMS)</span>
                  <span className="text-amber-300 font-bold">-{simAbsenteeismDropPct}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={simAbsenteeismDropPct}
                  onChange={(e) => setSimAbsenteeismDropPct(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-white/10 border border-amber-400/30">
                <div className="text-xs text-slate-300">Chiffre d'Affaires Simulé</div>
                <div className="text-2xl font-extrabold text-amber-400 mt-1">
                  {(simRevenue ?? 0).toLocaleString()} TND
                </div>
                <div
                  className={`text-xs font-semibold mt-1 ${
                    revenueDelta >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {revenueDelta >= 0
                    ? `+${(revenueDelta ?? 0).toLocaleString()}`
                    : (revenueDelta ?? 0).toLocaleString()}{" "}
                  TND vs actuel
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/10 border border-white/15">
                <div className="text-xs text-slate-300">Taux d'Occupation Salles</div>
                <div className="text-2xl font-extrabold text-white mt-1">{simOccupancy}%</div>
                <div
                  className={`text-xs font-semibold mt-1 ${
                    Number(simOccupancy) > 100 ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {Number(simOccupancy) > 100
                    ? "Ouvrir +1 salle requise"
                    : "Capacité d'accueil suffisante"}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/10 border border-white/15">
                <div className="text-xs text-slate-300">Taux de Réussite Estimé</div>
                <div className="text-2xl font-extrabold text-emerald-300 mt-1">{simPassRate}%</div>
                <div className="text-xs text-slate-300 mt-1">
                  Base actuelle : {base.current_pass_rate}%
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/10 border border-white/15">
                <div className="text-xs text-slate-300">Effectif Cible Rentrée</div>
                <div className="text-2xl font-extrabold text-white mt-1">{simStudents} élèves</div>
                <div className="text-xs text-slate-300 mt-1">
                  Capacité : {base.total_capacity} places
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RECOMMANDATIONS STRATÉGIQUES AUTOMATIQUES */}
        <div className="bg-white/90 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <h3 className="font-bold text-[#041E42] flex items-center gap-2 mb-4">
            <Sparkles className="text-amber-500" size={20} /> Plan d'Action & Recommandations Automatiques (Aide à la Décision)
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {data.recommendations.map((rec, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:border-amber-400 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#0f3f7d]">
                    {rec.domain}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      rec.priority === "HAUTE"
                        ? "bg-rose-100 text-rose-700"
                        : rec.priority === "STRATÉGIQUE"
                        ? "bg-[#041E42] text-amber-400"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    Priorité {rec.priority}
                  </span>
                </div>
                <div className="font-bold text-sm text-[#041E42] mb-1">{rec.title}</div>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">{rec.detail}</p>
                <div className="text-xs font-bold text-emerald-700">
                  Impact estimé : {rec.impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function KpiCard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-white/90 backdrop-blur-md p-5 rounded-2xl border border-slate-200/80 hover:border-amber-400/60 shadow-sm transition flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">
          {title}
        </p>
        <p className="text-2xl font-extrabold text-[#041E42] mt-1">{value}</p>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="p-3 bg-amber-400/15 border border-amber-400/30 rounded-2xl shrink-0">
        {icon}
      </div>
    </div>
  );
}
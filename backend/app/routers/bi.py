import math
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import require_roles

router = APIRouter(prefix="/api/bi", tags=["Business Intelligence"])

BI_ROLES = ["director", "admin", "accountant"]


# 1. DASHBOARD GÉNÉRAL – VUE GLOBALE & ALERTES DE CAPACITÉ
@router.get("/general")
def get_general_dashboard(
    current_user: dict = Depends(require_roles(["director", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]

    counts = db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM students WHERE school_id = :sid AND status = 'active') AS total_students,
                (SELECT COUNT(*) FROM users WHERE school_id = :sid AND role = 'teacher') AS total_teachers,
                (SELECT COUNT(*) FROM classes WHERE school_id = :sid) AS total_classes,
                (SELECT COALESCE(SUM(max_capacity), 0) FROM classes WHERE school_id = :sid) AS total_capacity
        """),
        {"sid": sid}
    ).mappings().first()

    classes_rows = db.execute(
        text("""
            SELECT c.id, c.name, c.level, c.room_name, c.max_capacity,
                   COUNT(s.id) AS current_students
            FROM classes c
            LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
            WHERE c.school_id = :sid
            GROUP BY c.id
            ORDER BY c.level, c.name
        """),
        {"sid": sid}
    ).mappings().all()

    classes_analysis = []
    alerts = []
    for c in classes_rows:
        occ_rate = round((c["current_students"] / c["max_capacity"]) * 100, 1) if c["max_capacity"] > 0 else 0
        status_label = "OPTIMAL"
        if occ_rate > 100:
            status_label = "OVERLOADED"
            alerts.append({
                "type": "danger",
                "class_name": c["name"],
                "message": f"Surcharge critique ({c['current_students']}/{c['max_capacity']} élèves, {occ_rate}%) dans {c['room_name']}."
            })
        elif occ_rate < 50:
            status_label = "UNDERUTILIZED"
            alerts.append({
                "type": "warning",
                "class_name": c["name"],
                "message": f"Classe sous-remplie ({c['current_students']}/{c['max_capacity']} élèves, {occ_rate}%). Regroupement envisageable."
            })

        classes_analysis.append({
            "id": c["id"],
            "name": c["name"],
            "level": c["level"],
            "room_name": c["room_name"],
            "current_students": c["current_students"],
            "max_capacity": c["max_capacity"],
            "occupancy_rate": occ_rate,
            "status": status_label
        })

    level_dist = db.execute(
        text("""
            SELECT c.level, COUNT(s.id) AS count
            FROM classes c
            LEFT JOIN students s ON s.class_id = c.id AND s.status = 'active'
            WHERE c.school_id = :sid
            GROUP BY c.level
            ORDER BY count DESC
        """),
        {"sid": sid}
    ).mappings().all()

    global_occ = round((counts["total_students"] / counts["total_capacity"]) * 100, 1) if counts["total_capacity"] > 0 else 0

    return {
        "kpis": {
            "total_students": counts["total_students"],
            "total_teachers": counts["total_teachers"],
            "total_classes": counts["total_classes"],
            "total_capacity": counts["total_capacity"],
            "global_occupancy_rate": global_occ
        },
        "classes_occupancy": classes_analysis,
        "level_distribution": [dict(r) for r in level_dist],
        "alerts": alerts
    }


# 2. DASHBOARD FINANCIER – RECOUVREMENT & PRÉVISION PAR RÉGRESSION LINÉAIRE
@router.get("/financial")
def get_financial_dashboard(
    current_user: dict = Depends(require_roles(BI_ROLES)),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]

    totals = db.execute(
        text("""
            SELECT
                COALESCE(SUM(amount_due), 0) AS total_expected,
                COALESCE(SUM(amount_paid), 0) AS total_collected,
                COALESCE(SUM(amount_due - amount_paid), 0) AS total_remaining
            FROM payments
            WHERE school_id = :sid
        """),
        {"sid": sid}
    ).mappings().first()

    expected = float(totals["total_expected"])
    collected = float(totals["total_collected"])
    remaining = float(totals["total_remaining"])
    recovery_rate = round((collected / expected) * 100, 1) if expected > 0 else 0

    monthly_rows = db.execute(
        text("""
            SELECT TO_CHAR(COALESCE(paid_date, due_date), 'YYYY-MM') AS month,
                   SUM(amount_paid) AS revenue
            FROM payments
            WHERE school_id = :sid AND amount_paid > 0
            GROUP BY month
            ORDER BY month ASC
        """),
        {"sid": sid}
    ).mappings().all()

    history = [{"month": r["month"], "revenue": float(r["revenue"]), "type": "Réel"} for r in monthly_rows]

    # Prévision des 3 prochains mois par régression linéaire ordinaire (OLS)
    forecast = []
    n = len(history)
    if n >= 2:
        x_vals = list(range(n))
        y_vals = [h["revenue"] for h in history]
        x_mean = sum(x_vals) / n
        y_mean = sum(y_vals) / n
        num = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
        den = sum((x - x_mean) ** 2 for x in x_vals)
        slope = num / den if den != 0 else 0
        intercept = y_mean - slope * x_mean

        future_labels = ["Mois +1 (Prév.)", "Mois +2 (Prév.)", "Mois +3 (Prév.)"]
        for i, label in enumerate(future_labels):
            pred = max(0, round(intercept + slope * (n + i), 2))
            forecast.append({"month": label, "revenue": pred, "type": "Prévision"})

    overdue_parents = db.execute(
        text("""
            SELECT u_parent.full_name AS parent_name,
                   u_parent.email AS parent_email,
                   u_student.full_name AS student_name,
                   c.name AS class_name,
                   SUM(p.amount_due - p.amount_paid) AS unpaid_amount,
                   COUNT(p.id) AS unpaid_installments
            FROM payments p
            JOIN students st ON p.student_id = st.id
            JOIN users u_student ON st.user_id = u_student.id
            JOIN users u_parent ON st.parent_id = u_parent.id
            LEFT JOIN classes c ON st.class_id = c.id
            WHERE p.school_id = :sid AND p.status IN ('overdue', 'partial')
            GROUP BY u_parent.id, u_student.id, c.name
            ORDER BY unpaid_amount DESC
            LIMIT 25
        """),
        {"sid": sid}
    ).mappings().all()

    return {
        "kpis": {
            "total_expected": expected,
            "total_collected": collected,
            "total_remaining": remaining,
            "recovery_rate": recovery_rate
        },
        "revenue_series": history + forecast,
        "overdue_parents": [
            {**dict(r), "unpaid_amount": float(r["unpaid_amount"])} for r in overdue_parents
        ]
    }


# 3. DASHBOARD PÉDAGOGIQUE – PERFORMANCES & ÉVOLUTION TRIMESTRIELLE
@router.get("/pedagogical")
def get_pedagogical_dashboard(
    current_user: dict = Depends(require_roles(["director", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]

    by_class = db.execute(
        text("""
            SELECT c.name AS class_name, c.level,
                   ROUND(AVG(g.score)::numeric, 2) AS average_score
            FROM grades g
            JOIN students st ON g.student_id = st.id
            JOIN classes c ON st.class_id = c.id
            WHERE g.school_id = :sid
            GROUP BY c.id
            ORDER BY average_score DESC
        """),
        {"sid": sid}
    ).mappings().all()

    by_subject = db.execute(
        text("""
            SELECT sub.name AS subject_name, sub.coefficient,
                   ROUND(AVG(g.score)::numeric, 2) AS average_score
            FROM grades g
            JOIN subjects sub ON g.subject_id = sub.id
            WHERE g.school_id = :sid
            GROUP BY sub.id
            ORDER BY average_score DESC
        """),
        {"sid": sid}
    ).mappings().all()

    by_trimester = db.execute(
        text("""
            SELECT CONCAT('Trimestre ', trimester) AS label,
                   trimester,
                   ROUND(AVG(score)::numeric, 2) AS average_score
            FROM grades
            WHERE school_id = :sid
            GROUP BY trimester
            ORDER BY trimester ASC
        """),
        {"sid": sid}
    ).mappings().all()

    student_avgs = db.execute(
        text("""
            SELECT student_id, AVG(score) AS avg_score
            FROM grades
            WHERE school_id = :sid
            GROUP BY student_id
        """),
        {"sid": sid}
    ).mappings().all()

    total_evaluated = len(student_avgs)
    passed = sum(1 for s in student_avgs if float(s["avg_score"]) >= 10.0)
    pass_rate = round((passed / total_evaluated) * 100, 1) if total_evaluated > 0 else 0
    school_avg = round(sum(float(s["avg_score"]) for s in student_avgs) / total_evaluated, 2) if total_evaluated > 0 else 0

    return {
        "kpis": {
            "school_average": school_avg,
            "pass_rate": pass_rate,
            "fail_rate": round(100 - pass_rate, 1),
            "struggling_students_count": total_evaluated - passed
        },
        "by_class": [{**dict(r), "average_score": float(r["average_score"])} for r in by_class],
        "by_subject": [{**dict(r), "average_score": float(r["average_score"]), "coefficient": float(r["coefficient"])} for r in by_subject],
        "by_trimester": [{**dict(r), "average_score": float(r["average_score"])} for r in by_trimester]
    }


# 4. DASHBOARD ABSENCES & CORRÉLATION AVEC LES RÉSULTATS SCOLAIRES
@router.get("/attendance")
def get_attendance_dashboard(
    current_user: dict = Depends(require_roles(["director", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]

    summary = db.execute(
        text("""
            SELECT
                COALESCE(SUM(hours_missed), 0) AS total_hours,
                COALESCE(SUM(CASE WHEN justified = TRUE THEN hours_missed ELSE 0 END), 0) AS justified_hours,
                COALESCE(SUM(CASE WHEN justified = FALSE THEN hours_missed ELSE 0 END), 0) AS unjustified_hours
            FROM attendance
            WHERE school_id = :sid
        """),
        {"sid": sid}
    ).mappings().first()

    monthly = db.execute(
        text("""
            SELECT TO_CHAR(date, 'YYYY-MM') AS month,
                   SUM(CASE WHEN type = 'absence' THEN hours_missed ELSE 0 END) AS absences,
                   SUM(CASE WHEN type = 'late' THEN hours_missed ELSE 0 END) AS lates
            FROM attendance
            WHERE school_id = :sid
            GROUP BY month
            ORDER BY month ASC
        """),
        {"sid": sid}
    ).mappings().all()

    scatter_rows = db.execute(
        text("""
            SELECT u.full_name AS student_name,
                   c.name AS class_name,
                   COALESCE(att.total_hours, 0) AS absence_hours,
                   ROUND(COALESCE(gr.avg_grade, 0)::numeric, 2) AS avg_grade
            FROM students st
            JOIN users u ON st.user_id = u.id
            LEFT JOIN classes c ON st.class_id = c.id
            LEFT JOIN (
                SELECT student_id, SUM(hours_missed) AS total_hours
                FROM attendance WHERE school_id = :sid GROUP BY student_id
            ) att ON att.student_id = st.id
            LEFT JOIN (
                SELECT student_id, AVG(score) AS avg_grade
                FROM grades WHERE school_id = :sid GROUP BY student_id
            ) gr ON gr.student_id = st.id
            WHERE st.school_id = :sid AND st.status = 'active'
        """),
        {"sid": sid}
    ).mappings().all()

    scatter_data = [
        {
            "student_name": r["student_name"],
            "class_name": r["class_name"],
            "absence_hours": float(r["absence_hours"]),
            "avg_grade": float(r["avg_grade"])
        }
        for r in scatter_rows
    ]

    # Calcul du coefficient de corrélation de Pearson (r) entre absences et moyenne
    n = len(scatter_data)
    correlation_r = 0.0
    if n > 2:
        xs = [d["absence_hours"] for d in scatter_data]
        ys = [d["avg_grade"] for d in scatter_data]
        mx, my = sum(xs) / n, sum(ys) / n
        num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
        den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
        correlation_r = round(num / den, 2) if den != 0 else 0.0

    return {
        "kpis": {
            "total_hours": float(summary["total_hours"]),
            "justified_hours": float(summary["justified_hours"]),
            "unjustified_hours": float(summary["unjustified_hours"]),
            "pearson_correlation": correlation_r
        },
        "monthly_trend": [
            {"month": r["month"], "absences": float(r["absences"]), "lates": float(r["lates"])}
            for r in monthly
        ],
        "correlation_scatter": scatter_data
    }


# 5. DASHBOARD EARLY WARNING SYSTEM – DÉTECTION DES RISQUES & RECOMMANDATIONS
@router.get("/early-warning")
def get_early_warning_dashboard(
    current_user: dict = Depends(require_roles(["director", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]

    rows = db.execute(
        text("""
            SELECT st.id AS student_id,
                   u.full_name AS student_name,
                   up.full_name AS parent_name,
                   up.email AS parent_email,
                   c.name AS class_name,
                   COALESCE(g1.avg_t1, 10) AS avg_t1,
                   COALESCE(g3.avg_t3, 10) AS avg_t3,
                   COALESCE(gall.avg_all, 10) AS avg_all,
                   COALESCE(att.unjust_hours, 0) AS unjust_hours,
                   COALESCE(pay.unpaid, 0) AS unpaid_balance
            FROM students st
            JOIN users u ON st.user_id = u.id
            LEFT JOIN users up ON st.parent_id = up.id
            LEFT JOIN classes c ON st.class_id = c.id
            LEFT JOIN (
                SELECT student_id, AVG(score) AS avg_t1 FROM grades WHERE school_id = :sid AND trimester = 1 GROUP BY student_id
            ) g1 ON g1.student_id = st.id
            LEFT JOIN (
                SELECT student_id, AVG(score) AS avg_t3 FROM grades WHERE school_id = :sid AND trimester = 3 GROUP BY student_id
            ) g3 ON g3.student_id = st.id
            LEFT JOIN (
                SELECT student_id, AVG(score) AS avg_all FROM grades WHERE school_id = :sid GROUP BY student_id
            ) gall ON gall.student_id = st.id
            LEFT JOIN (
                SELECT student_id, SUM(hours_missed) AS unjust_hours
                FROM attendance WHERE school_id = :sid AND justified = FALSE GROUP BY student_id
            ) att ON att.student_id = st.id
            LEFT JOIN (
                SELECT student_id, SUM(amount_due - amount_paid) AS unpaid
                FROM payments WHERE school_id = :sid AND status IN ('overdue', 'partial') GROUP BY student_id
            ) pay ON pay.student_id = st.id
            WHERE st.school_id = :sid AND st.status = 'active'
        """),
        {"sid": sid}
    ).mappings().all()

    at_risk_students = []
    critical_count = 0
    high_count = 0

    for r in rows:
        avg_all = float(r["avg_all"])
        grade_drop = float(r["avg_t1"]) - float(r["avg_t3"])
        unjust_hours = float(r["unjust_hours"])
        unpaid = float(r["unpaid_balance"])

        # Algorithme de Scoring Composite (0 à 100)
        score = 0
        factors = []
        recommendations = []

        if avg_all < 10.0:
            score += min(40, int((10.0 - avg_all) * 10))
            factors.append(f"Moyenne faible ({avg_all:.2f}/20)")
            recommendations.append("Inscrire en séances de soutien scolaire")

        if grade_drop >= 1.5:
            score += 15
            factors.append(f"Chute de -{grade_drop:.1f} pts au T3")

        if unjust_hours >= 6:
            score += min(30, int(unjust_hours * 1.5))
            factors.append(f"{unjust_hours:.0f}h d'absences non justifiées")
            recommendations.append("Convoquer les parents pour suivi d'assiduité")

        if unpaid > 0:
            score += 15
            factors.append(f"Impayé de {unpaid:.0f} TND")
            recommendations.append("Proposer un échéancier avec le service comptable")

        score = min(100, score)

        if score >= 45:
            level = "CRITIQUE" if score >= 70 else "ÉLEVÉ"
            if level == "CRITIQUE":
                critical_count += 1
            else:
                high_count += 1

            at_risk_students.append({
                "student_id": r["student_id"],
                "student_name": r["student_name"],
                "class_name": r["class_name"],
                "parent_name": r["parent_name"],
                "parent_email": r["parent_email"],
                "risk_score": score,
                "risk_level": level,
                "avg_grade": round(avg_all, 2),
                "unjustified_hours": unjust_hours,
                "unpaid_balance": unpaid,
                "factors": factors,
                "recommendation": " + ".join(recommendations) if recommendations else "Entretien préventif"
            })

    at_risk_students.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "kpis": {
            "total_at_risk": len(at_risk_students),
            "critical_risk": critical_count,
            "high_risk": high_count
        },
        "students": at_risk_students[:30]
    }
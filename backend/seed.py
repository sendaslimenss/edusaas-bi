import random
from datetime import date, timedelta
from faker import Faker
from passlib.context import CryptContext
from sqlalchemy import text
from app.database import engine

fake = Faker("fr_FR")
Faker.seed(2026)
random.seed(2026)

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
DEMO_PASSWORD_HASH = pwd_context.hash("Aceda2026!")


def build_school_calendar(start_dt: date, end_dt: date, winter_break: tuple, spring_break: tuple):
    """Génère les jours ouvrés scolaires réels (Lundi-Samedi hors vacances)."""
    days = []
    cur = start_dt
    while cur <= end_dt:
        if cur.weekday() < 6:  # Lundi à Samedi
            in_winter = winter_break[0] <= cur <= winter_break[1]
            in_spring = spring_break[0] <= cur <= spring_break[1]
            if not in_winter and not in_spring:
                days.append(cur)
        cur += timedelta(days=1)
    return days


CALENDAR_2024_2025 = build_school_calendar(
    date(2024, 9, 16),
    date(2025, 5, 28),
    (date(2024, 12, 21), date(2025, 1, 5)),
    (date(2025, 3, 15), date(2025, 3, 30)),
)

CALENDAR_2025_2026 = build_school_calendar(
    date(2025, 9, 15),
    date(2026, 5, 28),
    (date(2025, 12, 20), date(2026, 1, 4)),
    (date(2026, 3, 14), date(2026, 3, 29)),
)

CAMPUS_CONFIGS = {
    "Tunis": {
        "demo_staff": {
            "admin": ("Admin ACEDA Tunis", "admin@tunis.aceda.tn"),
            "director": ("Dr. Karim Ben Salah", "directeur@tunis.aceda.tn"),
            "teacher": ("Prof. Nadia Mansouri", "prof@tunis.aceda.tn"),
            "accountant": ("Sonia Trabelsi", "comptable@tunis.aceda.tn"),
            "parent": ("Mehdi Ben Ali", "parent@tunis.aceda.tn"),
            "student": ("Yasmine Ben Ali", "eleve@tunis.aceda.tn"),
        },
        "sibling_name": "Adam Ben Ali",
        "neighborhoods": [
            "Tunis Centre", "La Marsa", "Ariana", "El Menzah",
            "Le Bardo", "Carthage", "Ben Arous", "Les Berges du Lac"
        ],
    },
    "Nabeul": {
        "demo_staff": {
            "admin": ("Admin ACEDA Nabeul", "admin@nabeul.aceda.tn"),
            "director": ("Dr. Hichem Gharbi", "directeur@nabeul.aceda.tn"),
            "teacher": ("Prof. Leila Khelifi", "prof@nabeul.aceda.tn"),
            "accountant": ("Walid Hammami", "comptable@nabeul.aceda.tn"),
            "parent": ("Samira Bouazizi", "parent@nabeul.aceda.tn"),
            "student": ("Rayen Bouazizi", "eleve@nabeul.aceda.tn"),
        },
        "sibling_name": "Lina Bouazizi",
        "neighborhoods": [
            "Nabeul Ville", "Hammamet", "Dar Chaabane", "Béni Khiar",
            "Korba", "Menzel Temime", "Grombalia", "Kélibia"
        ],
    },
}

LEVEL_TUITION_2025 = {
    "1ère Année": 820.00,
    "2ème Année": 870.00,
    "3ème Année": 920.00,
    "Baccalauréat": 980.00,
}

import os
import sys

def reset_database(conn):
    if os.getenv("CONFIRM_RESET") != "YES" or "--force-reset" not in sys.argv:
        raise RuntimeError(
            "Sécurité Data Warehouse : reset_database() est bloqué. "
            "Exécutez avec CONFIRM_RESET=YES et --force-reset uniquement en développement local."
        )
    conn.execute(text("TRUNCATE TABLE schools RESTART IDENTITY CASCADE;"))
def _generate_year_records(
    school_id: int,
    student_id: int,
    school_year: str,
    level: str,
    archetype: str,
    base_ability: float,
    subject_meta: list,
    is_demo_student: bool = False,
):
    """Génère les notes (3 trimestres), absences/retards et paiements pour une année scolaire."""
    grades = []
    attendance = []
    payments = []

    is_prev_year = school_year == "2024-2025"
    calendar = CALENDAR_2024_2025 if is_prev_year else CALENDAR_2025_2026
    trim_dates = (
        [date(2024, 11, 22), date(2025, 2, 26), date(2025, 5, 16)]
        if is_prev_year
        else [date(2025, 11, 21), date(2026, 2, 25), date(2026, 5, 15)]
    )

    # 1. Notes par trimestre et matière (trajectoire longitudinale)
    for trimester in [1, 2, 3]:
        if is_demo_student:
            yearly_boost = 0.6 if not is_prev_year else 0.0
            trend = yearly_boost + 0.35 * (trimester - 1)
        elif archetype == "silent_drop":
            trend = 0.2 if is_prev_year else (-1.6 * (trimester - 1))
        elif archetype == "dropout_risk":
            trend = -0.8 if is_prev_year else (-1.4 * (trimester - 1))
        elif archetype == "financial_stress":
            trend = -0.3 if is_prev_year else (-0.7 * (trimester - 1))
        elif archetype == "excellence":
            trend = 0.25 * (trimester - 1) + (0.3 if not is_prev_year else 0.0)
        else:
            trend = random.uniform(-0.35, 0.45)

        rec_date = trim_dates[trimester - 1]
        for sub in subject_meta:
            raw_score = base_ability + sub["bias"] + trend + random.uniform(-1.8, 1.8)
            score = round(min(20.0, max(2.5, raw_score)), 2)
            grades.append({
                "sid": school_id,
                "stid": student_id,
                "subid": sub["id"],
                "trim": trimester,
                "score": score,
                "rdate": rec_date,
            })

    # 2. Absences & Retards (corrélation forte avec la réussite scolaire)
    if is_demo_student:
        event_count = 2 if is_prev_year else 3
    elif archetype == "excellence":
        event_count = random.randint(0, 2)
    elif archetype == "regular":
        event_count = random.randint(1, 4)
    elif archetype == "silent_drop":
        event_count = random.randint(3, 6) if not is_prev_year else random.randint(1, 3)
    elif archetype == "financial_stress":
        event_count = random.randint(4, 8)
    else:  # dropout_risk
        event_count = random.randint(7, 14) if not is_prev_year else random.randint(4, 8)

    sampled_days = random.sample(calendar, k=min(event_count, len(calendar)))
    for att_date in sorted(sampled_days):
        if is_demo_student:
            atype = "late" if att_date == sampled_days[0] else "absence"
            hours = 1.0 if atype == "late" else 2.0
            justified = True if att_date != sampled_days[-1] else False
        elif archetype in ("dropout_risk", "silent_drop"):
            atype = random.choices(["absence", "late"], weights=[0.8, 0.2])[0]
            hours = random.choice([2.0, 3.0, 4.0]) if atype == "absence" else random.choice([0.5, 1.0])
            justified = False if random.random() < 0.82 else True
        else:
            atype = random.choices(["absence", "late"], weights=[0.65, 0.35])[0]
            hours = random.choice([1.0, 2.0]) if atype == "absence" else 0.5
            justified = True if random.random() < 0.72 else False

        attendance.append({
            "sid": school_id,
            "stid": student_id,
            "adate": att_date,
            "atype": atype,
            "hours": hours,
            "just": justified,
        })

    # 3. Frais de scolarité (Inscription + 3 tranches trimestrielles)
    base_fee = LEVEL_TUITION_2025.get(level, 880.00)
    if is_prev_year:
        base_fee = round(base_fee * 0.94, 2)  # Tarif N-1 (-6% avant révision annuelle)
        schedule = [
            ("Frais Inscription & Assurance (2024-2025)", round(base_fee * 0.35, 2), date(2024, 9, 15)),
            ("Scolarité 2024-2025 - Trimestre 1", base_fee, date(2024, 10, 10)),
            ("Scolarité 2024-2025 - Trimestre 2", base_fee, date(2025, 1, 15)),
            ("Scolarité 2024-2025 - Trimestre 3", base_fee, date(2025, 4, 15)),
        ]
    else:
        schedule = [
            ("Frais Inscription & Labo Data (2025-2026)", round(base_fee * 0.35, 2), date(2025, 9, 15)),
            ("Scolarité 2025-2026 - Trimestre 1", base_fee, date(2025, 10, 10)),
            ("Scolarité 2025-2026 - Trimestre 2", base_fee, date(2026, 1, 15)),
            ("Scolarité 2025-2026 - Trimestre 3", base_fee, date(2026, 4, 15)),
        ]

    for idx, (title, due_amount, due_dt) in enumerate(schedule):
        if is_demo_student:
            if is_prev_year or idx < 3:
                p_status = "paid"
                paid_amount = due_amount
                paid_dt = due_dt - timedelta(days=random.randint(1, 8))
            else:
                p_status = "partial"
                paid_amount = round(due_amount * 0.5, 2)
                paid_dt = due_dt + timedelta(days=3)
        elif is_prev_year:
            if archetype == "financial_stress" and idx == 3 and random.random() < 0.35:
                p_status = "partial"
                paid_amount = round(due_amount * 0.5, 2)
                paid_dt = due_dt + timedelta(days=12)
            else:
                p_status = "paid"
                paid_amount = due_amount
                paid_dt = due_dt - timedelta(days=random.randint(0, 10))
        else:
            if archetype == "financial_stress" and idx >= 1:
                p_status = random.choice(["overdue", "partial"])
                paid_amount = round(due_amount * 0.35, 2) if p_status == "partial" else 0.00
                paid_dt = due_dt + timedelta(days=7) if p_status == "partial" else None
            elif archetype == "dropout_risk" and idx >= 2:
                p_status = "overdue"
                paid_amount = 0.00
                paid_dt = None
            elif archetype == "regular" and idx == 3 and random.random() < 0.14:
                p_status = "partial"
                paid_amount = round(due_amount * 0.5, 2)
                paid_dt = due_dt + timedelta(days=4)
            else:
                p_status = "paid"
                paid_amount = due_amount
                paid_dt = due_dt - timedelta(days=random.randint(0, 9))

        payments.append({
            "sid": school_id,
            "stid": student_id,
            "title": title,
            "due": due_amount,
            "paid": paid_amount,
            "ddate": due_dt,
            "pdate": paid_dt,
            "status": p_status,
        })

    return grades, attendance, payments


def seed_school(conn, school_name: str, city: str, total_capacity: int):
    cfg = CAMPUS_CONFIGS[city]
    res = conn.execute(
        text("INSERT INTO schools (name, city, total_capacity) VALUES (:name, :city, :cap) RETURNING id"),
        {"name": school_name, "city": city, "cap": total_capacity},
    )
    school_id = res.scalar()

    # 1. Création des 6 comptes de démonstration RBAC pour cet établissement
    demo_ids = {}
    for role, (full_name, email) in cfg["demo_staff"].items():
        r = conn.execute(
            text("""
                INSERT INTO users (school_id, full_name, email, password_hash, role)
                VALUES (:sid, :name, :email, :pwd, :role)
                RETURNING id
            """),
            {"sid": school_id, "name": full_name, "email": email, "pwd": DEMO_PASSWORD_HASH, "role": role},
        )
        demo_ids[role] = r.scalar()

    # 2. Référentiel des matières avec coefficients et indice de difficulté
    subjects_data = [
        ("Mathématiques", 4.0, -0.7),
        ("Physique-Chimie", 3.0, -0.4),
        ("Informatique & Big Data", 3.0, +0.6),
        ("Sciences de la Vie et de la Terre", 2.0, +0.2),
        ("Français", 2.0, -0.1),
        ("Anglais", 2.0, +0.4),
        ("Histoire-Géographie", 1.5, +0.1),
    ]
    subject_meta = []
    for name, coeff, bias in subjects_data:
        r = conn.execute(
            text("INSERT INTO subjects (school_id, name, coefficient) VALUES (:sid, :name, :coeff) RETURNING id"),
            {"sid": school_id, "name": name, "coeff": coeff},
        )
        subject_meta.append({"id": r.scalar(), "name": name, "coeff": coeff, "bias": bias})

    # 3. Structure des 8 classes sur 4 niveaux (anomalies volontaires pour BI #1 Capacité)
    classes_config = [
        ("1ère Année A", "1ère Année", 30, "Salle B101", 32, False),      # Surcharge (106.7%)
        ("1ère Année B", "1ère Année", 30, "Salle B102", 27, False),      # Optimal (90%)
        ("2ème Sciences A", "2ème Année", 30, "Salle B201", 28, True),    # Optimal (93.3%)
        ("2ème Info B", "2ème Année", 25, "Labo Info 1", 11, True),       # Sous-remplie (44%)
        ("3ème Math A", "3ème Année", 30, "Salle B301", 29, True),        # Optimal (96.7%)
        ("3ème Info B", "3ème Année", 25, "Labo Info 2", 21, True),       # Optimal (84%)
        ("Bac Sciences Exp", "Baccalauréat", 30, "Salle B401", 31, True), # Surcharge (103.3%)
        ("Bac Info", "Baccalauréat", 25, "Labo Data 3", 23, True),        # Optimal (92%)
    ]
    classes_list = []
    for cname, level, max_cap, room, target_count, has_prev_year in classes_config:
        r = conn.execute(
            text("""
                INSERT INTO classes (school_id, name, level, max_capacity, room_name)
                VALUES (:sid, :name, :level, :cap, :room)
                RETURNING id
            """),
            {"sid": school_id, "name": cname, "level": level, "cap": max_cap, "room": room},
        )
        classes_list.append({
            "id": r.scalar(),
            "name": cname,
            "level": level,
            "target_count": target_count,
            "has_prev_year": has_prev_year,
        })

    # 4. Corps enseignant (14 enseignants) & Affectations horaires structurées
    teacher_ids = [demo_ids["teacher"]]
    for _ in range(13):
        r = conn.execute(
            text("""
                INSERT INTO users (school_id, full_name, email, password_hash, role)
                VALUES (:sid, :name, :email, :pwd, 'teacher')
                RETURNING id
            """),
            {
                "sid": school_id,
                "name": "Prof. " + fake.name(),
                "email": fake.unique.email(),
                "pwd": DEMO_PASSWORD_HASH,
            },
        )
        teacher_ids.append(r.scalar())

    teacher_loads = {tid: 0 for tid in teacher_ids}
    assignments = []
    for cls_idx, cls in enumerate(classes_list):
        for sub_idx, sub in enumerate(subject_meta):
            hours = 4 if sub["coeff"] >= 4.0 else (3 if sub["coeff"] >= 3.0 else 2)
            if sub["name"] == "Informatique & Big Data" and cls_idx in (0, 2, 3, 5, 7):
                tid = demo_ids["teacher"]  # 15h d'Informatique
            elif sub["name"] == "Mathématiques" and cls_idx == 1:
                tid = demo_ids["teacher"]  # + 4h de Mathématiques = 19h/sem
            else:
                pool = teacher_ids[1:11] if (cls_idx + sub_idx) % 4 != 0 else teacher_ids[11:]
                tid = min(pool, key=lambda t: teacher_loads[t]) if (cls_idx % 2 == 0) else random.choice(pool)

            teacher_loads[tid] += hours
            assignments.append({
                "sid": school_id,
                "tid": tid,
                "cid": cls["id"],
                "sub_id": sub["id"],
                "hours": hours,
            })

    conn.execute(
        text("""
            INSERT INTO teacher_assignments (school_id, teacher_id, class_id, subject_id, weekly_hours)
            VALUES (:sid, :tid, :cid, :sub_id, :hours)
        """),
        assignments,
    )

    grades_batch = []
    attendance_batch = []
    payments_batch = []
    messages_batch = []

    neighborhoods = cfg["neighborhoods"]
    demo_assigned = False
    sibling_assigned = False

    # 5. Élèves actifs (2025-2026) + historique N-1 (2024-2025) pour les niveaux 2ème à Bac
    for cls in classes_list:
        for _ in range(cls["target_count"]):
            is_demo_primary = False
            is_demo_sibling = False

            if not demo_assigned and cls["level"] == "3ème Année":
                student_user_id = demo_ids["student"]
                parent_user_id = demo_ids["parent"]
                demo_assigned = True
                is_demo_primary = True
            elif demo_assigned and not sibling_assigned and cls["level"] == "1ère Année":
                s_res = conn.execute(
                    text("""
                        INSERT INTO users (school_id, full_name, email, password_hash, role)
                        VALUES (:sid, :name, :email, :pwd, 'student')
                        RETURNING id
                    """),
                    {
                        "sid": school_id,
                        "name": cfg["sibling_name"],
                        "email": fake.unique.email(),
                        "pwd": DEMO_PASSWORD_HASH,
                    },
                )
                student_user_id = s_res.scalar()
                parent_user_id = demo_ids["parent"]
                sibling_assigned = True
                is_demo_sibling = True
            else:
                p_res = conn.execute(
                    text("""
                        INSERT INTO users (school_id, full_name, email, password_hash, role)
                        VALUES (:sid, :name, :email, :pwd, 'parent')
                        RETURNING id
                    """),
                    {"sid": school_id, "name": fake.name(), "email": fake.unique.email(), "pwd": DEMO_PASSWORD_HASH},
                )
                parent_user_id = p_res.scalar()

                s_res = conn.execute(
                    text("""
                        INSERT INTO users (school_id, full_name, email, password_hash, role)
                        VALUES (:sid, :name, :email, :pwd, 'student')
                        RETURNING id
                    """),
                    {"sid": school_id, "name": fake.name(), "email": fake.unique.email(), "pwd": DEMO_PASSWORD_HASH},
                )
                student_user_id = s_res.scalar()

            if is_demo_primary:
                archetype = "excellence"
                base_ability = 15.2
                status = "active"
            elif is_demo_sibling:
                archetype = "regular"
                base_ability = 12.6
                status = "active"
            else:
                roll = random.random()
                if roll < 0.30:
                    archetype = "excellence"
                    base_ability = random.uniform(14.5, 18.4)
                    status = "active"
                elif roll < 0.65:
                    archetype = "regular"
                    base_ability = random.uniform(11.0, 14.3)
                    status = "active"
                elif roll < 0.78:
                    archetype = "silent_drop"
                    base_ability = random.uniform(11.8, 13.8)
                    status = "active"
                elif roll < 0.90:
                    archetype = "dropout_risk"
                    base_ability = random.uniform(6.2, 9.6)
                    status = "dropped" if random.random() < 0.32 else "active"
                else:
                    archetype = "financial_stress"
                    base_ability = random.uniform(8.2, 11.4)
                    status = "active"

            enroll_date = (
                date(2024, 9, random.randint(1, 14))
                if cls["has_prev_year"]
                else date(2025, 9, random.randint(1, 14))
            )

            st_res = conn.execute(
                text("""
                    INSERT INTO students (school_id, user_id, parent_id, class_id, city, enrollment_date, status)
                    VALUES (:sid, :uid, :pid, :cid, :city, :edate, :status)
                    RETURNING id
                """),
                {
                    "sid": school_id,
                    "uid": student_user_id,
                    "pid": parent_user_id,
                    "cid": cls["id"],
                    "city": random.choice(neighborhoods),
                    "edate": enroll_date,
                    "status": status,
                },
            )
            student_id = st_res.scalar()

            if cls["has_prev_year"]:
                g_prev, a_prev, p_prev = _generate_year_records(
                    school_id=school_id,
                    student_id=student_id,
                    school_year="2024-2025",
                    level=cls["level"],
                    archetype=archetype,
                    base_ability=base_ability,
                    subject_meta=subject_meta,
                    is_demo_student=is_demo_primary,
                )
                grades_batch.extend(g_prev)
                attendance_batch.extend(a_prev)
                payments_batch.extend(p_prev)

            g_curr, a_curr, p_curr = _generate_year_records(
                school_id=school_id,
                student_id=student_id,
                school_year="2025-2026",
                level=cls["level"],
                archetype=archetype,
                base_ability=base_ability,
                subject_meta=subject_meta,
                is_demo_student=is_demo_primary,
            )
            grades_batch.extend(g_curr)
            attendance_batch.extend(a_curr)
            payments_batch.extend(p_curr)

            if is_demo_primary:
                messages_batch.extend([
                    {
                        "sid": school_id,
                        "sender": demo_ids["director"],
                        "receiver": parent_user_id,
                        "subj": "Félicitations du Conseil de Classe – Tableau d'Honneur",
                        "body": "Bonjour, nous avons le plaisir de vous informer que votre enfant figure au Tableau d'Honneur avec d'excellents résultats en Mathématiques et Big Data.",
                        "is_read": True,
                    },
                    {
                        "sid": school_id,
                        "sender": demo_ids["teacher"],
                        "receiver": parent_user_id,
                        "subj": "Projet Cloud & Big Data – Soutenance prévue",
                        "body": "Bonjour, le projet pratique d'analyse de données sera présenté la semaine prochaine. Merci de vérifier le calendrier sur le portail ACEDA.",
                        "is_read": False,
                    },
                ])
            elif archetype in ("dropout_risk", "silent_drop", "financial_stress") or random.random() < 0.30:
                if archetype == "financial_stress":
                    subj = "Rappel amiable – Échéance de frais de scolarité"
                    body = "Bonjour, sauf erreur de notre part, une tranche de scolarité reste en attente de règlement. Le service comptable reste à votre disposition."
                elif archetype in ("dropout_risk", "silent_drop"):
                    subj = "Alerte Précoce ACEDA – Suivi d'assiduité et soutien"
                    body = "Bonjour, notre système de suivi pédagogique a détecté une baisse récente des résultats ou des absences non justifiées. Merci de prendre rendez-vous."
                else:
                    subj = "Information vie scolaire et relevé trimestriel"
                    body = "Bonjour, les bulletins du trimestre sont disponibles en consultation sur votre espace parent ACEDA."

                messages_batch.append({
                    "sid": school_id,
                    "sender": demo_ids["director"] if archetype != "financial_stress" else demo_ids["accountant"],
                    "receiver": parent_user_id,
                    "subj": subj,
                    "body": body,
                    "is_read": random.choices([True, False], weights=[0.65, 0.35])[0],
                })

    # 6. Cohorte diplômée 2024-2025 (Alumni Baccalauréat) pour enrichir la série temporelle N-1
    bac_classes = [c for c in classes_list if c["level"] == "Baccalauréat"]
    for alumni_idx in range(48):
        cls = bac_classes[alumni_idx % len(bac_classes)]
        p_res = conn.execute(
            text("""
                INSERT INTO users (school_id, full_name, email, password_hash, role)
                VALUES (:sid, :name, :email, :pwd, 'parent')
                RETURNING id
            """),
            {"sid": school_id, "name": fake.name(), "email": fake.unique.email(), "pwd": DEMO_PASSWORD_HASH},
        )
        parent_user_id = p_res.scalar()

        s_res = conn.execute(
            text("""
                INSERT INTO users (school_id, full_name, email, password_hash, role)
                VALUES (:sid, :name, :email, :pwd, 'student')
                RETURNING id
            """),
            {"sid": school_id, "name": fake.name(), "email": fake.unique.email(), "pwd": DEMO_PASSWORD_HASH},
        )
        student_user_id = s_res.scalar()

        archetype = random.choices(
            ["excellence", "regular", "dropout_risk"],
            weights=[0.38, 0.52, 0.10],
        )[0]
        base_ability = (
            random.uniform(14.5, 18.2)
            if archetype == "excellence"
            else (random.uniform(10.8, 14.2) if archetype == "regular" else random.uniform(7.5, 9.8))
        )

        st_res = conn.execute(
            text("""
                INSERT INTO students (school_id, user_id, parent_id, class_id, city, enrollment_date, status)
                VALUES (:sid, :uid, :pid, :cid, :city, :edate, 'graduated')
                RETURNING id
            """),
            {
                "sid": school_id,
                "uid": student_user_id,
                "pid": parent_user_id,
                "cid": cls["id"],
                "city": random.choice(neighborhoods),
                "edate": date(2024, 9, random.randint(1, 14)),
            },
        )
        alumni_student_id = st_res.scalar()

        g_al, a_al, p_al = _generate_year_records(
            school_id=school_id,
            student_id=alumni_student_id,
            school_year="2024-2025",
            level="Baccalauréat",
            archetype=archetype,
            base_ability=base_ability,
            subject_meta=subject_meta,
            is_demo_student=False,
        )
        grades_batch.extend(g_al)
        attendance_batch.extend(a_al)
        payments_batch.extend(p_al)

    # 7. Insertions massives en lot (Batch Big Data)
    conn.execute(
        text("""
            INSERT INTO grades (school_id, student_id, subject_id, trimester, score, recorded_at)
            VALUES (:sid, :stid, :subid, :trim, :score, :rdate)
        """),
        grades_batch,
    )
    if attendance_batch:
        conn.execute(
            text("""
                INSERT INTO attendance (school_id, student_id, date, type, hours_missed, justified)
                VALUES (:sid, :stid, :adate, :atype, :hours, :just)
            """),
            attendance_batch,
        )
    conn.execute(
        text("""
            INSERT INTO payments (school_id, student_id, title, amount_due, amount_paid, due_date, paid_date, status)
            VALUES (:sid, :stid, :title, :due, :paid, :ddate, :pdate, :status)
        """),
        payments_batch,
    )
    if messages_batch:
        conn.execute(
            text("""
                INSERT INTO messages (school_id, sender_id, receiver_parent_id, subject, content, is_read)
                VALUES (:sid, :sender, :receiver, :subj, :body, :is_read)
            """),
            messages_batch,
        )

    print(
        f"[OK] {school_name} (2024-2026) : "
        f"{len(grades_batch)} notes, {len(attendance_batch)} absences/retards, "
        f"{len(payments_batch)} échéances financières, {len(messages_batch)} notifications."
    )

def sync_demo_accounts_only(conn):
    """Vérifie ou restaure uniquement les 12 comptes de démonstration sans altérer les données historiques."""
    for city, cfg in CAMPUS_CONFIGS.items():
        school_id = conn.execute(
            text("SELECT id FROM schools WHERE city = :city ORDER BY id LIMIT 1"),
            {"city": city},
        ).scalar()
        if not school_id:
            continue
        for role, (full_name, email) in cfg["demo_staff"].items():
            conn.execute(
                text("""
                    INSERT INTO users (school_id, full_name, email, password_hash, role)
                    VALUES (:sid, :name, :email, :pwd, :role)
                    ON CONFLICT (email) DO NOTHING
                """),
                {"sid": school_id, "name": full_name, "email": email, "pwd": DEMO_PASSWORD_HASH, "role": role},
            )


if __name__ == "__main__":
    force_reset = "--force-reset" in sys.argv and os.getenv("CONFIRM_RESET") == "YES"
    with engine.begin() as conn:
        existing_schools = conn.execute(text("SELECT id, name, city FROM schools ORDER BY id")).mappings().all()
        if existing_schools and not force_reset:
            print("[PROTECTION ACTIVE] Les établissements existent déjà dans Neon. Aucune donnée supprimée.")
            sync_demo_accounts_only(conn)
            for s in existing_schools:
                g_cnt = conn.execute(text("SELECT COUNT(*) FROM grades WHERE school_id = :sid"), {"sid": s["id"]}).scalar()
                st_cnt = conn.execute(text("SELECT COUNT(*) FROM students WHERE school_id = :sid"), {"sid": s["id"]}).scalar()
                print(f"  - {s['name']} ({s['city']}) : {st_cnt} élèves, {g_cnt} notes conservées.")
        else:
            if force_reset:
                print("[RESET AUTORISÉ] Réinitialisation complète demandée...")
                reset_database(conn)
            seed_school(conn, "Lycée Pilote ACEDA Tunis", "Tunis", 215)
            seed_school(conn, "Groupe Scolaire ACEDA Nabeul", "Nabeul", 215)
            print("Base de données PostgreSQL ACEDA peuplée avec succès !")
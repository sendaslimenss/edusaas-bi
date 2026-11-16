import random
from datetime import date, timedelta
from faker import Faker
from passlib.context import CryptContext
from sqlalchemy import text
from app.database import engine

fake = Faker("fr_FR")
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
DEMO_PASSWORD_HASH = pwd_context.hash("Aceda2026!")


def reset_database(conn):
    conn.execute(text("TRUNCATE TABLE schools RESTART IDENTITY CASCADE;"))


def seed_school(conn, school_name, city, domain, total_capacity):
    res = conn.execute(
        text("INSERT INTO schools (name, city, total_capacity) VALUES (:name, :city, :cap) RETURNING id"),
        {"name": school_name, "city": city, "cap": total_capacity}
    )
    school_id = res.scalar()

    demo_accounts = [
        ("Admin " + city, f"admin@{domain}", "admin"),
        ("Directeur " + city, f"directeur@{domain}", "director"),
        ("Prof. Karim Mansouri", f"prof@{domain}", "teacher"),
        ("Comptable Sonia Trabelsi", f"comptable@{domain}", "accountant"),
        ("Parent Mehdi Ben Ali", f"parent@{domain}", "parent"),
        ("Élève Yasmine Ben Ali", f"eleve@{domain}", "student"),
    ]

    demo_ids = {}
    for full_name, email, role in demo_accounts:
        r = conn.execute(
            text("""
                INSERT INTO users (school_id, full_name, email, password_hash, role)
                VALUES (:sid, :name, :email, :pwd, :role)
                RETURNING id
            """),
            {"sid": school_id, "name": full_name, "email": email, "pwd": DEMO_PASSWORD_HASH, "role": role}
        )
        demo_ids[role] = r.scalar()

    subjects_data = [
        ("Mathématiques", 4.0),
        ("Physique-Chimie", 3.0),
        ("Sciences de la Vie et de la Terre", 2.0),
        ("Informatique & Big Data", 3.0),
        ("Français", 2.0),
        ("Anglais", 2.0),
        ("Histoire-Géographie", 1.5),
    ]
    subject_ids = []
    for name, coeff in subjects_data:
        r = conn.execute(
            text("INSERT INTO subjects (school_id, name, coefficient) VALUES (:sid, :name, :coeff) RETURNING id"),
            {"sid": school_id, "name": name, "coeff": coeff}
        )
        subject_ids.append(r.scalar())

    classes_config = [
        ("1ère Année A", "1ère Année", 30, "Salle B101", 32),
        ("1ère Année B", "1ère Année", 30, "Salle B102", 26),
        ("2ème Sciences A", "2ème Année", 30, "Salle B201", 28),
        ("2ème Info B", "2ème Année", 25, "Labo Info 1", 11),
        ("3ème Math A", "3ème Année", 30, "Salle B301", 29),
        ("Bac Sciences Exp", "Baccalauréat", 30, "Salle B302", 31),
        ("Bac Info", "Baccalauréat", 25, "Labo Info 2", 22),
    ]
    classes_list = []
    for cname, level, max_cap, room, target_count in classes_config:
        r = conn.execute(
            text("""
                INSERT INTO classes (school_id, name, level, max_capacity, room_name)
                VALUES (:sid, :name, :level, :cap, :room)
                RETURNING id
            """),
            {"sid": school_id, "name": cname, "level": level, "cap": max_cap, "room": room}
        )
        classes_list.append({"id": r.scalar(), "target_count": target_count})

    teacher_ids = [demo_ids["teacher"]]
    for _ in range(10):
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
            }
        )
        teacher_ids.append(r.scalar())

    assignments = []
    for cls in classes_list:
        for sub_id in subject_ids:
            assignments.append({
                "sid": school_id,
                "tid": random.choice(teacher_ids),
                "cid": cls["id"],
                "sub_id": sub_id,
                "hours": random.choice([2, 3, 4])
            })
    conn.execute(
        text("""
            INSERT INTO teacher_assignments (school_id, teacher_id, class_id, subject_id, weekly_hours)
            VALUES (:sid, :tid, :cid, :sub_id, :hours)
        """),
        assignments
    )

    grades_batch = []
    attendance_batch = []
    payments_batch = []
    messages_batch = []
    first_student_created = False

    for cls in classes_list:
        for _ in range(cls["target_count"]):
            if not first_student_created:
                student_user_id = demo_ids["student"]
                parent_user_id = demo_ids["parent"]
                first_student_created = True
            else:
                p_res = conn.execute(
                    text("""
                        INSERT INTO users (school_id, full_name, email, password_hash, role)
                        VALUES (:sid, :name, :email, :pwd, 'parent')
                        RETURNING id
                    """),
                    {"sid": school_id, "name": fake.name(), "email": fake.unique.email(), "pwd": DEMO_PASSWORD_HASH}
                )
                parent_user_id = p_res.scalar()

                s_res = conn.execute(
                    text("""
                        INSERT INTO users (school_id, full_name, email, password_hash, role)
                        VALUES (:sid, :name, :email, :pwd, 'student')
                        RETURNING id
                    """),
                    {"sid": school_id, "name": fake.name(), "email": fake.unique.email(), "pwd": DEMO_PASSWORD_HASH}
                )
                student_user_id = s_res.scalar()

            profile_roll = random.random()
            if profile_roll < 0.15:
                base_level = random.uniform(6.0, 9.5)
                absence_count = random.randint(8, 18)
                payment_risk = True
            elif profile_roll < 0.40:
                base_level = random.uniform(9.5, 12.5)
                absence_count = random.randint(3, 7)
                payment_risk = random.choice([True, False])
            else:
                base_level = random.uniform(12.5, 18.5)
                absence_count = random.randint(0, 3)
                payment_risk = False

            enroll_date = date(2025, 9, random.randint(1, 15))
            status = "dropped" if (profile_roll < 0.04) else "active"

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
                    "city": random.choice([city, "Nabeul", "Hammamet", "Dar Chaabane", "Tunis"]),
                    "edate": enroll_date,
                    "status": status
                }
            )
            student_id = st_res.scalar()

            for trimester in [1, 2, 3]:
                trend = -1.2 * (trimester - 1) if profile_roll < 0.15 else random.uniform(-0.3, 0.5)
                rec_date = date(2025, 11, 20) if trimester == 1 else (date(2026, 2, 25) if trimester == 2 else date(2026, 5, 15))
                for sub_id in subject_ids:
                    score = round(min(20.0, max(2.0, base_level + trend + random.uniform(-2.2, 2.2))), 2)
                    grades_batch.append({
                        "sid": school_id,
                        "stid": student_id,
                        "subid": sub_id,
                        "trim": trimester,
                        "score": score,
                        "rdate": rec_date
                    })

            for _ in range(absence_count):
                att_date = date(2026, 1, 1) + timedelta(days=random.randint(0, 300))
                attendance_batch.append({
                    "sid": school_id,
                    "stid": student_id,
                    "adate": att_date,
                    "atype": random.choices(["absence", "late"], weights=[0.75, 0.25])[0],
                    "hours": random.choice([1.0, 2.0, 4.0]),
                    "just": False if profile_roll < 0.20 else random.choice([True, False])
                })

            tranches = [
                ("Frais Scolarité - Trimestre 1", date(2025, 10, 5)),
                ("Frais Scolarité - Trimestre 2", date(2026, 1, 15)),
                ("Frais Scolarité - Trimestre 3", date(2026, 4, 15)),
            ]
            for idx, (title, due_dt) in enumerate(tranches):
                amount_due = 850.00
                if payment_risk and idx >= 1:
                    p_status = random.choice(["overdue", "partial"])
                    amount_paid = 300.00 if p_status == "partial" else 0.00
                    paid_dt = due_dt + timedelta(days=5) if p_status == "partial" else None
                else:
                    p_status = "paid"
                    amount_paid = 850.00
                    paid_dt = due_dt - timedelta(days=random.randint(0, 10))

                payments_batch.append({
                    "sid": school_id,
                    "stid": student_id,
                    "title": title,
                    "due": amount_due,
                    "paid": amount_paid,
                    "ddate": due_dt,
                    "pdate": paid_dt,
                    "status": p_status
                })

            if random.random() < 0.45:
                messages_batch.append({
                    "sid": school_id,
                    "sender": demo_ids["director"],
                    "receiver": parent_user_id,
                    "subj": "Suivi pédagogique et assiduité",
                    "body": "Bonjour, merci de consulter le relevé d'assiduité et les résultats sur votre espace ACEDA.",
                    "is_read": random.choices([True, False], weights=[0.72, 0.28])[0]
                })

    conn.execute(
        text("""
            INSERT INTO grades (school_id, student_id, subject_id, trimester, score, recorded_at)
            VALUES (:sid, :stid, :subid, :trim, :score, :rdate)
        """),
        grades_batch
    )
    if attendance_batch:
        conn.execute(
            text("""
                INSERT INTO attendance (school_id, student_id, date, type, hours_missed, justified)
                VALUES (:sid, :stid, :adate, :atype, :hours, :just)
            """),
            attendance_batch
        )
    conn.execute(
        text("""
            INSERT INTO payments (school_id, student_id, title, amount_due, amount_paid, due_date, paid_date, status)
            VALUES (:sid, :stid, :title, :due, :paid, :ddate, :pdate, :status)
        """),
        payments_batch
    )
    if messages_batch:
        conn.execute(
            text("""
                INSERT INTO messages (school_id, sender_id, receiver_parent_id, subject, content, is_read)
                VALUES (:sid, :sender, :receiver, :subj, :body, :is_read)
            """),
            messages_batch
        )

    print(f"[OK] {school_name} générée : {len(grades_batch)} notes, {len(attendance_batch)} absences, {len(payments_batch)} paiements.")


if __name__ == "__main__":
    print("Initialisation des données Big Data PostgreSQL pour ACEDA...")
    with engine.begin() as conn:
        reset_database(conn)
        seed_school(conn, "Lycée Pilote ACEDA Tunis", "Tunis", "tunis.aceda.tn", 220)
        seed_school(conn, "Groupe Scolaire ACEDA Nabeul", "Nabeul", "nabeul.aceda.tn", 220)
    print("Base de données PostgreSQL ACEDA peuplée avec succès !")
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_password, create_access_token, get_current_user, require_roles

router = APIRouter(prefix="/api", tags=["SaaS Operations"])


class LoginRequest(BaseModel):
    email: str
    password: str


class GradeCreate(BaseModel):
    student_id: int
    subject_id: int
    trimester: int
    score: float


class AttendanceCreate(BaseModel):
    student_id: int
    type: str
    hours_missed: float
    justified: bool


class MessageCreate(BaseModel):
    receiver_parent_id: int
    subject: str
    content: str


@router.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        text("""
            SELECT u.id, u.school_id, u.full_name, u.email, u.password_hash, u.role,
                   s.name AS school_name, s.city AS school_city
            FROM users u
            JOIN schools s ON u.school_id = s.id
            WHERE LOWER(u.email) = LOWER(:email)
        """),
        {"email": payload.email.strip()}
    ).mappings().first()

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Identifiants incorrects")

    token = create_access_token({"sub": str(user["id"]), "role": user["role"], "school_id": user["school_id"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "school_id": user["school_id"],
            "school_name": user["school_name"],
            "school_city": user["school_city"],
            "full_name": user["full_name"],
            "email": user["email"],
            "role": user["role"]
        }
    }


@router.get("/saas/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/saas/referentials")
def get_referentials(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sid = current_user["school_id"]
    classes = db.execute(
        text("SELECT id, name, level, max_capacity, room_name FROM classes WHERE school_id = :sid ORDER BY name"),
        {"sid": sid}
    ).mappings().all()
    subjects = db.execute(
        text("SELECT id, name, coefficient FROM subjects WHERE school_id = :sid ORDER BY name"),
        {"sid": sid}
    ).mappings().all()
    return {
        "classes": [dict(c) for c in classes],
        "subjects": [{**dict(s), "coefficient": float(s["coefficient"])} for s in subjects]
    }


@router.get("/saas/students")
def list_students(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    query = """
        SELECT st.id, st.status, st.city, st.parent_id,
               u.full_name AS student_name, u.email AS student_email,
               up.full_name AS parent_name,
               c.name AS class_name, c.level
        FROM students st
        JOIN users u ON st.user_id = u.id
        LEFT JOIN users up ON st.parent_id = up.id
        LEFT JOIN classes c ON st.class_id = c.id
        WHERE st.school_id = :sid
    """
    params = {"sid": sid}

    if role == "student":
        query += " AND st.user_id = :uid"
        params["uid"] = uid
    elif role == "parent":
        query += " AND st.parent_id = :uid"
        params["uid"] = uid

    query += " ORDER BY u.full_name ASC LIMIT 100"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/saas/students/{student_id}/bulletin")
def get_student_bulletin(
    student_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    # Vérification stricte de propriété pour les profils Élève et Parent
    if role in ("student", "parent"):
        owner = db.execute(
            text("""
                SELECT id FROM students
                WHERE id = :stid AND school_id = :sid
                  AND (user_id = :uid OR parent_id = :uid)
            """),
            {"stid": student_id, "sid": sid, "uid": uid}
        ).first()
        if not owner:
            raise HTTPException(status_code=403, detail="Accès non autorisé à ce dossier scolaire")

    grades = db.execute(
        text("""
            SELECT g.id, g.trimester, g.score, g.recorded_at,
                   sub.name AS subject_name, sub.coefficient
            FROM grades g
            JOIN subjects sub ON g.subject_id = sub.id
            WHERE g.school_id = :sid AND g.student_id = :stid
            ORDER BY g.recorded_at DESC, g.trimester ASC, sub.name ASC
        """),
        {"sid": sid, "stid": student_id}
    ).mappings().all()

    attendance = db.execute(
        text("""
            SELECT id, date, type, hours_missed, justified
            FROM attendance
            WHERE school_id = :sid AND student_id = :stid
            ORDER BY date DESC
        """),
        {"sid": sid, "stid": student_id}
    ).mappings().all()

    payments = db.execute(
        text("""
            SELECT id, title, amount_due, amount_paid, due_date, paid_date, status
            FROM payments
            WHERE school_id = :sid AND student_id = :stid
            ORDER BY due_date DESC
        """),
        {"sid": sid, "stid": student_id}
    ).mappings().all()

    return {
        "grades": [
            {
                **dict(g),
                "score": float(g["score"]),
                "coefficient": float(g["coefficient"]),
                "school_year": "2024-2025" if str(g["recorded_at"]) < "2025-09-01" else "2025-2026",
            }
            for g in grades
        ],
        "attendance": [{**dict(a), "hours_missed": float(a["hours_missed"])} for a in attendance],
        "payments": [{**dict(p), "amount_due": float(p["amount_due"]), "amount_paid": float(p["amount_paid"])} for p in payments]
    }

@router.post("/saas/grades")
def add_grade(
    payload: GradeCreate,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]
    db.execute(
        text("""
            INSERT INTO grades (school_id, student_id, subject_id, trimester, score, recorded_at)
            VALUES (:sid, :stid, :subid, :trim, :score, :rdate)
        """),
        {
            "sid": sid,
            "stid": payload.student_id,
            "subid": payload.subject_id,
            "trim": payload.trimester,
            "score": payload.score,
            "rdate": date.today()
        }
    )
    db.commit()
    return {"message": "Note enregistrée avec succès"}


@router.post("/saas/attendance")
def add_attendance(
    payload: AttendanceCreate,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]
    db.execute(
        text("""
            INSERT INTO attendance (school_id, student_id, date, type, hours_missed, justified)
            VALUES (:sid, :stid, :adate, :atype, :hours, :just)
        """),
        {
            "sid": sid,
            "stid": payload.student_id,
            "adate": date.today(),
            "atype": payload.type,
            "hours": payload.hours_missed,
            "just": payload.justified
        }
    )
    db.commit()
    return {"message": "Absence/Retard enregistré"}


@router.get("/saas/payments")
def list_payments(
    current_user: dict = Depends(require_roles(["accountant", "admin", "director"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]
    rows = db.execute(
        text("""
            SELECT p.id, p.title, p.amount_due, p.amount_paid, p.due_date, p.paid_date, p.status,
                   u.full_name AS student_name, up.full_name AS parent_name
            FROM payments p
            JOIN students st ON p.student_id = st.id
            JOIN users u ON st.user_id = u.id
            LEFT JOIN users up ON st.parent_id = up.id
            WHERE p.school_id = :sid
            ORDER BY CASE WHEN p.status = 'overdue' THEN 1 WHEN p.status = 'partial' THEN 2 ELSE 3 END, p.due_date DESC
            LIMIT 250
        """),
        {"sid": sid}
    ).mappings().all()
    return [{**dict(r), "amount_due": float(r["amount_due"]), "amount_paid": float(r["amount_paid"])} for r in rows]

@router.patch("/saas/payments/{payment_id}/settle")
def settle_payment(
    payment_id: int,
    current_user: dict = Depends(require_roles(["accountant", "admin"])),
    db: Session = Depends(get_db)
):
    sid = current_user["school_id"]
    db.execute(
        text("""
            UPDATE payments
            SET amount_paid = amount_due, status = 'paid', paid_date = :pdate
            WHERE id = :pid AND school_id = :sid
        """),
        {"pid": payment_id, "sid": sid, "pdate": date.today()}
    )
    db.commit()
    return {"message": "Paiement soldé"}


@router.get("/saas/messages")
def list_messages(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    if role == "parent":
        rows = db.execute(
            text("""
                SELECT m.id, m.subject, m.content, m.is_read, m.created_at, u.full_name AS sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.school_id = :sid AND m.receiver_parent_id = :uid
                ORDER BY m.created_at DESC
            """),
            {"sid": sid, "uid": uid}
        ).mappings().all()
    else:
        rows = db.execute(
            text("""
                SELECT m.id, m.subject, m.content, m.is_read, m.created_at, u.full_name AS receiver_name
                FROM messages m
                JOIN users u ON m.receiver_parent_id = u.id
                WHERE m.school_id = :sid
                ORDER BY m.created_at DESC LIMIT 50
            """),
            {"sid": sid}
        ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/saas/messages")
def send_message(
    payload: MessageCreate,
    current_user: dict = Depends(require_roles(["admin", "director", "teacher", "accountant"])),
    db: Session = Depends(get_db)
):
    db.execute(
        text("""
            INSERT INTO messages (school_id, sender_id, receiver_parent_id, subject, content)
            VALUES (:sid, :sender, :receiver, :subj, :content)
        """),
        {
            "sid": current_user["school_id"],
            "sender": current_user["id"],
            "receiver": payload.receiver_parent_id,
            "subj": payload.subject,
            "content": payload.content
        }
    )
    db.commit()
    return {"message": "Notification envoyée au parent"}


@router.patch("/saas/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    current_user: dict = Depends(require_roles(["parent"])),
    db: Session = Depends(get_db)
):
    db.execute(
        text("UPDATE messages SET is_read = TRUE WHERE id = :mid AND receiver_parent_id = :uid"),
        {"mid": message_id, "uid": current_user["id"]}
    )
    db.commit()
    return {"message": "Accusé de lecture enregistré"}
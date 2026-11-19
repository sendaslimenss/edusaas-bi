from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import (
    verify_password,
    create_access_token,
    get_current_user,
    require_roles,
    check_login_rate_limit,
    record_login_failure,
    clear_login_failures,
)

router = APIRouter(prefix="/api", tags=["SaaS Operations"])


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=255)


class GradeCreate(BaseModel):
    student_id: int = Field(..., gt=0)
    subject_id: int = Field(..., gt=0)
    trimester: int = Field(..., ge=1, le=3)
    score: float = Field(..., ge=0.0, le=20.0)


class AttendanceCreate(BaseModel):
    student_id: int = Field(..., gt=0)
    type: Literal["absence", "late"]
    hours_missed: float = Field(..., gt=0.0, le=12.0)
    justified: bool


class MessageCreate(BaseModel):
    receiver_parent_id: int = Field(..., gt=0)
    subject: str = Field(..., min_length=2, max_length=200)
    content: str = Field(..., min_length=2, max_length=4000)


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    clean_email = payload.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"{client_ip}:{clean_email}"

    check_login_rate_limit(rate_key)

    user = db.execute(
        text("""
            SELECT u.id, u.school_id, u.full_name, u.email, u.password_hash, u.role,
                   s.name AS school_name, s.city AS school_city
            FROM users u
            JOIN schools s ON u.school_id = s.id
            WHERE LOWER(u.email) = :email
        """),
        {"email": clean_email},
    ).mappings().first()

    if not user or not verify_password(payload.password, user["password_hash"]):
        record_login_failure(rate_key)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants incorrects")

    clear_login_failures(rate_key)

    token = create_access_token(
        {"sub": str(user["id"]), "role": user["role"], "school_id": user["school_id"]}
    )
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
            "role": user["role"],
        },
    }


@router.post("/auth/refresh")
def refresh_token(current_user: dict = Depends(get_current_user)):
    token = create_access_token(
        {
            "sub": str(current_user["id"]),
            "role": current_user["role"],
            "school_id": current_user["school_id"],
        }
    )
    return {"access_token": token, "token_type": "bearer"}


@router.get("/saas/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user


@router.get("/saas/referentials")
def get_referentials(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    if role == "teacher":
        classes = db.execute(
            text("""
                SELECT DISTINCT c.id, c.name, c.level, c.max_capacity, c.room_name
                FROM classes c
                JOIN teacher_assignments ta ON ta.class_id = c.id
                WHERE c.school_id = :sid AND ta.school_id = :sid AND ta.teacher_id = :uid
                ORDER BY c.name
            """),
            {"sid": sid, "uid": uid},
        ).mappings().all()

        subjects = db.execute(
            text("""
                SELECT DISTINCT sub.id, sub.name, sub.coefficient
                FROM subjects sub
                JOIN teacher_assignments ta ON ta.subject_id = sub.id
                WHERE sub.school_id = :sid AND ta.school_id = :sid AND ta.teacher_id = :uid
                ORDER BY sub.name
            """),
            {"sid": sid, "uid": uid},
        ).mappings().all()
    else:
        classes = db.execute(
            text("SELECT id, name, level, max_capacity, room_name FROM classes WHERE school_id = :sid ORDER BY name"),
            {"sid": sid},
        ).mappings().all()
        subjects = db.execute(
            text("SELECT id, name, coefficient FROM subjects WHERE school_id = :sid ORDER BY name"),
            {"sid": sid},
        ).mappings().all()

    return {
        "classes": [dict(c) for c in classes],
        "subjects": [{**dict(s), "coefficient": float(s["coefficient"])} for s in subjects],
    }


@router.get("/saas/students")
def list_students(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    query = """
        SELECT st.id, st.status, st.city, st.parent_id, st.class_id,
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
    elif role == "teacher":
        query += """
            AND EXISTS (
                SELECT 1 FROM teacher_assignments ta
                WHERE ta.school_id = :sid
                  AND ta.teacher_id = :uid
                  AND ta.class_id = st.class_id
            )
        """
        params["uid"] = uid

    query += " ORDER BY u.full_name ASC LIMIT 250"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/saas/students/{student_id}/bulletin")
def get_student_bulletin(
    student_id: int,
    current_user: dict = Depends(require_roles(["admin", "director", "teacher", "accountant", "parent", "student"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    student = db.execute(
        text("""
            SELECT id, user_id, parent_id, class_id
            FROM students
            WHERE id = :stid AND school_id = :sid
        """),
        {"stid": student_id, "sid": sid},
    ).mappings().first()

    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève introuvable dans cet établissement")

    if role in ("student", "parent"):
        if student["user_id"] != uid and student["parent_id"] != uid:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé à ce dossier scolaire")
    elif role == "teacher":
        assigned = db.execute(
            text("""
                SELECT 1 FROM teacher_assignments
                WHERE school_id = :sid AND teacher_id = :uid AND class_id = :cid
            """),
            {"sid": sid, "uid": uid, "cid": student["class_id"]},
        ).first()
        if not assigned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Accès refusé : cet élève n'appartient pas à vos classes affectées",
            )

    grades = db.execute(
        text("""
            SELECT g.id, g.trimester, g.score, g.recorded_at,
                   sub.name AS subject_name, sub.coefficient
            FROM grades g
            JOIN subjects sub ON g.subject_id = sub.id
            WHERE g.school_id = :sid AND g.student_id = :stid
            ORDER BY g.recorded_at DESC, g.trimester ASC, sub.name ASC
        """),
        {"sid": sid, "stid": student_id},
    ).mappings().all()

    attendance = db.execute(
        text("""
            SELECT id, date, type, hours_missed, justified
            FROM attendance
            WHERE school_id = :sid AND student_id = :stid
            ORDER BY date DESC
        """),
        {"sid": sid, "stid": student_id},
    ).mappings().all()

    payments_data = []
    if role in ("admin", "director", "accountant", "parent", "student"):
        payments = db.execute(
            text("""
                SELECT id, title, amount_due, amount_paid, due_date, paid_date, status
                FROM payments
                WHERE school_id = :sid AND student_id = :stid
                ORDER BY due_date DESC
            """),
            {"sid": sid, "stid": student_id},
        ).mappings().all()
        payments_data = [
            {**dict(p), "amount_due": float(p["amount_due"]), "amount_paid": float(p["amount_paid"])}
            for p in payments
        ]

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
        "payments": payments_data,
    }


@router.post("/saas/grades")
def add_grade(
    payload: GradeCreate,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    # 1. Vérification multi-école de l'élève
    student = db.execute(
        text("SELECT id, class_id, status FROM students WHERE id = :stid AND school_id = :sid"),
        {"stid": payload.student_id, "sid": sid},
    ).mappings().first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Élève introuvable dans votre établissement",
        )
    if student["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'enregistrer une note pour un élève inactif ou diplômé",
        )

    # 2. Vérification multi-école de la matière
    subject = db.execute(
        text("SELECT id FROM subjects WHERE id = :subid AND school_id = :sid"),
        {"subid": payload.subject_id, "sid": sid},
    ).first()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matière introuvable dans votre établissement",
        )

    # 3. Contrôle d'affectation pour l'enseignant
    if role == "teacher":
        assignment = db.execute(
            text("""
                SELECT id FROM teacher_assignments
                WHERE school_id = :sid
                  AND teacher_id = :uid
                  AND class_id = :cid
                  AND subject_id = :subid
            """),
            {
                "sid": sid,
                "uid": uid,
                "cid": student["class_id"],
                "subid": payload.subject_id,
            },
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Action refusée : vous n'enseignez pas cette matière dans la classe de cet élève",
            )

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
            "score": round(payload.score, 2),
            "rdate": date.today(),
        },
    )
    db.commit()
    return {"message": "Note enregistrée avec succès"}


@router.post("/saas/attendance")
def add_attendance(
    payload: AttendanceCreate,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    # 1. Vérification multi-école de l'élève
    student = db.execute(
        text("SELECT id, class_id, status FROM students WHERE id = :stid AND school_id = :sid"),
        {"stid": payload.student_id, "sid": sid},
    ).mappings().first()
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Élève introuvable dans votre établissement",
        )
    if student["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de saisir une absence pour un élève inactif ou diplômé",
        )

    # 2. Contrôle d'affectation de classe pour l'enseignant
    if role == "teacher":
        assignment = db.execute(
            text("""
                SELECT id FROM teacher_assignments
                WHERE school_id = :sid AND teacher_id = :uid AND class_id = :cid
            """),
            {"sid": sid, "uid": uid, "cid": student["class_id"]},
        ).first()
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Action refusée : cet élève n'appartient pas à vos classes affectées",
            )

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
            "hours": round(payload.hours_missed, 2),
            "just": payload.justified,
        },
    )
    db.commit()
    return {"message": "Absence/Retard enregistré"}


@router.get("/saas/payments")
def list_payments(
    current_user: dict = Depends(require_roles(["accountant", "admin", "director"])),
    db: Session = Depends(get_db),
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
        {"sid": sid},
    ).mappings().all()
    return [{**dict(r), "amount_due": float(r["amount_due"]), "amount_paid": float(r["amount_paid"])} for r in rows]


@router.patch("/saas/payments/{payment_id}/settle")
def settle_payment(
    payment_id: int,
    current_user: dict = Depends(require_roles(["accountant", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]

    payment = db.execute(
        text("SELECT id, status FROM payments WHERE id = :pid AND school_id = :sid"),
        {"pid": payment_id, "sid": sid},
    ).mappings().first()

    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Échéance introuvable dans votre établissement",
        )
    if payment["status"] == "paid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette échéance est déjà soldée",
        )

    db.execute(
        text("""
            UPDATE payments
            SET amount_paid = amount_due, status = 'paid', paid_date = :pdate
            WHERE id = :pid AND school_id = :sid
        """),
        {"pid": payment_id, "sid": sid, "pdate": date.today()},
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
            {"sid": sid, "uid": uid},
        ).mappings().all()
    elif role in ("admin", "director", "teacher", "accountant"):
        rows = db.execute(
            text("""
                SELECT m.id, m.subject, m.content, m.is_read, m.created_at, u.full_name AS receiver_name
                FROM messages m
                JOIN users u ON m.receiver_parent_id = u.id
                WHERE m.school_id = :sid
                ORDER BY m.created_at DESC LIMIT 50
            """),
            {"sid": sid},
        ).mappings().all()
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Messagerie réservée aux parents et au personnel")

    return [dict(r) for r in rows]


@router.post("/saas/messages")
def send_message(
    payload: MessageCreate,
    current_user: dict = Depends(require_roles(["admin", "director", "teacher", "accountant"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]

    # Vérification stricte : le destinataire doit être un parent du même établissement
    parent = db.execute(
        text("""
            SELECT id FROM users
            WHERE id = :pid AND school_id = :sid AND role = 'parent'
        """),
        {"pid": payload.receiver_parent_id, "sid": sid},
    ).first()

    if not parent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent destinataire introuvable dans votre établissement",
        )

    db.execute(
        text("""
            INSERT INTO messages (school_id, sender_id, receiver_parent_id, subject, content)
            VALUES (:sid, :sender, :receiver, :subj, :content)
        """),
        {
            "sid": sid,
            "sender": current_user["id"],
            "receiver": payload.receiver_parent_id,
            "subj": payload.subject.strip(),
            "content": payload.content.strip(),
        },
    )
    db.commit()
    return {"message": "Notification envoyée au parent"}


@router.patch("/saas/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    current_user: dict = Depends(require_roles(["parent"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    res = db.execute(
        text("""
            UPDATE messages
            SET is_read = TRUE
            WHERE id = :mid AND receiver_parent_id = :uid AND school_id = :sid
        """),
        {"mid": message_id, "uid": current_user["id"], "sid": sid},
    )
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message introuvable")
    db.commit()
    return {"message": "Accusé de lecture enregistré"}
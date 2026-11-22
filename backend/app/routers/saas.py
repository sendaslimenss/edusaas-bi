from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import (
    verify_password,
    hash_password,
    create_access_token,
    get_current_user,
    require_roles,
    check_login_rate_limit,
    record_login_failure,
    clear_login_failures,
)


router = APIRouter(prefix="/api", tags=["SaaS Operations"])

VALID_ROLES = ("admin", "director", "teacher", "accountant", "parent", "student")


class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    password: str

    def normalized_identifier(self) -> str:
        raw = self.identifier or self.email or self.username or ""
        return raw.strip().lower()


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)


class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    role: Literal["admin", "director", "teacher", "accountant", "parent", "student"]


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    role: Optional[Literal["admin", "director", "teacher", "accountant", "parent", "student"]] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(default="Aceda2026!", min_length=6, max_length=128)
    class_id: int = Field(..., gt=0)
    city: str = Field(..., min_length=2, max_length=100)
    parent_id: Optional[int] = Field(None, gt=0)
    parent_name: Optional[str] = Field(None, min_length=2, max_length=150)
    parent_email: Optional[str] = Field(None, min_length=5, max_length=255)


class StudentUpdate(BaseModel):
    class_id: Optional[int] = Field(None, gt=0)
    city: Optional[str] = Field(None, min_length=2, max_length=100)
    status: Optional[Literal["active", "dropped", "graduated"]] = None
    parent_id: Optional[int] = Field(None, gt=0)


class ClassCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    level: str = Field(..., min_length=2, max_length=100)
    max_capacity: int = Field(..., ge=5, le=60)
    room_name: str = Field(..., min_length=2, max_length=100)


class ClassUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    level: Optional[str] = Field(None, min_length=2, max_length=100)
    max_capacity: Optional[int] = Field(None, ge=5, le=60)
    room_name: Optional[str] = Field(None, min_length=2, max_length=100)


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    coefficient: float = Field(..., gt=0.0, le=10.0)


class TeacherAssignmentCreate(BaseModel):
    teacher_id: int = Field(..., gt=0)
    class_id: int = Field(..., gt=0)
    subject_id: int = Field(..., gt=0)
    weekly_hours: int = Field(..., ge=1, le=30)


class ScheduleCreate(BaseModel):
    class_id: int = Field(..., gt=0)
    subject_id: int = Field(..., gt=0)
    teacher_id: int = Field(..., gt=0)
    day_of_week: Literal["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
    start_time: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    room_name: str = Field(..., min_length=2, max_length=100)


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


class PaymentCreate(BaseModel):
    student_id: int = Field(..., gt=0)
    title: str = Field(..., min_length=3, max_length=180)
    amount_due: float = Field(..., gt=0.0, le=50000.0)
    due_date: date


class MessageCreate(BaseModel):
    receiver_parent_id: int = Field(..., gt=0)
    subject: str = Field(..., min_length=2, max_length=200)
    content: str = Field(..., min_length=2, max_length=4000)


# ==============================================================================
# AUTHENTIFICATION & PROFIL COURANT
# ==============================================================================
@router.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    ident = payload.normalized_identifier()
    if not ident or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Identifiant (email ou nom d'utilisateur) et mot de passe requis.",
        )

    check_login_rate_limit(ident)

    user = db.execute(
        text("""
            SELECT u.id,
                   u.school_id,
                   u.full_name,
                   u.email,
                   u.username,
                   u.password_hash,
                   u.role,
                   COALESCE(u.must_change_password, FALSE) AS must_change_password,
                   s.name AS school_name,
                   s.city AS school_city
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            WHERE LOWER(u.email) = :ident
               OR LOWER(COALESCE(u.username, '')) = :ident
            ORDER BY CASE WHEN LOWER(u.email) = :ident THEN 0 ELSE 1 END, u.id DESC
            LIMIT 1
        """),
        {"ident": ident},
    ).mappings().first()

    if not user or not verify_password(payload.password, user["password_hash"]):
        record_login_failure(ident)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides.",
        )

    clear_login_failures(ident)

    must_change = bool(user["must_change_password"])
    access_token = create_access_token(
        {
            "sub": str(user["id"]),
            "school_id": user["school_id"],
            "role": user["role"],
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "must_change_password": must_change,
        "user": {
            "id": user["id"],
            "school_id": user["school_id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "username": user["username"],
            "role": user["role"],
            "school_name": user["school_name"],
            "school_city": user["school_city"],
            "must_change_password": must_change,
        },
    }


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT password_hash FROM users WHERE id = :uid"),
        {"uid": current_user["id"]},
    ).mappings().first()

    if not row or not verify_password(payload.current_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mot de passe actuel incorrect.",
        )

    if verify_password(payload.new_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le nouveau mot de passe doit être différent de l'ancien.",
        )

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :new_pwd,
                must_change_password = FALSE
            WHERE id = :uid
        """),
        {"new_pwd": hash_password(payload.new_password), "uid": current_user["id"]},
    )
    db.commit()

    return {
        "message": "Mot de passe mis à jour avec succès.",
        "must_change_password": False,
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

# ==============================================================================
# RÉFÉRENTIELS, CLASSES, MATIÈRES & ENSEIGNANTS (CRUD)
# ==============================================================================
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
            text("""
                SELECT c.id, c.name, c.level, c.max_capacity, c.room_name,
                       COUNT(st.id) FILTER (WHERE st.status = 'active') AS active_students
                FROM classes c
                LEFT JOIN students st ON st.class_id = c.id AND st.school_id = :sid
                WHERE c.school_id = :sid
                GROUP BY c.id
                ORDER BY c.level, c.name
            """),
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


@router.post("/saas/classes")
def create_class(
    payload: ClassCreate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    res = db.execute(
        text("""
            INSERT INTO classes (school_id, name, level, max_capacity, room_name)
            VALUES (:sid, :name, :level, :cap, :room)
            RETURNING id, name, level, max_capacity, room_name
        """),
        {
            "sid": sid,
            "name": payload.name.strip(),
            "level": payload.level.strip(),
            "cap": payload.max_capacity,
            "room": payload.room_name.strip(),
        },
    ).mappings().first()
    db.commit()
    return {"message": "Classe et salle créées avec succès", "class": dict(res)}


@router.patch("/saas/classes/{class_id}")
def update_class(
    class_id: int,
    payload: ClassUpdate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    exists = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND school_id = :sid"),
        {"cid": class_id, "sid": sid},
    ).first()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe introuvable")

    updates = []
    params = {"cid": class_id, "sid": sid}
    if payload.name:
        updates.append("name = :name")
        params["name"] = payload.name.strip()
    if payload.level:
        updates.append("level = :level")
        params["level"] = payload.level.strip()
    if payload.max_capacity is not None:
        updates.append("max_capacity = :cap")
        params["cap"] = payload.max_capacity
    if payload.room_name:
        updates.append("room_name = :room")
        params["room"] = payload.room_name.strip()

    if updates:
        db.execute(text(f"UPDATE classes SET {', '.join(updates)} WHERE id = :cid AND school_id = :sid"), params)
        db.commit()
    return {"message": "Classe mise à jour"}


@router.delete("/saas/classes/{class_id}")
def delete_class(
    class_id: int,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    in_use = db.execute(
        text("SELECT COUNT(*) FROM students WHERE class_id = :cid AND school_id = :sid"),
        {"cid": class_id, "sid": sid},
    ).scalar()
    if in_use and in_use > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Impossible de supprimer : {in_use} élève(s) sont encore rattachés à cette classe",
        )
    db.execute(text("DELETE FROM teacher_assignments WHERE class_id = :cid AND school_id = :sid"), {"cid": class_id, "sid": sid})
    res = db.execute(text("DELETE FROM classes WHERE id = :cid AND school_id = :sid"), {"cid": class_id, "sid": sid})
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe introuvable")
    db.commit()
    return {"message": "Classe supprimée"}


@router.post("/saas/subjects")
def create_subject(
    payload: SubjectCreate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    res = db.execute(
        text("""
            INSERT INTO subjects (school_id, name, coefficient)
            VALUES (:sid, :name, :coeff)
            RETURNING id, name, coefficient
        """),
        {"sid": sid, "name": payload.name.strip(), "coeff": round(payload.coefficient, 2)},
    ).mappings().first()
    db.commit()
    return {"message": "Matière créée avec succès", "subject": {**dict(res), "coefficient": float(res["coefficient"])}}


@router.delete("/saas/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    in_use = db.execute(
        text("SELECT COUNT(*) FROM grades WHERE subject_id = :subid AND school_id = :sid"),
        {"subid": subject_id, "sid": sid},
    ).scalar()
    if in_use and in_use > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Impossible de supprimer : {in_use} note(s) sont associées à cette matière",
        )
    db.execute(text("DELETE FROM teacher_assignments WHERE subject_id = :subid AND school_id = :sid"), {"subid": subject_id, "sid": sid})
    res = db.execute(text("DELETE FROM subjects WHERE id = :subid AND school_id = :sid"), {"subid": subject_id, "sid": sid})
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matière introuvable")
    db.commit()
    return {"message": "Matière supprimée"}


@router.get("/saas/teachers")
def list_teachers_and_assignments(
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    teachers = db.execute(
        text("""
            SELECT u.id, u.full_name, u.email,
                   COALESCE(SUM(ta.weekly_hours), 0) AS total_hours,
                   COUNT(DISTINCT ta.class_id) AS classes_count
            FROM users u
            LEFT JOIN teacher_assignments ta ON ta.teacher_id = u.id AND ta.school_id = :sid
            WHERE u.school_id = :sid AND u.role = 'teacher'
            GROUP BY u.id
            ORDER BY u.full_name ASC
        """),
        {"sid": sid},
    ).mappings().all()

    assignments = db.execute(
        text("""
            SELECT ta.id, ta.teacher_id, ta.class_id, ta.subject_id, ta.weekly_hours,
                   u.full_name AS teacher_name,
                   c.name AS class_name,
                   sub.name AS subject_name
            FROM teacher_assignments ta
            JOIN users u ON ta.teacher_id = u.id
            JOIN classes c ON ta.class_id = c.id
            JOIN subjects sub ON ta.subject_id = sub.id
            WHERE ta.school_id = :sid
            ORDER BY u.full_name, c.name, sub.name
        """),
        {"sid": sid},
    ).mappings().all()

    return {
        "teachers": [{**dict(t), "total_hours": int(t["total_hours"]), "classes_count": int(t["classes_count"])} for t in teachers],
        "assignments": [dict(a) for a in assignments],
    }


@router.post("/saas/teacher-assignments")
def create_teacher_assignment(
    payload: TeacherAssignmentCreate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    teacher = db.execute(
        text("SELECT id FROM users WHERE id = :tid AND school_id = :sid AND role = 'teacher'"),
        {"tid": payload.teacher_id, "sid": sid},
    ).first()
    if not teacher:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enseignant introuvable dans cet établissement")

    cls = db.execute(text("SELECT id FROM classes WHERE id = :cid AND school_id = :sid"), {"cid": payload.class_id, "sid": sid}).first()
    sub = db.execute(text("SELECT id FROM subjects WHERE id = :subid AND school_id = :sid"), {"subid": payload.subject_id, "sid": sid}).first()
    if not cls or not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe ou matière introuvable dans cet établissement")

    dup = db.execute(
        text("""
            SELECT id FROM teacher_assignments
            WHERE school_id = :sid AND teacher_id = :tid AND class_id = :cid AND subject_id = :subid
        """),
        {"sid": sid, "tid": payload.teacher_id, "cid": payload.class_id, "subid": payload.subject_id},
    ).first()
    if dup:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cette affectation existe déjà")

    db.execute(
        text("""
            INSERT INTO teacher_assignments (school_id, teacher_id, class_id, subject_id, weekly_hours)
            VALUES (:sid, :tid, :cid, :subid, :hours)
        """),
        {
            "sid": sid,
            "tid": payload.teacher_id,
            "cid": payload.class_id,
            "subid": payload.subject_id,
            "hours": payload.weekly_hours,
        },
    )
    db.commit()
    return {"message": "Affectation enseignant enregistrée"}


@router.delete("/saas/teacher-assignments/{assignment_id}")
def delete_teacher_assignment(
    assignment_id: int,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    res = db.execute(
        text("DELETE FROM teacher_assignments WHERE id = :aid AND school_id = :sid"),
        {"aid": assignment_id, "sid": sid},
    )
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Affectation introuvable")
    db.commit()
    return {"message": "Affectation supprimée"}


# ==============================================================================
# EMPLOIS DU TEMPS (SCHEDULES)
# ==============================================================================
@router.get("/saas/schedules")
def list_schedules(
    class_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    query = """
        SELECT sc.id, sc.class_id, sc.subject_id, sc.teacher_id,
               sc.day_of_week, sc.start_time, sc.end_time, sc.room_name,
               c.name AS class_name,
               sub.name AS subject_name,
               u.full_name AS teacher_name
        FROM schedules sc
        JOIN classes c ON sc.class_id = c.id
        JOIN subjects sub ON sc.subject_id = sub.id
        JOIN users u ON sc.teacher_id = u.id
        WHERE sc.school_id = :sid
    """
    params = {"sid": sid}

    if role == "student":
        query += " AND sc.class_id IN (SELECT class_id FROM students WHERE user_id = :uid AND school_id = :sid)"
        params["uid"] = uid
    elif role == "parent":
        query += " AND sc.class_id IN (SELECT class_id FROM students WHERE parent_id = :uid AND school_id = :sid)"
        params["uid"] = uid
    elif role == "teacher":
        query += " AND sc.teacher_id = :uid"
        params["uid"] = uid
    elif class_id:
        query += " AND sc.class_id = :cid"
        params["cid"] = class_id

    query += """
        ORDER BY CASE sc.day_of_week
            WHEN 'Lundi' THEN 1 WHEN 'Mardi' THEN 2 WHEN 'Mercredi' THEN 3
            WHEN 'Jeudi' THEN 4 WHEN 'Vendredi' THEN 5 ELSE 6 END,
        sc.start_time ASC
    """
    try:
        rows = db.execute(text(query), params).mappings().all()
        return [dict(r) for r in rows]
    except Exception:
        return []


@router.post("/saas/schedules")
def create_schedule(
    payload: ScheduleCreate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="L'heure de fin doit être postérieure à l'heure de début")

    cls = db.execute(text("SELECT id FROM classes WHERE id = :cid AND school_id = :sid"), {"cid": payload.class_id, "sid": sid}).first()
    sub = db.execute(text("SELECT id FROM subjects WHERE id = :subid AND school_id = :sid"), {"subid": payload.subject_id, "sid": sid}).first()
    tch = db.execute(text("SELECT id FROM users WHERE id = :tid AND school_id = :sid AND role = 'teacher'"), {"tid": payload.teacher_id, "sid": sid}).first()
    if not cls or not sub or not tch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe, matière ou enseignant introuvable dans cet établissement")

    conflict = db.execute(
        text("""
            SELECT id FROM schedules
            WHERE school_id = :sid
              AND day_of_week = :day
              AND start_time < :end_t
              AND end_time > :start_t
              AND (class_id = :cid OR teacher_id = :tid OR LOWER(room_name) = LOWER(:room))
        """),
        {
            "sid": sid,
            "day": payload.day_of_week,
            "start_t": payload.start_time,
            "end_t": payload.end_time,
            "cid": payload.class_id,
            "tid": payload.teacher_id,
            "room": payload.room_name.strip(),
        },
    ).first()
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conflit horaire : la classe, l'enseignant ou la salle est déjà occupé sur ce créneau",
        )

    db.execute(
        text("""
            INSERT INTO schedules (school_id, class_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_name)
            VALUES (:sid, :cid, :subid, :tid, :day, :start_t, :end_t, :room)
        """),
        {
            "sid": sid,
            "cid": payload.class_id,
            "subid": payload.subject_id,
            "tid": payload.teacher_id,
            "day": payload.day_of_week,
            "start_t": payload.start_time,
            "end_t": payload.end_time,
            "room": payload.room_name.strip(),
        },
    )
    db.commit()
    return {"message": "Créneau ajouté à l'emploi du temps"}


@router.delete("/saas/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    res = db.execute(text("DELETE FROM schedules WHERE id = :scid AND school_id = :sid"), {"scid": schedule_id, "sid": sid})
    if res.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Créneau introuvable")
    db.commit()
    return {"message": "Créneau supprimé"}


# ==============================================================================
# GESTION DES ÉLÈVES (CRUD) & BULLETINS
# ==============================================================================
@router.get("/saas/students")
def list_students(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    query = """
        SELECT st.id, st.status, st.city, st.parent_id, st.class_id, st.enrollment_date,
               u.full_name AS student_name, u.email AS student_email,
               up.full_name AS parent_name, up.email AS parent_email,
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

    query += " ORDER BY u.full_name ASC LIMIT 300"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(r) for r in rows]

@router.post("/saas/students")
def create_student(
    payload: StudentCreate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    clean_email = payload.email.strip().lower()

    cls = db.execute(
        text("SELECT id FROM classes WHERE id = :cid AND school_id = :sid"),
        {"cid": payload.class_id, "sid": sid},
    ).first()
    if not cls:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe introuvable dans cet établissement")

    if db.execute(
        text("SELECT id FROM users WHERE LOWER(email) = :email OR LOWER(username) = :email"),
        {"email": clean_email},
    ).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="L'email de l'élève est déjà utilisé")

    parent_id = payload.parent_id
    if parent_id:
        p_ok = db.execute(
            text("SELECT id FROM users WHERE id = :pid AND school_id = :sid AND role = 'parent'"),
            {"pid": parent_id, "sid": sid},
        ).first()
        if not p_ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent sélectionné introuvable dans cet établissement")
    elif payload.parent_name and payload.parent_email:
        p_email = payload.parent_email.strip().lower()
        existing_parent = db.execute(
            text("SELECT id, school_id, role FROM users WHERE LOWER(email) = :email"),
            {"email": p_email},
        ).mappings().first()
        if existing_parent:
            if existing_parent["school_id"] != sid or existing_parent["role"] != "parent":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="L'email du parent appartient déjà à un autre profil")
            parent_id = existing_parent["id"]
        else:
            parent_id = db.execute(
                text("""
                    INSERT INTO users (school_id, full_name, email, username, password_hash, role, must_change_password)
                    VALUES (:sid, :name, :email, :username, :pwd, 'parent', TRUE)
                    RETURNING id
                """),
                {
                    "sid": sid,
                    "name": payload.parent_name.strip(),
                    "email": p_email,
                    "username": p_email,
                    "pwd": hash_password(payload.password),
                },
            ).scalar()

    student_user_id = db.execute(
        text("""
            INSERT INTO users (school_id, full_name, email, username, password_hash, role, must_change_password)
            VALUES (:sid, :name, :email, :username, :pwd, 'student', TRUE)
            RETURNING id
        """),
        {
            "sid": sid,
            "name": payload.full_name.strip(),
            "email": clean_email,
            "username": clean_email,
            "pwd": hash_password(payload.password),
        },
    ).scalar()

    student_id = db.execute(
        text("""
            INSERT INTO students (school_id, user_id, parent_id, class_id, city, enrollment_date, status)
            VALUES (:sid, :uid, :pid, :cid, :city, :edate, 'active')
            RETURNING id
        """),
        {
            "sid": sid,
            "uid": student_user_id,
            "pid": parent_id,
            "cid": payload.class_id,
            "city": payload.city.strip(),
            "edate": date.today(),
        },
    ).scalar()

    db.commit()
    return {"message": "Élève inscrit avec succès", "student_id": student_id}
@router.patch("/saas/students/{student_id}")
def update_student(
    student_id: int,
    payload: StudentUpdate,
    current_user: dict = Depends(require_roles(["admin", "director"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    st = db.execute(text("SELECT id FROM students WHERE id = :stid AND school_id = :sid"), {"stid": student_id, "sid": sid}).first()
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève introuvable")

    updates = []
    params = {"stid": student_id, "sid": sid}
    if payload.class_id is not None:
        cls = db.execute(text("SELECT id FROM classes WHERE id = :cid AND school_id = :sid"), {"cid": payload.class_id, "sid": sid}).first()
        if not cls:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe introuvable")
        updates.append("class_id = :cid")
        params["cid"] = payload.class_id
    if payload.city:
        updates.append("city = :city")
        params["city"] = payload.city.strip()
    if payload.status:
        updates.append("status = :status")
        params["status"] = payload.status
    if payload.parent_id is not None:
        p_ok = db.execute(text("SELECT id FROM users WHERE id = :pid AND school_id = :sid AND role = 'parent'"), {"pid": payload.parent_id, "sid": sid}).first()
        if not p_ok:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable")
        updates.append("parent_id = :pid")
        params["pid"] = payload.parent_id

    if updates:
        db.execute(text(f"UPDATE students SET {', '.join(updates)} WHERE id = :stid AND school_id = :sid"), params)
        db.commit()
    return {"message": "Dossier élève mis à jour"}


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


# ==============================================================================
# ÉVALUATIONS, NOTES & ASSIDUITÉ
# ==============================================================================
@router.post("/saas/grades")
def add_grade(
    payload: GradeCreate,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

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

    subject = db.execute(
        text("SELECT id FROM subjects WHERE id = :subid AND school_id = :sid"),
        {"subid": payload.subject_id, "sid": sid},
    ).first()
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matière introuvable dans votre établissement",
        )

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


@router.delete("/saas/grades/{grade_id}")
def delete_grade(
    grade_id: int,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

    grade = db.execute(
        text("""
            SELECT g.id, g.subject_id, st.class_id
            FROM grades g
            JOIN students st ON g.student_id = st.id
            WHERE g.id = :gid AND g.school_id = :sid
        """),
        {"gid": grade_id, "sid": sid},
    ).mappings().first()
    if not grade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note introuvable")

    if role == "teacher":
        assigned = db.execute(
            text("""
                SELECT 1 FROM teacher_assignments
                WHERE school_id = :sid AND teacher_id = :uid AND class_id = :cid AND subject_id = :subid
            """),
            {"sid": sid, "uid": uid, "cid": grade["class_id"], "subid": grade["subject_id"]},
        ).first()
        if not assigned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Suppression non autorisée pour cette matière")

    db.execute(text("DELETE FROM grades WHERE id = :gid AND school_id = :sid"), {"gid": grade_id, "sid": sid})
    db.commit()
    return {"message": "Note supprimée"}


@router.post("/saas/attendance")
def add_attendance(
    payload: AttendanceCreate,
    current_user: dict = Depends(require_roles(["teacher", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    role = current_user["role"]
    uid = current_user["id"]

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


# ==============================================================================
# COMPTABILITÉ & ÉCHÉANCIERS
# ==============================================================================
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
            LIMIT 300
        """),
        {"sid": sid},
    ).mappings().all()
    return [{**dict(r), "amount_due": float(r["amount_due"]), "amount_paid": float(r["amount_paid"])} for r in rows]


@router.post("/saas/payments")
def create_payment(
    payload: PaymentCreate,
    current_user: dict = Depends(require_roles(["accountant", "admin"])),
    db: Session = Depends(get_db),
):
    sid = current_user["school_id"]
    st = db.execute(
        text("SELECT id FROM students WHERE id = :stid AND school_id = :sid"),
        {"stid": payload.student_id, "sid": sid},
    ).first()
    if not st:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Élève introuvable dans cet établissement")

    initial_status = "overdue" if payload.due_date < date.today() else "partial"
    db.execute(
        text("""
            INSERT INTO payments (school_id, student_id, title, amount_due, amount_paid, due_date, paid_date, status)
            VALUES (:sid, :stid, :title, :due, 0, :ddate, NULL, :status)
        """),
        {
            "sid": sid,
            "stid": payload.student_id,
            "title": payload.title.strip(),
            "due": round(payload.amount_due, 2),
            "ddate": payload.due_date,
            "status": initial_status,
        },
    )
    db.commit()
    return {"message": "Échéance de scolarité créée avec succès"}


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


# ==============================================================================
# COMMUNICATION & NOTIFICATIONS PARENTS
# ==============================================================================
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
                ORDER BY m.created_at DESC LIMIT 80
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
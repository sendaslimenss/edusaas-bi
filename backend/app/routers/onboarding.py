from datetime import datetime, timedelta, timezone
import re
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    generate_one_time_token,
    generate_secure_temp_password,
    get_current_user,
    hash_password,
    hash_token,
    require_super_admin,
    verify_password,
)
from app.database import get_db
from app.services.email_service import (
    EmailDeliveryError,
    send_school_admin_credentials_email,
    send_super_admin_registration_alert,
)

router = APIRouter(tags=["Multi-Tenant Onboarding"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{4,40}$")
PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,25}$")
RESERVED_USERNAMES = {"admin", "superadmin", "super_admin", "root", "system", "aceda", "support"}


class SchoolRegistrationIn(BaseModel):
    school_name: str = Field(..., min_length=3, max_length=200)
    school_email: EmailStr
    school_phone: str = Field(..., min_length=7, max_length=50)
    country: str = Field(..., min_length=2, max_length=100)
    city: str = Field(..., min_length=2, max_length=100)
    address: str = Field(..., min_length=5, max_length=500)
    admin_full_name: str = Field(..., min_length=3, max_length=200)
    admin_email: EmailStr
    admin_phone: str = Field(..., min_length=7, max_length=50)
    requested_username: str = Field(..., min_length=4, max_length=40)

    @field_validator("school_phone", "admin_phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = v.strip()
        if not PHONE_RE.match(cleaned):
            raise ValueError("Numéro de téléphone invalide (7 à 25 chiffres/caractères autorisés).")
        return cleaned

    @field_validator("requested_username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if not USERNAME_RE.match(cleaned):
            raise ValueError("Le nom d'utilisateur doit contenir 4 à 40 caractères (lettres, chiffres, ., _, -).")
        if cleaned in RESERVED_USERNAMES:
            raise ValueError("Ce nom d'utilisateur est réservé par la plateforme.")
        return cleaned


class RejectRequestIn(BaseModel):
    reason: str = Field(..., min_length=5, max_length=500)


class ActivateAccountIn(BaseModel):
    token: str = Field(..., min_length=16)
    new_password: str = Field(..., min_length=10, max_length=128)


class ChangeInitialPasswordIn(BaseModel):
    current_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=10, max_length=128)


def _validate_strong_password(pwd: str) -> None:
    if (
        len(pwd) < 10
        or not any(c.islower() for c in pwd)
        or not any(c.isupper() for c in pwd)
        or not any(c.isdigit() for c in pwd)
        or not any(not c.isalnum() for c in pwd)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule, un chiffre et un symbole.",
        )


@router.post("/api/public/school-registrations", status_code=status.HTTP_201_CREATED)
def register_new_school(payload: SchoolRegistrationIn, db: Session = Depends(get_db)):
    school_name = payload.school_name.strip()
    school_email = payload.school_email.strip().lower()
    admin_email = payload.admin_email.strip().lower()
    username = payload.requested_username.strip().lower()

    # Vérification des doublons dans les établissements existants
    existing_school = db.execute(
        text("SELECT id FROM schools WHERE LOWER(TRIM(name)) = :n OR LOWER(TRIM(COALESCE(email, ''))) = :e"),
        {"n": school_name.lower(), "e": school_email},
    ).first()
    if existing_school:
        raise HTTPException(status_code=409, detail="Un établissement avec ce nom ou cet email existe déjà.")

    # Vérification des doublons dans les utilisateurs existants
    existing_user = db.execute(
        text("SELECT id FROM users WHERE LOWER(TRIM(COALESCE(username, ''))) = :u OR LOWER(TRIM(email)) = :ae"),
        {"u": username, "ae": admin_email},
    ).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Ce nom d'utilisateur ou cet email administrateur est déjà utilisé.")

    # Vérification des demandes en cours ou déjà approuvées
    existing_req = db.execute(
        text("""
            SELECT id FROM school_registration_requests
            WHERE status IN ('PENDING', 'APPROVED')
              AND (
                  LOWER(TRIM(school_name)) = :n
                  OR LOWER(TRIM(school_email)) = :e
                  OR LOWER(TRIM(requested_username)) = :u
                  OR LOWER(TRIM(admin_email)) = :ae
              )
        """),
        {"n": school_name.lower(), "e": school_email, "u": username, "ae": admin_email},
    ).first()
    if existing_req:
        raise HTTPException(
            status_code=409,
            detail="Une demande est déjà en cours de traitement ou approuvée pour cet établissement ou cet identifiant.",
        )

    try:
        row = db.execute(
            text("""
                INSERT INTO school_registration_requests (
                    school_name, school_email, school_phone, country, city, address,
                    admin_full_name, admin_email, admin_phone, requested_username, status
                )
                VALUES (
                    :sname, :semail, :sphone, :country, :city, :addr,
                    :aname, :aemail, :aphone, :uname, 'PENDING'
                )
                RETURNING id, CAST(request_uuid AS TEXT) AS request_uuid, school_name, school_email,
                          school_phone, country, city, address, admin_full_name, admin_email,
                          admin_phone, requested_username, status, created_at
            """),
            {
                "sname": school_name,
                "semail": school_email,
                "sphone": payload.school_phone,
                "country": payload.country.strip(),
                "city": payload.city.strip(),
                "addr": payload.address.strip(),
                "aname": payload.admin_full_name.strip(),
                "aemail": admin_email,
                "aphone": payload.admin_phone,
                "uname": username,
            },
        ).mappings().first()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Une demande d'inscription est déjà enregistrée pour cet établissement ou ce nom d'utilisateur.",
        )

    reg_dict = dict(row)

    # Notification Resend non bloquante : une erreur email ne supprime jamais la demande enregistrée
    email_sent = True
    email_message_id = None
    email_warning = None
    try:
        email_message_id = send_super_admin_registration_alert(db, reg_dict)
    except EmailDeliveryError as exc:
        email_sent = False
        email_warning = str(exc)

    return {
        "message": "Votre demande d'inscription a été enregistrée avec le statut PENDING. Elle sera examinée par le Super Administrateur.",
        "request_id": reg_dict["id"],
        "request_uuid": reg_dict["request_uuid"],
        "status": "PENDING",
        "email_sent": email_sent,
        "email_message_id": email_message_id,
        "email_warning": email_warning,
    }


@router.get("/api/super-admin/stats")
def get_super_admin_stats(
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    stats = db.execute(
        text("""
            SELECT
                (SELECT COUNT(*) FROM schools) AS total_schools,
                (SELECT COUNT(*) FROM school_registration_requests) AS total_requests,
                (SELECT COUNT(*) FROM school_registration_requests WHERE status = 'PENDING') AS pending_requests,
                (SELECT COUNT(*) FROM school_registration_requests WHERE status = 'APPROVED') AS approved_requests,
                (SELECT COUNT(*) FROM school_registration_requests WHERE status = 'REJECTED') AS rejected_requests,
                (SELECT COUNT(*) FROM email_delivery_logs WHERE status = 'SENT') AS emails_sent,
                (SELECT COUNT(*) FROM email_delivery_logs WHERE status = 'FAILED') AS emails_failed
        """)
    ).mappings().first()
    return dict(stats)


@router.get("/api/super-admin/registrations")
def list_school_registrations(
    status_filter: str | None = None,
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    query = """
        SELECT r.id, CAST(r.request_uuid AS TEXT) AS request_uuid,
               r.school_name, r.school_email, r.school_phone, r.country, r.city, r.address,
               r.admin_full_name, r.admin_email, r.admin_phone, r.requested_username,
               r.status, r.rejection_reason, r.approved_school_id,
               CAST(s.tenant_uuid AS TEXT) AS tenant_uuid,
               r.reviewed_at, r.created_at
        FROM school_registration_requests r
        LEFT JOIN schools s ON r.approved_school_id = s.id
    """
    params = {}
    if status_filter and status_filter.upper() in ("PENDING", "APPROVED", "REJECTED"):
        query += " WHERE r.status = :st"
        params["st"] = status_filter.upper()
    query += " ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC"

    rows = db.execute(text(query), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/api/super-admin/schools")
def list_all_tenants(
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT s.id, CAST(s.tenant_uuid AS TEXT) AS tenant_uuid,
                   s.name, s.email, s.phone, s.country, s.city, s.address, s.status, s.created_at,
                   (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id) AS users_count,
                   (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) AS students_count,
                   (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) AS classes_count
            FROM schools s
            ORDER BY s.id ASC
        """)
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/api/super-admin/email-logs")
def list_email_logs(
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT id, recipient_email, email_type, subject, provider,
                   provider_message_id, status, error_message, related_request_id, created_at
            FROM email_delivery_logs
            ORDER BY created_at DESC
            LIMIT 50
        """)
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/api/super-admin/registrations/{request_id}/approve")
def approve_school_registration(
    
    request_id: int,
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    
    temp_password = generate_secure_temp_password(16)
    temp_password_hash = hash_password(temp_password)
    raw_token, token_hash = generate_one_time_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    # Transaction atomique PostgreSQL + verrouillage exclusif SELECT FOR UPDATE
    try:
        reg = db.execute(
            text("""
                SELECT * FROM school_registration_requests
                WHERE id = :rid
                FOR UPDATE
            """),
            {"rid": request_id},
        ).mappings().first()

        if not reg:
            db.rollback()
            raise HTTPException(status_code=404, detail="Demande d'inscription introuvable.")
        if reg["status"] != "PENDING":
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Cette demande a déjà été traitée (statut actuel : {reg['status']}).",
            )

        school_row = db.execute(
            text("""
                INSERT INTO schools (name, email, phone, country, city, address, total_capacity, status)
                VALUES (:name, :email, :phone, :country, :city, :addr, 300, 'active')
                RETURNING id, CAST(tenant_uuid AS TEXT) AS tenant_uuid, name
            """),
            {
                "name": reg["school_name"],
                "email": reg["school_email"],
                "phone": reg["school_phone"],
                "country": reg["country"],
                "city": reg["city"],
                "addr": reg["address"],
            },
        ).mappings().first()
        new_school_id = int(school_row["id"])
        tenant_uuid = school_row["tenant_uuid"]

        admin_user_id = db.execute(
            text("""
                INSERT INTO users (
                    school_id, full_name, email, username, phone,
                    password_hash, role, must_change_password, is_active
                )
                VALUES (
                    :sid, :fname, :email, :uname, :phone,
                    :phash, 'admin', TRUE, TRUE
                )
                RETURNING id
            """),
            {
                "sid": new_school_id,
                "fname": reg["admin_full_name"],
                "email": reg["admin_email"],
                "uname": reg["requested_username"],
                "phone": reg["admin_phone"],
                "phash": temp_password_hash,
            },
        ).scalar()

        # Espace scolaire totalement vide : 0 élève, 0 note, 0 paiement, 0 classe
        db.execute(
            text("""
                INSERT INTO school_settings (school_id, academic_year, grading_scale, currency, timezone, onboarding_completed)
                VALUES (:sid, '2025-2026', 20.00, 'TND', 'Africa/Tunis', FALSE)
            """),
            {"sid": new_school_id},
        )

        db.execute(
            text("""
                INSERT INTO account_activation_tokens (user_id, token_hash, expires_at)
                VALUES (:uid, :thash, :exp)
            """),
            {"uid": admin_user_id, "thash": token_hash, "exp": expires_at},
        )

        db.execute(
            text("""
                UPDATE school_registration_requests
                SET status = 'APPROVED',
                    approved_school_id = :sid,
                    reviewed_by = :reviewer,
                    reviewed_at = NOW()
                WHERE id = :rid
            """),
            {"sid": new_school_id, "reviewer": current_user["id"], "rid": request_id},
        )

        db.commit()
    except HTTPException:
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Conflit d'unicité lors de la création de l'établissement ou de l'administrateur.",
        ) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Erreur interne lors de l'initialisation transactionnelle de l'établissement.",
        ) from exc

    email_sent = True
    email_message_id = None
    email_warning = None
    try:
        email_message_id = send_school_admin_credentials_email(
            db,
            request_id=request_id,
            school_name=reg["school_name"],
            tenant_uuid=tenant_uuid,
            admin_name=reg["admin_full_name"],
            admin_email=reg["admin_email"],
            username=reg["requested_username"],
            activation_token=raw_token,
        )
    except EmailDeliveryError as exc:
        email_sent = False
        email_warning = str(exc)

    return {
        "message": f"Établissement '{reg['school_name']}' créé et provisionné avec succès.",
        "school_id": new_school_id,
        "tenant_uuid": tenant_uuid,
        "admin_user_id": admin_user_id,
        "admin_username": reg["requested_username"],
        "email_sent": email_sent,
        "email_message_id": email_message_id,
        "email_warning": email_warning,
    }
class DirectSchoolCreateIn(BaseModel):
    school_name: str = Field(..., min_length=3, max_length=200)
    school_email: EmailStr
    school_phone: str = Field(default="+21600000000", min_length=7, max_length=50)
    country: str = Field(default="Tunisie", min_length=2, max_length=100)
    city: str = Field(..., min_length=2, max_length=100)
    address: str = Field(default="Adresse non renseignée", min_length=3, max_length=500)
    admin_full_name: str = Field(..., min_length=3, max_length=200)
    admin_email: EmailStr
    admin_phone: str = Field(default="+21600000000", min_length=7, max_length=50)
    requested_username: str | None = Field(default=None, min_length=4, max_length=40)

@router.post("/api/super-admin/registrations/{request_id}/reject")
def reject_school_registration(
    request_id: int,
    payload: RejectRequestIn,
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    updated = db.execute(
        text("""
            UPDATE school_registration_requests
            SET status = 'REJECTED',
                rejection_reason = :reason,
                reviewed_by = :reviewer,
                reviewed_at = NOW()
            WHERE id = :rid AND status = 'PENDING'
            RETURNING id
        """),
        {"reason": payload.reason.strip(), "reviewer": current_user["id"], "rid": request_id},
    ).first()
    db.commit()
    if not updated:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà traitée.")
    return {"message": "Demande d'inscription rejetée.", "request_id": request_id, "status": "REJECTED"}


@router.post("/api/auth/activate-account")
def activate_account_with_token(payload: ActivateAccountIn, db: Session = Depends(get_db)):
    _validate_strong_password(payload.new_password)
    thash = hash_token(payload.token)

    tok = db.execute(
        text("""
            SELECT t.id AS token_id, t.user_id, t.expires_at, t.used_at,
                   u.school_id, u.full_name, u.email, u.username, u.role,
                   s.name AS school_name, s.city AS school_city
            FROM account_activation_tokens t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN schools s ON u.school_id = s.id
            WHERE t.token_hash = :thash
            FOR UPDATE OF t
        """),
        {"thash": thash},
    ).mappings().first()

    if not tok or tok["used_at"] is not None or tok["expires_at"] < datetime.now(timezone.utc):
        db.rollback()
        raise HTTPException(status_code=400, detail="Lien d'activation invalide, expiré ou déjà utilisé.")

    db.execute(
        text("UPDATE users SET password_hash = :phash, must_change_password = FALSE WHERE id = :uid"),
        {"phash": hash_password(payload.new_password), "uid": tok["user_id"]},
    )
    db.execute(
        text("UPDATE account_activation_tokens SET used_at = NOW() WHERE id = :tid"),
        {"tid": tok["token_id"]},
    )
    db.commit()

    access_token = create_access_token({"sub": str(tok["user_id"]), "school_id": tok["school_id"], "role": tok["role"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "must_change_password": False,
        "user": {
            "id": tok["user_id"],
            "school_id": tok["school_id"],
            "full_name": tok["full_name"],
            "email": tok["email"],
            "username": tok["username"],
            "role": tok["role"],
            "school_name": tok["school_name"],
            "school_city": tok["school_city"],
            "must_change_password": False,
        },
    }


@router.post("/api/auth/change-initial-password")
def change_initial_password(
    payload: ChangeInitialPasswordIn,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_strong_password(payload.new_password)
    row = db.execute(
        text("SELECT password_hash FROM users WHERE id = :uid"),
        {"uid": current_user["id"]},
    ).mappings().first()

    if not row or not verify_password(payload.current_password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Mot de passe temporaire actuel incorrect.")

    if verify_password(payload.new_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent du mot de passe temporaire.")

    db.execute(
        text("UPDATE users SET password_hash = :phash, must_change_password = FALSE WHERE id = :uid"),
        {"phash": hash_password(payload.new_password), "uid": current_user["id"]},
    )
    db.commit()
    return {"message": "Mot de passe mis à jour avec succès.", "must_change_password": False}
@router.post("/api/super-admin/schools", status_code=status.HTTP_201_CREATED)
def create_school_directly_by_super_admin(
    payload: DirectSchoolCreateIn,
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    school_name = payload.school_name.strip()
    school_email = payload.school_email.strip().lower()
    admin_email = payload.admin_email.strip().lower()
    username = (
        payload.requested_username.strip().lower()
        if payload.requested_username
        else re.sub(r"[^a-z0-9._-]", "_", admin_email.split("@")[0])[:32]
    )
    if len(username) < 4:
        username = f"admin_{username}"

    existing_school = db.execute(
        text("SELECT id FROM schools WHERE LOWER(TRIM(name)) = :n OR LOWER(TRIM(COALESCE(email, ''))) = :e"),
        {"n": school_name.lower(), "e": school_email},
    ).first()
    if existing_school:
        raise HTTPException(status_code=409, detail="Un établissement avec ce nom ou cet email existe déjà.")

    existing_user = db.execute(
        text("SELECT id FROM users WHERE LOWER(TRIM(COALESCE(username, ''))) = :u OR LOWER(TRIM(email)) = :ae"),
        {"u": username, "ae": admin_email},
    ).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Cet email ou nom d'utilisateur administrateur existe déjà.")

    temp_password_hash = hash_password(generate_secure_temp_password(16))
    raw_token, token_hash = generate_one_time_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    try:
        school_row = db.execute(
            text("""
                INSERT INTO schools (name, email, phone, country, city, address, total_capacity, status)
                VALUES (:name, :email, :phone, :country, :city, :addr, 300, 'active')
                RETURNING id, CAST(tenant_uuid AS TEXT) AS tenant_uuid, name
            """),
            {
                "name": school_name,
                "email": school_email,
                "phone": payload.school_phone.strip(),
                "country": payload.country.strip(),
                "city": payload.city.strip(),
                "addr": payload.address.strip(),
            },
        ).mappings().first()
        new_school_id = int(school_row["id"])
        tenant_uuid = school_row["tenant_uuid"]

        admin_user_id = db.execute(
            text("""
                INSERT INTO users (
                    school_id, full_name, email, username, phone,
                    password_hash, role, must_change_password, is_active
                )
                VALUES (
                    :sid, :fname, :email, :uname, :phone,
                    :phash, 'admin', TRUE, TRUE
                )
                RETURNING id
            """),
            {
                "sid": new_school_id,
                "fname": payload.admin_full_name.strip(),
                "email": admin_email,
                "uname": username,
                "phone": payload.admin_phone.strip(),
                "phash": temp_password_hash,
            },
        ).scalar()

        db.execute(
            text("""
                INSERT INTO school_settings (school_id, academic_year, grading_scale, currency, timezone, onboarding_completed)
                VALUES (:sid, '2025-2026', 20.00, 'TND', 'Africa/Tunis', FALSE)
            """),
            {"sid": new_school_id},
        )

        db.execute(
            text("""
                INSERT INTO account_activation_tokens (user_id, token_hash, expires_at)
                VALUES (:uid, :thash, :exp)
            """),
            {"uid": admin_user_id, "thash": token_hash, "exp": expires_at},
        )

        reg_id = db.execute(
            text("""
                INSERT INTO school_registration_requests (
                    school_name, school_email, school_phone, country, city, address,
                    admin_full_name, admin_email, admin_phone, requested_username,
                    status, approved_school_id, reviewed_by, reviewed_at
                )
                VALUES (
                    :sname, :semail, :sphone, :country, :city, :addr,
                    :aname, :aemail, :aphone, :uname,
                    'APPROVED', :sid, :reviewer, NOW()
                )
                RETURNING id
            """),
            {
                "sname": school_name,
                "semail": school_email,
                "sphone": payload.school_phone.strip(),
                "country": payload.country.strip(),
                "city": payload.city.strip(),
                "addr": payload.address.strip(),
                "aname": payload.admin_full_name.strip(),
                "aemail": admin_email,
                "aphone": payload.admin_phone.strip(),
                "uname": username,
                "sid": new_school_id,
                "reviewer": current_user["id"],
            },
        ).scalar()

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflit d'unicité lors de la création de l'établissement.") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erreur lors de la création transactionnelle de l'établissement.") from exc

    email_sent = True
    email_message_id = None
    email_warning = None
    try:
        email_message_id = send_school_admin_credentials_email(
            db,
            request_id=int(reg_id),
            school_name=school_name,
            tenant_uuid=tenant_uuid,
            admin_name=payload.admin_full_name.strip(),
            admin_email=admin_email,
            username=username,
            activation_token=raw_token,
        )
    except EmailDeliveryError as exc:
        email_sent = False
        email_warning = str(exc)

    return {
        "message": f"Établissement '{school_name}' créé avec succès.",
        "request_id": int(reg_id),
        "school_id": new_school_id,
        "tenant_uuid": tenant_uuid,
        "admin_user_id": admin_user_id,
        "admin_email": admin_email,
        "admin_username": username,
        "email_sent": email_sent,
        "email_message_id": email_message_id,
        "email_warning": email_warning,
    }


@router.post("/api/super-admin/registrations/{request_id}/resend-welcome-email")
def resend_school_admin_welcome_email(
    request_id: int,
    current_user: dict = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT r.id, r.school_name, r.admin_full_name, r.admin_email, r.requested_username,
                   r.status, r.approved_school_id,
                   CAST(s.tenant_uuid AS TEXT) AS tenant_uuid,
                   u.id AS admin_user_id
            FROM school_registration_requests r
            JOIN schools s ON r.approved_school_id = s.id
            JOIN users u ON u.school_id = s.id AND u.role = 'admin'
            WHERE r.id = :rid
            ORDER BY u.id ASC
            LIMIT 1
        """),
        {"rid": request_id},
    ).mappings().first()

    if not row or row["status"] != "APPROVED":
        raise HTTPException(status_code=404, detail="Demande approuvée introuvable.")

    raw_token, token_hash = generate_one_time_token()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    db.execute(
        text("""
            INSERT INTO account_activation_tokens (user_id, token_hash, expires_at)
            VALUES (:uid, :thash, :exp)
        """),
        {"uid": row["admin_user_id"], "thash": token_hash, "exp": expires_at},
    )
    db.commit()

    try:
        msg_id = send_school_admin_credentials_email(
            db,
            request_id=request_id,
            school_name=row["school_name"],
            tenant_uuid=row["tenant_uuid"],
            admin_name=row["admin_full_name"],
            admin_email=row["admin_email"],
            username=row["requested_username"],
            activation_token=raw_token,
            allow_resend_duplicate=True,
        )
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=502, detail=f"Échec de renvoi Gmail SMTP : {exc}") from exc

    return {
        "message": f"Email d'activation renvoyé à {row['admin_email']}.",
        "email_sent": True,
        "email_message_id": msg_id,
    }
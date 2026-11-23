import os
import time
import hashlib
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db

load_dotenv(encoding="utf-8-sig")

SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY or len(SECRET_KEY) < 24:
    raise RuntimeError(
        "SECRET_KEY manquante ou trop courte (< 24 caractères). "
        "Définissez une clé secrète forte dans backend/.env ou sur Render."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 12)))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
security = HTTPBearer()

_LOGIN_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 300


def check_login_rate_limit(identifier: str) -> None:
    now = time.time()
    recent = [ts for ts in _LOGIN_ATTEMPTS[identifier] if now - ts < LOGIN_WINDOW_SECONDS]
    _LOGIN_ATTEMPTS[identifier] = recent
    if len(recent) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives de connexion échouées. Réessayez dans 5 minutes.",
        )


def record_login_failure(identifier: str) -> None:
    _LOGIN_ATTEMPTS[identifier].append(time.time())


def clear_login_failures(identifier: str) -> None:
    _LOGIN_ATTEMPTS.pop(identifier, None)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_activation_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)
    return raw_token, hash_token(raw_token)


def generate_one_time_token() -> tuple[str, str]:
    return generate_activation_token()


def generate_secure_temp_password(length: int = 16) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(not c.isalnum() for c in pwd)
        ):
            return pwd


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"iat": now, "exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        token_school_id = payload.get("school_id")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée ou invalide")

    user = db.execute(
        text("""
            SELECT u.id,
                   u.school_id,
                   u.full_name,
                   u.email,
                   u.username,
                   u.role,
                   COALESCE(u.is_active, TRUE) AS is_active,
                   COALESCE(u.must_change_password, FALSE) AS must_change_password,
                   s.name AS school_name,
                   s.city AS school_city,
                   CAST(s.tenant_uuid AS TEXT) AS tenant_uuid,
                   COALESCE(s.status, 'active') AS school_status
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            WHERE u.id = :uid
        """),
        {"uid": int(user_id)},
    ).mappings().first()

    if not user or not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable ou désactivé")

    db_school_id = user["school_id"]
    if db_school_id is None:
        if token_school_id is not None or user["role"] != "super_admin":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contexte Super Admin invalide")
    else:
        if user["school_status"] != "active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Établissement suspendu ou inactif")
        if token_school_id is None or int(token_school_id) != int(db_school_id):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contexte établissement invalide")

    return dict(user)


def require_password_changed(current_user: dict = Depends(get_current_user)):
    if current_user.get("must_change_password"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Changement de mot de passe obligatoire avant d'accéder à la plateforme.",
        )
    return current_user


def require_roles(allowed_roles: list[str]):
    def _role_checker(current_user: dict = Depends(require_password_changed)) -> dict:
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissions insuffisantes pour cette opération.",
            )
        if current_user.get("role") != "super_admin" and current_user.get("school_id") is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Aucun établissement rattaché à ce compte.",
            )
        return current_user

    return _role_checker


def require_tenant_user(current_user: dict = Depends(require_password_changed)):
    if current_user.get("school_id") is None or current_user.get("role") == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux utilisateurs rattachés à un établissement.",
        )
    return current_user


def require_super_admin(current_user: dict = Depends(require_password_changed)):
    if current_user.get("role") != "super_admin" or current_user.get("school_id") is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès strictement réservé au Super Administrateur de la plateforme.",
        )
    configured_sa = os.getenv("SUPER_ADMIN_EMAIL", "sendaslimenss@gmail.com").strip().lower()
    if configured_sa and current_user.get("email", "").strip().lower() != configured_sa:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte Super Administrateur non autorisé.",
        )
    return current_user
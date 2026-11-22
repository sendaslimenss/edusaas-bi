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

# Protection anti-brute-force en mémoire (fenêtre glissante de 5 minutes)
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


def generate_activation_token() -> tuple[str, str]:
    """Génère un jeton brut (envoyé par email) et son empreinte SHA-256 (stockée en base)."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)
    return raw_token, token_hash

def generate_one_time_token() -> tuple[str, str]:
    """Génère un jeton à usage unique (brut + empreinte SHA-256)."""
    return generate_activation_token()

def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


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
                   u.role,
                   COALESCE(u.must_change_password, FALSE) AS must_change_password,
                   s.name AS school_name,
                   s.city AS school_city
            FROM users u
            LEFT JOIN schools s ON u.school_id = s.id
            WHERE u.id = :uid
        """),
        {"uid": int(user_id)},
    ).mappings().first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")

    db_school_id = user["school_id"]
    if db_school_id is None:
        # Compte super_admin (aucun établissement rattaché)
        if token_school_id is not None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contexte établissement invalide")
    elif token_school_id is not None and int(token_school_id) != int(db_school_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contexte établissement invalide")

    return dict(user)


def require_password_changed(current_user: dict = Depends(get_current_user)):
    """Bloque l'accès tant que l'utilisateur n'a pas remplacé son mot de passe temporaire."""
    if current_user.get("must_change_password"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Changement de mot de passe obligatoire avant d'accéder à la plateforme.",
        )
    return current_user


def require_roles(
    allowed_roles: List[str],
    allow_password_change_pending: bool = False,
):
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé pour le profil '{current_user['role']}'",
            )
        if not allow_password_change_pending and current_user.get("must_change_password"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Changement de mot de passe obligatoire avant d'accéder à la plateforme.",
            )
        return current_user

    return role_checker
def generate_secure_temp_password(length: int = 14) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))
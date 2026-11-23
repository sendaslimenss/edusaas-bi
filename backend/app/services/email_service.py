import base64
import html
import logging
import os
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from urllib.parse import quote

import httpx
from email_validator import EmailNotValidError, validate_email
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("aceda.email")

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

DEFAULT_FRONTEND_URL = "https://edusaas-bi.vercel.app"
DEFAULT_SUPER_ADMIN_EMAIL = "sendaslimenss@gmail.com"
DEFAULT_MAIL_FROM_NAME = "ACEDA Enterprise"

_TOKEN_CACHE: dict[str, object] = {
    "access_token": "",
    "expires_at": 0.0,
}


class EmailDeliveryError(Exception):
    """Raised when transactional email delivery via Gmail API fails."""


def _esc(value: object) -> str:
    return html.escape(str(value or ""))


def _get_frontend_url() -> str:
    raw = os.getenv("FRONTEND_URL", DEFAULT_FRONTEND_URL).strip().rstrip("/")
    return raw or DEFAULT_FRONTEND_URL


def _sanitize_header_value(value: str) -> str:
    if "\r" in value or "\n" in value:
        raise EmailDeliveryError("Caractères de contrôle interdits dans les en-têtes email.")
    return value.strip()


def _validate_recipient(recipient: str) -> str:
    cleaned = _sanitize_header_value(recipient)
    try:
        info = validate_email(cleaned, check_deliverability=False)
        return info.normalized
    except EmailNotValidError as exc:
        raise EmailDeliveryError(f"Adresse email destinataire invalide : {exc}") from exc


def _get_gmail_api_config() -> dict:
    client_id = os.getenv("GMAIL_CLIENT_ID", "").strip()
    client_secret = os.getenv("GMAIL_CLIENT_SECRET", "").strip()
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN", "").strip()
    from_address = os.getenv("MAIL_FROM_ADDRESS", DEFAULT_SUPER_ADMIN_EMAIL).strip()
    from_name = _sanitize_header_value(os.getenv("MAIL_FROM_NAME", DEFAULT_MAIL_FROM_NAME))

    if not client_id or not client_secret or not refresh_token or not from_address:
        raise EmailDeliveryError(
            "Configuration Gmail API incomplète : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, "
            "GMAIL_REFRESH_TOKEN ou MAIL_FROM_ADDRESS manquant."
        )

    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "from_address": from_address,
        "from_name": from_name,
    }


def _sanitize_error_message(raw_error: str, secrets_to_mask: list[str]) -> str:
    msg = str(raw_error or "Erreur Gmail API inconnue")
    for secret in secrets_to_mask:
        if secret:
            msg = msg.replace(secret, "***")
    return msg[:500]


def _get_gmail_access_token(cfg: dict, force_refresh: bool = False) -> str:
    now = time.monotonic()
    cached_token = str(_TOKEN_CACHE.get("access_token") or "")
    expires_at = float(_TOKEN_CACHE.get("expires_at") or 0.0)
    if not force_refresh and cached_token and now < expires_at:
        return cached_token

    secrets_to_mask = [cfg["client_secret"], cfg["refresh_token"]]
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": cfg["client_id"],
                    "client_secret": cfg["client_secret"],
                    "refresh_token": cfg["refresh_token"],
                    "grant_type": "refresh_token",
                },
            )
            data = resp.json() if resp.content else {}
    except Exception as exc:
        raise EmailDeliveryError(
            _sanitize_error_message(f"Erreur réseau OAuth2 Google : {exc}", secrets_to_mask)
        ) from exc

    if resp.status_code != 200 or not data.get("access_token"):
        err_code = data.get("error", f"HTTP {resp.status_code}")
        err_desc = data.get("error_description", "Impossible d'obtenir un access_token Gmail.")
        raise EmailDeliveryError(
            _sanitize_error_message(f"Échec authentification Gmail OAuth2 ({err_code}) : {err_desc}", secrets_to_mask)
        )

    access_token = str(data["access_token"])
    expires_in = int(data.get("expires_in", 3599))
    _TOKEN_CACHE["access_token"] = access_token
    _TOKEN_CACHE["expires_at"] = now + max(60, expires_in - 60)
    return access_token


def _has_already_sent(db: Session, email_type: str, recipient: str, related_request_id: int | None) -> str | None:
    if related_request_id is None:
        return None
    try:
        row = db.execute(
            text("""
                SELECT provider_message_id
                FROM email_delivery_logs
                WHERE related_request_id = :req_id
                  AND email_type = :etype
                  AND LOWER(TRIM(recipient_email)) = :rec
                  AND status = 'SENT'
                ORDER BY id DESC
                LIMIT 1
            """),
            {"req_id": related_request_id, "etype": email_type, "rec": recipient.lower()},
        ).first()
        if row:
            return str(row[0] or "ALREADY_SENT")
    except Exception as exc:
        logger.warning("Vérification de doublon email ignorée : %s", exc)
    return None


def _log_email(
    db: Session,
    recipient: str,
    email_type: str,
    subject: str,
    delivery_status: str,
    provider_message_id: str | None,
    error_message: str | None,
    related_request_id: int | None,
) -> None:
    try:
        db.execute(
            text("""
                INSERT INTO email_delivery_logs
                    (recipient_email, email_type, subject, provider, provider_message_id, status, error_message, related_request_id)
                VALUES
                    (:rec, :etype, :subj, 'gmail_api', :mid, :st, :err, :req_id)
            """),
            {
                "rec": recipient,
                "etype": email_type,
                "subj": subject[:255],
                "mid": provider_message_id,
                "st": delivery_status,
                "err": error_message,
                "req_id": related_request_id,
            },
        )
        db.commit()
    except Exception as log_exc:
        db.rollback()
        logger.error("Impossible d'enregistrer le log email en base : %s", log_exc)


def _send_via_gmail_api(
    db: Session,
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str,
    email_type: str,
    related_request_id: int | None = None,
    allow_resend_duplicate: bool = False,
    max_retries: int = 3,
) -> str:
    clean_subject = _sanitize_header_value(subject)
    try:
        normalized_recipient = _validate_recipient(to_email)
    except EmailDeliveryError as exc:
        _log_email(db, str(to_email), email_type, clean_subject, "FAILED", None, str(exc), related_request_id)
        raise

    if not allow_resend_duplicate:
        existing_mid = _has_already_sent(db, email_type, normalized_recipient, related_request_id)
        if existing_mid:
            logger.info(
                "[EMAIL DUPLICATE PREVENTED] type=%s to=%s request_id=%s existing_id=%s",
                email_type,
                normalized_recipient,
                related_request_id,
                existing_mid,
            )
            return existing_mid

    try:
        cfg = _get_gmail_api_config()
    except EmailDeliveryError as exc:
        logger.warning("[EMAIL %s -> %s] %s", email_type, normalized_recipient, exc)
        _log_email(db, normalized_recipient, email_type, clean_subject, "FAILED", None, str(exc), related_request_id)
        raise

    msg = EmailMessage()
    msg["Subject"] = clean_subject
    msg["From"] = formataddr((cfg["from_name"], cfg["from_address"]))
    msg["To"] = normalized_recipient
    msg["Reply-To"] = cfg["from_address"]
    msg["Message-ID"] = make_msgid(domain="gmail.com")
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    raw_b64 = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
    secrets_to_mask = [cfg["client_secret"], cfg["refresh_token"]]
    last_error = "Erreur inconnue Gmail API"

    for attempt in range(1, max_retries + 1):
        try:
            access_token = _get_gmail_access_token(cfg, force_refresh=(attempt > 1))
            secrets_to_mask = [cfg["client_secret"], cfg["refresh_token"], access_token]

            with httpx.Client(timeout=20.0) as client:
                resp = client.post(
                    GMAIL_SEND_URL,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json={"raw": raw_b64},
                )
                data = resp.json() if resp.content else {}

            if resp.status_code in (200, 201) and data.get("id"):
                gmail_msg_id = str(data["id"])
                logger.info(
                    "[EMAIL SENT] provider=gmail_api type=%s to=%s id=%s attempt=%d",
                    email_type,
                    normalized_recipient,
                    gmail_msg_id,
                    attempt,
                )
                _log_email(db, normalized_recipient, email_type, clean_subject, "SENT", gmail_msg_id, None, related_request_id)
                return gmail_msg_id

            api_err = (data.get("error") or {}).get("message") if isinstance(data.get("error"), dict) else None
            last_error = _sanitize_error_message(
                f"Gmail API HTTP {resp.status_code} : {api_err or 'Réponse invalide'}",
                secrets_to_mask,
            )

            # Force token refresh once on 401; abort immediately on 400/403 client errors
            if resp.status_code == 401 and attempt == 1:
                _TOKEN_CACHE["access_token"] = ""
                continue
            if resp.status_code in (400, 403):
                break

        except EmailDeliveryError as exc:
            last_error = _sanitize_error_message(str(exc), secrets_to_mask)
            break
        except Exception as exc:
            last_error = _sanitize_error_message(f"Erreur réseau Gmail API : {exc}", secrets_to_mask)

        if attempt < max_retries:
            time.sleep(0.5 * (2 ** (attempt - 1)))

    logger.error("[EMAIL FAILED] provider=gmail_api type=%s to=%s error=%s", email_type, normalized_recipient, last_error)
    _log_email(db, normalized_recipient, email_type, clean_subject, "FAILED", None, last_error, related_request_id)
    raise EmailDeliveryError(last_error)


def send_super_admin_registration_alert(db: Session, registration: dict) -> str:
    super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", DEFAULT_SUPER_ADMIN_EMAIL).strip() or DEFAULT_SUPER_ADMIN_EMAIL
    frontend_url = _get_frontend_url()
    req_id = registration.get("id")
    validation_url = f"{frontend_url}/?super_admin_review={quote(str(req_id or ''))}"

    school_name = _esc(registration.get("school_name"))
    school_email = _esc(registration.get("school_email"))
    school_phone = _esc(registration.get("school_phone"))
    country = _esc(registration.get("country"))
    city = _esc(registration.get("city"))
    address = _esc(registration.get("address"))
    admin_name = _esc(registration.get("admin_full_name"))
    admin_email = _esc(registration.get("admin_email"))
    admin_phone = _esc(registration.get("admin_phone"))
    username = _esc(registration.get("requested_username"))
    created_at = _esc(registration.get("created_at"))
    status_label = _esc(registration.get("status", "PENDING"))

    subject = f"[ACEDA Enterprise] Nouvelle demande d'établissement : {registration.get('school_name', '')}"
    text_body = (
        f"Nouvelle demande d'établissement sur ACEDA Enterprise\n"
        f"Établissement : {registration.get('school_name', '')}\n"
        f"Email école : {registration.get('school_email', '')} | Tél : {registration.get('school_phone', '')}\n"
        f"Adresse : {registration.get('address', '')}, {registration.get('city', '')} ({registration.get('country', '')})\n"
        f"Administrateur : {registration.get('admin_full_name', '')} ({registration.get('admin_email', '')})\n"
        f"Identifiant souhaité : {registration.get('requested_username', '')}\n"
        f"Validation Super Admin : {validation_url}\n"
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;background:#070d1f;color:#f8fafc;padding:28px;border-radius:12px;">
      <h2 style="color:#fbbf24;margin-top:0;">Nouvelle demande de création d'espace SaaS</h2>
      <p>Un établissement vient de soumettre une demande d'inscription sur <strong>ACEDA Enterprise</strong>.</p>
      <table style="width:100%;border-collapse:collapse;background:#0f172a;border:1px solid #334155;margin:16px 0;">
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Établissement</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><strong>{school_name}</strong></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Coordonnées école</td><td style="padding:10px;border-bottom:1px solid #1e293b;">{school_email} | {school_phone}<br/>{address}, {city} ({country})</td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Responsable</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><strong>{admin_name}</strong> ({admin_phone})</td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Email responsable</td><td style="padding:10px;border-bottom:1px solid #1e293b;">{admin_email}</td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Nom d'utilisateur souhaité</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><code>{username}</code></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Date de la demande</td><td style="padding:10px;border-bottom:1px solid #1e293b;">{created_at}</td></tr>
        <tr><td style="padding:10px;color:#94a3b8;">Statut</td><td style="padding:10px;"><strong style="color:#fbbf24;">{status_label}</strong></td></tr>
      </table>
      <p style="margin-top:24px;">
        <a href="{validation_url}" style="background:#fbbf24;color:#070d1f;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Accéder à la console de validation Super Admin
        </a>
      </p>
    </div>
    """

    return _send_via_gmail_api(
        db,
        to_email=super_admin_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        email_type="SUPER_ADMIN_REGISTRATION_ALERT",
        related_request_id=req_id,
    )


def send_school_admin_credentials_email(
    db: Session,
    *,
    request_id: int | None,
    school_name: str,
    tenant_uuid: str,
    admin_name: str,
    admin_email: str,
    username: str,
    activation_token: str,
    allow_resend_duplicate: bool = False,
) -> str:
    frontend_url = _get_frontend_url()
    login_url = f"{frontend_url}/"
    activation_url = f"{frontend_url}/?activate_token={quote(activation_token)}"

    subject = f"[ACEDA Enterprise] Bienvenue — Activation de votre espace '{school_name}'"
    text_body = (
        f"Bienvenue sur ACEDA Enterprise, {admin_name}\n\n"
        f"Votre établissement '{school_name}' a été créé sur la plateforme EduSaaS & BI ACEDA.\n"
        f"Identifiant Tenant (UUID) : {tenant_uuid}\n"
        f"Administrateur : {admin_email}\n"
        f"Nom d'utilisateur : {username}\n"
        f"Lien sécurisé d'activation et de création de mot de passe (valable 24h, usage unique) :\n"
        f"{activation_url}\n\n"
        f"URL de connexion à l'application : {login_url}\n"
    )
    html_body = f"""
    <div style="font-family:Arial,sans-serif;background:#070d1f;color:#f8fafc;padding:28px;border-radius:12px;max-width:640px;margin:0 auto;">
      <div style="border-bottom:1px solid #1e293b;padding-bottom:16px;margin-bottom:20px;">
        <span style="color:#fbbf24;font-weight:bold;letter-spacing:1px;font-size:13px;">ACEDA ENTERPRISE • EDUSAAS &amp; BI</span>
        <h2 style="color:#ffffff;margin:8px 0 0 0;">Bienvenue sur ACEDA, {_esc(admin_name)}</h2>
      </div>
      <p style="line-height:1.6;color:#e2e8f0;">
        Votre espace établissement <strong>{_esc(school_name)}</strong> est désormais actif dans notre architecture Multi-Tenant isolée.
      </p>
      <table style="width:100%;border-collapse:collapse;background:#0f172a;border:1px solid #334155;margin:18px 0;">
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Établissement</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><strong>{_esc(school_name)}</strong></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Identifiant Tenant (UUID)</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><code>{_esc(tenant_uuid)}</code></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Email Administrateur</td><td style="padding:10px;border-bottom:1px solid #1e293b;">{_esc(admin_email)}</td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Nom d'utilisateur</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><code>{_esc(username)}</code></td></tr>
        <tr><td style="padding:10px;color:#94a3b8;">URL de connexion</td><td style="padding:10px;"><a href="{login_url}" style="color:#38bdf8;">{login_url}</a></td></tr>
      </table>
      <h3 style="color:#fbbf24;font-size:15px;">Activation sécurisée de votre compte</h3>
      <p style="line-height:1.6;color:#e2e8f0;">
Pour des raisons de sécurité, aucun mot de passe n'est transmis en clair. Cliquez sur le bouton ci-dessous
        (lien à usage unique valable <strong>24 heures</strong>) afin de définir votre mot de passe personnel et accéder à votre portail :
      </p>
      <p style="margin:24px 0;">
        <a href="{activation_url}" target="_blank" rel="noopener noreferrer" style="background:#fbbf24;color:#070d1f;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Activer mon compte et définir mon mot de passe
        </a>
      </p>
      <p style="font-size:12px;color:#94a3b8;border-top:1px solid #1e293b;padding-top:14px;">
        Si le bouton ne fonctionne pas, cliquez sur ce lien ou copiez-le dans votre navigateur :<br/>
        <a href="{activation_url}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;word-break:break-all;text-decoration:underline;">{activation_url}</a>
      </p>
    </div>
    """

    return _send_via_gmail_api(
        db,
        to_email=admin_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        email_type="SCHOOL_ADMIN_CREDENTIALS",
        related_request_id=request_id,
        allow_resend_duplicate=allow_resend_duplicate,
    )
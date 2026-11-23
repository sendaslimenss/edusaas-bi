import html
import logging
import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from urllib.parse import quote

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("aceda.email")

DEFAULT_FRONTEND_URL = DEFAULT_FRONTEND_URL = "https://edusaas-bi.vercel.app"
DEFAULT_SUPER_ADMIN_EMAIL = "sendaslimenss@gmail.com"
DEFAULT_SMTP_HOST = "smtp.gmail.com"
DEFAULT_SMTP_PORT = 587
DEFAULT_MAIL_FROM_NAME = "ACEDA Enterprise"


class EmailDeliveryError(Exception):
    """Raised when transactional email delivery via Gmail SMTP fails."""


def _esc(value: object) -> str:
    return html.escape(str(value or ""))


def _get_frontend_url() -> str:
    return os.getenv("FRONTEND_URL", DEFAULT_FRONTEND_URL).strip().rstrip("/") or DEFAULT_FRONTEND_URL


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


def _get_smtp_config() -> dict:
    host = os.getenv("SMTP_HOST", DEFAULT_SMTP_HOST).strip() or DEFAULT_SMTP_HOST
    port_raw = os.getenv("SMTP_PORT", str(DEFAULT_SMTP_PORT)).strip() or str(DEFAULT_SMTP_PORT)
    try:
        port = int(port_raw)
    except ValueError as exc:
        raise EmailDeliveryError("Configuration SMTP_PORT invalide.") from exc

    encryption = os.getenv("SMTP_ENCRYPTION", "TLS").strip().upper() or "TLS"
    username = os.getenv("SMTP_USERNAME", DEFAULT_SUPER_ADMIN_EMAIL).strip()
    # Google displays App Passwords in 4-char blocks separated by spaces; strip spaces safely.
    app_password = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    from_address = os.getenv("MAIL_FROM_ADDRESS", username).strip()
    from_name = _sanitize_header_value(os.getenv("MAIL_FROM_NAME", DEFAULT_MAIL_FROM_NAME))

    if not username or not app_password or not from_address:
        raise EmailDeliveryError(
            "Configuration Gmail SMTP incomplète : SMTP_USERNAME, GMAIL_APP_PASSWORD ou MAIL_FROM_ADDRESS manquant."
        )
    if encryption not in ("TLS", "STARTTLS"):
        raise EmailDeliveryError("SMTP_ENCRYPTION doit être configuré sur TLS.")

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": app_password,
        "from_address": from_address,
        "from_name": from_name,
    }


def _sanitize_error_message(raw_error: str, secret: str = "") -> str:
    msg = str(raw_error or "Erreur SMTP inconnue")
    if secret:
        msg = msg.replace(secret, "***")
    return msg[:500]


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
                    (:rec, :etype, :subj, 'gmail_smtp', :mid, :st, :err, :req_id)
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


def _send_via_gmail_smtp(
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
        cfg = _get_smtp_config()
    except EmailDeliveryError as exc:
        logger.warning("[EMAIL %s -> %s] %s", email_type, normalized_recipient, exc)
        _log_email(db, normalized_recipient, email_type, clean_subject, "FAILED", None, str(exc), related_request_id)
        raise

    message_id = make_msgid(domain="gmail.com")
    msg = EmailMessage()
    msg["Subject"] = clean_subject
    msg["From"] = formataddr((cfg["from_name"], cfg["from_address"]))
    msg["To"] = normalized_recipient
    msg["Reply-To"] = cfg["from_address"]
    msg["Message-ID"] = message_id
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    tls_context = ssl.create_default_context()
    last_error = "Erreur SMTP inconnue"

    for attempt in range(1, max_retries + 1):
        try:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as server:
                server.ehlo()
                server.starttls(context=tls_context)
                server.ehlo()
                server.login(cfg["username"], cfg["password"])
                refused = server.send_message(msg)
                if refused:
                    raise EmailDeliveryError(f"Destinataire refusé par le serveur SMTP : {list(refused.keys())}")

            logger.info(
                "[EMAIL SENT] provider=gmail_smtp type=%s to=%s id=%s attempt=%d",
                email_type,
                normalized_recipient,
                message_id,
                attempt,
            )
            _log_email(db, normalized_recipient, email_type, clean_subject, "SENT", message_id, None, related_request_id)
            return message_id

        except smtplib.SMTPAuthenticationError:
            last_error = (
                "Échec d'authentification Gmail SMTP (535). "
                "Vérifiez SMTP_USERNAME et GMAIL_APP_PASSWORD (mot de passe d'application Google à 16 caractères)."
            )
            break
        except smtplib.SMTPRecipientsRefused as exc:
            last_error = _sanitize_error_message(f"Adresse destinataire refusée par Gmail : {exc}", cfg["password"])
            break
        except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError, OSError) as exc:
            last_error = _sanitize_error_message(f"Erreur de connexion Gmail SMTP : {exc}", cfg["password"])
        except EmailDeliveryError as exc:
            last_error = _sanitize_error_message(str(exc), cfg["password"])
            break
        except Exception as exc:
            last_error = _sanitize_error_message(f"Erreur inattendue Gmail SMTP : {exc}", cfg["password"])

        if attempt < max_retries:
            time.sleep(0.5 * (2 ** (attempt - 1)))

    logger.error("[EMAIL FAILED] provider=gmail_smtp type=%s to=%s error=%s", email_type, normalized_recipient, last_error)
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

    return _send_via_gmail_smtp(
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
        <a href="{activation_url}" style="background:#fbbf24;color:#070d1f;padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Activer mon compte et définir mon mot de passe
        </a>
      </p>
      <p style="font-size:12px;color:#94a3b8;border-top:1px solid #1e293b;padding-top:14px;">
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
        <span style="color:#38bdf8;word-break:break-all;">{activation_url}</span>
      </p>
    </div>
    """

    return _send_via_gmail_smtp(
        db,
        to_email=admin_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        email_type="SCHOOL_ADMIN_CREDENTIALS",
        related_request_id=request_id,
        allow_resend_duplicate=allow_resend_duplicate,
    )
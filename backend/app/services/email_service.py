import html
import logging
import os
import time
from urllib.parse import quote
import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("aceda.email")

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FRONTEND_URL = "https://edusaas-bi.vercel.app"
DEFAULT_SUPER_ADMIN_EMAIL = "sendaslimenss@gmail.com"


class EmailDeliveryError(Exception):
    pass


def _esc(value: object) -> str:
    return html.escape(str(value or ""))


def _get_frontend_url() -> str:
    return os.getenv("FRONTEND_URL", DEFAULT_FRONTEND_URL).strip().rstrip("/") or DEFAULT_FRONTEND_URL


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
                    (:rec, :etype, :subj, 'resend', :mid, :st, :err, :req_id)
            """),
            {
                "rec": recipient,
                "etype": email_type,
                "subj": subject,
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


def _send_via_resend(
    db: Session,
    *,
    to_email: str,
    subject: str,
    html_body: str,
    email_type: str,
    related_request_id: int | None = None,
    max_retries: int = 3,
) -> str:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    sender_email = os.getenv("EMAIL_FROM", "").strip()
    if not api_key or not sender_email:
        err = "Configuration Resend incomplète : RESEND_API_KEY ou EMAIL_FROM manquant."
        logger.warning("[EMAIL %s -> %s] %s", email_type, to_email, err)
        _log_email(db, to_email, email_type, subject, "FAILED", None, err, related_request_id)
        raise EmailDeliveryError(err)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": sender_email,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }

    last_error = "Erreur inconnue Resend"
    for attempt in range(1, max_retries + 1):
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(RESEND_API_URL, headers=headers, json=payload)
                data = resp.json() if resp.content else {}

            if resp.status_code in (200, 201) and data.get("id"):
                msg_id = str(data["id"])
                logger.info("[EMAIL SENT] type=%s to=%s id=%s attempt=%d", email_type, to_email, msg_id, attempt)
                _log_email(db, to_email, email_type, subject, "SENT", msg_id, None, related_request_id)
                return msg_id

            last_error = data.get("message") or data.get("name") or f"HTTP {resp.status_code}"
            if resp.status_code in (400, 401, 403, 422):
                break
        except Exception as exc:
            last_error = f"Erreur réseau Resend : {exc}"

        if attempt < max_retries:
            time.sleep(0.5 * (2 ** (attempt - 1)))

    logger.error("[EMAIL FAILED] type=%s to=%s error=%s", email_type, to_email, last_error)
    _log_email(db, to_email, email_type, subject, "FAILED", None, str(last_error), related_request_id)
    raise EmailDeliveryError(f"Échec d'envoi Resend : {last_error}")


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

    return _send_via_resend(
        db,
        to_email=super_admin_email,
        subject=subject,
        html_body=html_body,
        email_type="SUPER_ADMIN_REGISTRATION_ALERT",
        related_request_id=req_id,
    )


def send_school_admin_credentials_email(
    db: Session,
    *,
    request_id: int,
    school_name: str,
    tenant_uuid: str,
    admin_name: str,
    admin_email: str,
    username: str,
    temporary_password: str,
    activation_token: str,
) -> str:
    frontend_url = _get_frontend_url()
    login_url = f"{frontend_url}/"
    activation_url = f"{frontend_url}/?activate_token={quote(activation_token)}"

    subject = f"[ACEDA Enterprise] Votre espace établissement '{school_name}' est approuvé"
    html_body = f"""
    <div style="font-family:Arial,sans-serif;background:#070d1f;color:#f8fafc;padding:28px;border-radius:12px;">
      <h2 style="color:#fbbf24;margin-top:0;">Bienvenue sur ACEDA Enterprise, {_esc(admin_name)}</h2>
      <p>Votre demande de création pour l'établissement <strong>{_esc(school_name)}</strong> a été approuvée. Votre espace Multi-Tenant isolé est prêt.</p>
      <table style="width:100%;border-collapse:collapse;background:#0f172a;border:1px solid #334155;margin:16px 0;">
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Établissement</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><strong>{_esc(school_name)}</strong></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Identifiant Tenant (UUID)</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><code>{_esc(tenant_uuid)}</code></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Nom d'utilisateur</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><code>{_esc(username)}</code></td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Email de connexion</td><td style="padding:10px;border-bottom:1px solid #1e293b;">{_esc(admin_email)}</td></tr>
        <tr><td style="padding:10px;border-bottom:1px solid #1e293b;color:#94a3b8;">Mot de passe temporaire</td><td style="padding:10px;border-bottom:1px solid #1e293b;"><code style="color:#fbbf24;font-size:15px;">{_esc(temporary_password)}</code></td></tr>
        <tr><td style="padding:10px;color:#94a3b8;">URL de connexion</td><td style="padding:10px;"><a href="{login_url}" style="color:#38bdf8;">{login_url}</a></td></tr>
      </table>
      <h3 style="color:#fbbf24;font-size:15px;">Instructions de première connexion (obligatoire)</h3>
      <ol style="line-height:1.6;color:#e2e8f0;">
        <li>Cliquez sur le bouton d'activation ci-dessous (valable <strong>24 heures</strong>, usage unique) pour définir immédiatement votre mot de passe personnel.</li>
        <li>Vous pouvez également vous connecter sur <a href="{login_url}" style="color:#38bdf8;">{login_url}</a> avec votre email/identifiant et le mot de passe temporaire : le changement de mot de passe sera automatiquement exigé avant tout accès.</li>
      </ol>
      <p style="margin-top:22px;">
        <a href="{activation_url}" style="background:#fbbf24;color:#070d1f;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
          Activer mon compte Administrateur
        </a>
      </p>
    </div>
    """

    return _send_via_resend(
        db,
        to_email=admin_email,
        subject=subject,
        html_body=html_body,
        email_type="SCHOOL_ADMIN_CREDENTIALS",
        related_request_id=request_id,
    )
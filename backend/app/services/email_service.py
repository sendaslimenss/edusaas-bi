import html
import os
import httpx
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session


class EmailDeliveryError(Exception):
    pass


def _esc(value: object) -> str:
    return html.escape(str(value or ""))


def _send_via_resend(
    db: Session,
    *,
    to_email: str,
    subject: str,
    html_body: str,
    email_type: str,
    related_request_id: int | None = None,
) -> str:
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    sender_email = os.getenv("EMAIL_FROM", "").strip()
    if not api_key or not sender_email:
        err = "Configuration email manquante : définissez RESEND_API_KEY et EMAIL_FROM."
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

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post("https://api.resend.com/emails", headers=headers, json=payload)
            data = resp.json() if resp.content else {}

        if resp.status_code not in (200, 201) or not data.get("id"):
            err_detail = data.get("message") or data.get("name") or f"HTTP {resp.status_code}"
            _log_email(db, to_email, email_type, subject, "FAILED", None, str(err_detail), related_request_id)
            raise EmailDeliveryError(f"Échec d'envoi email via Resend : {err_detail}")

        msg_id = str(data["id"])
        _log_email(db, to_email, email_type, subject, "SENT", msg_id, None, related_request_id)
        return msg_id
    except EmailDeliveryError:
        raise
    except Exception as exc:
        _log_email(db, to_email, email_type, subject, "FAILED", None, str(exc), related_request_id)
        raise EmailDeliveryError(f"Erreur réseau Resend : {exc}") from exc


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


def _wrap_aceda_template(title: str, subtitle: str, content_html: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html lang="fr">
    <body style="margin:0;padding:0;background-color:#071326;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#f8fafc;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#071326;padding:32px 16px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#0f2140;border:1px solid rgba(245,158,11,0.35);border-radius:16px;overflow:hidden;">
              <tr>
                <td style="padding:28px 32px;background:linear-gradient(135deg,#091936 0%,#132c57 100%);border-bottom:1px solid rgba(255,255,255,0.08);">
                  <div style="font-size:22px;font-weight:800;letter-spacing:0.5px;color:#ffffff;">
                    ACEDA <span style="color:#f59e0b;">SaaS &amp; BI</span>
                  </div>
                  <div style="font-size:13px;color:#94a3b8;margin-top:4px;">{_esc(subtitle)}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h2 style="margin:0 0 16px 0;font-size:20px;color:#ffffff;">{_esc(title)}</h2>
                  {content_html}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px;background-color:#09172e;border-top:1px solid rgba(255,255,255,0.06);font-size:12px;color:#64748b;">
                  ACEDA Academic Excellence SaaS • Plateforme Multi-Tenant Sécurisée
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """


def send_super_admin_registration_alert(db: Session, reg: dict) -> str:
    super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", "").strip()
    if not super_admin_email:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SUPER_ADMIN_EMAIL non configuré sur le serveur.",
        )

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    review_url = f"{frontend_url}/?review_request={reg.get('request_uuid', '')}"

    body = f"""
    <p style="color:#cbd5e1;line-height:1.6;">
      Un nouvel établissement scolaire demande l'ouverture d'un espace dédié sur <strong>ACEDA</strong>.
      Son accès reste <strong>PENDING</strong> jusqu'à votre validation.
    </p>
    <table width="100%" cellpadding="8" cellspacing="0" style="background:#09172e;border-radius:10px;margin:18px 0;font-size:14px;color:#e2e8f0;">
      <tr><td colspan="2" style="color:#f59e0b;font-weight:700;border-bottom:1px solid #1e293b;">Informations Établissement</td></tr>
      <tr><td style="color:#94a3b8;width:40%;">Établissement</td><td><strong>{_esc(reg.get('school_name'))}</strong></td></tr>
      <tr><td style="color:#94a3b8;">Email scolaire</td><td>{_esc(reg.get('school_email'))}</td></tr>
      <tr><td style="color:#94a3b8;">Téléphone</td><td>{_esc(reg.get('school_phone'))}</td></tr>
      <tr><td style="color:#94a3b8;">Localisation</td><td>{_esc(reg.get('city'))}, {_esc(reg.get('country'))} — {_esc(reg.get('address'))}</td></tr>
      <tr><td colspan="2" style="color:#f59e0b;font-weight:700;border-bottom:1px solid #1e293b;padding-top:14px;">Administrateur Demandeur</td></tr>
      <tr><td style="color:#94a3b8;">Nom complet</td><td><strong>{_esc(reg.get('admin_full_name'))}</strong></td></tr>
      <tr><td style="color:#94a3b8;">Email admin</td><td>{_esc(reg.get('admin_email'))}</td></tr>
      <tr><td style="color:#94a3b8;">Téléphone admin</td><td>{_esc(reg.get('admin_phone'))}</td></tr>
      <tr><td style="color:#94a3b8;">Identifiant souhaité</td><td><code>{_esc(reg.get('requested_username'))}</code></td></tr>
    </table>
    <div style="text-align:center;margin-top:26px;">
      <a href="{_esc(review_url)}"
         style="display:inline-block;padding:12px 26px;background-color:#f59e0b;color:#071326;font-weight:700;text-decoration:none;border-radius:10px;">
        Examiner &amp; Approuver / Rejeter dans ACEDA
      </a>
    </div>
    """
    html_doc = _wrap_aceda_template(
        title=f"Nouvelle demande d'inscription : {reg.get('school_name', '')}",
        subtitle="Notification Super Administrateur – Gouvernance Multi-Tenant",
        content_html=body,
    )
    return _send_via_resend(
        db,
        to_email=super_admin_email,
        subject=f"[ACEDA] Nouvelle demande d'école : {reg.get('school_name', '')} ({reg.get('city', '')})",
        html_body=html_doc,
        email_type="SUPER_ADMIN_NEW_SCHOOL",
        related_request_id=reg.get("id"),
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
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    activation_url = f"{frontend_url}/?activate_token={activation_token}"

    body = f"""
    <p style="color:#cbd5e1;line-height:1.6;">
      Bonjour <strong>{_esc(admin_name)}</strong>,<br/>
      Votre établissement <strong>{_esc(school_name)}</strong> a été approuvé et provisionné avec un environnement isolé sur <strong>ACEDA</strong>.
    </p>
    <table width="100%" cellpadding="8" cellspacing="0" style="background:#09172e;border-radius:10px;margin:18px 0;font-size:14px;color:#e2e8f0;">
      <tr><td style="color:#94a3b8;width:42%;">Établissement</td><td><strong>{_esc(school_name)}</strong></td></tr>
      <tr><td style="color:#94a3b8;">Identifiant Tenant</td><td><code>{_esc(tenant_uuid)}</code></td></tr>
      <tr><td style="color:#94a3b8;">Nom d'utilisateur</td><td><code>{_esc(username)}</code></td></tr>
      <tr><td style="color:#94a3b8;">Email de connexion</td><td>{_esc(admin_email)}</td></tr>
      <tr><td style="color:#94a3b8;">Mot de passe temporaire</td><td><code style="color:#f59e0b;font-size:15px;">{_esc(temporary_password)}</code></td></tr>
      <tr><td style="color:#94a3b8;">URL de connexion</td><td><a href="{_esc(frontend_url)}" style="color:#38bdf8;">{_esc(frontend_url)}</a></td></tr>
    </table>
    <div style="background:rgba(245,158,11,0.12);border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;color:#fde68a;font-size:13px;line-height:1.5;">
      <strong>Instructions de première connexion :</strong><br/>
      1. Cliquez sur le bouton ci-dessous pour activer votre compte et définir immédiatement votre mot de passe personnel (lien à usage unique valable 24h), <strong>ou</strong><br/>
      2. Connectez-vous avec votre identifiant et le mot de passe temporaire : le système vous obligera à le remplacer dès la première connexion.
    </div>
    <div style="text-align:center;margin-top:26px;">
      <a href="{_esc(activation_url)}"
         style="display:inline-block;padding:13px 28px;background-color:#f59e0b;color:#071326;font-weight:700;text-decoration:none;border-radius:10px;">
        Activer mon compte &amp; Définir mon mot de passe
      </a>
    </div>
    """
    html_doc = _wrap_aceda_template(
        title="Votre espace scolaire ACEDA est prêt",
        subtitle="Activation Administrateur d'Établissement",
        content_html=body,
    )
    return _send_via_resend(
        db,
        to_email=admin_email,
        subject=f"[ACEDA] Activation de votre établissement : {school_name}",
        html_body=html_doc,
        email_type="SCHOOL_ADMIN_CREDENTIALS",
        related_request_id=request_id,
    )
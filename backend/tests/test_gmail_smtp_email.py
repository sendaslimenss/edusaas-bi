import smtplib
from unittest.mock import MagicMock, patch
import pytest
from app.services.email_service import EmailDeliveryError, send_school_admin_credentials_email


class DummyResult:
    def __init__(self, first_val=None):
        self._first = first_val

    def first(self):
        return self._first


class DummyDB:
    def __init__(self, already_sent=False):
        self.already_sent = already_sent
        self.logged = []
        self.commits = 0

    def execute(self, statement, params=None):
        sql = str(statement)
        if "SELECT provider_message_id" in sql:
            return DummyResult(("<existing@gmail.com>",) if self.already_sent else None)
        if "INSERT INTO email_delivery_logs" in sql:
            self.logged.append(params)
        return DummyResult(None)

    def commit(self):
        self.commits += 1

    def rollback(self):
        pass


@pytest.fixture
def smtp_env(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USERNAME", "sendaslimenss@gmail.com")
    monkeypatch.setenv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop")
    monkeypatch.setenv("SMTP_ENCRYPTION", "TLS")
    monkeypatch.setenv("MAIL_FROM_ADDRESS", "sendaslimenss@gmail.com")
    monkeypatch.setenv("MAIL_FROM_NAME", "ACEDA Enterprise")
    monkeypatch.setenv("FRONTEND_URL", "[https://edusaas-bi.vercel.app](https://edusaas-bi.vercel.app)")


def test_send_welcome_email_success_uses_tls_and_strips_spaces(smtp_env):
    db = DummyDB()
    mock_smtp = MagicMock()
    mock_smtp.send_message.return_value = {}
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_smtp

    with patch("smtplib.SMTP", return_value=mock_cm) as smtp_cls:
        msg_id = send_school_admin_credentials_email(
            db,
            request_id=42,
            school_name="Lycée Pilote Carthage",
            tenant_uuid="11111111-2222-3333-4444-555555555555",
            admin_name="Sami Ben Ali",
            admin_email="sami.director@gmail.com",
            username="sami.carthage",
            activation_token="tok_secure_1234567890abcdef",
        )

    smtp_cls.assert_called_once_with("smtp.gmail.com", 587, timeout=20)
    mock_smtp.starttls.assert_called_once()
    mock_smtp.login.assert_called_once_with("sendaslimenss@gmail.com", "abcdefghijklmnop")
    mock_smtp.send_message.assert_called_once()
    assert msg_id.endswith("@gmail.com>")
    assert db.logged[-1]["st"] == "SENT"
    assert "abcdefghijklmnop" not in str(db.logged)


def test_invalid_recipient_fails_before_smtp(smtp_env):
    db = DummyDB()
    with patch("smtplib.SMTP") as smtp_cls:
        with pytest.raises(EmailDeliveryError):
            send_school_admin_credentials_email(
                db,
                request_id=43,
                school_name="Test School",
                tenant_uuid="11111111-2222-3333-4444-555555555555",
                admin_name="Admin",
                admin_email="not-an-email",
                username="admin_test",
                activation_token="tok_secure_1234567890abcdef",
            )
    smtp_cls.assert_not_called()
    assert db.logged[-1]["st"] == "FAILED"


def test_incorrect_app_password_fails_fast_without_secret_leak(smtp_env):
    db = DummyDB()
    mock_smtp = MagicMock()
    mock_smtp.login.side_effect = smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted")
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_smtp

    with patch("smtplib.SMTP", return_value=mock_cm):
        with pytest.raises(EmailDeliveryError) as exc_info:
            send_school_admin_credentials_email(
                db,
                request_id=44,
                school_name="Test School",
                tenant_uuid="11111111-2222-3333-4444-555555555555",
                admin_name="Admin",
                admin_email="director@gmail.com",
                username="admin_test",
                activation_token="tok_secure_1234567890abcdef",
            )

    assert "535" in str(exc_info.value)
    assert "abcdefghijklmnop" not in str(exc_info.value)
    assert mock_smtp.login.call_count == 1


def test_duplicate_email_prevented_for_same_request(smtp_env):
    db = DummyDB(already_sent=True)
    with patch("smtplib.SMTP") as smtp_cls:
        msg_id = send_school_admin_credentials_email(
            db,
            request_id=45,
            school_name="Test School",
            tenant_uuid="11111111-2222-3333-4444-555555555555",
            admin_name="Admin",
            admin_email="director@gmail.com",
            username="admin_test",
            activation_token="tok_secure_1234567890abcdef",
        )
    smtp_cls.assert_not_called()
    assert msg_id == "<existing@gmail.com>"
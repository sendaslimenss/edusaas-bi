from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth import create_access_token
from app.database import SessionLocal
from app.main import app

client = TestClient(app)


def _get_super_admin_headers() -> dict:
    with SessionLocal() as db:
        sa = db.execute(
            text("SELECT id, role FROM users WHERE role = 'super_admin' AND school_id IS NULL LIMIT 1")
        ).mappings().first()
        assert sa is not None, "Compte Super Admin introuvable. Exécutez seed.py."
        token = create_access_token({"sub": str(sa["id"]), "school_id": None, "role": "super_admin"})
        return {"Authorization": f"Bearer {token}"}


@patch("app.routers.onboarding.send_super_admin_registration_alert", return_value="msg_sa_mock")
@patch("app.routers.onboarding.send_school_admin_credentials_email", return_value="msg_adm_mock")
def test_concurrent_three_schools_lifecycle(mock_admin_mail, mock_sa_mail):
    sa_headers = _get_super_admin_headers()
    schools_payloads = [
        {
            "school_name": f"Ecole Test Concurrence {code}",
            "school_email": f"contact.{code.lower()}@test-aceda.example",
            "school_phone": f"+216 71 100 00{idx}",
            "country": "Tunisie",
            "city": f"Ville {code}",
            "address": f"10 Avenue de la République, Quartier {code}",
            "admin_full_name": f"Directeur {code}",
            "admin_email": f"admin.{code.lower()}@test-aceda.example",
            "admin_phone": f"+216 98 200 00{idx}",
            "requested_username": f"admin.ecole.{code.lower()}",
        }
        for idx, code in enumerate(["A", "B", "C"], start=1)
    ]

    # 1. Soumission simultanée des 3 demandes
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [
            pool.submit(client.post, "/api/public/school-registrations", json=p)
            for p in schools_payloads
        ]
        responses = [f.result() for f in futures]

    assert all(r.status_code == 201 for r in responses), [r.json() for r in responses]
    req_ids = [r.json()["request_id"] for r in responses]
    assert len(set(req_ids)) == 3
    assert mock_sa_mail.call_count == 3

    # 2. Approbation simultanée des 3 demandes
    with ThreadPoolExecutor(max_workers=3) as pool:
        app_futures = [
            pool.submit(client.post, f"/api/super-admin/registrations/{rid}/approve", headers=sa_headers)
            for rid in req_ids
        ]
        app_responses = [f.result() for f in app_futures]

    assert all(r.status_code == 200 for r in app_responses), [r.json() for r in app_responses]
    assert mock_admin_mail.call_count == 3

    # 3. Vérification de l'isolation stricte et des espaces vides
    created_tenants = [r.json() for r in app_responses]
    assert len({t["tenant_uuid"] for t in created_tenants}) == 3
    assert len({t["school_id"] for t in created_tenants}) == 3

    admin_tokens = {}
    for code, t in zip(["A", "B", "C"], created_tenants):
        tok = create_access_token({"sub": str(t["admin_user_id"]), "school_id": t["school_id"], "role": "admin"})
        # Déblocage mot de passe initial en base pour le test fonctionnel
        with SessionLocal() as db:
            db.execute(text("UPDATE users SET must_change_password = FALSE WHERE id = :uid"), {"uid": t["admin_user_id"]})
            db.commit()
        admin_tokens[code] = {"Authorization": f"Bearer {tok}"}

        st_res = client.get("/api/saas/students", headers=admin_tokens[code])
        assert st_res.status_code == 200
        assert st_res.json() == []  # Aucune donnée de Tunis ou Nabeul copiée

    # 4. Création d'un élève dans chaque école puis modification simultanée
    created_students = {}
    for code in ["A", "B", "C"]:
        res = client.post(
            "/api/saas/students",
            headers=admin_tokens[code],
            json={
                "full_name": f"Eleve Initial {code}",
                "email": f"eleve1.{code.lower()}@test-aceda.example",
                "city": f"Ville {code}",
            },
        )
        assert res.status_code in (200, 201), res.json()
        created_students[code] = res.json()["id"]

    with ThreadPoolExecutor(max_workers=3) as pool:
        upd_futures = [
            pool.submit(
                client.put,
                f"/api/saas/students/{created_students[code]}",
                headers=admin_tokens[code],
                json={"full_name": f"Eleve Modifie {code}", "city": f"Nouvelle Ville {code}"},
            )
            for code in ["A", "B", "C"]
        ]
        upd_results = [f.result() for f in upd_futures]

    assert all(r.status_code == 200 for r in upd_results)

    # Anti-IDOR : Admin A tente d'accéder à l'élève de l'École B -> 403 ou 404
    cross_res = client.get(f"/api/saas/students/{created_students['B']}/bulletin", headers=admin_tokens["A"])
    assert cross_res.status_code in (403, 404)
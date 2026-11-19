import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# Cible par défaut : API déployée sur Render (ou passer http://127.0.0.1:8000 en argument)
BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://edusaas-bi.onrender.com"
PASSWORD = "Aceda2026!"

ACCOUNTS = {
    "tunis_director": "directeur@tunis.aceda.tn",
    "tunis_admin": "admin@tunis.aceda.tn",
    "tunis_teacher": "prof@tunis.aceda.tn",
    "tunis_accountant": "comptable@tunis.aceda.tn",
    "tunis_parent": "parent@tunis.aceda.tn",
    "tunis_student": "eleve@tunis.aceda.tn",
    "nabeul_director": "directeur@nabeul.aceda.tn",
    "nabeul_admin": "admin@nabeul.aceda.tn",
    "nabeul_teacher": "prof@nabeul.aceda.tn",
    "nabeul_accountant": "comptable@nabeul.aceda.tn",
    "nabeul_parent": "parent@nabeul.aceda.tn",
    "nabeul_student": "eleve@nabeul.aceda.tn",
}

passed = 0
failed = 0


def request_api(method: str, path: str, token: str | None = None, body: dict | None = None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"detail": raw}
        return e.code, payload


def check(condition: bool, label: str, detail: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  [OK]   {label}")
    else:
        failed += 1
        print(f"  [FAIL] {label} -> {detail}")


def main():
    print(f"\n=== RECETTE AUTOMATISÉE ACEDA SaaS & BI ({BASE_URL}) ===\n")

    # 0. Health Check
    status, health = request_api("GET", "/")
    check(status == 200 and health.get("status") == "online", "Health check API en ligne", f"status={status}")

    # 1. Authentification des 12 comptes
    print("\n1. Authentification JWT (6 rôles x 2 campus)")
    sessions = {}
    for key, email in ACCOUNTS.items():
        st, res = request_api("POST", "/api/auth/login", body={"email": email, "password": PASSWORD})
        ok = st == 200 and "access_token" in res
        check(ok, f"Login {key} ({email})", f"status={st}, res={res}")
        if ok:
            sessions[key] = res

    if len(sessions) < len(ACCOUNTS):
        print("\nArrêt : certains comptes de démonstration n'ont pas pu se connecter.")
        sys.exit(1)

    t_dir = sessions["tunis_director"]["access_token"]
    t_adm = sessions["tunis_admin"]["access_token"]
    t_tea = sessions["tunis_teacher"]["access_token"]
    t_acc = sessions["tunis_accountant"]["access_token"]
    t_par = sessions["tunis_parent"]["access_token"]
    t_stu = sessions["tunis_student"]["access_token"]
    n_dir = sessions["nabeul_director"]["access_token"]

    # 2. Matrice RBAC & Sécurité Anti-IDOR
    print("\n2. Contrôle d'accès RBAC & Cloisonnement Élève/Parent")

    # Élève : voit uniquement son dossier + son bulletin, bloqué sur un autre élève et sur la BI
    st, stu_list = request_api("GET", "/api/saas/students", token=t_stu)
    check(st == 200 and len(stu_list) == 1, "Élève : accès limité à son propre profil (1 dossier)", f"len={len(stu_list)}")
    own_student_id = stu_list[0]["id"]

    st, bulletin = request_api("GET", f"/api/saas/students/{own_student_id}/bulletin", token=t_stu)
    check(st == 200 and "grades" in bulletin, "Élève : consultation de son propre bulletin")

    # Trouver un autre élève de Tunis pour tester l'anti-IDOR
    _, all_tunis_students = request_api("GET", "/api/saas/students", token=t_adm)
    other_student = next((s for s in all_tunis_students if s["id"] != own_student_id), None)
    if other_student:
        st_idor, _ = request_api("GET", f"/api/saas/students/{other_student['id']}/bulletin", token=t_stu)
        check(st_idor == 403, "Anti-IDOR Élève : accès refusé (403) au bulletin d'un camarade", f"status={st_idor}")

    st_bi_stu, _ = request_api("GET", "/api/bi/general", token=t_stu)
    check(st_bi_stu == 403, "RBAC Élève : accès refusé (403) aux dashboards BI", f"status={st_bi_stu}")

    # Parent : voit uniquement ses enfants
    st, par_children = request_api("GET", "/api/saas/students", token=t_par)
    check(st == 200 and 1 <= len(par_children) < len(all_tunis_students), f"Parent : accès limité à ses enfants ({len(par_children)} enfant(s))")

    # Enseignant : accès référentiels/élèves, bloqué sur finance & BI
    st_pay_tea, _ = request_api("GET", "/api/saas/payments", token=t_tea)
    check(st_pay_tea == 403, "RBAC Enseignant : accès refusé (403) aux paiements", f"status={st_pay_tea}")

    st_bi_tea, _ = request_api("GET", "/api/bi/financial", token=t_tea)
    check(st_bi_tea == 403, "RBAC Enseignant : accès refusé (403) au BI Financier", f"status={st_bi_tea}")

    # Comptable : accès paiements + BI Financier & Recouvrement, bloqué sur BI Pédagogique/Stratégique
    st_pay_acc, payments = request_api("GET", "/api/saas/payments", token=t_acc)
    check(st_pay_acc == 200 and len(payments) > 0, f"RBAC Comptable : accès aux paiements ({len(payments)} échéances)")

    st_fin_acc, _ = request_api("GET", "/api/bi/financial?school_year=2025-2026", token=t_acc)
    check(st_fin_acc == 200, "RBAC Comptable : accès autorisé (200) au BI Financier")

    st_rec_acc, _ = request_api("GET", "/api/bi/recovery?school_year=ALL", token=t_acc)
    check(st_rec_acc == 200, "RBAC Comptable : accès autorisé (200) au BI Recouvrement")

    st_ped_acc, _ = request_api("GET", "/api/bi/pedagogical", token=t_acc)
    check(st_ped_acc == 403, "RBAC Comptable : accès refusé (403) au BI Pédagogique", f"status={st_ped_acc}")

    st_str_acc, _ = request_api("GET", "/api/bi/strategic", token=t_acc)
    check(st_str_acc == 403, "RBAC Comptable : accès refusé (403) au BI Stratégique", f"status={st_str_acc}")

    # Directeur : accès aux 10 BI, bloqué en écriture opérationnelle (notes / encaissement)
    st_grd_dir, _ = request_api(
        "POST",
        "/api/saas/grades",
        token=t_dir,
        body={"student_id": own_student_id, "subject_id": 1, "trimester": 1, "score": 15.0},
    )
    check(st_grd_dir == 403, "RBAC Directeur : écriture de note refusée (403 - lecture/décision uniquement)", f"status={st_grd_dir}")

    # 3. Isolation Multi-Tenant (Tunis vs Nabeul)
    print("\n3. Isolation Multi-Tenant (Campus Tunis vs Campus Nabeul)")
    _, nabeul_students = request_api("GET", "/api/saas/students", token=n_dir)
    tunis_ids = {s["id"] for s in all_tunis_students}
    nabeul_ids = {s["id"] for s in nabeul_students}
    check(
        len(tunis_ids) > 0 and len(nabeul_ids) > 0 and tunis_ids.isdisjoint(nabeul_ids),
        f"Cloisonnement strict des élèves (Tunis={len(tunis_ids)}, Nabeul={len(nabeul_ids)}, intersection=0)",
    )

    _, gen_tunis = request_api("GET", "/api/bi/general", token=t_dir)
    _, gen_nabeul = request_api("GET", "/api/bi/general", token=n_dir)
    check(
        gen_tunis["kpis"]["total_students"] != gen_nabeul["kpis"]["total_students"]
        or gen_tunis["classes_occupancy"][0]["id"] != gen_nabeul["classes_occupancy"][0]["id"],
        "Agrégations BI isolées par school_id entre Tunis et Nabeul",
    )

    # 4. Vérification des 10 Dashboards BI & Filtres Phase 4
    print("\n4. Validation des 10 Dashboards BI & Filtres Temporels Phase 4")
    bi_endpoints = [
        ("/api/bi/general?level=ALL", "kpis"),
        ("/api/bi/financial?school_year=2025-2026&level=ALL", "revenue_series"),
        ("/api/bi/pedagogical?school_year=2025-2026&trimester=1&level=ALL", "mentions_distribution"),
        ("/api/bi/attendance?school_year=ALL&level=ALL", "correlation_scatter"),
        ("/api/bi/demographics", "by_zone"),
        ("/api/bi/teachers", "teachers_workload"),
        ("/api/bi/recovery?school_year=2024-2025", "by_level"),
        ("/api/bi/engagement", "engagement_impact"),
        ("/api/bi/early-warning?level=ALL", "students"),
        ("/api/bi/strategic", "simulator_baseline"),
    ]
    for path, expected_key in bi_endpoints:
        st, payload = request_api("GET", path, token=t_dir)
        check(st == 200 and expected_key in payload, f"GET {path}", f"status={st}")

    print(f"\n=== RÉSULTAT : {passed} réussis / {failed} échoués ===\n")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
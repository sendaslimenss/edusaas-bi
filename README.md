# ACEDA — Academic Excellence + Data (SaaS Scolaire & Business Intelligence IA)

Plateforme Cloud Multi-Tenant combinant un **ERP/SaaS de gestion scolaire** (notes pondérées, assiduité, recouvrement, messagerie parents) et une suite décisionnelle de **10 tableaux de bord Business Intelligence & Machine Learning** propulsée par `scikit-learn`.

- **Frontend (Vercel)** : https://edusaas-bi.vercel.app
- **Backend API (Render)** : https://edusaas-bi.onrender.com

---

## Architecture Technique

| Couche | Technologies | Rôle |
| :--- | :--- | :--- |
| **Frontend** | React 18, Vite, Tailwind CSS, Recharts, Lucide | Interface Glassmorphism responsive, visualisations interactives, simulateur What-If |
| **Backend API** | FastAPI, SQLAlchemy, Pydantic, JWT (`python-jose`) | API REST asynchrone, contrôle d'accès RBAC strict, cloisonnement Multi-Tenant |
| **Data Science & ML** | `pandas`, `numpy`, `scikit-learn` (`Ridge`, `RandomForestClassifier`, `LinearRegression`) | Prévisions financières avec IC 95%, détection précoce du décrochage (EWS), régression linéaire |
| **Base de Données** | PostgreSQL Serverless (Neon) | Données longitudinales 2024–2026 sur 2 campus indépendants (**Tunis** et **Nabeul**) |

---

## Les 10 Tableaux de Bord Business Intelligence & IA

1. **Vue Globale & Capacité d'Accueil** : Taux d'occupation des salles, effectifs actifs et répartition par niveau.
2. **BI Financier & Prévisions ML** : Encaissements vs créances, prévisions à 3 mois par **Ridge Regression** avec intervalle de confiance à 95% et score $R^2$.
3. **BI Pédagogique & Résultats** : Moyennes pondérées par coefficients, écart-type $\sigma$, trajectoire longitudinale (2024–2026) et distribution des mentions.
4. **Absences & Corrélation Académique** : Nuage de points et régression linéaire mesurant l'impact des heures d'absence sur la moyenne pondérée (coefficient de Pearson $r$).
5. **Démographie & Rétention des Cohortes** : Bassins géographiques de recrutement, taux de rétention et suivi des diplômés.
6. **Corps Enseignant & Charge Horaire** : Volume hebdomadaire par enseignant et détection automatique des surcharges (>20h) ou sous-charges (<12h).
7. **Recouvrement & Risque Crédit** : Analyse des créances échues (*overdue*), reliquats partiels et taux de recouvrement par niveau.
8. **Engagement Parents & Communication** : Taux d'ouverture des notifications et corrélation entre suivi parental et résultats scolaires.
9. **Early Warning System (EWS IA)** : Triple détection prédictive (chute académique, probabilité d'abandon via `RandomForestClassifier`, défaut de paiement) avec export CSV.
10. **Dashboard Stratégique & Simulateur What-If** : Projections 2026–2027 (`LinearRegression`), poids des variables (`RandomForest Feature Importance`) et simulateur budgétaire/capacitaire temps réel.

---

## Comptes de Démonstration (Mot de passe unique : `Aceda2026!`)

Chaque campus dispose de **6 profils RBAC distincts** cloisonnés par `school_id` :

| Profil RBAC | Campus Tunis (`school_id = 1`) | Campus Nabeul (`school_id = 2`) | Périmètre d'accès |
| :--- | :--- | :--- | :--- |
| **Directeur** | `directeur@tunis.aceda.tn` | `directeur@nabeul.aceda.tn` | 10 dashboards BI + IA, consultation SaaS (lecture seule) |
| **Administrateur** | `admin@tunis.aceda.tn` | `admin@nabeul.aceda.tn` | 10 dashboards BI + gestion complète SaaS |
| **Enseignant** | `prof@tunis.aceda.tn` | `prof@nabeul.aceda.tn` | Saisie des notes, appel/absences, messagerie parents |
| **Comptable** | `comptable@tunis.aceda.tn` | `comptable@nabeul.aceda.tn` | BI Financier (#2) & Recouvrement (#7), encaissements |
| **Parent** | `parent@tunis.aceda.tn` | `parent@nabeul.aceda.tn` | Suivi multi-enfants (notes, absences, factures, messages) |
| **Élève** | `eleve@tunis.aceda.tn` | `eleve@nabeul.aceda.tn` | Bulletin personnel, assiduité et échéancier |

---

## Installation Locale & Tests de Recette

### 1. Backend FastAPI
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows : venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
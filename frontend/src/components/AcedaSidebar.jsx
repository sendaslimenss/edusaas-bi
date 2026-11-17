import React, { useState } from "react";
import "./AcedaSidebar.css";
const NAV_SECTIONS = [
  {
    title: "BI & Aide à la Décision",
    items: [
      { id: "bi-general", label: "Vue Générale", badge: null, icon: "grid" },
      { id: "bi-finance", label: "Dashboard Financier", badge: null, icon: "wallet" },
      { id: "bi-pedagogy", label: "Performance & Notes", badge: null, icon: "chart" },
      { id: "bi-absences", label: "Absences & Retards", badge: "4", icon: "clock" },
      { id: "bi-ews", label: "Early Warning IA", badge: "3", badgeType: "danger", icon: "alert" },
      { id: "bi-strategy", label: "Prévisions & Stratégie", badge: "IA", badgeType: "ai", icon: "sparkles" },
    ],
  },
  {
    title: "Gestion Scolaire SaaS",
    items: [
      { id: "saas-students", label: "Élèves & Inscriptions", badge: null, icon: "users" },
      { id: "saas-teachers", label: "Enseignants & RH", badge: null, icon: "briefcase" },
      { id: "saas-schedule", label: "Classes & Emplois", badge: null, icon: "calendar" },
      { id: "saas-messages", label: "Espace Parents", badge: "12", icon: "mail" },
    ],
  },
];

function NavIcon({ name }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (name) {
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...props}>
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      );
    case "alert":
      return (
        <svg {...props}>
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...props}>
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...props}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
  }
}

export default function AcedaSidebar({ activeTab, onSelectTab, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (id) => {
    onSelectTab(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Barre supérieure mobile */}
      <header className="aceda-mobile-bar">
        <button
          type="button"
          className="aceda-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="aceda-mobile-brand">
          <img src="/aceda-logo.png" alt="Logo ACEDA" />
        </div>
      </header>

      {/* Fond flouté mobile */}
      {mobileOpen && (
        <div
          className="aceda-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Glassmorphism avec onglets incurvés */}
      <aside
        className={`aceda-sidebar ${collapsed ? "is-collapsed" : ""} ${
          mobileOpen ? "is-mobile-open" : ""
        }`}
      >
        {/* Médaillon du logo ACEDA */}
        <div className="aceda-sidebar-header">
          <div className="aceda-logo-plaque">
            <img
              src="/aceda-logo.png"
              alt="ACEDA - Academic Excellence + Data"
              className="aceda-logo-img"
            />
            <div className="aceda-logo-caption">
              <strong>ACEDA</strong>
              <span>Academic Excellence + Data</span>
            </div>
          </div>

          <button
            type="button"
            className="aceda-collapse-btn"
            onClick={() => setCollapsed((prev) => !prev)}
            title={collapsed ? "Développer" : "Réduire"}
            aria-label="Réduire ou agrandir le menu"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Établissement actif */}
        <div className="aceda-school-pill">
          <span className="aceda-pulse-dot" />
          <div className="aceda-school-info">
            <small>Établissement connecté</small>
            <strong>{user?.schoolName || "Campus ACEDA Tunis"}</strong>
          </div>
        </div>

        {/* Navigation avec courbes concaves outside-in */}
        <nav className="aceda-nav" aria-label="Navigation principale">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="aceda-nav-group">
              <div className="aceda-section-label">{section.title}</div>
              <ul>
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <li
                      key={item.id}
                      className={`aceda-nav-item ${isActive ? "active" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        title={collapsed ? item.label : undefined}
                      >
                        <span className="aceda-icon-wrap">
                          <NavIcon name={item.icon} />
                        </span>
                        <span className="aceda-link-label">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`aceda-badge ${
                              item.badgeType ? `badge-${item.badgeType}` : ""
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Carte profil en bas */}
        <div className="aceda-sidebar-footer">
          <div className="aceda-user-card">
            <div className="aceda-avatar">
              {(user?.name || "D")[0].toUpperCase()}
            </div>
            <div className="aceda-user-meta">
              <strong>{user?.name || "Directeur Tunis"}</strong>
              <span>{user?.role || "Directeur • Admin"}</span>
            </div>
            <button
              type="button"
              className="aceda-logout-btn"
              onClick={onLogout}
              title="Déconnexion"
              aria-label="Déconnexion"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
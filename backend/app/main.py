from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import saas, bi

app = FastAPI(
    title="ACEDA – SaaS de Gestion Scolaire & Business Intelligence",
    description="API Multi-école, Multi-rôles (RBAC) et Système d'Information Décisionnel",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(saas.router)
app.include_router(bi.router)


@app.get("/")
def health_check():
    return {"status": "online", "application": "ACEDA SaaS & BI"}
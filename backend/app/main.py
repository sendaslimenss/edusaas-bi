import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database import check_db_connection
from app.routers import saas, bi

app = FastAPI(title="ACEDA – SaaS & BI")

allowed_origins = [
    "http://localhost:5173",
    "https://edusaas-bi.vercel.app",
]
extra_origin = os.getenv("FRONTEND_URL", "").strip()
if extra_origin and extra_origin not in allowed_origins:
    allowed_origins.append(extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(saas.router)
app.include_router(bi.router)


@app.get("/")
def health_check():
    try:
        check_db_connection()
        return {"status": "online", "database": "connected", "application": "ACEDA SaaS & BI"}
    except Exception:
        raise HTTPException(status_code=503, detail="Base de données PostgreSQL inaccessible")
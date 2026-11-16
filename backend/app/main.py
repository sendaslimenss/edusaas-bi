from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import saas, bi

app = FastAPI(title="ACEDA – SaaS & BI")

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
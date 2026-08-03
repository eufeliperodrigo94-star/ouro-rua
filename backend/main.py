from dotenv import load_dotenv
load_dotenv()

from datetime import datetime
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routes import auth, sorteios, apostas, modalidades, modality_settings, vendedores, relatorios, cidades, extracoes, risco

app = FastAPI(title="Ouro Rua API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__, "traceback": traceback.format_exc()}
    )

@app.get("/")
async def root():
    return {"ok": True, "sistema": "Ouro Rua API", "versao": "2.0.0", "timestamp": datetime.utcnow().isoformat()}

@app.get("/health")
async def health():
    return {"status": "ok"}

app.include_router(auth.router,              prefix="/auth")
app.include_router(sorteios.router,          prefix="/sorteios")
app.include_router(apostas.router,           prefix="/apostas")
app.include_router(modalidades.router,       prefix="/modalidades")
app.include_router(modality_settings.router, prefix="/modality-settings")
app.include_router(vendedores.router,        prefix="/vendedores")
app.include_router(relatorios.router,        prefix="/relatorios")
app.include_router(cidades.router,           prefix="/cidades")
app.include_router(extracoes.router,         prefix="/extracoes")
app.include_router(risco.router,              prefix="/risco", tags=["risco"])

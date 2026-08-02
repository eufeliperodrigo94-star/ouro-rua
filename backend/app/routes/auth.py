import os
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from jose import jwt
from passlib.context import CryptContext
from app.db import supabase
from app.auth import get_current_user

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class LoginRequest(BaseModel):
    phone: str
    password: str

@router.post("/login")
async def login(body: LoginRequest):
    res = supabase.table("vendedores") \
        .select("id, name, phone, role, password_hash, is_active, commission_rate, cidade_id, gerente_id") \
        .eq("phone", body.phone).limit(1).execute()

    if not res.data:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    user = res.data[0]
    if not user["is_active"]:
        raise HTTPException(status_code=401, detail="Usuário inativo")

    if not pwd_context.verify(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Senha incorreta")

    payload = {
        "id": user["id"], "name": user["name"], "phone": user["phone"],
        "role": user["role"], "cidade_id": user["cidade_id"],
        "gerente_id": user["gerente_id"],
        "exp": datetime.utcnow() + timedelta(hours=12)
    }
    token = jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
    user_out = {k: v for k, v in payload.items() if k != "exp"}
    return {"token": token, "user": user_out}

@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"user": user}

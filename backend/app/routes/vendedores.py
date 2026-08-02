from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from app.db import get_supabase
from app.auth import get_current_user

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

FIELDS = "id, name, phone, role, is_active, balance, commission_rate, cidade_id, gerente_id, created_at"

@router.get("/")
async def list_vendedores(user=Depends(get_current_user)):
    q = get_supabase().table("vendedores").select(FIELDS).order("name")
    if user["role"] == "gerente":
        q = q.eq("gerente_id", user["id"])
    return q.execute().data

@router.get("/{vendedor_id}")
async def get_vendedor(vendedor_id: int, user=Depends(get_current_user)):
    res = get_supabase().table("vendedores").select(FIELDS).eq("id", vendedor_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Vendedor não encontrado")
    return res.data

@router.post("/")
async def create_vendedor(body: dict, user=Depends(get_current_user)):
    name = body.get("name"); phone = body.get("phone"); password = body.get("password")
    if not all([name, phone, password]):
        raise HTTPException(status_code=400, detail="Dados incompletos")
    row = {
        "name": name, "phone": phone,
        "password_hash": pwd_context.hash(password),
        "role": body.get("role", "cambista"),
        "commission_rate": body.get("commission_rate"),
        "cidade_id": body.get("cidade_id"),
        "gerente_id": body.get("gerente_id"),
        "is_active": True, "balance": 0
    }
    res = get_supabase().table("vendedores").insert(row).execute()
    return res.data[0] if res.data else {}

@router.patch("/{vendedor_id}")
async def update_vendedor(vendedor_id: int, body: dict, user=Depends(get_current_user)):
    updates = dict(body)
    if "password" in updates:
        updates["password_hash"] = pwd_context.hash(updates.pop("password"))
    updates.pop("id", None)
    res = get_supabase().table("vendedores").update(updates).eq("id", vendedor_id).execute()
    return res.data[0] if res.data else {}

@router.delete("/{vendedor_id}")
async def delete_vendedor(vendedor_id: int, user=Depends(get_current_user)):
    get_supabase().table("vendedores").update({"is_active": False}).eq("id", vendedor_id).execute()
    return {"ok": True}

@router.post("/{vendedor_id}/change-password")
async def change_password(vendedor_id: int, body: dict, user=Depends(get_current_user)):
    if user["role"] != "admin" and user["id"] != vendedor_id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    nova_senha = body.get("nova_senha")
    if not nova_senha:
        raise HTTPException(status_code=400, detail="Nova senha obrigatória")
    res = get_supabase().table("vendedores").select("password_hash").eq("id", vendedor_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if body.get("senha_atual"):
        if not pwd_context.verify(body["senha_atual"], res.data[0]["password_hash"]):
            raise HTTPException(status_code=401, detail="Senha atual incorreta")
    get_supabase().table("vendedores").update({"password_hash": pwd_context.hash(nova_senha)}).eq("id", vendedor_id).execute()
    return {"ok": True}

from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from app.db import get_supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/")
async def list_modalidades(ativo: Optional[str] = None, user=Depends(get_current_user)):
    q = get_supabase().table("modalidades").select("*").order("nome")
    if ativo is not None:
        q = q.eq("ativo", ativo != "false")
    return q.execute().data

@router.get("/{codigo}")
async def get_modalidade(codigo: str, user=Depends(get_current_user)):
    res = get_supabase().table("modalidades").select("*").eq("codigo", codigo).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Modalidade não encontrada")
    return res.data

@router.patch("/{modalidade_id}")
async def update_modalidade(modalidade_id: int, body: dict, user=Depends(get_current_user)):
    res = get_supabase().table("modalidades").update(body).eq("id", modalidade_id).execute()
    return res.data[0] if res.data else {}

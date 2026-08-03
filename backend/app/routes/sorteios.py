from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.db import get_supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/")
async def list_sorteios(
    status: Optional[str] = None,
    limit: int = 50,
    user=Depends(get_current_user)
):
    q = get_supabase().table("sorteios").select("*, extracoes(name)") \
        .order("date", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    res = q.execute()
    return res.data

@router.get("/{sorteio_id}")
async def get_sorteio(sorteio_id: int, user=Depends(get_current_user)):
    res = get_supabase().table("sorteios").select("*, extracoes(name)") \
        .eq("id", sorteio_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Sorteio não encontrado")
    return res.data

@router.post("/")
async def create_sorteio(body: dict, user=Depends(get_current_user)):
    res = get_supabase().table("sorteios").insert(body).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erro ao criar sorteio")
    return res.data[0]

@router.patch("/{sorteio_id}")
async def update_sorteio(sorteio_id: int, body: dict, user=Depends(get_current_user)):
    res = get_supabase().table("sorteios").update(body).eq("id", sorteio_id).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Erro ao atualizar sorteio")
    return res.data[0]

@router.post("/{sorteio_id}/resultado")
async def processar_resultado(sorteio_id: int, body: dict, user=Depends(get_current_user)):
    resultado = body.get("resultado")
    get_supabase().table("sorteios").update({"result": resultado, "status": "closed"}) \
        .eq("id", sorteio_id).execute()
    get_supabase().table("apostas").update({"status": "pending", "prize_amount": 0}) \
        .eq("draw_id", sorteio_id).in_("status", ["pending", "won", "lost"]).execute()
    res = get_supabase().rpc("processar_resultado", {"p_sorteio_id": sorteio_id}).execute()
    return {"ok": True, "resultado": res.data}

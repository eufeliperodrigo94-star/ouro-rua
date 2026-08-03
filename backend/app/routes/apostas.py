from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from app.db import get_supabase
from app.auth import get_current_user
from app.routes.risco import check_risco

router = APIRouter()

@router.get("/")
async def list_apostas(
    draw_id: Optional[int] = None,
    user_id: Optional[int] = None,
    ticket_code: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
    user=Depends(get_current_user)
):
    q = get_supabase().table("apostas").select("*") \
        .order("created_at", desc=True).limit(limit)
    if draw_id:     q = q.eq("draw_id", draw_id)
    if user_id:     q = q.eq("user_id", user_id)
    if ticket_code: q = q.eq("ticket_code", ticket_code)
    if status:      q = q.eq("status", status)
    if user["role"] == "cambista":
        q = q.eq("user_id", user["id"])
    res = q.execute()
    return res.data

@router.post("/batch")
async def batch_apostas(apostas: List[dict], user=Depends(get_current_user)):
    if not apostas:
        raise HTTPException(status_code=400, detail="Payload inválido")

    rows = []
    for a in apostas:
        draw_id      = a.get("draw_id")
        bet_type     = a.get("bet_type", "")
        total_amount = float(a.get("total_amount", a.get("amount", 0)) or 0)

        # ── Motor de Risco ──────────────────────────────────────────
        if draw_id and bet_type:
            check_risco(draw_id, bet_type, total_amount)
        # ────────────────────────────────────────────────────────────

        rows.append({
            "user_id":      user["id"] if user["role"] == "cambista" else a.get("user_id", user["id"]),
            "user_phone":   a.get("user_phone") or user.get("phone"),
            "draw_id":      draw_id,
            "bet_type":     bet_type,
            "numbers":      a.get("numbers"),
            "amount":       a.get("amount"),
            "total_amount": total_amount,
            "prize_amount": 0,
            "status":       "pending",
            "ticket_code":  a.get("ticket_code"),
        })

    res = get_supabase().table("apostas").insert(rows).execute()
    inserted = res.data or []
    return {"inserted": len(inserted), "apostas": inserted}

@router.get("/{aposta_id}")
async def get_aposta(aposta_id: int, user=Depends(get_current_user)):
    res = get_supabase().table("apostas").select("*").eq("id", aposta_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Aposta não encontrada")
    return res.data

@router.patch("/{aposta_id}")
async def update_aposta(aposta_id: int, body: dict, user=Depends(get_current_user)):
    res = get_supabase().table("apostas").update(body).eq("id", aposta_id).execute()
    return res.data[0] if res.data else {}

@router.delete("/{aposta_id}")
async def cancel_aposta(aposta_id: int, user=Depends(get_current_user)):
    get_supabase().table("apostas").update({"status": "cancelled"}).eq("id", aposta_id).execute()
    return {"ok": True}

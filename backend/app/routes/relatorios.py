from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import date
from app.db import supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/geral")
async def relatorio_geral(
    draw_id: Optional[int] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    user=Depends(get_current_user)
):
    q = supabase.table("apostas").select("amount, prize_amount, status, bet_type, user_id, draw_id") \
        .neq("status", "cancelled")
    if draw_id:     q = q.eq("draw_id", draw_id)
    if data_inicio: q = q.gte("created_at", data_inicio)
    if data_fim:    q = q.lte("created_at", data_fim + "T23:59:59")
    if user["role"] == "cambista": q = q.eq("user_id", user["id"])
    data = q.execute().data or []

    total_arrecadado = sum(float(a["amount"]) for a in data)
    total_premios    = sum(float(a.get("prize_amount") or 0) for a in data)
    return {
        "total_apostas": len(data),
        "total_arrecadado": total_arrecadado,
        "total_premios": total_premios,
        "saldo": total_arrecadado - total_premios,
        "por_status": {
            "pending": sum(1 for a in data if a["status"] == "pending"),
            "won":     sum(1 for a in data if a["status"] == "won"),
            "lost":    sum(1 for a in data if a["status"] == "lost"),
        }
    }

@router.get("/ranking")
async def relatorio_ranking(
    draw_id: Optional[int] = None,
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    user=Depends(get_current_user)
):
    q = supabase.table("apostas").select("amount, prize_amount, user_id") \
        .neq("status", "cancelled")
    if draw_id:     q = q.eq("draw_id", draw_id)
    if data_inicio: q = q.gte("created_at", data_inicio)
    if data_fim:    q = q.lte("created_at", data_fim + "T23:59:59")
    data = q.execute().data or []

    vmap = {}
    for a in data:
        vid = a["user_id"]
        if vid not in vmap:
            vmap[vid] = {"user_id": vid, "total_apostas": 0, "total_arrecadado": 0.0, "total_premios": 0.0}
        vmap[vid]["total_apostas"] += 1
        vmap[vid]["total_arrecadado"] += float(a["amount"])
        vmap[vid]["total_premios"] += float(a.get("prize_amount") or 0)

    ranking = sorted(
        [{"saldo": v["total_arrecadado"] - v["total_premios"], **v} for v in vmap.values()],
        key=lambda x: x["total_arrecadado"], reverse=True
    )
    return ranking

@router.get("/risco")
async def relatorio_risco(draw_id: Optional[int] = None, user=Depends(get_current_user)):
    q1 = supabase.table("risk_exposure").select("*").order("valor_vendido", desc=True)
    q2 = supabase.table("risk_discharge").select("*").order("created_at", desc=True).limit(50)
    if draw_id:
        q1 = q1.eq("draw_id", draw_id)
        q2 = q2.eq("draw_id", draw_id)
    return {"exposure": q1.execute().data or [], "discharge": q2.execute().data or []}

@router.get("/caixa")
async def relatorio_caixa(data: Optional[str] = None, user=Depends(get_current_user)):
    hoje = data or date.today().isoformat()
    inicio = hoje + "T00:00:00"
    fim    = hoje + "T23:59:59"
    res = supabase.table("apostas").select("amount, prize_amount, status") \
        .neq("status", "cancelled").gte("created_at", inicio).lte("created_at", fim).execute()
    rows = res.data or []
    total_bruto   = sum(float(a["amount"]) for a in rows)
    total_premios = sum(float(a.get("prize_amount") or 0) for a in rows)
    return {
        "data": hoje,
        "total_apostas": len(rows),
        "total_bruto": total_bruto,
        "total_premios": total_premios,
        "liquido": total_bruto - total_premios
    }

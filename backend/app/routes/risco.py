from fastapi import APIRouter, Depends, HTTPException
from app.db import get_supabase
from app.auth import get_current_user

router = APIRouter()

def _cfg():
    res = get_supabase().table("config_risco").select("*").eq("id", 1).single().execute()
    return res.data or {"modo": "desativado", "limite_padrao": 5000}

@router.get("/config")
async def get_config(user=Depends(get_current_user)):
    cfg = _cfg()
    mods = get_supabase().table("config_risco_modalidade").select("*").execute()
    return {"config": cfg, "modalidades": mods.data or []}

@router.patch("/config")
async def update_config(body: dict, user=Depends(get_current_user)):
    if user.get("role") not in ("admin", "gerente"):
        raise HTTPException(status_code=403, detail="Sem permissão")
    allowed = {"modo", "limite_padrao"}
    update = {k: v for k, v in body.items() if k in allowed}
    if not update:
        raise HTTPException(status_code=400, detail="Nenhum campo válido")
    get_supabase().table("config_risco").update(update).eq("id", 1).execute()
    return _cfg()

@router.put("/modalidade/{bet_type}")
async def set_modalidade(bet_type: str, body: dict, user=Depends(get_current_user)):
    if user.get("role") not in ("admin", "gerente"):
        raise HTTPException(status_code=403, detail="Sem permissão")
    payload = {
        "bet_type":  bet_type,
        "limite":    body.get("limite"),
        "ilimitado": body.get("ilimitado", False),
    }
    get_supabase().table("config_risco_modalidade").upsert(payload, on_conflict="bet_type").execute()
    return {"ok": True}

def check_risco(draw_id: int, bet_type: str, total_amount: float):
    """
    Lança HTTPException 422 se a aposta ultrapassa o limite de exposição.
    Chame antes de inserir apostas no batch.
    """
    cfg  = _cfg()
    modo = cfg.get("modo", "desativado")
    if modo in ("desativado", "ilimitado"):
        return

    # Override por modalidade
    mod_res = get_supabase().table("config_risco_modalidade") \
        .select("limite,ilimitado").eq("bet_type", bet_type).execute()
    mod_cfg = mod_res.data[0] if mod_res.data else None
    if mod_cfg and mod_cfg.get("ilimitado"):
        return

    limite = (mod_cfg.get("limite") if mod_cfg and mod_cfg.get("limite") else None) \
             or cfg.get("limite_padrao", 5000)

    # Soma exposição atual no sorteio para esse bet_type
    exp_res = get_supabase().table("apostas") \
        .select("total_amount") \
        .eq("draw_id", draw_id) \
        .eq("bet_type", bet_type) \
        .neq("status", "cancelled") \
        .execute()
    total_atual = sum(float(r["total_amount"] or 0) for r in (exp_res.data or []))

    if total_atual + total_amount > float(limite):
        disponivel = max(0, float(limite) - total_atual)
        raise HTTPException(
            status_code=422,
            detail=f"Limite de risco atingido para {bet_type}. "
                   f"Disponível: R$ {disponivel:.2f} | Limite: R$ {float(limite):.2f}"
        )

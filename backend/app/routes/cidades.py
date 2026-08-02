from fastapi import APIRouter, Depends
from app.db import get_supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/")
async def list_cidades(user=Depends(get_current_user)):
    return get_supabase().table("cidades").select("*").order("nome").execute().data

@router.post("/")
async def create_cidade(body: dict, user=Depends(get_current_user)):
    res = get_supabase().table("cidades").insert(body).execute()
    return res.data[0] if res.data else {}

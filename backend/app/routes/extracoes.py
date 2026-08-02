from fastapi import APIRouter, Depends
from app.db import supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/")
async def list_extracoes(user=Depends(get_current_user)):
    return supabase.table("extracoes").select("*").order("hora").execute().data

@router.post("/")
async def create_extracao(body: dict, user=Depends(get_current_user)):
    res = supabase.table("extracoes").insert(body).execute()
    return res.data[0] if res.data else {}

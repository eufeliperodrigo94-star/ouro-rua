from fastapi import APIRouter, Depends
from app.db import supabase
from app.auth import get_current_user

router = APIRouter()

@router.get("/")
async def list_modality_settings(user=Depends(get_current_user)):
    res = supabase.table("modality_settings").select("*").eq("is_active", True).order("id").execute()
    return res.data

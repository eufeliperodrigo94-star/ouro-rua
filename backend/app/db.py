import os
from supabase import create_client, Client

def get_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"]
    )

# Instância global — inicializada na primeira chamada a get_supabase()
_client: Client = None

def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = get_client()
    return _client

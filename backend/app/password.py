import bcrypt

def hash_password(password: str) -> str:
    """Hash de senha com bcrypt (compatível com bcryptjs $2b$)"""
    pwd_bytes = password[:72].encode("utf-8")
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt(rounds=10)).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    """Verifica senha contra hash bcrypt ($2b$ do bcryptjs ou Python)"""
    try:
        pwd_bytes = password[:72].encode("utf-8")
        hash_bytes = hashed.encode("utf-8") if isinstance(hashed, str) else hashed
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

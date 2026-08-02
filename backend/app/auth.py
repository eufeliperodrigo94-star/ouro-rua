import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            os.environ["JWT_SECRET"],
            algorithms=["HS256"]
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")

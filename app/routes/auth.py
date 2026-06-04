import os
import shutil
import time
import secrets
import logging
import traceback
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.db.database import get_db
from app.models.user import User
from app.models.company import Company
from app.dependencies.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.services.email import send_verification_email

router = APIRouter()

MAX_BCRYPT_LENGTH = 72
UPLOAD_DIR = "uploads"


# --- СХЕМЫ ДАННЫХ ---

class UserRegisterSchema(BaseModel):
    email: EmailStr
    password: str


class UserLoginSchema(BaseModel):
    email: str
    password: str


class PathUpdateSchema(BaseModel):
    path: str


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    tax_id: Optional[str] = None
    iban: Optional[str] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    path: Optional[str] = None
    company: Optional[CompanyUpdate] = None


class PasswordChangeSchema(BaseModel):
    current_password: str
    new_password: str


# --- ЭНДПОИНТЫ ---

@router.post("/register")
def register(user_data: UserRegisterSchema, db: Session = Depends(get_db)):
    try:
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

        email_enabled = bool(os.getenv("SMTP_EMAIL", "") and os.getenv("SMTP_PASSWORD", ""))
        verification_token = secrets.token_urlsafe(32) if email_enabled else None

        user = User(
            email=user_data.email,
            password=hash_password(user_data.password),
            is_verified=not email_enabled,        # auto-verify when no email service
            verification_token=verification_token,
            role="user"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        if email_enabled:
            try:
                send_verification_email(user.email, verification_token)
            except Exception as e:
                logging.error(f"Email sending failed: {e}")
                # fall back: auto-verify so user is not locked out
                user.is_verified = True
                user.verification_token = None
                db.commit()

        msg = "Verification email sent. Please check your inbox." if email_enabled else "Registration successful."
        return {"id": user.id, "email": user.email, "message": msg}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/login")
def login(login_data: UserLoginSchema, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()

    is_password_correct = bool(user and verify_password(login_data.password[:MAX_BCRYPT_LENGTH], user.password))

    if not user or not is_password_correct:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please check your inbox."
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict(),
    }


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return current_user.to_dict()


@router.post("/set-path")
def set_user_path(
        data: PathUpdateSchema,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    if data.path not in ["employee", "business"]:
        raise HTTPException(status_code=400, detail="Invalid path. Must be 'employee' or 'business'")

    current_user.path = data.path
    db.commit()
    db.refresh(current_user)
    return {"status": "success", "path": current_user.path}


@router.put("/update")
def update_user(
        data: UserUpdate,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    try:
        if data.first_name is not None: current_user.first_name = data.first_name
        if data.last_name is not None: current_user.last_name = data.last_name
        if data.phone is not None: current_user.phone = data.phone
        if data.avatar_url is not None: current_user.avatar_url = data.avatar_url
        if data.path is not None: current_user.path = data.path

        if data.company:
            if not current_user.company:
                new_comp = Company(
                    name=data.company.name,
                    position=data.company.position,
                    tax_id=data.company.tax_id,
                    iban=data.company.iban,
                    owner_id=current_user.id
                )
                db.add(new_comp)
            else:
                if data.company.name is not None: current_user.company.name = data.company.name
                if data.company.position is not None: current_user.company.position = data.company.position
                if data.company.tax_id is not None: current_user.company.tax_id = data.company.tax_id
                if data.company.iban is not None: current_user.company.iban = data.company.iban
                current_user.company.owner_id = current_user.id

        db.commit()
        db.refresh(current_user)
        return current_user.to_dict()

    except Exception as e:
        db.rollback()
        logging.error(f"Error updating profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-avatar")
async def upload_avatar(
        avatar: UploadFile = File(...),
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)

    ext = avatar.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp"]:
        raise HTTPException(status_code=400, detail="Invalid file type")

    file_name = f"user_{current_user.id}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(avatar.file, buffer)
    except Exception as e:
        logging.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail="Could not save file")

    api_url = os.getenv("API_URL", "http://localhost:8000")
    avatar_url = f"{api_url}/uploads/{file_name}?t={int(time.time())}"
    current_user.avatar_url = avatar_url

    db.commit()
    return {"avatar_url": avatar_url}


@router.post("/change-password")
def change_password(
        data: PasswordChangeSchema,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    if not verify_password(data.current_password[:MAX_BCRYPT_LENGTH], current_user.password):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Новый пароль должен быть не менее 6 символов")
    current_user.password = hash_password(data.new_password)
    db.commit()
    return {"ok": True}


@router.get("/stats")
def get_stats(
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    from app.models.document import Document
    from app.models.financial_event import FinancialEvent
    docs_count = db.query(Document).filter(Document.owner_id == current_user.id).count()
    tx_count = db.query(FinancialEvent).filter(FinancialEvent.user_id == current_user.id).count()
    return {
        "documents": docs_count,
        "transactions": tx_count,
        "member_since": current_user.created_at.isoformat() if current_user.created_at else None,
    }


@router.delete("/delete-account")
def delete_account(
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
):
    from app.models.document import Document
    from app.models.financial_event import FinancialEvent
    from app.models.budget import Budget
    db.query(FinancialEvent).filter(FinancialEvent.user_id == current_user.id).delete()
    db.query(Budget).filter(Budget.user_id == current_user.id).delete()
    for doc in db.query(Document).filter(Document.owner_id == current_user.id).all():
        if doc.file_path and os.path.exists(doc.file_path):
            os.remove(doc.file_path)
        db.delete(doc)
    db.delete(current_user)
    db.commit()
    return {"ok": True}


@router.get("/verify")
def verify_email(token: str, db: Session = Depends(get_db)):
    # 1. Ищем пользователя по токену
    user = db.query(User).filter(User.verification_token == token).first()

    if not user:
        # Если токен битый, можно редиректнуть на страницу ошибки
        # или оставить HTTPException для отладки
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    # 2. Обновляем статус верификации
    user.is_verified = True
    user.verification_token = None

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(url=f"{frontend_url}/login")
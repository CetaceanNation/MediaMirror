from datetime import datetime
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    JSON as SqlJson,
    String,
    Uuid
)
from sqlalchemy.orm import relationship
from uuid import uuid4

from . import Base


class UserModel(Base):
    __tablename__ = "users"
    id = Column(Uuid, primary_key=True, default=uuid4)
    username = Column(String(length=26))
    passhash = Column(String(length=192))
    created = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_updated = Column(DateTime, default=datetime.utcnow, nullable=False)

    sessions = relationship("UserSessionModel", back_populates="user", cascade="all, delete-orphan")


class UserSessionModel(Base):
    __tablename__ = "user_sessions"
    id = Column(String(length=64), primary_key=True)
    device_identifier = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime)
    user_id = Column(Uuid, ForeignKey("users.id"), nullable=False)
    data = Column(SqlJson)

    user = relationship("UserModel", back_populates="sessions")


class PermissionModel(Base):
    __tablename__ = "permissions"
    key = Column(String(length=60), primary_key=True)
    description = Column(String(length=60), nullable=False)

    users = relationship("UserPermModel", back_populates="permissions", cascade="all, delete-orphan")


class UserPermModel(Base):
    __tablename__ = "user_permissions"
    user_id = Column(Uuid, ForeignKey("users.id"), primary_key=True)
    key = Column(String(length=60), ForeignKey("permissions.key"), primary_key=True)

    permissions = relationship("PermissionModel", back_populates="users")

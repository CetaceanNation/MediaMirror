from sqlalchemy import (
    Column,
    JSON as SqlJson,
    LargeBinary,
    String,
    Text,
)

from mediamirror.models import Base


class RemoteAccountModel(Base):
    __tablename__ = "remote_accounts"
    domain = Column(String(length=255), primary_key=True, nullable=False)
    name = Column(String(length=80), primary_key=True, nullable=False)
    icon = Column(LargeBinary, nullable=True)
    notes = Column(Text, nullable=True)
    cookies = Column(SqlJson, nullable=False)

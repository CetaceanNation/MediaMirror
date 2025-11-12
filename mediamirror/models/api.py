from datetime import datetime
from sqlalchemy import (
    Column,
    ForeignKey,
    Uuid
)
from uuid import uuid4

from mediamirror.models import (
    Base,
    TZDateTime
)


class ApiKey(Base):
    __tablename__ = "api_keys"
    key = Column(Uuid, primary_key=True, default=uuid4)
    user_id = Column(Uuid, ForeignKey("users.id"))
    created = Column(TZDateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(TZDateTime)

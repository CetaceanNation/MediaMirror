from sqlalchemy import (
    Column,
    String,
    Text
)

from mediamirror.models import Base


class Setting(Base):
    __tablename__ = "settings"

    component = Column(String(80), nullable=False, primary_key=True)
    key = Column(String(255), nullable=False, primary_key=True)
    description = Column(String(255), nullable=True)
    value = Column(Text, nullable=False)

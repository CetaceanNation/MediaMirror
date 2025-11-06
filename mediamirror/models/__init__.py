from datetime import (
    datetime,
    timezone
)
from sqlalchemy import (
    DateTime,
    TypeDecorator
)
from sqlalchemy.orm import (
    DeclarativeBase
)


class Base(DeclarativeBase):
    pass


class TZDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if value.tzinfo and value.tzinfo.utcoffset(value) is not None:
                value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = value.replace(tzinfo=timezone.utc)
        return value

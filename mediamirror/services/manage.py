from collections import defaultdict
import logging
from sqlalchemy import select

from models.users import (
    UserModel,
    UserPermModel
)
from services.database_manager import get_db_session


def get_users_and_perms():
    with get_db_session() as db_session:
        try:
            user_list_stmt = select(UserModel.id, UserModel.username, UserPermModel.key).join(
                UserPermModel).order_by(UserModel.created)
            results = db_session.execute(user_list_stmt).all()
            users_perms = defaultdict(list)
            for user_id, username, key in results:
                users_perms[(user_id, username)].append(key)
            return [(user_id, username, keys) for (user_id, username), keys in users_perms.items()]
        except Exception:
            log.exception("Failed to get user list")
    return []


log = logging.getLogger(__name__)

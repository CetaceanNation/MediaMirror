"""add permissions

Revision ID: 294797034de0
Revises: 33e5a2db70ed
Create Date: 2024-07-12 14:09:25.453225

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "294797034de0"
down_revision: Union[str, None] = "33e5a2db70ed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table("permissions",
                    sa.Column("application", sa.String(length=60), nullable=False),
                    sa.Column("key", sa.String(length=60), nullable=False),
                    sa.Column("description", sa.String(length=60), nullable=False),
                    sa.PrimaryKeyConstraint("application", "key")
                    )
    op.create_table("user_permissions",
                    sa.Column("user_id", sa.Uuid(), nullable=False),
                    sa.Column("application", sa.String(length=60), nullable=False),
                    sa.Column("key", sa.String(length=60), nullable=False),
                    sa.ForeignKeyConstraint(["application", "key"], ["permissions.application", "permissions.key"], ),
                    sa.ForeignKeyConstraint(["user_id"], ["users.id"], ),
                    sa.PrimaryKeyConstraint("user_id", "application", "key")
                    )


def downgrade():
    op.drop_table("user_permissions")
    op.drop_table("permissions")

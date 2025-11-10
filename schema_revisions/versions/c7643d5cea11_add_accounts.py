"""add_accounts

Revision ID: c7643d5cea11
Revises: 67d241bb8880
Create Date: 2025-11-09 21:46:31.740909

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7643d5cea11'
down_revision: Union[str, None] = '67d241bb8880'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table('remote_accounts',
                    sa.Column('id', sa.Uuid(), nullable=False),
                    sa.Column('name', sa.String(length=64), nullable=False, unique=True),
                    sa.Column('domain', sa.String(length=255), nullable=False),
                    sa.Column('icon', sa.LargeBinary(), nullable=True),
                    sa.Column('notes', sa.Text(), nullable=True),
                    sa.Column('cookies', sa.JSON(), nullable=False),
                    sa.PrimaryKeyConstraint('id')
                    )


def downgrade():
    op.drop_table('remote_accounts')

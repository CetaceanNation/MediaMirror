"""init_schema

Revision ID: 67d241bb8880
Revises:
Create Date: 2024-12-31 19:19:22.204775

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '67d241bb8880'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table('users',
                    sa.Column('id', sa.Uuid(), nullable=False),
                    sa.Column('username', sa.String(length=26), nullable=True),
                    sa.Column('passhash', sa.String(length=192), nullable=True),
                    sa.Column('created', sa.DateTime(), nullable=False),
                    sa.Column('last_seen', sa.DateTime(), nullable=True),
                    sa.Column('last_updated', sa.DateTime(), nullable=False),
                    sa.PrimaryKeyConstraint('id')
                    )
    op.create_table('api_keys',
                    sa.Column('key', sa.Uuid(), nullable=False),
                    sa.Column('user_id', sa.Uuid(), nullable=True),
                    sa.Column('created', sa.DateTime(), nullable=False),
                    sa.Column('expires_at', sa.DateTime(), nullable=True),
                    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
                    sa.PrimaryKeyConstraint('key')
                    )
    perms_table = op.create_table('permissions',
                                  sa.Column('key', sa.String(length=60), nullable=False),
                                  sa.Column('description', sa.String(length=60), nullable=False),
                                  sa.PrimaryKeyConstraint('key')
                                  )
    op.bulk_insert(perms_table, [
        {
            'key': 'admin',
            'description': 'Permission for all functionality, including plugins'
        },
        {
            'key': 'view-users',
            'description': 'Access the users panel and view all users'
        },
        {
            'key': 'modify-users',
            'description': 'Modify permissions for existing users'
        },
        {
            'key': 'manage-users',
            'description': 'Create/delete users'
        },
        {
            'key': 'view-logs',
            'description': 'Access the logs panel and view all logs'
        },
        {
            'key': 'manage-accounts',
            'description': 'Create/delete remote accounts'
        },
        {
            'key': 'view-plugins',
            'description': 'Access the plugins panel and view settings'
        },
        {
            'key': 'manage-plugins',
            'description': 'Add/remove plugins'
        },
        {
            'key': 'modify-plugins',
            'description': 'Modify settings for plugins'
        }
    ])
    op.create_table('user_permissions',
                    sa.Column('user_id', sa.Uuid(), nullable=False),
                    sa.Column('key', sa.String(length=60), nullable=False),
                    sa.ForeignKeyConstraint(['key'], ['permissions.key'], ),
                    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
                    sa.PrimaryKeyConstraint('user_id', 'key')
                    )
    op.create_table('user_sessions',
                    sa.Column('id', sa.String(length=64), nullable=False),
                    sa.Column('device_identifier', sa.String(), nullable=False),
                    sa.Column('created_at', sa.DateTime(), nullable=False),
                    sa.Column('expires_at', sa.DateTime(), nullable=True),
                    sa.Column('user_id', sa.Uuid(), nullable=False),
                    sa.Column('data', sa.JSON(), nullable=True),
                    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
                    sa.PrimaryKeyConstraint('id')
                    )
    op.create_table('settings',
                    sa.Column('component', sa.String(length=80), nullable=False),
                    sa.Column('key', sa.String(length=255), nullable=False),
                    sa.Column('description', sa.String(length=255), nullable=True),
                    sa.Column('value', sa.Text(), nullable=False),
                    sa.PrimaryKeyConstraint('component', 'key')
                    )


def downgrade():
    op.drop_table('settings')
    op.drop_table('user_sessions')
    op.drop_table('user_permissions')
    op.drop_table('permissions')
    op.drop_table('api_keys')
    op.drop_table('users')

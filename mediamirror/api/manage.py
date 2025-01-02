from flask import (
    Blueprint
)

from . import (
    permissions_required,
    UserSchema
)
from services.manage import (
    get_users_and_perms
)

manage_routes = Blueprint("manage_routes", __name__, url_prefix="/api/manage")


@manage_routes.route("/users")
@permissions_required([
    "view-users"
])
def user_list():
    """Endpoint for managing users
    ---
    get:
      description: Get all app users
      security:
        - ApiKeyAuth: []
      responses:
        200:
          description: Return a list of users and their permissions
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/UserSchema'
    """
    user_data = get_users_and_perms()
    transformed_data = [{
        "id": user_id,
        "username": username,
        "permissions": keys
    } for user_id, username, keys in user_data]
    return UserSchema(many=True).dump(transformed_data)


@manage_routes.route("/permissions", methods=["GET", "DELETE"])
def permissions():
    return

from flask import (
    Blueprint,
    jsonify,
    request
)

from . import (
    permissions_required,
    UserSchema
)
from services.auth import (
    get_users
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
      description: Retrieve a list of users
      security:
        - ApiKeyAuth: []
      parameters:
        - name: page
          in: query
          description: Page offset to return
          required: false
          schema:
            type: integer
            minimum: 1
            default: 1
        - name: page_size
          in: query
          description: Number of users to return per page
          required: false
          schema:
            type: integer
            minimum: 1
            default: 15
        - name: username_filter
          in: query
          description: Filter users by username (partial match)
          required: false
          schema:
            type: string
      responses:
        200:
          description: Return a paginated list of users and metadata
          content:
            application/json:
              schema:
                type: object
                properties:
                  page:
                    type: integer
                    description: Current page number
                  next_page:
                    type: boolean
                    description: Whether there are more results to fetch
                  users:
                    type: array
                    items:
                      $ref: '#/components/schemas/UserSchema'
        400:
          description: Invalid query parameters
    """
    username_filter = request.args.get("username_filter", type=str)
    page_size = request.args.get("page_size", 15, type=int)
    page = request.args.get("page", 1, type=int)

    if page_size is not None and page_size < 1:
        return jsonify({"error": "parameter 'page_size' must be at least 1"}), 400
    if page is not None and page < 1:
        return jsonify({"error": "parameter 'offset' must be at least 0"}), 400

    user_data, has_next_page = get_users(page_size=page_size, page=page, username_filter=username_filter)
    users = [{
        "id": user_id,
        "username": username
    } for user_id, username in user_data]
    response_data = {
        "page": page,
        "next_page": has_next_page,
        "users": UserSchema(many=True).dump(users),
    }
    return jsonify(response_data)


@manage_routes.route("/permissions", methods=["GET", "DELETE"])
@permissions_required([
    "modify-users"
])
def permissions():
    return

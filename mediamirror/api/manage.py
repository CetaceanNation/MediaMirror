from flask import (
    Blueprint,
    current_app as app,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for
)


manage_routes = Blueprint("manage_routes", __name__)

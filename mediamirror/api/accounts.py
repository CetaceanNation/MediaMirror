from io import StringIO
import json
from marshmallow.exceptions import ValidationError as MarshmallowValidationError
from quart import (
    Blueprint,
    jsonify,
    request,
    Response
)

from mediamirror.api import (
    api_wrapper,
    permissions_required,
    RemoteAccountResponseSchema,
    RemoteAccountSubmitSchema
)
from mediamirror.services import accounts


accounts_api = Blueprint("accounts_api", __name__, url_prefix="/api/accounts")


@accounts_api.route("", methods=["GET"])
@api_wrapper
@permissions_required(["view-accounts"])
async def list_remote_accounts() -> Response:
    """
    View all remote accounts, with paging/filtering.
    ---
    get:
        tags:
          - Accounts
        description: Retrieve a list of remote accounts.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: page
            description: Page offset to return.
            in: query
            required: false
            schema:
                type: integer
                minimum: 1
                default: 1
          - name: page_size
            description: Number of accounts to return per page.
            in: query
            required: false
            schema:
                type: integer
                minimum: 1
                default: 15
          - name: domain
            description: Filter accounts by domain (exact match).
            in: query
            required: false
            schema:
                type: string
          - name: name_filter
            description: Filter accounts by name (partial match).
            in: query
            required: false
            schema:
                type: string
        responses:
            200:
                description: Return a paginated list of accounts and metadata.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                page:
                                    type: integer
                                    description: Current page number.
                                next_page:
                                    type: boolean
                                    description: Whether there are more results to fetch.
                                accounts:
                                    type: array
                                    items:
                                        $ref: "#/components/schemas/RemoteAccountIconSchema"
            400:
                description: Invalid query parameters
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "Parameter 'parameter_name' must be at least #"
    """
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 15, type=int)
    domain_filter = request.args.get("domain", type=str)
    name_filter = request.args.get("name_filter", type=str)

    if page_size is not None and page_size < 1:
        return jsonify({"error": "Parameter 'page_size' must be at least 1"}), 400
    elif page is not None and page < 1:
        return jsonify({"error": "Parameter 'offset' must be at least 0"}), 400
    account_data, has_next_page = await accounts.get_accounts(page_size=page_size, page=page,
                                                              domain_filter=domain_filter, name_filter=name_filter)
    response_data = {
        "page": page,
        "next_page": has_next_page,
        "accounts": RemoteAccountResponseSchema(many=True).dump(account_data),
    }
    return jsonify(response_data)


@accounts_api.route("/<domain>/<name>", methods=["GET"])
@api_wrapper
@permissions_required(["view-accounts"])
async def view_remote_account(domain: str, name: str) -> Response:
    """
    Retrieve the details of a remote account.
    ---
    get:
        tags:
          - Accounts
        description: Retrieve a remote account.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: domain
            description: Domain of the account to retrieve.
            in: path
            required: true
            schema:
                type: string
                example: "example.com"
          - name: name
            description: Name of the account to retrieve.
            in: path
            required: true
            schema:
                type: string
                example: "MyRemoteAccount"
          - name: include_cookies
            description: Whether to include cookies in the response.
            in: query
            required: false
            schema:
                type: boolean
                default: false
        responses:
            200:
                description: Details for a remote account.
                content:
                    application/json:
                        schema:
                            $ref: "#/components/schemas/RemoteAccountResponseSchema"
            404:
                description: Account not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "Account not found"
    """
    include_cookies = str(request.args.get("include_cookies", default="false")).lower() == "true"
    account_data = await accounts.get_account(domain, name)
    if not account_data:
        return jsonify({"error": "Account not found"}), 404
    account_response = RemoteAccountResponseSchema().dump(account_data)
    if not include_cookies:
        account_response.pop("cookies")
    return jsonify(account_response), 200


@accounts_api.route("/<domain>/<name>", methods=["POST"])
@api_wrapper
@permissions_required(["add-accounts"])
async def add_remote_account(domain: str, name: str) -> Response:
    """
    Add a new remote account.
    ---
    post:
        description: Create a new remote account.
        tags:
          - Accounts
        security:
          - ApiKeyAuth: []
        parameters:
          - name: domain
            description: Domain of the account to create.
            in: path
            required: true
            schema:
                type: string
                example: "example.com"
          - name: name
            description: Name of the account to create.
            in: path
            required: true
            schema:
                type: string
                example: "MyRemoteAccount"
        consumes:
          - multipart/form-data
        requestBody:
            required: true
            content:
                multipart/form-data:
                    schema:
                        type: object
                        properties:
                            cookies_file:
                                type: string
                                format: binary
                                content: text/plain
                                description: A Netscape/Mozilla format cookies.txt file.
                                required: true
                            icon:
                                type: string
                                format: binary
                                content: image/*
                                description: Optional account icon image (ICO, JPEG, PNG, etc).
                            account_data:
                                $ref: "#/components/schemas/RemoteAccountSubmitSchema"
                                required: true
        responses:
            201:
                description: Account created successfully.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                account_name:
                                    type: string
                                    example: "MyAccountName"
            400:
                description: Parsing error or invalid input.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "Cookies.txt could not be parsed."
            409:
                description: Account with submitted name already exists.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "Account with the name 'Name' already exists"

    """
    form_data = await request.form
    request_files = await request.files
    cookies_file = request_files.get("cookies_file")
    icon_file = request_files.get("icon")
    if not cookies_file:
        return jsonify({"error": "Missing cookies.txt file"}), 400
    try:
        json_data = json.loads(form_data.get("account_data", "{}"))
        account_details = RemoteAccountSubmitSchema().load(json_data)
        cookies_text = cookies_file.read()
        cookies_io = StringIO(cookies_text.decode("utf-8"))
        cookies_io.name = cookies_file.filename
        cookie_jar = accounts.get_cookiejar_from_txt(file_handler=cookies_io)
        if not icon_file:
            icon_bytes = await accounts.fetch_favicon(account_details.get("domain"))
        else:
            icon_bytes = icon_file.read()
        account_name = await accounts.save_account(account_details.get("domain"), account_details.get("name"),
                                                   account_details.get("notes"), cookie_jar, icon_bytes)
        if account_name:
            return jsonify({"account_name": account_name}), 201
    except UnicodeDecodeError:
        return jsonify({"error": "Failed to decode valid UTF-8 text from cookies file."}), 400
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse provided account data as valid JSON."}), 400
    except MarshmallowValidationError:
        return jsonify({"error": "Provided account data was not in the expected format."}), 400
    except accounts.InvalidCookiesFormatException or accounts.IconFetchError as e:
        return jsonify({"error": str(e)}), 400
    except accounts.DuplicateAccountException as e:
        return jsonify({"error": str(e)}), 409
    return "", 200


@accounts_api.route("/<domain>/<name>", methods=["PUT", "DELETE"])
@api_wrapper
@permissions_required(["manage-accounts"])
async def modify_remote_account(domain, name) -> Response:
    """
    Modify or delete a remote account.
    ---
    put:
        tags:
          - Accounts
        description: Update an existing remote account.
    delete:
        tags:
          - Accounts
        description: Delete a remote account.
        security:
          - ApiKeyAuth: []
        parameters:
          - name: domain
            description: Domain of the account to delete.
            in: path
            required: true
            schema:
                type: string
                example: "example.com"
          - name: name
            description: Name of the account to delete.
            in: path
            required: true
            schema:
                type: string
                example: "MyRemoteAccount"
        responses:
            204:
                description: Successfully deleted remote account.
            400:
                description: Failed to delete remote account.
            404:
                description: Account not found.
                content:
                    application/json:
                        schema:
                            type: object
                            properties:
                                error:
                                    type: string
                                    example: "Account not found"
    """
    match request.method:
        case "PUT":
            return "", 200
        case "DELETE":
            try:
                if await accounts.delete_account(domain, name):
                    return "", 204
            except accounts.MissingAccountException:
                return jsonify({"error": "Account not found"}), 404
            return "", 400

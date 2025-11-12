import base64
import os


def env_dict(prefix: str) -> dict:
    """
    Get a dict of environment variables with a specific prefix.

    :param prefix: Environment variable prefix
    :return: Dict of environment variables with prefix removed
    """
    return {
        key.replace(f"{prefix}_", ""): (
            val if val != "true" or val != "false" else val == "true"
        ) for key, val in os.environ.items() if key.startswith(f"{prefix}_")
    }


def b64bytes(obj: bytes) -> str:
    """
    Encode bytes as a Base64 string

    :param obj: Bytes to encode
    :return: B64 encoded string
    """
    return base64.b64encode(obj).decode("utf-8")

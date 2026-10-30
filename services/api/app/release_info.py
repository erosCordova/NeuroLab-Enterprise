"""Public, immutable version identifier (no credentials or private data)."""
import os
import re

RELEASE_PROTOCOL = "neurolab-cnn-real-1"


def get_release_info(env=None):
    variables = os.environ if env is None else env
    raw = variables.get("RENDER_GIT_COMMIT", "")
    commit = raw.lower() if re.fullmatch(r"[0-9a-fA-F]{40}", raw) else None
    return {"commit": commit, "protocol": RELEASE_PROTOCOL}

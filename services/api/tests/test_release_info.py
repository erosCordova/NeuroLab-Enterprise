import pytest
from app.release_info import get_release_info


def test_normalizes_public_git_sha():
    assert get_release_info({"RENDER_GIT_COMMIT": "A" * 40}) == {
        "commit": "a" * 40, "protocol": "neurolab-cnn-real-1"
    }


@pytest.mark.parametrize("value", [
    "", "ab12", "x" * 40, "a" * 41, "a" * 39,
    "a" * 40 + "\nDATABASE_URL=secret", " a" * 20,
])
def test_rejects_invalid_commit_and_never_leaks_its_contents(value):
    result = get_release_info({"RENDER_GIT_COMMIT": value})
    assert result["commit"] is None
    assert "secret" not in str(result)

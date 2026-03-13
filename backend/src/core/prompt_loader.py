"""
Section C: Load prompt text by path (relative to prompts/) and substitute {{key}} from structured_input.
Real prompt files can be dropped into backend/prompts/ and referenced by template prompt_path.
"""
import re

from . import storage


def load_prompt(prompt_path: str, structured_input: dict) -> str:
    """
    Load prompt from prompts/{prompt_path} and substitute {{key}} with structured_input[key].
    Missing keys are replaced with empty string.
    """
    path = storage.get_prompt_path(prompt_path)
    if not path.exists():
        raise FileNotFoundError("Prompt file not found: %s" % path)
    text = path.read_text(encoding="utf-8")

    def repl(match: re.Match) -> str:
        key = match.group(1)
        return str(structured_input.get(key, ""))

    return re.sub(r"\{\{(\w+)\}\}", repl, text)

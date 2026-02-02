import re
<<<<<<< HEAD

from partial_json_parser import loads as partial_json_loads
=======
from typing import Any
from partial_json_parser import loads as partial_json_loads  # type: ignore[import-untyped]
>>>>>>> upstream/main

# Strip ```json ... ``` or ``` ... ``` code fences that some models add despite json_mode
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


<<<<<<< HEAD
def parse_llm_json_stream(input_str: str) -> dict[str, str] | None:
    # Remove markdown code fences before attempting JSON parse
    cleaned = _CODE_FENCE_RE.sub("", input_str).strip()
    try:
        opening_bracket_index = cleaned.index("{")
        json_part = cleaned[opening_bracket_index:]
        json_object = partial_json_loads(json_part)
        return json_object

    except ValueError as e:
        # If no "{" found after 10 chars it's a plain-text answer
        if len(input_str) > 10 and "substring not found" in str(e):
            return {"answer": input_str}
        return {}
=======
def parse_llm_json_stream(input_str: str) -> dict[str, Any] | None:
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    cleaned = re.sub(r"^```(?:json)?\s*", "", input_str.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned)

    brace_idx = cleaned.find("{")
    if brace_idx == -1:
        return {"answer": input_str} if len(input_str) > 10 else {}

    try:
        json_object = partial_json_loads(cleaned[brace_idx:])
        if not isinstance(json_object, dict):
            return None
        return json_object  # type: ignore[return-value]
    except Exception:
        return None
>>>>>>> upstream/main

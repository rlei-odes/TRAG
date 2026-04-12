import re

from partial_json_parser import loads as partial_json_loads

# Strip ```json ... ``` or ``` ... ``` code fences that some models add despite json_mode
_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


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

"""Strict comparison contracts: never manufacture a winning candidate."""
import json
import re

def parse_burst_choice(raw, count):
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
    try:
        data = json.loads(text)
    except (ValueError, TypeError) as exc:
        raise ValueError("invalid_comparison: JSON inválido; ráfaga pendiente") from exc
    if not isinstance(data, dict):
        raise ValueError("invalid_comparison: respuesta incompleta")
    best = data.get("best")
    if type(best) is not int or not 1 <= best <= count:
        raise ValueError("invalid_comparison: ganadora fuera de la ráfaga")
    reason = data.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError("invalid_comparison: falta motivo de comparación")
    return best, reason.strip()[:500]

def selected_model(config, task, assigned, available, requested=None):
    explicit = requested or config.get(f"model_{task}")
    if explicit:
        if explicit not in available or (assigned and explicit not in assigned):
            raise ValueError("El modelo elegido ya no está asignado a esta herramienta")
        return explicit
    choices = assigned or available
    if not choices:
        raise ValueError("Asigna un modelo a esta herramienta")
    return choices[0]

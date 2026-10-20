"""Tests de integración explícitos (`@pytest.mark.integration`): dependen de servicios externos
reales (Internet). No se ejecutan en la suite local: se DESELECCIONAN (visible en el resumen,
nunca como skip). Ejecutarlos: RUN_INTEGRATION=1 python -m pytest -m integration tests
Con RUN_INTEGRATION=1 un fallo de red es un FALLO, no un skip."""
import os

import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "integration: requiere servicios externos reales (RUN_INTEGRATION=1)")


def pytest_collection_modifyitems(config, items):
    if os.environ.get("RUN_INTEGRATION") == "1":
        return
    keep, drop = [], []
    for item in items:
        (drop if item.get_closest_marker("integration") else keep).append(item)
    if drop:
        config.hook.pytest_deselected(items=drop)
        items[:] = keep
        config._integration_deselected = [i.nodeid for i in drop]


def pytest_sessionfinish(session):
    # Worker de xdist → envía los deseleccionados al controlador (canal oficial workeroutput).
    if hasattr(session.config, "workeroutput"):
        session.config.workeroutput["integration_deselected"] = getattr(session.config, "_integration_deselected", [])


def pytest_testnodedown(node, error):
    ids = set(getattr(node.config, "_integration_deselected", []))
    ids.update(getattr(node, "workeroutput", {}).get("integration_deselected", []))
    node.config._integration_deselected = sorted(ids)


def pytest_terminal_summary(terminalreporter, config):
    ids = getattr(config, "_integration_deselected", None)
    if ids:
        terminalreporter.write_line(f"Integración deseleccionada ({len(ids)}; ejecutar con RUN_INTEGRATION=1):")
        for nid in ids:
            terminalreporter.write_line(f"  {nid}")

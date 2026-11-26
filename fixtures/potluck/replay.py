#!/usr/bin/env python3
"""Run the actual historical Potluck test with isolated network dependencies.

The two input files are unchanged copies from Potluck commit e72bb46. Only the
selected functions are loaded. The regression variant changes one condition in
the in-memory AST; no source file or production service is modified.
"""
from __future__ import annotations

import argparse
import ast
import asyncio
import json
import logging
from pathlib import Path
import types
from typing import Callable

HERE = Path(__file__).resolve().parent
TEST_NAME = "test_a_proof_retry_only_considers_machines_that_prove_the_same_markers"
ROUTING_NAMES = {
    "_read_caps", "_first_match", "_search", "listed_markers", "_replacement_peer"
}


class FakeClient:
    def __init__(self, **_kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False


class MarkerRegression(ast.NodeTransformer):
    """Model a proposed change that drops marker matching on retry."""

    def __init__(self):
        self.replacements = 0

    def visit_BoolOp(self, node):
        self.generic_visit(node)
        # Match only: markers is None or listed_markers(cap) == markers.
        if (isinstance(node.op, ast.Or) and len(node.values) == 2
                and ast.unparse(node) == "markers is None or listed_markers(cap) == markers"):
            self.replacements += 1
            return ast.copy_location(ast.Constant(value=True), node)
        return node


class MonkeyPatch:
    def setattr(self, target, name, value):
        setattr(target, name, value)


def extract(tree: ast.Module, names: set[str]) -> list[ast.AST]:
    selected = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    found = {n.name for n in selected}
    if found != names:
        raise RuntimeError(f"Missing original functions: {sorted(names - found)}")
    return selected


def run(variant: str) -> dict:
    original = ast.parse((HERE / "gateway_routing.py").read_text())
    functions = extract(original, ROUTING_NAMES)
    replacements = 0
    if variant == "regression":
        mutation = MarkerRegression()
        functions = [mutation.visit(n) for n in functions]
        replacements = mutation.replacements
        if replacements != 1:
            raise RuntimeError(f"Expected one marker condition, found {replacements}")

    direct = types.ModuleType("isolated_potluck_gateway")
    direct.__dict__.update({
        "asyncio": asyncio,
        "Callable": Callable,
        "httpx": types.SimpleNamespace(AsyncClient=FakeClient),
        "logger": logging.getLogger("potluck-replay"),
        "_CAPS_TIMEOUT_S": 2.0,
        "_CAPS_RETRY_TIMEOUT_S": 6.0,
        "HouseholdSilent": type("HouseholdSilent", (RuntimeError,), {}),
        "household_peers": None,
        "_peer_caps": None,
    })
    module = ast.Module(body=[ast.parse("from __future__ import annotations").body[0], *functions], type_ignores=[])
    exec(compile(ast.fix_missing_locations(module), str(HERE / "gateway_routing.py"), "exec"), direct.__dict__)

    test_tree = ast.parse((HERE / "test_peer_tools.py").read_text())
    test = extract(test_tree, {TEST_NAME})
    test_module = ast.Module(body=test, type_ignores=[])
    test_globals = {"asyncio": asyncio, "direct": direct}
    exec(compile(ast.fix_missing_locations(test_module), str(HERE / "test_peer_tools.py"), "exec"), test_globals)
    try:
        test_globals[TEST_NAME](MonkeyPatch())
        passed, detail = True, "All three original assertions passed."
    except AssertionError:
        passed, detail = False, "An original assertion failed after marker matching was removed."
    return {
        "variant": variant,
        "passed": passed,
        "test": TEST_NAME,
        "detail": detail,
        "mutation_count": replacements,
        "scope": "Original test and routing functions, with network dependencies replaced by test doubles.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("variant", choices=("baseline", "regression"))
    args = parser.parse_args()
    try:
        result = run(args.variant)
        print(json.dumps(result))
        raise SystemExit(0 if result["passed"] else 1)
    except Exception as error:
        print(json.dumps({"variant": args.variant, "error": type(error).__name__, "detail": str(error)}))
        raise SystemExit(2)

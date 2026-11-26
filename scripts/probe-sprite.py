"""Verify the public historical replay on a Sprite without repository access."""
import ast
import asyncio
import copy
import logging
import types
from typing import Callable
from urllib.request import urlopen

base = 'https://raw.githubusercontent.com/newtorob/potluck-ai/e72bb4677934c3b9a9d47f656e5550731d8f2223/apps/desktop/python/'
source = ast.parse(urlopen(base + 'potluck_local/services/gateway_routing.py', timeout=15).read().decode())
tests = ast.parse(urlopen(base + 'tests/test_peer_tools.py', timeout=15).read().decode())
names = {'_read_caps', '_first_match', '_search', 'listed_markers', '_replacement_peer'}
testname = 'test_a_proof_retry_only_considers_machines_that_prove_the_same_markers'


class Client:
    def __init__(self, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return False


class Monkey:
    def setattr(self, target, name, value): setattr(target, name, value)


class Mutation(ast.NodeTransformer):
    count = 0

    def visit_BoolOp(self, node):
        self.generic_visit(node)
        if isinstance(node.op, ast.Or) and ast.unparse(node) == 'markers is None or listed_markers(cap) == markers':
            self.count += 1
            return ast.copy_location(ast.Constant(value=True), node)
        return node


outcomes = []
for mode in ('baseline', 'hypothetical_regression'):
    nodes = [copy.deepcopy(n) for n in source.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert {n.name for n in nodes} == names
    if mode != 'baseline':
        mutation = Mutation()
        nodes = [mutation.visit(n) for n in nodes]
        assert mutation.count == 1
    direct = types.ModuleType('potluck_demo')
    direct.__dict__.update({'asyncio': asyncio, 'Callable': Callable, 'httpx': types.SimpleNamespace(AsyncClient=Client),
                            'logger': logging.getLogger('demo'), '_CAPS_TIMEOUT_S': 2, '_CAPS_RETRY_TIMEOUT_S': 6,
                            'HouseholdSilent': RuntimeError, 'household_peers': None, '_peer_caps': None})
    body = [ast.parse('from __future__ import annotations').body[0]] + nodes
    exec(compile(ast.fix_missing_locations(ast.Module(body=body, type_ignores=[])), '<original-routing-functions>', 'exec'), direct.__dict__)
    selected = next(n for n in tests.body if isinstance(n, ast.FunctionDef) and n.name == testname)
    scope = {'asyncio': asyncio, 'direct': direct}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[selected], type_ignores=[])), '<original-test>', 'exec'), scope)
    try:
        scope[testname](Monkey())
        outcomes.append(True)
        print(mode + ': PASS')
    except AssertionError:
        outcomes.append(False)
        print(mode + ': FAIL')
assert outcomes == [True, False], 'Replay did not produce the expected comparison'

import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from ai_contracts import parse_burst_choice, selected_model

@pytest.mark.parametrize("raw", ['{}','{"best":0,"reason":"x"}','{"best":9,"reason":"x"}','{"best":true,"reason":"x"}','{"best":"1","reason":"x"}','{"best":1}', '{"best":1,', '[]'])
def test_invalid_never_becomes_first_photo(raw):
    with pytest.raises(ValueError): parse_burst_choice(raw, 8)

def test_valid_choice_and_fences():
    assert parse_burst_choice('```json\n{"best":8,"reason":"ojos abiertos"}\n```',8)==(8,'ojos abiertos')

def test_explicit_model_and_no_silent_fallback():
    assert selected_model({'model_seleccion':'b'},'seleccion',['a','b'],['a','b'])=='b'
    assert selected_model({},'ajustes',[],['a','b'])=='a'
    with pytest.raises(ValueError): selected_model({'model_seleccion':'missing'},'seleccion',['a'],['a'])
    with pytest.raises(ValueError): selected_model({},'seleccion',['a'],['a','b'],'b')

# Compile the actual route function without booting production Mongo or loading keys.
def route():
    tree=ast.parse((Path(__file__).parents[1]/'server.py').read_text())
    f=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='ai_select_burst')
    f.decorator_list=[]; f.returns=None
    for arg in f.args.args: arg.annotation=None
    f.args.defaults=[]
    engine=AsyncMock(return_value='{"best":2,"reason":"expresión más natural"}')
    scope={'HTTPException':HTTPException,'parse_burst_choice':parse_burst_choice,'_ai_multi_vision':engine}
    exec(compile(ast.Module(body=[f],type_ignores=[]),'route','exec'),scope)
    return scope['ai_select_burst'],engine

def test_actual_route_rejects_truncation_and_invalid_json():
    fn,engine=route()
    body=SimpleNamespace(candidates=[SimpleNamespace(filename=str(i),image_base64='preview') for i in range(9)])
    with pytest.raises(HTTPException) as e: asyncio.run(fn(body,None))
    assert e.value.status_code==400
    engine.assert_not_called()
    body.candidates=body.candidates[:8]
    engine.return_value='{"best":99,"reason":"x"}'
    with pytest.raises(HTTPException) as e: asyncio.run(fn(body,None))
    assert e.value.status_code==502

def test_actual_route_exact_winner_and_schema():
    fn,engine=route()
    body=SimpleNamespace(candidates=[SimpleNamespace(filename=str(i),image_base64='preview') for i in range(8)])
    result=asyncio.run(fn(body,None))
    assert result['best_filename']=='1'
    assert result['comparison_version']=='burst-winner-v2'
    assert len(engine.call_args.args[3])==8
    assert engine.call_args.kwargs['schema']['properties']['best']['maximum']==8


def gateway(status=200, enabled=True, timeout=False):
    from unittest.mock import Mock
    from typing import Optional
    import re, requests
    tree=ast.parse((Path(__file__).parents[1]/'server.py').read_text())
    fn=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='_ai_multi_vision')
    fn.decorator_list=[]
    rec={'id':'test','enabled':enabled,'api_key':'synthetic-test-only','endpoint':'https://integrate.api.nvidia.com/v1','available_models':['google/diffusiongemma-26b-a4b-it'],'seleccion_models':['google/diffusiongemma-26b-a4b-it']}
    cfg={'seleccion':'custom:test','model_seleccion':'google/diffusiongemma-26b-a4b-it'}
    post=Mock()
    post.return_value=SimpleNamespace(ok=status<400,status_code=status,headers={'Retry-After':'60'},json=lambda:{'choices':[{'message':{'content':'{"best":2,"reason":"valid"}'}}]})
    if timeout: post.side_effect=requests.Timeout()
    fake_requests=SimpleNamespace(post=post,Timeout=requests.Timeout,RequestException=requests.RequestException)
    scope={'Optional':Optional,'HTTPException':HTTPException,'asyncio':asyncio,'re':re,'AI_TASKS':('seleccion','ajustes','album'),'selected_model':selected_model,'requests':fake_requests,'db':SimpleNamespace(ai_config=SimpleNamespace(find_one=AsyncMock(return_value=cfg)),ai_providers=SimpleNamespace(find_one=AsyncMock(return_value=rec)))}
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'gateway','exec'),scope)
    return scope['_ai_multi_vision'],post

def test_actual_gateway_honors_exact_model_and_nvidia_contract():
    fn,post=gateway()
    assert asyncio.run(fn('seleccion','system','prompt',['preview1','preview2'],schema={'type':'object'}))
    payload=post.call_args.kwargs['json']
    assert payload['model']=='google/diffusiongemma-26b-a4b-it'
    assert payload['chat_template_kwargs']=={'enable_thinking':False}
    assert payload['response_format']['type']=='json_schema'
    assert len(payload['messages'][1]['content'])==3

@pytest.mark.parametrize('status',[401,402,403,429,503])
def test_actual_gateway_preserves_status_without_fallback(status):
    fn,post=gateway(status=status)
    with pytest.raises(HTTPException) as e: asyncio.run(fn('seleccion','s','p',['img']))
    assert e.value.status_code==status
    assert post.call_count==1
    if status==429: assert e.value.headers['Retry-After']=='60'

def test_disabled_provider_never_falls_back():
    fn,post=gateway(enabled=False)
    with pytest.raises(HTTPException) as e: asyncio.run(fn('seleccion','s','p',['img']))
    assert e.value.status_code==400
    post.assert_not_called()

def test_ambiguous_timeout_is_explicit():
    fn,post=gateway(timeout=True)
    with pytest.raises(HTTPException) as e: asyncio.run(fn('seleccion','s','p',['img']))
    assert e.value.status_code==504
    assert 'provider_timeout' in e.value.detail

import ast
from pathlib import Path

source=Path(__file__).parents[1].joinpath('server.py').read_text()
module=ast.parse(source)
node=next(n for n in module.body if isinstance(n,ast.FunctionDef) and n.name=='_lr_job_payload')
namespace={}
exec(compile(ast.Module(body=[node],type_ignores=[]),'lr_contract','exec'),namespace)
convert=namespace['_lr_job_payload']

def test_dng_settings_and_curve_are_preserved():
    xmp='''<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"><rdf:RDF><rdf:Description crs:Exposure2012="1.25" crs:CameraProfile="Adobe Color" crs:ProcessVersion="15.4" crs:HasSettings="True"><crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012></rdf:Description></rdf:RDF></x:xmpmeta>'''
    result=convert({'id':'test','filename':'TEST.DNG','xmp_content':xmp})
    assert result['develop_settings']=={'Exposure2012':1.25,'CameraProfile':'Adobe Color','ProcessVersion':'15.4','ToneCurvePV2012':[0,0,255,255]}
    assert result['id']=='test'

def test_invalid_xmp_never_becomes_successful_settings():
    assert convert({'xmp_content':'broken'})['develop_settings']=={}

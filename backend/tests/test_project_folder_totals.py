import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace

source=Path(__file__).parents[1].joinpath('server.py').read_text()
module=ast.parse(source)
names={'_apply_folder_totals','_projects_with_folder_totals'}
nodes=[n for n in module.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in names]
namespace={'Project':lambda **doc:doc}
exec(compile(ast.Module(body=nodes,type_ignores=[]),'project_totals','exec'),namespace)
apply=namespace['_apply_folder_totals']

def test_bautixo_shows_real_folder_total_instead_of_zero_without_mutating_storage():
    original={'id':'bautixo','total_images':0,'processed_images':0,'status':'created'}
    result=apply(original,{'total_images':774,'processed_images':600,'active_folders':1,'completed_folders':1})
    assert result['total_images']==774
    assert result['processed_images']==600
    assert result['status']=='completed'
    assert original['total_images']==0

def test_multiple_folders_sum_once_and_partial_project_remains_processing():
    result=apply({'total_images':774}, {'total_images':1000,'processed_images':700,'active_folders':2,'completed_folders':1})
    assert result['total_images']==1000 and result['processed_images']==700
    assert result['status']=='processing'

def test_legacy_project_and_empty_folders_keep_existing_counters():
    legacy={'total_images':509,'processed_images':400,'status':'completed'}
    assert apply(legacy,None)==legacy
    assert apply(legacy,{'total_images':0})==legacy

def test_progress_does_not_exceed_total():
    assert apply({}, {'total_images':4,'processed_images':7})['processed_images']==4

def test_summary_query_is_scoped_to_account_and_visible_project_ids():
    class Cursor:
        async def to_list(self,limit):
            assert limit==1
            return [{'_id':'p','total_images':774,'processed_images':600,'active_folders':1,'completed_folders':1}]
    class Folders:
        def aggregate(self,pipeline):
            assert pipeline[0]=={'$match':{'user_id':'owner','project_id':{'$in':['p']}}}
            assert '$group' in pipeline[1]
            return Cursor()
    namespace['db']=SimpleNamespace(project_folders=Folders())
    result=asyncio.run(namespace['_projects_with_folder_totals']([{'id':'p','total_images':0}],'owner'))
    assert result[0]['total_images']==774

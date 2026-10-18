from pathlib import Path
import pytest
LuaRuntime=pytest.importorskip('lupa').LuaRuntime
PLUGIN=Path(__file__).parents[1]/'lightroom-plugin/rawai_studio.lrplugin'

def run_plugin(mode):
    lua=LuaRuntime(unpack_returned_tuples=True)
    lua.globals().mode=mode
    lua.execute('package.path = '+repr(str(PLUGIN/'?.lua'))+' .. ";" .. package.path')
    lua.execute('''
    local JSON=require 'json'
    applied=0; acknowledged=0; messages={}
    local prefs={baseUrl='https://editflow.krfoto.com',token='synthetic-test'}
    local photo={getFormattedMetadata=function() return 'TEST.DNG' end, applyDevelopSettings=function(self,settings)
        if mode=='catalog_failure' then error('locked') end
        assert(settings.Exposure2012==1.25);applied=applied+1
    end}
    local catalog={getTargetPhotos=function()return {photo} end,withWriteAccessDo=function(self,name,fn,opts) fn();return 'executed' end}
    local modules={
      LrApplication={activeCatalog=function()return catalog end},
      LrPrefs={prefsForPlugin=function()return prefs end},
      LrTasks={startAsyncTask=function(fn)fn()end,pcall=pcall},
      LrDialogs={message=function(title,msg,level)messages[#messages+1]=msg end},
      LrProgressScope=function() return {isCanceled=function()return false end,setPortionComplete=function()end,done=function()end} end,
      LrHttp={post=function(url,body,headers)
        assert(url:match('^https://editflow.krfoto.com/api/'))
        if mode=='unauthorized' then return '{}',{status=401} end
        if url:match('/pending$') then
          local request=JSON.decode(body);assert(request.filenames[1]=='TEST.DNG')
          return JSON.encode({jobs={{id='synthetic-job',filename='TEST.DNG',develop_settings={Exposure2012=1.25}}}}),{status=200}
        end
        local request=JSON.decode(body);acknowledged=acknowledged+#request.ids
        return '{"ok":true}',{status=200}
      end}
    }
    import=function(name)assert(modules[name],name);return modules[name]end
    ''')
    lua.execute((PLUGIN/'Sync.lua').read_text())
    return lua.globals()

def test_dng_applies_directly_and_only_then_acknowledges():
    state=run_plugin('success')
    assert state.applied==1 and state.acknowledged==1

def test_catalog_failure_retains_pending_job():
    state=run_plugin('catalog_failure')
    assert state.applied==0 and state.acknowledged==0
    assert 'Fallidas' in state.messages[1]

def test_unauthorized_never_marks_work_done():
    state=run_plugin('unauthorized')
    assert state.applied==0 and state.acknowledged==0
    assert '401' in state.messages[1]

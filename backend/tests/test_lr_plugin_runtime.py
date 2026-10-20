from pathlib import Path
import pytest
LuaRuntime = pytest.importorskip('lupa').LuaRuntime
PLUGIN = Path(__file__).parents[1] / 'lightroom-plugin/rawai_studio.lrplugin'


def run_plugin(mode, tmp_path=None):
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.globals().mode = mode
    lua.globals().tmpdir = str(tmp_path or '/nonexistent')
    lua.execute('package.path = ' + repr(str(PLUGIN / '?.lua')) + ' .. ";" .. package.path')
    lua.execute('''
    local JSON=require 'json'
    applied=0; acknowledged=0; messages={}; ackIds={}; matchQuery=nil
    local prefs={baseUrl='https://editflow.krfoto.com',token='synthetic-test',writeSidecar=(mode=='sidecar' or mode=='sidecar_dng')}
    local function mkphoto(name, path)
      local p={dev={}, meta={}}
      function p:getFormattedMetadata() return name end
      function p:getRawMetadata(k) if k=='path' then return path end return self.meta[k] end
      function p:setRawMetadata(k,v) self.meta[k]=v end
      function p:applyDevelopSettings(settings)
        if mode=='catalog_failure' then error('locked') end
        for k,v in pairs(settings) do self.dev[k]=v end
        if mode=='lr_ignores' then self.dev.Exposure2012=0 end
        applied=applied+1
      end
      function p:getDevelopSettings() return self.dev end
      return p
    end
    local ext = (mode=='sidecar_dng') and '.DNG' or '.CR3'
    photos={mkphoto('IMG_1'..ext, tmpdir..'/Boda/IMG_1'..ext), mkphoto('IMG_2.CR3', tmpdir..'/Boda/IMG_2.CR3'),
            mkphoto('DUP.CR3','/a/DUP.CR3'), mkphoto('NONE.CR3','/a/NONE.CR3')}
    local catalog={getTargetPhotos=function()return photos end,withWriteAccessDo=function(self,name,fn,opts) fn();return 'executed' end}
    local function job(id,name)
      return {id=id,filename=name,develop_settings={Exposure2012=1.25,WhiteBalance='As Shot'},expected={Exposure2012=1.25},
              tolerance={Exposure2012=0.011},rating='5',label='Verde',catalog_unsupported={},xmp_content='<x:xmpmeta/>'}
    end
    local modules={
      LrApplication={activeCatalog=function()return catalog end},
      LrPrefs={prefsForPlugin=function()return prefs end},
      LrTasks={startAsyncTask=function(fn)fn()end,pcall=pcall},
      LrDialogs={message=function(title,msg,level)messages[#messages+1]=msg end},
      LrProgressScope=function() return {isCanceled=function()return false end,setPortionComplete=function()end,done=function()end} end,
      LrHttp={post=function(url,body,headers)
        assert(url:match('^https://editflow.krfoto.com/api/'))
        if mode=='unauthorized' then return '{}',{status=401} end
        local req=JSON.decode(body)
        if url:match('/lr/match$') then
          matchQuery=req
          return JSON.encode({protocol=3,results={
            {key='1',name=req.photos[1].name,status='matched',job_id='j1',via='path'},
            {key='2',name='IMG_2.CR3',status='matched',job_id='j2',via='path'},
            {key='3',name='DUP.CR3',status='ambiguous',reason='2 ediciones pendientes con este nombre'},
            {key='4',name='NONE.CR3',status='missing'}}}),{status=200}
        end
        if url:match('/lr/jobs$') then
          local jobs={}
          for _,id in ipairs(req.ids) do jobs[#jobs+1]=job(id, id=='j1' and req and 'IMG_1' or 'IMG_2.CR3') end
          return JSON.encode({jobs=jobs}),{status=200}
        end
        for _,id in ipairs(req.ids) do ackIds[#ackIds+1]=id end
        acknowledged=acknowledged+#req.ids
        return '{"ok":true}',{status=200}
      end}
    }
    import=function(name)assert(modules[name],name);return modules[name]end
    ''')
    lua.execute((PLUGIN / 'Sync.lua').read_text())
    return lua.globals()


def test_match_sends_paths_and_reports_all_categories():
    st = run_plugin('success')
    assert st.matchQuery.photos[1].path.endswith('/Boda/IMG_1.CR3')
    assert st.applied == 2 and st.acknowledged == 2
    msg = st.messages[1]
    assert 'Aplicadas y verificadas: 2' in msg and 'Faltantes (sin edición pendiente): 1' in msg
    assert 'Ambiguas (no aplicadas): 1' in msg and 'DUP.CR3' in msg and 'Fallidas (conservadas para reintentar): 0' in msg
    assert st.photos[1].meta.rating == 5 and st.photos[1].meta.colorNameForLabel == 'green'


def test_catalog_failure_retains_pending_job():
    st = run_plugin('catalog_failure')
    assert st.applied == 0 and st.acknowledged == 0
    assert 'Fallidas (conservadas para reintentar): 2' in st.messages[1] and 'rechazó' in st.messages[1]


def test_verification_failure_never_acknowledges():
    st = run_plugin('lr_ignores')
    assert st.applied == 2 and st.acknowledged == 0
    assert 'verificación' in st.messages[1]


def test_unauthorized_never_marks_work_done():
    st = run_plugin('unauthorized')
    assert st.applied == 0 and st.acknowledged == 0
    assert '401' in st.messages[1]


def test_sidecar_written_next_to_raw_never_into_it(tmp_path):
    (tmp_path / 'Boda').mkdir()
    raw = tmp_path / 'Boda' / 'IMG_1.CR3'
    raw.write_bytes(b'RAWDATA')
    st = run_plugin('sidecar', tmp_path)
    assert st.acknowledged == 2
    assert raw.read_bytes() == b'RAWDATA'
    assert (tmp_path / 'Boda' / 'IMG_1.xmp').read_text() == '<x:xmpmeta/>'


def test_dng_applied_in_catalog_without_sidecar_or_file_writes(tmp_path):
    (tmp_path / 'Boda').mkdir()
    dng = tmp_path / 'Boda' / 'IMG_1.DNG'
    dng.write_bytes(b'DNGDATA')
    st = run_plugin('sidecar_dng', tmp_path)
    assert st.acknowledged == 2 and dng.read_bytes() == b'DNGDATA'
    assert not (tmp_path / 'Boda' / 'IMG_1.xmp').exists()
    assert 'Fallidas (conservadas para reintentar): 0' in st.messages[1]

local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrHttp = import "LrHttp"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrProgressScope = import "LrProgressScope"
local JSON = require "json"
local prefs = LrPrefs.prefsForPlugin()
local function apiCall(path, body)
    local base = prefs.baseUrl or "https://editflow.krfoto.com"
    if base == "https://edit.krfoto.com" or base == "https://edit.krimagina.com" then base = "https://editflow.krfoto.com" end
    base = base:gsub("/+$", ""):gsub("/api$", "")
    local raw, headers = LrHttp.post(base .. "/api" .. path, JSON.encode(body), {{field="Content-Type",value="application/json"},{field="X-LR-Token",value=prefs.token or ""}},"POST",120)
    local status = headers and tonumber(headers.status)
    if status and status ~= 200 then error("HTTP " .. tostring(status) .. ". Revisa el servidor y el token de EditFlow.") end
    local ok, data = pcall(function() return JSON.decode(raw or "") end)
    if not ok or not data then error("Respuesta inválida de EditFlow. Comprueba la URL en Configurar.") end
    return data
end
LrTasks.startAsyncTask(function()
    if not prefs.token or prefs.token == "" then LrDialogs.message("EditFlow","Configura primero el token de EditFlow.","warning");return end
    local catalog = LrApplication.activeCatalog()
    local photos = catalog:getTargetPhotos()
    if #photos == 0 then LrDialogs.message("EditFlow","Selecciona las fotos del trabajo en Lightroom.","warning");return end
    local progress = LrProgressScope {title="EditFlow: sincronizando con Lightroom"}
    local applied, missing, failed = 0,0,0
    local ok, err = LrTasks.pcall(function()
        for start=1,#photos,100 do
            if progress:isCanceled() then break end
            local names, chunk = {},{}
            for i=start,math.min(start+99,#photos) do
                local name=photos[i]:getFormattedMetadata("fileName") or ""
                names[#names+1]=name;chunk[#chunk+1]={photo=photos[i],name=name:lower()}
            end
            local data=apiCall("/lr/pending",{filenames=names})
            if not data.jobs then error("El servidor no devolvió una cola válida.") end
            local jobs, ids = {},{}
            for _,job in ipairs(data.jobs) do jobs[(job.filename or ""):lower()]=job end
            for i,item in ipairs(chunk) do
                if progress:isCanceled() then break end
                local job=jobs[item.name]
                if not job then missing=missing+1
                elseif not job.develop_settings or next(job.develop_settings)==nil then failed=failed+1
                else
                    local success= LrTasks.pcall(function()
                        local result=catalog:withWriteAccessDo("EditFlow: edición IA",function()
                            item.photo:applyDevelopSettings(job.develop_settings,"EditFlow: edición IA")
                        end,{timeout=30})
                        if result ~= "executed" then error("El catálogo está ocupado") end
                    end)
                    if success then applied=applied+1;ids[#ids+1]=job.id else failed=failed+1 end
                end
                progress:setPortionComplete(start+i-1,#photos)
            end
            if #ids>0 then apiCall("/lr/complete",{ids=ids}) end
        end
    end)
    progress:done()
    local msg=string.format("Aplicadas al catálogo: %d\nSin edición pendiente: %d\nFallidas (conservadas para reintentar): %d",applied,missing,failed)
    if not ok then msg=msg .. "\n\n" .. tostring(err) end
    LrDialogs.message("EditFlow",msg,(ok and failed==0) and "info" or "warning")
end)

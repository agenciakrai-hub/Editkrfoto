local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrHttp = import "LrHttp"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrFunctionContext = import "LrFunctionContext"
local LrProgressScope = import "LrProgressScope"

local prefs = LrPrefs.prefsForPlugin()
local JSON = require "json"

local function apiCall(method, path, body)
    local base = (prefs.baseUrl or "https://edit.krfoto.com"):gsub("/+$", "")
    local url = base .. "/api" .. path
    local headers = {
        { field = "Content-Type", value = "application/json" },
        { field = "X-LR-Token", value = prefs.token or "" },
    }
    local resp, hdrs
    if method == "POST" then
        resp, hdrs = LrHttp.post(url, body or "{}", headers)
    else
        resp, hdrs = LrHttp.get(url, headers)
    end
    return resp
end

LrTasks.startAsyncTask(function()
    LrFunctionContext.callWithContext("rawai_sync", function(context)
        if not prefs.token or prefs.token == "" then
            LrDialogs.message("RAW AI Studio", "Configura primero el token (menú: Configurar).", "warning")
            return
        end
        local catalog = LrApplication.activeCatalog()
        local photos = catalog:getTargetPhotos()
        if #photos == 0 then
            LrDialogs.message("RAW AI Studio", "Selecciona al menos una foto.", "warning")
            return
        end

        -- 1) Descarga los XMP pendientes de la cuenta.
        local raw = apiCall("GET", "/lr/pending")
        if not raw then
            LrDialogs.message("RAW AI Studio", "No se pudo conectar con el servidor. Revisa URL/token.", "error")
            return
        end
        local ok, data = pcall(function() return JSON.decode(raw) end)
        if not ok or not data or not data.jobs then
            LrDialogs.message("RAW AI Studio", "Respuesta inválida del servidor.", "error")
            return
        end

        -- Indexa por nombre de archivo (en minúsculas).
        local byName = {}
        for _, job in ipairs(data.jobs) do
            byName[(job.filename or ""):lower()] = job
        end

        local progress = LrProgressScope { title = "RAW AI Studio: sincronizando…" }
        local applied, missing, doneIds = 0, 0, {}

        for i, photo in ipairs(photos) do
            local name = (photo:getFormattedMetadata("fileName") or ""):lower()
            local job = byName[name]
            if job and job.xmp_content then
                local rawPath = photo:getRawMetadata("path")
                if rawPath then
                    local dir = LrPathUtils.parent(rawPath)
                    local baseNoExt = LrPathUtils.removeExtension(LrPathUtils.leafName(rawPath))
                    local xmpPath = LrPathUtils.child(dir, baseNoExt .. ".xmp")
                    local fh = io.open(xmpPath, "w")
                    if fh then
                        fh:write(job.xmp_content)
                        fh:close()
                        catalog:withWriteAccessDo("readMeta", function()
                            photo:readMetadata()
                        end, { timeout = 30 })
                        applied = applied + 1
                        doneIds[#doneIds + 1] = job.id
                    end
                end
            else
                missing = missing + 1
            end
            progress:setPortionComplete(i, #photos)
            if progress:isCanceled() then break end
        end
        progress:done()

        -- 2) Marca como completados en el servidor.
        if #doneIds > 0 then
            apiCall("POST", "/lr/complete", JSON.encode({ ids = doneIds }))
        end

        LrDialogs.message("RAW AI Studio",
            string.format("Aplicadas: %d\nSin coincidencia: %d\n\nNota: en archivos DNG, Lightroom lee el XMP incrustado; los sidecar .xmp funcionan en RAW nativos (CR3/NEF/ARW).", applied, missing),
            "info")
    end)
end)

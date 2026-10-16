local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrHttp = import "LrHttp"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrPathUtils = import "LrPathUtils"
local LrFunctionContext = import "LrFunctionContext"
local LrProgressScope = import "LrProgressScope"

local prefs = LrPrefs.prefsForPlugin()
local JSON = require "json"
local BATCH = 150

-- Devuelve (cuerpo, codigoHTTP)
local function apiCall(method, path, body)
    local base = (prefs.baseUrl or "https://edit.krimagina.com"):gsub("/+$", "")
    local url = base .. "/api" .. path
    local headers = {
        { field = "Content-Type", value = "application/json" },
        { field = "X-LR-Token", value = prefs.token or "" },
    }
    local resp, hdrs
    if method == "POST" then
        resp, hdrs = LrHttp.post(url, body or "{}", headers, "POST", 120)
    else
        resp, hdrs = LrHttp.get(url, headers, 120)
    end
    local status = hdrs and hdrs.status or nil
    return resp, status
end

-- Pide al servidor los XMP de un lote de nombres; reintenta 2 veces ante fallos transitorios.
local function fetchBatch(names)
    local payload = JSON.encode({ filenames = names })
    local lastStatus
    for attempt = 1, 3 do
        local raw, status = apiCall("POST", "/lr/pending", payload)
        lastStatus = status
        if raw and (status == nil or status == 200) then
            local ok, data = pcall(function() return JSON.decode(raw) end)
            if ok and data and data.jobs then return data.jobs, nil end
        end
        if status == 401 then return nil, "Token inválido (401). Copia de nuevo el token desde la web." end
        LrTasks.sleep(2 * attempt)
    end
    return nil, "Error del servidor" .. (lastStatus and (" " .. tostring(lastStatus)) or " (sin respuesta)") .. ". Inténtalo de nuevo en un minuto."
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

        local progress = LrProgressScope { title = "RAW AI Studio: sincronizando…" }
        local applied, missing, errMsg = 0, 0, nil
        local total = #photos

        for start = 1, total, BATCH do
            if progress:isCanceled() then break end
            local chunk, names = {}, {}
            for i = start, math.min(start + BATCH - 1, total) do
                local photo = photos[i]
                local name = photo:getFormattedMetadata("fileName") or ""
                chunk[#chunk + 1] = { photo = photo, lc = name:lower() }
                names[#names + 1] = name
            end

            local jobs, err = fetchBatch(names)
            if not jobs then errMsg = err; break end

            local byName = {}
            for _, job in ipairs(jobs) do
                byName[(job.filename or ""):lower()] = job
            end

            local doneIds = {}
            for k, item in ipairs(chunk) do
                local job = byName[item.lc]
                if job and job.xmp_content then
                    local rawPath = item.photo:getRawMetadata("path")
                    if rawPath then
                        local dir = LrPathUtils.parent(rawPath)
                        local baseNoExt = LrPathUtils.removeExtension(LrPathUtils.leafName(rawPath))
                        local xmpPath = LrPathUtils.child(dir, baseNoExt .. ".xmp")
                        local fh = io.open(xmpPath, "w")
                        if fh then
                            fh:write(job.xmp_content)
                            fh:close()
                            catalog:withWriteAccessDo("readMeta", function()
                                item.photo:readMetadata()
                            end, { timeout = 30 })
                            applied = applied + 1
                            doneIds[#doneIds + 1] = job.id
                        end
                    end
                else
                    missing = missing + 1
                end
                progress:setPortionComplete(start + k - 1, total)
            end

            if #doneIds > 0 then
                apiCall("POST", "/lr/complete", JSON.encode({ ids = doneIds }))
            end
        end
        progress:done()

        local msg = string.format("Aplicadas: %d\nSin coincidencia: %d", applied, missing)
        if errMsg then
            LrDialogs.message("RAW AI Studio", msg .. "\n\n" .. errMsg, "error")
            return
        end
        LrDialogs.message("RAW AI Studio",
            msg .. "\n\nNota: en archivos DNG, Lightroom lee el XMP incrustado; los sidecar .xmp funcionan en RAW nativos (CR3/NEF/ARW).",
            "info")
    end)
end)

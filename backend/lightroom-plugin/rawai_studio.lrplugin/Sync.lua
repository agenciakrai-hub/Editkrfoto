local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrHttp = import "LrHttp"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrProgressScope = import "LrProgressScope"
local JSON = require "json"
local prefs = LrPrefs.prefsForPlugin()
local BATCH = 100
local MAX_PHOTOS = 5000

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

-- Comprueba que Lightroom conservó los básicos esperados (y 5★/verde) tras aplicar.
local function verify(photo, job)
    local ok, current = LrTasks.pcall(function() return photo:getDevelopSettings() end)
    if not ok or type(current) ~= "table" then return false, "Lightroom no devolvió los ajustes para verificar" end
    local tol = job.tolerance or {}
    for key, want in pairs(job.expected or {}) do
        local got = tonumber(current[key])
        if got == nil then return false, key .. " no quedó aplicado" end
        if math.abs(got - want) > (tonumber(tol[key]) or 0.51) then
            return false, string.format("%s = %s (esperado %s)", key, tostring(got), tostring(want))
        end
    end
    if job.rating == "5" and tonumber(photo:getRawMetadata("rating")) ~= 5 then return false, "Valoración 5★ no aplicada" end
    if job.label and photo:getRawMetadata("colorNameForLabel") ~= "green" then return false, "Etiqueta verde no aplicada" end
    return true
end

-- Sidecar .xmp opcional (interoperable con Camera Raw). Nunca toca el RAW/DNG ni sus píxeles.
local function writeSidecar(rawPath, content)
    if not rawPath or rawPath:lower():match("%.dng$") then return nil end
    local xmpPath = rawPath:gsub("%.[^%.\\/]+$", "") .. ".xmp"
    if xmpPath == rawPath or not xmpPath:lower():match("%.xmp$") then return "ruta de sidecar no válida" end
    local fh = io.open(xmpPath, "w")
    if not fh then return "no se pudo escribir " .. xmpPath end
    fh:write(content); fh:close()
    return nil
end

local function listNames(items, max)
    local out = {}
    for i = 1, math.min(#items, max) do out[#out + 1] = "• " .. items[i] end
    if #items > max then out[#out + 1] = string.format("… y %d más", #items - max) end
    return table.concat(out, "\n")
end

LrTasks.startAsyncTask(function()
    if not prefs.token or prefs.token == "" then LrDialogs.message("EditFlow","Configura primero el token de EditFlow.","warning");return end
    local catalog = LrApplication.activeCatalog()
    local photos = catalog:getTargetPhotos()
    if #photos == 0 then LrDialogs.message("EditFlow","Selecciona las fotos del trabajo en Lightroom.","warning");return end
    if #photos > MAX_PHOTOS then LrDialogs.message("EditFlow",string.format("Selecciona como máximo %d fotos por sincronización.",MAX_PHOTOS),"warning");return end
    local progress = LrProgressScope {title="EditFlow: sincronizando con Lightroom"}
    local applied, missing = 0, 0
    local ambiguous, failed, sidecarIssues, partial = {}, {}, {}, 0
    local ok, err = LrTasks.pcall(function()
        -- 1) Empareja TODA la selección antes de aplicar nada (ruta → nombre único; colisiones).
        local query = {}
        for i, photo in ipairs(photos) do
            query[i] = {key=tostring(i), name=photo:getFormattedMetadata("fileName") or "", path=photo:getRawMetadata("path")}
        end
        local match = apiCall("/lr/match", {photos=query})
        if not match.results then error("El servidor no devolvió el emparejamiento.") end
        local todo = {}
        for _, r in ipairs(match.results) do
            if r.status == "matched" then todo[#todo + 1] = {photo=photos[tonumber(r.key)], id=r.job_id, name=r.name}
            elseif r.status == "ambiguous" then ambiguous[#ambiguous + 1] = (r.name or "?") .. " — " .. (r.reason or "ambigua")
            else missing = missing + 1 end
        end
        -- 2) Aplica por lotes y confirma SOLO lo verificado.
        for start = 1, #todo, BATCH do
            if progress:isCanceled() then break end
            local ids, items = {}, {}
            for i = start, math.min(start + BATCH - 1, #todo) do ids[#ids + 1] = todo[i].id; items[#items + 1] = todo[i] end
            local data = apiCall("/lr/jobs", {ids=ids})
            local byId = {}
            for _, job in ipairs(data.jobs or {}) do byId[job.id] = job end
            local done = {}
            for k, item in ipairs(items) do
                if progress:isCanceled() then break end
                local job = byId[item.id]
                if not job or not job.develop_settings or next(job.develop_settings) == nil then
                    failed[#failed + 1] = item.name .. " — edición sin ajustes válidos"
                else
                    local wrote, werr = LrTasks.pcall(function()
                        local result = catalog:withWriteAccessDo("EditFlow: edición IA", function()
                            item.photo:applyDevelopSettings(job.develop_settings, "EditFlow: edición IA")
                            if job.rating == "5" then item.photo:setRawMetadata("rating", 5) end
                            if job.label then item.photo:setRawMetadata("colorNameForLabel", "green") end
                        end, {timeout=30})
                        if result ~= "executed" then error("catálogo ocupado o bloqueado por otra tarea") end
                    end)
                    if not wrote then
                        failed[#failed + 1] = item.name .. " — Lightroom rechazó la aplicación (" .. tostring(werr) .. ")"
                    else
                        local good, why = verify(item.photo, job)
                        if not good then
                            failed[#failed + 1] = item.name .. " — verificación: " .. why .. " (posible conflicto del catálogo)"
                        else
                            applied = applied + 1; done[#done + 1] = job.id
                            if job.catalog_unsupported and #job.catalog_unsupported > 0 then partial = partial + 1 end
                            if prefs.writeSidecar and job.xmp_content then
                                local serr = writeSidecar(item.photo:getRawMetadata("path"), job.xmp_content)
                                if serr then sidecarIssues[#sidecarIssues + 1] = item.name .. " — " .. serr end
                            end
                        end
                    end
                end
                progress:setPortionComplete(start + k - 1, #todo)
            end
            if #done > 0 then apiCall("/lr/complete", {ids=done}) end
        end
    end)
    progress:done()
    local msg = string.format("Aplicadas y verificadas: %d\nFaltantes (sin edición pendiente): %d\nAmbiguas (no aplicadas): %d\nFallidas (conservadas para reintentar): %d",
        applied, missing, #ambiguous, #failed)
    if #ambiguous > 0 then msg = msg .. "\n\nAmbiguas — vuelve a enviar desde la web con la carpeta original:\n" .. listNames(ambiguous, 8) end
    if #failed > 0 then msg = msg .. "\n\nFallidas:\n" .. listNames(failed, 8) end
    if partial > 0 then msg = msg .. string.format("\n\n%d foto(s) llevan máscaras del preset que el catálogo no recibe por esta vía: activa el sidecar .xmp y usa Metadatos › Leer metadatos de archivos.", partial) end
    if #sidecarIssues > 0 then msg = msg .. "\n\nSidecar .xmp no escrito:\n" .. listNames(sidecarIssues, 5) end
    if not ok then msg = msg .. "\n\n" .. tostring(err) end
    LrDialogs.message("EditFlow", msg, (ok and #failed == 0 and #ambiguous == 0) and "info" or "warning")
end)

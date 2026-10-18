local LrDialogs = import "LrDialogs"
local LrView = import "LrView"
local LrPrefs = import "LrPrefs"
local LrFunctionContext = import "LrFunctionContext"
local LrTasks = import "LrTasks"
local LrHttp = import "LrHttp"
local JSON = require "json"
local prefs = LrPrefs.prefsForPlugin()
local function server()
    local url = prefs.baseUrl or "https://editflow.krfoto.com"
    if url == "https://edit.krfoto.com" or url == "https://edit.krimagina.com" then url = "https://editflow.krfoto.com" end
    return url:gsub("/+$", ""):gsub("/api$", "")
end
LrTasks.startAsyncTask(function()
LrFunctionContext.callWithContext("rawai_settings", function(context)
    local f = LrView.osFactory()
    local props = import("LrBinding").makePropertyTable(context)
    props.baseUrl = server(); props.token = prefs.token or ""
    local result = LrDialogs.presentModalDialog { title = "EditFlow — Conectar Lightroom", contents = f:column {
        bind_to_object = props, spacing = f:control_spacing(),
        f:static_text {title = "Servidor de este trabajo:"},
        f:edit_field {value = LrView.bind("baseUrl"),width_in_chars = 45},
        f:static_text {title = "Token de EditFlow (copiar desde la web):"},
        f:edit_field {value = LrView.bind("token"),width_in_chars = 45},
    }}
    if result ~= "ok" then return end
    local base = (props.baseUrl or ""):gsub("^%s+", ""):gsub("%s+$", ""):gsub("/+$", ""):gsub("/api$", "")
    local token = (props.token or ""):gsub("%s", "")
    if not base:match("^https://") or token == "" then LrDialogs.message("EditFlow", "Introduce servidor HTTPS y token.", "warning"); return end
    local raw, headers = LrHttp.get(base .. "/api/lr/health", {{field="X-LR-Token",value=token}},30)
    local ok, data = pcall(function() return JSON.decode(raw or "") end)
    if not ok or not data or not data.ok then
        LrDialogs.message("EditFlow", "No se pudo vincular. Comprueba que el token sea de " .. base .. ". HTTP " .. tostring(headers and headers.status or "sin respuesta"), "error"); return
    end
    prefs.baseUrl=base; prefs.token=token
    LrDialogs.message("EditFlow", "Conexión comprobada y guardada.", "info")
end)
end)

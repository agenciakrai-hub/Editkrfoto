local LrDialogs = import "LrDialogs"
local LrView = import "LrView"
local LrPrefs = import "LrPrefs"
local LrFunctionContext = import "LrFunctionContext"

local prefs = LrPrefs.prefsForPlugin()

LrFunctionContext.callWithContext("rawai_settings", function(context)
    local f = LrView.osFactory()
    local props = LrView.bind and {} or {}
    local url = prefs.baseUrl or "https://edit.krfoto.com"
    local token = prefs.token or ""

    local shareProps = { baseUrl = url, token = token }
    local bindable = import("LrBinding").makePropertyTable(context)
    bindable.baseUrl = url
    bindable.token = token

    local c = f:column {
        bind_to_object = bindable,
        spacing = f:control_spacing(),
        f:static_text { title = "URL del servidor RAW AI Studio:" },
        f:edit_field { value = LrView.bind("baseUrl"), width_in_chars = 40 },
        f:static_text { title = "Token de emparejamiento (cópialo de la web):" },
        f:edit_field { value = LrView.bind("token"), width_in_chars = 40 },
    }

    local res = LrDialogs.presentModalDialog {
        title = "RAW AI Studio — Configuración",
        contents = c,
    }
    if res == "ok" then
        prefs.baseUrl = bindable.baseUrl
        prefs.token = bindable.token
        LrDialogs.message("RAW AI Studio", "Configuración guardada.", "info")
    end
end)

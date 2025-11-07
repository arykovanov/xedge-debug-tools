<?lsp
-- Device info endpoint for VSCode extension
-- GET /vscode_app/info

response:setstatus(200)
response:setcontenttype("application/json")

trace("Device info request received from VSCode extension")

local info = {
    status = "ok",
    platform = "ESP32",
    appVersion = "1.0.0",
    freeHeap = esp32.freeheap and esp32.freeheap() or "unknown",
    chipModel = esp32.chipmodel and esp32.chipmodel() or "unknown",
    timestamp = os.time()
}

response:write(ba.json.encode(info))

?>


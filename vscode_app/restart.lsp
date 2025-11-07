<?lsp
-- Restart endpoint for VSCode extension
-- POST /vscode_app/restart

response:setstatus(200)
response:setcontenttype("application/json")

trace("Restart request received from VSCode extension")

-- Send response first
response:write('{"status":"restarting","message":"ESP32 will restart in 1 second"}')

-- Schedule restart after response is sent
ba.timer(function()
    trace("Restarting ESP32...")
    esp32.execute("restart")
end):set(1000)

?>

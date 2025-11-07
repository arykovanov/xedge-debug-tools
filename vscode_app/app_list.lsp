<?lsp

response:setstatus(200)
response:setcontenttype("application/json")

trace("Restart request received from VSCode extension")

-- Send response first
response:write('{"status":"restarting","message":"ESP32 will restart in 1 second"}')

?>
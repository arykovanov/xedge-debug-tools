# vscode_app Helper Application

## Overview

The `vscode_app` is a helper LSP application that provides REST API endpoints for the VSCode extension to interact with the ESP32 device.

## Structure

Following LSP application best practices (as shown in [LSP-Examples](https://github.com/RealTimeLogic/LSP-Examples/tree/master/ESP32)):

```
vscode_app/
├── .preload       # Initialization script
├── restart.lsp    # POST /vscode_app/restart
└── info.lsp       # GET /vscode_app/info
```

## Endpoints

### POST /vscode_app/restart

Restarts the ESP32 device.

**Request**: `POST http://{esp32_ip}/vscode_app/restart`

**Response**:
```json
{
  "status": "restarting",
  "message": "ESP32 will restart in 1 second"
}
```

**Used by**: `XEdge: Restart ESP32 Device` command

### GET /vscode_app/info

Returns device information.

**Request**: `GET http://{esp32_ip}/vscode_app/info`

**Response**:
```json
{
  "status": "ok",
  "platform": "ESP32",
  "appVersion": "1.0.0",
  "freeHeap": 123456,
  "chipModel": "ESP32-S3",
  "timestamp": 1730745600
}
```

## Application Configuration

When loaded to ESP32, the app uses this configuration:

```json
{
  "name": "vscode_app",
  "url": "http://{localIp}/fs/{extension_path}/vscode_app",
  "running": true,
  "autostart": false,
  "dirname": "vscode_app",
  "priority": "0"
}
```

**Key field**: `dirname: "vscode_app"` makes the app accessible at `/vscode_app`

## Automatic Loading

The VSCode extension automatically loads this helper app when:
1. Extension activates
2. Mako WebDAV server starts successfully
3. ESP32 IP is configured in `xedge-apps.json`

## Manual Loading

If automatic loading fails:

```bash
# In VSCode:
Ctrl+Shift+P > XEdge: Load Application to ESP32 > vscode_app
```

## Testing

Test that the app is accessible:

```bash
npm run test:api
```

Or manually:

```bash
# Check app exists
curl http://192.168.0.101/rtl/apps/?cmd=lj

# Check app status
curl http://192.168.0.101/rtl/apps/vscode_app/.appcfg

# Test info endpoint
curl http://192.168.0.101/vscode_app/info

# Test restart (device will restart!)
curl -X POST http://192.168.0.101/vscode_app/restart
```

## Development

### Adding New Endpoints

1. Create new `.lsp` file in `vscode_app/` directory
2. Implement endpoint logic using LSP syntax
3. File name becomes the URL path
4. No need to register in `.preload` - XEdge auto-discovers .lsp files

Example:
```lua
-- vscode_app/status.lsp
<?lsp
response:setstatus(200)
response:setcontenttype("application/json")
response:write('{"status":"ok"}')
?>
```

Accessible at: `GET http://{esp32_ip}/vscode_app/status`

### LSP File Format

LSP files use special `<?lsp ... ?>` tags:

```lua
<?lsp
-- Lua code here
response:setstatus(200)
response:setcontenttype("application/json")

local data = { message = "Hello from ESP32" }
response:write(ba.json.encode(data))
?>
```

## Debugging

### Check if app is loaded

```bash
curl http://192.168.0.101/rtl/apps/?cmd=lj | jq
```

Should include `vscode_app` in the list.

### Check app configuration

```bash
curl http://192.168.0.101/rtl/apps/vscode_app/.appcfg | jq
```

Verify:
- `"running": true`
- `"dirname": "vscode_app"`

### Check extension logs

```
Ctrl+Shift+P > XEdge: Show Extension Logs
```

Look for:
```
Loading vscode_app helper application to ESP32...
✓ vscode_app helper application loaded successfully
```

### Test endpoints

```bash
# Info endpoint
curl http://192.168.0.101/vscode_app/info | jq

# Expected: Device information JSON
```

## Common Issues

### 404 Not Found on /vscode_app/restart

**Cause**: `dirname` not set correctly

**Solution**: Reload the app with extension (it will set dirname)

### App exists but endpoints return 404

**Cause**: LSP files not being served

**Solution**: 
1. Check files exist in vscode_app/
2. Reload app to ESP32
3. Verify Mako server is serving files correctly

### "running": false in status

**Cause**: App loaded but not started

**Solution**: Extension now loads with `"running": true` - reload the app

## Links

- [LSP-Examples on GitHub](https://github.com/RealTimeLogic/LSP-Examples/tree/master/ESP32) - Example LSP applications
- Extension documentation: See README.md

## Summary

The `vscode_app` helper provides essential REST endpoints for the VSCode extension to manage the ESP32 device. It's automatically loaded and accessible at `/vscode_app` with separate `.lsp` files for each endpoint.


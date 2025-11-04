# Extension Logging System

## Overview

The XEdge extension now has comprehensive logging throughout all operations. You can see exactly what the extension is doing, what requests it sends, and all responses.

## Output Channels

The extension creates **two separate output channels**:

### 1. "XEdge Extension" 
**Main extension logs** - all operations, commands, REST API calls

View with:
- Command Palette: **XEdge: Show Extension Logs**
- Or: View > Output > Select "XEdge Extension"

### 2. "Mako WebDAV Server"
**Mako server logs** - server startup, requests, errors

View with:
- Command Palette: **XEdge: Show Mako Server Logs**
- Or: View > Output > Select "Mako WebDAV Server"

## What Gets Logged

### Extension Activation
```
[2025-11-02T...] INFO: ═══════════════════════════════════════════════════════
[2025-11-02T...] INFO: XEdge Development Tools Extension Activating
[2025-11-02T...] INFO: Extension path: /home/user/.vscode/extensions/...
[2025-11-02T...] INFO: Workspace folders: /home/user/projects/myapp
[2025-11-02T...] INFO: Initializing managers...
```

### Configuration Loading
```
[2025-11-02T...] INFO: Loading configuration...
[2025-11-02T...] DEBUG: Looking for config file: /home/user/project/xedge-apps.json
[2025-11-02T...] DEBUG: Config file content: {...}
[2025-11-02T...] INFO: Configuration parsed successfully
[2025-11-02T...] INFO: ✓ Configuration loaded successfully with 2 apps
```

### REST API Calls

Every HTTP request and response is logged:

```
[2025-11-02T...] INFO: Loading application "my_app"...
[2025-11-02T...] DEBUG: Converted relative path "./lsp_app" to absolute: "/home/user/project/lsp_app"
[2025-11-02T...] DEBUG: Built WebDAV URL: http://192.168.0.100/fs/home/user/project/lsp_app
[2025-11-02T...] DEBUG: Load payload:
{
  "name": "my_app",
  "url": "http://192.168.0.100/fs/home/user/project/lsp_app",
  "running": false,
  "autostart": false
}
[2025-11-02T...] INFO: → HTTP PUT http://192.168.0.102/rtl/apps/net/.appcfg
[2025-11-02T...] DEBUG: Request body:
{
  "name": "my_app",
  "url": "http://192.168.0.100/fs/home/user/project/lsp_app",
  "running": false,
  "autostart": false
}
[2025-11-02T...] INFO: ← HTTP PUT http://192.168.0.102/rtl/apps/net/.appcfg - Status: 200
[2025-11-02T...] DEBUG: Response body: {...}
[2025-11-02T...] INFO: ✓ Application "my_app" loaded successfully
```

### Application Status Checks
```
[2025-11-02T...] INFO: → HTTP GET http://192.168.0.102/rtl/apps/my_app/.appcfg
[2025-11-02T...] INFO: ← HTTP GET http://192.168.0.102/rtl/apps/my_app/.appcfg - Status: 200
[2025-11-02T...] DEBUG: Response body:
{
  "name": "my_app",
  "url": "...",
  "running": true,
  "autostart": false
}
[2025-11-02T...] INFO: App "my_app" status:
{
  "running": true,
  "autostart": false
}
```

### File Changes
```
[2025-11-02T...] DEBUG: 📁 File changed: /home/user/project/lsp_app/main.lua - in app "my_app"
[2025-11-02T...] DEBUG: Debounce timer set for "my_app" (500ms)
[2025-11-02T...] INFO: Debounce delay expired for "my_app", triggering reload
[2025-11-02T...] INFO: 📝 File change detected in app "my_app", triggering reload...
[2025-11-02T...] INFO: Reloading application "my_app"...
```

### WiFi Connection
```
[2025-11-02T...] INFO: ⚡ Command: connectWiFi - User initiated WiFi connection
[2025-11-02T...] INFO: Attempting WiFi connection to SSID: "MyWiFi"
[2025-11-02T...] INFO: ✓ WiFi connection successful! ESP32 IP: 192.168.0.102
[2025-11-02T...] INFO: Saved ESP32 IP to configuration: 192.168.0.102
```

### Mako Server
```
[2025-11-02T...] Extension path: /home/user/.vscode/extensions/xedge-dev-tools-0.1.0
[2025-11-02T...] Server config path: /home/.../xedge-dev-tools-0.1.0/server.conf
[2025-11-02T...] Mako path: /home/.../xedge-dev-tools-0.1.0/mako
[2025-11-02T...] Found bundled mako executable: ...
[2025-11-02T...] Starting Mako server with config: .../server.conf
[2025-11-02T...] ✓ Mako server started successfully
```

## Log Levels

### INFO
General operations and successful completions
```
[2025-11-02T...] INFO: ✓ Application "my_app" loaded successfully
```

### DEBUG
Detailed information about operations (enabled by default)
```
[2025-11-02T...] DEBUG: Built WebDAV URL: http://192.168.0.100/fs/...
```

### WARN
Warnings that don't prevent operation
```
[2025-11-02T...] WARN: ESP32 IP or Local IP not configured yet
```

### ERROR
Errors with full stack traces
```
[2025-11-02T...] ERROR: Failed to load app "my_app":
Error: connect ECONNREFUSED 192.168.0.102:80
    at TCPConnectWrap.afterConnect...
```

## Special Log Formats

### HTTP Requests
```
[timestamp] INFO: → HTTP <METHOD> <URL>
[timestamp] DEBUG: Request body: {...}
```

### HTTP Responses
```
[timestamp] INFO: ← HTTP <METHOD> <URL> - Status: <CODE>
[timestamp] DEBUG: Response body: {...}
```

### Commands
```
[timestamp] INFO: ⚡ Command: <commandName> - <details>
```

### File Operations
```
[timestamp] DEBUG: 📁 File <operation>: <path> - <details>
```

## Quick Access

### From Command Palette
1. Press `Ctrl+Shift+P`
2. Type "XEdge: Show"
3. Choose:
   - **Show Extension Logs** - Main extension operations
   - **Show Mako Server Logs** - WebDAV server logs

### From Menu
1. View > Output
2. Select dropdown: "XEdge Extension" or "Mako WebDAV Server"

## Debugging Tips

### Troubleshooting Load Failures

Check logs for:
1. **WebDAV URL** - Is it correct?
   ```
   DEBUG: Built WebDAV URL: http://192.168.0.100/fs/...
   ```

2. **Request sent** - Was it sent?
   ```
   INFO: → HTTP PUT http://192.168.0.102/rtl/apps/net/.appcfg
   ```

3. **Response received** - What was the status?
   ```
   INFO: ← HTTP PUT ... - Status: 200
   ```

4. **Error details** - Full stack trace available

### Troubleshooting File Watching

Check logs for:
1. **Watchers started**
   ```
   INFO: ✓ File watcher started: 6 watchers for 2 apps
   ```

2. **File changes detected**
   ```
   DEBUG: 📁 File changed: /path/to/file.lua - in app "my_app"
   ```

3. **Debounce timers**
   ```
   DEBUG: Debounce timer set for "my_app" (500ms)
   ```

### Troubleshooting Mako Server

Switch to "Mako WebDAV Server" output:
1. Server startup logs
2. HTTP requests from ESP32
3. File serving operations
4. Server errors

## Example Debug Session

### Problem: App won't load

**Step 1**: Check Extension Logs
```
View > Output > "XEdge Extension"
```

Look for:
- ✅ Configuration loaded?
- ✅ Mako server started?
- ✅ ESP32 IP configured?
- ✅ Request sent?
- ❌ Error message?

**Step 2**: Check Mako Server Logs
```
View > Output > "Mako WebDAV Server"
```

Look for:
- ✅ Server started?
- ✅ ESP32 requesting files?
- ❌ File not found errors?
- ❌ Permission errors?

**Step 3**: Check Application Status
```
Command Palette > XEdge: Check Application Status
```

Verify:
- App listed on ESP32?
- Running status?

## Log File Location

Logs are only in Output channels (in-memory). To save logs:

1. Open output channel
2. Select All (`Ctrl+A`)
3. Copy (`Ctrl+C`)
4. Paste into file

Or use the "Save Output" button in the output panel.

## Performance

Logging is optimized:
- DEBUG messages only shown when debug mode enabled
- Large objects formatted nicely
- Timestamps on all messages
- No performance impact on normal operations

## Disable Debug Logging

To reduce verbosity, set in extension code:

```typescript
logger.setDebugMode(false);
```

This will only show INFO, WARN, and ERROR messages.

## Summary

✅ **Comprehensive logging** throughout the extension  
✅ **HTTP request/response logging** with full payloads  
✅ **File change monitoring** with timestamps  
✅ **Command execution tracking** with details  
✅ **Error logging** with stack traces  
✅ **Separate channels** for extension vs Mako server  
✅ **Easy access** via Command Palette  

You now have **full visibility** into everything the extension does!


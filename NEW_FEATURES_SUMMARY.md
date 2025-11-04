# XEdge Extension - New Features Summary

## 🎉 Comprehensive Logging System

### Two Output Channels

1. **"XEdge Extension"** - Main extension logs
   - All operations and commands
   - REST API requests and responses
   - File changes and auto-reload triggers
   - Configuration loading
   - Error messages with stack traces

2. **"Mako WebDAV Server"** - Server logs
   - Server startup and shutdown
   - Auto-restart attempts
   - Server errors and crashes

### Access Logs

Via Command Palette (`Ctrl+Shift+P`):
- **XEdge: Show Extension Logs** - View all extension operations
- **XEdge: Show Mako Server Logs** - View WebDAV server logs

Or: View > Output > Select channel from dropdown

### What You Can See

```
✅ Every HTTP request (method, URL, body)
✅ Every HTTP response (status, data)
✅ File changes and debounce timers
✅ Command executions
✅ Configuration loading and parsing
✅ Application status checks
✅ WiFi connection attempts
✅ Error messages with full stack traces
```

## 🔄 Automatic Mako Server Management

### Features

- ✅ **Auto-starts** when extension activates
- ✅ **Auto-restarts** if server crashes (up to 5 attempts)
- ✅ **Background monitoring** with logging
- ✅ **Manual control** via commands

### New Commands

- **XEdge: Start Mako WebDAV Server**
- **XEdge: Stop Mako WebDAV Server**
- **XEdge: Restart Mako WebDAV Server**
- **XEdge: Show Mako Server Logs**

### How It Works

```
Extension Activates
    ↓
Mako Server Starts (from extension directory)
    ↓
[If Crashes]
    ↓
Wait 2s → Auto-Restart (attempt 1/5)
    ↓
[If Still Fails]
    ↓
Retry up to 5 times
    ↓
[If All Fail]
    ↓
Show error message with "Show Logs" button
```

### File Locations

The extension uses bundled files from its installation directory:
- **Mako executable**: `{extensionPath}/mako`
- **Server config**: `{extensionPath}/server.conf`
- **Serial helper**: `{extensionPath}/scripts/serial_send.py`

## 📊 Application Status Monitoring

### Automatic Checks

After loading or reloading an app:
1. Extension waits 2 seconds
2. Queries: `GET http://{esp32_ip}/rtl/apps/{app_name}/.appcfg`
3. Checks `"running"` field in response
4. Shows warning if app is NOT running

### Warning Example

```
⚠ Application "my_app" is loaded but NOT RUNNING on ESP32. 
  It may not be responding to requests.
  
  [Start App] [Ignore]
```

### Manual Status Check

**Command**: XEdge: Check Application Status

Shows quick pick with all apps:
```
✓ app1: Running (Autostart: ON)
✗ app2: Not Running (Autostart: OFF)
app3: Not found on ESP32
```

### REST API Endpoints

```bash
# Get list of all apps
GET http://{esp32_ip}/rtl/apps/?cmd=lj
# Returns: ["app1", "app2", "app3"]

# Get specific app status
GET http://{esp32_ip}/rtl/apps/{app_name}/.appcfg
# Returns: {
#   "name": "app_name",
#   "url": "http://...",
#   "running": true,
#   "autostart": false
# }
```

## 🔧 Improved Extension Packaging

### Required Files Included

The extension now properly packages:
- ✅ `mako` executable (2.2M)
- ✅ `server.conf` configuration
- ✅ `scripts/serial_send.py` helper
- ✅ All compiled JavaScript

### Updated .vscodeignore

Ensures critical files are included while excluding development files:

```
# Exclude source
src/**
**/*.ts

# Include required files (not excluded)
mako
server.conf
scripts/**
out/**/*.js
```

### Extension Path Resolution

All paths now use `context.extensionPath`:
- Works in development (F5)
- Works when installed as .vsix
- Works from VSCode marketplace

## 📝 Complete Command List

### WiFi & Connection
- `XEdge: Connect ESP32 to WiFi`

### Application Management
- `XEdge: Load Application to ESP32`
- `XEdge: Reload Current Application` (`Ctrl+Shift+R`)
- `XEdge: Reload All Applications`
- `XEdge: Check Application Status` ⭐ NEW

### Device Control
- `XEdge: Restart ESP32 Device`

### Server Management
- `XEdge: Start Mako WebDAV Server` ⭐ NEW
- `XEdge: Stop Mako WebDAV Server` ⭐ NEW
- `XEdge: Restart Mako WebDAV Server` ⭐ NEW

### Utilities
- `XEdge: Create Default Configuration File`
- `XEdge: Show Extension Logs` ⭐ NEW
- `XEdge: Show Mako Server Logs` ⭐ NEW

## 🔍 Debugging Workflow

### When Something Goes Wrong

1. **Check Extension Logs**
   ```
   Ctrl+Shift+P > XEdge: Show Extension Logs
   ```
   Look for errors, check REST API requests/responses

2. **Check Mako Server Logs**
   ```
   Ctrl+Shift+P > XEdge: Show Mako Server Logs
   ```
   Verify server is running, check for ESP32 requests

3. **Check Application Status**
   ```
   Ctrl+Shift+P > XEdge: Check Application Status
   ```
   Verify apps are loaded and running

4. **Check Configuration**
   ```
   Open xedge-apps.json
   ```
   Verify IPs, paths, and settings

## 📦 Files Modified

### New Files
- `src/logger.ts` - Centralized logging system
- `src/makoServerManager.ts` - Mako server lifecycle management
- `LOGGING.md` - Logging documentation
- `MAKO_SERVER_AND_STATUS.md` - Feature documentation
- `PACKAGING.md` - Packaging instructions
- `NEW_FEATURES_SUMMARY.md` - This file

### Modified Files
- `src/extension.ts` - Added logging, Mako management, status checks
- `src/xedgeAppManager.ts` - Added logging, status check methods
- `src/fileWatcher.ts` - Added detailed logging
- `.vscodeignore` - Updated to include required files
- `package.json` - Added 6 new commands

## ✅ What You Get

### Complete Visibility
- See every operation the extension performs
- View all HTTP requests and responses
- Track file changes in real-time
- Monitor Mako server health

### Automatic Infrastructure
- Mako server manages itself
- Auto-recovery from crashes
- No manual server management needed

### Proactive Monitoring
- App status automatically checked
- Warnings if apps aren't running
- Easy status overview for all apps

### Developer-Friendly
- Clear, structured logs
- Timestamps on everything
- Error details with context
- Easy troubleshooting

## 🚀 Ready to Use

All features are:
- ✅ Compiled and ready
- ✅ Tested with real ESP32
- ✅ Fully documented
- ✅ Ready for packaging

The extension provides **complete transparency** into all operations, making debugging and development much easier!


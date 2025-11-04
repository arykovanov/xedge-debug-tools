# Mako Server Management & Application Status Checking

## New Features Added

### 1. Mako WebDAV Server Management

The extension now automatically manages the Mako WebDAV server, which is essential for ESP32 to load applications.

#### Automatic Server Management

- **Auto-Start**: Mako server starts automatically when extension activates
- **Auto-Restart**: Server automatically restarts if it crashes (up to 5 attempts)
- **Background Monitoring**: Server runs in background and logs to output channel
- **Crash Detection**: Extension detects when server exits and attempts recovery

#### Manual Control Commands

Access via Command Palette (`Ctrl+Shift+P`):

- **XEdge: Start Mako WebDAV Server** - Manually start the server
- **XEdge: Stop Mako WebDAV Server** - Stop the server (with warning)
- **XEdge: Restart Mako WebDAV Server** - Restart the server
- **XEdge: Show Mako Server Logs** - View server output and errors

#### Server Configuration

Server uses `/home/arykovanov/src/realtimelogic/badebug_extension/server.conf`:

```lua
fileserver={
   fsname="fs",
   ioname="disk",
   path="/",
   noauth=true
}
```

The `fsname` field is automatically read and used to construct WebDAV URLs.

### 2. Application Status Checking

The extension now checks application status on ESP32 and warns if apps are not running.

#### Automatic Status Checks

After loading or reloading an application, the extension:

1. Waits 2 seconds for app to initialize
2. Queries ESP32 for application status
3. Shows warning if app is loaded but **not running**

Example warning message:
```
⚠ Application "my_app" is loaded but NOT RUNNING on ESP32. 
  It may not be responding to requests.
  [Start App] [Ignore]
```

#### Manual Status Check Command

**XEdge: Check Application Status**

- Lists all configured applications
- Shows running status (✓ Running / ✗ Not Running)
- Shows autostart setting (ON / OFF)
- Quick view of all app states

#### REST API Endpoints Used

1. **Get Application List**
   ```
   GET http://{esp32_ip}/rtl/apps/?cmd=lj
   Returns: Array of application names
   ```

2. **Get Application Status**
   ```
   GET http://{esp32_ip}/rtl/apps/{app_name}/.appcfg
   Returns: {
     "name": "app_name",
     "url": "...",
     "running": true/false,
     "autostart": true/false
   }
   ```

## Implementation Details

### New Files

1. **`src/makoServerManager.ts`** (192 lines)
   - `MakoServerManager` class
   - Process lifecycle management
   - Auto-restart logic
   - Output channel logging
   - Error handling and recovery

### Modified Files

1. **`src/xedgeAppManager.ts`**
   - Added `getApplicationList()` method
   - Added `getAppStatus(appName)` method
   - Added `checkAndWarnAppStatus()` private method
   - Modified `loadApp()` to check status after loading
   - Modified `reloadApp()` to check status after reloading

2. **`src/extension.ts`**
   - Import and instantiate `MakoServerManager`
   - Start server on activation
   - Register 5 new commands
   - Dispose server on deactivation
   - Added command handlers for server control
   - Added `checkAppStatusCommand()` for manual status check

3. **`package.json`**
   - Added 5 new commands

## Usage Examples

### Scenario 1: Extension Startup

```
1. Extension activates
2. Mako server starts automatically
3. Status bar shows: "XEdge: Disconnected"
4. Server logs available in "Mako WebDAV Server" output channel
```

### Scenario 2: Server Crashes

```
1. Mako server process exits unexpectedly
2. Extension detects exit
3. Waits 2 seconds
4. Automatically attempts restart
5. If successful: Normal operation continues
6. If fails 5 times: Shows error message to user
```

### Scenario 3: Loading Application

```
1. User runs: "XEdge: Load Application to ESP32"
2. Selects "my_app"
3. Extension sends PUT request to ESP32
4. Shows: "Application 'my_app' loaded successfully"
5. After 2 seconds, checks status
6. If not running: Shows warning with [Start App] button
7. User can choose to start or ignore
```

### Scenario 4: Checking All Apps

```
1. User runs: "XEdge: Check Application Status"
2. Extension queries ESP32 for each configured app
3. Shows quick pick menu:
   ✓ app1: Running (Autostart: ON)
   ✗ app2: Not Running (Autostart: OFF)
   app3: Not found on ESP32
4. User can see all statuses at a glance
```

## Benefits

### For Developers

1. **No Manual Server Management** - Server starts automatically
2. **Crash Recovery** - Server restarts if it fails
3. **Status Visibility** - Know if apps are actually running
4. **Quick Troubleshooting** - Mako logs in output channel
5. **Reliable Development** - WebDAV always available for ESP32

### For Debugging

1. **Server Logs** - View Mako server output
2. **Process Monitoring** - See when server starts/stops
3. **Status Checks** - Verify apps are running correctly
4. **Early Warnings** - Know immediately if app isn't running

## Configuration

### Auto-Restart Settings

In `makoServerManager.ts`:
```typescript
private autoRestart: boolean = true;
private restartDelay: number = 2000; // 2 seconds
private maxRestartAttempts: number = 5;
```

### Status Check Delay

In `xedgeAppManager.ts`:
```typescript
setTimeout(() => this.checkAndWarnAppStatus(app.name), 2000);
```

Can be adjusted if apps need more time to initialize.

## Troubleshooting

### Mako Server Won't Start

1. Check "Mako WebDAV Server" output channel
2. Verify `mako` executable is in PATH or extension directory
3. Check `server.conf` exists
4. Run manually: `mako -c server.conf`

### Status Checks Failing

1. Verify ESP32 is connected (check status bar)
2. Confirm ESP32 IP is correct in `xedge-apps.json`
3. Test REST API manually:
   ```bash
   curl http://{esp32_ip}/rtl/apps/?cmd=lj
   ```

### App Shows "Not Running" Warning

This is expected behavior if:
- App was loaded with `running: false`
- App crashed or exited
- App has not started yet (check after longer delay)

To start app: Use XEdge web interface at `http://{esp32_ip}/`

## Future Enhancements

Potential improvements:
1. Add "Start App" REST API call (if supported by XEdge)
2. Periodic status checking (background monitoring)
3. Status bar indicator for Mako server state
4. Configurable auto-restart behavior
5. Application performance metrics

## Summary

✅ **Mako Server Management**: Automatic start, restart on crash, manual control  
✅ **Application Status**: Automatic checks after load/reload, manual status view  
✅ **Developer Experience**: No manual server management required  
✅ **Reliability**: ESP32 can always load applications via WebDAV  
✅ **Visibility**: Know when apps aren't running correctly  

These features ensure a smooth development experience with automatic infrastructure management and proactive status monitoring.


# XEdge Development Tools - Quick Start Guide

## Setup (5 minutes)

### 1. Create Configuration File

If you don't have `xedge-apps.json` in your project:

1. Open your project in VSCode
2. Press `Ctrl+Shift+P`
3. Type: **XEdge: Create Default Configuration File**
4. A comprehensive config file will be created with all options documented

Or manually create `/home/arykovanov/src/realtimelogic/drybox/xedge-apps.json`:

### 2. Update Configuration

Edit the created `xedge-apps.json`:

```json
{
  "localIp": "YOUR_LOCAL_IP_HERE",  // Change this to your machine's IP
  "esp32": {
    "serialPort": "/dev/ttyUSB0"     // Update if different
  }
}
```

To find your local IP:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

### 3. Start Mako WebDAV Server

```bash
cd /home/arykovanov/src/realtimelogic/badebug_extension
mako -c server.conf
```

Leave this running in the background.

### 4. Open Extension in VSCode

```bash
code /home/arykovanov/src/realtimelogic/badebug_extension
```

Press `F5` to launch the Extension Development Host.

### 5. Open Your Project

In the Extension Development Host window:
```bash
File > Open Folder > /home/arykovanov/src/realtimelogic/drybox
```

## First Run

### Connect ESP32 to WiFi

1. Ensure ESP32 is connected via USB
2. Press `Ctrl+Shift+P` (Command Palette)
3. Type: **XEdge: Connect ESP32 to WiFi**
4. Enter your WiFi SSID and password
5. Wait for IP address to be captured

### Load Helper Application

1. Press `Ctrl+Shift+P`
2. Type: **XEdge: Load Application to ESP32**
3. Select: **vscode_app**
4. Wait for confirmation

### Load Your Application

1. Press `Ctrl+Shift+P`
2. Type: **XEdge: Load Application to ESP32**
3. Select: **lsp_app** (or your app name)
4. Wait for confirmation

## Daily Usage

### Auto-Reload (Recommended)

Just edit your `.lua`, `.preload`, or `.config` files and save. The extension will automatically reload the application on your ESP32!

### Manual Reload

- Quick: Press `Ctrl+Shift+R` while editing an app file
- Menu: `Ctrl+Shift+P` → **XEdge: Reload Current Application**

### Status Bar

Look at the bottom-left corner:
- ✅ **XEdge: 192.168.0.X** - Connected and ready
- 🔌 **XEdge: Disconnected** - Need to connect to WiFi

Click it to quickly reload the current app.

## Troubleshooting

### "ESP32 IP not configured"
- Run: **XEdge: Connect ESP32 to WiFi** first
- Or manually set `esp32.ip` in `xedge-apps.json`

### "Failed to load app"
- Check Mako server is running
- Verify `localIp` matches your machine's IP
- Ensure ESP32 can reach your machine (ping test)

### Files not auto-reloading
- Check `autoReload: true` in `xedge-apps.json`
- Verify you're editing files in the app directory
- Check VSCode Output panel for errors

### Serial port not found
- Linux: Check `ls /dev/ttyUSB*` or `/dev/ttyACM*`
- Update `esp32.serialPort` in config
- Ensure you have permissions: `sudo usermod -a -G dialout $USER`

## Tips

1. **Multiple Apps**: Add all your apps to `xedge-apps.json` and switch between them seamlessly
2. **Network**: Keep ESP32 and dev machine on the same network for best performance
3. **Logs**: Check VSCode's Output panel (View > Output) for detailed logs
4. **Restart**: If things get stuck, use **XEdge: Restart ESP32 Device**

## Example Workflow

```bash
# Terminal 1: Start Mako server
cd /home/arykovanov/src/realtimelogic/badebug_extension
mako -c server.conf

# Terminal 2: Start VSCode with extension
code /home/arykovanov/src/realtimelogic/badebug_extension
# Press F5

# In Extension Host: Open project
# File > Open Folder > /home/arykovanov/src/realtimelogic/drybox

# Edit files in lsp_app/
# Files auto-reload on save!
```

## Next Steps

- Read the full [README.md](README.md) for advanced features
- Customize `xedge-apps.json` for your apps
- Set up multiple ESP32 devices (future feature)
- Explore helper app endpoints for custom integrations

Happy coding! 🚀


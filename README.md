# XEdge Development Tools for VSCode

A Visual Studio Code extension for developing and deploying XEdge applications to ESP32 devices. This extension provides hot-reloading, automatic file watching, and seamless integration with ESP-IDF tools.

## Features

- 🔄 **Hot Reload**: Automatically reload applications when files change
- 📡 **WiFi Setup**: Connect ESP32 to WiFi via serial connection
- 🎯 **Smart Detection**: Automatically detects which app to reload based on current file
- 📊 **Status Bar**: Real-time connection status and ESP32 IP display
- ⌨️ **Keyboard Shortcuts**: Quick reload with `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- 🔌 **ESP-IDF Integration**: Works with ESP-IDF extension or standalone configuration

## Prerequisites

- Visual Studio Code 1.80.0 or higher
- Node.js and npm
- Python with `pyserial` package (`pip install pyserial`)
- Mako server for WebDAV functionality
- ESP32 device with XEdge firmware

## Installation

### Development Installation

1. Clone or copy this extension to your local machine
2. Navigate to the extension directory:
   ```bash
   cd /path/to/badebug_extension
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Compile the extension:
   ```bash
   npm run compile
   ```

5. Open the extension directory in VSCode and press `F5` to run it in a new Extension Development Host window

### Package Installation

```bash
npm run vscode:prepublish
vsce package
code --install-extension xedge-dev-tools-0.1.0.vsix
```

## Configuration

### 1. Start Mako WebDAV Server

The extension requires a local Mako server to serve files to the ESP32 device via WebDAV.

```bash
cd /path/to/badebug_extension
mako -c server.conf
```

The `server.conf` should contain:
```lua
fileserver={
   fsname="fs",
   ioname="disk",
   path="/",
   noauth=true
}
```

### 2. Create Configuration File

You can create the configuration file in two ways:

#### Option A: Use the Command (Recommended)

1. Open your project folder in VSCode
2. Press `Ctrl+Shift+P` (Command Palette)
3. Type: **XEdge: Create Default Configuration File**
4. A comprehensive `xedge-apps.json` will be created with all options documented

#### Option B: Create Manually

Create `xedge-apps.json` in your project root:

```json
{
  "apps": [
    {
      "name": "drybox",
      "path": "/home/arykovanov/src/realtimelogic/drybox/lsp_app",
      "autoReload": true
    },
    {
      "name": "test_app",
      "path": "./lsp_app1",
      "autoReload": false
    }
  ],
  "localIp": "192.168.0.100",
  "esp32": {
    "ip": "",
    "serialPort": "/dev/ttyUSB0"
  },
  "espIdf": {
    "useExtension": true,
    "pythonPath": "",
    "idfPath": ""
  }
}
```

#### Configuration Options

- **apps**: Array of XEdge applications
  - `name`: Application name (used in XEdge)
  - `path`: Absolute or relative path to LSP application directory
  - `autoReload`: Enable/disable automatic reload on file changes

- **localIp**: IP address of the machine running VSCode and Mako server

- **esp32**:
  - `ip`: ESP32 IP address (auto-populated when connecting to WiFi)
  - `serialPort`: Serial port for ESP32 (e.g., `/dev/ttyUSB0` on Linux, `COM3` on Windows)

- **espIdf**:
  - `useExtension`: Try to get settings from ESP-IDF VSCode extension
  - `pythonPath`: Path to Python executable (optional, uses system Python if empty)
  - `idfPath`: Path to ESP-IDF directory (optional)

### 3. Deploy Helper Application

The `xedge_app` helper application provides REST API endpoints for device management.

Load it to your ESP32 using the extension:
1. Add it to `xedge-apps.json`:
   ```json
   {
     "name": "xedge_app",
     "path": "/home/arykovanov/src/realtimelogic/badebug_extension/xedge_app",
     "autoReload": false
   }
   ```

2. Use the command: **XEdge: Load Application to ESP32**

## Usage

### Create Configuration File

If you don't have `xedge-apps.json` yet:

1. Press `Ctrl+Shift+P` (Command Palette)
2. Run: **XEdge: Create Default Configuration File**
3. Edit the created file with your actual IP addresses and app paths

### Connect ESP32 to WiFi

1. Connect ESP32 to your computer via USB
2. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
3. Run: **XEdge: Connect ESP32 to WiFi**
4. Enter WiFi SSID and password
5. The ESP32 IP will be automatically captured and saved to config

### Reload Applications

#### Automatic Reload (Recommended)

When `autoReload: true` is set for an app, it will automatically reload when you save changes to:
- `*.lua` files
- `.preload` files
- `.config` files

#### Manual Reload

- **Quick Reload**: Press `Ctrl+Shift+R` (or `Cmd+Shift+R`) while editing an app file
- **Command Palette**: 
  - **XEdge: Reload Current Application** - Reload app for current file
  - **XEdge: Reload All Applications** - Reload all configured apps
  - **XEdge: Load Application to ESP32** - Load a specific app

### Restart ESP32

To perform a full device restart:
1. Open Command Palette
2. Run: **XEdge: Restart ESP32 Device**
3. Confirm the restart

## File Watching

The extension watches for changes in application directories:

- **Patterns**: `**/*.lua`, `**/.preload`, `**/.config`
- **Debouncing**: 500ms delay to batch multiple file changes
- **Smart Detection**: Automatically determines which app to reload

## Status Bar

The status bar shows the current connection state:

- 🔌 **Disconnected**: ESP32 not connected
- 🔄 **Connecting**: WiFi connection in progress
- ✅ **Connected**: Shows ESP32 IP address
- ❌ **Error**: Connection error

Click the status bar item to quickly reload the current application.

## Architecture

### REST API Flow

1. **WebDAV Server** (Mako): Serves LSP application files from local machine
2. **VSCode Extension**: Sends reload commands to ESP32
3. **ESP32 (XEdge)**: Fetches updated files from WebDAV server

### Load/Reload Process

```
VSCode Extension
    ↓ PUT http://{esp32_ip}/rtl/apps/net/.appcfg
    ↓ Payload: {"name":"app", "url":"http://{local_ip}/fs/path/to/app", "running":false, "autostart":false}
ESP32 Device
    ↓ GET http://{local_ip}/fs/path/to/app
Mako WebDAV Server
    ↓ Serves files
ESP32 Device
    ↓ Loads application
```

### Helper App Endpoints

The `xedge_app` provides these endpoints:

- `POST /rtl/xedge_app/restart` - Restart ESP32 device
- `GET /rtl/xedge_app/info` - Get device information
- `GET /rtl/xedge_app/logs` - Get device logs (future feature)

## Troubleshooting

### Extension not activating
- Check that `xedge-apps.json` exists in workspace root
- Verify the file is valid JSON

### WiFi connection fails
- Ensure ESP32 is connected via USB
- Check serial port in configuration (`/dev/ttyUSB0`, `COM3`, etc.)
- Verify `pyserial` is installed: `pip install pyserial`
- Check ESP-IDF extension settings if `useExtension: true`

### Reload fails
- Verify Mako server is running: `mako -c server.conf`
- Check that `localIp` in config matches your machine's IP
- Ensure ESP32 can reach your machine on the network
- Verify the application path is correct (absolute path recommended)

### File watching not working
- Check that `autoReload: true` in app configuration
- Verify extension setting: `xedge.autoReload` is enabled
- Ensure file patterns match: `.lua`, `.preload`, `.config`

### ESP32 IP not captured
- Check serial output for IP address format
- Manually set `esp32.ip` in `xedge-apps.json`
- Try reconnecting to WiFi

## Development

### Project Structure

```
badebug_extension/
├── src/
│   ├── extension.ts       # Main extension entry point
│   ├── types.ts           # TypeScript interfaces
│   ├── xedgeAppManager.ts # REST API client
│   ├── serialManager.ts   # Serial/WiFi communication
│   └── fileWatcher.ts     # File change monitoring
├── xedge_app/
│   └── .preload           # Helper LSP application
├── server.conf            # Mako server configuration
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

### Building

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Package extension
vsce package
```

### Testing

1. Open the extension directory in VSCode
2. Press `F5` to launch Extension Development Host
3. Open a project with `xedge-apps.json`
4. Test commands and functionality

## Contributing

Contributions are welcome! Areas for improvement:

- Enhanced error handling and logging
- Support for multiple ESP32 devices
- Log streaming from ESP32
- Application debugging support
- Configuration UI

## License

[Add your license here]

## Support

For issues and questions:
- Check the troubleshooting section above
- Review ESP-IDF and XEdge documentation
- Check serial monitor output for errors

## Version History

### 0.1.0 (Initial Release)
- WiFi connection via serial
- Application loading and reloading
- File watching with auto-reload
- Status bar integration
- ESP-IDF integration
- Helper application with REST endpoints


# Extension Packaging Instructions

## Required Files in Package

The following files MUST be included in the extension package for it to work:

1. **`mako`** - Mako WebDAV server executable
2. **`server.conf`** - Mako server configuration
3. **`scripts/serial_send.py`** - Python serial communication helper

## Packaging Steps

### 1. Ensure Files Are Present

```bash
cd /home/arykovanov/src/realtimelogic/badebug_extension

# Check required files exist
ls -l mako
ls -l server.conf
ls -l scripts/serial_send.py
```

### 2. Make Mako Executable

```bash
chmod +x mako
```

### 3. Compile TypeScript

```bash
export PATH=~/bin/bin:$PATH
npm run compile
```

### 4. Package Extension

```bash
# Install vsce if not already installed
npm install -g @vscode/vsce

# Package the extension
vsce package
```

This creates: `xedge-dev-tools-0.1.0.vsix`

### 5. Verify Package Contents

```bash
# Extract and check contents
unzip -l xedge-dev-tools-0.1.0.vsix | grep -E "(mako|server.conf|serial_send.py)"
```

Should show:
```
extension/mako
extension/server.conf
extension/scripts/serial_send.py
```

### 6. Install Extension

```bash
code --install-extension xedge-dev-tools-0.1.0.vsix
```

## File Locations After Installation

When installed, files are located at:
```
~/.vscode/extensions/xedge-dev-tools-0.1.0/
├── mako                    # Bundled executable
├── server.conf             # Server configuration
├── scripts/
│   └── serial_send.py      # Serial helper
└── out/
    ├── extension.js        # Compiled extension
    ├── makoServerManager.js
    └── ...
```

## How Extension Finds Files

### Mako Executable

Priority order:
1. **Extension directory**: `{extensionPath}/mako` (bundled)
2. **PATH**: `mako` command
3. **System locations**: `/usr/local/bin/mako`, `/usr/bin/mako`

### Server Configuration

Always uses: `{extensionPath}/server.conf`

### Serial Helper Script

Uses: `{extensionPath}/scripts/serial_send.py`

## Troubleshooting

### "Mako executable not found"

**Solution 1**: Install mako system-wide
```bash
# Copy mako to system location
sudo cp mako /usr/local/bin/
sudo chmod +x /usr/local/bin/mako
```

**Solution 2**: Check extension package includes mako
```bash
unzip -l xedge-dev-tools-*.vsix | grep mako
```

If missing, check `.vscodeignore` has:
```
!mako
!mako.zip
```

### "Permission denied" when starting mako

```bash
# Make executable in extension directory
chmod +x ~/.vscode/extensions/xedge-dev-tools-*/mako
```

### "server.conf not found"

Check file is in extension package:
```bash
unzip -l xedge-dev-tools-*.vsix | grep server.conf
```

If missing, ensure `.vscodeignore` includes it (not excluded).

## Development vs Production

### Development Mode (F5)

Files are read from source directory:
```
/home/arykovanov/src/realtimelogic/badebug_extension/
├── mako
├── server.conf
└── scripts/serial_send.py
```

### Production (Installed Extension)

Files are read from extension install directory:
```
~/.vscode/extensions/xedge-dev-tools-0.1.0/
├── mako
├── server.conf
└── scripts/serial_send.py
```

## .vscodeignore Configuration

The `.vscodeignore` file controls what's included in the package:

```
# Exclude development files
node_modules
src/**
*.ts
tsconfig.json

# But INCLUDE these critical files:
!mako
!mako.zip
# server.conf included by default (not excluded)
# scripts/ included by default (not excluded)
```

## Verification Checklist

Before releasing:

- [ ] `mako` file exists and is executable
- [ ] `server.conf` exists with correct configuration
- [ ] `scripts/serial_send.py` exists
- [ ] TypeScript compiled to `out/` directory
- [ ] Package created: `vsce package`
- [ ] Verified mako in package: `unzip -l *.vsix | grep mako`
- [ ] Tested installation: `code --install-extension *.vsix`
- [ ] Tested extension activation
- [ ] Checked "Mako WebDAV Server" output channel for logs
- [ ] Verified server starts successfully

## Publishing

When ready to publish to VSCode Marketplace:

```bash
vsce publish
```

Or publish specific version:
```bash
vsce publish minor  # 0.1.0 -> 0.2.0
vsce publish patch  # 0.1.0 -> 0.1.1
vsce publish major  # 0.1.0 -> 1.0.0
```

## Platform-Specific Notes

### Linux
- Mako executable must have execute permissions
- Python 3 with pyserial must be installed
- User must be in `dialout` group for serial access

### macOS
- Similar to Linux
- May need to allow unsigned executable in Security settings

### Windows
- Mako executable should be `.exe` file
- Serial port names are `COM1`, `COM2`, etc.
- Python path may need to be configured

## Size Optimization

Current package size is primarily:
- `mako` executable: ~5-10 MB
- Node modules: ~5 MB
- Compiled JS: ~100 KB

To reduce size:
- Use `mako.zip` and extract on first run
- Implement lazy loading
- Remove unused dependencies


# vscode_app REST API Test

## Overview

This test verifies that the `vscode_app` helper application is properly loaded on ESP32 and accessible via REST API.

## Quick Start

### Run the Test

```bash
cd /home/arykovanov/src/realtimelogic/badebug_extension
export PATH=~/bin/bin:$PATH
ESP32_IP=192.168.0.101 npm run test:api
```

Or if you have `xedge-apps.json` with ESP32 IP configured:

```bash
npm run test:api
```

## What It Tests

The test suite performs 4 checks:

1. **App List** - GET `/rtl/apps/?cmd=lj`
   - Verifies `vscode_app` exists in application list

2. **App Status** - GET `/rtl/apps/vscode_app/.appcfg`
   - Checks if app is running
   - Verifies `dirname` is set to "vscode_app"

3. **Info Endpoint** - GET `/vscode_app/info`
   - Tests helper app info endpoint
   - Should return device information

4. **Logs Endpoint** - GET `/vscode_app/logs`
   - Tests logs endpoint (placeholder)

## Expected Output (Success)

```
[2025-11-04T...] ════════════════════════════════════════════════════════════
[2025-11-04T...] VSCode App REST API Test Suite
[2025-11-04T...] ════════════════════════════════════════════════════════════
[2025-11-04T...] ESP32 IP: 192.168.0.101

[2025-11-04T...] [Test 1] Testing GET /rtl/apps/?cmd=lj (app list)...
[2025-11-04T...] ✓ vscode_app found in application list

[2025-11-04T...] [Test 2] Testing GET /rtl/apps/vscode_app/.appcfg (status)...
[2025-11-04T...] ✓ vscode_app is RUNNING
[2025-11-04T...] ✓ dirname is set correctly: "vscode_app"

[2025-11-04T...] [Test 3] Testing GET /vscode_app/info...
[2025-11-04T...] ✓ Info endpoint works correctly

[2025-11-04T...] [Test 4] Testing GET /vscode_app/logs...
[2025-11-04T...] ✓ Logs endpoint works correctly

[2025-11-04T...] ════════════════════════════════════════════════════════════
[2025-11-04T...] Test Results
[2025-11-04T...] ════════════════════════════════════════════════════════════
[2025-11-04T...] Total: 4 tests
[2025-11-04T...] Passed: 4
[2025-11-04T...] Failed: 0
[2025-11-04T...] ✅ ALL TESTS PASSED
```

Exit code: 0

## Expected Output (Failure)

```
[2025-11-04T...] ✗ vscode_app NOT found in application list
[2025-11-04T...] ✗ Failed: Request failed with status code 404

[2025-11-04T...] ❌ SOME TESTS FAILED

Troubleshooting:
1. Ensure ESP32 is on and connected to network
2. Verify ESP32 IP is correct in xedge-apps.json
3. Load vscode_app to ESP32: Ctrl+Shift+P > XEdge: Load Application
4. Check extension logs for errors
```

Exit code: 1

## Configuration

### Option 1: Environment Variable

```bash
export ESP32_IP=192.168.0.101
npm run test:api
```

### Option 2: Use xedge-apps.json

The test will read ESP32 IP from `xedge-apps.json` if present:

```json
{
  "esp32": {
    "ip": "192.168.0.101"
  }
}
```

### Option 3: Create api-test-config.json

```json
{
  "esp32Ip": "192.168.0.101"
}
```

## How to Load vscode_app

### Method 1: Automatic (Recommended)

1. Open VSCode extension
2. Configure ESP32 IP in `xedge-apps.json`
3. Extension will automatically load `vscode_app` when Mako server starts

### Method 2: Manual

1. Press `Ctrl+Shift+P`
2. Run: **XEdge: Load Application to ESP32**
3. Select: **vscode_app**
4. Wait for "loaded successfully" message

## Troubleshooting

### Test shows "vscode_app NOT found"

**Cause**: Application not loaded to ESP32

**Solution**:
```bash
# In VSCode with extension running:
Ctrl+Shift+P > XEdge: Load Application to ESP32 > vscode_app

# Or check logs:
Ctrl+Shift+P > XEdge: Show Extension Logs
```

### Test shows "404 Not Found"

**Cause**: Application loaded but not accessible

**Possible issues**:
1. `dirname` field not set in app config
2. Application not running
3. Wrong URL format

**Check**:
```bash
# Verify app config on ESP32:
curl http://192.168.0.101/rtl/apps/vscode_app/.appcfg

# Should include:
# "dirname": "vscode_app"
# "running": true
```

### Test shows "Connection refused"

**Cause**: ESP32 not reachable

**Solution**:
1. Check ESP32 is powered on
2. Ping ESP32: `ping 192.168.0.101`
3. Verify IP address is correct
4. Check ESP32 and dev machine on same network

## What the Test Verifies

✅ **Connectivity** - Can reach ESP32  
✅ **App Loaded** - vscode_app in app list  
✅ **App Running** - Status shows running  
✅ **dirname Set** - Accessible at /vscode_app  
✅ **Endpoints Work** - /info and /logs respond  

## CI/CD Integration

```yaml
# .github/workflows/test.yml
- name: Test vscode_app API
  env:
    ESP32_IP: ${{ secrets.ESP32_IP }}
  run: npm run test:api
```

## Files

- `src/test/apiTest.ts` - Test implementation
- `vscode_app/.preload` - Helper app initialization
- `vscode_app/restart.lsp` - Restart endpoint
- `vscode_app/info.lsp` - Info endpoint
- `vscode_app/logs.lsp` - Logs endpoint

## Next Steps

After tests pass:
1. Use `XEdge: Restart ESP32 Device` command
2. Call `/vscode_app/info` to get device information
3. Develop your own LSP applications with same pattern

---

For more details, see [EXTENSION_READY.md](EXTENSION_READY.md)


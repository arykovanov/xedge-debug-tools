/**
 * REST API Test for vscode_app helper application
 * 
 * Tests that vscode_app is properly loaded and accessible on ESP32
 * 
 * Usage:
 *   npm run test:api
 */

import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m'
};

function log(message: string, color: string = colors.reset): void {
    const timestamp = new Date().toISOString();
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function header(title: string): void {
    const line = '═'.repeat(60);
    log(line, colors.cyan);
    log(title, colors.bright + colors.cyan);
    log(line, colors.cyan);
}

interface TestConfig {
    esp32Ip: string;
}

/**
 * Load test configuration
 */
function loadConfig(): TestConfig | null {
    const configPaths = [
        path.join(process.cwd(), 'api-test-config.json'),
        path.join(process.cwd(), 'xedge-apps.json')
    ];

    for (const configPath of configPaths) {
        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(content);

                if (config.esp32 && config.esp32.ip) {
                    log(`Found config at ${configPath}`, colors.blue);
                    return { esp32Ip: config.esp32.ip };
                }
            }
        } catch (error) {
            log(`Failed to load ${configPath}: ${error}`, colors.yellow);
        }
    }

    // Default from environment or hardcoded
    const envIp = process.env.ESP32_IP || '192.168.0.101';
    log(`Using ESP32 IP from environment/default: ${envIp}`, colors.yellow);
    return { esp32Ip: envIp };
}

/**
 * Test vscode_app info endpoint
 */
async function testInfoEndpoint(esp32Ip: string): Promise<boolean> {
    log('\n[Test 1] Testing GET /vscode_app/info...', colors.blue);
    
    try {
        const url = `http://${esp32Ip}/vscode_app/info`;
        log(`  URL: ${url}`, colors.blue);
        
        const response = await axios.get(url, { timeout: 5000 });
        
        log(`  Status: ${response.status}`, colors.green);
        log(`  Response:`, colors.green);
        log(JSON.stringify(response.data, null, 2), colors.green);
        
        if (response.status === 200 && response.data.status === 'ok') {
            log('✓ Info endpoint works correctly', colors.green);
            return true;
        } else {
            log('✗ Unexpected response', colors.red);
            return false;
        }
    } catch (error: any) {
        log(`✗ Failed: ${error.message}`, colors.red);
        if (error.code === 'ECONNREFUSED') {
            log('  Connection refused - check ESP32 IP and network', colors.yellow);
        } else if (error.code === 'ETIMEDOUT') {
            log('  Timeout - ESP32 may not be reachable', colors.yellow);
        } else if (error.response) {
            log(`  HTTP ${error.response.status}: ${error.response.statusText}`, colors.yellow);
        }
        return false;
    }
}

/**
 * Test that vscode_app exists in app list
 */
async function testAppList(esp32Ip: string): Promise<boolean> {
    log('\n[Test 3] Testing GET /rtl/apps/?cmd=lj (app list)...', colors.blue);
    
    try {
        const url = `http://${esp32Ip}/rtl/apps/?cmd=lj`;
        log(`  URL: ${url}`, colors.blue);
        
        const response = await axios.get(url, { timeout: 5000 });
        
        log(`  Status: ${response.status}`, colors.green);
        log(`  Apps found: ${JSON.stringify(response.data)}`, colors.green);
        
        // Response is array of objects like [{n: "app_name", s: -1, t: 1234}, ...]
        const appNames = Array.isArray(response.data) 
            ? response.data.map((app: any) => app.n || app.name || app).filter((n: any) => typeof n === 'string')
            : [];
        
        log(`  App names: ${appNames.join(', ')}`, colors.blue);
        
        if (appNames.includes('vscode_app')) {
            log('✓ vscode_app found in application list', colors.green);
            return true;
        } else {
            log('✗ vscode_app NOT found in application list', colors.red);
            log('  Make sure vscode_app is loaded to ESP32', colors.yellow);
            return false;
        }
    } catch (error: any) {
        log(`✗ Failed: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Test vscode_app status
 */
async function testAppStatus(esp32Ip: string): Promise<boolean> {
    log('\n[Test 4] Testing GET /rtl/apps/vscode_app/.appcfg (status)...', colors.blue);
    
    try {
        const url = `http://${esp32Ip}/rtl/apps/vscode_app/.appcfg`;
        log(`  URL: ${url}`, colors.blue);
        
        const response = await axios.get(url, { timeout: 5000 });
        
        log(`  Status: ${response.status}`, colors.green);
        log(`  App config:`, colors.green);
        log(JSON.stringify(response.data, null, 2), colors.green);
        
        if (response.data.running) {
            log('✓ vscode_app is RUNNING', colors.green);
        } else {
            log('✗ vscode_app is NOT RUNNING', colors.red);
        }
        
        if (response.data.dirname === 'vscode_app') {
            log(`✓ dirname is set correctly: "${response.data.dirname}"`, colors.green);
        } else {
            log(`✗ dirname is incorrect: "${response.data.dirname}"`, colors.red);
        }
        
        return response.status === 200;
    } catch (error: any) {
        log(`✗ Failed: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * Run all tests
 */
async function runTests(): Promise<boolean> {
    header('VSCode App REST API Test Suite');
    
    const config = loadConfig();
    if (!config) {
        log('❌ No configuration found!', colors.red);
        return false;
    }
    
    log(`ESP32 IP: ${config.esp32Ip}`, colors.green);
    log('', colors.reset);
    
    const results: boolean[] = [];
    
    // Run tests
    results.push(await testAppList(config.esp32Ip));
    results.push(await testAppStatus(config.esp32Ip));
    results.push(await testInfoEndpoint(config.esp32Ip));
    
    // Summary
    header('Test Results');
    const passed = results.filter(r => r).length;
    const failed = results.length - passed;
    
    log(`Total: ${results.length} tests`, colors.blue);
    log(`Passed: ${passed}`, colors.green);
    log(`Failed: ${failed}`, failed > 0 ? colors.red : colors.green);
    
    if (failed === 0) {
        header('✅ ALL TESTS PASSED');
        return true;
    } else {
        header('❌ SOME TESTS FAILED');
        log('\nTroubleshooting:', colors.yellow);
        log('1. Ensure ESP32 is on and connected to network', colors.yellow);
        log('2. Verify ESP32 IP is correct in xedge-apps.json', colors.yellow);
        log('3. Load vscode_app to ESP32: Ctrl+Shift+P > XEdge: Load Application', colors.yellow);
        log('4. Check extension logs for errors', colors.yellow);
        return false;
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    try {
        const success = await runTests();
        process.exit(success ? 0 : 1);
    } catch (error) {
        log(`\n❌ Unexpected error: ${error}`, colors.red);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { runTests, testInfoEndpoint, testAppList, testAppStatus };


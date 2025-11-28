/**
 * Integration Test for vscode_app Helper Application
 * 
 * This test performs a complete end-to-end workflow:
 * 1. Start Mako WebDAV server
 * 2. Load vscode_app to ESP32
 * 3. Run REST API tests
 * 4. Delete vscode_app from ESP32
 * 
 * Usage:
 *   npm run test:integration
 */

import * as path from 'path';
import * as fs from 'fs';
import { MakoServerManager } from '../makoServerManager';
import { XEdgeAppManager } from '../xedgeAppManager';
import { XEdgeApp, XEdgeConfig } from '../types';
import { testInfoEndpoint, testAppList, testAppStatus } from './apiTest';

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

/**
 * Load configuration
 */
function loadConfig(): XEdgeConfig | null {
    const configPaths = [
        path.join(process.cwd(), 'xedge-apps.json'),
        path.join(__dirname, '../../xedge-apps.json'),
        '/home/arykovanov/src/realtimelogic/drybox/xedge-apps.json'
    ];

    // Also check environment variable
    if (process.env.XEDGE_CONFIG_PATH) {
        configPaths.unshift(process.env.XEDGE_CONFIG_PATH);
    }

    for (const configPath of configPaths) {
        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(content);
                
                if (config.esp32 && config.esp32.ip && config.localIp) {
                    log(`Found config at ${configPath}`, colors.blue);
                    return config;
                }
            }
        } catch (error) {
            log(`Failed to load ${configPath}: ${error}`, colors.yellow);
        }
    }

    log('No valid configuration found!', colors.red);
    log('Create xedge-apps.json with esp32.ip and localIp', colors.yellow);
    log('Or set XEDGE_CONFIG_PATH environment variable', colors.yellow);
    return null;
}

/**
 * Mock VSCode window for non-interactive use
 */
const mockVSCode = {
    window: {
        showInformationMessage: (message: string) => {
            log(`[VSCode] ${message}`, colors.green);
        },
        showWarningMessage: (message: string) => {
            log(`[VSCode Warning] ${message}`, colors.yellow);
        },
        showErrorMessage: (message: string) => {
            log(`[VSCode Error] ${message}`, colors.red);
        }
    }
};

/**
 * Wait helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run integration test
 */
async function runIntegrationTest(): Promise<boolean> {
    header('vscode_app Integration Test Suite');
    
    // Step 1: Load configuration
    log('\n[Step 1] Loading configuration...', colors.blue);
    const config = loadConfig();
    
    if (!config) {
        log('❌ Configuration not found', colors.red);
        return false;
    }
    
    log(`✓ Configuration loaded`, colors.green);
    log(`  Local IP: ${config.localIp}`, colors.blue);
    log(`  ESP32 IP: ${config.esp32.ip}`, colors.blue);
    
    // Step 2: Start Mako server
    log('\n[Step 2] Starting Mako WebDAV server...', colors.blue);
    // __dirname is out/test, go up two levels to get extension root
    const extensionPath = path.join(__dirname, '../..');
    log(`  Extension path: ${extensionPath}`, colors.blue);
    
    const makoServer = new MakoServerManager(extensionPath);
    const makoStarted = await makoServer.start();
    
    if (!makoStarted) {
        log('❌ Failed to start Mako server', colors.red);
        return false;
    }
    
    log('✓ Mako server started', colors.green);
    await sleep(2000); // Wait for server to be ready
    
    // Step 3: Initialize app manager
    log('\n[Step 3] Initializing Xedge App Manager...', colors.blue);
    const appManager = new XEdgeAppManager(config);
    log('✓ App manager initialized', colors.green);
    
    // Step 4: Load vscode_app
    log('\n[Step 4] Loading vscode_app to ESP32...', colors.blue);
    const vscodeFolderPath = path.join(extensionPath, 'vscode_app');
    log(`  vscode_app path: ${vscodeFolderPath}`, colors.blue);
    
    try {
        await appManager.startAppOfFile(vscodeFolderPath);
        log('✓ vscode_app loaded to ESP32', colors.green);
        
        // Wait for app to initialize
        await sleep(3000);
        
    } catch (error) {
        log(`❌ Failed to load vscode_app: ${error}`, colors.red);
        makoServer.stop();
        return false;
    }
    
    // Step 5: Run API tests
    log('\n[Step 5] Running REST API tests...', colors.blue);
    
    let allTestsPassed = true;
    
    try {
        // Test 1: App list
        const appListOk = await testAppList(config.esp32.ip);
        if (!appListOk) allTestsPassed = false;
        
        // Test 2: App status
        const statusOk = await testAppStatus(config.esp32.ip);
        if (!statusOk) allTestsPassed = false;
        
        // Test 3: Info endpoint
        const infoOk = await testInfoEndpoint(config.esp32.ip);
        if (!infoOk) allTestsPassed = false;
        
    } catch (error) {
        log(`❌ Tests failed with error: ${error}`, colors.red);
        allTestsPassed = false;
    }
    
    // Step 6: Cleanup - Delete vscode_app
    log('\n[Step 6] Cleaning up - deleting vscode_app from ESP32...', colors.blue);
    
    try {
        await appManager.deleteAppForPath(vscodeFolderPath);
        log('✓ vscode_app deleted from ESP32', colors.green);
    } catch (error) {
        log(`⚠ Failed to delete vscode_app: ${error}`, colors.yellow);
        // Not critical - continue
    }
    
    // Step 7: Stop Mako server
    log('\n[Step 7] Stopping Mako server...', colors.blue);
    makoServer.stop();
    await sleep(1000);
    log('✓ Mako server stopped', colors.green);
    
    // Final result
    header('Integration Test Results');
    
    if (allTestsPassed) {
        log('✅ ALL TESTS PASSED', colors.bright + colors.green);
        log('\nThe vscode_app helper application works correctly!', colors.green);
        return true;
    } else {
        log('❌ SOME TESTS FAILED', colors.bright + colors.red);
        log('\nCheck the output above for details', colors.yellow);
        return false;
    }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    try {
        const success = await runIntegrationTest();
        process.exit(success ? 0 : 1);
    } catch (error) {
        log(`\n❌ Unexpected error: ${error}`, colors.red);
        if (error instanceof Error && error.stack) {
            log(error.stack, colors.red);
        }
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

export { runIntegrationTest };


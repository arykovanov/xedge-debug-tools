import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XEdgeConfig, XEdgeApp, ConnectionStatus } from './types';
import { XEdgeAppManager } from './xedgeAppManager';
import { FileWatcher } from './fileWatcher';
import { MakoServerManager } from './makoServerManager';
import { logger } from './logger';

let appManager: XEdgeAppManager;
let fileWatcher: FileWatcher;
let statusBarItem: vscode.StatusBarItem;
let config: XEdgeConfig | null = null;
let makoServer: MakoServerManager;
let helperAppWhatcher: NodeJS.Timeout | null = null;

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('Xedge Development Tools Extension Activating');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info(`Extension path: ${context.extensionPath}`);
    logger.info(`Workspace folders: ${vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath).join(', ') || 'none'}`);

    // Initialize managers
    logger.info('Initializing managers...');
    appManager = new XEdgeAppManager();
    fileWatcher = new FileWatcher(handleFileChange);
    makoServer = new MakoServerManager(context.extensionPath, vscode as any);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'xedge.restartApp';
    context.subscriptions.push(statusBarItem);
    updateStatusBar(ConnectionStatus.Disconnected);

    // Start Mako WebDAV server
    makoServer.start().then(started => {
        if (!started) {
            vscode.window.showWarningMessage(
                'Mako WebDAV server failed to start. Applications cannot be loaded to ESP32.',
                'Retry',
                'Show Logs'
            ).then(selection => {
                if (selection === 'Retry') {
                    makoServer.start();
                } else if (selection === 'Show Logs') {
                    makoServer.showOutput();
                }
            });
        }
    });

    // Load configuration
    loadConfiguration();

    helperAppWhatcher = setInterval(loadHelperApp, 3000);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('xedge.startApp', startAppCommand),
        vscode.commands.registerCommand('xedge.stopApp', stopAppCommand),
        vscode.commands.registerCommand('xedge.restartApp', restartAppCommand),
        vscode.commands.registerCommand('xedge.reloadAllApps', reloadAllAppsCommand),
        vscode.commands.registerCommand('xedge.restartESP32', restartESP32Command),
        vscode.commands.registerCommand('xedge.createConfig', createConfigCommand),
        vscode.commands.registerCommand('xedge.startMakoServer', startMakoServerCommand),
        vscode.commands.registerCommand('xedge.stopMakoServer', stopMakoServerCommand),
        vscode.commands.registerCommand('xedge.restartMakoServer', restartMakoServerCommand),
        vscode.commands.registerCommand('xedge.showMakoLogs', showMakoLogsCommand),
        vscode.commands.registerCommand('xedge.checkAppStatus', checkAppStatusCommand),
        vscode.commands.registerCommand('xedge.showExtensionLogs', showExtensionLogsCommand)
    );

    // Watch for config file changes
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const configWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, '**/xedge-apps.json')
        );
        configWatcher.onDidChange(loadConfiguration);
        configWatcher.onDidCreate(loadConfiguration);
        context.subscriptions.push(configWatcher);
    }

    logger.info('✓ Xedge Development Tools extension activated successfully');
    logger.info('═══════════════════════════════════════════════════════');
    vscode.window.showInformationMessage('Xedge Development Tools activated!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (makoServer) {
        makoServer.dispose();
    }
    logger.dispose();

    helperAppWhatcher?.close();
}

/**
 * Load vscode_app helper application to ESP32
 */

let loadHelperAppBusy: boolean = false;
async function loadHelperApp(): Promise<void> {
    try {
        if (loadHelperAppBusy) {
            return;
        }

        loadHelperAppBusy = true;
        logger.info('Loading vscode_app helper application to ESP32...');
        
        // Check if ESP32 IP is configured
        if (!config || !config.esp32.ip) {
            logger.warn('ESP32 IP not configured, cannot load vscode_app helper. Set esp32.ip in xedge-apps.json');
            loadHelperAppBusy = false;
            return;
        }
    
        const status = await appManager.getAppConfig('vscode_app')
        if (status && status.running) {
            logger.info('vscode_app helper application already exists on ESP32');
            loadHelperAppBusy = false;
            return;
        }

        // Create app config for vscode_app
        const helperApp: XEdgeApp = {
            name: 'vscode_app',
            path: path.join(path.dirname(__dirname), 'vscode_app'),
            autoReload: true
        };
        
        logger.info(`Helper app path: ${helperApp.path}`);
        

        // Load the helper app
        await appManager.startApp(helperApp);
       
        logger.info('✓ vscode_app helper application loaded successfully');
    } catch (error) {
        logger.error('Failed to load vscode_app helper application:', error);
        // Don't show error to user - helper app is optional
        logger.warn('Extension will work but ESP32 restart command may not be available');
    }
    
    loadHelperAppBusy = false;
}

/**
 * Find config file in workspace folder or upwards from currently opened file
 */
function findConfigFile(workspaceFolders: readonly vscode.WorkspaceFolder[]): string | null {
    // Search for 'xedge-apps.json' upwards from currently opened file, or fall back to workspace root
    let configPath: string | null = null;
    const activeEditor = vscode.window.activeTextEditor;
    let activeWorkspaceFolder: string | undefined;
    // Open config file the workspace folder containing current editor
    if (!activeEditor) {
        return null;
    }

    const activePath = activeEditor.document.uri.fsPath
    for (const [, workspaceFolder] of workspaceFolders.entries()) {
        if (activePath.startsWith(workspaceFolder.uri.fsPath)) {
            activeWorkspaceFolder = workspaceFolder.uri.fsPath;
            break;
        }
    }

    if (activeWorkspaceFolder) {
        configPath = path.join(activeWorkspaceFolder, 'xedge-apps.json');
    }
    
    return configPath;
}

/**
 * Load configuration from xedge-apps.json
 */

function loadConfiguration(): void {
    logger.info('Loading configuration...');
    
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            logger.warn('No workspace folder found');
            return;
        }

        const configFilePath = findConfigFile(workspaceFolders);

        if (!configFilePath) {
            logger.warn('No config file found');
            return;
        }

        logger.debug(`Looking for config file: ${configFilePath}`);

        if (!fs.existsSync(configFilePath)) {
            logger.warn('Config file not found:', configFilePath);
            vscode.window.showWarningMessage(
                'xedge-apps.json not found. Would you like to create one?',
                'Create'
            ).then(selection => {
                if (selection === 'Create') {
                    createDefaultConfig();
                }
            });
            return;
        }

        const configContent = fs.readFileSync(configFilePath, 'utf8');
        logger.debug('Config file content:', configContent);
        
        config = JSON.parse(configContent);
        logger.info('Configuration parsed successfully');

        if (config) {
            logger.debug('Configuration details:', config);
            
            // Initialize app manager
            if (config.esp32.ip && config.localIp) {
                logger.info(`Initializing app manager with ESP32 IP: ${config.esp32.ip}, Local IP: ${config.localIp}`);
                appManager.initialize(config.esp32.ip, config.localIp);
                updateStatusBar(ConnectionStatus.Connected, config.esp32.ip);
            } else {
                logger.warn('ESP32 IP or Local IP not configured yet');
            }

            // Start file watching
            const autoReloadEnabled = vscode.workspace.getConfiguration('xedge').get<boolean>('autoReload');
            if (autoReloadEnabled) {
                logger.info(`Starting file watcher for ${config.apps.length} applications`);
                fileWatcher.watch(config.apps);
            } else {
                logger.info('Auto-reload disabled in settings');
            }

            logger.info(`✓ Configuration loaded successfully with ${config.apps.length} apps`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Failed to load configuration:', error);
        vscode.window.showErrorMessage(`Failed to load configuration: ${message}`);
    }
}

/**
 * Create default configuration file with comprehensive documentation
 */
function createDefaultConfig(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    const defaultConfig = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$comment": "Xedge Development Tools Configuration File",
        
        "apps": [
            {
                "name": "example_app",
                "path": "./lsp_app",
                "autoReload": true,
                "$comment": "Application configuration: name - app identifier, path - absolute or relative path to LSP app directory, autoReload - enable file watching"
            }
        ],
        
        "localIp": "192.168.0.100",
        "$localIp_comment": "IP address of this machine running VSCode and Mako WebDAV server. Find with: ip addr show | grep 'inet ' | grep -v 127.0.0.1",
        
        "esp32": {
            "ip": "",
            "$ip_comment": "ESP32 device IP address. Set this to your ESP32's IP address on the network. Example: 192.168.0.102"
        }
    };

    const configPath = path.join(workspaceFolder.uri.fsPath, 'xedge-apps.json');
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    vscode.window.showInformationMessage('Created xedge-apps.json. Please update it with your settings.');
    
    // Open the file
    vscode.workspace.openTextDocument(configPath).then(doc => {
        vscode.window.showTextDocument(doc);
    });
}

/**
 * Create comprehensive default configuration file with all options documented
 */
function createComprehensiveConfig(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
        return;
    }

    const configPath = path.join(workspaceFolder.uri.fsPath, 'xedge-apps.json');
    
    // Check if file already exists
    if (fs.existsSync(configPath)) {
        vscode.window.showWarningMessage(
            'xedge-apps.json already exists. Overwrite it?',
            'Overwrite',
            'Cancel'
        ).then(selection => {
            if (selection === 'Overwrite') {
                writeComprehensiveConfig(configPath);
            }
        });
    } else {
        writeComprehensiveConfig(configPath);
    }
}

/**
 * Write comprehensive configuration to file
 */
function writeComprehensiveConfig(configPath: string): void {
    const comprehensiveConfig = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$comment": "Xedge Development Tools Configuration File - Complete Reference",
        
        "apps": [
            {
                "name": "example_app",
                "path": "./lsp_app",
                "autoReload": true,
                "$comment": "First example application"
            },
            {
                "name": "another_app",
                "path": "/home/user/projects/xedge/my_app",
                "autoReload": false,
                "$comment": "Second example with absolute path and auto-reload disabled"
            }
        ],
        "$apps_comment": "Array of Xedge applications to manage. Each app needs: name (identifier), path (absolute or relative), autoReload (true/false for file watching)",
        
        "localIp": "192.168.0.100",
        "$localIp_comment": "REQUIRED: IP address of the machine running VSCode and Mako WebDAV server. ESP32 will fetch app files from this IP. Find your IP with: ip addr show | grep 'inet ' | grep -v 127.0.0.1 (Linux) or ipconfig (Windows)",
        
        "esp32": {
            "ip": "",
            "$ip_comment": "ESP32 device IP address. Set this to your ESP32's IP address on the network. Example: 192.168.0.102"
        },
        
        "$usage_notes": {
            "watched_files": "Auto-reload monitors: **/*.lua, **/.preload, **/.config files",
            "debounce_delay": "500ms delay to batch multiple file changes",
            "webdav_url_format": "http://<localIp>/<fsname>/<app_absolute_path>",
            "fsname_source": "Read from server.conf in extension directory",
            "commands": [
                "Xedge: Connect ESP32 to WiFi - Connect device and capture IP",
                "Xedge: Load Application to ESP32 - Load specific app",
                "Xedge: Reload Current Application - Quick reload (Ctrl+Shift+R)",
                "Xedge: Reload All Applications - Reload all configured apps",
                "Xedge: Restart ESP32 Device - Full device restart",
                "Xedge: Create Default Configuration File - Create this file"
            ],
            "workflow": [
                "1. Update localIp to your machine's IP address",
                "2. Start Mako server: mako -c server.conf",
                "3. Connect ESP32 to WiFi (Command Palette)",
                "4. Load vscode_app helper application",
                "5. Load your applications",
                "6. Edit files and auto-reload will happen!"
            ]
        }
    };

    fs.writeFileSync(configPath, JSON.stringify(comprehensiveConfig, null, 2));
    vscode.window.showInformationMessage('Created comprehensive xedge-apps.json with all options documented!');
    
    // Open the file
    vscode.workspace.openTextDocument(configPath).then(doc => {
        vscode.window.showTextDocument(doc);
    });
}

/**
 * Update status bar
 */
function updateStatusBar(status: ConnectionStatus, ip?: string): void {
    switch (status) {
        case ConnectionStatus.Disconnected:
            statusBarItem.text = '$(plug) Xedge: Disconnected';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
        case ConnectionStatus.Connecting:
            statusBarItem.text = '$(sync~spin) Xedge: Connecting...';
            statusBarItem.backgroundColor = undefined;
            break;
        case ConnectionStatus.Connected:
            statusBarItem.text = `$(check) Xedge: ${ip || 'Connected'}`;
            statusBarItem.backgroundColor = undefined;
            break;
        case ConnectionStatus.Error:
            statusBarItem.text = '$(error) Xedge: Error';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
    }
    statusBarItem.show();
}

/**
 * Handle file changes from file watcher
 */
async function handleFileChange(app: XEdgeApp): Promise<void> {
    logger.info(`📝 File change detected in app "${app.name}", triggering reload...`);
    
    try {
        vscode.window.showInformationMessage(`Restarting "${app.name}" due to file changes...`);
        await appManager.restartApp(app);
        logger.info(`✓ Auto-restart completed for "${app.name}"`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Auto-restart failed for "${app.name}":`, error);
        vscode.window.showErrorMessage(`Auto-restart failed: ${message}`);
    }
}

async function selectApp(): Promise<XEdgeApp | undefined> {
    // Try to determine app from current file
    const activeEditor = vscode.window.activeTextEditor;
    let selectedApp: XEdgeApp | undefined;

    if (activeEditor) {
        selectedApp = fileWatcher.getAppForFile(activeEditor.document.uri.fsPath);
    }

    // If not found, let user select
    if (!selectedApp) {
        const appNames = config?.apps.map(app => app.name) || [];
        const selected = await vscode.window.showQuickPick(appNames, {
            placeHolder: 'Select application to restart'
        });

        if (!selected) {
            return;
        }

        selectedApp = config?.apps.find(app => app.name === selected);
    }

    return selectedApp;
}
/**
 * Command: Restart application on ESP32
 */
async function restartAppCommand(): Promise<void> {
    logger.logCommand('restartApp', 'User initiated app restart');
    
    if (!config || config.apps.length === 0) {
        logger.warn('No applications configured');
        vscode.window.showErrorMessage('No applications configured in xedge-apps.json');
        return;
    }

    try {
        const selectedApp = await selectApp();
        if (!selectedApp) {
            return;
        }

        logger.info(`Selected app for restart: "${selectedApp.name}"`);
        await appManager.restartApp(selectedApp);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Restart command failed:', error);
        vscode.window.showErrorMessage(`Restart failed: ${message}`);
    }
}

/**
 * Command: Reload all applications
 */
async function reloadAllAppsCommand(): Promise<void> {
    logger.logCommand('reloadAllApps', `Reloading ${config?.apps.length || 0} applications`);
    
    if (!config || config.apps.length === 0) {
        logger.warn('No applications configured');
        vscode.window.showErrorMessage('No applications configured in xedge-apps.json');
        return;
    }

    try {
        vscode.window.showInformationMessage(`Reloading ${config.apps.length} applications...`);

        for (const app of config.apps) {
            logger.info(`Reloading app ${config.apps.indexOf(app) + 1}/${config.apps.length}: "${app.name}"`);
            await appManager.restartApp(app);
        }

        logger.info(`✓ All ${config.apps.length} applications reloaded successfully`);
        vscode.window.showInformationMessage('All applications reloaded successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Reload all failed:', error);
        vscode.window.showErrorMessage(`Reload all failed: ${message}`);
    }
}

/**
 * Command: Restart ESP32 device
 */
async function restartESP32Command(): Promise<void> {
    try {
        const confirm = await vscode.window.showWarningMessage(
            'Restart ESP32 device?',
            { modal: true },
            'Restart'
        );

        if (confirm === 'Restart') {
            await appManager.restartESP32();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Restart failed: ${message}`);
    }
}

/**
 * Command: Load application to ESP32
 */
async function startAppCommand(): Promise<void> {
    try {
        const selectedApp = await selectApp();
        if (!selectedApp) {
            vscode.window.showErrorMessage('No application selected');
            return;
        }

        logger.info(`Selected app for start: "${selectedApp.name}"`);
        await appManager.startApp(selectedApp);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Load failed: ${message}`);
    }
}

/**
 * Command: Load application to ESP32
 */
async function stopAppCommand(): Promise<void> {
    try {
        const selectedApp = await selectApp();
        if (!selectedApp) {
            vscode.window.showErrorMessage('No application selected');
            return;
        }

        await appManager.stopApp(selectedApp);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stop failed: ${message}`);
    }
}

/**
 * Command: Create default configuration file
 */
async function createConfigCommand(): Promise<void> {
    createComprehensiveConfig();
}

/**
 * Command: Start Mako server
 */
async function startMakoServerCommand(): Promise<void> {
    if (makoServer.isRunning()) {
        vscode.window.showInformationMessage('Mako WebDAV server is already running');
        return;
    }

    const started = await makoServer.start();
    if (!started) {
        vscode.window.showErrorMessage('Failed to start Mako server', 'Show Logs').then(selection => {
            if (selection === 'Show Logs') {
                makoServer.showOutput();
            }
        });
    }
}

/**
 * Command: Stop Mako server
 */
async function stopMakoServerCommand(): Promise<void> {
    if (!makoServer.isRunning()) {
        vscode.window.showInformationMessage('Mako WebDAV server is not running');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Stop Mako WebDAV server? ESP32 will not be able to load applications.',
        { modal: true },
        'Stop'
    );

    if (confirm === 'Stop') {
        makoServer.stop();
        vscode.window.showInformationMessage('Mako server stopped');
    }
}

/**
 * Command: Restart Mako server
 */
async function restartMakoServerCommand(): Promise<void> {
    const started = await makoServer.restart();
    if (started) {
        vscode.window.showInformationMessage('Mako server restarted successfully');
    } else {
        vscode.window.showErrorMessage('Failed to restart Mako server', 'Show Logs').then(selection => {
            if (selection === 'Show Logs') {
                makoServer.showOutput();
            }
        });
    }
}

/**
 * Command: Show Mako server logs
 */
async function showMakoLogsCommand(): Promise<void> {
    makoServer.showOutput();
}

/**
 * Command: Show extension logs
 */
async function showExtensionLogsCommand(): Promise<void> {
    logger.show();
}

/**
 * Command: Check application status
 */
async function checkAppStatusCommand(): Promise<void> {
    logger.logCommand('checkAppStatus', 'Checking all application statuses');
    if (!config || config.apps.length === 0) {
        vscode.window.showErrorMessage('No applications configured in xedge-apps.json');
        return;
    }

    try {
        // Get list of apps from ESP32
        const appList = await appManager.getApplicationList();
        
        if (appList.length === 0) {
            vscode.window.showInformationMessage('No applications found on ESP32');
            return;
        }

        // Check status of each configured app
        const statusMessages: string[] = [];
        
        for (const app of config.apps) {
            const status = await appManager.getAppConfig(app.name);
            if (status) {
                const runningStatus = status.running ? '✓ Running' : '✗ Not Running';
                const autostartStatus = status.autostart ? 'Autostart: ON' : 'Autostart: OFF';
                statusMessages.push(`${app.name}: ${runningStatus} (${autostartStatus})`);
            } else {
                statusMessages.push(`${app.name}: Not found on ESP32`);
            }
        }

        // Show status in quick pick
        // const selected = await vscode.window.showQuickPick(statusMessages, {
        //     placeHolder: 'Application Status on ESP32',
        //     canPickMany: false
        // });

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to check status: ${message}`);
    }
}


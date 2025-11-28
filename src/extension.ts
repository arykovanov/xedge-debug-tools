import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XEdgeConfig, XEdgeApp, ConnectionStatus } from './types';
import { XEdgeAppManager } from './xedgeAppManager';
// import { FileWatcher } from './fileWatcher';
import { MakoServerManager } from './makoServerManager';
import { logger } from './logger';

const appManagers: Map<string, XEdgeAppManager> = new Map();
// let fileWatcher: FileWatcher;
let statusBarItem: vscode.StatusBarItem;
let makoServer: MakoServerManager;

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
    appManagers.clear();
    // fileWatcher = new FileWatcher(handleFileChange);
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
        vscode.commands.registerCommand('xedge.showExtensionLogs', showExtensionLogsCommand)
    );

    // Watch for config file changes
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        for (const workspaceFolder of workspaceFolders) {
            const configPath = vscode.Uri.joinPath(workspaceFolder.uri, 'xedge-apps.json');
            const configWatcher = vscode.workspace.createFileSystemWatcher(configPath.fsPath);
            configWatcher.onDidChange(startAppManager);
            configWatcher.onDidCreate(startAppManager);
            configWatcher.onDidDelete(stopAppManager);
            context.subscriptions.push(configWatcher);

            if (fs.existsSync(configPath.fsPath)) {
                startAppManager(configPath);
            }
        }
    }

    logger.info('✓ Xedge Development Tools extension activated successfully');
    logger.info('═══════════════════════════════════════════════════════');
    vscode.window.showInformationMessage('Xedge Development Tools activated!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
    // if (fileWatcher) {
    //     fileWatcher.dispose();
    // }
    if (makoServer) {
        makoServer.dispose();
    }
    logger.dispose();
}

function getActiveWorkspaceFolder(workspaceFolders: readonly vscode.WorkspaceFolder[]): string | null {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return null;
    }

    const activePath = activeEditor.document.uri.fsPath
    for (const [, workspaceFolder] of workspaceFolders.entries()) {
        if (activePath.startsWith(workspaceFolder.uri.fsPath)) {
            return workspaceFolder.uri.fsPath;
        }
    }

    return null;
}


/**
 * Load configuration from workspace folder
 */

async function startAppManager(configFileUri: vscode.Uri): Promise<void> {
    const configFolder = vscode.Uri.file(path.dirname(configFileUri.fsPath));
    const config = await loadConfigurationFromFolder(configFolder);
    const appManager = new XEdgeAppManager(config);
    appManagers.set(path.dirname(configFileUri.fsPath), appManager);
    updateStatusBar(ConnectionStatus.Connected, config.esp32.ip);
}

async function stopAppManager(configFileUri: vscode.Uri): Promise<void> {
    appManagers.delete(configFileUri.fsPath);
}

async function loadConfigurationFromFolder(configFolder: vscode.Uri): Promise<XEdgeConfig> {
    logger.info('Loading configuration...');
    
    const configFilePath = path.join(configFolder.fsPath, 'xedge-apps.json');
    logger.debug(`Loading configuration from file: ${configFilePath}`);
    const configContent = await fs.promises.readFile(configFilePath, 'utf8');
    logger.debug('Parsing config file content:', configContent);
    const config = JSON.parse(configContent);
    logger.info('Configuration parsed successfully');

    let errMsg: string | undefined = undefined;
    // Initialize app manager
    if (!config.esp32.ip) {
        errMsg = 'ESP32 IP not configured.';
    } else if (!config.localIp) {
        errMsg = 'Local IP not configured.';
    } else if (!config.apps.length) {
        errMsg = 'No applications configured.';
    } else

    for (const app of config.apps) {
        if (!app.name) {
            errMsg = errMsg || '';
            errMsg += 'Application name is missing.';
            break;
        }
        if (!app.path) {
            errMsg = errMsg || '';
            errMsg += 'Application path is missing.';
        }
        if (!app.autoReload) {
            errMsg = errMsg || '';
            errMsg += 'Application auto-reload flag is missing.';
        }
    }

    if (errMsg) {
        logger.error(errMsg);
        throw new Error('Invalid configuration: ' + errMsg);
    }

    logger.info(`Initializing app manager with ESP32 IP: ${config.esp32.ip}, Local IP: ${config.localIp}`);

    const xedgeConfig: XEdgeConfig = {
        apps: [],
        localIp: config.localIp,
        esp32: config.esp32,
    };

    for (const app of config.apps) {
        xedgeConfig.apps.push({
            name: app.name,
            autoReload: app.autoReload,
            absolutePath: path.join(configFolder.fsPath, app.path)
        });
    }

    return xedgeConfig;
}

/**
 * Create default configuration file with comprehensive documentation
 */
function createDefaultConfig(): void {
    const activeWorkspaceFolder = getActiveWorkspaceFolder(vscode.workspace.workspaceFolders || []);
    if (!activeWorkspaceFolder) {
        vscode.window.showErrorMessage('No active workspace folder found');
        return;
    }

    const defaultConfig = {
        "$comment": "Xedge Development Tools Configuration File",
        "apps": [
            {
                "$name_comment": "Application name",
                "name": "my_lsp_app",
                "$path_comment": "Absolute or relative path to LSP application directory",
                "path": "./lsp_app",
                "$autoReload_comment": "Enable file watching and auto-reload application on file changes",
                "autoReload": true,
            }
        ],
        
        "$localIp_comment": "IP address of this machine running VSCode and Mako WebDAV server. Find with: ip addr show | grep 'inet ' | grep -v 127.0.0.1",
        "localIp": "192.168.0.100",
        
        "esp32": {
            "$ip_comment": "ESP32 device IP address. Set this to your ESP32's IP address on the network. Example: 192.168.0.102",
            "ip": ""
        }
    };

    const configPath = path.join(activeWorkspaceFolder, 'xedge-apps.json');

    const saveConfigFunc = () => {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        vscode.window.showInformationMessage('Created xedge-apps.json. Please update it with your settings.');
        
        // Open the file
        vscode.workspace.openTextDocument(configPath).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }
    // Check if file already exists
    if (fs.existsSync(configPath)) {
        vscode.window.showWarningMessage(
            'xedge-apps.json already exists. Overwrite it?',
            'Overwrite',
            'Cancel'
        ).then(selection => {
            if (selection === 'Overwrite') {
                saveConfigFunc();
            } else {
                vscode.window.showInformationMessage('xedge-apps.json not overwritten.');
            }
        });
    } else {
        saveConfigFunc();
    }
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
 * Command: Restart application on ESP32
 */
async function restartAppCommand(): Promise<void> {
    
    try {

        logger.logCommand('restartApp', 'User initiated app restart');

        // Try to determine app from current file
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        for (const [rootPath, manager] of appManagers.entries()) {
            if (activeEditor.document.uri.fsPath.startsWith(rootPath)) {
                manager.stopAppForPath(activeEditor.document.uri.fsPath).then(() => {
                    manager.startAppOfFile(activeEditor.document.uri.fsPath)
                });
                break
            }
        }

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
    try {
        // const activeEditor = vscode.window.activeTextEditor;
        // if (!activeEditor) {
        //     return;
        // }

        // for (const [rootPath, manager] of appManagers.entries()) {
        //     if (activeEditor.document.uri.fsPath.startsWith(rootPath)) {
        //         await manager.reloadAllApps();
        //         break;
        //     }
        // }
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
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        for (const [rootPath, manager] of appManagers.entries()) {
            if (activeEditor.document.uri.fsPath.startsWith(rootPath)) {
                await manager.restartESP32();
                break;
            }
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
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        for (const [rootPath, manager] of appManagers.entries()) {
            if (activeEditor.document.uri.fsPath.startsWith(rootPath)) {
                await manager.startAppOfFile(activeEditor.document.uri.fsPath);
                break;
            }
        }
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
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        for (const [rootPath, manager] of appManagers.entries()) {
            if (activeEditor.document.uri.fsPath.startsWith(rootPath)) {
                await manager.stopAppForPath(activeEditor.document.uri.fsPath);
                break;
            }
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stop failed: ${message}`);
    }
}

/**
 * Command: Create default configuration file
 */
async function createConfigCommand(): Promise<void> {
    createDefaultConfig();
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

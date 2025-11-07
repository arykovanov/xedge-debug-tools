import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { XEdgeApp, AppLoadPayload, ServerConfig } from './types';
import { logger } from './logger';

// VSCode API interface (simplified for DI)
export interface VSCodeAPI {
    window?: any;
    workspace?: any;
}

// Dynamically import vscode to support standalone testing
let vscode: VSCodeAPI | any;
try {
    vscode = require('vscode');
} catch {
    // Running in test mode
    vscode = {
        window: {
            showInformationMessage: (msg: string) => log(msg),
            showWarningMessage: (msg: string) => console.warn(msg)
        }
    };
}

function log(msg: string): void {
    console.log(`[XEdgeAppManager] ${msg}`);
}

/**
 * Manages XEdge applications on ESP32 device via REST API
 */
export class XEdgeAppManager {
    private esp32Ip: string = '';
    private localIp: string = '';
    private fsname: string = 'fs';
    private axiosInstance: AxiosInstance;

    constructor() {
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Initialize the manager with configuration
     */
    public initialize(esp32Ip: string, localIp: string): void {
        this.esp32Ip = esp32Ip;
        this.localIp = localIp;
        logger.info('Initializing XEdgeAppManager', { esp32Ip, localIp });
        this.loadServerConfig();
    }

    /**
     * Load server.conf to get fsname
     */
    private loadServerConfig(): void {
        try {
            const extensionPath = path.dirname(__dirname);
            const serverConfPath = path.join(extensionPath, 'server.conf');
            
            logger.debug(`Loading server.conf from: ${serverConfPath}`);
            
            if (fs.existsSync(serverConfPath)) {
                const content = fs.readFileSync(serverConfPath, 'utf8');
                // Parse Lua-style config: fileserver={fsname="fs",...}
                const fsnameMatch = content.match(/fsname\s*=\s*"([^"]+)"/);
                if (fsnameMatch) {
                    this.fsname = fsnameMatch[1];
                    logger.info(`Loaded fsname from server.conf: "${this.fsname}"`);
                } else {
                    logger.warn('Could not parse fsname from server.conf, using default "fs"');
                }
            } else {
                logger.warn(`server.conf not found at ${serverConfPath}, using default fsname "fs"`);
            }
        } catch (error) {
            logger.error('Error loading server.conf:', error);
            vscode.window.showWarningMessage('Could not load server.conf, using default fsname "fs"');
        }
    }

    /**
     * Construct WebDAV URL for an application
     */
    private buildAppUrl(appPath: string): string {
        // Convert relative path to absolute if needed
        const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0];
        let absolutePath = appPath;
        
        if (!path.isAbsolute(appPath) && workspaceFolder) {
            absolutePath = path.join(workspaceFolder.uri.fsPath, appPath);
            logger.debug(`Converted relative path "${appPath}" to absolute: "${absolutePath}"`);
        } else if (!path.isAbsolute(appPath)) {
            // In test mode without workspace, assume appPath is already correct or use as-is
            logger.warn(`Relative path "${appPath}" used without workspace folder`);
            absolutePath = appPath;
        }

        // Format: http://<localIp>/<fsname>/<absolute_path>
        const url = `http://${this.localIp}/${this.fsname}${absolutePath}`;
        logger.debug(`Built WebDAV URL: ${url}`);
        return url;
    }

    /**
     * Get list of all applications on ESP32
     */
    public async getApplicationList(): Promise<string[]> {
        if (!this.esp32Ip) {
            throw new Error('ESP32 IP not configured.');
        }

        try {
            const apiUrl = `http://${this.esp32Ip}/rtl/apps/?cmd=lj`;
            logger.logRequest('GET', apiUrl);
            
            const response = await this.axiosInstance.get(apiUrl);
            
            logger.logResponse('GET', apiUrl, response.status, response.data);
            
            // Response is array of objects like [{n: "app_name", s: -1, t: 1234}, ...]
            if (Array.isArray(response.data)) {
                const appNames = response.data
                    .map((app: any) => app.n || app.name || app)
                    .filter((n: any) => typeof n === 'string');
                
                logger.info(`Found ${appNames.length} applications on ESP32`, appNames);
                return appNames;
            }
            logger.warn('Application list response is not an array', response.data);
            return [];
        } catch (error) {
            logger.error('Failed to get application list:', error);
            return [];
        }
    }

    /**
     * Get application status
     */
    public async getAppStatus(appName: string): Promise<{ running: boolean; autostart: boolean; url?: string } | null> {
        if (!this.esp32Ip) {
            throw new Error('ESP32 IP not configured.');
        }

        try {
            const apiUrl = `http://${this.esp32Ip}/rtl/apps/${appName}/.appcfg`;
            logger.logRequest('GET', apiUrl);
            
            const response = await this.axiosInstance.get(apiUrl);
            
            logger.logResponse('GET', apiUrl, response.status, response.data);
            
            if (response.data && typeof response.data === 'object') {
                const status = {
                    running: response.data.running || false,
                    autostart: response.data.autostart || false,
                    url: response.data.url || undefined
                };
                logger.info(`App "${appName}" status:`, status);
                return status;
            }
            logger.warn(`App "${appName}" status response invalid:`, response.data);
            return null;
        } catch (error) {
            logger.error(`Failed to get status for app "${appName}":`, error);
            return null;
        }
    }

    /**
     * Check application status and warn if not running
     */
    private async checkAndWarnAppStatus(appName: string): Promise<void> {
        try {
            const status = await this.getAppStatus(appName);
            
            if (status && !status.running) {
                vscode.window.showWarningMessage(
                    `Application "${appName}" is loaded but NOT RUNNING on ESP32. It may not be responding to requests.`,
                    'Start App',
                    'Ignore'
                ).then((selection: string | undefined) => {
                    if (selection === 'Start App') {
                        // Could implement start command here if REST API supports it
                        vscode.window.showInformationMessage('Use XEdge web interface to start the application.');
                    }
                });
            }
        } catch (error) {
            // Silently ignore status check errors
            console.error('Status check failed:', error);
        }
    }

    /**
     * Check if application with given name exists on ESP32
     */
    private async appExists(appName: string): Promise<boolean> {
        try {
            const apiUrl = `http://${this.esp32Ip}/rtl/apps/${appName}/.appcfg`;
            logger.logRequest('GET', apiUrl);
            
            const response = await this.axiosInstance.get(apiUrl);
            
            logger.logResponse('GET', apiUrl, response.status, response.data);

            return response.status === 200 && response.data.name === appName;
        } catch (error) {
            logger.error(`Failed to check if app "${appName}" exists:`, error);
            return false;
        }
    }   
    /**
     * Load (or reload) an application on ESP32
     * Checks if app already exists and deletes it first if needed
     */
    public async loadApp(app: XEdgeApp): Promise<void> {
        logger.info(`Loading application "${app.name}"...`);
        
        if (!this.esp32Ip) {
            const error = 'ESP32 IP not configured. Please connect to WiFi first.';
            logger.error(error);
            throw new Error(error);
        }

        // Check if app already exists
        const exists = await this.appExists(app.name);
        
        if (exists) {
            logger.info(`Application "${app.name}" already exists on ESP32`);
            
            // Check if URL matches
            const existingStatus = await this.getAppStatus(app.name);
            const newUrl = this.buildAppUrl(app.path);
            
            if (existingStatus && existingStatus.url) {
                logger.debug(`Existing URL: ${existingStatus.url}`);
                logger.debug(`New URL: ${newUrl}`);
                
                if (existingStatus.url === newUrl) {
                    logger.info(`URLs match, but will delete and reload to ensure clean state`);
                    return;
                } else {
                    logger.info(`URLs differ, deleting existing app before loading`);
                    await this.deleteApp(app.name);
                }
            }
        }

        const url = this.buildAppUrl(app.path);
        const payload: AppLoadPayload = {
            name: app.name,
            url: url,
            running: true,  // Start the app immediately after loading
            autostart: false,
            dirname: app.name,  // dirname is same as app name - makes app accessible at http://{localIp}/{dirname}
            priority: "0"
        };

        logger.debug('Load payload:', payload);
        logger.info(`App will be accessible at: http://${this.localIp}/${app.name}`);

        try {
            const apiUrl = `http://${this.esp32Ip}/rtl/apps/net/.appcfg`;
            logger.logRequest('PUT', apiUrl, payload);
            
            const response = await this.axiosInstance.put(apiUrl, payload);
            
            logger.logResponse('PUT', apiUrl, response.status, response.data);
            logger.info(`✓ Application "${app.name}" loaded successfully`);
            
            vscode.window.showInformationMessage(`Application "${app.name}" loaded successfully`);
            
            // Check status after a brief delay
            setTimeout(() => this.checkAndWarnAppStatus(app.name), 2000);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to load app "${app.name}":`, error);
            throw new Error(`Failed to load app "${app.name}": ${message}`);
        }
    }

    /**
     * Reload an application (same as load - just repeat PUT)
     */
    public async reloadApp(app: XEdgeApp): Promise<void> {
        logger.info(`Reloading application "${app.name}"...`);
        await this.loadApp(app);
    }

    /**
     * Delete an application from ESP32
     */
    public async deleteApp(appName: string): Promise<void> {
        logger.info(`Deleting application "${appName}"...`);
        
        if (!this.esp32Ip) {
            const error = 'ESP32 IP not configured. Please connect to WiFi first.';
            logger.error(error);
            throw new Error(error);
        }

        try {
            const formData = new FormData();
            formData.append('cmd', 'rmt');
            formData.append('file', '.appcfg');

            const apiUrl = `http://${this.esp32Ip}/rtl/apps/${appName}/`;
            logger.logRequest('POST', apiUrl, { cmd: 'rmt', file: '.appcfg' });
            
            // const headers = formData.getHeaders()
            const headers = {
                'Content-Type': 'application/json'
            }
            const response = await this.axiosInstance.post(apiUrl, formData, {headers: headers});
            
            logger.logResponse('POST', apiUrl, response.status, response.data);
            logger.info(`✓ Application "${appName}" deleted successfully`);
            
            vscode.window.showInformationMessage(`Application "${appName}" deleted successfully`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to delete app "${appName}":`, error);
            throw new Error(`Failed to delete app "${appName}": ${message}`);
        }
    }

    /**
     * Restart ESP32 device via helper app endpoint
     */
    public async restartESP32(): Promise<void> {
        logger.info('Sending restart command to ESP32...');
        
        if (!this.esp32Ip) {
            const error = 'ESP32 IP not configured.';
            logger.error(error);
            throw new Error(error);
        }

        try {
            // vscode_app is accessible at /vscode_app (dirname)
            const apiUrl = `http://${this.esp32Ip}/vscode_app/restart.lsp`;
            logger.logRequest('POST', apiUrl);
            
            const response = await this.axiosInstance.post(apiUrl);
            
            logger.logResponse('POST', apiUrl, response.status, response.data);
            logger.info('✓ ESP32 restart command sent');
            
            vscode.window.showInformationMessage('ESP32 restart command sent');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error('Failed to restart ESP32:', error);
            throw new Error(`Failed to restart ESP32: ${message}`);
        }
    }

    /**
     * Get device info from vscode_app helper
     */
    public async getDeviceInfo(): Promise<any> {
        logger.info('Getting device info from ESP32...');
        
        if (!this.esp32Ip) {
            throw new Error('ESP32 IP not configured.');
        }

        try {
            const apiUrl = `http://${this.esp32Ip}/vscode_app/info`;
            logger.logRequest('GET', apiUrl);
            
            const response = await this.axiosInstance.get(apiUrl);
            
            logger.logResponse('GET', apiUrl, response.status, response.data);
            return response.data;
        } catch (error) {
            logger.error('Failed to get device info:', error);
            throw error;
        }
    }

    /**
     * Check if ESP32 is reachable
     */
    public async isConnected(): Promise<boolean> {
        if (!this.esp32Ip) {
            return false;
        }

        try {
            await this.axiosInstance.get(`http://${this.esp32Ip}/`, { timeout: 3000 });
            return true;
        } catch {
            return false;
        }
    }
}


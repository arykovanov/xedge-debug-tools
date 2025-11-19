import axios, { AxiosError, AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { XEdgeApp, ApplicationConfig, ServerConfig } from './types';
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
 * Manages Xedge applications on ESP32 device via REST API
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
    public async getApplicationList(): Promise<ApplicationConfig[]> {
        if (!this.esp32Ip) {
            throw new Error('ESP32 IP not configured.');
        }

        const apiUrl = `http://${this.esp32Ip}/rtl/apps/?cmd=lj`;
        logger.logRequest('GET', apiUrl);
        
        const response = await this.axiosInstance.get(apiUrl);
        
        logger.logResponse('GET', apiUrl, response.status, response.data);
        
        // Response is array of objects like [{n: "app_name", s: -1, t: 1234}, ...]
        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response. Application list is not an array: ' + JSON.stringify(response.data));
        }

        const configs: ApplicationConfig[] = [];
        for (const app of response.data) {
            const config = await this.getAppConfig(app.n || app.name || app);
            if (config) {
                configs.push(config);
            }
        }

        logger.info(`Found ${configs.length} applications on ESP32`, configs);
        return configs;
    }

    /**
     * Get application status
     */
    public async getAppConfig(appName: string): Promise<ApplicationConfig | null> {
        try {
        if (!this.esp32Ip) {
            throw new Error('ESP32 IP not configured.');
        }

        const apiUrl = `http://${this.esp32Ip}/rtl/apps/${appName}/.appcfg`;
        logger.logRequest('GET', apiUrl);
        
        const response = await this.axiosInstance.get(apiUrl);
        logger.logResponse('GET', apiUrl, response.status, response.data);

        if (response.status !== 200) {
            throw new Error('Invalid response: ' + JSON.stringify(response));
        }
        
        if (! response.data || typeof response.data !== 'object') {
            throw new Error('App "' + appName + '" status response invalid: ' + JSON.stringify(response.data));
        }

        const status: ApplicationConfig = {
            name: response.data.name,
            url: response.data.url,
            running: response.data.running,
            autostart: response.data.autostart,
            dirname: response.data.dirname,
            priority: response.data.priority
        };

        logger.info(`App "${appName}" status:`, status);
        return status;
        } catch (error: any) {
            const axiosError = error as AxiosError;
            if (error?.status === 404) {
                return null;
            }        

            throw error;
        }
    }

    /**
     * Check application status and warn if not running
     */
    private async checkAndWarnAppStatus(appName: string): Promise<void> {
        try {
            const config = await this.getAppConfig(appName);
            
            if (config && !config.running) {
                vscode.window.showWarningMessage(
                    `Application "${appName}" is loaded but NOT RUNNING on ESP32. It may not be responding to requests.`,
                    'Start App',
                    'Ignore'
                ).then((selection: string | undefined) => {
                    if (selection === 'Start App') {
                        // Could implement start command here if REST API supports it
                        vscode.window.showInformationMessage('Use Xedge web interface to start the application.');
                    }
                });
            }
        } catch (error) {
            // Silently ignore status check errors
            console.error('Status check failed:', error);
        }
    }

    /**
     * Load (or reload) an application on ESP32
     * Checks if app already exists and deletes it first if needed
     */
    public async startApp(app: XEdgeApp): Promise<void> {
        logger.info(`Loading application "${app.name}"...`);
        
        if (!this.esp32Ip) {
            const error = 'ESP32 IP not configured. Please connect to WiFi first.';
            logger.error(error);
            throw new Error(error);
        }

        const appConfig = await this.getAppConfig(app.name);
        if (appConfig && appConfig.running) {
            vscode.window.showInformationMessage(`App "${app.name}" is already running`);
            return;
        }

        const url = this.buildAppUrl(app.path);
        const payload: ApplicationConfig = {
            name: app.name,
            url: url,
            running: true,  // Start the app immediately after loading
            autostart: appConfig?.autostart || false,
            dirname: app.name,  // dirname is same as app name - makes app accessible at http://{localIp}/{dirname}
            priority: appConfig?.priority || "0"
        };

        logger.debug('Load payload:', payload);
        logger.info(`App will be accessible at: http://${this.localIp}/${app.name}`);

        try {
            // There is strange invalid behavior:
            // POST/PUT to rtl/apps/net/.appcfg 
            //  -- if app not exists, creates new app and returns 201
            //  -- if app exists, creates new app and append numeric suffix and returns 201
            // This is completely invalid behavior and should be fixed: if application exists request must fail
            // Only POST method must create new app, method PUT MUST NOT be allowed to create new app

            // Application configuration is updated with PUT/POST to rtl/apps/{appname}/.appcfg
            // Also invalid behavior: if app not exists - request must fail
            // Methods looks like are not respected.

            // REST API must be fixed to be consistent and correct and respect CRUD specifications.
            let apiUrl = `http://${this.esp32Ip}/rtl/apps/net/.appcfg`;
            let method = 'POST';
            if (appConfig) {
                apiUrl = `http://${this.esp32Ip}/rtl/apps/${app.name}/.appcfg`;
                method = 'PUT';
            }

            logger.logRequest(method, apiUrl, payload);
            let response

            if (method === 'POST') {
                response = await this.axiosInstance.post(apiUrl, payload);
            } else {
                response = await this.axiosInstance.put(apiUrl, payload);
            }
            
            logger.logResponse(method, apiUrl, response.status, response.data);
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
     * Load (or reload) an application on ESP32
     * Checks if app already exists and deletes it first if needed
     */
    public async stopApp(app: XEdgeApp): Promise<void> {
        logger.info(`Stopping application "${app.name}"...`);
        
        if (!this.esp32Ip) {
            const error = 'ESP32 IP not configured. Please connect to WiFi first.';
            logger.error(error);
            throw new Error(error);
        }

        let appConfig = await this.getAppConfig(app.name);
        if (!appConfig) {
            throw new Error(`App "${app.name}" not found`);
        }

        if (!appConfig.running) {
            vscode.window.showInformationMessage(`App "${app.name}" is already stopped`);
            return;
        }

        appConfig.running = false;

        const apiUrl = `http://${this.esp32Ip}/rtl/apps/${app.name}/.appcfg`;
        logger.logRequest('PUT', apiUrl, appConfig);
        
        const response = await this.axiosInstance.put(apiUrl, appConfig);
        
        logger.logResponse('PUT', apiUrl, response.status, response.data);
        logger.info(`✓ Application "${app.name}" stopped successfully`);
        
        vscode.window.showInformationMessage(`Application "${app.name}" stopped successfully`);
    }

    /**
     * Reload an application (same as load - just repeat PUT)
     */
    public async restartApp(app: XEdgeApp): Promise<void> {
        logger.info(`Reloading application "${app.name}"...`);
        await this.stopApp(app);
        await this.startApp(app);
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


import axios, { AxiosError, AxiosInstance } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { XEdgeApp, ApplicationConfig, XEdgeConfig } from './types';
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
    public config: XEdgeConfig; // Configuration
    private webDavUrl: string;
    private axiosInstance: AxiosInstance;
    private helperAppWhatcher: NodeJS.Timeout | null = null;
    private loadHelperAppBusy: boolean = false;

    constructor(config: XEdgeConfig) {
        this.config = config;
        this.webDavUrl = `http://${config.localIp}:9357/fs`;
        this.axiosInstance = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        this.helperAppWhatcher = setInterval(this.loadHelperApp.bind(this), 3000);
    }

    public getAppNames(): string[] {
        return this.config.apps.map(app => app.name);
    }

    public dispose(): void {
        if (this.helperAppWhatcher) {
            clearInterval(this.helperAppWhatcher);
            this.helperAppWhatcher = null;
        }
    }

    private async loadHelperApp(): Promise<void> {
        try {
            if (this.loadHelperAppBusy) {
                return;
            }
    
            this.loadHelperAppBusy = true;
            logger.info('Loading vscode_app helper application to ESP32...');
    
            const status = await this.wgetAppConfig('vscode_app')
            if (status && status.running) {
                logger.info('vscode_app helper application already exists on ESP32');
                return;
            }
    
            // Create app config for vscode_app
            const helperApp: XEdgeApp = {
                name: 'vscode_app',
                absolutePath: path.join(path.dirname(__dirname), 'vscode_app'),
                autoReload: true
            };
            
            logger.info(`Helper app absolute path: ${helperApp.absolutePath}`);
    
            // Load the helper app
            await this.startApp(helperApp);
           
            logger.info('✓ vscode_app helper application loaded successfully');
        } catch (error) {
            logger.error('Failed to load vscode_app helper application:', error);
            // Don't show error to user - helper app is optional
            logger.warn('Extension will work but ESP32 restart command may not be available');
        }
        finally {
            this.loadHelperAppBusy = false;
        }
    }


    private async getAppConfigByFilePath(appPath: string): Promise<XEdgeApp> {
        for (const app of this.config.apps) {
            if (appPath.startsWith(app.absolutePath)) {
                return app;
            }
        }

        throw new Error(`App not found for path: "${appPath}". Check xedge-apps.json configuration.`);
    }

    /**
     * Get list of all applications on ESP32
     */
    public async getApplicationList(): Promise<ApplicationConfig[]> {
        const apiUrl = `http://${this.config.esp32.ip}/rtl/apps/?cmd=lj`;
        logger.logRequest('GET', apiUrl);
        
        const response = await this.axiosInstance.get(apiUrl);
        
        logger.logResponse('GET', apiUrl, response.status, response.data);
        
        // Response is array of objects like [{n: "app_name", s: -1, t: 1234}, ...]
        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response. Application list is not an array: ' + JSON.stringify(response.data));
        }

        const configs: ApplicationConfig[] = [];
        for (const app of response.data) {
            const config = await this.wgetAppConfig(app.n || app.name || app);
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
    public async wgetAppConfig(appName: string): Promise<ApplicationConfig | null> {
        try {
            const apiUrl = `http://${this.config.esp32.ip}/rtl/apps/${appName}/.appcfg`;
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
            if (axiosError?.status === 404) {
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
            const config = await this.wgetAppConfig(appName);
            
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
    public async startAppOfFile(appPath: string): Promise<void> {
        const app = await this.getAppConfigByFilePath(appPath);
        await this.startApp(app);
    }

    private async startApp(app: XEdgeApp): Promise<void> {
        logger.info(`Loading application "${app.name}"...`);
    
        const appConfig = await this.wgetAppConfig(app.name);
        const appWebDavUrl = this.webDavUrl + app.absolutePath;
        if (appConfig && appConfig.running && appConfig.url === appWebDavUrl) {
            vscode.window.showInformationMessage(`App "${app.name}" is already running`);
            return;
        }

        const payload: ApplicationConfig = {
            name: app.name,
            url: appWebDavUrl,
            running: true,  // Start the app immediately after loading
            autostart: appConfig?.autostart || false,
            dirname: app.name,  // dirname is same as app name - makes app accessible at http://{localIp}/{dirname}
            priority: appConfig?.priority || "0"
        };

        logger.debug('Load payload:', payload);
        logger.info(`App will be accessible at: ${appWebDavUrl}`);

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
            let apiUrl = `http://${this.config.esp32.ip}/rtl/apps/net/.appcfg`;
            // It application exists on ESP32, we must update existing app by different URL.
            if (appConfig) {
                apiUrl = `http://${this.config.esp32.ip}/rtl/apps/${app.name}/.appcfg`;
            }

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
     * Load (or reload) an application on ESP32
     * Checks if app already exists and deletes it first if needed
     */
    public async stopAppForPath(appPath: string): Promise<void> {
        const app = await this.getAppConfigByFilePath(appPath);
        await this.stopApp(app);
    }

    public async stopApp(app: XEdgeApp): Promise<void> {
        logger.info(`Stopping application "${app.name}"...`);
        
        const appConfig = await this.wgetAppConfig(app.name);
        if (!appConfig) {
            throw new Error(`App "${app.name}" not found`);
        }

        if (!appConfig.running) {
            vscode.window.showInformationMessage(`App "${app.name}" is already stopped`);
            return;
        }

        appConfig.running = false;

        const apiUrl = `http://${this.config.esp32.ip}/rtl/apps/${app.name}/.appcfg`;
        logger.logRequest('PUT', apiUrl, appConfig);
        
        const response = await this.axiosInstance.put(apiUrl, appConfig);
        
        logger.logResponse('PUT', apiUrl, response.status, response.data);
        logger.info(`✓ Application "${app.name}" stopped successfully`);
        
        vscode.window.showInformationMessage(`Application "${app.name}" stopped successfully`);
    }

    /**
     * Delete an application from ESP32
     */
    public async deleteAppForPath(appPath: string): Promise<void> {
        const app = await this.getAppConfigByFilePath(appPath);
        await this.deleteApp(app);
    }

    private async deleteApp(app: XEdgeApp): Promise<void> {
        try {
            logger.info(`Deleting application from ESP32: "${app.name}"...`);

            const formData = new FormData();
            formData.append('cmd', 'rmt');
            formData.append('file', '.appcfg');

            const apiUrl = `http://${this.config.esp32.ip}/rtl/apps/${app.name}/`;
            logger.logRequest('POST', apiUrl, { cmd: 'rmt', file: '.appcfg' });
            
            // const headers = formData.getHeaders()
            const headers = {
                'Content-Type': 'application/json'
            }
            const response = await this.axiosInstance.post(apiUrl, formData, {headers: headers});
            
            logger.logResponse('POST', apiUrl, response.status, response.data);
            logger.info(`✓ Application "${app.name}" deleted successfully`);
            
            vscode.window.showInformationMessage(`Application "${app.name}" deleted successfully`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to delete app "${app.name}":`, error);
            throw new Error(`Failed to delete app "${app.name}": ${message}`);
        }
    }

    /**
     * Restart ESP32 device via helper app endpoint
     */
    public async restartESP32(): Promise<void> {
        try {
            logger.info('Sending restart command to ESP32...');
            // vscode_app is accessible at /vscode_app (dirname)
            const apiUrl = `http://${this.config.esp32.ip}/vscode_app/restart.lsp`;
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
        try {
            logger.info('Getting device info from ESP32...');
            const apiUrl = `http://${this.config.esp32.ip}/vscode_app/info`;
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
        try {
            await this.axiosInstance.get(`http://${this.config.esp32.ip}/`, { timeout: 3000 });
            return true;
        } catch {
            return false;
        }
    }
}


/**
 * Xedge Application Configuration
 */
export interface XEdgeApp {
    name: string;
    autoReload: boolean;
    absolutePath: string;
}

/**
 * ESP32 Device Configuration
 */
export interface ESP32Config {
    ip: string;
}

/**
 * Main Configuration File Structure (xedge-apps.json)
 */
export interface XEdgeConfig {
    apps: XEdgeApp[];
    localIp: string;
    esp32: ESP32Config;
}

/**
 * App Load/Reload Payload for Xedge REST API
 */
export interface ApplicationConfig {
    name: string;
    url: string;
    running: boolean;
    autostart: boolean;
    dirname: string;
    priority: string;
}

/**
 * Server Configuration (from server.conf)
 */
export interface ServerConfig {
    fsname: string;
    ioname: string;
    path: string;
    noauth: boolean;
}

/**
 * Status of the extension
 */
export enum ConnectionStatus {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    Error = 'error'
}


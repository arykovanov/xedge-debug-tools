// Dynamically import vscode to support standalone testing
let vscode: any;
try {
    vscode = require('vscode');
} catch {
    // Running in test mode - use mock
    vscode = {
        window: {
            createOutputChannel: (name: string) => ({
                appendLine: (msg: string) => console.log(msg),
                show: () => {},
                clear: () => {},
                dispose: () => {}
            })
        }
    };
}

/**
 * Centralized logging for Xedge extension
 * Provides detailed logs of all operations, requests, and responses
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: any;
    private debugMode: boolean = true;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Xedge Extension');
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Enable or disable debug logging
     */
    public setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Log informational message
     */
    public info(message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] INFO: ${message}`;
        console.log(logMessage);
        this.outputChannel.appendLine(logMessage);
        
        if (data !== undefined) {
            const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
            console.log(dataStr);
            this.outputChannel.appendLine(dataStr);
        }
    }

    /**
     * Log debug message (only if debug mode enabled)
     */
    public debug(message: string, data?: any): void {
        if (!this.debugMode) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] DEBUG: ${message}`;
        console.log(logMessage);
        this.outputChannel.appendLine(logMessage);
        
        if (data !== undefined) {
            const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
            console.log(dataStr);
            this.outputChannel.appendLine(dataStr);
        }
    }

    /**
     * Log warning message
     */
    public warn(message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] WARN: ${message}`;
        console.warn(logMessage);
        this.outputChannel.appendLine(logMessage);
        
        if (data !== undefined) {
            const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
            console.warn(dataStr);
            this.outputChannel.appendLine(dataStr);
        }
    }

    /**
     * Log error message
     */
    public error(message: string, error?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ERROR: ${message}`;
        console.error(logMessage);
        this.outputChannel.appendLine(logMessage);
        
        if (error !== undefined) {
            if (error instanceof Error) {
                console.error(error.stack);
                this.outputChannel.appendLine(error.stack || error.message);
            } else {
                const errorStr = typeof error === 'object' ? JSON.stringify(error, null, 2) : String(error);
                console.error(errorStr);
                this.outputChannel.appendLine(errorStr);
            }
        }
    }

    /**
     * Log HTTP request
     */
    public logRequest(method: string, url: string, data?: any): void {
        this.info(`→ HTTP ${method} ${url}`);
        if (data) {
            this.debug('Request body:', data);
        }
    }

    /**
     * Log HTTP response
     */
    public logResponse(method: string, url: string, status: number, data?: any): void {
        this.info(`← HTTP ${method} ${url} - Status: ${status}`);
        if (data) {
            this.debug('Response body:', data);
        }
    }

    /**
     * Log command execution
     */
    public logCommand(command: string, details?: string): void {
        this.info(`⚡ Command: ${command}${details ? ' - ' + details : ''}`);
    }

    /**
     * Log file operation
     */
    public logFile(operation: string, filePath: string, details?: string): void {
        this.debug(`📁 File ${operation}: ${filePath}${details ? ' - ' + details : ''}`);
    }

    /**
     * Show output channel
     */
    public show(): void {
        this.outputChannel.show();
    }

    /**
     * Clear output channel
     */
    public clear(): void {
        this.outputChannel.clear();
    }

    /**
     * Dispose output channel
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }
}

// Export singleton instance
export const logger = Logger.getInstance();


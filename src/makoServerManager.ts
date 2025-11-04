import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages Mako WebDAV server lifecycle
 * Ensures server is always running for ESP32 to load applications
 */
export class MakoServerManager {
    private makoProcess: ChildProcess | null = null;
    private serverConfigPath: string;
    private makoPath: string;
    private outputChannel: vscode.OutputChannel;
    private autoRestart: boolean = true;
    private restartDelay: number = 2000; // 2 seconds
    private restartAttempts: number = 0;
    private maxRestartAttempts: number = 5;
    private extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
        this.outputChannel = vscode.window.createOutputChannel('Mako WebDAV Server');
        
        // Determine paths relative to extension installation
        this.serverConfigPath = path.join(this.extensionPath, 'server.conf');
        this.makoPath = this.findMakoExecutable();
        
        this.log(`Extension path: ${this.extensionPath}`);
        this.log(`Server config path: ${this.serverConfigPath}`);
        this.log(`Mako path: ${this.makoPath}`);
    }

    /**
     * Find mako executable in extension directory
     */
    private findMakoExecutable(): string {
        // Priority order:
        // 1. mako in extension directory (bundled)
        // 2. mako in PATH
        // 3. Common system locations
        
        const extensionMako = path.join(this.extensionPath, 'mako');
        
        // Check extension directory first (bundled with extension)
        if (fs.existsSync(extensionMako)) {
            this.log(`Found bundled mako executable: ${extensionMako}`);
            // Make sure it's executable
            try {
                fs.chmodSync(extensionMako, 0o755);
            } catch (error) {
                this.logError(`Failed to set executable permissions: ${error}`);
            }
            return extensionMako;
        }

        // Try system locations
        const possiblePaths = [
            'mako',  // In PATH
            '/usr/local/bin/mako',
            '/usr/bin/mako',
            path.join(process.env.HOME || '~', '.local/bin/mako')
        ];

        for (const makoPath of possiblePaths) {
            try {
                if (makoPath === 'mako') {
                    // Will check if it's in PATH when executed
                    this.log(`Will try 'mako' from PATH`);
                    return makoPath;
                } else if (fs.existsSync(makoPath)) {
                    this.log(`Found mako at: ${makoPath}`);
                    return makoPath;
                }
            } catch {
                continue;
            }
        }

        this.logError('Mako executable not found! Extension will not work properly.');
        return extensionMako;  // Return extension path as fallback, will fail when executed
    }

    /**
     * Start Mako server
     */
    public async start(): Promise<boolean> {
        if (this.makoProcess) {
            this.log('Mako server is already running');
            return true;
        }

        if (!fs.existsSync(this.serverConfigPath)) {
            this.logError(`Server config not found: ${this.serverConfigPath}`);
            vscode.window.showErrorMessage('server.conf not found. Cannot start Mako server.');
            return false;
        }

        try {
            this.log(`Starting Mako server with config: ${this.serverConfigPath}`);
            this.log(`Mako executable: ${this.makoPath}`);

            this.makoProcess = spawn(this.makoPath, ['-c', this.serverConfigPath], {
                cwd: path.dirname(this.serverConfigPath),
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Handle stdout
            this.makoProcess.stdout?.on('data', (data) => {
                this.log(data.toString().trim());
            });

            // Handle stderr
            this.makoProcess.stderr?.on('data', (data) => {
                this.log(data.toString().trim());
            });

            // Handle process exit
            this.makoProcess.on('exit', (code, signal) => {
                this.logError(`Mako server exited with code ${code}, signal ${signal}`);
                this.makoProcess = null;

                if (this.autoRestart && this.restartAttempts < this.maxRestartAttempts) {
                    this.restartAttempts++;
                    this.log(`Attempting to restart Mako server (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
                    
                    setTimeout(() => {
                        this.start();
                    }, this.restartDelay);
                } else if (this.restartAttempts >= this.maxRestartAttempts) {
                    this.logError('Max restart attempts reached. Mako server will not auto-restart.');
                    vscode.window.showErrorMessage(
                        'Mako WebDAV server failed to start after multiple attempts. Applications cannot be loaded to ESP32.',
                        'Show Logs'
                    ).then(selection => {
                        if (selection === 'Show Logs') {
                            this.outputChannel.show();
                        }
                    });
                }
            });

            // Handle process error
            this.makoProcess.on('error', (error) => {
                this.logError(`Failed to start Mako server: ${error.message}`);
                this.makoProcess = null;

                if (error.message.includes('ENOENT')) {
                    vscode.window.showErrorMessage(
                        'Mako executable not found. Please install Mako or update the path.',
                        'Show Logs'
                    ).then(selection => {
                        if (selection === 'Show Logs') {
                            this.outputChannel.show();
                        }
                    });
                }
            });

            // Give server time to start
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (this.makoProcess && !this.makoProcess.killed) {
                this.log('✓ Mako server started successfully');
                this.restartAttempts = 0;  // Reset counter on successful start
                vscode.window.showInformationMessage('Mako WebDAV server started');
                return true;
            }

            return false;

        } catch (error) {
            this.logError(`Error starting Mako server: ${error}`);
            return false;
        }
    }

    /**
     * Stop Mako server
     */
    public stop(): void {
        this.autoRestart = false;

        if (this.makoProcess) {
            this.log('Stopping Mako server...');
            this.makoProcess.kill('SIGTERM');
            
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (this.makoProcess && !this.makoProcess.killed) {
                    this.logError('Force killing Mako server');
                    this.makoProcess.kill('SIGKILL');
                }
            }, 5000);

            this.makoProcess = null;
            this.log('Mako server stopped');
        }
    }

    /**
     * Restart Mako server
     */
    public async restart(): Promise<boolean> {
        this.log('Restarting Mako server...');
        this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.start();
    }

    /**
     * Check if server is running
     */
    public isRunning(): boolean {
        return this.makoProcess !== null && !this.makoProcess.killed;
    }

    /**
     * Enable/disable auto-restart
     */
    public setAutoRestart(enabled: boolean): void {
        this.autoRestart = enabled;
        this.log(`Auto-restart ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Log message to output channel
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    /**
     * Log error message
     */
    private logError(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ERROR: ${message}`);
        console.error(`[MakoServerManager] ${message}`);
    }

    /**
     * Show output channel
     */
    public showOutput(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stop();
        this.outputChannel.dispose();
    }
}


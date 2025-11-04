import * as vscode from 'vscode';
import * as path from 'path';
import { XEdgeApp } from './types';
import { logger } from './logger';

/**
 * Watches for file changes in XEdge application directories
 */
export class FileWatcher {
    private watchers: vscode.FileSystemWatcher[] = [];
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private onChangeCallback: (app: XEdgeApp) => void;
    private apps: XEdgeApp[] = [];
    private debounceDelay: number = 500; // milliseconds

    constructor(onChangeCallback: (app: XEdgeApp) => void) {
        this.onChangeCallback = onChangeCallback;
    }

    /**
     * Start watching files for the given applications
     */
    public watch(apps: XEdgeApp[]): void {
        logger.info('Starting file watcher...');
        
        // Dispose existing watchers
        this.dispose();

        this.apps = apps;

        // Watch patterns: *.lua, .preload, .config
        const patterns = ['**/*.lua', '**/.preload', '**/.config'];
        const appsWithAutoReload = apps.filter(a => a.autoReload);
        
        logger.info(`Watching ${appsWithAutoReload.length} apps with auto-reload enabled`);

        for (const app of apps) {
            if (!app.autoReload) {
                logger.debug(`App "${app.name}" has auto-reload disabled, skipping`);
                continue;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                logger.warn('No workspace folder, cannot watch files');
                continue;
            }

            // Get absolute path
            let appPath = app.path;
            if (!path.isAbsolute(appPath)) {
                appPath = path.join(workspaceFolder.uri.fsPath, appPath);
            }

            logger.debug(`Setting up watchers for app "${app.name}" at: ${appPath}`);

            // Create watchers for each pattern in the app directory
            for (const pattern of patterns) {
                const globPattern = new vscode.RelativePattern(appPath, pattern);
                const watcher = vscode.workspace.createFileSystemWatcher(globPattern);

                // Handle file changes with debouncing
                watcher.onDidChange((uri) => this.handleFileChange(app, uri, 'changed'));
                watcher.onDidCreate((uri) => this.handleFileChange(app, uri, 'created'));
                watcher.onDidDelete((uri) => this.handleFileChange(app, uri, 'deleted'));

                this.watchers.push(watcher);
                logger.debug(`  Watching pattern: ${pattern}`);
            }
        }

        logger.info(`✓ File watcher started: ${this.watchers.length} watchers for ${appsWithAutoReload.length} apps`);
    }

    /**
     * Handle file change with debouncing
     */
    private handleFileChange(app: XEdgeApp, uri?: vscode.Uri, changeType?: string): void {
        const appKey = app.name;
        const filePath = uri?.fsPath || 'unknown';
        const fileName = path.basename(filePath);

        logger.logFile(changeType || 'changed', filePath, `in app "${app.name}"`);

        // Clear existing timer for this app
        const existingTimer = this.debounceTimers.get(appKey);
        if (existingTimer) {
            clearTimeout(existingTimer);
            logger.debug(`Debounce timer reset for "${app.name}"`);
        }

        // Set new timer
        const timer = setTimeout(() => {
            logger.info(`Debounce delay expired for "${app.name}", triggering reload`);
            this.onChangeCallback(app);
            this.debounceTimers.delete(appKey);
        }, this.debounceDelay);

        this.debounceTimers.set(appKey, timer);
        logger.debug(`Debounce timer set for "${app.name}" (${this.debounceDelay}ms)`);
    }

    /**
     * Get the app that contains the given file
     */
    public getAppForFile(filePath: string): XEdgeApp | undefined {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        for (const app of this.apps) {
            let appPath = app.path;
            if (!path.isAbsolute(appPath)) {
                appPath = path.join(workspaceFolder.uri.fsPath, appPath);
            }

            // Check if file is within app directory
            const relativePath = path.relative(appPath, filePath);
            if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
                return app;
            }
        }

        return undefined;
    }

    /**
     * Dispose all watchers
     */
    public dispose(): void {
        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Dispose all watchers
        for (const watcher of this.watchers) {
            watcher.dispose();
        }
        this.watchers = [];
    }
}


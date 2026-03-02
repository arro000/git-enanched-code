import * as vscode from 'vscode';

export type ActivationMode = 'auto' | 'manual';

export class ConfigManager {
    private static readonly SECTION = 'gitEnhanced';
    private static readonly ACTIVATION_MODE_KEY = 'activationMode';

    getActivationMode(): ActivationMode {
        const config = vscode.workspace.getConfiguration(ConfigManager.SECTION);
        const mode = config.get<string>(ConfigManager.ACTIVATION_MODE_KEY, 'auto');
        return mode === 'manual' ? 'manual' : 'auto';
    }

    isAutoMode(): boolean {
        return this.getActivationMode() === 'auto';
    }
}

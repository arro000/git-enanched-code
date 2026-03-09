import * as vscode from 'vscode';

export type OpenMode = 'automatic' | 'manual';

const CONFIG_SECTION = 'gitEnhanced';
const ONBOARDING_STATE_KEY = 'gitEnhanced.onboardingCompleted';

export class ConfigManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getOpenMode(): OpenMode {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<OpenMode>('openMode', 'automatic');
  }

  async setOpenMode(mode: OpenMode): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update('openMode', mode, vscode.ConfigurationTarget.Global);
  }

  shouldShowOnboarding(): boolean {
    const completed = this.context.globalState.get<boolean>(ONBOARDING_STATE_KEY, false);
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const showOnboarding = config.get<boolean>('showOnboarding', true);
    return !completed && showOnboarding;
  }

  async markOnboardingCompleted(): Promise<void> {
    await this.context.globalState.update(ONBOARDING_STATE_KEY, true);
  }

  async resetOnboarding(): Promise<void> {
    await this.context.globalState.update(ONBOARDING_STATE_KEY, false);
  }
}

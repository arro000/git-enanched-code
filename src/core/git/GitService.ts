import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as path from 'path';

export class GitService {
  private git: SimpleGit | null = null;
  private repoRoot: string | null = null;

  async initialize(workspacePath: string): Promise<void> {
    const options: Partial<SimpleGitOptions> = {
      baseDir: workspacePath,
      binary: 'git',
      maxConcurrentProcesses: 6,
    };
    this.git = simpleGit(options);
    this.repoRoot = await this.git.revparse(['--show-toplevel']);
    this.repoRoot = this.repoRoot.trim();
  }

  async stageFile(filePath: string): Promise<void> {
    if (!this.git) {
      throw new Error('GitService not initialized');
    }
    await this.git.add(filePath);
  }

  async getConflictedFiles(): Promise<string[]> {
    if (!this.git) {
      throw new Error('GitService not initialized');
    }
    const status = await this.git.status();
    return status.conflicted.map((f) => {
      return this.repoRoot ? path.join(this.repoRoot, f) : f;
    });
  }

  async getMergeBase(branch1: string, branch2: string): Promise<string> {
    if (!this.git) {
      throw new Error('GitService not initialized');
    }
    const result = await this.git.raw(['merge-base', branch1, branch2]);
    return result.trim();
  }

  getRepoRoot(): string | null {
    return this.repoRoot;
  }

  isInitialized(): boolean {
    return this.git !== null;
  }
}

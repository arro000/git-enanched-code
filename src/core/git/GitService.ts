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

  /**
   * Returns the content of a file at a specific git index stage.
   *  stage 1 = BASE (common ancestor)
   *  stage 2 = OURS  (HEAD)
   *  stage 3 = THEIRS (incoming branch)
   *
   * Throws if the service is not initialized or the stage doesn't exist for the file.
   */
  async getFileAtStage(absoluteFilePath: string, stage: 1 | 2 | 3): Promise<string> {
    if (!this.git || !this.repoRoot) {
      throw new Error('GitService not initialized');
    }
    const relativePath = path.relative(this.repoRoot, absoluteFilePath);
    // Git always uses forward slashes regardless of OS
    const gitPath = relativePath.split(path.sep).join('/');
    return this.git.show([`:${stage}:${gitPath}`]);
  }

  getRepoRoot(): string | null {
    return this.repoRoot;
  }

  isInitialized(): boolean {
    return this.git !== null;
  }
}

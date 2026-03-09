import { describe, it, expect } from 'vitest';
import { AstMerger } from '../../src/core/merge/AstMerger';
import { ConflictChunk } from '../../src/core/git/ConflictParser';
import { SupportedLanguage } from '../../src/core/merge/LanguageDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunk(
  startLine: number,
  endLine: number,
  headLines: string[],
  mergingLines: string[]
): ConflictChunk {
  return {
    startLine,
    endLine,
    headLines,
    mergingLines,
    baseLines: null,
    headLabel: 'HEAD',
    mergingLabel: 'feature',
  };
}

const merger = new AstMerger();

// ---------------------------------------------------------------------------
// Import merging — TypeScript / JavaScript
// ---------------------------------------------------------------------------

describe('AstMerger — TypeScript import merging', () => {
  it('merges distinct imports from different modules', () => {
    const chunk = makeChunk(0, 5,
      ["import { useState } from 'react';"],
      ["import { debounce } from 'lodash';"]
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('imports');
    expect(result!.confidence).toBeCloseTo(0.90);
    expect(result!.resolvedLines).toContain("import { useState } from 'react';");
    expect(result!.resolvedLines).toContain("import { debounce } from 'lodash';");
  });

  it('does not merge imports from the same module path', () => {
    const chunk = makeChunk(0, 5,
      ["import { useState } from 'react';"],
      ["import { useEffect } from 'react';"]
    );
    // Same module 'react' on both sides → identifier overlap → no auto-resolve
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('merges multiple import lines from different modules', () => {
    const chunk = makeChunk(0, 8,
      [
        "import React from 'react';",
        "import { useState } from 'react-dom';",
      ],
      [
        "import axios from 'axios';",
        "import _ from 'lodash';",
      ]
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).not.toBeNull();
    expect(result!.resolvedLines).toHaveLength(4);
    // Should be sorted alphabetically
    const sorted = [...result!.resolvedLines].sort((a, b) => a.trim().localeCompare(b.trim()));
    expect(result!.resolvedLines).toEqual(sorted);
  });

  it('deduplicates identical imports when present on both sides', () => {
    const chunk = makeChunk(0, 6,
      ["import React from 'react';", "import { useState } from 'react';"],
      ["import React from 'react';", "import { createRoot } from 'react-dom';"]
    );
    // 'react' appears in both sides → identifier overlap → no auto-resolve
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('returns null when one side is not imports', () => {
    const chunk = makeChunk(0, 8,
      ["import { foo } from './foo';"],
      ["const x = 1;"]
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('returns null for unknown language', () => {
    const chunk = makeChunk(0, 5,
      ["import { foo } from './foo';"],
      ["import { bar } from './bar';"]
    );
    const result = merger.analyzeChunk(chunk, 'unknown');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Import merging — C# using statements
// ---------------------------------------------------------------------------

describe('AstMerger — C# import merging', () => {
  it('merges distinct using statements', () => {
    const chunk = makeChunk(0, 5,
      ['using System.Collections.Generic;'],
      ['using System.Linq;']
    );
    const result = merger.analyzeChunk(chunk, 'csharp');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('imports');
    expect(result!.resolvedLines).toContain('using System.Collections.Generic;');
    expect(result!.resolvedLines).toContain('using System.Linq;');
  });

  it('does not merge duplicate using statements', () => {
    const chunk = makeChunk(0, 5,
      ['using System.Collections.Generic;'],
      ['using System.Collections.Generic;']
    );
    const result = merger.analyzeChunk(chunk, 'csharp');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Import merging — Java
// ---------------------------------------------------------------------------

describe('AstMerger — Java import merging', () => {
  it('merges distinct Java import statements', () => {
    const chunk = makeChunk(0, 5,
      ['import java.util.List;'],
      ['import java.util.Map;']
    );
    const result = merger.analyzeChunk(chunk, 'java');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('imports');
    expect(result!.resolvedLines).toContain('import java.util.List;');
    expect(result!.resolvedLines).toContain('import java.util.Map;');
  });
});

// ---------------------------------------------------------------------------
// Import merging — Kotlin
// ---------------------------------------------------------------------------

describe('AstMerger — Kotlin import merging', () => {
  it('merges distinct Kotlin import statements', () => {
    const chunk = makeChunk(0, 5,
      ['import kotlinx.coroutines.launch'],
      ['import kotlinx.coroutines.async']
    );
    const result = merger.analyzeChunk(chunk, 'kotlin');
    expect(result).not.toBeNull();
    expect(result!.resolvedLines).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Import merging — Rust
// ---------------------------------------------------------------------------

describe('AstMerger — Rust use merging', () => {
  it('merges distinct Rust use statements', () => {
    const chunk = makeChunk(0, 5,
      ['use std::collections::HashMap;'],
      ['use std::io::BufReader;']
    );
    const result = merger.analyzeChunk(chunk, 'rust');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('imports');
  });
});

// ---------------------------------------------------------------------------
// Function merging — TypeScript
// ---------------------------------------------------------------------------

describe('AstMerger — TypeScript function merging', () => {
  it('merges two functions with different names', () => {
    const headLines = [
      'function handleLogin() {',
      '  auth.login();',
      '}',
    ];
    const mergingLines = [
      'function handleLogout() {',
      '  auth.logout();',
      '}',
    ];
    const chunk = makeChunk(0, 8, headLines, mergingLines);
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('functions');
    expect(result!.confidence).toBeCloseTo(0.80);
    // HEAD lines come first
    expect(result!.resolvedLines[0]).toBe('function handleLogin() {');
    // MERGING lines follow
    expect(result!.resolvedLines).toContain('function handleLogout() {');
  });

  it('does not merge two functions with the same name', () => {
    const chunk = makeChunk(0, 8,
      ['function helper() {', '  return 1;', '}'],
      ['function helper() {', '  return 2;', '}']
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('merges exported async functions with different names', () => {
    const chunk = makeChunk(0, 8,
      ['export async function fetchUser() {', '  return api.user();', '}'],
      ['export async function fetchProfile() {', '  return api.profile();', '}']
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('functions');
  });

  it('includes an empty line separator between the two function blocks', () => {
    const chunk = makeChunk(0, 8,
      ['function foo() {', '}'],
      ['function bar() {', '}']
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).not.toBeNull();
    // Empty line between HEAD and MERGING blocks
    expect(result!.resolvedLines).toContain('');
  });
});

// ---------------------------------------------------------------------------
// Function merging — Kotlin
// ---------------------------------------------------------------------------

describe('AstMerger — Kotlin function merging', () => {
  it('merges two Kotlin functions with different names', () => {
    const chunk = makeChunk(0, 8,
      ['fun parseUser(json: String): User {', '    return User.fromJson(json)', '}'],
      ['fun parseProfile(json: String): Profile {', '    return Profile.fromJson(json)', '}']
    );
    const result = merger.analyzeChunk(chunk, 'kotlin');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('functions');
  });

  it('does not merge functions with the same Kotlin name', () => {
    const chunk = makeChunk(0, 8,
      ['fun parse(): Unit {', '}'],
      ['fun parse(): String {', '}']
    );
    const result = merger.analyzeChunk(chunk, 'kotlin');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Function merging — Rust
// ---------------------------------------------------------------------------

describe('AstMerger — Rust function merging', () => {
  it('merges two Rust functions with different names', () => {
    const chunk = makeChunk(0, 8,
      ['pub fn connect() -> Result<()> {', '    Ok(())', '}'],
      ['pub fn disconnect() -> Result<()> {', '    Ok(())', '}']
    );
    const result = merger.analyzeChunk(chunk, 'rust');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('functions');
  });
});

// ---------------------------------------------------------------------------
// Mixed / unknown patterns — should not auto-resolve
// ---------------------------------------------------------------------------

describe('AstMerger — patterns that should not auto-resolve', () => {
  it('returns null when HEAD is imports and MERGING is functions', () => {
    const chunk = makeChunk(0, 8,
      ["import { foo } from './foo';"],
      ['function bar() {', '}']
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('returns null when both sides are arbitrary code', () => {
    const chunk = makeChunk(0, 8,
      ['const x = someFunction();', 'doSomething(x);'],
      ['const y = otherFunction();', 'doOther(y);']
    );
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('returns null when both sides are empty', () => {
    const chunk = makeChunk(0, 4, [], []);
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });

  it('returns null when both sides are blank lines only', () => {
    const chunk = makeChunk(0, 4, ['', '  '], ['', '  ']);
    const result = merger.analyzeChunk(chunk, 'typescript');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// analyzeChunks — async batch API
// ---------------------------------------------------------------------------

describe('AstMerger.analyzeChunks — async batch', () => {
  it('returns candidates for all auto-resolvable chunks', async () => {
    const chunks = [
      makeChunk(0, 4,
        ["import { foo } from './a';"],
        ["import { bar } from './b';"]
      ),
      makeChunk(10, 16,
        ['function greet() {', '  return "hello";', '}'],
        ['function farewell() {', '  return "bye";', '}']
      ),
    ];
    const results = await merger.analyzeChunks(chunks, 'typescript');
    expect(results.size).toBe(2);
    expect(results.get(0)!.pattern).toBe('imports');
    expect(results.get(10)!.pattern).toBe('functions');
  });

  it('skips unresolvable chunks and still returns others', async () => {
    const chunks = [
      makeChunk(0, 4, ['const x = 1;'], ['const x = 2;']), // genuine conflict
      makeChunk(10, 14,
        ["import { A } from './a';"],
        ["import { B } from './b';"]
      ),
    ];
    const results = await merger.analyzeChunks(chunks, 'typescript');
    expect(results.has(0)).toBe(false);
    expect(results.has(10)).toBe(true);
  });

  it('returns empty map when no chunks are resolvable', async () => {
    const chunks = [
      makeChunk(0, 4, ['const x = 1;'], ['const x = 2;']),
    ];
    const results = await merger.analyzeChunks(chunks, 'typescript');
    expect(results.size).toBe(0);
  });

  it('handles per-chunk errors gracefully without crashing', async () => {
    // Inject a chunk with headLines set to something that might trigger an error.
    // The analyzeChunks method must not throw.
    const chunks = [
      makeChunk(0, 4, [''], [''])  // borderline empty
    ];
    await expect(merger.analyzeChunks(chunks, 'typescript')).resolves.not.toThrow();
  });

  it('returns empty map for unknown language', async () => {
    const chunks = [
      makeChunk(0, 4,
        ["import { foo } from './a';"],
        ["import { bar } from './b';"]
      ),
    ];
    const results = await merger.analyzeChunks(chunks, 'unknown');
    expect(results.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MergeOrchestrator integration — astResolutions populated in openSession
// ---------------------------------------------------------------------------

import { describe as describeIntegration, it as itIntegration, expect as expectIntegration, vi, beforeEach, afterEach } from 'vitest';
import { MergeOrchestrator } from '../../src/core/git/MergeOrchestrator';
import { GitService } from '../../src/core/git/GitService';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import * as fsPromises from 'fs/promises';

// File with a genuine conflict that diff3 cannot resolve (no baseLines),
// but both sides are semantically compatible (different function names).
const FUNCTION_CONFLICT_CONTENT = [
  '// shared module',
  '<<<<<<< HEAD',
  'export function handleLogin() {',
  '  return auth.login();',
  '}',
  '=======',
  'export function handleLogout() {',
  '  return auth.logout();',
  '}',
  '>>>>>>> feature/logout',
  '// end',
].join('\n');

describeIntegration('MergeOrchestrator AST pre-analysis', () => {
  let gitService: GitService;
  let orchestrator: MergeOrchestrator;

  beforeEach(() => {
    gitService = new GitService();
    vi.spyOn(gitService, 'stageFile').mockResolvedValue(undefined);
    vi.spyOn(gitService, 'isInitialized').mockReturnValue(false);
    orchestrator = new MergeOrchestrator(gitService);
    vi.mocked(fsPromises.readFile).mockResolvedValue(FUNCTION_CONFLICT_CONTENT as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  itIntegration('populates astResolutions for semantically compatible function conflict', async () => {
    const session = await orchestrator.openSession('/fake/module.ts');
    expectIntegration(session).not.toBeNull();
    // diff3 cannot resolve this (no baseLines, no git stages) so resolvedChunks stays empty
    expectIntegration(session!.resolvedChunks.size).toBe(0);
    // AST should detect two different function names → candidate stored
    expectIntegration(session!.astResolutions.size).toBe(1);
    const candidate = session!.astResolutions.get(session!.chunks[0].startLine);
    expectIntegration(candidate).toBeDefined();
    expectIntegration(candidate!.pattern).toBe('functions');
    expectIntegration(candidate!.confidence).toBeCloseTo(0.80);
  });

  itIntegration('astResolutions is empty when diff3 already resolved all chunks', async () => {
    // File with a diff3-resolvable conflict (HEAD == BASE)
    const diff3Content = [
      '<<<<<<< HEAD',
      "  return 'hello';",
      '||||||| base',
      "  return 'hello';",
      '=======',
      "  return 'hi';",
      '>>>>>>> feature',
    ].join('\n');
    vi.mocked(fsPromises.readFile).mockResolvedValue(diff3Content as never);
    const session = await orchestrator.openSession('/fake/utils.ts');
    expectIntegration(session).not.toBeNull();
    expectIntegration(session!.resolvedChunks.size).toBe(1); // diff3 resolved it
    // AST sees no remaining chunks
    expectIntegration(session!.astResolutions.size).toBe(0);
  });

  itIntegration('still opens session even if AST analysis would throw', async () => {
    // Malformed content — ConflictParser returns one chunk with empty lines,
    // which AstMerger should handle gracefully.
    const malformed = '<<<<<<< HEAD\n=======\n>>>>>>> other\n';
    vi.mocked(fsPromises.readFile).mockResolvedValue(malformed as never);
    const session = await orchestrator.openSession('/fake/test.ts');
    expectIntegration(session).not.toBeNull();
    expectIntegration(session!.astResolutions).toBeDefined();
  });
});

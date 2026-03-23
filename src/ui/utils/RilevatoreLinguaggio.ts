/**
 * Mappa delle estensioni file ai language ID di Monaco Editor.
 */
const mappaLinguaggi: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'py': 'python',
    'java': 'java',
    'cs': 'csharp',
    'kt': 'kotlin',
    'kts': 'kotlin',
    'rs': 'rust',
    'go': 'go',
    'json': 'json',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'md': 'markdown',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
    'sh': 'shell',
    'bash': 'shell',
    'vue': 'html',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'swift': 'swift',
    'r': 'r',
};

/**
 * Rileva il language ID di Monaco Editor dall'estensione del nome file.
 * Restituisce 'plaintext' per estensioni non riconosciute.
 */
export function rilevaLinguaggioDaNomeFile(fileName: string): string {
    const estensioneFile = fileName.split('.').pop()?.toLowerCase() || '';
    return mappaLinguaggi[estensioneFile] || 'plaintext';
}

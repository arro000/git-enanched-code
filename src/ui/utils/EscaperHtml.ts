/**
 * Escape di caratteri speciali HTML per prevenire XSS injection.
 */
export function escapaHtml(testo: string): string {
    return testo
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

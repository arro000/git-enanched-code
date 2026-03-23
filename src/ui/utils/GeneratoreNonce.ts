/**
 * Genera un nonce crittografico di 32 caratteri alfanumerici
 * per la Content Security Policy delle webview.
 */
export function generaNonce(): string {
    const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
    }
    return nonce;
}

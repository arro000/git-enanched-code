import * as vscode from 'vscode';

export interface RisultatoFallback {
    fallbackAttivato: boolean;
    motivoErrore: string;
}

export class FallbackService {
    /**
     * Handles a fallback to the native VS Code editor when Git Enhanced encounters an error.
     * Opens the file in the default text editor and notifies the user.
     * The original file with conflict markers is never modified.
     */
    async attivaFallbackPerDocumento(
        documentUri: vscode.Uri,
        errore: unknown
    ): Promise<RisultatoFallback> {
        const motivoErrore = errore instanceof Error ? errore.message : String(errore);

        // Notify the user about the fallback with the reason
        vscode.window.showWarningMessage(
            `Git Enhanced: Fallback to native editor activated. Reason: ${motivoErrore}`
        );

        // Open the file in the default VS Code text editor
        try {
            await vscode.commands.executeCommand(
                'vscode.openWith',
                documentUri,
                'default'
            );
        } catch {
            // If even the default editor fails, try a simple text open
            try {
                await vscode.window.showTextDocument(documentUri);
            } catch {
                // Last resort: at least the user was notified via the warning message above
            }
        }

        return {
            fallbackAttivato: true,
            motivoErrore,
        };
    }
}

# US-011: Complete Merge Confirmation Popup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a confirmation modal when "Complete Merge" is clicked with open conflicts, and proceed directly when none remain.

**Architecture:** Purely client-side change in the webview HTML string embedded in `MergeEditorProvider.ts`. A hidden modal overlay is added to the HTML body; the `completeMergeButton` click handler checks `contaConflittiAperti()` and either shows the modal (conflicts present) or sends `completaMerge` directly (no conflicts). No extension host round-trip is needed.

**Tech Stack:** TypeScript, Vitest, VS Code Webview API, vanilla JS inside an HTML template string.

---

## Chunk 1: Tests + Implementation

### Task 1: Write failing tests for US-011

**Files:**
- Modify: `test/unit/ui/MergeEditorProvider.test.ts` (append after line 989)

- [ ] **Step 1: Append the US-011 describe block to the test file**

Add this at the end of `test/unit/ui/MergeEditorProvider.test.ts`:

```typescript
describe('MergeEditorProvider — US-011: Popup conferma Complete Merge con conflitti aperti', () => {
    let pannelloWebview: ReturnType<typeof creaMockWebviewPanel>;
    let documento: MockDocument;

    beforeEach(() => {
        vi.clearAllMocks();
        pannelloWebview = creaMockWebviewPanel();
        documento = creaMockDocument();
        mockWorkspaceState.get.mockReturnValue(undefined);
    });

    async function inizializzaEditor(): Promise<void> {
        const provider = new (MergeEditorProvider as unknown as {
            new (context: vscode.ExtensionContext): MergeEditorProvider;
        })(mockContext as unknown as vscode.ExtensionContext);

        await provider.resolveCustomTextEditor(
            documento as unknown as vscode.TextDocument,
            pannelloWebview as unknown as vscode.WebviewPanel,
            {} as vscode.CancellationToken
        );
    }

    describe('AC1: popup appare con conflitti aperti', () => {
        it('the HTML contains a confirmation modal element', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="confirmModal"');
        });

        it('the modal contains the confirmation message with conflict count placeholder', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('conflitti irrisolti');
        });

        it('the modal contains a Conferma button', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="confirmModalOk"');
        });

        it('the modal contains an Annulla button', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('id="confirmModalCancel"');
        });

        it('the completeMergeButton click handler checks contaConflittiAperti before sending', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('contaConflittiAperti');
            // Handler should not unconditionally call postMessage
            const handlerSection = html.substring(
                html.indexOf('completeMergeButton'),
                html.indexOf('completeMergeButton') + 400
            );
            expect(handlerSection).toContain('contaConflittiAperti');
        });

        it('the modal is hidden by default via CSS display none', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // Modal starts hidden
            expect(html).toContain('#confirmModal');
            expect(html).toMatch(/#confirmModal[^}]*display:\s*none/);
        });

        it('clicking Conferma sends completaMerge to the extension host', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            expect(html).toContain('confirmModalOk');
            // The ok button handler posts completaMerge
            const okSection = html.substring(
                html.indexOf('confirmModalOk'),
                html.indexOf('confirmModalOk') + 300
            );
            expect(okSection).toContain('completaMerge');
        });
    });

    describe('AC2: nessun popup con zero conflitti aperti', () => {
        it('the click handler sends completaMerge directly when conflitti is 0', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // When aperti === 0, postMessage is called without showing modal
            const handlerSection = html.substring(
                html.indexOf('completeMergeButton'),
                html.indexOf('completeMergeButton') + 500
            );
            expect(handlerSection).toContain('aperti === 0');
        });
    });

    describe('AC3: Annulla chiude il popup senza modificare lo stato', () => {
        it('clicking Annulla hides the modal', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            const cancelSection = html.substring(
                html.indexOf('confirmModalCancel'),
                html.indexOf('confirmModalCancel') + 200
            );
            expect(cancelSection).toContain('none');
        });

        it('the Annulla handler does not post any message to the extension', async () => {
            await inizializzaEditor();
            const html = pannelloWebview.webview.html;
            // Cancel section should close modal but NOT contain postMessage
            const cancelIdx = html.indexOf('confirmModalCancel');
            const cancelSection = html.substring(cancelIdx, cancelIdx + 300);
            expect(cancelSection).not.toContain('postMessage');
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sil/Gilde/SignoreDegliAgenti/git-enanched-code && npm test -- --reporter=verbose 2>&1 | tail -40
```

Expected: ~10 tests fail with assertion errors (modal elements not yet present in HTML).

---

### Task 2: Implement the confirmation modal in MergeEditorProvider.ts

**Files:**
- Modify: `src/ui/MergeEditorProvider.ts`

There are two changes needed in the HTML template string:

**Change A — Add modal CSS** (in the `<style>` block, before the closing `</style>`):

Find the closing `</style>` tag in the HTML template string and add before it:

```css
            #confirmModal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 999; align-items: center; justify-content: center; }
            #confirmModal.visible { display: flex; }
            .confirm-modal-box { background: var(--sidebar-bg, #252526); border: 1px solid var(--border, #3c3c3c); border-radius: 6px; padding: 24px 28px; max-width: 380px; width: 90%; }
            .confirm-modal-box p { margin: 0 0 20px; color: var(--foreground, #ccc); font-size: 13px; line-height: 1.5; }
            .confirm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
            .confirm-modal-actions button { padding: 5px 14px; border: none; border-radius: 3px; font-size: 12px; cursor: pointer; }
            #confirmModalOk { background: var(--btn-primary-bg, #0e639c); color: #fff; }
            #confirmModalOk:hover { background: var(--btn-primary-hover, #1177bb); }
            #confirmModalCancel { background: var(--btn-secondary-bg, #3a3d41); color: var(--foreground, #ccc); }
            #confirmModalCancel:hover { background: #45494e; }
```

**Change B — Add modal HTML** (in the `<body>`, just before `</body>`):

Find the closing `</body>` tag and add before it:

```html
        <div id="confirmModal">
            <div class="confirm-modal-box">
                <p id="confirmModalMsg">Ci sono ancora <span id="confirmModalCount">0</span> conflitti irrisolti. Vuoi procedere comunque?</p>
                <div class="confirm-modal-actions">
                    <button id="confirmModalCancel">Annulla</button>
                    <button id="confirmModalOk">Conferma</button>
                </div>
            </div>
        </div>
```

**Change C — Replace the completeMergeButton click handler** (around line 770):

Replace:
```javascript
            document.getElementById('completeMergeButton').addEventListener('click', function() {
                vscode.postMessage({ command: 'completaMerge' });
            });
```

With:
```javascript
            document.getElementById('completeMergeButton').addEventListener('click', function() {
                var aperti = contaConflittiAperti();
                if (aperti === 0) {
                    vscode.postMessage({ command: 'completaMerge' });
                } else {
                    document.getElementById('confirmModalCount').textContent = aperti.toString();
                    document.getElementById('confirmModal').classList.add('visible');
                }
            });
            document.getElementById('confirmModalOk').addEventListener('click', function() {
                document.getElementById('confirmModal').classList.remove('visible');
                vscode.postMessage({ command: 'completaMerge' });
            });
            document.getElementById('confirmModalCancel').addEventListener('click', function() {
                document.getElementById('confirmModal').classList.remove('visible');
            });
```

- [ ] **Step 3: Apply Change A (modal CSS)**

In `src/ui/MergeEditorProvider.ts`, find the closing `</style>` tag in the HTML template and insert the modal CSS above it.

- [ ] **Step 4: Apply Change B (modal HTML)**

In `src/ui/MergeEditorProvider.ts`, find `</body>` in the HTML template and insert the modal HTML above it.

- [ ] **Step 5: Apply Change C (button handler)**

In `src/ui/MergeEditorProvider.ts`, replace the `completeMergeButton` addEventListener block (lines ~770-772) with the new handler that includes modal logic.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd /Users/sil/Gilde/SignoreDegliAgenti/git-enanched-code && npm test -- --reporter=verbose 2>&1 | tail -50
```

Expected: all tests pass, including the new US-011 suite.

- [ ] **Step 7: Run TypeScript type-check**

```bash
cd /Users/sil/Gilde/SignoreDegliAgenti/git-enanched-code && npm run compile 2>&1
```

Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/sil/Gilde/SignoreDegliAgenti/git-enanched-code && git add src/ui/MergeEditorProvider.ts test/unit/ui/MergeEditorProvider.test.ts && git commit -m "feat: implement US-011 confirmation popup on Complete Merge with open conflicts"
```

---

## AC Verification Checklist

- [ ] AC-01: Modal with message "Ci sono ancora X conflitti irrisolti. Vuoi procedere comunque?" + Conferma/Annulla ✅ (verified by tests: modal element, message text, both buttons present)
- [ ] AC-02: Zero conflicts → direct completaMerge without popup ✅ (verified by test: `aperti === 0` branch)
- [ ] AC-03: Annulla hides modal, no state change ✅ (verified by tests: display none, no postMessage)

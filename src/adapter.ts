import * as vscode from 'vscode';
import { EditorAdapter } from '@lex/shared';

export class VSCodeEditorAdapter implements EditorAdapter {
    constructor(private editor: vscode.TextEditor) {}

    async insertText(text: string): Promise<void> {
        await this.editor.edit(editBuilder => {
            editBuilder.insert(this.editor.selection.active, text);
        });
    }
}

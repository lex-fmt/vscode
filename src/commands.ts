/**
 * Import/Export commands for converting between Lex and other formats.
 * All conversions go through the LSP using lex.export and lex.import commands.
 * See README.lex "Import & Export Commands" section for full documentation.
 */
import * as vscode from 'vscode'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { ExecuteCommandRequest, LanguageClient } from 'vscode-languageclient/node.js'

function debugLog(line: string): void {
  if (process.env.LEX_LOG_TO_STDERR !== '1') return
  const file = process.env.LEX_LOG_FILE ?? '/tmp/lex-vscode-test.log'
  try {
    appendFileSync(file, `[lex/extract] ${line}\n`)
  } catch {
    // ignore
  }
}
import type {
  Location as LspLocation,
  WorkspaceEdit as LspWorkspaceEdit
} from 'vscode-languageserver-types'

async function openConvertedDocument(content: string, languageId: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: languageId
  })
  await vscode.window.showTextDocument(doc)
}

async function getReadyClient(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<LanguageClient> {
  await waitForClientReady()
  const client = getClient()
  if (!client) {
    throw new Error('Lex language server is not running.')
  }
  return client
}

async function exportViaLsp(
  format: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>,
  outputPath?: string
): Promise<string> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    throw new Error('No active editor with content to export.')
  }

  if (editor.document.languageId !== 'lex') {
    throw new Error(`Export to ${format} is only available for .lex files.`)
  }

  const client = await getReadyClient(getClient, waitForClientReady)
  const content = editor.document.getText()
  const sourceUri = editor.document.uri.toString()

  const args = outputPath ? [format, content, sourceUri, outputPath] : [format, content, sourceUri]

  const result = (await client.sendRequest(ExecuteCommandRequest.type, {
    command: 'lex.export',
    arguments: args
  })) as unknown

  if (typeof result !== 'string') {
    throw new Error('Export failed: unexpected response from language server.')
  }

  return result
}

async function importViaLsp(
  format: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<string> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    throw new Error('No active editor with content to import.')
  }

  const client = await getReadyClient(getClient, waitForClientReady)
  const content = editor.document.getText()

  const result = (await client.sendRequest(ExecuteCommandRequest.type, {
    command: 'lex.import',
    arguments: [format, content]
  })) as unknown

  if (typeof result !== 'string') {
    throw new Error('Import failed: unexpected response from language server.')
  }

  return result
}

function createExportCommand(
  format: string,
  languageId: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): () => Promise<void> {
  return async () => {
    try {
      const result = await exportViaLsp(format, getClient, waitForClientReady)
      await openConvertedDocument(result, languageId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`Export failed: ${message}`)
    }
  }
}

function createExportToPdfCommand(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor with content to export.')
      return
    }

    if (editor.document.languageId !== 'lex') {
      vscode.window.showErrorMessage('Export to PDF is only available for .lex files.')
      return
    }

    // Suggest a default filename based on the source file
    const sourceUri = editor.document.uri
    const sourceName = sourceUri.path.split('/').pop() || 'document'
    const defaultName = sourceName.replace(/\.lex$/, '.pdf')

    // Show save dialog
    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(join(sourceUri.fsPath, '..', defaultName)),
      filters: { 'PDF Documents': ['pdf'] },
      title: 'Export to PDF'
    })

    if (!saveUri) {
      return // User cancelled
    }

    try {
      const outputPath = await exportViaLsp('pdf', getClient, waitForClientReady, saveUri.fsPath)
      vscode.window.showInformationMessage(`PDF exported to ${outputPath}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`Export failed: ${message}`)
    }
  }
}

interface FormatDescriptor {
  name: string
  description: string
  supportsParsing: boolean
  supportsSerialization: boolean
  fileExtensions: string[]
}

/**
 * Cache the LSP's format registry after the first query. Formats are built
 * into the server binary; they don't change at runtime, so one lookup per
 * session is enough.
 */
let formatsCache: FormatDescriptor[] | undefined

async function listFormats(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<FormatDescriptor[]> {
  if (formatsCache) {
    return formatsCache
  }
  const client = await getReadyClient(getClient, waitForClientReady)
  const result = (await client.sendRequest(ExecuteCommandRequest.type, {
    command: 'lex.formats.list',
    arguments: []
  })) as FormatDescriptor[] | null
  if (Array.isArray(result)) {
    // Only persist the cache on a valid response. If the server returned
    // `null` or some unexpected payload — a transient error, for example —
    // leave `formatsCache` unset so a later call can retry.
    formatsCache = result
    return formatsCache
  }
  return []
}

/**
 * Languages a VS Code document can be imported *from* into Lex. Derived from
 * the LSP's format registry: everything that supports parsing, minus Lex
 * itself (importing Lex into Lex is a no-op). The mapping is
 * `vscode-languageId -> lex-format-name`; for current formats they coincide.
 */
async function convertibleLanguages(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<Map<string, string>> {
  const formats = await listFormats(getClient, waitForClientReady)
  const map = new Map<string, string>()
  for (const format of formats) {
    if (!format.supportsParsing || format.name === 'lex') {
      continue
    }
    map.set(format.name, format.name)
  }
  return map
}

function createConvertToLexCommand(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): () => Promise<void> {
  return async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
      vscode.window.showErrorMessage('No active editor with content to convert.')
      return
    }

    const sources = await convertibleLanguages(getClient, waitForClientReady)
    const format = sources.get(editor.document.languageId)
    if (!format) {
      const supported = Array.from(sources.keys()).join(', ') || '(none available)'
      vscode.window.showErrorMessage(
        `Convert to Lex is available for: ${supported}. Current file is ${editor.document.languageId}.`
      )
      return
    }

    // Determine default output path: same directory, same base name, .lex extension
    const sourceUri = editor.document.uri
    const sourceName = sourceUri.path.split('/').pop() || 'document'
    const defaultName = sourceName.replace(/\.[^.]+$/, '.lex')

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(join(sourceUri.fsPath, '..', defaultName)),
      filters: { 'Lex Documents': ['lex'] },
      title: 'Convert to Lex'
    })

    if (!saveUri) {
      return // User cancelled
    }

    try {
      const result = await importViaLsp(format, getClient, waitForClientReady)
      await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(result))
      const doc = await vscode.workspace.openTextDocument(saveUri)
      await vscode.window.showTextDocument(doc)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`Convert to Lex failed: ${message}`)
    }
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'lex.exportToMarkdown',
      createExportCommand('markdown', 'markdown', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand(
      'lex.exportToHtml',
      createExportCommand('html', 'html', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand(
      'lex.exportToPdf',
      createExportToPdfCommand(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand(
      'lex.convertToLex',
      createConvertToLexCommand(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.insertAssetReference', (uri?: vscode.Uri) =>
      insertAssetReference(uri)
    ),
    vscode.commands.registerCommand('lex.insertVerbatimBlock', (uri?: vscode.Uri) =>
      insertVerbatimBlock(getClient, waitForClientReady, uri)
    ),
    vscode.commands.registerCommand('lex.reorderFootnotes', () =>
      reorderFootnotes(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.goToNextAnnotation', () =>
      navigateAnnotation('lex.next_annotation', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.goToPreviousAnnotation', () =>
      navigateAnnotation('lex.previous_annotation', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.resolveAnnotation', () =>
      applyAnnotationEditCommand('lex.resolve_annotation', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.toggleAnnotationResolution', () =>
      applyAnnotationEditCommand('lex.toggle_annotations', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.formatTable', () =>
      formatTableAtCursor(getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.table.nextCell', () =>
      navigateTableCell('next', getClient, waitForClientReady)
    ),
    vscode.commands.registerCommand('lex.table.previousCell', () =>
      navigateTableCell('previous', getClient, waitForClientReady)
    ),
    // Editor-facing UI command. Distinct from the LSP server's
    // `lex.extractToInclude` workspace command: vscode-languageclient
    // auto-registers a proxy `vscode.commands` entry for each
    // server-advertised command, so reusing that name here would throw
    // "command already exists" at activation and break server boot.
    // Same naming convention as `lex.goToNextAnnotation` ↔ `lex.next_annotation`.
    vscode.commands.registerCommand('lex.extractSelectionToInclude', () =>
      extractToInclude(getClient, waitForClientReady)
    )
  )
}

import { commands } from '@lex/shared'
import { VSCodeEditorAdapter } from './adapter.js'
import { dirname, relative } from 'node:path'

async function insertAssetReference(providedUri?: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.')
    return
  }

  const fileUri = providedUri ?? (await pickWorkspaceFile('Select asset to insert'))
  if (!fileUri) {
    return
  }

  const docPath = editor.document.uri.fsPath
  const assetPath = fileUri.fsPath
  const relativePath = relative(dirname(docPath), assetPath)

  const adapter = new VSCodeEditorAdapter(editor)
  await commands.InsertAssetCommand.execute(adapter, {
    path: relativePath
  })
}

async function insertVerbatimBlock(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>,
  providedUri?: vscode.Uri
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.')
    return
  }

  const fileUri = providedUri ?? (await pickWorkspaceFile('Select file to embed as verbatim block'))
  if (!fileUri) {
    return
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const insertionPosition = editor.selection.active
    const protocolPosition = client.code2ProtocolConverter.asPosition(insertionPosition)
    const result = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: 'lex.insert_verbatim',
      arguments: [editor.document.uri.toString(), protocolPosition, fileUri.fsPath]
    })) as { text: string; cursorOffset: number } | null

    if (!result) {
      return
    }

    // Anchor the insertion to a byte offset so we can place the cursor
    // at `insertionOffset + cursorOffset` after the edit, which is what
    // the server's snippet builder expects (the caret lands just past
    // the initial indent, so the user can edit the subject line first).
    const insertionOffset = editor.document.offsetAt(insertionPosition)
    const applied = await editor.edit((edit) => {
      edit.insert(insertionPosition, result.text)
    })
    if (applied && Number.isFinite(result.cursorOffset)) {
      const targetOffset = insertionOffset + Math.max(0, Math.floor(result.cursorOffset))
      const newPos = editor.document.positionAt(targetOffset)
      editor.selection = new vscode.Selection(newPos, newPos)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    vscode.window.showErrorMessage(`Insert verbatim block failed: ${message}`)
  }
}

async function reorderFootnotes(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'lex') {
    vscode.window.showErrorMessage('Reorder Footnotes is only available for .lex files.')
    return
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const original = editor.document.getText()
    const result = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: 'lex.footnotes.reorder',
      arguments: [original]
    })) as unknown

    if (typeof result !== 'string' || result === original) {
      return
    }

    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      editor.document.positionAt(original.length)
    )
    await editor.edit((edit) => edit.replace(fullRange, result))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    vscode.window.showErrorMessage(`Reorder Footnotes failed: ${message}`)
  }
}

async function navigateAnnotation(
  lspCommand: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.')
    return
  }

  if (editor.document.languageId !== 'lex') {
    vscode.window.showErrorMessage('Annotation navigation works only inside Lex documents.')
    return
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const protocolPosition = client.code2ProtocolConverter.asPosition(editor.selection.active)
    const response = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: lspCommand,
      arguments: [editor.document.uri.toString(), protocolPosition]
    })) as unknown

    if (!response) {
      vscode.window.showInformationMessage('No annotations were found in this document.')
      return
    }

    const targetLocation = client.protocol2CodeConverter.asLocation(response as LspLocation)
    const targetDocument = await vscode.workspace.openTextDocument(targetLocation.uri)
    const targetEditor = await vscode.window.showTextDocument(targetDocument)
    const targetPosition = targetLocation.range.start
    targetEditor.selection = new vscode.Selection(targetPosition, targetPosition)
    targetEditor.revealRange(targetLocation.range, vscode.TextEditorRevealType.InCenter)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Failed to navigate annotations: ${message}`)
  }
}

async function extractToInclude(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.')
    return
  }
  if (editor.document.languageId !== 'lex') {
    vscode.window.showErrorMessage('Extract-to-include is only available for .lex files.')
    return
  }

  const selection = editor.selection
  if (selection.isEmpty) {
    vscode.window.showErrorMessage('Select some text to extract into a new include file.')
    return
  }

  const src = await vscode.window.showInputBox({
    title: 'Extract selection to include',
    prompt: 'Path for the new include file (relative to the includes root)',
    placeHolder: 'e.g. chapters/intro.lex',
    ignoreFocusOut: true
  })
  if (!src) {
    return // user cancelled
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const protocolRange = client.code2ProtocolConverter.asRange(selection)
    const response = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: 'lex.extractToInclude',
      arguments: [editor.document.uri.toString(), protocolRange, src]
    })) as unknown

    debugLog('LSP response: ' + JSON.stringify(response))

    if (!response) {
      vscode.window.showErrorMessage('Extract returned an empty response.')
      return
    }

    // vscode.workspace.applyEdit reports success on multi-op edits even
    // when the TextDocumentEdit targeted at a freshly-created file
    // silently no-ops (the URI isn't loaded as a TextDocument so the
    // edit has nowhere to land). Split the workspace edit by hand: for
    // each `CreateFile` op, write its paired content edit via
    // `vscode.workspace.fs.writeFile` so the new file actually carries
    // the extracted text; apply remaining edits (the host-side
    // selection replacement) via the standard `applyEdit` path.
    await applyExtractWorkspaceEdit(response, editor, client)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Extract to include failed: ${message}`)
  }
}

async function applyExtractWorkspaceEdit(
  edit: LspWorkspaceEdit,
  editor: vscode.TextEditor,
  client: LanguageClient
): Promise<void> {
  const ops = edit.documentChanges ?? []
  // First pass: handle every CreateFile op + its paired TextDocumentEdit
  // (content for the new file) via direct fs writes.
  const createdUris = new Set<string>()
  for (const op of ops) {
    if ('kind' in op && op.kind === 'create') {
      createdUris.add(op.uri)
    }
  }
  for (const op of ops) {
    if ('textDocument' in op && createdUris.has(op.textDocument.uri)) {
      const newText = op.edits.map((e) => ('newText' in e ? e.newText : '')).join('')
      const targetUri = vscode.Uri.parse(op.textDocument.uri)
      await vscode.workspace.fs.writeFile(targetUri, new TextEncoder().encode(newText))
      debugLog('wrote new file via fs: ' + op.textDocument.uri)
    }
  }
  // Second pass: build a WorkspaceEdit containing only the edits that
  // target *existing* documents (the host file). Skip CreateFile ops
  // and skip the content edits we already handled.
  const remaining: LspWorkspaceEdit = {
    ...edit,
    documentChanges: ops.filter((op) => {
      if ('kind' in op) return false // skip resource ops (already handled)
      return !createdUris.has(op.textDocument.uri)
    })
  }
  void editor
  const workspaceEdit = await client.protocol2CodeConverter.asWorkspaceEdit(remaining)
  if (!workspaceEdit) {
    throw new Error('Language server returned an invalid workspace edit.')
  }
  const applied = await vscode.workspace.applyEdit(workspaceEdit)
  debugLog('applyEdit returned: ' + applied)
  if (!applied) {
    throw new Error('Failed to apply workspace edit.')
  }
}

async function applyAnnotationEditCommand(
  lspCommand: string,
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showErrorMessage('Open a Lex document before running this command.')
    return
  }

  if (editor.document.languageId !== 'lex') {
    vscode.window.showErrorMessage('Annotation commands are only available for .lex files.')
    return
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const protocolPosition = client.code2ProtocolConverter.asPosition(editor.selection.active)
    const response = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: lspCommand,
      arguments: [editor.document.uri.toString(), protocolPosition]
    })) as unknown

    if (!response) {
      vscode.window.showInformationMessage('No annotation was resolved at the current position.')
      return
    }

    const workspaceEdit = await client.protocol2CodeConverter.asWorkspaceEdit(
      response as LspWorkspaceEdit
    )
    if (!workspaceEdit) {
      throw new Error('Language server returned an invalid workspace edit.')
    }

    const applied = await vscode.workspace.applyEdit(workspaceEdit)
    if (!applied) {
      throw new Error('Failed to apply workspace edit.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Failed to update annotation: ${message}`)
  }
}

async function formatTableAtCursor(
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'lex') {
    return
  }

  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const content = editor.document.getText()
    const position = editor.selection.active

    const result = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: 'lex.table.format',
      arguments: [content, position.line, position.character]
    })) as { start: number; end: number; newText: string } | null

    if (!result) {
      vscode.window.showInformationMessage('No table found at cursor position.')
      return
    }

    // Convert byte offsets to VS Code positions
    const startPos = editor.document.positionAt(result.start)
    const endPos = editor.document.positionAt(result.end)
    const range = new vscode.Range(startPos, endPos)

    await editor.edit((editBuilder) => {
      editBuilder.replace(range, result.newText)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Format table failed: ${message}`)
  }
}

interface TableNavOutcome {
  inTable: boolean
  position: { line: number; column: number } | null
}

async function navigateTableCell(
  direction: 'next' | 'previous',
  getClient: () => LanguageClient | undefined,
  waitForClientReady: () => Promise<void>
): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'lex') {
    return
  }

  const lspCommand = direction === 'next' ? 'lex.table.next_cell' : 'lex.table.previous_cell'
  const fallthroughCommand = direction === 'next' ? 'tab' : 'outdent'

  let outcome: TableNavOutcome | null = null
  try {
    const client = await getReadyClient(getClient, waitForClientReady)
    const position = editor.selection.active
    outcome = (await client.sendRequest(ExecuteCommandRequest.type, {
      command: lspCommand,
      arguments: [editor.document.getText(), position.line, position.character]
    })) as TableNavOutcome | null
  } catch {
    // If the LSP is unreachable, fall back to the editor's default Tab
    // behaviour rather than swallowing the keypress.
    await vscode.commands.executeCommand(fallthroughCommand)
    return
  }

  if (!outcome || !outcome.inTable) {
    // Cursor is not on a pipe row — defer to the editor's default.
    await vscode.commands.executeCommand(fallthroughCommand)
    return
  }

  if (!outcome.position) {
    // On a pipe row but no valid move (table edge / malformed row).
    return
  }

  const newPos = new vscode.Position(outcome.position.line, outcome.position.column)
  editor.selection = new vscode.Selection(newPos, newPos)
}

async function pickWorkspaceFile(title: string): Promise<vscode.Uri | undefined> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
  const selection = await vscode.window.showOpenDialog({
    title,
    canSelectMany: false,
    canSelectFolders: false,
    canSelectFiles: true,
    defaultUri: workspaceRoot,
    openLabel: 'Select'
  })

  return selection?.[0]
}

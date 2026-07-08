import * as vscode from 'vscode'
import type { LanguageClient } from 'vscode-languageclient/node.js'
import {
  formatPromptDetail,
  formatPromptMessage,
  type TrustRequestParams,
  type TrustResponse
} from './trustPromptFormat.js'

/**
 * `lex/trustRequest` — server→client custom request. The LSP fires this
 * during extension boot when a subprocess handler hasn't been pinned in
 * `<workspace>/.lex/trust.json`. The user's reply is fed back into the
 * trust gate, which pins it for subsequent sessions.
 *
 * Wire shape mirrors `crates/lex-lsp/src/trust_prompt.rs` in lex-fmt/lex.
 */
const TRUST_REQUEST_METHOD = 'lex/trustRequest'

/**
 * Register the `lex/trustRequest` handler against an already-started
 * LanguageClient. Must be called after `client.start()`.
 */
export function registerTrustPrompt(client: LanguageClient): vscode.Disposable {
  return client.onRequest(
    TRUST_REQUEST_METHOD,
    async (params: TrustRequestParams): Promise<TrustResponse> => {
      const message = formatPromptMessage(params)
      const detail = formatPromptDetail(params)

      // Modal so the user can't miss the prompt — extension trust is a
      // security decision, not a casual notification. The two action
      // buttons map to the two trust outcomes; dismissing the modal
      // (Esc, click-outside) returns undefined, which we treat as
      // denied so a closed prompt fails closed.
      const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true, detail },
        'Trust',
        'Deny'
      )

      if (choice === 'Trust') {
        return { decision: 'trusted' }
      }
      return {
        decision: 'denied',
        reason:
          choice === 'Deny'
            ? `User denied trust for namespace \`${params.namespace}\` in this workspace.`
            : `Trust prompt for namespace \`${params.namespace}\` was dismissed without a decision.`
      }
    }
  )
}

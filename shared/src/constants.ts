import lexDeps from '../lex-deps.json' with { type: 'json' };

// Pinned lexd-lsp version - binaries downloaded from https://github.com/lex-fmt/lex/releases
export const LEX_LSP_VERSION = lexDeps['lexd-lsp'];
export const LEX_LSP_REPO = lexDeps['lexd-lsp-repo'];

export const TOKEN_TYPES = [
    "DocumentTitle",
    "SessionMarker",
    "SessionTitleText",
    "DefinitionSubject",
    "DefinitionContent",
    "ListMarker",
    "ListItemText",
    "AnnotationLabel",
    "AnnotationParameter",
    "AnnotationContent",
    "InlineStrong",
    "InlineEmphasis",
    "InlineCode",
    "InlineMath",
    "Reference",
    "ReferenceCitation",
    "ReferenceFootnote",
    "VerbatimSubject",
    "VerbatimLanguage",
    "VerbatimAttribute",
    "VerbatimContent",
    "InlineMarker_strong_start",
    "InlineMarker_strong_end",
    "InlineMarker_emphasis_start",
    "InlineMarker_emphasis_end",
    "InlineMarker_code_start",
    "InlineMarker_code_end",
    "InlineMarker_math_start",
    "InlineMarker_math_end",
    "InlineMarker_ref_start",
    "InlineMarker_ref_end",
    "ReferenceAnnotation"
];

export const TOKEN_MODIFIERS: string[] = [];

export const LEGEND = {
    tokenTypes: TOKEN_TYPES,
    tokenModifiers: TOKEN_MODIFIERS
};

export const FORMAT_EXTENSIONS: Record<string, string> = {
  lex: '.lex',
  markdown: '.md',
  html: '.html'
};

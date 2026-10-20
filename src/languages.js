/**
 * Extension -> language mapping.
 *
 * Deliberately a plain lookup table instead of a dependency on linguist or a
 * file-content classifier: gitography must stay installable with `npx` and
 * work with zero network access.
 */

const EXTENSION_MAP = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.d.ts': 'TypeScript',
  '.py': 'Python',
  '.pyi': 'Python',
  '.pyw': 'Python',
  '.rb': 'Ruby',
  '.rake': 'Ruby',
  '.gemspec': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.scala': 'Scala',
  '.sc': 'Scala',
  '.swift': 'Swift',
  '.m': 'Objective-C',
  '.mm': 'Objective-C',
  '.c': 'C',
  '.h': 'C',
  '.cc': 'C++',
  '.cpp': 'C++',
  '.cxx': 'C++',
  '.hpp': 'C++',
  '.hh': 'C++',
  '.hxx': 'C++',
  '.cs': 'C#',
  '.fs': 'F#',
  '.fsx': 'F#',
  '.vb': 'Visual Basic',
  '.php': 'PHP',
  '.pl': 'Perl',
  '.pm': 'Perl',
  '.lua': 'Lua',
  '.r': 'R',
  '.jl': 'Julia',
  '.dart': 'Dart',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hrl': 'Erlang',
  '.hs': 'Haskell',
  '.clj': 'Clojure',
  '.cljs': 'Clojure',
  '.elm': 'Elm',
  '.zig': 'Zig',
  '.nim': 'Nim',
  '.cr': 'Crystal',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.fish': 'Shell',
  '.ps1': 'PowerShell',
  '.psm1': 'PowerShell',
  '.bat': 'Batchfile',
  '.cmd': 'Batchfile',
  '.sql': 'SQL',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.xhtml': 'HTML',
  '.ejs': 'HTML',
  '.hbs': 'Handlebars',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.astro': 'Astro',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.styl': 'Stylus',
  '.json': 'JSON',
  '.json5': 'JSON',
  '.jsonc': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.ini': 'INI',
  '.cfg': 'INI',
  '.env': 'Dotenv',
  '.xml': 'XML',
  '.svg': 'SVG',
  '.md': 'Markdown',
  '.markdown': 'Markdown',
  '.mdx': 'MDX',
  '.rst': 'reStructuredText',
  '.txt': 'Text',
  '.tex': 'TeX',
  '.proto': 'Protocol Buffers',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.tf': 'Terraform',
  '.dockerfile': 'Dockerfile',
  '.makefile': 'Makefile',
  '.cmake': 'CMake',
  '.gradle': 'Gradle',
  '.sln': 'Visual Studio Solution',
  '.csproj': 'MSBuild',
  '.vbproj': 'MSBuild',
  '.ipynb': 'Jupyter Notebook',
  '.rkt': 'Racket',
  '.groovy': 'Groovy',
  '.purs': 'PureScript',
  '.sol': 'Solidity',
  '.asm': 'Assembly',
  '.s': 'Assembly',
  '.wasm': 'WebAssembly',
  '.wat': 'WebAssembly',
  '.ml': 'OCaml',
  '.mli': 'OCaml',
  '.v': 'V',
  '.pde': 'Processing',
  '.pug': 'Pug',
  '.haml': 'Haml',
  '.slim': 'Slim',
  '.coffee': 'CoffeeScript',
  '.lock': 'Lockfile',
  '.gitignore': 'Git Config',
  '.gitattributes': 'Git Config',
  '.editorconfig': 'Editor Config',
  '.gitmodules': 'Git Config',
  '.lockfile': 'Lockfile',
  '.diff': 'Diff',
  '.patch': 'Diff',
};

/** Files with no extension but a well known language. */
const FILENAME_MAP = {
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  gnumakefile: 'Makefile',
  cmakelists: 'CMake',
  'cmakelists.txt': 'CMake',
  'gemfile.lock': 'Lockfile',
  'package-lock.json': 'Lockfile',
  'yarn.lock': 'Lockfile',
  'pnpm-lock.yaml': 'Lockfile',
  rakefile: 'Ruby',
  gemfile: 'Ruby',
  procfile: 'Procfile',
  jenkinsfile: 'Groovy',
  vagrantfile: 'Ruby',
  brewfile: 'Ruby',
  podfile: 'Ruby',
  license: 'Text',
  notice: 'Text',
  authors: 'Text',
  changelog: 'Markdown',
  readme: 'Markdown',
  '.bashrc': 'Shell',
  '.zshrc': 'Shell',
  '.bash_profile': 'Shell',
  '.profile': 'Shell',
  '.npmrc': 'INI',
  '.nvmrc': 'INI',
};

/** Extensions we consider binary/noise for the composition chart. */
const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif', '.tiff',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.ogg', '.webm', '.flac',
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z', '.rar', '.xz', '.jar', '.war',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a', '.class', '.pyc', '.pyo',
  '.pdf', '.psd', '.ai', '.sketch', '.fig', '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.db', '.sqlite', '.sqlite3', '.map', '.min.js', '.min.css', '.snap',
]);

/**
 * Resolve a language for a repository path.
 * @param {string} filePath e.g. "src/components/Button.tsx"
 * @returns {string} language name, or "Other" when unknown, or null when the
 *   file should be skipped entirely (binary assets).
 */
export function languageOf(filePath) {
  const path = String(filePath).replace(/\\/g, '/');
  const base = path.slice(path.lastIndexOf('/') + 1);
  const lowerBase = base.toLowerCase();
  const lowerPath = path.toLowerCase();

  if (IGNORED_EXTENSIONS.has(extensionOf(lowerBase))) return null;
  if (/\.min\.(js|css)$/.test(lowerPath)) return null;

  if (lowerBase.endsWith('.d.ts')) return 'TypeScript';

  // Well known file names win over their extension: `CMakeLists.txt` is CMake,
  // not plain text, and `package-lock.json` is a lockfile, not JSON.
  if (FILENAME_MAP[lowerBase]) return FILENAME_MAP[lowerBase];

  const dot = lowerBase.lastIndexOf('.');
  if (dot > 0) {
    const ext = extensionOf(lowerBase);
    if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
  }

  // Files like "Dockerfile.prod" or "Makefile.am"
  for (const [prefix, language] of Object.entries(FILENAME_MAP)) {
    if (prefix.length > 3 && lowerBase.startsWith(`${prefix}.`)) return language;
  }

  return 'Other';
}

/**
 * @param {string} base lowercase basename
 * @returns {string} extension including the dot, or '' when there is none
 */
export function extensionOf(base) {
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot);
}

/**
 * Languages that are usually metadata rather than "code", used to compute a
 * code-only share in the report.
 */
const NON_CODE = new Set([
  'JSON', 'YAML', 'TOML', 'INI', 'XML', 'Markdown', 'Text', 'Lockfile',
  'Dotenv', 'Git Config', 'Editor Config', 'Diff', 'SVG', 'CSV',
]);

/**
 * @param {string} language
 * @returns {boolean}
 */
export function isCode(language) {
  return !NON_CODE.has(language) && language !== 'Other';
}

export const LANGUAGE_COUNT = Object.keys(EXTENSION_MAP).length;

const compilerPipeline = {
  schemaVersion: 1,
  id: 'compiler-pipeline',
  topic: 'How does a compiler turn source code into a program?',
  title: 'From source code to a running program',
  aliases: [
    'how does a compiler work',
    'compiler',
    'compiler pipeline',
    'source code to program',
    'how is code compiled',
  ],
  domainId: 'programming',
  visualType: 'process',
  durationMinutes: 9,
  learningObjective:
    'Trace the main stages of a compiler pipeline and explain which kinds of errors are detected at each stage.',
  intro: {
    beginner:
      'A compiler is a translator. It reads source code and produces another form a computer can run, checking the code along the way.',
    intermediate:
      'A compiler turns source text into tokens, checks structure and meaning, builds intermediate representations, may optimise them, and generates target code. A linker then combines the result with libraries.',
    advanced:
      'A typical ahead-of-time compiler pipeline comprises lexical analysis, parsing, semantic analysis, lowering to one or more intermediate representations, optimisation and target code generation, followed by linking and loading. Real toolchains vary, and interpreters or JIT compilers distribute these responsibilities differently.',
  },
  process: {
    steps: [
      {
        id: 'source',
        title: 'Read the source and toolchain settings',
        summary:
          'The compiler receives source files plus configuration such as the target platform and optimisation level.',
        details: {
          beginner:
            'The compiler starts with the text you wrote. It also reads settings that say what kind of program to produce.',
          intermediate:
            'The compiler driver gathers source files, include paths, target settings and flags. It may invoke several tools rather than one monolithic program.',
          advanced:
            'The driver coordinates preprocessing or module resolution, compiler phases and linking. Flags affect language mode, target ABI, diagnostics and optimisation, so the same source can produce different artefacts.',
        },
        annotations: [
          'Compilation is usually a pipeline of cooperating tools.',
          'The target platform can change the generated code.',
        ],
      },
      {
        id: 'lexing-parsing',
        title: 'Tokenise and parse the code',
        summary:
          'Lexing groups characters into tokens. Parsing arranges them into a syntax tree that reflects the language grammar.',
        details: {
          beginner:
            'The compiler breaks text into words and symbols, then checks whether they are arranged in valid sentences for the language.',
          intermediate:
            'The lexer produces tokens such as identifiers and operators. The parser checks grammar and builds an abstract syntax tree; malformed syntax is reported here.',
          advanced:
            'Lexical analysis handles maximal munch and token classes. Parsing applies the language grammar, often producing an AST or concrete syntax tree. Error recovery strategies determine how many independent syntax errors can be reported.',
        },
        annotations: [
          'A missing bracket is commonly a syntax error.',
          'Tokens are not yet checked for meaning or type.',
        ],
      },
      {
        id: 'semantic-analysis',
        title: 'Check names, types and meaning',
        summary:
          'Semantic analysis resolves declarations and checks that operations make sense in the language.',
        details: {
          beginner:
            'The compiler checks whether names exist and whether values are being used in sensible ways.',
          intermediate:
            'Name resolution links identifiers to declarations. Type checking catches mismatches such as adding a string to a number in a language that forbids it.',
          advanced:
            'Symbol tables, scope rules and type inference or checking establish program meaning. Some checks occur during lowering and monomorphisation, so the exact boundary between parsing and semantic analysis is language-specific.',
        },
        annotations: [
          'An undefined variable is often a semantic error.',
          'Different languages enforce different type rules.',
        ],
      },
      {
        id: 'intermediate',
        title: 'Lower to an intermediate representation',
        summary:
          'The compiler rewrites the program into a form that is easier to analyse and optimise than source syntax.',
        details: {
          beginner:
            'The compiler turns the checked program into a simpler internal form that keeps the same meaning.',
          intermediate:
            'An intermediate representation, such as a control-flow graph or three-address code, exposes operations and control flow while hiding source syntax.',
          advanced:
            'Lowering may pass through several IRs. SSA form simplifies data-flow analysis; control-flow graphs expose branches and loops. The chosen representation constrains which optimisations are practical.',
        },
        annotations: [
          'Intermediate representations trade detail for analysability.',
          'The program should preserve observable behaviour across lowering.',
        ],
      },
      {
        id: 'optimise',
        title: 'Optimise without changing behaviour',
        summary:
          'The compiler removes unnecessary work or rewrites it into a form expected to run faster or use fewer resources.',
        details: {
          beginner:
            'The compiler looks for work it can safely remove or simplify. Optimisation tries to keep the same visible result.',
          intermediate:
            'Constant folding, dead-code elimination and loop transformations are common. Optimisations must preserve the language’s observable behaviour, including errors and side effects.',
          advanced:
            'Optimisation is a sequence of analyses and transformations whose legality depends on language semantics. Undefined behaviour can make transformations valid that would be unsafe under a stricter model; optimisation is not guaranteed to make every program faster.',
        },
        annotations: [
          'Optimisation is optional in principle, though modern compilers rely on it.',
          'A faster program is not automatically a correct program.',
        ],
      },
      {
        id: 'codegen-link',
        title: 'Generate code, link and load',
        summary:
          'The compiler emits target instructions or bytecode. A linker combines libraries, and the operating system or runtime loads the result.',
        details: {
          beginner:
            'The compiler writes the final instructions. Other tools connect the program to libraries so it can start.',
          intermediate:
            'Code generation selects target instructions and lays out data. The linker resolves external symbols; the loader prepares the executable in memory before the runtime starts it.',
          advanced:
            'Register allocation, instruction selection and ABI compliance shape generated code. Relocation and symbol resolution happen during linking. Loading and runtime startup are separate from compilation, especially for JIT or interpreted languages.',
        },
        annotations: [
          'Linking errors are different from syntax errors.',
          'Some language runtimes compile code while the program is running.',
        ],
      },
    ],
    limitations: [
      'This describes a typical ahead-of-time compiler and simplifies real toolchains.',
      'Interpreters and JIT compilers distribute these stages differently.',
      'Optimisation behaviour and diagnostics vary by compiler and language.',
      'The diagram does not show preprocessing, macros, package resolution or deployment.',
    ],
  },
  accessibilityDescription:
    'A six-step vertical process diagram from source reading through parsing, semantic analysis, intermediate representation, optimisation, and code generation plus linking. Each step is a button with a detailed explanation.',
  workedExample: {
    title: 'A tiny expression',
    body:
      'Consider `total = price * 2`. The lexer recognises names, an operator and a number. The parser builds a multiplication expression assigned to `total`. Semantic analysis checks that the names and types are valid. An intermediate form may simplify or reorder the operations. Code generation chooses target instructions, and the linker resolves any library symbols used at runtime.',
  },
  practice: {
    question:
      'Which stage most directly checks that a variable was declared before it is used?',
    options: [
      'Lexical analysis',
      'Parsing',
      'Semantic analysis',
      'Linking',
    ],
    correctIndex: 2,
    explanation:
      'Lexing recognises tokens and parsing checks grammar, but name resolution and type checking belong to semantic analysis. Linking resolves symbols across separately compiled code.',
    hint: 'Which stage needs a symbol table?',
  },
  application: {
    title: 'Reading compiler errors',
    body:
      'The error category gives you a clue. A syntax error means the parser could not build the expected structure. An undefined-name error points to declaration or scope. A linker error usually means a symbol was declared or referenced but the final library or object file was not available.',
  },
  provenance: {
    kind: 'authored',
    note:
      'Curated explanatory model. It describes a general compiler pipeline and is not based on a specific learner source.',
  },
  sources: [],
};

export default compilerPipeline;

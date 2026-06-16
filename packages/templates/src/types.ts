/** Values interpolated into template files. */
export interface TemplateContext {
  /** Project name, used for the generated `package.json` and README. */
  projectName: string
}

/** A single file a template produces, relative to the target directory. */
export interface TemplateFile {
  /** POSIX-style path relative to the target directory (e.g. `tests/ui/example.spec.ts`). */
  path: string
  content: string
}

/** A built-in project template. Templates are data: they declare files, not behavior. */
export interface Template {
  id: string
  description: string
  /** Produces the full set of files for the given context. */
  files(context: TemplateContext): TemplateFile[]
}

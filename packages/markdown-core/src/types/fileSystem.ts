export interface FileHandle {
  name: string;
  nativeHandle?: unknown;
  path?: string;
}

export interface FileOpenResult {
  handle: FileHandle;
  content: string;
}

export interface FileSystemProvider {
  open(): Promise<FileOpenResult | null>;
  save(handle: FileHandle, content: string): Promise<void>;
  saveAs(content: string): Promise<FileHandle | null>;
  supportsDirectAccess: boolean;
}

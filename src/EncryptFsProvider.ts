import path from 'path';
import vscode, { Uri } from 'vscode';

export class MemFS implements vscode.FileSystemProvider {
  static scheme = 'memfs';

  private _getTargetUrl(uri: vscode.Uri) {
    const rawUri = Uri.parse(uri.path.slice(1));

    const newUri = Uri.from({
      ...uri,
      path: rawUri.path,
      scheme: rawUri.scheme,
    });

    console.log('uri:', newUri.toString());

    return newUri;
  }

  // --- manage file metadata

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const newUri = this._getTargetUrl(uri);

    return vscode.workspace.fs.stat(newUri);
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const newUri = this._getTargetUrl(uri);

    const result = await vscode.workspace.fs.readDirectory(newUri);

    return result;
  }

  // --- manage file contents

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const newUri = this._getTargetUrl(uri);

    const result = await vscode.workspace.fs.readFile(newUri);

    return result;
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const entry = await this._lookup(uri, true);

    if (entry?.type === vscode.FileType.Directory) {
      throw vscode.FileSystemError.FileIsADirectory(uri);
    }

    if (!entry && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    if (entry && options.create && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    const newUri = this._getTargetUrl(uri);
    await vscode.workspace.fs.writeFile(newUri, content);

    if (!entry) {
      this._fireSoon({ type: vscode.FileChangeType.Created, uri });
    } else {
      this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
    }
  }

  // --- manage files/folders

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    await vscode.workspace.fs.rename(
      this._getTargetUrl(oldUri),
      this._getTargetUrl(newUri),
      options,
    );

    this._fireSoon(
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    );
  }

  async copy(
    source: vscode.Uri,
    destination: vscode.Uri,
    options: { overwrite: boolean },
  ): Promise<void> {
    await vscode.workspace.fs.copy(
      this._getTargetUrl(source),
      this._getTargetUrl(destination),
      options,
    );

    this._fireSoon({ type: vscode.FileChangeType.Created, uri: destination });
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    await vscode.workspace.fs.delete(this._getTargetUrl(uri), options);

    const dirname = uri.with({ path: path.posix.dirname(uri.path) });

    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      { uri, type: vscode.FileChangeType.Deleted },
    );
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.createDirectory(this._getTargetUrl(uri));

    const dirname = uri.with({ path: path.posix.dirname(uri.path) });

    this._fireSoon(
      { type: vscode.FileChangeType.Changed, uri: dirname },
      { type: vscode.FileChangeType.Created, uri },
    );
  }

  // --- lookup

  private async _lookup(uri: vscode.Uri, silent: boolean): Promise<vscode.FileStat | undefined> {
    const newUri = this._getTargetUrl(uri);

    if (!silent) {
      return vscode.workspace.fs.stat(newUri);
    }

    try {
      return await vscode.workspace.fs.stat(newUri);
    } catch (error) {
      //
    }
  }

  // --- manage file events

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle?: NodeJS.Timer;

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  watch(): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => undefined);
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._bufferedEvents.push(...events);

    if (this._fireSoonHandle) {
      clearTimeout(this._fireSoonHandle);
    }

    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents);
      this._bufferedEvents.length = 0;
    }, 5);
  }
}
/**
 * VS Code API wrapper for webview
 */

declare function acquireVsCodeApi(): VsCodeApi;

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState<T>(): T | undefined;
	setState<T>(state: T): void;
}

let vscodeApi: VsCodeApi | undefined;

/**
 * Get the VS Code API instance (singleton)
 */
export function getVsCodeApi(): VsCodeApi {
	if (!vscodeApi) {
		vscodeApi = acquireVsCodeApi();
	}
	return vscodeApi;
}

/**
 * Post a message to the extension
 */
export function postMessage<T>(command: string, payload?: T): void {
	getVsCodeApi().postMessage({ command, payload });
}

/**
 * Get saved state from webview
 */
export function getState<T>(): T | undefined {
	return getVsCodeApi().getState<T>();
}

/**
 * Save state to webview
 */
export function setState<T>(state: T): void {
	getVsCodeApi().setState(state);
}

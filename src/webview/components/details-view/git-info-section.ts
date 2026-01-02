import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';
import type { GitInfo } from '../../types/webview-types.js';

declare function acquireVsCodeApi(): {
	postMessage(message: unknown): void;
};

@customElement('git-info-section')
export class GitInfoSection extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}

		:host([hidden]) {
			display: none;
		}

		.label {
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground);
			opacity: 0.8;
		}

		.row {
			display: flex;
			align-items: center;
			gap: 6px;
			font-size: 12px;
		}

		.row vscode-icon {
			font-size: 14px;
			color: var(--vscode-descriptionForeground);
		}

		.branch {
			color: var(--vscode-foreground);
		}

		.uncommitted {
			color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d);
			font-weight: bold;
			font-size: 14px;
		}

		.remote {
			color: var(--vscode-textLink-foreground);
			font-size: 11px;
			word-break: break-all;
			text-decoration: none;
			cursor: pointer;
		}

		.remote:hover {
			text-decoration: underline;
		}
	`;

	@property({ type: Object }) gitInfo: GitInfo | null = null;

	private formatRemoteUrl(url: string): string {
		// git@github.com:user/repo.git → github.com/user/repo
		let formatted = url
			.replace(/^git@/, '')
			.replace(/\.git$/, '')
			.replace(':', '/');

		// https://github.com/user/repo.git → github.com/user/repo
		formatted = formatted.replace(/^https?:\/\//, '');

		return formatted;
	}

	private getHttpsUrl(url: string): string {
		// git@github.com:user/repo.git → https://github.com/user/repo
		return url
			.replace(/^git@([^:]+):/, 'https://$1/')
			.replace(/\.git$/, '');
	}

	private handleRemoteClick(e: Event, url: string): void {
		e.preventDefault();
		const vscode = acquireVsCodeApi();
		vscode.postMessage({ command: 'openUrl', payload: { url } });
	}

	render() {
		if (!this.gitInfo?.branch) {
			return nothing;
		}

		return html`
			<div class="label">Git</div>
			<div class="row">
				<vscode-icon name="git-branch"></vscode-icon>
				<span class="branch">${this.gitInfo.branch}</span>
				${this.gitInfo.hasUncommittedChanges
					? html`<span class="uncommitted" title="Uncommitted changes">*</span>`
					: nothing}
			</div>
			${this.gitInfo.remoteUrl
				? html`
					<div class="row">
						<vscode-icon name="remote"></vscode-icon>
						<a
							class="remote"
							href="${this.getHttpsUrl(this.gitInfo.remoteUrl)}"
							@click=${(e: Event) => this.handleRemoteClick(e, this.getHttpsUrl(this.gitInfo!.remoteUrl!))}
						>${this.formatRemoteUrl(this.gitInfo.remoteUrl)}</a>
					</div>
				`
				: nothing}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'git-info-section': GitInfoSection;
	}
}

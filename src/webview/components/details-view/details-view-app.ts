import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { getVsCodeApi, postMessage } from '../../utils/vscode-api.js';
import type { DetailItem, DetailUpdatePayload } from '../../types/webview-types.js';

// Import child components
import '../shared/empty-state.js';
import './details-header.js';
import './details-section.js';
import './git-info-section.js';
import './action-buttons.js';
import './management-section.js';

interface WebviewMessage {
	command: string;
	payload?: unknown;
}

@customElement('details-view-app')
export class DetailsViewApp extends LitElement {
	static styles = css`
		:host {
			display: block;
			padding: 12px;
		}

		.details {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		empty-state {
			padding: 20px;
		}
	`;

	@state() private detail: DetailItem | null = null;

	connectedCallback() {
		super.connectedCallback();

		// Initialize VS Code API
		getVsCodeApi();

		// Listen for messages from extension
		window.addEventListener('message', this.handleMessage);

		// Signal ready
		postMessage('ready');
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		window.removeEventListener('message', this.handleMessage);
	}

	private handleMessage = (event: MessageEvent<WebviewMessage>) => {
		const message = event.data;

		switch (message.command) {
			case 'updateDetail': {
				const payload = message.payload as DetailUpdatePayload;
				this.detail = payload.detail;
				break;
			}
			case 'clearProject':
				this.detail = null;
				break;
		}
	};

	private formatDate(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days === 0) {return 'Today';}
		if (days === 1) {return 'Yesterday';}
		if (days < 7) {return `${days} days ago`;}
		if (days < 14) {return '1 week ago';}
		if (days < 30) {return `${Math.floor(days / 7)} weeks ago`;}

		return new Date(timestamp).toLocaleDateString();
	}

	private handleOpenProject(e: CustomEvent<{ path: string; newWindow: boolean }>) {
		postMessage('openProject', e.detail);
	}

	private handleSaveProject(e: CustomEvent<{ path: string }>) {
		postMessage('saveToProjects', e.detail);
	}

	private handleRemoveProject(e: CustomEvent<{ path: string; isSaved: boolean }>) {
		postMessage('deleteProject', e.detail);
	}

	render() {
		if (!this.detail) {
			return html`
				<empty-state
					message="Select a project to see details"
					icon="info"
				></empty-state>
			`;
		}

		return html`
			<div class="details">
				<details-header name="${this.detail.name}"></details-header>

				<details-section label="Path" isPath>
					${this.detail.path}
				</details-section>

				${this.detail.lastOpened
					? html`
						<details-section label="Last Opened">
							${this.formatDate(this.detail.lastOpened)}
						</details-section>
					`
					: nothing}

				<git-info-section
					.gitInfo=${this.detail.gitInfo || null}
				></git-info-section>

				<action-buttons
					path="${this.detail.path}"
					@open-project=${this.handleOpenProject}
				></action-buttons>

				<management-section
					path="${this.detail.path}"
					?isSaved=${this.detail.isSaved || false}
					@save-project=${this.handleSaveProject}
					@remove-project=${this.handleRemoveProject}
				></management-section>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'details-view-app': DetailsViewApp;
	}
}

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-button/index.js';

@customElement('action-buttons')
export class ActionButtons extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-top: 32px;
		}

		vscode-button {
			width: 100%;
		}
	`;

	@property() path = '';

	private handleOpen() {
		this.dispatchEvent(new CustomEvent('open-project', {
			detail: { path: this.path, newWindow: false },
			bubbles: true,
			composed: true
		}));
	}

	private handleOpenNewWindow() {
		this.dispatchEvent(new CustomEvent('open-project', {
			detail: { path: this.path, newWindow: true },
			bubbles: true,
			composed: true
		}));
	}

	render() {
		return html`
			<vscode-button @click=${this.handleOpen}>Open</vscode-button>
			<vscode-button secondary @click=${this.handleOpenNewWindow}>
				Open in New Window
			</vscode-button>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'action-buttons': ActionButtons;
	}
}

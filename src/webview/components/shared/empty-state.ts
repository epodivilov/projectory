import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';

@customElement('empty-state')
export class EmptyState extends LitElement {
	static styles = css`
		:host {
			display: block;
			text-align: center;
			padding: 60px 20px;
			color: var(--vscode-descriptionForeground);
		}

		.icon {
			font-size: 48px;
			opacity: 0.5;
			margin-bottom: 16px;
		}

		.message {
			margin: 0 0 8px 0;
			font-size: 14px;
			color: var(--vscode-foreground);
		}

		.hint {
			margin: 0 0 20px 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		::slotted(*) {
			margin-top: 16px;
		}
	`;

	@property() message = '';
	@property() hint = '';
	@property() icon = 'folder';

	render() {
		return html`
			<vscode-icon name="${this.icon}" class="icon"></vscode-icon>
			${this.message ? html`<p class="message">${this.message}</p>` : ''}
			${this.hint ? html`<p class="hint">${this.hint}</p>` : ''}
			<slot></slot>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'empty-state': EmptyState;
	}
}

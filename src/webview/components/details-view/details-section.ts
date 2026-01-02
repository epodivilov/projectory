import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('details-section')
export class DetailsSection extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}

		.label {
			font-size: 10px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-descriptionForeground);
			opacity: 0.8;
		}

		.content {
			font-size: 12px;
			color: var(--vscode-foreground);
		}

		.content.path {
			font-size: 11px;
			opacity: 0.8;
			word-break: break-all;
			line-height: 1.4;
		}
	`;

	@property() label = '';
	@property({ type: Boolean }) isPath = false;

	render() {
		return html`
			<div class="label">${this.label}</div>
			<div class="content ${this.isPath ? 'path' : ''}">
				<slot></slot>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'details-section': DetailsSection;
	}
}

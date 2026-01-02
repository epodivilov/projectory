import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-button/index.js';

@customElement('management-section')
export class ManagementSection extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			gap: 8px;
			margin-top: 12px;
			padding-top: 12px;
			border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
		}

		vscode-button {
			width: 100%;
		}
	`;

	@property() path = '';
	@property({ type: Boolean }) isSaved = false;

	private handleSave() {
		this.dispatchEvent(new CustomEvent('save-project', {
			detail: { path: this.path },
			bubbles: true,
			composed: true
		}));
	}

	private handleRemove() {
		this.dispatchEvent(new CustomEvent('remove-project', {
			detail: { path: this.path, isSaved: this.isSaved },
			bubbles: true,
			composed: true
		}));
	}

	render() {
		if (this.isSaved) {
			return html`
				<vscode-button secondary @click=${this.handleRemove}>
					Remove from Saved
				</vscode-button>
			`;
		}

		return html`
			<vscode-button secondary @click=${this.handleSave}>
				Save
			</vscode-button>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'management-section': ManagementSection;
	}
}

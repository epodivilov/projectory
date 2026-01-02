import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-textfield/index.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';
import type { SearchChangeDetail } from '../../types/webview-types.js';

@customElement('search-box')
export class SearchBox extends LitElement {
	static styles = css`
		:host {
			display: block;
			width: 100%;
			max-width: 500px;
		}

		.search-input {
			width: 100%;
			--vscode-input-border-radius: 24px;
		}

		.search-icon {
			color: var(--vscode-descriptionForeground);
		}
	`;

	@property() placeholder = 'Search...';
	@property() value = '';
	@state() private hasValue = false;

	private handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		this.value = target.value;
		this.hasValue = this.value.length > 0;

		const detail: SearchChangeDetail = { value: this.value };
		this.dispatchEvent(new CustomEvent('search-change', {
			detail,
			bubbles: true,
			composed: true
		}));
	}

	private handleClear() {
		this.value = '';
		this.hasValue = false;

		const detail: SearchChangeDetail = { value: '' };
		this.dispatchEvent(new CustomEvent('search-change', {
			detail,
			bubbles: true,
			composed: true
		}));

		// Focus input after clear
		const input = this.shadowRoot?.querySelector('vscode-textfield');
		if (input) {
			(input as HTMLElement).focus();
		}
	}

	private handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && this.hasValue) {
			this.handleClear();
		}
	}

	render() {
		return html`
			<vscode-textfield
				class="search-input"
				placeholder="${this.placeholder}"
				.value="${this.value}"
				@input="${this.handleInput}"
				@keydown="${this.handleKeydown}"
			>
				<vscode-icon
					slot="content-before"
					name="search"
					class="search-icon"
				></vscode-icon>
				${this.hasValue
					? html`
						<vscode-icon
							slot="content-after"
							name="close"
							action-icon
							title="Clear search"
							@click="${this.handleClear}"
						></vscode-icon>
					`
					: ''}
			</vscode-textfield>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'search-box': SearchBox;
	}
}

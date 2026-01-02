import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('section-header')
export class SectionHeader extends LitElement {
	static styles = css`
		:host {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 16px;
		}

		.title-container {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		h2 {
			margin: 0;
			font-size: 1.2em;
			font-weight: 500;
		}

		.count {
			font-size: 0.85em;
			color: var(--vscode-descriptionForeground);
		}

		.actions {
			display: flex;
			gap: 4px;
		}
	`;

	@property() title = '';
	@property() count = '';

	render() {
		return html`
			<div class="title-container">
				<h2>${this.title}</h2>
				${this.count ? html`<span class="count">${this.count}</span>` : ''}
			</div>
			<div class="actions">
				<slot name="actions"></slot>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'section-header': SectionHeader;
	}
}

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';

@customElement('details-header')
export class DetailsHeader extends LitElement {
	static styles = css`
		:host {
			display: flex;
			align-items: center;
			gap: 10px;
		}

		.icon {
			position: relative;
			width: 36px;
			height: 36px;
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			font-size: 28px;
		}

		.title {
			flex: 1;
			min-width: 0;
		}

		.name {
			font-weight: 600;
			font-size: 14px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.type {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 2px;
		}
	`;

	@property() name = '';
	@property() type = '';

	render() {
		return html`
			<vscode-icon name="folder" class="icon"></vscode-icon>
			<div class="title">
				<div class="name">${this.name}</div>
				${this.type ? html`<div class="type">${this.type}</div>` : ''}
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'details-header': DetailsHeader;
	}
}

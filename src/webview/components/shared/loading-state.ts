import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-progress-ring/index.js';

@customElement('loading-state')
export class LoadingState extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 16px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
			padding: 40px;
		}

		.message {
			margin: 0;
			font-size: 13px;
		}
	`;

	@property() message = 'Loading...';

	render() {
		return html`
			<vscode-progress-ring></vscode-progress-ring>
			<p class="message">${this.message}</p>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'loading-state': LoadingState;
	}
}

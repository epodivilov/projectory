import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@vscode-elements/elements/dist/vscode-icon/index.js';
import type { WebviewProject, ProjectClickDetail } from '../../types/webview-types.js';

@customElement('project-card')
export class ProjectCard extends LitElement {
	static styles = css`
		:host {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			padding: 12px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			border-radius: 6px;
			cursor: pointer;
			transition: background-color 0.15s ease;
			border: 1px solid transparent;
		}

		:host(:hover) {
			background-color: var(--vscode-list-hoverBackground);
			border-color: var(--vscode-focusBorder);
		}

		:host(:active) {
			background-color: var(--vscode-list-activeSelectionBackground);
		}

		/* List view mode styles applied via attribute */
		:host([view-mode='list']) {
			flex-direction: row;
			align-items: center;
			padding: 8px 12px;
		}

		.header {
			display: flex;
			align-items: center;
			width: 100%;
		}

		.icon {
			position: relative;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 24px;
			height: 24px;
			margin-right: 10px;
			flex-shrink: 0;
			font-size: 20px;
		}

		.info {
			flex: 1;
			min-width: 0;
		}

		:host([view-mode='list']) .info {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.name {
			font-weight: 600;
			font-size: 13px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.path {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			margin-top: 2px;
		}

		:host([view-mode='list']) .path {
			margin-top: 0;
			margin-left: 4px;
			opacity: 0.7;
		}
	`;

	@property({ type: Object }) project: WebviewProject | null = null;
	@property({ attribute: 'view-mode', reflect: true }) viewMode: 'grid' | 'list' = 'grid';

	private formatParentPath(fullPath: string): string {
		const parts = fullPath.split('/');
		parts.pop();
		let parentPath = parts.join('/');
		const homeMatch = parentPath.match(/^\/Users\/[^/]+/);
		if (homeMatch) {
			parentPath = parentPath.replace(homeMatch[0], '~');
		}
		return parentPath;
	}

	private handleClick(e: MouseEvent) {
		if (!this.project) {return;}

		const detail: ProjectClickDetail = {
			path: this.project.path,
			newWindow: e.altKey || e.metaKey
		};

		this.dispatchEvent(new CustomEvent('project-click', {
			detail,
			bubbles: true,
			composed: true
		}));
	}

	render() {
		if (!this.project) {return html``;}

		return html`
			<div class="header" @click=${this.handleClick}>
				<vscode-icon name="folder" class="icon"></vscode-icon>
				<div class="info">
					<div class="name">${this.project.name}</div>
					<div class="path">${this.formatParentPath(this.project.path)}</div>
				</div>
			</div>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		'project-card': ProjectCard;
	}
}

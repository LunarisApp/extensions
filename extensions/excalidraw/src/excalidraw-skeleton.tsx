export function ExcalidrawSkeleton() {
	return (
		<div
			aria-busy="true"
			className="excalidraw-skeleton"
			data-testid="excalidraw-skeleton"
			role="status"
		>
			<span className="visually-hidden">Loading Excalidraw</span>
			<div className="excalidraw-skeleton__toolbar">
				<div className="excalidraw-skeleton__block" />
				<div className="excalidraw-skeleton__block" />
				<div className="excalidraw-skeleton__block" />
				<div className="excalidraw-skeleton__block excalidraw-skeleton__block--wide" />
			</div>
			<div className="excalidraw-skeleton__canvas">
				<div className="excalidraw-skeleton__shape" />
			</div>
		</div>
	);
}

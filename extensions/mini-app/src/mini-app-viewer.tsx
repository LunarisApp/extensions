import {
	type ResourceStorageHandle,
	ViewReady,
	useFileStorage,
	useProjectResourceName,
	useStoredFile,
	useWorkspaceAccess,
} from "@lunarisapp/plugin-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMiniAppTranslation } from "./locale";
import { buildMiniAppDocument } from "./mini-app-document";
import { MiniAppOnboarding } from "./mini-app-onboarding";

type FileStorageHandle = Extract<ResourceStorageHandle, { kind: "file" }>;

export { buildMiniAppDocument, MINI_APP_CSP } from "./mini-app-document";
export {
	MINI_APP_ACCEPT,
	MINI_APP_MAX_BYTES,
} from "./mini-app-onboarding";

const MINI_APP_PERMISSIONS_POLICY = [
	"accelerometer 'none'",
	"autoplay 'none'",
	"camera 'none'",
	"clipboard-read 'none'",
	"clipboard-write 'none'",
	"display-capture 'none'",
	"encrypted-media 'none'",
	"fullscreen 'none'",
	"geolocation 'none'",
	"gyroscope 'none'",
	"hid 'none'",
	"idle-detection 'none'",
	"local-fonts 'none'",
	"magnetometer 'none'",
	"microphone 'none'",
	"midi 'none'",
	"otp-credentials 'none'",
	"payment 'none'",
	"picture-in-picture 'none'",
	"publickey-credentials-get 'none'",
	"screen-wake-lock 'none'",
	"serial 'none'",
	"usb 'none'",
	"web-share 'none'",
	"window-management 'none'",
	"xr-spatial-tracking 'none'",
].join("; ");

type SourceState =
	| { source: null; status: "error" | "loading" }
	| { source: string; status: "ready" };

function useMiniAppSource(
	fileId: string | null,
	objectUrl: string | null,
): SourceState {
	const [state, setState] = useState<SourceState>({
		source: null,
		status: "loading",
	});
	const requestedFileRef = useRef<string | null>(null);

	useEffect(() => {
		if (!fileId || !objectUrl) {
			requestedFileRef.current = null;
			setState({ source: null, status: "loading" });
			return;
		}
		if (requestedFileRef.current === fileId) return;

		requestedFileRef.current = fileId;
		setState({ source: null, status: "loading" });

		void fetch(objectUrl)
			.then((response) => (response.ok ? response.text() : null))
			.then((source) => {
				if (requestedFileRef.current !== fileId) return;
				setState(
					source === null
						? { source: null, status: "error" }
						: { source, status: "ready" },
				);
			})
			.catch(() => {
				if (requestedFileRef.current !== fileId) return;
				requestedFileRef.current = null;
				setState({ source: null, status: "error" });
			});
	}, [fileId, objectUrl]);

	return state;
}

function MiniAppError({
	description,
	title,
}: {
	description?: string;
	title: string;
}) {
	return (
		<div className="mini-app-state mini-app-state-error" role="alert">
			<div className="mini-app-state-symbol" aria-hidden="true">
				!
			</div>
			<h2>{title}</h2>
			{description ? (
				<p className="mini-app-description">{description}</p>
			) : null}
		</div>
	);
}

export function MiniAppViewer({
	resourceId,
	reportReady,
	storage,
}: {
	resourceId: string;
	reportReady?: () => void;
	storage: FileStorageHandle;
}) {
	const t = useMiniAppTranslation();
	const { canWriteContent } = useWorkspaceAccess();
	const fileStorage = useFileStorage();
	const { file, metadata, objectUrl } = useStoredFile(storage);
	const resourceName = useProjectResourceName(resourceId);
	const source = useMiniAppSource(file?.id ?? null, objectUrl);
	const sandboxDocument = useMemo(
		() =>
			source.status === "ready" ? buildMiniAppDocument(source.source) : null,
		[source],
	);

	if (!metadata) {
		return (
			<ViewReady reportReady={reportReady}>
				<MiniAppOnboarding
					canUpload={canWriteContent}
					fileStorage={fileStorage}
					storage={storage}
					t={t}
				/>
			</ViewReady>
		);
	}

	const downloadPending =
		!file ||
		file.status === "queued-download" ||
		(file.status === "synced" && file.hasSynced && !file.localUri);

	if (!objectUrl || source.status === "error") {
		return (
			<ViewReady reportReady={reportReady}>
				<MiniAppError
					description={metadata.filename}
					title={t(downloadPending ? "downloadPending" : "sourceUnavailable")}
				/>
			</ViewReady>
		);
	}

	if (source.status === "loading" || !sandboxDocument) return null;

	return (
		<ViewReady reportReady={reportReady}>
			<iframe
				allow={MINI_APP_PERMISSIONS_POLICY}
				className="mini-app-frame"
				referrerPolicy="no-referrer"
				sandbox="allow-scripts"
				srcDoc={sandboxDocument}
				title={t("frameTitle", { name: resourceName })}
			/>
		</ViewReady>
	);
}

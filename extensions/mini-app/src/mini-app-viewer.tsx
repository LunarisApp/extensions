import {
	ContentRendererReady,
	PLUGIN_SANDBOX_BOOTSTRAP_CSP,
	PLUGIN_SANDBOX_BOOTSTRAP_SOURCE,
	useFileAttachment,
	useProjectItemName,
	useUploadFileAttachment,
	useWorkspaceAccess,
} from "@lunarisapp/plugin-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMiniAppTranslation } from "./locale";

export const MINI_APP_ACCEPT = ".html,.htm,text/html";
export const MINI_APP_MAX_BYTES = 5 * 1024 * 1024;
export const MINI_APP_CSP = [
	"default-src 'none'",
	`script-src blob: ${PLUGIN_SANDBOX_BOOTSTRAP_CSP}`,
	"script-src-attr 'none'",
	"style-src 'unsafe-inline'",
	"img-src data: blob:",
	"font-src data:",
	"media-src data: blob:",
	"connect-src 'none'",
	"frame-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
].join("; ");

const MINI_APP_SCRIPT_ATTRIBUTE = "data-lunaris-mini-app-script";
const JAVASCRIPT_MIME_TYPE = /^(?:application|text)\/(?:java|ecma)script$/;
const MINI_APP_SCRIPT_RUNNER_SOURCE = `
void (async () => {
	const decode = (value) => Uint8Array.from(
		atob(value),
		(character) => character.charCodeAt(0),
	);
	const placeholders = Array.from(document.querySelectorAll(
		"script[${MINI_APP_SCRIPT_ATTRIBUTE}]",
	));
	let heldDomContentLoaded = false;
	const holdDomContentLoaded = (event) => {
		heldDomContentLoaded = true;
		event.stopImmediatePropagation();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", holdDomContentLoaded, true);
	}

	for (const placeholder of placeholders) {
		const script = document.createElement("script");
		for (const { name, value } of Array.from(placeholder.attributes)) {
			if (
				name !== "type" &&
				name !== "integrity" &&
				name !== "nonce" &&
				name !== "${MINI_APP_SCRIPT_ATTRIBUTE}"
			) {
				script.setAttribute(name, value);
			}
		}
		const originalType = placeholder.getAttribute(
			"${MINI_APP_SCRIPT_ATTRIBUTE}",
		);
		if (originalType) script.type = originalType;
		script.async = false;
		const scriptUrl = URL.createObjectURL(new Blob(
			[decode(placeholder.textContent || "")],
			{ type: "text/javascript" },
		));
		await new Promise((resolve) => {
			script.onload = script.onerror = () => {
				URL.revokeObjectURL(scriptUrl);
				resolve();
			};
			script.src = scriptUrl;
			placeholder.replaceWith(script);
		});
	}

	document.removeEventListener("DOMContentLoaded", holdDomContentLoaded, true);
	if (heldDomContentLoaded || document.readyState !== "loading") {
		document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
	}
})();`;

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

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.byteLength; offset += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
	}
	return btoa(binary);
}

function isExecutableInlineScript(script: HTMLScriptElement): boolean {
	if (script.hasAttribute("src")) return false;
	const type = script.type.trim().toLowerCase();
	return !type || type === "module" || JAVASCRIPT_MIME_TYPE.test(type);
}

function MiniAppArtwork() {
	return (
		<div aria-hidden="true" className="mini-app-artwork">
			<div className="mini-app-artwork-bar">
				<span />
				<span />
				<span />
			</div>
			<div className="mini-app-artwork-body">
				<svg aria-hidden="true" viewBox="0 0 24 24">
					<path d="M3.5 5.5A2.5 2.5 0 0 1 6 3h12a2.5 2.5 0 0 1 2.5 2.5v13A2.5 2.5 0 0 1 18 21H6a2.5 2.5 0 0 1-2.5-2.5z" />
					<path d="M3.5 8h17M7 5.5h.01M10 5.5h.01" />
				</svg>
			</div>
		</div>
	);
}

function UploadIcon() {
	return (
		<svg
			aria-hidden="true"
			className="mini-app-button-icon"
			viewBox="0 0 24 24"
		>
			<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
		</svg>
	);
}

export function buildMiniAppDocument(source: string) {
	const document = new DOMParser().parseFromString(source, "text/html");
	document
		.querySelectorAll<HTMLMetaElement>("meta[http-equiv]")
		.forEach((meta) => {
			if (meta.httpEquiv.toLowerCase() === "content-security-policy") {
				meta.remove();
			}
		});

	const policy = document.createElement("meta");
	policy.content = MINI_APP_CSP;
	policy.httpEquiv = "Content-Security-Policy";

	const inlineScripts = Array.from(document.scripts).filter(
		isExecutableInlineScript,
	);
	for (const script of inlineScripts) {
		const originalType = script.getAttribute("type") ?? "";
		script.setAttribute(MINI_APP_SCRIPT_ATTRIBUTE, originalType);
		script.type = "application/octet-stream";
		script.textContent = bytesToBase64(
			new TextEncoder().encode(script.textContent ?? ""),
		);
	}

	if (inlineScripts.length > 0) {
		const runnerPayload = document.createElement("script");
		runnerPayload.id = "lunaris-plugin-script";
		runnerPayload.type = "application/octet-stream";
		runnerPayload.textContent = bytesToBase64(
			new TextEncoder().encode(MINI_APP_SCRIPT_RUNNER_SOURCE),
		);

		const stylePayload = document.createElement("script");
		stylePayload.id = "lunaris-plugin-style";
		stylePayload.type = "application/octet-stream";

		const bootstrap = document.createElement("script");
		bootstrap.textContent = PLUGIN_SANDBOX_BOOTSTRAP_SOURCE;
		document.head.prepend(policy, runnerPayload, stylePayload);
		document.body.append(bootstrap);
	} else {
		document.head.prepend(policy);
	}
	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

function useMiniAppSource(
	attachmentId: string | null,
	objectUrl: string | null,
): SourceState {
	const [state, setState] = useState<SourceState>({
		source: null,
		status: "loading",
	});
	const requestedAttachmentRef = useRef<string | null>(null);

	useEffect(() => {
		if (!attachmentId || !objectUrl) {
			requestedAttachmentRef.current = null;
			setState({ source: null, status: "loading" });
			return;
		}
		if (requestedAttachmentRef.current === attachmentId) return;

		requestedAttachmentRef.current = attachmentId;
		setState({ source: null, status: "loading" });

		void fetch(objectUrl)
			.then((response) => {
				return response.ok ? response.text() : null;
			})
			.then((source) => {
				if (requestedAttachmentRef.current !== attachmentId) return;
				setState(
					source === null
						? { source: null, status: "error" }
						: { source, status: "ready" },
				);
			})
			.catch(() => {
				if (requestedAttachmentRef.current === attachmentId) {
					requestedAttachmentRef.current = null;
					setState({ source: null, status: "error" });
				}
			});
	}, [attachmentId, objectUrl]);

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
	itemId,
	reportReady,
}: {
	itemId?: string;
	reportReady?: () => void;
}) {
	const t = useMiniAppTranslation();
	const { canWriteContent } = useWorkspaceAccess();
	const uploadFileAttachment = useUploadFileAttachment();
	const { attachment, metadata, objectUrl } = useFileAttachment(itemId ?? "");
	const itemName = useProjectItemName({ itemId });
	const source = useMiniAppSource(attachment?.id ?? null, objectUrl);
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const sandboxDocument = useMemo(
		() =>
			source.status === "ready" ? buildMiniAppDocument(source.source) : null,
		[source],
	);

	if (!itemId) {
		return <MiniAppError title={t("missingItem")} />;
	}

	if (!metadata) {
		const handleFile = async (file: File | undefined) => {
			if (!file) return;
			setError(null);
			const extension = file.name.split(".").pop()?.toLowerCase();
			if (extension !== "html" && extension !== "htm") {
				setError(t("invalidFile"));
				return;
			}
			if (file.size > MINI_APP_MAX_BYTES) {
				setError(t("fileTooLarge"));
				return;
			}

			setIsUploading(true);
			try {
				const normalized = file.type
					? file
					: new File([file], file.name, {
							lastModified: file.lastModified,
							type: "text/html",
						});
				await uploadFileAttachment({ file: normalized, itemId });
			} catch {
				setError(t("uploadFailed"));
			} finally {
				setIsUploading(false);
			}
		};

		return (
			<ContentRendererReady reportReady={reportReady}>
				<main className="mini-app-onboarding">
					<section className="mini-app-onboarding-content">
						<MiniAppArtwork />
						<header>
							<h1>{t("onboardingTitle")}</h1>
							<p className="mini-app-description">
								{t("onboardingDescription")}
							</p>
						</header>
						<input
							accept={MINI_APP_ACCEPT}
							aria-label={t("chooseApp")}
							className="mini-app-visually-hidden"
							disabled={!canWriteContent || isUploading}
							onChange={(event) => {
								const input = event.currentTarget;
								void handleFile(input.files?.[0]).finally(() => {
									input.value = "";
								});
							}}
							ref={inputRef}
							type="file"
						/>
						<button
							aria-busy={isUploading}
							className="mini-app-primary-button"
							disabled={!canWriteContent || isUploading}
							onClick={() => inputRef.current?.click()}
							type="button"
						>
							<UploadIcon />
							{isUploading ? t("uploading") : t("chooseApp")}
						</button>
						{error ? (
							<p className="mini-app-upload-error" role="alert">
								{error}
							</p>
						) : null}
					</section>
				</main>
			</ContentRendererReady>
		);
	}

	const downloadPending =
		!attachment ||
		attachment.status === "queued-download" ||
		(attachment.status === "synced" &&
			attachment.hasSynced &&
			!attachment.localUri);

	if (!objectUrl || source.status === "error") {
		return (
			<ContentRendererReady reportReady={reportReady}>
				<MiniAppError
					description={metadata.filename}
					title={t(downloadPending ? "downloadPending" : "sourceUnavailable")}
				/>
			</ContentRendererReady>
		);
	}

	if (source.status === "loading" || !sandboxDocument) return null;

	return (
		<ContentRendererReady reportReady={reportReady}>
			<iframe
				allow={MINI_APP_PERMISSIONS_POLICY}
				className="mini-app-frame"
				referrerPolicy="no-referrer"
				sandbox="allow-scripts"
				srcDoc={sandboxDocument}
				title={t("frameTitle", { name: itemName })}
			/>
		</ContentRendererReady>
	);
}

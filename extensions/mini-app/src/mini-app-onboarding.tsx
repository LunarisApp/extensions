import type { useFileStorage } from "@lunarisapp/plugin-sdk";
import { useRef, useState } from "react";
import type { useMiniAppTranslation } from "./locale";

export const MINI_APP_ACCEPT = ".html,.htm,text/html";
export const MINI_APP_MAX_BYTES = 5 * 1024 * 1024;

type Translate = ReturnType<typeof useMiniAppTranslation>;
type FileStorage = ReturnType<typeof useFileStorage>;

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

function normalizeHtmlFile(file: File): File {
	if (file.type) return file;
	return new File([file], file.name, {
		lastModified: file.lastModified,
		type: "text/html",
	});
}

function validateHtmlFile(file: File, t: Translate): string | null {
	const extension = file.name.split(".").pop()?.toLowerCase();
	if (extension !== "html" && extension !== "htm") return t("invalidFile");
	if (file.size > MINI_APP_MAX_BYTES) return t("fileTooLarge");
	return null;
}

export function MiniAppOnboarding({
	canUpload,
	fileStorage,
	itemId,
	t,
}: {
	canUpload: boolean;
	fileStorage: FileStorage;
	itemId: string;
	t: Translate;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);

	const handleFile = async (file: File | undefined) => {
		if (!file) return;
		const validationError = validateHtmlFile(file, t);
		setError(validationError);
		if (validationError) return;

		setIsUploading(true);
		try {
			await fileStorage.upload({ file: normalizeHtmlFile(file), itemId });
		} catch {
			setError(t("uploadFailed"));
		} finally {
			setIsUploading(false);
		}
	};

	const disabled = !canUpload || isUploading;
	return (
		<main className="mini-app-onboarding">
			<section className="mini-app-onboarding-content">
				<MiniAppArtwork />
				<header>
					<h1>{t("onboardingTitle")}</h1>
					<p className="mini-app-description">{t("onboardingDescription")}</p>
				</header>
				<input
					accept={MINI_APP_ACCEPT}
					aria-label={t("chooseApp")}
					className="mini-app-visually-hidden"
					disabled={disabled}
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
					disabled={disabled}
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
	);
}

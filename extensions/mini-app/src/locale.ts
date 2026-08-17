import { useLocale } from "@lunarisapp/plugin-sdk";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import ptBR from "./locales/pt-BR.json";

type MessageKey = keyof typeof en.miniAppExtension.miniApp;
type Messages = Record<MessageKey, string>;

const messages: Record<string, Messages> = {
	de: de.miniAppExtension.miniApp,
	en: en.miniAppExtension.miniApp,
	es: es.miniAppExtension.miniApp,
	fr: fr.miniAppExtension.miniApp,
	"pt-BR": ptBR.miniAppExtension.miniApp,
};

function selectedMessages(locale: string): Messages {
	return (
		messages[locale] ?? messages[locale.split("-")[0] ?? ""] ?? messages.en
	);
}

export function useMiniAppTranslation() {
	const { locale } = useLocale();
	const resource = selectedMessages(locale);
	return (key: MessageKey, values?: Record<string, string>) => {
		let message = resource[key];
		for (const [name, value] of Object.entries(values ?? {})) {
			message = message.replaceAll(`{{${name}}}`, value);
		}
		return message;
	};
}

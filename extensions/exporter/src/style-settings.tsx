import { useId, useState, type ReactNode } from "react";
import {
  detectPdfThemePreset,
  PDF_THEME_PRESETS,
  type PdfTheme,
  type PdfThemePreset,
} from "./theme";

interface StyleSettingsProps {
  disabled: boolean;
  onChange: (theme: PdfTheme) => void;
  theme: PdfTheme;
}

type SettingsSectionId = "colors" | "page" | "spacing" | "typography";

const PRESETS: Array<{ id: PdfThemePreset; label: string }> = [
  { id: "default", label: "Default" },
  { id: "compact", label: "Compact" },
  { id: "academic", label: "Academic" },
];

export function StyleSettings({ disabled, onChange, theme }: StyleSettingsProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId | undefined>("page");
  const update = <Section extends keyof PdfTheme>(
    section: Section,
    value: PdfTheme[Section],
  ) => onChange({ ...theme, [section]: value });

  const updateObject = <Section extends "colors" | "fontSize" | "lineHeight" | "page" | "spacing">(
    section: Section,
    key: keyof PdfTheme[Section],
    value: PdfTheme[Section][keyof PdfTheme[Section]],
  ) => update(section, { ...theme[section], [key]: value });

  const preset = detectPdfThemePreset(theme);
  const setPreset = (value: PdfThemePreset) => {
    const next = PDF_THEME_PRESETS[value];
    if (next) onChange(structuredClone(next));
  };
  const toggleSection = (section: SettingsSectionId) => {
    setActiveSection((current) => current === section ? undefined : section);
  };

  return (
    <div aria-label="PDF appearance" className="exporter-settings" role="group">
      <div className="exporter-preset-setting">
        <div className="exporter-preset-heading">
          <span>Style preset</span>
          {preset === "custom" ? <span className="exporter-preset-status">Custom</span> : null}
        </div>
        <div aria-label="Style preset" className="exporter-preset-options" role="group">
          {PRESETS.map(({ id, label }) => (
            <button
              aria-pressed={preset === id}
              className="exporter-preset-option"
              disabled={disabled}
              key={id}
              onClick={() => setPreset(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="exporter-settings-groups">
        <SettingsSection
          expanded={activeSection === "page"}
          fieldsDisabled={disabled}
          id="page"
          label="Page"
          onToggle={() => toggleSection("page")}
          summary={`${theme.page.pageSize.toUpperCase()} · ${theme.page.orientation === "portrait" ? "Portrait" : "Landscape"}`}
        >
          <div className="exporter-settings-grid">
            <Setting label="Size">
              <select
                aria-label="Page size"
                onChange={(event) => updateObject("page", "pageSize", event.target.value as PdfTheme["page"]["pageSize"])}
                value={theme.page.pageSize}
              >
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
              </select>
            </Setting>
            <Setting label="Orientation">
              <select
                aria-label="Page orientation"
                onChange={(event) => updateObject("page", "orientation", event.target.value as PdfTheme["page"]["orientation"])}
                value={theme.page.orientation}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </Setting>
          </div>
          <SettingsSubheading label="Margins" unit="pt" />
          <div className="exporter-settings-grid">
            <NumberSetting label="Top" max={100} min={18} onChange={(value) => updateObject("page", "marginTop", value)} unit="pt" value={theme.page.marginTop} />
            <NumberSetting label="Bottom" max={100} min={18} onChange={(value) => updateObject("page", "marginBottom", value)} unit="pt" value={theme.page.marginBottom} />
            <NumberSetting label="Left" max={100} min={18} onChange={(value) => updateObject("page", "marginLeft", value)} unit="pt" value={theme.page.marginLeft} />
            <NumberSetting label="Right" max={100} min={18} onChange={(value) => updateObject("page", "marginRight", value)} unit="pt" value={theme.page.marginRight} />
          </div>
          <label className="exporter-switch">
            <input checked={theme.pageNumbers} onChange={(event) => update("pageNumbers", event.target.checked)} role="switch" type="checkbox" />
            <span aria-hidden="true" className="exporter-switch-track"><span /></span>
            <span>Page numbers</span>
          </label>
        </SettingsSection>

        <SettingsSection
          expanded={activeSection === "typography"}
          fieldsDisabled={disabled}
          id="typography"
          label="Typography"
          onToggle={() => toggleSection("typography")}
          summary={`${theme.fontSize.body} pt body · ${theme.lineHeight.body}×`}
        >
          <SettingsSubheading label="Text sizes" unit="pt" />
          <div className="exporter-settings-grid">
            <NumberSetting label="Title" max={48} min={6} onChange={(value) => updateObject("fontSize", "title", value)} unit="pt" value={theme.fontSize.title} />
            <NumberSetting label="Heading 1" max={48} min={6} onChange={(value) => updateObject("fontSize", "heading1", value)} unit="pt" value={theme.fontSize.heading1} />
            <NumberSetting label="Heading 2" max={48} min={6} onChange={(value) => updateObject("fontSize", "heading2", value)} unit="pt" value={theme.fontSize.heading2} />
            <NumberSetting label="Heading 3" max={48} min={6} onChange={(value) => updateObject("fontSize", "heading3", value)} unit="pt" value={theme.fontSize.heading3} />
            <NumberSetting label="Body" max={48} min={6} onChange={(value) => updateObject("fontSize", "body", value)} unit="pt" value={theme.fontSize.body} />
            <NumberSetting label="Code" max={48} min={6} onChange={(value) => updateObject("fontSize", "code", value)} unit="pt" value={theme.fontSize.code} />
          </div>
          <SettingsSubheading label="Line height" />
          <div className="exporter-settings-grid">
            <NumberSetting label="Body" max={3} min={1} onChange={(value) => updateObject("lineHeight", "body", value)} step={0.1} unit="×" value={theme.lineHeight.body} />
            <NumberSetting label="Headings" max={3} min={1} onChange={(value) => updateObject("lineHeight", "heading", value)} step={0.1} unit="×" value={theme.lineHeight.heading} />
          </div>
        </SettingsSection>

        <SettingsSection
          expanded={activeSection === "spacing"}
          fieldsDisabled={disabled}
          id="spacing"
          label="Spacing"
          onToggle={() => toggleSection("spacing")}
          summary={`${theme.spacing.paragraphGap} pt paragraph gap`}
        >
          <div className="exporter-settings-grid">
            <NumberSetting label="Paragraph gap" max={40} min={0} onChange={(value) => updateObject("spacing", "paragraphGap", value)} unit="pt" value={theme.spacing.paragraphGap} />
            <NumberSetting label="Heading gap" max={40} min={0} onChange={(value) => updateObject("spacing", "headingGap", value)} unit="pt" value={theme.spacing.headingGap} />
            <NumberSetting label="List indent" max={40} min={0} onChange={(value) => updateObject("spacing", "listIndent", value)} unit="pt" value={theme.spacing.listIndent} />
            <NumberSetting label="Code padding" max={40} min={0} onChange={(value) => updateObject("spacing", "codeBlockPadding", value)} unit="pt" value={theme.spacing.codeBlockPadding} />
          </div>
        </SettingsSection>

        <SettingsSection
          expanded={activeSection === "colors"}
          fieldsDisabled={disabled}
          id="colors"
          label="Colors"
          onToggle={() => toggleSection("colors")}
          summary={<ColorSummary theme={theme} />}
        >
          <div className="exporter-color-grid">
            <ColorSetting label="Text" onChange={(value) => updateObject("colors", "text", value)} value={theme.colors.text} />
            <ColorSetting label="Headings" onChange={(value) => updateObject("colors", "heading", value)} value={theme.colors.heading} />
            <ColorSetting label="Links" onChange={(value) => updateObject("colors", "link", value)} value={theme.colors.link} />
            <ColorSetting label="Code background" onChange={(value) => updateObject("colors", "codeBackground", value)} value={theme.colors.codeBackground} />
            <ColorSetting label="Table borders" onChange={(value) => updateObject("colors", "tableBorder", value)} value={theme.colors.tableBorder} />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({
  children,
  expanded,
  fieldsDisabled,
  id,
  label,
  onToggle,
  summary,
}: {
  children: ReactNode;
  expanded: boolean;
  fieldsDisabled: boolean;
  id: SettingsSectionId;
  label: string;
  onToggle: () => void;
  summary: ReactNode;
}) {
  const panelId = `exporter-settings-${id}-${useId()}`;
  return (
    <section className="exporter-settings-group">
      <h3>
        <button aria-controls={panelId} aria-expanded={expanded} className="exporter-settings-section-toggle" onClick={onToggle} type="button">
          <span className="exporter-settings-section-title">{label}</span>
          <span className="exporter-settings-section-summary">{summary}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg>
        </button>
      </h3>
      <fieldset aria-label={`${label} settings`} className="exporter-settings-section-content" disabled={fieldsDisabled} hidden={!expanded} id={panelId}>
        {children}
      </fieldset>
    </section>
  );
}

function SettingsSubheading({ label, unit }: { label: string; unit?: string }) {
  return <div className="exporter-settings-subheading"><span>{label}</span>{unit ? <span>{unit}</span> : null}</div>;
}

function Setting({ children, label }: { children: ReactNode; label: string }) {
  return <label className="exporter-setting"><span>{label}</span>{children}</label>;
}

function NumberSetting({
  label,
  max,
  min,
  onChange,
  step = 1,
  unit,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  unit?: string;
  value: number;
}) {
  return (
    <Setting label={label}>
      <span className="exporter-number-input">
        <input
          aria-label={label}
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={value}
        />
        {unit ? <span aria-hidden="true">{unit}</span> : null}
      </span>
    </Setting>
  );
}

function ColorSetting({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <Setting label={label}>
      <span className="exporter-color-input">
        <input aria-label={`${label} color`} onChange={(event) => onChange(event.target.value)} type="color" value={value} />
        <code>{value}</code>
      </span>
    </Setting>
  );
}

function ColorSummary({ theme }: { theme: PdfTheme }) {
  return (
    <span aria-label="Current color palette" className="exporter-color-summary">
      {[theme.colors.text, theme.colors.heading, theme.colors.link].map((color, index) => (
        <span aria-hidden="true" key={`${color}-${index}`} style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

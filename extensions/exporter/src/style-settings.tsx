import type { ReactNode } from "react";
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

export function StyleSettings({ disabled, onChange, theme }: StyleSettingsProps) {
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
  const setPreset = (value: string) => {
    if (value === "custom") return;
    const next = PDF_THEME_PRESETS[value as PdfThemePreset];
    if (next) onChange(structuredClone(next));
  };

  return (
    <details className="exporter-panel">
      <summary className="exporter-panel-summary">
        <span>
          <strong>Appearance</strong>
          <small>{preset === "custom" ? "Custom" : `${preset[0]?.toUpperCase()}${preset.slice(1)}`}</small>
        </span>
      </summary>
      <fieldset className="exporter-settings" disabled={disabled}>
        <Setting label="Preset">
          <select aria-label="Preset" onChange={(event) => setPreset(event.target.value)} value={preset}>
            <option value="default">Default</option>
            <option value="compact">Compact</option>
            <option value="academic">Academic</option>
            <option disabled value="custom">Custom</option>
          </select>
        </Setting>

        <h3>Page</h3>
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
        <div className="exporter-settings-grid">
          <NumberSetting label="Top margin" max={100} min={18} onChange={(value) => updateObject("page", "marginTop", value)} value={theme.page.marginTop} />
          <NumberSetting label="Bottom margin" max={100} min={18} onChange={(value) => updateObject("page", "marginBottom", value)} value={theme.page.marginBottom} />
          <NumberSetting label="Left margin" max={100} min={18} onChange={(value) => updateObject("page", "marginLeft", value)} value={theme.page.marginLeft} />
          <NumberSetting label="Right margin" max={100} min={18} onChange={(value) => updateObject("page", "marginRight", value)} value={theme.page.marginRight} />
        </div>
        <label className="exporter-switch">
          <input checked={theme.pageNumbers} onChange={(event) => update("pageNumbers", event.target.checked)} type="checkbox" />
          Page numbers
        </label>

        <h3>Typography</h3>
        <div className="exporter-settings-grid">
          <NumberSetting label="Title" max={48} min={6} onChange={(value) => updateObject("fontSize", "title", value)} value={theme.fontSize.title} />
          <NumberSetting label="Heading 1" max={48} min={6} onChange={(value) => updateObject("fontSize", "heading1", value)} value={theme.fontSize.heading1} />
          <NumberSetting label="Heading 2" max={48} min={6} onChange={(value) => updateObject("fontSize", "heading2", value)} value={theme.fontSize.heading2} />
          <NumberSetting label="Heading 3" max={48} min={6} onChange={(value) => updateObject("fontSize", "heading3", value)} value={theme.fontSize.heading3} />
          <NumberSetting label="Body" max={48} min={6} onChange={(value) => updateObject("fontSize", "body", value)} value={theme.fontSize.body} />
          <NumberSetting label="Code" max={48} min={6} onChange={(value) => updateObject("fontSize", "code", value)} value={theme.fontSize.code} />
          <NumberSetting label="Body line height" max={3} min={1} onChange={(value) => updateObject("lineHeight", "body", value)} step={0.1} value={theme.lineHeight.body} />
          <NumberSetting label="Heading line height" max={3} min={1} onChange={(value) => updateObject("lineHeight", "heading", value)} step={0.1} value={theme.lineHeight.heading} />
        </div>

        <h3>Spacing</h3>
        <div className="exporter-settings-grid">
          <NumberSetting label="Paragraph gap" max={40} min={0} onChange={(value) => updateObject("spacing", "paragraphGap", value)} value={theme.spacing.paragraphGap} />
          <NumberSetting label="Heading gap" max={40} min={0} onChange={(value) => updateObject("spacing", "headingGap", value)} value={theme.spacing.headingGap} />
          <NumberSetting label="List indent" max={40} min={0} onChange={(value) => updateObject("spacing", "listIndent", value)} value={theme.spacing.listIndent} />
          <NumberSetting label="Code padding" max={40} min={0} onChange={(value) => updateObject("spacing", "codeBlockPadding", value)} value={theme.spacing.codeBlockPadding} />
        </div>

        <h3>Colors</h3>
        <div className="exporter-settings-grid">
          <ColorSetting label="Text" onChange={(value) => updateObject("colors", "text", value)} value={theme.colors.text} />
          <ColorSetting label="Headings" onChange={(value) => updateObject("colors", "heading", value)} value={theme.colors.heading} />
          <ColorSetting label="Links" onChange={(value) => updateObject("colors", "link", value)} value={theme.colors.link} />
          <ColorSetting label="Code background" onChange={(value) => updateObject("colors", "codeBackground", value)} value={theme.colors.codeBackground} />
          <ColorSetting label="Table borders" onChange={(value) => updateObject("colors", "tableBorder", value)} value={theme.colors.tableBorder} />
        </div>
        <button className="exporter-button exporter-button-secondary" onClick={() => onChange(structuredClone(PDF_THEME_PRESETS.default))} type="button">
          Reset style
        </button>
      </fieldset>
    </details>
  );
}

function Setting({ children, label }: { children: ReactNode; label: string }) {
  return <div className="exporter-setting"><span>{label}</span>{children}</div>;
}

function NumberSetting({
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <Setting label={label}>
      <input
        aria-label={label}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={value}
      />
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

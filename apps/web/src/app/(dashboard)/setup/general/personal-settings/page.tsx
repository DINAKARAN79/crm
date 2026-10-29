"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, Eye, Keyboard, MousePointer2, Save, Search, Sparkles, ToggleLeft, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { personalSettingsApi } from "@/lib/api";

type Tab = "personal" | "accessibility";
type Accessibility = {
  font: "Modern Sans" | "Humanist Sans" | "Readable Serif"; fontSize: number; spacing: "Normal" | "Wide" | "Wider"; magnifyText: boolean; motion: "Minimum" | "Default" | "System Settings"; switchLabels: boolean; strikethroughDisabled: boolean; mandatoryFieldsOnly: boolean; mandatoryFieldDisplay: "Red Accent Line (Default)" | "Asterisk" | "Bold Label"; errorColor: string; errorIcon: boolean; flashScreen: boolean; ariaLandmark: boolean; keyboardShortcuts: boolean; voiceAssistant: boolean; readingFocus: boolean; underlineLinks: boolean; standardNavigation: boolean;
};
type Settings = { language: string; countryLocale: string; dateFormat: string; timeFormat: "12 Hours" | "24 Hours"; timeZone: string; distanceUnit: "Kilometers (km)" | "Miles (mi)"; numberFormat: string; nameFormat: string; sortOrder: string; accessibility: Accessibility };

const defaults: Settings = { language: "English (United States)", countryLocale: "India", dateFormat: "DD/MM/YYYY", timeFormat: "12 Hours", timeZone: "Asia/Kolkata", distanceUnit: "Kilometers (km)", numberFormat: "1,23,456.789", nameFormat: "Salutation, First Name, Last Name", sortOrder: "First Name, Last Name", accessibility: { font: "Modern Sans", fontSize: 1, spacing: "Normal", magnifyText: false, motion: "Default", switchLabels: false, strikethroughDisabled: false, mandatoryFieldsOnly: false, mandatoryFieldDisplay: "Red Accent Line (Default)", errorColor: "#ff5a5f", errorIcon: false, flashScreen: false, ariaLandmark: false, keyboardShortcuts: false, voiceAssistant: false, readingFocus: false, underlineLinks: false, standardNavigation: false } };

export default function PersonalSettingsPage() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenantId");
  const [tab, setTab] = React.useState<Tab>("personal");
  const [settings, setSettings] = React.useState<Settings>(defaults);
  const [user, setUser] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => { personalSettingsApi.get().then((response) => { const data = response.data.data; setUser(data.user); setSettings({ ...defaults, ...data.settings, accessibility: { ...defaults.accessibility, ...data.settings?.accessibility } }); }).catch(() => setMessage("Unable to load personal settings.")).finally(() => setLoading(false)); }, []);
  React.useEffect(() => {
    if (loading) return;
    const root = document.documentElement;
    root.style.setProperty("--crm-font-scale", String([0.94, 1, 1.08, 1.16][settings.accessibility.fontSize]));
    root.style.setProperty("--crm-letter-spacing", settings.accessibility.spacing === "Wide" ? "0.03em" : settings.accessibility.spacing === "Wider" ? "0.06em" : "0em");
    root.dataset.crmFont = settings.accessibility.font === "Humanist Sans" ? "humanist" : settings.accessibility.font === "Readable Serif" ? "serif" : "modern";
    root.dataset.crmReducedMotion = settings.accessibility.motion === "Minimum" ? "true" : "false";
    root.dataset.crmMagnify = settings.accessibility.magnifyText ? "true" : "false";
    root.dataset.crmReadingFocus = settings.accessibility.readingFocus ? "true" : "false";
    root.dataset.crmUnderlineLinks = settings.accessibility.underlineLinks ? "true" : "false";
    root.dataset.crmSwitchLabels = settings.accessibility.switchLabels ? "true" : "false";
    root.dataset.crmFlashScreen = settings.accessibility.flashScreen ? "true" : "false";
    root.dataset.crmAriaLandmark = settings.accessibility.ariaLandmark ? "true" : "false";
    root.dataset.crmStandardNavigation = settings.accessibility.standardNavigation ? "true" : "false";

    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      if (!settings.accessibility.keyboardShortcuts) return;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder="Search"]')?.focus();
      }
      if (event.key === "Escape") (document.activeElement as HTMLElement)?.blur();
    };
    document.addEventListener("keydown", handleKeyboardShortcuts);
    return () => {
      document.removeEventListener("keydown", handleKeyboardShortcuts);
      root.style.removeProperty("--crm-font-scale");
      root.style.removeProperty("--crm-letter-spacing");
      delete root.dataset.crmFont;
      delete root.dataset.crmReducedMotion;
      delete root.dataset.crmMagnify;
      delete root.dataset.crmReadingFocus;
      delete root.dataset.crmUnderlineLinks;
      delete root.dataset.crmSwitchLabels;
      delete root.dataset.crmFlashScreen;
      delete root.dataset.crmAriaLandmark;
      delete root.dataset.crmStandardNavigation;
    };
  }, [loading, settings.accessibility]);
  const patch = (value: Partial<Settings>) => setSettings((current) => ({ ...current, ...value }));
  const patchAccess = (value: Partial<Accessibility>) => patch({ accessibility: { ...settings.accessibility, ...value } });
  const save = async () => { setSaving(true); try { await personalSettingsApi.update(settings); setMessage("Settings saved"); } catch (error: any) { setMessage(error?.response?.data?.error || "Unable to save settings"); } finally { setSaving(false); window.setTimeout(() => setMessage(""), 3000); } };
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading personal settings...</div>;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "User";
  return <div className="space-y-5"><div className="flex items-center gap-3"><Link href={tenantId ? `/setup?tenantId=${encodeURIComponent(tenantId)}` : "/setup"} className="text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /></Link><div><p className="text-sm text-muted-foreground">Setup / General</p><h1 className="text-xl font-semibold">Personal Settings</h1></div></div><div className="overflow-hidden rounded-lg border bg-card"><nav className="flex border-b">{[{ id: "personal", label: "Personal Settings" }, { id: "accessibility", label: "Accessibility" }].map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id as Tab)} className={`border-b-2 px-6 py-4 text-sm font-medium ${tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{item.label}</button>)}</nav><main className="max-h-[calc(100vh-220px)] min-h-[600px] overflow-y-auto p-6 md:p-10">{tab === "personal" ? <PersonalPanel user={user} fullName={fullName} settings={settings} patch={patch} /> : <AccessibilityPanel settings={settings.accessibility} patch={patchAccess} />}</main><footer className="flex items-center justify-between border-t bg-muted/10 px-6 py-4"><span className="text-sm text-emerald-600">{message}</span><Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save"}</Button></footer></div></div>;
}

function PersonalPanel({ user, fullName, settings, patch }: { user: any; fullName: string; settings: Settings; patch: (value: Partial<Settings>) => void }) { return <div className="space-y-10"><div className="flex items-start gap-5"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-700 text-xl font-semibold text-white">{fullName.charAt(0).toUpperCase()}</div><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold uppercase">{fullName}</h2><span className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-sm text-orange-700">Administrator</span></div><p className="mt-2 text-sm text-muted-foreground">{user?.email}</p><p className="mt-1 text-sm text-muted-foreground">{user?.phone || "Phone not configured"}</p></div></div><Section title="Locale Information"><div className="grid max-w-2xl gap-4 sm:grid-cols-[180px_1fr] sm:items-center"><LabelValue label="Language"><Select value={settings.language} onChange={(value) => patch({ language: value })} options={["English (United States)", "English (United Kingdom)"]} /></LabelValue><LabelValue label="Country Locale"><Select value={settings.countryLocale} onChange={(value) => patch({ countryLocale: value })} options={["India", "United States", "United Kingdom"]} /></LabelValue><LabelValue label="Date Format"><Select value={settings.dateFormat} onChange={(value) => patch({ dateFormat: value })} options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} /></LabelValue><LabelValue label="Time Format"><Select value={settings.timeFormat} onChange={(value) => patch({ timeFormat: value as Settings["timeFormat"] })} options={["12 Hours", "24 Hours"]} /></LabelValue><LabelValue label="Time Zone"><Select value={settings.timeZone} onChange={(value) => patch({ timeZone: value })} options={["Asia/Kolkata", "UTC", "America/New_York", "Europe/London"]} /></LabelValue><LabelValue label="Preferred Unit for Distance"><Select value={settings.distanceUnit} onChange={(value) => patch({ distanceUnit: value as Settings["distanceUnit"] })} options={["Kilometers (km)", "Miles (mi)"]} /></LabelValue><LabelValue label="Number Format"><Select value={settings.numberFormat} onChange={(value) => patch({ numberFormat: value })} options={["1,23,456.789", "1,234,567.789", "1.234.567,789"]} /></LabelValue></div></Section><Section title="Groups"><p className="text-sm text-muted-foreground">Member in <span className="ml-8 text-foreground">-</span></p></Section><Section title="Display Name Format & Preferences" description="It applies to full name in columns of list view, lookup fields and user name"><div className="grid max-w-2xl gap-4 sm:grid-cols-[180px_1fr] sm:items-center"><LabelValue label="Name Format"><Select value={settings.nameFormat} onChange={(value) => patch({ nameFormat: value })} options={["Salutation, First Name, Last Name", "First Name, Last Name", "Last Name, First Name"]} /></LabelValue><LabelValue label="Sort order preference"><Select value={settings.sortOrder} onChange={(value) => patch({ sortOrder: value })} options={["First Name, Last Name", "Last Name, First Name"]} /></LabelValue></div></Section></div>; }

function AccessibilityPanel({ settings, patch }: { settings: Accessibility; patch: (value: Partial<Accessibility>) => void }) {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<"vision" | "motor" | "interaction">("vision");
  const visible = (text: string) => !search || text.toLowerCase().includes(search.toLowerCase());
  const cards: React.ReactNode[] = [];

  if (category === "vision") {
    if (visible("Font")) cards.push(<AccessCard key="font" icon={<Type />} title="Font" description="Choose a readable type design for the CRM interface."><div className="grid gap-3 md:grid-cols-3"><Choice active={settings.font === "Modern Sans"} onClick={() => patch({ font: "Modern Sans" })}>Modern Sans</Choice><Choice active={settings.font === "Humanist Sans"} onClick={() => patch({ font: "Humanist Sans" })}>Humanist Sans</Choice><Choice active={settings.font === "Readable Serif"} onClick={() => patch({ font: "Readable Serif" })}>Readable Serif</Choice></div><PreviewText settings={settings}>Aa Dashboard preview</PreviewText></AccessCard>);
    if (visible("Font Size")) cards.push(<AccessCard key="font-size" icon={<Type />} title="Font Size" description="Set your preferred font size for enhanced readability."><input aria-label="Font size" className="w-full accent-primary" type="range" min="0" max="3" value={settings.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) })} /><PreviewText settings={settings}>Preview text at the selected size</PreviewText></AccessCard>);
    if (visible("Spacing")) cards.push(<AccessCard key="spacing" icon={<Type />} title="Spacing" description="Set your preferred character spacing."><Select value={settings.spacing} onChange={(value) => patch({ spacing: value as Accessibility["spacing"] })} options={["Normal", "Wide", "Wider"]} /><PreviewText settings={settings}>The quick brown fox jumps over the lazy dog.</PreviewText></AccessCard>);
    if (visible("Mandatory")) cards.push(<AccessCard key="mandatory" icon={<Type />} title="Mandatory Field Display" description="Set your preferred format to indicate mandatory fields."><Select value={settings.mandatoryFieldDisplay} onChange={(value) => patch({ mandatoryFieldDisplay: value as Accessibility["mandatoryFieldDisplay"] })} options={["Red Accent Line (Default)", "Asterisk", "Bold Label"]} /><div className={`mt-4 rounded-md border bg-muted/20 p-4 ${settings.mandatoryFieldDisplay === "Red Accent Line (Default)" ? "border-l-4 border-l-red-500" : ""}`}><span className={settings.mandatoryFieldDisplay === "Bold Label" ? "font-bold" : ""}>First Name{settings.mandatoryFieldDisplay === "Asterisk" ? " *" : ""}</span><Input className="mt-2" placeholder="Enter text" /></div></AccessCard>);
    if (visible("Error")) cards.push(<AccessCard key="error" icon={<Type />} title="Custom Error Message Display" description="Set your preferred color and icon for error messages."><div className="flex items-center gap-3"><input aria-label="Error message color" type="color" value={settings.errorColor} onChange={(event) => patch({ errorColor: event.target.value })} /><ToggleCard title="Show error icon" description="Display an icon beside validation errors." value={settings.errorIcon} onChange={(value) => patch({ errorIcon: value })} /></div><div className="mt-4 rounded-md border p-3" style={{ borderColor: settings.errorColor, color: settings.errorColor }}>{settings.errorIcon ? "! " : ""}Field cannot be empty</div></AccessCard>);
  }
  if (category === "motor") {
    if (visible("Motion")) cards.push(<AccessCard key="motion" icon={<MousePointer2 />} title="Motion Control" description="Set your preferred motion settings."><div className="grid gap-3 md:grid-cols-3">{["Minimum", "Default", "System Settings"].map((value) => <Choice key={value} active={settings.motion === value} onClick={() => patch({ motion: value as Accessibility["motion"] })}>{value}</Choice>)}</div></AccessCard>);
    if (visible("Keyboard")) cards.push(<ToggleCard key="keyboard" title="Keyboard Shortcuts" description="Allow keyboard shortcuts for common CRM actions." value={settings.keyboardShortcuts} onChange={(value) => patch({ keyboardShortcuts: value })} />);
    if (visible("Navigation")) cards.push(<ToggleCard key="navigation" title="Standard Navigation Order" description="Navigate through controls in a predictable order." value={settings.standardNavigation} onChange={(value) => patch({ standardNavigation: value })} />);
  }
  if (category === "interaction") {
    if (visible("Magnify")) cards.push(<ToggleCard key="magnify" title="Magnify Text on Hover" description="Magnify text while holding the option or alt key." value={settings.magnifyText} onChange={(value) => patch({ magnifyText: value })} />);
    if (visible("Reading")) cards.push(<ToggleCard key="reading" title="Reading Focus" description="Focus attention on specific areas of the screen." value={settings.readingFocus} onChange={(value) => patch({ readingFocus: value })} />);
    if (visible("Underline")) cards.push(<ToggleCard key="underline" title="Underline Links" description="Enhance link visibility with an underline." value={settings.underlineLinks} onChange={(value) => patch({ underlineLinks: value })} />);
    if (visible("Voice")) cards.push(<ToggleCard key="voice" title="Zia Voice Assistant" description="Enable voice assistance for general CRM actions." value={settings.voiceAssistant} onChange={(value) => patch({ voiceAssistant: value })} />);
  }

  return <div className="space-y-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Accessibility</h2><p className="mt-2 text-muted-foreground">Accessibility allows everyone to use CRM regardless of their disability.</p></div><Button variant="ghost" onClick={() => patch(defaults.accessibility)}>Reset to default</Button></div><div className="relative max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="pl-9" /></div><div className="flex gap-7 border-b"><CategoryButton active={category === "vision"} onClick={() => setCategory("vision")} icon={<Eye />} label="Vision" /><CategoryButton active={category === "motor"} onClick={() => setCategory("motor")} icon={<MousePointer2 />} label="Motor" /><CategoryButton active={category === "interaction"} onClick={() => setCategory("interaction")} icon={<Sparkles />} label="Interaction" /></div><div className="space-y-4">{cards.length ? cards : <p className="rounded-lg border border-dashed p-8 text-sm text-muted-foreground">No matching accessibility settings.</p>}</div></div>;
}

function PreviewText({ settings, children }: { settings: Accessibility; children: React.ReactNode }) {
  const scale = [0.94, 1, 1.08, 1.16][settings.fontSize];
  const spacing = settings.spacing === "Wide" ? "0.03em" : settings.spacing === "Wider" ? "0.06em" : "0em";
  const family = settings.font === "Humanist Sans" ? '"Gill Sans", "Segoe UI", sans-serif' : settings.font === "Readable Serif" ? 'Georgia, "Times New Roman", serif' : '"Trebuchet MS", "Segoe UI", sans-serif';
  return <div className="mt-4 rounded-md border bg-muted/20 p-3" style={{ fontFamily: family, fontSize: `${scale}rem`, letterSpacing: spacing }}>{children}</div>;
}

function CategoryButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={`flex items-center gap-2 rounded-md border-b-2 px-2 py-2 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{icon}{label}</button>; }

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section><h3 className="text-lg font-semibold">{title}</h3>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}<div className="mt-5">{children}</div></section>; }
function AccessCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) { return <div className="rounded-lg border p-5"><div className="flex items-start gap-4"><div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div><div className="flex-1"><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p><div className="mt-5 border-t pt-5">{children}</div></div></div></div>; }
function ToggleCard({ title, description, value, onChange }: { title: string; description: string; value: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center gap-4 rounded-lg border p-5"><div className="rounded-lg bg-primary/10 p-3 text-primary"><ToggleLeft /></div><div className="flex-1"><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div><button type="button" role="switch" aria-checked={value} aria-label={`Toggle ${title}`} onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${value ? "left-6" : "left-1"}`} /></button></div>; }
function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-md border px-4 py-2 text-sm ${active ? "border-primary bg-primary/10" : ""}`}><span className={`mr-2 inline-block h-4 w-4 rounded-full border-2 align-middle ${active ? "border-primary bg-primary" : "border-muted-foreground"}`} />{children}</button>; }
function LabelValue({ label, children }: { label: string; children: React.ReactNode }) { return <><span className="text-sm text-muted-foreground">{label}</span><div>{children}</div></>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">{options.map((option) => <option key={option}>{option}</option>)}</select>; }